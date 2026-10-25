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
  return spacedLanguages.has(language) || comparable(trimmed).length <= 6;
}
