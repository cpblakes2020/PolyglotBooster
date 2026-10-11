export type Flashcard = {
  front: string;
  back: string;
  tags: string[];
  // Pronunciation (Thai romanization / Japanese kana / pinyin), a brief
  // explanation in English (note) and in the source language
  // (explanation), and whether it's a vocabulary item or a sentence.
  // Optional: older saved reviews don't have them all.
  reading?: string;
  note?: string;
  explanation?: string;
  kind?: "vocabulary" | "sentence";
};

type FlashcardPayload = {
  cards?: unknown;
};

function normalizeCard(value: unknown): Flashcard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as { front?: unknown; back?: unknown; tags?: unknown; reading?: unknown; note?: unknown; explanation?: unknown; kind?: unknown };
  if (typeof card.front !== "string" || !card.front.trim() || typeof card.back !== "string" || !card.back.trim()) return null;
  const tags = Array.isArray(card.tags) ? card.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim().replace(/\s+/g, "-")) : [];
  return {
    front: card.front.trim(),
    back: card.back.trim(),
    tags,
    ...(typeof card.reading === "string" && card.reading.trim() ? { reading: card.reading.trim() } : {}),
    ...(typeof card.note === "string" && card.note.trim() ? { note: card.note.trim() } : {}),
    ...(typeof card.explanation === "string" && card.explanation.trim() ? { explanation: card.explanation.trim() } : {}),
    ...(card.kind === "vocabulary" || card.kind === "sentence" ? { kind: card.kind } : {}),
  };
}

// The complete card objects in a reply that was cut off partway through
// its "cards" array: each top-level {...} that closed before the cut.
function completeCardObjects(json: string): unknown[] {
  const start = json.indexOf("[", json.indexOf('"cards"'));
  if (start < 0) return [];
  const objects: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectStart = -1;
  for (let i = start + 1; i < json.length; i++) {
    const char = json[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") { if (depth === 0) objectStart = i; depth += 1; }
    else if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        try { objects.push(JSON.parse(json.slice(objectStart, i + 1))); } catch { /* skip a malformed card */ }
        objectStart = -1;
      }
    } else if (char === "]" && depth === 0) break;
  }
  return objects;
}

// complete: false when the reply was cut off (too much material for one
// run) and only the cards finished before the cut were recovered.
export function parseFlashcards(result: string): { cards: Flashcard[]; complete: boolean } | null {
  const json = result.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  let raw: unknown[];
  let complete = true;
  try {
    const payload = JSON.parse(json) as FlashcardPayload;
    if (!Array.isArray(payload.cards)) return null;
    raw = payload.cards;
  } catch {
    raw = completeCardObjects(json);
    complete = false;
  }
  // Keep the good cards if a few are malformed, rather than losing them all.
  const cards = raw.map(normalizeCard).filter((card): card is Flashcard => card !== null);
  return cards.length ? { cards, complete } : null;
}
