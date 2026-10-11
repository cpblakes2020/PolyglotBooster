"use client";

// "Save for Anki later": phrases saved from the study desk or the Anki page
// on any device (kept in your account), added to Anki later from the Anki
// page on the computer running Anki.

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteLater, describeSelection, laterChangedEvent, laterList, saveForLater, type AnalysisOptions, type LaterItem } from "@/components/anki/api";
import { BranchQueue } from "@/components/anki/BranchQueue";
import type { BranchItem } from "@/lib/anki/prompts";
import type { AnkiLanguage } from "@/lib/anki/vocab";

// The saved-for-later list, refreshed whenever any page changes it.
export function useLaterItems() {
  const [items, setItems] = useState<LaterItem[] | null>(null);
  const refresh = useCallback(() => { laterList().then(setItems, () => {}); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(laterChangedEvent, refresh);
    return () => window.removeEventListener(laterChangedEvent, refresh);
  }, [refresh]);
  return items;
}

// Saves a selection to the list, with a brief confirmation on screen.
// context: what the phrase was seen in (analysis, follow-ups); source: the
// "Seen in" line for its note.
export function useSaveForLater(language: AnkiLanguage, context: string, source: string) {
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);

  function show(text: string) {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), 3500);
  }

  async function save(text: string) {
    try {
      const items = await saveForLater(text, language, context, source);
      const count = items.filter((item) => item.language === language).length;
      show(`Saved for Anki later · ${count} ${language} item${count === 1 ? "" : "s"} waiting`);
    } catch (error) {
      show(error instanceof Error ? error.message : "It couldn't be saved.");
    }
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);
  const element = message ? <div className="anki-saved-toast" role="status">{message}</div> : null;
  return { save, element };
}

// On the study desk: what's waiting, with a way to delete entries — from
// any device.
export function LaterListPanel() {
  const items = useLaterItems();
  if (!items?.length) return null;
  return (
    <details className="settings-panel anki-later-panel">
      <summary>Saved for Anki later ({items.length})</summary>
      <p className="anki-note">Add them to Anki from the <a href="/anki">Anki page</a> on the computer running Anki (<b>Saved for later</b>). Delete any you no longer want here.</p>
      <ul className="anki-later-list">
        {items.map((item) => (
          <li key={item.id}>
            <span className="anki-later-text">{item.text}</span>
            <small>{item.language}{item.source ? ` · from ${item.source}` : ""} · {new Date(item.createdAt).toLocaleDateString()}</small>
            <button className="text-button" type="button" aria-label={`Delete ${item.text}`} onClick={() => void deleteLater([item.id]).catch((error) => window.alert(error instanceof Error ? error.message : "It couldn't be deleted."))}>Delete</button>
          </li>
        ))}
      </ul>
    </details>
  );
}

type LaterQueueProps = {
  language: AnkiLanguage;
  options: AnalysisOptions;
  tagSuggestions: string[];
  onClose: () => void;
};

// On the Anki page: looks up every saved phrase in this language (reading,
// meaning, explanations, in the context it was saved from) and opens the
// usual pick list. Added items leave the list; in each item you can also
// skip it (it stays for later) or delete it from the list.
export function LaterQueue({ language, options, tagSuggestions, onClose }: LaterQueueProps) {
  const [items, setItems] = useState<BranchItem[] | null>(null);
  const [status, setStatus] = useState("Loading the saved list...");
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = (await laterList()).filter((item) => item.language === language);
        const found: BranchItem[] = [];
        const failed: string[] = [];
        for (const [index, item] of saved.entries()) {
          if (cancelled) return;
          setStatus(`Looking up ${index + 1} of ${saved.length}: “${item.text.slice(0, 40)}”...`);
          try {
            const described = await describeSelection(item.text, item.context || item.text, language, options.providerId);
            found.push({ ...described, seenIn: item.source, laterId: item.id });
          } catch (error) {
            failed.push(`${item.text}: ${error instanceof Error ? error.message : "couldn't be looked up"} (it stays in the list)`);
          }
        }
        if (cancelled) return;
        setFailures(failed);
        setItems(found);
        setStatus(found.length ? "" : saved.length ? "" : `No ${language} phrases are saved for later.`);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "The saved list couldn't be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, [language, options.providerId]);

  function itemDone(item: BranchItem, outcome: "added" | "commented" | "skipped" | "deleted") {
    if (item.laterId && outcome !== "skipped") void deleteLater([item.laterId]).catch(() => {});
  }

  if (!items?.length) {
    return (
      <div className="anki-branch">
        {status && <p className="example-status" role="status">{status}</p>}
        {failures.length > 0 && <ul className="anki-failures">{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}
        {items && <button className="text-button" type="button" onClick={onClose}>Close</button>}
      </div>
    );
  }

  return (
    <>
      {failures.length > 0 && <ul className="anki-failures">{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}
      <BranchQueue
        language={language}
        parentText=""
        parentEnglish=""
        analysis=""
        options={options}
        items={items}
        pick
        title="Saved for Anki later"
        doneLabel="Done"
        depth={1}
        tagSuggestions={tagSuggestions}
        onItemDone={itemDone}
        deletable
        onFinish={onClose}
      />
    </>
  );
}
