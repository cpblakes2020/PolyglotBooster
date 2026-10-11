"use client";

import type { Flashcard } from "@/lib/flashcards";
import type { Language } from "@/lib/types";

type FlashcardEditorProps = {
  cards: Flashcard[];
  sourceLanguage: Language;
  onChange: (cards: Flashcard[]) => void;
};

const readingLabels: Partial<Record<Language, string>> = { Thai: "Romanization", Japanese: "Reading (hiragana)", Mandarin: "Pinyin" };

// The cards from Make flashcards, editable before saving them for review or
// sending them to Anki: front and back, the reading, the brief explanations
// (in the source language, for its Notes field, and in English, for the
// English note) and tags.
export function FlashcardEditor({ cards, sourceLanguage, onChange }: FlashcardEditorProps) {
  const readingLabel = readingLabels[sourceLanguage];
  const edit = (index: number, changes: Partial<Flashcard>) => onChange(cards.map((card, cardIndex) => cardIndex === index ? { ...card, ...changes } : card));

  return (
    <div className="flashcard-editor">
      {cards.map((card, index) => (
        // Keyed by position, not text, so editing the front doesn't rebuild
        // the card (and lose your place) on every keystroke.
        <article className="flashcard-edit" key={index}>
          <label>Front<textarea value={card.front} onChange={(event) => edit(index, { front: event.target.value })} /></label>
          <label>Back<textarea value={card.back} onChange={(event) => edit(index, { back: event.target.value })} /></label>
          {(readingLabel || card.reading) && (
            <label className="wide">{readingLabel || "Reading"}<input value={card.reading || ""} onChange={(event) => edit(index, { reading: event.target.value })} /></label>
          )}
          <label>Explanation in {sourceLanguage}<textarea className="short" value={card.explanation || ""} onChange={(event) => edit(index, { explanation: event.target.value })} /></label>
          <label>English note<textarea className="short" value={card.note || ""} onChange={(event) => edit(index, { note: event.target.value })} /></label>
          <label className="wide">Tags<input value={card.tags.join(", ")} onChange={(event) => edit(index, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label>
          <button type="button" className="remove-card-button" aria-label={`Remove flashcard ${index + 1}`} onClick={() => onChange(cards.filter((_, cardIndex) => cardIndex !== index))}>Remove</button>
        </article>
      ))}
      <button className="preview-prompt-button" type="button" onClick={() => onChange([...cards, { front: "", back: "", tags: [] }])}>Add card</button>
    </div>
  );
}
