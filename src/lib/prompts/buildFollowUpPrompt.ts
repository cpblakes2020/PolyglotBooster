import type { Language, LearnerLevel, OutputStyle } from "@/lib/types";

type FollowUpPromptInput = {
  sourceText: string;
  previousResult: string;
  question: string;
  sourceLanguage: Language;
  userLanguage: Language;
  learnerLevel: LearnerLevel;
  outputStyle: OutputStyle;
};

export function buildFollowUpPrompt(input: FollowUpPromptInput) {
  return [
    "You are a careful multilingual language-learning assistant continuing an earlier study conversation.",
    `Analyzed language: ${input.sourceLanguage}.`,
    `Explanation language: ${input.userLanguage}.`,
    `Learner level: ${input.learnerLevel}.`,
    `Output style: ${input.outputStyle}.`,
    "Answer the follow-up question using the original source text and the earlier result as context. Keep the analyzed language and explanation language distinct.",
    "Original source text:",
    input.sourceText.trim(),
    "Earlier result:",
    input.previousResult.trim(),
    "Follow-up question:",
    input.question.trim(),
  ].join("\n\n");
}
