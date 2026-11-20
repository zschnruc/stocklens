#!/usr/bin/env node
/**
 * K 线组件冒烟测试：拉取真实接口数据 → renderCandlestick → 校验输出。
 * 运行：node scripts/test-candle.js（需要联网）
 * 任一断言失败则以退出码 1 结束，可作构建前回归门禁。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');

/* 最小 DOM 桩：渲染函数本身不依赖 DOM，交互挂载（hydrateCandles）才依赖 */
global.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
};

const src = path.join(root, 'src', 'js');
vm.runInThisContext(fs.readFileSync(path.join(src, '00-utils.js'), 'utf8'), { filename: '00-utils.js' });
/* 图标与渲染层：emptyState 转义属可离线验证的纯函数（v2.5） */
vm.runInThisContext(fs.readFileSync(path.join(src, '01-icons.js'), 'utf8'), { filename: '01-icons.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '31-render-analysis.js'), 'utf8'), { filename: '31-render-analysis.js' });
/* 数据层：emSecid / EM_KLT / parseEmKlines 等纯函数可离线验证（网络函数不在测试中调用） */
vm.runInThisContext(fs.readFileSync(path.join(src, '10-api.js'), 'utf8'), { filename: '10-api.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '22-indicators.js'), 'utf8'), { filename: '22-indicators.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '21-charts.js'), 'utf8'), { filename: '21-charts.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '23-technical.js'), 'utf8'), { filename: '23-technical.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '20-scoring.js'), 'utf8'), { filename: '20-scoring.js' });
/* 高分榜引擎：纯函数部分（normalize / rank / filter）可离线验证；网络函数不在测试中调用 */
vm.runInThisContext(fs.readFileSync(path.join(src, '24-screener.js'), 'utf8'), { filename: '24-screener.js' });
/* 首页双榜单：normalizeHotlistRow 为纯函数，可离线验证 */
vm.runInThisContext(fs.readFileSync(path.join(src, '25-hotlists.js'), 'utf8'), { filename: '25-hotlists.js' });
/* ETF 研判：数据层与评分纯函数可离线验证（网络函数不在测试中调用） */
vm.runInThisContext(fs.readFileSync(path.join(src, '26-etf.js'), 'utf8'), { filename: '26-etf.js' });
/* 加密研判：数据解析、别名与五维评分纯函数可离线验证（网络函数不在测试中调用） */
vm.runInThisContext(fs.readFileSync(path.join(src, '27-crypto.js'), 'utf8'), { filename: '27-crypto.js' });

