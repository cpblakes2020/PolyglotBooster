"use client";

import type { DictNoteItem } from "@/lib/dictionary/notesBlock";

// Dictionary entries waiting to be saved to a note: every word, sense,
// kanji and example compound has its own × to leave it out.
export function DictEntriesEditor({ items, onChange, disabled }: { items: DictNoteItem[]; onChange: (items: DictNoteItem[]) => void; disabled?: boolean }) {
  const set = (position: number, item: DictNoteItem | null) => onChange(items.flatMap((current, i) => i === position ? (item ? [item] : []) : [current]));
  const remove = (label: string, onClick: () => void) => (
    <button className="dict-remove" type="button" disabled={disabled} aria-label={`Leave out ${label}`} title="Leave this out" onClick={onClick}>×</button>
  );
  return (
    <div className="dict-edit">
      {items.map((item, position) => item.kind === "word" ? (
        <div className="dict-edit-item" key={`w-${item.form}-${position}`}>
          <p className="dict-head">
            <span className="dict-word-small">{item.form}</span>
            {item.reading && item.reading !== item.form && <span className="dict-reading">【{item.reading}】</span>}
            {remove(item.form, () => set(position, null))}
          </p>
          <ol className="dict-senses">
            {item.senses.map((sense, index) => (
              <li key={index}>{sense} {remove(`sense ${index + 1}`, () => set(position, item.senses.length > 1 ? { ...item, senses: item.senses.filter((_, i) => i !== index) } : null))}</li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="dict-edit-item" key={`k-${item.literal}-${position}`}>
          <p className="dict-head">
            <span className="dict-kanji-char">{item.literal}</span>
            <span>{item.summary}</span>
            {remove(`the kanji ${item.literal}`, () => set(position, null))}
          </p>
          {item.compounds.length > 0 && (
            <ul className="dict-compounds">
              {item.compounds.map((compound, index) => (
                <li key={compound}>{compound} {remove(compound, () => set(position, { ...item, compounds: item.compounds.filter((_, i) => i !== index) }))}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
