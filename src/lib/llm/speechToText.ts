import type { AnkiLanguage } from "@/lib/anki/vocab";

const openAiTranscriptionEndpoint = "https://api.openai.com/v1/audio/transcriptions";

const languageCodes: Record<AnkiLanguage, string> = { English: "en", Indonesian: "id", Thai: "th", Japanese: "ja", Spanish: "es", French: "fr", Mandarin: "zh" };

type OpenAiTranscription = { text?: string; error?: { message?: string } };

// What a short MP3 clip says, in its language.
export async function transcribeSpeech(audio: Buffer, language: AnkiLanguage, apiKey: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "clip.mp3");
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe");
  form.append("language", languageCodes[language]);
  const response = await fetch(openAiTranscriptionEndpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const result = await response.json().catch(() => ({})) as OpenAiTranscription;
  if (!response.ok) throw new Error(result.error?.message || "OpenAI could not transcribe the clip.");
  return (result.text || "").trim();
}
