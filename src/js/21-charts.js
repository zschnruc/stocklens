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

/* ============================================================
   Candlestick chart (FR-3.1 ~ FR-3.5, FR-3.8, FR-3.9)
   纯 SVG：蜡烛 + MA20/MA60 + 成交量副图 + 十字光标悬浮详情
   ============================================================ */

const CANDLE_STORE = new Map(); // uid -> { pts, geom }
const CANDLE_W = 660;
const CANDLE_H = 312;

function fmtVolCompact(v) {
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '万';
  return String(Math.round(v));
}

function maSeries(closes, n) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function maPath(vals, x, y) {
  let d = '';
  let open = false;
  vals.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    open = true;
  });
  return d.trim();
}

function sliceSeries(series, n) {
  const out = {};
  for (const key in series) out[key] = series[key].slice(-n);
  return out;
}

function bandAreaPath(upper, lower, x, y) {
  const fwd = [];
  const rev = [];
  for (let i = 0; i < upper.length; i++) {
    if (!Number.isFinite(upper[i]) || !Number.isFinite(lower[i])) continue;
    fwd.push(`${fwd.length ? 'L' : 'M'}${x(i).toFixed(1)} ${y(upper[i]).toFixed(1)}`);
    rev.push(`L${x(i).toFixed(1)} ${y(lower[i]).toFixed(1)}`);
  }
  if (fwd.length < 2) return '';
  return `${fwd.join(' ')} ${rev.reverse().join(' ')} Z`;
}

/* 副图绘制：量 / MACD / KDJ / RSI（FR-4.1 ~ FR-4.4） */
function renderSubPanel(sub, series, points, x, top, h, bodyW) {
  const x0 = 8;
  const right = CANDLE_W - 58;
  const guide = (yy) => `<line class="candle-guide" x1="${x0}" y1="${yy.toFixed(1)}" x2="${right}" y2="${yy.toFixed(1)}"/>`;
  const label = (t, yy) => `<text class="candle-vol-max" x="${right + 6}" y="${yy.toFixed(1)}">${t}</text>`;
  const bx = (i) => (x(i) - bodyW / 2).toFixed(1);

  if (sub === 'volume') {
    const volMax = Math.max(...points.map((p) => p.volume), 1);
    const yV = (v) => top + h - (v / volMax) * h;
    const bars = points
      .map((p, i) => {
        const vh = Math.max(0.5, h * (p.volume / volMax));
        return `<rect class="vol-bar ${p.close >= p.open ? 'up' : 'down'}" x="${bx(i)}" y="${yV(p.volume).toFixed(
          1
        )}" width="${bodyW.toFixed(1)}" height="${vh.toFixed(1)}"/>`;
      })
      .join('');
    return `${guide(top)}${bars}${label(fmtVolCompact(volMax), top + 9)}`;
  }

  if (sub === 'macd') {
    const vals = [...series.dif, ...series.dea, ...series.hist].filter(Number.isFinite);
    const scale = Math.max(...vals.map(Math.abs), 1e-9);
    const yS = (v) => top + h / 2 - (v / scale) * (h / 2);
    const y0 = yS(0);
    const bars = series.hist
      .map((v, i) => {
        if (!Number.isFinite(v)) return '';
        const yv = yS(v);
        const bh = Math.max(0.5, Math.abs(yv - y0));
        return `<rect class="sub-hist ${v >= 0 ? 'up' : 'down'}" x="${bx(i)}" y="${Math.min(y0, yv).toFixed(
          1
        )}" width="${bodyW.toFixed(1)}" height="${bh.toFixed(1)}"/>`;
      })
      .join('');
    return `${guide(y0)}${bars}<path class="sub-line a" d="${maPath(series.dif, x, yS)}"></path><path class="sub-line b" d="${maPath(
      series.dea,
      x,
      yS
    )}"></path>${label('±' + fmtSigned(scale, 2), top + 9)}`;
  }

  /* KDJ / RSI：固定 0-100 刻度 */
  const yS = (v) => top + h - (clamp(v, 0, 100) / 100) * h;
  if (sub === 'kdj') {
    return `${guide(yS(80))}${guide(yS(20))}<path class="sub-line c" d="${maPath(series.j, x, yS)}"></path><path class="sub-line a" d="${maPath(
      series.k,
      x,
      yS
    )}"></path><path class="sub-line b" d="${maPath(series.d, x, yS)}"></path>${label('100', top + 9)}${label('0', top + h)}`;
  }
  /* rsi */
  return `${guide(yS(70))}${guide(yS(30))}<path class="sub-line a" d="${maPath(series.fast, x, yS)}"></path><path class="sub-line b" d="${maPath(
    series.slow,
    x,
    yS
  )}"></path>${label('100', top + 9)}${label('0', top + h)}`;
}

