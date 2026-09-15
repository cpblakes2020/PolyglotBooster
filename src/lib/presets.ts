import { languages } from "@/lib/languages";
import type { Language, LanguagePairPreset } from "@/lib/types";

export const languagePairPresets: readonly LanguagePairPreset[] = [
  {
    id: "thai-indonesian",
    label: "Thai -> Indonesian",
    sourceLanguage: "Thai",
    userLanguage: "Indonesian",
    description: "Study Thai through Indonesian.",
  },
  {
    id: "japanese-thai",
    label: "Japanese -> Thai",
    sourceLanguage: "Japanese",
    userLanguage: "Thai",
    description: "Study Japanese through Thai.",
  },
  {
    id: "japanese-indonesian",
    label: "Japanese -> Indonesian",
    sourceLanguage: "Japanese",
    userLanguage: "Indonesian",
    description: "Study Japanese through Indonesian.",
  },
  {
    id: "spanish-japanese",
    label: "Spanish -> Japanese",
    sourceLanguage: "Spanish",
    userLanguage: "Japanese",
    description: "Study Spanish through Japanese.",
  },
  {
    id: "all-to-english",
    label: "Any language -> English",
    sourceLanguage: "Japanese",
    userLanguage: "English",
    description: "Use English as a fallback explanation language.",
  },
  {
    id: "mandarin-english",
    label: "Mandarin -> English",
    sourceLanguage: "Mandarin",
    userLanguage: "English",
    description: "Study Mandarin through English.",
  },
];

export function getPreset(id: string) {
  return languagePairPresets.find((preset) => preset.id === id);
}

export function isSupportedLanguage(value: string): value is Language {
  return languages.includes(value as Language);
}
