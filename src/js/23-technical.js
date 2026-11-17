/* ============================================================
   Technical analysis — 多维度技术研判引擎（独立模块）
   基于完整日 K 的 OHLCV 纯本地计算，零新增网络请求。
   输出：趋势 / 动量 / 随机 / 波动 / 量价 五维度信号 + 综合研判。
   数据不足的维度标记 available:false，不臆造、不计入综合信号。
   ============================================================ */
'use strict';

/* 维度元数据：与渲染层共享顺序、名称、图标与最低数据要求 */
const TECH_DIMS = [
  { key: 'trend', name: '趋势结构', short: '趋势', icon: 'trendUp', min: 60, desc: '均线排列与价格位置关系' },
  { key: 'momentum', name: '动量指标', short: '动量', icon: 'activity', min: 35, desc: 'MACD 与 RSI 的方向与强弱' },
  { key: 'oscillator', name: '随机指标', short: '随机', icon: 'pulse', min: 15, desc: 'KDJ 的超买超卖与交叉状态' },
  { key: 'volatility', name: '波动通道', short: '波动', icon: 'layers', min: 25, desc: '布林带位置、带宽与突破状态' },
  { key: 'volume', name: '量价关系', short: '量价', icon: 'chart', min: 25, desc: '量能配合与 OBV 资金动能' },
];

/* 信号方向：bullish 偏多 / bearish 偏空 / neutral 中性 / unavailable 不可用 */
const SIGNAL_META = {
  bullish: { label: '偏多', cls: 'bullish', tone: 1 },
  bearish: { label: '偏空', cls: 'bearish', tone: -1 },
  neutral: { label: '中性', cls: 'neutral', tone: 0 },
  unavailable: { label: '数据不足', cls: 'unavailable', tone: 0 },
};

function signalDir(score) {
  if (!Number.isFinite(score)) return 'unavailable';
  if (score >= 62) return 'bullish';
  if (score <= 38) return 'bearish';
  return 'neutral';
}
function signalOf(score, note) {
  return { score: Math.round(clamp(score, 0, 100)), dir: signalDir(score), note };
}

/* ---------- 1. 趋势结构：MA5/10/20/60 排列、价格位置、斜率 ---------- */
function techTrend(rows) {
  const closes = rows.map((p) => p.close);
  const n = closes.length;
  if (n < 60) return { available: false, reason: '需要至少 60 根日 K 判断均线结构' };
  const last = closes[n - 1];
  const ma = (len) => closes.slice(-len).reduce((a, b) => a + b, 0) / len;
  const ma5 = ma(5), ma10 = ma(10), ma20 = ma(20), ma60 = ma(60);
  const ma20Prev = (closes.slice(-25, -5).reduce((a, b) => a + b, 0)) / 20;
  const ma60Prev = (closes.slice(-65, -45).reduce((a, b) => a + b, 0)) / 20;
  const slope20 = (ma20 / ma20Prev - 1) * 100;
  const slope60 = (ma60 / ma60Prev - 1) * 100;
  const dev20 = (last / ma20 - 1) * 100;

  let align = '均线纠缠';
  let alignScore = 50;
  if (last > ma5 && ma5 > ma10 && ma10 > ma20 && ma20 > ma60) {
    align = '多头排列'; alignScore = 90;
  } else if (last < ma5 && ma5 < ma10 && ma10 < ma20 && ma20 < ma60) {
    align = '空头排列'; alignScore = 12;
  } else if (last > ma20 && ma20 > ma60) {
    align = '偏多排列'; alignScore = 72;
  } else if (last < ma20 && ma20 < ma60) {
    align = '偏空排列'; alignScore = 28;
  }
  let score = alignScore * 0.5 + clamp(50 + slope20 * 8, 0, 100) * 0.25 + clamp(50 + slope60 * 6, 0, 100) * 0.25;
  score = clamp(score + clamp(dev20 * 1.2, -12, 12), 0, 100);
  const signals = signalOf(score, `${align}，价格位于 MA20 ${fmtPct(dev20)}`);
  return {
    available: true,
    ...signals,
    metrics: { ma5, ma10, ma20, ma60, slope20, slope60, dev20, align },
    details: [
      `均线排列：${align}（MA5 ${fmtPrice(ma5)} / MA20 ${fmtPrice(ma20)} / MA60 ${fmtPrice(ma60)}）。`,
      `MA20 近 20 日斜率 ${fmtPct(slope20)}，MA60 斜率 ${fmtPct(slope60)}，${slope20 > 0 ? '中期均线向上' : '中期均线走弱'}。`,
      `现价 ${fmtPrice(last)} 相对 MA20 偏离 ${fmtPct(dev20)}，${Math.abs(dev20) > 12 ? '偏离较大，注意回归风险' : '处于合理区间'}。`,
    ],
  };
}

