"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { anki } from "@/lib/anki/connect";
import { htmlToText } from "@/lib/anki/fields";
import { cleanTag, isProtectedTag, parseRules, planChanges, tagKind, tagKindLabels, type Change, type TagKind } from "@/lib/anki/tags";
import type { VocabNote } from "@/lib/anki/vocab";

type Note = VocabNote & { modelName: string };
type TagInfo = { tag: string; notes: Note[]; kind: TagKind };

// One applied set of changes, kept so it can be undone: for each changed tag,
// the notes that had it, and for each new tag the notes that didn't already
// have it (so undo removes only what this change added).
type LogEntry = { at: string; changes: { tag: string; targets: string[]; noteIds: number[]; added: Record<string, number[]> }[] };
const logKey = "pb:tag-log";

function readLog(): LogEntry[] {
  try { return JSON.parse(window.localStorage.getItem(logKey) || "[]") as LogEntry[]; } catch { return []; }
}
function writeLog(log: LogEntry[]) {
  try { window.localStorage.setItem(logKey, JSON.stringify(log.slice(-10))); } catch { /* storage unavailable */ }
}

const hasTag = (note: Note, tag: string) => note.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
const sampleText = (note: Note) => htmlToText(["Thai", "Japanese", "Indonesian", "Mandarin", "Balinese", "Spanish", "French", "English"].map((f) => note.fields[f]).find((v) => v?.trim()) || "").slice(0, 40);

const startingRules = `# One rule per line: old → new. * matches any text; leave the right side empty to delete.
# Examples (edit or delete them — nothing changes until you Apply):
# TSP-* → source::TSP::*
# STT-* → source::STT::*
# STT* → source::STT::*
# RT* → source::RT::*
# food → topic::food
`;

