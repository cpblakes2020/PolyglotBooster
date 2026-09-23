import type { Language } from "@/lib/types";

// Built-in voices for gpt-4o-mini-tts. OpenAI recommends marin and cedar
// for the best quality.
export const ttsVoices = ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"] as const;
export type TtsVoice = typeof ttsVoices[number];

// OpenAI voices aren't tied to a language; the instructions are what steer
// accent and pacing.
export type VoiceSetting = { voice: TtsVoice; instructions: string };

const pace = "Speak clearly at a slightly slow, learner-friendly pace, as a native speaker reading a flashcard aloud.";

export const defaultVoiceSettings: Record<Language, VoiceSetting> = {
  Thai: { voice: "marin", instructions: `Speak natural Central Thai with a native Bangkok accent and accurate tones. ${pace}` },
  Japanese: { voice: "marin", instructions: `Speak natural standard Japanese (Tokyo accent) with accurate pitch accent. ${pace}` },
  Indonesian: { voice: "cedar", instructions: `Speak natural standard Indonesian (Bahasa Indonesia) with a native Jakarta accent. ${pace}` },
  English: { voice: "cedar", instructions: `Speak natural General American English. ${pace}` },
  Spanish: { voice: "marin", instructions: `Speak natural Spanish with a native accent. ${pace}` },
  French: { voice: "marin", instructions: `Speak natural standard French with a native accent. ${pace}` },
  Mandarin: { voice: "marin", instructions: `Speak natural standard Mandarin Chinese (Putonghua) with accurate tones. ${pace}` },
};

export function isTtsVoice(value: unknown): value is TtsVoice {
  return typeof value === "string" && (ttsVoices as readonly string[]).includes(value);
}

export function resolveVoiceSetting(language: Language | undefined, saved?: Partial<Record<Language, VoiceSetting>>): VoiceSetting | undefined {
  if (!language) return undefined;
  return saved?.[language] || defaultVoiceSettings[language];
}
