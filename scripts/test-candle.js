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
vm.runInThisContext(fs.readFileSync(path.join(src, '22-indicators.js'), 'utf8'), { filename: '22-indicators.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '21-charts.js'), 'utf8'), { filename: '21-charts.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '23-technical.js'), 'utf8'), { filename: '23-technical.js' });

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
  const base = isUS
    ? 'https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get'
    : 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';
  const count = { day: 320, week: 260, month: 140 }[period];
  const url = `${base}?param=${enc(key)},${period},,,${count},qfq`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const block = data.data[key] || Object.values(data.data)[0];
  const arr = block[`qfq${period}`] || block[period] || [];
  return arr
    .map((row) => ({ date: row[0], open: +row[1], close: +row[2], high: +row[3], low: +row[4], volume: +row[5] }))
    .filter((p) => p.date && Number.isFinite(p.close));
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

  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);
})();
