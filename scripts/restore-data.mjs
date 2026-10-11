// Restores a PolyglotBooster backup (a dated folder from
// Documents\PolyglotBooster backups, or the PolyglotBooster-data clone)
// into the Vercel Blob store named by BLOB_READ_WRITE_TOKEN in .env.local —
// e.g. a new store after moving to another Vercel account.
//
//   npm run restore -- "<backup folder>"          lists what would be uploaded
//   npm run restore -- "<backup folder>" --yes    uploads, overwriting
//
// Links to audio inside the saved reviews point at the store they were
// saved in, so they're rewritten to the store being restored into.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [folder, confirm] = process.argv.slice(2);

for (const line of readFileSync(path.join(projectRoot, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

if (!folder || !statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('Give the backup folder, e.g. npm run restore -- "C:\\Users\\you\\Documents\\PolyglotBooster backups\\2026-10-11"');
  process.exit(1);
}

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  if (name === ".git") return [];
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const files = walk(folder)
  .map((full) => ({ full, pathname: path.relative(folder, full).split(path.sep).join("/") }))
  .filter((file) => file.pathname.startsWith("lingua/"));

const contentType = (pathname) => pathname.endsWith(".json") ? "application/json" : pathname.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream";
const storeUrl = /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//g;

console.log(`${files.length} files in ${folder}`);
if (confirm !== "--yes") {
  for (const file of files) console.log(`  ${file.pathname}`);
  console.log('Nothing uploaded. Add --yes to upload them, overwriting what the store has at those paths.');
  process.exit(0);
}

// Audio first, so the store's address is known when the reviews are written.
files.sort((a, b) => Number(a.pathname.endsWith(".json")) - Number(b.pathname.endsWith(".json")));
let newStoreBase = "";
for (const file of files) {
  let data = readFileSync(file.full);
  if (file.pathname.endsWith(".json") && newStoreBase) data = Buffer.from(data.toString("utf8").replace(storeUrl, newStoreBase));
  const result = await put(file.pathname, data, {
    access: "public",
    contentType: contentType(file.pathname),
    addRandomSuffix: false,
    allowOverwrite: true,
    ...(file.pathname.endsWith(".json") ? { cacheControlMaxAge: 60 } : {}),
  });
  newStoreBase ||= result.url.slice(0, result.url.indexOf("/lingua/") + 1);
  console.log(`  uploaded ${file.pathname}`);
}
console.log("Restore complete.");
