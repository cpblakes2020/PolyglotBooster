declare module "anki-apkg-export" {
  export default class AnkiExport {
    constructor(deckName: string);
    addMedia(filename: string, data: Buffer): void;
    addCard(front: string, back: string, options?: { tags?: string[] }): void;
    save(): Promise<Buffer>;
  }
}
