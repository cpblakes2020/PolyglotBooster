import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { synthesizeSpeech } from "@/lib/llm/tts";
import { isSupportedLanguage } from "@/lib/presets";
import { getAccountSettings, requireAccountApiKey, saveAccountAudio } from "@/lib/storage/account";
import { isTtsVoice, resolveVoiceSetting, type VoiceSetting } from "@/lib/voices";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as { text?: unknown; language?: unknown; delivery?: unknown; voice?: unknown } | null;
  const text = body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 12000) {
    return NextResponse.json({ error: "Add up to 12,000 characters of text before generating audio." }, { status: 400 });
  }
  const language = typeof body?.language === "string" && isSupportedLanguage(body.language) ? body.language : undefined;
  // "inline" returns the MP3 as base64 for the caller to hand straight to
  // Anki, instead of keeping a copy in Blob storage.
  const inline = body?.delivery === "inline";

  try {
    const [apiKey, settings] = await Promise.all([
      requireAccountApiKey(session.user.id, "openai"),
      getAccountSettings(session.user.id),
    ]);
    // An explicit voice (from the Settings preview button) overrides the saved one.
    const override = body?.voice as Partial<VoiceSetting> | undefined;
    const voice = override && isTtsVoice(override.voice) && typeof override.instructions === "string"
      ? { voice: override.voice, instructions: override.instructions.slice(0, 1000) }
      : resolveVoiceSetting(language, settings.voices);
    const audio = await synthesizeSpeech(text, apiKey, voice);
    const voiceName = voice?.voice || "alloy";
    if (inline) return NextResponse.json({ data: audio.toString("base64"), voice: voiceName });
    const url = await saveAccountAudio(session.user.id, audio);
    return NextResponse.json({ url, voice: voiceName }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The audio could not be generated." }, { status: 503 });
  }
}
