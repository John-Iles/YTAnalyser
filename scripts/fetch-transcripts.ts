/**
 * Fetches YouTube auto-captions using yt-dlp (which handles YouTube's
 * anti-scraping better than the youtube-transcript npm package).
 * Saves transcripts into src/data/corpus.json.
 *
 * Run via: npm run fetch:transcripts
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

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
const tmpDir = join(tmpdir(), 'yt-transcripts-' + Date.now());
mkdirSync(tmpDir, { recursive: true });

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

  const url = `https://www.youtube.com/watch?v=${video.id}`;
  process.stdout.write(`[fetch] ${video.id}  "${video.title}" ... `);

  try {
    // Download auto-generated English subtitles as VTT, skip the video itself.
    execSync(
      `yt-dlp --write-auto-sub --sub-lang en --sub-format vtt ` +
      `--skip-download --no-playlist ` +
      `--output "${tmpDir}/%(id)s.%(ext)s" "${url}"`,
      { stdio: 'pipe', timeout: 30000 },
    );

    // Find the downloaded .vtt file
    const { execSync: ex } = await import('child_process');
    const vttFile = ex(`ls "${tmpDir}"/${video.id}*.vtt 2>/dev/null || true`)
      .toString()
      .trim()
      .split('\n')
      .find((f) => f.endsWith('.vtt'));

    if (!vttFile) throw new Error('No VTT file produced');

    const vtt = readFileSync(vttFile, 'utf-8');
    // Parse VTT: strip header, timestamps, tags; dedupe consecutive lines.
    const lines = vtt
      .split('\n')
      .filter((l) => !/^WEBVTT|^\d{2}:|^$/.test(l.trim()))
      .map((l) => l.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    const deduped: string[] = [];
    for (const l of lines) {
      if (deduped[deduped.length - 1] !== l) deduped.push(l);
    }
    video.transcript = deduped.join(' ').replace(/\s+/g, ' ').trim();
    fetched++;
    console.log(`${video.transcript.length} chars`);
  } catch (err) {
    failed++;
    console.log(`FAILED  ${err instanceof Error ? err.message.split('\n')[0] : err}`);
  }

  // Polite delay.
  await new Promise((r) => setTimeout(r, 500));
}

try { rmSync(tmpDir, { recursive: true }); } catch {}

writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + '\n');
console.log(`\nDone: ${fetched} fetched, ${skipped} skipped, ${failed} failed`);
