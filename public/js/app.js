import { chart } from "./charts.js";
import { project, scenarios } from "./model.js";

const $ = (id) => document.getElementById(id);
const setK = (k, html) => document.querySelectorAll(`[data-k="${k}"]`).forEach((n) => (n.innerHTML = html));

// ---- formatting ----
const usd = (n, short = false) => {
  if (n == null || !isFinite(n)) return "n/a";
  if (n === 0) return "$0";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(a >= 1e10 || short ? 1 : 2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 || short ? 0 : 1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(a < 10 ? 2 : 0)}`;
};
const pct = (n, d = 0) => (n == null || !isFinite(n) ? "n/a" : `${(n * 100).toFixed(d)}%`);
const signed = (n, d = 0) => (n == null ? "n/a" : `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(d)}%`);
const nearAmt = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M NEAR` : `${Math.round(n / 1e3)}K NEAR`);
const int = (n) => Math.round(n).toLocaleString("en-US");
const monthName = (k, short = true) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-US", { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" });
const dateLong = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const STATUS = { holding: "✓ Holding", watch: "◐ Watch", broken: "✕ Broken", unknown: "? No data" };

async function load() {
  try {
    const r = await fetch("/api/data");
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    const r = await fetch("/data/snapshot.json");
    return { ...(await r.json()), live: false };
  }
}

