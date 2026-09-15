import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccountKeyStatus, setAccountApiKey } from "@/lib/storage/account";
import type { LlmProviderId } from "@/lib/llm/provider";

const providers = new Set<LlmProviderId>(["anthropic", "openai"]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    return NextResponse.json({ keyStatus: await getAccountKeyStatus(session.user.id) });
  } catch {
    return NextResponse.json({ error: "Account storage is unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as { providerId?: unknown; apiKey?: unknown } | null;
  if (typeof body?.providerId !== "string" || !providers.has(body.providerId as LlmProviderId)) {
    return NextResponse.json({ error: "Choose a supported provider." }, { status: 400 });
  }
  if (body.apiKey !== null && (typeof body.apiKey !== "string" || body.apiKey.length > 1000)) {
    return NextResponse.json({ error: "The API key is invalid." }, { status: 400 });
  }

  try {
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() || null : null;
    await setAccountApiKey(session.user.id, body.providerId as LlmProviderId, apiKey);
    return NextResponse.json({ keyStatus: await getAccountKeyStatus(session.user.id) });
  } catch {
    return NextResponse.json({ error: "Account storage is unavailable." }, { status: 503 });
  }
}
