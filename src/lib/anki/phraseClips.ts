// Finding the phrases in a recording where a teacher says each one several
// times: fast at natural pace, then more slowly.

import { inScript, similarity } from "@/lib/anki/bookAudio";

export type HeardClip = { key: string; start: number; end: number; text: string };

export type FoundPhrase = {
  text: string;
  // Every clip that says it, in order.
  clips: string[];
  // The suggested recordings: the first time it's said, and the first
  // clearly slower repeat (empty if there isn't one).
  audio1: string;
  audio2: string;
};

const samePhrase = 0.8;
const clearlySlower = 1.5;

// Thai doesn't end a sentence with punctuation; the transcription sometimes does.
export function phraseText(text: string, language: string) {
  const trimmed = text.trim();
  return language === "Thai" ? trimmed.replace(/[?.!]+$/, "") : trimmed;
}

function length(clip: HeardClip) {
  return clip.end - clip.start;
}

// Text heard more than once is a phrase. That leaves out what a teacher says
// only once, such as "Number one" and the English translation, and pieces
// that run a phrase together with something else.
export function findPhrases(clips: HeardClip[], language: string): FoundPhrase[] {
  const groups: HeardClip[][] = [];
  for (const clip of clips) {
    if (!inScript(clip.text, language)) continue;
    const group = groups.find((candidate) => similarity(candidate[0].text, clip.text) >= samePhrase);
    if (group) group.push(clip);
    else groups.push([clip]);
  }
  return groups.filter((group) => group.length > 1).map((group) => {
    const [first, ...repeats] = group;
    return {
      text: phraseText(first.text, language),
      clips: group.map((clip) => clip.key),
      audio1: first.key,
      audio2: repeats.find((clip) => length(clip) >= length(first) * clearlySlower)?.key ?? "",
    };
  });
}