// The Tags page: every tag with its notes, bulk rename / merge / nest /
// delete, rules with wildcards, a preview, and undo. PolyglotBooster's own
// pb:: tags and Anki's leech/marked are never touched.
export function TagManager() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [manual, setManual] = useState<Map<string, string[]>>(new Map());
  const [rulesText, setRulesText] = useState(startingRules);
  const [foldDates, setFoldDates] = useState(false);
  const [datePrefix, setDatePrefix] = useState("diary");
  const [sourcePrefix, setSourcePrefix] = useState("source");
  const [actionValue, setActionValue] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);

  const load = useCallback(async () => {
    setStatus("Loading your notes and tags from Anki...");
    try {
      setNotes(await anki.allNotes());
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Anki could not be reached.");
    }
  }, []);

  useEffect(() => { void load(); setLog(readLog()); }, [load]);

  const tags = useMemo<TagInfo[]>(() => {
    if (!notes) return [];
    const byTag = new Map<string, Note[]>();
    for (const note of notes) for (const tag of note.tags) {
      const key = [...byTag.keys()].find((existing) => existing.toLowerCase() === tag.toLowerCase()) ?? tag;
      byTag.set(key, [...(byTag.get(key) || []), note]);
    }
    return [...byTag].map(([tag, list]) => ({ tag, notes: list, kind: tagKind(tag) })).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  }, [notes]);

  const { rules, errors } = useMemo(() => parseRules(rulesText), [rulesText]);
  const plan = useMemo<Change[]>(() => planChanges(tags.map((t) => t.tag), manual, rules, foldDates ? { datePrefix, sourcePrefix } : null), [tags, manual, rules, foldDates, datePrefix, sourcePrefix]);
  const noteCount = (tag: string) => tags.find((t) => t.tag === tag)?.notes.length || 0;

  const visible = tags.filter((t) => (showSystem || !isProtectedTag(t.tag)) && t.tag.toLowerCase().includes(filter.trim().toLowerCase()));
  const groups = (Object.keys(tagKindLabels) as TagKind[]).map((kind) => ({ kind, items: visible.filter((t) => t.kind === kind) })).filter((group) => group.items.length);

  function toggle(tag: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(tag)) next.delete(tag); else next.add(tag); return next; });
  }

  // Selection actions go into the plan as choices made by hand.
  function choose(make: (tag: string) => string[]) {
    setManual((current) => { const next = new Map(current); for (const tag of selected) next.set(tag, make(tag)); return next; });
    setSelected(new Set());
    setActionValue("");
  }

  async function apply() {
    if (!notes || !plan.length) return;
    if (!window.confirm(`Change ${plan.length} tag${plan.length === 1 ? "" : "s"} on ${new Set(plan.flatMap((c) => tags.find((t) => t.tag === c.tag)?.notes.map((n) => n.noteId) || [])).size} notes?\n\nTip: make a backup first in Anki (File → Create Backup).`)) return;
    setBusy(true);
    const entry: LogEntry = { at: new Date().toISOString(), changes: [] };
    try {
      for (const [index, change] of plan.entries()) {
        setStatus(`Changing ${index + 1} of ${plan.length}: ${change.tag}...`);
        const tagged = notes.filter((note) => hasTag(note, change.tag));
        const ids = tagged.map((note) => note.noteId);
        const added = Object.fromEntries(change.targets.map((target) => [target, tagged.filter((note) => !hasTag(note, target)).map((note) => note.noteId)]));
        // Remove first, then add: a change only in capitals (stt22 → STT22)
        // would otherwise be removed again, as Anki ignores case.
        await anki.removeTags(ids, [change.tag]);
        if (change.targets.length) await anki.addTags(ids, change.targets);
        entry.changes.push({ tag: change.tag, targets: change.targets, noteIds: ids, added });
      }
      await anki.clearUnusedTags();
      const next = [...readLog(), entry];
      writeLog(next);
      setLog(next);
      setManual(new Map());
      setStatus(`Done: ${plan.length} tag${plan.length === 1 ? "" : "s"} changed.`);
    } catch (error) {
      if (entry.changes.length) { const next = [...readLog(), entry]; writeLog(next); setLog(next); }
      setStatus(`${error instanceof Error ? error.message : "The tags could not be changed."} (${entry.changes.length} of ${plan.length} were changed; Undo reverses them.)`);
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function undo() {
    const last = log[log.length - 1];
    if (!last || !window.confirm(`Undo the tag changes made ${new Date(last.at).toLocaleString()} (${last.changes.length} tags)?`)) return;
    setBusy(true);
    try {
      for (const change of [...last.changes].reverse()) {
        setStatus(`Undoing ${change.tag}...`);
        for (const [target, ids] of Object.entries(change.added)) if (ids.length) await anki.removeTags(ids, [target]);
        await anki.addTags(change.noteIds, [change.tag]);
      }
      await anki.clearUnusedTags();
      const next = log.slice(0, -1);
      writeLog(next);
      setLog(next);
      setStatus("Undone.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The changes could not be undone.");
    } finally {
      setBusy(false);
      await load();
    }
  }

  if (!notes) return <div className="settings-panel anki-panel"><p className="example-status" role="status">{status}</p></div>;

  const protectedCount = tags.filter((t) => isProtectedTag(t.tag)).length;
  const untagged = notes.filter((note) => !note.tags.some((tag) => !isProtectedTag(tag))).length;

  return (
    <div className="settings-panel anki-panel tag-manager">
      <p className="anki-note">
        {tags.length - protectedCount} tags on {notes.length} notes ({untagged} notes have only PolyglotBooster&apos;s own tags or none).
        {" "}{protectedCount} system tags (pb::…, leech) are hidden and never changed{" "}
        <label className="anki-checkbox tag-inline"><input type="checkbox" checked={showSystem} onChange={(event) => setShowSystem(event.target.checked)} /> show them</label>
      </p>

      <div className="tag-toolbar">
        <input aria-label="Filter tags" value={filter} placeholder="Filter tags…" onChange={(event) => setFilter(event.target.value)} />
        {selected.size > 0 && (
          <span className="tag-actions">
            <b>{selected.size} selected:</b>
            <input aria-label="New tag or parent" value={actionValue} placeholder="new tag, or parent for Nest" onChange={(event) => setActionValue(event.target.value)} />
            <button className="preview-prompt-button" type="button" disabled={!cleanTag(actionValue)} onClick={() => choose(() => [cleanTag(actionValue)])}>{selected.size > 1 ? "Merge into" : "Rename to"}</button>
            <button className="preview-prompt-button" type="button" disabled={!cleanTag(actionValue)} onClick={() => choose((tag) => [`${cleanTag(actionValue)}::${tag}`])}>Nest under</button>
            <button className="danger-button" type="button" onClick={() => choose(() => [])}>Delete</button>
            <button className="text-button" type="button" onClick={() => setSelected(new Set())}>Clear selection</button>
          </span>
        )}
      </div>

      {groups.map((group) => (
        <section className="tag-group" key={group.kind}>
          <p className="result-label">{tagKindLabels[group.kind]} ({group.items.length})
            <button className="text-button" type="button" onClick={() => setSelected((current) => new Set([...current, ...group.items.filter((t) => !isProtectedTag(t.tag)).map((t) => t.tag)]))}>select all</button>
          </p>
          <ul className="tag-list">
            {group.items.map((item) => {
              const change = plan.find((c) => c.tag === item.tag);
              const languages = [...new Set(item.notes.map((note) => htmlToText(note.fields.Origin || "") || note.modelName))].slice(0, 3);
              return (
                <li key={item.tag} className={change ? "tag-planned" : undefined}>
                  <label className="tag-name">
                    <input type="checkbox" disabled={isProtectedTag(item.tag)} checked={selected.has(item.tag)} onChange={() => toggle(item.tag)} />
                    <span>{item.tag}</span>
                  </label>
                  <button className="text-button tag-count" type="button" onClick={() => setExpanded(expanded === item.tag ? null : item.tag)}>{item.notes.length} note{item.notes.length === 1 ? "" : "s"}</button>
                  <small>{languages.join(", ")}</small>
                  {change && <small className="tag-arrow">→ {change.targets.join(" ") || "deleted"}</small>}
                  {expanded === item.tag && <span className="tag-samples">{item.notes.slice(0, 8).map(sampleText).join(" · ")}{item.notes.length > 8 ? " …" : ""}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="tag-rules">
        <p className="result-label">Rules</p>
        <textarea rows={8} value={rulesText} onChange={(event) => setRulesText(event.target.value)} aria-label="Tag rules" />
        {errors.map((error) => <p className="anki-failures" key={error}>{error}</p>)}
        <label className="anki-checkbox">
          <input type="checkbox" checked={foldDates} onChange={(event) => setFoldDates(event.target.checked)} />
          Fold date tags: 20180410 → <input className="tag-prefix" value={datePrefix} onChange={(event) => setDatePrefix(event.target.value)} aria-label="Parent for dates" />::2018-04-10, and a name after the date (20200417Glossika) → <input className="tag-prefix" value={sourcePrefix} onChange={(event) => setSourcePrefix(event.target.value)} aria-label="Parent for names" />::Glossika
        </label>
      </section>

      <section className="tag-plan">
        <p className="result-label">Preview — {plan.length ? `${plan.length} tag${plan.length === 1 ? "" : "s"} will change` : "nothing will change yet"}</p>
        {plan.length > 0 && (
          <table className="anki-branch-table">
            <thead><tr><th>Tag</th><th>Becomes</th><th>Notes</th><th>Why</th><th /></tr></thead>
            <tbody>
              {plan.map((change) => (
                <tr key={change.tag}>
                  <td>{change.tag}</td>
                  <td>{change.targets.join(" ") || <i>deleted</i>}</td>
                  <td>{noteCount(change.tag)}</td>
                  <td><small>{change.reason}</small></td>
                  <td>{change.reason === "chosen" && <button className="text-button" type="button" onClick={() => setManual((current) => { const next = new Map(current); next.delete(change.tag); return next; })}>remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="result-actions">
          <button className="save-input-button" type="button" disabled={busy || !plan.length || errors.length > 0} onClick={() => void apply()}>Apply {plan.length || ""} change{plan.length === 1 ? "" : "s"}</button>
          {log.length > 0 && <button className="text-button" type="button" disabled={busy} onClick={() => void undo()}>Undo last change ({new Date(log[log.length - 1].at).toLocaleString()})</button>}
          <button className="text-button" type="button" disabled={busy} onClick={() => void load()}>Reload from Anki</button>
          {status && <span className="example-status" role="status">{status}</span>}
        </div>
        <p className="anki-note">Changes happen in Anki right away; sync afterwards so your phone gets them. Before a big change, make an Anki backup (File → Create Backup).</p>
      </section>
    </div>
  );
}
