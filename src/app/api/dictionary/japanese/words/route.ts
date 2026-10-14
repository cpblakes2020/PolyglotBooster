import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { japaneseDictionary } from "@/lib/dictionary/server";
import { japaneseTextWords } from "@/lib/dictionary/tokenizer";

// The dictionary words of a Japanese sentence or passage (split with
// kuromoji, looked up in JMdict by dictionary form), for the dictionary
// panel. POST { text } → { words: [{ surface, base, reading, entries }] }.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 2000) return NextResponse.json({ error: "Send up to 2,000 characters of Japanese text." }, { status: 400 });
  try {
    const words = await japaneseTextWords(text, japaneseDictionary(request), 40);
    // The panel shows the most likely entry, briefly.
    return NextResponse.json({ words: words.map((word) => ({ ...word, entries: word.entries.slice(0, 1).map((entry) => ({ ...entry, s: entry.s.slice(0, 3) })) })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The text couldn't be split into words." }, { status: 502 });
  }
}
