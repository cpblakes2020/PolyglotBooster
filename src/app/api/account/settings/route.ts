import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isSupportedLanguage } from "@/lib/presets";
import { getAccountSettings, updateAccountSettings } from "@/lib/storage/account";
import type { Language } from "@/lib/types";
import { isTtsVoice, type VoiceSetting } from "@/lib/voices";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    return NextResponse.json({ settings: await getAccountSettings(session.user.id) });
  } catch {
    return NextResponse.json({ error: "Account storage is unavailable." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as { voices?: unknown; voices2?: unknown } | null;
  if ((!body?.voices || typeof body.voices !== "object") && (!body?.voices2 || typeof body.voices2 !== "object")) {
    return NextResponse.json({ error: "Send the voice settings to save." }, { status: 400 });
  }

  // Either or both of the first- and second-recording defaults; what isn't
  // sent stays as it is.
  const updates: { voices?: Partial<Record<Language, VoiceSetting>>; voices2?: Partial<Record<Language, VoiceSetting>> } = {};
  for (const key of ["voices", "voices2"] as const) {
    const sent = body?.[key];
    if (!sent || typeof sent !== "object") continue;
    const checked: Partial<Record<Language, VoiceSetting>> = {};
    for (const [language, value] of Object.entries(sent as Record<string, Partial<VoiceSetting>>)) {
      if (!isSupportedLanguage(language) || !isTtsVoice(value?.voice) || typeof value.instructions !== "string" || value.instructions.length > 1000) {
        return NextResponse.json({ error: `The voice setting for ${language} is invalid.` }, { status: 400 });
      }
      checked[language] = { voice: value.voice, instructions: value.instructions.trim() };
    }
    updates[key] = checked;
  }

  try {
    return NextResponse.json({ settings: await updateAccountSettings(session.user.id, updates) });
  } catch {
    return NextResponse.json({ error: "Account storage is unavailable." }, { status: 503 });
  }
}
