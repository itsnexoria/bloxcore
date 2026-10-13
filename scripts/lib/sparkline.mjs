// Builds the "Value history" block for item pages: an inline SVG step chart + a few stats.
// history rows come from bf_item_price_history (one row per recorded value change), so a
// step chart (value holds until the next change) is the honest way to draw it.

const DAY = 86_400_000;

// rows: [{ regular_value, recorded_at }] for ONE item, any order.
export function buildPoints(rows, currentValue, now = Date.now()) {
  const pts = [];
  [...rows]
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
    .forEach(r => {
      if (r.regular_value == null) return;
      const last = pts[pts.length - 1];
      if (!last || last.v !== Number(r.regular_value)) pts.push({ t: new Date(r.recorded_at).getTime(), v: Number(r.regular_value) });
    });
  if (!pts.length) return pts;
  // the live value is authoritative if the last recorded row is stale
  if (currentValue != null && pts[pts.length - 1].v !== Number(currentValue)) pts.push({ t: now, v: Number(currentValue) });
  return pts;
}

function svgFor(pts, now, fmt) {
  const W = 640, H = 150, PX = 8, PY = 14;
  const t0 = pts[0].t, t1 = Math.max(now, pts[pts.length - 1].t);
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
  const x = t => PX + ((t - t0) / Math.max(1, t1 - t0)) * (W - PX * 2);
  const y = v => hi === lo ? H / 2 : H - PY - ((v - lo) / (hi - lo)) * (H - PY * 2);
  let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t).toFixed(1)} V${y(pts[i].v).toFixed(1)}`;
  d += ` H${x(t1).toFixed(1)}`;
  const area = `${d} V${H - 2} H${x(t0).toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  const label = `Value history: ${fmt(pts[0].v)} on ${new Date(t0).toISOString().slice(0, 10)}, now ${fmt(last.v)}; low ${fmt(lo)}, high ${fmt(hi)}.`;
  return `<svg class="value-history-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${label}">`
    + `<path d="${area}" fill="var(--brass-bright)" opacity="0.12"/>`
    + `<path d="${d}" fill="none" stroke="var(--brass-bright)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
    + `<circle cx="${x(t1).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="4" fill="var(--brass-bright)"/></svg>`;
}

// Returns '' when there is nothing worth showing (no tracked history at all).
export function historyHtml(item, rows, fmt, now = Date.now()) {
  const pts = buildPoints(rows || [], item.regular_value, now);
  if (!pts.length) return '';
  const firstDate = new Date(pts[0].t).toISOString().slice(0, 10);
  if (pts.length === 1) {
    return `<h2 style="font-size:1.3rem;">${item.name} Value History</h2>`
      + `<p>${item.name}'s value hasn't changed since BloxCore started tracking it on ${firstDate} — it has held at <strong>${fmt(pts[0].v)}</strong>.</p>`;
  }
  const last = pts[pts.length - 1], first = pts[0];
  const pct = Math.round(((last.v - first.v) / first.v) * 100);
  const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const days = Math.max(1, Math.round((now - first.t) / DAY));
  const stat = (k, v, cls = '') => `<div><p class="value-history-k">${k}</p><p class="value-history-v ${cls}">${v}</p></div>`;
  return `<h2 style="font-size:1.3rem;">${item.name} Value History</h2>`
    + `<div class="panel value-history">${svgFor(pts, now, fmt)}`
    + `<div class="value-history-stats">`
    + stat(`Since ${firstDate}`, `${pct > 0 ? '+' : ''}${pct}%`, `is-${dir}`)
    + stat('Highest', fmt(hi)) + stat('Lowest', fmt(lo)) + stat('Changes tracked', String(pts.length - 1))
    + `</div></div>`
    + `<p class="muted" style="font-size:0.8rem;">Physical value over the last ${days} day${days === 1 ? '' : 's'}, drawn from each recorded change.</p>`;
}
