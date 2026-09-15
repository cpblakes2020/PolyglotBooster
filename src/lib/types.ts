export type Language =
  | "Japanese"
  | "Thai"
  | "Indonesian"
  | "Spanish"
  | "English"
  | "French"
  | "Mandarin";

export type OutputStyle = "Concise" | "Detailed" | "Literal" | "Natural" | "Formal" | "Informal";
export type LearnerLevel = "Beginner" | "Intermediate" | "Advanced";
export type PromptTemplateId = string;
export type TemplateScope = "general" | Language;

export interface PromptTemplate {
  id: PromptTemplateId;
  name: string;
  description: string;
  instruction: string;
  scope: TemplateScope;
  icon?: string;
  updatedAt: string;
}

