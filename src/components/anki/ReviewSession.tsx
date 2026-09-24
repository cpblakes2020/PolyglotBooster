"use client";

import { useEffect, useMemo, useState } from "react";
import { analyze, assist, describeSelection, type AnalysisOptions } from "@/components/anki/api";
import { BranchQueue } from "@/components/anki/BranchQueue";
import { TagInput, parseTags, useSelectionMenu } from "@/components/anki/selection";
import { classifyItem, type Classification, type ItemKind } from "@/lib/anki/classify";
import { anki, ankiSearchValue } from "@/lib/anki/connect";
import { cleanField, composeNotesField, escapeHtml, existingAnalysis, existingReading, fieldNeedsCleanup, hasRubyReading, japaneseRubyReading, markdownToAnkiHtml } from "@/lib/anki/fields";
import type { BranchItem } from "@/lib/anki/prompts";
import { analysisLanguage, ankiLanguages, audioField, notesField, pbTags, sentenceTemplateId, wordTemplateId, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";
import { llmProviderOptions, type LlmProviderId } from "@/lib/llm/provider";
import type { LearnerLevel, OutputStyle } from "@/lib/types";

const studyLanguages = ankiLanguages.filter((language) => language !== "English");
const learnerLevels: LearnerLevel[] = ["Beginner", "Intermediate", "Advanced"];
const outputStyles: OutputStyle[] = ["Concise", "Detailed", "Literal", "Natural", "Formal", "Informal"];

type Draft = {
  classification: Classification;
  kind: ItemKind;
  cleanedText: string;
  fieldText: string;
  replaceField: boolean;
  reading: string;
  analysis: string;
};

function newDraft(note: VocabNote, language: AnkiLanguage): Draft {
  const raw = note.fields[language] || "";
  const cleaned = cleanField(raw, language);
  const classification = classifyItem(cleaned.text, language);
  // A previously analyzed note opens with its saved analysis and template.
  const savedTemplate = note.tags.find((tag) => tag.startsWith(`${pbTags.analyzedPrefix(language)}::`));
  const savedKind: ItemKind | undefined = savedTemplate?.endsWith(sentenceTemplateId(language)) ? "sentence" : savedTemplate?.endsWith(wordTemplateId(language)) ? "word" : undefined;
  return {
    classification,
    kind: savedKind || classification.kind,
    cleanedText: cleaned.text,
    fieldText: cleaned.text,
    replaceField: fieldNeedsCleanup(raw, cleaned),
    reading: existingReading(note.fields[notesField(language)] || ""),
    analysis: existingAnalysis(note.fields[notesField(language)] || ""),
  };
}

type Branch = { items?: BranchItem[] };

function soundFilename(field: string) {
  return field.match(/\[sound:([^\]]+)\]/)?.[1];
}

async function playAnkiSound(field: string) {
  const filename = soundFilename(field);
  if (!filename) return;
  const data = await anki.retrieveMedia(filename);
  if (data) await new Audio(`data:audio/mpeg;base64,${data}`).play();
}

