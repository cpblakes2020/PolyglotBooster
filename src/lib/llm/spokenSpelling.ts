import { runClaudeRawPrompt } from "@/lib/llm/claude";
import { runOpenAiRawPrompt } from "@/lib/llm/openai";

// OpenAI's speech model reads Thai largely from its spelling, so words with
// silent letters or hidden vowels come out wrong (ศีรษะ with its ร sounded).
// Before recording, the text is respelled the way it sounds, for the audio
// only — the note keeps the correct spelling.

// Only short items (words, phrases, sentences) are respelled; long passages
// are recorded as written.
const maxLength = 300;

// Thai tone rules need a strong model: Sonnet 4.5 often respelled ตลาด as
// ตะลาด or ผลไม้ as พนละไม้ (wrong tones); Sonnet 5.5 got them right.
const respellingModel = "claude-sonnet-5-5";

// The model only lists the irregular words and their respellings, which are
// then swapped in, so words that are already spelled as they sound can't be
// damaged by a rewrite.
function spokenSpellingPrompt(text: string, reading?: string) {
  const instructions = [
    "A speech engine reads Thai by sounding every letter as written. Find the words in this Thai text whose pronunciation differs from their spelling: silent letters (ศีรษะ → สีสะ, จันทร์ → จัน, สามารถ → สามาด) or hidden vowels (สบาย → สะบาย, ผลไม้ → ผนละไม้, ตลาด → ตะหลาด).",
    "For each, give a respelling that is read correctly letter by letter and keeps every syllable's tone. Words that are read as spelled (e.g. เพราะ, ฉะนั้น, ครับ) must not be listed.",
    ...(reading ? [`The text's pronunciation, romanized: ${reading}`] : []),
    "Return only a JSON array of {\"word\": exactly as it appears in the text, \"spoken\": the respelling}, or [] if there are none.",
  ];
  return `${instructions.join("\n")}\n\n${text}`;
}

const thaiWord = /^[฀-๿]+$/;

// The JSON array, even if the model wrapped it in a code fence or wrote an
// explanation first.
function parseRespellings(result: string) {
  const start = result.indexOf("[");
  const end = result.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  try {
    const parsed: unknown = JSON.parse(result.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed as { word?: unknown; spoken?: unknown }[] : [];
  } catch {
    return [];
  }
}

export async function thaiSpokenSpelling(text: string, keys: { anthropic?: string; openai?: string }, reading?: string) {
  if (text.length > maxLength) return text;
  try {
    const prompt = spokenSpellingPrompt(text, reading);
    const result = (keys.anthropic ? await runClaudeRawPrompt(prompt, keys.anthropic, respellingModel) : await runOpenAiRawPrompt(prompt, keys.openai)).trim();
    let spoken = text;
    for (const { word, spoken: respelled } of parseRespellings(result)) {
      // Only exact words from the text, replaced by plausible Thai respellings.
      if (typeof word !== "string" || typeof respelled !== "string" || !thaiWord.test(word) || !thaiWord.test(respelled)) continue;
      if (!text.includes(word) || respelled.length > word.length * 2 + 2 || respelled.length < word.length / 2) continue;
      spoken = spoken.split(word).join(respelled);
    }
    return spoken;
  } catch {
    return text;
  }
}
