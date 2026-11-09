"use client";

import { useEffect, useRef, useState } from "react";
import { assist, describeSelection, groupSentences, speak, transcribe, type AnalysisOptions } from "@/components/anki/api";
import { BranchQueue } from "@/components/anki/BranchQueue";
import { playData } from "@/components/anki/ClipMatcher";
import { sourceTag } from "@/components/anki/FlashcardsToAnki";
import { ListeningCardPanel } from "@/components/anki/ListeningCardPanel";
import type { ListeningCardDraft } from "@/components/anki/saveItem";
import { useVoiceDefaults } from "@/components/anki/VoiceControls";
import { TagInput, parseTags } from "@/components/anki/selection";
import { anki } from "@/lib/anki/connect";
import { findPhrases, joinPieces, phraseText, readSentenceGroups } from "@/lib/anki/phraseClips";
import type { BranchItem } from "@/lib/anki/prompts";
import { audioLanguages, type AnkiLanguage } from "@/lib/anki/vocab";
import { decodeRecording, encodeClip, joinMp3s, quietestPoint, type DecodedRecording } from "@/lib/audio/clipAudio";
import { findClips } from "@/lib/audio/mp3Split";
import { llmProviderOptions, type LlmProviderId } from "@/lib/llm/provider";

// "repeated": a teacher says each phrase several times. "monologue": someone
// talks, and each sentence is said once.
type Mode = "repeated" | "monologue";
type Piece = { key: string; start: number; end: number; data: string };
type Phrase = { id: string; text: string; audio1: string; audio2: string; include: boolean };
// A sentence of a monologue: the neighbouring pieces it's made of.
// range: its own stretch of the recording, when it's part of a piece split by
// hand (a piece holds speech with no pause in it, so it can't be split back
// into pieces).
type Sentence = { id: string; keys: string[]; text: string; include: boolean; range?: { start: number; end: number } };
type CardSource = { text: string; audio?: string; audio2?: string };

const concurrency = 3;
// Teachers repeat a phrase after clear pauses; someone talking only breathes
// between clauses, so a monologue is cut finely and then put back together.
const defaultGaps: Record<Mode, number> = { repeated: 0.5, monologue: 0.3 };
// This is for short clips; a long file is slow to decode and costly to split up.
const longestMinutes = 15;
// gpt-transcribe's price per minute, in cents.
const centsPerMinute = 0.45;

async function inParallel<T>(items: T[], work: (item: T, index: number) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) await work(items[index], index);
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

const seconds = (value: number) => `${value.toFixed(1)} s`;

