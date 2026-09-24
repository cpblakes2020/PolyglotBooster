"use client";

import { useEffect, useState } from "react";
import { extractItems, type AnalysisOptions } from "@/components/anki/api";
import { ItemEditor, type ItemOutcome } from "@/components/anki/ItemEditor";
import { anki } from "@/lib/anki/connect";
import { cleanField } from "@/lib/anki/fields";
import type { BranchItem } from "@/lib/anki/prompts";
import type { AnkiLanguage, VocabNote } from "@/lib/anki/vocab";

type BranchQueueProps = {
  language: AnkiLanguage;
  // The analyzed item and its English, for the "Seen in" back-reference.
  parentText: string;
  parentEnglish: string;
  analysis: string;
  options: AnalysisOptions;
  // Given: work through just these (a right-clicked selection). Omitted:
  // extract every item from the analysis and let the user pick.
  items?: BranchItem[];
  onFinish: () => void;
};

type Row = { item: BranchItem; match: VocabNote | null; selected: boolean };
type Tally = { added: number; commented: number; skipped: number };

const kindLabels = { example: "Example", related: "Related", register: "Register" } as const;

export function BranchQueue({ language, parentText, parentEnglish, analysis, options, items, onFinish }: BranchQueueProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [queue, setQueue] = useState<Row[] | null>(null);
  const [position, setPosition] = useState(0);
  const [tally, setTally] = useState<Tally>({ added: 0, commented: 0, skipped: 0 });
  const [status, setStatus] = useState("");
  // Cleaned learning-language text -> note, for spotting items already in Anki.
  const [index, setIndex] = useState<Map<string, VocabNote>>(new Map());

  const seenIn = parentEnglish ? `${parentText} (${parentEnglish})` : parentText;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setStatus(items ? "Checking Anki..." : "Finding examples, related words and register versions...");
        const [notes, found] = await Promise.all([
          anki.notesMatching(`${language}:_*`),
          items ? Promise.resolve(items) : extractItems(analysis, parentText, language, options.providerId),
        ]);
        if (cancelled) return;
        const byText = new Map(notes.map((note) => [cleanField(note.fields[language] || "", language).text, note]));
        setIndex(byText);
        const built = found.map((item) => {
          const match = byText.get(cleanField(item.text, language).text) || null;
          return { item, match, selected: !match };
        });
        setRows(built);
        // A single right-clicked item goes straight to its editor, even if
        // it's already in Anki — the editor shows that warning itself.
        if (items) setQueue(built);
        setStatus(built.length ? "" : "No separate items were found in this analysis.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "The items could not be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, [analysis, items, language, options.providerId, parentText]);

  function toggle(rowIndex: number) {
    setRows((current) => current && current.map((row, i) => i === rowIndex ? { ...row, selected: !row.selected } : row));
  }

  function handleDone(outcome: ItemOutcome) {
    if (outcome.kind === "added") {
      // Later items with the same text should now show as already in Anki.
      const note = outcome.note;
      setIndex((current) => new Map(current).set(cleanField(note.fields[language] || "", language).text, note));
    }
    setTally((current) => ({ ...current, [outcome.kind]: current[outcome.kind] + 1 }));
    setPosition((current) => current + 1);
  }

  const current = queue?.[position];
  const finished = queue !== null && position >= queue.length;

  return (
    <section className="anki-branch">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Branch</p>
          <p className="anki-branch-source">From {seenIn}</p>
        </div>
        <button className="text-button" type="button" onClick={onFinish}>{finished ? "Back to main session" : "Cancel branch"}</button>
      </div>

      {status && <p className="example-status" role="status">{status}</p>}

      {rows && !queue && rows.length > 0 && (
        <>
          <table className="anki-branch-table">
            <thead><tr><th /><th>{language}</th><th>English</th><th>Comment</th><th /></tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.item.text} className={row.match ? "in-anki" : undefined}>
                  <td><input type="checkbox" aria-label={`Include ${row.item.text}`} checked={row.selected} onChange={() => toggle(rowIndex)} /></td>
                  <td><span className="anki-branch-text">{row.item.text}</span>{row.item.reading && <small>{row.item.reading}</small>}</td>
                  <td>{row.item.english}</td>
                  <td>{row.item.comment}</td>
                  <td><span className="anki-branch-kind">{kindLabels[row.item.kind]}</span>{row.match && <span className="anki-branch-badge">In Anki</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="result-actions">
            <button className="save-input-button" type="button" disabled={!rows.some((row) => row.selected)} onClick={() => setQueue(rows.filter((row) => row.selected))}>
              Start branch ({rows.filter((row) => row.selected).length})
            </button>
            <span className="anki-note">Items already in Anki start unticked. Tick one to add its comment to that note, or add it as a new note anyway.</span>
          </div>
        </>
      )}

      {current && (
        <>
          {queue.length > 1 && <p className="anki-note">Item {position + 1} of {queue.length} · {kindLabels[current.item.kind]}</p>}
          <ItemEditor
            key={`${position}-${current.item.text}`}
            item={current.item}
            language={language}
            seenIn={seenIn}
            match={index.get(cleanField(current.item.text, language).text) || null}
            options={options}
            onDone={handleDone}
          />
        </>
      )}

      {finished && (
        <div className="result-actions">
          <p className="anki-note">
            Branch finished: {tally.added} added, {tally.commented} comment{tally.commented === 1 ? "" : "s"} added to existing notes, {tally.skipped} skipped.
          </p>
          <button className="save-input-button" type="button" onClick={onFinish}>Back to main session</button>
        </div>
      )}
    </section>
  );
}
