// Turns raw daily series into the numbers the thesis argues from.
// Rates use 90-day windows: NEAR's revenue is recorded when it is swept to its wallets, so single days and
// even single months are lumpy (some months show none at all), while 90 days smooths that out.

const DAY = 86400;

function windowSum(series, endT, days) {
  const from = endT - days * DAY;
  let s = 0;
  for (const [t, v] of series) if (t > from && t <= endT) s += v;
  return s;
}

function at(chain, t) {
  // last chain row on or before t
  let best = null;
  for (const c of chain) if (c.t <= t && (!best || c.t > best.t)) best = c;
  return best;
}

function avgChain(chain, endT, days, key) {
  const rows = chain.filter((c) => c.t > endT - days * DAY && c.t <= endT);
  return rows.length ? rows.reduce((s, c) => s + c[key], 0) / rows.length : null;
}

function priceOn(prices, t) {
  let best = null;
  for (const [pt, p] of prices) if (pt <= t && (!best || pt > best[0])) best = [pt, p];
  return best ? best[1] : null;
}

const monthKey = (t) => new Date(t * 1000).toISOString().slice(0, 7);
const daysInMonth = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate();

export function monthly(raw, lastT) {
  const firstT = raw.volume.find(([, v]) => v > 0)?.[0] ?? raw.volume[0][0];
  const months = new Map();
  const get = (k) => {
    if (!months.has(k)) months.set(k, { month: k, days: new Set(), volume: 0, fees: 0, revenue: 0, buybacks: 0 });
    return months.get(k);
  };
  for (const [name, series] of [["volume", raw.volume], ["fees", raw.fees], ["revenue", raw.revenue], ["buybacks", raw.buybacks]]) {
    for (const [t, v] of series) {
      if (t < firstT || t > lastT) continue;
      const m = get(monthKey(t));
      m[name] += v;
      if (name === "volume") m.days.add(t);
    }
  }
  const keys = [...months.keys()].sort();
  return keys.map((k, i) => {
    const m = months.get(k);
    const start = Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1) / 1000;
    const end = Math.min(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 1) / 1000 - DAY, lastT);
    const rows = raw.chain.filter((c) => c.t >= start && c.t <= end);
    const endRow = at(raw.chain, end);
    const prevEnd = at(raw.chain, start - DAY);
    const ps = raw.prices.filter(([t]) => t >= start && t <= end).map(([, p]) => p);
    const price = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
    const issued = endRow && prevEnd ? endRow.supply - prevEnd.supply : null;
    const avg = (key) => (rows.length ? rows.reduce((s, c) => s + c[key], 0) / rows.length : null);
    return {
      month: k,
      partial: m.days.size < daysInMonth(k),
      daysCovered: m.days.size,
      volume: m.volume,
      fees: m.fees,
      revenue: m.revenue,
      buybacks: m.buybacks,
      price,
      nearIssued: issued,
      issuanceUsd: issued != null && price != null ? issued * price : null,
      l1TxnsPerDay: avg("txns"),
      l1ActivePerDay: avg("active"),
      l1GasFeesUsd: rows.reduce((s, c) => s + c.gasFeeUsd, 0),
      index: i,
    };
  });
}

