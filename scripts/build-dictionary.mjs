// Builds PolyglotBooster's Japanese dictionary from the latest
// jmdict-simplified release (JMdict + KANJIDIC2, English, from the
// Electronic Dictionary Research and Development Group, CC BY-SA 4.0) as
// small static lookup files the site serves itself:
//
//   public/dict/jmdict/idx/<bucket>.json   word → entry ids, by the word's
//                                          first character (see bucketOf)
//   public/dict/jmdict/ent/<n>.json        entries, by id % entryShards
//   public/dict/jmdict/kanji/<n>.json      kanji, by code point % kanjiShards
//   public/dict/jmdict/tags.json           abbreviation → description
//   public/dict/jmdict/meta.json           version and layout
//
// They're served as ordinary website files, so lookups use none of the
// Vercel Blob storage allowance. The folder isn't committed (.gitignore) or
// uploaded (.vercelignore): Vercel's build runs this first ("prebuild"), so
// each deploy gets the current weekly release. Locally, `npm run dictionary`
// (re)builds it; `--if-missing` skips the work when it's already there.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(projectRoot, "public", "dict", "jmdict");

// The index file for words starting with this character: each kana gets its
// own (many words start with each one); other characters share one per 32
// consecutive code points. Must match bucketOf in src/lib/dictionary/japanese.ts.
const bucketOf = (codePoint) => codePoint >= 0x3040 && codePoint <= 0x30ff ? codePoint : codePoint >> 5;
const entryShards = 512;
const kanjiShards = 64;

// Reads the one JSON file inside a .tgz.
function jsonFromTgz(buffer) {
  const tar = gunzipSync(buffer);
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(tar.subarray(offset + 124, offset + 136).toString("utf8").replace(/\0.*$/s, "").trim() || "0", 8);
    if (!name) break;
    if (name.endsWith(".json")) return JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString("utf8"));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("No JSON file in the archive.");
}

async function latestRelease() {
  const response = await fetch("https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest", { headers: { "user-agent": "PolyglotBooster" } });
  if (!response.ok) throw new Error(`GitHub: ${response.status}`);
  return response.json();
}

async function download(release, pattern) {
  const asset = release.assets.find((item) => pattern.test(item.name));
  if (!asset) throw new Error(`No release file matching ${pattern}`);
  console.log(`  downloading ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)`);
  const response = await fetch(asset.browser_download_url, { headers: { "user-agent": "PolyglotBooster" } });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return jsonFromTgz(Buffer.from(await response.arrayBuffer()));
}

const notStar = (list) => list && !(list.length === 1 && list[0] === "*") ? list : undefined;

// A compact entry: k kanji forms, r readings (c = common, a = only with
// these kanji, x = tags), s senses (p part of speech, g glosses, m misc,
// f field, i info, d dialect, ak/ar = only for these forms).
function compactEntry(word) {
  return {
    id: Number(word.id),
    k: word.kanji.map((k) => ({ t: k.text, ...(k.common ? { c: 1 } : {}), ...(k.tags.length ? { x: k.tags } : {}) })),
    r: word.kana.map((r) => ({ t: r.text, ...(r.common ? { c: 1 } : {}), ...(notStar(r.appliesToKanji) ? { a: r.appliesToKanji } : {}), ...(r.tags.length ? { x: r.tags } : {}) })),
    s: word.sense.map((s) => ({
      p: s.partOfSpeech,
      g: s.gloss.map((g) => g.text),
      ...(s.misc.length ? { m: s.misc } : {}),
      ...(s.field.length ? { f: s.field } : {}),
      ...(s.info.length ? { i: s.info } : {}),
      ...(s.dialect.length ? { d: s.dialect } : {}),
      ...(notStar(s.appliesToKanji) ? { ak: s.appliesToKanji } : {}),
      ...(notStar(s.appliesToKana) ? { ar: s.appliesToKana } : {}),
    })),
  };
}

// A compact kanji: m meanings, on/kun readings, g grade, s strokes,
// j old JLPT level, f newspaper frequency rank.
function compactKanji(character) {
  const groups = character.readingMeaning?.groups || [];
  const readings = groups.flatMap((group) => group.readings || []);
  return {
    m: groups.flatMap((group) => (group.meanings || []).filter((m) => m.lang === "en").map((m) => m.value)),
    on: readings.filter((r) => r.type === "ja_on").map((r) => r.value),
    kun: readings.filter((r) => r.type === "ja_kun").map((r) => r.value),
    ...(character.misc.grade ? { g: character.misc.grade } : {}),
    ...(character.misc.strokeCounts?.[0] ? { s: character.misc.strokeCounts[0] } : {}),
    ...(character.misc.jlptLevel ? { j: character.misc.jlptLevel } : {}),
    ...(character.misc.frequency ? { f: character.misc.frequency } : {}),
  };
}

async function main() {
  if (process.argv.includes("--if-missing") && existsSync(path.join(outDir, "meta.json"))) {
    console.log("Japanese dictionary already built (public/dict/jmdict); skipping.");
    return;
  }
  console.log("Building the Japanese dictionary from the latest jmdict-simplified release...");
  const release = await latestRelease();
  const jmdict = await download(release, /^jmdict-eng-\d.*\.json\.tgz$/);
  const kanjidic = await download(release, /^kanjidic2-en-.*\.json\.tgz$/);

  const index = new Map();
  const shards = Array.from({ length: entryShards }, () => ({}));
  for (const word of jmdict.words) {
    const entry = compactEntry(word);
    shards[entry.id % entryShards][entry.id] = entry;
    for (const form of new Set([...word.kanji.map((k) => k.text), ...word.kana.map((r) => r.text)])) {
      const bucket = bucketOf(form.codePointAt(0));
      if (!index.has(bucket)) index.set(bucket, {});
      (index.get(bucket)[form] ??= []).push(entry.id);
    }
  }
  const kanjiFiles = Array.from({ length: kanjiShards }, () => ({}));
  for (const character of kanjidic.characters) kanjiFiles[character.literal.codePointAt(0) % kanjiShards][character.literal] = compactKanji(character);

  rmSync(outDir, { recursive: true, force: true });
  for (const sub of ["idx", "ent", "kanji"]) mkdirSync(path.join(outDir, sub), { recursive: true });
  for (const [bucket, words] of index) writeFileSync(path.join(outDir, "idx", `${bucket}.json`), JSON.stringify(words));
  shards.forEach((entries, n) => writeFileSync(path.join(outDir, "ent", `${n}.json`), JSON.stringify(entries)));
  kanjiFiles.forEach((kanji, n) => writeFileSync(path.join(outDir, "kanji", `${n}.json`), JSON.stringify(kanji)));
  writeFileSync(path.join(outDir, "tags.json"), JSON.stringify(jmdict.tags));
  writeFileSync(path.join(outDir, "meta.json"), JSON.stringify({
    version: jmdict.version, dictDate: jmdict.dictDate, kanjidicDate: kanjidic.dictDate,
    entryShards, kanjiShards, entries: jmdict.words.length, kanji: kanjidic.characters.length,
  }));
  console.log(`Japanese dictionary built: JMdict ${jmdict.dictDate} (${jmdict.words.length} entries), KANJIDIC2 (${kanjidic.characters.length} kanji), ${index.size + entryShards + kanjiShards + 2} files.`);
}

main().catch((error) => {
  // A deploy shouldn't fail because GitHub was briefly unreachable: the site
  // works without the dictionary, which then shows as unavailable.
  console.warn(`WARNING: the Japanese dictionary couldn't be built (${error instanceof Error ? error.message : error}). Dictionary lookups will be unavailable until the next build.`);
});
