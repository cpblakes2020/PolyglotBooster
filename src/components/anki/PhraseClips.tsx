"use client";

import { useEffect, useState } from "react";
import { describeSelection, transcribe, type AnalysisOptions } from "@/components/anki/api";
import { BranchQueue } from "@/components/anki/BranchQueue";
import { playData } from "@/components/anki/ClipMatcher";
import { sourceTag } from "@/components/anki/FlashcardsToAnki";
import { TagInput, parseTags } from "@/components/anki/selection";
import { anki } from "@/lib/anki/connect";
import { findPhrases, phraseText } from "@/lib/anki/phraseClips";
import type { BranchItem } from "@/lib/anki/prompts";
import { audioLanguages, type AnkiLanguage } from "@/lib/anki/vocab";
import { decodeRecording, encodeClip, type DecodedRecording } from "@/lib/audio/clipAudio";
import { findClips } from "@/lib/audio/mp3Split";
import { llmProviderOptions, type LlmProviderId } from "@/lib/llm/provider";

type Piece = { key: string; start: number; end: number; data: string };
type Phrase = { id: string; text: string; audio1: string; audio2: string; include: boolean };

const concurrency = 3;
// Teachers repeat a phrase after shorter pauses than a textbook leaves between sentences.
const defaultGap = 0.5;
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

