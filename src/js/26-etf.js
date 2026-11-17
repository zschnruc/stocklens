/* ============================================================
   ETF 研判引擎 — 数据层 + 专属评分
   ETF 无个股研报/F10 财务，采用五维专属口径：
   技术动量 / 规模流动性 / 行业景气 / 资金量能 / 新闻舆情。
   全部基于公开接口现有字段，缺失维度降级不臆造；
   低数据覆盖时对总分施加惩罚，避免「两维缺失仍得满分」。
   ============================================================ */
'use strict';

const ETF_DIM_META = [
  { key: 'technical', name: '技术动量', short: '技术', weight: 28, icon: 'activity' },
  { key: 'scale', name: '规模与流动性', short: '规模', weight: 22, icon: 'layers' },
  { key: 'industry', name: '行业景气度', short: '行业', weight: 20, icon: 'building' },
  { key: 'capital', name: '量能与换手', short: '量能', weight: 15, icon: 'pulse' },
  { key: 'news', name: '新闻舆情', short: '舆情', weight: 15, icon: 'news' },
];

const ETF_BOARD_SIZE = 10;
const ETF_BOARD_TTL = 90 * 1000;

/* ETF 名称 → 行业关键词（用于映射东财行业研报，复用 10-api 的 findIndustryCode） */
const ETF_THEME_HINTS = [
  '半导体', '芯片', '集成电路', '科创芯片', '生物医药', '创新药', '医药', '医疗', '中药', '生物科技',
  '证券', '券商', '银行', '保险', '金融', '白酒', '食品饮料', '消费', '新能源', '电池', '光伏', '风电',
  '军工', '国防', '航空', '航天', '房地产', '地产', '煤炭', '有色', '工业金属', '黄金', '钢铁',
  '汽车', '新能源车', '智能汽车', '科技', '电子', '计算机', '软件', '通信', '5G', '人工智能', 'AI',
  '传媒', '游戏', '动漫', '教育', '旅游', '农业', '养殖', '化工', '机械', '电力', '基建', '建材',
  '恒生', '港股通', '海外', '纳斯达克', '标普', '中概', '央企', '国企', '红利', '价值', '成长',
];

/* ---------------- 数据层 ---------------- */

/* 纯函数：ETF 榜单行 → 带行情的 etf stock 对象
   复用 normalizeScreenerRow 的代码清洗与 ST 过滤，附加榜单指标并强制 kind='etf' */
function normalizeEtfRow(r) {
  const base = normalizeScreenerRow(r);
  if (!base) return null;
  /* f13=1 沪市 / 0 深市，以接口市场号为准，避免纯代码段误判 */
  const mk = r.f13 === 1 || r.f13 === '1' ? 'sh' : aSharePrefix(base.code);
  const quoteKey = mk + base.code;
  return {
    ...base,
    kind: 'etf',
    quoteKey,
    klineCode: quoteKey,
    marketCap: num(r.f20) != null ? num(r.f20) : base.marketCap, // 元，规模
    price: num(r.f2),
    changePct: num(r.f3),
    amount: num(r.f6), // 成交额（元）
  };
}

/* 东财 ETF 榜单（b:MK0021 为场内基金板块），按成交额排序。
   f12代码 f13市场 f14名称 f2现价 f3涨跌 f6成交额 f20规模(元) */
function getEtfBoard(size = ETF_BOARD_SIZE) {
  const n = clamp(Math.round(Number(size) || ETF_BOARD_SIZE), 5, 30);
  return cached(`etf-board:${n}`, ETF_BOARD_TTL, async () => {
    const params = new URLSearchParams({
      pn: '1',
      pz: String(n),
      po: '1',
      np: '1',
      fltt: '2',
      invt: '2',
      fid: 'f6',
      fs: 'b:MK0021',
      fields: 'f12,f13,f14,f2,f3,f6,f20',
    });
    const data = await emJsonp(`${API.push2}clist/get?${params}`);
    const diff = data && data.data && data.data.diff;
    const rows = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
    return rows
      .map(normalizeEtfRow)
      .filter((s) => s && Number.isFinite(s.price))
      .slice(0, n);
  });
}

/* 从 ETF 名称推断行业主题词（供行业研报映射，纯函数） */
function etfThemeOf(name) {
  const src = String(name || '');
  const hit = ETF_THEME_HINTS.find((k) => src.includes(k));
  return hit || '';
}

/* 拉取 ETF 的行业研报（用于「行业景气度」维度）与新闻。
   行业映射：名称主题词 → findIndustryCode → getIndustryReports */
function getEtfFundamentals(stock, quote) {
  const theme = etfThemeOf(stock.name);
  const mapped = findIndustryCode(theme);
  const industryReports = mapped
    ? getIndustryReports(mapped.code, mapped.name, { months: 6, pageSize: 20 }).catch(() => ({
        supported: true,
        hits: 0,
        list: [],
        industryName: mapped.name,
      }))
    : Promise.resolve({ supported: false, hits: 0, list: [], industryName: theme });
  const news = getNews(stock).catch(() => []);
  return Promise.all([industryReports, news]).then(([reports, newsList]) => ({
    theme,
    mapped,
    reports,
    news: newsList,
  }));
}