export function ReviewSession() {
  const [language, setLanguage] = useState<AnkiLanguage>("Thai");
  const [extraQuery, setExtraQuery] = useState("");
  const [options, setOptions] = useState<AnalysisOptions>({ providerId: "anthropic", learnerLevel: "Intermediate", outputStyle: "Concise" });
  const [queue, setQueue] = useState<VocabNote[] | null>(null);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  // "session" works through unanalyzed notes; "search" through notes found
  // by text, analyzed or not.
  const [mode, setMode] = useState<"session" | "search">("session");
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState<Branch | null>(null);
  // Tags to add to the current note on save, and the collection's tags to suggest.
  const [newTags, setNewTags] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const selectionMenu = useSelectionMenu((text) => void addSelection(text));

  useEffect(() => {
    anki.getTags().then((tags) => setTagSuggestions(tags.filter((tag) => !tag.startsWith("pb::")).sort()), () => {});
  }, []);

  const note = queue?.[index];
  const usesReading = language === "Thai" || (language === "Japanese" && !hasRubyReading(note?.fields[notesField(language)] || ""));

  function goTo(nextIndex: number, notes = queue) {
    const next = notes?.[nextIndex];
    setIndex(nextIndex);
    setDraft(next ? newDraft(next, language) : null);
    setShowEnglish(false);
    setNewTags("");
    setStatus(next ? "" : "That's every note in this set.");
  }

  async function loadQueue(nextMode: "session" | "search") {
    const term = search.trim();
    if (nextMode === "search" && !term) return;
    setBusy(true);
    setStatus("Loading notes from Anki...");
    setQueue(null);
    setDraft(null);
    setBranch(null);
    setSaved(0);
    setMode(nextMode);
    try {
      const query = nextMode === "search"
        ? `${language}:_* ("${language}:*${ankiSearchValue(term)}*" OR "English:*${ankiSearchValue(term)}*")`
        : `${language}:_* -tag:${pbTags.analyzedPrefix(language)}::* -tag:${pbTags.skip(language)} ${extraQuery.trim()}`;
      const notes = await anki.notesMatching(query);
      // Analysis belongs to the note's Origin language, so e.g. an
      // Indonesian-origin note that also has Thai is analyzed as Indonesian.
      const matching = notes.filter((item) => analysisLanguage(item) === language).sort((a, b) => a.noteId - b.noteId);
      setQueue(matching);
      goTo(0, matching);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notes could not be loaded from Anki.");
    } finally {
      setBusy(false);
    }
  }

  // Right-click on selected text in the analysis preview adds just that item.
  async function addSelection(text: string) {
    if (!draft) return;
    setBusy(true);
    setStatus(`Looking up “${text.slice(0, 40)}”...`);
    try {
      const item = await describeSelection(text, draft.analysis, language, options.providerId);
      setStatus("");
      setBranch({ items: [item] });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The selection could not be looked up.");
    } finally {
      setBusy(false);
    }
  }

  async function generate(which: "all" | "analysis" | "reading") {
    if (!draft) return;
    setBusy(true);
    setStatus(which === "reading" ? "Generating reading..." : "Analyzing...");
    try {
      const text = draft.fieldText.trim() || draft.cleanedText;
      const templateId = draft.kind === "word" ? wordTemplateId(language) : sentenceTemplateId(language);
      const [analysis, reading] = await Promise.all([
        which === "reading" ? Promise.resolve(draft.analysis) : analyze(text, language, templateId, options),
        which === "analysis" || !usesReading ? Promise.resolve(draft.reading) : assist("reading", text, language, options.providerId),
      ]);
      setDraft((current) => current && { ...current, analysis, reading });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The analysis could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  const readingHtml = useMemo(() => {
    if (!draft?.reading.trim()) return "";
    return language === "Japanese" ? japaneseRubyReading(draft.fieldText.trim() || draft.cleanedText, draft.reading.trim()) : escapeHtml(draft.reading.trim());
  }, [draft, language]);

  const composedNotes = useMemo(() => {
    if (!note || !draft) return "";
    return composeNotesField(note.fields[notesField(language)] || "", usesReading ? readingHtml : "", markdownToAnkiHtml(draft.analysis));
  }, [note, draft, language, readingHtml, usesReading]);

  async function save() {
    if (!note || !draft?.analysis.trim()) return;
    setBusy(true);
    setStatus("Saving to Anki...");
    try {
      const fields: Record<string, string> = { [notesField(language)]: composedNotes };
      if (draft.replaceField && draft.fieldText.trim()) fields[language] = escapeHtml(draft.fieldText.trim());
      const templateId = draft.kind === "word" ? wordTemplateId(language) : sentenceTemplateId(language);
      await anki.updateFields(note.noteId, fields);
      await anki.addTags([note.noteId], [pbTags.analyzed(language, templateId), ...parseTags(newTags)]);
      setSaved((count) => count + 1);
      goTo(index + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  // Writes only the cleaned language field. The note isn't tagged as
  // analyzed, so it comes back for analysis in a later session.
  async function saveCleanupOnly() {
    if (!note || !draft?.replaceField || !draft.fieldText.trim()) return;
    setBusy(true);
    setStatus("Saving cleanup to Anki...");
    try {
      await anki.updateFields(note.noteId, { [language]: escapeHtml(draft.fieldText.trim()) });
      if (parseTags(newTags).length) await anki.addTags([note.noteId], parseTags(newTags));
      setSaved((count) => count + 1);
      goTo(index + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function neverAnalyze() {
    if (!note) return;
    setBusy(true);
    try {
      // Keep a ticked field cleanup even when skipping the analysis.
      if (draft?.replaceField && draft.fieldText.trim()) await anki.updateFields(note.noteId, { [language]: escapeHtml(draft.fieldText.trim()) });
      await anki.addTags([note.noteId], [pbTags.skip(language), ...parseTags(newTags)]);
      goTo(index + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be tagged.");
    } finally {
      setBusy(false);
    }
  }

  // Adds the typed tags right away, without saving anything else.
  async function saveTagsOnly() {
    const tags = parseTags(newTags);
    if (!note || !tags.length) return;
    setBusy(true);
    try {
      await anki.addTags([note.noteId], tags);
      setQueue((current) => current && current.map((item) => item.noteId === note.noteId ? { ...item, tags: [...new Set([...item.tags, ...tags])] } : item));
      setNewTags("");
      setStatus(`Added ${tags.length === 1 ? "tag" : "tags"}: ${tags.join(" ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The tags could not be added.");
    } finally {
      setBusy(false);
    }
  }

  const update = (changes: Partial<Draft>) => setDraft((current) => current && { ...current, ...changes });

  return (
    <div className="settings-panel anki-panel">
      <div className="anki-controls">
        <div className="language-bar-field">
          <label htmlFor="anki-language">Language</label>
          <select id="anki-language" value={language} disabled={busy} onChange={(event) => { setLanguage(event.target.value as AnkiLanguage); setQueue(null); setDraft(null); }}>
            {studyLanguages.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="language-bar-field anki-query">
          <label htmlFor="anki-query">Narrow with an Anki search (optional)</label>
          <input id="anki-query" value={extraQuery} placeholder="e.g. tag:numbers or deck:PolyglotThai" onChange={(event) => setExtraQuery(event.target.value)} />
        </div>
        <div className="language-bar-field">
          <label htmlFor="anki-provider">Model</label>
          <select id="anki-provider" value={options.providerId} onChange={(event) => setOptions({ ...options, providerId: event.target.value as LlmProviderId })}>
            {llmProviderOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </select>
        </div>
        <div className="language-bar-field">
          <label htmlFor="anki-level">Level</label>
          <select id="anki-level" value={options.learnerLevel} onChange={(event) => setOptions({ ...options, learnerLevel: event.target.value as LearnerLevel })}>
            {learnerLevels.map((level) => <option key={level}>{level}</option>)}
          </select>
        </div>
        <div className="language-bar-field">
          <label htmlFor="anki-style">Style</label>
          <select id="anki-style" value={options.outputStyle} onChange={(event) => setOptions({ ...options, outputStyle: event.target.value as OutputStyle })}>
            {outputStyles.map((style) => <option key={style}>{style}</option>)}
          </select>
        </div>
        <button className="save-input-button" type="button" disabled={busy} onClick={() => void loadQueue("session")}>Start session</button>
      </div>
      <form className="anki-find" onSubmit={(event) => { event.preventDefault(); void loadQueue("search"); }}>
        <label htmlFor="anki-find">Or find a note to edit (analyzed or not)</label>
        <input id="anki-find" value={search} placeholder={`${language} or English text`} onChange={(event) => setSearch(event.target.value)} />
        <button className="preview-prompt-button" type="submit" disabled={busy || !search.trim()}>Find</button>
      </form>

      {queue && (
        <p className="anki-note">
          {mode === "search"
            ? `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} matching “${search.trim()}”`
            : `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} not yet analyzed${extraQuery.trim() ? " matching your search" : ""}`}
          {queue.length > 0 && note && ` · note ${index + 1} of ${queue.length}`}
          {saved > 0 && ` · ${saved} saved this session`}
        </p>
      )}

      {note && draft && branch && (
        <BranchQueue
          language={language}
          parentText={draft.fieldText.trim() || draft.cleanedText}
          parentEnglish={cleanField(note.fields.English || "", "English").text}
          analysis={draft.analysis}
          options={options}
          items={branch.items}
          depth={1}
          tagSuggestions={tagSuggestions}
          onFinish={() => { setBranch(null); setStatus(""); }}
        />
      )}

      {selectionMenu.element}

      {note && draft && !branch && (
        <article className="anki-note-card">
          <div className="anki-note-fields">
            <div>
              <p className="result-label">{language}</p>
              <p className="anki-front">{draft.cleanedText}
                {soundFilename(note.fields[audioField(language)] || "") && <button className="text-button" type="button" aria-label={`Play ${language} audio`} onClick={() => void playAnkiSound(note.fields[audioField(language)])}>▶</button>}
              </p>
            </div>
            <div>
              <p className="result-label">English</p>
              {showEnglish
                ? <p className="anki-back">{cleanField(note.fields.English || "", "English").text}
                    {soundFilename(note.fields.Audio_English || "") && <button className="text-button" type="button" aria-label="Play English audio" onClick={() => void playAnkiSound(note.fields.Audio_English)}>▶</button>}
                  </p>
                : <button className="text-button" type="button" onClick={() => setShowEnglish(true)}>Show English</button>}
            </div>
          </div>

          {draft.replaceField && (
            <div className="anki-cleanup">
              <p className="result-label">Clean up the {language} field</p>
              <p className="anki-note">The stored field has extra markup{language === "Thai" ? " or an old romanization" : ""}. On save, it will be replaced with the text below (the new reading goes in the notes instead).</p>
              <div className="anki-before" dangerouslySetInnerHTML={{ __html: note.fields[language] }} />
              <input aria-label={`Cleaned ${language} field`} value={draft.fieldText} onChange={(event) => update({ fieldText: event.target.value })} />
              <label className="anki-checkbox"><input type="checkbox" checked={draft.replaceField} onChange={(event) => update({ replaceField: event.target.checked })} /> Replace the field on save</label>
            </div>
          )}
          {!draft.replaceField && fieldNeedsCleanup(note.fields[language] || "", cleanField(note.fields[language] || "", language)) && (
            <label className="anki-checkbox"><input type="checkbox" checked={false} onChange={() => update({ replaceField: true })} /> Clean up the {language} field on save</label>
          )}

          <div className="anki-template-choice" role="radiogroup" aria-label="Analysis template">
            <label><input type="radio" checked={draft.kind === "word"} onChange={() => update({ kind: "word" })} /> Word analysis</label>
            <label><input type="radio" checked={draft.kind === "sentence"} onChange={() => update({ kind: "sentence" })} /> Sentence guide</label>
            <span className="anki-note">Suggested: {draft.classification.kind} ({draft.classification.reason}){draft.classification.certain ? "" : " — not sure, check this"}</span>
          </div>

          <div className="input-action-row">
            <button className="save-input-button" type="button" disabled={busy} onClick={() => void generate("all")}>{draft.analysis ? "Regenerate" : "Analyze"}</button>
            {draft.analysis && usesReading && <button className="text-button" type="button" disabled={busy} onClick={() => void generate("reading")}>Regenerate reading only</button>}
            {status && <span className="example-status" role="status">{status}</span>}
          </div>

          {draft.analysis && (
            <div className="anki-draft">
              {usesReading && (
                <label className="anki-field-edit">{language === "Thai" ? "Romanization" : "Reading (hiragana)"}
                  <input value={draft.reading} onChange={(event) => update({ reading: event.target.value })} />
                </label>
              )}
              <label className="anki-field-edit">Analysis (Markdown, editable)
                <textarea value={draft.analysis} onChange={(event) => update({ analysis: event.target.value })} />
              </label>
              <p className="result-label">{notesField(language)} as it will appear under &ldquo;more&rdquo;</p>
              <div className="anki-card-preview" onContextMenu={selectionMenu.onContextMenu} dangerouslySetInnerHTML={{ __html: composedNotes }} />
              <div className="input-action-row">
                <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => setBranch({})}>Branch from examples</button>
                <span className="anki-note">Or select any {language} text in the preview and right-click it to add just that.</span>
              </div>
            </div>
          )}

          <div className="anki-tag-row">
            <TagInput id="anki-note-tags" value={newTags} onChange={setNewTags} current={note.tags} suggestions={tagSuggestions} />
            <button className="text-button" type="button" disabled={busy || !parseTags(newTags).length} onClick={() => void saveTagsOnly()}>Save tags</button>
          </div>

          <div className="result-actions">
            <button className="save-input-button" type="button" disabled={busy || !draft.analysis.trim()} onClick={() => void save()}>Save to Anki &amp; next</button>
            {draft.replaceField && <button className="preview-prompt-button" type="button" disabled={busy || !draft.fieldText.trim()} onClick={() => void saveCleanupOnly()}>Save cleanup only &amp; next</button>}
            <button className="text-button" type="button" disabled={busy} onClick={() => goTo(index + 1)}>Skip for now</button>
            <button className="text-button" type="button" disabled={busy} onClick={() => void anki.openInBrowser(note.noteId)}>Open in Anki</button>
            <button className="danger-button" type="button" disabled={busy} onClick={() => void neverAnalyze()}>Never analyze this note</button>
          </div>
        </article>
      )}
      {!note && status && <p className="example-status" role="status">{status}</p>}
    </div>
  );
}
