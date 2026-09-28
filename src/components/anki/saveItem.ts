// Saving one branch/flashcard item to Anki, shared by the item editor (one
// at a time, after review) and "Add all" in the branch queue (defaults).

import { speak } from "@/components/anki/api";
import type { ItemKind } from "@/lib/anki/classify";
import { anki } from "@/lib/anki/connect";
import { appendToField, branchNoteBlock, composeNotesField, escapeHtml, japaneseRubyReading, markdownToAnkiHtml } from "@/lib/anki/fields";
import { audioField, audioFilename, notesField, pbTags, readingLanguages, sentenceTemplateId, wordTemplateId, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";

export type ItemOutcome = { kind: "added"; note: VocabNote } | { kind: "commented" } | { kind: "skipped" };

export type ItemDraft = {
  language: AnkiLanguage;
  text: string;
  english: string;
  reading: string;
  comment: string;
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

// The Notes field the item will be saved with.
export function itemNotesHtml(draft: ItemDraft) {
  const { language, text, reading, comment, seenIn, match, target, analysis } = draft;
  const block = branchNoteBlock(comment, seenIn);
  if (target === "existing" && match) return appendToField(match.fields[notesField(language)] || "", block);
  const readingHtml = !readingLanguages.has(language) || !reading.trim() ? ""
    : language === "Japanese" ? japaneseRubyReading(text.trim(), reading.trim()) : escapeHtml(reading.trim());
  return composeNotesField(block, readingHtml, markdownToAnkiHtml(analysis));
}

export async function saveItem(draft: ItemDraft, onProgress: (message: string) => void = () => {}): Promise<{ outcome: ItemOutcome; audioFailed: boolean }> {
  const { language, text, english, match, target, analysis, kind, tags: extraTags } = draft;
  const notes = itemNotesHtml(draft);

  if (target === "existing" && match) {
    await anki.updateFields(match.noteId, { [notesField(language)]: notes });
    if (extraTags.length) await anki.addTags([match.noteId], extraTags);
    return { outcome: { kind: "commented" }, audioFailed: false };
  }

  if (!text.trim() || !english.trim()) throw new Error(`Fill in the ${language} and the English — every card pairs the two.`);
  const fields = { English: escapeHtml(english.trim()), [language]: escapeHtml(text.trim()), [notesField(language)]: notes, Origin: language };
  const tags = [pbTags.branch, ...(analysis.trim() ? [pbTags.analyzed(language, kind === "word" ? wordTemplateId(language) : sentenceTemplateId(language))] : []), ...extraTags];
  const noteId = await anki.addNote(language, fields, tags);

  // The note exists now, so an audio failure mustn't lead to a second save
  // (a duplicate note); Bulk audio fills in anything missed.
  let audioFailed = false;
  try {
    onProgress(`Recording ${language} audio...`);
    const filename = await anki.storeMedia(audioFilename(noteId, language), await speak(text.trim(), language));
    await anki.updateFields(noteId, { [audioField(language)]: `[sound:${filename}]` });
    await anki.addTags([noteId], [pbTags.audio(language)]);
  } catch {
    audioFailed = true;
  }
  return { outcome: { kind: "added", note: { noteId, tags, fields } }, audioFailed };
}
