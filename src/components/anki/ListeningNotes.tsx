"use client";

import { useEffect, useState } from "react";
import { assist, deleteListening, listeningList, speak, type LaterItem } from "@/components/anki/api";
import { anki } from "@/lib/anki/connect";
import { cleanField, escapeHtml, htmlToText } from "@/lib/anki/fields";
import { listeningField, listeningOnlyField } from "@/lib/anki/noteType";
import { audio2Field, audioField, audioFilename, audioLanguages, pbTags, soundField, withPlayerSource, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";
import { llmProviderOptions, type LlmProviderId } from "@/lib/llm/provider";
import type { Language } from "@/lib/types";
import { defaultVoiceSettings, secondVoice, type VoiceSetting } from "@/lib/voices";

type Paragraph = { text: string; english: string; include: boolean; existing: boolean };
type Second = "voice" | "none";

const concurrency = 3;

// Paragraphs are separated by a blank line; a single line break stays
// inside its paragraph.
function splitParagraphs(text: string) {
  return text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

async function inParallel<T>(items: T[], work: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) await work(items[index], index);
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// Creates listening notes: one paragraph each, with its English
// translation, its recording and optionally a second recording in another
// voice. Their Listening and ListeningOnly fields are filled, so Anki gives
// them only a listening card (in Polyglot::Listening::<language>), not the
// usual directions. Below that, notes already in Anki can be given a
// listening card too (ExistingNotes).
export function ListeningNotes({ ready }: { ready: boolean }) {
  const [language, setLanguage] = useState<AnkiLanguage>("Japanese");
  const [tag, setTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [second, setSecond] = useState<Second>("voice");
  const [providerId, setProviderId] = useState<LlmProviderId>("anthropic");
  const [voices, setVoices] = useState<Record<Language, VoiceSetting>>(defaultVoiceSettings);
  const [paragraphs, setParagraphs] = useState<Paragraph[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);
  // Texts saved with "Save for listening" on the study desk, and which one
  // the paragraphs came from (removed from the list once its notes are in).
  const [saved, setSaved] = useState<LaterItem[] | null>(null);
  const [usedId, setUsedId] = useState("");

  useEffect(() => {
    void listeningList().then(setSaved).catch(() => setSaved([]));
    void anki.getTags().then((tags) => setAllTags(tags.filter((item) => !item.startsWith("pb::")))).catch(() => {});
    void (async () => {
      try {
        const response = await fetch("/api/account/settings");
        const data = await response.json() as { settings?: { voices?: Partial<Record<Language, VoiceSetting>> } };
        if (response.ok) setVoices({ ...defaultVoiceSettings, ...data.settings?.voices });
      } catch {
        // Fall back to showing the defaults.
      }
    })();
  }, []);

  async function prepare() {
    const texts = splitParagraphs(source).map((text) => cleanField(escapeHtml(text).replace(/\n/g, "<br>"), language).text);
    if (!texts.length) return;
    setBusy(true);
    setFailures([]);
    setDone(0);
    setStatus("Checking Anki and translating...");
    try {
      const existing = new Set((await anki.notesMatching(`${listeningField}:_* ${language}:_*`)).map((note) => cleanField(note.fields[language] || "", language).text));
      const prepared: Paragraph[] = texts.map((text) => ({ text, english: "", include: !existing.has(text), existing: existing.has(text) }));
      await inParallel(prepared, async (paragraph) => {
        if (paragraph.existing) return;
        try {
          paragraph.english = await assist("gloss", paragraph.text, language, providerId);
        } catch (error) {
          setFailures((current) => [...current, `Translating “${paragraph.text.slice(0, 30)}…” — ${error instanceof Error ? error.message : "failed"}`]);
        }
      });
      setParagraphs(prepared);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Anki could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = paragraphs?.filter((paragraph) => paragraph.include) || [];

  async function add() {
    if (!chosen.length) return;
    setBusy(true);
    setFailures([]);
    setDone(0);
    setStatus("Adding notes and recording audio...");
    const tags = [pbTags.listening, pbTags.audio(language), ...(tag.trim() ? [tag.trim().replace(/\s+/g, "_")] : [])];
    const added = new Set<string>();
    // One note at a time, in order, so the notes keep the paragraphs' order.
    for (const paragraph of chosen) {
      try {
        const noteId = await anki.addNote(language, {
          [language]: escapeHtml(paragraph.text).replace(/\n/g, "<br>"),
          English: escapeHtml(paragraph.english.trim()),
          [listeningField]: "yes",
          [listeningOnlyField]: "yes",
          Origin: language,
        }, tags);
        const [first, other] = await Promise.all([
          speak(paragraph.text, language),
          second === "voice" ? speak(paragraph.text, language, undefined, secondVoice(voices[language])) : Promise.resolve(""),
        ]);
        const fields: Record<string, string> = { [audioField(language)]: soundField(await anki.storeMedia(audioFilename(noteId, language), first)) };
        if (other) fields[audio2Field(language)] = soundField(await anki.storeMedia(audioFilename(noteId, language, "2"), other));
        await anki.updateFields(noteId, fields);
        added.add(paragraph.text);
        setDone((count) => count + 1);
      } catch (error) {
        setFailures((current) => [...current, `“${paragraph.text.slice(0, 30)}…” — ${error instanceof Error ? error.message : "failed"}`]);
      }
    }
    setParagraphs((current) => current && current.map((paragraph) => added.has(paragraph.text) ? { ...paragraph, include: false, existing: true } : paragraph));
    setStatus(`Added ${added.size} listening ${added.size === 1 ? "note" : "notes"} to Polyglot::Listening::${language}. Sync Anki to get them on your phone.`);
    if (usedId && added.size === chosen.length) {
      await removeSaved(usedId);
      setUsedId("");
    }
    setBusy(false);
  }

  function pickSaved(item: LaterItem) {
    setLanguage(item.language as AnkiLanguage);
    setSource(item.text);
    setParagraphs(null);
    setUsedId(item.id);
    setStatus("");
  }

  async function removeSaved(id: string) {
    try {
      setSaved(await deleteListening([id]));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The saved text couldn't be removed.");
    }
  }

  const update = (index: number, changes: Partial<Paragraph>) =>
    setParagraphs((current) => current && current.map((paragraph, at) => at === index ? { ...paragraph, ...changes } : paragraph));

  if (!ready) {
    return <div className="settings-panel anki-panel"><p>Listening notes need the listening cards in your note type. Use <b>Add listening cards</b> above first.</p></div>;
  }

  return (
    <div className="settings-panel anki-panel listening-notes">
      <p>Makes <b>listening notes</b>: one paragraph each, with its English translation and its recording. Each gets one listening card in <code>Polyglot::Listening::&lt;language&gt;</code>: the front plays the audio with no text, the back shows the text and plays the first recording again, and <b>more</b> shows the English. The card has back 5 s, back 10 s and loop buttons. Separate paragraphs with a blank line. To bring in text read from a photo on another device, use <b>Save for listening</b> under the study desk&apos;s text box.</p>
      {saved && saved.length > 0 && (
        <div className="listening-saved">
          <p className="result-label">Saved for listening</p>
          <ul>
            {saved.map((item) => (
              <li key={item.id} className={item.id === usedId ? "active" : ""}>
                <span><b>{item.language}</b> · {new Date(item.createdAt).toLocaleDateString()} · {item.text.replace(/\s+/g, " ").slice(0, 90)}{item.text.length > 90 ? "…" : ""}</span>
                <button className="text-button" type="button" disabled={busy} onClick={() => pickSaved(item)}>{item.id === usedId ? "In use" : "Use"}</button>
                <button className="text-button" type="button" disabled={busy} onClick={() => void removeSaved(item.id)}>Delete</button>
              </li>
            ))}
          </ul>
          <p className="anki-note">Saved from the study desk with <b>Save for listening</b>, on any device. <b>Use</b> puts the text in the box below; once its notes are added, it&apos;s removed from this list.</p>
        </div>
      )}
      <div className="book-audio-pick">
        <label>
          <span>Language</span>
          <select value={language} disabled={busy} onChange={(event) => { setLanguage(event.target.value as AnkiLanguage); setParagraphs(null); }}>
            {audioLanguages.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="book-audio-tag">
          <span>Tag (optional)</span>
          <input list="listening-tags" value={tag} placeholder="source::Genki::L3" disabled={busy} onChange={(event) => setTag(event.target.value)} />
          <datalist id="listening-tags">{allTags.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
        <label>
          <span>Second recording</span>
          <select value={second} disabled={busy} onChange={(event) => setSecond(event.target.value as Second)}>
            <option value="voice">Another voice ({secondVoice(voices[language]).voice})</option>
            <option value="none">None (add book audio later)</option>
          </select>
        </label>
        <label>
          <span>Translate with</span>
          <select value={providerId} disabled={busy} onChange={(event) => setProviderId(event.target.value as LlmProviderId)}>
            {llmProviderOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </select>
        </label>
      </div>
      <label className="anki-field-edit">{language} paragraphs
        <textarea value={source} disabled={busy} onChange={(event) => { setSource(event.target.value); setParagraphs(null); }} />
      </label>
      <div className="input-action-row">
        <button className="save-input-button" type="button" disabled={busy || !source.trim()} onClick={() => void prepare()}>Prepare {splitParagraphs(source).length || ""} paragraphs</button>
        {status && <span className="example-status" role="status">{status}</span>}
      </div>

      {paragraphs && (
        <>
          <ol className="listening-paragraphs">
            {paragraphs.map((paragraph, index) => (
              <li key={index}>
                <label className="anki-checkbox">
                  <input type="checkbox" checked={paragraph.include} disabled={busy || paragraph.existing} onChange={(event) => update(index, { include: event.target.checked })} />
                  {paragraph.existing ? "Already in Anki" : "Add"}
                </label>
                <p className="listening-paragraph-text">{paragraph.text}</p>
                {!paragraph.existing && (
                  <label className="anki-field-edit">English (suggested — edit as needed)
                    <textarea className="anki-reading-input" rows={3} value={paragraph.english} disabled={busy} onChange={(event) => update(index, { english: event.target.value })} />
                  </label>
                )}
              </li>
            ))}
          </ol>
          <p className="anki-note">Each paragraph is recorded {second === "voice" ? "twice (two voices)" : "once"} with your OpenAI key and the voices in Settings — about $0.015 per minute of audio.</p>
          <div className="input-action-row">
            <button className="save-input-button" type="button" disabled={busy || !chosen.length} onClick={() => void add()}>Add {chosen.length} listening {chosen.length === 1 ? "note" : "notes"}</button>
            {busy && done + failures.length > 0 && <span className="anki-progress"><progress max={chosen.length} value={done} /> {done} of {chosen.length}</span>}
          </div>
        </>
      )}

      {failures.length > 0 && <ul className="anki-failures">{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}

      <ExistingNotes key={language} language={language} tags={allTags} />
    </div>
  );
}

// Gives notes already in Anki a listening card as well, keeping their usual
// cards: fills their Listening field, and rewrites older audio fields so
// the card's player can use them.
function ExistingNotes({ language, tags }: { language: AnkiLanguage; tags: string[] }) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<VocabNote[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  // A note's other languages with audio get a listening card too.
  const others = (note: VocabNote) => audioLanguages.filter((other) => other !== language && note.fields[other]?.trim() && note.fields[audioField(other)]?.trim());

  async function find() {
    setBusy(true);
    setStatus("Finding notes...");
    try {
      const found = (await anki.notesMatching(`${language}:_* ${audioField(language)}:_* -${listeningField}:_* ${query.trim()}`)).sort((a, b) => a.noteId - b.noteId);
      setNotes(found);
      setPicked(new Set(found.map((note) => note.noteId)));
      setStatus(found.length ? "" : `No notes${query.trim() ? " matching that search" : ""} have ${language} audio without a listening card.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notes could not be loaded from Anki.");
    } finally {
      setBusy(false);
    }
  }

  async function addCards() {
    if (!notes || !picked.size) return;
    setBusy(true);
    setDone(0);
    setStatus("Adding listening cards...");
    let count = 0;
    try {
      for (const note of notes.filter((item) => picked.has(item.noteId))) {
        const fields: Record<string, string> = { [listeningField]: "yes" };
        for (const field of audioLanguages.flatMap((item) => [audioField(item), audio2Field(item)])) {
          const value = note.fields[field];
          if (value && withPlayerSource(value) !== value) fields[field] = withPlayerSource(value);
        }
        await anki.updateFields(note.noteId, fields);
        await anki.addTags([note.noteId], [pbTags.listening]);
        count += 1;
        setDone(count);
      }
      setNotes((current) => current && current.filter((note) => !picked.has(note.noteId)));
      setPicked(new Set());
      setStatus(`Gave ${count} notes a listening card in Polyglot::Listening::${language}. Their usual cards are unchanged. Sync Anki to get them on your phone.`);
    } catch (error) {
      setStatus(`${error instanceof Error ? error.message : "Anki could not be updated."} ${count} notes were done.`);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (noteId: number) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(noteId)) next.delete(noteId); else next.add(noteId);
    return next;
  });
  const alsoOther = notes?.filter((note) => picked.has(note.noteId) && others(note).length).length || 0;

  return (
    <div className="listening-existing">
      <h3>Listening cards for notes you already have</h3>
      <p className="anki-note">Any note with {language} audio can get a listening card as well, in <code>Polyglot::Listening::{language}</code>, while keeping its usual cards. Narrow the notes with an Anki search, e.g. <code>tag:source::STT::22</code>, or leave it empty for every {language} note with audio.</p>
      <div className="book-audio-pick">
        <label className="book-audio-tag">
          <span>Anki search (optional)</span>
          <input list="listening-existing-tags" value={query} placeholder="tag:source::STT::22" disabled={busy} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void find(); }} />
          <datalist id="listening-existing-tags">{tags.map((item) => <option key={item} value={`tag:${item}`} />)}</datalist>
        </label>
        <button className="save-input-button" type="button" disabled={busy} onClick={() => void find()}>Find notes</button>
      </div>
      {status && <p className="example-status" role="status">{status}</p>}
      {notes && notes.length > 0 && (
        <>
          <div className="input-action-row">
            <span className="anki-note">{picked.size} of {notes.length} ticked</span>
            <button className="text-button" type="button" disabled={busy} onClick={() => setPicked(new Set(notes.map((note) => note.noteId)))}>Select all</button>
            <button className="text-button" type="button" disabled={busy} onClick={() => setPicked(new Set())}>Select none</button>
          </div>
          <ul className="listening-existing-list">
            {notes.map((note) => (
              <li key={note.noteId}>
                <label className="anki-checkbox">
                  <input type="checkbox" checked={picked.has(note.noteId)} disabled={busy} onChange={() => toggle(note.noteId)} />
                  <span><b>{cleanField(note.fields[language] || "", language).text}</b> — {htmlToText(note.fields.English || "").replace(/\n/g, " ")}{others(note).length > 0 && <em> (also {others(note).join(", ")})</em>}</span>
                </label>
              </li>
            ))}
          </ul>
          {alsoOther > 0 && <p className="anki-note">{alsoOther} of the ticked notes also have audio in another language, so they get a listening card for that language too.</p>}
          <div className="input-action-row">
            <button className="save-input-button" type="button" disabled={busy || !picked.size} onClick={() => void addCards()}>Give {picked.size} notes listening cards</button>
            {busy && done > 0 && <span className="anki-progress"><progress max={picked.size} value={done} /> {done} of {picked.size}</span>}
          </div>
        </>
      )}
    </div>
  );
}
