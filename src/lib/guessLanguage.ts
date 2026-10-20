import type { AnkiLanguage } from "@/lib/anki/vocab";

// A first guess at which learning language a piece of text is in, from its
// script: Thai and Japanese kana are certain; Chinese characters alone could
// be Japanese or Mandarin, and Latin text Indonesian, Spanish or French, so
// those keep the language used last when it fits (accents hint at Spanish
// or French).
export function guessLanguage(text: string, last?: AnkiLanguage): AnkiLanguage {
  if (/\p{Script=Thai}/u.test(text)) return "Thai";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "Japanese";
  if (/\p{Script=Han}/u.test(text)) return last === "Mandarin" || last === "Japanese" ? last : "Japanese";
  if (/[ñ¿¡]/i.test(text)) return "Spanish";
  if (/[àâçèêëîïôûùœ]/i.test(text)) return "French";
  return last === "Indonesian" || last === "Spanish" || last === "French" ? last : "Indonesian";
}
