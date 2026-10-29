// Small dependency-free SVG charts: bars, grouped bars and lines, with a hover tooltip and a table view.
// Colors come from CSS custom properties (--series-1… on .viz), so light and dark mode swap in one place.

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

// A "nice" step (1, 2, 2.5 or 5 × 10^k) so axis labels read cleanly: $0, $5M, $10M, $15M.
function niceStep(range, target = 4) {
  const raw = range / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
function ticks(min, max, step) {
  const out = [];
  for (let v = min; v <= max + step / 1e6; v += step) out.push(+v.toFixed(10));
  return out;
}

// spec: { series: [{ name, color: "var(--series-1)", values: [number|null], dash? }], labels: [x labels],
//         type: "bar" | "line", format: (n)=>string, yMin?, yMax?, refLine?: { y, label }, marker?: { index, label },
//         xTick: (label, i) => string|null, caption, tableHead }
export function chart(host, spec) {
  host.innerHTML = "";
  host.classList.add("viz");
  const wrap = document.createElement("div");
  wrap.className = "viz-plot";
  host.appendChild(wrap);

  const legend = document.createElement("div");
  legend.className = "viz-legend";
  if (spec.series.length > 1) {
    legend.innerHTML = spec.series.map((s) =>
      `<span><i style="background:${s.color}${s.dash ? ";background:none;border-top:2px dashed " + s.color + ";height:0" : ""}"></i>${s.name}</span>`).join("");
    host.insertBefore(legend, wrap);
  }

  const tip = document.createElement("div");
  tip.className = "viz-tip";
  tip.hidden = true;
  wrap.appendChild(tip);

  const draw = () => {
    wrap.querySelector("svg")?.remove();
    const W = Math.max(wrap.clientWidth, 280);
    const H = spec.height || (W < 520 ? 230 : 280);
    const fmt = spec.format;
    const m = { t: 12, r: 12, b: 28, l: spec.yLabelWidth || (W < 520 ? 46 : 56) };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const all = spec.series.flatMap((s) => s.values).filter((v) => v != null && isFinite(v));
    const yMin = spec.yMin ?? Math.min(0, ...all);
    const top = spec.yMax ?? Math.max(...all, spec.refLine ? spec.refLine.y : 0) * 1.04;
    const step = niceStep(top - yMin);
    const yMax = Math.ceil(top / step) * step;
    const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
    const n = spec.labels.length;
    const band = iw / n;
    const xc = (i) => m.l + band * i + band / 2;

    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": spec.caption || "" });
    wrap.insertBefore(svg, tip);

    // grid + y ticks
    for (const tv of ticks(yMin, yMax, step)) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: tv === 0 ? "viz-base" : "viz-grid" }, svg);
      const t = el("text", { x: m.l - 8, y: y(tv) + 4, class: "viz-axis", "text-anchor": "end" }, svg);
      t.textContent = fmt(tv, true);
    }
    // x labels
    spec.labels.forEach((lab, i) => {
      const s = spec.xTick ? spec.xTick(lab, i, W) : lab;
      if (!s) return;
      const t = el("text", { x: xc(i), y: H - 8, class: "viz-axis", "text-anchor": "middle" }, svg);
      t.textContent = s;
    });

    if (spec.marker) {
      const x = m.l + band * spec.marker.index;
      el("line", { x1: x, x2: x, y1: m.t, y2: m.t + ih, class: "viz-marker" }, svg);
      const t = el("text", { x: x + 6, y: m.t + 12, class: "viz-note" }, svg);
      t.textContent = spec.marker.label;
    }

    if (spec.type === "bar") {
      const k = spec.series.length;
      const gap = 2;
      const bw = Math.max(2, Math.min(28, (band * 0.72 - gap * (k - 1)) / k));
      spec.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          if (v == null) return;
          const x0 = xc(i) - (bw * k + gap * (k - 1)) / 2 + si * (bw + gap);
          const top = y(Math.max(v, 0)), bot = y(Math.min(v, 0));
          const h = Math.max(bot - top, v === 0 ? 0 : 1);
          const r = Math.min(4, bw / 2, h);
          // rounded data-end, square at the baseline
          const d = v >= 0
            ? `M${x0},${bot}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${bot}Z`
            : `M${x0},${top}V${bot - r}Q${x0},${bot} ${x0 + r},${bot}H${x0 + bw - r}Q${x0 + bw},${bot} ${x0 + bw},${bot - r}V${top}Z`;
          el("path", { d, fill: s.color, class: spec.partial && spec.partial[i] ? "viz-partial" : "" }, svg);
        });
      });
    } else {
      spec.series.forEach((s) => {
        let d = "";
        let pen = false;
        s.values.forEach((v, i) => {
          if (v == null || !isFinite(v) || v > yMax) {
            // past the top of the axis: finish the line at the edge, then lift the pen
            if (pen && v > yMax) {
              const pv = s.values[i - 1];
              const f = (yMax - pv) / (v - pv);
              d += `L${(xc(i - 1) + f * band).toFixed(1)},${y(yMax).toFixed(1)}`;
            }
            pen = false;
            return;
          }
          d += `${pen ? "L" : "M"}${xc(i).toFixed(1)},${y(Math.max(yMin, v)).toFixed(1)}`;
          pen = true;
        });
        el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
          "stroke-dasharray": s.dash ? "6 5" : "none" }, svg);
        // direct label at the end of each line
        if (spec.endLabels) {
          const li = s.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).at(-1);
          if (li != null) {
            const t = el("text", { x: Math.min(xc(li) + 6, W - 4), y: y(Math.min(yMax, s.values[li])) - 6, class: "viz-endlabel", "text-anchor": xc(li) + 60 > W ? "end" : "start" }, svg);
            t.textContent = s.name;
          }
        }
      });
    }

    if (spec.refLine) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(spec.refLine.y), y2: y(spec.refLine.y), class: "viz-ref" }, svg);
      const t = el("text", { x: m.l + 6, y: y(spec.refLine.y) - 6, class: "viz-note" }, svg);
      t.textContent = spec.refLine.label;
    }

    // hover layer: one hit column per x position
    const cross = el("line", { y1: m.t, y2: m.t + ih, class: "viz-cross", visibility: "hidden" }, svg);
    const dots = spec.type === "line" ? spec.series.map((s) => el("circle", { r: 4, fill: s.color, class: "viz-dot", visibility: "hidden" }, svg)) : [];
    const show = (i) => {
      const x = xc(i);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
      dots.forEach((d, si) => {
        const v = spec.series[si].values[i];
        if (v == null || v > yMax) return d.setAttribute("visibility", "hidden");
        d.setAttribute("cx", x); d.setAttribute("cy", y(Math.max(yMin, Math.min(yMax, v)))); d.setAttribute("visibility", "visible");
      });
      tip.innerHTML = `<b>${spec.tipLabel ? spec.tipLabel(spec.labels[i], i) : spec.labels[i]}</b>` +
        spec.series.map((s) => `<span><i style="background:${s.color}"></i>${spec.series.length > 1 ? s.name + ": " : ""}<em>${s.values[i] == null ? "n/a" : fmt(s.values[i])}</em></span>`).join("") +
        (spec.tipNote ? spec.tipNote(i) || "" : "");
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.min(Math.max(x - tw / 2, 0), W - tw)}px`;
      tip.style.top = `${m.t}px`;
    };
    const hide = () => { cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); tip.hidden = true; };
    for (let i = 0; i < n; i++) {
      const hit = el("rect", { x: m.l + band * i, y: m.t, width: band, height: ih, fill: "transparent" }, svg);
      hit.addEventListener("pointerenter", () => show(i));
      hit.addEventListener("pointerdown", () => show(i));
    }
    svg.addEventListener("pointerleave", hide);
  };

  draw();
  let last = wrap.clientWidth;
  new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - last) > 4) { last = wrap.clientWidth; draw(); } }).observe(wrap);

  // table view (the accessible, exact-numbers version of the chart)
  const det = document.createElement("details");
  det.className = "viz-table";
  det.innerHTML = `<summary>Show the numbers</summary><div class="tscroll"><table><thead><tr><th>${spec.tableHead || "Month"}</th>${spec.series.map((s) => `<th>${s.name}</th>`).join("")}</tr></thead><tbody>${
    spec.labels.map((l, i) => `<tr><td>${spec.tipLabel ? spec.tipLabel(l, i) : l}</td>${spec.series.map((s) => `<td>${s.values[i] == null ? "n/a" : spec.format(s.values[i])}</td>`).join("")}</tr>`).join("")
  }</tbody></table></div>`;
  host.appendChild(det);
}