/* ---------- 2. 动量指标：MACD 金叉死叉 / 零轴 / 柱状斜率 + RSI ---------- */
function techMomentum(rows) {
  const closes = rows.map((p) => p.close);
  if (closes.length < 35) return { available: false, reason: '需要至少 35 根日 K 计算 MACD 与 RSI' };
  const macd = macdCalc(closes);
  const i = closes.length - 1;
  const dif = macd.dif[i], dea = macd.dea[i], hist = macd.hist[i];
  const histPrev = macd.hist[i - 1], histPrev2 = macd.hist[i - 2];
  const rsi = rsiCalc(closes, 6, 12);
  const rsi6 = rsi.fast[i], rsi12 = rsi.slow[i];

  let macdScore = 50;
  let macdState = 'MACD 方向不明';
  if (Number.isFinite(dif) && Number.isFinite(dea)) {
    const crossUp = hist > 0 && histPrev <= 0;
    const crossDown = hist < 0 && histPrev >= 0;
    const rising = Number.isFinite(histPrev2) && hist > histPrev && histPrev > histPrev2;
    const falling = Number.isFinite(histPrev2) && hist < histPrev && histPrev < histPrev2;
    if (dif > 0 && dea > 0 && (crossUp || rising)) { macdScore = 88; macdState = '零轴上方多头延续'; }
    else if (dif > 0 && dea > 0) { macdScore = 70; macdState = '零轴上方，多头格局'; }
    else if (crossUp) { macdScore = 66; macdState = '低位金叉，动能转强'; }
    else if (crossDown) { macdScore = 30; macdState = '高位死叉，动能转弱'; }
    else if (dif < 0 && dea < 0 && (falling || hist < 0)) { macdScore = 20; macdState = '零轴下方空头延续'; }
    else if (dif < 0) { macdScore = 38; macdState = '零轴下方，弱势整理'; }
    if (rising) macdScore = clamp(macdScore + 5, 0, 100);
    if (falling) macdScore = clamp(macdScore - 5, 0, 100);
  }
  let rsiScore = 50;
  let rsiState = 'RSI 中性';
  if (Number.isFinite(rsi6)) {
    if (rsi6 >= 80) { rsiScore = 30; rsiState = 'RSI6 超买（≥80），短线过热'; }
    else if (rsi6 <= 20) { rsiScore = 68; rsiState = 'RSI6 超卖（≤20），存在修复机会'; }
    else if (rsi6 > rsi12 && rsi6 > 55) { rsiScore = 72; rsiState = 'RSI 多头排列，动能占优'; }
    else if (rsi6 < rsi12 && rsi6 < 45) { rsiScore = 34; rsiState = 'RSI 空头排列，动能偏弱'; }
  }
  const score = macdScore * 0.6 + rsiScore * 0.4;
  const signals = signalOf(score, `${macdState}；${rsiState}`);
  return {
    available: true,
    ...signals,
    metrics: { dif, dea, hist, rsi6, rsi12, macdState, rsiState },
    details: [
      `MACD：DIF ${fmtSigned(dif)} / DEA ${fmtSigned(dea)} / 柱 ${fmtSigned(hist)}，${macdState}。`,
      `RSI6 ${fmtPrice(rsi6, 1)} / RSI12 ${fmtPrice(rsi12, 1)}，${rsiState}。`,
      'MACD 反映中期趋势动量，RSI 反映短线超买超卖；两者背离时信号可靠性下降。',
    ],
  };
}

