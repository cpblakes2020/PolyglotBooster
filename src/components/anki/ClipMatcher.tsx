"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { transcribe } from "@/components/anki/api";
import { matchQuality, similarity } from "@/lib/anki/bookAudio";
import { anki } from "@/lib/anki/connect";
import type { AnkiLanguage } from "@/lib/anki/vocab";
import { analyzeMp3, clipBytes, defaultSentenceGap, findClips, toBase64, type Mp3Analysis } from "@/lib/audio/mp3Split";

// What a clip can go with: a note already in Anki (Book audio) or a card
// about to be added (Send cards to Anki), in book order.
export type ClipTarget = {
  id: string;
  text: string;
  english: string;
  // A single word, which textbook recordings usually leave out.
  isWord: boolean;
  // The audio file it has now, if it's in Anki.
  audio?: string;
  bookAudio?: boolean;
};

// The clip (base64 MP3) chosen for a target.
export type ClipChoice = { targetId: string; data: string };

type ClipMatcherProps = {
  language: AnkiLanguage;
  // Null until loaded: the files can be added first.
  targets: ClipTarget[] | null;
  noun: "note" | "card";
  disabled?: boolean;
  // Shown before the targets left without a clip.
  unmatchedLabel: string;
  // The chosen clips; ready is false while two clips share a target.
  onChange: (choices: ClipChoice[], ready: boolean) => void;
};

type BookFile = { name: string; analysis: Mp3Analysis };
type BookClip = { key: string; file: string; start: number; end: number; data: string };
type Heard = { text?: string; error?: string };

const concurrency = 3;
const qualityLabels = { good: "✓ matches", close: "≈ close", poor: "✗ doesn't match" };

export function soundFilename(field: string) {
  return field.match(/\[sound:([^\]]+)\]/)?.[1];
}

export function playData(data: string) {
  void new Audio(`data:audio/mpeg;base64,${data}`).play().catch(() => {});
}

const seconds = (value: number) => value.toFixed(1);

