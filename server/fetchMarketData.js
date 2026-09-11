const FINNHUB_BASE = "https://finnhub.io/api/v1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Real-time quote via Finnhub's documented, key-authenticated API.
// `symbol` is a real ticker (e.g. "SPY") — Finnhub's free tier covers
// individual stocks and ETFs, not raw index symbols (^GSPC etc. require a
// paid plan), so we track major indices via their tracking ETFs instead.
async function fetchFinnhubQuote(symbol, attempt = 1) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY is not set");

  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url);

  if (res.status === 429 && attempt < 3) {
    await sleep(attempt * 600);
    return fetchFinnhubQuote(symbol, attempt + 1);
  }
  if (!res.ok) throw new Error(`Finnhub quote failed for ${symbol}: ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(`Finnhub quote failed for ${symbol}: ${data.error}`);
  if (typeof data.c !== "number" || data.c === 0) {
    throw new Error(`No quote data for ${symbol}`);
  }

  return {
    price: data.c, // current price
    changePercent: data.dp ?? 0, // percent change from previous close
  };
}

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

// Yahoo Finance's public chart endpoint is unofficial (no key, no SLA, no
// documented rate limit) — we avoid depending on it for the core stock/ETF
// data (see fetchFinnhubQuote). It's the only free source we've confirmed
// actually has the 10-Yr Treasury yield without requiring a second API key
// signup, though, and calling it once per refresh (vs. the burst of 5
// simultaneous calls that got us rate-limited before) is a much lower-risk
// use of it. If it fails, the caller treats that as "no treasury stat this
// round" rather than a hard error — never a fabricated number.
async function fetchYahooTreasuryYield(attempt = 1) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d";
  const res = await fetch(url, { headers: YAHOO_HEADERS });
  if (!res.ok && attempt < 2) {
    await sleep(700);
    return fetchYahooTreasuryYield(attempt + 1);
  }
  if (!res.ok) throw new Error(`Yahoo treasury yield failed: ${res.status}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") {
    throw new Error("No treasury yield data returned");
  }
  return { price: meta.regularMarketPrice, changePercent: meta.regularMarketChangePercent ?? 0 };
}

async function fetchCoinGeckoPrices() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko failed: ${res.status}`);
  return res.json();
}

function formatPriceStat(label, price, changePercent, decimals = 2, prefix = "$") {
  const sign = changePercent >= 0 ? "+" : "";
  return {
    label,
    value: `${prefix}${price.toLocaleString("en-US", { maximumFractionDigits: decimals })} (${sign}${changePercent.toFixed(2)}%)`,
    direction: changePercent > 0.02 ? "up" : changePercent < -0.02 ? "down" : "flat",
  };
}

// Fetches these one at a time with a short gap rather than all at once,
// to stay comfortably inside Finnhub's free-tier rate limit.
async function fetchFinnhubQuotesStaggered(symbols) {
  const results = [];
  for (const symbol of symbols) {
    results.push(await fetchFinnhubQuote(symbol));
    await sleep(150);
  }
  return results;
}

// Fetches real, live market data. Every number here comes directly from a
// live provider response — nothing is invented or estimated.
//
// Indices are tracked via their major ETF proxies (SPY/QQQ/DIA/USO) since
// Finnhub's free tier doesn't include raw index quotes. That's disclosed
// via each stat's label rather than presented as the literal index level,
// since an ETF's own share price is a different real number from the
// index it tracks (e.g. SPY trades at roughly 1/10th the S&P 500's level).
export async function fetchMarketData() {
  const [[spy, qqq, dia, uso], coingecko, treasuryResult] = await Promise.all([
    fetchFinnhubQuotesStaggered(["SPY", "QQQ", "DIA", "USO"]),
    fetchCoinGeckoPrices(),
    fetchYahooTreasuryYield().catch((err) => {
      console.warn(`[fetchMarketData] Treasury yield unavailable this round: ${err.message}`);
      return null;
    }),
  ]);

  const stats = {
    sp500: formatPriceStat("S&P 500 (SPY)", spy.price, spy.changePercent),
    nasdaq: formatPriceStat("Nasdaq (QQQ)", qqq.price, qqq.changePercent),
    dow: formatPriceStat("Dow (DIA)", dia.price, dia.changePercent),
    oil: formatPriceStat("Oil (USO)", uso.price, uso.changePercent),
    btc: formatPriceStat("BTC", coingecko.bitcoin.usd, coingecko.bitcoin.usd_24h_change, 0),
    eth: formatPriceStat("ETH", coingecko.ethereum.usd, coingecko.ethereum.usd_24h_change, 0),
  };

  if (treasuryResult) {
    stats.treasury10y = {
      label: "10-Yr Treasury",
      value: `${treasuryResult.price.toFixed(2)}%`,
      direction:
        treasuryResult.changePercent > 0.02 ? "up" : treasuryResult.changePercent < -0.02 ? "down" : "flat",
    };
  }

  return {
    fetchedAt: new Date().toISOString(),
    stats,
    raw: { spy, qqq, dia, uso, coingecko, treasuryResult },
  };
}
