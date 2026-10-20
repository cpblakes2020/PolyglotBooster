import { thaiRomanizationStyle } from "@/lib/anki/prompts";
import { getTemplate } from "@/lib/storage/templates";
import type { Language, LearnerLevel, OutputStyle, PromptTemplateId } from "@/lib/types";

import { customTaskId, type PromptParts } from "@/lib/customTask";

export { customTaskId, maxCustomInstructionLength, maxGeneralInstructionsLength, type PromptParts } from "@/lib/customTask";

export type BuildPromptInput = {
  text: string;
  sourceLanguage: Language;
  userLanguage: Language;
  learnerLevel: LearnerLevel;
  outputStyle: OutputStyle;
  promptTemplateId: PromptTemplateId;
  // Curated dictionary entries for the source text (e.g. JMdict), given to
  // the model as the authority for readings and core meanings.
  reference?: string;
  // The Custom task's instructions.
  customInstruction?: string;
  // Edited general instructions for this run, used instead of the standard
  // ones (generalInstructions below).
  generalInstructions?: string;
};

const referenceIntro = "Dictionary reference — curated entries from JMdict and KANJIDIC2 (Electronic Dictionary Research and Development Group). Treat them as the authority: use these readings, and base the core meanings on these senses (you may summarize or reorder them for the learner). Add nuance, usage, register and examples from your own knowledge. If the source text uses the term in a sense the dictionary doesn't list, say so plainly rather than inventing an entry. Don't mention or cite the dictionary unless it helps the learner.";

// The opening of every study prompt — the part that works as a system
// prompt: the assistant's role, the languages, level and style, and the
// general rules.
export function generalInstructions(input: Pick<BuildPromptInput, "sourceLanguage" | "userLanguage" | "learnerLevel" | "outputStyle">) {
  return [
    "You are a careful multilingual language-learning assistant.",
    `Analyzed language: ${input.sourceLanguage}.`,
    `Explanation language: ${input.userLanguage}.`,
    `Learner level: ${input.learnerLevel}.`,
    `Output style: ${input.outputStyle}.`,
    "Follow the requested task and keep the analyzed language and explanation language distinct. Label each language clearly.",
    "When you introduce any term in the analyzed language — a synonym, a related word, an alternate phrasing — give it in that language's native script (plus a phonetic reading if the script doesn't make pronunciation obvious), not just a description in the explanation language.",
    "Match the depth and thoroughness of your response to the requested output style: under a concise style, prioritize the most essential points from the task instructions over exhaustive coverage.",
    // One romanization style for all Thai output, so phonetic lines match the
    // reading line on the user's Anki cards.
    ...(input.sourceLanguage === "Thai" ? [`For every Thai romanization you write: ${thaiRomanizationStyle}`] : []),
  ].join("\n\n");
}

// The prompt in its four parts, as sent: general instructions, the task,
// any dictionary reference, and the source text.
export async function buildPromptParts(input: BuildPromptInput): Promise<PromptParts> {
  let task: string;
  if (input.promptTemplateId === customTaskId) {
    task = input.customInstruction?.trim() || "";
    if (!task) throw new Error("Type the custom task's instructions first.");
  } else {
    const template = await getTemplate(input.promptTemplateId);
    if (!template) throw new Error("Unsupported prompt template.");
    task = template.instruction;
  }
  const edited = input.generalInstructions?.trim();
  return {
    general: edited || generalInstructions(input),
    generalEdited: Boolean(edited),
    task,
    reference: input.reference?.trim() || "",
    source: input.text.trim(),
  };
}

export function joinPromptParts(parts: PromptParts) {
  return [
    parts.general,
    `Task: ${parts.task}`,
    ...(parts.reference ? [referenceIntro, parts.reference] : []),
    "Source text:",
    parts.source,
  ].join("\n\n");
}

export async function buildStudyPrompt(input: BuildPromptInput) {
  return joinPromptParts(await buildPromptParts(input));
}
