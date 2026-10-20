"use client";

import { useEffect, useRef, useState } from "react";
import { saveForLater } from "@/components/anki/api";
import { ankiLanguages, type AnkiLanguage } from "@/lib/anki/vocab";
import { guessLanguage } from "@/lib/guessLanguage";

const studyLanguages = ankiLanguages.filter((language) => language !== "English");
const lastLanguageKey = "pb:clipboard-language";
const maxItemLength = 300;

function readLastLanguage(): AnkiLanguage | undefined {
  try {
    const value = window.localStorage.getItem(lastLanguageKey);
    return studyLanguages.find((language) => language === value);
  } catch {
    return undefined;
  }
}

type Draft = { text: string; language: AnkiLanguage; seenIn: string; eachLine: boolean; note: string };

// "Save clipboard for Anki later": reads what's on the clipboard (copied in
// any app) and shows it before anything is saved, so you can check it's
// what you meant — editable, with its language and where you saw it. On an
// iPhone, Safari first shows a small Paste bubble to tap; if reading isn't
// allowed, the box opens empty to paste into by hand.
export function ClipboardSaver() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (draft) boxRef.current?.focus();
  }, [draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open() {
    setMessage("");
    setStatus("");
    let text = "";
    let note = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
      if (!text) note = "The clipboard is empty. Copy something first, or paste it here.";
    } catch {
      note = "The clipboard couldn't be read here. Paste into the box (long-press → Paste on the iPhone).";
    }
    setDraft({ text, language: guessLanguage(text, readLastLanguage()), seenIn: "", eachLine: false, note });
  }

  const lines = draft ? draft.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
  const pieces = draft ? (draft.eachLine && lines.length > 1 ? lines : [draft.text.trim()].filter(Boolean)) : [];
  const tooLong = pieces.filter((piece) => piece.length > maxItemLength);

  async function save() {
    if (!draft || !pieces.length || tooLong.length) return;
    setBusy(true);
    const failed: string[] = [];
    let saved = 0;
    for (const [index, piece] of pieces.entries()) {
      setStatus(pieces.length > 1 ? `Saving ${index + 1} of ${pieces.length}...` : "Saving...");
      try {
        // The whole clipboard is the context the phrase is looked up in.
        await saveForLater(piece, draft.language, draft.text.trim().slice(0, 8000), draft.seenIn.trim());
        saved += 1;
      } catch (error) {
        failed.push(`${piece.slice(0, 40)}: ${error instanceof Error ? error.message : "couldn't be saved"}`);
      }
    }
    try {
      window.localStorage.setItem(lastLanguageKey, draft.language);
    } catch {
      // Only a convenience for the next guess.
    }
    setBusy(false);
    if (failed.length) {
      setStatus(`${saved} saved; not saved: ${failed.join(" · ")}`);
      return;
    }
    setDraft(null);
    setStatus("");
    setMessage(`Saved ${saved === 1 ? `“${pieces[0].slice(0, 40)}${pieces[0].length > 40 ? "…" : ""}”` : `${saved} items`} for Anki later (${draft.language}).`);
  }

  return (
    <section className="settings-panel utility-panel" aria-labelledby="clipboard-title">
      <h2 id="clipboard-title">Save to Anki later from any app</h2>
      <p className="anki-note">Copy a word or phrase anywhere — a chat, a web page, an e-book — then tap the button. You&apos;ll see exactly what was copied before it&apos;s saved.</p>
      <div className="input-action-row">
        <button className="save-input-button" type="button" onClick={() => void open()}>Save clipboard for Anki later</button>
        {message && <span className="example-status" role="status">{message}</span>}
      </div>

      {draft && (
        <div className="utility-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDraft(null); }}>
          <div className="utility-dialog" role="dialog" aria-modal="true" aria-labelledby="clipboard-dialog-title">
            <h3 id="clipboard-dialog-title">Save this for Anki later?</h3>
            {draft.note && <p className="anki-note">{draft.note}</p>}
            <label className="anki-field-edit">From the clipboard — check it, and edit if needed
              <textarea ref={boxRef} rows={Math.min(8, Math.max(3, lines.length + 1))} value={draft.text} disabled={busy} onChange={(event) => setDraft({ ...draft, text: event.target.value, language: draft.text.trim() ? draft.language : guessLanguage(event.target.value, readLastLanguage()) })} />
            </label>
            <div className="utility-dialog-row">
              <label className="anki-field-edit">Language
                <select value={draft.language} disabled={busy} onChange={(event) => setDraft({ ...draft, language: event.target.value as AnkiLanguage })}>
                  {studyLanguages.map((language) => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
              <label className="anki-field-edit">Seen in (optional)
                <input value={draft.seenIn} disabled={busy} placeholder="e.g. LINE chat, NHK article" onChange={(event) => setDraft({ ...draft, seenIn: event.target.value })} />
              </label>
            </div>
            {lines.length > 1 && (
              <label className="anki-checkbox"><input type="checkbox" checked={draft.eachLine} disabled={busy} onChange={(event) => setDraft({ ...draft, eachLine: event.target.checked })} /> Save each of the {lines.length} lines as a separate item</label>
            )}
            {tooLong.length > 0 && <p className="example-status" role="alert">{pieces.length > 1 ? `${tooLong.length} line${tooLong.length === 1 ? " is" : "s are"}` : "This is"} over {maxItemLength} characters — shorten {pieces.length > 1 ? "them" : "it"} to the word or phrase to learn{lines.length > 1 && !draft.eachLine ? ", or save each line separately" : ""}.</p>}
            <div className="result-actions">
              <button className="save-input-button" type="button" disabled={busy || !pieces.length || tooLong.length > 0} onClick={() => void save()}>{pieces.length > 1 ? `Save ${pieces.length} items` : "Save"}</button>
              <button className="text-button" type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
              {status && <span className="example-status" role="status">{status}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
