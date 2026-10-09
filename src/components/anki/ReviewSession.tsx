"use client";

import { useEffect, useMemo, useState } from "react";
import { analyze, askFollowUp, assist, describeSelection, type AnalysisOptions } from "@/components/anki/api";
import { BranchQueue } from "@/components/anki/BranchQueue";
import { FieldEditor } from "@/components/anki/FieldEditor";
import { TagInput, parseTags, useSelectionMenu } from "@/components/anki/selection";
import { classifyItem, type Classification, type ItemKind } from "@/lib/anki/classify";
import { anki, ankiSearchValue, reviewFlag } from "@/lib/anki/connect";
import { cleanField, composeNotesField, escapeHtml, existingAnalysis, existingReading, fieldNeedsCleanup, hasReading, hasRubyReading, htmlToText, markdownToAnkiHtml, readingHtml, withReadingBlock } from "@/lib/anki/fields";
import type { BranchItem, FollowUpExchange } from "@/lib/anki/prompts";
import { analysisLanguage, ankiLanguages, audioField, notesField, pbTags, readingLabel, readingLanguages, sentenceTemplateId, wordTemplateId, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";
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
  // The Notes_English field as plain text, e.g. a question written in Anki
  // when flagging the card. Empty it to delete the note.
  englishNote: string;
};

function englishNoteText(note: VocabNote) {
  return htmlToText(note.fields[notesField("English")] || "");
}

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
    englishNote: englishNoteText(note),
  };
}

type Branch = { items?: BranchItem[] };

