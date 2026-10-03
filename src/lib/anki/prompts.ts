import type { AnkiLanguage } from "@/lib/anki/vocab";

// The one Thai romanization style used everywhere in the Anki notes,
// modeled on "thêe dâi rúu jàk". Edit here to change it everywhere.
export const thaiRomanizationStyle = `Romanize in this exact style (example: ยินดีที่ได้รู้จัก -> "yin dee thêe dâi rúu jàk"; สบายดีไหม -> "sà-baai dee mǎi"; ลาก่อน -> "laa gàwn"):
- Tones as diacritics on the vowel: mid unmarked, low à, falling â, high á, rising ǎ.
- Consonants: ก g, ข/ค kh, จ j, ฉ/ช ch, ด d, ต dt, ถ/ท th, บ b, ป bp, ผ/พ ph, ฟ f, ง ng, ย y, ว w, ร r, ล l, ส/ซ s, ห h, อ (silent). Final stops as k, t, p.
- Romanize the actual spoken pronunciation of each syllable, not the spelling letter by letter. Work syllable by syllable: identify the vowel's length (the ็ mark and short vowel forms make it short), any final consonant or final ว/ย glide, then the tone.
- Plain vowels, short/long: i/ee (ดี dee), u/uu (รู้ rúu), a/aa (มา maa), e/ay (เล็ก lék, เพลง phlayng), ae/aae (แข็ง khǎeng, และ láe, แดง daaeng), aw/aw (เพราะ phráw, ก่อน gàwn), o/oh (โต๊ะ dtó, โทร thoh), eu/euu (มือ meuu), er/er (เงิน ngern), ia (เรียน rian), ua (ตัว dtua), eua (เรือ reua, เหนือ nǔea).
- Vowel + final ว/ย glide: eo (เร็ว reo, เลว leo), aaeo (แมว maaeo, แล้ว láaeo), iu (หิว hǐu), ao/aao (เขา khǎo, ขาว khǎao), ai/aai (ไป bpai, สบาย sà-baai), awy (ร้อย ráwy, หน่อย nàwy), oy (โดย doy), ui (คุย khui), uay (สวย sǔay), oei (เลย loei).
- ๆ repeats the preceding word (มาเร็วๆ -> "maa reo reo").
- Hyphens between the syllables of one word (ขอบคุณ khàwp-khun, สบาย sà-baai), spaces between words. All lowercase.`;

// Mandarin readings: standard Hanyu Pinyin with tone marks.
export const pinyinStyle = "Use Hanyu Pinyin with tone marks (nǐ hǎo, not ni3 hao3), applying tone sandhi as spoken only where the standard writes it (e.g. 不 and 一 keep their dictionary tones). Write the syllables of one word together and separate words with spaces (我们明天去市场 → wǒmen míngtiān qù shìchǎng). All lowercase except proper nouns.";

export function readingPrompt(text: string, language: AnkiLanguage) {
  if (language === "Thai") {
    return [
      "Romanize the following Thai text for a language learner.",
      thaiRomanizationStyle,
      "Reply with the romanization only: no Thai script, no quotes, no explanation.",
      "Thai text:",
      text,
    ].join("\n\n");
  }
  if (language === "Mandarin") {
    return [
      "Give the pinyin for the following Chinese text, as a learner would read it aloud.",
      pinyinStyle,
      "Reply with the pinyin only: no characters, no quotes, no explanation.",
      "Chinese text:",
      text,
    ].join("\n\n");
  }
  return [
    "Give the hiragana reading of the following Japanese text, as a learner would read it aloud.",
    "Reply with the hiragana only: no kanji, no romaji, no quotes, no explanation.",
    "Japanese text:",
    text,
  ].join("\n\n");
}

export function glossPrompt(text: string, language: AnkiLanguage) {
  return [
    `Give the English meaning of the following ${language} text for the English side of a flashcard.`,
    "For a single word or short term, give a short gloss (a few words; separate distinct senses with semicolons). For a sentence, give one natural English translation.",
    "Reply with the English only: no quotes, no labels, no explanation.",
    `${language} text:`,
    text,
  ].join("\n\n");
}

// A flashcard translation into another language the note has a field for,
// working from the note's other filled fields.
export function translatePrompt(sources: string, target: AnkiLanguage) {
  return [
    `Here is one flashcard item as it appears in several languages:`,
    sources,
    `Give the same item in natural, everyday ${target}, as a native speaker would say it, keeping the same register and length (a word stays a word, a sentence stays a sentence).`,
    target === "Thai" ? "Write Thai without spaces between words; use a space only between sentences." : "",
    target === "Mandarin" ? "Use simplified characters." : "",
    `Reply with the ${target} only, in its native script: no romanization, quotes, labels, or explanation.`,
  ].filter(Boolean).join("\n\n");
}

