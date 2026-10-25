import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAnkiLanguage } from "@/lib/anki/vocab";
import { transcribeSpeech } from "@/lib/llm/speechToText";
import { requireAccountApiKey } from "@/lib/storage/account";

// A clip of a few sentences; the request body stays well under Vercel's limit.
const maxBase64Length = 3_000_000;

// What a textbook audio clip says, for checking it against a note
// (Book audio on the Anki page). Uses the account's OpenAI key.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as { data?: unknown; language?: unknown } | null;
  const data = body?.data;
  const language = body?.language;
  if (typeof data !== "string" || !data || data.length > maxBase64Length) {
    return NextResponse.json({ error: "Send an MP3 clip of up to about 2 MB." }, { status: 400 });
  }
  if (typeof language !== "string" || !isAnkiLanguage(language)) {
    return NextResponse.json({ error: "Unknown language." }, { status: 400 });
  }

  try {
    const apiKey = await requireAccountApiKey(session.user.id, "openai");
    const text = await transcribeSpeech(Buffer.from(data, "base64"), language, apiKey);
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The clip could not be transcribed." }, { status: 503 });
  }
}
