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

const CANDLE_STORE = new Map(); // id -> { rows, opts, width, geom }
const CANDLE_VIEW = new Map(); // key -> { count, endOffset }，按「标的 × 周期」记忆视图（FR-13.1）
const CANDLE_MIN_BARS = 20;
const CANDLE_W = 660; // 默认宽度；挂载后按容器实测宽度重绘（FR-13.6）

/* 视图纯函数：便于离线单测（FR-13.7） */
function candleClampView(view, rowsLen, defaultCount) {
  const minBars = Math.min(CANDLE_MIN_BARS, rowsLen);
  const count = clamp(Math.round(view && view.count) || defaultCount, minBars, rowsLen);
  const endOffset = clamp(Math.round((view && view.endOffset) || 0), 0, rowsLen - count);
  return { count, endOffset };
}

function candlePanView(view, rowsLen, deltaBars) {
  const base = candleClampView(view, rowsLen, rowsLen);
  return { count: base.count, endOffset: clamp(base.endOffset + Math.round(deltaBars), 0, rowsLen - base.count) };
}

function candleZoomView(view, rowsLen, factor, anchorRatio = 0.5) {
  const base = candleClampView(view, rowsLen, rowsLen);
  const start = rowsLen - base.endOffset - base.count;
  const anchorIdx = start + clamp(anchorRatio, 0, 1) * (base.count - 1);
  const minBars = Math.min(CANDLE_MIN_BARS, rowsLen);
  const nextCount = clamp(Math.round(base.count * factor), minBars, rowsLen);
  const nextStart = clamp(
    Math.round(anchorIdx - clamp(anchorRatio, 0, 1) * (nextCount - 1)),
    0,
    rowsLen - nextCount
  );
  return { count: nextCount, endOffset: rowsLen - nextCount - nextStart };
}

function candleGeometry(width) {
  const compact = width < 520;
  const padL = 8;
  const padR = compact ? 46 : 58;
  const mainTop = compact ? 12 : 14;
  const mainH = compact ? 168 : 212;
  const gap = 18;
  const subTop = mainTop + mainH + gap;
  const subH = compact ? 46 : 58;
  const axisBottom = subTop + subH;
  return {
    width,
    compact,
    padL,
    padR,
    mainTop,
    mainH,
    subTop,
    subH,
    axisBottom,
    usableW: width - padL - padR,
    height: axisBottom + 26,
  };
}

function candlePriceDigits(lo, hi) {
  const span = Math.abs(hi - lo);
  if (span < 0.5) return 3;
  if (span < 20) return 2;
  return hi >= 1000 ? 0 : 2;
}

