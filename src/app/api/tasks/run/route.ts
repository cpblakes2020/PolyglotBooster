import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLlmProvider, getRequestProvider } from "@/lib/llm/provider";
import { requireAccountApiKey } from "@/lib/storage/account";
import { isKnownReading, unambiguousReading } from "@/lib/dictionary/japanese";
import { japaneseReference } from "@/lib/dictionary/reference";
import { isJapaneseTerm, japaneseDictionary } from "@/lib/dictionary/server";
import { isFlashcardTemplate, parseFlashcards, type Flashcard } from "@/lib/flashcards";
import { readTaskRequest } from "@/lib/prompts/taskRequest";

// Flashcards for a whole textbook page can take a few minutes to write.
export const maxDuration = 300;

// Each card carries a reading and two explanations, so a page of cards
// needs more room than the usual 8,192 tokens (about 3–4 minutes at most).
const flashcardOutputTokens = 16000;

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


export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const checked = await readTaskRequest(await request.json().catch(() => null) as Record<string, unknown> | null);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { input } = checked;
  const { text, sourceLanguage, promptTemplateId } = input;

  try {
    const providerId = getRequestProvider(request);
    const apiKey = await requireAccountApiKey(session.user.id, providerId);
    const reference = sourceLanguage === "Japanese" ? await japaneseReference(promptTemplateId, text, request) : undefined;
    const result = await getLlmProvider(providerId).runTask({
      ...input,
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
