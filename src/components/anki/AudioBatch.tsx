"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { speak } from "@/components/anki/api";
import { soundFilename } from "@/components/anki/ClipMatcher";
import { ReadingStyle, VoicePick, useVoiceDefaults } from "@/components/anki/VoiceControls";
import { previewText } from "@/components/settings/VoiceSettings";
import { anki } from "@/lib/anki/connect";
import { audioReading, cleanField } from "@/lib/anki/fields";
import { audio2Field, audioField, audioFilename, audioLanguages, notesField, pbTags, soundField, type AnkiLanguage } from "@/lib/anki/vocab";
import type { TtsVoice, VoiceSetting } from "@/lib/voices";

type Job = { noteId: number; language: AnkiLanguage; text: string; reading: string };
type Failure = { job: Job; message: string };

// Rough learner-pace speaking rates (characters per second) for the cost
// estimate. gpt-4o-mini-tts costs about $0.015 per minute of audio.
const charsPerSecond: Record<AnkiLanguage, number> = { English: 14, Indonesian: 14, Thai: 9, Japanese: 7, Spanish: 14, French: 14, Mandarin: 5 };
const dollarsPerMinute = 0.015;
const concurrency = 3;
const maxConsecutiveFailures = 5;

function formatMinutes(minutes: number) {
  return `${minutes < 1 ? minutes.toFixed(1) : minutes.toFixed(0)} min`;
}

function estimateMinutes(jobs: Job[]) {
  const seconds = jobs.reduce((total, job) => total + Math.max(1.5, job.text.length / charsPerSecond[job.language]) + 0.5, 0);
  return seconds / 60;
}

