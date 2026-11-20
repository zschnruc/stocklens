/* ============================================================
   Scoring engine — explainable, missing data never invented
   ============================================================ */
'use strict';

const DIM_META = [
  { key: 'reports', name: '研报与机构评级', short: '研报', weight: 30, icon: 'book' },
  { key: 'financial', name: '盈利与成长', short: '盈利', weight: 25, icon: 'trendUp' },
  { key: 'technical', name: '技术面动量', short: '技术', weight: 25, icon: 'activity' },
  { key: 'news', name: '新闻舆情', short: '舆情', weight: 20, icon: 'news' },
];

const SENTIMENT_POS = [
  '增长', '上涨', '大涨', '涨停', '新高', '突破', '增持', '回购', '中标', '签约', '合作', '获批',
  '利好', '超预期', '盈利', '扭亏', '提价', '扩产', '上调', '买入', '推荐', '创新高', '订单',
  '分红', '收购', '落地', '放量', '领先', '强劲', '改善',
];
const SENTIMENT_NEG = [
  '下跌', '大跌', '跌停', '新低', '亏损', '下滑', '减持', '处罚', '立案', '调查', '风险', '暴跌',
  '裁员', '下调', '终止', '退市', '诉讼', '违约', '造假', '爆雷', '警示', '冻结', '承压', '放缓',
  '低于预期', '计提', '商誉', '停牌', '负面', '召回',
];

function band(value, rows, fallback = 50) {
  if (!Number.isFinite(value)) return null;
  for (const [min, score] of rows) {
    if (value >= min) return score;
  }
  return fallback;
}

/* 覆盖度统一口径（FR-18.4）：缺失维度越多，折算系数越低。
   个股 / ETF / 加密共用，保证跨市场标签含义一致；仅覆盖 100% 时视为可比。 */
function coverageFactor(coverage) {
  const c = clamp(Number(coverage) || 0, 0, 100);
  return 0.6 + 0.4 * (c / 100);
}
function coverageMeta(coverage) {
  const c = Math.round(clamp(Number(coverage) || 0, 0, 100));
  return { coverage: c, comparable: c >= 100, factor: coverageFactor(c) };
}

function growthScore(v) {
  return band(v, [
    [50, 100], [30, 94], [20, 86], [10, 76], [5, 68], [0, 56], [-10, 38], [-25, 24],
  ], 12);
}
function roeScore(v) {
  return band(v, [
    [25, 100], [20, 94], [15, 84], [10, 72], [6, 60], [3, 48], [0, 34],
  ], 20);
}
function returnScore(r, scale) {
  if (!Number.isFinite(r)) return null;
  return clamp(50 + (r / scale) * 50, 0, 100);
}

function analyzeSentiment(news) {
  const rows = Array.isArray(news) ? news.filter((n) => n && n.title) : [];
  let pos = 0;
  let neg = 0;
  const details = [];
  rows.forEach((n) => {
    const text = `${n.title || ''} ${n.content || ''}`;
    let p = 0;
    let q = 0;
    SENTIMENT_POS.forEach((w) => {
      if (text.includes(w)) p += 1;
    });
    SENTIMENT_NEG.forEach((w) => {
      if (text.includes(w)) q += 1;
    });
    const cls = p > q ? 'pos' : q > p ? 'neg' : 'neu';
    if (cls === 'pos') pos += 1;
    else if (cls === 'neg') neg += 1;
    details.push({ ...n, senti: cls });
  });
  const total = rows.length;
  const neu = total - pos - neg;
  const score = total ? clamp(50 + ((pos - neg) / total) * 50, 0, 100) : null;
  return { total, pos, neu, neg, score, details };
}

/* FR-18.5/18.6：港美股以 Finnhub 分析师评级替代中文研报打分。
   有目标价（美股 FMP）时恢复三段式「覆盖度 30% + 评级倾向 45% + 目标价 25%」；
   无目标价（港股 / FMP 失败）时退化为「覆盖度 30% + 评级倾向 70%」按剩余权重归一，
   与 A 股研报「有值才计权」的口径保持一致。 */