export function computeAll(raw) {
  const lastT = Math.min(raw.volume.at(-1)[0], raw.revenue.at(-1)[0], raw.buybacks.at(-1)[0]);
  const chainLast = raw.chain.at(-1);
  const yearAgo = lastT - 365 * DAY;

  const vol30 = windowSum(raw.volume, lastT, 30);
  const vol90 = windowSum(raw.volume, lastT, 90);
  const vol90YearAgo = windowSum(raw.volume, yearAgo, 90);
  const vol90Prev = windowSum(raw.volume, lastT - 90 * DAY, 90);
  const fees90 = windowSum(raw.fees, lastT, 90);
  const rev90 = windowSum(raw.revenue, lastT, 90);
  const buy90 = windowSum(raw.buybacks, lastT, 90);
  const rev30 = windowSum(raw.revenue, lastT, 30);
  const buy30 = windowSum(raw.buybacks, lastT, 30);

  const price = raw.market.price;
  const supplyNow = chainLast.supply;
  const supplyYearAgo = at(raw.chain, chainLast.t - 365 * DAY)?.supply;
  const issuedYear = supplyYearAgo ? supplyNow - supplyYearAgo : null;
  const inflationPct = issuedYear ? (issuedYear / supplyYearAgo) * 100 : null;
  const issuanceUsdYear = issuedYear != null ? issuedYear * price : null;

  const takeRateBps = vol90 ? (rev90 / vol90) * 1e4 : null;
  const feeRateBps = vol90 ? (fees90 / vol90) * 1e4 : null;
  const buybackAnnual = (buy90 * 365) / 90;
  const revenueAnnual = (rev90 * 365) / 90;
  const coverage = issuanceUsdYear ? buybackAnnual / issuanceUsdYear : null;
  const marketCap = raw.market.marketCap || (raw.market.circulating ? raw.market.circulating * price : supplyNow * price);
  const dailyVolume = vol90 / 90;
  const breakevenDailyVolume = issuanceUsdYear && takeRateBps ? issuanceUsdYear / 365 / (takeRateBps / 1e4) : null;

  // NEAR bought back so far: each day's buyback dollars at that day's price.
  let nearBought = 0;
  for (const [t, usd] of raw.buybacks) {
    if (usd <= 0) continue;
    const p = priceOn(raw.prices, t);
    if (p) nearBought += usd / p;
  }
  const buybackStart = raw.buybacks.find(([, v]) => v > 0)?.[0] ?? null;

  // Concentration: share of the last 90 days' volume that came from the 5 biggest days.
  const last90 = raw.volume.filter(([t]) => t > lastT - 90 * DAY && t <= lastT).map(([, v]) => v).sort((a, b) => b - a);
  const top5Share = vol90 ? last90.slice(0, 5).reduce((a, b) => a + b, 0) / vol90 : null;

  const l1TxnsNow = avgChain(raw.chain, chainLast.t, 30, "txns");
  const l1TxnsYearAgo = avgChain(raw.chain, chainLast.t - 365 * DAY, 30, "txns");
  const l1ActiveNow = avgChain(raw.chain, chainLast.t, 30, "active");
  const l1ActiveYearAgo = avgChain(raw.chain, chainLast.t - 365 * DAY, 30, "active");
  const l1Gas30 = raw.chain.filter((c) => c.t > chainLast.t - 30 * DAY).reduce((s, c) => s + c.gasFeeUsd, 0);

  const volYoY = vol90YearAgo ? vol90 / vol90YearAgo - 1 : null;
  const monthlyGrowthHist = volYoY != null && volYoY > -1 ? Math.pow(1 + volYoY, 1 / 12) - 1 : 0;

  // The growth rate the scenarios use: a log-linear trend through the last 12 full months of volume.
  // Year-on-year growth flatters (it compares against a small base); a trend through every month does not.
  const months = monthly(raw, lastT);
  const fullMonths = months.filter((m) => !m.partial && m.volume > 0).slice(-12);
  let monthlyGrowthTrend = 0;
  if (fullMonths.length >= 6) {
    const ys = fullMonths.map((m) => Math.log(m.volume));
    const n = ys.length, mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    ys.forEach((yv, i) => { sxy += (i - mx) * (yv - my); sxx += (i - mx) ** 2; });
    monthlyGrowthTrend = Math.exp(sxy / sxx) - 1;
  }
  const trendWindow = fullMonths.length ? `${fullMonths[0].month} to ${fullMonths.at(-1).month}` : null;

  // The bear case's take rate: the average since NEAR started capturing revenue from Intents.
  const revStart = raw.revenue.find(([, v]) => v > 0)?.[0];
  const volSince = revStart ? raw.volume.filter(([t]) => t >= revStart && t <= lastT).reduce((a, [, v]) => a + v, 0) : 0;
  const revSince = revStart ? raw.revenue.filter(([t]) => t >= revStart && t <= lastT).reduce((a, [, v]) => a + v, 0) : 0;
  const takeRateLongBps = volSince ? (revSince / volSince) * 1e4 : takeRateBps;

  const headline = {
    asOf: new Date(lastT * 1000).toISOString().slice(0, 10),
    chainAsOf: new Date(chainLast.t * 1000).toISOString().slice(0, 10),
    volumeAllTime: raw.volumeAllTime ?? raw.volume.reduce((s, [, v]) => s + v, 0),
    vol30, vol90, vol90YearAgo, vol90Prev, volYoY, volQoQ: vol90Prev ? vol90 / vol90Prev - 1 : null,
    dailyVolume,
    fees90, rev90, buy90, rev30, buy30,
    revenueAllTime: raw.revenue.reduce((s, [, v]) => s + v, 0),
    buybacksAllTime: raw.buybacks.reduce((s, [, v]) => s + v, 0),
    buybackStart: buybackStart ? new Date(buybackStart * 1000).toISOString().slice(0, 10) : null,
    nearBought,
    takeRateBps, takeRateLongBps, revenueStart: revStart ? new Date(revStart * 1000).toISOString().slice(0, 10) : null, feeRateBps, captureShare: fees90 ? rev90 / fees90 : null,
    revenueAnnual, buybackAnnual,
    price, priceSource: raw.market.source, marketCap, fdv: raw.market.fdv || supplyNow * price,
    supply: supplyNow, issuedYear, inflationPct, issuanceUsdYear,
    coverage, breakevenDailyVolume, breakevenMultiple: breakevenDailyVolume ? breakevenDailyVolume / dailyVolume : null,
    marketCapToBuybacks: buybackAnnual ? marketCap / buybackAnnual : null,
    top5Share,
    l1TxnsNow, l1TxnsYearAgo, l1ActiveNow, l1ActiveYearAgo,
    l1TxnsYoY: l1TxnsYearAgo ? l1TxnsNow / l1TxnsYearAgo - 1 : null,
    l1ActiveYoY: l1ActiveYearAgo ? l1ActiveNow / l1ActiveYearAgo - 1 : null,
    l1Gas30, intentsRevenueVsGas: l1Gas30 ? rev30 / l1Gas30 : null,
    monthlyGrowthHist, monthlyGrowthTrend, trendWindow,
  };

  const signals = [
    {
      id: "growth",
      claim: "Intents volume keeps growing",
      measure: "Last 90 days of volume vs the same 90 days a year earlier",
      value: volYoY,
      format: "pct",
      status: volYoY == null ? "unknown" : volYoY >= 0 ? "holding" : volYoY >= -0.25 ? "watch" : "broken",
      rule: "Holding at 0% or more. Watch between 0% and −25%. Broken below −25%.",
    },
    {
      id: "take",
      claim: "NEAR keeps its cut of each swap",
      measure: "Revenue NEAR captured ÷ volume, last 90 days",
      value: takeRateBps,
      format: "bps",
      status: takeRateBps == null ? "unknown" : takeRateBps >= 4 ? "holding" : takeRateBps >= 2 ? "watch" : "broken",
      rule: "Holding at 4 bps (0.04%) or more. Watch between 2 and 4 bps. Broken below 2 bps.",
    },
    {
      id: "breadth",
      claim: "Volume is broad, not a few whale days",
      measure: "Share of the last 90 days' volume from the 5 biggest days",
      value: top5Share,
      format: "pct",
      status: top5Share == null ? "unknown" : top5Share <= 0.2 ? "holding" : top5Share <= 0.35 ? "watch" : "broken",
      rule: "Holding at 20% or less (a flat 90 days would be 5.6%). Watch up to 35%. Broken above 35%.",
    },
    {
      id: "coverage",
      claim: "Buybacks catch up with new supply",
      measure: "Yearly buybacks (90-day pace) ÷ yearly NEAR issuance at today's price",
      value: coverage,
      format: "pct",
      status: coverage == null ? "unknown" : coverage >= 0.5 ? "holding" : coverage >= 0.1 ? "watch" : "broken",
      rule: "The milestone, not today's fact: holding at 50% or more, watch between 10% and 50%, broken below 10%.",
    },
  ];

  return {
    generatedAt: raw.fetchedAt,
    headline,
    monthly: months,
    signals,
    modelInputs: {
      startMonthlyVolume: vol90 / 3,
      takeRateBps,
      takeRateLongBps,
      buybackShare: 1,
      price,
      supply: supplyNow,
      inflationPct,
      monthlyGrowthTrend,
      monthlyGrowthHist,
    },
  };
}