function render(d) {
  const h = d.headline;
  const mi = d.modelInputs;
  const sc = scenarios(mi);
  const byId = Object.fromEntries(sc.map((s) => [s.id, s]));

  $("live").classList.add(d.live ? "on" : "stale");
  const shortDate = new Date(`${h.asOf}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  $("live-text").textContent = d.live ? `Live · ${shortDate}` : `Snapshot · ${shortDate}`;
  $("live").title = d.live ? `Live data through ${dateLong(h.asOf)}, refreshed hourly` : "Live sources unreachable; showing the last saved snapshot";
  setK("asOfLong", new Date(`${h.asOf}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }));

  const M = d.monthly;
  const best = M.reduce((a, b) => (b.volume > a.volume && !b.partial ? b : a), M[0]);

  // tiles
  setK("vol90", usd(h.vol90));
  setK("volYoYText", `${signed(h.volYoY)} on a year ago · trend ${signed(h.monthlyGrowthTrend, 1)}/month`);
  setK("takeRate", `${h.takeRateBps.toFixed(1)} bps`);
  setK("rev90Text", `${usd(h.rev90)} kept in 90 days (${(h.takeRateBps / 100).toFixed(3)}%)`);
  setK("buybackAnnual", usd(h.buybackAnnual));
  setK("buyStartText", `${usd(h.buybacksAllTime)} spent since ${dateLong(h.buybackStart)}`);
  setK("issuanceUsd", usd(h.issuanceUsdYear));
  setK("issuanceText", `${nearAmt(h.issuedYear)} (${h.inflationPct.toFixed(2)}%) at $${h.price.toFixed(2)}`);
  setK("coverage", pct(h.coverage));
  setK("breakevenText", `Full cover needs ${h.breakevenMultiple.toFixed(1)}× today's volume`);
  setK("l1Txns", `${int(h.l1TxnsNow / 1000)}K/day`);
  setK("l1YoYText", `${signed(h.l1TxnsYoY)} vs a year ago`);

  // verdict: the stance follows from the numbers, so it changes when they do
  const need = byId.base.result.growthNeeded;
  const trend = mi.monthlyGrowthTrend;
  const when = (s) => (s.result.firstFullCoverage ? `month ${s.result.firstFullCoverage}` : "not within 3 years");
  let stance;
  if (trend >= need) stance = `<strong>Stance: constructive.</strong> The 12-month trend (${signed(trend, 1)} a month) is already at or above the ${signed(need, 1)} a month the thesis needs. Hold a long-term position while the four claims below hold.`;
  else if (trend >= need / 2) stance = `<strong>Stance: constructive but conditional.</strong> The 12-month trend (${signed(trend, 1)} a month) is about half of the ${signed(need, 1)} a month needed. Build a position slowly and add only if the trend keeps rising toward that level.`;
  else stance = `<strong>Stance: early, and conditional.</strong> The direction is right but the 12-month trend (${signed(trend, 1)} a month) is well short of the ${signed(need, 1)} a month needed for buybacks to absorb inflation within three years. The case rests on volume stepping up again, as it did in ${monthName(best.month, false)}: a small position with written exit rules, not a core holding.`;
  $("verdict-text").innerHTML =
    `Intents moved <strong>${usd(h.vol90)}</strong> in the last 90 days and NEAR kept <strong>${h.takeRateBps.toFixed(1)} bps</strong> of it. ` +
    `That pays for about <strong>${usd(h.buybackAnnual)}</strong> of buybacks a year, against <strong>${usd(h.issuanceUsdYear)}</strong> of new NEAR from inflation: <strong>${pct(h.coverage)}</strong> covered. ` +
    `Buybacks match new supply in the bull case at ${when(byId.bull)}, and in the base case ${when(byId.base) === "not within 3 years" ? "not within 3 years" : "at " + when(byId.base)}.` +
    `<br><br>${stance}`;

  // claims
  $("claims-list").innerHTML = d.signals.map((s) => `
    <div class="claim">
      <div class="claim-top"><h3>${s.claim}</h3><span class="pill ${s.status}">${STATUS[s.status]}</span></div>
      <div class="num">${s.format === "bps" ? `${s.value?.toFixed(1)} bps` : s.id === "growth" ? signed(s.value) : pct(s.value)}</div>
      <p>${s.measure}</p>
      <p class="rule">${s.rule}</p>
    </div>`).join("");

  // charts
  const labels = M.map((m) => m.month);
  const xTick = (step) => (k, i, W) => {
    const every = W < 520 ? step * 2 : step;
    return (labels.length - 1 - i) % every === 0 ? monthName(k) : null;
  };
  const tipLabel = (k, i) => `${monthName(k, false)}${M[i]?.partial ? ` (${M[i].daysCovered} days so far)` : ""}`;
  const fmtUsd = (v, axis) => usd(v, axis);

  setK("volTake", `<strong>${usd(h.volumeAllTime)}</strong> has moved through Intents since launch, and the best full month so far was ${monthName(best.month, false)} at <strong>${usd(best.volume)}</strong>. The last 90 days are ${signed(h.volYoY)} on a year earlier, but that compares against a small base: the trend through the last 12 full months is a steadier <strong>${signed(h.monthlyGrowthTrend, 1)} a month</strong>, after a long flat stretch.`);
  chart($("ch-volume"), {
    type: "bar", labels, format: fmtUsd, caption: "Monthly NEAR Intents volume",
    series: [{ name: "Volume", color: "var(--series-1)", values: M.map((m) => m.volume) }],
    partial: M.map((m) => m.partial), xTick: xTick(3), tipLabel,
  });

  const buyIdx = labels.indexOf(h.buybackStart?.slice(0, 7));
  setK("revTake", `NEAR kept <strong>${usd(h.revenueAllTime)}</strong> from Intents so far, about ${(h.captureShare * 100).toFixed(0)}% of gross fees. Since buybacks began, <strong>${usd(h.buybacksAllTime)}</strong> has bought roughly <strong>${nearAmt(h.nearBought)}</strong>.`);
  chart($("ch-revenue"), {
    type: "bar", labels, format: fmtUsd, caption: "Monthly revenue NEAR captured from Intents",
    series: [{ name: "Revenue to NEAR", color: "var(--series-1)", values: M.map((m) => m.revenue) }],
    partial: M.map((m) => m.partial), xTick: xTick(3), tipLabel,
    marker: buyIdx >= 0 ? { index: buyIdx, label: "Buybacks start" } : null,
  });

  // indexed: per-day volume vs per-day L1 transactions, base = first full month with both
  const baseI = M.findIndex((m) => !m.partial && m.volume > 0 && m.l1TxnsPerDay);
  const vpd = M.map((m) => (m.daysCovered ? m.volume / m.daysCovered : null));
  const idxVol = M.map((m, i) => (i < baseI ? null : (vpd[i] / vpd[baseI]) * 100));
  const idxTx = M.map((m, i) => (i < baseI || !m.l1TxnsPerDay ? null : (m.l1TxnsPerDay / M[baseI].l1TxnsPerDay) * 100));
  const lastI = M.length - 1;
  setK("shiftTake", `Since ${monthName(M[baseI].month, false)}, daily Intents volume is <strong>${(idxVol[lastI] / 100).toFixed(1)}×</strong> its starting level while daily transactions on the NEAR blockchain are at <strong>${idxTx[lastI].toFixed(0)}%</strong> of theirs. In the last 30 days, Intents revenue was <strong>${h.intentsRevenueVsGas.toFixed(0)}×</strong> the gas fees the whole chain paid.`);
  chart($("ch-shift"), {
    type: "line", labels: labels.slice(baseI), format: (v) => v.toFixed(0), caption: "Intents volume vs NEAR blockchain transactions, indexed",
    series: [
      { name: "Intents volume", color: "var(--series-1)", values: idxVol.slice(baseI) },
      { name: "Blockchain transactions", color: "var(--series-2)", values: idxTx.slice(baseI) },
    ],
    refLine: { y: 100, label: `${monthName(M[baseI].month)} = 100` }, endLabels: true,
    xTick: (k, i, W) => ((labels.length - 1 - baseI - i) % (W < 520 ? 6 : 3) === 0 ? monthName(k) : null),
    tipLabel: (k) => monthName(k, false), tableHead: "Month (index)",
  });

  const gapFrom = Math.max(0, buyIdx);
  const G = M.slice(gapFrom);
  setK("gapTake", `Buybacks are real but small next to inflation: at the 90-day pace they absorb <strong>${pct(h.coverage)}</strong> of new supply. Full cover needs about <strong>${usd(h.breakevenDailyVolume)}</strong> of volume a day, against <strong>${usd(h.dailyVolume)}</strong> today.`);
  chart($("ch-gap"), {
    type: "bar", labels: G.map((m) => m.month), format: fmtUsd, caption: "Monthly buybacks vs value of new NEAR",
    series: [
      { name: "Buybacks", color: "var(--series-1)", values: G.map((m) => m.buybacks) },
      { name: "New NEAR from inflation", color: "var(--series-2)", values: G.map((m) => m.issuanceUsd) },
    ],
    xTick: (k) => monthName(k), tipLabel: (k, i) => `${monthName(k, false)}${G[i]?.partial ? " (partial)" : ""}`,
  });

  // valuation
  setK("valP1", `At $${h.price.toFixed(2)}, NEAR is worth <strong>${usd(h.marketCap)}</strong>. Buybacks at the current pace are ${usd(h.buybackAnnual)} a year, so the market pays about <strong>${h.marketCapToBuybacks.toFixed(0)}×</strong> yearly buybacks. A multiple that high only makes sense if that cash flow grows many times over.`);
  setK("valP2", `What closes that gap is growth, not cost-cutting: revenue scales with volume while issuance is fixed by the protocol at about ${h.inflationPct.toFixed(1)}% a year. If volume reached the ${h.breakevenMultiple.toFixed(1)}× needed to cover issuance, buybacks would be about ${usd(h.issuanceUsdYear)} a year and the multiple would fall to roughly ${(h.marketCap / h.issuanceUsdYear).toFixed(0)}× at today's price.`);
  const facts = [
    ["Price", `$${h.price.toFixed(2)}`], ["Market cap", usd(h.marketCap)], ["Total supply", nearAmt(h.supply)],
    ["Inflation (last 365 days)", `${h.inflationPct.toFixed(2)}%`], ["Gross fee rate", `${h.feeRateBps.toFixed(1)} bps`],
    ["NEAR's take rate", `${h.takeRateBps.toFixed(1)} bps`], ["Revenue, yearly pace", usd(h.revenueAnnual)],
    ["Market cap ÷ buybacks", `${h.marketCapToBuybacks.toFixed(0)}×`], ["Volume for full cover", `${usd(h.breakevenDailyVolume)}/day`],
  ];
  $("facts").innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  // model
  const ctl = { growth: $("i-growth"), take: $("i-take"), price: $("i-price"), infl: $("i-infl") };
  let active = "base";
  const setSliders = (inp) => {
    ctl.growth.value = (inp.monthlyGrowth * 100).toFixed(2);
    ctl.take.value = inp.takeRateBps.toFixed(1);
    ctl.price.value = inp.price.toFixed(2);
    ctl.infl.value = inp.inflationPct.toFixed(2);
  };
  const current = () => ({
    ...byId.base.inputs,
    monthlyGrowth: Number(ctl.growth.value) / 100, takeRateBps: Number(ctl.take.value),
    price: Number(ctl.price.value), inflationPct: Number(ctl.infl.value),
  });
  const update = () => {
    const inp = current();
    $("o-growth").textContent = `${inp.monthlyGrowth >= 0 ? "+" : ""}${(inp.monthlyGrowth * 100).toFixed(2)}%`;
    $("o-take").textContent = `${inp.takeRateBps.toFixed(1)} bps`;
    $("o-price").textContent = `$${inp.price.toFixed(2)}`;
    $("o-infl").textContent = `${inp.inflationPct.toFixed(2)}%`;
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.s === active)));
    $("why").textContent = active ? byId[active].why : "Your own assumptions.";
    const r = project(inp);
    $("mstats").innerHTML = `
      <div><span>Coverage in year 3</span><b>${pct(r.years[2].coverage)}</b></div>
      <div><span>Buybacks match new supply</span><b>${r.firstFullCoverage ? `Month ${r.firstFullCoverage}` : "Not in 3 years"}</b></div>
      <div><span>Growth needed to match by month 36</span><b>${signed(r.growthNeeded, 1)}/mo</b></div>`;
    $("ytable").innerHTML = `<thead><tr><th>Year</th><th>Volume</th><th>Buybacks</th><th>NEAR bought</th><th>NEAR created</th><th>Coverage</th></tr></thead><tbody>${
      r.years.map((y) => `<tr><td>Year ${y.year}</td><td>${usd(y.volume)}</td><td>${usd(y.buybackUsd)}</td><td>${nearAmt(y.nearBought)}</td><td>${nearAmt(y.nearIssued)}</td><td>${pct(y.coverage)}</td></tr>`).join("")}</tbody>`;
    const ml = r.rows.map((x) => `M${x.m}`);
    chart($("ch-model"), {
      type: "line", labels: ml, format: (v) => `${v.toFixed(0)}%`, caption: "Projected coverage of new NEAR by buybacks",
      yMin: 0, yMax: Math.max(150, Math.min(300, Math.max(...sc.map((s) => s.result.rows.at(-1).coverage * 100), r.rows.at(-1).coverage * 100))),
      series: [
        ...sc.map((s, i) => ({ name: s.name, color: `var(--series-${i + 1})`, values: s.result.rows.map((x) => x.coverage * 100) })),
        { name: "Your settings", color: "var(--ink)", dash: true, values: r.rows.map((x) => x.coverage * 100) },
      ],
      refLine: { y: 100, label: "Buybacks = new supply" }, endLabels: false,
      xTick: (k, i, W) => ((i + 1) % (W < 520 ? 12 : 6) === 0 ? `Month ${i + 1}` : null),
      tipLabel: (k, i) => `Month ${i + 1}`, tableHead: "Month",
    });
  };
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { active = b.dataset.s; setSliders(byId[active].inputs); update(); }));
  Object.values(ctl).forEach((c) => c.addEventListener("input", () => { active = null; update(); }));
  $("reset").addEventListener("click", () => { active = "base"; setSliders(byId.base.inputs); update(); });
  setSliders(byId.base.inputs);
  update();

  // sources
  $("sources").innerHTML = Object.values(d.sources || {}).map((s) => `<li><a href="${s.page}">${s.label}</a> · <a href="${s.url}">API</a></li>`).join("");
  $("gen").textContent = `Generated ${new Date(d.generatedAt).toUTCString()}. Volume and revenue through ${dateLong(h.asOf)}; chain data through ${dateLong(h.chainAsOf)}.${d.live ? "" : " Live sources were unreachable, so this is the last saved snapshot."}`;
}

load().then(render).catch((err) => {
  $("live-text").textContent = "Data unavailable";
  $("verdict-text").textContent = `Could not load data right now (${err.message}). Try again in a minute.`;
});
