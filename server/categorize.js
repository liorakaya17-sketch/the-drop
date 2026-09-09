const RULES = [
  { category: "FED", keywords: ["federal reserve", "fed chair", "fomc", "interest rate", "rate hike", "rate cut", "powell", "warsh", "jackson hole", "monetary policy"] },
  { category: "CRYPTO", keywords: ["bitcoin", "ethereum", "crypto", "btc", "eth", "blockchain", "coinbase", "strategy inc", "microstrategy"] },
  { category: "TECH", keywords: ["nvidia", "apple", "microsoft", "google", "meta", "amazon", "ai chip", "artificial intelligence", "tech stock", "semiconductor", "software", "startup", "ipo"] },
  { category: "ECONOMY", keywords: ["jobless claims", "unemployment", "consumer confidence", "retail sales", "inflation", "cpi", "gdp", "housing starts", "jobs report", "labor market"] },
];

// Keyword-based classification of REAL headline text. This assigns a
// category label to real, already-fetched content — it never invents or
// alters the underlying facts.
export function categorize(text) {
  const lower = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.category;
    }
  }
  return "MARKETS";
}
