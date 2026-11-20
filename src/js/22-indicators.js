/* ============================================================
   Indicators — MACD / KDJ / RSI / BOLL，纯前端计算（FR-4）
   全部返回与输入等长的数组；数据不足的位置为 null，绝不产生 NaN
   ============================================================ */
'use strict';

/* 副图档位定义：min 为可用的最少数据条数（FR-4.7） */
const KLINE_SUBS = [
  { key: 'volume', label: '量', min: 2 },
  { key: 'macd', label: 'MACD', min: 34 },
  { key: 'kdj', label: 'KDJ', min: 9 },
  { key: 'rsi', label: 'RSI', min: 14 },
];

function normalizeSubMode(sub) {
  return KLINE_SUBS.some((s) => s.key === sub) ? sub : 'volume';
}

function subAvailable(sub, rowsCount) {
  const def = KLINE_SUBS.find((s) => s.key === sub);
  return !!def && rowsCount >= def.min;
}

/* 标准 EMA：首值作种子 */
function emaSeries(values, n) {
  const out = new Array(values.length).fill(null);
  if (!values.length || !Number.isFinite(values[0])) return out;
  let prev = values[0];
  out[0] = prev;
  const k = 2 / (n + 1);
  for (let i = 1; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      out[i] = prev;
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/* MACD(12,26,9)：DIF=EMA12-EMA26，DEA=EMA9(DIF)，柱=(DIF-DEA)*2（国内口径） */
function macdCalc(closes, fast = 12, slow = 26, signal = 9) {
  const ef = emaSeries(closes, fast);
  const es = emaSeries(closes, slow);
  const dif = closes.map((_, i) => (Number.isFinite(ef[i]) && Number.isFinite(es[i]) ? ef[i] - es[i] : null));
  const allFinite = dif.every(Number.isFinite);
  const deaOut = allFinite ? emaSeries(dif, signal) : new Array(closes.length).fill(null);
  const hist = dif.map((v, i) => (Number.isFinite(v) && Number.isFinite(deaOut[i]) ? (v - deaOut[i]) * 2 : null));
  return { dif, dea: deaOut, hist };
}

/* KDJ(9,3,3)：RSV 后 K/D 平滑，J=3K-2D，初始 50 */
function kdjCalc(highs, lows, closes, n = 9) {
  const k = [];
  const d = [];
  const j = [];
  let pk = 50;
  let pd = 50;
  for (let i = 0; i < closes.length; i++) {
    const from = Math.max(0, i - n + 1);
    let hh = -Infinity;
    let ll = Infinity;
    for (let t = from; t <= i; t++) {
      if (Number.isFinite(highs[t])) hh = Math.max(hh, highs[t]);
      if (Number.isFinite(lows[t])) ll = Math.min(ll, lows[t]);
    }
    const rsv = hh === ll || !Number.isFinite(hh) ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    pk = (2 / 3) * pk + (1 / 3) * rsv;
    pd = (2 / 3) * pd + (1 / 3) * pk;
    k.push(pk);
    d.push(pd);
    j.push(3 * pk - 2 * pd);
  }
  return { k, d, j };
}

/* RSI（Wilder 平滑口径）：前 n 期简单均值起算 */
function rsiSeries(closes, n) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const c = closes[i] - closes[i - 1];
    if (c >= 0) gain += c;
    else loss -= c;
  }
  /* 完全横盘（无涨无跌）时 RSI 记 50，避免误判为 100 超买 */
  const rsiOf = (gain, loss) => (loss === 0 ? (gain === 0 ? 50 : 100) : (100 * gain) / (gain + loss));
  let ag = gain / n;
  let al = loss / n;
  out[n] = rsiOf(ag, al);
  for (let i = n + 1; i < closes.length; i++) {
    const c = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(c, 0)) / n;
    al = (al * (n - 1) + Math.max(-c, 0)) / n;
    out[i] = rsiOf(ag, al);
  }
  return out;
}

function rsiCalc(closes, fast = 6, slow = 12) {
  return { fast: rsiSeries(closes, fast), slow: rsiSeries(closes, slow) };
}

/* BOLL(20,2)：中轨=MA20，上下轨=中轨±2σ（总体标准差） */
function bollCalc(closes, n = 20, mult = 2) {
  const up = [];
  const mid = [];
  const low = [];
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    sum2 += closes[i] * closes[i];
    if (i >= n) {
      sum -= closes[i - n];
      sum2 -= closes[i - n] * closes[i - n];
    }
    if (i >= n - 1) {
      const m = sum / n;
      const sd = Math.sqrt(Math.max(0, sum2 / n - m * m));
      mid.push(m);
      up.push(m + mult * sd);
      low.push(m - mult * sd);
    } else {
      mid.push(null);
      up.push(null);
      low.push(null);
    }
  }
  return { up, mid, low };
}

/* 按当前档位计算指标（基于完整历史，调用方自行截取窗口） */
function computeSubSeries(sub, data) {
  const { closes, highs, lows } = data;
  switch (sub) {
    case 'macd':
      return macdCalc(closes);
    case 'kdj':
      return kdjCalc(highs, lows, closes);
    case 'rsi':
      return rsiCalc(closes);
    default:
      return null; /* volume 直接用 points.volume */
  }
}
