# Proposal: PolyglotBooster Anki Sync — bulk enrichment for existing notes

PolyglotBooster today handles one direction: paste new text in, run a
task, save a review, export it as a new Anki note (CSV/TSV or `.apkg`).
It has no path for the opposite direction — taking a note that already
exists in your Anki collection and enriching it with a sentence guide,
word analysis, and audio after the fact. That's what this proposes: a
small, separate accessory app, **PolyglotBooster Anki Sync**, that closes
that gap for your 1,466-note `Polyglot Vocab` deck (see
`polyglotbooster-anki-structure.md` for exactly how that deck is built —
this proposal assumes that document's findings throughout).

Concretely, today: 302 notes have Thai filled in with essentially no
analysis or audio (1 manually-written test note out of 302); 1,162 have
Indonesian filled in with none. That's the backlog this tool exists to
work through, plus whatever gets added to Spanish/French/Mandarin as you
expand.

## Goals

- Walk existing `Polyglot Vocab` notes, find ones missing analysis or
  audio for a given language, generate both, and write them back to the
  right fields — safely, resumably, and without silently overwriting
  anything you or a prior run already wrote.
- Reuse PolyglotBooster's actual template/provider/TTS logic rather than
  re-implementing prompt construction a second time — the two Thai
  templates you just revised should be the ones this tool runs, unmodified,
  not a parallel copy that drifts out of sync.
- Make the cost and blast radius of a bulk run visible before it happens.
  A run across all 302 Thai notes is ~300 LLM calls and ~300 TTS calls —
  real time and real API cost — so nothing should fire silently in bulk
  without you seeing a preview first.

## Non-goals

- No new Anki note type, fields, or card templates — the structure
  document confirms the existing `Polyglot Vocab` templates already render
  `Notes_<Language>` and `Audio_<Language>`; this tool only needs to
  populate what's already wired up.
- No deck management — deck placement is already handled by the note
  type's own template configuration.
- No Balinese support — PolyglotBooster has no template or TTS voice for
  it; those notes are left alone.
- No attempt to unify this with the separate `Polyglot Booster::Thai::English`
  note type your `.apkg` export produces — that's a bigger, separate
  decision (see the structure doc's closing note), not part of this tool.

## Architecture

Two integration points, both existing:

1. **AnkiConnect** — the standard free Anki add-on (code `2055492159`,
   not yet installed on this machine per the structure doc) that exposes a
   local HTTP JSON-RPC API (`http://127.0.0.1:8765`) for reading and
   writing notes in a *running* Anki instance. This is the only sanctioned
   way to modify a live collection programmatically — never write to
   `collection.anki2` directly while Anki is open, which is exactly the
   "database disk image is malformed" problem I hit just inspecting it
   read-only for this proposal. AnkiConnect handles the read/write side.

2. **PolyglotBooster's own logic** — for generation, not a second
   implementation of it. There are two ways to reuse it, and I'd pick the
   first:

   **Recommended: import the library code directly.** Since this new app
   lives on the same machine as the PolyglotBooster repo, it can depend on
   `src/lib/prompts/buildPrompt`, `src/lib/llm/provider`,
   `src/lib/llm/tts`, and `src/lib/storage/templates` directly as
   TypeScript modules (a relative path dependency, or a tiny local
   workspace package) and call them in-process. This sidesteps
   authentication entirely — there's no session cookie to manage, no token
   to mint, because nothing goes over HTTP to the deployed app. It also
   means template edits made through your admin UI are picked up
   automatically next run, since it's reading the same `templates.json`
   Blob store PolyglotBooster reads. The one thing to verify before
   committing to this path: that `provider.ts`/`tts.ts` don't have
   Next.js-server-only entanglements that would make them awkward to run
   from a plain Node script — from what's in the handoff doc they look
   like plain fetch-wrapping functions, but worth a five-minute check
   before building on it.

   **Fallback: call the deployed HTTP API.** `POST /api/tasks/run` and
   `POST /api/tts` on `polyglotbooster-v2-lingua3.vercel.app` do exactly
   what's needed and are already built — but both require a signed-in
   NextAuth session, which a standalone script doesn't have. This path
   only makes sense if you want the sync tool fully decoupled from the
   repo (e.g. runnable from a different machine), and it would need either
   a captured session cookie (expires, brittle) or a small PolyglotBooster
   change to accept a long-lived API token for script access. I'd only go
   this way if the direct-import path turns out to be blocked.

Everything below assumes the direct-import path.

## Pipeline

For a given language (run one language at a time; Thai first, since
that's the current backlog):

**1. Fetch candidates.** AnkiConnect `findNotes` for
`note:"Polyglot Vocab" Thai:_* -tag:pb::analyzed::thai::* -tag:pb::skip::thai`,
then `notesInfo` for the matches. This is naturally resumable — a note
that already has the tag from a prior run is skipped without any separate
state file.

**2. Clean the source text.** Strip HTML tags and entities from the field
value, then isolate the actual Thai-script run(s) — the structure doc
found a meaningful chunk of entries have romanization and Word markup
baked into the same field, and that needs to not reach the LLM as
"source text." This is deterministic code (an HTML stripper plus a
Unicode-range check for Thai characters), not an LLM call — cheaper and
more predictable than asking a model to do the extraction.

**3. Classify word vs. sentence.** Decide which of your two revised
templates applies: `word-analysis-thai` for a standalone term,
`sentence-guide-thai` for a phrase or sentence. A cheap heuristic first —
short field, no sentence-final particle (ครับ/ค่ะ/นะ/ไหม/etc.), no clause
conjunction → word analysis; otherwise sentence guide — with a
`pb::needs-review::thai` tag applied when the heuristic is genuinely
unsure, so you can eyeball those in the Anki browser rather than trusting
a guess silently. No LLM call spent on classification.

**4. Generate.** Call `buildPrompt` + the provider with the cleaned text,
the note's existing language pair (source = Thai, explanation = English,
matching what's already in the note), and your usual learner
level/output style defaults, using the classified template. Separately
call TTS on the cleaned Thai text.

**5. Convert to Anki-safe HTML.** The markdown-with-headers structure
your revised templates now produce converts cleanly: each `## Heading`
becomes a bold label, paragraph breaks become `<div>` wrapping (matching
the format your one hand-written `Notes_Thai` entry already uses, so
generated and manual entries look consistent side by side). This is a
mechanical conversion, not a second LLM call.

**6. Review before writing.** Default mode is dry-run: write a single
static HTML report to disk (one row per note — cleaned source text,
classification chosen, generated HTML rendered as it would appear in
Anki, audio player) and stop. You open it, skim it, and only then re-run
with `--commit`. Given the field-cleanliness issues found in the structure
doc, I'd treat this step as non-optional for at least the first run per
language — after you've seen a batch or two behave well, a `--commit`
default becomes reasonable to trust.

**7. Write.** On `--commit`: AnkiConnect `storeMediaFile` (it accepts a
source `url` directly, so the TTS output URL from `/api/tts` doesn't even
need a manual download step) to land the mp3 in `collection.media`, then
`updateNoteFields` to set `Notes_Thai` and `Audio_Thai`
(`[sound:<generated-filename>.mp3]`), then `addTags` with
`pb::analyzed::thai::sentence-guide-thai` (or whichever template ran) and
`pb::audio::thai`. Never overwrites a field that's already non-empty
unless `--force` is passed — this is the guard that keeps the 8 already-
filled Japanese notes safe when Japanese's turn comes.

## Safeguards

- **Skip, don't clobber, by default.** Any note with existing
  `Notes_<Lang>` or `Audio_<Lang>` content is left untouched unless you
  explicitly force it.
- **Dry-run first.** No write path runs without a `--commit` flag; the
  report is the default output.
- **Cost estimate up front.** Before generating anything, print candidate
  count × (1 LLM call + 1 TTS call) so you know what a run costs in time
  and API spend before it starts, not after.
- **Batching and backoff.** Process in chunks (e.g. 20 notes) with a short
  delay between batches, so a run across 302 notes doesn't hammer rate
  limits or leave you with no way to interrupt cleanly partway through.
- **Resumable by construction.** Because "done" is a tag on the note
  itself rather than a separate progress file, killing the process and
  re-running later just picks up where it left off.

## Suggested build order

**Phase 1 — Thai, end to end, one direction.** Fetch → clean → classify →
generate → HTML report. Prove the pipeline on the real 302-note backlog in
dry-run only; no AnkiConnect writes yet. This is where the field-cleanup
edge cases will actually surface, so it's worth getting right before
anything touches the live collection.

**Phase 2 — commit path.** Add `--commit`, the tagging scheme, the
skip-if-filled guard, and batching/backoff. Run it for real on Thai.

**Phase 3 — generalize.** Extend to Indonesian (the bigger backlog at
1,162 notes) and Japanese (only 8 notes, but respect the
already-filled ones), then Spanish/French/Mandarin as those fields start
getting populated. This should mostly be config, not new code, since
nothing in the pipeline above is Thai-specific except which templates get
selected.

**Phase 4 (optional) — field cleanup pass.** A separate, opt-in pass that
detects the Word-HTML-cruft entries specifically and proposes a cleaned
replacement for the visible `Thai`/`Indonesian` field itself (not just the
generation-time extraction in step 2) — with its own dry-run report, since
this one touches what you actually study, not just supplementary content.
Worth doing eventually, but it's a separate decision from bulk enrichment
and shouldn't block Phases 1–3.

## Open questions for you

- **Direct-import vs. HTTP API** — confirm the library modules are
  import-friendly outside Next.js before committing to that path (five-
  minute spike, not a real risk, but worth checking first).
- **Review format** — a static HTML report is the lightest thing that
  works; say if you'd rather have something more interactive (e.g. a tiny
  local page where you can approve/reject/regenerate individual notes
  before commit) — that's a Phase 3+ upgrade, not a Phase 1 requirement.
- **Should the two note-creation paths eventually converge** — worth a
  separate conversation once this tool is working, not before.
