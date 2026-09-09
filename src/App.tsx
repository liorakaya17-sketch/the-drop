import { useCallback, useEffect, useState } from "react";
import "./App.css";
import type { Category, Issue, Stat, TopStory } from "./data";

const NAV_ITEMS: { label: string; category: Category | null }[] = [
  { label: "Markets", category: null },
  { label: "Economy", category: "ECONOMY" },
  { label: "Crypto", category: "CRYPTO" },
  { label: "Tech", category: "TECH" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="stat-strip">
      {stats.map((stat) => {
        const directionClass = stat.direction ? `stat__value--${stat.direction}` : "";
        return (
          <div className="stat" key={stat.label}>
            <span className="stat__label">{stat.label}</span>
            <span className={`stat__value ${directionClass}`}>{stat.value}</span>
          </div>
        );
      })}
    </div>
  );
}

function StoryCard({
  story,
  featured,
  onOpen,
}: {
  story: TopStory;
  featured: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <article className={`story ${featured ? "story--featured" : ""}`}>
      <span className={`kicker kicker--${story.category}`}>{story.category}</span>
      <h3 className="story__headline">
        <a
          href={`#/story/${story.id}`}
          onClick={(e) => {
            e.preventDefault();
            onOpen(story.id);
          }}
        >
          {story.headline}
        </a>
      </h3>
      <p className="byline">
        {story.publishedAt} · {story.readTime}
      </p>
      <p className="story__deck">{story.deck}</p>

      {story.stats && <StatStrip stats={story.stats} />}

      <div className="why-it-matters">
        <div className="why-it-matters__label">Why it matters</div>
        <p className="why-it-matters__text">{story.whyItMatters}</p>
      </div>
    </article>
  );
}

function ArticleView({ story, onBack }: { story: TopStory; onBack: () => void }) {
  return (
    <main>
      <a
        className="back-link"
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          onBack();
        }}
      >
        &larr; Back to Top Stories
      </a>

      <article className="story story--article story--featured">
        <span className={`kicker kicker--${story.category}`}>{story.category}</span>
        <h3 className="story__headline">{story.headline}</h3>
        <p className="byline">
          {story.publishedAt} · {story.readTime}
        </p>
        <p className="story__deck">{story.deck}</p>

        {story.stats && <StatStrip stats={story.stats} />}

        <div className="why-it-matters">
          <div className="why-it-matters__label">Why it matters</div>
          <p className="why-it-matters__text">{story.whyItMatters}</p>
        </div>

        <div className="story-body">
          {story.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>

        <div className="story-sources">
          Sources:{" "}
          {story.sources.map((source, i) => (
            <span key={source.url}>
              {i > 0 && " · "}
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name}
              </a>
            </span>
          ))}
        </div>
      </article>
    </main>
  );
}

function App() {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);

  const loadIssue = useCallback(async () => {
    try {
      const res = await fetch("/api/issue");
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data: Issue = await res.json();
      setIssue(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    loadIssue();
    const interval = setInterval(loadIssue, 60_000);
    return () => clearInterval(interval);
  }, [loadIssue]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      await loadIssue();
    } finally {
      setRefreshing(false);
    }
  };

  const openStory = (id: string) => {
    setOpenStoryId(id);
    window.history.pushState({ storyId: id }, "", `#/story/${id}`);
    window.scrollTo(0, 0);
  };

  const closeStory = () => {
    setOpenStoryId(null);
    window.history.pushState({}, "", "#/");
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const onPopState = () => {
      const match = window.location.hash.match(/^#\/story\/(.+)$/);
      setOpenStoryId(match ? match[1] : null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (loadError) {
    return (
      <div className="page">
        <p className="empty-state">
          Couldn't reach the live server ({loadError}). Make sure it's running with{" "}
          <code>npm run dev:all</code>.
        </p>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="page">
        <p className="empty-state">Fetching the latest real market data and news…</p>
      </div>
    );
  }

  const filteredTopStories = activeCategory
    ? issue.topStories.filter((s) => s.category === activeCategory)
    : issue.topStories;
  const filteredQuickHits = activeCategory
    ? issue.quickHits.filter((h) => h.category === activeCategory)
    : issue.quickHits;

  const openStory_ = issue.topStories.find((s) => s.id === openStoryId) ?? null;

  return (
    <div className="page">
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__logo">The Drop</span>
        </div>
        <nav className="site-header__nav">
          {NAV_ITEMS.map((item) => (
            <button
              className={activeCategory === item.category ? "site-header__nav-item--active" : ""}
              onClick={() => setActiveCategory(item.category)}
              key={item.label}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="site-header__meta">
          <span>{formatDate(issue.date)}</span>
        </div>
      </header>

      <div className="freshness-bar">
        <span>
          Live data · updated {formatRelativeTime(issue.fetchedAt)}
          {issue.meta?.status === "error" && " · last refresh failed, showing older data"}
        </span>
        <button onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {openStory_ ? (
        <ArticleView story={openStory_} onBack={closeStory} />
      ) : (
        <main>
          {filteredTopStories.length === 0 && filteredQuickHits.length === 0 ? (
            <p className="empty-state">
              No {activeCategory?.toLowerCase()} stories right now. Try a different category or refresh.
            </p>
          ) : (
            <>
              {filteredTopStories.length > 0 && (
                <>
                  <h2 className="section-heading">Top Stories</h2>
                  <div className="stories">
                    {filteredTopStories.map((story, i) => (
                      <StoryCard story={story} featured={i === 0} onOpen={openStory} key={story.id} />
                    ))}
                  </div>
                </>
              )}

              {filteredQuickHits.length > 0 && (
                <>
                  <h2 className="section-heading">Quick Hits</h2>
                  <div className="quick-hits">
                    {filteredQuickHits.map((hit) => (
                      <article className="quick-hit" key={hit.id}>
                        <span className={`kicker kicker--${hit.category}`}>{hit.category}</span>
                        <h3 className="quick-hit__headline">{hit.headline}</h3>
                        <p className="quick-hit__summary">{hit.summary}</p>
                        <p className="quick-hit__time">
                          {hit.publishedAt} ·{" "}
                          <a href={hit.source.url} target="_blank" rel="noreferrer">
                            {hit.source.name}
                          </a>
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      )}

      <footer className="site-footer">
        <div className="site-footer__logo">The Drop</div>
        <p className="site-footer__tagline">Finance news for people with better things to do.</p>
        <form className="site-footer__signup" onSubmit={(e) => e.preventDefault()}>
          <input
            className="site-footer__input"
            type="email"
            placeholder="you@email.com"
            aria-label="Email address"
          />
          <button className="site-footer__button" type="submit">
            Subscribe
          </button>
        </form>
        <div className="site-footer__links">
          <span>About</span>
          <span>Contact</span>
          <span>Privacy</span>
        </div>
        <p className="site-footer__fineprint">
          © {new Date().getFullYear()} The Drop. Live data from public market and news feeds — see each
          story's sources.
        </p>
      </footer>
    </div>
  );
}

export default App;
