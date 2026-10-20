"use client";

import { useState, type ReactNode } from "react";
import { AudioPlayback } from "@/components/audio/AudioPlayback";
import { AnkiSelectionArea, studyContext } from "@/components/anki/AnkiSelectionArea";
import { FlashcardsToAnki, canSendFlashcardsToAnki } from "@/components/anki/FlashcardsToAnki";
import { SendToAnki, canSendToAnki } from "@/components/anki/SendToAnki";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { SavedTaskRun } from "@/lib/reviews";
import { downloadTaskRun } from "@/lib/exports";

type SavedReviewProps = {
  runs: SavedTaskRun[];
  providerId: LlmProviderId;
  onOpen: (run: SavedTaskRun) => void;
  onUpdate: (run: SavedTaskRun) => void;
  onDelete: (taskRunId: string) => void;
  // The section heading (default: the study desk's; "" for none).
  kicker?: string;
  heading?: string;
  // Shown under the list, e.g. a link to all saved sessions.
  footer?: ReactNode;
  // The organizer: a checkbox per review, a title you can give it, and the
  // task's name instead of its id.
  selected?: Set<string>;
  onSelect?: (taskRunId: string) => void;
  onRename?: (run: SavedTaskRun, title: string) => void;
  templateNames?: Record<string, string>;
  openLabel?: string;
};

export function SavedReview({ runs, providerId, onOpen, onUpdate, onDelete, kicker = "04 / Return to your work", heading = "Saved review", footer, selected, onSelect, onRename, templateNames, openLabel = "Open full size on the study desk ↑" }: SavedReviewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!runs.length && !footer) return null;

  return (
    <section className="review-section" aria-labelledby={heading ? "review-title" : undefined}>
      {heading && (
        <div className="template-heading">
          <div><p className="section-kicker">{kicker}</p><h2 id="review-title">{heading}</h2></div>
          <span className="panel-count">{runs.length} saved {runs.length === 1 ? "result" : "results"}</span>
        </div>
      )}
      <div className="review-list">
        {runs.map((run) => {
          const isExpanded = expandedId === run.taskRunId;
          return (
            <article className={`review-item${selected?.has(run.taskRunId) ? " selected" : ""}`} key={run.taskRunId}>
              <div className="review-item-head">
                {onSelect && <input className="review-select" type="checkbox" aria-label={`Select ${run.title || run.sourceText.slice(0, 30)}`} checked={selected?.has(run.taskRunId) || false} onChange={() => onSelect(run.taskRunId)} />}
                <button className="review-open" type="button" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? null : run.taskRunId)}>
                  <span className="review-item-main">
                    <strong>{run.title || `${run.sourceText.slice(0, 72)}${run.sourceText.length > 72 ? "..." : ""}`}</strong>
                    <small>{run.sourceLanguage} through {run.userLanguage} · {templateNames?.[run.promptTemplateId] || run.promptTemplateId}{run.flashcards?.length ? ` · ${run.flashcards.length} cards` : ""}{onSelect ? ` · ${new Date(run.createdAt).toLocaleDateString()}` : ""}</small>
                    {run.title && <small className="review-first-line">{run.sourceText.slice(0, 90)}{run.sourceText.length > 90 ? "..." : ""}</small>}
                  </span>
                  <span className="card-arrow">{isExpanded ? "▾" : "▸"}</span>
                </button>
              </div>
              {isExpanded && (
                <div className="review-detail">
                  <AnkiSelectionArea sourceLanguage={run.sourceLanguage} userLanguage={run.userLanguage} sourceText={run.sourceText} context={studyContext(run.result, run.followUps)} options={{ providerId, learnerLevel: run.learnerLevel, outputStyle: run.outputStyle }}>
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
                  </AnkiSelectionArea>
                  <button type="button" onClick={() => onOpen(run)}>{openLabel}</button>
                  {canSendToAnki(run.sourceLanguage, run.userLanguage, run.promptTemplateId) && <SendToAnki sourceText={run.sourceText} sourceLanguage={run.sourceLanguage} result={run.result} promptTemplateId={run.promptTemplateId} providerId={providerId} />}
                  {run.flashcards?.length && canSendFlashcardsToAnki(run.sourceLanguage, run.userLanguage) ? <FlashcardsToAnki cards={run.flashcards} sourceLanguage={run.sourceLanguage} options={{ providerId, learnerLevel: run.learnerLevel, outputStyle: run.outputStyle }} /> : null}
                </div>
              )}
              <div className="review-footer">
                {onRename && <input className="review-title-input" defaultValue={run.title || ""} aria-label={`Title for ${run.sourceText.slice(0, 30)}`} placeholder="Title (optional), e.g. Eijuin article, selective cards" maxLength={200} onBlur={(event) => { if (event.target.value.trim() !== (run.title || "")) onRename(run, event.target.value); }} />}
                <textarea className="review-notes" defaultValue={run.notes} aria-label={`Notes for ${run.sourceText.slice(0, 30)}`} placeholder="Add a note for later review..." onBlur={(event) => { if (event.target.value !== run.notes) onUpdate({ ...run, notes: event.target.value }); }} />
                <div className="review-actions">
                  <button type="button" onClick={() => downloadTaskRun(run)}>Download TXT</button>
                  <button className="danger-button" type="button" onClick={() => { if (window.confirm("Delete this saved review?")) onDelete(run.taskRunId); }}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {footer}
    </section>
  );
}

