import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLlmProvider, getRequestProvider } from "@/lib/llm/provider";
import { requireAccountApiKey } from "@/lib/storage/account";
import { parseFlashcards } from "@/lib/flashcards";
import { isSupportedLanguage } from "@/lib/presets";
import { getTemplate } from "@/lib/storage/templates";
import type { LearnerLevel, OutputStyle, PromptTemplateId } from "@/lib/types";

// Flashcards for a whole textbook page can take a few minutes to write.
export const maxDuration = 300;

// Each card carries a reading and two explanations, so a page of cards
// needs more room than the usual 8,192 tokens (about 3–4 minutes at most).
const flashcardOutputTokens = 16000;

const learnerLevels =new Set<LearnerLevel>(["Beginner", "Intermediate", "Advanced"]);
const outputStyles = new Set<OutputStyle>(["Concise", "Detailed", "Literal", "Natural", "Formal", "Informal"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

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
    const providerId = getRequestProvider(request);
    const apiKey = await requireAccountApiKey(session.user.id, providerId);
    const result = await getLlmProvider(providerId).runTask({
      text,
      sourceLanguage,
      userLanguage,
      learnerLevel: learnerLevel as LearnerLevel,
      outputStyle: outputStyle as OutputStyle,
      promptTemplateId: promptTemplateId as PromptTemplateId,
      ...(promptTemplateId === "flashcards" ? { maxOutputTokens: flashcardOutputTokens } : {}),
    }, apiKey);
    if (promptTemplateId !== "flashcards") return NextResponse.json({ result, promptTemplateId });
    const parsed = parseFlashcards(result);
    if (!parsed) {
      return NextResponse.json({ error: "The provider returned flashcards in an unexpected format. Please run the task again." }, { status: 502 });
    }
    // Cut off before the end (too much material for one run): keep the
    // complete cards, and say where to pick up.
    const warning = parsed.complete ? undefined
      : `The material was too long to finish in one run: these are the first ${parsed.cards.length} cards, ending with “${parsed.cards[parsed.cards.length - 1].front}”. Run Make flashcards again on the rest of the text for the remaining cards.`;
    return NextResponse.json({ result, promptTemplateId, flashcards: parsed.cards, warning });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The task could not be completed." }, { status: 502 });
  }
}
