"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipMatcher, type ClipChoice, type ClipTarget } from "@/components/anki/ClipMatcher";
import { isWordNote } from "@/lib/anki/bookAudio";
import { anki, ankiSearchValue } from "@/lib/anki/connect";
import { cleanField, htmlToText } from "@/lib/anki/fields";
import { audioField, audioFilename, audioLanguages, pbTags, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";

function toTarget(note: VocabNote, language: AnkiLanguage): ClipTarget {
  const text = cleanField(note.fields[language] || "", language).text;
  return {
    id: String(note.noteId),
    text,
    english: htmlToText(note.fields.English || "").replace(/\n/g, " "),
    isWord: isWordNote(text, language),
    audio: note.fields[audioField(language)] || "",
    bookAudio: note.tags.includes(pbTags.bookAudio(language)),
  };
}

// Replaces the text-to-speech audio on notes already in Anki with the
// textbook's own recordings: the chapter's MP3s are split into sentences,
// matched to the chapter's notes in the order they were added, checked by
// transcribing each clip, and written after one review of the whole table.
export function BookAudio() {
  const [language, setLanguage] = useState<AnkiLanguage>("Thai");
  const [tag, setTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [notes, setNotes] = useState<VocabNote[] | null>(null);
  const [choices, setChoices] = useState<ClipChoice[]>([]);
  const [ready, setReady] = useState(true);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void anki.getTags().then((tags) => setAllTags(tags.filter((item) => !item.startsWith("pb::")))).catch(() => {});
  }, []);

  const targets = useMemo(() => notes && notes.map((note) => toTarget(note, language)).filter((target) => target.text), [notes, language]);
  const choose = useCallback((next: ClipChoice[], valid: boolean) => {
    setChoices(next);
    setReady(valid);
    setConfirming(false);
  }, []);

  async function loadNotes() {
    const chosen = tag.trim();
    if (!chosen) return;
    setStatus("Finding the notes...");
    try {
      const found = (await anki.notesMatching(`"tag:${ankiSearchValue(chosen)}" ${language}:_*`)).sort((a, b) => a.noteId - b.noteId);
      setNotes(found);
      setStatus(found.length ? "" : `No notes tagged ${chosen} have ${language} filled in.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notes could not be loaded from Anki.");
    }
  }

  async function replace() {
    if (!choices.length || !ready) return;
    setConfirming(false);
    setRunning(true);
    setDone(0);
    setStatus("Writing to Anki...");
    // A new filename for every run, so the new audio syncs to other devices.
    const version = `book-${Date.now().toString(36)}`;
    const written = new Map<number, string>();
    try {
      for (const choice of choices) {
        const noteId = Number(choice.targetId);
        const filename = await anki.storeMedia(audioFilename(noteId, language, version), choice.data);
        const field = `[sound:${filename}]`;
        await anki.updateFields(noteId, { [audioField(language)]: field });
        await anki.addTags([noteId], [pbTags.audio(language), pbTags.bookAudio(language)]);
        written.set(noteId, field);
        setDone((count) => count + 1);
      }
      setStatus(`Replaced the audio on ${written.size} notes and tagged them ${pbTags.bookAudio(language)}, so Bulk audio leaves them alone.`);
    } catch (error) {
      setStatus(`${error instanceof Error ? error.message : "Writing to Anki failed."} ${written.size} of ${choices.length} notes were done.`);
    } finally {
      setNotes((current) => current && current.map((note) => written.has(note.noteId)
        ? { ...note, fields: { ...note.fields, [audioField(language)]: written.get(note.noteId)! }, tags: [...note.tags, pbTags.bookAudio(language)] }
        : note));
      setRunning(false);
    }
  }

  return (
    <div className="settings-panel anki-panel book-audio">
      <p>Puts a textbook&apos;s own recordings on notes already in Anki, in place of their text-to-speech audio. Choose the chapter&apos;s tag and its MP3 files: each file is split into sentences at the longer pauses, and the clips are matched to the chapter&apos;s notes in the order they were added. Each clip is transcribed (with your OpenAI key, a fraction of a cent per chapter) to check the match. Nothing is written until you press Replace.</p>

      <div className="book-audio-pick">
        <label>
          <span>Language</span>
          <select value={language} disabled={running} onChange={(event) => { setLanguage(event.target.value as AnkiLanguage); setNotes(null); }}>
            {audioLanguages.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="book-audio-tag">
          <span>Chapter tag</span>
          <input list="book-audio-tags" value={tag} placeholder="source::STT::24" disabled={running} onChange={(event) => setTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadNotes(); }} />
          <datalist id="book-audio-tags">{allTags.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
        <button className="save-input-button" type="button" disabled={running || !tag.trim()} onClick={() => void loadNotes()}>Load notes</button>
        {notes && <span className="anki-note">{notes.length} notes</span>}
      </div>

      {status && <p className="example-status" role="status">{status}</p>}

      <ClipMatcher key={language} language={language} targets={targets} noun="note" disabled={running} unmatchedLabel="No clip, so their audio stays as it is:" onChange={choose} />

      {targets && choices.length > 0 && (
        <>
          <div className="input-action-row">
            {!confirming && <button className="save-input-button" type="button" disabled={running || !ready} onClick={() => setConfirming(true)}>Replace audio on {choices.length} notes</button>}
            {confirming && (
              <>
                <span className="anki-note">Replace the {language} audio on {choices.length} notes with these clips? The old recordings stay in Anki&apos;s media folder until you run Tools → Check Media.</span>
                <button className="save-input-button" type="button" onClick={() => void replace()}>Yes, replace {choices.length}</button>
                <button className="text-button" type="button" onClick={() => setConfirming(false)}>Cancel</button>
              </>
            )}
            {(running || done > 0) && <span className="anki-progress"><progress max={choices.length} value={done} /> {done} of {choices.length}</span>}
          </div>
          <p className="anki-note">If one of these notes is open in Anki&apos;s Browse window, move off it first — Anki ignores changes to the note being edited.</p>
        </>
      )}
    </div>
  );
}
