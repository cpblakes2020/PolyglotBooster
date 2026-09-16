import type { Flashcard } from "@/lib/flashcards";
import type { Language, LearnerLevel, OutputStyle, PromptTemplateId } from "@/lib/types";

export type FollowUpExchange = {
  question: string;
  answer: string;
  createdAt: string;
};

export type SavedAudio = {
  url: string;
  voice: string;
  createdAt: string;
};

export function readSavedAudio(value: unknown): SavedAudio | undefined {
  if (!value || typeof value !== "object") return undefined;
  const audio = value as { url?: unknown; voice?: unknown; createdAt?: unknown };
  if (typeof audio.url !== "string" || !audio.url || typeof audio.voice !== "string" || !audio.voice || typeof audio.createdAt !== "string" || !audio.createdAt) {
    return undefined;
  }
  return { url: audio.url, voice: audio.voice, createdAt: audio.createdAt };
}

export type SavedTaskRun = {
  taskRunId: string;
  sourceText: string;
  sourceLanguage: Language;
  userLanguage: Language;
  learnerLevel: LearnerLevel;
  outputStyle: OutputStyle;
  promptTemplateId: PromptTemplateId;
  result: string;
  flashcards?: Flashcard[];
  followUps?: FollowUpExchange[];
  audio?: SavedAudio;
  notes: string;
  createdAt: string;
};
