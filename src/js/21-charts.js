/* ============================================================
   Charts — gauge, radar, sparkline, sentiment bars
   ============================================================ */
'use strict';

function renderGauge(score, verdict, coverage) {
  const value = Number.isFinite(score) ? score : 0;
  const r = 88;
  const circ = 2 * Math.PI * r;
  const target = (circ * value) / 100;
  return `
  <div class="gauge" id="scoreGauge">
    <svg viewBox="0 0 210 210" role="img" aria-label="综合评分 ${Number.isFinite(score) ? score : '暂无'} 分">
      <circle class="gauge-track" cx="105" cy="105" r="${r}"></circle>
      <circle class="gauge-fill ${verdict.cls}" cx="105" cy="105" r="${r}"
        stroke-dasharray="0 ${circ.toFixed(1)}" stroke-dashoffset="0">
        <animate attributeName="stroke-dasharray" from="0 ${circ.toFixed(1)}" to="${target.toFixed(1)} ${circ.toFixed(
    1
  )}" dur="1.05s" fill="freeze" calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>
      </circle>
    </svg>
    <div class="gauge-center">
      <div class="score-num">${Number.isFinite(score) ? score : '—'}<small>${Number.isFinite(score) ? '/ 100' : ''}</small></div>
      <span class="verdict-pill ${verdict.cls}">${Number.isFinite(score) ? verdict.label : '数据不足'}</span>
    </div>
  </div>`;
}

function radarPoints(cx, cy, r, values) {
  return values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
      const rr = r * (clamp(v, 0, 100) / 100);
      return `${(cx + Math.cos(angle) * rr).toFixed(1)},${(cy + Math.sin(angle) * rr).toFixed(1)}`;
    })
    .join(' ');
}

function renderRadar(dims) {
  const cx = 130;
  const cy = 122;
  const r = 80;
  const vals = dims.map((d) => (d.available ? d.score : 0));
  const rings = [25, 50, 75, 100]
    .map(
      (level) =>
        `<polygon class="radar-grid" points="${radarPoints(
          cx,
          cy,
          r,
          dims.map(() => level)
        )}"></polygon>`
    )
    .join('');
  const axes = dims
    .map((_, i) => {
      const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
      return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(angle) * r).toFixed(
        1
      )}" y2="${(cy + Math.sin(angle) * r).toFixed(1)}"></line>`;
    })
    .join('');
  const area = `<polygon class="radar-area" points="${radarPoints(cx, cy, r, vals)}"></polygon>`;
  const dots = dims
    .map((d, i) => {
      const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
      const rr = r * (clamp(vals[i], 0, 100) / 100);
      return `<circle class="radar-dot" cx="${(cx + Math.cos(angle) * rr).toFixed(1)}" cy="${(
        cy +
        Math.sin(angle) * rr
      ).toFixed(1)}" r="3.2"></circle>`;
    })
    .join('');
  const labels = dims
    .map((d, i) => {
      const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
      const x = cx + Math.cos(angle) * (r + 17);
      const y = cy + Math.sin(angle) * (r + 15);
      const anchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
      const dy = i === 0 ? -6 : i === 2 ? 8 : 0;
      const text = d.available ? d.score : '—';
      return `<text class="radar-label" x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${
        d.short
      }</text><text class="radar-value" x="${x.toFixed(1)}" y="${(y + dy + 12).toFixed(1)}" text-anchor="${anchor}">${text}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 260 250" role="img" aria-label="四维因子雷达图">${rings}${axes}${area}${dots}${labels}</svg>`;
}

function renderSparkline(points) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const rows = points.slice(-240);
  const closes = rows.map((p) => p.close).filter(Number.isFinite);
  if (closes.length < 2) return '';
  const w = 640;
  const h = 112;
  const pad = 5;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i) => (i / (rows.length - 1)) * (w - pad * 2) + pad;
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const line = rows.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.close).toFixed(1)}`).join(' ');
  const area = `${line} L${x(rows.length - 1).toFixed(1)} ${h - pad} L${x(0).toFixed(1)} ${h - pad} Z`;
  const id = uid('spark');
  const lastX = x(rows.length - 1);
  const lastY = y(rows[rows.length - 1].close);
  const guides = [25, 50, 75]
    .map((pct) => {
      const gy = (h - pad * 2) * (pct / 100) + pad;
      return `<line class="spark-guide" x1="${pad}" y1="${gy.toFixed(1)}" x2="${w - pad}" y2="${gy.toFixed(1)}"/>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="近一年股价走势">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--gold)" stop-opacity=".24"/>
      <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
    </linearGradient></defs>
    ${guides}
    <path class="spark-area" d="${area}" fill="url(#${id})"></path>
    <path class="spark-line" d="${line}" vector-effect="non-scaling-stroke"></path>
    <circle class="spark-dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3"></circle>
  </svg>`;
}

function renderScoreMiniBars(coverage) {
  const on = Math.round((clamp(coverage, 0, 100) / 100) * 10);
  return Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');
}

function renderSentimentBar(s) {
  if (!s || !s.total) return '';
  const p = (n) => ((n / s.total) * 100).toFixed(1);
  return `<div class="senti-bar"><i class="pos" style="width:${p(s.pos)}%"></i><i class="neu" style="width:${p(
    s.neu
  )}%"></i><i class="neg" style="width:${p(s.neg)}%"></i></div>
  <div class="senti-legend">
    <span><i style="background:var(--red)"></i>正面 ${s.pos}</span>
    <span><i style="background:rgba(137,150,173,.6)"></i>中性 ${s.neu}</span>
    <span><i style="background:var(--green)"></i>负面 ${s.neg}</span>
  </div>`;
}
