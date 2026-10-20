import { createJapaneseDictionary, type JmEntry } from "@/lib/dictionary/japanese";
import { sentenceDictItems, wordDictItems, type DictNoteItem } from "@/lib/dictionary/notesBlock";

// One Japanese dictionary for the whole page in the browser, loading files
// from the site itself (public/dict/jmdict) and keeping them for later
// lookups.
export const browserJapaneseDictionary = createJapaneseDictionary(async (path) => {
  const response = await fetch(`/dict/jmdict/${path}`);
  return response.ok ? response.json() : null;
});

export type SentenceWord = { surface: string; base: string; reading: string; entries: JmEntry[] };

// The dictionary words of a Japanese sentence or passage, split on the
// server (kuromoji); null if that isn't available.
export async function fetchJapaneseTextWords(text: string): Promise<SentenceWord[] | null> {
  try {
    const response = await fetch("/api/dictionary/japanese/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    return response.ok ? ((await response.json()) as { words: SentenceWord[] }).words : null;
  } catch {
    return null;
  }
}

// Dictionary entries for a note (see notesBlock): "word" — a word's
// entries and every kanji in it; "sentence" — only the hard parts. Throws
// when the dictionary isn't available.
export async function lookUpDictItems(text: string, mode: "word" | "sentence"): Promise<DictNoteItem[]> {
  if (mode === "word") {
    const found = await browserJapaneseDictionary.lookup(text);
    if (!found) throw new Error("The dictionary isn't available right now.");
    return wordDictItems(text, found);
  }
  const [words, kanji] = await Promise.all([fetchJapaneseTextWords(text), browserJapaneseDictionary.kanji(text)]);
  if (!words) throw new Error("The sentence couldn't be split into words right now.");
  return sentenceDictItems(words, kanji);
}
