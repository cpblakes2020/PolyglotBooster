# PolyglotBooster — current Anki structure (ground truth, captured 2026-09-22)

This documents the actual structure of your live Anki collection, read
directly from `collection.anki2` (via a clean `.colpkg` backup, to avoid
touching the live file), not reconstructed from memory or assumption. It's
the foundation for the accessory-app proposal in
`polyglotbooster-anki-sync-proposal.md` — read this one first, since the
proposal leans on several specifics found here.

You're mid-migration today: the backups folder shows a string of
`before-thai-migration`, `before-indonesian-migration`,
`before-japanese-migration`, `before-balinese-migration`,
`before-thai-dedup`, and `before-polyglot-reorg` snapshots, all from
2026-09-22, consolidating a decade of scattered decks (`Bahasa*`,
`BeginIndo*`, `A-Thai*`, etc. — 1000s of old notes going back to 2018) into
one unified note type. That unified note type, **Polyglot Vocab**, is the
one this document and the proposal are about. The legacy decks are treated
as out of scope below, since they appear to be the pre-migration source
data your own reorg is already absorbing.

## The note type: Polyglot Vocab

One note type covers every language pair. Fields, in order:

```
English, Indonesian, Thai, Japanese, Balinese,
Audio_English, Audio_Indonesian, Audio_Thai, Audio_Japanese, Audio_Balinese,
Notes_English, Notes_Indonesian, Notes_Thai, Notes_Japanese, Notes_Balinese,
Origin
```

- One field per language holds that language's text for the item.
- One `Audio_<Language>` field holds that language's pronunciation, as a
  literal `[sound:filename.mp3]` reference (not a URL — Anki's own sound
  tag syntax, pointing at a file inside `collection.media`).
- One `Notes_<Language>` field holds supplementary explanation for that
  language's side of the card — this is the field PolyglotBooster's
  analysis output belongs in.
- `Origin` records which language the entry was first captured for, before
  the other languages were filled in (values found: `Indonesian`, `Thai`,
  `Japanese`, `Indonesian Thai`).

16 card templates exist, one per directional language pair with both sides
non-empty (`English → Thai`, `Thai → English`, `Indonesian → Thai`,
`Thai → Indonesian`, `Thai → Japanese`, `Japanese → Thai`, etc. — Anki only
generates a given direction's card when both fields in that pair are
filled, which is why note count and card count diverge below).

**The templates already render `Notes_<Language>` and `Audio_<Language>` —
no template or schema change is needed to display what the accessory app
would add.** Confirmed from the live template source (`Thai → English`,
trimmed):

```
Front: {{#Thai}}{{#English}}
  THAI
  {{Thai}}
  {{#Audio_Thai}}{{Audio_Thai}}{{/Audio_Thai}}
  {{#Notes_Thai}}<details class="more"><summary>more</summary>{{Notes_Thai}}</details>{{/Notes_Thai}}
{{/English}}{{/Thai}}

Back: {{FrontSide}}<hr>
  ENGLISH
  {{English}}
  {{#Audio_English}}{{Audio_English}}{{/Audio_English}}
  {{#Origin}}
    <details class="more"><summary>more</summary>origin: {{Origin}}{{#Notes_English}}{{Notes_English}}{{/Notes_English}}</details>
  {{^Origin}}
    {{#Notes_English}}<details class="more"><summary>more</summary>{{Notes_English}}</details>{{/Notes_English}}
  {{/Origin}}
```

Every direction follows this pattern: audio autoplays inline (via Anki's
handling of `[sound:...]`), and any `Notes_<Language>` content collapses
under a "more" disclosure so it doesn't clutter the base card. Whatever the
accessory app writes into these fields will show up correctly the moment
it's written — you will not need to touch the note type or templates.

## Deck routing

Deck placement is a property of the note type's templates (each template
has a fixed deck override), not something a bulk-update tool needs to
manage. Current per-language and cross-language decks, with card counts
confirming this:

