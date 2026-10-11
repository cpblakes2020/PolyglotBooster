"use client";

import { useState } from "react";
import type { AnalysisOptions } from "@/components/anki/api";
import { BranchQueue } from "@/components/anki/BranchQueue";
import { anki } from "@/lib/anki/connect";
import { classifyItem } from "@/lib/anki/classify";
import type { BranchItem } from "@/lib/anki/prompts";
import { isAnkiLanguage, type AnkiLanguage } from "@/lib/anki/vocab";
import type { Flashcard } from "@/lib/flashcards";
import type { Language } from "@/lib/types";

type FlashcardsToAnkiProps = {
  cards: Flashcard[];
  sourceLanguage: Language;
  options: AnalysisOptions;
};

// Flashcards can go to Anki when their front is a learning language that
// Polyglot Vocab has fields for and their back is English.
export function canSendFlashcardsToAnki(sourceLanguage: Language, userLanguage: Language) {
  return isAnkiLanguage(sourceLanguage) && sourceLanguage !== "English" && userLanguage === "English";
}

const notInitials = new Set(["a", "an", "and", "the", "of", "to", "in", "for", "chapter", "ch", "unit", "lesson", "part", "page", "pages", "book", "vol", "volume"]);

// A short batch tag from the source name: initials plus numbers, e.g.
// "Speak Thai Today, chapter 22" -> "STT22".
export function sourceTag(source: string) {
  const words = source.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const initials = words.filter((word) => !/^\d+$/.test(word) && !notInitials.has(word.toLowerCase())).map((word) => word[0].toUpperCase()).join("");
  const numbers = words.filter((word) => /^\d+$/.test(word)).join("-");
  return `${initials}${numbers}`;
}

function toItem(card: Flashcard, language: AnkiLanguage): BranchItem {
  return {
    text: card.front,
    english: card.back,
    reading: card.reading || "",
    comment: card.note || "",
    explanation: card.explanation || "",
    kind: card.kind || (classifyItem(card.front, language).kind === "sentence" ? "sentence" : "vocabulary"),
    tags: card.tags,
  };
}

// Sends a "Make flashcards" result through the same pick-and-review queue as
// branching: tick the cards you want, then add each one (brief note or full
// analysis), add its note to an existing card, or skip it.
export function FlashcardsToAnki({ cards, sourceLanguage, options }: FlashcardsToAnkiProps) {
  const [stage, setStage] = useState<"closed" | "source" | "queue">("closed");
  const [source, setSource] = useState("");
  // Follows the source name until edited by hand.
  const [batchTag, setBatchTag] = useState("");
  const [tagEdited, setTagEdited] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [items, setItems] = useState<BranchItem[]>([]);
  const language = sourceLanguage as AnkiLanguage;

  function start() {
    const tag = batchTag.trim().replace(/\s+/g, "-");
    setItems(cards.map((card) => {
      const item = toItem(card, language);
      return tag ? { ...item, tags: [...new Set([tag, ...(item.tags || [])])] } : item;
    }));
    anki.getTags().then((tags) => setTagSuggestions(tags.filter((tag) => !tag.startsWith("pb::")).sort()), () => {});
    setStage("queue");
  }

  if (stage === "closed") {
    return (
      <span className="anki-send-cards">
        <button className="preview-prompt-button" type="button" onClick={() => setStage("source")}>Send cards to Anki</button>
        <small>Next you can name the source (e.g. a book chapter) and a tag for the whole set.</small>
      </span>
    );
  }

  if (stage === "source") {
    return (
      <form className="send-to-anki" onSubmit={(event) => { event.preventDefault(); start(); }}>
        <p className="result-label">Send {cards.length} cards to Anki</p>
        <label className="anki-field-edit">Where are these from? (optional — shown on each note as &ldquo;Seen in&rdquo;)
          <input value={source} placeholder="e.g. Speak Thai Today, chapter 22" onChange={(event) => { setSource(event.target.value); if (!tagEdited) setBatchTag(sourceTag(event.target.value)); }} />
        </label>
        <label className="anki-field-edit"><span>Tag every card (optional — for studying this set later with <code>tag:{batchTag.trim() || "…"}</code>)</span>
          <input value={batchTag} placeholder="e.g. STT22" onChange={(event) => { setBatchTag(event.target.value); setTagEdited(true); }} />
        </label>
        <div className="result-actions">
          <button className="save-input-button" type="submit">Choose cards</button>
          <button className="text-button" type="button" onClick={() => setStage("closed")}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <BranchQueue
      language={language}
      parentText={source.trim()}
      parentEnglish=""
      analysis=""
      options={options}
      items={items}
      pick
      doneLabel="Done"
      batchTags={batchTag.trim() ? [batchTag.trim().replace(/\s+/g, "-")] : []}
      depth={1}
      tagSuggestions={tagSuggestions}
      onFinish={() => setStage("closed")}
    />
  );
}
