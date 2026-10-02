// iPhone camera photos are HEIC, which browsers can't read. These convert
// them to JPEG in the browser (via libheif, loaded only when needed) so the
// rest of the upload — device OCR or the AI reader — sees an ordinary photo.

export function isHeicFile(file: File) {
  return /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/.test(file.type);
}

// Longest side of the converted photo: plenty for reading text, and keeps
// a 12-megapixel photo well under the 4 MB upload limit.
const maxSide = 3000;

export async function heicToJpeg(file: File): Promise<File> {
  const { heicTo } = await import("heic-to/next");
  const bitmap = await heicTo({ blob: file, type: "bitmap" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error(`${file.name} couldn't be converted from HEIC.`);
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
}
