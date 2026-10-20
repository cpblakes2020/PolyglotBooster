"use client";

import { useEffect, useMemo, useState } from "react";
import { SavedReview } from "@/components/review/SavedReview";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { SavedTaskRun } from "@/lib/reviews";
import { deleteReviews, listReviews, studyDeskReviewUrl, updateReview } from "@/lib/reviewsClient";
import type { PromptTemplate } from "@/lib/types";

type Sort = "newest" | "oldest";

// Every saved study session, in every language: search, filter by language
// and task, sort, give one a title, open it on the study desk, delete one or
// several at once.
export function SavedSessions() {
  const [runs, setRuns] = useState<SavedTaskRun[] | null>(null);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [task, setTask] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const providerId: LlmProviderId = "anthropic";

  useEffect(() => {
    listReviews().then(setRuns, (error) => setStatus(error instanceof Error ? error.message : "Saved sessions could not be loaded."));
    fetch("/api/templates").then((response) => response.ok ? response.json() : null).then((data: { templates?: PromptTemplate[] } | null) => {
      if (data?.templates) setTemplateNames(Object.fromEntries(data.templates.map((template) => [template.id, template.name])));
    }, () => {});
  }, []);

  const languages = useMemo(() => [...new Set((runs || []).map((run) => run.sourceLanguage))].sort(), [runs]);
  const tasks = useMemo(() => [...new Set((runs || []).map((run) => run.promptTemplateId))].sort((a, b) => (templateNames[a] || a).localeCompare(templateNames[b] || b)), [runs, templateNames]);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (runs || [])
      .filter((run) => !language || run.sourceLanguage === language)
      .filter((run) => !task || run.promptTemplateId === task)
      .filter((run) => {
        if (!words.length) return true;
        const haystack = [run.title, run.sourceText, run.result, run.notes, ...(run.followUps || []).flatMap((item) => [item.question, item.answer])].join("\n").toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .sort((a, b) => (sort === "newest" ? -1 : 1) * a.createdAt.localeCompare(b.createdAt));
  }, [runs, query, language, task, sort]);

  async function change(action: () => Promise<SavedTaskRun[]>, failure: string) {
    setBusy(true);
    try {
      const next = await action();
      setRuns(next);
      setSelected((current) => new Set([...current].filter((id) => next.some((run) => run.taskRunId === id))));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  }

  function toggle(taskRunId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(taskRunId)) next.delete(taskRunId); else next.add(taskRunId);
      return next;
    });
  }

  const allShownSelected = shown.length > 0 && shown.every((run) => selected.has(run.taskRunId));

  return (
    <section className="settings-panel utility-panel" aria-labelledby="sessions-title">
      <h2 id="sessions-title">Saved sessions{runs ? ` (${runs.length})` : ""}</h2>
      {runs === null && !status && <p className="anki-note">Loading…</p>}
      {status && <p className="example-status" role="status">{status}</p>}
      {runs && runs.length === 0 && <p className="anki-note">No saved sessions yet. On the study desk, run a task and click <b>Save for review</b>.</p>}
      {runs && runs.length > 0 && (
        <>
          <div className="sessions-filters">
            <input type="search" value={query} placeholder="Search text, results, notes…" aria-label="Search saved sessions" onChange={(event) => setQuery(event.target.value)} />
            <select value={language} aria-label="Language" onChange={(event) => setLanguage(event.target.value)}>
              <option value="">All languages</option>
              {languages.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={task} aria-label="Task" onChange={(event) => setTask(event.target.value)}>
              <option value="">All tasks</option>
              {tasks.map((item) => <option key={item} value={item}>{templateNames[item] || item}</option>)}
            </select>
            <select value={sort} aria-label="Sort" onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          <div className="sessions-bulk">
            <span className="anki-note">{shown.length === runs.length ? `${runs.length} sessions` : `${shown.length} of ${runs.length} shown`}</span>
            <label className="anki-checkbox"><input type="checkbox" checked={allShownSelected} disabled={!shown.length} onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((run) => run.taskRunId)))} /> Select all {shown.length} shown</label>
            {selected.size > 0 && (
              <button className="danger-button" type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete ${selected.size} saved session${selected.size === 1 ? "" : "s"}? This can't be undone.`)) void change(() => deleteReviews([...selected]), "The sessions could not be deleted."); }}>
                Delete {selected.size} selected
              </button>
            )}
          </div>
          {shown.length === 0 && <p className="anki-note">No saved sessions match.</p>}
          <SavedReview
            runs={shown}
            providerId={providerId}
            heading=""
            selected={selected}
            onSelect={toggle}
            templateNames={templateNames}
            openLabel="Open on the study desk"
            onOpen={(run) => { window.location.href = studyDeskReviewUrl(run.taskRunId); }}
            onUpdate={(run) => void change(() => updateReview(run.taskRunId, { notes: run.notes }), "Notes could not be saved.")}
            onRename={(run, title) => void change(() => updateReview(run.taskRunId, { title }), "The title could not be saved.")}
            onDelete={(taskRunId) => void change(() => deleteReviews([taskRunId]), "The session could not be deleted.")}
          />
        </>
      )}
    </section>
  );
}
