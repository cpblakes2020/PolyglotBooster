"use client";

import { useEffect, useMemo, useState } from "react";
import { analyze, askFollowUp, assist, describeSelection, speak, type AnalysisOptions } from "@/components/anki/api";
import { BranchQueue } from "@/components/anki/BranchQueue";
import { FieldEditor } from "@/components/anki/FieldEditor";
import { DictEntriesEditor } from "@/components/dictionary/DictEntriesEditor";
import { useJapaneseLookup } from "@/components/dictionary/LookupPopups";
import { JapaneseDictionaryPanel } from "@/components/dictionary/JapaneseDictionaryPanel";
import { LaterQueue, useLaterItems, useSaveForLater } from "@/components/anki/later";
import { TagInput, parseTags, useSelectionMenu } from "@/components/anki/selection";
import { classifyItem, type Classification, type ItemKind } from "@/lib/anki/classify";
import { anki, ankiSearchValue, reviewFlag } from "@/lib/anki/connect";
import { blockHtml, cleanField, escapeHtml, existingAnalysis, existingReading, fieldNeedsCleanup, handwrittenRubyReading, hasReading, htmlToText, joinNotesBlocks, markdownToAnkiHtml, notesMiddle, readingHtml, splitNotesBlocks, type NotesBlock } from "@/lib/anki/fields";
import type { BranchItem, FollowUpExchange } from "@/lib/anki/prompts";
import { analysisLanguage, ankiLanguages, audioField, audioFilename, notesField, pbTags, readingLabel, readingLanguages, sentenceTemplateId, soundField, wordTemplateId, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";
import { lookUpDictItems } from "@/lib/dictionary/client";
import { dictItemsHtml, mergeDictItems, parseDictHtml, type DictNoteItem } from "@/lib/dictionary/notesBlock";
import { llmProviderOptions, type LlmProviderId } from "@/lib/llm/provider";
import type { LearnerLevel, OutputStyle } from "@/lib/types";

const studyLanguages = ankiLanguages.filter((language) => language !== "English");
const learnerLevels: LearnerLevel[] = ["Beginner", "Intermediate", "Advanced"];
const outputStyles: OutputStyle[] = ["Concise", "Detailed", "Literal", "Natural", "Formal", "Informal"];

// What's being edited for the current note. Each part keeps what Anki has
// (orig…) so Save changes writes only the parts you changed.
type Draft = {
  classification: Classification;
  kind: ItemKind;
  cleanedText: string;
  fieldText: string;
  replaceField: boolean;
  reading: string;
  origReading: string;
  // The analysis, as Markdown.
  analysis: string;
  origAnalysis: string;
  // Japanese dictionary entries looked up here to replace the note's (null:
  // keep what Anki has; empty: remove them).
  dict: DictNoteItem[] | null;
  // The rest of the Notes field: brief explanations and anything else.
  blocks: NotesBlock[];
  origBlocks: string;
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
  const notesHtml = note.fields[notesField(language)] || "";
  // A previously analyzed note opens with its saved analysis and template.
  const savedTemplate = note.tags.find((tag) => tag.startsWith(`${pbTags.analyzedPrefix(language)}::`));
  const savedKind: ItemKind | undefined = savedTemplate?.endsWith(sentenceTemplateId(language)) ? "sentence" : savedTemplate?.endsWith(wordTemplateId(language)) ? "word" : undefined;
  const reading = existingReading(notesHtml);
  const analysis = existingAnalysis(notesHtml);
  const blocks = splitNotesBlocks(notesMiddle(notesHtml));
  return {
    classification,
    kind: savedKind || classification.kind,
    cleanedText: cleaned.text,
    fieldText: cleaned.text,
    replaceField: fieldNeedsCleanup(raw, cleaned),
    reading,
    origReading: reading,
    analysis,
    origAnalysis: analysis,
    dict: null,
    blocks,
    origBlocks: JSON.stringify(blocks),
    englishNote: englishNoteText(note),
  };
}

type Branch = { items?: BranchItem[] };

// "session": notes not yet analyzed; "search": found by text; "flagged":
// red-flagged in Anki; "reading": Thai/Japanese/Mandarin notes with no
// reading yet (e.g. made in Anki, or a language added later), newest first;
// "tag": every note with a tag, analyzed or not, in the order added.
type SessionMode = "session" | "search" | "flagged" | "reading" | "tag";

function soundFilename(field: string) {
  return field.match(/\[sound:([^\]]+)\]/)?.[1];
}

