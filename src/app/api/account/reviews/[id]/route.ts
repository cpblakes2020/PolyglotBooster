import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteAccountReview, updateAccountReview } from "@/lib/storage/account";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { notes?: unknown } | null;
  if (typeof body?.notes !== "string" || body.notes.length > 5000) {
    return NextResponse.json({ error: "Notes must be 5,000 characters or fewer." }, { status: 400 });
  }

  try {
    const reviews = await updateAccountReview(session.user.id, id, { notes: body.notes });
    return NextResponse.json({ reviews });
  } catch {
    return NextResponse.json({ error: "The review could not be updated." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await context.params;
  try {
    const reviews = await deleteAccountReview(session.user.id, id);
    return NextResponse.json({ reviews });
  } catch {
    return NextResponse.json({ error: "The review could not be deleted." }, { status: 503 });
  }
}
