import { useState } from 'react';
import BrowseView from './components/BrowseView';
import AskView from './components/AskView';

type Tab = 'ask' | 'browse';

export default function App() {
  const [tab, setTab] = useState<Tab>('browse');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <h1 className="text-2xl font-bold">KirstCheen Explorer</h1>
          <p className="text-sm text-gray-500">
            Search and explore the channel's videos and transcripts.
          </p>
          <nav className="mt-4 flex gap-2" aria-label="Views">
            <button
              type="button"
              onClick={() => setTab('ask')}
              aria-current={tab === 'ask'}
              className={
                'rounded-lg px-4 py-2 text-sm font-medium ' +
                (tab === 'ask' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
              }
            >
              Ask
            </button>
            <button
              type="button"
              onClick={() => setTab('browse')}
              aria-current={tab === 'browse'}
              className={
                'rounded-lg px-4 py-2 text-sm font-medium ' +
                (tab === 'browse' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
              }
            >
              Browse
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === 'browse' ? <BrowseView /> : <AskView />}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-6 text-xs text-gray-400">
        Answers are generated from auto-caption transcripts of public videos, may be
        imperfect, and contain no timestamps.
      </footer>
    </div>
  );
}
