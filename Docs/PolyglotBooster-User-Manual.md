# PolyglotBooster User Manual

*Last updated: October 1, 2026*

PolyglotBooster is a study companion for learning languages through other languages. You give it a word, a sentence, or a whole document in the language you're learning; it explains it through a language you already know, reads it aloud, and turns it into Anki flashcards — including rich notes, audio, and new cards for the example sentences and related words it finds along the way.

**App address:** <https://polyglotbooster-v2.vercel.app>

## Contents

1. [Getting started](#1-getting-started)
2. [Settings: API keys and voices](#2-settings-api-keys-and-voices)
3. [The study desk](#3-the-study-desk)
4. [Saved reviews and exports](#4-saved-reviews-and-exports)
5. [Setting up Anki (first-time Anki users)](#5-setting-up-anki-first-time-anki-users)
6. [The Anki page](#6-the-anki-page)
7. [Studying your cards in Anki](#7-studying-your-cards-in-anki)
8. [Troubleshooting](#8-troubleshooting)
9. [Reference](#9-reference)

---

## 1. Getting started

### What you need

- A **Google account** — it's how you sign in.
- An **API key** from Anthropic (Claude), OpenAI (GPT), or both. PolyglotBooster uses *your* key for everything it generates, so you pay the AI provider directly for what you use — typically a few cents per analysis and well under a cent per audio clip. See [section 2](#2-settings-api-keys-and-voices).
- For the Anki features: a **laptop or desktop computer** with the free **Anki** app. Everything else works on a phone or tablet too.

### Signing in

Open <https://polyglotbooster-v2.vercel.app> and click **Sign in with Google**. Your keys, settings and saved reviews belong to your Google account, so you'll see the same things on any device you sign in from.

### Installing it as an app (optional)

- **Chrome or Edge (computer):** click the install icon at the right end of the address bar, or the ⋮ menu → *Cast, save and share* → *Install page as app*.
- **iPhone / iPad (Safari):** tap Share → *Add to Home Screen*.
- **Android (Chrome):** ⋮ menu → *Add to Home screen* / *Install app*.

### Finding your way around

The header at the top of every page has three links:

| Link | What's there |
|---|---|
| **Study desk** (the home page) | Analyze text, hear it read aloud, save and export results |
| **Anki** | Work directly with your Anki collection (computer only) |
| **Settings** | API keys and voices |

---

## 2. Settings: API keys and voices

### API keys

PolyglotBooster needs at least one key before it can run anything.

**Getting an Anthropic (Claude) key**

1. Go to <https://console.anthropic.com> and sign up or sign in.
2. Add a payment method and some credit under *Billing* (a few dollars lasts a long time).
3. Open *API Keys* → **Create Key**, and copy the key (it starts with `sk-ant-`).

**Getting an OpenAI key** — needed for audio (read-aloud and Anki audio), optional for analysis

1. Go to <https://platform.openai.com> and sign up or sign in.
2. Add credit under *Billing*.
3. Open *API keys* → **Create new secret key**, and copy it (it starts with `sk-`).

**Adding them:** in **Settings**, paste each key into its box and click **Save key**. The page then says *A key is on file*. Keys are stored encrypted on the server, tied to your account, and used only for your own requests. You can replace or remove a key at any time.

> Audio always uses OpenAI, whichever provider you pick for analysis — so if you want audio, add an OpenAI key.

### Voices

Also in **Settings**, the **Voices** section chooses the voice for each language. Each language has:

- a **voice** (OpenAI's `marin` and `cedar` are the most natural), and
- **instructions** that set the accent and pace — e.g. *"Speak natural Central Thai with a native Bangkok accent and accurate tones…"*. The voices aren't tied to a language; the instructions are what make them sound native.

Click **Preview** to hear a sample, adjust, then **Save voices**. The voices are used by the 🔊 button on the study desk and for all Anki audio.

**Thai pronunciation:** the voice reads Thai largely from its spelling, so words with silent letters or hidden vowels would come out wrong (the silent ร in ศีรษะ sounded, for example). Before recording a Thai word, phrase or sentence (up to 300 characters), PolyglotBooster has the AI find the words that aren't read as spelled and respell just those the way they sound — ศีรษะ → สีสะ, ผลไม้ → ผนละไม้ — guided by the note's romanization; every other word is left exactly as written. Only the recording uses the respelling; the Thai on your card keeps its correct spelling. It uses your Anthropic key if you have one (with Claude Sonnet 5.5, which gets the Thai tone rules right), otherwise OpenAI, and costs a fraction of a cent per recording. Longer passages are read as written.

---

## 3. The study desk

The study desk (home page) is where you analyze anything in any supported language.

### Step 1 — Set the languages

Across the top:

- **Source** — the language you're studying (Japanese, Thai, Indonesian, Spanish, English, French or Mandarin).
- **Explain through** — the language explanations are written in.
- **Level** — Beginner, Intermediate or Advanced; controls how much is assumed.
- **Style** — Concise, Detailed, Literal, Natural, Formal or Informal. *Concise* gives the essentials; *Detailed* goes deeper.

The app remembers your choices.

### Step 2 — Give it something to study

**Enter text:** type or paste a word, sentence or passage (up to 12,000 characters). The **Try an example** buttons load a sample.

Your work in progress — the text, the chosen task and its result — is kept in this browser, so reloading or closing the page doesn't lose it. **Clear** empties it. It isn't shared between devices; use **Save for review** to keep a result in your account.

**Upload document:** click **Choose documents** and pick a DOCX, PDF, image (JPG, PNG, or HEIC — the iPhone camera's format), HTML, TXT or XML file (up to 4 MB each). HEIC photos are converted to JPG in your browser first, so iPhone photos synced to your PC (e.g. the **iCloud Photos** folder) can be picked as they are. You can select **several files at once** — for example every page of a chapter — and they're read one after another in filename order. In Chrome and Edge the picker reopens in the folder you used last. The text is extracted and placed in the text box, where you can edit it before running a task.

For photos, choose how they're read under **Read photos with** (the app remembers your choice):

- **This device first** — free. The photo is read in your browser; if that finds too little text, the AI reader is used instead. Works well for clear, printed text.
- **AI reader** — about a cent per photo. Best when a photo mixes scripts (for example Thai with its romanization and an English translation), has tone-marked romanization, or is handwritten or hard to read.

When there's already text in the box, **Add to the text already in the box** (on by default) appends new files instead of replacing the text, so you can also add pages in several goes (up to 12,000 characters in total).

You don't need to tidy up romanization or translations that come in with a photo: PolyglotBooster writes its own romanization, and when a note goes to Anki only the learning-language script is kept in that field. Deleting obviously garbled lines before you run a task still helps.

Choose the **Provider** (Anthropic or OpenAI) under the text box — the note beside it tells you whether you have a key on file for it.

### Step 3 — Choose a task

Pick a task from the drop-down at the top of the panel or from the cards under **Choose a lens**. The tasks shown depend on the source language:

**Language-specific tasks** (shown first)

- **Word Analysis** — for a single word or short term: pronunciation, meanings, origin, how it's built, classifiers (Thai), related words, how it changes across registers from formal to slang, example sentences, and nuance.
- **Sentence Guide** — for a phrase, sentence or passage: pronunciation and meaning (literal and natural), with a word-by-word table, the reusable grammar pattern, register versions from formal to slang, alternative ways to say it, an opposite where there is one, and new example sentences.
- **Convert Thai Script** (Thai only).

**General tasks** (every language): Build vocabulary, Make flashcards, Convert register, Extract text exactly, Translate naturally, Explain grammar, Add reading support, Answer questions, and **Word-by-word** — a quick, abbreviated breakdown: each word with its reading and literal meaning, a short definition written in the learned language itself (translated in brackets), and one to three synonyms, ending with a word-for-word and a natural translation of the whole text.

> Thai romanization everywhere in the app uses one consistent style with tone marks, e.g. ยินดีที่ได้รู้จัก → *yin dee thêe dâi rúu jàk*.

### Step 4 — Run it

- **Run task** sends it to the AI; the result appears below the text box.
- **Preview prompt** shows exactly what will be sent, without running it.
- **🔊** reads the source text aloud with your voice for that language, with play/pause, skip and loop controls.

**Make flashcards** turns the material into a complete set of cards — every vocabulary item (including glossary asides like "(kitchen = khruua)") and every example sentence — each with its meaning, a reading, and a short note from the material. You can change the front, back or tags, **Remove** cards, or **Add card**, then send them to Anki (below).

### Step 5 — Ask follow-up questions

Under a result, click **Ask a follow-up question**, type your question (the **Insert a phrase** buttons give you starters such as *"What would be another way to say"*), then **Run task**. Answers stay attached to the result.

### Step 6 — Save or send to Anki

- **Save for review** keeps the result (with any follow-ups and audio) in your saved reviews — see [section 4](#4-saved-reviews-and-exports).
- **Send to Anki** (shown for Indonesian, Thai, Japanese, Spanish, French or Mandarin explained in English; works on a computer with Anki set up) puts it straight into your Anki collection — see [Send to Anki](#send-to-anki-from-the-study-desk).
- **Send cards to Anki** does the same for a Make flashcards result — see [Flashcards to Anki](#flashcards-to-anki).
- **Right-click a phrase** in the result or a follow-up answer to add just that phrase to Anki — see [Right-click to add a phrase](#right-click-to-add-a-phrase-from-the-study-desk).

---

## 4. Saved reviews and exports

Saved results appear under **Saved review** at the bottom of the study desk. Only reviews for the current source language are listed — switch the source language to see others.

For each saved review you can:

- click it to expand the source text, result, follow-ups and audio;
- **Open full size on the study desk ↑** — loads it back into the study desk above (replacing what's there) and scrolls up to it: the result is shown full size, ready to read, right-click phrases from, ask more follow-ups about, or re-save;
- add a **note** for yourself (saved when you click away);
- **Send to Anki**, or **Send cards to Anki** for a flashcard result (see [section 6](#6-the-anki-page)), or right-click a phrase in the expanded review to add just that;
- **Download TXT** — a plain-text copy;
- **Delete** it.

Cards reach Anki only through the Anki connection (Send to Anki and the Anki page) — there are no deck files to download and import.

---

## 5. Setting up Anki (first-time Anki users)

Anki is a free flashcard app that schedules each card just before you'd forget it. PolyglotBooster works directly with the Anki app on your computer. You do this setup **once per computer**.

### 5.1 Install Anki

1. Download Anki from <https://apps.ankiweb.net> (Windows, Mac or Linux) and install it.
2. Open Anki. On first launch it asks for your language and creates a profile.
3. *(Recommended)* Create a free **AnkiWeb** account at <https://ankiweb.net>, then in Anki click **Sync** and sign in. Syncing backs up your cards and lets you study on your phone — see [section 7](#7-studying-your-cards-in-anki).

### 5.2 Install the AnkiConnect add-on

AnkiConnect lets PolyglotBooster talk to Anki.

1. In Anki: **Tools → Add-ons → Get Add-ons…**
2. Enter the code **`2055492159`** and click **OK**.
3. **Restart Anki.**

### 5.3 Allow PolyglotBooster to connect

1. In Anki: **Tools → Add-ons**, select **AnkiConnect**, and click **Config**.
2. Find the `"webCorsOriginList"` setting and make it look exactly like this:

   ```json
   "webCorsOriginList": [
       "http://localhost",
       "https://polyglotbooster-v2.vercel.app"
   ]
   ```

   Every line inside the brackets except the last ends with a comma — without the commas Anki won't save the configuration.

3. Click **OK** and **restart Anki**.

### 5.4 Create the PolyglotBooster note type

1. With Anki open, go to the **Anki** page in PolyglotBooster.
2. If your browser asks to let the site access devices on your local network, click **Allow** — that's how it reaches Anki.
3. The page shows **Connected — setup needed**. Click **Set up Polyglot Vocab**.

This adds, without touching anything already in Anki:

- a note type called **Polyglot Vocab**, and
- a deck for each language: **Polyglot::Indonesian**, **::Thai**, **::Japanese**, **::Spanish**, **::French** and **::Mandarin**.

The page then shows **Connected to Anki**, and you're ready.

### 5.4a Adding Spanish, French and Mandarin to an older setup

If you set up Polyglot Vocab before these languages were added, the Anki page shows a panel offering to **Add Spanish, French, Mandarin**. It adds their fields, their card directions and their decks, without changing your existing notes or cards (it also repairs an older card-layout glitch on a few card directions).

1. **Sync your phone first** — the change needs a one-way sync, and anything not yet synced from the phone would be lost.
2. Click **Add Spanish, French, Mandarin**.
3. Sync Anki on your computer; when it asks, choose **Upload to AnkiWeb**. Then sync your phone.

### 5.5 How Polyglot Vocab notes work

One note holds one item in several languages. Its fields are:

| Field | Holds |
|---|---|
| English, Indonesian, Thai, Japanese, Spanish, French, Mandarin | The item in each language |
| Audio_*Language* | That language's recording |
| Notes_*Language* | The reading (Thai romanization, Japanese furigana or Mandarin pinyin), the analysis, and brief explanations written in that language |
| Notes_English (*English note*) | Brief explanations in English, and anything you write yourself, e.g. a question when flagging a card |
| Origin | The language the item was first learned in |

Anki creates a **card for each language direction** that has both sides filled in — for example a note with English and Thai gives you *English → Thai* and *Thai → English* cards. Fill in Japanese later and the Japanese directions appear automatically.

Card directions exist between each language and English, plus Indonesian–Thai, Indonesian–Japanese, Thai–Japanese, Spanish–French, Mandarin–Japanese and Mandarin–Thai.

Cards with English go in that language's deck (an *English → Spanish* card in **Polyglot::Spanish**); cards between two languages go in **Polyglot::Cross-Language::***A*-*B* (e.g. **Cross-Language::Thai-Mandarin**). When PolyglotBooster saves a note, it puts any new cards in those decks. When you fill in a language directly in Anki or on your phone, Anki puts the new cards in the right deck only if that card direction has a *deck override* (Anki: **Tools → Manage Note Types → Polyglot Vocab → Cards → Options → Deck Override**); without one, they land in the deck of the note's other cards.

**Chinese characters:** Mandarin is entered in simplified characters. Its reading under **more** shows the pinyin, then the other script — *Traditional:* for simplified text, or *Simplified:* if you entered traditional text from Taiwan or Hong Kong — and, for words, the *Japanese kanji* form when it differs (e.g. 经济 → 経済). On a Japanese note that also has Mandarin, the reading adds the *Simplified Chinese* form of the kanji. These are character-form conversions, not translations.

On each card, the audio plays automatically and the notes are tucked under a **more** link, so the card stays clean until you want the detail.

> **Adding notes by hand in Anki:** click **Add**, choose the *Polyglot Vocab* note type, fill in English plus at least one other language, and set *Origin* to that language.

---

## 6. The Anki page

The Anki page works on a **computer with Anki open**. At the top it shows the connection status; once connected it has two tabs: **Review & analyze** and **Bulk audio**.

### 6.1 Review & analyze

This is where you enrich notes one at a time — which doubles as a study session.

**Choose what to work on**

- **Language** — Indonesian, Thai, Japanese, Spanish, French or Mandarin. **Start session** only brings up notes whose *Origin* is this language (an Indonesian-origin note that also has Thai comes up in Indonesian sessions); **Flagged in Anki** and **Find** show every note with this language filled in, whatever its origin.
- **Narrow with an Anki search** *(optional)* — any Anki search, e.g. `tag:food` or `deck:Polyglot::Thai`.
- **Model, Level, Style** — the provider and settings for the analysis (defaults: Anthropic, Intermediate, Concise).
- **Start session** — works through notes that haven't been analyzed yet, oldest first.
- **Flagged in Anki** — works through notes you've red-flagged in Anki (see below), analyzed or not.
- **Missing romanization** (Thai) / **Missing reading** (Japanese, Mandarin) — every note with that language filled in but no reading yet, **newest first**: notes you made in Anki itself, notes marked *Never analyze*, and languages added to a note later. Each note's reading is written as soon as it comes up; check or edit it, then **Save romanization & next** (or **Save reading & next**), which saves only the reading — the note isn't marked as analyzed, and anything else in its Notes field stays as it was. You can still **Analyze** a note here if you want the full analysis too.
- **Or find a note to edit** — type Thai/Indonesian/Japanese or English text and click **Find**; this works for any note, analyzed or not, and opens its saved analysis for editing.

**Working on a note**

1. The learning-language text is shown with a ▶ button for its audio. **Show English** reveals the meaning when you're ready — try recalling it first.
2. **Clean up the field** *(when needed)* — older notes sometimes contain formatting or an old romanization in the language field. The page shows the stored version and a cleaned version you can edit; tick **Replace the field on save** to fix it.
3. **Word analysis / Sentence guide** — the page suggests one (and says when it isn't sure); switch if you disagree.
4. **Analyze** — generates the analysis and, for Thai and Japanese, a reading line. Both are editable, and the preview shows exactly how the note will look under **more** on the card. **Regenerate** tries again; **Regenerate reading only** redoes just the reading.
5. **English note** — under English, the note's *Notes_English* field, e.g. a question you typed in Anki when you flagged the card. Edit it, or empty the box to delete it; it's saved with any of the save buttons, or straight away with **Save English note** (or **Delete English note**). **Undo** puts back what's in Anki.
6. **Add tags** *(optional)* — shows the note's current tags; type new ones separated by spaces (existing tags are suggested as you type). **Save tags** adds them straight away; otherwise they're added when you save.

**Saving**

| Button | What it does |
|---|---|
| **Save to Anki & next** | Saves the analysis (plus cleanup and tags) and moves to the next note |
| **Save** | Saves and stays on the note — handy before branching (below) |
| **Save cleanup only & next** | Saves just the cleaned field; the note comes back for analysis another time |
| **Skip for now** | Moves on without saving |
| **Never analyze this note** | Leaves it out of future sessions (still saves a ticked cleanup) |
| **Edit fields** | Edit the note's fields right here (below) |
| **Open in Anki** | Opens the note in Anki's own editor (the window may open behind your browser) |

**Sending a card back from Anki:** while studying in Anki, press **Ctrl+1** (on iPhone/iPad, use a flag button — see [On your phone](#on-your-phone)) on any card you want to edit or analyze in PolyglotBooster. Later, click **Flagged in Anki** on the Anki page to work through them. The red flag comes off automatically when you save anything for the note (analysis, cleanup, fields, *Never analyze*), or click **Clear flag & next** if you only wanted to look.

Analyzing a note again replaces its previous analysis instead of adding a second one; anything else in the Notes field (such as a hand-written furigana reading) is kept.

**Edit fields**

Click **Edit fields** to change the note's language fields (English, Indonesian, Thai, Japanese, Spanish, French, Mandarin) or Origin, its **English note** (right under English, as plain text), or its other Notes (as HTML, under *Notes fields*).

- An empty language field says *filling it in adds its cards*, and has a **Suggest** button that proposes a translation from the note's other languages. Suggestions only fill the box — check them before saving.
- A new or changed language field gets a fresh recording (untick *Record new audio* if you don't want it).
- A new or changed Thai, Japanese or Mandarin field also gets its reading written into that language's Notes (untick *Write the reading* if you don't want it).
- **Save fields** writes only what you changed.

### 6.2 Branching: turning examples into new cards

A good analysis is full of useful material — example sentences, related words, casual and formal versions. Branching turns them into cards of their own.

**Branch from examples** (under the analysis preview)

1. The page lists every example, related word and register version in the analysis, with its reading, English, and a brief explanation — in the item's own language, with the same in English below it. Items you **already have in Anki** are marked *In Anki* and unticked.
2. Tick the ones you want (**Select all / none** helps), then **Start branch**.
3. For each item you can:
   - **Add note with brief explanations** — creates a note whose Notes field for that language has the reading, the explanation written in that language, and a *Seen in:* line pointing back to where you found it, and whose **English note** has the explanation in English (both are editable first, and previewed);
   - **Analyze fully** first, then **Add note with analysis**;
   - for an item already in Anki, **Add explanations to existing note** — the explanation block is added *after* everything already in its Notes field (any analysis stays untouched) and the English one on a new line in its English note — or **Add a new note anyway**;
   - **Skip**.
4. New notes get audio straight away and the tag `pb::branch`. When the list is done, **Back to main session** returns you to the note you branched from — with your unsaved work intact.

**Right-click to add one item:** select any text in the analysis preview, right-click it and choose **Add "…" to Anki…** to add just that phrase. If it's already in Anki you'll get the same choices as above. Or choose **Save "…" for Anki later** to keep it for later without stopping — see [Saved for Anki later](#saved-for-anki-later).

> Analyzing a note later is unaffected by brief explanations: **Analyze** and re-analysis only replace PolyglotBooster's own reading and analysis sections, and everything else in the field — explanations, your own notes — stays.

**Ask a follow-up question:** under the analysis preview, click **Ask a follow-up question** and type your question — for example, on *คุณควรบอกเขาก่อนเธอ* ("You should tell him before she does"), ask *How would you say "You should tell him before you tell her"?* — then **Ask** (or Ctrl+Enter). The answer appears below, with each Thai phrase in bold, its romanization and its English. Ask as many as you like; each answer takes the analysis and the earlier questions into account (uses the **Model**, **Level** and **Style** at the top of the page).

- Answers are **not saved** to the note, and nothing from them goes to Anki on its own. To keep a phrase, select it in the answer, right-click and choose **Add "…" to Anki…** (or **Save "…" for Anki later**) — it then works exactly like right-clicking in the analysis.
- The questions and answers stay while you branch and come back, and are cleared when you move to another note.

**Branching from a branch:** an item you've analyzed fully can itself be branched from (button or right-click). The deeper list is labelled *Branch · level 2*, and **Back to previous branch** takes you back up.

> Tip: click **Save** (not *Save & next*) on the main note first, then branch — your analysis is safely in Anki and stays on screen to branch from.

### 6.3 Bulk audio

Records audio for every note that doesn't have it yet.

1. Tick the languages (Indonesian, Thai, Japanese, Spanish, French, Mandarin). English isn't recorded — it's the prompt side, and Anki would otherwise read it aloud in every review.
2. The **Voices** line shows which voice each language will use (change them in Settings).
3. Click **Find notes needing audio**. You'll see how many clips are needed, with an estimated length and cost (roughly $0.015 per minute of audio — a thousand short clips cost about a dollar).
4. Click **Generate**. Keep the tab open; **Stop** at any time. Finished notes are tagged `pb::audio::<language>`, so the next run picks up where you left off.

**Re-recording after changing a voice:** tick **Replace existing audio too**, then find and **Re-record**. New recordings get new file names so they sync reliably to your phone.

### Send to Anki from the study desk

On a result or saved review (Indonesian, Thai, Japanese, Spanish, French or Mandarin explained in English), click **Send to Anki**:

- If a note with exactly that text exists, it's updated — the analysis is added under its Notes, and audio if it has none.
- Otherwise a new note is created. It suggests the **English** meaning for you to edit (every card pairs with English), and adds a reading and audio.

Everything is shown for review before anything is written.

### Right-click to add a phrase from the study desk

On a result or an expanded saved review (same languages, explained in English), select any phrase — in the result, a follow-up answer or the source text — then right-click and choose **Add "…" to Anki…** (or **Save "…" for Anki later** — see [Saved for Anki later](#saved-for-anki-later)). The same item screen as on the Anki page opens right there, under the result: the phrase with its reading, English and brief explanations (in its own language and in English), a *Seen in:* line pointing back to the source text, the *In Anki* check with its choices, tags and audio. **Add** or **Skip**, and you're back where you were; right-click the next phrase to add another. Only text in the review's language can be added, and it needs Anki open on this computer.

### Saved for Anki later

Save phrases while you study and add them to Anki later — without interrupting yourself, and from your phone or iPad too.

- **Saving:** on the study desk (a result, a follow-up answer or an expanded saved review) or on the Anki page (the analysis preview or a follow-up answer), select a phrase, right-click and choose **Save "…" for Anki later**. On an iPhone or iPad, just select the text: a **Save "…" for Anki later** bar appears at the bottom of the screen; tap it. A message confirms how many are waiting. The list is kept in your PolyglotBooster account, so it's the same on every device and stays until you deal with it.
- **Seeing the list:** **Saved for Anki later (N)** on the study desk lists every saved phrase with its language, where it came from and the date; **Delete** removes one. This works on any device.
- **Adding to Anki** (on the computer running Anki): on the Anki page, pick the language and click **Saved for later (N)**. Each phrase is looked up in the context you saved it from — reading, English and brief explanations — and the usual list opens: **Start branch** to go one at a time, or **Add all N with brief explanations**. For each phrase: add it (it then leaves the list), **Skip, keep for later** (it stays), or **Delete from list**. In the list, **Delete the N unticked from the list** clears phrases you've decided against (e.g. ones already in Anki); unticked phrases otherwise stay saved.

### Flashcards to Anki

After **Make flashcards** (Indonesian, Thai, Japanese, Spanish, French or Mandarin, explained in English), click **Send cards to Anki**:

1. Optionally say where the cards are from, e.g. *Speak Thai Today, chapter 22* — it's added to each note as a *Seen in:* line.
2. **Tag every card** fills in a short tag from that name (e.g. *STT22*); edit it if you like. Every note in the batch gets it, so you can study the set together later — see [Studying one chapter or set](#studying-one-chapter-or-set).
3. **Choose cards** shows the list with each card's type (*Vocabulary* or *Sentence*), reading and meaning. Cards you already have in Anki are marked *In Anki* and unticked; **Also tag the unticked cards already in Anki** (on by default) gives them the batch tag too, so the set is complete. Use **Select all / none** and the checkboxes, then **Start branch**.
4. Each card then opens in the same editor as branching: **Add note with brief explanations**, **Analyze fully** first, add its explanations to an existing card, or **Skip**. The card's topic tags are filled in for you and can be edited. New notes get audio straight away.

Each card from **Make flashcards** comes with its reading (romanization for Thai, hiragana for Japanese, pinyin for Mandarin; none for Indonesian, Spanish and French) and a brief explanation written in the source language — both go in that language's Notes — plus the same explanation in English, which goes in the English note.

**Adding a long list quickly:** instead of **Start branch**, click **Add all N with brief explanations** to add every ticked card with the defaults — a new note with its reading, explanations, *Seen in* line, tags and audio, or, for a card already in Anki, its explanations added to that note. Midway through a one-at-a-time session, **Add the remaining N with brief explanations** does the same for the rest. A progress bar shows how far it's got, and **Stop** returns you to one-at-a-time. Fix any card later in Anki, or find it on the Anki page.

**Picking up where you left off:** if you close the list partway through, just open **Send cards to Anki** again on the same result or saved review. Cards you've already added show as *In Anki* and start unticked, so the ones still to do are ticked (anything you skipped is ticked again too).

### Turning a textbook chapter into cards

1. On the study desk, set **Source** to the language and **Explain through** to English.
2. **Upload document**, choose **AI reader**, click **Choose documents** and select all the page photos at once (name them so they sort in page order). Each page is read and added to the text box.
3. Choose **Make flashcards** and **Run task**. Check the cards, remove any you don't want.
4. **Send cards to Anki**, enter the book and chapter (the tag, e.g. *STT22*, is filled in for you), pick the cards, and work through them.

---

## 7. Studying your cards in Anki

### Studying

Click a deck in Anki (e.g. **Polyglot::Thai**) and **Study Now**. Show the answer, then rate how well you knew it — Anki schedules the next review. Click **more** on a card to see the reading, analysis and comments.

### Studying one chapter or set

To study only the cards from one batch — say everything tagged *STT22*:

1. In Anki, **Tools → Create Filtered Deck**.
2. Search: `tag:STT22` — or `tag:STT22 tag:prepositions` for just part of it. Set the limit high (e.g. 1000) and leave *Reschedule cards based on my answers* on.
3. **Build**, then study it like any deck. When you're done, **Empty** the filtered deck and the cards return to their usual decks.

**On your phone (AnkiMobile):** open the parent **Polyglot** deck (so every sub-deck is included), then **Custom Study** and one of the tag options — *Learn new cards with certain tags* for a freshly added chapter, *Review due cards with certain tags* for daily study, or *Preview all cards with certain tags* to go through every card without affecting scheduling — and choose the tag. AnkiMobile builds a temporary filtered deck for you. Alternatively, build the filtered deck on your computer and sync; it appears on the phone.

You can also search for the *Seen in* text, e.g. `"Speak Thai Today, chapter 22"`, but the tag is more reliable: it also covers cards that were already in Anki. In PolyglotBooster's review sessions, type `tag:STT22` into **Narrow with an Anki search** to work through just that set.

### On your phone

Install **AnkiMobile Flashcards** by Ankitects (iPhone/iPad, paid) or **AnkiDroid** (Android, free), sign in with your AnkiWeb account, and sync. (*AnkiApp Flashcards* is an unrelated app that doesn't sync with Anki.)

**Flagging on AnkiMobile:** there's no flag icon by default. In AnkiMobile's review settings, add a button (or a tap/gesture) for **Flag 1 (red)**; tapping it during review flags the card, and the flag syncs to your computer for **Flagged in Anki**. Sync on your computer after working in PolyglotBooster, then sync on your phone — the notes and audio come across. (PolyglotBooster's Anki page itself only works on the computer running Anki.)

### Previewing a card from the Browse window

In Anki's **Browse** window, select a note and press **Ctrl+Shift+P** (or click **Preview**). Space shows the answer. Switch the list from *Notes* to *Cards* to choose a particular direction. Previewing doesn't count as a review.

### Hands-free listening

Anki's **Auto Advance** (deck *Options → Auto Advance*) can play a card's audio, pause, show the answer and play its audio, then move on — like a listening drill. Auto Advance also answers each card, which affects scheduling, so for pure listening create a **filtered deck** (*Tools → Create Filtered Deck*) with *Reschedule cards based on my answers* turned off, and run Auto Advance there.

### Tidying up media

After re-recording audio, old clips remain in Anki's media folder. **Tools → Check Media** lists unused files and can delete them.

---

## 8. Troubleshooting

| Problem | What to do |
|---|---|
| **"Can't reach Anki"** on the Anki page | Make sure Anki is open, AnkiConnect is installed, and the app's address is in `webCorsOriginList` exactly as in [5.3](#53-allow-polyglotbooster-to-connect) (restart Anki after changing it). If you use the installed app, its address is still `https://polyglotbooster-v2.vercel.app`. |
| AnkiConnect config won't save | The list needs commas between items (but not after the last one). |
| Browser asks about "local network" | Click **Allow** — it's how the page reaches Anki on your computer. |
| "Add your … API key" | Add a key for the selected provider in **Settings**, or switch provider. Audio always needs an OpenAI key. |
| **Open in Anki** does nothing | The Anki window probably opened behind your browser — check the taskbar/dock. |
| A card has no audio | Run **Bulk audio**; it records anything missing. |
| A romanization or suggestion looks wrong | Edit it before saving — every generated text is editable. |
| Changes don't appear on your phone | Sync in Anki on the computer, then on the phone. |
| Something's off after an update | Reload the page (the ⟳ button in the installed app). |

---

## 9. Reference

### Languages

| | Study desk | Anki page |
|---|---|---|
| Indonesian, Thai, Japanese, Spanish, French, Mandarin | ✓ | ✓ (analysis, audio, branching) |
| English | ✓ | ✓ (the meaning side of every card) |

### Tags PolyglotBooster adds in Anki

| Tag | Meaning |
|---|---|
| `pb::analyzed::<language>::<task>` | The note has an analysis (and which task made it) |
| `pb::audio::<language>` | The note has a recording for that language |
| `pb::skip::<language>` | You chose *Never analyze this note* — remove the tag to bring it back |
| `pb::branch` | The note was created from another note's analysis (see its *Seen in:* line) |

Search for them in Anki's Browse window, e.g. `tag:pb::branch`.

### Privacy

- The text you study is sent to the AI provider you choose (Anthropic or OpenAI), using your own API key.
- Your API keys (encrypted), voice settings, saved reviews, their audio and your saved-for-later list are stored on the PolyglotBooster server, tied to your Google account.
- Your Anki collection stays on your computer (and AnkiWeb, if you sync). The Anki page talks to it directly from your browser; your cards aren't copied to the PolyglotBooster server.

### Backups

PolyglotBooster's data — the task templates, saved reviews and their audio, the saved-for-later list, settings and encrypted API keys — lives in the app's Vercel storage. A backup copies all of it:

- **On your laptop:** `Documents\PolyglotBooster backups\<date>\`, everything including the encrypted keys. The newest 8 backups are kept.
- **On GitHub:** the private repository **PolyglotBooster-data**, everything except the API keys. Each backup is a commit, so earlier versions (e.g. a template before an edit) can be recovered there.

It runs **every Sunday at 8 PM** (Windows Task Scheduler, task *PolyglotBooster data backup*; if the laptop was off, it runs at the next chance). Each run is logged in `Documents\PolyglotBooster backups\backup.log`. To back up right away, run `npm run backup` in the PolyglotBooster project folder.

To restore — e.g. into a new Vercel storage after moving accounts — run `npm run restore -- "<backup folder>"` to see what would be uploaded, then add `--yes` to upload it. Then re-enter your API keys in Settings if you restored from GitHub.

Keep a copy of the project's `.env.local` file (in a password manager): with it, the code on GitHub and a backup, the whole app can be rebuilt. Your Anki cards are backed up separately, by Anki and AnkiWeb.