function candleDateLabel(date, period) {
  const s = fmtDate(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return period === 'month' ? s.slice(2, 7) : s.slice(5);
}

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

function sliceRange(series, start, end) {
  const out = {};
  for (const key in series) out[key] = series[key].slice(start, end);
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
function renderSubPanel(sub, series, points, x, g, bodyW) {
  const right = g.padL + g.usableW;
  const guide = (yy) => `<line class="candle-guide" x1="${g.padL}" y1="${yy.toFixed(1)}" x2="${right}" y2="${yy.toFixed(1)}"/>`;
  const label = (t, yy) => `<text class="candle-vol-max" x="${right + 5}" y="${yy.toFixed(1)}">${t}</text>`;
  const tag = (t) => `<text class="candle-panel-tag" x="${g.padL + 2}" y="${(g.subTop + 10).toFixed(1)}">${t}</text>`;
  const bx = (i) => (x(i) - bodyW / 2).toFixed(1);

  if (sub === 'volume') {
    const volMax = Math.max(...points.map((p) => p.volume), 1);
    const yV = (v) => g.subTop + g.subH - (v / volMax) * g.subH;
    const bars = points
      .map((p, i) => {
        const vh = Math.max(0.5, g.subH * (p.volume / volMax));
        return `<rect class="vol-bar ${p.close >= p.open ? 'up' : 'down'}" x="${bx(i)}" y="${yV(p.volume).toFixed(
          1
        )}" width="${bodyW.toFixed(1)}" height="${vh.toFixed(1)}"/>`;
      })
      .join('');
    return `${tag('VOL')}${guide(g.subTop)}${bars}${label(fmtVolCompact(volMax), g.subTop + 9)}`;
  }

  if (sub === 'macd') {
    const vals = [...series.dif, ...series.dea, ...series.hist].filter(Number.isFinite);
    const scale = Math.max(...vals.map(Math.abs), 1e-9);
    const yS = (v) => g.subTop + g.subH / 2 - (v / scale) * (g.subH / 2);
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
    return `${tag('MACD')}${guide(y0)}${bars}<path class="sub-line a" d="${maPath(series.dif, x, yS)}"></path><path class="sub-line b" d="${maPath(
      series.dea,
      x,
      yS
    )}"></path>${label('±' + fmtSigned(scale, 2), g.subTop + 9)}`;
  }

  /* KDJ / RSI：固定 0-100 刻度 */
  const yS = (v) => g.subTop + g.subH - (clamp(v, 0, 100) / 100) * g.subH;
  if (sub === 'kdj') {
    return `${tag('KDJ')}${guide(yS(80))}${guide(yS(20))}<path class="sub-line c" d="${maPath(series.j, x, yS)}"></path><path class="sub-line a" d="${maPath(
      series.k,
      x,
      yS
    )}"></path><path class="sub-line b" d="${maPath(series.d, x, yS)}"></path>${label('100', g.subTop + 9)}${label('0', g.subTop + g.subH)}`;
  }
  /* rsi */
  return `${tag('RSI')}${guide(yS(70))}${guide(yS(30))}<path class="sub-line a" d="${maPath(series.fast, x, yS)}"></path><path class="sub-line b" d="${maPath(
    series.slow,
    x,
    yS
  )}"></path>${label('100', g.subTop + 9)}${label('0', g.subTop + g.subH)}`;
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

/* 构建图表：返回结构化的 SVG 内容，缩放/平移时就地重绘（FR-13.2 / FR-13.3） */
function buildCandle(rows, opts = {}) {
  const width = clamp(Math.round(opts.width || CANDLE_W), 320, 1600);
  const g = candleGeometry(width);
  /* 无显式 key 的一次性图表（如离线测试）使用独立视图，避免互相污染 */
  if (!opts.key) opts = { ...opts, key: uid('cview') };
  const key = opts.key;
  const defaultCount = opts.window || 240;
  const view = candleClampView(CANDLE_VIEW.get(key) || { count: defaultCount, endOffset: 0 }, rows.length, defaultCount);
  CANDLE_VIEW.set(key, view);
  const start = rows.length - view.endOffset - view.count;
  const end = start + view.count;
  const pts = rows.slice(start, end);
  const n = pts.length;

  /* 指标与几何：均线/BOLL/副图指标均基于完整历史计算，再截取可见区间（FR-4） */
  const sub = normalizeSubMode(opts.sub);
  const subOk = subAvailable(sub, rows.length);
  const bollOn = !!opts.boll && rows.length >= 20;
  const allCloses = rows.map((p) => p.close);
  const allHighs = rows.map((p) => p.high);
  const allLows = rows.map((p) => p.low);
  const ma20Full = maSeries(allCloses, 20).slice(start, end);
  const ma60Full = maSeries(allCloses, 60).slice(start, end);
  const bollFull = bollOn ? bollCalc(allCloses) : null;
  const boll = bollFull
    ? { up: bollFull.up.slice(start, end), mid: bollFull.mid.slice(start, end), low: bollFull.low.slice(start, end) }
    : null;
  const subSeries =
    subOk && sub !== 'volume'
      ? sliceRange(computeSubSeries(sub, { closes: allCloses, highs: allHighs, lows: allLows }), start, end)
      : null;

  const slot = g.usableW / n;
  const bodyW = Math.max(1, Math.min(slot * 0.64, 14));
  const x = (i) => g.padL + slot * (i + 0.5);

  const lows = pts.map((p) => p.low);
  const highs = pts.map((p) => p.high);
  const mas = [...ma20Full, ...ma60Full, ...(boll ? [...boll.up, ...boll.low] : [])].filter(Number.isFinite);
  /* FR-5.1 目标价锚点：离可见区间超过 60% 跨度的目标价不参与缩放（避免压缩蜡烛） */
  let lo = Math.min(...lows, ...mas);
  let hi = Math.max(...highs, ...mas);
  const span0 = hi - lo || 1;
  const anchors = [];
  const anchorLabels = { high: '目标高', mid: '目标中', low: '目标低' };
  if (opts.targets) {
    ['high', 'mid', 'low'].forEach((k) => {
      const v = opts.targets[k];
      if (Number.isFinite(v) && v > 0 && v >= lo - span0 * 0.6 && v <= hi + span0 * 0.6) {
        anchors.push({ key: k, value: v });
      }
    });
    if (anchors.length) {
      lo = Math.min(lo, ...anchors.map((a) => a.value));
      hi = Math.max(hi, ...anchors.map((a) => a.value));
    }
  }
  const span = hi - lo || 1;
  const digits = candlePriceDigits(lo, hi);
  /* 右侧价签需要比坐标轴更精确（如 1457.70 不能被四舍五入成 1458） */
  const tagDigits = Math.max(2, digits);
  const yP = (v) => g.mainTop + g.mainH - ((v - lo) / span) * g.mainH;
  const axisX = g.padL + g.usableW;
  /* FR-13.4：最新价虚线 + 右侧价格标签（仅在视图包含最新一根时展示） */
  const latest = pts[n - 1];
  const atLatest = end === rows.length;
  const latestUp = latest.close >= latest.open;
  const latestY = yP(latest.close);

  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((r) => {
      const v = lo + span * (1 - r);
      const y = g.mainTop + g.mainH * r;
      /* 与最新价标签重叠的刻度文字让位，避免叠字 */
      const hideLabel = atLatest && Math.abs(y - latestY) < 10;
      return `<line class="candle-grid" x1="${g.padL}" y1="${y.toFixed(1)}" x2="${axisX}" y2="${y.toFixed(1)}"/>${
        hideLabel
          ? ''
          : `<text class="candle-tick" x="${axisX + 5}" y="${(y + 3.5).toFixed(1)}">${fmtPrice(v, digits)}</text>`
      }`;
    })
    .join('');

  const candles = pts
    .map((p, i) => {
      const up = p.close >= p.open;
      const bodyTop = yP(Math.max(p.open, p.close));
      const bodyH = Math.max(1, Math.abs(yP(p.open) - yP(p.close)));
      return `<g class="candle ${up ? 'up' : 'down'}" data-i="${i}"><line x1="${x(i).toFixed(1)}" y1="${yP(p.high).toFixed(
        1
      )}" x2="${x(i).toFixed(1)}" y2="${yP(p.low).toFixed(1)}"/><rect x="${(x(i) - bodyW / 2).toFixed(
        1
      )}" y="${bodyTop.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${bodyH.toFixed(1)}" rx="0.8"/></g>`;
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
    ? renderSubPanel(sub, subSeries, pts, x, g, bodyW)
    : renderSubPanel('volume', null, pts, x, g, bodyW);
  const subSep = `<line class="candle-sep" x1="${g.padL}" y1="${(g.subTop - 9).toFixed(1)}" x2="${axisX}" y2="${(
    g.subTop -
    9
  ).toFixed(1)}"/>`;
  /* FR-5.1：目标价锚线（虚线 + 左上角标签） */
  const anchorsSvg = anchors
    .map(
      (a) => `<line class="target-line" x1="${g.padL}" y1="${yP(a.value).toFixed(1)}" x2="${axisX}" y2="${yP(a.value).toFixed(
        1
      )}"/><text class="target-label" x="${g.padL + 4}" y="${(yP(a.value) - 3).toFixed(1)}">${esc(anchorLabels[a.key])} ${fmtPrice(a.value, digits)}</text>`
    )
    .join('');

  const latestSvg = atLatest
    ? `<line class="candle-last ${latestUp ? 'up' : 'down'}" x1="${g.padL}" y1="${latestY.toFixed(
        1
      )}" x2="${axisX}" y2="${latestY.toFixed(1)}"/><g class="candle-last-tag ${
        latestUp ? 'up' : 'down'
      }"><rect x="${axisX + 1}" y="${(latestY - 7).toFixed(1)}" width="${g.padR - 4}" height="14" rx="3"/><text x="${
        axisX + 4
      }" y="${(latestY + 3.5).toFixed(1)}">${fmtPrice(latest.close, tagDigits)}</text></g>`
    : '';

  /* 日期刻度按可用宽度自适应 3–6 个（FR-13.4） */
  const tickCount = clamp(Math.round(g.usableW / 130), 3, 6);
  const tickIdx = [...new Set(Array.from({ length: tickCount }, (_, i) => Math.round((i * (n - 1)) / (tickCount - 1))))];
  const dateIdx = tickIdx
    .map(
      (i) =>
        `<text class="candle-tick date" x="${x(i).toFixed(1)}" y="${g.axisBottom + 15}">${esc(
          candleDateLabel(pts[i].date, opts.period)
        )}</text>`
    )
    .join('');

  const id = uid('cndl');
  CANDLE_STORE.set(id, {
    rows,
    pts,
    opts: { ...opts },
    width,
    geom: {
      padL: g.padL,
      padR: g.padR,
      usableW: g.usableW,
      slot,
      n,
      digits,
      tagDigits,
      mainTop: g.mainTop,
      mainH: g.mainH,
      yP,
      subTop: g.subTop,
      subH: g.subH,
    },
    sub: subOk ? sub : 'volume',
    subSeries,
    boll,
    range: { first: pts[0].date, last: pts[n - 1].date, count: n },
  });

  const subKey = subOk ? sub : 'volume';
  const subLabel = (KLINE_SUBS.find((s) => s.key === subKey) || {}).label || '量';
  const aria = `K 线图：${n} 根蜡烛，${fmtDate(pts[0].date)} 至 ${fmtDate(pts[n - 1].date)}，副图 ${subLabel}${
    boll ? '，叠加布林带' : ''
  }`;

  return {
    id,
    width: g.width,
    height: g.height,
    aria,
    range: { first: pts[0].date, last: pts[n - 1].date, count: n },
    zoomable: rows.length > CANDLE_MIN_BARS,
    inner: `${ticks}<line class="candle-axis" x1="${axisX}" y1="${g.mainTop}" x2="${axisX}" y2="${g.axisBottom}"/>${bollSvg}<path class="candle-ma ma60" d="${ma60Path}"></path><path class="candle-ma ma20" d="${ma20Path}"></path>${candles}${anchorsSvg}${subSep}${subSvg}${latestSvg}${dateIdx}<line class="candle-cross-v" data-role="v" x1="0" y1="${g.mainTop}" x2="0" y2="${g.axisBottom}" style="display:none"></line><line class="candle-cross-h" data-role="h" x1="${g.padL}" y1="0" x2="${axisX}" y2="0" style="display:none"></line><g class="candle-yp" data-role="yp" style="display:none"><rect x="${axisX + 1}" y="-7" width="${
      g.padR - 4
    }" height="14" rx="3"/><text x="${axisX + 4}" y="3.5"></text></g><rect class="candle-hover-layer" x="${
      g.padL
    }" y="${g.mainTop}" width="${g.usableW}" height="${g.axisBottom - g.mainTop}" fill="transparent"></rect>`,
  };
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

  if (rows.length < 2) return '';
  const built = buildCandle(rows, opts);
  const hint = built.zoomable
    ? `<div class="candle-hint">滚轮 / 双指缩放 · 拖拽 / 单指平移 · 双击复位</div>`
    : '';
  return `<div class="candle-wrap">
    <svg class="candle-svg" viewBox="0 0 ${built.width} ${built.height}" width="${built.width}" height="${
    built.height
  }" preserveAspectRatio="xMidYMid meet" role="img" data-candle-id="${built.id}" aria-label="${esc(
    built.aria
  )}">${built.inner}</svg>
    ${hint}<div class="candle-tip" hidden></div>
  </div>`;
}

/* 就地重绘：保留 <svg> 节点本身，避免拖拽过程中丢失 pointer capture（FR-13.2） */
function redrawCandle(svg, nextView) {
  const data = CANDLE_STORE.get(svg.dataset.candleId);
  if (!data) return;
  const host = svg.closest('.kline-wrap') || svg.parentElement;
  const width = host && host.clientWidth > 200 ? Math.round(host.clientWidth) : data.width;
  if (nextView) CANDLE_VIEW.set(data.opts.key || 'default', nextView);
  const built = buildCandle(data.rows, { ...data.opts, width });
  CANDLE_STORE.delete(svg.dataset.candleId);
  svg.dataset.candleId = built.id;
  svg.setAttribute('viewBox', `0 0 ${built.width} ${built.height}`);
  svg.setAttribute('width', String(built.width));
  svg.setAttribute('height', String(built.height));
  svg.setAttribute('aria-label', built.aria);
  svg.style.aspectRatio = `${built.width}/${built.height}`;
  svg.innerHTML = built.inner;
  const tip = host && host.querySelector('.candle-tip');
  if (tip) tip.hidden = true;
  updateCandleRangeLabel(host, built);
}

function updateCandleRangeLabel(host, built) {
  const card = host && host.closest('.chart-card');
  const el = card && card.querySelector('[data-role="kline-range"]');
  if (!el || !built.range) return;
  el.textContent = `${fmtDate(built.range.first)} — ${fmtDate(built.range.last)} · ${built.range.count} 根`;
}

/* 工具条 / 双击共用的按钮入口（FR-13.2） */
function candleZoomBy(dir) {
  const svg = $('.candle-svg');
  const data = svg && CANDLE_STORE.get(svg.dataset.candleId);
  if (!data) return;
  const view = CANDLE_VIEW.get(data.opts.key || 'default') || { count: data.geom.n, endOffset: 0 };
  redrawCandle(svg, candleZoomView(view, data.rows.length, dir === 'in' ? 0.78 : 1.28, 0.5));
}

function candleResetCurrent() {
  const svg = $('.candle-svg');
  const data = svg && CANDLE_STORE.get(svg.dataset.candleId);
  if (!data) return;
  const def = data.opts.window || 240;
  redrawCandle(svg, candleClampView({ count: def, endOffset: 0 }, data.rows.length, def));
}

/* 悬浮/点选交互：十字光标 + 详情浮层（FR-3.5，触屏点选 FR-3.8） */
function candleShowIndex(svg, i) {
  const data = CANDLE_STORE.get(svg.dataset.candleId);
  const wrap = svg.parentElement;
  if (!data || !wrap) return;
  const tip = wrap.querySelector('.candle-tip');
  const vline = svg.querySelector('[data-role="v"]');
  const hline = svg.querySelector('[data-role="h"]');
  const yTag = svg.querySelector('[data-role="yp"]');
  const hot = svg.querySelector('.candle-hot');
  if (hot) hot.classList.remove('candle-hot');
  const { pts, geom } = data;

  if (i < 0 || i >= pts.length || !tip) {
    if (tip) tip.hidden = true;
    [vline, hline, yTag].forEach((el) => {
      if (el) el.style.display = 'none';
    });
    return;
  }

  const bar = svg.querySelector(`.candle[data-i="${i}"]`);
  if (bar) bar.classList.add('candle-hot');
  const gx = geom.padL + geom.slot * (i + 0.5);
  const p = pts[i];
  const prev = pts[i - 1];
  const chg = prev && Number.isFinite(prev.close) ? (p.close / prev.close - 1) * 100 : null;
  const up = p.close >= p.open;
  const digits = geom.tagDigits || geom.digits || 2;
  if (vline) {
    vline.setAttribute('x1', gx.toFixed(1));
    vline.setAttribute('x2', gx.toFixed(1));
    vline.style.display = '';
  }
  if (hline) {
    hline.setAttribute('y1', geom.yP(p.close).toFixed(1));
    hline.setAttribute('y2', geom.yP(p.close).toFixed(1));
    hline.style.display = '';
  }
  /* FR-13.4：光标价右侧标签 */
  if (yTag) {
    const axisX = geom.padL + geom.usableW;
    const y = geom.yP(p.close);
    const rect = yTag.querySelector('rect');
    const text = yTag.querySelector('text');
    if (rect) {
      rect.setAttribute('x', axisX + 1);
      rect.setAttribute('y', (y - 7).toFixed(1));
      rect.setAttribute('width', geom.padR - 4);
    }
    if (text) {
      text.setAttribute('x', axisX + 4);
      text.setAttribute('y', (y + 3.5).toFixed(1));
      text.textContent = fmtPrice(p.close, digits);
    }
    yTag.setAttribute('class', `candle-yp ${up ? 'up' : 'down'}`);
    yTag.style.display = '';
  }
  tip.innerHTML = `<b class="${up ? 'up' : 'down'}">${esc(p.date)}</b>
    <span>开 ${fmtPrice(p.open, digits)}</span><span>收 <b class="${up ? 'up' : 'down'}">${fmtPrice(p.close, digits)}</b></span>
    <span>高 ${fmtPrice(p.high, digits)}</span><span>低 ${fmtPrice(p.low, digits)}</span>
    ${chg !== null ? `<span class="${pctClass(chg)}">涨跌 ${fmtPct(chg)}</span>` : ''}
    <span>量 ${fmtVolCompact(p.volume)}</span>${candleIndicatorTip(data, i)}`;
  tip.hidden = false;
  const svgW = svg.clientWidth || data.width || CANDLE_W;
  const scale = svgW / (data.width || CANDLE_W);
  const left = clamp(gx * scale - tip.offsetWidth / 2, 4, Math.max(4, wrap.clientWidth - tip.offsetWidth - 4));
  tip.style.left = `${left}px`;
}

function candleIndexFromEvent(svg, e) {
  const data = CANDLE_STORE.get(svg.dataset.candleId);
  if (!data) return -1;
  const rect = svg.getBoundingClientRect();
  if (!rect.width) return -1;
  const vx = ((e.clientX - rect.left) / rect.width) * data.width;
  const { padL, slot, n } = data.geom;
  return clamp(Math.floor((vx - padL) / slot), 0, n - 1);
}

/* 光标在可视区内的相对位置（0–1），用于缩放锚点（FR-13.2） */
function candleAnchorRatio(svg, clientX) {
  const data = CANDLE_STORE.get(svg.dataset.candleId);
  const rect = svg.getBoundingClientRect();
  if (!data || !rect.width) return 0.5;
  const vx = ((clientX - rect.left) / rect.width) * data.width;
  return clamp((vx - data.geom.padL) / data.geom.usableW, 0, 1);
}

function candleSlotPx(svg) {
  const data = CANDLE_STORE.get(svg.dataset.candleId);
  const rect = svg.getBoundingClientRect();
  if (!data || !rect.width) return 1;
  return data.geom.slot * (rect.width / data.width);
}

function nextFrame(fn) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
  return setTimeout(fn, 16);
}

function cancelFrame(id) {
  if (!id) return;
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}

/* 缩放 / 平移 / 双击复位（FR-13.2 / FR-13.3） */
function bindCandleEvents(svg) {
  svg.dataset.candleBound = '1';
  const pointers = new Map();
  let pan = null;
  let pinch = null;
  let raf = 0;

  const viewNow = () => {
    const d = CANDLE_STORE.get(svg.dataset.candleId);
    return d ? CANDLE_VIEW.get(d.opts.key || 'default') : null;
  };
  const schedule = (view) => {
    if (raf) return;
    raf = nextFrame(() => {
      raf = 0;
      redrawCandle(svg, view);
    });
  };
  const flushFrame = () => {
    if (!raf) return;
    cancelFrame(raf);
    raf = 0;
  };

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) pinch = null;
    if (pan) {
      const data = CANDLE_STORE.get(svg.dataset.candleId);
      /* 收尾时按最终位移重绘一次，避免最后一帧 rAF 丢失导致视图落后 */
      if (pan.moved && data) {
        flushFrame();
        redrawCandle(
          svg,
          candlePanView(pan.view, data.rows.length, Math.round((e.clientX - pan.x0) / candleSlotPx(svg)))
        );
      } else if (!pan.moved) {
        candleShowIndex(svg, candleIndexFromEvent(svg, e));
      }
      pan = null;
    }
  };

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const data = CANDLE_STORE.get(svg.dataset.candleId);
    if (!data) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      svg.setPointerCapture(e.pointerId);
    } catch (err) {}
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        view: { ...viewNow() },
        ratio: candleAnchorRatio(svg, (a.x + b.x) / 2),
      };
      pan = null;
      return;
    }
    pan = { x0: e.clientX, view: { ...viewNow() }, moved: false };
    candleShowIndex(svg, candleIndexFromEvent(svg, e));
  });

  svg.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const data = CANDLE_STORE.get(svg.dataset.candleId);
    if (!data) return;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      schedule(candleZoomView(pinch.view, data.rows.length, pinch.dist / dist, pinch.ratio));
      return;
    }
    if (pan) {
      const dx = e.clientX - pan.x0;
      if (Math.abs(dx) > 3 && !pan.moved) {
        pan.moved = true;
        candleShowIndex(svg, -1);
      }
      if (pan.moved) schedule(candlePanView(pan.view, data.rows.length, Math.round(dx / candleSlotPx(svg))));
      return;
    }
    if (e.pointerType === 'touch') return;
    candleShowIndex(svg, candleIndexFromEvent(svg, e));
  });

  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('pointerleave', (e) => {
    if (pan || pinch) return;
    if (e.pointerType !== 'touch') candleShowIndex(svg, -1);
  });

  svg.addEventListener(
    'wheel',
    (e) => {
      const data = CANDLE_STORE.get(svg.dataset.candleId);
      if (!data) return;
      e.preventDefault();
      flushFrame();
      const view = viewNow() || { count: data.geom.n, endOffset: 0 };
      const factor = e.deltaY > 0 ? 1.18 : 0.85;
      redrawCandle(svg, candleZoomView(view, data.rows.length, factor, candleAnchorRatio(svg, e.clientX)));
    },
    { passive: false }
  );

  svg.addEventListener('dblclick', () => {
    const data = CANDLE_STORE.get(svg.dataset.candleId);
    if (!data) return;
    flushFrame();
    const def = data.opts.window || 240;
    redrawCandle(svg, candleClampView({ count: def, endOffset: 0 }, data.rows.length, def));
  });
}

