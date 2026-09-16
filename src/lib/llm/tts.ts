const openAiSpeechEndpoint = "https://api.openai.com/v1/audio/speech";

export function getTtsVoice(): string {
  return process.env.OPENAI_TTS_VOICE || "alloy";
}

// OpenAI's TTS endpoint caps input length; split long passages at paragraph
// boundaries and synthesize each chunk separately.
const maxChunkLength = 4000;

function splitIntoChunks(text: string): string[] {
  if (text.length <= maxChunkLength) return [text];
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChunkLength) {
      if (current) chunks.push(current);
      current = paragraph.length > maxChunkLength ? paragraph.slice(0, maxChunkLength) : paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

type OpenAiErrorResponse = { error?: { message?: string } };

async function synthesizeChunk(text: string, apiKey: string): Promise<Buffer> {
  const response = await fetch(openAiSpeechEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: getTtsVoice(),
      input: text,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as OpenAiErrorResponse | null;
    throw new Error(errorBody?.error?.message || "OpenAI could not generate audio.");
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function synthesizeSpeech(text: string, apiKey?: string): Promise<Buffer> {
  if (!apiKey) throw new Error("Add your OpenAI API key before generating audio.");
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Add some text before generating audio.");

  const chunks = splitIntoChunks(trimmed);
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    buffers.push(await synthesizeChunk(chunk, apiKey));
  }
  return Buffer.concat(buffers);
}
