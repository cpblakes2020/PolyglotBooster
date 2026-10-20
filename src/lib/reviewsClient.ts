import type { SavedTaskRun } from "@/lib/reviews";

// Saved reviews (study sessions) from the browser: each change returns the
// account's up-to-date list.

async function reviewsRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as { error?: string; reviews?: SavedTaskRun[] };
  if (!response.ok || !data.reviews) throw new Error(data.error || `Request failed (${response.status}).`);
  return data.reviews;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const listReviews = () => reviewsRequest("/api/account/reviews");
export const updateReview = (taskRunId: string, updates: { notes?: string; title?: string }) => reviewsRequest(`/api/account/reviews/${taskRunId}`, json("PATCH", updates));
export const deleteReviews = (ids: string[]) => reviewsRequest("/api/account/reviews", json("DELETE", { ids }));

// The study desk opens a saved review given ?review=<id>.
export const studyDeskReviewUrl = (taskRunId: string) => `/?review=${encodeURIComponent(taskRunId)}`;
