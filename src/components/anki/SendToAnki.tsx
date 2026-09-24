"use client";

import { useMemo, useState } from "react";
import { assist, speak } from "@/components/anki/api";
import { anki } from "@/lib/anki/connect";
import { cleanField, composeNotesField, escapeHtml, existingReading, fieldNeedsCleanup, hasRubyReading, japaneseRubyReading, markdownToAnkiHtml } from "@/lib/anki/fields";
import { audioField, audioFilename, isAnkiLanguage, notesField, pbTags, readingLanguages, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { Language, PromptTemplateId } from "@/lib/types";

type SendToAnkiProps = {
  sourceText: string;
  sourceLanguage: Language;
  result: string;
  promptTemplateId: PromptTemplateId;
  providerId: LlmProviderId;
};

// Polyglot Vocab stores English explanations of a learning language, so
// only learning languages it has fields for, explained in English, qualify.
// Flashcard results are JSON card lists, not an analysis.
export function canSendToAnki(sourceLanguage: Language, userLanguage: Language, promptTemplateId: PromptTemplateId) {
  return isAnkiLanguage(sourceLanguage) && sourceLanguage !== "English" && userLanguage === "English" && promptTemplateId !== "flashcards";
}

type Draft = {
  match: VocabNote | null;
  fieldText: string;
  english: string;
  reading: string;
  analysis: string;
};

function plain(note: VocabNote | null, language: AnkiLanguage) {
  return note ? cleanField(note.fields[language] || "", language).text : "";
}

export function SendToAnki({ sourceText, sourceLanguage, result, promptTemplateId, providerId }: SendToAnkiProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedNoteId, setSavedNoteId] = useState<number | null>(null);

  const language = sourceLanguage as AnkiLanguage;
  const existingNotes = draft?.match?.fields[notesField(language)] || "";
  const usesReading = readingLanguages.has(language) && !(language === "Japanese" && hasRubyReading(existingNotes));
  const existingEnglish = plain(draft?.match || null, "English");

  async function start() {
    setOpen(true);
    setSavedNoteId(null);
    setDraft(null);
    setBusy(true);
    setStatus("Looking for this in Anki...");
    try {
      const text = cleanField(sourceText, language).text;
      // Exact match on the cleaned learning-language text, so old notes
      // with Word markup or spaced-out Thai still count as the same item.
      const notes = await anki.notesMatching(`${language}:_*`);
      const match = notes.find((note) => plain(note, language) === text) || null;
      const needsEnglish = !plain(match, "English");
      const needsReading = readingLanguages.has(language) && !(language === "Japanese" && hasRubyReading(match?.fields[notesField(language)] || ""));

      setStatus(needsEnglish || needsReading ? "Preparing the note..." : "");
      const [english, reading] = await Promise.all([
        needsEnglish ? assist("gloss", text, language, providerId) : Promise.resolve(""),
        needsReading ? assist("reading", text, language, providerId) : Promise.resolve(existingReading(match?.fields[notesField(language)] || "")),
      ]);
      setDraft({ match, fieldText: text, english, reading, analysis: result });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Anki could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  const composedNotes = useMemo(() => {
    if (!draft) return "";
    const readingHtml = !usesReading || !draft.reading.trim() ? ""
      : language === "Japanese" ? japaneseRubyReading(draft.fieldText.trim(), draft.reading.trim()) : escapeHtml(draft.reading.trim());
    return composeNotesField(existingNotes, readingHtml, markdownToAnkiHtml(draft.analysis));
  }, [draft, existingNotes, usesReading, language]);

  async function save() {
    if (!draft?.fieldText.trim() || !draft.analysis.trim()) return;
    const { match } = draft;
    if (!match && !draft.english.trim()) {
      setStatus("Add the English meaning — every card pairs with it.");
      return;
    }
    setBusy(true);
    setStatus("Saving to Anki...");
    try {
      const fields: Record<string, string> = { [notesField(language)]: composedNotes };
      const rawField = match?.fields[language] || "";
      if (!match || fieldNeedsCleanup(rawField, cleanField(rawField, language))) fields[language] = escapeHtml(draft.fieldText.trim());
      if (!existingEnglish && draft.english.trim()) fields.English = escapeHtml(draft.english.trim());
      const tags = [pbTags.analyzed(language, promptTemplateId)];

      let noteId: number;
      if (match) {
        noteId = match.noteId;
        await anki.updateFields(noteId, fields);
        await anki.addTags([noteId], tags);
      } else {
        noteId = await anki.addNote(language, { ...fields, Origin: language }, tags);
      }

      // Audio for the learning language only, if the note has none yet.
      if (!match?.fields[audioField(language)]?.trim()) {
        setStatus(`Recording ${language} audio...`);
        const filename = await anki.storeMedia(audioFilename(noteId, language), await speak(draft.fieldText.trim(), language));
        await anki.updateFields(noteId, { [audioField(language)]: `[sound:${filename}]` });
        await anki.addTags([noteId], [pbTags.audio(language)]);
      }

      setSavedNoteId(noteId);
      setStatus(match ? "Updated the existing note in Anki." : "Added a new note to Anki.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const update = (changes: Partial<Draft>) => setDraft((current) => current && { ...current, ...changes });

  if (!open) {
    return <button className="preview-prompt-button" type="button" onClick={() => void start()}>Send to Anki</button>;
  }

  return (
    <div className="send-to-anki">
      <div className="panel-heading">
        <p className="result-label">Send to Anki · Polyglot Vocab</p>
        <button className="text-button" type="button" disabled={busy} onClick={() => setOpen(false)}>Close</button>
      </div>

      {draft && (
        <>
          <p className="anki-note">
            {draft.match
              ? <>Found an existing note with this {language} text{existingEnglish ? <> (“{existingEnglish}”)</> : ""}. Saving updates it: the analysis goes below anything already in <code>{notesField(language)}</code>, and missing audio is added.</>
              : <>No note has this exact {language} text yet, so saving creates a new one. Anki places its cards in your decks automatically.</>}
          </p>
          <label className="anki-field-edit">{language}
            <input value={draft.fieldText} disabled={Boolean(draft.match)} onChange={(event) => update({ fieldText: event.target.value })} />
          </label>
          {!existingEnglish && (
            <label className="anki-field-edit">English (suggested — edit as needed)
              <input value={draft.english} onChange={(event) => update({ english: event.target.value })} />
            </label>
          )}
          {usesReading && (
            <label className="anki-field-edit">{language === "Thai" ? "Romanization" : "Reading (hiragana)"}
              <input value={draft.reading} onChange={(event) => update({ reading: event.target.value })} />
            </label>
          )}
          <label className="anki-field-edit">Analysis (Markdown, editable)
            <textarea value={draft.analysis} onChange={(event) => update({ analysis: event.target.value })} />
          </label>
          <p className="result-label">{notesField(language)} as it will appear under &ldquo;more&rdquo;</p>
          <div className="anki-card-preview" dangerouslySetInnerHTML={{ __html: composedNotes }} />
        </>
      )}

      <div className="result-actions">
        {draft && savedNoteId === null && <button className="save-input-button" type="button" disabled={busy || !draft.analysis.trim() || !draft.fieldText.trim()} onClick={() => void save()}>{draft.match ? "Update note in Anki" : "Add note to Anki"}</button>}
        {savedNoteId !== null && <button className="text-button" type="button" onClick={() => void anki.openEditor(savedNoteId)}>Open in Anki</button>}
        {!draft && !busy && <button className="text-button" type="button" onClick={() => void start()}>Try again</button>}
        {status && <span className="example-status" role="status">{status}</span>}
      </div>
    </div>
  );
}
