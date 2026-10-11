"use client";

import { useEffect, useRef, useState } from "react";
import { extractItems, type AnalysisOptions } from "@/components/anki/api";
import { ItemEditor } from "@/components/anki/ItemEditor";
import { saveItem, type ItemOutcome } from "@/components/anki/saveItem";
import { classifyItem } from "@/lib/anki/classify";
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
  // Given: these items instead of extracting them from the analysis — a
  // right-clicked selection (worked through directly) or, with pick, a
  // flashcard list to choose from.
  items?: BranchItem[];
  pick?: boolean;
  // Label for leaving a finished top-level branch.
  doneLabel?: string;
  // Tags every item in this batch shares (e.g. a book-chapter tag), offered
  // for the batch's items that are already in Anki too.
  batchTags?: string[];
  // 1 for a branch off the main session, 2 for a branch off an item in
  // that branch, and so on.
  depth: number;
  tagSuggestions: string[];
  onFinish: () => void;
  // Heading for a pick list (default "Flashcards to Anki").
  title?: string;
  // Told what happened to each item, e.g. to update the saved-for-later list.
  onItemDone?: (item: BranchItem, outcome: ItemOutcome["kind"] | "deleted") => void;
  // Items can be deleted (from the saved-for-later list) as well as skipped.
  deletable?: boolean;
};

type Row = { item: BranchItem; match: VocabNote | null; selected: boolean };
type Tally = { added: number; commented: number; skipped: number; deleted: number };

const kindLabels = { example: "Example", related: "Related", register: "Register", vocabulary: "Vocabulary", sentence: "Sentence" } as const;

