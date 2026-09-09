import { XMLParser } from "fast-xml-parser";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const FEEDS = [
  { name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { name: "CNBC", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { name: "CNBC Markets", url: "https://www.cnbc.com/id/15839135/device/rss/rss.html" },
];

const parser = new XMLParser({ ignoreAttributes: false });

function stripHtml(text) {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status}`);
    const xml = await res.text();
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item;
    const list = Array.isArray(items) ? items : items ? [items] : [];
    return list.slice(0, 8).map((item) => ({
      sourceName: feed.name,
      title: stripHtml(typeof item.title === "object" ? item.title["#text"] : item.title),
      description: stripHtml(typeof item.description === "object" ? item.description["#text"] : item.description),
      link: typeof item.link === "object" ? item.link["#text"] ?? item.link["@_href"] : item.link,
      pubDate: item.pubDate,
    }));
  } catch (err) {
    console.error(`[fetchNews] Failed to fetch ${feed.name}: ${err.message}`);
    return [];
  }
}

// Fetches real, live headlines from public RSS feeds. Every headline,
// description, and link returned here is exactly what the source published
// — nothing is rewritten, summarized, or invented.
export async function fetchNews() {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  return results.flat().filter((item) => item.title && item.link);
}
