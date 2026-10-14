"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { cleanTag, matchingTags, suggestedTag } from "@/lib/anki/tags";

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
  // The chosen tags, space-separated.
  value: string;
  onChange: (value: string) => void;
  // The note's tags already in Anki (shown, not chosen again).
  current?: string[];
  // Every tag in the collection.
  suggestions: string[];
  label?: string;
};

// Tags grouped by their top level (source::…, diary::…), for browsing.
function groupedTags(tags: string[]) {
  const groups = new Map<string, string[]>();
  for (const tag of tags) {
    const top = tag.includes("::") ? tag.split("::")[0] : "Other";
    groups.set(top, [...(groups.get(top) || []), tag]);
  }
  return [...groups].sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
}

// The tag picker: shows the note's current tags, and takes new ones as
// chips — searching the collection's tags as you type (anywhere in the name),
// browsing them by group, and pointing out when a new tag looks like an
// existing one in another form (STT32 → source::STT::32).
export function TagInput({ id, value, onChange, current = [], suggestions, label = "Add tags" }: TagInputProps) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const chosen = parseTags(value);
  const shown = current.filter((tag) => !tag.startsWith("pb::"));
  const taken = (tag: string) => chosen.some((t) => t.toLowerCase() === tag.toLowerCase()) || shown.some((t) => t.toLowerCase() === tag.toLowerCase());
  const pool = suggestions.filter((tag) => !taken(tag));
  const typed = cleanTag(text);
  const hint = typed ? suggestedTag(typed, suggestions) : "";
  const matches = matchingTags(typed, pool, 10);
  const options = hint && !taken(hint) ? [hint, ...matches.filter((tag) => tag !== hint)] : matches;

  function add(...tags: string[]) {
    const next = [...chosen];
    for (const tag of tags.map(cleanTag)) {
      if (tag && !next.some((t) => t.toLowerCase() === tag.toLowerCase()) && !shown.some((t) => t.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    if (next.length !== chosen.length) onChange(next.join(" "));
    setText("");
    setActive(-1);
  }

  // A space or comma ends a tag (Anki tags have no spaces) — typed, pasted
  // or from an on-screen keyboard; what follows the last one stays typed.
  function changeText(raw: string) {
    const parts = raw.split(/[\s,]+/);
    const rest = parts.pop() ?? "";
    if (parts.some(Boolean)) {
      add(...parts.filter(Boolean));
      setText(rest);
    } else {
      setText(raw);
      setActive(-1);
    }
  }
  const remove = (tag: string) => onChange(chosen.filter((t) => t !== tag).join(" "));
  const replace = (tag: string, next: string) => onChange(chosen.map((t) => (t === tag ? next : t)).join(" "));

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options.length) { event.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (event.key === "ArrowUp" && options.length) { event.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
    else if ((event.key === "Enter" || event.key === "Tab") && typed) { event.preventDefault(); add(active >= 0 ? options[active] : typed); }
    else if (event.key === "Backspace" && !text && chosen.length) remove(chosen[chosen.length - 1]);
    else if (event.key === "Escape") { setText(""); setActive(-1); }
  }

  return (
    <div className="anki-tags tag-picker">
      <label htmlFor={id}>{label}</label>
      {shown.length > 0 && <p className="anki-tag-list">{shown.map((tag) => <span key={tag}>{tag}</span>)}</p>}
      <div className="tag-picker-box">
        {chosen.map((tag) => {
          const isNew = !suggestions.some((t) => t.toLowerCase() === tag.toLowerCase());
          const better = isNew ? suggestedTag(tag, suggestions) : "";
          return (
            <span className={`tag-chip${isNew ? " tag-chip-new" : ""}`} key={tag}>
              {tag}{isNew && <small> new</small>}
              {better && <button type="button" className="tag-chip-fix" title={`Use ${better} instead`} onClick={() => replace(tag, better)}>→ {better}?</button>}
              <button type="button" aria-label={`Remove ${tag}`} onClick={() => remove(tag)}>×</button>
            </span>
          );
        })}
        <input id={id} value={text} placeholder={chosen.length ? "" : "type to search your tags…"} autoComplete="off" role="combobox" aria-expanded={focused && options.length > 0} aria-controls={`${id}-options`}
          onChange={(event) => changeText(event.target.value)}
          onKeyDown={onKeyDown} onFocus={() => setFocused(true)}
          // Keep what was typed when moving on (e.g. straight to Save).
          onBlur={() => { setFocused(false); if (typed) add(typed); }} />
      </div>
      {focused && typed && options.length > 0 && (
        <ul className="tag-options" id={`${id}-options`} role="listbox">
          {options.map((tag, index) => (
            <li key={tag} role="option" aria-selected={index === active} className={index === active ? "active" : undefined}
              onMouseDown={(event) => { event.preventDefault(); add(tag); }}>
              {tag === hint && <small>did you mean </small>}{tag}
            </li>
          ))}
          <li className="tag-options-new" onMouseDown={(event) => { event.preventDefault(); add(typed); }}>add &ldquo;{typed}&rdquo; as {suggestions.some((t) => t.toLowerCase() === typed.toLowerCase()) ? "is" : "a new tag"}</li>
        </ul>
      )}
      <button type="button" className="text-button tag-browse-toggle" onClick={() => setBrowsing((open) => !open)}>{browsing ? "Hide all tags" : "Browse all tags"}</button>
      {browsing && (
        <div className="tag-browse">
          {groupedTags(pool).map(([group, tags]) => (
            <details key={group}>
              <summary>{group} ({tags.length})</summary>
              <p>{tags.map((tag) => <button type="button" key={tag} onClick={() => add(tag)}>{group === "Other" ? tag : tag.slice(group.length + 2)}</button>)}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
