import { escapeHtml } from "@/lib/anki/fields";
import { difficultKanji, kanjiCompounds, kanjiDifficulty, readingsOf, type JapaneseLookup, type JmEntry, type KanjiItem } from "@/lib/dictionary/japanese";

// Dictionary entries for a Japanese note's Notes field, without analysis:
// JMdict words and KANJIDIC2 kanji (with example compounds), as a list you
// can trim one piece at a time before saving. Saved as a pb-dict block
// right under the reading.

export type DictNoteItem =
  | { kind: "word"; form: string; reading: string; senses: string[] }
  | { kind: "kanji"; literal: string; summary: string; compounds: string[] };

// Words from a sentence beyond these are left out (the hardest stay).
const maxSentenceWords = 8;

const isCommon = (entry: JmEntry) => entry.k.some((form) => form.c) || entry.r.some((form) => form.c);

function wordItem(entry: JmEntry, form: string, maxSenses: number): DictNoteItem {
  const written = entry.k.some((k) => k.t === form) || entry.r.some((r) => r.t === form) ? form : entry.k[0]?.t || entry.r[0]?.t || form;
  return {
    kind: "word",
    form: written,
    reading: readingsOf(entry, written)[0] || entry.r[0]?.t || "",
    senses: entry.s.slice(0, maxSenses).map((sense) => sense.g.slice(0, 4).join("; ") + (sense.i?.length ? ` (${sense.i.join("; ")})` : "")),
  };
}

function kanjiItem({ literal, info }: KanjiItem, exclude: string, maxCompounds: number): DictNoteItem {
  return {
    kind: "kanji",
    literal,
    summary: [info.m.slice(0, 4).join(", "), info.on.length ? `on ${info.on.join("、")}` : "", info.kun.length ? `kun ${info.kun.slice(0, 4).join("、")}` : ""].filter(Boolean).join(" · "),
    compounds: kanjiCompounds(info, exclude, maxCompounds).map(([form, reading, gloss]) => `${form}【${reading}】 ${gloss}`),
  };
}

// A word or short term: its entries (or the words it's made of) and every
// kanji in it.
export function wordDictItems(text: string, result: JapaneseLookup): DictNoteItem[] {
  const word = text.trim();
  const entries = result.exact.length
    ? result.exact.slice(0, 2).map((entry) => wordItem(entry, word, 5))
    : result.parts.flatMap((part) => part.entries.slice(0, 1).map((entry) => wordItem(entry, part.text, 3)));
  return [...entries, ...result.kanji.map((item) => kanjiItem(item, word, 5))];
}

// A sentence or passage: only the hard parts — its hardest kanji (see
// difficultKanji) and the words that use them or aren't everyday words.
export function sentenceDictItems(words: { base: string; entries: JmEntry[] }[], kanji: KanjiItem[]): DictNoteItem[] {
  const hard = difficultKanji(kanji);
  const hardSet = new Set(hard.map((item) => item.literal));
  const difficulty = (base: string) => Math.max(0, ...[...base].map((char) => kanjiDifficulty(kanji.find((item) => item.literal === char)?.info || { m: [], on: [], kun: [], g: 1 })));
  const chosen = words
    .filter(({ base, entries }) => entries[0] && (!isCommon(entries[0]) || [...base].some((char) => hardSet.has(char))))
    .map((word, order) => ({ word, order, difficulty: difficulty(word.base) }))
    .sort((a, b) => b.difficulty - a.difficulty || a.order - b.order)
    .slice(0, maxSentenceWords)
    .sort((a, b) => a.order - b.order)
    .map(({ word }) => wordItem(word.entries[0], word.base, 3));
  return [...chosen, ...hard.map((item) => kanjiItem(item, "", 4))];
}

export function dictItemsHtml(items: DictNoteItem[]) {
  const parts = items.flatMap((item) => {
    if (item.kind === "word") {
      if (!item.senses.length) return [];
      return [`<div class="pb-dict-word"><b>${escapeHtml(item.form)}</b>${item.reading && item.reading !== item.form ? `【${escapeHtml(item.reading)}】` : ""}<ol>${item.senses.map((sense) => `<li>${escapeHtml(sense)}</li>`).join("")}</ol></div>`];
    }
    return [`<div class="pb-dict-kanji"><b>${escapeHtml(item.literal)}</b> ${escapeHtml(item.summary)}${item.compounds.length ? `<ul>${item.compounds.map((compound) => `<li>${escapeHtml(compound)}</li>`).join("")}</ul>` : ""}</div>`];
  });
  return parts.length ? `<div class="pb-dict">${parts.join("")}</div>` : "";
}

const itemKey = (item: DictNoteItem) => item.kind === "word" ? `w:${item.form}` : `k:${item.literal}`;

// Entries added to a list (e.g. from a lookup popup): ones already there
// aren't repeated.
export function mergeDictItems(current: DictNoteItem[], added: DictNoteItem[]) {
  const seen = new Set(current.map(itemKey));
  return [...current, ...added.filter((item) => !seen.has(itemKey(item)) && seen.add(itemKey(item)))];
}

// Reads a saved pb-dict block (dictItemsHtml's output) back into items, so
// it can be edited again. Browser only (DOMParser). Anything else in the
// block — e.g. edited by hand in Anki — is kept as best it can be.
export function parseDictHtml(html: string): DictNoteItem[] {
  if (!html.trim() || typeof DOMParser === "undefined") return [];
  const root = new DOMParser().parseFromString(html, "text/html").querySelector(".pb-dict");
  if (!root) return [];
  const textOutside = (element: Element, skip: string) => [...element.childNodes]
    .filter((node) => !(node instanceof Element && (node.tagName === "B" || node.matches(skip))))
    .map((node) => node.textContent || "").join("").trim();
  const items = (selector: string, element: Element) => [...element.querySelectorAll(selector)].map((li) => (li.textContent || "").trim()).filter(Boolean);
  return [...root.children].flatMap((element): DictNoteItem[] => {
    if (element.classList.contains("pb-dict-word")) {
      const form = element.querySelector("b")?.textContent?.trim() || "";
      const reading = textOutside(element, "ol, ul").replace(/^【|】$/g, "");
      return form ? [{ kind: "word", form, reading, senses: items("li", element) }] : [];
    }
    if (element.classList.contains("pb-dict-kanji")) {
      const literal = element.querySelector("b")?.textContent?.trim() || "";
      return literal ? [{ kind: "kanji", literal, summary: textOutside(element, "ul, ol"), compounds: items("li", element) }] : [];
    }
    return [];
  });
}
