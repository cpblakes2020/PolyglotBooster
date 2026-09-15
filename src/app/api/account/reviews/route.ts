import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccountReviews, setAccountReviews } from "@/lib/storage/account";
import type { SavedTaskRun } from "@/lib/reviews";

const maxPayloadLength = 5 * 1024 * 1024;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    return NextResponse.json({ reviews: await getAccountReviews(session.user.id) });
  } catch {
    return NextResponse.json({ error: "Saved reviews could not be loaded." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const raw = await request.text();
  if (raw.length > maxPayloadLength) return NextResponse.json({ error: "Saved reviews payload is too large." }, { status: 413 });
  let body: { reviews?: unknown } | null;
  try {
    body = JSON.parse(raw) as { reviews?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid reviews payload." }, { status: 400 });
  }
  if (!Array.isArray(body?.reviews)) return NextResponse.json({ error: "Invalid reviews payload." }, { status: 400 });

  try {
    await setAccountReviews(session.user.id, body.reviews as SavedTaskRun[]);
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: "Saved reviews could not be saved." }, { status: 503 });
  }
}
