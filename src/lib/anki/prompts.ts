import type { AnkiLanguage } from "@/lib/anki/vocab";

// The one Thai romanization style used everywhere in the Anki notes,
// modeled on "thêe dâi rúu jàk". Edit here to change it everywhere.
export const thaiRomanizationStyle = `Romanize in this exact style (example: ยินดีที่ได้รู้จัก -> "yin dee thêe dâi rúu jàk"; สบายดีไหม -> "sà-baai dee mǎi"; ลาก่อน -> "laa gàwn"):
- Tones as diacritics on the vowel: mid unmarked, low à, falling â, high á, rising ǎ.
- Consonants: ก g, ข/ค kh, จ j, ฉ/ช ch, ด d, ต dt, ถ/ท th, บ b, ป bp, ผ/พ ph, ฟ f, ง ng, ย y, ว w, ร r, ล l, ส/ซ s, ห h, อ (silent). Final stops as k, t, p.
- Romanize the actual spoken pronunciation of each syllable, not the spelling letter by letter. Work syllable by syllable: identify the vowel's length (the ็ mark and short vowel forms make it short), any final consonant or final ว/ย glide, then the tone.
- Plain vowels, short/long: i/ee (ดี dee), u/uu (รู้ rúu), a/aa (มา maa), e/ay (เล็ก lék, เพลง phlayng), ae/aae (แข็ง khǎeng, แดง daaeng), aw/aw (เพราะ phráw, ก่อน gàwn), o/oh (โต๊ะ dtó, โทร thoh), eu/euu (มือ meuu), er/er (เงิน ngern), ia (เรียน rian), ua (ตัว dtua), eua (เรือ reua).
- Vowel + final ว/ย glide: eo (เร็ว reo, เลว leo), aeo (แมว maaeo), iu (หิว hǐu), ao/aao (เขา khǎo, ขาว khǎao), ai/aai (ไป bpai, สบาย sà-baai), awy (ร้อย ráwy, หน่อย nàwy), oy (โดย doy), ui (คุย khui), uay (สวย sǔay), oei (เลย loei).
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
