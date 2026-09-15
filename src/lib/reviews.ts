import type { Flashcard } from "@/lib/flashcards";
import type { Language, LearnerLevel, OutputStyle, PromptTemplateId } from "@/lib/types";

export type FollowUpExchange = {
  question: string;
  answer: string;
  createdAt: string;
};

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
  notes: string;
  createdAt: string;
};
