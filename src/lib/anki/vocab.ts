import type { Language } from "@/lib/types";

// The shared Anki note type every language pair lives in. See
// Docs/polyglotbooster-anki-structure.md for how its fields and card
// templates are wired.
export const ankiNoteType = "Polyglot Vocab";

// Languages that have fields in Polyglot Vocab. Spanish, French and Mandarin
// are supported elsewhere in PolyglotBooster but hidden from the Anki
// features until their fields exist in the note type — add them here then.
// Balinese has fields but is intentionally never touched by PolyglotBooster.
export const ankiLanguages = ["English", "Indonesian", "Thai", "Japanese"] as const satisfies readonly Language[];
export type AnkiLanguage = typeof ankiLanguages[number];

// Languages that get recorded audio. English is left out on purpose: Anki
// autoplays every sound on a card side, and English is only the prompt, so
// hearing it in every normal review isn't wanted.
export const audioLanguages = ankiLanguages.filter((language) => language !== "English");

// Languages whose Notes field gets a reading line (romanization or kana)
// above the analysis.
export const readingLanguages: ReadonlySet<AnkiLanguage> = new Set(["Thai", "Japanese"]);

export function isAnkiLanguage(value: string): value is AnkiLanguage {
  return (ankiLanguages as readonly string[]).includes(value);
}

export function audioField(language: AnkiLanguage) {
  return `Audio_${language}`;
}

export function notesField(language: AnkiLanguage) {
  return `Notes_${language}`;
}

function tagSlug(language: AnkiLanguage) {
  return language.toLowerCase();
}

export const pbTags = {
  analyzed: (language: AnkiLanguage, templateId: string) => `pb::analyzed::${tagSlug(language)}::${templateId}`,
  analyzedPrefix: (language: AnkiLanguage) => `pb::analyzed::${tagSlug(language)}`,
  audio: (language: AnkiLanguage) => `pb::audio::${tagSlug(language)}`,
  skip: (language: AnkiLanguage) => `pb::skip::${tagSlug(language)}`,
};

export function wordTemplateId(language: AnkiLanguage) {
  return `word-analysis-${tagSlug(language)}`;
}

export function sentenceTemplateId(language: AnkiLanguage) {
  return `sentence-guide-${tagSlug(language)}`;
}

// Replacement recordings get a version suffix: a new filename changes the
// note's field, so the new clip reliably syncs to other devices instead of
// a cached copy of the old file being played.
export function audioFilename(noteId: number, language: AnkiLanguage, version?: string) {
  return `pb-${noteId}-${tagSlug(language)}${version ? `-${version}` : ""}.mp3`;
}

export type VocabNote = {
  noteId: number;
  tags: string[];
  fields: Record<string, string>;
};

// The note's analysis language: the first language named in Origin (e.g.
// "Indonesian Thai" -> Indonesian) when that field is filled, otherwise the
// first filled non-English language.
export function analysisLanguage(note: VocabNote): AnkiLanguage | undefined {
  const fromOrigin = (note.fields.Origin || "").split(/\s+/).find((word) => isAnkiLanguage(word) && note.fields[word]?.trim());
  if (fromOrigin) return fromOrigin as AnkiLanguage;
  return ankiLanguages.find((language) => language !== "English" && note.fields[language]?.trim());
}
