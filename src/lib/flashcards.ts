export type Flashcard = {
  front: string;
  back: string;
  tags: string[];
  // Pronunciation (Thai romanization / Japanese kana), a short note from the
  // material, and whether it's a vocabulary item or a sentence. Optional:
  // older saved reviews don't have them.
  reading?: string;
  note?: string;
  kind?: "vocabulary" | "sentence";
};

type FlashcardPayload = {
  cards?: unknown;
};

function normalizeCard(value: unknown): Flashcard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as { front?: unknown; back?: unknown; tags?: unknown; reading?: unknown; note?: unknown; kind?: unknown };
  if (typeof card.front !== "string" || !card.front.trim() || typeof card.back !== "string" || !card.back.trim()) return null;
  const tags = Array.isArray(card.tags) ? card.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim().replace(/\s+/g, "-")) : [];
  return {
    front: card.front.trim(),
    back: card.back.trim(),
    tags,
    ...(typeof card.reading === "string" && card.reading.trim() ? { reading: card.reading.trim() } : {}),
    ...(typeof card.note === "string" && card.note.trim() ? { note: card.note.trim() } : {}),
    ...(card.kind === "vocabulary" || card.kind === "sentence" ? { kind: card.kind } : {}),
  };
}

export function parseFlashcards(result: string): Flashcard[] | null {
  const json = result.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  try {
    const payload = JSON.parse(json) as FlashcardPayload;
    if (!Array.isArray(payload.cards)) return null;
    // Keep the good cards if a few are malformed, rather than losing them all.
    const cards = payload.cards.map(normalizeCard).filter((card): card is Flashcard => card !== null);
    return cards.length ? cards : null;
  } catch {
    return null;
  }
}