function scoreFinnhubReports(finnhub, fmpTarget, quote) {
  if (!finnhub || !finnhub.supported || !finnhub.latest) {
    return {
      available: false,
      note: finnhub && finnhub.reason ? `Finnhub 评级不可用：${finnhub.reason}` : '暂无可用的海外分析师评级',
      reasons: [],
    };
  }
  const latest = finnhub.latest;
  const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0, total = 0 } = latest;
  const reasons = [];
  if (!(total > 0)) {
    return { available: false, note: 'Finnhub 评级家数为 0', reasons: [] };
  }
  /* 评级倾向：强买 +1、买入 +0.6、中性 0、卖出 -0.6、强卖 -1，映射到 0–100 */
  const weighted = strongBuy * 1 + buy * 0.6 + hold * 0 - sell * 0.6 - strongSell * 1;
  const rating = clamp(50 + (weighted / total) * 50, 0, 100);
  const bullish = strongBuy + buy;
  const bearish = sell + strongSell;
  reasons.push(
    `Finnhub 近月 ${total} 位分析师：买入/增持 ${bullish} 位、中性 ${hold} 位、减持/卖出 ${bearish} 位；评级倾向 ${Math.round(rating)}。`
  );

  const monthsCoverage = band(finnhub.months, [
    [12, 100], [9, 90], [6, 78], [3, 62], [1, 45],
  ], 35);
  const analystCoverage = band(total, [
    [40, 100], [25, 90], [15, 78], [8, 62], [3, 45], [1, 32],
  ], 30);
  const coverage = Math.round(monthsCoverage * 0.4 + analystCoverage * 0.6);
  reasons.push(`覆盖度：${finnhub.months} 个月评级记录、当月 ${total} 位分析师，覆盖度打分 ${coverage}。`);

  /* FR-18.6：目标价子项（仅美股 FMP） */
  let targetScore = null;
  let targetUpside = null;
  if (fmpTarget && fmpTarget.supported && Number.isFinite(fmpTarget.consensus) && quote && quote.price > 0) {
    targetUpside = (fmpTarget.consensus / quote.price - 1) * 100;
    targetScore = band(targetUpside, [
      [25, 100], [15, 92], [8, 82], [2, 70], [-5, 52], [-15, 34],
    ], 22);
    reasons.push(`FMP 目标价一致预期 ${fmtPrice(fmpTarget.consensus)}，较现价 ${fmtPct(targetUpside)}，目标价打分 ${targetScore}。`);
  } else {
    reasons.push('无可用目标价（港股免费源不覆盖 / FMP 未返回），目标价子项不计入并按剩余权重折算。');
  }

  let score;
  if (targetScore !== null) {
    score = Math.round(coverage * 0.3 + rating * 0.45 + targetScore * 0.25);
  } else {
    score = Math.round(coverage * 0.3 + rating * 0.7);
  }
  const note = `Finnhub 评级 · ${total} 位分析师 · 买入 ${bullish} / 中性 ${hold} / 卖出 ${bearish}${
    targetUpside !== null ? ` · 目标空间 ${fmtPct(targetUpside)}` : ''
  }`;
  return { available: true, score, note, reasons };
}

function scoreReports(data, quote) {
  const { market, reports } = data;
  if (market !== 'A') {
    return scoreFinnhubReports(reports && reports.finnhub, reports && reports.fmpTarget, quote);
  }
  const list = (reports && reports.list) || [];
  if (!list.length) {
    return { available: false, note: '近 6 个月未检索到个股研报', reasons: [] };
  }
  const rated = list.filter((r) => Number.isFinite(r.ratingScore));
  const buys = rated.filter((r) => r.ratingScore >= 0.75).length;
  const neutrals = rated.filter((r) => r.ratingScore > 0.25 && r.ratingScore < 0.75).length;
  const sells = rated.filter((r) => r.ratingScore <= 0.25).length;
  const coverage = band(list.length, [
    [16, 100], [12, 92], [9, 84], [6, 74], [4, 62], [2, 48], [1, 34],
  ], 35);

  let rating = null;
  if (rated.length) {
    const now = Date.now();
    let weighted = 0;
    let weights = 0;
    rated.forEach((r) => {
      const days = daysSince(r.rawDate);
      const w = days !== null && days <= 30 ? 1.5 : 1;
      weighted += r.ratingScore * w;
      weights += w;
    });
    rating = (weighted / weights) * 100;
  }

  const targets = list
    .map((r) => r.target)
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 8);
  let targetScore = null;
  let targetUpside = null;
  if (targets.length && quote && quote.price > 0) {
    const avg = targets.reduce((a, b) => a + b, 0) / targets.length;
    targetUpside = (avg / quote.price - 1) * 100;
    targetScore = band(targetUpside, [
      [25, 100], [15, 92], [8, 82], [2, 70], [-5, 52], [-15, 34],
    ], 22);
  }

  /* FR-18.1：有值才计入权重，避免评级缺失时把已得分子按 0.75 分母稀释 */
  let sum = 0;
  let weight = 0;
  if (Number.isFinite(coverage)) {
    sum += coverage * 0.3;
    weight += 0.3;
  }
  if (rating !== null) {
    sum += rating * 0.45;
    weight += 0.45;
  }
  if (targetScore !== null) {
    sum += targetScore * 0.25;
    weight += 0.25;
  }
  const score = weight > 0 ? Math.round(sum / weight) : null;
  const reasons = [`近 6 个月共 ${list.length} 篇研报，覆盖度打分 ${coverage}。`];
  if (rated.length) {
    reasons.push(`已评级 ${rated.length} 篇：买入/增持 ${buys} 篇，中性 ${neutrals} 篇，减持/卖出 ${sells} 篇；按近 30 天加权，评级均值 ${Math.round(rating)}。`);
  } else {
    reasons.push('研报未给出可识别评级，评级子项不计入。');
  }
  if (targetUpside !== null) {
    reasons.push(`目标价均值 ${fmtPrice(targets.reduce((a, b) => a + b, 0) / targets.length)}，较现价 ${fmtPct(targetUpside)}。`);
  } else {
    reasons.push('研报未提供目标价，目标价子项不计入并按剩余权重折算。');
  }
  const note = `近 6 个月 ${list.length} 篇 · 买入/增持 ${buys} 篇${targetUpside !== null ? ` · 目标空间 ${fmtPct(targetUpside)}` : ''}`;
  return { available: true, score, note, reasons };
}

