import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { del, list, put } from "@vercel/blob";
import { readJsonBlob, writeJsonBlob } from "@/lib/storage/blob-json";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { SavedTaskRun } from "@/lib/reviews";
import type { Language } from "@/lib/types";
import type { VoiceSetting } from "@/lib/voices";

type StoredKey = { encrypted?: string };

export type AccountSettings = {
  voices?: Partial<Record<Language, VoiceSetting>>;
};

function keyPathname(userId: string, providerId: LlmProviderId) {
  return `lingua/accounts/${userId}/keys/${providerId}.json`;
}

function reviewsPathname(userId: string) {
  return `lingua/accounts/${userId}/reviews.json`;
}

function settingsPathname(userId: string) {
  return `lingua/accounts/${userId}/settings.json`;
}

// One file per saved phrase, written once and never overwritten: a stale
// cached copy can't drop an entry (as rewriting one shared list could, when
// two phrases are saved within the cache's minute), and the directory
// listing that finds them isn't cached.
function laterPrefix(userId: string) {
  return `lingua/accounts/${userId}/later/`;
}

// A phrase saved from the study desk or Anki page (on any device) to be
// added to Anki later, on the computer running Anki.
export type LaterItem = {
  id: string;
  text: string;
  language: Language;
  // What it was looked up in (the analysis and follow-ups), and where it
  // was seen, for the note's "Seen in" line.
  context: string;
  source: string;
  createdAt: string;
};

export async function getLaterItems(userId: string): Promise<LaterItem[]> {
  const { blobs } = await list({ prefix: laterPrefix(userId) });
  const items = await Promise.all(blobs.map(async (blob) => {
    const response = await fetch(blob.url);
    return response.ok ? await response.json() as LaterItem : null;
  }));
  return items.filter((item): item is LaterItem => item !== null).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addLaterItem(userId: string, item: Omit<LaterItem, "id" | "createdAt">): Promise<LaterItem[]> {
  const items = await getLaterItems(userId);
  // Saving the same phrase twice keeps one entry, with the newer context.
  const repeats = items.filter((existing) => existing.text === item.text && existing.language === item.language);
  const saved: LaterItem = { ...item, id: randomUUID(), createdAt: new Date().toISOString() };
  await put(`${laterPrefix(userId)}${saved.id}.json`, JSON.stringify(saved), { access: "public", contentType: "application/json", addRandomSuffix: false });
  if (repeats.length) await del(repeats.map((repeat) => `${laterPrefix(userId)}${repeat.id}.json`));
  return [...items.filter((existing) => !repeats.includes(existing)), saved];
}

export async function removeLaterItems(userId: string, ids: string[]): Promise<LaterItem[]> {
  await del(ids.map((id) => `${laterPrefix(userId)}${id}.json`));
  return getLaterItems(userId);
}

function audioPathname(userId: string, id: string) {
  return `lingua/accounts/${userId}/audio/${id}.mp3`;
}

function encryptionKey() {
  const secret = process.env.ACCOUNT_DATA_KEY;
  if (!secret) throw new Error("Account storage is not configured.");
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) throw new Error("ACCOUNT_DATA_KEY must be a base64-encoded 32-byte key.");
  return key;
}

function encrypt(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, ciphertext, authTag].map((buffer) => buffer.toString("base64url")).join(".");
}

function decrypt(payload: string) {
  const [ivPart, ciphertextPart, tagPart] = payload.split(".");
  if (!ivPart || !ciphertextPart || !tagPart) throw new Error("Stored API key is corrupted.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
}

export async function getAccountKeyStatus(userId: string): Promise<Record<LlmProviderId, boolean>> {
  const [anthropic, openai] = await Promise.all([
    readJsonBlob<StoredKey>(keyPathname(userId, "anthropic"), {}),
    readJsonBlob<StoredKey>(keyPathname(userId, "openai"), {}),
  ]);
  return { anthropic: Boolean(anthropic.encrypted), openai: Boolean(openai.encrypted) };
}

export async function setAccountApiKey(userId: string, providerId: LlmProviderId, apiKey: string | null): Promise<void> {
  await writeJsonBlob(keyPathname(userId, providerId), apiKey ? { encrypted: encrypt(apiKey) } : {});
}

export async function getAccountApiKey(userId: string, providerId: LlmProviderId): Promise<string | undefined> {
  const stored = await readJsonBlob<StoredKey>(keyPathname(userId, providerId), {});
  return stored.encrypted ? decrypt(stored.encrypted) : undefined;
}

const providerLabels: Record<LlmProviderId, string> = { anthropic: "Anthropic", openai: "OpenAI" };

export async function requireAccountApiKey(userId: string, providerId: LlmProviderId): Promise<string> {
  const apiKey = await getAccountApiKey(userId, providerId);
  if (!apiKey) throw new Error(`Add your ${providerLabels[providerId]} API key in Settings before running a task.`);
  return apiKey;
}

export async function saveAccountAudio(userId: string, audio: Buffer): Promise<string> {
  const result = await put(audioPathname(userId, randomUUID()), audio, {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: false,
  });
  return result.url;
}

export async function getAccountSettings(userId: string): Promise<AccountSettings> {
  return readJsonBlob<AccountSettings>(settingsPathname(userId), {});
}

export async function updateAccountSettings(userId: string, updates: Partial<AccountSettings>): Promise<AccountSettings> {
  const next = { ...(await getAccountSettings(userId)), ...updates };
  await writeJsonBlob(settingsPathname(userId), next);
  return next;
}

export async function getAccountReviews(userId: string): Promise<SavedTaskRun[]> {
  return readJsonBlob<SavedTaskRun[]>(reviewsPathname(userId), []);
}

export async function addAccountReview(userId: string, review: SavedTaskRun): Promise<SavedTaskRun[]> {
  const reviews = await getAccountReviews(userId);
  const next = [review, ...reviews.filter((run) => run.taskRunId !== review.taskRunId)];
  await writeJsonBlob(reviewsPathname(userId), next);
  return next;
}

export async function updateAccountReview(userId: string, taskRunId: string, updates: Partial<SavedTaskRun>): Promise<SavedTaskRun[]> {
  const reviews = await getAccountReviews(userId);
  const next = reviews.map((run) => run.taskRunId === taskRunId ? { ...run, ...updates, taskRunId } : run);
  await writeJsonBlob(reviewsPathname(userId), next);
  return next;
}

export async function deleteAccountReview(userId: string, taskRunId: string): Promise<SavedTaskRun[]> {
  const reviews = await getAccountReviews(userId);
  const next = reviews.filter((run) => run.taskRunId !== taskRunId);
  await writeJsonBlob(reviewsPathname(userId), next);
  return next;
}

export async function mergeAccountReviews(userId: string, incoming: SavedTaskRun[]): Promise<{ merged: SavedTaskRun[]; added: number; skipped: number }> {
  const existing = await getAccountReviews(userId);
  const existingIds = new Set(existing.map((run) => run.taskRunId));
  const newRuns = incoming.filter((run) => !existingIds.has(run.taskRunId));
  const merged = [...newRuns, ...existing];
  await writeJsonBlob(reviewsPathname(userId), merged);
  return { merged, added: newRuns.length, skipped: incoming.length - newRuns.length };
}
