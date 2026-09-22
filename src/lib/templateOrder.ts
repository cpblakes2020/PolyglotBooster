import type { Language, PromptTemplate } from "@/lib/types";

// These languages read more naturally sentence-first; every other language keeps word-first.
const sentenceFirstLanguages = new Set<Language>(["Japanese", "Thai"]);

function templateRank(template: PromptTemplate, sourceLanguage: Language): number {
  const isWordAnalysis = template.id.startsWith("word-analysis");
  const isSentenceGuide = template.id.startsWith("sentence-guide");
  if (sentenceFirstLanguages.has(sourceLanguage)) {
    if (isSentenceGuide) return 0;
    if (isWordAnalysis) return 1;
    return 2;
  }
  if (isWordAnalysis) return 0;
  if (isSentenceGuide) return 1;
  return 2;
}

export function visibleTemplatesFor(templates: PromptTemplate[], sourceLanguage: Language): PromptTemplate[] {
  return templates
    .filter((template) => template.scope === "general" || template.scope === sourceLanguage)
    .slice()
    .sort((a, b) => templateRank(a, sourceLanguage) - templateRank(b, sourceLanguage));
}