// audio2Ready: the note type has second-recording fields.
export function AudioBatch({ audio2Ready }: { audio2Ready: boolean }) {
  // Which recording to fill: the first, or the second, in another voice.
  const [slot, setSlot] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<AnkiLanguage>>(new Set(audioLanguages));
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [replace, setReplace] = useState(false);
  const { defaultFor, saveDefault } = useVoiceDefaults();
  // Choices for this tab, per recording and language, which don't touch Settings.
  const [voicePicks, setVoicePicks] = useState<Record<1 | 2, Partial<Record<AnkiLanguage, TtsVoice>>>>({ 1: {}, 2: {} });
  const [stylePicks, setStylePicks] = useState<Record<1 | 2, Partial<Record<AnkiLanguage, string>>>>({ 1: {}, 2: {} });
  const [previewing, setPreviewing] = useState<AnkiLanguage | null>(null);
  const stopRef = useRef(false);

  const settingFor = (language: AnkiLanguage): VoiceSetting => {
    const usual = defaultFor(language, slot);
    return { voice: voicePicks[slot][language] ?? usual.voice, instructions: stylePicks[slot][language] ?? usual.instructions };
  };

  async function keepAsDefault(language: AnkiLanguage) {
    try {
      await saveDefault(language, slot, settingFor(language));
      setStatus(`Saved as your ${language} Audio ${slot} default.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The default couldn't be saved.");
    }
  }

  async function preview(language: AnkiLanguage) {
    setPreviewing(language);
    try {
      const audio = await speak(previewText[language], language, undefined, settingFor(language));
      await new Audio(`data:audio/mpeg;base64,${audio}`).play();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The preview could not be played.");
    } finally {
      setPreviewing(null);
    }
  }

  function toggle(language: AnkiLanguage) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(language)) next.delete(language); else next.add(language);
      return next;
    });
    setJobs(null);
  }

  async function scan() {
    setStatus(replace ? "Finding notes with this language filled in..." : "Finding notes without audio...");
    setJobs(null);
    setFailures([]);
    setDone(0);
    try {
      const found: Job[] = [];
      for (const language of audioLanguages.filter((item) => selected.has(item))) {
        // Audio 2 plays after Audio 1, so it's only for notes that have one.
        // A book recording in Audio 1 is no reason to skip them, but one
        // already in Audio 2 isn't replaced.
        const query = slot === 1
          ? `${language}:_* ${replace ? "" : `${audioField(language)}:`} -tag:${pbTags.skip(language)} -tag:${pbTags.bookAudio(language)}`
          : `${language}:_* ${audioField(language)}:_* ${replace ? "" : `${audio2Field(language)}:`} -tag:${pbTags.skip(language)}`;
        for (const note of await anki.notesMatching(query)) {
          if (slot === 2 && /-book/.test(soundFilename(note.fields[audio2Field(language)] || "") || "")) continue;
          const text = cleanField(note.fields[language] || "", language).text;
          if (text) found.push({ noteId: note.noteId, language, text, reading: audioReading(note.fields[notesField(language)] || "") });
        }
      }
      setJobs(found);
      setStatus(found.length ? "" : replace ? `No notes${slot === 2 ? " with Audio 1" : ""} have the selected languages filled in.` : slot === 2 ? "Every note with Audio 1 in the selected languages already has Audio 2." : "Every selected language already has audio.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notes could not be loaded from Anki.");
    }
  }

  async function runJob(job: Job, version?: string) {
    if (slot === 2) {
      const audio = await speak(job.text, job.language, job.reading, settingFor(job.language));
      const filename = await anki.storeMedia(audioFilename(job.noteId, job.language, version ? `2-${version}` : "2"), audio);
      await anki.updateFields(job.noteId, { [audio2Field(job.language)]: soundField(filename) });
      return;
    }
    const audio = await speak(job.text, job.language, job.reading, settingFor(job.language));
    const filename = await anki.storeMedia(audioFilename(job.noteId, job.language, version), audio);
    await anki.updateFields(job.noteId, { [audioField(job.language)]: soundField(filename) });
    await anki.addTags([job.noteId], [pbTags.audio(job.language)]);
  }

  async function run() {
    if (!jobs?.length) return;
    if (replace && !window.confirm(`Replace the existing ${slot === 2 ? "Audio 2" : "audio"} on ${jobs.length} notes?${slot === 2 ? " Any Audio 2 you added by hand from your own file is replaced too." : ""} The old recordings stay in Anki's media folder until you run Tools → Check Media.`)) return;
    // One version per run, so a stopped and restarted replacement still
    // produces new filenames.
    const version = replace ? Date.now().toString(36) : undefined;
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
          await runJob(job, version);
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
      <p>Generates a recording for every filled learning-language field (not English, which is only the prompt) that has no audio yet, and writes it to that note&apos;s <code>Audio_&lt;Language&gt;</code> field. Uses your OpenAI key and the voices set in <a href="/settings">Settings</a>. Notes tagged <code>pb::skip::&lt;language&gt;</code> are left alone, and so is textbook audio added with Book audio (tagged <code>pb::book-audio::&lt;language&gt;</code>), even when replacing.</p>
      <fieldset className="anki-language-picks" disabled={running}>
        <legend>Recording</legend>
        <label><input type="radio" name="bulk-audio-slot" checked={slot === 1} onChange={() => { setSlot(1); setJobs(null); }} /> Audio 1</label>
        <label><input type="radio" name="bulk-audio-slot" checked={slot === 2} disabled={!audio2Ready} onChange={() => { setSlot(2); setJobs(null); }} /> Audio 2</label>
      </fieldset>
      {slot === 2 && <p className="anki-note">Adds a second recording in another voice, played after the first, to notes that have Audio 1 but no Audio 2. That includes notes whose Audio 1 is a textbook or video clip, and those clips are left as they are.</p>}
      {!audio2Ready && <p className="anki-note">Audio 2 needs listening cards in your note type: use <b>Add listening cards</b> above first.</p>}
      <fieldset className="anki-language-picks" disabled={running}>
        <legend>Languages</legend>
        {audioLanguages.map((language) => (
          <label key={language}><input type="checkbox" checked={selected.has(language)} onChange={() => toggle(language)} /> {language}</label>
        ))}
      </fieldset>
      <div className="anki-bulk-voices">
        {audioLanguages.filter((language) => selected.has(language)).map((language) => (
          <div className="anki-bulk-voice" key={language}>
            <span className="anki-bulk-language">{language}</span>
            <VoicePick setting={settingFor(language)} usual={defaultFor(language, slot)} slot={slot} disabled={running} onVoice={(voice) => setVoicePicks((current) => ({ ...current, [slot]: { ...current[slot], [language]: voice } }))} onSave={() => void keepAsDefault(language)} />
            <button className="text-button" type="button" disabled={running || previewing !== null} onClick={() => void preview(language)}>{previewing === language ? "Playing..." : "Preview"}</button>
            <ReadingStyle value={settingFor(language).instructions} usual={defaultFor(language, slot).instructions} disabled={running} onChange={(value) => setStylePicks((current) => ({ ...current, [slot]: { ...current[slot], [language]: value } }))} onReset={() => setStylePicks((current) => ({ ...current, [slot]: { ...current[slot], [language]: undefined } }))} />
          </div>
        ))}
        {!selected.size && <p className="anki-note">No languages selected.</p>}
      </div>
      <p className="anki-voices">These choices last until you leave this tab. <b>Save as default</b> keeps them, or <Link href="/settings">change the defaults in Settings</Link>.</p>
      <label className="anki-checkbox">
        <input type="checkbox" checked={replace} disabled={running} onChange={(event) => { setReplace(event.target.checked); setJobs(null); }} />
        Replace existing {slot === 2 ? "Audio 2" : "audio"} too (e.g. after choosing a new voice)
      </label>
      <div className="input-action-row">
        <button className="save-input-button" type="button" disabled={running || !selected.size} onClick={() => void scan()}>{replace ? "Find notes to re-record" : "Find notes needing audio"}</button>
        {status && <span className="example-status" role="status">{status}</span>}
      </div>

      {jobs && jobs.length > 0 && (
        <div className="anki-estimate">
          <table>
            <thead><tr><th>Language</th><th>Clips</th><th>Est. audio</th><th>Est. cost</th></tr></thead>
            <tbody>
              {byLanguage.filter((row) => selected.has(row.language)).map((row) => (
                <tr key={row.language}><td>{row.language}</td><td>{row.count}</td><td>{formatMinutes(row.minutes)}</td><td>${(row.minutes * dollarsPerMinute).toFixed(2)}</td></tr>
              ))}
              <tr className="total"><td>Total</td><td>{jobs.length}</td><td>{formatMinutes(totalMinutes)}</td><td>${(totalMinutes * dollarsPerMinute).toFixed(2)}</td></tr>
            </tbody>
          </table>
          <p className="anki-note">Rough estimate, from text length at about $0.015 per minute of audio. Each clip is one OpenAI request, so a large run takes a while — keep this tab open. You can stop at any time; {replace ? "re-scan to see what's left, but note a re-scan in replace mode lists every note again." : slot === 2 ? "finished notes have Audio 2 now, so a later scan skips them." : <>finished notes are tagged <code>pb::audio::&lt;language&gt;</code>, so a later scan skips them.</>}</p>
          <div className="input-action-row">
            {!running && <button className="save-input-button" type="button" onClick={() => void run()}>{replace ? "Re-record" : "Generate"} {jobs.length} clips</button>}
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