/* ---------- 3. 随机指标：KDJ 超买超卖 / K-D 交叉 / J 值极值 ---------- */
function techOscillator(rows) {
  if (rows.length < 15) return { available: false, reason: '需要至少 15 根日 K 计算 KDJ' };
  const kdj = kdjCalc(
    rows.map((p) => p.high),
    rows.map((p) => p.low),
    rows.map((p) => p.close)
  );
  const i = rows.length - 1;
  const k = kdj.k[i], d = kdj.d[i], j = kdj.j[i];
  const kPrev = kdj.k[i - 1], dPrev = kdj.d[i - 1];
  let score = 50;
  let state = 'KDJ 中性区间';
  const crossUp = k > d && kPrev <= dPrev;
  const crossDown = k < d && kPrev >= dPrev;
  if (j > 100 || k > 80) { score = 32; state = 'KDJ 超买区，短线回调压力'; }
  else if (j < 0 || k < 20) { score = 66; state = 'KDJ 超卖区，存在反弹动能'; }
  else if (crossUp && k < 70) { score = 74; state = 'KDJ 低位金叉，短线转强'; }
  else if (crossDown && k > 30) { score = 30; state = 'KDJ 高位死叉，短线转弱'; }
  else if (k > d && k > 50) { score = 62; state = 'K 线在 D 线上方，短线偏强'; }
  else if (k < d && k < 50) { score = 40; state = 'K 线在 D 线下方，短线偏弱'; }
  const signals = signalOf(score, `${state}（K ${fmtPrice(k, 1)} / D ${fmtPrice(d, 1)} / J ${fmtPrice(j, 1)}）`);
  return {
    available: true,
    ...signals,
    metrics: { k, d, j, state },
    details: [
      `KDJ(9,3,3)：K ${fmtPrice(k, 1)} / D ${fmtPrice(d, 1)} / J ${fmtPrice(j, 1)}，${state}。`,
      crossUp ? '近一日出现 K 线上穿 D 线的金叉。' : crossDown ? '近一日出现 K 线下穿 D 线的死叉。' : '近一日未出现明显交叉信号。',
      'KDJ 对短线波动敏感，在趋势行情中易出现钝化，需结合趋势与量能验证。',
    ],
  };
}

