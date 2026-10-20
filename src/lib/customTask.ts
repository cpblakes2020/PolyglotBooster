// The study desk's "Custom task": no saved template — the instructions are
// typed in for the run. Shared by the browser and the server.
export const customTaskId = "custom";
export const customTaskName = "Custom task";
export const maxCustomInstructionLength = 6000;
export const maxGeneralInstructionsLength = 8000;

// Preview prompt's four parts, as sent.
export type PromptParts = { general: string; generalEdited: boolean; task: string; reference: string; source: string };
