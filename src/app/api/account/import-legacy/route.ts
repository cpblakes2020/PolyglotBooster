import { NextResponse } from "next/server";
import { createDecipheriv } from "node:crypto";
import { auth } from "@/lib/auth";
import { mergeAccountReviews } from "@/lib/storage/account";
import type { SavedTaskRun } from "@/lib/reviews";

const legacyWorkspaceUrl = "https://polyglotbooster.vercel.app/api/workspace";

function isSyncCode(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function fromBase64Url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function decryptLegacyPayload(payload: string, syncCode: string): unknown {
  const [encodedIv, encodedCiphertext] = payload.split(".");
  if (!encodedIv || !encodedCiphertext) throw new Error("The old workspace data is invalid.");
  const key = fromBase64Url(syncCode);
  const iv = fromBase64Url(encodedIv);
  const ciphertextWithTag = fromBase64Url(encodedCiphertext);
  if (ciphertextWithTag.length < 16) throw new Error("The old workspace data is invalid.");
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

function isLegacyReview(value: unknown): value is SavedTaskRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return typeof run.taskRunId === "string" && typeof run.sourceText === "string" && typeof run.result === "string" && typeof run.createdAt === "string";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as { syncCode?: unknown } | null;
  const syncCode = body?.syncCode;
  if (typeof syncCode !== "string" || !isSyncCode(syncCode)) {
    return NextResponse.json({ error: "Enter the 43-character sync code exactly as saved." }, { status: 400 });
  }

  let payload: string | null;
  try {
    const response = await fetch(legacyWorkspaceUrl, { headers: { "x-polyglot-workspace-key": syncCode } });
    const data = await response.json().catch(() => null) as { payload?: string | null; error?: string } | null;
    if (!response.ok) throw new Error(data?.error || "The old server could not be reached.");
    payload = data?.payload ?? null;
  } catch {
    return NextResponse.json({ error: "The old server could not be reached. Try again shortly." }, { status: 502 });
  }

  if (!payload) return NextResponse.json({ error: "No saved reviews were found for that sync code." }, { status: 404 });

  let decrypted: unknown;
  try {
    decrypted = decryptLegacyPayload(payload, syncCode);
  } catch {
    return NextResponse.json({ error: "That sync code could not decrypt the saved data. Check it and try again." }, { status: 400 });
  }

  if (!Array.isArray(decrypted)) return NextResponse.json({ error: "The old workspace data is invalid." }, { status: 400 });
  const legacyReviews = decrypted.filter(isLegacyReview);
  if (!legacyReviews.length) return NextResponse.json({ error: "No valid saved reviews were found in that sync code." }, { status: 404 });

  try {
    const { added, skipped } = await mergeAccountReviews(session.user.id, legacyReviews);
    return NextResponse.json({ imported: added, skipped });
  } catch {
    return NextResponse.json({ error: "The imported reviews could not be saved." }, { status: 503 });
  }
}
