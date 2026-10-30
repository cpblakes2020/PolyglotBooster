import { get, put } from "@vercel/blob";

// Blob sometimes refuses a read (403/429) when many requests come at once,
// e.g. Book audio transcribing a chapter's clips, so a failed read is tried
// twice more after a short pause.
export async function readJsonBlob<T>(pathname: string, fallback: T): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await get(pathname, { access: "public", useCache: false });
      if (!result || result.statusCode !== 200) return fallback;
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as T;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
}

// Public blobs are served through a CDN, and useCache: false only affects
// private blobs, so reads can get a cached copy. By default a copy may be
// kept for a month, and an overwrite doesn't always clear every edge (a
// week-old templates.json was once still being served), so these
// frequently rewritten JSON files are cached for at most a minute.
export async function writeJsonBlob(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
}
