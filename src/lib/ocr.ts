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

export type OcrResult = { text: string; confidence: number };

const minUsableLength = 3;
const minUsableConfidence = 40;

export function isUsableOcrResult(result: OcrResult): boolean {
  return result.text.length >= minUsableLength && result.confidence >= minUsableConfidence;
}

export async function recognizeImageText(file: File, language: Language): Promise<OcrResult> {
  const worker = await createWorker(languageCodes[language] || "eng");
  try {
    const { data } = await worker.recognize(file);
    return { text: data.text.trim(), confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
