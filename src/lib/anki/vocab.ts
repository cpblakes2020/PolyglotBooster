import type { Language } from "@/lib/types";

// The shared Anki note type every language pair lives in. See
// Docs/polyglotbooster-anki-structure.md for how its fields and card
// templates are wired.
export const ankiNoteType = "Polyglot Vocab";

// Languages with fields in Polyglot Vocab (see noteType.ts). Spanish, French
// and Mandarin were added later, so an older note type may lack them until
// "Add languages" on the Anki page has run. Balinese may have fields from
// before but is intentionally never touched by PolyglotBooster.
export const ankiLanguages = ["English", "Indonesian", "Thai", "Japanese", "Spanish", "French", "Mandarin"] as const satisfies readonly Language[];
export type AnkiLanguage = typeof ankiLanguages[number];

// Languages that get recorded audio. English is left out on purpose: Anki
// autoplays every sound on a card side, and English is only the prompt, so
// hearing it in every normal review isn't wanted.
export const audioLanguages = ankiLanguages.filter((language) => language !== "English");

// Languages whose Notes field gets a reading line (Thai romanization,
// Japanese kana, Mandarin pinyin) above the analysis.
export const readingLanguages: ReadonlySet<AnkiLanguage> = new Set(["Thai", "Japanese", "Mandarin"]);

export function readingLabel(language: AnkiLanguage) {
  return language === "Thai" ? "Romanization" : language === "Mandarin" ? "Pinyin (and other scripts)" : "Reading (hiragana)";
}

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
  // Notes created from an item in another note's analysis. Which note is
  // recorded in a "Seen in" line in the Notes field, not in a tag.
  branch: "pb::branch",
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
