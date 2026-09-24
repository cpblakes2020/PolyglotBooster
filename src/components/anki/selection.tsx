"use client";

import { useEffect, useState, type MouseEvent } from "react";

type Menu = { x: number; y: number; text: string };

// Right-click on selected text inside an element offers "Add … to Anki".
// Returns the onContextMenu handler for that element and the menu to render.
export function useSelectionMenu(onPick: (text: string) => void) {
  const [menu, setMenu] = useState<Menu | null>(null);

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
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    // Without a selection inside this element, keep the browser's own menu.
    if (!text || !selection?.anchorNode || !event.currentTarget.contains(selection.anchorNode)) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, text: text.slice(0, 300) });
  }

  const element = menu && (
    <div className="anki-context-menu" style={{ left: menu.x, top: menu.y }} role="menu" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={() => { setMenu(null); onPick(menu.text); }}>
        Add “{menu.text.length > 30 ? `${menu.text.slice(0, 30)}…` : menu.text}” to Anki…
      </button>
    </div>
  );

  return { onContextMenu, element };
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
