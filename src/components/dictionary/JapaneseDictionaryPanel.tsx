"use client";

import { useEffect, useState } from "react";
import { createJapaneseDictionary, type JapaneseLookup, type JmEntry } from "@/lib/dictionary/japanese";

// One dictionary for the whole page, loading files from the site itself
// (public/dict/jmdict) and keeping them for later lookups.
const dictionary = createJapaneseDictionary(async (path) => {
  const response = await fetch(`/dict/jmdict/${path}`);
  return response.ok ? response.json() : null;
});

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
          </li>
        ))}
      </ol>
    </div>
  );
}

// The JMdict entry for a Japanese word or short phrase (or, when it isn't an
// entry, the dictionary words it's made of) and its kanji from KANJIDIC2.
// Curated data, no AI.
export function JapaneseDictionaryPanel({ text, open = true }: { text: string; open?: boolean }) {
  const [result, setResult] = useState<JapaneseLookup | null | undefined>(undefined);
  const [tags, setTags] = useState<Record<string, string>>({});
  const [dictDate, setDictDate] = useState("");
  const query = text.trim();

  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    // Wait for typing to pause before looking up.
    const timer = window.setTimeout(() => {
      void Promise.all([dictionary.lookup(query), dictionary.tags(), dictionary.meta()]).then(([found, tagList, meta]) => {
        if (cancelled) return;
        setResult(found);
        setTags(tagList || {});
        setDictDate(meta?.dictDate || "");
      });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  if (!query) return null;
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
      {result && result.kanji.length > 0 && (
        <div className="dict-kanji">
          {result.kanji.map(({ literal, info }) => (
            <div className="dict-kanji-item" key={literal}>
              <span className="dict-kanji-char">{literal}</span>
              <span>
                <b>{info.m.slice(0, 4).join(", ")}</b>
                {info.on.length > 0 && <> · on {info.on.join("、")}</>}
                {info.kun.length > 0 && <> · kun {info.kun.slice(0, 4).join("、")}</>}
                <small>{[info.g && `grade ${info.g}`, info.j && `old JLPT level ${info.j}`, info.s && `${info.s} strokes`].filter(Boolean).join(" · ")}</small>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="dict-credit">JMdict and KANJIDIC2 by the <a href="https://www.edrdg.org/" target="_blank" rel="noreferrer">Electronic Dictionary Research and Development Group</a>, <a href="https://www.edrdg.org/edrdg/license.html" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>{dictDate ? ` · edition of ${dictDate}` : ""}.</p>
    </details>
  );
}
