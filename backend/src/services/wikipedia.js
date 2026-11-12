/**
 * Try to fetch a Wikipedia summary for a query.
 * Returns null if nothing is found or on error.
 */
export async function getWikiSummary(query) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.extract || null;
  } catch {
    return null;
  }
}
