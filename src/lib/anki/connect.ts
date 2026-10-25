// Browser-side client for AnkiConnect (add-on 2055492159), which exposes
// the running Anki desktop app on localhost. Requests go straight from the
// browser to Anki — never through PolyglotBooster's server — so this only
// works on the machine running Anki, and only once this site's origin is in
// AnkiConnect's webCorsOriginList.

import { listeningCss, listeningCssMarker, listeningField, listeningOnlyField, listeningTemplate, listeningTemplateName, noteLanguages, pauseFilename, pauseWav, spokenLanguages, vocabCardTemplates, vocabNoteCss, vocabNoteFields, type NoteLanguage } from "@/lib/anki/noteType";
import { ankiNoteType, audioLanguages, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";

const endpoint = "http://127.0.0.1:8765";

// Anki's red flag: what you set in Anki to send a card back to PolyglotBooster.
export const reviewFlag = 1;

export class AnkiConnectError extends Error {}

async function invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ action, version: 6, params }),
    });
  } catch {
    throw new AnkiConnectError("Can't reach Anki. Make sure Anki is open with AnkiConnect installed, and that this site is in AnkiConnect's webCorsOriginList.");
  }
  const data = await response.json() as { result: T; error: string | null };
  if (data.error) throw new AnkiConnectError(`Anki: ${data.error}`);
  return data.result;
}

type NoteInfo = { noteId: number; tags: string[]; fields: Record<string, { value: string; order: number }>; modelName: string };

function toVocabNote(info: NoteInfo): VocabNote {
  return {
    noteId: info.noteId,
    tags: info.tags,
    fields: Object.fromEntries(Object.entries(info.fields).map(([name, field]) => [name, field.value])),
  };
}

// Escapes a value for use inside a double-quoted Anki search term.
export function ankiSearchValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\*/g, "\\*").replace(/_/g, "\\_");
}

// The deck a card direction belongs in: Polyglot::X for X ↔ English,
// Polyglot::Cross-Language::A-B (in field order) for a language pair, and
// Polyglot::Listening::X for X's listening cards. Undefined for directions
// PolyglotBooster doesn't know (e.g. Balinese), which are left where Anki
// put them.
export function directionDeck(direction: string) {
  const listening = spokenLanguages.find((language) => listeningTemplateName(language) === direction);
  if (listening) return `Polyglot::Listening::${listening}`;
  const sides = direction.split(" → ") as NoteLanguage[];
  if (sides.length !== 2 || !sides.every((side) => noteLanguages.includes(side))) return undefined;
  const [a, b] = [...sides].sort((x, y) => noteLanguages.indexOf(x) - noteLanguages.indexOf(y));
  return a === "English" ? `Polyglot::${b}` : `Polyglot::Cross-Language::${a}-${b}`;
}

async function noteCards(noteId: number) {
  const [info] = await invoke<{ cards: number[] }[]>("notesInfo", { notes: [noteId] });
  return info?.cards ?? [];
}

// A direction's template with each language's second recording after its
// first, wherever the first is shown in the usual way.
function withSecondAudio(side: string) {
  return spokenLanguages.reduce((result, language) => {
    const first = `{{#Audio_${language}}}{{Audio_${language}}}{{/Audio_${language}}}`;
    return result.includes(`{{Audio2_${language}}}`) ? result : result.replace(first, `${first}\n{{#Audio2_${language}}}{{Audio2_${language}}}{{/Audio2_${language}}}`);
  }, side);
}

// Moves newly created cards into their direction's deck. Anki only does this
// itself for directions with a deck override in the note type; others land
// in the deck of the note's existing cards.
async function fileCards(cardIds: number[]) {
  if (!cardIds.length) return;
  const directions = Object.keys(await invoke<Record<string, unknown>>("modelTemplates", { modelName: ankiNoteType }));
  const cards = await invoke<{ cardId: number; ord: number; deckName: string }[]>("cardsInfo", { cards: cardIds });
  const moves = new Map<string, number[]>();
  for (const card of cards) {
    const deck = directionDeck(directions[card.ord]);
    if (deck && deck !== card.deckName) moves.set(deck, [...(moves.get(deck) ?? []), card.cardId]);
  }
  for (const [deck, ids] of moves) {
    // Listening decks are only made once there's a card for them.
    await invoke<number>("createDeck", { deck });
    await invoke<null>("changeDeck", { cards: ids, deck });
  }
}

