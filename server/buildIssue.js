import { categorize } from "./categorize.js";

const WHY_IT_MATTERS_TEMPLATES = {
  FED: "The Fed's decisions ripple into everyday borrowing costs — credit cards, car loans, and mortgages all move with the rates it sets.",
  MARKETS: "Moves like this affect the value of index funds and retirement accounts, even if you don't trade individual stocks yourself.",
  CRYPTO: "Crypto increasingly trades like a broader risk asset, so what moves it often reflects the same forces moving stocks.",
  TECH: "A handful of large tech companies now make up an outsized share of most index funds, so their earnings swing the broader market.",
  ECONOMY: "Reports like this shape what the Fed does next on interest rates, which touches borrowing costs across the board.",
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function estimateReadTime(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

function formatPublishedAt(pubDate) {
  if (!pubDate) return "Just in";
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return "Just in";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
}

function dedupeByTitle(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The Federal Reserve's press-release feed mixes genuine policy news
// (rate decisions, FOMC statements) with routine regulatory filings —
// individual bank enforcement actions, merger approvals, meeting minutes
// for procedural committees. Those are real and correctly sourced, but not
// "news" a general reader cares about, so we filter them out rather than
// let them crowd out substantive stories just because they publish often.
const ROUTINE_FED_PATTERN =
  /enforcement action|termination of enforcement|approval of application|discount rate meeting|bank holding company|change in bank control|notice of intent|proposed rule|final rule|correspondent/i;
const SUBSTANTIVE_FED_PATTERN =
  /interest rate|fomc|monetary policy|rate decision|economic (outlook|projections)|chair (powell|warsh)|federal funds rate/i;

function isRoutineFedFiling(item) {
  if (item.sourceName !== "Federal Reserve") return false;
  if (SUBSTANTIVE_FED_PATTERN.test(item.title)) return false;
  return ROUTINE_FED_PATTERN.test(item.title);
}

// A description that's identical (or near-identical) to the title adds no
// real information — not wrong, just not enough substance for a top story.
function hasSubstantiveDescription(item) {
  if (!item.description || item.description.length < 40) return false;
  const normalizedTitle = item.title.toLowerCase().trim();
  const normalizedDesc = item.description.toLowerCase().trim();
  return normalizedDesc !== normalizedTitle;
}

// General financial news feeds (Yahoo Finance, CNBC) are professionally
// edited for newsworthiness; the raw Fed feed is a regulatory filing log.
// Prefer the former for top-story placement.
const SOURCE_PRIORITY = { "Yahoo Finance": 0, CNBC: 0, "CNBC Markets": 0, "Federal Reserve": 1 };

function statsForCategory(category, marketStats) {
  const stats = (() => {
    switch (category) {
      case "FED":
      case "ECONOMY":
        return [marketStats.sp500, marketStats.dow];
      case "MARKETS":
        return [marketStats.sp500, marketStats.dow, marketStats.oil];
      case "CRYPTO":
        return [marketStats.btc, marketStats.eth];
      case "TECH":
        return [marketStats.nasdaq, marketStats.sp500];
      default:
        return undefined;
    }
  })();
  // Market data may be partially or fully unavailable if that provider's
  // fetch failed — drop any missing entries rather than show a blank stat.
  const filtered = stats?.filter(Boolean);
  return filtered && filtered.length > 0 ? filtered : undefined;
}

// Assembles the Issue shape from REAL fetched data only. Headlines,
// descriptions, links, and every stat come directly from the source
// responses — this function classifies and arranges real content, it does
// not generate or embellish facts. "Why it matters" uses a fixed,
// category-level template rather than per-story AI narrative, specifically
// to avoid inventing claims about a story we haven't independently verified.
export function buildIssue(newsItems, marketData) {
  const categorized = dedupeByTitle(newsItems)
    .filter((item) => !isRoutineFedFiling(item))
    .map((item) => ({
      ...item,
      category: categorize(`${item.title} ${item.description}`),
    }));

  // Top stories need real substance (a description that adds information
  // beyond the headline) and are drawn preferentially from professionally
  // edited feeds rather than the raw regulatory filing log.
  const substantiveCandidates = categorized
    .filter(hasSubstantiveDescription)
    .sort((a, b) => (SOURCE_PRIORITY[a.sourceName] ?? 0) - (SOURCE_PRIORITY[b.sourceName] ?? 0));

  // Pick across different categories rather than taking the first 3 in
  // list order — otherwise a feed that happens to run three related
  // headlines in a row (e.g. three trade-war stories) crowds out other,
  // equally real news like a Fed story or a jobs report sitting right
  // after it in the same feed.
  const topStoryItems = [];
  const usedCategories = new Set();
  for (const item of substantiveCandidates) {
    if (topStoryItems.length >= 3) break;
    if (usedCategories.has(item.category)) continue;
    topStoryItems.push(item);
    usedCategories.add(item.category);
  }
  // If fewer than 3 categories were available, fill remaining slots from
  // whatever's left, still respecting source priority order.
  for (const item of substantiveCandidates) {
    if (topStoryItems.length >= 3) break;
    if (topStoryItems.includes(item)) continue;
    topStoryItems.push(item);
  }

  const usedLinks = new Set(topStoryItems.map((i) => i.link));
  const quickHitItems = categorized.filter((i) => !usedLinks.has(i.link)).slice(0, 6);

  const topStories = topStoryItems.map((item) => {
    const sentences = item.description.split(/(?<=[.!?])\s+/);
    const deck = sentences[0];
    const bodyText = item.description;
    return {
      id: slugify(item.title),
      category: item.category,
      headline: item.title,
      deck,
      publishedAt: formatPublishedAt(item.pubDate),
      readTime: estimateReadTime(bodyText),
      stats: statsForCategory(item.category, marketData.stats),
      whyItMatters: WHY_IT_MATTERS_TEMPLATES[item.category] ?? WHY_IT_MATTERS_TEMPLATES.MARKETS,
      body: [bodyText],
      sources: [{ name: item.sourceName, url: item.link }],
    };
  });

  const quickHits = quickHitItems.map((item) => ({
    id: slugify(item.title),
    category: item.category,
    headline: item.title,
    summary: item.description || item.title,
    publishedAt: formatPublishedAt(item.pubDate),
    source: { name: item.sourceName, url: item.link },
  }));

  const now = new Date();
  return {
    id: now.toISOString().slice(0, 10),
    date: now.toISOString(),
    fetchedAt: marketData.fetchedAt,
    topStories,
    quickHits,
  };
}