// A textbook's MP3s split into sentences at the longer pauses, matched to
// the targets in order, checked by transcribing each clip, and shown as one
// table to review and adjust.
export function ClipMatcher({ language, targets, noun, disabled = false, unmatchedLabel, onChange }: ClipMatcherProps) {
  const [files, setFiles] = useState<BookFile[]>([]);
  const [gap, setGap] = useState(defaultSentenceGap);
  const [skipWords, setSkipWords] = useState(true);
  const [assigned, setAssigned] = useState<Record<string, string | null>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [heard, setHeard] = useState<Record<string, Heard>>({});
  const [status, setStatus] = useState("");
  const [retries, setRetries] = useState(0);
  const asked = useRef(new Set<string>());

  // New targets start from book order again.
  useEffect(() => setAssigned({}), [targets]);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setStatus("Reading the audio...");
    try {
      const added: BookFile[] = [];
      for (const file of [...list]) added.push({ name: file.name, analysis: await analyzeMp3(file) });
      setFiles((current) => [...current, ...added].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The audio couldn't be read.");
    }
  }

  function moveFile(index: number, step: number) {
    setFiles((current) => {
      const next = [...current];
      const [file] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + step)), 0, file);
      return next;
    });
    setAssigned({});
  }

  const clips = useMemo<BookClip[]>(() => files.flatMap((file) => findClips(file.analysis, gap).map((clip) => ({
    key: `${file.name}@${clip.start.toFixed(2)}-${clip.end.toFixed(2)}`,
    file: file.name,
    start: clip.start,
    end: clip.end,
    data: toBase64(clipBytes(file.analysis, clip)),
  }))), [files, gap]);

  const words = useMemo(() => (targets || []).filter((target) => target.isWord), [targets]);
  const inOrder = useMemo(() => (targets || []).filter((target) => !(skipWords && target.isWord)), [targets, skipWords]);
  const byId = useMemo(() => new Map((targets || []).map((target) => [target.id, target])), [targets]);

  // The target each clip goes with: its place in book order, unless changed by hand.
  const targetFor = (clip: BookClip, index: number) => clip.key in assigned ? assigned[clip.key] : inOrder[index]?.id ?? null;

  // Transcribes every clip once, a few at a time.
  useEffect(() => {
    const queue = clips.filter((clip) => !asked.current.has(clip.key));
    if (!queue.length) return;
    for (const clip of queue) asked.current.add(clip.key);
    const worker = async () => {
      for (let clip = queue.shift(); clip; clip = queue.shift()) {
        const key = clip.key;
        try {
          const text = await transcribe(clip.data, language);
          setHeard((current) => ({ ...current, [key]: { text } }));
        } catch (error) {
          setHeard((current) => ({ ...current, [key]: { error: error instanceof Error ? error.message : "Couldn't transcribe" } }));
        }
      }
    };
    void Promise.all(Array.from({ length: concurrency }, worker));
  }, [clips, language, retries]);

  function retryFailed() {
    const failed = Object.keys(heard).filter((key) => heard[key].error);
    for (const key of failed) asked.current.delete(key);
    setHeard((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !failed.includes(key))));
    setRetries((count) => count + 1);
  }

  async function playCurrent(target: ClipTarget) {
    const filename = soundFilename(target.audio || "");
    if (!filename) return;
    const data = await anki.retrieveMedia(filename);
    if (data) playData(data);
  }

  const rows = clips.map((clip, index) => {
    const targetId = targetFor(clip, index);
    const target = targetId === null ? undefined : byId.get(targetId);
    const text = heard[clip.key]?.text;
    const score = target && text !== undefined ? similarity(text, target.text) : undefined;
    // A clearly better match among the other targets.
    const better = text && targets ? targets
      .map((other) => ({ target: other, score: similarity(text, other.text) }))
      .filter((item) => item.target.id !== targetId && item.score >= 0.5 && item.score - (score ?? 0) >= 0.2)
      .sort((a, b) => b.score - a.score)[0] : undefined;
    return { clip, index, target, score, better, use: !excluded.has(clip.key) && target !== undefined };
  });
  const chosen = rows.filter((row) => row.use);
  const duplicates = new Set(chosen.map((row) => row.target!.id).filter((id, index, ids) => ids.indexOf(id) !== index));
  const matchedIds = new Set(chosen.map((row) => row.target!.id));
  const unmatched = (targets || []).filter((target) => !matchedIds.has(target.id));
  const pendingChecks = clips.filter((clip) => !heard[clip.key]).length;
  const failedChecks = clips.filter((clip) => heard[clip.key]?.error).length;

  // Tells the parent only when the choice actually changes.
  const choiceKey = `${chosen.map((row) => `${row.target!.id}=${row.clip.key}`).join("|")}#${duplicates.size}`;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const latest = useRef(chosen);
  latest.current = chosen;
  useEffect(() => {
    onChangeRef.current(latest.current.map((row) => ({ targetId: row.target!.id, data: row.clip.data })), duplicates.size === 0);
    // choiceKey stands for chosen and duplicates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceKey]);

  return (
    <>
      <div className="book-audio-files">
        <label className="preview-prompt-button">
          Add MP3 files…
          <input type="file" accept=".mp3,audio/mpeg" multiple hidden disabled={disabled} onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }} />
        </label>
        {files.length > 0 && (
          <ol>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                {file.name} <span className="anki-note">· {findClips(file.analysis, gap).length} clips</span>
                <button className="text-button" type="button" disabled={disabled || index === 0} onClick={() => moveFile(index, -1)} aria-label="Move up">↑</button>
                <button className="text-button" type="button" disabled={disabled || index === files.length - 1} onClick={() => moveFile(index, 1)} aria-label="Move down">↓</button>
                <button className="text-button" type="button" disabled={disabled} onClick={() => { setFiles((current) => current.filter((_, at) => at !== index)); setAssigned({}); }} aria-label="Remove">✕</button>
              </li>
            ))}
          </ol>
        )}
        {files.length > 1 && <p className="anki-note">Put the files in book order: the clips are matched to the {noun}s in this order.</p>}
      </div>

      {files.length > 0 && (
        <div className="book-audio-options">
          <label>
            <span>Pause between sentences (seconds)</span>
            <input type="number" min={0.4} max={4} step={0.1} value={gap} disabled={disabled} onChange={(event) => { setGap(Number(event.target.value) || defaultSentenceGap); setAssigned({}); }} />
          </label>
          {words.length > 0 && (
            <label className="anki-checkbox">
              <input type="checkbox" checked={skipWords} disabled={disabled} onChange={(event) => { setSkipWords(event.target.checked); setAssigned({}); }} />
              Leave out single-word {noun}s ({words.map((target) => target.text).join(", ")})
            </label>
          )}
        </div>
      )}

      {status && <p className="example-status" role="status">{status}</p>}
      {!targets && clips.length > 0 && !status && <p className="anki-note">Load the chapter&apos;s {noun}s to see which clip goes with which {noun}.</p>}

      {targets && clips.length > 0 && (
        <div className="anki-estimate book-audio-review">
          <p className={clips.length === inOrder.length ? "anki-note" : "anki-failures"}>
            {clips.length} clips for {inOrder.length} {noun}s{clips.length === inOrder.length ? ", one each." : ` — the counts differ, so check the order carefully. A different pause length may split the audio better.`}
            {pendingChecks > 0 && ` Transcribing ${pendingChecks} clips...`}
          </p>
          {failedChecks > 0 && pendingChecks === 0 && (
            <p className="anki-failures">
              {failedChecks} clips couldn&apos;t be transcribed, so they&apos;re matched by order only.{" "}
              <button className="text-button" type="button" disabled={disabled} onClick={retryFailed}>Transcribe again</button>
            </p>
          )}
          <div className="book-audio-table">
            <table>
              <thead><tr><th>#</th><th>Book clip</th><th>{noun === "note" ? "Note" : "Card"}</th><th>Heard in the clip</th><th>Use</th></tr></thead>
              <tbody>
                {rows.map(({ clip, index, target, score, better, use }) => (
                  <tr key={clip.key} className={use ? "" : "unused"}>
                    <td>{index + 1}</td>
                    <td><div className="book-audio-cell">
                      <button className="text-button" type="button" onClick={() => playData(clip.data)}>▶ Book</button>
                      <span className="anki-note">{clip.file} · {seconds(clip.start)}–{seconds(clip.end)} s</span>
                    </div></td>
                    <td><div className="book-audio-cell book-audio-note">
                      <select value={target?.id ?? ""} disabled={disabled} onChange={(event) => setAssigned((current) => ({ ...current, [clip.key]: event.target.value || null }))}>
                        <option value="">— no {noun} —</option>
                        {targets.map((item) => <option key={item.id} value={item.id}>{item.text}</option>)}
                      </select>
                      {target && (
                        <span className="anki-note">
                          {target.english}
                          {soundFilename(target.audio || "") && <> · <button className="text-button" type="button" onClick={() => void playCurrent(target)}>▶ {target.bookAudio ? "Book audio now" : "Current"}</button></>}
                        </span>
                      )}
                      {target && duplicates.has(target.id) && use && <span className="anki-failures">This {noun} has another clip too.</span>}
                    </div></td>
                    <td><div className="book-audio-cell book-audio-heard">
                      {heard[clip.key]?.error ? <span className="anki-failures">{heard[clip.key].error}</span> : heard[clip.key] ? <>{heard[clip.key].text || "(nothing)"}</> : <span className="anki-note">…</span>}
                      {score !== undefined && <span className={`book-audio-quality ${matchQuality(score)}`}>{qualityLabels[matchQuality(score)]}</span>}
                      {better && (
                        <span className="anki-note">
                          Sounds like {better.target.text}{" "}
                          <button className="text-button" type="button" disabled={disabled} onClick={() => setAssigned((current) => ({ ...current, [clip.key]: better.target.id }))}>Use that {noun}</button>
                        </span>
                      )}
                    </div></td>
                    <td>
                      <input type="checkbox" aria-label="Use this clip" checked={use} disabled={disabled || !target} onChange={(event) => setExcluded((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.delete(clip.key); else next.add(clip.key);
                        return next;
                      })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unmatched.length > 0 && <p className="anki-note">{unmatchedLabel} {unmatched.map((target) => target.text).join(" · ")}</p>}
        </div>
      )}
    </>
  );
}