export function BranchQueue({ language, parentText, parentEnglish, analysis, options, items, pick = false, doneLabel = "Back to main session", batchTags = [], depth, tagSuggestions, onFinish, title = "Flashcards to Anki", onItemDone, deletable = false }: BranchQueueProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [queue, setQueue] = useState<Row[] | null>(null);
  const [position, setPosition] = useState(0);
  const [tally, setTally] = useState<Tally>({ added: 0, commented: 0, skipped: 0, deleted: 0 });
  const [status, setStatus] = useState("");
  const [tagExisting, setTagExisting] = useState(true);
  // Cleaned learning-language text -> note, for spotting items already in Anki.
  const [index, setIndex] = useState<Map<string, VocabNote>>(new Map());
  // "Add all": progress while items are saved with their defaults.
  const [bulk, setBulk] = useState<{ done: number; total: number; failures: string[] } | null>(null);
  const stopBulk = useRef(false);

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
        if (items && !pick) setQueue(built);
        setStatus(built.length ? "" : "No separate items were found in this analysis.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "The items could not be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, [analysis, items, pick, language, options.providerId, parentText]);

  // Items already in Anki that won't be worked through still belong to the
  // batch, so they can get its tags without opening each one.
  const untickedExisting = (rows || []).filter((row) => row.match && !row.selected);
  const tagsExisting = batchTags.length > 0 && tagExisting && untickedExisting.length > 0;

  async function tagUntickedExisting() {
    if (!tagsExisting) return true;
    setStatus(`Tagging ${untickedExisting.length} cards already in Anki...`);
    try {
      await anki.addTags(untickedExisting.map((row) => row.match!.noteId), batchTags);
      setStatus("");
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The existing cards could not be tagged.");
      return false;
    }
  }

  // Saves items with the editor's defaults, without opening each one: a new
  // note with the brief explanations (and audio), or — for an item already in
  // Anki — the comment added to that note. Tags are the item's own.
  async function addAll(toAdd: Row[], queueLength: number, firstPosition: number) {
    stopBulk.current = false;
    const known = new Map(index);
    const failures: string[] = [];
    setBulk({ done: 0, total: toAdd.length, failures });
    let processed = 0;
    for (const { item } of toAdd) {
      if (stopBulk.current) break;
      const key = cleanField(item.text, language).text;
      const match = known.get(key) || null;
      try {
        const { outcome } = await saveItem({
          language, text: item.text, english: item.english, reading: item.reading, comment: item.comment, explanation: item.explanation, seenIn: item.seenIn || seenIn,
          match, target: match ? "existing" : "new", analysis: "", kind: classifyItem(item.text, language).kind, tags: item.tags || [],
        });
        if (outcome.kind === "added") known.set(key, outcome.note);
        setTally((current) => ({ ...current, [outcome.kind]: current[outcome.kind] + 1 }));
        onItemDone?.(item, outcome.kind);
      } catch (error) {
        failures.push(`${item.text}: ${error instanceof Error ? error.message : "failed"}`);
      }
      processed += 1;
      setBulk({ done: processed, total: toAdd.length, failures: [...failures] });
    }
    setIndex(known);
    // A stop leaves the rest in the queue to review one at a time.
    setPosition(stopBulk.current ? firstPosition + processed : queueLength);
  }

  async function addAllFromPicker() {
    if (!rows || !(await tagUntickedExisting())) return;
    const selected = rows.filter((row) => row.selected);
    setQueue(selected);
    setPosition(0);
    await addAll(selected, selected.length, 0);
  }

  async function start() {
    if (!rows) return;
    if (!(await tagUntickedExisting())) return;
    setQueue(rows.filter((row) => row.selected));
  }

  function toggle(rowIndex: number) {
    setRows((current) => current && current.map((row, i) => i === rowIndex ? { ...row, selected: !row.selected } : row));
  }

  // Deleting from the saved-for-later list: the unticked items in the pick
  // list, or the item being shown.
  function deleteUnticked() {
    if (!rows) return;
    for (const row of rows) if (!row.selected) onItemDone?.(row.item, "deleted");
    setRows(rows.filter((row) => row.selected));
  }

  function handleDeleted() {
    if (current) onItemDone?.(current.item, "deleted");
    setTally((count) => ({ ...count, deleted: count.deleted + 1 }));
    setPosition((value) => value + 1);
  }

  function handleDone(outcome: ItemOutcome) {
    if (current) onItemDone?.(current.item, outcome.kind);
    if (outcome.kind === "added") {
      // Later items with the same text should now show as already in Anki.
      const note = outcome.note;
      setIndex((current) => new Map(current).set(cleanField(note.fields[language] || "", language).text, note));
    }
    setTally((current) => ({ ...current, [outcome.kind]: current[outcome.kind] + 1 }));
    setPosition((current) => current + 1);
  }

  const backLabel = depth > 1 ? "Back to previous branch" : doneLabel;
  const current = queue?.[position];
  const finished = queue !== null && position >= queue.length;

  return (
    <section className="anki-branch">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">{depth > 1 ? `Branch · level ${depth}` : pick ? title : "Branch"}</p>
          {seenIn && <p className="anki-branch-source">From {seenIn}</p>}
        </div>
        <button className="text-button" type="button" onClick={onFinish}>{finished ? backLabel : depth > 1 ? "Cancel this branch" : pick ? "Close" : "Cancel branch"}</button>
      </div>

      {status && <p className="example-status" role="status">{status}</p>}

      {rows && !queue && rows.length > 0 && (
        <>
          <p className="anki-branch-select">
            Select <button className="text-button" type="button" onClick={() => setRows(rows.map((row) => ({ ...row, selected: true })))}>all</button>
            {" · "}<button className="text-button" type="button" onClick={() => setRows(rows.map((row) => ({ ...row, selected: false })))}>none</button>
          </p>
          <table className="anki-branch-table">
            <thead><tr><th /><th>{language}</th><th>English</th><th>Explanation</th><th /></tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.item.text} className={row.match ? "in-anki" : undefined}>
                  <td><input type="checkbox" aria-label={`Include ${row.item.text}`} checked={row.selected} onChange={() => toggle(rowIndex)} /></td>
                  <td><span className="anki-branch-text">{row.item.text}</span>{row.item.reading && <small>{row.item.reading}</small>}</td>
                  <td>{row.item.english}</td>
                  <td>{row.item.explanation}{row.item.comment && <small>{row.item.comment}</small>}</td>
                  <td><span className="anki-branch-kind">{kindLabels[row.item.kind]}</span>{row.match && <span className="anki-branch-badge">In Anki</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="result-actions">
            <button className="save-input-button" type="button" disabled={!rows.some((row) => row.selected) && !tagsExisting} onClick={() => void start()}>
              {rows.some((row) => row.selected) ? `Start branch (${rows.filter((row) => row.selected).length})` : `Tag ${untickedExisting.length} existing cards`}
            </button>
            {rows.some((row) => row.selected) && (
              <button className="preview-prompt-button" type="button" disabled={bulk !== null} onClick={() => void addAllFromPicker()}>Add all {rows.filter((row) => row.selected).length} with brief explanations</button>
            )}
            {batchTags.length > 0 && untickedExisting.length > 0 && (
              <label className="anki-checkbox"><input type="checkbox" checked={tagExisting} onChange={(event) => setTagExisting(event.target.checked)} /> Also tag the {untickedExisting.length} unticked card{untickedExisting.length === 1 ? "" : "s"} already in Anki with {batchTags.join(" ")}</label>
            )}
            {deletable && rows.some((row) => !row.selected) && (
              <button className="text-button" type="button" disabled={bulk !== null} onClick={deleteUnticked}>Delete the {rows.filter((row) => !row.selected).length} unticked from the list</button>
            )}
            <span className="anki-note">Items already in Anki start unticked. Tick one to add its explanations to that note, or add it as a new note anyway.{deletable ? " Unticked items stay saved for later unless you delete them." : ""}</span>
          </div>
        </>
      )}

      {bulk && (bulk.done < bulk.total && !finished) && (
        <div className="result-actions">
          <span className="anki-progress"><progress max={bulk.total} value={bulk.done} /> Adding {bulk.done} of {bulk.total}...</span>
          <button className="danger-button" type="button" onClick={() => { stopBulk.current = true; }}>Stop</button>
        </div>
      )}
      {bulk && bulk.failures.length > 0 && (
        <ul className="anki-failures">{bulk.failures.slice(0, 30).map((failure) => <li key={failure}>{failure}</li>)}</ul>
      )}

      {current && !(bulk && bulk.done < bulk.total) && (
        <>
          {queue.length > 1 && (
            <p className="anki-note">
              Item {position + 1} of {queue.length} · {kindLabels[current.item.kind]}
              {queue.length - position > 1 && <> · <button className="text-button" type="button" onClick={() => void addAll(queue.slice(position), queue.length, position)}>Add the remaining {queue.length - position} with brief explanations</button></>}
            </p>
          )}
          <ItemEditor
            key={`${position}-${current.item.text}`}
            item={current.item}
            language={language}
            seenIn={current.item.seenIn || seenIn}
            match={index.get(cleanField(current.item.text, language).text) || null}
            options={options}
            depth={depth}
            tagSuggestions={tagSuggestions}
            onDone={handleDone}
            onDelete={deletable ? handleDeleted : undefined}
          />
        </>
      )}

      {finished && (
        <div className="result-actions">
          <p className="anki-note">
            {pick ? "Done" : "Branch finished"}: {tally.added} added, {tally.commented} existing note{tally.commented === 1 ? "" : "s"} given the explanations, {tally.skipped} skipped{deletable ? ` (kept for later), ${tally.deleted} deleted from the list` : ""}.
          </p>
          <button className="save-input-button" type="button" onClick={onFinish}>{backLabel}</button>
        </div>
      )}
    </section>
  );
}
