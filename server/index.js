import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchMarketData } from "./fetchMarketData.js";
import { fetchNews } from "./fetchNews.js";
import { buildIssue } from "./buildIssue.js";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch (err) {
  console.warn(`[server] No .env file loaded (fine in production if the host sets env vars directly): ${err.message}`);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const PORT = process.env.PORT || 3001;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const app = express();

let cache = { issue: null, status: "pending", error: null, lastAttempt: null };

async function refresh() {
  cache.lastAttempt = new Date().toISOString();

  // Market data and news come from independent providers — one failing
  // (e.g. a rate limit) shouldn't take down the other. allSettled lets us
  // build the best issue we can from whatever real data did come through.
  const [marketResult, newsResult] = await Promise.allSettled([fetchMarketData(), fetchNews()]);

  const marketData =
    marketResult.status === "fulfilled" ? marketResult.value : { fetchedAt: new Date().toISOString(), stats: {} };
  const newsItems = newsResult.status === "fulfilled" ? newsResult.value : [];

  const problems = [];
  if (marketResult.status === "rejected") problems.push(`market data: ${marketResult.reason.message}`);
  if (newsResult.status === "rejected") problems.push(`news: ${newsResult.reason.message}`);

  if (newsItems.length === 0) {
    // No real news to show at all — keep serving the last good cache
    // rather than replacing it with an empty/broken issue.
    cache.status = "error";
    cache.error = problems.join("; ") || "No news items returned";
    console.error(`[refresh] Failed: ${cache.error}`);
    return;
  }

  const issue = buildIssue(newsItems, marketData);
  cache = {
    issue,
    status: problems.length > 0 ? "partial" : "ok",
    error: problems.length > 0 ? problems.join("; ") : null,
    lastAttempt: cache.lastAttempt,
  };
  console.log(
    `[refresh] ${cache.status} — ${issue.topStories.length} top stories, ${issue.quickHits.length} quick hits` +
      (problems.length > 0 ? ` (${cache.error})` : ""),
  );
}

app.get("/api/issue", (req, res) => {
  if (!cache.issue) {
    return res.status(503).json({ error: "No data yet — the first fetch is still in progress." });
  }
  res.json({ ...cache.issue, meta: { status: cache.status, lastAttempt: cache.lastAttempt } });
});

app.post("/api/refresh", async (req, res) => {
  await refresh();
  res.json({ status: cache.status, error: cache.error });
});

// Serve the built frontend (npm run build) from the same server, so this
// is one deployable service rather than two. In local dev, Vite serves the
// frontend on its own port instead — this only matters in production.
app.use(express.static(DIST_DIR));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  refresh();
  setInterval(refresh, REFRESH_INTERVAL_MS);
});