const enc = encodeURIComponent;
let failures = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function fetchKline(key, period, isUS) {
  const count = { day: 320, week: 260, month: 140 }[period];
  if (isUS) {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=${enc(key)},${period},,,${count},qfq`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const block = data.data[key] || Object.values(data.data)[0];
    const arr = block[`qfq${period}`] || block[period] || [];
    return arr
      .map((row) => ({ date: row[0], open: +row[1], close: +row[2], high: +row[3], low: +row[4], volume: +row[5] }))
      .filter((p) => p.date && Number.isFinite(p.close));
  }
  /* A股/港股改走东财前复权（腾讯 fqkline 已被 WAF 拦截返回 501） */
  const code = key.replace(/^(sh|hk|sz|bj)/, '');
  const market = key.startsWith('hk') ? 'HK' : 'A';
  const secid = emSecid({ market, code });
  const params = new URLSearchParams({
    secid,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56',
    klt: String(EM_KLT[period]),
    fqt: '1',
    beg: EM_BEG[period],
    end: '20500101',
    lmt: String(count),
  });
  const res = await fetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const lines = data && data.data && data.data.klines;
  if (!Array.isArray(lines) || !lines.length) throw new Error(`东财K线为空 rc=${data && data.rc}`);
  return parseEmKlines(lines.slice(-count));
}

function auditCandlestick(html, expectBars) {
  const problems = [];
  const bars = (html.match(/class="candle /g) || []).length;
  const vols = (html.match(/class="vol-bar/g) || []).length;
  if (!html) problems.push('渲染结果为空');
  if (/NaN|Infinity|undefined/.test(html)) problems.push('输出含 NaN/Infinity/undefined');
  if (bars !== vols) problems.push(`蜡烛 ${bars} 与量柱 ${vols} 数量不一致`);
  if (expectBars && bars !== expectBars) problems.push(`蜡烛数 ${bars} ≠ 预期 ${expectBars}`);
  if (!(html.includes('candle-ma ma20') && html.includes('candle-ma ma60'))) problems.push('缺少 MA20/MA60 均线路径');
  if (!html.includes('candle-cross-v') || !html.includes('candle-cross-h')) problems.push('缺少十字光标元素');
  if (!html.includes('candle-hover-layer')) problems.push('缺少悬浮交互层');
  if (!html.includes('candle-tip')) problems.push('缺少详情浮层');
  if (!html.includes('aria-label=')) problems.push('缺少 aria-label');
  return { problems, bars };
}

(async () => {
  console.log('K 线组件冒烟测试（真实接口）');
  const cases = [
    ['A股 日K', 'sh600519', 'day', false, 240],
    ['A股 周K', 'sh600519', 'week', false, 260],
    ['A股 月K', 'sh600519', 'month', false, 140],
    ['港股 日K', 'hk00700', 'day', false, 240],
    ['美股 日K', 'usAAPL.OQ', 'day', true, 240],
    ['美股 周K', 'usAAPL.OQ', 'week', true, 260],
  ];
  for (const [label, key, period, isUS, win] of cases) {
    try {
      const pts = await fetchKline(key, period, isUS);
      const html = renderCandlestick(pts, { window: win });
      const { problems, bars } = auditCandlestick(html, win);
      check(`${label}（数据 ${pts.length} 根 → 蜡烛 ${bars} 根）`, !problems.length, problems.join('; '));
    } catch (err) {
      failures += 1;
      console.error(`  ✗ ${label} — 接口失败: ${err.message}`);
    }
  }

  console.log('边界与降级');
  const one = renderCandlestick([{ date: '2026-01-01', open: 1, close: 1, high: 1, low: 1, volume: 1 }], {});
  check('单根数据返回空（触发 sparkline 降级）', one === '');
  check('null 数据返回空', renderCandlestick(null, {}) === '');
  const dirty = Array.from({ length: 40 }, (_, i) => ({ date: `d${i}`, open: NaN, close: i, high: 'x', low: null, volume: undefined }));
  check('脏数据被过滤不产生非法输出', renderCandlestick(dirty, { window: 40 }) === '');
  const okRows = Array.from({ length: 60 }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: 10 + i * 0.1,
    close: 10.05 + i * 0.1,
    high: 10.2 + i * 0.1,
    low: 9.9 + i * 0.1,
    volume: 1000 + i,
  }));
  const small = renderCandlestick(okRows, { window: 60 });
  check('60 根合成数据渲染 60 根蜡烛', auditCandlestick(small, 60).bars === 60);

  console.log('技术指标引擎（FR-4）');
  const closes = okRows.map((p) => p.close);
  const highs = okRows.map((p) => p.high);
  const lows = okRows.map((p) => p.low);
  const macd = macdCalc(closes);
  check('MACD 三序列等长且有限', macd.dif.length === closes.length && macd.dif.every(Number.isFinite) && macd.hist.every(Number.isFinite));
  check('MACD 零轴以上为正柱（单调上涨序列）', macd.hist[macd.hist.length - 1] > 0);
  const kdj = kdjCalc(highs, lows, closes);
  check('KDJ 的 K/D/J ∈ [0,100] 附近且有限', kdj.k.every((v) => Number.isFinite(v) && v >= -1e-6 && v <= 100 + 1e-6));
  const rsi = rsiCalc(closes);
  check('RSI 单调上涨序列末值接近 100', rsi.fast[rsi.fast.length - 1] > 95);
  const boll = bollCalc(closes);
  const lastOk = closes.length - 1;
  check('BOLL 上轨 > 中轨 > 下轨', boll.up[lastOk] > boll.mid[lastOk] && boll.mid[lastOk] > boll.low[lastOk]);
  const shortRows = okRows.slice(0, 10);
  check('MACD 数据不足 34 根时档位不可用', !subAvailable('macd', shortRows.length) && subAvailable('macd', 34));
  check('KDJ 数据不足 9 根时档位不可用', !subAvailable('kdj', 8) && subAvailable('kdj', 9));

  console.log('副图/BOLL 渲染（FR-4.1 ~ FR-4.5）');
  for (const sub of ['volume', 'macd', 'kdj', 'rsi']) {
    const html = renderCandlestick(okRows, { window: 60, sub, boll: sub === 'macd' });
    const hasPanel = sub === 'volume' ? html.includes('vol-bar') : html.includes('sub-line');
    const hasBoll = sub === 'macd' ? html.includes('candle-boll') : !html.includes('candle-boll');
    check(`副图 ${sub.toUpperCase()} 渲染${sub === 'macd' ? ' + BOLL 叠加' : ''}`, hasPanel && hasBoll && !/NaN|undefined/.test(html));
  }
  const tooShort = renderCandlestick(shortRows, { window: 10, sub: 'macd' });
  check('数据不足时副图档位安全降级为量', tooShort.includes('vol-bar') && !tooShort.includes('sub-line'));

  console.log('目标价锚点（FR-5）');
  const baseTargets = { high: 12.5, mid: 11.8, low: 11.2, count: 5 };
  const withTargets = renderCandlestick(okRows, { window: 60, targets: baseTargets });
  const anchorLines = (withTargets.match(/class="target-line"/g) || []).length;
  check('常规目标价绘制 3 条锚线', anchorLines === 3 && withTargets.includes('目标高 12.50'));
  const crazy = renderCandlestick(okRows, { window: 60, targets: { high: 900, mid: 500, low: 400, count: 3 } });
  check('离谱目标价（超 60% 跨度）不绘制锚线', !(crazy.match(/class="target-line"/g) || []).length);
  check('无目标价时不渲染锚点', !(renderCandlestick(okRows, { window: 60 }).match(/target-line/g) || []).length);
  const half = renderCandlestick(okRows, { window: 60, targets: { high: 12.5, mid: 11.8, low: 300, count: 3 } });
  check('混合目标价只绘制区间内的锚线', (half.match(/class="target-line"/g) || []).length === 2);

  console.log('技术研判引擎（FR-7，离线合成数据）');
  /* 合成 90 根温和上涨、量能配合的行情，验证五维度全部可用且方向合理 */
  const techRows = Array.from({ length: 90 }, (_, i) => ({
    date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    open: 10 + i * 0.08,
    close: 10.05 + i * 0.08,
    high: 10.2 + i * 0.08,
    low: 9.9 + i * 0.08,
    volume: 1000 + i * 12,
  }));
  const tech = analyzeTechnical(techRows);
  check('技术模块输出 5 个维度', tech.dims.length === 5 && tech.dims.every((d) => d.key));
  check('充足数据下各维度均可用', tech.dims.every((d) => d.available), tech.dims.filter((d) => !d.available).map((d) => d.key).join(','));
  check('各维度得分在 0-100 且无 NaN', tech.dims.every((d) => Number.isFinite(d.score) && d.score >= 0 && d.score <= 100));
  check('各维度信号方向合法', tech.dims.every((d) => ['bullish', 'bearish', 'neutral'].includes(d.dir)));
  check('综合研判可用且分数合法', tech.consensus.available && Number.isFinite(tech.consensus.score) && tech.consensus.score >= 0 && tech.consensus.score <= 100);
  check('上涨行情趋势维度偏多', tech.dims.find((d) => d.key === 'trend').dir === 'bullish');
  check('每个可用维度均含可解释依据', tech.dims.every((d) => d.details.length >= 2));
  check('JSON 序列化无 NaN/Infinity', !/NaN|Infinity/.test(JSON.stringify(tech)));
  const techShort = analyzeTechnical(okRows.slice(0, 8));
  check('数据不足时五维度降级为不可用', techShort.dims.every((d) => !d.available) && !techShort.consensus.available);
  const techNull = analyzeTechnical(null);
  check('null 输入安全降级', techNull.rows === 0 && techNull.dims.length === 5);

  console.log('高分榜 / 反向选股（FR-8，离线纯函数）');
  /* push2 榜单行 → 股票对象 */
  const cand = normalizeScreenerRow({ f12: '600519', f13: '1', f14: '贵州茅台', f6: '123456', f20: '2.1e12' });
  check('候选池正股解析代码与前缀', cand && cand.code === '600519' && cand.quoteKey === 'sh600519');
  check('候选池剔除 ST 标的', normalizeScreenerRow({ f12: '000001', f14: '*ST某某' }) === null);
  check('候选池剔除退市标的', normalizeScreenerRow({ f12: '000002', f14: '某某退' }) === null);
  check('候选池拒绝非法代码', normalizeScreenerRow({ f12: '', f14: '空' }) === null);
  const szCand = normalizeScreenerRow({ f12: '300750', f14: '宁德时代' });
  check('创业板使用 sz 前缀', szCand && szCand.quoteKey === 'sz300750');

  /* 排名：高分优先，无分置末，rank 连续 */
  const mkRow = (code, total) => ({
    stock: { code },
    score: total === null ? { total: null } : computeScore({ market: 'A', quote: { price: 10 } }) && { total },
  });
  const ranked = rankScreenerRows([mkRow('a', 70), mkRow('b', 92), mkRow('c', null), mkRow('d', 81)]);
  check('排名按综合分降序', ranked.map((r) => r.score.total).slice(0, 3).join(',') === '92,81,70');
  check('无分标的排在最末', ranked[ranked.length - 1].score.total === null);
  check('rank 从 1 连续编号', ranked.every((r, i) => r.rank === i + 1));

  /* 阈值筛选：边界包含、过滤无分 */
  const pool = [mkRow('a', 79), mkRow('b', 80), mkRow('c', 95), mkRow('d', null)];
  check('阈值筛选含边界 80 分', filterScreenerRows(pool, 80).length === 2);
  check('阈值 90 仅保留最高分', filterScreenerRows(pool, 90).length === 1);
  check('阈值筛选剔除无分', filterScreenerRows(pool, 60).length === 3);
  check('阈值非数字回退默认 80', filterScreenerRows(pool, 'x').length === 2);
  check('空数组筛选安全', filterScreenerRows(null, 80).length === 0);

  console.log('首页双榜单（FR-9，离线纯函数）');
  const hotRow = normalizeHotlistRow({ f12: '600519', f14: '贵州茅台', f2: '1688.00', f3: '1.23', f6: '5200000000', f62: '320000000' });
  check('热门榜解析现价与涨跌', hotRow && hotRow.price === 1688 && hotRow.changePct === 1.23);
  check('热门榜携带成交额与净流入', hotRow.amount === 5.2e9 && hotRow.netInflow === 3.2e8);
  check('热门榜复用市场前缀', hotRow.quoteKey === 'sh600519');
  const inflowRow = normalizeHotlistRow({ f12: '300750', f14: '宁德时代', f2: '200.50', f3: '-0.50', f6: '1000000000', f62: '-50000000' });
  check('资金榜解析负净流入', inflowRow && inflowRow.netInflow === -5e7 && inflowRow.quoteKey === 'sz300750');
  check('榜单剔除 ST 与非法代码', normalizeHotlistRow({ f12: '000001', f14: 'ST某某', f2: '10' }) === null && normalizeHotlistRow({ f12: '', f2: '10' }) === null);
  check('榜单无现价行被过滤条件识别', !Number.isFinite(normalizeHotlistRow({ f12: '600000', f14: '某股' }).price));

  console.log('ETF 研判（v1.6，离线纯函数）');
  /* 市场前缀：沪市 ETF 段 51/56/58 → sh，深市 15/16 → sz，个股口径不变 */
  check('沪市 ETF 51 段判为 sh', aSharePrefix('510050') === 'sh');
  check('沪市 ETF 56/58 段判为 sh', aSharePrefix('588000') === 'sh' && aSharePrefix('511010') === 'sh');
  check('深市 ETF 15/16 段判为 sz', aSharePrefix('159915') === 'sz' && aSharePrefix('161725') === 'sz');
  check('个股前缀口径不变 6→sh 0→sz 8→bj', aSharePrefix('600519') === 'sh' && aSharePrefix('000001') === 'sz' && aSharePrefix('830001') === 'bj');
  check('isEtfCode 识别 ETF 与排除个股', isEtfCode('510050') && isEtfCode('159915') && !isEtfCode('600519') && !isEtfCode('300750'));
  /* 榜单行解析：f13 市场号为准，规模/现价/涨跌/成交额带出，强制 kind=etf */
  const etfRow = normalizeEtfRow({ f12: '512480', f13: 1, f14: '半导体ETF国联安', f2: '0.779', f3: '4.01', f6: '908719940', f20: '21290007200' });
  check('ETF 行解析强制 kind 与沪市前缀', etfRow && etfRow.kind === 'etf' && etfRow.quoteKey === 'sh512480');
  check('ETF 行携带现价/涨跌/规模/成交额', etfRow.price === 0.779 && etfRow.changePct === 4.01 && etfRow.marketCap === 2.12900072e10 && etfRow.amount === 908719940);
  const etfSz = normalizeEtfRow({ f12: '159915', f13: 0, f14: '创业板ETF', f2: '2.354', f3: '0.86', f6: '6046426540', f20: '108760579164' });
  check('ETF 深市 f13=0 判为 sz', etfSz && etfSz.quoteKey === 'sz159915');
  check('ETF 行剔除无效代码与非数字现价', normalizeEtfRow({ f12: '', f14: 'x', f2: '1' }) === null);
  /* 行业主题词提取 */
  check('行业主题识别半导体', etfThemeOf('科创半导体ETF华夏') === '半导体');
  check('行业主题识别券商', etfThemeOf('证券ETF国泰') === '证券');
  check('宽基 ETF 无主题返回空', etfThemeOf('沪深300ETF') === '');
  /* 评分纯函数：规模流动性 / 行业 / 低覆盖惩罚 */
  const scaleHi = scoreEtfScale(null, { marketCap: 1e10, amount: 2e9 }, null);
  const scaleLo = scoreEtfScale(null, { marketCap: 1e8, amount: 2e7 }, null);
  check('规模流动性高规模得分高于低规模', scaleHi.available && scaleLo.available && scaleHi.score > scaleLo.score);
  check('规模流动性缺数据时降级', !scoreEtfScale(null, {}, null).available);
  const indHi = scoreEtfIndustry({ list: Array.from({ length: 12 }, () => ({ ratingScore: 0.9 })) }, { name: '半导体' });
  const indNa = scoreEtfIndustry({ list: [] }, { name: '半导体' });
  check('行业景气有研报可用且高分', indHi.available && indHi.score > 80);
  check('行业景气无研报降级', !indNa.available);
  const capOk = scoreEtfCapital({ volumeRatio: 2.5, amount: 5e9 }, { marketCap: 5e10, amount: 5e9 });
  check('量能换手可用', capOk.available && Number.isFinite(capOk.score));
  /* 综合评分：五维齐全不惩罚，缺失维度施加覆盖惩罚 */
  const fullEtf = computeEtfScore({
    quote: { marketCap: 1e10, amount: 2e9, volumeRatio: 1.8, high: 11, low: 10, prevClose: 10, price: 10.5 },
    technical: { consensus: { available: true, score: 80 }, dims: [{ available: true, dir: 'bullish' }, { available: true, dir: 'bullish' }] },
    fundamentals: { mapped: { name: '半导体' }, reports: { list: [{ ratingScore: 0.9 }] }, news: [{ title: '增长 超预期', content: '' }] },
    boardMeta: null,
  });
  check('ETF 五维齐全覆盖 100 且分数有效', fullEtf.coverage === 100 && fullEtf.total > 0 && fullEtf.total <= 100);
  check('ETF 评分返回 kind=etf 与五维', fullEtf.kind === 'etf' && fullEtf.dims.length === 5);
  const thinEtf = computeEtfScore({
    quote: {},
    technical: null,
    fundamentals: { mapped: null, reports: { list: [] }, news: [] },
    boardMeta: null,
  });
  check('ETF 低覆盖施加惩罚（总分显著低于满分）', thinEtf.total === null || thinEtf.total <= 85);
  check('ETF 缺数据标记覆盖不足与缺失维度', thinEtf.coverage < 100 && thinEtf.missing.length > 0);

  console.log('首页 ETF 榜行业去重（v2.2，离线纯函数）');
  check('半导体与芯片归为同一行业', etfIndustryKey('半导体ETF国联安') === '半导体' && etfIndustryKey('芯片ETF') === '半导体');
  check('科创芯片优先归半导体', etfIndustryKey('科创芯片ETF') === '半导体');
  check('新能源车归汽车、新能源归新能源', etfIndustryKey('新能源车ETF') === '汽车' && etfIndustryKey('新能源ETF') === '新能源');
  check('宽基与风格按指数/风格归并', etfIndustryKey('沪深300ETF') === '宽基-沪深300' && etfIndustryKey('红利ETF') === '红利');
  check('主题优先于宽基（创业板算力/创业板50）', etfIndustryKey('创业板算力ETF') === '科技' && etfIndustryKey('创业板50ETF') === '宽基-创业板50' && etfIndustryKey('创业板ETF') === '宽基-创业板');
  check('上证指数与上证50分开归并', etfIndustryKey('上证指数ETF') === '宽基-上证指数' && etfIndustryKey('上证50ETF') === '宽基-上证50');
  check('无法识别主题返回空 key', etfIndustryKey('某主题ETF') === '');
  const dupEtfRows = [
    { code: '512480', name: '半导体ETF', amount: 9e8 },
    { code: '159995', name: '芯片ETF', amount: 1.2e9 },
    { code: '510300', name: '沪深300ETF', amount: 5e9 },
    { code: '510050', name: '上证50ETF', amount: 4e9 },
    { code: '512690', name: '酒ETF', amount: 3e8 },
    { code: '600001', name: '某主题ETF', amount: 1e8 },
    { code: '600002', name: '另一主题ETF', amount: 2e8 },
  ];
  const dedupedEtf = dedupeEtfByIndustry(dupEtfRows, 10);
  check('同行业只保留成交额最大者', dedupedEtf.some((s) => s.code === '159995') && !dedupedEtf.some((s) => s.code === '512480'));
  check('行业去重后保持成交额降序', dedupedEtf.every((s, i) => i === 0 || dedupedEtf[i - 1].amount >= s.amount));
  check('无法识别行业按独立标的保留', dedupedEtf.some((s) => s.code === '600001') && dedupedEtf.some((s) => s.code === '600002'));
  check('行业去重结果按 size 截断', dedupeEtfByIndustry(dupEtfRows, 3).length === 3);

  console.log('ETF 高分榜（v1.7，离线纯函数）');
  /* 候选用同一 ETF 榜单解析，强制 kind=etf 以便 stockDataset 路由到 /etf */
  const screenCand = normalizeEtfRow({ f12: '512480', f13: 1, f14: '半导体ETF', f2: '0.9', f6: '9e8', f20: '2e10' });
  check('高分榜候选为 ETF 类型且带规模', screenCand.kind === 'etf' && screenCand.marketCap === 2e10);
  /* scoreEtfCandidate 与研判页 computeEtfScore 同口径：kind=etf、五维、覆盖 */
  const screenScore = scoreEtfCandidate({
    quote: { marketCap: 1e10, amount: 2e9, volumeRatio: 1.8, high: 11, low: 10, prevClose: 10, price: 10.5 },
    kline: null,
    technical: { consensus: { available: true, score: 80 }, dims: [{ available: true, dir: 'bullish' }] },
    fundamentals: { mapped: { name: '半导体' }, reports: { list: [{ ratingScore: 0.9 }] }, news: [{ title: '增长 超预期', content: '' }] },
    boardMeta: { marketCap: 2e10, amount: 9e8 },
  });
  check('高分榜评分与研判页同口径（kind=etf + 五维）', screenScore.kind === 'etf' && screenScore.dims.length === 5 && Number.isFinite(screenScore.total));
  /* 排名与阈值筛选复用通用纯函数：ETF 行无分置末、边界 80 达标 */
  const mkEtfRow = (code, total) => ({ stock: { code, kind: 'etf' }, score: { total } });
  const etfRanked = rankScreenerRows([mkEtfRow('512480', 88), mkEtfRow('159915', null), mkEtfRow('510050', 81)]);
  check('ETF 高分榜按分数降序且无分置末', etfRanked[0].stock.code === '512480' && etfRanked[etfRanked.length - 1].score.total === null);
  check('ETF 高分榜阈值含边界 80', filterScreenerRows(etfRanked, 80).length === 2);
  check('ETF 高分榜默认阈值常量为 80', ETF_SCREENER_DEFAULT_THRESHOLD === 80);
  check('ETF 高分榜默认候选池为正数', ETF_SCREENER_DEFAULT_SIZE > 0 && ETF_SCREENER_CONCURRENCY > 0);

  console.log('加密货币数据与五维评分（v2.0，离线纯函数）');
  const coin = normalizeCoinStock({ symbol: 'btc' });
  check('币种对象强制 CRYPTO / coin 与独立标识', coin.market === 'CRYPTO' && coin.kind === 'coin' && coin.code === 'BTC' && coin.quoteKey === 'crypto:BTC');
  check('币种中文名自动映射', coin.name === '比特币' && normalizeCoinStock({ symbol: 'ETH' }).name === '以太坊');
  check('别名解析：小写代码', cryptoResolveQuery('btc') && cryptoResolveQuery('btc').code === 'BTC');
  check('别名解析：中文名', cryptoResolveQuery('比特币').code === 'BTC' && cryptoResolveQuery('以太坊').code === 'ETH');
  check('别名解析：普通美股不误判', cryptoResolveQuery('AAPL') === null);
  const boardRows = cryptoBoardRows(
    [
      { symbol: 'USDT', rank: 3, price: 1, marketCap: 1e11, change24h: 0 },
      { symbol: 'BTC', rank: 1, price: 64000, marketCap: 1.28e12, change24h: -0.3 },
      { symbol: 'ETH', rank: 2, price: 1800, marketCap: 2.2e11, change24h: 1.2 },
    ],
    10
  );
  check('加密榜单排除稳定币并按市值排名', boardRows.length === 2 && boardRows[0].code === 'BTC' && boardRows[1].code === 'ETH');
  const coinCandles = parseCryptoKlines([
    [1794873600000, '64000', '65000', '63000', '64500', '100', 1794960000000, '6500000'],
    [1794960000000, '64500', '66000', '64000', '65500', '120', 1795046400000, '7800000'],
  ]);
  check('Binance K 线按 UTC 日期与 OHLCV 解析', coinCandles.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(coinCandles[0].date) && coinCandles[1].close === 65500 && coinCandles[0].amount === 6500000);
  const coinMetrics = cryptoKlineMetrics(
    Array.from({ length: 120 }, (_, i) => ({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open: 100 + i,
      high: 103 + i,
      low: 98 + i,
      close: 101 + i,
      volume: 1000 + i,
    }))
  );
  check('加密指标补充 7/30/90 日收益与 ATR/30 日波动', Number.isFinite(coinMetrics.r7) && Number.isFinite(coinMetrics.r30) && Number.isFinite(coinMetrics.r90) && Number.isFinite(coinMetrics.maxDrawdown90) && Number.isFinite(coinMetrics.atrPct) && Number.isFinite(coinMetrics.vol30));
  check('波动健康度：40%–80% 高于极端区间', cryptoVolScore(60) > cryptoVolScore(10) && cryptoVolScore(60) > cryptoVolScore(160));
  check('换手率：8% 高于 80% 投机换手', cryptoTurnoverScore(8) > cryptoTurnoverScore(80));
  check('资金费率：负费率（空头拥挤）高于极端正费率', cryptoFundingScore(-0.0002) > cryptoFundingScore(0.001));
  const coinKline = {
    points: [],
    metrics: {
      last: 100, r7: 6, r20: 12, r30: 25, r60: 40, r90: 55, r120: 70,
      ma20: 92, ma60: 85, trend: '多头排列', volatility: 60, vol30: 60,
      maxDrawdown: -12, maxDrawdown90: 15, atr14: 3, atrPct: 3,
    },
  };
  const btcKline = { metrics: { last: 1, r30: 5, r60: 10, r90: 20, ma20: 1, ma60: 1, trend: '震荡' } };
  check('趋势维度：强于 BTC 时可用且得分 > 60', scoreCryptoTrend(coinKline, btcKline).available && scoreCryptoTrend(coinKline, btcKline).score > 60);
  check('趋势维度：无 K 线时降级不可用', !scoreCryptoTrend(null, null).available);
  const liqHi = scoreCryptoLiquidity({ amount: 5e9 }, { marketCap: 1e12, rank: 1 });
  const liqLo = scoreCryptoLiquidity({ amount: 2e6 }, null);
  check('流动性维度：大成交额高分且缺失市值仍可用', liqHi.available && liqLo.available && liqHi.score > liqLo.score);
  const derOk = scoreCryptoDerivatives({ funding: -0.0001, oiUsd: 2e10, basisPct: 0.1, mark: 100, index: 99.9 }, { marketCap: 1e12 });
  check('合约维度：有合约数据时可用且给出得分', derOk.available && derOk.score > 40);
  check('合约维度：无合约时降级不可用', !scoreCryptoDerivatives(null, { marketCap: 1e12 }).available);
  const sentFear = scoreCryptoSentiment({ current: 12, classification: 'Extreme Fear' }, { change30d: 20, current: 1e11, chain: 'Ethereum' });
  const sentGreed = scoreCryptoSentiment({ current: 88, classification: 'Extreme Greed' }, null);
  check('情绪维度：极度恐慌得分高于极度贪婪', sentFear.available && sentGreed.available && sentFear.score > sentGreed.score);
  const fullCoin = computeCryptoScore({
    quote: { amount: 5e9 },
    kline: coinKline,
    btcKline,
    meta: { marketCap: 1e12, rank: 1 },
    derivatives: { funding: -0.0001, oiUsd: 2e10, basisPct: 0.1, mark: 100, index: 99.9 },
    fng: { current: 20, classification: 'Fear' },
    chainTvl: { change30d: 20, current: 1e11, chain: 'Ethereum' },
  });
  check('加密五维齐全时覆盖率 100 且总分有效', fullCoin.coverage === 100 && fullCoin.availableCount === 5 && fullCoin.total > 0 && fullCoin.total <= 100 && fullCoin.comparable === true);
  const thinCoin = computeCryptoScore({ quote: { amount: 1e7 }, kline: coinKline, meta: null });
  const thinWeighted = thinCoin.dims.filter((d) => d.available).reduce((a, d) => a + d.score * d.weight, 0) / thinCoin.coverage;
  check('加密低覆盖时施加统一 0.6+0.4×覆盖率折算', thinCoin.coverage === 65 && thinCoin.total === Math.round(thinWeighted * 0.86) && thinCoin.comparable === false);
  check('加密缺失维度被标记且不出现 NaN', thinCoin.coverage < 100 && thinCoin.missing.length === 2 && Number.isFinite(thinCoin.total));
  check('USD 大数缩写格式', fmtUsdCompact(1.28e12) === '$1.28T' && fmtUsdCompact(2.5e9) === '$2.50B');
  check('加密榜默认取前 10', CRYPTO_BOARD_SIZE === 10);
  check('小额币价保留 8 位精度', fmtCryptoPrice(0.00000379) === '0.00000379' && fmtCryptoPrice(0.0123) === '0.0123');

  console.log('首页榜单更新时间与手动刷新（v2.1，离线纯函数）');
  const fixedTs = new Date(2026, 10, 18, 9, 5, 7).getTime();
  check('更新时间格式化为本地 HH:MM:SS', fmtClock(fixedTs) === '09:05:07');
  check('更新时间可附带完整日期', fmtClock(fixedTs, true) === '2026-11-18 09:05:07');
  check('非法时间戳安全降级', fmtClock(NaN) === '—' && fmtClock(undefined) === '—');
  const forceKey = 'test:force:' + uid();
  let cacheCalls = 0;
  await cached(forceKey, 60 * 1000, async () => ++cacheCalls);
  await cached(forceKey, 60 * 1000, async () => ++cacheCalls);
  check('榜单缓存命中时不重复请求', cacheCalls === 1);
  await cached(forceKey, 60 * 1000, async () => ++cacheCalls, true);
  check('手动刷新 force 绕过 TTL 缓存', cacheCalls === 2);

  console.log('K 线数据源映射（离线纯函数）');
  check('东财 secid：沪市个股 1. 前缀', emSecid({ market: 'A', code: '600519' }) === '1.600519');
  check('东财 secid：深市个股 0. 前缀', emSecid({ market: 'A', code: '000001' }) === '0.000001');
  check('东财 secid：港股 116. 前缀', emSecid({ market: 'HK', code: '00700' }) === '116.00700');
  check('东财周期映射 日/周/月 = 101/102/103', EM_KLT.day === 101 && EM_KLT.week === 102 && EM_KLT.month === 103);
  const emParsed = parseEmKlines(['2026-11-17,10,12,13,9,500', '2026-11-18,12,11,13,10,400']);
  check('东财 klines 解析列序正确（开收高低量）', emParsed.length === 2 && emParsed[0].open === 10 && emParsed[0].close === 12 && emParsed[0].high === 13 && emParsed[0].low === 9 && emParsed[0].volume === 500);
  check('东财 klines 脏行被过滤', parseEmKlines(['bad,row', '2026-11-17,10,12,13,9,500']).length === 1);

  console.log('美股财务长表透视（v1.8，离线纯函数）');
  const usRow = (report, date, type, label, name, amount, yoy = null) => ({
    REPORT: report,
    REPORT_DATE: date,
    REPORT_TYPE: type,
    REPORT_TYPE_DETAILS: label,
    ITEM_NAME: name,
    AMOUNT: amount,
    YOY_RATIO: yoy,
    CURRENCY_ABBR: 'USD',
  });
  const usIncome = [
    usRow('2026/FY', '2026-09-26', '年报', '2026年 年报', '营业收入', 100e9, 20),
    usRow('2026/FY', '2026-09-26', '年报', '2026年 年报', '归属于母公司股东净利润', 20e9, 25),
    usRow('2026/FY', '2026-09-26', '年报', '2026年 年报', '毛利', 40e9),
    usRow('2026/FY', '2026-09-26', '年报', '2026年 年报', '基本每股收益-普通股', 5),
    usRow('2026/FY', '2026-09-26', '年报', '2026年 年报', '基本加权平均股数-普通股', 10e9),
    usRow('2025/FY', '2025-09-27', '年报', '2025年 年报', '营业收入', 80e9),
    usRow('2025/FY', '2025-09-27', '年报', '2025年 年报', '归属于母公司股东净利润', 16e9),
  ];
  const usBalance = [
    usRow('2026/FY', '2026-09-26', '年报', '2026年 年报', '总资产', 200e9),
    usRow('2026/FY', '2026-09-26', '年报', '2026年 年报', '总负债', 120e9),
    usRow('2026/FY', '2026-09-26', '年报', '2026年 年报', '股东权益合计', 80e9),
    usRow('2025/FY', '2025-09-27', '年报', '2025年 年报', '股东权益合计', 60e9),
  ];
  const usFin = buildUSFinancials(usIncome, usBalance);
  check('美股长表按报告期透视取营收与净利', usFin.revenue === 100e9 && usFin.profit === 20e9);
  check('美股同比取接口 YOY_RATIO', usFin.revenueYoY === 20 && usFin.profitYoY === 25);
  check('美股毛利率 = 毛利 ÷ 营收', Math.round(usFin.grossMargin) === 40);
  check('美股 ROE = 归母净利 ÷ 平均股东权益', Math.abs(usFin.roe - 28.5714) < 0.01);
  check('美股负债率 = 总负债 ÷ 总资产', Math.round(usFin.debtRatio) === 60);
  check('美股 BPS = 股东权益 ÷ 加权股数', usFin.bps === 8);
  check('美股历史含最近两期且标注报告期', usFin.history.length === 2 && usFin.history[0].period === '2026年 年报');
  check('美股期间标注为年报口径', /年报/.test(usFin.period) && usFin.currency === 'USD');

  const bankFin = buildUSFinancials(
    [
      usRow('2026/FY', '2026-12-31', '年报', '2026年 年报', '收入总额', 90e9, 3),
      usRow('2026/FY', '2026-12-31', '年报', '2026年 年报', '归属于母公司股东净利润', 18e9, -2),
    ],
    [usRow('2026/FY', '2026-12-31', '年报', '2026年 年报', '股东权益合计', 100e9)]
  );
  check('金融股缺毛利时毛利率留空', bankFin.revenue === 90e9 && bankFin.grossMargin === null);
  check('收入总额可作为营业收入兜底', bankFin.revenueYoY === 3 && bankFin.profitYoY === -2);

  const quarterFin = buildUSFinancials(
    [
      usRow('2026/Q2', '2026-06-30', '单季报', '2026年 第二季报', '营业收入', 30e9, 10),
      usRow('2026/Q2', '2026-06-30', '单季报', '2026年 第二季报', '归属于母公司股东净利润', 6e9, 8),
    ],
    [usRow('2026/Q2', '2026-06-30', '单季报', '2026年 第二季报', '股东权益合计', 50e9)]
  );
  check('非年报口径 ROE 留空（不冒充年度回报）', quarterFin.roe === null && quarterFin.revenueYoY === 10);
  check('美股财务空数据返回 empty', buildUSFinancials([], []).empty === true);
  check('美股 secucode：.OQ → .O', usSecucode({ code: 'AAPL', rawCode: 'AAPL.OQ' }) === 'AAPL.O');
  check('美股 secucode：.N 保持', usSecucode({ code: 'JPM', rawCode: 'JPM.N' }) === 'JPM.N');
  check('美股 secucode：无后缀补 .O', usSecucode({ code: 'NVDA' }) === 'NVDA.O');

  const usScore = computeScore({
    market: 'US',
    quote: { price: 100 },
    kline: { metrics: { r20: 5, r60: 10, r120: 15, trend: '多头排列', maxDrawdown: -5, ma20: 10, ma60: 9, volatility: 0.3 } },
    reports: null,
    financials: { supported: true, revenueYoY: 10, profitYoY: 12, roe: 8, period: '2026年 年报' },
    news: [{ title: '公司增长强劲', content: '' }],
  });
  check('评分返回可用维度数与总维度数', usScore.availableCount === 3 && usScore.dimCount === 4 && usScore.coverage === 70);
  check('非 A 股评分附带跨市场不可直接比较提示', /请勿与 A 股评分直接比较高低/.test(usScore.desc));

  console.log('K 线分钟级周期（v2.3，离线纯函数）');
  check('周期归一化支持分钟线', normalizeKlinePeriod('5m') === '5m' && normalizeKlinePeriod('15m') === '15m' && normalizeKlinePeriod('60m') === '60m');
  check('非法周期回退日线', normalizeKlinePeriod('30m') === 'day');
  check('isIntradayPeriod 识别分钟线', isIntradayPeriod('5m') && isIntradayPeriod('60m') && !isIntradayPeriod('day'));
  check('东财分钟参数与默认窗口', EM_KLT['60m'] === 60 && EM_KLT['5m'] === 5 && KLINE_COUNT['5m'] === 240 && KLINE_WINDOW['15m'] === 180);
  check('分钟线 beg 为 8 位日期', /^\d{8}$/.test(emBegDate('5m')) && /^\d{8}$/.test(emBegDate('day')));
  check('美股东财 secid 映射市场号', emUsSecid({ rawCode: 'AAPL.OQ' }) === '105.AAPL' && emUsSecid({ rawCode: 'BABA.N' }) === '106.BABA' && emUsSecid({ code: 'NVDA' }) === '105.NVDA');
  check('分钟刻度显示月日与时间', candleDateLabel('2026-11-19 09:35', '5m') === '11-19 09:35' && candleDateLabel('2026-11-19', 'day') === '11-19');
  check('区间时间格式化为完整日期时间', fmtDate('2026-11-19 09:35', true) === '2026-11-19 09:35');
  const cryptoMin = parseCryptoKlines([[Date.UTC(2026, 10, 19, 9, 35), '1', '1.1', '0.9', '1.05', '10']], true);
  check('加密分钟线日期带 UTC 时间', cryptoMin[0] && cryptoMin[0].date === '2026-11-19 09:35');
  const cryptoDay = parseCryptoKlines([[Date.UTC(2026, 10, 19, 9, 35), '1', '1.1', '0.9', '1.05', '10']]);
  check('加密日线日期保持纯日期', cryptoDay[0] && cryptoDay[0].date === '2026-11-19');
  const intraRows = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-11-19 ${String(9 + Math.floor(i / 12)).padStart(2, '0')}:${String((i % 12) * 5).padStart(2, '0')}`,
    open: 10,
    close: 10.1,
    high: 10.2,
    low: 9.9,
    volume: 100 + i,
  }));
  const intraHtml = renderCandlestick(intraRows, { period: '5m', width: 660, window: 30 });
  check('分钟线渲染带时间刻度与完整区间', intraHtml.includes('11-19 09:00') && /K 线图：[^"]*2026-11-19 09:00/.test(intraHtml));

  console.log('评分数学口径（v2.4，离线纯函数）');
  const unratedReports = scoreReports(
    { market: 'A', reports: { list: Array.from({ length: 16 }, (_, i) => ({ title: 't' + i, rawDate: '2026-11-01', ratingScore: null, target: null })) } },
    { price: 100 }
  );
  check('研报无评级时按有值项归一分母（不再腰斩到 40）', unratedReports.score === 100 && unratedReports.reasons.join('').includes('评级子项不计入'));
  const ratedReports = scoreReports(
    { market: 'A', reports: { list: Array.from({ length: 16 }, (_, i) => ({ title: 't' + i, rawDate: '2026-11-01', ratingScore: 0.8, target: null })) } },
    { price: 100 }
  );
  check('研报有评级无目标价按 0.75 分母归一', ratedReports.score === 88);
  const mddLow = scoreCryptoVolatility({ metrics: { vol30: 60, maxDrawdown90: 10, atrPct: 5 } }).score;
  const mddMid = scoreCryptoVolatility({ metrics: { vol30: 60, maxDrawdown90: 30, atrPct: 5 } }).score;
  const mddTiny = scoreCryptoVolatility({ metrics: { vol30: 60, maxDrawdown90: 5, atrPct: 5 } }).score;
  const mddHigh = scoreCryptoVolatility({ metrics: { vol30: 60, maxDrawdown90: 80, atrPct: 5 } }).score;
  check('加密回撤越深得分越低', mddLow > mddMid && mddMid > mddHigh && mddHigh < 70);
  check('极浅回撤不再落入 12 分低分兜底', mddTiny >= mddLow);
  const slopeCloses = Array.from({ length: 100 }, (_, i) => 100 + i);
  const slopeRows = slopeCloses.map((c) => ({ date: '2026-01-01', open: c, close: c, high: c, low: c, volume: 1 }));
  const slopeTrend = techTrend(slopeRows);
  const meanOf = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const expSlope20 = (meanOf(slopeCloses.slice(-20)) / meanOf(slopeCloses.slice(-40, -20)) - 1) * 100;
  const expSlope60 = (meanOf(slopeCloses.slice(-60)) / meanOf(slopeCloses.slice(-80, -20)) - 1) * 100;
  check('MA20 斜率使用完整 20 日窗口', Math.abs(slopeTrend.metrics.slope20 - expSlope20) < 1e-9);
  check('MA60 斜率使用完整 60 日窗口', Math.abs(slopeTrend.metrics.slope60 - expSlope60) < 1e-9);
  const shortTrend = techTrend(slopeRows.slice(-70));
  check('60–79 根数据时斜率护栏生效', shortTrend.available === true && shortTrend.metrics.slope60 === 0);
  check('覆盖度折算三套评分共用同一系数', coverageFactor(100) === 1 && coverageFactor(45) === 0.78 && coverageMeta(75).comparable === false && coverageMeta(100).comparable === true);
  const partialScore = computeScore({
    market: 'US',
    quote: { price: 100 },
    kline: { metrics: { r20: 8, r60: 20, r120: 40, trend: '多头排列', maxDrawdown: -6, ma20: 95, ma60: 90, volatility: 0.3 } },
    reports: { list: [] },
    financials: { supported: false },
    news: Array.from({ length: 8 }, () => ({ title: '公司业绩增长超预期 创新高', date: '2026-11-01' })),
  });
  check('个股覆盖不足时标记不可比', partialScore.coverage === 45 && partialScore.comparable === false);
  const partialEtf = computeEtfScore({
    quote: { price: 1 },
    kline: {},
    technical: { consensus: { available: true, score: 80 }, dims: [{ available: true, dir: 'bullish' }] },
    fundamentals: null,
    boardMeta: null,
  });
  check('ETF 评分返回 comparable 且覆盖不足为 false', partialEtf.comparable === false && partialEtf.coverage < 100);
  const partialCrypto = computeCryptoScore({
    quote: { price: 1, volume: 5e8 },
    kline: { metrics: { vol30: 60, maxDrawdown90: 20, atrPct: 5, r7: 1, r30: 2, r90: 3 } },
    btcKline: { metrics: { r7: 1, r30: 2, r90: 3 } },
    meta: { marketCap: 1e9, rank: 50 },
    derivatives: null,
    fng: null,
    chainTvl: null,
  });
  check('加密评分返回 comparable 且覆盖不足为 false', partialCrypto.comparable === false && partialCrypto.total !== null);

  console.log('健壮性与工程化加固（v2.5，离线纯函数）');
  const flatRsi = rsiSeries(Array.from({ length: 40 }, () => 10), 6);
  check('完全横盘时 RSI 记 50（不再误判 100）', flatRsi.slice(6).every((v) => v === 50));
  const upRsi = rsiSeries(Array.from({ length: 40 }, (_, i) => 10 + i), 6);
  check('单边上涨时 RSI 仍接近 100', upRsi[upRsi.length - 1] > 99);
  check('美股 secucode：类股 .A.N → BRK_A.N', usSecucode({ rawCode: 'BRK.A.N' }) === 'BRK_A.N');
  check('美股 secucode：美交所 .AM → .A', usSecucode({ rawCode: 'AMJB.AM' }) === 'AMJB.A');
  check('美股 secucode：手输 .AMEX 归一为 .A', usSecucode({ rawCode: 'IMO.AMEX' }) === 'IMO.A');
  check('美股 secucode：手输 .NYSE 不再拼成 .NYSE.O', usSecucode({ rawCode: 'JPM.NYSE' }) === 'JPM.N');
  check('美股东财 secid：BRK.A.N → 106.BRK_A', emUsSecid({ rawCode: 'BRK.A.N' }) === '106.BRK_A');
  check('美股东财 secid：AMJB.AM → 107.AMJB', emUsSecid({ rawCode: 'AMJB.AM' }) === '107.AMJB');
  check('美股东财 secid：IMO.AMEX → 107.IMO', emUsSecid({ rawCode: 'IMO.AMEX' }) === '107.IMO');
  check('腾讯 quote 键：AAPL.OQ → usAAPL', usQuoteKeys({ rawCode: 'AAPL.OQ' })[0] === 'usAAPL');
  check('腾讯 quote 键：AMJB.AM → usAMJB（不再带 .AM）', usQuoteKeys({ rawCode: 'AMJB.AM' })[0] === 'usAMJB');
  check('腾讯 quote 键：BRK.A.N → usBRK.A（保留类股段）', usQuoteKeys({ rawCode: 'BRK.A.N' })[0] === 'usBRK.A');
  check('腾讯 quote 键：手输 BRK.A 有保留类股段的兜底候选', usQuoteKeys({ rawCode: 'BRK.A' }).includes('usBRK.A'));
  check('腾讯 quote 键：东财 BRK_A.N 反推 usBRK.A', usQuoteKeys({ rawCode: 'BRK_A.N' })[0] === 'usBRK.A');
  check('交易所标签识别美交所 .AM', exchangeLabel({ market: 'US', rawCode: 'AMJB.AM' }) === 'NYSE American');
  const usFields = usStockFields('BAC-B.N', '美国银行');
  check('美股字段：优先股 BAC-B 保留连字符', usFields.code === 'BAC-B' && usFields.quoteKey === 'usBAC-B');
  check('美股字段：K 线键保留完整交易所后缀', usFields.klineCode === 'usBAC-B.N');
  const typedBrk = parseSymbolInput('BRK.A');
  check(
    '手输 BRK.A 首个候选为类股键且保留原始 K 线键',
    typedBrk.market === 'US' && usQuoteKeys(typedBrk)[0] === 'usBRK.A' && typedBrk.klineCode === 'usBRK.A'
  );
  const typedAmex = parseSymbolInput('IMO.AMEX');
  check('手输 IMO.AMEX 的 quote 键去掉交易所后缀', typedAmex.quoteKey === 'usIMO' && typedAmex.klineCode === 'usIMO.AMEX');
  check('加密链映射：BCH 使用 Bitcoincash', CRYPTO_CHAINS.BCH === 'Bitcoincash' && !('XRP' in CRYPTO_CHAINS));
  check('加密分钟 K 线时效收紧', cryptoKlineTtl('5m') === 60000 && cryptoKlineTtl('15m') === 90000 && cryptoKlineTtl('day') === CRYPTO_TTL.kline);
  check('候选池时效收紧到 5 分钟', SCREENER_POOL_TTL === 5 * 60 * 1000);
  check('内存缓存有上限', MEM_CACHE_MAX === 120);
  for (let i = 0; i < MEM_CACHE_MAX + 5; i++) memSet('v25-' + i, { t: Date.now(), d: i });
  check(
    '内存缓存按插入顺序淘汰最旧条目',
    memCache.size === MEM_CACHE_MAX && !memCache.has('v25-0') && memCache.has('v25-' + (MEM_CACHE_MAX + 4))
  );
  for (let i = 0; i < MEM_CACHE_MAX + 5; i++) memCache.delete('v25-' + i);
  let forceRuns = 0;
  let releaseForce;
  const forceGate = new Promise((resolve) => (releaseForce = resolve));
  const forceLoader = () => {
    forceRuns += 1;
    return forceGate.then(() => forceRuns);
  };
  const inflightA = cached('v25-force', 60 * 60 * 1000, forceLoader);
  const inflightB = cached('v25-force', 60 * 60 * 1000, forceLoader, true);
  releaseForce();
  await Promise.all([inflightA, inflightB]);
  check('force 刷新不复用 inflight 请求', forceRuns === 2);
  const escapedEmpty = emptyState({ title: '测试', desc: '<img src=x onerror=alert(1)>' });
  check('空状态描述做 HTML 转义', !/<img/i.test(escapedEmpty) && /&lt;img/.test(escapedEmpty));
  /* 配额溢出：先淘汰最旧的 sl:c: 条目再重试一次写入 */
  const quotaMap = new Map();
  let quotaThrown = false;
  const quotaStub = {
    get length() {
      return quotaMap.size;
    },
    key: (i) => [...quotaMap.keys()][i] || null,
    getItem: (k) => (quotaMap.has(k) ? quotaMap.get(k) : null),
    setItem: (k, v) => {
      if (!quotaThrown) {
        quotaThrown = true;
        throw new Error('QuotaExceededError');
      }
      quotaMap.set(k, v);
    },
    removeItem: (k) => quotaMap.delete(k),
  };
  for (let i = 0; i < 6; i++) quotaMap.set('sl:c:old' + i, JSON.stringify({ t: i, d: i }));
  const localDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: quotaStub, configurable: true });
  const quotaWritten = writeLocal('sl:c:new', { t: 99, d: 'x' });
  if (localDesc) Object.defineProperty(globalThis, 'localStorage', localDesc);
  else delete globalThis.localStorage;
  check(
    'localStorage 写满时淘汰最旧缓存并重试成功',
    quotaWritten === true && !quotaMap.has('sl:c:old0') && quotaMap.has('sl:c:new')
  );

  console.log('K 线视图窗口（v1.9，离线纯函数）');
  const vz = candleClampView({ count: 500, endOffset: -3 }, 240, 120);
  check('视图窗口 count 夹取到数据长度', vz.count === 240 && vz.endOffset === 0);
  const vz2 = candleClampView({ count: 5, endOffset: 999 }, 240, 120);
  check('视图窗口 count 下限 20 且 endOffset 不越界', vz2.count === 20 && vz2.endOffset === 220);
  const zoomed = candleZoomView({ count: 100, endOffset: 0 }, 300, 0.5, 0.25);
  check('缩放后根数减半', zoomed.count === 50);
  const anchorBefore = 300 - 0 - 100 + 0.25 * 99;
  const anchorAfter = 300 - zoomed.endOffset - zoomed.count + 0.25 * (zoomed.count - 1);
  check('缩放锚点保持光标所在根位置', Math.abs(anchorAfter - anchorBefore) <= 1);
  check('向右拖拽超界夹到最新一根', candlePanView({ count: 60, endOffset: 0 }, 200, -999).endOffset === 0);
  check('向左拖拽超界夹到最早一根', candlePanView({ count: 60, endOffset: 0 }, 200, 999).endOffset === 140);
  check('平移按整根位移且不改变根数', candlePanView({ count: 60, endOffset: 10 }, 200, 5).endOffset === 15);
  const viewRows = Array.from({ length: 120 }, (_, i) => ({
    date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
    open: 10,
    close: 10.1,
    high: 10.2,
    low: 9.9,
    volume: 100 + i,
  }));
  CANDLE_VIEW.set('unit_view', { count: 40, endOffset: 0 });
  const zoomHtml = renderCandlestick(viewRows, { key: 'unit_view', window: 240, width: 500 });
  check('显式 key 复用已保存的视图窗口（40 根）', auditCandlestick(zoomHtml, 40).bars === 40);
  CANDLE_VIEW.delete('unit_view');
  const defHtml = renderCandlestick(viewRows, { key: 'unit_default', window: 240, width: 500 });
  check('默认视图显示最近全部可用数据', auditCandlestick(defHtml, 120).bars === 120);
  check('无 key 的渲染使用独立视图（30 根）', auditCandlestick(renderCandlestick(viewRows, { window: 30, width: 500 }), 30).bars === 30);
  check('响应式宽度写入 viewBox', /viewBox="0 0 500 \d+/.test(defHtml));
  check('图表包含缩放/平移提示与最新价标签', /candle-hint/.test(defHtml) && /candle-last-tag/.test(defHtml));

  const fakeHost = { clientWidth: 800, querySelector: () => null, closest: () => null };
  const rendered = renderCandlestick(viewRows, { key: 'redraw_key', window: 240 });
  const fakeId = (rendered.match(/data-candle-id="([^"]+)"/) || [])[1];
  const fakeSvg = { dataset: { candleId: fakeId }, style: {}, innerHTML: '', setAttribute() {}, closest: () => fakeHost };
  redrawCandle(fakeSvg, { count: 30, endOffset: 0 });
  const redrawn = CANDLE_STORE.get(fakeSvg.dataset.candleId);
  check('就地重绘保留 SVG 节点并更新可见根数', !!redrawn && redrawn.geom.n === 30 && /candle-hover-layer/.test(fakeSvg.innerHTML));
  check('就地重绘按容器宽度重算 viewBox', redrawn.width === 800 && fakeSvg.innerHTML.includes('x2="742"'));

  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);
})();
