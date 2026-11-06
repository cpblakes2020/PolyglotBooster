"use client";

import { useCallback, useEffect, useState } from "react";
import type { Language } from "@/lib/types";
import { audio2Default, defaultVoiceSettings, ttsVoices, type TtsVoice, type VoiceSetting } from "@/lib/voices";

export type VoiceDefaults = {
  voices: Record<Language, VoiceSetting>;
  voices2: Partial<Record<Language, VoiceSetting>>;
  // Makes this the default for that language's first or second recording.
  saveDefault: (language: Language, slot: 1 | 2, setting: VoiceSetting) => Promise<void>;
  // The default for one of a language's recordings.
  defaultFor: (language: Language, slot: 1 | 2) => VoiceSetting;
};

// The voices saved in Settings, for the pages that record audio.
export function useVoiceDefaults(): VoiceDefaults {
  const [voices, setVoices] = useState<Record<Language, VoiceSetting>>(defaultVoiceSettings);
  const [voices2, setVoices2] = useState<Partial<Record<Language, VoiceSetting>>>({});

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
        // Fall back to the default voices.
      }
    })();
  }, []);

  const saveDefault = useCallback(async (language: Language, slot: 1 | 2, setting: VoiceSetting) => {
    const body = slot === 1 ? { voices: { ...voices, [language]: setting } } : { voices2: { ...voices2, [language]: setting } };
    const response = await fetch("/api/account/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(data.error || "The default couldn't be saved.");
    if (slot === 1) setVoices((current) => ({ ...current, [language]: setting }));
    else setVoices2((current) => ({ ...current, [language]: setting }));
  }, [voices, voices2]);

  const defaultFor = useCallback((language: Language, slot: 1 | 2) => slot === 1 ? voices[language] : audio2Default(language, voices, voices2), [voices, voices2]);

  return { voices, voices2, saveDefault, defaultFor };
}

const sameSetting = (a: VoiceSetting, b: VoiceSetting) => a.voice === b.voice && a.instructions.trim() === b.instructions.trim();

// The voice list, with a button to keep the current choice as the default
// once it differs from it.
export function VoicePick({ setting, usual, slot, disabled, onVoice, onSave }: {
  setting: VoiceSetting;
  usual: VoiceSetting;
  slot: 1 | 2;
  disabled: boolean;
  onVoice: (voice: TtsVoice) => void;
  onSave: () => void;
}) {
  return (
    <>
      <label className="anki-voice-pick">Voice
        <select value={setting.voice} disabled={disabled} onChange={(event) => onVoice(event.target.value as TtsVoice)}>
          {ttsVoices.map((voice) => <option key={voice}>{voice}</option>)}
        </select>
      </label>
      {!sameSetting(setting, usual) && <button className="text-button" type="button" disabled={disabled} title={`Saves this voice and its instructions as your Audio ${slot} default for this language, in place of ${usual.voice} and its instructions`} onClick={onSave}>Save as default</button>}
    </>
  );
}

// The instructions the voice follows, for these recordings.
export function ReadingStyle({ value, usual, disabled, onChange, onReset }: {
  value: string;
  usual: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const changed = value.trim() !== usual.trim();
  return (
    <details className="anki-reading-style">
      <summary>How it&apos;s read{changed ? " (changed)" : ""}</summary>
      <label className="anki-field-edit">Instructions for the voice (add to them rather than replacing them, because they also set the accent)
        <textarea className="anki-reading-input" maxLength={1000} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      </label>
      {changed && <button className="text-button" type="button" disabled={disabled} onClick={onReset}>Back to the default instructions</button>}
    </details>
  );
}
