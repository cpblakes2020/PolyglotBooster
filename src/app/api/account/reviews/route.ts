import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addAccountReview, getAccountReviews } from "@/lib/storage/account";
import { isSupportedLanguage } from "@/lib/presets";
import type { LearnerLevel, OutputStyle } from "@/lib/types";
import type { SavedTaskRun } from "@/lib/reviews";

const learnerLevels = new Set<LearnerLevel>(["Beginner", "Intermediate", "Advanced"]);
const outputStyles = new Set<OutputStyle>(["Concise", "Detailed", "Literal", "Natural", "Formal", "Informal"]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    return NextResponse.json({ reviews: await getAccountReviews(session.user.id) });
  } catch {
    return NextResponse.json({ error: "Saved reviews could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const taskRunId = body?.taskRunId;
  const sourceText = body?.sourceText;
  const result = body?.result;
  const sourceLanguage = body?.sourceLanguage;
  const userLanguage = body?.userLanguage;
  const learnerLevel = body?.learnerLevel;
  const outputStyle = body?.outputStyle;
  const promptTemplateId = body?.promptTemplateId;
  const notes = body?.notes;
  const createdAt = body?.createdAt;
  const flashcards = body?.flashcards;
  const followUps = body?.followUps;

  if (typeof taskRunId !== "string" || !taskRunId) return NextResponse.json({ error: "Invalid review." }, { status: 400 });
  if (typeof sourceText !== "string" || !sourceText.trim() || sourceText.length > 12000) {
    return NextResponse.json({ error: "A source text and completed result are required." }, { status: 400 });
  }
  if (typeof result !== "string" || !result.trim() || result.length > 40000) {
    return NextResponse.json({ error: "A source text and completed result are required." }, { status: 400 });
  }
  if (typeof sourceLanguage !== "string" || !isSupportedLanguage(sourceLanguage) || typeof userLanguage !== "string" || !isSupportedLanguage(userLanguage)) {
    return NextResponse.json({ error: "Choose supported source and explanation languages." }, { status: 400 });
  }
  if (typeof learnerLevel !== "string" || !learnerLevels.has(learnerLevel as LearnerLevel) || typeof outputStyle !== "string" || !outputStyles.has(outputStyle as OutputStyle)) {
    return NextResponse.json({ error: "Choose a supported learner level and output style." }, { status: 400 });
  }
  if (typeof promptTemplateId !== "string" || !promptTemplateId) return NextResponse.json({ error: "Choose a task." }, { status: 400 });
  if (typeof createdAt !== "string" || !createdAt) return NextResponse.json({ error: "Invalid review." }, { status: 400 });

  const review: SavedTaskRun = {
    taskRunId,
    sourceText,
    result,
    sourceLanguage,
    userLanguage,
    learnerLevel: learnerLevel as LearnerLevel,
    outputStyle: outputStyle as OutputStyle,
    promptTemplateId,
    notes: typeof notes === "string" ? notes : "",
    createdAt,
    flashcards: Array.isArray(flashcards) ? flashcards : undefined,
    followUps: Array.isArray(followUps) ? followUps : undefined,
  };

  try {
    const reviews = await addAccountReview(session.user.id, review);
    return NextResponse.json({ reviews }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The review could not be saved." }, { status: 503 });
  }
}
