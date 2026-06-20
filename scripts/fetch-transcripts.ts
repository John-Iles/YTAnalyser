/**
 * Fetches YouTube auto-captions for every video in corpus.json that is
 * flagged hasTranscript:true and doesn't already have a transcript stored.
 * Writes the updated corpus back to src/data/corpus.json.
 *
 * Run via:  npm run fetch:transcripts
 * Triggered automatically by .github/workflows/fetch-transcripts.yml
 */
import { YoutubeTranscript } from 'youtube-transcript';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusPath = join(__dirname, '../src/data/corpus.json');

interface VideoRecord {
  id: string;
  title: string;
  hasTranscript: boolean;
  transcript?: string;
  [key: string]: unknown;
}

const corpus: VideoRecord[] = JSON.parse(readFileSync(corpusPath, 'utf-8'));

let fetched = 0, skipped = 0, failed = 0;

for (const video of corpus) {
  if (!video.hasTranscript) {
    skipped++;
    continue;
  }
  if (video.transcript) {
    console.log(`[skip]  ${video.id}  already has transcript`);
    skipped++;
    continue;
  }

  process.stdout.write(`[fetch] ${video.id}  "${video.title}" ... `);
  try {
    const segments = await YoutubeTranscript.fetchTranscript(video.id);
    video.transcript = segments
      .map((s: { text: string }) => s.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    fetched++;
    console.log(`${video.transcript.length} chars`);
  } catch (err) {
    failed++;
    console.log(`FAILED  ${err}`);
  }

  // Polite delay between requests to avoid rate-limiting.
  await new Promise((r) => setTimeout(r, 1500));
}

writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + '\n');
console.log(`\nDone: ${fetched} fetched, ${skipped} skipped, ${failed} failed`);
