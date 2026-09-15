import { get, put } from "@vercel/blob";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { SavedTaskRun } from "@/lib/reviews";

type StoredAccount = {
  encryptedApiKeys: Partial<Record<LlmProviderId, string>>;
  reviews: SavedTaskRun[];
};

function accountPathname(userId: string) {
  return `lingua/accounts/${userId}.json`;
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

async function readAccount(userId: string): Promise<StoredAccount> {
  const result = await get(accountPathname(userId), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { encryptedApiKeys: {}, reviews: [] };
  const text = await new Response(result.stream).text();
  const parsed = JSON.parse(text) as Partial<StoredAccount>;
  return { encryptedApiKeys: parsed.encryptedApiKeys || {}, reviews: parsed.reviews || [] };
}

async function writeAccount(userId: string, account: StoredAccount): Promise<void> {
  await put(accountPathname(userId), JSON.stringify(account), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function getAccountKeyStatus(userId: string): Promise<Record<LlmProviderId, boolean>> {
  const account = await readAccount(userId);
  return { anthropic: Boolean(account.encryptedApiKeys.anthropic), openai: Boolean(account.encryptedApiKeys.openai) };
}

export async function setAccountApiKey(userId: string, providerId: LlmProviderId, apiKey: string | null): Promise<void> {
  const account = await readAccount(userId);
  if (apiKey) account.encryptedApiKeys[providerId] = encrypt(apiKey);
  else delete account.encryptedApiKeys[providerId];
  await writeAccount(userId, account);
}

export async function getAccountApiKey(userId: string, providerId: LlmProviderId): Promise<string | undefined> {
  const account = await readAccount(userId);
  const encrypted = account.encryptedApiKeys[providerId];
  return encrypted ? decrypt(encrypted) : undefined;
}

const providerLabels: Record<LlmProviderId, string> = { anthropic: "Anthropic", openai: "OpenAI" };

export async function requireAccountApiKey(userId: string, providerId: LlmProviderId): Promise<string> {
  const apiKey = await getAccountApiKey(userId, providerId);
  if (!apiKey) throw new Error(`Add your ${providerLabels[providerId]} API key in Settings before running a task.`);
  return apiKey;
}

export async function getAccountReviews(userId: string): Promise<SavedTaskRun[]> {
  const account = await readAccount(userId);
  return account.reviews;
}

export async function setAccountReviews(userId: string, reviews: SavedTaskRun[]): Promise<void> {
  const account = await readAccount(userId);
  account.reviews = reviews;
  await writeAccount(userId, account);
}
