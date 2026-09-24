import type { AnkiLanguage } from "@/lib/anki/vocab";

// The one Thai romanization style used everywhere in the Anki notes,
// modeled on "thêe dâi rúu jàk". Edit here to change it everywhere.
export const thaiRomanizationStyle = `Romanize in this exact style (example: ยินดีที่ได้รู้จัก -> "yin dee thêe dâi rúu jàk"; สบายดีไหม -> "sà-baai dee mǎi"; ลาก่อน -> "laa gàwn"):
- Tones as diacritics on the vowel: mid unmarked, low à, falling â, high á, rising ǎ.
- Consonants: ก g, ข/ค kh, จ j, ฉ/ช ch, ด d, ต dt, ถ/ท th, บ b, ป bp, ผ/พ ph, ฟ f, ง ng, ย y, ว w, ร r, ล l, ส/ซ s, ห h, อ (silent). Final stops as k, t, p.
- Romanize the actual spoken pronunciation of each syllable, not the spelling letter by letter. Work syllable by syllable: identify the vowel's length (the ็ mark and short vowel forms make it short), any final consonant or final ว/ย glide, then the tone.
- Plain vowels, short/long: i/ee (ดี dee), u/uu (รู้ rúu), a/aa (มา maa), e/ay (เล็ก lék, เพลง phlayng), ae/aae (แข็ง khǎeng, แดง daaeng), aw/aw (เพราะ phráw, ก่อน gàwn), o/oh (โต๊ะ dtó, โทร thoh), eu/euu (มือ meuu), er/er (เงิน ngern), ia (เรียน rian), ua (ตัว dtua), eua (เรือ reua).
- Vowel + final ว/ย glide: eo (เร็ว reo, เลว leo), aaeo (แมว maaeo, แล้ว láaeo), iu (หิว hǐu), ao/aao (เขา khǎo, ขาว khǎao), ai/aai (ไป bpai, สบาย sà-baai), awy (ร้อย ráwy, หน่อย nàwy), oy (โดย doy), ui (คุย khui), uay (สวย sǔay), oei (เลย loei).
- ๆ repeats the preceding word (มาเร็วๆ -> "maa reo reo").
- Hyphens between the syllables of one word (ขอบคุณ khàwp-khun, สบาย sà-baai), spaces between words. All lowercase.`;

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

export type BranchItemKind = "example" | "related" | "register";

// One learnable item found inside an analysis.
export type BranchItem = {
  text: string;
  reading: string;
  english: string;
  comment: string;
  kind: BranchItemKind;
};

function readingInstruction(language: AnkiLanguage) {
  if (language === "Thai") return `"reading": its romanization. ${thaiRomanizationStyle}`;
  if (language === "Japanese") return `"reading": its hiragana reading.`;
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

export function describeSelectionPrompt(selection: string, analysis: string, language: AnkiLanguage) {
  return [
    `A learner selected this text from a ${language} language-learning analysis: "${selection}".`,
    `Identify the ${language} word, phrase, or sentence they selected (drop any romanization, translation, or punctuation around it) and describe it as a flashcard item. Use what the analysis says about it where it can; otherwise describe it yourself.`,
    "Return one JSON object with these fields:",
    itemFields(language),
    `"kind": "example", "related", or "register", whichever fits best.`,
    "Reply with the JSON object only.",
    "Analysis:",
    analysis,
  ].join("\n\n");
}
