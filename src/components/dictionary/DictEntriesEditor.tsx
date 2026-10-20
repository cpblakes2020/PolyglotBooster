"use client";

import type { DictNoteItem } from "@/lib/dictionary/notesBlock";

// Dictionary entries waiting to be saved to a note: every word, reading,
// sense, kanji line and example compound can be edited in place, and has
// its own × to leave it out.
export function DictEntriesEditor({ items, onChange, disabled }: { items: DictNoteItem[]; onChange: (items: DictNoteItem[]) => void; disabled?: boolean }) {
  const set = (position: number, item: DictNoteItem | null) => onChange(items.flatMap((current, i) => i === position ? (item ? [item] : []) : [current]));
  const remove = (label: string, onClick: () => void) => (
    <button className="dict-remove" type="button" disabled={disabled} aria-label={`Leave out ${label}`} title="Leave this out" onClick={onClick}>×</button>
  );
  const replaceAt = (list: string[], index: number, value: string) => list.map((current, i) => i === index ? value : current);
  return (
    <div className="dict-edit">
      {items.map((item, position) => item.kind === "word" ? (
        <div className="dict-edit-item" key={`w-${position}`}>
          <p className="dict-head">
            <input className="dict-edit-form" aria-label="Word" value={item.form} disabled={disabled} size={Math.max(2, item.form.length + 1)} onChange={(event) => set(position, { ...item, form: event.target.value })} />
            <span className="dict-reading">【<input className="dict-edit-reading" aria-label="Reading" value={item.reading} disabled={disabled} size={Math.max(2, item.reading.length + 1)} onChange={(event) => set(position, { ...item, reading: event.target.value })} />】</span>
            {remove(item.form, () => set(position, null))}
          </p>
          <ol className="dict-senses">
            {item.senses.map((sense, index) => (
              <li key={index}>
                <span className="dict-edit-line">
                  <input aria-label={`Sense ${index + 1}`} value={sense} disabled={disabled} onChange={(event) => set(position, { ...item, senses: replaceAt(item.senses, index, event.target.value) })} />
                  {remove(`sense ${index + 1}`, () => set(position, item.senses.length > 1 ? { ...item, senses: item.senses.filter((_, i) => i !== index) } : null))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="dict-edit-item" key={`k-${position}`}>
          <p className="dict-head dict-edit-line">
            <span className="dict-kanji-char">{item.literal}</span>
            <input aria-label={`Meanings and readings of ${item.literal}`} value={item.summary} disabled={disabled} onChange={(event) => set(position, { ...item, summary: event.target.value })} />
            {remove(`the kanji ${item.literal}`, () => set(position, null))}
          </p>
          {item.compounds.length > 0 && (
            <ul className="dict-compounds">
              {item.compounds.map((compound, index) => (
                <li key={index}>
                  <span className="dict-edit-line">
                    <input aria-label={`Compound ${index + 1} for ${item.literal}`} value={compound} disabled={disabled} onChange={(event) => set(position, { ...item, compounds: replaceAt(item.compounds, index, event.target.value) })} />
                    {remove(compound, () => set(position, { ...item, compounds: item.compounds.filter((_, i) => i !== index) }))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
