#!/usr/bin/env node
// Re-run the whole thesis from fresh public data:
//   npm run model                 fetch live data, print the report, save data/snapshot.json
//   npm run model -- --offline    use the saved snapshot instead of fetching
//   npm run model -- --growth 0.02 --take-bps 4 --price 6   try your own assumptions (custom scenario)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fetchAll, SOURCES } from "../lib/data.js";
import { computeAll } from "../lib/metrics.js";
import { project, scenarios } from "../public/js/model.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};
const offline = args.includes("--offline");
const root = new URL("../", import.meta.url);

let data;
if (offline) {
  data = JSON.parse(await readFile(new URL("data/snapshot.json", root), "utf8"));
  console.log(`Using saved snapshot from ${data.generatedAt}\n`);
} else {
  console.log("Fetching live data from DefiLlama, NearBlocks and CoinGecko…\n");
  data = { sources: SOURCES, ...computeAll(await fetchAll()) };
}

const h = data.headline;
const usd = (n) => (n == null ? "n/a" : Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString("en-US")}`);
const pct = (n) => (n == null ? "n/a" : `${(n * 100).toFixed(1)}%`);
const near = (n) => `${(n / 1e6).toFixed(2)}M NEAR`;

console.log(`NEAR Intents thesis — data through ${h.asOf} (chain data through ${h.chainAsOf})`);
console.log("─".repeat(72));
const rows = [
  ["Intents volume, all time", usd(h.volumeAllTime)],
  ["Intents volume, last 90 days", `${usd(h.vol90)}  (${pct(h.volYoY)} vs a year earlier)`],
  ["Revenue NEAR captured, last 90 days", `${usd(h.rev90)}  = ${h.takeRateBps?.toFixed(2)} bps of volume`],
  ["Buybacks, last 90 days", `${usd(h.buy90)}  → ${usd(h.buybackAnnual)} a year at this pace`],
  ["Buybacks since start", `${usd(h.buybacksAllTime)}  ≈ ${near(h.nearBought)} (since ${h.buybackStart})`],
  ["NEAR issued in the last year", `${near(h.issuedYear)}  = ${h.inflationPct?.toFixed(2)}% inflation ≈ ${usd(h.issuanceUsdYear)} at $${h.price?.toFixed(2)}`],
  ["Buybacks cover of issuance", pct(h.coverage)],
  ["Volume trend, last 12 full months", `${pct(h.monthlyGrowthTrend)} a month (${h.trendWindow})`],
  ["Daily volume needed to cover issuance", `${usd(h.breakevenDailyVolume)}  (${h.breakevenMultiple?.toFixed(1)}× today's ${usd(h.dailyVolume)})`],
  ["Market cap ÷ yearly buybacks", `${h.marketCapToBuybacks?.toFixed(0)}×`],
  ["NEAR L1 transactions/day, vs a year ago", `${Math.round(h.l1TxnsNow).toLocaleString("en-US")}  (${pct(h.l1TxnsYoY)})`],
  ["Intents revenue vs L1 gas fees, last 30 days", `${h.intentsRevenueVsGas?.toFixed(1)}×`],
];
for (const [k, v] of rows) console.log(`${k.padEnd(44)} ${v}`);

console.log("\nSignals");
for (const s of data.signals) console.log(`  [${s.status.toUpperCase().padEnd(7)}] ${s.claim} — ${s.format === "bps" ? s.value?.toFixed(2) + " bps" : pct(s.value)}`);

const show = (name, why, r) => {
  console.log(`\n${name}: ${why}`);
  console.log("  Year   Volume        Buybacks      NEAR bought     NEAR issued     Coverage");
  for (const y of r.years) console.log(`  ${String(y.year).padEnd(6)} ${usd(y.volume).padEnd(13)} ${usd(y.buybackUsd).padEnd(13)} ${near(y.nearBought).padEnd(15)} ${near(y.nearIssued).padEnd(15)} ${pct(y.coverage)}`);
  console.log(`  Buybacks first match issuance: ${r.firstFullCoverage ? `month ${r.firstFullCoverage}` : "not within 3 years"}. Monthly growth needed to get there by month 36: ${pct(r.growthNeeded)}.`);
};
const sc = scenarios(data.modelInputs);
for (const s of sc) show(s.name, s.why, s.result);

const custom = { growth: flag("growth"), take: flag("take-bps"), price: flag("price"), infl: flag("inflation") };
if (Object.values(custom).some((v) => v !== undefined)) {
  const mi = data.modelInputs;
  const inputs = { startMonthlyVolume: mi.startMonthlyVolume, takeRateBps: custom.take ?? mi.takeRateBps, buybackShare: 1,
    price: custom.price ?? mi.price, supply: mi.supply, inflationPct: custom.infl ?? mi.inflationPct, monthlyGrowth: custom.growth ?? 0, months: 36 };
  show("Custom", JSON.stringify({ monthlyGrowth: inputs.monthlyGrowth, takeRateBps: inputs.takeRateBps, price: inputs.price, inflationPct: inputs.inflationPct }), project(inputs));
}

if (!offline) {
  const snapshot = { ...data, scenarios: sc.map((s) => ({ id: s.id, name: s.name, why: s.why, inputs: s.inputs, years: s.result.years, firstFullCoverage: s.result.firstFullCoverage, growthNeeded: s.result.growthNeeded })) };
  await mkdir(new URL("data/", root), { recursive: true });
  await writeFile(new URL("data/snapshot.json", root), JSON.stringify(snapshot, null, 1));
  await writeFile(new URL(`data/snapshot-${h.asOf}.json`, root), JSON.stringify(snapshot, null, 1));
  await mkdir(new URL("public/data/", root), { recursive: true });
  await writeFile(new URL("public/data/snapshot.json", root), JSON.stringify(snapshot));
  console.log(`\nSaved data/snapshot.json, data/snapshot-${h.asOf}.json and public/data/snapshot.json`);
}
