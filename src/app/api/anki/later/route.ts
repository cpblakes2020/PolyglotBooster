import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { languages } from "@/lib/languages";
import { addLaterItem, getLaterItems, removeLaterItems } from "@/lib/storage/account";

// The "Save for Anki later" list: phrases saved on any device, added to
// Anki later from the Anki page on the computer running Anki.
// GET lists them; POST adds one; DELETE removes the given ids.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ items: await getLaterItems(session.user.id) });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { text?: unknown; language?: unknown; context?: unknown; source?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const language = languages.find((candidate) => candidate === body?.language);
  if (!text || text.length > 300 || !language) return NextResponse.json({ error: "Select up to 300 characters of text in a learning language." }, { status: 400 });
  try {
    const items = await addLaterItem(session.user.id, {
      text,
      language,
      context: typeof body?.context === "string" ? body.context.slice(0, 8000) : "",
      source: typeof body?.source === "string" ? body.source.slice(0, 200) : "",
    });
    return NextResponse.json({ items }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The phrase couldn't be saved. Please try again." }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });
  try {
    return NextResponse.json({ items: await removeLaterItems(session.user.id, ids) });
  } catch {
    return NextResponse.json({ error: "The list couldn't be updated. Please try again." }, { status: 502 });
  }
}
