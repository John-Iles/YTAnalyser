export type VideoRecord = {
  id: string;
  title: string;
  url: string;
  published: string; // ISO YYYY-MM-DD
  views: number;
  hasTranscript: boolean;
  transcript?: string; // full caption text, populated by fetch:transcripts
  keywordCounts: Record<string, number>;
  quotes: string[];
  searchText: string;
  meta?: { topics?: string[]; keyInsight?: string; tone?: string };
};

// The ten tracked keyword terms, in display order.
export const KEYWORDS = [
  'Abuse', 'Abusive', 'Mental health', 'Supportive', 'Lewis',
  'Financial', 'Anxiety', 'Family', 'Breakdown', 'Happy',
] as const;

export type Keyword = (typeof KEYWORDS)[number];
