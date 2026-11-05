"use client";

import { useEffect, useState } from "react";
import { playData } from "@/components/anki/ClipMatcher";
import { fieldLines, saveListeningCard, type ListeningCardDraft } from "@/components/anki/saveItem";
import { TagInput, parseTags } from "@/components/anki/selection";
import { anki } from "@/lib/anki/connect";
import { cleanField } from "@/lib/anki/fields";
import { listeningField } from "@/lib/anki/noteType";

// One listening card for a whole recording, shown for review before it's
// added: the text and English can be edited, one sentence per line.
export function ListeningCardPanel({ draft, tagSuggestions }: { draft: ListeningCardDraft; tagSuggestions: string[] }) {
  const { language } = draft;
  const [text, setText] = useState(draft.text);
  const [english, setEnglish] = useState(draft.english);
  const [tags, setTags] = useState(draft.tags.join(" "));
  const [alreadyInAnki, setAlreadyInAnki] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const wanted = cleanField(fieldLines(draft.text), language).text;
    void anki.notesMatching(`${listeningField}:_* ${language}:_*`)
      .then((notes) => setAlreadyInAnki(notes.some((note) => cleanField(note.fields[language] || "", language).text === wanted)))
      .catch(() => {});
  }, [draft.text, language]);

  async function add() {
    setBusy(true);
    setStatus("Adding the listening card...");
    try {
      await saveListeningCard({ ...draft, text, english, tags: parseTags(tags) });
      setAdded(true);
      setStatus(`Added to Polyglot::Listening::${language}. Sync Anki to get it on your phone.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The listening card couldn't be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel anki-panel book-audio listening-card-panel">
      <p className="result-label">Listening card for the whole recording</p>
      <div className="input-action-row">
        <button className="text-button" type="button" onClick={() => playData(draft.audio)}>▶ Audio 1: the recording</button>
        {draft.audio2
          ? <button className="text-button" type="button" onClick={() => playData(draft.audio2!)}>▶ Audio 2: text-to-speech</button>
          : <span className="anki-failures">No Audio 2: the text-to-speech couldn&apos;t be recorded.</span>}
      </div>
      <label className="anki-field-edit">{language}, one sentence per line (on the back of the card)
        <textarea className="anki-reading-input" value={text} disabled={busy || added} onChange={(event) => setText(event.target.value)} />
      </label>
      <label className="anki-field-edit">English, one sentence per line (under &ldquo;more&rdquo;)
        <textarea className="anki-reading-input" value={english} disabled={busy || added} onChange={(event) => setEnglish(event.target.value)} />
      </label>
      {!added && <TagInput id="listening-card-tags" value={tags} onChange={setTags} suggestions={tagSuggestions} label="Tags for this card (optional)" />}
      {alreadyInAnki && !added && <p className="anki-failures">A listening note with this {language} text is already in Anki. Adding this one makes a second card.</p>}
      <div className="input-action-row">
        {!added && <button className="save-input-button" type="button" disabled={busy || !text.trim() || !english.trim()} onClick={() => void add()}>Add listening card</button>}
        {status && <span className="example-status" role="status">{status}</span>}
      </div>
      {!added && <p className="anki-note">Add it before leaving this screen. It&apos;s separate from the sentence cards below. Audio 2 was recorded from the text before any edits here, so if you change the {language}, it won&apos;t match exactly.</p>}
    </div>
  );
}
