import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAnkiLanguage } from "@/lib/anki/vocab";
import { transcribeSpeech } from "@/lib/llm/speechToText";
import { getLaterItems, requireAccountApiKey } from "@/lib/storage/account";
import { maxRecordingBytes, ownRecordingUrl, sweepRecordings } from "@/lib/storage/recordings";

// A long recording takes OpenAI a while to transcribe.
export const maxDuration = 300;

// The transcript of a recording uploaded from the study desk, in the
// language being studied and English (either may be spoken).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const userId = session.user.id;
  const body = await request.json().catch(() => null) as { url?: unknown; language?: unknown; filename?: unknown } | null;
  const url = ownRecordingUrl(userId, body?.url);
  if (!url) return NextResponse.json({ error: "That recording isn't in your account." }, { status: 400 });
  const language = typeof body?.language === "string" && isAnkiLanguage(body.language) ? body.language : undefined;
  // OpenAI tells the format from the name and doesn't take .mov (an iPhone
  // screen recording), which is built the same way as an .mp4, so it's sent as one.
  const given = typeof body?.filename === "string" && body.filename ? body.filename.slice(0, 200) : "recording.m4a";
  const quicktime = /\.mov$/i.test(given);
  const filename = quicktime ? given.replace(/\.mov$/i, ".mp4") : given;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("The recording couldn't be read from storage.");
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length > maxRecordingBytes) throw new Error("The recording is over 25 MB, OpenAI's limit.");
    const apiKey = await requireAccountApiKey(userId, "openai");
    const text = await transcribeSpeech(audio, language ? (language === "English" ? ["English"] : [language, "English"]) : [], apiKey, {
      name: filename,
      type: quicktime ? "video/mp4" : response.headers.get("content-type") || "audio/mp4",
    });
    // Recordings left over from earlier uploads that were never saved.
    try {
      const saved = await getLaterItems(userId, "listening");
      await sweepRecordings(userId, new Set([url, ...saved.flatMap((item) => item.recording ? [item.recording.url] : [])]));
    } catch {
      // Tidying up can wait for the next upload.
    }
    if (!text) return NextResponse.json({ error: "No speech was heard in the recording." }, { status: 422 });
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The recording couldn't be transcribed." }, { status: 502 });
  }
}
