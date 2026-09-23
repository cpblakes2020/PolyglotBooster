// Pure text helpers for reading and writing Anki field HTML. No runtime
// imports, so this module runs anywhere (browser, server, or a plain Node
// script against a collection backup).

const namedEntities: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", "#39": "'" };

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return namedEntities[lower] ?? match;
  });
}

// Field HTML -> plain text. Block-level breaks become newlines, everything
// else (Word-paste spans, mso-* styles, ruby readings) is dropped.
export function htmlToText(html: string) {
  const withoutRubyReadings = html.replace(/<rt>[\s\S]*?<\/rt>/gi, "").replace(/<rp>[\s\S]*?<\/rp>/gi, "");
  const withBreaks = withoutRubyReadings.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li|tr|h\d)>/gi, "\n");
  const stripped = decodeEntities(withBreaks.replace(/<[^>]*>/g, ""));
  return stripped
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const scriptPatterns: Record<string, RegExp> = {
  Thai: /[฀-๿]+/g,
  // Kana, kanji, iteration marks and Japanese punctuation.
  Japanese: /[　-〿぀-ゟ゠-ヿ一-鿿！-｠々〆]+/g,
};

// Thai doesn't put spaces between words, only between sentences, and TTS
// pauses at every space. Old lesson material often spaced out each word, so
// runs are joined directly — except after a sentence-final particle, where a
// space is the natural sentence break.
const thaiSentenceEnd = /(ครับ|ค่ะ|คะ|นะ|จ้ะ|จ๊ะ|จ้า|ค่า|ไหม|มั้ย)$/;

function joinThaiRuns(runs: string[]) {
  return runs.reduce((text, run) => !text ? run : `${text}${thaiSentenceEnd.test(text) ? " " : ""}${run}`, "");
}

export type CleanedField = {
  // The text to send to the LLM and TTS.
  text: string;
  // Latin-script text found alongside a non-Latin script, e.g. an old
  // romanization pasted into the Thai field.
  leftover: string;
};

// Isolates the language's own script from a field value. Latin-script
// languages just get HTML stripped.
export function cleanField(html: string, language: string): CleanedField {
  const plain = htmlToText(html);
  const pattern = scriptPatterns[language];
  if (!pattern) return { text: plain.replace(/\n/g, " "), leftover: "" };

  const runs = plain.match(pattern) || [];
  const text = language === "Thai" ? joinThaiRuns(runs) : runs.join(" ").replace(/\s+/g, " ").trim();
  const leftover = plain.replace(pattern, " ").replace(/\s+/g, " ").trim();
  return { text, leftover };
}

// True when the stored field holds more than the clean text: markup,
// embedded romanization, or stray whitespace.
export function fieldNeedsCleanup(html: string, cleaned: CleanedField) {
  return html.trim() !== cleaned.text;
}

export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMarkdown(text: string) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function tableRow(line: string, cell: "td" | "th") {
  const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((value) => `<${cell}>${inlineMarkdown(value.trim())}</${cell}>`);
  return `<tr>${cells.join("")}</tr>`;
}

// Converts the Markdown the analysis templates produce into the plain HTML
// Anki fields use: headings become bold labels, paragraphs become <div>s.
export function markdownToAnkiHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let table: string[] = [];

  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const flushTable = () => {
    if (!table.length) return;
    const [header, , ...body] = table;
    const hasDivider = table.length > 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(table[1]);
    const rows = hasDivider ? [tableRow(header, "th"), ...body.map((line) => tableRow(line, "td"))] : table.map((line) => tableRow(line, "td"));
    out.push(`<table>${rows.join("")}</table>`);
    table = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      table.push(line);
      continue;
    }
    flushTable();

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (heading) {
      closeList();
      out.push(`<div><b>${inlineMarkdown(heading[1].replace(/\*\*/g, ""))}</b></div>`);
    } else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inlineMarkdown((bullet || numbered)![1])}</li>`);
    } else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      closeList();
    } else if (line.trim()) {
      closeList();
      out.push(`<div>${inlineMarkdown(line.trim())}</div>`);
    } else {
      closeList();
    }
  }
  closeList();
  flushTable();
  return out.join("");
}

// Finds a <div class="{className}">…</div> block, honoring nested divs.
function findBlock(html: string, className: string): [number, number] | null {
  const open = new RegExp(`<div class="${className}">`, "i").exec(html);
  if (!open) return null;
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return [open.index, match.index + match[0].length];
  }
  return [open.index, html.length];
}

function removeBlock(html: string, className: string) {
  const range = findBlock(html, className);
  return range ? html.slice(0, range[0]) + html.slice(range[1]) : html;
}

// Builds a Notes_<Language> value. Whatever the field already holds (e.g. a
// hand-written furigana reading) is kept; PolyglotBooster's own blocks are
// replaced on re-analysis rather than stacked. Layout: reading, existing
// content, analysis.
export function composeNotesField(existing: string, reading: string, analysisHtml: string) {
  const kept = removeBlock(removeBlock(existing, "pb-reading"), "pb-analysis").trim();
  return [
    reading.trim() ? `<div class="pb-reading">${reading.trim()}</div>` : "",
    kept,
    analysisHtml.trim() ? `<div class="pb-analysis">${analysisHtml.trim()}</div>` : "",
  ].filter(Boolean).join("");
}

// The reading PolyglotBooster previously wrote, if any, as plain text.
export function existingReading(notesHtml: string) {
  const range = findBlock(notesHtml, "pb-reading");
  return range ? htmlToText(notesHtml.slice(range[0], range[1])) : "";
}

// Japanese readings are shown as ruby over the word, matching the notes
// that were written by hand.
export function japaneseRubyReading(word: string, kana: string) {
  return `<ruby>${escapeHtml(word)}<rt>${escapeHtml(kana)}</rt></ruby>`;
}

export function hasRubyReading(html: string) {
  return /<rt>/i.test(html);
}
