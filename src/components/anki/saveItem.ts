// Saving one branch/flashcard item to Anki, shared by the item editor (one
// at a time, after review) and "Add all" in the branch queue (defaults).

import { speak } from "@/components/anki/api";
import type { ItemKind } from "@/lib/anki/classify";
import { anki } from "@/lib/anki/connect";
import { appendToField, branchNoteBlock, composeNotesField, escapeHtml, markdownToAnkiHtml, readingHtml } from "@/lib/anki/fields";
import { audioField, audioFilename, notesField, pbTags, readingLanguages, sentenceTemplateId, wordTemplateId, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";

export type ItemOutcome = { kind: "added"; note: VocabNote } | { kind: "commented" } | { kind: "skipped" };

export type ItemDraft = {
  language: AnkiLanguage;
  text: string;
  english: string;
  reading: string;
  // Brief explanations: in English (the English note) and in the item's own
  // language (its notes field, with the "Seen in" line).
  comment: string;
  explanation: string;
  // Where the item was seen, for the back-reference line.
  seenIn: string;
  // An existing note with exactly this text, if any.
  match: VocabNote | null;
  // "existing": append the comment to the match; "new": add a note.
  target: "new" | "existing";
  analysis: string;
  kind: ItemKind;
  tags: string[];
};

// The language's Notes field the item will be saved with: its reading, the
// explanation in that language and the "Seen in" line (and any analysis).
export function itemNotesHtml(draft: ItemDraft) {
  const { language, text, reading, explanation, seenIn, match, target, analysis } = draft;
  const block = branchNoteBlock(explanation, seenIn);
  if (target === "existing" && match) return appendToField(match.fields[notesField(language)] || "", block);
  return composeNotesField(block, readingLanguages.has(language) ? readingHtml(reading, language, text) : "", markdownToAnkiHtml(analysis));
}

// The English note the item will be saved with: the English explanation,
// added after anything an existing note already has there.
export function itemEnglishNoteHtml(draft: ItemDraft) {
  const comment = escapeHtml(draft.comment.trim());
  const existing = draft.target === "existing" && draft.match ? (draft.match.fields[notesField("English")] || "").trim() : "";
  if (!comment) return existing;
  return existing ? `${existing}<br>${comment}` : comment;
}

export async function saveItem(draft: ItemDraft, onProgress: (message: string) => void = () => {}): Promise<{ outcome: ItemOutcome; audioFailed: boolean }> {
  const { language, text, english, match, target, analysis, kind, tags: extraTags } = draft;
  const notes = itemNotesHtml(draft);
  const englishNote = itemEnglishNoteHtml(draft);

  if (target === "existing" && match) {
    await anki.updateFields(match.noteId, { [notesField(language)]: notes, ...(draft.comment.trim() ? { [notesField("English")]: englishNote } : {}) });
    if (extraTags.length) await anki.addTags([match.noteId], extraTags);
    return { outcome: { kind: "commented" }, audioFailed: false };
  }

  if (!text.trim() || !english.trim()) throw new Error(`Fill in the ${language} and the English — every card pairs the two.`);
  const fields = { English: escapeHtml(english.trim()), [language]: escapeHtml(text.trim()), [notesField(language)]: notes, ...(englishNote ? { [notesField("English")]: englishNote } : {}), Origin: language };
  const tags = [pbTags.branch, ...(analysis.trim() ? [pbTags.analyzed(language, kind === "word" ? wordTemplateId(language) : sentenceTemplateId(language))] : []), ...extraTags];
  const noteId = await anki.addNote(language, fields, tags);

  // The note exists now, so an audio failure mustn't lead to a second save
  // (a duplicate note); Bulk audio fills in anything missed.
  let audioFailed = false;
  try {
    onProgress(`Recording ${language} audio...`);
    const filename = await anki.storeMedia(audioFilename(noteId, language), await speak(text.trim(), language, draft.reading));
    await anki.updateFields(noteId, { [audioField(language)]: `[sound:${filename}]` });
    await anki.addTags([noteId], [pbTags.audio(language)]);
  } catch {
    audioFailed = true;
  }
  return { outcome: { kind: "added", note: { noteId, tags, fields } }, audioFailed };
}
