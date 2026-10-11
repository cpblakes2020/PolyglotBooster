"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { describeSelection, type AnalysisOptions } from "@/components/anki/api";
import { BranchQueue } from "@/components/anki/BranchQueue";
import { canSendFlashcardsToAnki } from "@/components/anki/FlashcardsToAnki";
import { useSaveForLater } from "@/components/anki/later";
import { useSelectionMenu } from "@/components/anki/selection";
import { anki } from "@/lib/anki/connect";
import type { BranchItem } from "@/lib/anki/prompts";
import type { AnkiLanguage } from "@/lib/anki/vocab";
import type { Language } from "@/lib/types";

type AnkiSelectionAreaProps = {
  sourceLanguage: Language;
  userLanguage: Language;
  // The studied text, for the new note's "Seen in" line.
  sourceText: string;
  // The analysis and any follow-ups: what the selected text is looked up in.
  context: string;
  options: AnalysisOptions;
  children: ReactNode;
};

// A result and its follow-ups as one piece of context for the lookup.
export function studyContext(result: string, followUps: { question: string; answer: string }[] = []) {
  return [result, ...followUps.flatMap((item) => [`Follow-up question: ${item.question}`, `Answer:\n${item.answer}`])].join("\n\n");
}

// "Seen in" for a passage: its first line, shortened.
function seenInText(sourceText: string) {
  const firstLine = sourceText.trim().split("\n")[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

// On the study desk: select text in an analysis or follow-up answer,
// right-click, and add it to Anki in place, with the same item screen as on
// the Anki page — or save it for Anki later (on touch screens, a bar offers
// that when text is selected). Only for languages Polyglot Vocab has fields
// for, explained in English.
export function AnkiSelectionArea({ sourceLanguage, userLanguage, sourceText, context, options, children }: AnkiSelectionAreaProps) {
  const [item, setItem] = useState<BranchItem | null>(null);
  const [status, setStatus] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const language = sourceLanguage as AnkiLanguage;
  const later = useSaveForLater(language, context, seenInText(sourceText));
  const selectionMenu = useSelectionMenu((text) => void lookUp(text), (text) => void later.save(text));

  useEffect(() => {
    if (item || status) dialogRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [item, status]);

  async function lookUp(text: string) {
    setItem(null);
    setStatus(`Looking up “${text.slice(0, 40)}”...`);
    try {
      await anki.version();
      anki.getTags().then((tags) => setTagSuggestions(tags.filter((tag) => !tag.startsWith("pb::")).sort()), () => {});
      setItem(await describeSelection(text, context, language, options.providerId));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The selection could not be looked up.");
    }
  }

  if (!canSendFlashcardsToAnki(sourceLanguage, userLanguage)) return <>{children}</>;

  return (
    <div className="anki-selection-area" ref={selectionMenu.areaRef} onContextMenu={selectionMenu.onContextMenu}>
      {children}
      {selectionMenu.element}
      {later.element}
      <div className="anki-selection-dialog" ref={dialogRef}>
        {status && <p className="example-status" role="status">{status}{!item && <button className="text-button" type="button" onClick={() => setStatus("")}>Dismiss</button>}</p>}
        {item && (
          <BranchQueue
            key={item.text}
            language={language}
            parentText={seenInText(sourceText)}
            parentEnglish=""
            analysis={context}
            options={options}
            items={[item]}
            doneLabel="Close"
            depth={1}
            tagSuggestions={tagSuggestions}
            onFinish={() => setItem(null)}
          />
        )}
      </div>
    </div>
  );
}
