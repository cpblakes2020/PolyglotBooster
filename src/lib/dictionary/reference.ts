import { difficultKanji, formatJapaneseReference, formatJapaneseWordList, formatKanjiReference, maxDifficultKanji } from "@/lib/dictionary/japanese";
import { isJapaneseTerm, japaneseDictionary } from "@/lib/dictionary/server";
import { japaneseTextWords } from "@/lib/dictionary/tokenizer";
import { customTaskId } from "@/lib/prompts/buildPrompt";

// Curated dictionary reference for Japanese tasks (given to the model as the
// authority for readings and meanings):
// - Word Analysis: the word's entry (or the words a compound is made of),
//   and its kanji with other compounds that use them;
// - Sentence Guide: every dictionary word of the sentence, and only its
//   hardest kanji (see difficultKanji) with their compounds;
// - selective flashcards: the text's words, marking JMdict's common ones,
//   so everyday vocabulary can be left out objectively;
// - Custom task: as Word Analysis for a word, otherwise the sentence's
//   words and hardest kanji.
export async function japaneseReference(templateId: string, text: string, request: Request) {
  try {
    const dictionary = japaneseDictionary(request);
    const custom = templateId === customTaskId;
    if ((templateId.startsWith("word-analysis-japanese") || custom) && isJapaneseTerm(text)) {
      const found = await dictionary.lookup(text);
      return found && (found.exact.length || found.parts.length) ? formatJapaneseReference(text.trim(), found) : undefined;
    }
    if (templateId.startsWith("sentence-guide-japanese") || custom) {
      const [words, kanji] = await Promise.all([japaneseTextWords(text, dictionary, 40), dictionary.kanji(text)]);
      const hard = difficultKanji(kanji);
      const parts = [
        words.length ? `Dictionary words in the source text (dictionary form【reading】, main senses):\n${formatJapaneseWordList(words)}` : "",
        hard.length ? `Hardest kanji in the source text (beyond the 1,026 taught in elementary school, hardest first, at most ${maxDifficultKanji}${custom ? "" : "; the only kanji to explain"}), with other compounds that use each (JMdict, everyday words first):\n${formatKanjiReference(hard)}` : "",
      ].filter(Boolean);
      return parts.length ? parts.join("\n\n") : undefined;
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
