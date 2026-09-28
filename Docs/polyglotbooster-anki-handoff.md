# PolyglotBooster — context for Anki deck work

This is a handoff summary of PolyglotBooster, a personal language-learning
web app, written specifically to bring another AI session up to speed on
how it produces Anki material. It is current as of 2026-09-22.

## What the app is

PolyglotBooster is a Next.js 15 app (single user today, built to eventually
support others) for studying one language through another. You paste or
upload a word, sentence, or passage in a source language, pick a "task"
(a reusable prompt template), and Claude or GPT runs it to produce an
explanation in your chosen explanation language. Results can be saved as
reviews, and reviews can be exported for spaced-repetition study in Anki.

- Repo: `C:\Data\DevProjects\PolyglotBooster`, working branch `v2`
  (production/`main` is an untouched older version, ignore it)
- Deployed at `polyglotbooster-v2-lingua3.vercel.app` (Vercel project
  `polyglotbooster-v2`, Vercel Blob for all storage — no traditional
  database)
- Supported languages: Japanese, Thai, Indonesian, Spanish, English,
  French, Mandarin — this is the fixed `Language` union in
  `src/lib/types.ts`

## Data model relevant to Anki

**Flashcard** (`src/lib/flashcards.ts`):
```ts
{ front: string; back: string; tags: string[] }
```
Produced by the "Make flashcards" general task, which asks the LLM to
return JSON in exactly this shape. `front` is source-language, `back` is
explanation-language.

**SavedTaskRun** (`src/lib/reviews.ts`) — one saved review:
```ts
{
  taskRunId, sourceText, sourceLanguage, userLanguage,
  learnerLevel, outputStyle, promptTemplateId, result,
  flashcards?: Flashcard[], followUps?, notes,
  audio?: { url: string; voice: string; createdAt: string },
  createdAt
}
```
A review only has `flashcards` if the "Make flashcards" task was the one
run. Otherwise Anki export falls back to a single card: front = whole
source text, back = whole result text.

Reviews are stored per-user in Vercel Blob at
`lingua/accounts/{userId}/reviews.json` (one JSON array, not a database —
mutated via granular add/update/delete helpers in
`src/lib/storage/account.ts`, never a full-array overwrite).

## Task template library

Templates are shared/admin-editable data stored in Blob at
`lingua/templates.json` (not hardcoded in the repo — the original seed is
in `scripts/seed-templates.mjs` but the live set has since been edited
through the app's admin UI, so that script is stale). Each template has
`{ id, name, description, instruction, scope, icon, updatedAt }`, where
`scope` is either `"general"` (visible for every source language) or a
specific `Language` (visible only when that language is selected).

Current live templates (fetched directly from the Blob store, not from
the seed script):

**General** (all languages): Build vocabulary, Make flashcards, Convert
register, Extract text exactly, Translate naturally, Explain grammar, Add
reading support, Answer questions.

**Language-specific, one pair per language** — `word-analysis-{language}`
and `sentence-guide-{language}`, plus a Thai-only `thai-script-conversion`.
Thai, Japanese, Spanish, French, and Mandarin have been hand-written with
real linguistic depth (etymology, register spectrum, grammar specific to
that language's structure — e.g. Japanese keigo, Spanish pro-drop
subjects, Thai's lack of verb tense marking). Indonesian and English still
use a generic one-line instruction and haven't been upgraded yet.

Task order in the UI is word-analysis-first, sentence-guide-second for
every language except Japanese, which is reversed (sentence first) since
that reads more naturally for Japanese (`src/lib/templateOrder.ts`).

## Audio (text-to-speech)

A 🔊 button in the workspace generates a reading of the *source* text via
OpenAI's TTS (`gpt-4o-mini-tts`, single default voice `"alloy"` —
`src/lib/llm/tts.ts`), using the user's own OpenAI API key. The resulting
MP3 is stored as its own Blob object (`lingua/accounts/{userId}/audio/{uuid}.mp3`,
`src/lib/storage/account.ts:saveAccountAudio`), never inlined into
`reviews.json`. If audio was generated before a review is saved, its
`{ url, voice, createdAt }` reference rides along on the `SavedTaskRun`.

**Important for Anki purposes:** audio only exists on reviews created (or
re-saved) after this feature shipped in September 2026. Older reviews
have no `audio` field, and the exports below simply omit it for those.

## Anki export — two formats, both in `SavedReview.tsx`

**CSV / TSV** (`src/lib/exports.ts:taskRunExport`) — plain delimited text,
no audio (text formats can't carry binary media). For each flashcard (or
the single fallback card), it emits **two rows**: source→explanation and
explanation→source, so a plain-text Anki import produces bidirectional
cards. Columns: `Front, Back, Source language, Explanation language,
Prompt, Notes, Tags, Direction`. Tags always include
`polyglot::{source}-{explanation}` and `template::{promptTemplateId}`
(lowercased), plus any tags the LLM put on the flashcard itself.

**Anki package (.apkg)** — the real, audio-capable export, added
September 2026:
- Client trigger: `downloadAnkiPackage()` in `src/lib/exports.ts`, a plain
  `<a href>` navigation (not fetch+blob) to
  `GET /api/account/reviews/{taskRunId}/anki`
- Server: `src/app/api/account/reviews/[id]/anki/route.ts` calls
  `buildAnkiPackage()` in `src/lib/anki.ts`, which uses the
  `anki-apkg-export` npm package (pure JS + `sql.js`/WASM + `jszip`, no
  native deps — kept out of webpack bundling via `serverExternalPackages`
  in `next.config.ts` because of an unreachable browser-only `require()`
  in that package that webpack otherwise tries to resolve statically)
- Deck name: `Polyglot Booster::{sourceLanguage}::{userLanguage}`
- Same forward+reverse two-cards-per-flashcard structure as CSV/TSV, same
  tag scheme
- If the review has `audio`, the MP3 is fetched from its Blob URL,
  embedded in the package as `recording.mp3`, and an
  `[sound:recording.mp3]` tag is appended to whichever field of each card
  currently holds the *source-language* text (front on the forward card,
  back on the reverse card) — since the recording is always a reading of
  the source text, never the explanation
- This was verified end-to-end by actually generating a package, unzipping
  it, and reading the embedded SQLite `collection.anki2` back out to
  confirm notes/tags/sound-references were correct — not just a type-check

## Quick file map

| Concern | File |
|---|---|
| Flashcard type | `src/lib/flashcards.ts` |
| Saved review type | `src/lib/reviews.ts` |
| Review storage (Blob) | `src/lib/storage/account.ts` |
| Template storage (Blob) | `src/lib/storage/templates.ts` |
| Template ordering | `src/lib/templateOrder.ts` |
| CSV/TSV export | `src/lib/exports.ts` |
| .apkg building | `src/lib/anki.ts` |
| .apkg API route | `src/app/api/account/reviews/[id]/anki/route.ts` |
| TTS generation | `src/lib/llm/tts.ts` |
| TTS API route | `src/app/api/tts/route.ts` |
| Saved-review UI (download buttons, playback) | `src/components/review/SavedReview.tsx` |
| Prompt assembly (what actually gets sent to the LLM) | `src/lib/prompts/buildPrompt.ts` |

## Known gaps as of this handoff

- Indonesian and English word-analysis/sentence-guide templates are still
  generic one-liners, not hand-written like the other five languages.
- No bulk "export all reviews as one .apkg" — it's one package per review,
  downloaded individually from the saved-review list.
- Audio is a single default OpenAI voice for every language; no
  per-language voice selection.
