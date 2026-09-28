# PolyglotBooster — current Thai task templates

Exact, verbatim content of the two Thai-scoped task templates as they
currently live in the app's shared template store (Vercel Blob,
`lingua/templates.json`), pulled directly from that store rather than
retyped, to guarantee fidelity. Captured 2026-09-22.

Note: this `instruction` text is only the task-specific part of the
final prompt. The app also prepends a shared system preamble (analyzed
language, explanation language, learner level, output style — see
`src/lib/prompts/buildPrompt.ts`) before this text and appends the
source text after it. That preamble is reproduced exactly below.

## Shared preamble (`src/lib/prompts/buildPrompt.ts`)

This is prepended to every task's `instruction`, for every language, not
just Thai. Read verbatim from the current source file:

```ts
return [
  "You are a careful multilingual language-learning assistant.",
  `Analyzed language: ${input.sourceLanguage}.`,
  `Explanation language: ${input.userLanguage}.`,
  `Learner level: ${input.learnerLevel}.`,
  `Output style: ${input.outputStyle}.`,
  "Follow the requested task and keep the analyzed language and explanation language distinct. Label each language clearly.",
  `Task: ${template.instruction}`,
  "Source text:",
  input.text.trim(),
].join("\n\n");
```

Each array entry becomes its own paragraph (joined with a blank line
between them). So the full prompt actually sent to the LLM for, say,
Word Analysis Thai with Learner level "Intermediate", Output style
"Detailed", and source text "สวัสดีครับ" would read:

```
You are a careful multilingual language-learning assistant.

Analyzed language: Thai.

Explanation language: English.

Learner level: Intermediate.

Output style: Detailed.

Follow the requested task and keep the analyzed language and explanation language distinct. Label each language clearly.

Task: Analyze the word or phrase for:
- Etymology/origin (native Thai, Pali-Sanskrit, Khmer, Chinese, English
  loan, or mixed), and what that origin signals about register
- Word formation (compounding, reduplication, derivation — note where
  standard inflectional morphology does not apply, since Thai is largely
  isolating)
- Any grammatical particles attached or commonly co-occurring (aspect
  markers, politeness particles, negation, etc.)
- Classifier (ลักษณนาม), if the word is a countable noun
- Related words / word family
- Definitions
- Synonyms
- Example sentences, each Thai-first with phonetic transcription and
  English gloss
- Register: give versions across the spectrum where they differ —
  formal/written, standard/spoken, casual/spoken, and slang or vulgar
  (label this tier explicitly, e.g. "(vulgar/impolite — recognize, use
  with caution)") — noting any pronoun or sentence-final-particle shift
  that comes with each level
- Nuance (connotation, common misuse, regional or generational variation)

Source text:

สวัสดีครับ
```

`Explanation language` is whatever the user has selected as their
explanation language in the workspace (English by default, but it's a
free choice among the same seven supported languages). `Learner level` is
one of Beginner/Intermediate/Advanced, `Output style` one of
Concise/Detailed/Literal/Natural/Formal/Informal — both user-selected per
run, not fixed.

## Word Analysis Thai

- id: `word-analysis-thai`
- scope: Thai
- description: Roots, forms, nuance, examples
- updatedAt: 2026-09-15T14:17:03.556Z

Instruction (verbatim, exactly as sent to the LLM as the task-specific
part of the prompt):

```
Analyze the word or phrase for:
- Etymology/origin (native Thai, Pali-Sanskrit, Khmer, Chinese, English
  loan, or mixed), and what that origin signals about register
- Word formation (compounding, reduplication, derivation — note where
  standard inflectional morphology does not apply, since Thai is largely
  isolating)
- Any grammatical particles attached or commonly co-occurring (aspect
  markers, politeness particles, negation, etc.)
- Classifier (ลักษณนาม), if the word is a countable noun
- Related words / word family
- Definitions
- Synonyms
- Example sentences, each Thai-first with phonetic transcription and
  English gloss
- Register: give versions across the spectrum where they differ —
  formal/written, standard/spoken, casual/spoken, and slang or vulgar
  (label this tier explicitly, e.g. "(vulgar/impolite — recognize, use
  with caution)") — noting any pronoun or sentence-final-particle shift
  that comes with each level
- Nuance (connotation, common misuse, regional or generational variation)
```

## Sentence Guide Thai

- id: `sentence-guide-thai`
- scope: Thai
- description: Meaning, grammar, line by line
- updatedAt: 2026-09-15T14:49:45.443Z

Instruction (verbatim, exactly as sent to the LLM as the task-specific
part of the prompt):

```
Structure each explanation analyzed-language-first: Thai text, then a
tone-marked phonetic transcription (Paiboon-style or IPA — do not rely on
RTGS alone, as it omits tone and vowel length), then the English
explanation. Label each line clearly ("Thai:", "Phonetic:", "English:").

Thai script has no spaces between words and no reliable terminal
punctuation marking sentence boundaries. Before explaining, first segment
the text into sentences or clauses using spacing, conjunctions, and
meaning, and show that segmentation; then, within each sentence, mark word
boundaries where they aren't obvious.

Explain the text sentence by sentence (or clause by clause where a
"sentence" isn't clearly bounded), including:
- Meaning (literal, then the natural English sense if they diverge)
- Grammar: word order, serial verb constructions, topic-comment
  structure, and any subject/object/pronoun omitted from the sentence —
  Thai drops these far more freely than Indonesian, so note what's
  implied and how you inferred it
- Classifiers in context, and any particles marking aspect/tense/mood
  (Thai has no verb conjugation for tense — time is carried by particles
  like แล้ว/กำลัง/จะ or by context/time words; flag which is doing the
  work here)
- Sentence-final particles (ครับ/ค่ะ/นะ/สิ/ไหม/หรือ, etc.) and what each
  signals about register, speaker gender, or mood
- Notable usage: idioms, set phrases, loanwords, and register markers
  (word choice, particles, pronouns) that place this sentence on the
  formal–casual–slang spectrum — noting briefly how it would shift in a
  different register if that's illuminating
- Any cross-sentence reference: a pronoun or topic dropped here but
  recoverable only from an earlier sentence, where relevant to following
  the passage
```
