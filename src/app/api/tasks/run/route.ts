import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLlmProvider, getRequestProvider } from "@/lib/llm/provider";
import { requireAccountApiKey } from "@/lib/storage/account";
import { formatJapaneseReference, formatJapaneseWordList, isKnownReading, unambiguousReading } from "@/lib/dictionary/japanese";
import { isJapaneseTerm, japaneseDictionary } from "@/lib/dictionary/server";
import { japaneseTextWords } from "@/lib/dictionary/tokenizer";
import { isFlashcardTemplate, parseFlashcards, type Flashcard } from "@/lib/flashcards";
import { isSupportedLanguage } from "@/lib/presets";
import { getTemplate } from "@/lib/storage/templates";
import type { LearnerLevel, OutputStyle, PromptTemplateId } from "@/lib/types";

// Flashcards for a whole textbook page can take a few minutes to write.
export const maxDuration = 300;

// Each card carries a reading and two explanations, so a page of cards
// needs more room than the usual 8,192 tokens (about 3–4 minutes at most).
const flashcardOutputTokens = 16000;

// Curated dictionary reference for Japanese tasks (given to the model as the
// authority for readings and meanings):
// - Word Analysis: the word's entry (or the words a compound is made of);
// - Sentence Guide: every dictionary word of the sentence;
// - selective flashcards: the text's words, marking JMdict's common ones,
//   so everyday vocabulary can be left out objectively.
async function japaneseReference(templateId: string, text: string, request: Request) {
  try {
    const dictionary = japaneseDictionary(request);
    if (templateId.startsWith("word-analysis-japanese") && isJapaneseTerm(text)) {
      const found = await dictionary.lookup(text);
      return found && (found.exact.length || found.parts.length) ? formatJapaneseReference(text.trim(), found) : undefined;
    }
    if (templateId.startsWith("sentence-guide-japanese")) {
      const words = await japaneseTextWords(text, dictionary, 40);
      return words.length ? `Dictionary words in the source text (dictionary form【reading】, main senses):\n${formatJapaneseWordList(words)}` : undefined;
    }
    if (templateId === "flashcards-selective") {
      const words = await japaneseTextWords(text, dictionary, 150);
      return words.length ? [
        "Dictionary words in the source text, in order. Words marked [common] are everyday vocabulary (JMdict's common-word marker): leave them out unless the text is about them or uses them in an unusual sense; choose vocabulary cards mainly from the unmarked words. Use the readings given here.",
        formatJapaneseWordList(words),
      ].join("\n") : undefined;
    }
  } catch {
    // Without the dictionary the task still runs, just ungrounded.
  }
  return undefined;
}

// Japanese flashcards: a word's reading that JMdict doesn't give it is
// replaced by the dictionary's (when the dictionary is unambiguous) — e.g.
// a guessed reading of an irregular word. Sentences are left as written.
async function checkJapaneseReadings(cards: Flashcard[], request: Request) {
  const dictionary = japaneseDictionary(request);
  await Promise.all(cards.map(async (card) => {
    if (!card.reading || !isJapaneseTerm(card.front)) return;
    const found = await dictionary.lookup(card.front).catch(() => null);
    if (!found?.exact.length || isKnownReading(found.exact, card.front, card.reading)) return;
    const reading = unambiguousReading(found.exact, card.front);
    if (reading) card.reading = reading;
  }));
}

const learnerLevels = new Set<LearnerLevel>(["Beginner", "Intermediate", "Advanced"]);
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
    const reference = sourceLanguage === "Japanese" ? await japaneseReference(promptTemplateId, text, request) : undefined;
    const result = await getLlmProvider(providerId).runTask({
      text,
      sourceLanguage,
      userLanguage,
      learnerLevel: learnerLevel as LearnerLevel,
      outputStyle: outputStyle as OutputStyle,
      promptTemplateId: promptTemplateId as PromptTemplateId,
      ...(isFlashcardTemplate(promptTemplateId) ? { maxOutputTokens: flashcardOutputTokens } : {}),
      ...(reference ? { reference } : {}),
    }, apiKey);
    if (!isFlashcardTemplate(promptTemplateId)) return NextResponse.json({ result, promptTemplateId });
    const parsed = parseFlashcards(result);
    if (!parsed) {
      return NextResponse.json({ error: "The provider returned flashcards in an unexpected format. Please run the task again." }, { status: 502 });
    }
    if (sourceLanguage === "Japanese") await checkJapaneseReadings(parsed.cards, request);
    // Cut off before the end (too much material for one run): keep the
    // complete cards, and say where to pick up.
    const warning = parsed.complete ? undefined
      : `The material was too long to finish in one run: these are the first ${parsed.cards.length} cards, ending with “${parsed.cards[parsed.cards.length - 1].front}”. Run Make flashcards again on the rest of the text for the remaining cards.`;
    return NextResponse.json({ result, promptTemplateId, flashcards: parsed.cards, warning });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The task could not be completed." }, { status: 502 });
  }
}
