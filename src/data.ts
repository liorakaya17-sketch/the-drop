export type Category = "MARKETS" | "CRYPTO" | "FED" | "TECH" | "ECONOMY";

export interface Stat {
  label: string;
  value: string;
  direction?: "up" | "down" | "flat";
}

export interface Source {
  name: string;
  url: string;
}

export interface TopStory {
  id: string;
  category: Category;
  headline: string;
  deck: string;
  publishedAt: string;
  readTime: string;
  stats?: Stat[];
  whyItMatters: string;
  body: string[];
  sources: Source[];
}

export interface QuickHit {
  id: string;
  category: Category;
  headline: string;
  summary: string;
  publishedAt: string;
  source: Source;
}

export interface Issue {
  id: string;
  date: string;
  fetchedAt: string;
  topStories: TopStory[];
  quickHits: QuickHit[];
  meta?: { status: "ok" | "error" | "pending"; lastAttempt: string | null };
}
