import { languages } from "@/lib/languages";
import type { Language } from "@/lib/types";

export function isSupportedLanguage(value: string): value is Language {
  return languages.includes(value as Language);
}