/* 悬浮详情里当前档位副图与 BOLL 的数值（FR-4.6） */
function candleIndicatorTip(data, i) {
  const { sub, subSeries, boll } = data;
  const sign = (v, digits = 2) => (Number.isFinite(v) ? `<b class="${v >= 0 ? 'up' : 'down'}">${fmtSigned(v, digits)}</b>` : '—');
  const plain = (v, digits = 2) => (Number.isFinite(v) ? fmtPrice(v, digits) : '—');
  let html = '';
  if (sub === 'macd' && subSeries) {
    html += `<span>DIF ${sign(subSeries.dif[i])}</span><span>DEA ${sign(subSeries.dea[i])}</span><span>MACD ${sign(subSeries.hist[i])}</span>`;
  } else if (sub === 'kdj' && subSeries) {
    html += `<span>K ${plain(subSeries.k[i], 1)}</span><span>D ${plain(subSeries.d[i], 1)}</span><span>J ${plain(subSeries.j[i], 1)}</span>`;
  } else if (sub === 'rsi' && subSeries) {
    html += `<span>RSI6 ${plain(subSeries.fast[i], 1)}</span><span>RSI12 ${plain(subSeries.slow[i], 1)}</span>`;
  }
  if (boll && Number.isFinite(boll.mid[i])) {
    html += `<span>布林 ${plain(boll.low[i])} / ${plain(boll.mid[i])} / ${plain(boll.up[i])}</span>`;
  }
  return html;
}