function scoreFinancial(data) {
  const f = data.financials;
  if (!f || !f.supported) {
    return {
      available: false,
      note: (f && f.reason) || '盈利与成长数据暂不可用',
      reasons: [],
    };
  }
  if (f.empty || (!Number.isFinite(f.revenueYoY) && !Number.isFinite(f.profitYoY) && !Number.isFinite(f.roe))) {
    return { available: false, note: '财务接口未返回有效指标', reasons: [] };
  }
  const rev = growthScore(f.revenueYoY);
  const profit = growthScore(f.profitYoY);
  const roe = roeScore(f.roe);
  const parts = [];
  if (rev !== null) parts.push([rev, 0.35, '营收增速']);
  if (profit !== null) parts.push([profit, 0.35, '净利增速']);
  if (roe !== null) parts.push([roe, 0.3, 'ROE']);
  const totalW = parts.reduce((a, p) => a + p[1], 0);
  if (!totalW) return { available: false, note: '财务接口未返回有效指标', reasons: [] };
  const score = Math.round(parts.reduce((a, p) => a + p[0] * p[1], 0) / totalW);
  const reasons = [`报告期 ${f.period || f.reportDate || '—'}。`];
  if (Number.isFinite(f.revenueYoY)) reasons.push(`营收同比 ${fmtPct(f.revenueYoY)}，增速子项 ${rev}。`);
  else reasons.push('营收增速缺失，子项不计入。');
  if (Number.isFinite(f.profitYoY)) reasons.push(`归母净利同比 ${fmtPct(f.profitYoY)}，增速子项 ${profit}。`);
  else reasons.push('净利增速缺失，子项不计入。');
  if (Number.isFinite(f.roe)) reasons.push(`ROE ${ratioText(f.roe)}，盈利质量子项 ${roe}。`);
  else reasons.push('ROE 缺失，子项不计入。');
  if (Number.isFinite(f.grossMargin)) reasons.push(`毛利率 ${ratioText(f.grossMargin)}，仅作参考，不直接计分。`);
  const noteParts = [];
  if (Number.isFinite(f.revenueYoY)) noteParts.push(`营收 ${fmtPct(f.revenueYoY)}`);
  if (Number.isFinite(f.profitYoY)) noteParts.push(`净利 ${fmtPct(f.profitYoY)}`);
  if (Number.isFinite(f.roe)) noteParts.push(`ROE ${ratioText(f.roe)}`);
  return { available: true, score, note: noteParts.join(' · ') || f.period || '财务指标已获取', reasons };
}

function scoreTechnical(data) {
  const k = data.kline && data.kline.metrics;
  if (!k) return { available: false, note: '历史 K 线数据不足', reasons: [] };
  const r20 = returnScore(k.r20, 20);
  const r60 = returnScore(k.r60, 40);
  const parts = [];
  if (r20 !== null) parts.push([r20, 0.45]);
  if (r60 !== null) parts.push([r60, 0.45]);
  if (k.trend === '多头排列') parts.push([95, 0.1]);
  else if (k.trend === '空头排列') parts.push([15, 0.1]);
  else parts.push([50, 0.1]);
  const totalW = parts.reduce((a, p) => a + p[1], 0);
  let score = parts.reduce((a, p) => a + p[0] * p[1], 0) / totalW;
  if (Number.isFinite(k.maxDrawdown) && k.maxDrawdown < -10) {
    score += Math.max(-18, (k.maxDrawdown + 10) * 0.6);
  }
  score = Math.round(clamp(score, 0, 100));
  const reasons = [
    `近 20 日 ${fmtPct(k.r20)}，近 60 日 ${fmtPct(k.r60)}，近 120 日 ${fmtPct(k.r120)}。`,
    `均线形态：${k.trend}；20 日均线 ${fmtPrice(k.ma20)}，60 日均线 ${fmtPrice(k.ma60)}。`,
    `近 120 日最大回撤 ${fmtPct(k.maxDrawdown)}，年化波动约 ${ratioText(k.volatility)}。`,
    Number.isFinite(k.maxDrawdown) && k.maxDrawdown < -10
      ? `回撤超过 10%，已按幅度扣分 ${Math.min(18, Math.round((-10 - k.maxDrawdown) * 0.6))} 分。`
      : '回撤在 10% 以内，未触发回撤扣分。',
  ];
  const note = `20日 ${fmtPct(k.r20)} · 60日 ${fmtPct(k.r60)} · ${k.trend}`;
  return { available: true, score, note, reasons };
}

