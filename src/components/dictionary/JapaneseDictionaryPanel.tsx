"use client";

import { useEffect, useState } from "react";
import { browserJapaneseDictionary as dictionary, fetchJapaneseTextWords, type SentenceWord } from "@/lib/dictionary/client";
import { difficultKanji, isJapaneseTerm, kanjiCompounds, maxDifficultKanji, readingsOf, type JapaneseLookup, type JmEntry, type KanjiItem } from "@/lib/dictionary/japanese";

function Entry({ entry, tags }: { entry: JmEntry; tags: Record<string, string> }) {
  const common = entry.k.some((form) => form.c) || entry.r.some((form) => form.c);
  const tag = (code: string) => <abbr key={code} title={tags[code] || code}>{code}</abbr>;
  return (
    <div className="dict-entry">
      <p className="dict-head">
        {entry.k.length > 0 && <span className="dict-word">{entry.k.map((form) => form.t).join("・")}</span>}
        <span className="dict-reading">【{entry.r.map((form) => form.t).join("・")}】</span>
        {common && <span className="dict-common">common</span>}
      </p>
      <ol className="dict-senses">
        {entry.s.map((sense, index) => (
          <li key={index}>
            <span className="dict-tags">{[...sense.p, ...(sense.m || []), ...(sense.f || []), ...(sense.d || [])].map(tag)}</span>
            {sense.g.join("; ")}
            {sense.i?.length ? <small> ({sense.i.join("; ")})</small> : null}
            {sense.ak || sense.ar ? <small> — only for {[...(sense.ak || []), ...(sense.ar || [])].join("・")}</small> : null}
            {sense.e?.map((example) => <span className="dict-example" key={example.j}>{example.j}<small>{example.n}</small></span>)}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Kanji from KANJIDIC2 with, as in Imiwa, other words (熟語) that use each.
function KanjiList({ kanji, word = "" }: { kanji: KanjiItem[]; word?: string }) {
  return (
    <div className="dict-kanji">
      {kanji.map(({ literal, info }) => {
        const compounds = kanjiCompounds(info, word);
        return (
          <div className="dict-kanji-item" key={literal}>
            <span className="dict-kanji-char">{literal}</span>
            <span>
              <b>{info.m.slice(0, 4).join(", ")}</b>
              {info.on.length > 0 && <> · on {info.on.join("、")}</>}
              {info.kun.length > 0 && <> · kun {info.kun.slice(0, 4).join("、")}</>}
              <small>{[info.g && (info.g <= 6 ? `grade ${info.g}` : info.g === 8 ? "secondary-school jōyō" : "name kanji"), !info.g && "not jōyō", info.j && `old JLPT level ${info.j}`, info.s && `${info.s} strokes`].filter(Boolean).join(" · ")}</small>
              {compounds.length > 0 && (
                <span className="dict-compound-list">
                  {compounds.map(([form, reading, gloss, common]) => (
                    <span className="dict-compound" key={form}><span className="dict-word-small">{form}</span>【{reading}】{common ? <span className="dict-common">common</span> : null} {gloss}</span>
                  ))}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// The JMdict entry for a Japanese word or short phrase (or, when it isn't an
// entry, the dictionary words it's made of) and its kanji from KANJIDIC2.
// Curated data, no AI.

// A sentence's words: dictionary form, reading, the first senses.
function SentenceWords({ words }: { words: SentenceWord[] }) {
  return (
    <ul className="dict-words">
      {words.map((word) => {
        const entry = word.entries[0];
        const common = entry.k.some((form) => form.c) || entry.r.some((form) => form.c);
        return (
          <li key={word.base}>
            <span className="dict-word-small">{word.base}</span>
            {word.surface !== word.base && <small> ({word.surface})</small>}
            <span className="dict-reading">【{readingsOf(entry, word.base)[0] || entry.r[0]?.t}】</span>
            {common && <span className="dict-common">common</span>}
            <span className="dict-gloss">{entry.s.slice(0, 2).map((sense) => sense.g.slice(0, 3).join("; ")).join(" / ")}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function JapaneseDictionaryPanel({ text, open = true }: { text: string; open?: boolean }) {
  const [result, setResult] = useState<JapaneseLookup | null | undefined>(undefined);
  const [words, setWords] = useState<SentenceWord[] | null | undefined>(undefined);
  // A sentence's hardest kanji (see difficultKanji).
  const [hardKanji, setHardKanji] = useState<KanjiItem[]>([]);
  const [tags, setTags] = useState<Record<string, string>>({});
  const [dictDate, setDictDate] = useState("");
  const query = text.trim();
  // A sentence is split into its words on the server; a word is looked up
  // here directly.
  const sentence = Boolean(query) && !isJapaneseTerm(query);

  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    setWords(undefined);
    setHardKanji([]);
    // Wait for typing to pause before looking up.
    const timer = window.setTimeout(() => {
      void Promise.all([dictionary.tags(), dictionary.meta()]).then(([tagList, meta]) => {
        if (cancelled) return;
        setTags(tagList || {});
        setDictDate(meta?.dictDate || "");
      });
      if (sentence) {
        void fetchJapaneseTextWords(query).then((found) => { if (!cancelled) setWords(found); });
        void dictionary.kanji(query).then((found) => { if (!cancelled) setHardKanji(difficultKanji(found)); }, () => {});
      } else {
        void dictionary.lookup(query).then((found) => { if (!cancelled) setResult(found); });
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, sentence]);

  if (!query) return null;
  if (sentence) {
    return (
      <details className="dict-panel" open={open}>
        <summary>Dictionary (JMdict) — words in this {query.length > 60 ? "text" : "sentence"}</summary>
        {words === undefined && <p className="anki-note">Looking up the words…</p>}
        {words === null && <p className="anki-note">The dictionary isn&apos;t available right now.</p>}
        {words && !words.length && <p className="anki-note">No dictionary words found.</p>}
        {words && words.length > 0 && <SentenceWords words={words} />}
        {hardKanji.length > 0 && (
          <>
            <p className="anki-note">Hardest kanji here (beyond the 1,026 taught in elementary school; at most {maxDifficultKanji}), with other words that use them:</p>
            <KanjiList kanji={hardKanji} />
          </>
        )}
        <p className="dict-credit">JMdict and KANJIDIC2 by the <a href="https://www.edrdg.org/" target="_blank" rel="noreferrer">Electronic Dictionary Research and Development Group</a>, <a href="https://www.edrdg.org/edrdg/license.html" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>{dictDate ? ` · edition of ${dictDate}` : ""}. Words found with kuromoji.</p>
      </details>
    );
  }
  return (
    <details className="dict-panel" open={open}>
      <summary>Dictionary (JMdict){result?.exact.length ? "" : result?.parts.length ? " — made of" : ""}</summary>
      {result === undefined && <p className="anki-note">Looking up…</p>}
      {result === null && <p className="anki-note">The dictionary isn&apos;t available right now.</p>}
      {result && !result.exact.length && !result.parts.length && <p className="anki-note">Not found in JMdict.</p>}
      {result?.exact.slice(0, 5).map((entry) => <Entry key={entry.id} entry={entry} tags={tags} />)}
      {result && !result.exact.length && result.parts.length > 0 && (
        <>
          <p className="anki-note">Not in JMdict as one word; these are the dictionary words it&apos;s made of:</p>
          {result.parts.map((part, index) => (
            <div className="dict-part" key={`${index}-${part.text}`}>
              {part.entries.slice(0, 1).map((entry) => <Entry key={entry.id} entry={entry} tags={tags} />)}
            </div>
          ))}
        </>
      )}
      {result && result.kanji.length > 0 && <KanjiList kanji={result.kanji} word={query} />}
      <p className="dict-credit">JMdict and KANJIDIC2 by the <a href="https://www.edrdg.org/" target="_blank" rel="noreferrer">Electronic Dictionary Research and Development Group</a>, <a href="https://www.edrdg.org/edrdg/license.html" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>{dictDate ? ` · edition of ${dictDate}` : ""}. Example sentences from <a href="https://tatoeba.org/" target="_blank" rel="noreferrer">Tatoeba</a>, CC BY 2.0 FR.</p>
    </details>
  );
}
