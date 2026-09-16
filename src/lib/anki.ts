import AnkiExport from "anki-apkg-export";
import type { SavedTaskRun } from "@/lib/reviews";

const audioFilename = "recording.mp3";

export async function buildAnkiPackage(run: SavedTaskRun): Promise<Buffer> {
  const apkg = new AnkiExport(`Polyglot Booster::${run.sourceLanguage}::${run.userLanguage}`);

  let audioTag = "";
  if (run.audio) {
    const response = await fetch(run.audio.url);
    if (response.ok) {
      apkg.addMedia(audioFilename, Buffer.from(await response.arrayBuffer()));
      audioTag = ` [sound:${audioFilename}]`;
    }
  }

  const cards = run.flashcards?.length ? run.flashcards : [{ front: run.sourceText, back: run.result, tags: [] as string[] }];
  const baseTags = [`polyglot::${run.sourceLanguage.toLowerCase()}-${run.userLanguage.toLowerCase()}`, `template::${run.promptTemplateId}`];

  for (const card of cards) {
    const tags = [...new Set([...baseTags, ...card.tags])];
    // Audio is a reading of the analyzed-language text, so it rides with
    // whichever field holds that text on each direction of the card.
    apkg.addCard(`${card.front}${audioTag}`, card.back, { tags });
    apkg.addCard(card.back, `${card.front}${audioTag}`, { tags });
  }

  return apkg.save();
}
