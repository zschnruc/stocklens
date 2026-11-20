/* ============================================================
   Screener — A 股热门榜单批量评分（反向选股）
   纯前端：候选池来自东财 push2 榜单，四维数据复用既有 API 层，
   逐只调用 computeScore，缺失维度按既有降级逻辑处理，不臆造分数。
   ============================================================ */
'use strict';

const SCREENER_DEFAULT_SIZE = 40;
const SCREENER_DEFAULT_THRESHOLD = 80;
const SCREENER_CONCURRENCY = 4;
/* 候选池时效：盘中名单变化快，5 分钟足够新；个股行情仍按各自 TTL 更新 */
const SCREENER_POOL_TTL = 5 * 60 * 1000;

/* 沪深 A 股（主板 / 创业板 / 科创板），按成交额排序取热门候选 */
function getScreenerCandidates(size = SCREENER_DEFAULT_SIZE) {
  const n = clamp(Math.round(Number(size) || SCREENER_DEFAULT_SIZE), 10, 100);
  return cached(`screener-candidates:${n}`, SCREENER_POOL_TTL, async () => {
    const params = new URLSearchParams({
      pn: '1',
      pz: String(n),
      po: '1',
      np: '1',
      fltt: '2',
      invt: '2',
      fid: 'f6',
      fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
      fields: 'f12,f13,f14,f6,f20',
    });
    const data = await emJsonp(`${API.push2}clist/get?${params}`);
    const diff = data && data.data && data.data.diff;
    const rows = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
    return rows
      .map(normalizeScreenerRow)
      .filter(Boolean)
      .slice(0, n);
  });
}

/* 纯函数：push2 榜单行 → 可复用 stock 对象 */
function normalizeScreenerRow(r) {
  if (!r) return null;
  const code = String(r.f12 || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) return null;
  const name = stripTags(String(r.f14 || code));
  if (/ST|退|\*/.test(name)) return null;
  const prefix = aSharePrefix(code);
  return {
    market: 'A',
    code,
    name,
    kind: isEtfCode(code) ? 'etf' : 'stock',
    quoteKey: prefix + code,
    klineCode: prefix + code,
    rawCode: code,
    amount: num(r.f6),
    marketCap: num(r.f20) != null ? num(r.f20) / 1e8 : null,
  };
}

/* 纯函数：对单只候选股的四维数据调用既有评分引擎 */
function scoreScreenerCandidate({ stock, quote, kline, reports, financials, news }) {
  return computeScore({
    market: 'A',
    quote,
    kline,
    reports,
    financials,
    news,
  });
}

/* 拉取单只候选股的完整四维数据；任何单项失败都降级为 null，不阻断整轮扫描 */
async function fetchCandidateData(stock, quote) {
  const [kline, reports, financials, news] = await Promise.all([
    getKline(stock, quote).catch(() => null),
    getStockReports(stock).catch(() => ({ supported: false, list: [] })),
    getFinancials(stock).catch(() => null),
    getNews(stock).catch(() => []),
  ]);
  return { kline, reports, financials, news };
}

/* 纯函数：按综合分降序排名（无分者置末），并写入 rank */
function rankScreenerRows(rows) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  list.sort((a, b) => {
    const av = a && Number.isFinite(a.score && a.score.total) ? a.score.total : -1;
    const bv = b && Number.isFinite(b.score && b.score.total) ? b.score.total : -1;
    if (av !== bv) return bv - av;
    return String((a && a.stock && a.stock.code) || '').localeCompare(String((b && b.stock && b.stock.code) || ''));
  });
  list.forEach((row, i) => {
    row.rank = i + 1;
  });
  return list;
}

/* 纯函数：按阈值筛选（供渲染层与测试复用） */
function filterScreenerRows(rows, threshold) {
  const t = Number(threshold);
  const limit = Number.isFinite(t) ? t : SCREENER_DEFAULT_THRESHOLD;
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => r && r.score && Number.isFinite(r.score.total) && r.score.total >= limit
  );
}

/* 主流程：候选池 → 批量行情 → 受控并发评分 → 排名
   onProgress(done, total, row) 逐只回调；shouldStop() 返回 true 时中止。 */
async function runScreener({ size = SCREENER_DEFAULT_SIZE, onProgress, shouldStop } = {}) {
  const candidates = await getScreenerCandidates(size);
  if (!candidates.length) throw new Error('热门榜单暂不可用，请稍后重试');

  if (shouldStop && shouldStop()) return { rows: [], ranAt: new Date(), candidates: candidates.length, stopped: true };

  const quoteMap = await getQuoteBatch(candidates.map((s) => s.quoteKey));
  const usable = candidates.filter((s) => quoteMap.has(s.quoteKey));
  if (!usable.length) throw new Error('行情接口暂不可用，请稍后重试');

  const rows = [];
  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < usable.length) {
      if (shouldStop && shouldStop()) return;
      const stock = usable[cursor++];
      const quote = quoteMap.get(stock.quoteKey);
      let row;
      try {
        const data = await fetchCandidateData(stock, quote);
        row = {
          stock,
          quote,
          kline: data.kline,
          score: scoreScreenerCandidate({ stock, quote, ...data }),
        };
      } catch (e) {
        row = { stock, quote, score: computeScore({ market: 'A', quote }) };
      }
      rows.push(row);
      done += 1;
      if (onProgress) onProgress(done, usable.length, row);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SCREENER_CONCURRENCY, usable.length) }, () => worker())
  );

  const stopped = !!(shouldStop && shouldStop());
  return {
    rows: rankScreenerRows(rows),
    ranAt: new Date(),
    candidates: candidates.length,
    scanned: usable.length,
    failed: rows.filter((r) => !r.score || !Number.isFinite(r.score.total)).length,
    stopped,
  };
}
