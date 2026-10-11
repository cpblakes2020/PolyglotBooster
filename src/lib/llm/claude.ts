import type { PromptTemplateId, Language, LearnerLevel, OutputStyle } from "@/lib/types";
import { buildStudyPrompt } from "@/lib/prompts/buildPrompt";
import { transcriptionPrompt } from "@/lib/llm/transcribe";

const anthropicEndpoint = "https://api.anthropic.com/v1/messages";
const anthropicVersion = "2023-06-01";

type ClaudeInput = {
  text: string;
  sourceLanguage: Language;
  userLanguage: Language;
  learnerLevel: LearnerLevel;
  outputStyle: OutputStyle;
  promptTemplateId: PromptTemplateId;
  maxOutputTokens?: number;
};

type ClaudeResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

function getResponseText(result: ClaudeResponse) {
  return result.content?.filter((block) => block.type === "text").map((block) => block.text || "").join("\n").trim();
}

async function sendClaudeMessage(content: unknown, apiKey: string | undefined, maxTokens: number, missingKeyMessage: string, failureMessage: string, emptyMessage: string, model?: string) {
  if (!apiKey) throw new Error(missingKeyMessage);
  const response = await fetch(anthropicEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": anthropicVersion,
    },
    body: JSON.stringify({
      model: model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });

  const result = await response.json() as ClaudeResponse & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || failureMessage);

  const text = getResponseText(result);
  if (!text) throw new Error(emptyMessage);
  return text;
}

export async function runClaudeTask(input: ClaudeInput, apiKey?: string) {
  const prompt = await buildStudyPrompt(input);
  return sendClaudeMessage(prompt, apiKey, input.maxOutputTokens ?? 8192, "Add your Anthropic API key before running a task.", "Claude could not complete the task.", "Claude returned an empty result.");
}

// model: overrides the app's default model for this one prompt.
export async function runClaudeRawPrompt(prompt: string, apiKey?: string, model?: string) {
  return sendClaudeMessage(prompt, apiKey, 8192, "Add your Anthropic API key before running a task.", "Claude could not complete the task.", "Claude returned an empty result.", model);
}

export async function extractTextWithClaude(source: Buffer, mimeType: string, apiKey?: string, language?: Language) {
  const sourceType = mimeType === "application/pdf" ? "document" : "image";
  const content = [
    { type: sourceType, source: { type: "base64", media_type: mimeType, data: source.toString("base64") } },
    { type: "text", text: transcriptionPrompt(language) },
  ];
  return sendClaudeMessage(content, apiKey, 8192, "Add your Anthropic API key before extracting text with Claude.", "Claude could not extract text from this document.", "Claude returned no readable text.");
}
