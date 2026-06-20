/**
 * build-corpus.ts
 *
 * Reads keyword_report.json + report.json from the repo root and emits
 * src/data/corpus.json (the single source of truth the frontend ships).
 *
 * Rules (see project brief):
 *  - Exclude two invalid entries by title: "anosp" and "Kirst Cheen - Videos".
 *    Result must be exactly 130 valid videos.
 *  - Extract the 11-char video id from url; canonical link is
 *    https://www.youtube.com/watch?v=<id>.
 *  - Convert `published` (YYYYMMDD) to ISO YYYY-MM-DD.
 *  - Dedupe quotes per video; searchText = lowercased title + joined quotes.
 *  - Videos with no caption text keep hasTranscript: false.
 *  - Optionally enrich from report.json by matching `id`.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const KEYWORDS = [
  'Abuse', 'Abusive', 'Mental health', 'Supportive', 'Lewis',
  'Financial', 'Anxiety', 'Family', 'Breakdown', 'Happy',
] as const;

const INVALID_TITLES = new Set(['anosp', 'Kirst Cheen - Videos']);

type KeywordEntry = { present: boolean; count: number; quotes: string[] };
type RawVideo = {
  title: string;
  url: string;
  published: string; // YYYYMMDD
  views: number;
  keywords: Record<string, KeywordEntry>;
};

type ReportVideo = {
  id: string;
  analysis?: { topics?: string[]; key_insight?: string; tone?: string };
};
type Report = { channel: string; summary: unknown; video_breakdown: ReportVideo[] };

type VideoRecord = {
  id: string;
  title: string;
  url: string;
  published: string; // ISO YYYY-MM-DD
  views: number;
  hasTranscript: boolean;
  keywordCounts: Record<string, number>;
  quotes: string[];
  searchText: string;
  meta?: { topics?: string[]; keyInsight?: string; tone?: string };
};

function extractId(url: string): string | null {
  const m = url.match(/[?&]v=([A-Za-z0-9_-]{11})(?:[&]|$)/);
  return m ? m[1] : null;
}

function toIsoDate(yyyymmdd: string): string {
  const m = yyyymmdd.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) throw new Error(`Unexpected published date format: ${yyyymmdd}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function main() {
  const keywordReport = JSON.parse(
    readFileSync(resolve(ROOT, 'keyword_report.json'), 'utf8'),
  ) as RawVideo[];
  const report = JSON.parse(
    readFileSync(resolve(ROOT, 'report.json'), 'utf8'),
  ) as Report;

  // Build a lookup of enrichment data keyed by video id.
  const enrichment = new Map<string, NonNullable<VideoRecord['meta']>>();
  for (const v of report.video_breakdown ?? []) {
    if (!v.id || !v.analysis) continue;
    const meta: NonNullable<VideoRecord['meta']> = {};
    if (v.analysis.topics?.length) meta.topics = v.analysis.topics;
    if (v.analysis.key_insight) meta.keyInsight = v.analysis.key_insight;
    if (v.analysis.tone) meta.tone = v.analysis.tone;
    if (Object.keys(meta).length) enrichment.set(v.id, meta);
  }

  const records: VideoRecord[] = [];
  const seenIds = new Set<string>();

  for (const raw of keywordReport) {
    if (INVALID_TITLES.has(raw.title)) continue;

    const id = extractId(raw.url);
    if (!id) {
      console.warn(`Skipping (no 11-char id): "${raw.title}" -> ${raw.url}`);
      continue;
    }
    if (seenIds.has(id)) {
      console.warn(`Skipping duplicate id ${id}: "${raw.title}"`);
      continue;
    }
    seenIds.add(id);

    // Dedupe quotes across all keywords for this video, preserving order.
    const quoteSet = new Set<string>();
    const keywordCounts: Record<string, number> = {};
    for (const kw of KEYWORDS) {
      const entry = raw.keywords?.[kw];
      keywordCounts[kw] = entry?.count ?? 0;
      for (const q of entry?.quotes ?? []) {
        const trimmed = q.trim();
        if (trimmed) quoteSet.add(trimmed);
      }
    }
    const quotes = [...quoteSet];
    const hasTranscript = quotes.length > 0;

    const searchText = [raw.title.toLowerCase(), ...quotes.map((q) => q.toLowerCase())].join(' ');

    const record: VideoRecord = {
      id,
      title: raw.title,
      url: `https://www.youtube.com/watch?v=${id}`,
      published: toIsoDate(raw.published),
      views: raw.views,
      hasTranscript,
      keywordCounts,
      quotes,
      searchText,
    };

    const meta = enrichment.get(id);
    if (meta) record.meta = meta;

    records.push(record);
  }

  // Sanity checks against the known-good corpus shape.
  const noTranscript = records.filter((r) => !r.hasTranscript).length;
  const errors: string[] = [];
  if (records.length !== 130) errors.push(`Expected 130 records, got ${records.length}`);
  if (noTranscript < 25 || noTranscript > 33) {
    errors.push(`Expected ~29 no-transcript videos, got ${noTranscript}`);
  }
  if (errors.length) {
    throw new Error('Corpus validation failed:\n  ' + errors.join('\n  '));
  }

  const outDir = resolve(ROOT, 'src', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'corpus.json');
  writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n');

  const enriched = records.filter((r) => r.meta).length;
  console.log(`Wrote ${records.length} records to ${outPath}`);
  console.log(`  hasTranscript=false: ${noTranscript}`);
  console.log(`  enriched from report.json: ${enriched}`);
}

main();
