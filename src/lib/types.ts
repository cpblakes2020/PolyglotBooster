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

export interface StudyContext {
  sourceLanguage: Language;
  userLanguage: Language;
  targetOutputLanguage: Language;
  comparisonLanguage?: Language;
  learnerLevel: LearnerLevel;
  outputStyle: OutputStyle;
  selectedModel?: string;
}

export interface LanguagePairPreset {
  id: string;
  label: string;
  sourceLanguage: Language;
  userLanguage: Language;
  description: string;
}

export interface UserProfile {
  userId: string;
  nativeLanguages: Language[];
  proficientLanguages: Language[];
  studyLanguages: Language[];
  preferredUserLanguage: Language;
}

export interface TextInputSession {
  textInputId: string;
  rawInputText: string;
  detectedLanguage?: Language;
  sourceLanguageConfirmed: boolean;
  createdAt: string;
}
