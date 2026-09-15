import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildFollowUpPrompt } from "@/lib/prompts/buildFollowUpPrompt";
import { getLlmProvider, getRequestProvider } from "@/lib/llm/provider";
import { requireAccountApiKey } from "@/lib/storage/account";
import { isSupportedLanguage } from "@/lib/presets";
import type { LearnerLevel, OutputStyle } from "@/lib/types";

const learnerLevels = new Set<LearnerLevel>(["Beginner", "Intermediate", "Advanced"]);
const outputStyles = new Set<OutputStyle>(["Concise", "Detailed", "Literal", "Natural", "Formal", "Informal"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sourceText = body?.sourceText;
  const previousResult = body?.previousResult;
  const question = body?.question;
  const sourceLanguage = body?.sourceLanguage;
  const userLanguage = body?.userLanguage;
  const learnerLevel = body?.learnerLevel;
  const outputStyle = body?.outputStyle;

  if (typeof sourceText !== "string" || !sourceText.trim() || typeof previousResult !== "string" || !previousResult.trim()) {
    return NextResponse.json({ error: "The original text and result are required." }, { status: 400 });
  }
  if (typeof question !== "string" || !question.trim() || question.length > 2000) {
    return NextResponse.json({ error: "Enter a follow-up question of 1 to 2,000 characters." }, { status: 400 });
  }
  if (typeof sourceLanguage !== "string" || !isSupportedLanguage(sourceLanguage) || typeof userLanguage !== "string" || !isSupportedLanguage(userLanguage)) {
    return NextResponse.json({ error: "Choose supported source and explanation languages." }, { status: 400 });
  }
  if (typeof learnerLevel !== "string" || !learnerLevels.has(learnerLevel as LearnerLevel) || typeof outputStyle !== "string" || !outputStyles.has(outputStyle as OutputStyle)) {
    return NextResponse.json({ error: "Choose a supported learner level and output style." }, { status: 400 });
  }

  try {
    const providerId = getRequestProvider(request);
    const provider = getLlmProvider(providerId);
    if (!provider.runRawPrompt) return NextResponse.json({ error: "Follow-up questions are unavailable for the selected provider." }, { status: 400 });
    const apiKey = await requireAccountApiKey(session.user.id, providerId);
    const prompt = buildFollowUpPrompt({
      sourceText,
      previousResult,
      question,
      sourceLanguage,
      userLanguage,
      learnerLevel: learnerLevel as LearnerLevel,
      outputStyle: outputStyle as OutputStyle,
    });
    const result = await provider.runRawPrompt(prompt, apiKey);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The follow-up question could not be answered." }, { status: 502 });
  }
}
