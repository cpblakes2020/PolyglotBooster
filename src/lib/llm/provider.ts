import { extractTextWithClaude, runClaudeRawPrompt, runClaudeTask } from "@/lib/llm/claude";
import { extractTextWithOpenAi, runOpenAiRawPrompt, runOpenAiTask } from "@/lib/llm/openai";
import type { Language, LearnerLevel, OutputStyle, PromptTemplateId } from "@/lib/types";

export type LlmProviderId = "anthropic" | "openai";

export const llmProviderOptions: ReadonlyArray<{ id: LlmProviderId; label: string }> = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
];

export type LlmTaskInput = {
  text: string;
  sourceLanguage: Language;
  userLanguage: Language;
  learnerLevel: LearnerLevel;
  outputStyle: OutputStyle;
  promptTemplateId: PromptTemplateId;
};

export type LlmProvider = {
  runTask: (input: LlmTaskInput, apiKey?: string) => Promise<string>;
  runRawPrompt?: (prompt: string, apiKey?: string) => Promise<string>;
  extractText?: (source: Buffer, mimeType: string, apiKey?: string) => Promise<string>;
};

const providers: Record<LlmProviderId, LlmProvider> = {
  anthropic: {
    runTask: runClaudeTask,
    runRawPrompt: runClaudeRawPrompt,
    extractText: extractTextWithClaude,
  },
  openai: {
    runTask: runOpenAiTask,
    runRawPrompt: runOpenAiRawPrompt,
    extractText: extractTextWithOpenAi,
  },
};

export function getLlmProvider(providerId: LlmProviderId) {
  return providers[providerId];
}

export function getRequestProvider(request: Request): LlmProviderId {
  const provider = request.headers.get("x-polyglot-provider");
  if (provider === "anthropic" || provider === "openai") return provider;
  throw new Error("Choose Anthropic or OpenAI.");
}