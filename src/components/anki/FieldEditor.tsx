"use client";

import { useState } from "react";
import { assist, speak } from "@/components/anki/api";
import { anki } from "@/lib/anki/connect";
import { cleanField, escapeHtml, existingReading, htmlToText, readingHtml, withReadingBlock } from "@/lib/anki/fields";
import { ankiLanguages, audioField, audioFilename, audioLanguages, notesField, pbTags, readingLabel, readingLanguages, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";
import type { LlmProviderId } from "@/lib/llm/provider";

type FieldEditorProps = {
  note: VocabNote;
  providerId: LlmProviderId;
  onSaved: (fields: Record<string, string>, tags: string[]) => void;
  onClose: () => void;
};

// Plain-text fields shown for editing, with the English note (Notes_English
// as plain text, e.g. a question written when flagging) right under
// English. Balinese is left to Anki itself.
const englishNote = "English note";
const textFields = ["English", englishNote, ...ankiLanguages.filter((language) => language !== "English"), "Origin"] as const;
// The other Notes fields are edited as HTML.
const htmlNotesLanguages = ankiLanguages.filter((language) => language !== "English");

function plainValue(note: VocabNote, field: string) {
  if (field === englishNote) return htmlToText(note.fields[notesField("English")] || "");
  return field === "Origin" ? htmlToText(note.fields.Origin || "") : cleanField(note.fields[field] || "", field).text;
}

// The Anki field a value is written to, and its stored form.
function storedField(field: string, value: string): [string, string] {
  if (field.startsWith("Notes_")) return [field, value];
  if (field === englishNote) return [notesField("English"), escapeHtml(value.trim()).replace(/\n/g, "<br>")];
  return [field, escapeHtml(value.trim())];
}

// Edits a note's fields in place: fix a translation, fill in another
// language (which creates that direction's cards in Anki, with its reading
// and audio), or adjust the Notes HTML. Only changed fields are written.
export function FieldEditor({ note, providerId, onSaved, onClose }: FieldEditorProps) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries([
    ...textFields.map((field) => [field, plainValue(note, field)]),
    ...htmlNotesLanguages.map((language) => [notesField(language), note.fields[notesField(language)] || ""]),
  ]));
  const [recordAudio, setRecordAudio] = useState(true);
  const [addReadings, setAddReadings] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const changed = Object.keys(values).filter((field) => field.startsWith("Notes_")
    ? values[field] !== (note.fields[field] || "")
    : values[field].trim() !== plainValue(note, field));
  // Learning languages whose text is new or different now need a recording.
  const audioNeeded = audioLanguages.filter((language) => changed.includes(language) && values[language].trim());
  // ...and, for Thai, Japanese and Mandarin, a new reading — unless you're
  // editing that language's Notes HTML yourself in this save.
  const readingsNeeded = ankiLanguages.filter((language) => readingLanguages.has(language) && changed.includes(language) && values[language].trim() && !changed.includes(notesField(language)));

  async function save() {
    if (!values.English.trim()) {
      setStatus("English can't be empty — every card pairs with it.");
      return;
    }
    setBusy(true);
    setStatus("Saving to Anki...");
    try {
      const fields = Object.fromEntries(changed.map((field) => storedField(field, values[field])));
      const failedReadings: string[] = [];
      if (addReadings) {
        for (const language of readingsNeeded) {
          setStatus(`Writing the ${readingLabel(language).toLowerCase()} for ${language}...`);
          try {
            const text = values[language].trim();
            const reading = await assist("reading", text, language, providerId, language === "Japanese" && values.Mandarin.trim() ? "chinese" : undefined);
            fields[notesField(language)] = withReadingBlock(note.fields[notesField(language)] || "", readingHtml(reading, language, text));
          } catch {
            failedReadings.push(language);
          }
        }
      }
      await anki.updateFields(note.noteId, fields);
      const tags: string[] = [];
      if (recordAudio) {
        for (const language of audioNeeded as AnkiLanguage[]) {
          setStatus(`Recording ${language} audio...`);
          // Replacing a recording gets a new filename so the change syncs.
          const version = note.fields[audioField(language)]?.trim() ? Date.now().toString(36) : undefined;
          const filename = await anki.storeMedia(audioFilename(note.noteId, language, version), await speak(values[language].trim(), language, existingReading(fields[notesField(language)] ?? note.fields[notesField(language)] ?? "")));
          fields[audioField(language)] = `[sound:${filename}]`;
          await anki.updateFields(note.noteId, { [audioField(language)]: fields[audioField(language)] });
          tags.push(pbTags.audio(language));
        }
        if (tags.length) await anki.addTags([note.noteId], tags);
      }
      if (failedReadings.length) window.alert(`Saved, but the reading for ${failedReadings.join(" and ")} couldn't be generated. Use Missing reading on the Anki page to add it later.`);
      onSaved(fields, tags);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be saved.");
      setBusy(false);
    }
  }

  const set = (field: string, value: string) => setValues((current) => ({ ...current, [field]: value }));

  // Suggests an empty language field from the note's other filled ones.
  // It only fills the box; nothing is written until "Save fields".
  async function suggest(target: AnkiLanguage) {
    const sources = ankiLanguages.filter((language) => language !== target && values[language].trim()).map((language) => `${language}: ${values[language].trim()}`);
    if (!sources.length) return;
    setBusy(true);
    setStatus(`Suggesting ${target}...`);
    try {
      const suggestion = await assist("translate", sources.join("\n"), target, providerId);
      set(target, cleanField(suggestion, target).text || suggestion.trim());
      setStatus(`${target} suggested — check it before saving.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No suggestion could be made.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="anki-field-editor">
      <p className="result-label">Edit fields</p>
      <div className="anki-item-fields">
        {textFields.map((field) => field === englishNote ? (
          <label className="anki-field-edit" key={field}>English note (e.g. a question you wrote when flagging; empty it to delete)
            <textarea rows={Math.max(2, values[field].split("\n").length)} value={values[field]} onChange={(event) => set(field, event.target.value)} />
          </label>
        ) : (
          <label className="anki-field-edit" key={field}>{field}{field !== "Origin" && !plainValue(note, field) ? " (empty — filling it in adds its cards)" : ""}
            <span className="anki-field-input">
              <input value={values[field]} onChange={(event) => set(field, event.target.value)} />
              {field !== "Origin" && !plainValue(note, field) && (
                <button className="preview-prompt-button" type="button" disabled={busy} onClick={(event) => { event.preventDefault(); void suggest(field); }}>Suggest</button>
              )}
            </span>
          </label>
        ))}
      </div>
      <details className="anki-notes-html">
        <summary>Notes fields (HTML)</summary>
        {htmlNotesLanguages.map((language) => (
          <label className="anki-field-edit" key={language}>{notesField(language)}
            <textarea value={values[notesField(language)]} onChange={(event) => set(notesField(language), event.target.value)} />
          </label>
        ))}
      </details>
      {audioNeeded.length > 0 && (
        <label className="anki-checkbox">
          <input type="checkbox" checked={recordAudio} onChange={(event) => setRecordAudio(event.target.checked)} />
          Record new audio for {audioNeeded.join(" and ")}
        </label>
      )}
      {readingsNeeded.length > 0 && (
        <label className="anki-checkbox">
          <input type="checkbox" checked={addReadings} onChange={(event) => setAddReadings(event.target.checked)} />
          Write the reading for {readingsNeeded.join(" and ")} ({readingsNeeded.map((language) => readingLabel(language).split(" ")[0].toLowerCase()).join(", ")})
        </label>
      )}
      <div className="result-actions">
        <button className="save-input-button" type="button" disabled={busy || !changed.length} onClick={() => void save()}>Save fields</button>
        <button className="text-button" type="button" disabled={busy} onClick={onClose}>Close</button>
        {status && <span className="example-status" role="status">{status}</span>}
        {!changed.length && !status && <span className="anki-note">No changes yet.</span>}
      </div>
    </div>
  );
}
