import { buildStudyPrompt } from "@/lib/prompts/buildPrompt";
import type { LlmTaskInput } from "@/lib/llm/provider";

const openAiEndpoint = "https://api.openai.com/v1/chat/completions";

type OpenAiResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  error?: { message?: string };
};

function getResponseText(result: OpenAiResponse) {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  return content?.map((part) => part.text || "").join("\n").trim();
}

async function sendOpenAiMessage(content: unknown, apiKey: string | undefined, missingKeyMessage: string, failureMessage: string, emptyMessage: string) {
  if (!apiKey) throw new Error(missingKeyMessage);
  const response = await fetch(openAiEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [{ role: "user", content }],
    }),
  });
  const result = await response.json() as OpenAiResponse;
  if (!response.ok) throw new Error(result.error?.message || failureMessage);
  const text = getResponseText(result);
  if (!text) throw new Error(emptyMessage);
  return text;
}

export async function runOpenAiTask(input: LlmTaskInput, apiKey?: string) {
  const prompt = await buildStudyPrompt(input);
  return sendOpenAiMessage(prompt, apiKey, "Add your OpenAI API key before running a task.", "OpenAI could not complete the task.", "OpenAI returned an empty result.");
}

export async function runOpenAiRawPrompt(prompt: string, apiKey?: string) {
  return sendOpenAiMessage(prompt, apiKey, "Add your OpenAI API key before running a task.", "OpenAI could not complete the task.", "OpenAI returned an empty result.");
}

export async function extractTextWithOpenAi(source: Buffer, mimeType: string, apiKey?: string) {
  const content = [
    { type: "text", text: "Transcribe all readable text exactly. Preserve the original script, paragraph breaks, headings, and reading order. Return only the transcription, with no commentary." },
    { type: "image_url", image_url: { url: `data:${mimeType};base64,${source.toString("base64")}`, detail: "high" } },
  ];
  return sendOpenAiMessage(content, apiKey, "Add your OpenAI API key before extracting text from an image.", "OpenAI could not extract text from this image.", "OpenAI returned no readable text.");
}