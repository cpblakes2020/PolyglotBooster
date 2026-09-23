"use client";

import { useRef, useState } from "react";
import { speak } from "@/components/anki/api";
import { anki } from "@/lib/anki/connect";
import { cleanField } from "@/lib/anki/fields";
import { audioField, audioFilename, audioLanguages, pbTags, type AnkiLanguage } from "@/lib/anki/vocab";

type Job = { noteId: number; language: AnkiLanguage; text: string };
type Failure = { job: Job; message: string };

// Rough learner-pace speaking rates (characters per second) for the cost
// estimate. gpt-4o-mini-tts costs about $0.015 per minute of audio.
const charsPerSecond: Record<AnkiLanguage, number> = { English: 14, Indonesian: 14, Thai: 9, Japanese: 7 };
const dollarsPerMinute = 0.015;
const concurrency = 3;
const maxConsecutiveFailures = 5;

function estimateMinutes(jobs: Job[]) {
  const seconds = jobs.reduce((total, job) => total + Math.max(1.5, job.text.length / charsPerSecond[job.language]) + 0.5, 0);
  return seconds / 60;
}

export function AudioBatch() {
  const [selected, setSelected] = useState<Set<AnkiLanguage>>(new Set(audioLanguages));
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const stopRef = useRef(false);

  function toggle(language: AnkiLanguage) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(language)) next.delete(language); else next.add(language);
      return next;
    });
    setJobs(null);
  }

  async function scan() {
    setStatus("Finding notes without audio...");
    setJobs(null);
    setFailures([]);
    setDone(0);
    try {
      const found: Job[] = [];
      for (const language of audioLanguages.filter((item) => selected.has(item))) {
        for (const note of await anki.notesMatching(`${language}:_* ${audioField(language)}: -tag:${pbTags.skip(language)}`)) {
          const text = cleanField(note.fields[language] || "", language).text;
          if (text) found.push({ noteId: note.noteId, language, text });
        }
      }
      setJobs(found);
      setStatus(found.length ? "" : "Every selected language already has audio.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notes could not be loaded from Anki.");
    }
  }

  async function runJob(job: Job) {
    const audio = await speak(job.text, job.language);
    const filename = await anki.storeMedia(audioFilename(job.noteId, job.language), audio);
    await anki.updateFields(job.noteId, { [audioField(job.language)]: `[sound:${filename}]` });
    await anki.addTags([job.noteId], [pbTags.audio(job.language)]);
  }

  async function run() {
    if (!jobs?.length) return;
    stopRef.current = false;
    setRunning(true);
    setFailures([]);
    setDone(0);
    setStatus("Generating audio...");

    const queue = [...jobs];
    let consecutiveFailures = 0;
    const worker = async () => {
      for (let job = queue.shift(); job && !stopRef.current; job = queue.shift()) {
        try {
          await runJob(job);
          consecutiveFailures = 0;
          setDone((count) => count + 1);
        } catch (error) {
          consecutiveFailures += 1;
          const failed = job;
          setFailures((current) => [...current, { job: failed, message: error instanceof Error ? error.message : "Failed" }]);
          if (consecutiveFailures >= maxConsecutiveFailures) stopRef.current = true;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    setRunning(false);
    const stoppedEarly = queue.length > 0;
    setStatus(stoppedEarly
      ? consecutiveFailures >= maxConsecutiveFailures ? "Stopped after several failures in a row — see below." : "Stopped. Scan again to pick up where you left off."
      : "Finished. Scan again to retry anything that failed.");
  }

  const byLanguage = audioLanguages.map((language) => {
    const languageJobs = jobs?.filter((job) => job.language === language) || [];
    return { language, count: languageJobs.length, minutes: estimateMinutes(languageJobs) };
  });
  const totalMinutes = jobs ? estimateMinutes(jobs) : 0;

  return (
    <div className="settings-panel anki-panel">
      <p>Generates a recording for every filled learning-language field (not English, which is only the prompt) that has no audio yet, and writes it to that note&apos;s <code>Audio_&lt;Language&gt;</code> field. Uses your OpenAI key and the voices set in <a href="/settings">Settings</a>. Notes tagged <code>pb::skip::&lt;language&gt;</code> are left alone.</p>
      <fieldset className="anki-language-picks" disabled={running}>
        <legend>Languages</legend>
        {audioLanguages.map((language) => (
          <label key={language}><input type="checkbox" checked={selected.has(language)} onChange={() => toggle(language)} /> {language}</label>
        ))}
      </fieldset>
      <div className="input-action-row">
        <button className="save-input-button" type="button" disabled={running || !selected.size} onClick={() => void scan()}>Find notes needing audio</button>
        {status && <span className="example-status" role="status">{status}</span>}
      </div>

      {jobs && jobs.length > 0 && (
        <div className="anki-estimate">
          <table>
            <thead><tr><th>Language</th><th>Clips</th><th>Est. audio</th><th>Est. cost</th></tr></thead>
            <tbody>
              {byLanguage.filter((row) => selected.has(row.language)).map((row) => (
                <tr key={row.language}><td>{row.language}</td><td>{row.count}</td><td>{row.minutes.toFixed(0)} min</td><td>${(row.minutes * dollarsPerMinute).toFixed(2)}</td></tr>
              ))}
              <tr className="total"><td>Total</td><td>{jobs.length}</td><td>{totalMinutes.toFixed(0)} min</td><td>${(totalMinutes * dollarsPerMinute).toFixed(2)}</td></tr>
            </tbody>
          </table>
          <p className="anki-note">Rough estimate, from text length at about $0.015 per minute of audio. Each clip is one OpenAI request, so a large run takes a while — keep this tab open. You can stop at any time; finished notes are tagged <code>pb::audio::&lt;language&gt;</code>, so a later scan skips them.</p>
          <div className="input-action-row">
            {!running && <button className="save-input-button" type="button" onClick={() => void run()}>Generate {jobs.length} clips</button>}
            {running && <button className="danger-button" type="button" onClick={() => { stopRef.current = true; }}>Stop</button>}
            {(running || done > 0) && (
              <span className="anki-progress">
                <progress max={jobs.length} value={done + failures.length} /> {done} of {jobs.length} done{failures.length ? `, ${failures.length} failed` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {failures.length > 0 && (
        <ul className="anki-failures">
          {failures.slice(0, 50).map((failure) => (
            <li key={`${failure.job.noteId}-${failure.job.language}`}>{failure.job.language} · {failure.job.text.slice(0, 40)} — {failure.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
