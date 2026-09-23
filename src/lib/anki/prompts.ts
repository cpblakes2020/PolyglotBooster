import type { AnkiLanguage } from "@/lib/anki/vocab";

// The one Thai romanization style used everywhere in the Anki notes,
// modeled on "thêe dâi rúu jàk". Edit here to change it everywhere.
export const thaiRomanizationStyle = `Romanize in this exact style (example: ยินดีที่ได้รู้จัก -> "yin dee thêe dâi rúu jàk"; สบายดีไหม -> "sà-baai dee mǎi"; ลาก่อน -> "laa gàwn"):
- Tones as diacritics on the vowel: mid unmarked, low à, falling â, high á, rising ǎ.
- Consonants: ก g, ข/ค kh, จ j, ฉ/ช ch, ด d, ต dt, ถ/ท th, บ b, ป bp, ผ/พ ph, ฟ f, ง ng, ย y, ว w, ร r, ล l, ส/ซ s, ห h, อ (silent). Final stops as k, t, p.
- Vowels in English-friendly spelling, long vowels doubled: short/long i = i/ee, u = u/uu, a = a/aa, e = e/ay, ɛ = ae/aae, ɔ = aw/aw, o = o/oh, ɯ = eu/euu, ɤ = er/er, ia = ia, ua = ua, ai = ai, ao = ao, aai = aai, oi = oi.
- Hyphens between the syllables of one word, spaces between words. All lowercase.`;

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
