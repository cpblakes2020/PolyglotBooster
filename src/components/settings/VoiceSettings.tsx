"use client";

import { useEffect, useState } from "react";
import { languages } from "@/lib/languages";
import type { Language } from "@/lib/types";
import { defaultVoiceSettings, ttsVoices, type TtsVoice, type VoiceSetting } from "@/lib/voices";

const previewText: Record<Language, string> = {
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
  const [status, setStatus] = useState("");
  const [previewing, setPreviewing] = useState<Language | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/account/settings");
        const data = await response.json() as { settings?: { voices?: Partial<Record<Language, VoiceSetting>> } };
        if (response.ok) setVoices({ ...defaultVoiceSettings, ...data.settings?.voices });
      } catch {
        setStatus("Saved voices could not be loaded; showing defaults.");
      }
    })();
  }, []);

  function update(language: Language, changes: Partial<VoiceSetting>) {
    setVoices((current) => ({ ...current, [language]: { ...current[language], ...changes } }));
    setStatus("");
  }

  async function save() {
    setStatus("Saving...");
    try {
      const response = await fetch("/api/account/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voices }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "The voices could not be saved.");
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The voices could not be saved.");
    }
  }

  async function preview(language: Language) {
    setPreviewing(language);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: previewText[language], language, delivery: "inline", voice: voices[language] }),
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
      <p>Each language gets its own OpenAI voice. The instructions set the accent and pace, since the voices themselves aren&apos;t tied to a language. Used for the 🔊 button and for Anki audio.</p>
      {languages.map((language) => (
        <div className="api-key-setting voice-setting" key={language}>
          <label htmlFor={`voice-${language}`}>{language}</label>
          <div className="voice-setting-row">
            <select id={`voice-${language}`} value={voices[language].voice} onChange={(event) => update(language, { voice: event.target.value as TtsVoice })}>
              {ttsVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
            </select>
            <button className="text-button" type="button" disabled={previewing !== null} onClick={() => void preview(language)}>
              {previewing === language ? "Playing..." : "Preview"}
            </button>
          </div>
          <textarea
            aria-label={`${language} voice instructions`}
            value={voices[language].instructions}
            maxLength={1000}
            onChange={(event) => update(language, { instructions: event.target.value })}
          />
        </div>
      ))}
      <div className="input-action-row">
        <button className="save-input-button" type="button" onClick={() => void save()}>Save voices</button>
        {status && <span className="example-status" role="status">{status}</span>}
      </div>
    </section>
  );
}
