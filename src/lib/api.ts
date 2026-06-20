import { retrieve, extractSnippets } from './search';
import type { VideoRecord } from './types';

// Strip any trailing slash(es) so `${WORKER_URL}/ask` never becomes `//ask`,
// which Cloudflare 301-redirects and the browser retries as a GET (→ 405).
const WORKER_URL = ((import.meta.env.VITE_WORKER_URL as string | undefined) || '').replace(/\/+$/, '');

export type SourceVideo = Pick<VideoRecord, 'id' | 'title' | 'url' | 'published'>;

export type AskContext = {
  title: string;
  url: string;
  published: string;
  snippets: string[];
};

/** Build the context payload to send to the Worker for a given question. */
export function buildContexts(question: string, k = 10): { contexts: AskContext[]; sources: SourceVideo[] } {
  const videos = retrieve(question, k);
  const sources: SourceVideo[] = videos.map(({ id, title, url, published }) => ({
    id, title, url, published,
  }));
  const contexts: AskContext[] = videos.map((v) => ({
    title: v.title,
    url: v.url,
    published: v.published,
    snippets: extractSnippets(v, question),
  }));
  return { contexts, sources };
}

/**
 * Call the Worker /ask endpoint and stream back delta text chunks.
 * Yields each text delta as it arrives.
 * Throws on network error or non-2xx status.
 */
export async function* askStream(
  question: string,
  contexts: AskContext[],
  accessCode: string,
): AsyncGenerator<string> {
  const askUrl = `${WORKER_URL}/ask`;
  if (!WORKER_URL) throw new Error('VITE_WORKER_URL is not set.');

  const resp = await fetch(askUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, contexts, accessCode }),
  });

  if (resp.status === 401) throw new Error('Wrong access code.');
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({})) as Record<string, unknown>;
    const msg = String(detail.error ?? `Worker error ${resp.status}`);
    throw new Error(`${msg} [${resp.status} POST ${askUrl}]`);
  }
  if (!resp.body) throw new Error('No response body.');

  // Parse Anthropic SSE: extract text deltas from content_block_delta events.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return;
      try {
        const msg = JSON.parse(payload) as Record<string, unknown>;
        if (
          msg.type === 'content_block_delta' &&
          typeof msg.delta === 'object' &&
          msg.delta !== null &&
          (msg.delta as Record<string, unknown>).type === 'text_delta'
        ) {
          const text = (msg.delta as Record<string, unknown>).text;
          if (typeof text === 'string' && text) yield text;
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
}
