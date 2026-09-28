"use client";

import { useEffect, useRef, useState } from "react";
import { isUsableOcrResult, recognizeImageText } from "@/lib/ocr";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { Language } from "@/lib/types";

type UploadPanelProps = {
  // append: add to the text already in the box (e.g. the next page of a
  // chapter) instead of replacing it. last: the final file of the batch.
  onTextExtracted: (text: string, filename: string, append: boolean, last: boolean) => void;
  hasText: boolean;
  providerId: LlmProviderId;
  sourceLanguage: Language;
};

const imageTypes = new Set(["image/jpeg", "image/png"]);
const acceptedTypes = ".html,.htm,.txt,.xml,.docx,.pdf,.jpg,.jpeg,.png,text/html,text/plain,text/xml,application/xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/jpeg,image/png";

// Chrome and Edge's file picker, which reopens in the folder last used for
// the same id. Not in TypeScript's DOM types yet.
type OpenFilePicker = (options: {
  id?: string;
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ getFile: () => Promise<File> }[]>;

const pickerTypes = [{
  description: "Documents and photos",
  accept: {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "application/pdf": [".pdf"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "text/html": [".html", ".htm"],
    "text/plain": [".txt"],
    "text/xml": [".xml"],
  },
}];

// "device": read photos in the browser first (free), falling back to the AI
// reader only when little text is found. "ai": always use the AI reader —
// better for photos mixing scripts, e.g. Thai with romanization and English.
type PhotoReader = "device" | "ai";
const photoReaderKey = "lingua:photoReader";

export function UploadPanel({ onTextExtracted, hasText, providerId, sourceLanguage }: UploadPanelProps) {
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

  async function uploadFile(file: File, appendThis: boolean, last: boolean, prefix: string): Promise<boolean> {
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
      <strong>{isUploading ? "Reading document..." : "Bring DOCX, image, HTML, text, XML, or PDF"}</strong>
      <fieldset className="photo-reader" disabled={isUploading}>
        <legend>Read photos with</legend>
        <label><input type="radio" name="photo-reader" checked={photoReader === "device"} onChange={() => choosePhotoReader("device")} /> This device first <small>free · best for plain text in one script</small></label>
        <label><input type="radio" name="photo-reader" checked={photoReader === "ai"} onChange={() => choosePhotoReader("ai")} /> AI reader <small>about a cent a photo · best for mixed text, romanization, handwriting</small></label>
      </fieldset>
      <p>Other files are extracted on the server.</p>
      {hasText && (
        <label className="upload-append"><input type="checkbox" checked={append} disabled={isUploading} onChange={(event) => setAppend(event.target.checked)} /> Add to the text already in the box (e.g. the next page)</label>
      )}
      <button type="button" disabled={isUploading} onClick={() => void chooseFiles()}>{isUploading ? "Working..." : "Choose documents"}</button>
      <p>You can pick several at once — e.g. every page of a chapter. They&apos;re read in filename order.</p>
      {status && <span className="upload-status" role="status">{status}</span>}
    </div>
  );
}
