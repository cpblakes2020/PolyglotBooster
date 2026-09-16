import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccountReviews } from "@/lib/storage/account";
import { buildAnkiPackage } from "@/lib/anki";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { id } = await context.params;
  try {
    const reviews = await getAccountReviews(session.user.id);
    const run = reviews.find((review) => review.taskRunId === id);
    if (!run) return NextResponse.json({ error: "Review not found." }, { status: 404 });

    const apkg = await buildAnkiPackage(run);
    return new NextResponse(new Uint8Array(apkg), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="polyglot-${run.taskRunId}.apkg"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "The Anki package could not be generated." }, { status: 503 });
  }
}
