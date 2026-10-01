import * as OpenCC from "opencc-js";

// Character-form conversions between Simplified Chinese, Traditional Chinese
// (Taiwan standard) and Japanese kanji (shinjitai), via OpenCC's
// dictionaries. They map how characters are written, not vocabulary — 飞机
// becomes 飛機 even though the Japanese word for airplane is 飛行機.
const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });
const toSimplified = OpenCC.Converter({ from: "tw", to: "cn" });
const simplifiedToJapanese = OpenCC.Converter({ from: "cn", to: "jp" });
const japaneseToSimplified = OpenCC.Converter({ from: "jp", to: "cn" });

// Extra reading lines for Mandarin text: the other Chinese script (so text
// from Taiwan or Hong Kong is usable too) and the Japanese kanji form, each
// only when it differs from what's shown.
export function mandarinVariantLines(text: string) {
  const simplified = toSimplified(text);
  const traditional = toTraditional(simplified);
  const japanese = simplifiedToJapanese(simplified);
  const lines: string[] = [];
  if (simplified !== text) lines.push(`Simplified: ${simplified}`);
  else if (traditional !== text) lines.push(`Traditional: ${traditional}`);
  // Only for words and set phrases (four characters or fewer, like chengyu):
  // for a sentence the "Japanese" form would just be Chinese grammar in
  // Japanese character shapes.
  const isTerm = text.length <= 4 && !/[，。？！、,.?!\s]/.test(text);
  if (isTerm && japanese !== simplified && japanese !== traditional) lines.push(`Japanese kanji: ${japanese}`);
  return lines;
}

// For Japanese text on a note that's also studied in Mandarin: the same
// characters in Simplified Chinese, when they differ.
export function japaneseChineseLine(text: string) {
  const simplified = japaneseToSimplified(text);
  return simplified !== text ? `Simplified Chinese: ${simplified}` : "";
}
