import { createJapaneseDictionary } from "@/lib/dictionary/japanese";

// The Japanese dictionary for server code: the same static files the site
// serves (public/dict/jmdict), fetched from the site itself and kept for
// the life of the server instance. One per origin (localhost, the live site).
const dictionaries = new Map<string, ReturnType<typeof createJapaneseDictionary>>();

export function japaneseDictionary(request: Request) {
  const origin = new URL(request.url).origin;
  if (!dictionaries.has(origin)) {
    dictionaries.set(origin, createJapaneseDictionary(async (path) => {
      const response = await fetch(`${origin}/dict/jmdict/${path}`);
      return response.ok ? response.json() : null;
    }));
  }
  return dictionaries.get(origin)!;
}

// A single word or short term (not a sentence or passage), worth a
// dictionary lookup.
export function isJapaneseTerm(text: string) {
  const term = text.trim();
  return term.length > 0 && term.length <= 16 && !/[\s、。！？!?「」]/.test(term) && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term);
}
