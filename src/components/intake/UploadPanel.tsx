"use client";

import { useRef, useState } from "react";
import { isUsableOcrResult, recognizeImageText } from "@/lib/ocr";
import type { LlmProviderId } from "@/lib/llm/provider";
import type { Language } from "@/lib/types";

type UploadPanelProps = {
  onTextExtracted: (text: string, filename: string) => void;
  providerId: LlmProviderId;
  sourceLanguage: Language;
};

const imageTypes = new Set(["image/jpeg", "image/png"]);

export function UploadPanel({ onTextExtracted, providerId, sourceLanguage }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  async function uploadToServer(file: File) {
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
    onTextExtracted(result.text, result.filename);
    setStatus(`${result.filename} loaded${result.pageCount && result.pageCount > 1 ? ` · ${result.pageCount} pages` : ""}`);
  }

  async function uploadFile(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      setStatus("Files must be under 4 MB. Try a smaller scan or lower resolution.");
      return;
    }
    setIsUploading(true);
    const providerLabel = providerId === "anthropic" ? "Anthropic" : "OpenAI";

    try {
      if (imageTypes.has(file.type)) {
        setStatus(`Reading ${file.name} locally...`);
        try {
          const ocrResult = await recognizeImageText(file, sourceLanguage);
          if (isUsableOcrResult(ocrResult)) {
            onTextExtracted(ocrResult.text, file.name);
            setStatus(`${file.name} loaded (read locally, no tokens used)`);
            return;
          }
          setStatus(`Local reading found little text, asking ${providerLabel}...`);
        } catch {
          setStatus(`Local reading failed, asking ${providerLabel}...`);
        }
      } else {
        setStatus(`Reading ${file.name}...`);
      }
      await uploadToServer(file);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The document could not be read.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="upload-placeholder">
      <input ref={inputRef} className="visually-hidden" type="file" accept=".html,.htm,.txt,.xml,.docx,.pdf,.jpg,.jpeg,.png,text/html,text/plain,text/xml,application/xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
      <span className="upload-icon" aria-hidden="true">↑</span>
      <strong>{isUploading ? "Reading document..." : "Bring DOCX, image, HTML, text, XML, or PDF"}</strong>
      <p>Images are read locally in your browser first, to save tokens. Other files are extracted on the server.</p>
      <button type="button" disabled={isUploading} onClick={() => inputRef.current?.click()}>{isUploading ? "Working..." : "Choose document"}</button>
      {status && <span className="upload-status" role="status">{status}</span>}
    </div>
  );
}
