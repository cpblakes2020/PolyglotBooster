import { get, put } from "@vercel/blob";

export async function readJsonBlob<T>(pathname: string, fallback: T): Promise<T> {
  const result = await get(pathname, { access: "public", useCache: false });
  if (!result || result.statusCode !== 200) return fallback;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as T;
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
