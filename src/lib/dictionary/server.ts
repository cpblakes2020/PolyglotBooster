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

export { isJapaneseTerm } from "@/lib/dictionary/japanese";
