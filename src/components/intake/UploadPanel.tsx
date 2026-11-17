"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
import { heicToJpeg, isHeicFile } from "@/lib/heic";
import { isUsableOcrResult, recognizeImageText } from "@/lib/ocr";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { Language } from "@/lib/types";

type UploadPanelProps = {
  // append: add to the text already in the box (e.g. the next page of a
  // chapter) instead of replacing it. last: the final file of the batch.
  onTextExtracted: (text: string, filename: string, append: boolean, last: boolean) => void;
  // A recording that was transcribed, kept in the account so Save for
  // listening can save it with the text (called after onTextExtracted).
  onRecording: (recording: { url: string; filename: string }) => void;
  hasText: boolean;
  providerId: LlmProviderId;
  sourceLanguage: Language;
};

const imageTypes = new Set(["image/jpeg", "image/png"]);
const acceptedTypes = ".html,.htm,.txt,.xml,.docx,.pdf,.jpg,.jpeg,.png,.heic,.heif,.mp3,.m4a,.mp4,.mov,.wav,.aac,text/html,text/plain,text/xml,application/xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/jpeg,image/png,image/heic,image/heif,audio/*,video/mp4,video/quicktime";

// Recordings (or a video's sound) are uploaded to the account and transcribed there.
const audioExtensions = new Set(["mp3", "m4a", "mp4", "mov", "wav", "aac"]);
const audioTypeByExtension: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "video/mp4", mov: "video/quicktime", wav: "audio/wav", aac: "audio/aac" };
const extensionOf = (file: File) => file.name.split(".").pop()?.toLowerCase() || "";
const isRecording = (file: File) => file.type.startsWith("audio/") || file.type === "video/mp4" || file.type === "video/quicktime" || audioExtensions.has(extensionOf(file));
// OpenAI's limit for one transcription, and the longest a transcript fits the
// 12,000-character text box.
const maxRecordingBytes = 25 * 1024 * 1024;
const longestRecordingMinutes = 15;

// How long a recording is, if the browser can tell.
function recordingSeconds(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (seconds: number | null) => { URL.revokeObjectURL(url); resolve(seconds); };
    const timer = window.setTimeout(() => done(null), 8000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => { window.clearTimeout(timer); done(Number.isFinite(audio.duration) ? audio.duration : null); };
    audio.onerror = () => { window.clearTimeout(timer); done(null); };
    audio.src = url;
  });
}

// Chrome and Edge's file picker, which reopens in the folder last used for
// the same id. Not in TypeScript's DOM types yet.
type OpenFilePicker = (options: {
  id?: string;
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ getFile: () => Promise<File> }[]>;

const pickerTypes: { description: string; accept: Record<string, string[]> }[] = [{
  description: "Documents and photos",
  accept: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/heic": [".heic", ".heif"],
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "text/html": [".html", ".htm"],
    "text/plain": [".txt"],
    "text/xml": [".xml"],
  },
}, {
  description: "Recordings",
  accept: {
    "audio/*": [".mp3", ".m4a", ".wav", ".aac"],
    "video/mp4": [".mp4"],
    "video/quicktime": [".mov"],
  },
}];

// "device": read photos in the browser first (free), falling back to the AI
// reader only when little text is found. "ai": always use the AI reader —
// better for photos mixing scripts, e.g. Thai with romanization and English.
type PhotoReader = "device" | "ai";
const photoReaderKey = "lingua:photoReader";

