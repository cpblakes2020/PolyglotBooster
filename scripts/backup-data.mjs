// Backs up PolyglotBooster's data from Vercel Blob storage: task templates,
// saved reviews and their audio, the saved-for-later list, settings and
// the (encrypted) API keys.
//
// - A dated copy of everything goes to Documents\PolyglotBooster backups\
//   (the newest 8 are kept).
// - Everything except the API keys is mirrored into a clone of the private
//   GitHub repository PolyglotBooster-data, committed and pushed, so each
//   backup is a version there too.
//
// Run with `npm run backup`; Windows Task Scheduler runs it weekly. Reads
// BLOB_READ_WRITE_TOKEN from .env.local. Restore with scripts/restore-data.mjs.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { list } from "@vercel/blob";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupRoot = path.join(os.homedir(), "Documents", "PolyglotBooster backups");
const githubRepo = "https://github.com/cpblakes2020/PolyglotBooster-data.git";
const mirrorDir = path.join(backupRoot, "PolyglotBooster-data");
const keepDated = 8;

// API keys stay out of GitHub: they're useless without ACCOUNT_DATA_KEY and
// can simply be entered again in Settings.
const keepOffGitHub = (pathname) => /\/keys\//.test(pathname);

const readme = `# PolyglotBooster data

Weekly backups of PolyglotBooster's data from its Vercel Blob storage, written
by \`npm run backup\` in the PolyglotBooster project. Each backup is a commit.

- \`lingua/templates.json\` — the task templates
- \`lingua/accounts/<id>/reviews.json\` — saved reviews (with follow-ups and flashcards)
- \`lingua/accounts/<id>/audio/\` — the reviews' recordings
- \`lingua/accounts/<id>/later/\` — the "Save for Anki later" list
- \`manifest.json\` — every file's size and date

The encrypted API keys are kept out of this repository (re-enter them in
Settings after a restore). To restore into a Vercel Blob store, run
\`npm run restore -- "<path to this folder>" --yes\` in the PolyglotBooster project.
`;

function loadEnv() {
  const envFile = path.join(projectRoot, ".env.local");
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is missing from .env.local.");
}

async function allBlobs() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

// Downloads one file, retrying until its size matches the store's record
// (a CDN can briefly serve an older copy of a file that was just rewritten).
async function download(blob) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(`${blob.downloadUrl}${blob.downloadUrl.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
    if (response.ok) {
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length === blob.size) return data;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
  }
  throw new Error(`${blob.pathname} couldn't be downloaded intact.`);
}

function git(args, cwd = mirrorDir) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// Makes the mirror folder hold exactly the given files (plus .git and README).
function mirror(files) {
  const wanted = new Set(files.map((file) => file.pathname));
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
  for (const full of walk(mirrorDir).filter((file) => !file.includes(`${path.sep}.git${path.sep}`))) {
    const relative = path.relative(mirrorDir, full).split(path.sep).join("/");
    if (relative !== "README.md" && relative !== "manifest.json" && !wanted.has(relative)) rmSync(full);
  }
  for (const file of files) {
    const target = path.join(mirrorDir, ...file.pathname.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file.localPath, target);
  }
}

async function main() {
  loadEnv();
  const stamp = new Date().toISOString().slice(0, 10);
  const datedDir = path.join(backupRoot, stamp);
  console.log(`[${new Date().toLocaleString()}] Backing up to ${datedDir}`);

  const blobs = await allBlobs();
  const files = [];
  for (const blob of blobs) {
    const data = await download(blob);
    const localPath = path.join(datedDir, ...blob.pathname.split("/"));
    mkdirSync(path.dirname(localPath), { recursive: true });
    writeFileSync(localPath, data);
    files.push({ pathname: blob.pathname, size: blob.size, uploadedAt: blob.uploadedAt, contentType: blob.contentType, localPath });
  }
  const manifest = files.map(({ localPath: _localPath, ...file }) => file);
  writeFileSync(path.join(datedDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const totalMb = (files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2);
  console.log(`  ${files.length} files, ${totalMb} MB`);

  // Keep the newest dated copies.
  const dated = readdirSync(backupRoot).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort();
  for (const old of dated.slice(0, Math.max(0, dated.length - keepDated))) {
    rmSync(path.join(backupRoot, old), { recursive: true, force: true });
    console.log(`  removed the old copy ${old}`);
  }

  // GitHub copy.
  if (!existsSync(path.join(mirrorDir, ".git"))) execFileSync("git", ["clone", githubRepo, mirrorDir], { stdio: "inherit" });
  // A brand-new (empty) repository has nothing to pull yet.
  const hasHistory = (() => { try { git(["rev-parse", "--verify", "HEAD"]); return true; } catch { return false; } })();
  if (hasHistory) git(["pull", "--ff-only"]);
  if (!existsSync(path.join(mirrorDir, "README.md"))) writeFileSync(path.join(mirrorDir, "README.md"), readme);
  const forGitHub = files.filter((file) => !keepOffGitHub(file.pathname));
  mirror(forGitHub);
  writeFileSync(path.join(mirrorDir, "manifest.json"), JSON.stringify(manifest.filter((file) => !keepOffGitHub(file.pathname)), null, 2));
  git(["add", "-A"]);
  if (git(["status", "--porcelain"])) {
    git(["commit", "-m", `Backup ${stamp}`]);
    git(["push", "-u", "origin", "HEAD"]);
    console.log(`  GitHub: committed and pushed (${forGitHub.length} files)`);
  } else {
    console.log("  GitHub: nothing changed since the last backup");
  }
  console.log("Backup complete.");
}

main().catch((error) => {
  console.error(`Backup FAILED: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