/* ---------------- 专属评分（纯函数，可离线测试） ---------------- */

function scoreEtfTechnical(technical) {
  if (!technical || !technical.consensus || !technical.consensus.available || !Number.isFinite(technical.consensus.score)) {
    return { available: false, note: '日 K 数据不足，技术动量不计入', reasons: [] };
  }
  const c = technical.consensus;
  const score = clamp(Math.round(c.score), 0, 100);
  const availableDims = technical.dims.filter((d) => d.available);
  const bull = technical.dims.filter((d) => d.available && d.dir === 'bullish').length;
  const bear = technical.dims.filter((d) => d.available && d.dir === 'bearish').length;
  return {
    available: true,
    score,
    note: `${availableDims.length}/5 维可用 · 偏多 ${bull} / 偏空 ${bear}`,
    reasons: [
      `五维技术信号等权合成 ${score} 分（趋势/动量/随机/波动/量价）。`,
      `当前偏多 ${bull} 项、偏空 ${bear} 项，其余中性；方向一致性${bull >= 4 ? '较强' : bear >= 4 ? '偏空一致' : '一般'}。`,
      '基于前复权日 K 本地计算，存在滞后与钝化可能。',
    ],
  };
}

function scoreEtfScale(stock, quote, boardMeta) {
  const cap = num((boardMeta && boardMeta.marketCap) || (quote && quote.marketCap));
  const amount = num((boardMeta && boardMeta.amount) || (quote && quote.amount));
  const capYi = Number.isFinite(cap) ? cap / 1e8 : null; // 亿元
  const amountYi = Number.isFinite(amount) ? amount / 1e8 : null;
  if (capYi === null && amountYi === null) {
    return { available: false, note: '规模与成交额数据缺失', reasons: [] };
  }
  /* 规模分档：ETF 规模越大，流动性与跟踪稳定性通常越好 */
  const scaleScore = capYi === null ? null : band(capYi, [
    [200, 100], [100, 92], [50, 84], [20, 74], [10, 62], [5, 50], [2, 38], [1, 26],
  ], 16);
  /* 成交额分档：日成交额越高，买卖冲击成本越低 */
  const liqScore = amountYi === null ? null : band(amountYi, [
    [10, 100], [5, 90], [2, 80], [1, 70], [0.5, 58], [0.2, 46], [0.05, 34],
  ], 22);
  const parts = [];
  let w = 0;
  if (scaleScore !== null) { parts.push(scaleScore * 0.55); w += 0.55; }
  if (liqScore !== null) { parts.push(liqScore * 0.45); w += 0.45; }
  const score = Math.round(parts.reduce((a, b) => a + b, 0) / w);
  const reasons = [];
  if (capYi !== null) reasons.push(`最新规模约 ${capYi >= 1 ? capYi.toFixed(1) + ' 亿' : (capYi * 1e4).toFixed(0) + ' 万'}元，规模分 ${scaleScore}。`);
  if (amountYi !== null) reasons.push(`当日成交额约 ${amountYi >= 1 ? amountYi.toFixed(2) + ' 亿' : (amountYi * 1e4).toFixed(0) + ' 万'}元，流动性分 ${liqScore}。`);
  reasons.push('规模与流动性权重 55:45；数据来自东财 ETF 榜单。');
  return {
    available: true,
    score,
    note: `规模 ${capYi !== null ? capYi.toFixed(1) + '亿' : '—'} · 成交 ${amountYi !== null ? amountYi.toFixed(2) + '亿' : '—'}`,
    reasons,
  };
}

function scoreEtfIndustry(reports, mapped) {
  const list = (reports && reports.list) || [];
  if (!list.length || !mapped) {
    return {
      available: false,
      note: mapped ? '所属行业近 6 个月无研报覆盖' : '未能从 ETF 名称识别行业主题',
      reasons: [],
    };
  }
  const rated = list.filter((r) => Number.isFinite(r.ratingScore));
  const buys = rated.filter((r) => r.ratingScore >= 0.75).length;
  const score = Math.round(
    band(list.length, [[12, 96], [8, 88], [5, 78], [3, 68], [2, 56], [1, 42]], 42) * 0.5 +
      (rated.length ? (rated.reduce((a, r) => a + r.ratingScore * 100, 0) / rated.length) : 50) * 0.5
  );
  const note = `${mapped.name} · 近 6 月 ${list.length} 篇${rated.length ? ` · 买入/增持 ${buys} 篇` : ''}`;
  return {
    available: true,
    score: clamp(score, 0, 100),
    note,
    reasons: [
      `按 ETF 主题「${mapped.name}」映射至东财行业，检索近 6 个月行业研报 ${list.length} 篇。`,
      rated.length
        ? `已评级 ${rated.length} 篇，买入/增持 ${buys} 篇，评级均值 ${Math.round(rated.reduce((a, r) => a + r.ratingScore * 100, 0) / rated.length)}。`
        : '研报未提供可识别评级，评级子项按中性处理。',
      '行业景气度为研报文本的粗略代理，仅代表机构覆盖热度与评级倾向，不代表指数未来涨跌。',
    ],
  };
}

