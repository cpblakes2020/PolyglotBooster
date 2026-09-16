"use client";

import { useState } from "react";
import { AudioPlayback } from "@/components/audio/AudioPlayback";
import type { SavedTaskRun } from "@/lib/reviews";
import { downloadTaskRun } from "@/lib/exports";

type SavedReviewProps = {
  runs: SavedTaskRun[];
  onOpen: (run: SavedTaskRun) => void;
  onUpdate: (run: SavedTaskRun) => void;
  onDelete: (taskRunId: string) => void;
};

export function SavedReview({ runs, onOpen, onUpdate, onDelete }: SavedReviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!runs.length) return null;

  return (
    <section className="review-section" aria-labelledby="review-title">
      <div className="template-heading">
        <div><p className="section-kicker">04 / Return to your work</p><h2 id="review-title">Saved review</h2></div>
        <span className="panel-count">{runs.length} saved {runs.length === 1 ? "result" : "results"}</span>
      </div>
      <div className="review-list">
        {runs.map((run) => {
          const isExpanded = expandedId === run.taskRunId;
          return (
            <article className="review-item" key={run.taskRunId}>
              <button className="review-open" type="button" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? null : run.taskRunId)}>
                <span className="review-item-main"><strong>{run.sourceText.slice(0, 72)}{run.sourceText.length > 72 ? "..." : ""}</strong><small>{run.sourceLanguage} through {run.userLanguage} · {run.promptTemplateId}</small></span>
                <span className="card-arrow">{isExpanded ? "▾" : "▸"}</span>
              </button>
              {isExpanded && (
                <div className="review-detail">
                  <label className="text-label">Source text</label>
                  <textarea className="review-detail-text" readOnly value={run.sourceText} />
                  {run.audio && <AudioPlayback url={run.audio.url} label="Play the source text aloud" />}
                  <label className="text-label">Result</label>
                  <textarea className="review-detail-text" readOnly value={run.result} />
                  {run.followUps && run.followUps.length > 0 && (
                    <div className="follow-up-section">
                      {run.followUps.map((item, index) => (
                        <div className="follow-up-entry" key={`${index}-${item.createdAt}`}>
                          <p className="follow-up-question"><strong>Q:</strong> {item.question}</p>
                          <p className="follow-up-answer"><strong>A:</strong> {item.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => onOpen(run)}>Open in workspace to edit</button>
                </div>
              )}
              <div className="review-footer">
                <textarea className="review-notes" defaultValue={run.notes} aria-label={`Notes for ${run.sourceText.slice(0, 30)}`} placeholder="Add a note for later review..." onBlur={(event) => { if (event.target.value !== run.notes) onUpdate({ ...run, notes: event.target.value }); }} />
                <div className="review-actions">
                  <button type="button" onClick={() => downloadTaskRun(run, "txt")}>Download TXT</button>
                  <button type="button" onClick={() => downloadTaskRun(run, "csv")}>Anki CSV</button>
                  <button type="button" onClick={() => downloadTaskRun(run, "tsv")}>Anki TSV</button>
                  <button className="danger-button" type="button" onClick={() => { if (window.confirm("Delete this saved review?")) onDelete(run.taskRunId); }}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

