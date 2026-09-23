"use client";

import { useMemo, useState } from "react";
import { analyze, assist, type AnalysisOptions } from "@/components/anki/api";
import { classifyItem, type Classification, type ItemKind } from "@/lib/anki/classify";
import { anki } from "@/lib/anki/connect";
import { cleanField, composeNotesField, escapeHtml, existingReading, fieldNeedsCleanup, hasRubyReading, japaneseRubyReading, markdownToAnkiHtml } from "@/lib/anki/fields";
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
  return {
    classification,
    kind: classification.kind,
    cleanedText: cleaned.text,
    fieldText: cleaned.text,
    replaceField: fieldNeedsCleanup(raw, cleaned),
    reading: existingReading(note.fields[notesField(language)] || ""),
    analysis: "",
  };
}

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

  const note = queue?.[index];
  const usesReading = language === "Thai" || (language === "Japanese" && !hasRubyReading(note?.fields[notesField(language)] || ""));

  function goTo(nextIndex: number, notes = queue) {
    const next = notes?.[nextIndex];
    setIndex(nextIndex);
    setDraft(next ? newDraft(next, language) : null);
    setShowEnglish(false);
    setStatus(next ? "" : "That's every note in this set.");
  }

  async function loadQueue() {
    setBusy(true);
    setStatus("Loading notes from Anki...");
    setQueue(null);
    setDraft(null);
    setSaved(0);
    try {
      const notes = await anki.notesMatching(`${language}:_* -tag:${pbTags.analyzedPrefix(language)}::* -tag:${pbTags.skip(language)} ${extraQuery.trim()}`);
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
      await anki.addTags([note.noteId], [pbTags.analyzed(language, templateId)]);
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
      await anki.addTags([note.noteId], [pbTags.skip(language)]);
      goTo(index + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be tagged.");
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
        <button className="save-input-button" type="button" disabled={busy} onClick={() => void loadQueue()}>Start session</button>
      </div>

      {queue && (
        <p className="anki-note">
          {queue.length} {language} note{queue.length === 1 ? "" : "s"} not yet analyzed{extraQuery.trim() ? " matching your search" : ""}
          {queue.length > 0 && note && ` · note ${index + 1} of ${queue.length}`}
          {saved > 0 && ` · ${saved} saved this session`}
        </p>
      )}

      {note && draft && (
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
              <div className="anki-card-preview" dangerouslySetInnerHTML={{ __html: composedNotes }} />
            </div>
          )}

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
