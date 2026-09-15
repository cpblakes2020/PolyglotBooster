import { NextResponse } from "next/server";
import { buildStudyPrompt } from "@/lib/prompts/buildPrompt";
import { isSupportedLanguage } from "@/lib/presets";
import { getTemplate } from "@/lib/storage/templates";
import type { LearnerLevel, OutputStyle, PromptTemplateId } from "@/lib/types";

const learnerLevels = new Set<LearnerLevel>(["Beginner", "Intermediate", "Advanced"]);
const outputStyles = new Set<OutputStyle>(["Concise", "Detailed", "Literal", "Natural", "Formal", "Informal"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const text = body?.text;
  const sourceLanguage = body?.sourceLanguage;
  const userLanguage = body?.userLanguage;
  const learnerLevel = body?.learnerLevel;
  const outputStyle = body?.outputStyle;
  const promptTemplateId = body?.promptTemplateId;

  if (typeof text !== "string" || !text.trim() || text.length > 12000) {
    return NextResponse.json({ error: "Enter between 1 and 12,000 characters of source text." }, { status: 400 });
  }
  if (typeof sourceLanguage !== "string" || !isSupportedLanguage(sourceLanguage) || typeof userLanguage !== "string" || !isSupportedLanguage(userLanguage)) {
    return NextResponse.json({ error: "Choose supported source and explanation languages." }, { status: 400 });
  }
  if (typeof learnerLevel !== "string" || !learnerLevels.has(learnerLevel as LearnerLevel) || typeof outputStyle !== "string" || !outputStyles.has(outputStyle as OutputStyle)) {
    return NextResponse.json({ error: "Choose a supported learner level and output style." }, { status: 400 });
  }
  if (typeof promptTemplateId !== "string" || !(await getTemplate(promptTemplateId))) {
    return NextResponse.json({ error: "Choose a supported prompt template." }, { status: 400 });
  }

  try {
    const prompt = await buildStudyPrompt({
      text,
      sourceLanguage,
      userLanguage,
      learnerLevel: learnerLevel as LearnerLevel,
      outputStyle: outputStyle as OutputStyle,
      promptTemplateId: promptTemplateId as PromptTemplateId,
    });
    return NextResponse.json({ prompt, promptTemplateId });
  } catch {
    return NextResponse.json({ error: "The prompt could not be built." }, { status: 422 });
  }
}
