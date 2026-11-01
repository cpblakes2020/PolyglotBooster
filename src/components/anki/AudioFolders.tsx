"use client";

import { useCallback, useEffect, useState } from "react";
import { allowFolder, canUseFolders, chooseFolder, forgetFolder, removeFiles, saveChapter, savedFolder, type ClipToSave, type FolderKind } from "@/lib/audio/library";

const tidyKey = "pb-tidy-downloads";
const pathKey = (kind: FolderKind) => `pb-folder-path-${kind}`;

// A recording added for matching, and whether it came from the new
// recordings folder.
export type AudioSource = { file: File; fromDownloads: boolean };

export type AudioFolderState = {
  supported: boolean;
  library: FileSystemDirectoryHandle | null;
  // The folder new recordings are downloaded to ("downloads": Chrome won't
  // let pages open the real Downloads folder, so it's one you make).
  downloads: FileSystemDirectoryHandle | null;
  // Remove recordings from that folder once they're saved in the chapter folder.
  tidy: boolean;
  setTidy: (tidy: boolean) => void;
  choose: (kind: FolderKind) => Promise<void>;
  forget: (kind: FolderKind) => Promise<void>;
  // The full path typed for each folder: the browser only gives the page a
  // folder's name, never where it is.
  paths: Record<FolderKind, string>;
  setPath: (kind: FolderKind, path: string) => void;
};

// How a folder is shown: the full path typed for it, or else its name.
export function folderLabel(folders: AudioFolderState, kind: FolderKind) {
  const handle = kind === "library" ? folders.library : folders.downloads;
  return folders.paths[kind].trim() || handle?.name || "";
}

export function useAudioFolders(): AudioFolderState {
  const [supported, setSupported] = useState(false);
  const [library, setLibrary] = useState<FileSystemDirectoryHandle | null>(null);
  const [downloads, setDownloads] = useState<FileSystemDirectoryHandle | null>(null);
  const [tidy, setTidyState] = useState(false);
  const [paths, setPaths] = useState<Record<FolderKind, string>>({ library: "", downloads: "" });

  useEffect(() => {
    setSupported(canUseFolders());
    void savedFolder("library").then(setLibrary);
    void savedFolder("downloads").then(setDownloads);
    try {
      setTidyState(localStorage.getItem(tidyKey) === "1");
      setPaths({ library: localStorage.getItem(pathKey("library")) || "", downloads: localStorage.getItem(pathKey("downloads")) || "" });
    } catch {
      // Browser storage unavailable: the box starts unticked and no paths show.
    }
  }, []);

  const setTidy = useCallback((value: boolean) => {
    setTidyState(value);
    try {
      localStorage.setItem(tidyKey, value ? "1" : "0");
    } catch {
      // Not remembered, but still applies on this page.
    }
  }, []);

  const setPath = useCallback((kind: FolderKind, path: string) => {
    setPaths((current) => ({ ...current, [kind]: path }));
    try {
      localStorage.setItem(pathKey(kind), path);
    } catch {
      // Shown on this page only.
    }
  }, []);

  const choose = useCallback(async (kind: FolderKind) => {
    try {
      const handle = await chooseFolder(kind);
      if (kind === "library") setLibrary(handle); else setDownloads(handle);
      // A different folder: the path typed for the old one no longer applies.
      setPath(kind, "");
    } catch {
      // Cancelled, or a folder Chrome won't open.
    }
  }, [setPath]);

  const forget = useCallback(async (kind: FolderKind) => {
    await forgetFolder(kind);
    if (kind === "library") setLibrary(null); else setDownloads(null);
    setPath(kind, "");
  }, [setPath]);

  return { supported, library, downloads, tidy, setTidy, choose, forget, paths, setPath };
}

