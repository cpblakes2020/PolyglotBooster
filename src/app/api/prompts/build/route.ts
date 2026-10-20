import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { japaneseReference } from "@/lib/dictionary/reference";
import { buildPromptParts, generalInstructions, joinPromptParts } from "@/lib/prompts/buildPrompt";
import { readTaskRequest } from "@/lib/prompts/taskRequest";

// Preview prompt: exactly what Run task would send, in its four parts —
// general instructions, task, dictionary reference (Japanese), source text —
// plus the standard general instructions for these settings, to start
// editing from.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const checked = await readTaskRequest(await request.json().catch(() => null) as Record<string, unknown> | null);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { input } = checked;

  try {
    const reference = input.sourceLanguage === "Japanese" ? await japaneseReference(input.promptTemplateId, input.text, request) : undefined;
    const parts = await buildPromptParts({ ...input, ...(reference ? { reference } : {}) });
    return NextResponse.json({ prompt: joinPromptParts(parts), parts, defaultGeneral: generalInstructions(input), promptTemplateId: input.promptTemplateId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The prompt could not be built." }, { status: 422 });
  }
}
