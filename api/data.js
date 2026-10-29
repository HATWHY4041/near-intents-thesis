// GET /api/data — the live thesis numbers: headline metrics, monthly series, signals and model inputs.
// Cached at the edge for an hour. If a source is down, it serves the last committed snapshot instead.
import { readFile } from "node:fs/promises";
import { fetchAll, SOURCES } from "../lib/data.js";
import { computeAll } from "../lib/metrics.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const out = computeAll(await fetchAll());
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.statusCode = 200;
    return res.end(JSON.stringify({ live: true, sources: SOURCES, ...out }));
  } catch (err) {
    try {
      const snap = JSON.parse(await readFile(new URL("../data/snapshot.json", import.meta.url), "utf8"));
      res.setHeader("Cache-Control", "public, s-maxage=300");
      res.statusCode = 200;
      return res.end(JSON.stringify({ ...snap, live: false, liveError: String(err.message || err) }));
    } catch {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: `Live data unavailable: ${err.message || err}` }));
    }
  }
}
