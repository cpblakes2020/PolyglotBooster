// Cheap word-vs-sentence guess used to pick the default analysis template
// for a note. The review screen always lets you switch to the other one and
// flags uncertain guesses.

export type ItemKind = "word" | "sentence";
export type Classification = { kind: ItemKind; certain: boolean; reason: string };

const thaiSentenceParticles = /(ครับ|ค่ะ|คะ|นะ|ไหม|มั้ย|หรือเปล่า|หรือยัง|จ้ะ|จ๊ะ|จ้า|ล่ะ|เถอะ|สิ|หรอ|เหรอ|แล้ว)$/;
const thaiClauseWords = /(ที่|ว่า|ถ้า|เพราะ|แต่|และ|หรือ|ไม่|จะ|ได้|กำลัง|เคย|ต้อง|อยาก)/;
const japaneseSentenceMarkers = /[。？！?!]|(です|ます|ました|ません|でした|ください|ですか|ますか)$|[はがをにでへとも](?=[぀-ヿ一-鿿])/;
const latinSentenceEnd = /[.?!]$/;

export function classifyItem(text: string, language: string): Classification {
  const trimmed = text.trim();

  if (language === "Thai") {
    const compact = trimmed.replace(/\s+/g, "");
    if (thaiSentenceParticles.test(compact)) return { kind: "sentence", certain: true, reason: "ends with a sentence particle" };
    if (compact.length >= 20) return { kind: "sentence", certain: true, reason: "long phrase" };
    if (compact.length <= 8 && !/\s/.test(trimmed)) return { kind: "word", certain: true, reason: "short single term" };
    if (thaiClauseWords.test(compact)) return { kind: "sentence", certain: false, reason: "contains a verb or clause word" };
    return { kind: "word", certain: false, reason: "short phrase with no sentence markers" };
  }

  if (language === "Japanese") {
    if (japaneseSentenceMarkers.test(trimmed)) return { kind: "sentence", certain: true, reason: "has sentence punctuation, a polite ending, or particles" };
    if (trimmed.length <= 8) return { kind: "word", certain: true, reason: "short term with no particles" };
    return { kind: "word", certain: false, reason: "long compound with no particles" };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (latinSentenceEnd.test(trimmed) && words.length >= 2) return { kind: "sentence", certain: true, reason: "ends with sentence punctuation" };
  if (words.length <= 2) return { kind: "word", certain: true, reason: `${words.length} word${words.length === 1 ? "" : "s"}` };
  if (words.length >= 5) return { kind: "sentence", certain: true, reason: `${words.length} words` };
  return { kind: words.length >= 4 ? "sentence" : "word", certain: false, reason: `${words.length} words, no punctuation` };
}