// "session": notes not yet analyzed; "search": found by text; "flagged":
// red-flagged in Anki; "reading": Thai/Japanese/Mandarin notes with no
// reading yet (e.g. made in Anki, or a language added later), newest first.
type SessionMode = "session" | "search" | "flagged" | "reading";

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
  // by text, analyzed or not; "flagged" through notes you red-flagged in
  // Anki (Ctrl+1) to look at here — the flag is cleared once it's dealt with.
  const [mode, setMode] = useState<SessionMode>("session");
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState<Branch | null>(null);
  // Tags to add to the current note on save, and the collection's tags to suggest.
  const [newTags, setNewTags] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [editingFields, setEditingFields] = useState(false);
  // Follow-up questions about the current note and their answers. They're
  // never saved to the note; text in an answer goes to Anki only by
  // right-clicking it.
  const [followUps, setFollowUps] = useState<FollowUpExchange[]>([]);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [askingFollowUp, setAskingFollowUp] = useState(false);
  // Shown beside the Ask button: progress while waiting, or why it failed.
  const [followUpStatus, setFollowUpStatus] = useState("");
  const [waitingForAnswer, setWaitingForAnswer] = useState(false);
  const selectionMenu = useSelectionMenu((text) => void addSelection(text));

  useEffect(() => {
    anki.getTags().then((tags) => setTagSuggestions(tags.filter((tag) => !tag.startsWith("pb::")).sort()), () => {});
  }, []);

  const note = queue?.[index];
  const usesReading = language === "Thai" || language === "Mandarin" || (language === "Japanese" && !hasRubyReading(note?.fields[notesField(language)] || ""));

  function goTo(nextIndex: number, notes = queue) {
    const next = notes?.[nextIndex];
    setIndex(nextIndex);
    setDraft(next ? newDraft(next, language) : null);
    setShowEnglish(false);
    setNewTags("");
    setEditingFields(false);
    setFollowUps([]);
    setFollowUpQuestion("");
    setAskingFollowUp(false);
    setFollowUpStatus("");
    setStatus(next ? "" : "That's every note in this set.");
  }

  async function loadQueue(nextMode: SessionMode) {
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
        : nextMode === "flagged" ? `${language}:_* flag:${reviewFlag}`
        : nextMode === "reading" ? `${language}:_* -"${notesField(language)}:*pb-reading*" ${extraQuery.trim()}`
        : `${language}:_* -tag:${pbTags.analyzedPrefix(language)}::* -tag:${pbTags.skip(language)} ${extraQuery.trim()}`;
      const notes = await anki.notesMatching(query);
      // A session analyzes each note in its Origin language, so e.g. an
      // Indonesian-origin note that also has Thai comes up as Indonesian. The
      // other modes show every note with this language filled in: you asked
      // for that text, flagged that card, or it lacks this reading, whatever
      // the note's origin. Missing reading goes newest first.
      const matching = notes
        .filter((item) => nextMode !== "session" || analysisLanguage(item) === language)
        .filter((item) => nextMode !== "reading" || !hasReading(item.fields[notesField(language)] || "", language))
        .sort((a, b) => nextMode === "reading" ? b.noteId - a.noteId : a.noteId - b.noteId);
      setQueue(matching);
      goTo(0, matching);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notes could not be loaded from Anki.");
    } finally {
      setBusy(false);
    }
  }

  // The analysis plus any follow-up questions and answers: the context for
  // describing text selected in either.
  const studyContext = useMemo(() => [
    draft?.analysis || "",
    ...followUps.flatMap((exchange) => [`Follow-up question: ${exchange.question}`, `Answer:\n${exchange.answer}`]),
  ].join("\n\n"), [draft?.analysis, followUps]);

  // Right-click on selected text in the analysis preview or a follow-up
  // answer adds just that item.
  async function addSelection(text: string) {
    if (!draft) return;
    setBusy(true);
    setStatus(`Looking up “${text.slice(0, 40)}”...`);
    try {
      const item = await describeSelection(text, studyContext, language, options.providerId);
      setStatus("");
      setBranch({ items: [item] });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The selection could not be looked up.");
    } finally {
      setBusy(false);
    }
  }

  async function askQuestion() {
    const question = followUpQuestion.trim();
    if (!note || !draft || !question) return;
    setBusy(true);
    setWaitingForAnswer(true);
    const providerLabel = llmProviderOptions.find((provider) => provider.id === options.providerId)?.label || "the AI";
    setFollowUpStatus(`Asking ${providerLabel}… this can take up to half a minute.`);
    try {
      const answer = await askFollowUp(question, {
        text: draft.fieldText.trim() || draft.cleanedText,
        english: cleanField(note.fields.English || "", "English").text,
        analysis: draft.analysis,
      }, followUps, language, options);
      setFollowUps((current) => [...current, { question, answer }]);
      setFollowUpQuestion("");
      setFollowUpStatus("");
    } catch (error) {
      setFollowUpStatus(error instanceof Error ? error.message : "The question couldn't be answered.");
    } finally {
      setBusy(false);
      setWaitingForAnswer(false);
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
        which === "analysis" || !usesReading ? Promise.resolve(draft.reading) : assist("reading", text, language, options.providerId, language === "Japanese" && note?.fields.Mandarin?.trim() ? "chinese" : undefined),
      ]);
      setDraft((current) => current && { ...current, analysis, reading });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The analysis could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  // Missing reading writes each note's reading as soon as it comes up.
  useEffect(() => {
    if (mode === "reading" && note && draft && usesReading && !draft.reading.trim()) void generate("reading");
    // Once per note: a failed attempt isn't retried until you click Regenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.noteId, mode]);

  const readingBlock = useMemo(() => {
    if (!draft?.reading.trim()) return "";
    return readingHtml(draft.reading, language, draft.fieldText.trim() || draft.cleanedText);
  }, [draft, language]);

  const composedNotes = useMemo(() => {
    if (!note || !draft) return "";
    return composeNotesField(note.fields[notesField(language)] || "", usesReading ? readingBlock : "", markdownToAnkiHtml(draft.analysis));
  }, [note, draft, language, readingBlock, usesReading]);

  // In a flagged session, a note you've saved something for is done: its
  // red flag comes off so it doesn't come back.
  async function clearFlagIfFlagged(noteId: number) {
    if (mode !== "flagged") return;
    try {
      await anki.clearReviewFlag(noteId);
    } catch {
      setStatus("Saved, but the red flag couldn't be cleared — clear it in Anki.");
    }
  }

  // The English note's field, if it was edited here (an emptied box deletes
  // the note). Written along with whichever save is used.
  function englishNoteChange(): Record<string, string> {
    if (!note || !draft || draft.englishNote.trim() === englishNoteText(note)) return {};
    return { [notesField("English")]: escapeHtml(draft.englishNote.trim()).replace(/\n/g, "<br>") };
  }

  async function saveEnglishNote() {
    const fields = englishNoteChange();
    if (!note || !Object.keys(fields).length) return;
    setBusy(true);
    try {
      await anki.updateFields(note.noteId, fields);
      setQueue((current) => current && current.map((item) => item.noteId === note.noteId ? { ...item, fields: { ...item.fields, ...fields } } : item));
      setStatus(draft?.englishNote.trim() ? "English note saved to Anki" : "English note deleted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The English note could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function clearFlagAndNext() {
    if (!note) return;
    setBusy(true);
    await clearFlagIfFlagged(note.noteId);
    setBusy(false);
    goTo(index + 1);
  }

  // Saves the analysis (and any cleanup and tags). With advance false it
  // stays on the note, e.g. to keep branching from the analysis.
  async function save(advance: boolean) {
    if (!note || !draft?.analysis.trim()) return;
    setBusy(true);
    setStatus("Saving to Anki...");
    try {
      const fields: Record<string, string> = { [notesField(language)]: composedNotes, ...englishNoteChange() };
      if (draft.replaceField && draft.fieldText.trim()) fields[language] = escapeHtml(draft.fieldText.trim());
      const templateId = draft.kind === "word" ? wordTemplateId(language) : sentenceTemplateId(language);
      const tags = [pbTags.analyzed(language, templateId), ...parseTags(newTags)];
      await anki.updateFields(note.noteId, fields);
      await anki.addTags([note.noteId], tags);
      await clearFlagIfFlagged(note.noteId);
      setSaved((count) => count + 1);
      if (advance) {
        goTo(index + 1);
        return;
      }
      // Stay here, with the page's copy of the note matching what Anki now holds.
      setQueue((current) => current && current.map((item) => item.noteId === note.noteId
        ? { ...item, fields: { ...item.fields, ...fields }, tags: [...new Set([...item.tags, ...tags])] }
        : item));
      if (fields[language]) update({ cleanedText: draft.fieldText.trim(), replaceField: false });
      setNewTags("");
      setStatus("Saved to Anki");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  // Missing reading: saves just the reading (plus any cleanup, English note
  // and tags), leaving the rest of the Notes field — and whether the note
  // counts as analyzed — as it was.
  async function saveReadingOnly() {
    if (!note || !draft?.reading.trim()) return;
    setBusy(true);
    setStatus("Saving the reading to Anki...");
    try {
      const fields: Record<string, string> = { [notesField(language)]: withReadingBlock(note.fields[notesField(language)] || "", readingBlock), ...englishNoteChange() };
      if (draft.replaceField && draft.fieldText.trim()) fields[language] = escapeHtml(draft.fieldText.trim());
      await anki.updateFields(note.noteId, fields);
      if (parseTags(newTags).length) await anki.addTags([note.noteId], parseTags(newTags));
      setSaved((count) => count + 1);
      goTo(index + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The reading could not be saved.");
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
      await anki.updateFields(note.noteId, { [language]: escapeHtml(draft.fieldText.trim()), ...englishNoteChange() });
      if (parseTags(newTags).length) await anki.addTags([note.noteId], parseTags(newTags));
      await clearFlagIfFlagged(note.noteId);
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
      // Keep a ticked field cleanup and an edited English note even when
      // skipping the analysis.
      const fields = { ...(draft?.replaceField && draft.fieldText.trim() ? { [language]: escapeHtml(draft.fieldText.trim()) } : {}), ...englishNoteChange() };
      if (Object.keys(fields).length) await anki.updateFields(note.noteId, fields);
      await anki.addTags([note.noteId], [pbTags.skip(language), ...parseTags(newTags)]);
      await clearFlagIfFlagged(note.noteId);
      goTo(index + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be tagged.");
    } finally {
      setBusy(false);
    }
  }

  // After the Edit fields panel saves: keep the page's copy of the note in
  // step with Anki, and refresh the draft where its source fields changed.
  function fieldsSaved(fields: Record<string, string>, tags: string[]) {
    if (!note || !draft) return;
    const updated: VocabNote = { ...note, fields: { ...note.fields, ...fields }, tags: [...new Set([...note.tags, ...tags])] };
    setQueue((current) => current && current.map((item) => item.noteId === note.noteId ? updated : item));
    const fresh = newDraft(updated, language);
    if (fields[language] !== undefined) update({ cleanedText: fresh.cleanedText, fieldText: fresh.fieldText, replaceField: fresh.replaceField, classification: fresh.classification });
    if (fields[notesField(language)] !== undefined) update({ reading: fresh.reading, analysis: fresh.analysis });
    if (fields[notesField("English")] !== undefined) update({ englishNote: fresh.englishNote });
    setEditingFields(false);
    setStatus("Fields saved to Anki");
    void clearFlagIfFlagged(note.noteId);
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
        <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => void loadQueue("flagged")} title="Notes with a card you red-flagged in Anki (Ctrl+1)">Flagged in Anki</button>
        {readingLanguages.has(language) && <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => void loadQueue("reading")} title={`${language} notes with no ${readingLabel(language).split(" ")[0].toLowerCase()} yet, newest first`}>Missing {language === "Thai" ? "romanization" : "reading"}</button>}
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
            : mode === "flagged" ? `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} red-flagged in Anki — the flag comes off when you save`
            : mode === "reading" ? `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} with no ${readingLabel(language).split(" ")[0].toLowerCase()} yet, newest first`
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
              <label className="anki-english-note">English note
                <textarea value={draft.englishNote} rows={Math.max(2, draft.englishNote.split("\n").length)} placeholder="e.g. a question you wrote when flagging the card"
                  onChange={(event) => update({ englishNote: event.target.value })} />
              </label>
              {Object.keys(englishNoteChange()).length > 0 && (
                <p className="anki-english-note-actions">
                  <button className="text-button" type="button" disabled={busy} onClick={() => void saveEnglishNote()}>{draft.englishNote.trim() ? "Save English note" : "Delete English note"}</button>
                  <button className="text-button" type="button" disabled={busy} onClick={() => update({ englishNote: englishNoteText(note) })}>Undo</button>
                  <span className="anki-note">Also saved by Save, Save &amp; next and the other save buttons.</span>
                </p>
              )}
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

          {mode === "reading" && !draft.analysis && usesReading && (
            <div className="anki-draft">
              <label className="anki-field-edit">{readingLabel(language)}
                <textarea className="anki-reading-input" rows={Math.max(1, draft.reading.split("\n").length)} value={draft.reading} placeholder="Writing the reading..." onChange={(event) => update({ reading: event.target.value })} />
              </label>
              <div className="input-action-row">
                <button className="save-input-button" type="button" disabled={busy || !draft.reading.trim()} onClick={() => void saveReadingOnly()}>Save {language === "Thai" ? "romanization" : "reading"} &amp; next</button>
                <button className="text-button" type="button" disabled={busy} onClick={() => void generate("reading")}>Regenerate {language === "Thai" ? "romanization" : "reading"}</button>
                <span className="anki-note">Only the reading is saved; Analyze above if you also want an analysis.</span>
              </div>
            </div>
          )}

          {draft.analysis && (
            <div className="anki-draft">
              {usesReading && (
                <label className="anki-field-edit">{readingLabel(language)}
                  <textarea className="anki-reading-input" rows={Math.max(1, draft.reading.split("\n").length)} value={draft.reading} onChange={(event) => update({ reading: event.target.value })} />
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

              <div className="anki-follow-ups">
                {followUps.map((exchange, position) => (
                  <div className="anki-follow-up" key={position}>
                    <p className="follow-up-question"><strong>Q:</strong> {exchange.question}</p>
                    <div className="anki-card-preview" onContextMenu={selectionMenu.onContextMenu} dangerouslySetInnerHTML={{ __html: markdownToAnkiHtml(exchange.answer) }} />
                  </div>
                ))}
                {followUps.length > 0 && <p className="anki-note">Answers aren&apos;t saved to the note. To keep a phrase, select it and right-click to add it to Anki.</p>}
                {askingFollowUp ? (
                  <form className="anki-follow-up-form" onSubmit={(event) => { event.preventDefault(); void askQuestion(); }}>
                    <label className="anki-field-edit">{followUps.length ? "Ask another follow-up question" : "Ask a follow-up question"}
                      <textarea value={followUpQuestion} rows={2} placeholder={`e.g. How would you say “…” in ${language}?`} onChange={(event) => setFollowUpQuestion(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void askQuestion(); } }} />
                    </label>
                    <div className="input-action-row">
                      <button className="save-input-button" type="submit" disabled={busy || !followUpQuestion.trim()}>{waitingForAnswer ? "Asking..." : "Ask"}</button>
                      <button className="text-button" type="button" disabled={busy} onClick={() => setAskingFollowUp(false)}>Close</button>
                      {followUpStatus && <span className="example-status" role="status">{followUpStatus}</span>}
                    </div>
                  </form>
                ) : (
                  <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => setAskingFollowUp(true)}>{followUps.length ? "Ask another follow-up question" : "Ask a follow-up question"}</button>
                )}
              </div>
            </div>
          )}

          {editingFields && <FieldEditor key={note.noteId} note={note} providerId={options.providerId} onSaved={fieldsSaved} onClose={() => setEditingFields(false)} />}

          <div className="anki-tag-row">
            <TagInput id="anki-note-tags" value={newTags} onChange={setNewTags} current={note.tags} suggestions={tagSuggestions} />
            <button className="text-button" type="button" disabled={busy || !parseTags(newTags).length} onClick={() => void saveTagsOnly()}>Save tags</button>
          </div>

          <div className="result-actions">
            <button className="save-input-button" type="button" disabled={busy || !draft.analysis.trim()} onClick={() => void save(true)}>Save to Anki &amp; next</button>
            <button className="preview-prompt-button" type="button" disabled={busy || !draft.analysis.trim()} onClick={() => void save(false)}>Save</button>
            {draft.replaceField && <button className="preview-prompt-button" type="button" disabled={busy || !draft.fieldText.trim()} onClick={() => void saveCleanupOnly()}>Save cleanup only &amp; next</button>}
            <button className="text-button" type="button" disabled={busy} onClick={() => goTo(index + 1)}>Skip for now</button>
            {mode === "flagged" && <button className="text-button" type="button" disabled={busy} onClick={() => void clearFlagAndNext()}>Clear flag &amp; next</button>}
            {!editingFields && <button className="text-button" type="button" disabled={busy} onClick={() => setEditingFields(true)}>Edit fields</button>}
            <button className="text-button" type="button" disabled={busy} onClick={() => void anki.openEditor(note.noteId)}>Open in Anki</button>
            <button className="danger-button" type="button" disabled={busy} onClick={() => void neverAnalyze()}>Never analyze this note</button>
          </div>
        </article>
      )}
      {!note && status && <p className="example-status" role="status">{status}</p>}
    </div>
  );
}
