import { useCallback, useRef, useState } from 'react';
import { askStream, buildContexts, type SourceVideo } from '../lib/api';

const EXAMPLES = [
  'Did they ever buy land in the Lake District?',
  'What does she say about her mental health?',
  "Who are Lewis's parents?",
];

type Phase = 'idle' | 'streaming' | 'done' | 'error';

export default function AskView() {
  const [accessCode, setAccessCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [codeError, setCodeError] = useState('');

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<SourceVideo[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef<boolean>(false);

  // --- Access gate ---
  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!accessCode.trim()) { setCodeError('Please enter the access code.'); return; }
    // Optimistically unlock; the Worker will return 401 if wrong.
    setUnlocked(true);
    setCodeError('');
  }

  // --- Ask ---
  const handleAsk = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || phase === 'streaming') return;
    abortRef.current = false;
    setQuestion(trimmed);
    setAnswer('');
    setSources([]);
    setErrorMsg('');
    setPhase('streaming');

    const { contexts, sources: srcs } = buildContexts(trimmed);
    setSources(srcs);

    try {
      for await (const chunk of askStream(trimmed, contexts, accessCode)) {
        if (abortRef.current) break;
        setAnswer((prev) => prev + chunk);
      }
      setPhase('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      if (msg.includes('Wrong access code')) {
        setUnlocked(false);
        setCodeError('Access code rejected. Please try again.');
      }
      setErrorMsg(msg);
      setPhase('error');
    }
  }, [phase, accessCode]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleAsk(question);
  }

  // --- Access gate screen ---
  if (!unlocked) {
    return (
      <section className="mx-auto max-w-sm pt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Enter access code</h2>
        <p className="text-sm text-gray-500 mb-4">Ask your colleague for the passphrase.</p>
        <form onSubmit={handleUnlock} className="space-y-3">
          <input
            type="password"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="Access code"
            aria-label="Access code"
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {codeError && <p className="text-sm text-red-600">{codeError}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Unlock
          </button>
        </form>
      </section>
    );
  }

  // --- Main Ask UI ---
  return (
    <section aria-labelledby="ask-heading">
      <h2 id="ask-heading" className="text-xl font-semibold text-gray-900 mb-3">
        Ask a question
      </h2>

      {/* Example prompts */}
      {phase === 'idle' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { setQuestion(ex); handleAsk(ex); }}
              className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything about the channel…"
          aria-label="Question"
          disabled={phase === 'streaming'}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={!question.trim() || phase === 'streaming'}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {phase === 'streaming' ? 'Answering…' : 'Ask'}
        </button>
      </form>

      {/* Answer */}
      {(answer || phase === 'streaming') && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Answer</h3>
          <div
            aria-live="polite"
            aria-label="Answer"
            className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-800"
          >
            {answer}
            {phase === 'streaming' && (
              <span className="inline-block w-2 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" aria-hidden="true" />
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</p>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            Sources searched ({sources.length})
          </h3>
          <ul className="space-y-1">
            {sources.map((s) => (
              <li key={s.id} className="flex items-baseline gap-2 text-sm">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-700 hover:underline"
                >
                  {s.title}
                </a>
                <span className="text-gray-400 text-xs flex-shrink-0">{s.published}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-400">
            No timestamps exist in the source — the video link is the finest reference available.
          </p>
        </div>
      )}
    </section>
  );
}
