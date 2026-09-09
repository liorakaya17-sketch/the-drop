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
  const [[spy, qqq, dia, uso], coingecko] = await Promise.all([
    fetchFinnhubQuotesStaggered(["SPY", "QQQ", "DIA", "USO"]),
    fetchCoinGeckoPrices(),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    stats: {
      sp500: formatPriceStat("S&P 500 (SPY)", spy.price, spy.changePercent),
      nasdaq: formatPriceStat("Nasdaq (QQQ)", qqq.price, qqq.changePercent),
      dow: formatPriceStat("Dow (DIA)", dia.price, dia.changePercent),
      oil: formatPriceStat("Oil (USO)", uso.price, uso.changePercent),
      btc: formatPriceStat("BTC", coingecko.bitcoin.usd, coingecko.bitcoin.usd_24h_change, 0),
      eth: formatPriceStat("ETH", coingecko.ethereum.usd, coingecko.ethereum.usd_24h_change, 0),
    },
    raw: { spy, qqq, dia, uso, coingecko },
  };
}