function scoreNews(data) {
  const s = analyzeSentiment(data.news);
  if (!s.total) return { available: false, note: '暂未获取到相关新闻', reasons: [] };
  const score = Math.round(s.score);
  const reasons = [
    `共 ${s.total} 条相关新闻：正面 ${s.pos} 条、中性 ${s.neu} 条、负面 ${s.neg} 条。`,
    '按标题与摘要中的正负面关键词计数，标题与正文同权，属于粗略情绪指标。',
    s.pos || s.neg
      ? `情绪净值 ${s.pos - s.neg}，换算得分 ${score}。`
      : '未命中明显正负面关键词，按中性处理。',
  ];
  return {
    available: true,
    score,
    note: `${s.total} 条 · 正 ${s.pos} / 中 ${s.neu} / 负 ${s.neg}`,
    reasons,
  };
}

function computeScore({ market, quote, kline, reports, financials, news }) {
  const data = { market, quote, kline, reports, financials, news };
  const results = {
    reports: scoreReports(data, quote),
    financial: scoreFinancial(data),
    technical: scoreTechnical(data),
    news: scoreNews(data),
  };
  const dims = DIM_META.map((meta) => {
    const r = results[meta.key];
    return {
      ...meta,
      available: !!r.available && Number.isFinite(r.score),
      score: r.available && Number.isFinite(r.score) ? r.score : null,
      note: r.note,
      reasons: r.reasons || [],
    };
  });
  const available = dims.filter((d) => d.available);
  const weightSum = available.reduce((a, d) => a + d.weight, 0);
  const cov = coverageMeta(Math.round((weightSum / 100) * 100));
  const coverage = cov.coverage;
  let total = null;
  if (weightSum > 0) {
    const weighted = available.reduce((a, d) => a + d.score * d.weight, 0) / weightSum;
    /* FR-18.4：与 ETF / 加密共用同一覆盖度折算，覆盖不足不再与满覆盖同分同标签 */
    total = Math.round(weighted * cov.factor);
  }
  const availableCount = available.length;
  const dimCount = dims.length;
  const verdict = verdictFor(total === null ? 0 : total);
  const sorted = available.slice().sort((a, b) => b.score - a.score);
  let desc = total === null ? '有效数据不足，暂不给出综合分。' : verdict.desc + '。';
  if (sorted.length >= 2) {
    desc += `最强项为${sorted[0].name}（${sorted[0].score}），最弱项为${sorted[sorted.length - 1].name}（${
      sorted[sorted.length - 1].score
    }）。`;
  }
  if (coverage < 100) {
    desc += `当前可用 ${availableCount}/${dimCount} 个维度、权重覆盖 ${coverage}%，缺失维度已从权重中剔除并按覆盖度折算。`;
    if (market !== 'A') {
      desc += '港美股评分口径与 A 股不同（研报维度以海外分析师评级替代），分数仅在可用维度内可比，请勿与 A 股直接比较高低。';
    }
  }
  return {
    total,
    verdict,
    dims,
    coverage,
    comparable: cov.comparable,
    availableCount,
    dimCount,
    market,
    desc,
    missing: dims.filter((d) => !d.available).map((d) => d.short),
    createdAt: new Date(),
  };
}

/* ---------------- shared presentation helpers ---------------- */
function dimByKey(score, key) {
  return score && score.dims ? score.dims.find((d) => d.key === key) : null;
}
function scoreColorClass(score) {
  if (!Number.isFinite(score)) return 'muted';
  if (score >= 65) return 'teal';
  if (score >= 50) return 'blue';
  if (score >= 35) return 'orange';
  return 'red';
}
function sentimentLabel(score) {
  if (!Number.isFinite(score)) return '暂无数据';
  if (score >= 65) return '偏正面';
  if (score >= 55) return '略偏正面';
  if (score > 45) return '中性';
  if (score > 35) return '略偏负面';
  return '偏负面';
}