export const anki = {
  version: () => invoke<number>("version"),

  fieldNames: () => invoke<string[]>("modelFieldNames", { modelName: ankiNoteType }),

  findNotes: (query: string) => invoke<number[]>("findNotes", { query: `note:"${ankiNoteType}" ${query}` }),

  async notesInfo(noteIds: number[]): Promise<VocabNote[]> {
    if (!noteIds.length) return [];
    const infos = await invoke<NoteInfo[]>("notesInfo", { notes: noteIds });
    return infos.filter((info) => info.modelName === ankiNoteType).map(toVocabNote);
  },

  // findNotes + notesInfo, fetched in batches so large result sets don't
  // make one huge request.
  async notesMatching(query: string): Promise<VocabNote[]> {
    const ids = await anki.findNotes(query);
    const notes: VocabNote[] = [];
    for (let start = 0; start < ids.length; start += 250) {
      notes.push(...await anki.notesInfo(ids.slice(start, start + 250)));
    }
    return notes;
  },

  // Note: Anki ignores field updates to a note that's currently open in its
  // Browse window editor — close or move off it first.
  async updateFields(noteId: number, fields: Record<string, string>) {
    // Only language fields (and the Listening switches) can create cards;
    // audio and notes fields can't.
    const languageFields = Object.keys(fields).some((name) => !/^(Audio2?|Notes)_/.test(name));
    const before = languageFields ? await noteCards(noteId) : [];
    await invoke<null>("updateNoteFields", { note: { id: noteId, fields } });
    if (languageFields) await fileCards((await noteCards(noteId)).filter((card) => !before.includes(card)));
  },

  addTags: (noteIds: number[], tags: string[]) =>
    invoke<null>("addTags", { notes: noteIds, tags: tags.join(" ") }),

  // Writes an MP3 into collection.media. Returns the stored filename.
  storeMedia: (filename: string, base64: string) =>
    invoke<string>("storeMediaFile", { filename, data: base64 }),

  modelNames: () => invoke<string[]>("modelNames"),

  // What an existing Polyglot Vocab lacks: languages PolyglotBooster
  // supports that it has no fields for, and whether its listening cards (the
  // Audio2_ fields, the Listening and ListeningOnly fields, the listening
  // templates and the directions' ListeningOnly switch) are missing or older
  // than this version of PolyglotBooster's.
  async missingFeatures(): Promise<{ languages: NoteLanguage[]; listening: "missing" | "outdated" | "current" }> {
    const fields = await anki.fieldNames();
    const languages = noteLanguages.filter((language) => !fields.includes(language));
    if (!fields.includes(listeningField)) return { languages, listening: "missing" };
    const templates = await invoke<Record<string, { Front: string; Back: string }>>("modelTemplates", { modelName: ankiNoteType });
    const outdated = !fields.includes(listeningOnlyField)
      || spokenLanguages.map(listeningTemplate).some((template) => templates[template.Name]?.Front !== template.Front || templates[template.Name]?.Back !== template.Back)
      || Object.entries(templates).some(([name, template]) => directionDeck(name) && !name.endsWith(" listening") && !template.Front.includes(`{{^${listeningOnlyField}}}`));
    return { languages, listening: outdated ? "outdated" : "current" };
  },

  // Brings an existing Polyglot Vocab up to date: adds the missing
  // languages' fields (each next to the existing fields of its kind), the
  // Audio2_ fields and the Listening and ListeningOnly fields, adds every
  // card template it lacks (directions and listening cards), keeps
  // listening-only notes out of the existing directions and gives them the
  // second recording, adds the
  // listening cards' styling, repairs older card backs whose "more"
  // disclosure lost its </summary>, and creates the new languages' decks.
  // Existing notes and cards stay as they are. This changes the note type,
  // so Anki asks for a one-way sync afterwards.
  async upgradeNoteType() {
    const { languages: missing } = await anki.missingFeatures();
    const fieldCount = (await anki.fieldNames()).length;
    for (const language of missing) {
      for (const field of [language, `Audio_${language}`, `Notes_${language}`]) {
        const fields = await anki.fieldNames();
        const prefix = field.startsWith("Audio_") ? "Audio_" : field.startsWith("Notes_") ? "Notes_" : "";
        const sameKind = fields
          .map((name, index) => ({ name, index }))
          .filter(({ name }) => prefix ? name.startsWith(prefix) : !name.includes("_") && name !== "Origin" && name !== listeningField && name !== listeningOnlyField);
        const index = sameKind.length ? sameKind[sameKind.length - 1].index + 1 : fields.length;
        await invoke<null>("modelFieldAdd", { modelName: ankiNoteType, fieldName: field, index });
      }
    }
    // Audio2_ fields go after the existing ones, or at the end, before Listening.
    for (const language of spokenLanguages) {
      const fields = await anki.fieldNames();
      if (fields.includes(`Audio2_${language}`)) continue;
      const listening = fields.indexOf(listeningField);
      await invoke<null>("modelFieldAdd", { modelName: ankiNoteType, fieldName: `Audio2_${language}`, index: listening < 0 ? fields.length : listening });
    }
    for (const field of [listeningField, listeningOnlyField]) {
      const fields = await anki.fieldNames();
      if (!fields.includes(field)) await invoke<null>("modelFieldAdd", { modelName: ankiNoteType, fieldName: field, index: fields.length });
    }

    const existing = await invoke<Record<string, { Front: string; Back: string }>>("modelTemplates", { modelName: ankiNoteType });
    const added: string[] = [];
    for (const template of vocabCardTemplates) {
      if (existing[template.Name]) continue;
      await invoke<null>("modelTemplateAdd", { modelName: ankiNoteType, template });
      added.push(template.Name);
    }

    const updates: Record<string, { Front: string; Back: string }> = {};
    let repaired = 0;
    let refreshed = 0;
    for (const [name, template] of Object.entries(existing)) {
      const correct = vocabCardTemplates.find((candidate) => candidate.Name === name);
      let { Front, Back } = template;
      if (correct && /<summary>more\n<div class="origin">/.test(Back)) {
        Back = correct.Back;
        repaired += 1;
      }
      // The listening cards are PolyglotBooster's own, so they're replaced
      // with the current version.
      if (correct && name.endsWith(" listening")) {
        if (Front !== correct.Front || Back !== correct.Back) refreshed += 1;
        ({ Front, Back } = correct);
      }
      else if (directionDeck(name)) {
        // Earlier test versions switched the directions off with Listening.
        const old = [`{{^${listeningField}}}`, `{{/${listeningField}}}`];
        if (Front.startsWith(old[0]) && Front.endsWith(old[1])) Front = Front.slice(old[0].length, -old[1].length);
        if (!Front.includes(`{{^${listeningOnlyField}}}`)) Front = `{{^${listeningOnlyField}}}${Front}{{/${listeningOnlyField}}}`;
        [Front, Back] = [Front, Back].map((side) => withSecondAudio(side));
      }
      if (Front !== template.Front || Back !== template.Back) updates[name] = { Front, Back };
    }
    if (Object.keys(updates).length) await invoke<null>("updateModelTemplates", { model: { name: ankiNoteType, templates: updates } });

    // The listening styling sits at the end of the note type's CSS, so it's
    // replaced there with the current version.
    const { css } = await invoke<{ css: string }>("modelStyling", { modelName: ankiNoteType });
    const marker = css.indexOf(listeningCssMarker);
    const styled = (marker < 0 ? css : css.slice(0, marker)).trimEnd() + listeningCss;
    if (styled !== css) await invoke<null>("updateModelStyling", { model: { name: ankiNoteType, css: styled } });
    await anki.storeMedia(pauseFilename, pauseWav());

    for (const language of missing) if (language !== "English") await invoke<number>("createDeck", { deck: `Polyglot::${language}` });
    // Adding fields or card types changes the note type's schema, which
    // Anki can only sync one way (it asks to upload); changed card layouts
    // and styling sync normally.
    const oneWaySync = added.length > 0 || (await anki.fieldNames()).length !== fieldCount;
    return { languages: missing, directions: added, repaired, refreshed, oneWaySync };
  },

  // Removes the red flag (Ctrl+1 in Anki, used to mark cards for
  // PolyglotBooster) from a note's cards once it has been dealt with.
  async clearReviewFlag(noteId: number) {
    const cards = await invoke<number[]>("findCards", { query: `nid:${noteId} flag:${reviewFlag}` });
    for (const card of cards) await invoke<unknown>("setSpecificValueOfCard", { card, keys: ["flags"], newValues: [0] });
  },

  // Red-flags every card of these notes (as Ctrl+1 does in Anki), so they
  // come up under "Flagged in Anki".
  async setReviewFlag(noteIds: number[]) {
    for (let start = 0; start < noteIds.length; start += 100) {
      const cards = await invoke<number[]>("findCards", { query: `(${noteIds.slice(start, start + 100).map((id) => `nid:${id}`).join(" OR ")})` });
      for (const card of cards) await invoke<unknown>("setSpecificValueOfCard", { card, keys: ["flags"], newValues: [reviewFlag] });
    }
  },

  // Whether any card of the note has the red flag.
  async hasReviewFlag(noteId: number) {
    return (await invoke<number[]>("findCards", { query: `nid:${noteId} flag:${reviewFlag}` })).length > 0;
  },

  // First-time setup for a profile without the note type: creates Polyglot
  // Vocab and one deck per learning language (where addNote puts new notes).
  async setUpNoteType() {
    await invoke<unknown>("createModel", {
      modelName: ankiNoteType,
      inOrderFields: vocabNoteFields,
      css: vocabNoteCss,
      isCloze: false,
      cardTemplates: vocabCardTemplates,
    });
    await anki.storeMedia(pauseFilename, pauseWav());
    for (const language of audioLanguages) await invoke<number>("createDeck", { deck: `Polyglot::${language}` });
  },

  // Every tag in the collection, for suggestions.
  getTags: () => invoke<string[]>("getTags"),

  // Every note in the collection (any note type) with its tags and fields,
  // in batches — for the Tags page.
  async allNotes(): Promise<(VocabNote & { modelName: string })[]> {
    const ids = await invoke<number[]>("findNotes", { query: "deck:*" });
    const notes: (VocabNote & { modelName: string })[] = [];
    for (let start = 0; start < ids.length; start += 250) {
      const infos = await invoke<NoteInfo[]>("notesInfo", { notes: ids.slice(start, start + 250) });
      notes.push(...infos.map((info) => ({ ...toVocabNote(info), modelName: info.modelName })));
    }
    return notes;
  },

  // Removes these exact tags (not tags nested under them) from the notes.
  removeTags: (noteIds: number[], tags: string[]) =>
    invoke<null>("removeTags", { notes: noteIds, tags: tags.join(" ") }),

  // Drops tags no note uses any more from Anki's tag list.
  clearUnusedTags: () => invoke<null>("clearUnusedTags"),

  // Base64 contents of a file in collection.media, or false if missing.
  retrieveMedia: (filename: string) => invoke<string | false>("retrieveMediaFile", { filename }),

  async addNote(language: AnkiLanguage, fields: Record<string, string>, tags: string[]) {
    // Anki requires a deck here, so use the language's own Polyglot deck (the
    // collection has no "Default" deck); fileCards then moves each card to
    // its direction's deck.
    const noteId = await invoke<number>("addNote", {
      note: { deckName: `Polyglot::${language}`, modelName: ankiNoteType, fields, tags, options: { allowDuplicate: true } },
    });
    await fileCards(await noteCards(noteId));
    return noteId;
  },

  // Opens Anki's own Edit window for a note, for editing by hand.
  openEditor: (noteId: number) => invoke<null>("guiEditNote", { note: noteId }),
};
