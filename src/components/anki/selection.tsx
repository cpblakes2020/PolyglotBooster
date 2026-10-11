"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

type Menu = { x: number; y: number; text: string };

// The text selected inside the element being right-clicked. A selection
// inside a text box isn't part of the page selection, so it's read from the
// box itself.
function selectedText(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if ((target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) && event.currentTarget.contains(target)) {
    const { selectionStart, selectionEnd, value } = target;
    return selectionStart !== null && selectionEnd !== null ? value.slice(selectionStart, selectionEnd).trim() : "";
  }
  const selection = window.getSelection();
  if (!selection?.anchorNode || !event.currentTarget.contains(selection.anchorNode)) return "";
  return selection.toString().trim();
}

// The text selected inside one of the given elements, wherever the
// selection came from (for touch screens, which have no right-click).
function selectionWithin(elements: Set<HTMLElement>) {
  const active = document.activeElement;
  if ((active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && [...elements].some((element) => element.contains(active))) {
    const { selectionStart, selectionEnd, value } = active;
    return selectionStart !== null && selectionEnd !== null ? value.slice(selectionStart, selectionEnd).trim() : "";
  }
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  if (!anchor || ![...elements].some((element) => element.contains(anchor))) return "";
  return selection.toString().trim();
}

const shorten = (text: string) => text.length > 30 ? `${text.slice(0, 30)}…` : text;

// Right-click on selected text inside an element offers "Add … to Anki"
// and, given onSaveLater, "Save … for Anki later". On touch screens, which
// have no right-click, selecting text inside an element registered with
// areaRef shows a bar at the bottom of the screen with "Save for Anki
// later". Returns the onContextMenu handler, the ref, and what to render.
export function useSelectionMenu(onPick: (text: string) => void, onSaveLater?: (text: string) => void) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [touchText, setTouchText] = useState("");
  const areas = useRef(new Set<HTMLElement>());

  const areaRef = useCallback((element: HTMLElement | null) => {
    for (const area of areas.current) if (!area.isConnected) areas.current.delete(area);
    if (element) areas.current.add(element);
  }, []);

  const offersLater = Boolean(onSaveLater);
  useEffect(() => {
    if (!offersLater || !window.matchMedia("(pointer: coarse)").matches) return;
    let timer: number | undefined;
    const onChange = () => {
      window.clearTimeout(timer);
      // Wait until the selection handles stop moving.
      timer = window.setTimeout(() => setTouchText(selectionWithin(areas.current).slice(0, 300)), 400);
    };
    // Capture, so selections inside text boxes (reported to the box, not
    // the page) are caught too.
    document.addEventListener("selectionchange", onChange, true);
    return () => { document.removeEventListener("selectionchange", onChange, true); window.clearTimeout(timer); };
  }, [offersLater]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  function onContextMenu(event: MouseEvent<HTMLElement>) {
    const text = selectedText(event);
    // Without a selection inside this element, keep the browser's own menu.
    if (!text) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, text: text.slice(0, 300) });
  }

  const element = (
    <>
      {menu && (
        <div className="anki-context-menu" style={{ left: menu.x, top: menu.y }} role="menu" onMouseDown={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); onPick(menu.text); }}>
            Add “{shorten(menu.text)}” to Anki…
          </button>
          {onSaveLater && (
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onSaveLater(menu.text); }}>
              Save “{shorten(menu.text)}” for Anki later
            </button>
          )}
        </div>
      )}
      {touchText && onSaveLater && (
        <div className="anki-touch-bar" role="toolbar">
          <button className="save-input-button" type="button" onClick={() => { const text = touchText; setTouchText(""); onSaveLater(text); }}>
            Save “{shorten(touchText)}” for Anki later
          </button>
          <button className="text-button" type="button" aria-label="Close" onClick={() => setTouchText("")}>✕</button>
        </div>
      )}
    </>
  );

  return { onContextMenu, areaRef, element };
}

// Anki tags can't contain spaces, so spaces and commas both separate tags.
export function parseTags(value: string) {
  return [...new Set(value.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean))];
}

type TagInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  current?: string[];
  suggestions: string[];
};

// Shows a note's current tags and takes new ones, suggesting existing Anki tags.
export function TagInput({ id, value, onChange, current = [], suggestions }: TagInputProps) {
  const shown = current.filter((tag) => !tag.startsWith("pb::"));
  // Suggest completions for the tag being typed (the last word).
  const typed = value.split(/[\s,]+/).pop() || "";
  const prefix = value.slice(0, value.length - typed.length);
  return (
    <div className="anki-tags">
      <label htmlFor={id}>Add tags</label>
      {shown.length > 0 && <p className="anki-tag-list">{shown.map((tag) => <span key={tag}>{tag}</span>)}</p>}
      <input id={id} list={`${id}-suggestions`} value={value} placeholder="e.g. travel food" autoComplete="off" onChange={(event) => onChange(event.target.value)} />
      <datalist id={`${id}-suggestions`}>
        {typed && suggestions.filter((tag) => tag.toLowerCase().startsWith(typed.toLowerCase()) && tag !== typed).slice(0, 20).map((tag) => <option key={tag} value={`${prefix}${tag}`} />)}
      </datalist>
    </div>
  );
}
