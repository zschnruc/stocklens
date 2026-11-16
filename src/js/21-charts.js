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
   Candlestick chart — klinecharts v10 渲染引擎（FR-3 / FR-4 / FR-5）
   引擎来自 vendor/klinecharts.min.js（UMD 内联，全局 klinecharts）。
   mountKline 失败（缺 vendor 或 canvas 不可用）时返回 false，
   由调用方降级为 sparkline（FR-3.6）。
   ============================================================ */

const KLINE_INSTANCES = new Map(); // 宿主 DOM -> chart 实例

/* 数据映射：api 的 {date:'YYYY-MM-DD'} -> klinecharts KLineData */
function toKLineData(points) {
  return (Array.isArray(points) ? points : [])
    .map((p) => ({
      date: p.date,
      open: num(p.open),
      close: num(p.close),
      high: num(p.high),
      low: num(p.low),
      volume: num(p.volume, 0),
    }))
    .filter(
      (p) =>
        p.date &&
        Number.isFinite(p.open) &&
        Number.isFinite(p.close) &&
        Number.isFinite(p.high) &&
        Number.isFinite(p.low) &&
        p.high >= p.low
    )
    .map((p) => {
      const ts = Date.parse(p.date); /* 'YYYY-MM-DD' 按 UTC 零点解析，Asia/Shanghai 时区下日期显示不变 */
      return Number.isFinite(ts) ? { timestamp: ts, open: p.open, high: p.high, low: p.low, close: p.close, volume: p.volume } : null;
    })
    .filter(Boolean);
}

/* 主题调色板：canvas 不随 CSS 变量自动刷新，挂载时读取当前主题的变量值 */
function klinePalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => ((cs.getPropertyValue(name) || '').trim() || fb);
  return {
    up: v('--up', '#e05a5a'),
    down: v('--down', '#4caf87'),
    flat: v('--muted', '#8996ad'),
    line: v('--line', 'rgba(255,255,255,.075)'),
    line2: v('--line-2', 'rgba(255,255,255,.13)'),
    faint: v('--faint', '#5b6880'),
    gold: v('--gold', '#e7b45c'),
    gold2: v('--gold-2', '#f7d99a'),
    blue: v('--blue', '#7aa9ff'),
    violet: v('--violet', '#b39df6'),
    panel: v('--panel-solid', '#101724'),
    text2: v('--text-2', '#c3cddd'),
  };
}

/* klinecharts 样式 partial：从调色板构建，保持与站点明暗主题一致 */
function klineThemeStyles(pal) {
  return {
    grid: { horizontal: { color: pal.line }, vertical: { show: false } },
    candle: {
      bar: {
        upColor: pal.up,
        downColor: pal.down,
        noChangeColor: pal.flat,
        upBorderColor: pal.up,
        downBorderColor: pal.down,
        noChangeBorderColor: pal.flat,
        upWickColor: pal.up,
        downWickColor: pal.down,
        noChangeWickColor: pal.flat,
      },
      priceMark: { high: { show: false }, low: { show: false }, last: { show: false, line: { show: false } } },
      tooltip: {
        title: { color: pal.text2, size: 10 },
        rect: {
          position: 'fixed',
          color: pal.panel,
          borderColor: pal.line2,
          borderSize: 1,
          borderRadius: 10,
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 7,
          paddingBottom: 7,
        },
      },
    },
    indicator: {
      bars: [
        { upColor: pal.up, downColor: pal.down, noChangeColor: pal.flat },
        { upColor: pal.up, downColor: pal.down, noChangeColor: pal.flat },
      ],
      lines: [
        { color: pal.gold, size: 1.2 },
        { color: pal.blue, size: 1.2 },
        { color: pal.violet, size: 1.2 },
      ],
      lastValueMark: { show: false },
    },
    xAxis: { axisLine: { color: pal.line }, tickLine: { color: pal.line }, tickText: { color: pal.faint, size: 10 } },
    yAxis: { axisLine: { color: pal.line }, tickLine: { show: false }, tickText: { color: pal.faint, size: 10 } },
    separator: { color: pal.line },
    crosshair: {
      horizontal: { line: { color: pal.faint, style: 'dashed' }, text: { color: pal.panel, backgroundColor: pal.flat } },
      vertical: { line: { color: pal.faint, style: 'dashed' }, text: { color: pal.panel, backgroundColor: pal.flat } },
    },
    overlay: { line: { color: pal.gold2, size: 1 }, text: { color: pal.gold2, size: 9.5 } },
  };
}

