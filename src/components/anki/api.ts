// PolyglotBooster server calls used by the Anki page.

import { selectedItemText } from "@/lib/anki/fields";
import type { BranchItem, BranchItemKind, FollowUpExchange } from "@/lib/anki/prompts";
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

// Thai is respelled the way it sounds before recording (see
// spokenSpelling.ts); reading, the note's romanization, guides that.
export async function speak(text: string, language: AnkiLanguage, reading?: string) {
  const { data } = await postJson<{ data: string }>("/api/tts", { text, language, delivery: "inline", respell: true, reading });
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

// context "chinese": for a Japanese reading on a note also studied in
// Mandarin, add the Simplified Chinese form of the characters.
export async function assist(kind: "reading" | "gloss" | "translate", text: string, language: AnkiLanguage, providerId: LlmProviderId, context?: "chinese") {
  const { result } = await postJson<{ result: string }>("/api/anki/assist", { kind, text, language, context }, { "x-polyglot-provider": providerId });
  return result;
}

// A follow-up question about a note, answered with its analysis and the
// earlier questions in the thread as context.
export async function askFollowUp(question: string, item: { text: string; english: string; analysis: string }, earlier: FollowUpExchange[], language: AnkiLanguage, options: AnalysisOptions) {
  const { result } = await postJson<{ result: string }>("/api/anki/assist", {
    kind: "followup",
    text: question,
    context: item.analysis,
    item: item.text,
    english: item.english,
    thread: earlier,
    language,
    learnerLevel: options.learnerLevel,
    outputStyle: options.outputStyle,
  }, { "x-polyglot-provider": options.providerId });
  return result;
}

// The "Save for Anki later" list, kept in your account so phrases can be
// saved on any device. Pages showing it listen for this event to refresh.
export const laterChangedEvent = "pb-later-changed";

export type LaterItem = { id: string; text: string; language: string; context: string; source: string; createdAt: string };

async function laterRequest(method: "GET" | "POST" | "DELETE", body?: unknown) {
  const response = await fetch("/api/anki/later", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as { items?: LaterItem[]; error?: string };
  if (!response.ok || !data.items) throw new Error(data.error || `Request failed (${response.status}).`);
  if (method !== "GET") window.dispatchEvent(new Event(laterChangedEvent));
  return data.items;
}

export const laterList = () => laterRequest("GET");

export function saveForLater(text: string, language: AnkiLanguage, context: string, source: string) {
  const cleaned = selectedItemText(text, language);
  if (!cleaned) throw new Error(`The selection doesn't contain any ${language} text.`);
  return laterRequest("POST", { text: cleaned, language, context, source });
}

export const deleteLater = (ids: string[]) => laterRequest("DELETE", { ids });

const itemKinds = new Set<BranchItemKind>(["example", "related", "register", "vocabulary", "sentence"]);

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
    explanation: field("explanation"),
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