// Sentence cards from a clip where a teacher says each phrase fast and then
// more slowly (e.g. a captured video): the file is split at its pauses, each
// piece is transcribed, and text heard more than once becomes a phrase, with
// the first saying as Audio 1 and the first clearly slower one as Audio 2.
// Everything is shown for review before the cards go through the usual queue.
export function PhraseClips() {
  const [language, setLanguage] = useState<AnkiLanguage>("Thai");
  const [gap, setGap] = useState(defaultGap);
  const [filename, setFilename] = useState("");
  const [recording, setRecording] = useState<DecodedRecording | null>(null);
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [heard, setHeard] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(0);
  const [phrases, setPhrases] = useState<Phrase[] | null>(null);
  const [source, setSource] = useState("");
  const [batchTag, setBatchTag] = useState("");
  const [tagEdited, setTagEdited] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [providerId, setProviderId] = useState<LlmProviderId>("anthropic");
  const [items, setItems] = useState<BranchItem[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  useEffect(() => {
    void anki.getTags().then((tags) => setTagSuggestions(tags.filter((tag) => !tag.startsWith("pb::")).sort())).catch(() => {});
  }, []);

  // New pieces whenever the recording or the pause length changes.
  useEffect(() => {
    setPieces(null);
    setHeard({});
    setFailed(0);
    setPhrases(null);
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

  // Transcribes the pieces not yet heard, a few at a time, then suggests the phrases.
  async function findThePhrases() {
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
    const heardPieces = pieces.filter((piece) => results[piece.key] !== undefined).map((piece) => ({ key: piece.key, start: piece.start, end: piece.end, text: results[piece.key] }));
    const found = findPhrases(heardPieces, language);
    setPhrases(found.map((phrase) => ({ id: phrase.audio1, text: phrase.text, audio1: phrase.audio1, audio2: phrase.audio2, include: true })));
    setStatus(found.length ? "" : `No ${language} phrase was heard more than once. Try a different pause length, or make phrases from the pieces below.`);
    setBusy(false);
  }

  const dataOf = (key: string) => pieces?.find((piece) => piece.key === key)?.data;
  const chosen = (phrases || []).filter((phrase) => phrase.include && phrase.text.trim());
  const totalSeconds = (pieces || []).reduce((total, piece) => total + piece.end - piece.start, 0);
  const update = (id: string, changes: Partial<Phrase>) =>
    setPhrases((current) => current && current.map((phrase) => phrase.id === id ? { ...phrase, ...changes } : phrase));

  function addPhrase(piece: Piece) {
    setPhrases((current) => [...(current || []), { id: `${piece.key}-${Date.now()}`, text: phraseText(heard[piece.key] || "", language), audio1: piece.key, audio2: "", include: true }]
      .sort((a, b) => Number(a.audio1) - Number(b.audio1)));
  }

  // The reading, English and notes for each phrase, then on to the usual queue.
  async function prepareCards() {
    if (!chosen.length) return;
    setBusy(true);
    setFailures([]);
    setStatus(`Writing the cards' English and notes... 0 of ${chosen.length}`);
    const transcript = (pieces || []).map((piece) => heard[piece.key]).filter(Boolean).join("\n");
    const tags = parseTags(batchTag);
    const prepared: BranchItem[] = [];
    let done = 0;
    await inParallel(chosen, async (phrase, index) => {
      const text = phrase.text.trim();
      const audio = { audio: dataOf(phrase.audio1), audio2: phrase.audio2 ? dataOf(phrase.audio2) : undefined };
      let described: Pick<BranchItem, "reading" | "english" | "comment" | "explanation"> = { reading: "", english: "", comment: "", explanation: "" };
      try {
        const item = await describeSelection(text, transcript, language, providerId);
        described = { reading: item.reading, english: item.english, comment: item.comment, explanation: item.explanation };
      } catch (error) {
        setFailures((current) => [...current, `${text}: ${error instanceof Error ? error.message : "its notes couldn't be written"}. Fill them in when you add it.`]);
      }
      // The clip's text, as reviewed, whatever the model made of it.
      prepared[index] = { text, ...described, kind: "sentence", tags, ...audio };
      done += 1;
      setStatus(`Writing the cards' English and notes... ${done} of ${chosen.length}`);
    });
    setItems(prepared);
    setStatus("");
    setBusy(false);
  }

  if (items) {
    return (
      <BranchQueue
        language={language}
        parentText={source.trim()}
        parentEnglish=""
        analysis=""
        options={{ providerId, learnerLevel: "Intermediate", outputStyle: "Concise" } satisfies AnalysisOptions}
        items={items}
        pick
        doneLabel="Back to the phrases"
        title="Phrase clips to Anki"
        batchTags={parseTags(batchTag)}
        depth={1}
        tagSuggestions={tagSuggestions}
        onFinish={() => setItems(null)}
      />
    );
  }

  const pieceOptions = (pieces || []).map((piece) => (
    <option key={piece.key} value={piece.key}>{piece.key} · {seconds(piece.end - piece.start)} · {(heard[piece.key] || "").slice(0, 30)}</option>
  ));

  return (
    <div className="settings-panel anki-panel book-audio phrase-clips">
      <p>Makes sentence cards from a short recording where a teacher says each phrase more than once, such as fast and then slowly. The first saying goes in <b>Audio 1</b> and the first clearly slower one in <b>Audio 2</b>, which plays after it. Choose an MP3, M4A or MP4 file: it&apos;s cut at its pauses on this computer, and each piece is transcribed with your OpenAI key. Nothing goes to Anki until you&apos;ve reviewed it.</p>

      <div className="book-audio-pick">
        <label>
          <span>Language</span>
          <select value={language} disabled={busy} onChange={(event) => { setLanguage(event.target.value as AnkiLanguage); setHeard({}); setPhrases(null); }}>
            {audioLanguages.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="preview-prompt-button">
          Choose a recording…
          <input type="file" accept=".mp3,.m4a,.mp4,audio/mpeg,audio/mp4,audio/x-m4a,video/mp4" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void chooseFile(file); }} />
        </label>
        {recording && (
          <label>
            <span>Pause between pieces (seconds)</span>
            <input type="number" min={0.3} max={4} step={0.1} value={gap} disabled={busy} onChange={(event) => setGap(Number(event.target.value) || defaultGap)} />
          </label>
        )}
      </div>

      {status && <p className="example-status" role="status">{status}</p>}

      {pieces && pieces.length > 0 && (
        <div className="input-action-row">
          <span className="anki-note">{filename}: {pieces.length} pieces, {seconds(totalSeconds)} of speech. Transcribing costs about {Math.max(1, Math.ceil(totalSeconds / 60 * centsPerMinute))}¢.</span>
          {(!phrases || failed > 0) && <button className="save-input-button" type="button" disabled={busy} onClick={() => void findThePhrases()}>{failed > 0 ? `Transcribe the ${failed} that failed again` : "Find the phrases"}</button>}
        </div>
      )}
      {failed > 0 && !busy && <p className="anki-failures">{failed} pieces couldn&apos;t be transcribed, so they aren&apos;t in the phrases below.</p>}

      {phrases && phrases.length > 0 && (
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
          <div className="book-audio-pick">
            <label className="phrase-clips-source">
              <span>Where is this from? (optional — shown on each note as &ldquo;Seen in&rdquo;)</span>
              <input value={source} disabled={busy} placeholder="e.g. My Thai for Beginner, YouTube" onChange={(event) => { setSource(event.target.value); if (!tagEdited) setBatchTag(sourceTag(event.target.value)); }} />
            </label>
            <label>
              <span>Write notes with</span>
              <select value={providerId} disabled={busy} onChange={(event) => setProviderId(event.target.value as LlmProviderId)}>
                {llmProviderOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
              </select>
            </label>
          </div>
          <TagInput id="phrase-clips-tags" value={batchTag} onChange={(value) => { setBatchTag(value); setTagEdited(true); }} suggestions={tagSuggestions} label="Tag every card (optional)" />
          <div className="input-action-row">
            <button className="save-input-button" type="button" disabled={busy || !chosen.length} onClick={() => void prepareCards()}>Prepare {chosen.length} {chosen.length === 1 ? "card" : "cards"}</button>
          </div>
        </>
      )}

      {phrases && pieces && (
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
                    <td><button className="text-button" type="button" disabled={busy} onClick={() => addPhrase(piece)}>New phrase</button></td>
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