function renderCandlestick(points, opts = {}) {
  const rows = (Array.isArray(points) ? points : [])
    .map((p) => ({
      date: p.date,
      open: num(p.open),
      close: num(p.close),
      high: num(p.high),
      low: num(p.low),
      volume: num(p.volume, 0),
    }))
    .filter((p) => p.date && Number.isFinite(p.open) && Number.isFinite(p.close) && Number.isFinite(p.high) && Number.isFinite(p.low) && p.high >= p.low);

  const want = Math.min(opts.window || 240, 300);
  const pts = rows.slice(-Math.max(2, want));
  if (pts.length < 2) return '';

  /* 指标与几何：均线/BOLL/副图指标均基于完整历史计算，再截取窗口（FR-4） */
  const sub = normalizeSubMode(opts.sub);
  const subOk = subAvailable(sub, rows.length);
  const bollOn = !!opts.boll && rows.length >= 20;
  const allCloses = rows.map((p) => p.close);
  const allHighs = rows.map((p) => p.high);
  const allLows = rows.map((p) => p.low);
  const ma20Full = maSeries(allCloses, 20).slice(-pts.length);
  const ma60Full = maSeries(allCloses, 60).slice(-pts.length);
  const bollFull = bollOn ? bollCalc(allCloses) : null;
  const boll = bollFull
    ? { up: bollFull.up.slice(-pts.length), mid: bollFull.mid.slice(-pts.length), low: bollFull.low.slice(-pts.length) }
    : null;
  const subSeries =
    subOk && sub !== 'volume'
      ? sliceSeries(computeSubSeries(sub, { closes: allCloses, highs: allHighs, lows: allLows }), pts.length)
      : null;

  const padL = 8;
  const padR = 58;
  const mainTop = 10;
  const mainH = 208;
  const subTop = mainTop + mainH + 18;
  const subH = 58;
  const usableW = CANDLE_W - padL - padR;
  const n = pts.length;
  const slot = usableW / n;
  const bodyW = Math.max(1, Math.min(slot * 0.62, 13));
  const x = (i) => padL + slot * (i + 0.5);

  const lows = pts.map((p) => p.low);
  const highs = pts.map((p) => p.high);
  const mas = [...ma20Full, ...ma60Full, ...(boll ? [...boll.up, ...boll.low] : [])].filter(Number.isFinite);
  const min = Math.min(...lows, ...mas);
  const max = Math.max(...highs, ...mas);
  const span = max - min || 1;
  const yP = (v) => mainTop + mainH - ((v - min) / span) * mainH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const v = min + span * (1 - r);
    return `<line class="candle-grid" x1="${padL}" y1="${(mainTop + mainH * r).toFixed(1)}" x2="${padL + usableW}" y2="${(
      mainTop +
      mainH * r
    ).toFixed(1)}"/><text class="candle-tick" x="${padL + usableW + 6}" y="${(mainTop + mainH * r + 3.5).toFixed(1)}">${fmtPrice(v)}</text>`;
  }).join('');

  const candles = pts
    .map((p, i) => {
      const up = p.close >= p.open;
      const bodyTop = yP(Math.max(p.open, p.close));
      const bodyH = Math.max(1, Math.abs(yP(p.open) - yP(p.close)));
      return `<g class="candle ${up ? 'up' : 'down'}" data-i="${i}"><line x1="${x(i).toFixed(1)}" y1="${yP(p.high).toFixed(
        1
      )}" x2="${x(i).toFixed(1)}" y2="${yP(p.low).toFixed(1)}"/><rect x="${(x(i) - bodyW / 2).toFixed(
        1
      )}" y="${bodyTop.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${bodyH.toFixed(1)}"/></g>`;
    })
    .join('');

  const ma20Path = maPath(ma20Full, x, yP);
  const ma60Path = maPath(ma60Full, x, yP);
  const bollSvg = boll
    ? `<path class="candle-boll-area" d="${bandAreaPath(boll.up, boll.low, x, yP)}"></path><path class="candle-boll" d="${maPath(
        boll.up,
        x,
        yP
      )}"></path><path class="candle-boll" d="${maPath(boll.low, x, yP)}"></path>`
    : '';
  /* FR-4.7：请求的副图档位数据不足时，降级为成交量副图 */
  const subSvg = subOk
    ? renderSubPanel(sub, subSeries, pts, x, subTop, subH, bodyW)
    : renderSubPanel('volume', null, pts, x, subTop, subH, bodyW);

  const dateIdx = [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => `<text class="candle-tick date" x="${x(i).toFixed(1)}" y="${subTop + subH + 15}">${esc(pts[i].date)}</text>`)
    .join('');

  const id = uid('cndl');
  CANDLE_STORE.set(id, {
    pts,
    geom: { padL, slot, n, mainTop, mainH, yP, subTop, subH },
    sub: subOk ? sub : 'volume',
    subSeries,
    boll,
  });

  const subLabel = KLINE_SUBS.find((s) => s.key === sub).label;
  return `<div class="candle-wrap">
    <svg class="candle-svg" viewBox="0 0 ${CANDLE_W} ${CANDLE_H}" preserveAspectRatio="none" role="img" data-candle-id="${id}"
      aria-label="K 线图：${n} 根蜡烛，副图 ${esc(subLabel)}${boll ? '，叠加布林带' : ''}">
      ${ticks}
      ${bollSvg}
      <path class="candle-ma ma60" d="${ma60Path}"></path>
      <path class="candle-ma ma20" d="${ma20Path}"></path>
      ${candles}
      ${subSvg}
      ${dateIdx}
      <line class="candle-cross-v" data-role="v" x1="0" y1="${mainTop}" x2="0" y2="${subTop + subH}" hidden></line>
      <line class="candle-cross-h" data-role="h" x1="${padL}" y1="0" x2="${padL + usableW}" y2="0" hidden></line>
      <rect class="candle-hover-layer" x="${padL}" y="${mainTop}" width="${usableW}" height="${subTop + subH - mainTop}" fill="transparent"></rect>
    </svg>
    <div class="candle-tip" hidden></div>
  </div>`;
}

