import type { Language } from "@/lib/types";

export const languages: readonly Language[] = [
  "Japanese",
  "Mandarin",
  "Thai",
  "Indonesian",
  "Spanish",
  "English",
  "French",
];

export function prioritizeLanguage(selectedLanguage: Language) {
  return [
    selectedLanguage,
    ...languages.filter((language) => language !== selectedLanguage),
  ];
}
