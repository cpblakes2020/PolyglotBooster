// The Polyglot Vocab note type: its fields, card styling and card
// templates, used to set up a fresh Anki profile and to add languages to an
// existing one. The templates are generated from one pattern, matching the
// original hand-built note type: one card per language direction, audio
// inline, Notes under a "more" disclosure, and the Origin on the back.

// Languages in the order their fields appear. (A collection may also have
// Balinese fields from before; PolyglotBooster leaves those alone.)
export const noteLanguages = ["English", "Indonesian", "Thai", "Japanese", "Spanish", "French", "Mandarin"] as const;
export type NoteLanguage = typeof noteLanguages[number];

// Notes_English sits right under English so a question written in it (e.g.
// when flagging a card) is in view in Anki's editor without scrolling.
export const vocabNoteFields = [
  "English",
  "Notes_English",
  ...noteLanguages.filter((language) => language !== "English"),
  ...noteLanguages.map((language) => `Audio_${language}`),
  ...noteLanguages.filter((language) => language !== "English").map((language) => `Notes_${language}`),
  "Origin",
];

// Card directions. Each pair gets a card both ways; a card only exists for a
// note when both of its fields are filled.
const pairs: [NoteLanguage, NoteLanguage][] = [
  ["English", "Indonesian"], ["English", "Thai"], ["English", "Japanese"],
  ["Indonesian", "Thai"], ["Indonesian", "Japanese"], ["Thai", "Japanese"],
  ["English", "Spanish"], ["English", "French"], ["English", "Mandarin"],
  ["Spanish", "French"], ["Mandarin", "Japanese"], ["Mandarin", "Thai"],
];

// Languages whose reading (romanization, furigana, pinyin) is worth seeing
// on the front of a card into English.
const readingOnFront = new Set<NoteLanguage>(["Thai", "Japanese", "Mandarin"]);

function front(from: NoteLanguage, to: NoteLanguage) {
  const notes = to === "English" && readingOnFront.has(from)
    ? `{{#Notes_${from}}}
<details class="more">
<summary>more</summary>
{{Notes_${from}}}
</details>
{{/Notes_${from}}}
`
    : "";
  return `{{#${from}}}{{#${to}}}
<div class="tag">${from.toUpperCase()}</div>
<div class="prompt">{{${from}}}</div>
{{#Audio_${from}}}{{Audio_${from}}}{{/Audio_${from}}}
${notes}{{/${to}}}{{/${from}}}`;
}

function back(to: NoteLanguage) {
  return `{{FrontSide}}
<hr id="answer">
<div class="tag">${to.toUpperCase()}</div>
<div class="answer">{{${to}}}</div>
{{#Audio_${to}}}{{Audio_${to}}}{{/Audio_${to}}}
{{#Origin}}
<details class="more">
<summary>more</summary>
<div class="origin">origin: {{Origin}}</div>
{{#Notes_${to}}}{{Notes_${to}}}{{/Notes_${to}}}
</details>
{{/Origin}}
{{^Origin}}
{{#Notes_${to}}}
<details class="more">
<summary>more</summary>
{{Notes_${to}}}
</details>
{{/Notes_${to}}}
{{/Origin}}`;
}

export type CardTemplate = { Name: string; Front: string; Back: string };

export function cardTemplate(from: NoteLanguage, to: NoteLanguage): CardTemplate {
  return { Name: `${from} → ${to}`, Front: front(from, to), Back: back(to) };
}

// Into-English directions first, then the rest, as in the original.
export const vocabCardTemplates: CardTemplate[] = [
  ...pairs.filter(([a]) => a === "English").map(([, b]) => cardTemplate("English", b)),
  ...pairs.filter(([a]) => a === "English").map(([, b]) => cardTemplate(b, "English")),
  ...pairs.filter(([a]) => a !== "English").flatMap(([a, b]) => [cardTemplate(a, b), cardTemplate(b, a)]),
];

export const vocabNoteCss = ".card {\n  font-family: -apple-system, \"Segoe UI\", \"Noto Sans Thai\", \"Noto Sans JP\", \"Noto Sans\", sans-serif;\n  font-size: 28px;\n  text-align: center;\n  color: #1a1a1a;\n  background-color: #fafafa;\n  padding: 24px 20px;\n}\n\n.tag {\n  font-size: 13px;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: #8a8a8a;\n  margin-bottom: 8px;\n}\n\n.prompt {\n  font-size: 34px;\n  line-height: 1.3;\n}\n\nhr#answer {\n  margin: 22px auto;\n  width: 60%;\n  border: none;\n  border-top: 1px solid #ddd;\n}\n\n.answer {\n  font-size: 34px;\n  line-height: 1.3;\n  color: #0e6b56;\n  margin-bottom: 10px;\n}\n\ndetails.more {\n  margin: 18px auto 0;\n  text-align: left;\n  display: inline-block;\n  max-width: 480px;\n  font-size: 16px;\n  line-height: 1.5;\n  color: #3a3a3a;\n}\n\ndetails.more summary {\n  cursor: pointer;\n  text-align: center;\n  color: #8a8a8a;\n  font-size: 13px;\n  letter-spacing: 0.04em;\n}\n\ndetails.more[open] summary {\n  margin-bottom: 10px;\n}\n\n.origin {\n  margin-top: 16px;\n  display: inline-block;\n  font-size: 11px;\n  letter-spacing: 0.03em;\n  padding: 3px 10px;\n  border-radius: 20px;\n  background: #eeeeee;\n  color: #999999;\n}\n\ndetails.more .origin {\n  margin-top: 0;\n  margin-bottom: 10px;\n}";
