import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTtsVoice, synthesizeSpeech } from "@/lib/llm/tts";
import { requireAccountApiKey, saveAccountAudio } from "@/lib/storage/account";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const text = body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 12000) {
    return NextResponse.json({ error: "Add up to 12,000 characters of text before generating audio." }, { status: 400 });
  }

  try {
    const apiKey = await requireAccountApiKey(session.user.id, "openai");
    const audio = await synthesizeSpeech(text, apiKey);
    const url = await saveAccountAudio(session.user.id, audio);
    return NextResponse.json({ url, voice: getTtsVoice() }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The audio could not be generated." }, { status: 503 });
  }
}
