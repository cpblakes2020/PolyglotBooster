import { NextResponse } from "next/server";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { auth } from "@/lib/auth";
import { extractDocumentText } from "@/lib/extraction";
import { getLlmProvider, getRequestProvider } from "@/lib/llm/provider";
import { requireAccountApiKey } from "@/lib/storage/account";
import { storeDocument } from "@/lib/storage/filesystem";

export const maxDuration = 60;

// Vercel's Node.js serverless functions hard-reject request bodies over 4.5 MB
// before our code even runs, so keep our own limit safely under that.
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const supportedTypes = new Set(["text/html", "text/plain", "text/xml", "application/xml", "application/pdf", docxMimeType, "image/jpeg", "image/png"]);
const supportedExtensions = new Set([".html", ".htm", ".txt", ".xml", ".pdf", ".docx", ".jpg", ".jpeg", ".png"]);

function getDocumentType(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  if (supportedTypes.has(file.type)) return file.type;
  if (supportedExtensions.has(extension)) {
    if (extension === ".html" || extension === ".htm") return "text/html";
    if (extension === ".txt") return "text/plain";
    if (extension === ".xml") return "application/xml";
    if (extension === ".docx") return docxMimeType;
    if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
    if (extension === ".png") return "image/png";
    return "application/pdf";
  }
  return null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    const providerId = getRequestProvider(request);
    const provider = getLlmProvider(providerId);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an HTML, text, XML, DOCX, or PDF file to upload." }, { status: 400 });
    }
    const documentType = getDocumentType(file);
    if (!documentType) {
      return NextResponse.json({ error: "Only HTML, text, XML, DOCX, and extractable PDF files are supported right now." }, { status: 415 });
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Files must be between 1 byte and 4 MB." }, { status: 413 });
    }

    const storedDocument = await storeDocument(file);
    const source = await readFile(storedDocument.storagePath);
    let extracted = { text: "", pageCount: 1 };
    if (documentType === "image/jpeg" || documentType === "image/png") {
      if (!provider.extractText) return NextResponse.json({ error: "Image extraction is unavailable for the selected provider." }, { status: 400 });
      const apiKey = await requireAccountApiKey(session.user.id, providerId);
      extracted.text = await provider.extractText(source, documentType, apiKey);
    } else {
      try {
        extracted = await extractDocumentText(storedDocument.storagePath, documentType);
      } catch (error) {
        if (documentType !== "application/pdf") throw error;
      }
      if (!extracted.text && documentType === "application/pdf") {
        if (providerId !== "anthropic" || !provider.extractText) return NextResponse.json({ error: "Scanned-PDF extraction currently requires an Anthropic API key." }, { status: 400 });
        const apiKey = await requireAccountApiKey(session.user.id, providerId);
        extracted.text = await provider.extractText(source, documentType, apiKey);
      }
    }
    if (!extracted.text) {
      const message = "No readable text was found in this file.";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    return NextResponse.json({
      documentId: storedDocument.documentId,
      filename: file.name,
      mimeType: documentType,
      fileSize: file.size,
      pageCount: extracted.pageCount,
      text: extracted.text,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("API key")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "The file could not be read. Try another text-based document." }, { status: 422 });
  }
}
