// Japanese dictionary lookups in JMdict and KANJIDIC2 (Electronic Dictionary
// Research and Development Group, CC BY-SA 4.0), from the static files that
// scripts/build-dictionary.mjs writes to public/dict/jmdict/. `load` fetches
// one of those files by path (null if missing), so the same lookup works in
// the browser and on the server.

export type JmForm = { t: string; c?: 1; a?: string[]; x?: string[] };
export type JmSense = { p: string[]; g: string[]; m?: string[]; f?: string[]; i?: string[]; d?: string[]; ak?: string[]; ar?: string[] };
export type JmEntry = { id: number; k: JmForm[]; r: JmForm[]; s: JmSense[] };
export type KanjiInfo = { m: string[]; on: string[]; kun: string[]; g?: number; s?: number; j?: number; f?: number };

export type JapaneseLookup = {
  // Entries for the whole text, most common first.
  exact: JmEntry[];
  // When the whole text isn't an entry: the longest dictionary words it can
  // be split into, left to right (e.g. 唱題行 → 唱題 + 行).
  parts: { text: string; entries: JmEntry[] }[];
  kanji: { literal: string; info: KanjiInfo }[];
};

type Meta = { entryShards: number; kanjiShards: number; dictDate: string; version: string };
type Loader = (path: string) => Promise<unknown | null>;

// Must match bucketOf in scripts/build-dictionary.mjs.
const bucketOf = (codePoint: number) => codePoint >= 0x3040 && codePoint <= 0x30ff ? codePoint : codePoint >> 5;
const maxWordLength = 12;
const isKanji = (char: string) => /\p{Script=Han}/u.test(char);
const isCommon = (entry: JmEntry) => entry.k.some((form) => form.c) || entry.r.some((form) => form.c);

export function createJapaneseDictionary(load: Loader) {
  const cache = new Map<string, Promise<unknown | null>>();
  const file = <T>(path: string) => {
    if (!cache.has(path)) cache.set(path, load(path).catch(() => null));
    return cache.get(path) as Promise<T | null>;
  };
  const meta = () => file<Meta>("meta.json");

  async function idsFor(word: string) {
    const index = await file<Record<string, number[]>>(`idx/${bucketOf(word.codePointAt(0)!)}.json`);
    return index?.[word] || [];
  }

  // Most likely meaning first: for a word written in kana, words that are
  // themselves usually written in kana (なら the conditional before 奈良,
  // the city); then common words.
  async function entries(ids: number[], word: string) {
    const info = await meta();
    if (!info) return [];
    const found = await Promise.all(ids.map(async (id) => (await file<Record<string, JmEntry>>(`ent/${id % info.entryShards}.json`))?.[id]));
    const kanaWord = !/\p{Script=Han}/u.test(word);
    const writtenInKana = (entry: JmEntry) => !entry.k.length || entry.s.some((sense) => sense.m?.includes("uk"));
    const score = (entry: JmEntry) => (kanaWord && writtenInKana(entry) ? 2 : 0) + (isCommon(entry) ? 1 : 0);
    return found.filter((entry): entry is JmEntry => Boolean(entry)).sort((a, b) => score(b) - score(a));
  }

  async function kanjiFor(text: string) {
    const info = await meta();
    if (!info) return [];
    const literals = [...new Set([...text].filter(isKanji))];
    const found = await Promise.all(literals.map(async (literal) => {
      const shard = await file<Record<string, KanjiInfo>>(`kanji/${literal.codePointAt(0)! % info.kanjiShards}.json`);
      return shard?.[literal] ? { literal, info: shard[literal] } : null;
    }));
    return found.filter((item): item is { literal: string; info: KanjiInfo } => item !== null);
  }

  async function lookup(text: string): Promise<JapaneseLookup | null> {
    if (!(await meta())) return null;
    const query = text.trim().replace(/\s+/g, "").slice(0, 40);
    if (!query) return { exact: [], parts: [], kanji: [] };
    const exactIds = await idsFor(query);
    const exact = await entries(exactIds, query);
    const parts: JapaneseLookup["parts"] = [];
    if (!exact.length) {
      // Greedy longest match from each position.
      const chars = [...query];
      for (let i = 0; i < chars.length;) {
        let taken = 0;
        for (let length = Math.min(maxWordLength, chars.length - i); length >= 1; length--) {
          const word = chars.slice(i, i + length).join("");
          const ids = await idsFor(word);
          if (ids.length) {
            parts.push({ text: word, entries: await entries(ids, word) });
            taken = length;
            break;
          }
        }
        i += taken || 1;
      }
    }
    return { exact, parts, kanji: await kanjiFor(query) };
  }

  return { lookup, meta, tags: () => file<Record<string, string>>("tags.json") };
}
