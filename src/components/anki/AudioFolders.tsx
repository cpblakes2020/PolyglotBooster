"use client";

import { useCallback, useEffect, useState } from "react";
import { allowFolder, canUseFolders, chooseFolder, forgetFolder, removeFiles, saveChapter, savedFolder, type ClipToSave, type FolderKind } from "@/lib/audio/library";

const tidyKey = "pb-tidy-downloads";

// A recording added for matching, and whether it came from the Downloads folder.
export type AudioSource = { file: File; fromDownloads: boolean };

export type AudioFolderState = {
  supported: boolean;
  library: FileSystemDirectoryHandle | null;
  downloads: FileSystemDirectoryHandle | null;
  // Remove recordings from Downloads once they're saved in the chapter folder.
  tidy: boolean;
  setTidy: (tidy: boolean) => void;
  choose: (kind: FolderKind) => Promise<void>;
  forget: (kind: FolderKind) => Promise<void>;
};

export function useAudioFolders(): AudioFolderState {
  const [supported, setSupported] = useState(false);
  const [library, setLibrary] = useState<FileSystemDirectoryHandle | null>(null);
  const [downloads, setDownloads] = useState<FileSystemDirectoryHandle | null>(null);
  const [tidy, setTidyState] = useState(false);

  useEffect(() => {
    setSupported(canUseFolders());
    void savedFolder("library").then(setLibrary);
    void savedFolder("downloads").then(setDownloads);
    try {
      setTidyState(localStorage.getItem(tidyKey) === "1");
    } catch {
      // Browser storage unavailable: the box starts unticked.
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

  const choose = useCallback(async (kind: FolderKind) => {
    try {
      const handle = await chooseFolder(kind);
      if (kind === "library") setLibrary(handle); else setDownloads(handle);
    } catch {
      // Cancelled.
    }
  }, []);

  const forget = useCallback(async (kind: FolderKind) => {
    await forgetFolder(kind);
    if (kind === "library") setLibrary(null); else setDownloads(null);
  }, []);

  return { supported, library, downloads, tidy, setTidy, choose, forget };
}

// Saves a chapter's recordings and clips to the audio folder, then (if
// chosen) removes the recordings that came from Downloads. Returns a status
// line. Call allowFolder first, from the click.
export async function saveToFolder(folders: AudioFolderState, chapter: string, sources: AudioSource[], clips: ClipToSave[]) {
  if (!folders.library) return "";
  const count = await saveChapter(folders.library, chapter, sources.map((source) => source.file), clips);
  let line = `Saved ${count} files to ${folders.library.name}\\${chapter}.`;
  const fromDownloads = sources.filter((source) => source.fromDownloads).map((source) => source.file.name);
  if (folders.tidy && folders.downloads && fromDownloads.length) {
    try {
      await removeFiles(folders.downloads, fromDownloads);
      line += ` Removed ${fromDownloads.length} from ${folders.downloads.name}.`;
    } catch {
      line += ` They couldn't be removed from ${folders.downloads.name}.`;
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

// The folder settings: where chapters are saved, and optionally the
// Downloads folder new recordings are picked from.
export function AudioFolders({ folders, chapter, disabled }: { folders: AudioFolderState; chapter: string; disabled?: boolean }) {
  if (!folders.supported) {
    return <p className="anki-note">Saving recordings to a folder on this computer needs Chrome or Edge.</p>;
  }
  return (
    <div className="audio-folders">
      <div>
        <span className="anki-note">Audio folder</span>{" "}
        {folders.library
          ? <><b>{folders.library.name}</b>{chapter && <span className="anki-note"> — this chapter goes in {folders.library.name}\{chapter}</span>}{" "}
            <button className="text-button" type="button" disabled={disabled} onClick={() => void folders.choose("library")}>Change</button></>
          : <button className="preview-prompt-button" type="button" disabled={disabled} onClick={() => void folders.choose("library")}>Choose folder…</button>}
      </div>
      <div>
        <span className="anki-note">Downloads folder (optional, for Add from Downloads)</span>{" "}
        {folders.downloads
          ? <><b>{folders.downloads.name}</b>{" "}
            <button className="text-button" type="button" disabled={disabled} onClick={() => void folders.forget("downloads")}>Forget</button>
            <label className="anki-checkbox"><input type="checkbox" checked={folders.tidy} disabled={disabled} onChange={(event) => folders.setTidy(event.target.checked)} /> Remove recordings from {folders.downloads.name} once they&apos;re saved in the chapter folder</label></>
          : <button className="text-button" type="button" disabled={disabled} onClick={() => void folders.choose("downloads")}>Choose…</button>}
      </div>
    </div>
  );
}
