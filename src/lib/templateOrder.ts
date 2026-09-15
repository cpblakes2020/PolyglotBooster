import type { Language, PromptTemplate } from "@/lib/types";

function templateRank(template: PromptTemplate): number {
  if (template.id.startsWith("word-analysis")) return 0;
  if (template.id.startsWith("sentence-guide")) return 1;
  return 2;
}

export function visibleTemplatesFor(templates: PromptTemplate[], sourceLanguage: Language): PromptTemplate[] {
  return templates
    .filter((template) => template.scope === "general" || template.scope === sourceLanguage)
    .slice()
    .sort((a, b) => templateRank(a) - templateRank(b));
}
