// PolyglotBooster server calls used by the Anki page.

import { selectedItemText } from "@/lib/anki/fields";
import type { BranchItem, BranchItemKind } from "@/lib/anki/prompts";
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

const itemKinds = new Set<BranchItemKind>(["example", "related", "register"]);

function toBranchItem(value: unknown): BranchItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const field = (key: string) => typeof item[key] === "string" ? (item[key] as string).trim() : "";
  if (!field("text")) return null;
  return {
    text: field("text"),
    reading: field("reading"),
    english: field("english"),
    comment: field("comment"),
    kind: itemKinds.has(item.kind as BranchItemKind) ? item.kind as BranchItemKind : "example",
  };
}

// The learnable items (examples, related words, register versions) in an analysis.
export async function extractItems(analysis: string, parentText: string, language: AnkiLanguage, providerId: LlmProviderId) {
  const { result } = await postJson<{ result: unknown }>("/api/anki/assist", { kind: "extract", text: analysis, context: parentText, language }, { "x-polyglot-provider": providerId });
  const items = (Array.isArray(result) ? result : []).map(toBranchItem).filter((item): item is BranchItem => item !== null);
  // The same item can come up in several sections of one analysis.
  return items.filter((item, index) => items.findIndex((other) => other.text === item.text) === index);
}

// One item the learner selected in an analysis.
export async function describeSelection(selection: string, analysis: string, language: AnkiLanguage, providerId: LlmProviderId) {
  const text = selectedItemText(selection, language);
  if (!text) throw new Error(`The selection doesn't contain any ${language} text.`);
  const { result } = await postJson<{ result: unknown }>("/api/anki/assist", { kind: "describe", text, context: analysis, language }, { "x-polyglot-provider": providerId });
  const item = toBranchItem(result);
  if (!item) throw new Error("The selection couldn't be turned into a flashcard item.");
  // The item is what was selected, whatever the model thought was meant.
  return { ...item, text };
}
