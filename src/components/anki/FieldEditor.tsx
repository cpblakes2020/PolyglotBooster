"use client";

import { useState } from "react";
import { assist, speak } from "@/components/anki/api";
import { anki } from "@/lib/anki/connect";
import { cleanField, escapeHtml, htmlToText } from "@/lib/anki/fields";
import { ankiLanguages, audioField, audioFilename, audioLanguages, notesField, pbTags, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";
import type { LlmProviderId } from "@/lib/llm/provider";

type FieldEditorProps = {
  note: VocabNote;
  providerId: LlmProviderId;
  onSaved: (fields: Record<string, string>, tags: string[]) => void;
  onClose: () => void;
};

// Plain-text fields shown for editing. Balinese is left to Anki itself.
const textFields = [...ankiLanguages, "Origin"] as const;

function plainValue(note: VocabNote, field: string) {
  return field === "Origin" ? htmlToText(note.fields.Origin || "") : cleanField(note.fields[field] || "", field).text;
}

// Edits a note's fields in place: fix a translation, fill in another
// language (which creates that direction's cards in Anki), or adjust the
// Notes HTML. Only changed fields are written.
export function FieldEditor({ note, providerId, onSaved, onClose }: FieldEditorProps) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries([
    ...textFields.map((field) => [field, plainValue(note, field)]),
    ...ankiLanguages.map((language) => [notesField(language), note.fields[notesField(language)] || ""]),
  ]));
  const [recordAudio, setRecordAudio] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const changed = Object.keys(values).filter((field) => field.startsWith("Notes_")
    ? values[field] !== (note.fields[field] || "")
    : values[field].trim() !== plainValue(note, field));
  // Learning languages whose text is new or different now need a recording.
  const audioNeeded = audioLanguages.filter((language) => changed.includes(language) && values[language].trim());

  async function save() {
    if (!values.English.trim()) {
      setStatus("English can't be empty — every card pairs with it.");
      return;
    }
    setBusy(true);
    setStatus("Saving to Anki...");
    try {
      const fields = Object.fromEntries(changed.map((field) => [field, field.startsWith("Notes_") ? values[field] : escapeHtml(values[field].trim())]));
      await anki.updateFields(note.noteId, fields);
      const tags: string[] = [];
      if (recordAudio) {
        for (const language of audioNeeded as AnkiLanguage[]) {
          setStatus(`Recording ${language} audio...`);
          // Replacing a recording gets a new filename so the change syncs.
          const version = note.fields[audioField(language)]?.trim() ? Date.now().toString(36) : undefined;
          const filename = await anki.storeMedia(audioFilename(note.noteId, language, version), await speak(values[language].trim(), language));
          fields[audioField(language)] = `[sound:${filename}]`;
          await anki.updateFields(note.noteId, { [audioField(language)]: fields[audioField(language)] });
          tags.push(pbTags.audio(language));
        }
        if (tags.length) await anki.addTags([note.noteId], tags);
      }
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
        {textFields.map((field) => (
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
        {ankiLanguages.map((language) => (
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
      <div className="result-actions">
        <button className="save-input-button" type="button" disabled={busy || !changed.length} onClick={() => void save()}>Save fields</button>
        <button className="text-button" type="button" disabled={busy} onClick={onClose}>Close</button>
        {status && <span className="example-status" role="status">{status}</span>}
        {!changed.length && !status && <span className="anki-note">No changes yet.</span>}
      </div>
    </div>
  );
}