/* 悬浮/点选交互：十字光标 + 详情浮层（FR-3.5，触屏点选 FR-3.8） */
function candleShowIndex(svg, i) {
  const data = CANDLE_STORE.get(svg.dataset.candleId);
  const wrap = svg.parentElement;
  if (!data || !wrap) return;
  const tip = wrap.querySelector('.candle-tip');
  const vline = svg.querySelector('[data-role="v"]');
  const hline = svg.querySelector('[data-role="h"]');
  const hot = svg.querySelector('.candle-hot');
  if (hot) hot.classList.remove('candle-hot');
  const { pts, geom } = data;

  if (i < 0 || i >= pts.length || !tip) {
    if (tip) tip.hidden = true;
    if (vline) vline.hidden = true;
    if (hline) hline.hidden = true;
    return;
  }

  const bar = svg.querySelector(`.candle[data-i="${i}"]`);
  if (bar) bar.classList.add('candle-hot');
  const gx = geom.padL + geom.slot * (i + 0.5);
  const p = pts[i];
  const prev = pts[i - 1];
  const chg = prev && Number.isFinite(prev.close) ? (p.close / prev.close - 1) * 100 : null;
  const up = p.close >= p.open;
  if (vline) {
    vline.setAttribute('x1', gx.toFixed(1));
    vline.setAttribute('x2', gx.toFixed(1));
    vline.hidden = false;
  }
  if (hline) {
    hline.setAttribute('y1', geom.yP(p.close).toFixed(1));
    hline.setAttribute('y2', geom.yP(p.close).toFixed(1));
    hline.hidden = false;
  }
  tip.innerHTML = `<b class="${up ? 'up' : 'down'}">${esc(p.date)}</b>
    <span>开 ${fmtPrice(p.open)}</span><span>收 <b class="${up ? 'up' : 'down'}">${fmtPrice(p.close)}</b></span>
    <span>高 ${fmtPrice(p.high)}</span><span>低 ${fmtPrice(p.low)}</span>
    ${chg !== null ? `<span class="${pctClass(chg)}">涨跌 ${fmtPct(chg)}</span>` : ''}
    <span>量 ${fmtVolCompact(p.volume)}</span>${candleIndicatorTip(data, i)}`;
  tip.hidden = false;
  const svgW = svg.clientWidth || CANDLE_W;
  const scale = svgW / CANDLE_W;
  const left = clamp(gx * scale - tip.offsetWidth / 2, 4, Math.max(4, wrap.clientWidth - tip.offsetWidth - 4));
  tip.style.left = `${left}px`;
}

function candleIndexFromEvent(svg, e) {
  const rect = svg.getBoundingClientRect();
  const vx = ((e.clientX - rect.left) / rect.width) * CANDLE_W;
  const data = CANDLE_STORE.get(svg.dataset.candleId);
  if (!data) return -1;
  const { padL, slot, n } = data.geom;
  return clamp(Math.floor((vx - padL) / slot), 0, n - 1);
}

function hydrateCandles(root = document) {
  /* 先清理已离开 DOM 的缓存，避免 Map 无限增长 */
  const alive = new Set($$('.candle-svg', root).map((svg) => svg.dataset.candleId));
  Array.from(CANDLE_STORE.keys()).forEach((id) => {
    if (!alive.has(id)) CANDLE_STORE.delete(id);
  });

  $$('.candle-svg', root).forEach((svg) => {
    if (svg.dataset.candleBound) return;
    svg.dataset.candleBound = '1';
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      candleShowIndex(svg, candleIndexFromEvent(svg, e));
    });
    svg.addEventListener('pointerdown', (e) => candleShowIndex(svg, candleIndexFromEvent(svg, e)));
    svg.addEventListener('pointerleave', () => candleShowIndex(svg, -1));
  });
}
