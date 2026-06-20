import MiniSearch, { type SearchResult } from 'minisearch';
import corpus from '../data/corpus.json';
import type { VideoRecord } from './types';

export const VIDEOS = corpus as VideoRecord[];

const byId = new Map(VIDEOS.map((v) => [v.id, v]));

// Index title + searchText (lowercased title + deduped quotes).
const mini = new MiniSearch<VideoRecord>({
  fields: ['title', 'searchText'],
  storeFields: ['id'],
  idField: 'id',
  searchOptions: {
    boost: { title: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
});
mini.addAll(VIDEOS);

export function getVideo(id: string): VideoRecord | undefined {
  return byId.get(id);
}

function runSearch(query: string, combineWith: 'AND' | 'OR'): VideoRecord[] {
  const q = query.trim();
  if (!q) return [];
  return (mini.search(q, { combineWith }) as SearchResult[])
    .map((r) => byId.get(r.id as string))
    .filter((v): v is VideoRecord => Boolean(v));
}

/**
 * Free-text browse search. Requires all query terms (AND) so multi-word
 * queries like "lake district" stay precise rather than matching either word.
 */
export function searchVideos(query: string): VideoRecord[] {
  return runSearch(query, 'AND');
}

/**
 * Retrieve the top-K videos for a question (used by the Ask flow).
 * Uses OR for broader recall on natural-language questions.
 */
export function retrieve(query: string, k = 10): VideoRecord[] {
  return runSearch(query, 'OR').slice(0, k);
}

/**
 * Extract up to `maxSnippets` windowed excerpts from a video around the
 * matched query terms. Uses the full transcript when available, otherwise
 * falls back to the short keyword quotes.
 */
export function extractSnippets(
  video: VideoRecord,
  query: string,
  maxSnippets = 5,
  window = 400,
): string[] {
  if (!video.hasTranscript) return [];

  // Prefer full transcript; fall back to joined quotes.
  const haystack = (video.transcript ?? video.quotes.join(' … ')).trim();
  if (!haystack) return [];

  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);

  const lower = haystack.toLowerCase();
  const snippets: string[] = [];
  const usedRanges: Array<[number, number]> = [];

  const overlaps = (a: number, b: number) =>
    usedRanges.some(([s, e]) => a < e && b > s);

  for (const term of terms) {
    if (snippets.length >= maxSnippets) break;
    let searchFrom = 0;
    while (snippets.length < maxSnippets) {
      const idx = lower.indexOf(term, searchFrom);
      if (idx === -1) break;
      const start = Math.max(0, idx - Math.floor(window / 2));
      const end = Math.min(haystack.length, start + window);
      searchFrom = idx + 1;
      if (overlaps(start, end)) continue;
      usedRanges.push([start, end]);
      let snip = haystack.slice(start, end).trim();
      if (start > 0) snip = '…' + snip;
      if (end < haystack.length) snip = snip + '…';
      snippets.push(snip);
      break;
    }
  }

  // Fallback: opening window.
  if (snippets.length === 0) {
    snippets.push(haystack.slice(0, window).trim() + (haystack.length > window ? '…' : ''));
  }
  return snippets.slice(0, maxSnippets);
}