function scoreEtfCapital(quote, boardMeta) {
  const vr = num((quote && quote.volumeRatio) || (boardMeta && boardMeta.volumeRatio));
  const amount = num((boardMeta && boardMeta.amount) || (quote && quote.amount));
  const cap = num((boardMeta && boardMeta.marketCap) || (quote && quote.marketCap));
  const turnover = Number.isFinite(amount) && Number.isFinite(cap) && cap > 0 ? (amount / cap) * 100 : null;
  if (!Number.isFinite(vr) && turnover === null) {
    return { available: false, note: '量比与换手数据缺失', reasons: [] };
  }
  let sum = 0;
  let w = 0;
  const reasons = [];
  if (Number.isFinite(vr)) {
    const s = band(vr, [[3, 96], [2, 88], [1.5, 78], [1, 68], [0.7, 56], [0.4, 42]], 34);
    sum += s * 0.6;
    w += 0.6;
    reasons.push(`量比 ${vr.toFixed(2)}，量能分 ${s}。`);
  }
  if (turnover !== null) {
    const s = band(turnover, [[15, 94], [8, 86], [4, 76], [2, 66], [1, 54], [0.3, 40]], 28);
    sum += s * 0.4;
    w += 0.4;
    reasons.push(`成交额/规模 约 ${turnover.toFixed(2)}%，活跃度分 ${s}。`);
  }
  reasons.push('量比权重 60%、换手代理 40%；ETF 资金净流入字段多数为空，故不纳入评分。');
  return {
    available: true,
    score: Math.round(sum / w),
    note: `量比 ${Number.isFinite(vr) ? vr.toFixed(2) : '—'}${turnover !== null ? ` · 换手 ${turnover.toFixed(2)}%` : ''}`,
    reasons,
  };
}

function scoreEtfNews(news) {
  const s = analyzeSentiment(news);
  if (!s.total) return { available: false, note: '暂未获取到相关新闻', reasons: [] };
  const score = Math.round(s.score);
  return {
    available: true,
    score,
    note: `${s.total} 条 · 正 ${s.pos} / 中 ${s.neu} / 负 ${s.neg}`,
    reasons: [
      `共 ${s.total} 条相关新闻：正面 ${s.pos}、中性 ${s.neu}、负面 ${s.neg}。`,
      s.pos || s.neg ? `情绪净值 ${s.pos - s.neg}，换算得分 ${score}。` : '未命中明显正负面关键词，按中性处理。',
      '新闻情绪与 ETF 净值涨跌无必然因果关系。',
    ],
  };
}

/* 主入口：ETF 五维综合评分。低覆盖惩罚：coverage<100 时按 factor 折算 */
function computeEtfScore({ quote, kline, technical, fundamentals, boardMeta } = {}) {
  const reports = fundamentals && fundamentals.reports;
  const mapped = fundamentals && fundamentals.mapped;
  const news = fundamentals && fundamentals.news;
  const results = {
    technical: scoreEtfTechnical(technical),
    scale: scoreEtfScale(null, quote, boardMeta),
    industry: scoreEtfIndustry(reports, mapped),
    capital: scoreEtfCapital(quote, boardMeta),
    news: scoreEtfNews(news),
  };
  const dims = ETF_DIM_META.map((meta) => {
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
  const coverage = Math.round(weightSum); // 权重合计即 100，coverage 直接等于 weightSum
  let total = null;
  if (weightSum > 0) {
    total = Math.round(available.reduce((a, d) => a + d.score * d.weight, 0) / weightSum);
    /* 低覆盖惩罚：缺失维度越多，越压低总分，避免「两维缺失仍满分」 */
    if (coverage < 100) {
      const factor = 0.6 + 0.4 * (coverage / 100);
      total = Math.round(total * factor);
    }
  }
  const verdict = verdictFor(total === null ? 0 : total);
  const sorted = available.slice().sort((a, b) => b.score - a.score);
  let desc = total === null ? '有效数据不足，暂不给出综合分。' : verdict.desc + '。';
  if (sorted.length >= 2) {
    desc += `最强项为${sorted[0].name}（${sorted[0].score}），最弱项为${sorted[sorted.length - 1].name}（${
      sorted[sorted.length - 1].score
    }）。`;
  }
  if (coverage < 100) {
    desc += `当前数据覆盖 ${coverage}%，缺失维度已计入覆盖惩罚。`;
  }
  return {
    total,
    verdict,
    dims,
    coverage,
    desc,
    missing: dims.filter((d) => !d.available).map((d) => d.short),
    createdAt: new Date(),
    kind: 'etf',
  };
}