/* ---------- 4. 波动通道：BOLL 位置 / 带宽 / 开口方向 ---------- */
function techVolatility(rows) {
  if (rows.length < 25) return { available: false, reason: '需要至少 25 根日 K 计算布林带' };
  const closes = rows.map((p) => p.close);
  const boll = bollCalc(closes);
  const i = closes.length - 1;
  const up = boll.up[i], mid = boll.mid[i], low = boll.low[i];
  if (![up, mid, low].every(Number.isFinite) || up <= low) {
    return { available: false, reason: '布林带计算数据不足' };
  }
  const last = closes[i];
  const pctB = (last - low) / (up - low);
  const widthNow = ((up - low) / mid) * 100;
  const j = Math.max(0, i - 20);
  const upOld = boll.up[j], lowOld = boll.low[j], midOld = boll.mid[j];
  const widthOld = Number.isFinite(midOld) && midOld > 0 && Number.isFinite(upOld) && Number.isFinite(lowOld)
    ? ((upOld - lowOld) / midOld) * 100
    : null;
  const expanding = widthOld !== null && widthNow > widthOld * 1.08;
  const squeezing = widthOld !== null && widthNow < widthOld * 0.88;

  let score = clamp(50 + (pctB - 0.5) * 70, 15, 85);
  let state = '价格位于布林中轨附近';
  if (pctB > 0.95) { state = '触及上轨，短线强势但接近超买'; score = 58; }
  else if (pctB > 0.7) { state = '运行于上轨与中轨之间，偏强'; }
  else if (pctB < 0.05) { state = '触及下轨，短线弱势但接近超卖'; score = 42; }
  else if (pctB < 0.3) { state = '运行于中轨与下轨之间，偏弱'; }
  if (squeezing) state += '；带宽收窄，变盘概率上升';
  else if (expanding && pctB > 0.5) state += '；带宽放大向上，趋势加速';
  else if (expanding && pctB < 0.5) state += '；带宽放大向下，跌势加速';
  const signals = signalOf(score, `${state}（%B ${(pctB * 100).toFixed(0)}%）`);
  return {
    available: true,
    ...signals,
    metrics: { up, mid, low, pctB, widthNow, widthOld, expanding, squeezing, state },
    details: [
      `BOLL(20,2)：上轨 ${fmtPrice(up)} / 中轨 ${fmtPrice(mid)} / 下轨 ${fmtPrice(low)}。`,
      `现价 ${fmtPrice(last)} 位于通道 ${(pctB * 100).toFixed(0)}% 分位，${state}。`,
      `带宽 ${widthNow.toFixed(1)}%${widthOld !== null ? `（20 日前 ${widthOld.toFixed(1)}%，${expanding ? '开口放大' : squeezing ? '开口收窄' : '基本平稳'}）` : ''}。`,
    ],
  };
}

/* ---------- 5. 量价关系：量能配合 / 量比 / OBV 资金动能 ---------- */
function techVolume(rows) {
  if (rows.length < 25) return { available: false, reason: '需要至少 25 根日 K 分析量价关系' };
  const n = rows.length;
  const vol5 = rows.slice(-5).reduce((a, p) => a + (Number.isFinite(p.volume) ? p.volume : 0), 0) / 5;
  const vol20 = rows.slice(-20).reduce((a, p) => a + (Number.isFinite(p.volume) ? p.volume : 0), 0) / 20;
  if (!Number.isFinite(vol20) || vol20 <= 0) return { available: false, reason: '成交量数据不足' };
  const volRatio = vol5 / vol20;

  /* OBV：涨日加量、跌日减量，基于完整序列 */
  let obv = 0;
  const obvSeries = [];
  for (let i = 1; i < n; i++) {
    const c = rows[i].close, prev = rows[i - 1].close;
    const v = Number.isFinite(rows[i].volume) ? rows[i].volume : 0;
    if (c > prev) obv += v;
    else if (c < prev) obv -= v;
    obvSeries.push(obv);
  }
  const obvNow = obvSeries[obvSeries.length - 1] || 0;
  const obvAgo = obvSeries[Math.max(0, obvSeries.length - 21)] || 0;
  const obvTrend = obvAgo !== 0 ? ((obvNow - obvAgo) / Math.abs(obvAgo)) * 100 : 0;

  /* 近 20 日量价配合：价涨量增 / 价涨量缩 / 价跌量增 / 价跌量缩 */
  let upVol = 0, upThin = 0, downVol = 0, downThin = 0;
  const avgVol = vol20;
  for (let i = n - 20; i < n; i++) {
    const c = rows[i].close, prev = rows[i - 1].close;
    const v = Number.isFinite(rows[i].volume) ? rows[i].volume : 0;
    if (!Number.isFinite(prev)) continue;
    const heavy = v > avgVol * 1.1;
    if (c > prev) heavy ? upVol++ : upThin++;
    else if (c < prev) heavy ? downVol++ : downThin++;
  }

  let score = 50;
  score += clamp(obvTrend * 0.35, -18, 18);
  score += clamp((volRatio - 1) * 10, -8, 8);
  score += clamp((upVol - downVol) * 2.2, -14, 14);
  score = clamp(score, 0, 100);
  let state = '量价关系中性';
  if (obvTrend > 12 && upVol > downVol) state = 'OBV 上行且涨日放量，资金流入迹象';
  else if (obvTrend < -12 && downVol > upVol) state = 'OBV 下行且跌日放量，资金流出迹象';
  else if (upVol > downVol * 1.5) state = '上涨日量能明显强于下跌日';
  else if (downVol > upVol * 1.5) state = '下跌日量能明显强于上涨日';
  const signals = signalOf(score, `${state}（量比 ${volRatio.toFixed(2)}，OBV 20 日 ${fmtPct(obvTrend)}）`);
  return {
    available: true,
    ...signals,
    metrics: { vol5, vol20, volRatio, obvNow, obvTrend, upVol, upThin, downVol, downThin, state },
    details: [
      `量能：近 5 日均量 ${fmtVolCompact(vol5)}，近 20 日均量 ${fmtVolCompact(vol20)}，量比 ${volRatio.toFixed(2)}（${volRatio > 1.2 ? '温和放量' : volRatio < 0.8 ? '明显缩量' : '量能平稳'}）。`,
      `OBV 能量潮近 20 日变化 ${fmtPct(obvTrend)}，${obvTrend > 0 ? '资金累计净流入方向' : '资金累计净流出方向'}。`,
      `近 20 日量价配合：涨日放量 ${upVol} 次 / 涨日缩量 ${upThin} 次，跌日放量 ${downVol} 次 / 跌日缩量 ${downThin} 次。`,
    ],
  };
}

