// PolyglotBooster server calls used by the Anki page.

import type { AnkiLanguage } from "@/lib/anki/vocab";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { LearnerLevel, OutputStyle } from "@/lib/types";

async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Server error (${response.status}). Please try again.`);
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export async function speak(text: string, language: AnkiLanguage) {
  const { data } = await postJson<{ data: string }>("/api/tts", { text, language, delivery: "inline" });
  return data;
}

export type AnalysisOptions = { providerId: LlmProviderId; learnerLevel: LearnerLevel; outputStyle: OutputStyle };

export async function analyze(text: string, language: AnkiLanguage, templateId: string, options: AnalysisOptions) {
  const { result } = await postJson<{ result: string }>("/api/tasks/run", {
    text,
    sourceLanguage: language,
    userLanguage: "English",
    learnerLevel: options.learnerLevel,
    outputStyle: options.outputStyle,
    promptTemplateId: templateId,
  }, { "x-polyglot-provider": options.providerId });
  return result;
}

export async function assist(kind: "reading" | "gloss", text: string, language: AnkiLanguage, providerId: LlmProviderId) {
  const { result } = await postJson<{ result: string }>("/api/anki/assist", { kind, text, language }, { "x-polyglot-provider": providerId });
  return result;
}
