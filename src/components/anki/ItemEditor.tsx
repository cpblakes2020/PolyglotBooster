"use client";

import { useState } from "react";
import { analyze, describeSelection, type AnalysisOptions } from "@/components/anki/api";
import { itemNotesHtml, saveItem, type ItemDraft, type ItemOutcome } from "@/components/anki/saveItem";
import { BranchQueue } from "@/components/anki/BranchQueue";
import { TagInput, parseTags, useSelectionMenu } from "@/components/anki/selection";
import { classifyItem, type ItemKind } from "@/lib/anki/classify";
import { cleanField } from "@/lib/anki/fields";
import type { BranchItem } from "@/lib/anki/prompts";
import { notesField, readingLabel, readingLanguages, sentenceTemplateId, wordTemplateId, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";

export type { ItemOutcome };

type ItemEditorProps = {
  item: BranchItem;
  language: AnkiLanguage;
  // Where the item was seen, for the back-reference line, e.g. "ลาก่อน (goodbye)".
  seenIn: string;
  // An existing note with exactly this text, if any.
  match: VocabNote | null;
  options: AnalysisOptions;
  // Depth of the branch this item belongs to.
  depth: number;
  tagSuggestions: string[];
  onDone: (outcome: ItemOutcome) => void;
};

// Adds one item found in an analysis to Anki: as a new note with its brief
// comment, as a new note with a fresh full analysis, or — when the item is
// already in Anki — as a comment appended to that note. New notes get
// learning-language audio straight away. An item with a full analysis can
// itself be branched from, one level deeper.
export function ItemEditor({ item, language, seenIn, match, options, depth, tagSuggestions, onDone }: ItemEditorProps) {
  const [text, setText] = useState(item.text);
  const [english, setEnglish] = useState(item.english);
  const [reading, setReading] = useState(item.reading);
  const [comment, setComment] = useState(item.comment);
  const [target, setTarget] = useState<"new" | "existing">(match ? "existing" : "new");
  const [kind, setKind] = useState<ItemKind>(() => classifyItem(item.text, language).kind);
  const [analysis, setAnalysis] = useState("");
  const [newTags, setNewTags] = useState((item.tags || []).join(" "));
  const [subBranch, setSubBranch] = useState<{ items?: BranchItem[] } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const selectionMenu = useSelectionMenu((selected) => void branchSelection(selected));

  const usesReading = readingLanguages.has(language);
  const matchEnglish = match ? cleanField(match.fields.English || "", "English").text : "";
  const canBranch = target === "new" && Boolean(analysis.trim());

  const draft: ItemDraft = { language, text, english, reading, comment, seenIn, match, target, analysis, kind, tags: parseTags(newTags) };
  const preview = itemNotesHtml(draft);

  async function runAnalysis() {
    setBusy(true);
    setStatus("Analyzing...");
    try {
      setAnalysis(await analyze(text.trim(), language, kind === "word" ? wordTemplateId(language) : sentenceTemplateId(language), options));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The analysis could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function branchSelection(selected: string) {
    if (!canBranch) return;
    setBusy(true);
    setStatus(`Looking up “${selected.slice(0, 40)}”...`);
    try {
      const found = await describeSelection(selected, analysis, language, options.providerId);
      setStatus("");
      setSubBranch({ items: [found] });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The selection could not be looked up.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setStatus("Saving to Anki...");
    try {
      const { outcome, audioFailed } = await saveItem(draft, setStatus);
      if (audioFailed) window.alert("The note was added, but its audio couldn't be recorded. A Bulk audio run will add it later.");
      onDone(outcome);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be saved.");
      setBusy(false);
    }
  }

  // A deeper branch replaces this editor until it finishes; this item's
  // unsaved work is kept and shown again afterwards.
  if (subBranch) {
    return (
      <BranchQueue
        language={language}
        parentText={text.trim()}
        parentEnglish={english.trim()}
        analysis={analysis}
        options={options}
        items={subBranch.items}
        depth={depth + 1}
        tagSuggestions={tagSuggestions}
        onFinish={() => setSubBranch(null)}
      />
    );
  }

  return (
    <div className="anki-item-editor">
      {match && (
        <div className="anki-warning" role="note">
          <p><b>Already in Anki:</b> a note has exactly this {language} text{matchEnglish ? <> (&ldquo;{matchEnglish}&rdquo;)</> : ""}.</p>
          <label className="anki-checkbox"><input type="radio" checked={target === "existing"} onChange={() => setTarget("existing")} /> Add the comment to that note&apos;s {notesField(language)}</label>
          <label className="anki-checkbox"><input type="radio" checked={target === "new"} onChange={() => setTarget("new")} /> Add a new note anyway</label>
        </div>
      )}

      <div className="anki-item-fields">
        <label className="anki-field-edit">{language}
          <input value={text} disabled={target === "existing"} onChange={(event) => setText(event.target.value)} />
        </label>
        {target === "new" && (
          <label className="anki-field-edit">English
            <input value={english} onChange={(event) => setEnglish(event.target.value)} />
          </label>
        )}
        {target === "new" && usesReading && (
          <label className="anki-field-edit">{readingLabel(language)}
            <input value={reading} onChange={(event) => setReading(event.target.value)} />
          </label>
        )}
        <label className="anki-field-edit">Brief comment
          <input value={comment} onChange={(event) => setComment(event.target.value)} />
        </label>
      </div>

      {target === "new" && (
        <div className="anki-template-choice" role="radiogroup" aria-label="Analysis template">
          <label><input type="radio" checked={kind === "word"} onChange={() => setKind("word")} /> Word analysis</label>
          <label><input type="radio" checked={kind === "sentence"} onChange={() => setKind("sentence")} /> Sentence guide</label>
          <button className="preview-prompt-button" type="button" disabled={busy || !text.trim()} onClick={() => void runAnalysis()}>{analysis ? "Regenerate analysis" : "Analyze fully (optional)"}</button>
          {analysis && <button className="text-button" type="button" disabled={busy} onClick={() => setAnalysis("")}>Drop analysis</button>}
        </div>
      )}
      {canBranch && (
        <label className="anki-field-edit">Analysis (Markdown, editable)
          <textarea value={analysis} onChange={(event) => setAnalysis(event.target.value)} />
        </label>
      )}

      <p className="result-label">{notesField(language)} as it will appear under &ldquo;more&rdquo;</p>
      <div className="anki-card-preview" onContextMenu={canBranch ? selectionMenu.onContextMenu : undefined} dangerouslySetInnerHTML={{ __html: preview }} />
      {selectionMenu.element}
      {canBranch && (
        <div className="input-action-row">
          <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => setSubBranch({})}>Branch from examples</button>
          <span className="anki-note">Or right-click selected text in the preview. You&apos;ll come back here afterwards.</span>
        </div>
      )}

      <div className="anki-tag-row">
        <TagInput id={`anki-item-tags-${depth}`} value={newTags} onChange={setNewTags} current={target === "existing" && match ? match.tags : []} suggestions={tagSuggestions} />
      </div>

      <div className="result-actions">
        <button className="save-input-button" type="button" disabled={busy} onClick={() => void save()}>
          {target === "existing" ? "Add comment to existing note" : analysis ? "Add note with analysis" : "Add note with brief comment"}
        </button>
        <button className="text-button" type="button" disabled={busy} onClick={() => onDone({ kind: "skipped" })}>Skip</button>
        {status && <span className="example-status" role="status">{status}</span>}
      </div>
    </div>
  );
}
