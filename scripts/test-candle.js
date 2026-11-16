#!/usr/bin/env node
/**
 * K 线模块冒烟测试（v1.3 引擎无关化）：
 *   1. 数据层：真实腾讯接口拉取 日/周/月 K 线，校验 OHLC 合法性（需要联网）
 *   2. 数据映射：toKLineData 过滤脏数据、timestamp 映射
 *   3. 目标价锚点：klineAnchorFilter 区间过滤（FR-5）
 *   4. 降级路径：mountKline 在缺引擎 / init 失败 / 数据不足时返回 false（FR-3.6）
 *   5. 技术指标引擎：MACD/KDJ/RSI/BOLL 数值断言（FR-4）
 * 渲染正确性（缩放/平移/十字光标）按 PRD v1.3 依赖浏览器人工验收清单。
 * 运行：node scripts/test-candle.js
 * 任一断言失败则以退出码 1 结束，可作构建前回归门禁。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');

/* 最小环境桩：21-charts.js 顶层监听 window resize，挂载逻辑不在此处执行 */
global.window = global;
global.window.addEventListener = () => {};
global.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
};
global.getComputedStyle = () => ({ getPropertyValue: () => '' });

const src = path.join(root, 'src', 'js');
vm.runInThisContext(fs.readFileSync(path.join(src, '00-utils.js'), 'utf8'), { filename: '00-utils.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '22-indicators.js'), 'utf8'), { filename: '22-indicators.js' });
vm.runInThisContext(fs.readFileSync(path.join(src, '21-charts.js'), 'utf8'), { filename: '21-charts.js' });

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

/* 数据层断言：OHLC 关系合法且有限（引擎无关） */
function auditPoints(pts) {
  const bad = pts.filter(
    (p) =>
      !Number.isFinite(p.open) ||
      !Number.isFinite(p.close) ||
      !Number.isFinite(p.high) ||
      !Number.isFinite(p.low) ||
      p.high < p.low ||
      p.high < Math.max(p.open, p.close) - 1e-6 ||
      p.low > Math.min(p.open, p.close) + 1e-6
  );
  return bad.length;
}

function makeBars(n, start = 10) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: start + i * 0.1,
    close: start + 0.05 + i * 0.1,
    high: start + 0.2 + i * 0.1,
    low: start - 0.1 + i * 0.1,
    volume: 1000 + i,
  }));
}

(async () => {
  console.log('数据层（真实接口，引擎无关）');
  const cases = [
    ['A股 日K', 'sh600519', 'day', false, 240],
    ['A股 周K', 'sh600519', 'week', false, 260],
    ['A股 月K', 'sh600519', 'month', false, 140],
    ['港股 日K', 'hk00700', 'day', false, 240],
    ['美股 日K', 'usAAPL.OQ', 'day', true, 240],
    ['美股 周K', 'usAAPL.OQ', 'week', true, 260],
  ];
  const fetched = {};
  for (const [label, key, period, isUS] of cases) {
    try {
      const pts = await fetchKline(key, period, isUS);
      fetched[label] = pts;
      const bad = auditPoints(pts);
      check(
        `${label}（${pts.length} 根，OHLC 合法）`,
        pts.length >= 100 && bad === 0,
        bad ? `${bad} 根非法` : pts.length < 100 ? '数据量不足' : ''
      );
    } catch (err) {
      failures += 1;
      console.error(`  ✗ ${label} — 接口失败: ${err.message}`);
    }
  }

  console.log('数据映射 toKLineData');
  const bars = toKLineData(makeBars(60));
  check(
    '60 根合法数据完整映射为 KLineData',
    bars.length === 60 &&
      bars.every((b) => Number.isFinite(b.timestamp) && Number.isFinite(b.open) && Number.isFinite(b.close) && b.high >= b.low)
  );
  check('null 输入返回空数组', toKLineData(null).length === 0);
  const dirty = [{ date: '2026-01-01', open: NaN, close: 1, high: 'x', low: null, volume: undefined }, ...makeBars(5)];
  check('脏数据行被过滤不产生 NaN', toKLineData(dirty).length === 5);
  const crossed = toKLineData([{ date: '2026-01-01', open: 5, close: 5, high: 4, low: 6, volume: 1 }]);
  check('high < low 的数据被过滤', crossed.length === 0);
  const badDate = toKLineData([{ date: 'not-a-date', open: 1, close: 1, high: 2, low: 0.5, volume: 1 }]);
  check('非法日期被过滤', badDate.length === 0);

  console.log('目标价锚点过滤（FR-5）');
  const anchorBars = toKLineData(makeBars(60));
  const anchors = klineAnchorFilter({ high: 18.5, mid: 17.8, low: 17.2, count: 5 }, anchorBars);
  check('常规目标价保留 3 条锚线', anchors.length === 3);
  const crazy = klineAnchorFilter({ high: 900, mid: 500, low: 400, count: 3 }, anchorBars);
  check('离谱目标价（超 60% 跨度）全部过滤', crazy.length === 0);
  const half = klineAnchorFilter({ high: 18.5, mid: 17.8, low: 300, count: 3 }, anchorBars);
  check('混合目标价只保留区间内的 2 条', half.length === 2);
  check('无目标价返回空数组', klineAnchorFilter(null, anchorBars).length === 0);
  const dup = klineAnchorFilter({ high: 18.5, mid: 18.5, low: 18.5, count: 3 }, anchorBars);
  check('三档同值仍各保留一条（标签区分）', dup.length === 3);

  console.log('降级路径（FR-3.6，引擎不可用/数据不足时 mountKline 返回 false）');
  const host = { dataset: {}, isConnected: true, closest: () => null };
  check('缺 window.klinecharts 时返回 false', mountKline(host, { points: makeBars(60) }) === false);
  window.klinecharts = { init: () => { throw new Error('canvas unavailable'); } };
  check('init 抛异常时返回 false', mountKline(host, { points: makeBars(60) }) === false);
  delete window.klinecharts;
  check('数据不足 2 根时返回 false', mountKline({ dataset: {} }, { points: makeBars(1) }) === false);
  check('空宿主时返回 false', mountKline(null, { points: makeBars(60) }) === false);

  console.log('技术指标引擎（FR-4）');
  const okRows = makeBars(60);
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
  check('RSI 数据不足 14 根时档位不可用', !subAvailable('rsi', 13) && subAvailable('rsi', 14));

  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);
})();