function disposeKline(host) {
  const chart = KLINE_INSTANCES.get(host);
  const kc = window.klinecharts;
  if (chart && kc) {
    try {
      kc.dispose(chart);
    } catch (e) {}
  }
  KLINE_INSTANCES.delete(host);
  if (host) delete host.dataset.klineMounted;
}

/* FR-5.1 目标价锚点过滤：超出可见区间 60% 跨度的目标价不绘制，避免压缩蜡烛 */
function klineAnchorFilter(targets, bars) {
  const out = [];
  if (!targets) return out;
  let lo = Math.min(...bars.map((b) => b.low));
  let hi = Math.max(...bars.map((b) => b.high));
  const span0 = hi - lo || 1;
  ['high', 'mid', 'low'].forEach((k) => {
    const v = targets[k];
    if (Number.isFinite(v) && v > 0 && v >= lo - span0 * 0.6 && v <= hi + span0 * 0.6) {
      out.push({ key: k, value: v });
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  });
  return out;
}

/* 挂载 K 线：每次 dispose 旧实例重新 init，避免增量 API 的状态残留 */
function mountKline(host, config) {
  if (!host) return false;
  if (host.dataset.klineMounted) return true;
  const kc = window.klinecharts;
  if (!kc || typeof kc.init !== 'function') return false;
  const bars = toKLineData(config.points);
  if (bars.length < 2) return false;
  const pal = klinePalette();

  let chart = null;
  try {
    chart = kc.init(host, {
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      styles: klineThemeStyles(pal),
      layout: { pane: { height: 120, minHeight: 40, dragEnabled: true } },
    });
  } catch (e) {
    return false;
  }
  if (!chart) return false;
  KLINE_INSTANCES.set(host, chart);
  host.dataset.klineMounted = 'kc';

  /* 价格精度与成交额口径 */
  const sym = config.symbol || {};
  try {
    chart.setSymbol({
      symbol: sym.code || 'KLINE',
      name: sym.name || '',
      pricePrecision: sym.pricePrecision != null ? sym.pricePrecision : 2,
      volumePrecision: sym.volumePrecision != null ? sym.volumePrecision : 0,
    });
  } catch (e) {}

  /* v10 数据模型为 DataLoader 回调式（无 applyNewData） */
  try {
    chart.setDataLoader({ getBars: ({ callback }) => callback(bars) });
  } catch (e) {
    disposeKline(host);
    return false;
  }

  /* 主图叠加：MA20 / MA60（FR-4）+ BOLL 开关（FR-4.5） */
  try {
    chart.createIndicator({ name: 'MA', calcParams: [20], styles: { lines: [{ color: pal.gold, size: 1.2 }] } }, true);
    chart.createIndicator({ name: 'MA', calcParams: [60], styles: { lines: [{ color: pal.blue, size: 1.2 }] } }, true);
    if (config.bollOn) {
      chart.createIndicator(
        {
          name: 'BOLL',
          styles: {
            lines: [
              { color: pal.blue, size: 1, style: 'dashed' },
              { color: pal.flat, size: 1 },
              { color: pal.blue, size: 1, style: 'dashed' },
            ],
          },
        },
        true
      );
    }
  } catch (e) {}

  /* 副图档位（FR-4.1 ~ FR-4.4）：通过 indicator.paneId 建独立窗格 */
  try {
    const sub = normalizeSubMode(config.sub);
    chart.createIndicator(
      {
        name: sub.toUpperCase(),
        paneId: 'sl_sub',
        styles: {
          bars: [{ upColor: pal.up, downColor: pal.down, noChangeColor: pal.flat }],
          lines: [
            { color: pal.gold, size: 1.1 },
            { color: pal.blue, size: 1.1 },
            { color: pal.violet, size: 1.1 },
          ],
        },
      },
      false
    );
    chart.setPaneOptions({ id: 'sl_sub', height: 110, dragEnabled: true });
  } catch (e) {}

  /* FR-5.1 目标价锚线：虚线 + 高亮金配色 */
  try {
    klineAnchorFilter(config.targets, bars).forEach((a) => {
      chart.createOverlay({
        name: 'horizontalStraightLine',
        points: [{ value: a.value }],
        styles: { line: { style: 'dashed', size: 1, color: pal.gold2 } },
      });
    });
  } catch (e) {}

  return true;
}

/* 窗口尺寸变化时重算 canvas 尺寸（klinecharts 不自动监听容器变化） */
let klineResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(klineResizeTimer);
  klineResizeTimer = setTimeout(() => {
    KLINE_INSTANCES.forEach((chart) => {
      try {
        chart.resize();
      } catch (e) {}
    });
  }, 160);
});

