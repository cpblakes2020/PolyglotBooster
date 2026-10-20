import { customTaskId, maxCustomInstructionLength, maxGeneralInstructionsLength, type BuildPromptInput } from "@/lib/prompts/buildPrompt";
import { isSupportedLanguage } from "@/lib/presets";
import { getTemplate } from "@/lib/storage/templates";
import type { LearnerLevel, OutputStyle } from "@/lib/types";

const learnerLevels = new Set<LearnerLevel>(["Beginner", "Intermediate", "Advanced"]);
const outputStyles = new Set<OutputStyle>(["Concise", "Detailed", "Literal", "Natural", "Formal", "Informal"]);

// A study task as the study desk sends it (to run it, or to preview its
// prompt), checked: the text, languages, level, style, and the task — a
// saved template, or the Custom task with its instructions — plus any
// edited general instructions.
export async function readTaskRequest(body: Record<string, unknown> | null): Promise<{ input: BuildPromptInput } | { error: string }> {
  const text = body?.text;
  const sourceLanguage = body?.sourceLanguage;
  const userLanguage = body?.userLanguage;
  const learnerLevel = body?.learnerLevel;
  const outputStyle = body?.outputStyle;
  const promptTemplateId = body?.promptTemplateId;
  const customInstruction = body?.customInstruction;
  const generalInstructions = body?.generalInstructions;

  if (typeof text !== "string" || !text.trim() || text.length > 12000) return { error: "Enter between 1 and 12,000 characters of source text." };
  if (typeof sourceLanguage !== "string" || !isSupportedLanguage(sourceLanguage) || typeof userLanguage !== "string" || !isSupportedLanguage(userLanguage)) {
    return { error: "Choose supported source and explanation languages." };
  }
  if (typeof learnerLevel !== "string" || !learnerLevels.has(learnerLevel as LearnerLevel) || typeof outputStyle !== "string" || !outputStyles.has(outputStyle as OutputStyle)) {
    return { error: "Choose a supported learner level and output style." };
  }
  if (typeof promptTemplateId !== "string" || !promptTemplateId) return { error: "Choose a supported prompt template." };
  if (promptTemplateId === customTaskId) {
    if (typeof customInstruction !== "string" || !customInstruction.trim()) return { error: "Type the custom task's instructions first." };
    if (customInstruction.length > maxCustomInstructionLength) return { error: `Keep the custom task's instructions to ${maxCustomInstructionLength.toLocaleString()} characters.` };
  } else if (!(await getTemplate(promptTemplateId))) {
    return { error: "Choose a supported prompt template." };
  }
  if (generalInstructions !== undefined && generalInstructions !== null && (typeof generalInstructions !== "string" || generalInstructions.length > maxGeneralInstructionsLength)) {
    return { error: `Keep the general instructions to ${maxGeneralInstructionsLength.toLocaleString()} characters.` };
  }

  return {
    input: {
      text,
      sourceLanguage,
      userLanguage,
      learnerLevel: learnerLevel as LearnerLevel,
      outputStyle: outputStyle as OutputStyle,
      promptTemplateId,
      ...(promptTemplateId === customTaskId ? { customInstruction: (customInstruction as string).trim() } : {}),
      ...(typeof generalInstructions === "string" && generalInstructions.trim() ? { generalInstructions: generalInstructions.trim() } : {}),
    },
  };
}
