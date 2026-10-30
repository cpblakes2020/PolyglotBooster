// Matching textbook audio clips to the notes made from that chapter.

const spacedLanguages = new Set(["Indonesian", "Spanish", "French", "English"]);

// Letters and digits only, lower-cased: spacing and punctuation differ
// between a note and what a transcription hears.
function comparable(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// 0 (nothing alike) to 1 (the same text).
export function similarity(a: string, b: string) {
  const x = comparable(a);
  const y = comparable(b);
  if (!x || !y) return 0;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}

export type MatchQuality = "good" | "close" | "poor";

export function matchQuality(score: number): MatchQuality {
  return score >= 0.8 ? "good" : score >= 0.5 ? "close" : "poor";
}

// A single word rather than a sentence: chapters often have notes for the
// key words, which the recordings don't include.
export function isWordNote(text: string, language: string) {
  const trimmed = text.trim();
  if (/\s/.test(trimmed)) return false;
  // Letters only: Thai tone and vowel marks don't make a word longer
  // (ด้วยกัน is five letters, not seven).
  return spacedLanguages.has(language) || comparable(trimmed).replace(/\p{M}/gu, "").length <= 5;
}

// The target (index) for each clip, keeping book order: clips go to targets
// in the same order, each target at most once, choosing the pairing whose
// transcriptions match best overall. heard: what each clip said (undefined
// if it couldn't be transcribed). A word note that isn't recorded, or a
// recording with no note, then can't shift every clip after it.
export function alignClips(heard: (string | undefined)[], targets: { text: string; isWord: boolean }[]) {
  const score = (clip: number, target: number) => {
    const text = heard[clip];
    // Untranscribed clips fall in place between their neighbours, preferring sentences.
    if (text === undefined) return targets[target].isWord ? 0.001 : 0.01;
    return similarity(text, targets[target].text) + 0.001;
  };
  const rows = heard.length;
  const columns = targets.length;
  // best[i][j]: the best total for the first i clips and first j targets.
  const best = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0));
  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= columns; j++) {
      best[i][j] = Math.max(best[i][j - 1], best[i - 1][j], best[i - 1][j - 1] + score(i - 1, j - 1));
    }
  }
  const result = new Array<number | null>(rows).fill(null);
  for (let i = rows, j = columns; i > 0 && j > 0;) {
    if (best[i][j] === best[i - 1][j - 1] + score(i - 1, j - 1)) {
      result[i - 1] = j - 1;
      i--;
      j--;
    } else if (best[i][j] === best[i][j - 1]) {
      j--;
    } else {
      i--;
    }
  }
  return result;
}
