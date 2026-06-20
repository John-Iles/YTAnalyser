import { useMemo, useState } from 'react';
import { VIDEOS, searchVideos } from '../lib/search';
import { KEYWORDS, type Keyword, type VideoRecord } from '../lib/types';

type SortKey = 'published' | 'views' | 'title';
type SortDir = 'asc' | 'desc';

function formatViews(n: number): string {
  return n.toLocaleString('en-GB');
}

export default function BrowseView() {
  const [query, setQuery] = useState('');
  const [activeKeywords, setActiveKeywords] = useState<Set<Keyword>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('published');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleKeyword = (kw: Keyword) => {
    setActiveKeywords((prev) => {
      const next = new Set(prev);
      next.has(kw) ? next.delete(kw) : next.add(kw);
      return next;
    });
  };

  const setSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'title' ? 'asc' : 'desc');
    }
  };

  const rows = useMemo(() => {
    // Start from search results (relevance order) or the full list.
    let list: VideoRecord[] = query.trim() ? searchVideos(query) : [...VIDEOS];

    // Keyword "present" filter: a row must have count > 0 for every active chip.
    if (activeKeywords.size > 0) {
      list = list.filter((v) =>
        [...activeKeywords].every((kw) => (v.keywordCounts[kw] ?? 0) > 0),
      );
    }

    // Sorting (skip when a free-text query is active and sort is default, to
    // preserve relevance order — but still honour an explicit sort choice).
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
      else if (sortKey === 'views') cmp = a.views - b.views;
      else cmp = a.published.localeCompare(b.published);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [query, activeKeywords, sortKey, sortDir]);

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <section aria-labelledby="browse-heading">
      <h2 id="browse-heading" className="text-xl font-semibold text-gray-900 mb-3">
        Browse all {VIDEOS.length} videos
      </h2>

      <div className="mb-4 space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles and transcripts… e.g. lake district, shirley"
          aria-label="Search videos"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by keyword">
          {KEYWORDS.map((kw) => {
            const active = activeKeywords.has(kw);
            return (
              <button
                key={kw}
                type="button"
                aria-pressed={active}
                onClick={() => toggleKeyword(kw)}
                className={
                  'rounded-full px-3 py-1 text-xs font-medium transition ' +
                  (active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                }
              >
                {kw}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-2 text-sm text-gray-500" aria-live="polite">
        Showing {rows.length} of {VIDEOS.length} videos
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-gray-700">
                <button type="button" onClick={() => setSort('title')} className="hover:underline">
                  Title{sortArrow('title')}
                </button>
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-gray-700">
                <button type="button" onClick={() => setSort('published')} className="hover:underline">
                  Published{sortArrow('published')}
                </button>
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold text-gray-700">
                <button type="button" onClick={() => setSort('views')} className="hover:underline">
                  Views{sortArrow('views')}
                </button>
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold text-gray-700">
                Transcript
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((v) => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    {v.title}
                  </a>
                  {activeKeywords.size > 0 && (
                    <span className="ml-2 text-xs text-gray-400">
                      {[...activeKeywords].map((kw) => `${kw}:${v.keywordCounts[kw]}`).join('  ')}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">{v.published}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-gray-600">
                  {formatViews(v.views)}
                </td>
                <td className="px-3 py-2">
                  {v.hasTranscript ? (
                    <span className="text-green-700">✓</span>
                  ) : (
                    <span
                      className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      title="No caption text available for this video"
                    >
                      no transcript
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                  No videos match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
