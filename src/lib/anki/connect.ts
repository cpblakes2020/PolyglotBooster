// Browser-side client for AnkiConnect (add-on 2055492159), which exposes
// the running Anki desktop app on localhost. Requests go straight from the
// browser to Anki — never through PolyglotBooster's server — so this only
// works on the machine running Anki, and only once this site's origin is in
// AnkiConnect's webCorsOriginList.

import { ankiNoteType, type AnkiLanguage, type VocabNote } from "@/lib/anki/vocab";

const endpoint = "http://127.0.0.1:8765";

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
  updateFields: (noteId: number, fields: Record<string, string>) =>
    invoke<null>("updateNoteFields", { note: { id: noteId, fields } }),

  addTags: (noteIds: number[], tags: string[]) =>
    invoke<null>("addTags", { notes: noteIds, tags: tags.join(" ") }),

  // Writes an MP3 into collection.media. Returns the stored filename.
  storeMedia: (filename: string, base64: string) =>
    invoke<string>("storeMediaFile", { filename, data: base64 }),

  // Every tag in the collection, for suggestions.
  getTags: () => invoke<string[]>("getTags"),

  // Base64 contents of a file in collection.media, or false if missing.
  retrieveMedia: (filename: string) => invoke<string | false>("retrieveMediaFile", { filename }),

  addNote: (language: AnkiLanguage, fields: Record<string, string>, tags: string[]) =>
    invoke<number>("addNote", {
      // Deck routing comes from the note type's per-template deck overrides.
      // Anki still requires a deck here, so use the language's own Polyglot
      // deck (the collection has no "Default" deck).
      note: { deckName: `Polyglot::${language}`, modelName: ankiNoteType, fields, tags, options: { allowDuplicate: true } },
    }),

  // Opens Anki's own Browse window on a note, for editing by hand.
  openInBrowser: (noteId: number) => invoke<number[]>("guiBrowse", { query: `nid:${noteId}` }),
};