let candleResizeBound = false;
function bindCandleResize() {
  if (candleResizeBound || typeof window === 'undefined') return;
  candleResizeBound = true;
  let timer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      $$('.candle-svg').forEach((svg) => {
        const data = CANDLE_STORE.get(svg.dataset.candleId);
        const host = svg.closest('.kline-wrap') || svg.parentElement;
        if (data && host && Math.abs(host.clientWidth - data.width) > 40) redrawCandle(svg);
      });
    }, 200);
  });
}

function hydrateCandles(root = document) {
  /* 先清理已离开 DOM 的缓存，避免 Map 无限增长 */
  const alive = new Set($$('.candle-svg', root).map((svg) => svg.dataset.candleId));
  Array.from(CANDLE_STORE.keys()).forEach((id) => {
    if (!alive.has(id)) CANDLE_STORE.delete(id);
  });

  bindCandleResize();

  $$('.candle-svg', root).forEach((svg) => {
    const data = CANDLE_STORE.get(svg.dataset.candleId);
    if (!data) return;
    const host = svg.closest('.kline-wrap') || svg.parentElement;
    /* FR-13.6：按容器实测宽度重绘，避免固定 660 视图被拉伸 */
    if (host && host.clientWidth > 200 && Math.abs(host.clientWidth - data.width) > 40) redrawCandle(svg);
    if (!svg.dataset.candleBound) bindCandleEvents(svg);
    const fresh = CANDLE_STORE.get(svg.dataset.candleId);
    if (fresh) updateCandleRangeLabel(host, fresh);
  });
}