// Saves a chapter's recordings and clips to the audio folder, then (if
// chosen) removes the recordings that came from the new recordings folder.
// Returns a status line. Call allowFolders first, from the click.
export async function saveToFolder(folders: AudioFolderState, chapter: string, sources: AudioSource[], clips: ClipToSave[]) {
  if (!folders.library) return "";
  const count = await saveChapter(folders.library, chapter, sources.map((source) => source.file), clips);
  let line = `Saved ${count} files to ${folderLabel(folders, "library")}\\${chapter}.`;
  const fromDownloads = sources.filter((source) => source.fromDownloads).map((source) => source.file.name);
  if (folders.tidy && folders.downloads && fromDownloads.length) {
    try {
      await removeFiles(folders.downloads, fromDownloads);
      line += ` Removed ${fromDownloads.length} from ${folderLabel(folders, "downloads")}.`;
    } catch {
      line += ` They couldn't be removed from ${folderLabel(folders, "downloads")}.`;
    }
  }
  return line;
}

// Asks (from a click) for permission to write to the folders that will be
// used. False if the audio folder was refused.
export async function allowFolders(folders: AudioFolderState, withDownloads: boolean) {
  if (!folders.library) return true;
  if (!await allowFolder(folders.library)) return false;
  if (withDownloads && folders.tidy && folders.downloads) await allowFolder(folders.downloads);
  return true;
}

// A chosen folder: the full path typed for it, or its name and a box to
// type the path, which the browser can't tell the page.
function FolderRow({ folders, kind, disabled }: { folders: AudioFolderState; kind: FolderKind; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const handle = kind === "library" ? folders.library : folders.downloads;
  if (!handle) return null;
  if (editing || !folders.paths[kind]) {
    return (
      <span className="audio-folder-path">
        <b>{handle.name}</b>
        <input value={folders.paths[kind]} disabled={disabled} placeholder={`Paste its full path to show it here, e.g. C:\\Users\\…\\${handle.name}`} onChange={(event) => folders.setPath(kind, event.target.value)} onBlur={() => setEditing(false)} />
      </span>
    );
  }
  return <><b>{folders.paths[kind]}</b> <button className="text-button" type="button" disabled={disabled} onClick={() => setEditing(true)}>Edit path</button></>;
}

// The folder settings: where chapters are saved, and optionally the folder
// new recordings are downloaded to.
export function AudioFolders({ folders, chapter, disabled }: { folders: AudioFolderState; chapter: string; disabled?: boolean }) {
  if (!folders.supported) {
    return <p className="anki-note">Saving recordings to a folder on this computer needs Chrome or Edge.</p>;
  }
  return (
    <div className="audio-folders">
      <div>
        <span className="anki-note">Audio folder</span>{" "}
        {folders.library
          ? <><FolderRow folders={folders} kind="library" disabled={disabled} />{chapter && <span className="anki-note"> — this chapter goes in {folderLabel(folders, "library")}\{chapter}</span>}{" "}
            <button className="text-button" type="button" disabled={disabled} onClick={() => void folders.choose("library")}>Change</button></>
          : <button className="preview-prompt-button" type="button" disabled={disabled} onClick={() => void folders.choose("library")}>Choose folder…</button>}
      </div>
      <div>
        <span className="anki-note">New recordings folder (optional, for Add from folder)</span>{" "}
        {folders.downloads
          ? <><FolderRow folders={folders} kind="downloads" disabled={disabled} />{" "}
            <button className="text-button" type="button" disabled={disabled} onClick={() => void folders.forget("downloads")}>Forget</button>
            <label className="anki-checkbox"><input type="checkbox" checked={folders.tidy} disabled={disabled} onChange={(event) => folders.setTidy(event.target.checked)} /> Remove recordings from it once they&apos;re saved in the chapter folder</label></>
          : <>
            <button className="text-button" type="button" disabled={disabled} onClick={() => void folders.choose("downloads")}>Choose…</button>
            <span className="anki-note"> Chrome won&apos;t let web pages open Downloads, Desktop or Documents themselves, so make a folder for new recordings (e.g. <i>Downloads\New audio</i>), save the book&apos;s downloads there, and choose that.</span>
          </>}
      </div>
    </div>
  );
}