/* ---------- 综合研判：按可用维度加权，输出方向、强度与分歧度 ---------- */
function techConsensus(dims) {
  const usable = dims.filter((d) => d.available && Number.isFinite(d.score));
  if (!usable.length) {
    return { available: false, score: null, dir: 'unavailable', label: '数据不足', divergence: null, summary: '有效技术数据不足，暂不给出综合技术研判。' };
  }
  const score = Math.round(usable.reduce((a, d) => a + d.score, 0) / usable.length);
  const dir = signalDir(score);
  const label = SIGNAL_META[dir].label;
  const bulls = usable.filter((d) => d.dir === 'bullish').length;
  const bears = usable.filter((d) => d.dir === 'bearish').length;
  const divergence = usable.length - Math.max(bulls, bears);
  const strongest = usable.slice().sort((a, b) => b.score - a.score)[0];
  const weakest = usable.slice().sort((a, b) => a.score - b.score)[0];
  let summary = `${usable.length} 个可用维度均分 ${score}，综合信号${label}。`;
  if (usable.length >= 2) summary += `最强项「${strongest.name}」${strongest.score} 分，最弱项「${weakest.name}」${weakest.score} 分`;
  if (divergence >= 2) summary += '；各维度分歧较大，信号可靠性下降，建议等待共振确认';
  else summary += '；维度间方向基本一致';
  summary += '。';
  return { available: true, score, dir, label, divergence, summary };
}

/* ---------- 主入口：输入日 K 点数组，输出完整技术研判 ---------- */
function analyzeTechnical(points) {
  const rows = (Array.isArray(points) ? points : [])
    .map((p) => ({
      date: p.date,
      open: num(p.open), close: num(p.close), high: num(p.high), low: num(p.low),
      volume: num(p.volume, 0),
    }))
    .filter((p) => p.date && Number.isFinite(p.open) && Number.isFinite(p.close) && Number.isFinite(p.high) && Number.isFinite(p.low));
  const base = { rows: rows.length, createdAt: new Date() };
  if (rows.length < 5) {
    return {
      ...base,
      dims: TECH_DIMS.map((d) => ({ ...d, available: false, reason: '历史数据不足', score: null, dir: 'unavailable', details: [] })),
      consensus: techConsensus([]),
    };
  }
  const runners = { trend: techTrend, momentum: techMomentum, oscillator: techOscillator, volatility: techVolatility, volume: techVolume };
  const dims = TECH_DIMS.map((meta) => {
    const result = runners[meta.key](rows);
    return { ...meta, ...result, details: result.details || [] };
  });
  return { ...base, dims, consensus: techConsensus(dims) };
}
