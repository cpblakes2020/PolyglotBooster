# PolyglotBooster — proposed revisions to the Thai templates

Proposed rewrites of `word-analysis-thai` and `sentence-guide-thai`, plus a
recommended (optional) tweak to the shared preamble in
`src/lib/prompts/buildPrompt.ts`. Nothing here has been applied to the live
Blob store — these are ready to paste into the admin UI's task editor
(`src/components/intake/TemplateEditDialog.tsx`) once you're happy with them.

Written against the current, unrevised templates captured in
`polyglotbooster-thai-templates.md` (2026-09-22).

---

## Word Analysis Thai — revised

Greatly simplified for standalone words: several sections are now
conditional (skip when there's nothing to say), the always-on "Thai is
isolating" disclaimer is gone, and two structural gaps are fixed — the
headword itself now gets a required pronunciation, and every Thai term the
response introduces (not just example sentences) has to carry Thai script
and a transcription.

```
Analyze the word or phrase as a standalone vocabulary item (for connected
text — a full sentence or passage — use Sentence Guide instead). Structure
your response with a markdown header for each section below, using this
exact heading text each time so results are consistent across runs.

## Pronunciation
Thai script, followed by a tone-marked phonetic transcription
(Paiboon-style or IPA — never RTGS alone, since it omits tone and vowel
length).

## Meaning
Core definition(s) in the explanation language. If more than one distinct
sense exists, list each separately.

## Origin
Etymology (native Thai, Pali-Sanskrit, Khmer, Chinese, English loan, or
mixed) and what that origin signals about register — only when there's
something notable to say; skip this section for plain native-Thai
vocabulary with nothing distinctive about its origin.

## Formation
Only if the word is a compound, reduplication, or otherwise has internal
structure worth breaking down. Skip this section for simple, unanalyzable
words.

## Classifier
The classifier (ลักษณนาม), if this is a countable noun.

## Related words
Up to 5 closely related words or synonyms, each given in Thai script with
phonetic transcription, a short gloss, and how it differs in meaning or
register from the headword.

## Register
Where usage varies by register, give the Thai form (script + transcription)
at each relevant level — formal/written, standard/spoken, casual/spoken,
slang/vulgar (label vulgar or impolite forms explicitly, e.g.
"(vulgar/impolite — recognize, use with caution)") — noting any pronoun or
particle that shifts with the level. If the word doesn't meaningfully vary
by register, say so briefly instead of forcing distinctions that don't
exist.

## Examples
2-3 example sentences using the word, each Thai-first with phonetic
transcription and English gloss.

## Nuance
Connotation, common misuse, or regional/generational variation — only if
there's something genuinely worth flagging; omit this section otherwise.
```

**What changed and why:**
- Added a required `## Pronunciation` section for the headword — the old
  version only required phonetic transcription for example sentences,
  never for the word actually being analyzed.
- Locked the transcription system to Paiboon/IPA everywhere in this
  template, matching what Sentence Guide already requires, instead of
  leaving it unspecified (which let the LLM default to RTGS, the system
  you explicitly ruled out elsewhere).
- `Related words` now requires Thai script + transcription per entry,
  instead of allowing an English-only gloss.
- Merged `Definitions` and `Synonyms` into `Meaning` / `Related words` to
  cut redundant sections.
- Made `Origin`, `Formation`, `Register`, and `Nuance` conditional/skippable
  instead of mandatory every time — removes boilerplate on simple words and
  drops the standing "Thai is isolating" disclaimer that repeated on every
  single card regardless of relevance.
- Dropped the "grammatical particles attached or commonly co-occurring"
  bullet — that's sentence-in-context behavior, which Sentence Guide
  already owns; a standalone word rarely needs it.
- Added markdown headers with fixed heading text, so results are
  consistent enough to script against later if you ever want to pull a
  section (e.g. just Register) into its own card.

---

## Sentence Guide Thai — revised

This is the one you actually use, so the substance is preserved — same
depth on grammar, particles, and register. Three fixes: the transcription
requirement is now explicit per section instead of stated once up top, the
Indonesian comparison (a leftover from when this template was adapted from
an Indonesian version) is replaced with a Thai-specific description that
doesn't assume the reader knows Indonesian grammar, and the usage-notes
section is now explicitly skippable when there's nothing notable.

```
Before the sentence-by-sentence explanation, segment the passage into
sentences or clauses under a `## Segmentation` header — using spacing,
conjunctions, and meaning, since Thai script has no spaces between words
and no reliable terminal punctuation marking sentence boundaries — and show
that segmentation.

Then, for each sentence or clause, use these headers in order (exact
heading text each time, so results are consistent across runs):

## Thai
The Thai text of this sentence/clause, with word boundaries marked where
they aren't obvious from the segmentation above.

## Phonetic
A tone-marked phonetic transcription (Paiboon-style or IPA — never RTGS
alone, since it omits tone and vowel length).

## English
The meaning in the explanation language — literal first, then the natural
sense if they diverge.

## Grammar
Word order, serial verb constructions, topic-comment structure, and any
subject/object/pronoun omitted from the sentence. Thai drops these far more
freely than languages that require an explicit subject, so note what's
implied and how you inferred it.

## Particles & classifiers
Classifiers in context, and any particles marking aspect/tense/mood (Thai
has no verb conjugation for tense — time is carried by particles like
แล้ว/กำลัง/จะ or by context/time words; flag which is doing the work here).
Sentence-final particles (ครับ/ค่ะ/นะ/สิ/ไหม/หรือ, etc.) and what each
signals about register, speaker gender, or mood.

## Usage notes
Idioms, set phrases, loanwords, and register markers (word choice,
particles, pronouns) that place this sentence on the formal-casual-slang
spectrum — noting briefly how it would shift in a different register if
that's illuminating. Any cross-sentence reference: a pronoun or topic
dropped here but recoverable only from an earlier sentence, where relevant
to following the passage. Omit this section if there's nothing notable to
flag.
```

**What changed and why:**
- Replaced "Thai drops these far more freely than Indonesian" with
  "languages that require an explicit subject" — the original only makes
  sense to a reader who already knows Indonesian's pro-drop behavior, which
  won't be true for anyone using a Thai-scoped template who isn't you
  personally, and this template is visible to every source-language-Thai
  user, not scoped to your account.
- Turned the flat "Explain the text sentence by sentence, including: ..."
  bullet list into per-field markdown headers (mirrors the labeled
  Thai:/Phonetic:/English: structure your worked example already showed),
  for the same consistency/scriptability reason as above.
- Merged the "particles marking aspect/tense/mood" and "sentence-final
  particles" bullets into one `Particles & classifiers` section — same
  content, less fragmented.
- Made `Usage notes` explicitly skippable instead of always-required.
- Left the core analytical content (grammar, particles, register,
  cross-sentence reference) untouched — this template's depth was already
  right for how you're using it.

---

## Shared preamble — recommendation

Two small additions to `src/lib/prompts/buildPrompt.ts`'s array, not a
rewrite. Both are generic enough to help every language/task, not just
Thai, which is why I'd put them in the preamble rather than duplicate them
into each template that needs them:

```ts
return [
  "You are a careful multilingual language-learning assistant.",
  `Analyzed language: ${input.sourceLanguage}.`,
  `Explanation language: ${input.userLanguage}.`,
  `Learner level: ${input.learnerLevel}.`,
  `Output style: ${input.outputStyle}.`,
  "Follow the requested task and keep the analyzed language and explanation language distinct. Label each language clearly.",
  "When you introduce any term in the analyzed language — a synonym, a related word, an alternate phrasing — give it in that language's native script (plus a phonetic reading if the script doesn't make pronunciation obvious), not just a description in the explanation language.",
  "Match the depth and thoroughness of your response to the requested output style: under a concise style, prioritize the most essential points from the task instructions over exhaustive coverage.",
  `Task: ${template.instruction}`,
  "Source text:",
  input.text.trim(),
].join("\n\n");
```

**Why these two, and why in the preamble rather than per-template:**
- The "native script for any introduced term" line generalizes the
  Related-words fix above to every language and every template — right now
  nothing stops the LLM from listing a Mandarin or Japanese synonym in
  English-only prose either, and this is the one-line fix for all of them
  at once rather than patching each template individually.
- The "match depth to output style" line resolves a tension both revised
  Thai templates still have in a mild form: a template can list several
  mandatory sections while a user picks "Concise" as their output style,
  and right now nothing tells the LLM how those two should interact. This
  makes that trade-off explicit once, for every task.

I did **not** recommend adding a preamble-wide markdown-header requirement
(the header-anchoring change made to both Thai templates above), even
though it would help consistency there too — the preamble runs for every
task including free-flowing ones like "Translate naturally" or "Answer
questions," where mandating headers would be actively worse. That's a
per-template decision, which is why it's baked into the two templates
above instead.

I haven't edited `buildPrompt.ts` itself — this is a recommendation, not an
applied change. Say the word if you'd like me to make that edit directly.