// Sentence cards from a short recording, with its own audio, reviewed before
// the cards go through the usual queue. The file is split at its pauses and
// each piece is transcribed. Then, in "repeated" mode, text heard more than
// once becomes a phrase, with the first saying as Audio 1 and the first clearly
// slower one as Audio 2; in "monologue" mode, the AI says which neighbouring
// pieces make up each sentence, and those pieces' audio becomes its Audio 1.
// listeningReady: the note type has listening cards.
export function PhraseClips({ listeningReady }: { listeningReady: boolean }) {
  const { defaultFor } = useVoiceDefaults();
  const [mode, setMode] = useState<Mode>("repeated");
  const [language, setLanguage] = useState<AnkiLanguage>("Thai");
  const [gap, setGap] = useState(defaultGaps.repeated);
  const [filename, setFilename] = useState("");
  const [recording, setRecording] = useState<DecodedRecording | null>(null);
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [heard, setHeard] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(0);
  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [sentences, setSentences] = useState<Sentence[] | null>(null);
  const [withSpeech, setWithSpeech] = useState(false);
  const [makeListening, setMakeListening] = useState(false);
  const [listeningDraft, setListeningDraft] = useState<ListeningCardDraft | null>(null);
  const [source, setSource] = useState("");
  const [batchTag, setBatchTag] = useState("");
  const [tagEdited, setTagEdited] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [providerId, setProviderId] = useState<LlmProviderId>("anthropic");
  const [items, setItems] = useState<BranchItem[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);
  // Sentences' audio, encoded when first needed.
  const sentenceAudio = useRef(new Map<string, string>());

  useEffect(() => {
    void anki.getTags().then((tags) => setTagSuggestions(tags.filter((tag) => !tag.startsWith("pb::")).sort())).catch(() => {});
  }, []);

  function clearResults() {
    setHeard({});
    setFailed(0);
    setPhrases(null);
    setSentences(null);
  }

  // New pieces whenever the recording or the pause length changes.
  useEffect(() => {
    setPieces(null);
    clearResults();
    sentenceAudio.current.clear();
    if (!recording) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setStatus("Cutting the recording at its pauses...");
      try {
        const clips = findClips(recording, gap);
        const cut: Piece[] = [];
        for (const [index, clip] of clips.entries()) {
          const data = await encodeClip(recording, clip);
          if (cancelled) return;
          cut.push({ key: String(index + 1), start: clip.start, end: clip.end, data });
        }
        setPieces(cut);
        setStatus(cut.length ? "" : "No speech was found in this recording.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "The recording couldn't be cut.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [recording, gap]);

  function chooseMode(next: Mode) {
    setMode(next);
    clearResults();
    setStatus("");
    setGap(defaultGaps[next]);
  }

  async function chooseFile(file: File) {
    setFilename(file.name);
    setRecording(null);
    setFailures([]);
    setBusy(true);
    setStatus(`Reading ${file.name}...`);
    try {
      const decoded = await decodeRecording(file);
      if (decoded.duration > longestMinutes * 60) {
        setStatus(`${file.name} is over ${longestMinutes} minutes. This is for short clips: cut out the part you want first.`);
        setBusy(false);
        return;
      }
      setRecording(decoded);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The recording couldn't be read.");
      setBusy(false);
    }
  }

  const sentenceFrom = (keys: string[], results: Record<string, string>): Sentence => ({
    id: keys.join("-"),
    keys,
    text: joinPieces(keys.map((key) => results[key] || "").filter(Boolean), language),
    include: true,
  });

  // Transcribes the pieces not yet heard, a few at a time, then suggests the
  // phrases or sentences.
  async function findTheCards() {
    if (!pieces) return;
    setBusy(true);
    setFailures([]);
    setStatus("Transcribing...");
    const results = { ...heard };
    const queue = pieces.filter((piece) => results[piece.key] === undefined);
    let done = 0;
    let failedNow = 0;
    await inParallel(queue, async (piece) => {
      // A failure is often OpenAI turning away requests that come too fast,
      // so try twice more after a pause.
      for (let attempt = 1; ; attempt++) {
        try {
          results[piece.key] = await transcribe(piece.data, language, true);
          break;
        } catch {
          if (attempt >= 3) {
            failedNow += 1;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
        }
      }
      done += 1;
      setStatus(`Transcribing... ${done} of ${queue.length}`);
    });
    setHeard(results);
    setFailed(failedNow);

    if (mode === "repeated") {
      const heardPieces = pieces.filter((piece) => results[piece.key] !== undefined).map((piece) => ({ key: piece.key, start: piece.start, end: piece.end, text: results[piece.key] }));
      const found = findPhrases(heardPieces, language);
      setPhrases(found.map((phrase) => ({ id: phrase.audio1, text: phrase.text, audio1: phrase.audio1, audio2: phrase.audio2, include: true })));
      setStatus(found.length ? "" : `No ${language} phrase was heard more than once. For someone talking without repeating, choose Monologue above. Otherwise, try a different pause length or make phrases from the pieces below.`);
    } else {
      // Pieces with nothing in them (a cough, background sound) don't need a sentence.
      const spoken = pieces.filter((piece) => results[piece.key]).map((piece) => ({ key: piece.key, text: results[piece.key] }));
      const keys = spoken.map((piece) => piece.key);
      setStatus("Finding the sentences...");
      let groups: string[][] | null = null;
      try {
        groups = spoken.length ? readSentenceGroups(await groupSentences(spoken, language, providerId), keys) : [];
      } catch {
        groups = null;
      }
      const grouped = (groups ?? keys.map((key) => [key])).map((group) => sentenceFrom(group, results));
      // A joined sentence is transcribed again as a whole: short pieces give
      // the model little to go on, so it hears the whole more accurately.
      const joined = grouped.filter((sentence) => sentence.keys.length > 1);
      setStatus("Checking the joined sentences...");
      await inParallel(joined, async (sentence) => {
        try {
          const data = await audioOf(sentence);
          const text = data ? await transcribe(data, language, true) : "";
          if (text) sentence.text = text;
        } catch {
          // The pieces' text, joined, is still a good start for the review.
        }
      });
      setSentences(grouped);
      setStatus(groups ? "" : "The AI couldn't group these into sentences, so each piece has its own row. Use Join with next to put them together.");
    }
    setBusy(false);
  }

  const dataOf = (key: string) => pieces?.find((piece) => piece.key === key)?.data;

  // The stretch of the recording a sentence covers: its own, if it was split
  // by hand, or else from its first piece to its last, pauses included.
  function rangeOf(sentence: Sentence) {
    if (sentence.range) return sentence.range;
    const first = pieces?.find((piece) => piece.key === sentence.keys[0]);
    const last = pieces?.find((piece) => piece.key === sentence.keys[sentence.keys.length - 1]);
    return first && last ? { start: first.start, end: last.end } : null;
  }

  async function audioOf(sentence: Sentence) {
    if (!sentence.range && sentence.keys.length === 1) return dataOf(sentence.keys[0]);
    const range = rangeOf(sentence);
    if (!recording || !range) return undefined;
    const id = `${range.start.toFixed(3)}-${range.end.toFixed(3)}`;
    const known = sentenceAudio.current.get(id);
    if (known) return known;
    const data = await encodeClip(recording, range);
    sentenceAudio.current.set(id, data);
    return data;
  }

  const sentenceLength = (sentence: Sentence) => {
    const range = rangeOf(sentence);
    return range ? range.end - range.start : 0;
  };

  const linesOf = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

  // Splits a sentence's audio to match the lines its text was broken into:
  // each cut goes at the quietest moment near where that line should end,
  // judged by how much of the text comes before it.
  function splitByLines(index: number) {
    const sentence = sentences?.[index];
    const range = sentence && rangeOf(sentence);
    if (!sentence || !range || !recording) return;
    const lines = linesOf(sentence.text);
    const total = lines.reduce((sum, line) => sum + line.length, 0);
    const length = range.end - range.start;
    const cuts: number[] = [];
    let before = 0;
    for (const line of lines.slice(0, -1)) {
      before += line.length;
      const expected = range.start + length * before / total;
      const reach = Math.max(0.4, length / lines.length / 3);
      const earliest = Math.max((cuts[cuts.length - 1] ?? range.start) + 0.3, expected - reach);
      const latest = Math.min(range.end - 0.3, expected + reach);
      cuts.push(earliest < latest ? quietestPoint(recording, earliest, latest) : expected);
    }
    const edges = [range.start, ...cuts, range.end];
    const parts = lines.map((line, at) => ({ id: `${sentence.id}~${at}-${Date.now()}`, keys: sentence.keys, text: line, include: sentence.include, range: { start: edges[at], end: edges[at + 1] } }));
    setSentences((current) => current && [...current.slice(0, index), ...parts, ...current.slice(index + 1)]);
  }

  // Moves the cut between a sentence and the one before it, when one split
  // made them.
  function moveCut(index: number, by: number) {
    setSentences((current) => {
      const [before, after] = [current?.[index - 1], current?.[index]];
      if (!current || !before?.range || !after?.range) return current;
      const cut = Math.min(after.range.end - 0.2, Math.max(before.range.start + 0.2, after.range.start + by));
      return current.map((sentence, at) => at === index - 1 ? { ...sentence, range: { ...before.range!, end: cut } } : at === index ? { ...sentence, range: { ...after.range!, start: cut } } : sentence);
    });
  }

  const splitNeighbours = (index: number) => {
    const [before, after] = [sentences?.[index - 1], sentences?.[index]];
    return Boolean(before?.range && after?.range && before.range.end === after.range.start);
  };

  const chosenPhrases = (phrases || []).filter((phrase) => phrase.include && phrase.text.trim());
  const chosenSentences = (sentences || []).filter((sentence) => sentence.include && sentence.text.trim());
  const chosenCount = mode === "repeated" ? chosenPhrases.length : chosenSentences.length;
  const wantsListening = makeListening && listeningReady;
  const totalSeconds = (pieces || []).reduce((total, piece) => total + piece.end - piece.start, 0);
  const update = (id: string, changes: Partial<Phrase>) =>
    setPhrases((current) => current && current.map((phrase) => phrase.id === id ? { ...phrase, ...changes } : phrase));
  const updateSentence = (id: string, changes: Partial<Sentence>) =>
    setSentences((current) => current && current.map((sentence) => sentence.id === id ? { ...sentence, ...changes } : sentence));

  function addPhrase(piece: Piece) {
    setPhrases((current) => [...(current || []), { id: `${piece.key}-${Date.now()}`, text: phraseText(heard[piece.key] || "", language), audio1: piece.key, audio2: "", include: true }]
      .sort((a, b) => Number(a.audio1) - Number(b.audio1)));
  }

  function joinWithNext(index: number) {
    setSentences((current) => {
      if (!current || index >= current.length - 1) return current;
      const [one, two] = [current[index], current[index + 1]];
      const keys = [...new Set([...one.keys, ...two.keys])];
      const [first, second] = [rangeOf(one), rangeOf(two)];
      // Parts of a piece split by hand keep their own stretch when joined.
      const range = (one.range || two.range) && first && second ? { start: first.start, end: second.end } : undefined;
      const joined: Sentence = { id: `${keys.join("-")}${range ? `~${range.start.toFixed(3)}` : ""}`, keys, text: joinPieces([one.text.trim(), two.text.trim()].filter(Boolean), language), include: one.include || two.include, ...(range ? { range } : {}) };
      return [...current.slice(0, index), joined, ...current.slice(index + 2)];
    });
  }

  function splitSentence(index: number) {
    setSentences((current) => current && [...current.slice(0, index), ...current[index].keys.map((key) => sentenceFrom([key], heard)), ...current.slice(index + 1)]);
  }

  // One listening card for the whole recording: each sentence (or, for
  // repeated phrases, each phrase once) on its own line. All of them are on
  // it, even those without a card of their own, because they're all in the
  // audio. Audio 2 is recorded a line at a time: Thai is only respelled for
  // the speech model when it's short, so a whole passage at once would be misread.
  async function buildListeningCard(known: Map<string, { english: string; reading: string; speech?: string }>): Promise<ListeningCardDraft | null> {
    const texts = mode === "repeated" ? (phrases || []).map((phrase) => phrase.text) : (sentences || []).map((sentence) => sentence.text);
    const lines = texts.map((text) => text.trim().replace(/\s*\n\s*/g, " ")).filter(Boolean);
    if (!lines.length) return null;
    const english: string[] = [];
    const speech: string[] = [];
    let speechFailed = false;
    let done = 0;
    await inParallel(lines, async (line, index) => {
      const card = known.get(line);
      english[index] = card?.english || "";
      if (!english[index]) {
        try {
          english[index] = (await assist("gloss", line, language, providerId)).replace(/\s*\n\s*/g, " ");
        } catch (error) {
          setFailures((current) => [...current, `${line}: ${error instanceof Error ? error.message : "it couldn't be translated"}. Fill in its English on the listening card.`]);
        }
      }
      try {
        speech[index] = card?.speech ?? await speak(line, language, card?.reading, defaultFor(language, 2));
      } catch {
        speechFailed = true;
      }
      done += 1;
      setStatus(`Making the listening card... ${done} of ${lines.length}`);
    });
    // From the first words to the last.
    const spoken = (pieces || []).filter((piece) => heard[piece.key]);
    if (!spoken.length) return null;
    const audio = await audioOf({ id: "whole", keys: [spoken[0].key, spoken[spoken.length - 1].key], text: "", include: true });
    if (!audio) return null;
    if (speechFailed) setFailures((current) => [...current, "Some of the listening card's text-to-speech couldn't be recorded, so it has no Audio 2."]);
    return {
      language,
      text: lines.join("\n"),
      english: english.map((line) => line || "").join("\n"),
      audio,
      audio2: speechFailed ? undefined : joinMp3s(speech),
      tags: parseTags(batchTag),
      seenIn: source,
    };
  }

  // The reading, English and notes for each card, then on to the usual queue.
  async function prepareCards() {
    if (!chosenCount && !wantsListening) return;
    setBusy(true);
    setFailures([]);
    setListeningDraft(null);
    setStatus(`Writing the cards' English and notes... 0 of ${chosenCount}`);
    const transcript = (pieces || []).map((piece) => heard[piece.key]).filter(Boolean).join("\n");
    const tags = parseTags(batchTag);
    const sources: CardSource[] = mode === "repeated"
      ? chosenPhrases.map((phrase) => ({ text: phrase.text.trim(), audio: dataOf(phrase.audio1), audio2: phrase.audio2 ? dataOf(phrase.audio2) : undefined }))
      : await Promise.all(chosenSentences.map(async (sentence) => ({ text: sentence.text.trim().replace(/\s*\n\s*/g, " "), audio: await audioOf(sentence) })));
    const prepared: BranchItem[] = [];
    const known = new Map<string, { english: string; reading: string; speech?: string }>();
    let done = 0;
    await inParallel(sources, async (card, index) => {
      let described: Pick<BranchItem, "reading" | "english" | "comment" | "explanation"> = { reading: "", english: "", comment: "", explanation: "" };
      try {
        const item = await describeSelection(card.text, transcript, language, providerId);
        described = { reading: item.reading, english: item.english, comment: item.comment, explanation: item.explanation };
      } catch (error) {
        setFailures((current) => [...current, `${card.text}: ${error instanceof Error ? error.message : "its notes couldn't be written"}. Fill them in when you add it.`]);
      }
      let audio2 = card.audio2;
      if (mode === "monologue" && withSpeech) {
        try {
          audio2 = await speak(card.text, language, described.reading, defaultFor(language, 2));
        } catch (error) {
          setFailures((current) => [...current, `${card.text}: ${error instanceof Error ? error.message : "the text-to-speech couldn't be recorded"}. It has no Audio 2.`]);
        }
      }
      // The text as reviewed, whatever the model made of it.
      prepared[index] = { text: card.text, ...described, kind: "sentence", tags, audio: card.audio, audio2 };
      known.set(card.text.replace(/\s*\n\s*/g, " "), { english: described.english, reading: described.reading, speech: mode === "monologue" ? audio2 : undefined });
      done += 1;
      setStatus(`Writing the cards' English and notes... ${done} of ${chosenCount}`);
    });
    if (wantsListening) {
      setStatus("Making the listening card...");
      try {
        setListeningDraft(await buildListeningCard(known));
      } catch (error) {
        setFailures((current) => [...current, `The listening card couldn't be made: ${error instanceof Error ? error.message : "unknown error"}.`]);
      }
    }
    setItems(prepared);
    setStatus("");
    setBusy(false);
  }

  if (items) {
    const leave = () => { setItems(null); setListeningDraft(null); };
    return (
      <>
        {failures.length > 0 && <ul className="anki-failures">{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}
        {listeningDraft && <ListeningCardPanel draft={listeningDraft} tagSuggestions={tagSuggestions} />}
        {items.length > 0 ? (
          <BranchQueue
            language={language}
            parentText={source.trim()}
            parentEnglish=""
            analysis=""
            options={{ providerId, learnerLevel: "Intermediate", outputStyle: "Concise" } satisfies AnalysisOptions}
            items={items}
            pick
            doneLabel={mode === "repeated" ? "Back to the phrases" : "Back to the sentences"}
            title="Phrase clip transcripts to Anki"
            batchTags={parseTags(batchTag)}
            depth={1}
            tagSuggestions={tagSuggestions}
            onFinish={leave}
          />
        ) : (
          <div className="input-action-row"><button className="text-button" type="button" onClick={leave}>Back to the sentences</button></div>
        )}
      </>
    );
  }

  const pieceOptions = (pieces || []).map((piece) => (
    <option key={piece.key} value={piece.key}>{piece.key} · {seconds(piece.end - piece.start)} · {(heard[piece.key] || "").slice(0, 30)}</option>
  ));
  const showCards = mode === "repeated" ? Boolean(phrases?.length) : Boolean(sentences?.length);
  const found = mode === "repeated" ? phrases : sentences;

  return (
    <div className="settings-panel anki-panel book-audio phrase-clips">
      <p>Makes sentence cards from a short recording, with the recording&apos;s own audio. Choose an MP3, M4A or MP4 file: it&apos;s cut at its pauses on this computer, and each piece is transcribed with your OpenAI key. Nothing goes to Anki until you&apos;ve reviewed it.</p>

      <fieldset className="phrase-clips-mode" disabled={busy}>
        <legend>What kind of recording is it?</legend>
        <label><input type="radio" name="phrase-clips-mode" checked={mode === "repeated"} onChange={() => chooseMode("repeated")} /> Repeated phrases <small>a teacher says each phrase more than once, such as fast and then slowly: the first saying goes in Audio 1, the first clearly slower one in Audio 2</small></label>
        <label><input type="radio" name="phrase-clips-mode" checked={mode === "monologue"} onChange={() => chooseMode("monologue")} /> Monologue <small>one person talking: the AI finds the sentences, and each one&apos;s audio goes in Audio 1</small></label>
      </fieldset>

      <div className="book-audio-pick">
        <label>
          <span>Language</span>
          <select value={language} disabled={busy} onChange={(event) => { setLanguage(event.target.value as AnkiLanguage); clearResults(); }}>
            {audioLanguages.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Write {mode === "monologue" ? "sentences and notes" : "notes"} with</span>
          <select value={providerId} disabled={busy} onChange={(event) => setProviderId(event.target.value as LlmProviderId)}>
            {llmProviderOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </select>
        </label>
        <label className="preview-prompt-button">
          Choose a recording…
          <input type="file" accept=".mp3,.m4a,.mp4,audio/mpeg,audio/mp4,audio/x-m4a,video/mp4" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void chooseFile(file); }} />
        </label>
        {recording && (
          <label>
            <span>Pause between pieces (seconds)</span>
            <input type="number" min={0.2} max={4} step={0.1} value={gap} disabled={busy} onChange={(event) => setGap(Number(event.target.value) || defaultGaps[mode])} />
          </label>
        )}
      </div>

      {status && <p className="example-status" role="status">{status}</p>}

      {pieces && pieces.length > 0 && (
        <div className="input-action-row">
          <span className="anki-note">{filename}: {pieces.length} pieces, {seconds(totalSeconds)} of speech. Transcribing costs about {Math.max(1, Math.ceil(totalSeconds / 60 * centsPerMinute))}¢{mode === "monologue" ? ", and finding the sentences a little more" : ""}.</span>
          {(!found || failed > 0) && <button className="save-input-button" type="button" disabled={busy} onClick={() => void findTheCards()}>{failed > 0 ? `Transcribe the ${failed} that failed again` : mode === "repeated" ? "Find the phrases" : "Find the sentences"}</button>}
        </div>
      )}
      {failed > 0 && !busy && <p className="anki-failures">{failed} pieces couldn&apos;t be transcribed, so they aren&apos;t in the {mode === "repeated" ? "phrases" : "sentences"} below.</p>}

      {mode === "repeated" && phrases && phrases.length > 0 && (
        <>
          <div className="book-audio-table phrase-clips-table">
            <table>
              <thead><tr><th>Add</th><th>{language}</th><th>Audio 1</th><th>Audio 2 (plays after it)</th></tr></thead>
              <tbody>
                {phrases.map((phrase) => (
                  <tr key={phrase.id} className={phrase.include ? "" : "unused"}>
                    <td><input type="checkbox" aria-label={`Add ${phrase.text}`} checked={phrase.include} disabled={busy} onChange={(event) => update(phrase.id, { include: event.target.checked })} /></td>
                    <td><input className="phrase-clips-text" aria-label="Phrase text" value={phrase.text} disabled={busy} onChange={(event) => update(phrase.id, { text: event.target.value })} /></td>
                    <td><div className="book-audio-cell">
                      <select aria-label="Audio 1 piece" value={phrase.audio1} disabled={busy} onChange={(event) => update(phrase.id, { audio1: event.target.value })}>{pieceOptions}</select>
                      <button className="text-button" type="button" onClick={() => { const data = dataOf(phrase.audio1); if (data) playData(data); }}>▶ Play</button>
                    </div></td>
                    <td><div className="book-audio-cell">
                      <select aria-label="Audio 2 piece" value={phrase.audio2} disabled={busy} onChange={(event) => update(phrase.id, { audio2: event.target.value })}>
                        <option value="">— none —</option>
                        {pieceOptions}
                      </select>
                      {phrase.audio2
                        ? <button className="text-button" type="button" onClick={() => { const data = dataOf(phrase.audio2); if (data) playData(data); }}>▶ Play</button>
                        : <span className="anki-note">No clearly slower repeat was found.</span>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="anki-note">Listen to each one and change any that are wrong: the fast and slow sayings are told apart only by their length.</p>
        </>
      )}

      {mode === "monologue" && sentences && sentences.length > 0 && (
        <>
          <div className="book-audio-table phrase-clips-table">
            <table>
              <thead><tr><th>Add</th><th>{language}</th><th>Audio</th></tr></thead>
              <tbody>
                {sentences.map((sentence, index) => {
                  const lineCount = linesOf(sentence.text).length;
                  return (
                    <tr key={sentence.id} className={sentence.include ? "" : "unused"}>
                      <td><input type="checkbox" aria-label={`Add ${sentence.text}`} checked={sentence.include} disabled={busy} onChange={(event) => updateSentence(sentence.id, { include: event.target.checked })} /></td>
                      <td><textarea className="phrase-clips-text" aria-label="Sentence text" rows={2} value={sentence.text} disabled={busy} onChange={(event) => updateSentence(sentence.id, { text: event.target.value })} /></td>
                      <td><div className="phrase-clips-actions">
                        <span><button className="text-button" type="button" onClick={() => void audioOf(sentence).then((data) => { if (data) playData(data); })}>▶ Play</button> <span className="anki-note">{seconds(sentenceLength(sentence))}</span></span>
                        {splitNeighbours(index) && (
                          <span className="anki-note" title="Moves the cut between this and the sentence above">Cut above:{" "}
                            <button className="text-button" type="button" disabled={busy} aria-label="Move the cut above 0.2 seconds earlier" onClick={() => moveCut(index, -0.2)}>◀ 0.2 s</button>{" "}
                            <button className="text-button" type="button" disabled={busy} aria-label="Move the cut above 0.2 seconds later" onClick={() => moveCut(index, 0.2)}>0.2 s ▶</button>
                          </span>
                        )}
                        {lineCount > 1 && <button className="text-button" type="button" disabled={busy} title="Splits the audio to match the lines you typed" onClick={() => splitByLines(index)}>Split audio into {lineCount} (one per line)</button>}
                        {sentence.keys.length > 1 && <button className="text-button" type="button" disabled={busy} title="Goes back to the pieces it was cut into, with what was heard in each" onClick={() => splitSentence(index)}>Split into its {sentence.keys.length} pieces</button>}
                        {index < sentences.length - 1 && <button className="text-button" type="button" disabled={busy} onClick={() => joinWithNext(index)}>Join with next</button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="anki-note">Listen to each one. Correct the text, join or split sentences, and untick anything you don&apos;t want, such as a greeting or sign-off. If one row holds several sentences said without a pause, put each on its own line in the text, then click <b>Split audio into N</b>; if a cut is off, move it with the buttons on the row below it. <b>Split into its pieces</b> goes back to what was heard in each piece, undoing corrections to that sentence.</p>
          <label className="anki-checkbox">
            <input type="checkbox" checked={withSpeech} disabled={busy} onChange={(event) => setWithSpeech(event.target.checked)} />
            Add text-to-speech as Audio 2, a clearer version that plays after the speaker (with your OpenAI key and your Audio 2 voice in Settings)
          </label>
        </>
      )}

      {showCards && (
        <>
          <label className="anki-checkbox">
            <input type="checkbox" checked={makeListening && listeningReady} disabled={busy || !listeningReady} onChange={(event) => setMakeListening(event.target.checked)} />
            {mode === "repeated"
              ? "Also make one listening card from the whole recording, with each phrase above once on its own line, its English under “more”, and text-to-speech of the phrases as its Audio 2 (the unticked phrases too, because they're in the audio)"
              : "Also make one listening card from the whole recording, with every sentence above on its own line and text-to-speech as its Audio 2 (the unticked sentences too, because they're in the audio)"}
          </label>
          {!listeningReady && <p className="anki-note">Listening cards need adding to your note type first: use <b>Add listening cards</b> above.</p>}
          <div className="book-audio-pick">
            <label className="phrase-clips-source">
              <span>Where is this from? (optional — shown on each note as &ldquo;Seen in&rdquo;)</span>
              <input value={source} disabled={busy} placeholder="e.g. My Thai for Beginner, YouTube" onChange={(event) => { setSource(event.target.value); if (!tagEdited) setBatchTag(sourceTag(event.target.value)); }} />
            </label>
          </div>
          <TagInput id="phrase-clips-tags" value={batchTag} onChange={(value) => { setBatchTag(value); setTagEdited(true); }} suggestions={tagSuggestions} label="Tag every card (optional)" />
          <div className="input-action-row">
            <button className="save-input-button" type="button" disabled={busy || (!chosenCount && !wantsListening)} onClick={() => void prepareCards()}>Prepare {chosenCount} {chosenCount === 1 ? "card" : "cards"}{wantsListening ? " and the listening card" : ""}</button>
          </div>
        </>
      )}

      {found && pieces && (
        <details className="phrase-clips-pieces">
          <summary>All {pieces.length} pieces, and what was heard in each</summary>
          <div className="book-audio-table">
            <table>
              <tbody>
                {pieces.map((piece) => (
                  <tr key={piece.key}>
                    <td>{piece.key}</td>
                    <td><button className="text-button" type="button" onClick={() => playData(piece.data)}>▶ Play</button></td>
                    <td>{seconds(piece.end - piece.start)}</td>
                    <td>{heard[piece.key] === undefined ? <span className="anki-failures">Not transcribed</span> : heard[piece.key] || "(nothing)"}</td>
                    {mode === "repeated" && <td><button className="text-button" type="button" disabled={busy} onClick={() => addPhrase(piece)}>New phrase</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {failures.length > 0 && <ul className="anki-failures">{failures.map((failure) => <li key={failure}>{failure}</li>)}</ul>}
    </div>
  );
}
