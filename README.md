# NEAR Intents Thesis

**A data-backed, live and re-runnable long-term investment thesis for NEAR.**

Built at **NEAR HACKATHON 2026** for the **Investment Thesis** track.

**Live site:** https://near-intents-thesis.vercel.app

> NEAR is turning from a blockchain people build on into an exchange layer people route money through.
> Since 23 February 2026, the revenue NEAR keeps from NEAR Intents swaps buys NEAR on the open market.
> The long-term case comes down to one measurable question: **can those buybacks grow faster than the new NEAR that inflation creates?**

This repository answers that question with public data, says exactly what would prove the thesis wrong, and lets anyone re-run the model.

## For judges: 5-minute path

1. **The claim (30 s).** Read the quote above and the "Where it stands today" box at the top of the live site. The stance is computed from the data, not written by hand.
2. **The evidence (2 min).** Scroll the four charts on the site: Intents volume, revenue NEAR captures, Intents vs NEAR blockchain activity, and buybacks vs new supply. Every chart has a "Show the numbers" table and a source line.
3. **The kill switches (30 s).** "The thesis in four claims" shows four live checks with rules written in advance (holding / watch / broken).
4. **The model (1 min).** Move the sliders in "The model" section, or run it yourself:
   ```bash
   git clone https://github.com/HATWHY4041/near-intents-thesis
   cd near-intents-thesis
   npm run model                                  # fresh data, full report, saves a dated snapshot
   npm run model -- --growth 0.05 --take-bps 4    # your own assumptions
   npm start                                      # the site on http://localhost:3000
   ```
   Node 20+ only. No API keys, no dependencies to install.
5. **The paper trail (30 s).** `data/` holds a dated snapshot of every input and output, refreshed daily by a GitHub Action, so any past version of the thesis can be checked against the numbers it was based on.

## What the data said on 28 October 2026

From `data/snapshot-2026-10-28.json` (the live site always shows the latest numbers):

| Measure | Value |
| --- | --- |
| Intents swap volume, all time | $35.6B |
| Intents volume, last 90 days | $11.2B, about 4.9× the same 90 days a year earlier |
| Trend through the last 12 full months | about +3% a month (year-on-year flatters because it starts from a small base) |
| Revenue NEAR captured, last 90 days | $4.55M = 4.05 bps (0.04%) of volume |
| Buybacks | $7.30M spent since 23 Feb 2026 ≈ 3.1M NEAR; $18.4M a year at the 90-day pace |
| New NEAR from inflation, last 365 days | 31.7M NEAR (2.48%) ≈ $130M at $4.10 |
| Buybacks cover of new supply | 14% |
| Volume needed for full cover | about $880M a day, 7.1× today's $125M |
| Market cap ÷ yearly buybacks | about 290× |
| NEAR blockchain transactions per day | down 83% on a year earlier |
| Intents revenue vs the whole chain's gas fees (30 days) | 10.6× |

**Conclusion at that date:** the direction is right (order flow and revenue have moved to Intents, and buybacks are real) but the size is not there yet. Buybacks would match inflation within three years only if volume grows about 6% a month, roughly twice its 12-month trend. The thesis is therefore **early and conditional**: a small position with written exit rules, which the site re-evaluates as data changes.

## How it works

```
DefiLlama (Intents volume, fees, revenue, buybacks)  ─┐
NearBlocks (NEAR supply, transactions, gas fees)      ├─▶ lib/data.js ─▶ lib/metrics.js ─▶ api/data.js ─▶ the site
DefiLlama coins + CoinGecko (NEAR price, market cap) ─┘                         │
                                                                     public/js/model.js (same model in the browser and in Node)
                                                                                 │
                                                       scripts/model.mjs ─▶ printed report + data/snapshot-YYYY-MM-DD.json
```

- **`lib/data.js`** fetches every source in parallel (no keys) and converts NEAR amounts from yoctoNEAR with BigInt.
- **`lib/metrics.js`** builds monthly series and the headline numbers. Rates use 90-day windows because NEAR's revenue is recorded when swept to its wallets, which makes single months lumpy.
- **`public/js/model.js`** is the model: volume compounds at a monthly rate, NEAR keeps its take rate, revenue buys NEAR at a given price, inflation creates new NEAR, and coverage = NEAR bought ÷ NEAR created. Bought NEAR is held, not burned, so the model tracks NEAR removed from the market rather than a smaller total supply.
- **Scenarios** use only measured inputs: bull = the 12-month volume trend continues; base = half of it; bear = volume shrinks 3% a month and NEAR's cut falls back to its average since revenue capture began.
- **`api/data.js`** serves everything as JSON at [`/api/data`](https://near-intents-thesis.vercel.app/api/data), cached for an hour. If a source is down it serves the last snapshot and the page says so.
- **`.github/workflows/snapshot.yml`** re-runs the model every day and commits the dated snapshot.

## The four claims (the thesis's kill switches)

| Claim | Measure | Holding | Watch | Broken |
| --- | --- | --- | --- | --- |
| Intents volume keeps growing | last 90 days vs same 90 days a year earlier | ≥ 0% | 0% to −25% | < −25% |
| NEAR keeps its cut of each swap | revenue ÷ volume, 90 days | ≥ 4 bps | 2–4 bps | < 2 bps |
| Volume is broad, not a few whale days | share of 90-day volume from the 5 biggest days | ≤ 20% | ≤ 35% | > 35% |
| Buybacks catch up with new supply (milestone) | yearly buybacks ÷ yearly issuance in dollars | ≥ 50% | 10–50% | < 10% |

## Risks the site tracks

Routes going dark (on 29 Oct 2026 the 1Click API refused all Ethereum mainnet deposits), fee competition, whale-driven volume, buybacks being held rather than burned, the NEAR base chain's shrinking activity, and data-source risk. Each risk names the chart or claim where it would show up first.

## Project layout

```
public/index.html, style.css     The thesis site
public/js/app.js                 Renders numbers, charts, claims and the interactive model
public/js/charts.js              Dependency-free SVG charts with tooltips and table views
public/js/model.js               The model (shared by the browser and Node)
lib/data.js, lib/metrics.js      Data fetching and the metrics behind every claim
api/data.js                      Live JSON endpoint (Vercel serverless function)
scripts/model.mjs                npm run model: report + dated snapshot
data/                            Snapshots of every run
server.js                        Zero-dependency local server that mirrors Vercel
```

## Sources

- NEAR Intents volume, fees, revenue and buybacks: [DefiLlama](https://defillama.com/protocol/near-intents) ([adapter methodology](https://github.com/DefiLlama/dimension-adapters/blob/master/fees/near-intents))
- NEAR supply, transactions, active accounts and gas fees: [NearBlocks charts API](https://api.nearblocks.io/v1/charts)
- NEAR price and market cap: [DefiLlama coins API](https://coins.llama.fi/chart/coingecko:near) and [CoinGecko](https://www.coingecko.com/en/coins/near)
- Inflation cut from 5% to 2.5%: [NEAR One, Oct 2025](https://blog.nearone.org/announcement/2025/10/21/enhancing-near-tokenomics.html)

This is research, not financial advice.

## License

MIT