| Deck | Cards |
|---|---|
| PolyglotIndonesian | 2,324 |
| PolyglotThai | 604 |
| PolyglotJapanese | 16 |
| PolyglotCross-LanguageIndonesian-Thai | 12 |
| PolyglotCross-LanguageIndonesian-Balinese | 4 |
| Polyglot BoosterThaiEnglish | 2 (PolyglotBooster's own `.apkg` export — see below) |

Filling in `Notes_Thai` / `Audio_Thai` on an existing note doesn't move it
or create new cards — it enriches cards that already exist in their
already-correct deck.

## Current fill state (why this matters for scoping the accessory app)

Read directly from the 1,466 live Polyglot Vocab notes:

| Language | Field filled | `Notes_<Lang>` filled | `Audio_<Lang>` filled |
|---|---|---|---|
| English | 1,466 (100%) | 0 | 0 |
| Indonesian | 1,162 (79%) | 0 | 0 |
| Thai | 302 (21%) | 1 | 0 |
| Japanese | 8 (<1%) | 8 (100%) | 0 |
| Balinese | 0 | 0 | 0 |

Two things worth knowing before building anything:

- **The single `Notes_Thai` entry that exists is a manual test** ("Test
  note / Size check"), not real content — this field is genuinely
  greenfield for Thai. **All 8 Japanese notes already have
  `Notes_Japanese` filled** (apparently by hand), so a bulk tool must
  default to skip-if-already-filled rather than overwrite, or it'll
  clobber real content on its very first language.
- **Balinese has no PolyglotBooster equivalent.** PolyglotBooster's
  supported-language list (`src/lib/types.ts`) is Japanese, Thai,
  Indonesian, Spanish, English, French, Mandarin — no Balinese template,
  no Balinese TTS voice mapping. Balinese entries in this note type are
  out of scope for auto-enrichment until/unless that changes.

## Field content isn't always clean

A meaningful chunk of existing `Thai` field values aren't plain Thai
text — they're Word-paste HTML: `mso-*` inline styles, `<span
lang="ES">` wrappers, stray `&nbsp;`, and — notably — a **romanized
transcription already embedded in the same field as the Thai script**,
e.g.:

```
<span style="font-size:16.0pt;font-family:&quot;Leelawadee UI&quot;...">หนึ่งร้อยล้าน</span>
<div><span style="font-size:14.0pt;...">nèung-róy-láan&nbsp;</span></div>
```

Field length across the 302 Thai-filled notes: median 31 characters, but a
90th-percentile of 596 and a max of 936 — almost entirely this kind of
markup bloat concentrated in the older `numbers` and similar tag groups.
This means **whatever reads these fields to send as source text to
PolyglotBooster has to strip HTML and isolate the actual Thai-script
substring first** — sending the raw field value as-is would hand the LLM
a mess of CSS and an inconsistent, un-tone-marked romanization mixed in
with the real text. The structure proposal below treats this as a
required pipeline step, not a nice-to-have. It's covered in the
accompanying proposal's "clean" stage.

## Tags

Existing tags are pure provenance from the old deck structure the
migration absorbed (`20200417Glossika`, `Beginindo::Book3_Ch18`,
`ThaiPodA`, `RT`, `grammar`, `numbers`, `New`, etc.) — nothing currently
marks whether a note has been through PolyglotBooster. The proposal adds a
new tag namespace for exactly that, so bulk runs are resumable and
idempotent without needing a separate database:

```
pb::analyzed::<language>::<template-id>    e.g. pb::analyzed::thai::sentence-guide-thai
pb::audio::<language>                      e.g. pb::audio::thai
pb::skip::<language>                       user-applied, tells the tool to leave this note alone
pb::needs-review::<language>               tool-applied when word-vs-sentence classification was uncertain
```

These are plain Anki tags — visible and searchable in the Anki browser
(`tag:pb::analyzed::thai` etc.), so you can audit progress without any
custom tooling.

## What PolyglotBooster's existing new-note flow produces, for comparison

The one note type that already exists from PolyglotBooster's own `.apkg`
export (`Polyglot Booster::Thai::English`, 2 notes — this looks like the
verification pair from when `.apkg` export was built and tested, not real
study data) is structurally simpler and separate from Polyglot Vocab:

```
Front: สวัสดีครับ [sound:recording.mp3]
Back:  Hello
tags:  greeting polyglot::thai-english template::word-analysis-thai
```

Plain `Front`/`Back`, one card per flashcard, tag scheme
`polyglot::{source}-{explanation}` + `template::{promptTemplateId}` — this
is a different, and currently unrelated, note type from Polyglot Vocab.
The proposal doesn't try to unify these two structures; the "new note"
flow and the "bulk-enrich existing notes" flow can reasonably stay
separate, since they solve different problems (capturing something new vs
enriching something that already exists in your primary study deck). If
you'd rather converge them onto one note type long-term, that's worth a
separate conversation once the bulk-enrichment tool is working — flagged
as an open question in the proposal, not decided here.
