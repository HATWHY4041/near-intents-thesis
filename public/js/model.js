// The thesis model. Runs the same in the browser (sliders) and in Node (`npm run model`).
//
// Question it answers: if NEAR Intents keeps growing at rate g and NEAR keeps capturing `takeRateBps` of
// every swap, when do the buybacks paid for by that revenue match the new NEAR created by inflation?
//
// Everything is monthly. Volume compounds at g. Revenue = volume × take rate. Buybacks = revenue × share.
// NEAR bought = buyback dollars ÷ price. NEAR issued = supply × inflation ÷ 12. Coverage = bought ÷ issued.
// Bought-back NEAR is held by NEAR's buyback wallet, not burned, so it leaves the market without
// shrinking total supply; the model tracks "net NEAR added to the market" = issued − bought.

export function project(inputs) {
  const {
    startMonthlyVolume, monthlyGrowth = 0, takeRateBps, buybackShare = 1,
    price, priceGrowthMonthly = 0, supply, inflationPct, months = 36,
  } = inputs;
  const rows = [];
  let s = supply;
  let firstFullCoverage = null;
  for (let m = 1; m <= months; m++) {
    const volume = startMonthlyVolume * Math.pow(1 + monthlyGrowth, m);
    const revenue = (volume * takeRateBps) / 1e4;
    const buybackUsd = revenue * buybackShare;
    const p = price * Math.pow(1 + priceGrowthMonthly, m);
    const nearBought = buybackUsd / p;
    const nearIssued = (s * inflationPct) / 100 / 12;
    s += nearIssued;
    const coverage = nearIssued ? nearBought / nearIssued : 0;
    if (firstFullCoverage == null && coverage >= 1) firstFullCoverage = m;
    rows.push({ m, volume, revenue, buybackUsd, price: p, nearBought, nearIssued, netNear: nearIssued - nearBought, coverage, supply: s });
  }
  const years = [];
  for (let y = 0; y < Math.ceil(months / 12); y++) {
    const slice = rows.slice(y * 12, y * 12 + 12);
    const sum = (k) => slice.reduce((a, r) => a + r[k], 0);
    years.push({
      year: y + 1,
      volume: sum("volume"), revenue: sum("revenue"), buybackUsd: sum("buybackUsd"),
      nearBought: sum("nearBought"), nearIssued: sum("nearIssued"), netNear: sum("netNear"),
      coverage: sum("nearIssued") ? sum("nearBought") / sum("nearIssued") : 0,
    });
  }
  // Monthly growth that would make buybacks match issuance in the final month.
  const issuedLast = rows.at(-1).nearIssued;
  const neededMonthlyVolume = (issuedLast * rows.at(-1).price) / ((takeRateBps / 1e4) * buybackShare);
  const growthNeeded = Math.pow(neededMonthlyVolume / startMonthlyVolume, 1 / months) - 1;
  return { rows, years, firstFullCoverage, growthNeeded, neededMonthlyVolume };
}

// Three scenarios built only from measured inputs, so anyone re-running the model gets them from fresh data.
export function scenarios(mi) {
  // Growth comes from the 12-month trend in monthly volume (see lib/metrics.js), capped at ±10% a month.
  const trend = Math.min(Math.max(mi.monthlyGrowthTrend ?? 0, -0.1), 0.1);
  const base = {
    startMonthlyVolume: mi.startMonthlyVolume, takeRateBps: mi.takeRateBps, buybackShare: mi.buybackShare ?? 1,
    price: mi.price, supply: mi.supply, inflationPct: mi.inflationPct, months: 36, priceGrowthMonthly: 0,
  };
  const longTake = Math.min(mi.takeRateLongBps ?? mi.takeRateBps, mi.takeRateBps);
  return [
    { id: "bear", name: "Bear", why: "Volume shrinks 3% a month and NEAR's cut falls back to its average since it began capturing revenue.",
      inputs: { ...base, monthlyGrowth: -0.03, takeRateBps: longTake } },
    { id: "base", name: "Base", why: "Volume grows at half of its 12-month trend; today's cut holds.",
      inputs: { ...base, monthlyGrowth: trend / 2 } },
    { id: "bull", name: "Bull", why: "Volume keeps its 12-month trend for three more years; today's cut holds.",
      inputs: { ...base, monthlyGrowth: trend } },
  ].map((s) => ({ ...s, result: project(s.inputs) }));
}
