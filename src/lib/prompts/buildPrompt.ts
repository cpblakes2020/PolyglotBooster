import { getTemplate } from "@/lib/storage/templates";
import type { Language, LearnerLevel, OutputStyle, PromptTemplateId } from "@/lib/types";

type BuildPromptInput = {
  text: string;
  sourceLanguage: Language;
  userLanguage: Language;
  learnerLevel: LearnerLevel;
  outputStyle: OutputStyle;
  promptTemplateId: PromptTemplateId;
};

export async function buildStudyPrompt(input: BuildPromptInput) {
  const template = await getTemplate(input.promptTemplateId);
  if (!template) throw new Error("Unsupported prompt template.");

  return [
    "You are a careful multilingual language-learning assistant.",
    `Analyzed language: ${input.sourceLanguage}.`,
    `Explanation language: ${input.userLanguage}.`,
    `Learner level: ${input.learnerLevel}.`,
    `Output style: ${input.outputStyle}.`,
    "Follow the requested task and keep the analyzed language and explanation language distinct. Label each language clearly.",
    "When you introduce any term in the analyzed language — a synonym, a related word, an alternate phrasing — give it in that language's native script (plus a phonetic reading if the script doesn't make pronunciation obvious), not just a description in the explanation language.",
    "Match the depth and thoroughness of your response to the requested output style: under a concise style, prioritize the most essential points from the task instructions over exhaustive coverage.",
    `Task: ${template.instruction}`,
    "Source text:",
    input.text.trim(),
  ].join("\n\n");
}