// Audio files that can be added by hand, and how to play them here.
const audioTypes: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", webm: "audio/webm" };
const maxAudioFileBytes = 20 * 1024 * 1024;
const audioExtension = (filename: string) => filename.split(".").pop()?.toLowerCase() || "";
const audioMime = (filename: string) => audioTypes[audioExtension(filename)] || "audio/mpeg";

// A recording or audio file waiting to replace the note's audio on save.
type NewAudio = { data: string; extension: string; from: string };

function readAudioFile(file: File): Promise<NewAudio> {
  return new Promise((resolve, reject) => {
    const extension = audioExtension(file.name);
    if (!audioTypes[extension]) { reject(new Error(`${file.name} isn't an audio file Anki plays (MP3, M4A, AAC, WAV, OGG, FLAC).`)); return; }
    if (file.size > maxAudioFileBytes) { reject(new Error(`${file.name} is over 20 MB.`)); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ data: String(reader.result).replace(/^data:[^,]*,/, ""), extension, from: file.name });
    reader.onerror = () => reject(new Error(`${file.name} couldn't be read.`));
    reader.readAsDataURL(file);
  });
}

async function playAnkiSound(field: string) {
  const filename = soundFilename(field);
  if (!filename) return;
  const data = await anki.retrieveMedia(filename);
  if (data) await new Audio(`data:${audioMime(filename)};base64,${data}`).play();
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
  const [reviewTag, setReviewTag] = useState("");
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
  // Right-click → Look up on Japanese text: dictionary popups.
  // "Add to this card" in a box adds its entries to the note's (starting
  // from the ones it has saved, if they haven't been looked up again here).
  const lookup = useJapaneseLookup(language === "Japanese" ? (items) => setDraft((current) => current && {
    ...current,
    dict: mergeDictItems(current.dict ?? parseDictHtml(blockHtml(queue?.[index]?.fields[notesField(language)] || "", "pb-dict")), items),
  }) : undefined);
  const selectionMenu = useSelectionMenu((text) => void addSelection(text), (text) => void later.save(text), language === "Japanese" ? lookup.open : undefined);
  // The saved-for-later list: this language's count, and whether it's open.
  const laterItems = useLaterItems();
  const laterCount = laterItems?.filter((item) => item.language === language).length || 0;
  const [showLater, setShowLater] = useState(false);
  // A new recording (base64 MP3) waiting to replace the note's audio on save.
  const [newAudio, setNewAudio] = useState<NewAudio | null>(null);
  const [draggingAudio, setDraggingAudio] = useState(false);
  // The Markdown editor for the analysis opens on request (the preview
  // shows the analysis either way).
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  // Whether the note's cards carry Anki's red flag (null while checking).
  const [flagged, setFlagged] = useState<boolean | null>(null);

  useEffect(() => {
    anki.getTags().then((tags) => setTagSuggestions(tags.filter((tag) => !tag.startsWith("pb::")).sort()), () => {});
  }, []);

  const note = queue?.[index];
  // Japanese furigana written by hand in the notes (and no reading of
  // PolyglotBooster's own) is kept as it is, so there's no reading to edit.
  const handwrittenReading = language === "Japanese" && !existingReading(note?.fields[notesField(language)] || "") ? handwrittenRubyReading(note?.fields[notesField(language)] || "") : "";
  const usesReading = readingLanguages.has(language) && !handwrittenReading;

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
    setNewAudio(null);
    setEditingAnalysis(false);
    setStatus(next ? "" : "That's every note in this set.");
  }

  async function loadQueue(nextMode: SessionMode) {
    const term = search.trim();
    if (nextMode === "search" && !term) return;
    const tag = reviewTag.trim();
    if (nextMode === "tag" && !tag) return;
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
        // A tag also matches the tags nested under it (source::STT covers every chapter).
        : nextMode === "tag" ? `${language}:_* "tag:${ankiSearchValue(tag)}"`
        : nextMode === "reading" ? `${language}:_* -"${notesField(language)}:*pb-reading*" ${extraQuery.trim()}`
        // A session: notes not yet analyzed, plus analyzed ones whose field
        // still needs cleaning up (filtered below; Anki can't search for that).
        : `${language}:_* -tag:${pbTags.skip(language)} ${extraQuery.trim()}`;
      const notes = await anki.notesMatching(query);
      // A session analyzes each note in its Origin language, so e.g. an
      // Indonesian-origin note that also has Thai comes up as Indonesian. The
      // other modes show every note with this language filled in: you asked
      // for that text, flagged that card, or it lacks this reading, whatever
      // the note's origin. Missing reading goes newest first.
      const matching = notes
        .filter((item) => nextMode !== "session" || analysisLanguage(item) === language)
        .filter((item) => nextMode !== "session" || !item.tags.some((tag) => tag.toLowerCase().startsWith(`${pbTags.analyzedPrefix(language)}::`.toLowerCase()))
          || fieldNeedsCleanup(item.fields[language] || "", cleanField(item.fields[language] || "", language)))
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

  // Right-click → "Save for Anki later": seen in this note.
  const noteText = draft ? draft.fieldText.trim() || draft.cleanedText : "";
  const noteEnglish = note ? cleanField(note.fields.English || "", "English").text : "";
  const later = useSaveForLater(language, studyContext, noteEnglish ? `${noteText} (${noteEnglish})` : noteText);

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

  // Japanese dictionary entries for the note, no AI: for a word, its JMdict
  // entries and every kanji in it; for a sentence, only the hard parts (see
  // sentenceDictItems). They're shown for trimming before they're saved.
  async function lookUpDictionary() {
    if (!draft) return;
    setBusy(true);
    setStatus("Looking up the dictionary...");
    try {
      const text = draft.fieldText.trim() || draft.cleanedText;
      const items = await lookUpDictItems(text, draft.kind);
      if (!items.length) {
        setStatus(draft.kind === "word" ? "Not found in the dictionary." : "Nothing hard enough here: no kanji beyond elementary school and no uncommon words.");
        return;
      }
      update({ dict: items });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The dictionary couldn't be looked up.");
    } finally {
      setBusy(false);
    }
  }

  // Whether the note in view is red-flagged in Anki.
  useEffect(() => {
    setFlagged(null);
    if (!note) return;
    let cancelled = false;
    anki.hasReviewFlag(note.noteId).then((value) => { if (!cancelled) setFlagged(value); }, () => {});
    return () => { cancelled = true; };
  }, [note?.noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Missing reading writes each note's reading as soon as it comes up.
  useEffect(() => {
    if (mode === "reading" && note && draft && usesReading && !draft.reading.trim()) void generate("reading");
    // Once per note: a failed attempt isn't retried until you click Regenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.noteId, mode]);

  // The note's Notes field as it will be after saving: the reading, the
  // other blocks and the analysis — each exactly as Anki has it unless you
  // changed it here.
  const readingDirty = Boolean(draft && usesReading && draft.reading.trim() !== draft.origReading.trim());
  const analysisDirty = Boolean(draft && draft.analysis.trim() !== draft.origAnalysis.trim());
  const blocksDirty = Boolean(draft && JSON.stringify(draft.blocks) !== draft.origBlocks);
  const dictDirty = Boolean(draft?.dict);
  const savedDictHtml = blockHtml(note?.fields[notesField(language)] || "", "pb-dict");

  const assembledNotes = useMemo(() => {
    if (!note || !draft) return "";
    const original = note.fields[notesField(language)] || "";
    const text = draft.fieldText.trim() || draft.cleanedText;
    const reading = readingDirty
      ? (draft.reading.trim() ? `<div class="pb-reading">${readingHtml(draft.reading, language, text)}</div>` : "")
      : blockHtml(original, "pb-reading");
    const dict = draft.dict ? dictItemsHtml(draft.dict) : blockHtml(original, "pb-dict");
    const middle = blocksDirty ? joinNotesBlocks(draft.blocks) : notesMiddle(original);
    const analysis = analysisDirty
      ? (draft.analysis.trim() ? `<div class="pb-analysis">${markdownToAnkiHtml(draft.analysis)}</div>` : "")
      : blockHtml(original, "pb-analysis");
    return `${reading}${dict}${middle}${analysis}`;
  }, [note, draft, language, readingDirty, analysisDirty, blocksDirty]);

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
  // the note).
  function englishNoteChange(): Record<string, string> {
    if (!note || !draft || draft.englishNote.trim() === englishNoteText(note)) return {};
    return { [notesField("English")]: escapeHtml(draft.englishNote.trim()).replace(/\n/g, "<br>") };
  }

  // Everything Save changes would write, and a list of it for the screen.
  const pending = useMemo(() => {
    if (!note || !draft) return null;
    const fields: Record<string, string> = {};
    const labels: string[] = [];
    const cleaned = draft.fieldText.trim();
    if (draft.replaceField && cleaned && escapeHtml(cleaned) !== note.fields[language]) {
      fields[language] = escapeHtml(cleaned);
      labels.push(`${language} field cleanup`);
    }
    const englishNote = englishNoteChange();
    if (Object.keys(englishNote).length) {
      Object.assign(fields, englishNote);
      labels.push(draft.englishNote.trim() ? "English note" : "English note (deleted)");
    }
    if (readingDirty || analysisDirty || blocksDirty || dictDirty) {
      fields[notesField(language)] = assembledNotes;
      if (readingDirty) labels.push(language === "Thai" ? "romanization" : "reading");
      if (dictDirty) labels.push(draft.dict?.length ? "dictionary entries" : "dictionary entries (removed)");
      if (analysisDirty) labels.push(draft.analysis.trim() ? "analysis" : "analysis (removed)");
      if (blocksDirty) labels.push("notes");
    }
    if (newAudio) labels.push("audio");
    const tags = parseTags(newTags);
    if (tags.length) labels.push("tags");
    // A saved analysis marks the note as analyzed, with its template.
    if (analysisDirty && draft.analysis.trim()) tags.push(pbTags.analyzed(language, draft.kind === "word" ? wordTemplateId(language) : sentenceTemplateId(language)));
    // So do dictionary entries saved without one (it's done with for now).
    else if (draft.dict?.length && !draft.analysis.trim()) tags.push(pbTags.analyzed(language, "dictionary"));
    return { fields, labels, tags };
    // englishNoteChange reads note and draft, which are dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, draft, language, readingDirty, analysisDirty, blocksDirty, dictDirty, assembledNotes, newAudio, newTags]);

  // Writes only what changed. With advance false it stays on the note (e.g.
  // to keep branching from the analysis), now matching what Anki holds.
  async function saveChanges(advance: boolean) {
    if (!note || !draft || !pending?.labels.length) return;
    setBusy(true);
    setStatus("Saving to Anki...");
    try {
      const fields = { ...pending.fields };
      const tags = [...pending.tags];
      if (newAudio) {
        // A replaced recording gets a new file name so the change syncs.
        const version = note.fields[audioField(language)]?.trim() ? Date.now().toString(36) : undefined;
        const filename = await anki.storeMedia(audioFilename(note.noteId, language, version, newAudio.extension), newAudio.data);
        fields[audioField(language)] = soundField(filename);
        tags.push(pbTags.audio(language));
      }
      if (Object.keys(fields).length) await anki.updateFields(note.noteId, fields);
      if (tags.length) await anki.addTags([note.noteId], tags);
      // New audio replaces any textbook recording, so bulk audio may record it again.
      const removedTags = newAudio && note.tags.includes(pbTags.bookAudio(language)) ? [pbTags.bookAudio(language)] : [];
      if (removedTags.length) await anki.removeTags([note.noteId], removedTags);
      await clearFlagIfFlagged(note.noteId);
      setSaved((count) => count + 1);
      if (advance) {
        goTo(index + 1);
        return;
      }
      const updated: VocabNote = { ...note, fields: { ...note.fields, ...fields }, tags: [...new Set([...note.tags, ...tags])].filter((tag) => !removedTags.includes(tag)) };
      setQueue((current) => current && current.map((item) => item.noteId === note.noteId ? updated : item));
      setDraft({ ...newDraft(updated, language), kind: draft.kind });
      setNewAudio(null);
      setNewTags("");
      setStatus(`Saved to Anki: ${pending.labels.join(", ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The note could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  // Records a new take of the note's audio (Thai respelled for the voice)
  // and plays it; it replaces the old one only when you save.
  async function recordAudio() {
    if (!draft) return;
    setBusy(true);
    setStatus("Recording...");
    try {
      const data = await speak(draft.fieldText.trim() || draft.cleanedText, language, draft.reading || handwrittenReading);
      setNewAudio({ data, extension: "mp3", from: "" });
      setStatus("");
      await new Audio(`data:audio/mpeg;base64,${data}`).play();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The audio could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  // An audio file chosen or dropped (e.g. a textbook recording): it
  // replaces the note's audio when you save, keeping its format.
  async function takeAudioFile(file: File) {
    try {
      const audio = await readAudioFile(file);
      setNewAudio(audio);
      setStatus("");
      await new Audio(`data:${audioTypes[audio.extension]};base64,${audio.data}`).play().catch(() => {});
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The audio file couldn't be used.");
    }
  }

  // Red-flags the note's cards in Anki (to come back to it under Flagged in
  // Anki), or takes the flag off.
  async function toggleFlag() {
    if (!note) return;
    setBusy(true);
    try {
      if (flagged) await anki.clearReviewFlag(note.noteId);
      else await anki.setReviewFlag([note.noteId]);
      setFlagged(!flagged);
      setStatus(flagged ? "Red flag removed in Anki." : "Red-flagged in Anki — it will come up under Flagged in Anki.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The flag could not be changed.");
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
  // step with Anki, and refresh the parts of the draft whose fields changed.
  function fieldsSaved(fields: Record<string, string>, tags: string[]) {
    if (!note || !draft) return;
    const updated: VocabNote = { ...note, fields: { ...note.fields, ...fields }, tags: [...new Set([...note.tags, ...tags])] };
    setQueue((current) => current && current.map((item) => item.noteId === note.noteId ? updated : item));
    const fresh = newDraft(updated, language);
    if (fields[language] !== undefined) update({ cleanedText: fresh.cleanedText, fieldText: fresh.fieldText, replaceField: fresh.replaceField, classification: fresh.classification });
    if (fields[notesField(language)] !== undefined) update({ reading: fresh.reading, origReading: fresh.origReading, analysis: fresh.analysis, origAnalysis: fresh.origAnalysis, dict: null, blocks: fresh.blocks, origBlocks: fresh.origBlocks });
    if (fields[notesField("English")] !== undefined) update({ englishNote: fresh.englishNote });
    if (fields[audioField(language)] !== undefined) setNewAudio(null);
    setEditingFields(false);
    setStatus("Fields saved to Anki");
    void clearFlagIfFlagged(note.noteId);
  }

  const setBlock = (position: number, block: NotesBlock | null) => update({
    blocks: (draft?.blocks || []).flatMap((current, i) => i === position ? (block ? [block] : []) : [current]),
  });

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
        {laterCount > 0 && <button className="preview-prompt-button" type="button" disabled={busy || showLater} onClick={() => { setShowLater(true); setBranch(null); }} title={`${language} phrases you saved for Anki later, on any device`}>Saved for later ({laterCount})</button>}
        {readingLanguages.has(language) && <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => void loadQueue("reading")} title={`${language} notes with no ${readingLabel(language).split(" ")[0].toLowerCase()} yet, newest first`}>Missing {language === "Thai" ? "romanization" : "reading"}</button>}
      </div>
      <form className="anki-find" onSubmit={(event) => { event.preventDefault(); void loadQueue("search"); }}>
        <label htmlFor="anki-find">Or find a note to edit (analyzed or not)</label>
        <input id="anki-find" value={search} placeholder={`${language} or English text`} onChange={(event) => setSearch(event.target.value)} />
        <button className="preview-prompt-button" type="submit" disabled={busy || !search.trim()}>Find</button>
      </form>
      <form className="anki-find" onSubmit={(event) => { event.preventDefault(); void loadQueue("tag"); }}>
        <label htmlFor="anki-review-tag">Or review every note with a tag (analyzed or not)</label>
        <input id="anki-review-tag" list="anki-review-tags" value={reviewTag} placeholder="e.g. source::STT::24" onChange={(event) => setReviewTag(event.target.value)} />
        <datalist id="anki-review-tags">{tagSuggestions.map((tag) => <option key={tag} value={tag} />)}</datalist>
        <button className="preview-prompt-button" type="submit" disabled={busy || !reviewTag.trim()}>Review tag</button>
      </form>

      {queue && (
        <p className="anki-note">
          {mode === "search"
            ? `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} matching “${search.trim()}”`
            : mode === "flagged" ? `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} red-flagged in Anki — the flag comes off when you save`
            : mode === "tag" ? `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} tagged ${reviewTag.trim()}, in the order they were added`
            : mode === "reading" ? `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} with no ${readingLabel(language).split(" ")[0].toLowerCase()} yet, newest first`
            : `${queue.length} ${language} note${queue.length === 1 ? "" : "s"} not yet analyzed or needing cleanup${extraQuery.trim() ? " matching your search" : ""}`}
          {queue.length > 0 && note && ` · note ${index + 1} of ${queue.length}`}
          {saved > 0 && ` · ${saved} saved this session`}
        </p>
      )}

      {showLater && <LaterQueue key={language} language={language} options={options} tagSuggestions={tagSuggestions} onClose={() => setShowLater(false)} />}

      {note && draft && branch && !showLater && (
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
      {later.element}
      {lookup.element}

      {note && draft && !branch && !showLater && (
        <article className="anki-note-card">
          <div className="anki-note-fields">
            <div>
              <p className="result-label">{language}</p>
              <p className="anki-front" ref={selectionMenu.areaRef} onContextMenu={selectionMenu.onContextMenu}>{draft.cleanedText}
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
                  <button className="text-button" type="button" disabled={busy} onClick={() => update({ englishNote: englishNoteText(note) })}>Undo</button>
                  <span className="anki-note">Saved with Save changes.</span>
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

          {status && <p className="example-status anki-note-status" role="status">{status}</p>}

          {language === "Japanese" && <JapaneseDictionaryPanel text={draft.fieldText.trim() || draft.cleanedText} />}

          {readingLanguages.has(language) && (
            <section className="anki-tool">
              <div className="anki-tool-head">
                <p className="result-label">{readingLabel(language)}{readingDirty && <span className="anki-changed">changed</span>}</p>
                {usesReading && <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => void generate("reading")}>Regenerate</button>}
                {usesReading && readingDirty && <button className="text-button" type="button" disabled={busy} onClick={() => update({ reading: draft.origReading })}>Undo</button>}
              </div>
              {usesReading ? (
                <>
                  <textarea className="anki-reading-input" rows={Math.min(10, Math.max(3, draft.reading.split("\n").reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / 40)), 0)))} value={draft.reading} placeholder={mode === "reading" ? "Writing the reading..." : "No reading yet — Regenerate writes one"} onChange={(event) => update({ reading: event.target.value })} />
                </>
              ) : (
                <p className="anki-note"><b>{handwrittenReading}</b> — from the furigana written by hand in the notes below, which is kept as it is (the audio uses it too).</p>
              )}
            </section>
          )}

          <section
            className={`anki-tool anki-audio-tool${draggingAudio ? " dragging" : ""}`}
            onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDraggingAudio(true); } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingAudio(false); }}
            onDrop={(event) => { event.preventDefault(); setDraggingAudio(false); const file = event.dataTransfer.files[0]; if (file) void takeAudioFile(file); }}
          >
            <div className="anki-tool-head">
              <p className="result-label">Audio{newAudio && <span className="anki-changed">{newAudio.from ? "new file" : "new recording"}</span>}</p>
              {soundFilename(note.fields[audioField(language)] || "") && <button className="text-button" type="button" onClick={() => void playAnkiSound(note.fields[audioField(language)])}>▶ Current</button>}
              {newAudio && <button className="text-button" type="button" onClick={() => void new Audio(`data:${audioTypes[newAudio.extension]};base64,${newAudio.data}`).play()}>▶ New</button>}
              <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => void recordAudio()}>{newAudio && !newAudio.from ? "Record again" : soundFilename(note.fields[audioField(language)] || "") ? "Re-record" : "Record"}</button>
              <label className={`preview-prompt-button anki-file-button${busy ? " disabled" : ""}`}>
                Choose file…
                <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void takeAudioFile(file); }} />
              </label>
              {newAudio && <button className="text-button" type="button" disabled={busy} onClick={() => setNewAudio(null)}>Keep the {soundFilename(note.fields[audioField(language)] || "") ? "old one" : "note without audio"}</button>}
            </div>
            <p className="anki-audio-file" title="The Audio field in Anki">
              {newAudio
                ? <>On save: <code>[sound:{audioFilename(note.noteId, language, soundFilename(note.fields[audioField(language)] || "") ? "…" : undefined, newAudio.extension)}]</code>{newAudio.from ? <> from <b>{newAudio.from}</b></> : " (new recording)"}{soundFilename(note.fields[audioField(language)] || "") && <> · now <code>[sound:{soundFilename(note.fields[audioField(language)] || "")}]</code></>}</>
                : soundFilename(note.fields[audioField(language)] || "") ? <code>[sound:{soundFilename(note.fields[audioField(language)] || "")}]</code> : <span className="anki-note">No audio yet.</span>}
              <span className="anki-audio-drop">{draggingAudio ? "Drop the audio file to use it" : "or drop an audio file here"}</span>
            </p>
          </section>

          <section className="anki-tool">
            <p className="result-label">{notesField(language)} — what the card shows under &ldquo;more&rdquo;{(analysisDirty || blocksDirty || dictDirty) && <span className="anki-changed">changed</span>}</p>

            <div className="anki-template-choice" role="radiogroup" aria-label="Analysis template">
              <label><input type="radio" checked={draft.kind === "word"} onChange={() => update({ kind: "word" })} /> Word analysis</label>
              <label><input type="radio" checked={draft.kind === "sentence"} onChange={() => update({ kind: "sentence" })} /> Sentence guide</label>
              <span className="anki-note">Suggested: {draft.classification.kind} ({draft.classification.reason}){draft.classification.certain ? "" : " — not sure, check this"}</span>
            </div>
            <div className="input-action-row">
              <button className="save-input-button" type="button" disabled={busy} onClick={() => void generate(draft.analysis ? "analysis" : "all")}>{draft.analysis ? "Regenerate analysis" : "Analyze"}</button>
              {draft.analysis && <button className="text-button" type="button" disabled={busy} onClick={() => setEditingAnalysis(!editingAnalysis)}>{editingAnalysis ? "Hide the Markdown" : "Edit analysis (Markdown)"}</button>}
              {draft.analysis && <button className="text-button" type="button" disabled={busy} onClick={() => update({ analysis: "" })}>Remove analysis</button>}
              {analysisDirty && <button className="text-button" type="button" disabled={busy} onClick={() => update({ analysis: draft.origAnalysis })}>Undo</button>}
            </div>
            {language === "Japanese" && (
              <div className="anki-dict-tool">
                <div className="input-action-row">
                  <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => void lookUpDictionary()}>{draft.dict?.length || (!draft.dict && savedDictHtml) ? "Look up dictionary entries again" : "Add dictionary entries"}</button>
                  {(draft.dict ? draft.dict.length > 0 : Boolean(savedDictHtml)) && <button className="text-button" type="button" disabled={busy} onClick={() => update({ dict: [] })}>Remove dictionary entries</button>}
                  {!draft.dict && savedDictHtml && <button className="text-button" type="button" disabled={busy} onClick={() => update({ dict: parseDictHtml(savedDictHtml) })}>Edit dictionary entries</button>}
                  {dictDirty && <button className="text-button" type="button" disabled={busy} onClick={() => update({ dict: null })}>Undo</button>}
                </div>
                <p className="anki-note">
                  Instead of an analysis, or as well: dictionary entries (no AI), saved under the reading.{" "}
                  {draft.kind === "word"
                    ? "With Word analysis selected: the word's JMdict entries, and each of its kanji with other words that use it."
                    : "With Sentence guide selected: only the hard parts — the hardest kanji (beyond the 1,026 taught in elementary school, at most 5) and the words that use them or aren't everyday words."}
                </p>
                {draft.dict && draft.dict.length > 0 && (
                  <>
                    <p className="anki-note">Edit any line, or click × to leave it out; Save changes saves what&apos;s left. To add a word from the text, select it, right-click → Look up, and click <b>Add to this card</b>.</p>
                    <DictEntriesEditor items={draft.dict} disabled={busy} onChange={(items) => update({ dict: items })} />
                  </>
                )}
              </div>
            )}
            {draft.analysis && editingAnalysis && (
              <label className="anki-field-edit">Analysis (Markdown, editable)
                <textarea value={draft.analysis} onChange={(event) => update({ analysis: event.target.value })} />
              </label>
            )}

            {(draft.blocks.length > 0 || blocksDirty) && (
              <div className="anki-blocks">
                {draft.blocks.map((block, position) => block.kind === "explanation" ? (
                  <div className="anki-block" key={position}>
                    <label className="anki-field-edit">Brief explanation
                      <textarea rows={2} value={block.explanation} onChange={(event) => setBlock(position, { ...block, explanation: event.target.value })} />
                    </label>
                    {block.seenIn && <small>Seen in: {block.seenIn}</small>}
                    <button className="text-button" type="button" disabled={busy} onClick={() => setBlock(position, null)}>Delete</button>
                  </div>
                ) : (
                  <div className="anki-block" key={position}>
                    <p className="anki-note">Other notes (edit in Edit fields → Notes fields):</p>
                    <div className="anki-card-preview" dangerouslySetInnerHTML={{ __html: block.html }} />
                    <button className="text-button" type="button" disabled={busy} onClick={() => { if (window.confirm("Delete these notes from the card?")) setBlock(position, null); }}>Delete</button>
                  </div>
                ))}
                {blocksDirty && <button className="text-button" type="button" disabled={busy} onClick={() => update({ blocks: JSON.parse(draft.origBlocks) as NotesBlock[] })}>Undo changes to these</button>}
              </div>
            )}

            <p className="result-label">Preview</p>
            <div className="anki-card-preview" ref={selectionMenu.areaRef} onContextMenu={selectionMenu.onContextMenu} dangerouslySetInnerHTML={{ __html: assembledNotes || "<i>Nothing under “more” yet.</i>" }} />

            {draft.analysis && (
              <>
                <div className="input-action-row">
                  <button className="preview-prompt-button" type="button" disabled={busy} onClick={() => setBranch({})}>Branch from examples</button>
                  <span className="anki-note">Or select any {language} text in the preview and right-click it to add just that, or to save it for Anki later.</span>
                </div>

                <div className="anki-follow-ups">
                  {followUps.map((exchange, position) => (
                    <div className="anki-follow-up" key={position}>
                      <p className="follow-up-question"><strong>Q:</strong> {exchange.question}</p>
                      <div className="anki-card-preview" ref={selectionMenu.areaRef} onContextMenu={selectionMenu.onContextMenu} dangerouslySetInnerHTML={{ __html: markdownToAnkiHtml(exchange.answer) }} />
                    </div>
                  ))}
                  {followUps.length > 0 && <p className="anki-note">Answers aren&apos;t saved to the note. To keep a phrase, select it and right-click to add it to Anki now or save it for later.</p>}
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
              </>
            )}
          </section>

          {editingFields && <FieldEditor key={note.noteId} note={note} providerId={options.providerId} onSaved={fieldsSaved} onClose={() => setEditingFields(false)} />}

          <div className="anki-tag-row">
            <TagInput id="anki-note-tags" value={newTags} onChange={setNewTags} current={note.tags} suggestions={tagSuggestions} />
          </div>

          <p className="anki-note anki-pending" role="status">{pending?.labels.length ? <>Will save: <b>{pending.labels.join(", ")}</b></> : "No changes yet."}</p>
          <div className="result-actions">
            <button className="save-input-button" type="button" disabled={busy || !pending?.labels.length} onClick={() => void saveChanges(true)}>Save changes &amp; next</button>
            <button className="preview-prompt-button" type="button" disabled={busy || !pending?.labels.length} onClick={() => void saveChanges(false)}>Save changes</button>
            <button className="text-button" type="button" disabled={busy} onClick={() => goTo(index + 1)}>{pending?.labels.length ? "Skip without saving" : "Next"}</button>
            {mode === "flagged" && <button className="text-button" type="button" disabled={busy} onClick={() => void clearFlagAndNext()}>Clear flag &amp; next</button>}
            {mode !== "flagged" && flagged !== null && <button className="text-button" type="button" disabled={busy} onClick={() => void toggleFlag()} title="Anki's red flag (Ctrl+1): the note comes up under Flagged in Anki">{flagged ? "Remove red flag" : "Red flag"}</button>}
            {!editingFields && <button className="text-button" type="button" disabled={busy} onClick={() => setEditingFields(true)}>Edit fields</button>}
            <button className="text-button" type="button" disabled={busy} onClick={() => void anki.openEditor(note.noteId)}>Open in Anki</button>
            <button className="danger-button" type="button" disabled={busy} onClick={() => void neverAnalyze()}>Never analyze this note</button>
            {status && <span className="example-status" role="status">{status}</span>}
          </div>
        </article>
      )}
      {!note && status && <p className="example-status" role="status">{status}</p>}
    </div>
  );
}
