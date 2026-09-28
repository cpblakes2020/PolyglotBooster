import { createWorker } from "tesseract.js";
import type { Language } from "@/lib/types";

const languageCodes: Record<Language, string> = {
  English: "eng",
  Japanese: "jpn",
  Thai: "tha",
  Indonesian: "ind",
  Spanish: "spa",
  French: "fra",
  Mandarin: "chi_sim",
};

// Languages not written in Latin script. Study material for these often
// mixes in a romanization or an English translation, which the language's
// own model can't read, so English is loaded alongside it.
const nonLatinLanguages = new Set<Language>(["Japanese", "Thai", "Mandarin"]);

export type OcrResult = { text: string; confidence: number };

const minUsableLength = 3;
const minUsableConfidence = 40;

export function isUsableOcrResult(result: OcrResult): boolean {
  return result.text.length >= minUsableLength && result.confidence >= minUsableConfidence;
}

// Tesseract writes Thai ำ (sara am) as two characters, nikhahit + sara aa,
// which looks the same but doesn't match stored text or read aloud correctly.
function normalizeScript(text: string) {
  return text.replace(/ํา/g, "ำ");
}

export async function recognizeImageText(file: File, language: Language): Promise<OcrResult> {
  const code = languageCodes[language] || "eng";
  const worker = await createWorker(nonLatinLanguages.has(language) ? `${code}+eng` : code);
  try {
    const { data } = await worker.recognize(file);
    return { text: normalizeScript(data.text.trim()), confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
