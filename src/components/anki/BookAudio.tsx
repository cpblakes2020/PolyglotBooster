"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { transcribe } from "@/components/anki/api";
import { isWordNote, matchQuality, similarity } from "@/lib/anki/bookAudio";
import { anki, ankiSearchValue } from "@/lib/anki/connect";
import { cleanField, htmlToText } from "@/lib/anki/fields";
import { audioField, audioFilename, audioLanguages, pbTags, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";
import { analyzeMp3, clipBytes, defaultSentenceGap, findClips, toBase64, type Mp3Analysis } from "@/lib/audio/mp3Split";

type BookNote = { noteId: number; text: string; english: string; audio: string; tags: string[] };
type BookFile = { name: string; analysis: Mp3Analysis };
type BookClip = { key: string; file: string; start: number; end: number; data: string };
type Heard = { text?: string; error?: string };

const concurrency = 3;
const qualityLabels = { good: "✓ matches", close: "≈ close", poor: "✗ doesn't match" };

function soundFilename(field: string) {
  return field.match(/\[sound:([^\]]+)\]/)?.[1];
}

function toBookNote(note: VocabNote, language: AnkiLanguage): BookNote {
  return {
    noteId: note.noteId,
    text: cleanField(note.fields[language] || "", language).text,
    english: htmlToText(note.fields.English || "").replace(/\n/g, " "),
    audio: note.fields[audioField(language)] || "",
    tags: note.tags,
  };
}

function playData(data: string) {
  void new Audio(`data:audio/mpeg;base64,${data}`).play().catch(() => {});
}

const seconds = (value: number) => value.toFixed(1);

