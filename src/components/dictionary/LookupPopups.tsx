"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { lookUpDictItems } from "@/lib/dictionary/client";
import { isJapaneseTerm } from "@/lib/dictionary/japanese";
import { dictItemsHtml, type DictNoteItem } from "@/lib/dictionary/notesBlock";

// Japanese text worth a dictionary lookup (kana or kanji).
export const hasJapanese = (text: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);

type Popup = { id: number; text: string; x: number; y: number };
type Menu = { x: number; y: number; text: string };

const popupWidth = 420;
const shorten = (text: string) => text.length > 30 ? `${text.slice(0, 30)}…` : text;

// The same dictionary entries as "Add dictionary entries" on the Anki page:
// a word's entries and kanji, or only the hard parts of a sentence. Given
// onAdd, a button adds them to the card being edited.
function LookupContent({ text, onAdd }: { text: string; onAdd?: (items: DictNoteItem[]) => void }) {
  const [items, setItems] = useState<DictNoteItem[] | null | undefined>(undefined);
  const [added, setAdded] = useState(false);
  const term = isJapaneseTerm(text);

  useEffect(() => {
    let cancelled = false;
    lookUpDictItems(text, term ? "word" : "sentence").catch(() => null).then((result) => { if (!cancelled) setItems(result); });
    return () => { cancelled = true; };
  }, [text, term]);

  if (items === undefined) return <p className="anki-note">Looking up…</p>;
  if (items === null) return <p className="anki-note">The dictionary isn&apos;t available right now.</p>;
  if (!items.length) return <p className="anki-note">{term ? "Not found in the dictionary." : "Nothing hard here: no kanji beyond elementary school and no uncommon words. Select a single word to look it up."}</p>;
  return (
    <>
      {onAdd && (
        <div className="dict-popup-actions">
          <button className="preview-prompt-button" type="button" disabled={added} onClick={() => { onAdd(items); setAdded(true); }}>{added ? "Added to the card" : "Add to this card"}</button>
          <span className="anki-note">{added ? "Edit or trim it in the card's dictionary entries." : "You can edit or trim it there."}</span>
        </div>
      )}
      <div className="dict-popup-entries" dangerouslySetInnerHTML={{ __html: dictItemsHtml(items) }} />
    </>
  );
}

function selectionIn(element: HTMLElement) {
  const selection = window.getSelection();
  return selection?.anchorNode && element.contains(selection.anchorNode) ? selection.toString().trim() : "";
}

// Dictionary lookup popups: open(text, x, y) shows the entries for text in
// a box near the click. Select text inside a box and right-click → Look up
// to open another box on top of it, as deep as you like (or Copy). × or Esc
// closes the top box; clicking elsewhere on the page closes them all. Given
// onAdd (a card being edited), each box can add its entries to that card.
export function useJapaneseLookup(onAdd?: (items: DictNoteItem[]) => void) {
  const [popups, setPopups] = useState<Popup[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);

  const open = useCallback((text: string, x: number, y: number) => {
    setMenu(null);
    setPopups((current) => [...current, { id: Date.now() + Math.random(), text: text.slice(0, 300), x, y }]);
  }, []);

  useEffect(() => {
    if (!popups.length && !menu) return;
    const closeAll = () => { setMenu(null); setPopups([]); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menu) setMenu(null);
      else setPopups((current) => current.slice(0, -1));
    };
    window.addEventListener("mousedown", closeAll);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", closeAll); window.removeEventListener("keydown", onKey); };
  }, [popups.length, menu]);

  function onPopupContextMenu(event: MouseEvent<HTMLElement>) {
    // Inside a box, its own menu (not the page's) answers the right-click.
    event.stopPropagation();
    const text = selectionIn(event.currentTarget);
    if (!text) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, text });
  }

  async function copy(text: string) {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ctrl+C still copies the selection.
    }
  }

  const element = (popups.length > 0 || menu) && (
    // Clicks inside a box or its menu don't close anything.
    <div onMouseDown={(event) => event.stopPropagation()}>
      {popups.map((popup, index) => {
        const left = Math.max(8, Math.min(popup.x, window.innerWidth - popupWidth - 8));
        // Below the click in the top half of the window, above it in the
        // bottom half, so the box has room.
        const vertical = popup.y < window.innerHeight / 2 ? { top: popup.y + 14 } : { bottom: window.innerHeight - popup.y + 14 };
        return (
          <div className="dict-popup" key={popup.id} role="dialog" aria-label={`Dictionary: ${popup.text}`} style={{ left, ...vertical, zIndex: 60 + index }} onContextMenu={onPopupContextMenu}>
            <div className="dict-popup-head">
              <span className="dict-popup-title">{shorten(popup.text)}</span>
              <button className="dict-remove" type="button" aria-label="Close" onClick={() => setPopups((current) => current.filter((item) => item.id !== popup.id))}>×</button>
            </div>
            <LookupContent text={popup.text} onAdd={onAdd} />
            {index === popups.length - 1 && <p className="dict-popup-hint">Select text here and right-click to look it up too, or to copy it.</p>}
          </div>
        );
      })}
      {menu && (
        <div className="anki-context-menu" style={{ left: menu.x, top: menu.y, zIndex: 60 + popups.length }} role="menu">
          {hasJapanese(menu.text) && <button type="button" role="menuitem" onClick={() => open(menu.text, menu.x, menu.y)}>Look up “{shorten(menu.text)}”</button>}
          <button type="button" role="menuitem" onClick={() => void copy(menu.text)}>Copy</button>
        </div>
      )}
    </div>
  );

  return { open, element };
}