// "vocabulary" and "sentence" come from flashcard lists; the rest from analyses.
export type BranchItemKind = "example" | "related" | "register" | "vocabulary" | "sentence";

// One learnable item found inside an analysis.
export type BranchItem = {
  text: string;
  reading: string;
  english: string;
  comment: string;
  kind: BranchItemKind;
  // Tags suggested for the note (flashcard lists carry topic tags).
  tags?: string[];
};

function readingInstruction(language: AnkiLanguage) {
  if (language === "Thai") return `"reading": its romanization. ${thaiRomanizationStyle}`;
  if (language === "Japanese") return `"reading": its hiragana reading.`;
  if (language === "Mandarin") return `"reading": its pinyin. ${pinyinStyle}`;
  return `"reading": an empty string (${language} needs no reading).`;
}

function itemFields(language: AnkiLanguage) {
  return [
    `"text": the ${language} exactly as written in native script, with no romanization, translation, or labels.`,
    readingInstruction(language),
    `"english": a short, natural English meaning, suitable for the English side of a flashcard.`,
    `"comment": one brief English sentence saying what makes this item worth knowing (its nuance, register, or use), based on what the analysis says.`,
  ].join("\n");
}

export function extractItemsPrompt(analysis: string, parentText: string, language: AnkiLanguage) {
  return [
    `Below is a ${language} language-learning analysis of "${parentText}".`,
    `List every separate ${language} item it presents for the learner: example sentences, synonyms or related words, and alternative versions in other registers (casual, polite, formal...). Leave out "${parentText}" itself and fragments that are only explained as parts of it.`,
    "Return a JSON array of objects with these fields:",
    itemFields(language),
    `"kind": "example" for an example sentence, "related" for a synonym or related word, "register" for a version in another register.`,
    "Reply with the JSON array only.",
    "Analysis:",
    analysis,
  ].join("\n\n");
}

export type FollowUpExchange = { question: string; answer: string };

// A follow-up question about a note, asked after its analysis. Every
// <language> phrase in the answer is written so the learner can right-click
// it into a flashcard: native script, then its reading, then the English.
export function followUpPrompt(input: {
  question: string;
  item: string;
  english: string;
  analysis: string;
  earlier: FollowUpExchange[];
  language: AnkiLanguage;
  learnerLevel: string;
  outputStyle: string;
}) {
  const { language } = input;
  const reading = language === "Thai" ? `its romanization. ${thaiRomanizationStyle}`
    : language === "Japanese" ? "its hiragana reading"
    : language === "Mandarin" ? `its pinyin. ${pinyinStyle}`
    : "";
  return [
    `You are a careful ${language} tutor. A ${input.learnerLevel.toLowerCase()} learner is studying the ${language} item "${input.item}"${input.english ? ` ("${input.english}")` : ""} and has read the analysis below. Answer their follow-up question.`,
    `Style: ${input.outputStyle}. Use natural, everyday ${language} as a native speaker would say it, and explain in English.`,
    `Format the answer in Markdown. Put each ${language} phrase or sentence you give on its own line in bold, in native script with no romanization mixed in${language === "Thai" ? " and no spaces between words" : ""}; ${reading ? `on the next line give ${reading}, then ` : "on the next line give "}its English meaning. Keep explanations short and after the phrases they explain.`,
    "Analysis:",
    input.analysis,
    ...input.earlier.flatMap((exchange) => ["Earlier question:", exchange.question, "Your earlier answer:", exchange.answer]),
    "Follow-up question:",
    input.question,
  ].join("\n\n");
}

export function describeSelectionPrompt(selection: string, analysis: string, language: AnkiLanguage) {
  return [
    `A learner selected this ${language} text in the language-learning analysis below: "${selection}".`,
    `Describe exactly that text as a flashcard item — not the item the analysis is about, and not a shorter or longer piece of it. Use what the analysis says about it where it can; otherwise describe it yourself.`,
    "Return one JSON object with these fields:",
    itemFields(language),
    `"kind": "example", "related", or "register", whichever fits best.`,
    "Reply with the JSON object only.",
    "Analysis:",
    analysis,
  ].join("\n\n");
}
