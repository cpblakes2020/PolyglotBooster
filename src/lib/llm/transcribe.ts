import type { Language } from "@/lib/types";

// Script notes that help the AI reader with fonts that are easy to misread.
const scriptHints: Partial<Record<Language, string>> = {
  Thai: "Signs, packaging and modern print often use a loopless Thai font, whose letters look like Latin letters (e.g. ร like S, ง like J, ษ like u): read them as Thai.",
};

// The instruction for reading a photo or scanned PDF. Naming the language
// the user is studying stops the reader guessing at an unfamiliar script.
export function transcriptionPrompt(language?: Language) {
  return [
    "Transcribe all readable text exactly. Preserve the original script, paragraph breaks, headings, and reading order. Return only the transcription, with no commentary.",
    language ? `The text is mainly ${language}, possibly with some English or romanization. ${scriptHints[language] ?? ""}`.trim() : "",
  ].filter(Boolean).join("\n");
}