// Replaces the text-to-speech audio on notes already in Anki with the
// textbook's own recordings: the chapter's MP3s are split into sentences,
// matched to the chapter's notes in order, checked by transcribing each
// clip, and written after one review of the whole table.
export function BookAudio() {
  const [language, setLanguage] = useState<AnkiLanguage>("Thai");
  const [tag, setTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [notes, setNotes] = useState<BookNote[] | null>(null);
  const [files, setFiles] = useState<BookFile[]>([]);
  const [gap, setGap] = useState(defaultSentenceGap);
  const [skipWords, setSkipWords] = useState(true);
  const [assigned, setAssigned] = useState<Record<string, number | null>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [heard, setHeard] = useState<Record<string, Heard>>({});
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [retries, setRetries] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const asked = useRef(new Set<string>());

  useEffect(() => {
    void anki.getTags().then((tags) => setAllTags(tags.filter((item) => !item.startsWith("pb::")))).catch(() => {});
  }, []);

  async function loadNotes() {
    const chosen = tag.trim();
    if (!chosen) return;
    setStatus("Finding the notes...");
    try {
      const found = await anki.notesMatching(`"tag:${ankiSearchValue(chosen)}" ${language}:_*`);
      const loaded = found.map((note) => toBookNote(note, language)).filter((note) => note.text).sort((a, b) => a.noteId - b.noteId);
      setNotes(loaded);
      setAssigned({});
      setStatus(loaded.length ? "" : `No notes tagged ${chosen} have ${language} filled in.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notes could not be loaded from Anki.");
    }
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setStatus("Reading the audio...");
    try {
      const added: BookFile[] = [];
      for (const file of [...list]) added.push({ name: file.name, analysis: await analyzeMp3(file) });
      setFiles((current) => [...current, ...added].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The audio couldn't be read.");
    }
  }

  function moveFile(index: number, step: number) {
    setFiles((current) => {
      const next = [...current];
      const [file] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + step)), 0, file);
      return next;
    });
    setAssigned({});
  }

  const clips = useMemo<BookClip[]>(() => files.flatMap((file) => findClips(file.analysis, gap).map((clip) => ({
    key: `${file.name}@${clip.start.toFixed(2)}-${clip.end.toFixed(2)}`,
    file: file.name,
    start: clip.start,
    end: clip.end,
    data: toBase64(clipBytes(file.analysis, clip)),
  }))), [files, gap]);

  const wordNotes = useMemo(() => (notes || []).filter((note) => isWordNote(note.text, language)), [notes, language]);
  const inOrder = useMemo(() => (notes || []).filter((note) => !(skipWords && wordNotes.includes(note))), [notes, skipWords, wordNotes]);

  // The note each clip goes with: its place in book order, unless changed by hand.
  const noteFor = (clip: BookClip, index: number) => clip.key in assigned ? assigned[clip.key] : inOrder[index]?.noteId ?? null;
  const byId = useMemo(() => new Map((notes || []).map((note) => [note.noteId, note])), [notes]);

  // Transcribes every clip once, a few at a time.
  useEffect(() => {
    const queue = clips.filter((clip) => !asked.current.has(clip.key));
    if (!queue.length) return;
    for (const clip of queue) asked.current.add(clip.key);
    const worker = async () => {
      for (let clip = queue.shift(); clip; clip = queue.shift()) {
        const key = clip.key;
        try {
          const text = await transcribe(clip.data, language);
          setHeard((current) => ({ ...current, [key]: { text } }));
        } catch (error) {
          setHeard((current) => ({ ...current, [key]: { error: error instanceof Error ? error.message : "Couldn't transcribe" } }));
        }
      }
    };
    void Promise.all(Array.from({ length: concurrency }, worker));
  }, [clips, language, retries]);

  function retryFailed() {
    const failed = Object.keys(heard).filter((key) => heard[key].error);
    for (const key of failed) asked.current.delete(key);
    setHeard((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !failed.includes(key))));
    setRetries((count) => count + 1);
  }

  async function playCurrent(note: BookNote) {
    const filename = soundFilename(note.audio);
    if (!filename) return;
    const data = await anki.retrieveMedia(filename);
    if (data) playData(data);
  }

  const rows = clips.map((clip, index) => {
    const noteId = noteFor(clip, index);
    const note = noteId === null ? undefined : byId.get(noteId);
    const text = heard[clip.key]?.text;
    const score = note && text !== undefined ? similarity(text, note.text) : undefined;
    // A clearly better match among the chapter's other notes.
    const better = text && notes ? notes
      .map((other) => ({ note: other, score: similarity(text, other.text) }))
      .filter((item) => item.note.noteId !== noteId && item.score >= 0.5 && item.score - (score ?? 0) >= 0.2)
      .sort((a, b) => b.score - a.score)[0] : undefined;
    return { clip, index, note, score, better, use: !excluded.has(clip.key) && note !== undefined };
  });
  const chosen = rows.filter((row) => row.use);
  const duplicates = new Set(chosen.map((row) => row.note!.noteId).filter((id, index, ids) => ids.indexOf(id) !== index));
  const matchedIds = new Set(rows.map((row) => row.note?.noteId));
  const unmatched = (notes || []).filter((note) => !matchedIds.has(note.noteId));
  const pendingChecks = clips.filter((clip) => !heard[clip.key]).length;
  const failedChecks = clips.filter((clip) => heard[clip.key]?.error).length;

  async function replace() {
    if (!chosen.length || duplicates.size) return;
    setConfirming(false);
    setRunning(true);
    setDone(0);
    setStatus("Writing to Anki...");
    // A new filename for every run, so the new audio syncs to other devices.
    const version = `book-${Date.now().toString(36)}`;
    const written = new Map<number, string>();
    try {
      for (const row of chosen) {
        const note = row.note!;
        const filename = await anki.storeMedia(audioFilename(note.noteId, language, version), row.clip.data);
        const field = `[sound:${filename}]`;
        await anki.updateFields(note.noteId, { [audioField(language)]: field });
        await anki.addTags([note.noteId], [pbTags.audio(language), pbTags.bookAudio(language)]);
        written.set(note.noteId, field);
        setDone((count) => count + 1);
      }
      setStatus(`Replaced the audio on ${written.size} notes and tagged them ${pbTags.bookAudio(language)}, so Bulk audio leaves them alone.`);
    } catch (error) {
      setStatus(`${error instanceof Error ? error.message : "Writing to Anki failed."} ${written.size} of ${chosen.length} notes were done.`);
    } finally {
      setNotes((current) => current && current.map((note) => written.has(note.noteId) ? { ...note, audio: written.get(note.noteId)!, tags: [...note.tags, pbTags.bookAudio(language)] } : note));
      setRunning(false);
    }
  }

  return (
    <div className="settings-panel anki-panel book-audio">
      <p>Puts a textbook&apos;s own recordings on notes already in Anki, in place of their text-to-speech audio. Choose the chapter&apos;s tag and its MP3 files: each file is split into sentences at the longer pauses, and the clips are matched to the chapter&apos;s notes in the order they were added. Each clip is transcribed (with your OpenAI key, a fraction of a cent per chapter) to check the match. Nothing is written until you press Replace.</p>

      <div className="book-audio-pick">
        <label>
          <span>Language</span>
          <select value={language} disabled={running} onChange={(event) => { setLanguage(event.target.value as AnkiLanguage); setNotes(null); setHeard({}); asked.current.clear(); }}>
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

      <div className="book-audio-files">
        <label className="preview-prompt-button">
          Add MP3 files…
          <input type="file" accept=".mp3,audio/mpeg" multiple hidden disabled={running} onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }} />
        </label>
        {files.length > 0 && (
          <ol>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                {file.name} <span className="anki-note">· {findClips(file.analysis, gap).length} clips</span>
                <button className="text-button" type="button" disabled={running || index === 0} onClick={() => moveFile(index, -1)} aria-label="Move up">↑</button>
                <button className="text-button" type="button" disabled={running || index === files.length - 1} onClick={() => moveFile(index, 1)} aria-label="Move down">↓</button>
                <button className="text-button" type="button" disabled={running} onClick={() => { setFiles((current) => current.filter((_, at) => at !== index)); setAssigned({}); }} aria-label="Remove">✕</button>
              </li>
            ))}
          </ol>
        )}
        {files.length > 1 && <p className="anki-note">Put the files in book order: the clips are matched to the notes in this order.</p>}
      </div>

      {files.length > 0 && (
        <div className="book-audio-options">
          <label>
            <span>Pause between sentences (seconds)</span>
            <input type="number" min={0.4} max={4} step={0.1} value={gap} disabled={running} onChange={(event) => { setGap(Number(event.target.value) || defaultSentenceGap); setAssigned({}); }} />
          </label>
          {wordNotes.length > 0 && (
            <label className="anki-checkbox">
              <input type="checkbox" checked={skipWords} disabled={running} onChange={(event) => { setSkipWords(event.target.checked); setAssigned({}); }} />
              Leave out single-word notes ({wordNotes.map((note) => note.text).join(", ")})
            </label>
          )}
        </div>
      )}

      {status && <p className="example-status" role="status">{status}</p>}
      {!notes && clips.length > 0 && !status && <p className="anki-note">Load the chapter&apos;s notes to see which clip goes with which note.</p>}

      {notes && clips.length > 0 && (
        <div className="anki-estimate book-audio-review">
          <p className={clips.length === inOrder.length ? "anki-note" : "anki-failures"}>
            {clips.length} clips for {inOrder.length} notes{clips.length === inOrder.length ? ", one each." : ` — the counts differ, so check the order carefully. A different pause length may split the audio better.`}
            {pendingChecks > 0 && ` Transcribing ${pendingChecks} clips...`}
          </p>
          {failedChecks > 0 && pendingChecks === 0 && (
            <p className="anki-failures">
              {failedChecks} clips couldn&apos;t be transcribed, so they&apos;re matched by order only.{" "}
              <button className="text-button" type="button" disabled={running} onClick={retryFailed}>Transcribe again</button>
            </p>
          )}
          <div className="book-audio-table">
            <table>
              <thead><tr><th>#</th><th>Book clip</th><th>Note</th><th>Heard in the clip</th><th>Use</th></tr></thead>
              <tbody>
                {rows.map(({ clip, index, note, score, better, use }) => (
                  <tr key={clip.key} className={use ? "" : "unused"}>
                    <td>{index + 1}</td>
                    <td><div className="book-audio-cell">
                      <button className="text-button" type="button" onClick={() => playData(clip.data)}>▶ Book</button>
                      <span className="anki-note">{clip.file} · {seconds(clip.start)}–{seconds(clip.end)} s</span>
                    </div></td>
                    <td><div className="book-audio-cell book-audio-note">
                      <select value={note?.noteId ?? ""} disabled={running} onChange={(event) => setAssigned((current) => ({ ...current, [clip.key]: event.target.value ? Number(event.target.value) : null }))}>
                        <option value="">— no note —</option>
                        {notes.map((item) => <option key={item.noteId} value={item.noteId}>{item.text}</option>)}
                      </select>
                      {note && (
                        <span className="anki-note">
                          {note.english}
                          {soundFilename(note.audio) && <> · <button className="text-button" type="button" onClick={() => void playCurrent(note)}>▶ {note.tags.includes(pbTags.bookAudio(language)) ? "Book audio now" : "Current"}</button></>}
                        </span>
                      )}
                      {note && duplicates.has(note.noteId) && use && <span className="anki-failures">This note has another clip too.</span>}
                    </div></td>
                    <td><div className="book-audio-cell book-audio-heard">
                      {heard[clip.key]?.error ? <span className="anki-failures">{heard[clip.key].error}</span> : heard[clip.key] ? <>{heard[clip.key].text || "(nothing)"}</> : <span className="anki-note">…</span>}
                      {score !== undefined && <span className={`book-audio-quality ${matchQuality(score)}`}>{qualityLabels[matchQuality(score)]}</span>}
                      {better && (
                        <span className="anki-note">
                          Sounds like {better.note.text}{" "}
                          <button className="text-button" type="button" disabled={running} onClick={() => setAssigned((current) => ({ ...current, [clip.key]: better.note.noteId }))}>Use that note</button>
                        </span>
                      )}
                    </div></td>
                    <td>
                      <input type="checkbox" aria-label="Use this clip" checked={use} disabled={running || !note} onChange={(event) => setExcluded((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.delete(clip.key); else next.add(clip.key);
                        return next;
                      })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unmatched.length > 0 && <p className="anki-note">No clip, so their audio stays as it is: {unmatched.map((note) => note.text).join(" · ")}</p>}
          <div className="input-action-row">
            {!confirming && <button className="save-input-button" type="button" disabled={running || !chosen.length || duplicates.size > 0} onClick={() => setConfirming(true)}>Replace audio on {chosen.length} notes</button>}
            {confirming && (
              <>
                <span className="anki-note">Replace the {language} audio on {chosen.length} notes with these clips? The old recordings stay in Anki&apos;s media folder until you run Tools → Check Media.</span>
                <button className="save-input-button" type="button" onClick={() => void replace()}>Yes, replace {chosen.length}</button>
                <button className="text-button" type="button" onClick={() => setConfirming(false)}>Cancel</button>
              </>
            )}
            {(running || done > 0) && <span className="anki-progress"><progress max={chosen.length} value={done} /> {done} of {chosen.length}</span>}
          </div>
          <p className="anki-note">If one of these notes is open in Anki&apos;s Browse window, move off it first — Anki ignores changes to the note being edited.</p>
        </div>
      )}
    </div>
  );
}
