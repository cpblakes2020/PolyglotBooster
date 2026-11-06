"use client";

import { useEffect, useState } from "react";
import { languages } from "@/lib/languages";
import type { Language } from "@/lib/types";
import { audio2Default, defaultVoiceSettings, ttsVoices, type TtsVoice, type VoiceSetting } from "@/lib/voices";

export const previewText: Record<Language, string> = {
  Thai: "ยินดีที่ได้รู้จักครับ",
  Japanese: "はじめまして、よろしくお願いします。",
  Indonesian: "Senang bertemu dengan Anda.",
  English: "Nice to meet you.",
  Spanish: "Mucho gusto en conocerte.",
  French: "Enchanté de faire votre connaissance.",
  Mandarin: "很高兴认识你。",
};

export function VoiceSettings() {
  const [voices, setVoices] = useState<Record<Language, VoiceSetting>>(defaultVoiceSettings);
  // Second-recording (Audio 2) voices, for languages that have their own.
  const [voices2, setVoices2] = useState<Partial<Record<Language, VoiceSetting>>>({});
  const [status, setStatus] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/account/settings");
        const data = await response.json() as { settings?: { voices?: Partial<Record<Language, VoiceSetting>>; voices2?: Partial<Record<Language, VoiceSetting>> } };
        if (response.ok) {
          setVoices({ ...defaultVoiceSettings, ...data.settings?.voices });
          setVoices2(data.settings?.voices2 ?? {});
        }
      } catch {
        setStatus("Saved voices could not be loaded; showing defaults.");
      }
    })();
  }, []);

  function update(language: Language, changes: Partial<VoiceSetting>) {
    setVoices((current) => ({ ...current, [language]: { ...current[language], ...changes } }));
    setStatus("");
  }

  // The first change gives the language its own Audio 2 voice, starting from
  // the one it was using.
  function update2(language: Language, changes: Partial<VoiceSetting>) {
    setVoices2((current) => ({ ...current, [language]: { ...audio2Default(language, voices, current), ...changes } }));
    setStatus("");
  }

  function clear2(language: Language) {
    setVoices2((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== language)));
    setStatus("");
  }

  async function save() {
    setStatus("Saving...");
    try {
      const response = await fetch("/api/account/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voices, voices2 }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "The voices could not be saved.");
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The voices could not be saved.");
    }
  }

  async function preview(language: Language, voice: VoiceSetting, key: string) {
    setPreviewing(key);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: previewText[language], language, delivery: "inline", voice }),
      });
      const data = await response.json() as { error?: string; data?: string };
      if (!response.ok || !data.data) throw new Error(data.error || "The preview could not be generated.");
      await new Audio(`data:audio/mpeg;base64,${data.data}`).play();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The preview could not be generated.");
    } finally {
      setPreviewing(null);
    }
  }

  return (
    <section className="settings-panel" aria-labelledby="voice-settings-title">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Audio</p>
          <h2 id="voice-settings-title">Voices</h2>
        </div>
      </div>
      <p>Each language gets its own OpenAI voice. The instructions set the accent and pace, since the voices themselves aren&apos;t tied to a language. Used for the 🔊 button and for Anki audio. Audio 2 is the second recording on an Anki card, which plays after the first.</p>
      {languages.map((language) => {
        const second = audio2Default(language, voices, voices2);
        return (
          <div className="api-key-setting voice-setting" key={language}>
            <label htmlFor={`voice-${language}`}>{language}</label>
            <div className="voice-setting-row">
              <select id={`voice-${language}`} value={voices[language].voice} onChange={(event) => update(language, { voice: event.target.value as TtsVoice })}>
                {ttsVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
              </select>
              <button className="text-button" type="button" disabled={previewing !== null} onClick={() => void preview(language, voices[language], language)}>
                {previewing === language ? "Playing..." : "Preview"}
              </button>
            </div>
            <textarea
              aria-label={`${language} voice instructions`}
              value={voices[language].instructions}
              maxLength={1000}
              onChange={(event) => update(language, { instructions: event.target.value })}
            />
            {language !== "English" && (
              <details className="voice-setting-second" open={Boolean(voices2[language])}>
                <summary>Audio 2: {second.voice}{voices2[language] ? "" : " (automatic)"}</summary>
                <div className="voice-setting-row">
                  <select aria-label={`${language} Audio 2 voice`} value={second.voice} onChange={(event) => update2(language, { voice: event.target.value as TtsVoice })}>
                    {ttsVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
                  </select>
                  <button className="text-button" type="button" disabled={previewing !== null} onClick={() => void preview(language, second, `${language}-2`)}>
                    {previewing === `${language}-2` ? "Playing..." : "Preview"}
                  </button>
                  {voices2[language] && <button className="text-button" type="button" onClick={() => clear2(language)}>Back to automatic</button>}
                </div>
                <textarea
                  aria-label={`${language} Audio 2 voice instructions`}
                  value={second.instructions}
                  maxLength={1000}
                  onChange={(event) => update2(language, { instructions: event.target.value })}
                />
                {!voices2[language] && <p>Automatic: a different voice from the one above, with the same instructions. Change either here to give Audio 2 its own.</p>}
              </details>
            )}
          </div>
        );
      })}
      <div className="input-action-row">
        <button className="save-input-button" type="button" onClick={() => void save()}>Save voices</button>
        {status && <span className="example-status" role="status">{status}</span>}
      </div>
    </section>
  );
}
