import type { AnkiLanguage } from "@/lib/anki/vocab";

const openAiTranscriptionEndpoint = "https://api.openai.com/v1/audio/transcriptions";

const languageCodes: Record<AnkiLanguage, string> = { English: "en", Indonesian: "id", Thai: "th", Japanese: "ja", Spanish: "es", French: "fr", Mandarin: "zh" };

type OpenAiTranscription = { text?: string; error?: { message?: string } };

// What a recording says. languages: the ones expected in it, which guide the
// model without filtering: speech in another language is still written down.
// file: its name and type, for anything other than an MP3 clip; OpenAI tells
// the format from the name.
export async function transcribeSpeech(audio: Buffer, languages: AnkiLanguage[], apiKey: string, file: { name: string; type: string } = { name: "clip.mp3", type: "audio/mpeg" }) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: file.type }), file.name);
  form.append("model", "gpt-transcribe");
  for (const language of languages) form.append("languages[]", languageCodes[language]);
  const response = await fetch(openAiTranscriptionEndpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const result = await response.json().catch(() => ({})) as OpenAiTranscription;
  if (!response.ok) throw new Error(result.error?.message || "OpenAI could not transcribe the recording.");
  return (result.text || "").trim();
}
