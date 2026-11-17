import { del, list } from "@vercel/blob";

// Recordings uploaded on the study desk, so their transcript can be made on
// any device and the recording itself used on the computer running Anki.
// The store only allows public files, so each one gets a long random suffix
// on its name (it can't be guessed or listed from outside) and is deleted
// once used, or after a day if it was never saved.

export function recordingsPrefix(userId: string) {
  return `lingua/accounts/${userId}/recordings/`;
}

// OpenAI's limit for one transcription request.
export const maxRecordingBytes = 25 * 1024 * 1024;

export const recordingContentTypes = ["audio/*", "video/mp4", "video/quicktime"];

const unsavedLifetimeMs = 24 * 60 * 60 * 1000;

// The URL, if it's one of this account's recordings in this app's store.
export function ownRecordingUrl(userId: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname).replace(/^\//, "");
    if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com") || !pathname.startsWith(recordingsPrefix(userId))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function deleteRecordings(urls: string[]) {
  if (urls.length) await del(urls);
}

// Deletes recordings over a day old that aren't kept in a saved item. Listing
// counts toward Blob's monthly allowance of advanced operations, so this runs
// only when a recording is transcribed.
export async function sweepRecordings(userId: string, keep: Set<string>) {
  const { blobs } = await list({ prefix: recordingsPrefix(userId) });
  const old = blobs.filter((blob) => Date.now() - new Date(blob.uploadedAt).getTime() > unsavedLifetimeMs && !keep.has(blob.url));
  await deleteRecordings(old.map((blob) => blob.url));
}