export function UploadPanel({ onTextExtracted, onRecording, hasText, providerId, sourceLanguage }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [photoReader, setPhotoReader] = useState<PhotoReader>("device");
  const [append, setAppend] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(photoReaderKey) === "ai") setPhotoReader("ai");
    } catch {
      // Storage unavailable; keep the default.
    }
  }, []);

  function choosePhotoReader(reader: PhotoReader) {
    setPhotoReader(reader);
    try {
      window.localStorage.setItem(photoReaderKey, reader);
    } catch {
      // Storage unavailable; the choice lasts for this visit.
    }
  }

  async function uploadToServer(file: File, appendThis: boolean, last: boolean) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("language", sourceLanguage);
    const response = await fetch("/api/uploads", { method: "POST", headers: { "x-polyglot-provider": providerId }, body: formData });
    const raw = await response.text();
    let result: { error?: string; text?: string; filename?: string; pageCount?: number };
    try {
      result = JSON.parse(raw);
    } catch {
      throw new Error(response.ok ? "The server returned an unexpected response." : `Server error (${response.status}). The document may be too large or took too long to process.`);
    }
    if (!response.ok || !result.text || !result.filename) throw new Error(result.error || "The document could not be read.");
    onTextExtracted(result.text, result.filename, appendThis, last);
    setStatus(`${result.filename} loaded${result.pageCount && result.pageCount > 1 ? ` · ${result.pageCount} pages` : ""}`);
  }

  // A recording: uploaded straight to the account's storage (so it isn't held
  // to the 4 MB limit on documents), transcribed there, and kept for Save for
  // listening. Unsaved recordings are deleted after a day.
  async function uploadRecording(file: File, appendThis: boolean, last: boolean, prefix: string) {
    if (file.size > maxRecordingBytes) throw new Error(`${file.name} is over 25 MB. Try a shorter recording.`);
    const seconds = await recordingSeconds(file);
    if (seconds && seconds > longestRecordingMinutes * 60) throw new Error(`${file.name} is over ${longestRecordingMinutes} minutes, more than the text box holds. Try a shorter recording.`);
    const folder = await fetch("/api/recordings/upload");
    const { prefix: folderPrefix, error } = await folder.json() as { prefix?: string; error?: string };
    if (!folder.ok || !folderPrefix) throw new Error(error || "The recording couldn't be uploaded.");
    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "-") || "recording.m4a";
    setStatus(`${prefix}Uploading ${file.name}...`);
    const blob = await upload(`${folderPrefix}${safeName}`, file, {
      access: "public",
      handleUploadUrl: "/api/recordings/upload",
      contentType: file.type || audioTypeByExtension[extensionOf(file)] || "audio/mp4",
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => setStatus(`${prefix}Uploading ${file.name}... ${Math.round(percentage)}%`),
    });
    setStatus(`${prefix}Transcribing ${file.name}${seconds ? ` (${Math.max(1, Math.round(seconds / 60))} min)` : ""}...`);
    const response = await fetch("/api/recordings/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: blob.url, language: sourceLanguage, filename: file.name }),
    });
    const result = await response.json().catch(() => ({})) as { text?: string; error?: string };
    if (!response.ok || !result.text) throw new Error(result.error || "The recording couldn't be transcribed.");
    onTextExtracted(result.text, file.name, appendThis, last);
    onRecording({ url: blob.url, filename: file.name });
    setStatus(`${prefix}${file.name} transcribed. Use Save for listening to keep it with its recording for making cards on your computer.`);
  }

  // Reads the files in filename order (so page photos stay in sequence),
  // each added after the one before.
  async function uploadFiles(selected: File[]) {
    const files = [...selected].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setIsUploading(true);
    let appendNext = hasText && append;
    for (const [index, file] of files.entries()) {
      const prefix = files.length > 1 ? `${index + 1} of ${files.length}: ` : "";
      const ok = await uploadFile(file, appendNext, index === files.length - 1, prefix);
      if (ok) appendNext = true;
    }
    setIsUploading(false);
  }

  async function chooseFiles() {
    const picker = (window as unknown as { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker;
    if (!picker) {
      inputRef.current?.click();
      return;
    }
    try {
      const handles = await picker({ id: "polyglot-uploads", multiple: true, types: pickerTypes });
      await uploadFiles(await Promise.all(handles.map((handle) => handle.getFile())));
    } catch (error) {
      // Closing the picker without choosing is not an error.
      if (!(error instanceof DOMException && error.name === "AbortError")) inputRef.current?.click();
    }
  }

  async function uploadFile(original: File, appendThis: boolean, last: boolean, prefix: string): Promise<boolean> {
    let file = original;
    if (isRecording(original)) {
      try {
        await uploadRecording(original, appendThis, last, prefix);
        return true;
      } catch (error) {
        setStatus(`${prefix}${error instanceof Error ? error.message : "The recording couldn't be transcribed."}`);
        return false;
      }
    }
    if (isHeicFile(original)) {
      setStatus(`${prefix}Converting ${original.name} from HEIC...`);
      try {
        file = await heicToJpeg(original);
      } catch {
        setStatus(`${prefix}${original.name} couldn't be converted from HEIC. Save it as a JPG in Photos and upload that.`);
        return false;
      }
    }
    if (file.size > 4 * 1024 * 1024) {
      setStatus(`${prefix}${file.name} is over 4 MB. Try a smaller scan or lower resolution.`);
      return false;
    }
    const providerLabel = providerId === "anthropic" ? "Anthropic" : "OpenAI";

    try {
      if (imageTypes.has(file.type) && photoReader === "device") {
        setStatus(`${prefix}Reading ${file.name} on this device...`);
        try {
          const ocrResult = await recognizeImageText(file, sourceLanguage);
          if (isUsableOcrResult(ocrResult)) {
            onTextExtracted(ocrResult.text, file.name, appendThis, last);
            setStatus(`${prefix}${file.name} loaded (read on this device, no tokens used)`);
            return true;
          }
          setStatus(`Little text found on this device, asking ${providerLabel}...`);
        } catch {
          setStatus(`Reading on this device failed, asking ${providerLabel}...`);
        }
      } else {
        setStatus(imageTypes.has(file.type) ? `${prefix}Asking ${providerLabel} to read ${file.name}...` : `${prefix}Reading ${file.name}...`);
      }
      await uploadToServer(file, appendThis, last);
      return true;
    } catch (error) {
      setStatus(`${prefix}${error instanceof Error ? error.message : "The document could not be read."}`);
      return false;
    }
  }

  return (
    <div className="upload-placeholder">
      <input ref={inputRef} className="visually-hidden" type="file" multiple accept={acceptedTypes} onChange={(event) => { const files = [...(event.target.files || [])]; if (files.length) void uploadFiles(files); event.target.value = ""; }} />
      <span className="upload-icon" aria-hidden="true">↑</span>
      <strong>{isUploading ? "Reading..." : "Bring DOCX, image, HTML, text, XML, PDF, or a recording"}</strong>
      <fieldset className="photo-reader" disabled={isUploading}>
        <legend>Read photos with</legend>
        <label><input type="radio" name="photo-reader" checked={photoReader === "device"} onChange={() => choosePhotoReader("device")} /> This device first <small>free · best for plain text in one script</small></label>
        <label><input type="radio" name="photo-reader" checked={photoReader === "ai"} onChange={() => choosePhotoReader("ai")} /> AI reader <small>about a cent a photo · best for mixed text, romanization, handwriting</small></label>
      </fieldset>
      <p>Other files are extracted on the server. A recording (MP3, M4A, MP4, MOV or WAV, up to 15 minutes) is transcribed with your OpenAI key, about half a cent a minute, and kept in your account for a day so you can save it.</p>
      {hasText && (
        <label className="upload-append"><input type="checkbox" checked={append} disabled={isUploading} onChange={(event) => setAppend(event.target.checked)} /> Add to the text already in the box (e.g. the next page)</label>
      )}
      <button type="button" disabled={isUploading} onClick={() => void chooseFiles()}>{isUploading ? "Working..." : "Choose documents"}</button>
      <p>You can pick several at once — e.g. every page of a chapter. They&apos;re read in filename order.</p>
      {status && <span className="upload-status" role="status">{status}</span>}
    </div>
  );
}
