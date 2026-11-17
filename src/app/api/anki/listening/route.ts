import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAnkiLanguage } from "@/lib/anki/vocab";
import { addLaterItem, getLaterItems, removeLaterItems } from "@/lib/storage/account";
import { deleteRecordings, ownRecordingUrl } from "@/lib/storage/recordings";

// The "Save for listening" list: texts saved on any device, made into
// listening notes later from the Anki page on the computer running Anki.
// GET lists them; POST adds one; DELETE removes the given ids.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ items: await getLaterItems(session.user.id, "listening") });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { text?: unknown; language?: unknown; source?: unknown; recording?: { url?: unknown; filename?: unknown } } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const language = typeof body?.language === "string" && isAnkiLanguage(body.language) && body.language !== "English" ? body.language : undefined;
  if (!text || text.length > 12000 || !language) return NextResponse.json({ error: "Add up to 12,000 characters of text in a learning language." }, { status: 400 });
  // The recording the text came from, if it was uploaded on the study desk.
  const recordingUrl = body?.recording ? ownRecordingUrl(session.user.id, body.recording.url) : null;
  if (body?.recording && !recordingUrl) return NextResponse.json({ error: "That recording isn't in your account." }, { status: 400 });
  try {
    const items = await addLaterItem(session.user.id, {
      text,
      language,
      context: "",
      source: typeof body?.source === "string" ? body.source.slice(0, 200) : "",
      ...(recordingUrl ? { recording: { url: recordingUrl, filename: typeof body?.recording?.filename === "string" ? body.recording.filename.slice(0, 200) : "recording" } } : {}),
    }, "listening");
    return NextResponse.json({ items }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The text couldn't be saved. Please try again." }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });
  try {
    // Their recordings go too.
    const removing = (await getLaterItems(session.user.id, "listening")).filter((item) => ids.includes(item.id));
    const items = await removeLaterItems(session.user.id, ids, "listening");
    await deleteRecordings(removing.flatMap((item) => item.recording ? [item.recording.url] : [])).catch(() => {});
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "The list couldn't be updated. Please try again." }, { status: 502 });
  }
}
