// The audio folder on this computer where textbook recordings are kept: one
// folder per chapter (STT-27) with the downloaded files, prefixed with the
// chapter, and a clips folder with each sentence in book order. Uses the
// browser's File System Access API (Chrome and Edge on a computer); the
// chosen folders are remembered in this browser's IndexedDB.

type PermissionMode = { mode: "read" | "readwrite" };
type PermissionedHandle = FileSystemDirectoryHandle & {
  queryPermission(options: PermissionMode): Promise<PermissionState>;
  requestPermission(options: PermissionMode): Promise<PermissionState>;
  values(): AsyncIterable<FileSystemHandle>;
};

// "library": where chapters are saved; "downloads": where new recordings
// arrive, read (and optionally tidied) by Add from Downloads.
export type FolderKind = "library" | "downloads";

const databaseName = "pb-audio-folders";
const storeName = "handles";

export function canUseFolders() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(database.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function savedFolder(kind: FolderKind) {
  if (!canUseFolders()) return null;
  try {
    return (await withStore<PermissionedHandle | undefined>("readonly", (store) => store.get(kind))) ?? null;
  } catch {
    return null;
  }
}

export async function chooseFolder(kind: FolderKind) {
  const picker = (window as unknown as { showDirectoryPicker(options: { id: string; mode: "readwrite" }): Promise<PermissionedHandle> }).showDirectoryPicker;
  const handle = await picker({ id: `pb-${kind}`, mode: "readwrite" });
  await withStore("readwrite", (store) => store.put(handle, kind));
  return handle;
}

export async function forgetFolder(kind: FolderKind) {
  await withStore("readwrite", (store) => store.delete(kind));
}

// Whether the page may write to the folder, asking if need be. Asking needs
// a click, so call it straight from a button before any slow work.
export async function allowFolder(handle: FileSystemDirectoryHandle) {
  const folder = handle as PermissionedHandle;
  const options: PermissionMode = { mode: "readwrite" };
  if (await folder.queryPermission(options) === "granted") return true;
  return await folder.requestPermission(options) === "granted";
}

// The chapter folder's name from its tag: source::STT::27 → STT-27.
export function chapterName(tag: string) {
  const parts = tag.trim().split("::").filter(Boolean);
  if (parts[0]?.toLowerCase() === "source") parts.shift();
  return safeName(parts.join("-"));
}

// Characters Windows doesn't allow in file names removed, and the length kept
// reasonable.
export function safeName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 90);
}

async function writeFile(folder: FileSystemDirectoryHandle, name: string, data: Blob | Uint8Array) {
  const file = await folder.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(data instanceof Uint8Array ? new Uint8Array(data) : data);
  await writable.close();
}

function fromBase64(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// A recording's voice, from a textbook file name like khwaam-female.mp3.
export function voiceOf(fileName: string) {
  return /female/i.test(fileName) ? "female" : /male/i.test(fileName) ? "male" : "";
}

export type ClipToSave = { order: number; text: string; data: string; voice?: string };

// Saves the chapter: the original files (prefixed with the chapter unless
// they already are) and the clips, named by book order and what's said,
// e.g. STT-27/clips/STT-27-05 ความรักทำให้คนตาบอด.mp3. Returns how many
// files were written.
export async function saveChapter(library: FileSystemDirectoryHandle, chapter: string, originals: File[], clips: ClipToSave[]) {
  const folder = await library.getDirectoryHandle(chapter, { create: true });
  for (const file of originals) {
    const name = file.name.toLowerCase().startsWith(`${chapter.toLowerCase()}-`) ? file.name : `${chapter}-${file.name}`;
    await writeFile(folder, safeName(name), file);
  }
  if (clips.length) {
    const clipFolder = await folder.getDirectoryHandle("clips", { create: true });
    const digits = Math.max(2, String(Math.max(...clips.map((clip) => clip.order))).length);
    for (const clip of clips) {
      const voice = clip.voice === "female" ? " (female)" : "";
      await writeFile(clipFolder, `${safeName(`${chapter}-${String(clip.order).padStart(digits, "0")} ${clip.text}`)}${voice}.mp3`, fromBase64(clip.data));
    }
  }
  return originals.length + clips.length;
}

// MP3s in the folder changed in the last few days, newest first.
export async function recentMp3s(folder: FileSystemDirectoryHandle, days = 7) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const files: File[] = [];
  for await (const entry of (folder as PermissionedHandle).values()) {
    if (entry.kind !== "file" || !/\.mp3$/i.test(entry.name)) continue;
    const file = await (entry as FileSystemFileHandle).getFile();
    if (file.lastModified >= since) files.push(file);
  }
  return files.sort((a, b) => b.lastModified - a.lastModified);
}

export async function removeFiles(folder: FileSystemDirectoryHandle, names: string[]) {
  for (const name of names) await folder.removeEntry(name);
}
