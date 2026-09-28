// Builds Docs/PolyglotBooster-User-Manual.pdf from the Markdown manual next
// to it, so the two always match. Run with `npm run manual` after editing
// the .md. Needs Chrome or Edge installed (used headless to print the PDF).

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Marked } from "marked";

const source = resolve("Docs/PolyglotBooster-User-Manual.md");
const output = resolve("Docs/PolyglotBooster-User-Manual.pdf");

// GitHub-style heading ids, so the table of contents links work in both
// the rendered Markdown and the PDF.
const slug = (text) => text.toLowerCase().replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N}\- ]/gu, "").replace(/ /g, "-");
const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth, text }) {
      return `<h${depth} id="${slug(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});

const css = `
@page { size: A4; margin: 18mm 16mm 20mm; }
body { font-family: "Segoe UI", "Leelawadee UI", "Yu Gothic UI", "Noto Sans Thai", "Noto Sans JP", sans-serif; color: #1c2a28; font-size: 10.5pt; line-height: 1.55; }
h1 { font-family: Georgia, serif; font-weight: 400; font-size: 26pt; color: #0e7772; margin: 0 0 4pt; }
h1 + p em { color: #6e7972; }
h2 { font-family: Georgia, serif; font-weight: 400; font-size: 17pt; color: #0e7772; border-bottom: 1px solid #d8d8c9; padding-bottom: 3pt; margin-top: 22pt; page-break-after: avoid; }
h2:not(:first-of-type) { page-break-before: always; }
h3 { font-size: 12pt; color: #1c2a28; margin-top: 16pt; page-break-after: avoid; }
a { color: #0e7772; text-decoration: none; }
code { font-family: Consolas, monospace; font-size: 9pt; background: #f3f1e7; padding: 1px 4px; border-radius: 3px; }
pre { background: #f3f1e7; border: 1px solid #d8d8c9; padding: 8pt 10pt; border-radius: 4px; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; page-break-inside: avoid; }
th, td { border: 1px solid #d8d8c9; padding: 4pt 7pt; text-align: left; vertical-align: top; }
th { background: #f3f1e7; }
blockquote { margin: 10pt 0; padding: 6pt 12pt; border-left: 3px solid #e76f51; background: #fbefe9; }
blockquote p { margin: 0; }
hr { display: none; }
li { margin: 2pt 0; }
`;

const markdown = readFileSync(source, "utf8");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PolyglotBooster User Manual</title><style>${css}</style></head><body>${marked.parse(markdown)}</body></html>`;

const browsers = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);
const browser = browsers.find((path) => existsSync(path));
if (!browser) throw new Error("Chrome or Edge not found; set CHROME_PATH.");

const dir = mkdtempSync(join(tmpdir(), "pb-manual-"));
try {
  const htmlPath = join(dir, "manual.html");
  writeFileSync(htmlPath, html);
  execFileSync(browser, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--user-data-dir=${join(dir, "profile")}`, `--print-to-pdf=${output}`, pathToFileURL(htmlPath).href], { stdio: "ignore" });
  console.log(`Wrote ${output}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
