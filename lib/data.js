// Fetches every input the thesis uses, from public sources that need no API key.
// Each series comes back as daily points: [unixSeconds (UTC midnight), value].

export const SOURCES = {
  volume: {
    label: "NEAR Intents daily swap volume (DefiLlama)",
    url: "https://api.llama.fi/summary/dexs/near-intents?dataType=dailyVolume",
    page: "https://defillama.com/protocol/near-intents",
  },
  fees: {
    label: "NEAR Intents gross fees (DefiLlama)",
    url: "https://api.llama.fi/summary/fees/near-intents?dataType=dailyFees",
    page: "https://defillama.com/protocol/near-intents",
  },
  revenue: {
    label: "Revenue captured by NEAR from Intents (DefiLlama)",
    url: "https://api.llama.fi/summary/fees/near-intents?dataType=dailyRevenue",
    page: "https://github.com/DefiLlama/dimension-adapters/blob/master/fees/near-intents",
  },
  buybacks: {
    label: "Intents revenue used to buy back NEAR (DefiLlama holders revenue)",
    url: "https://api.llama.fi/summary/fees/near-intents?dataType=dailyHoldersRevenue",
    page: "https://defillama.com/protocol/near-intents",
  },
  chain: {
    label: "NEAR blockchain daily stats: supply, transactions, active accounts (NearBlocks)",
    url: "https://api.nearblocks.io/v1/charts",
    page: "https://nearblocks.io/charts",
  },
  price: {
    label: "NEAR daily price (DefiLlama coins API, CoinGecko feed)",
    url: "https://coins.llama.fi/chart/coingecko:near?span=800&period=1d",
    page: "https://www.coingecko.com/en/coins/near",
  },
  market: {
    label: "NEAR market cap and supply (CoinGecko)",
    url: "https://api.coingecko.com/api/v3/coins/near?localization=false&tickers=false&community_data=false&developer_data=false",
    page: "https://www.coingecko.com/en/coins/near",
  },
};

const HEADERS = { accept: "application/json", "user-agent": "near-intents-thesis (github.com/HATWHY4041/near-intents-thesis)" };

async function getJson(url, timeoutMs = 20000) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

const day = (ts) => Math.floor(ts / 86400) * 86400;
const llamaChart = (j) => (j.totalDataChart || []).map(([t, v]) => [day(t), Number(v) || 0]);
// NEAR amounts are in yoctoNEAR (10^24). Keep precision with BigInt, then convert.
const yocto = (s) => Number(BigInt(String(s).split(".")[0]) / 10n ** 18n) / 1e6;

export async function fetchAll() {
  const [vol, fees, rev, buy, chain, price, market] = await Promise.allSettled([
    getJson(SOURCES.volume.url),
    getJson(SOURCES.fees.url),
    getJson(SOURCES.revenue.url),
    getJson(SOURCES.buybacks.url),
    getJson(SOURCES.chain.url),
    getJson(SOURCES.price.url),
    getJson(SOURCES.market.url),
  ]);
  const need = { volume: vol, fees, revenue: rev, buybacks: buy, chain };
  const failed = Object.entries(need).filter(([, r]) => r.status !== "fulfilled").map(([k, r]) => `${k}: ${r.reason?.message || r.reason}`);
  if (failed.length) throw new Error(`Could not load ${failed.join("; ")}`);

  const chainDays = (chain.value.charts || []).map((c) => ({
    t: day(Date.parse(c.date) / 1000),
    supply: yocto(c.total_supply),
    txns: Number(c.txns) || 0,
    active: Number(c.active_accounts) || 0,
    newAccounts: Number(c.new_accounts) || 0,
    gasFeeUsd: Number(c.txn_fee_usd) || 0,
    price: Number(c.near_price) || 0,
  }));

  let prices = [];
  if (price.status === "fulfilled") {
    prices = (price.value.coins?.["coingecko:near"]?.prices || []).map((p) => [day(p.timestamp), p.price]);
  }
  if (!prices.length) prices = chainDays.filter((c) => c.price > 0).map((c) => [c.t, c.price]);

  let mkt = null;
  if (market.status === "fulfilled" && market.value.market_data) {
    const m = market.value.market_data;
    mkt = { price: m.current_price?.usd, marketCap: m.market_cap?.usd, fdv: m.fully_diluted_valuation?.usd,
      circulating: m.circulating_supply, totalSupply: m.total_supply, source: "CoinGecko" };
  }
  if (!mkt || !mkt.price) {
    const last = chainDays.at(-1);
    const p = prices.at(-1)?.[1];
    mkt = { price: p, marketCap: null, fdv: p && last ? p * last.supply : null, circulating: null, totalSupply: last?.supply, source: "DefiLlama + NearBlocks" };
  }

  return {
    fetchedAt: new Date().toISOString(),
    volume: llamaChart(vol.value),
    volumeAllTime: vol.value.totalAllTime ?? null,
    fees: llamaChart(fees.value),
    revenue: llamaChart(rev.value),
    buybacks: llamaChart(buy.value),
    chain: chainDays,
    prices,
    market: mkt,
  };
}
