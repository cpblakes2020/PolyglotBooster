"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { saveForListening } from "@/components/anki/api";
import { audioLanguages, type AnkiLanguage } from "@/lib/anki/vocab";
import type { Language } from "@/lib/types";

export function canSaveForListening(language: Language): language is AnkiLanguage {
  return (audioLanguages as readonly string[]).includes(language);
}

// On the study desk: saves the text box (or just the part selected in it)
// to the "Save for listening" list in your account, from any device, to be
// made into listening notes on the Anki page later. No task needs running.
export function SaveForListeningButton({ textarea, text, language }: { textarea: RefObject<HTMLTextAreaElement | null>; text: string; language: AnkiLanguage }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function save() {
    const box = textarea.current;
    const selected = box && box.selectionEnd > box.selectionStart ? text.slice(box.selectionStart, box.selectionEnd).trim() : "";
    const chosen = selected || text.trim();
    if (!chosen) return;
    setBusy(true);
    try {
      const items = await saveForListening(chosen, language, "");
      setMessage(`Saved ${selected ? "the selection" : "the text"} for listening · ${items.length} waiting on the Anki page's Listening tab`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "It couldn't be saved.");
    } finally {
      setBusy(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMessage(""), 5000);
    }
  }

  return (
    <>
      {/* onMouseDown keeps the text box's selection when the button is clicked. */}
      <button className="clear-input-button" type="button" disabled={busy || !text.trim()} title="Save this text (or the selected part) to make listening notes from on the Anki page" onMouseDown={(event) => event.preventDefault()} onClick={() => void save()}>{busy ? "Saving..." : "Save for listening"}</button>
      {message && <span className="example-status" role="status">{message}</span>}
    </>
  );
}
