import { createJapaneseDictionary, type JmEntry } from "@/lib/dictionary/japanese";

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
