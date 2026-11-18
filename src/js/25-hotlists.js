/* ============================================================
   Home board lists — 成交热门榜 / 主力资金净流入榜
   每个榜单仅 1 个东财 push2 请求；现价与涨跌幅随榜单一起返回，
   无需额外行情请求。失败/空数据独立降级，不阻塞另一榜单。
   ============================================================ */
'use strict';

const HOTLIST_SIZE = 10;
const HOTLIST_TTL = 90 * 1000; /* 榜单为盘中动态数据，短 TTL 避免长期陈旧 */

/* 纯函数：push2 榜单行 → 带行情的 stock 对象
   复用 24-screener.js 的 normalizeScreenerRow（代码/前缀/ST 过滤），附加现价与涨跌与榜单指标 */
function normalizeHotlistRow(r) {
  const stock = normalizeScreenerRow(r);
  if (!stock) return null;
  return {
    ...stock,
    price: num(r.f2),
    changePct: num(r.f3),
    amount: num(r.f6),      /* 成交额（元） */
    netInflow: num(r.f62),  /* 主力净流入（元） */
  };
}

/* 通用榜单拉取：fid 决定排序字段，fields 决定返回列 */
function fetchRankBoard(kind, fid, fields, size = HOTLIST_SIZE, force = false) {
  const n = clamp(Math.round(Number(size) || HOTLIST_SIZE), 5, 30);
  return cached(`hotlist:${kind}:${n}`, HOTLIST_TTL, async () => {
    const params = new URLSearchParams({
      pn: '1',
      pz: String(n),
      po: '1',
      np: '1',
      fltt: '2',
      invt: '2',
      fid,
      fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23',
      fields,
    });
    const data = await emJsonp(`${API.push2}clist/get?${params}`);
    const diff = data && data.data && data.data.diff;
    const rows = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
    return rows
      .map(normalizeHotlistRow)
      .filter((s) => s && Number.isFinite(s.price))
      .slice(0, n);
  }, force);
}

/* 当下最热门：按成交额排序（force 用于首页手动刷新，绕过 TTL 缓存） */
function getHotBoard(size = HOTLIST_SIZE, force = false) {
  return fetchRankBoard('hot', 'f6', 'f12,f14,f2,f3,f6', size, force);
}

/* 主力资金净流入最多：按 f62（今日主力净流入额）排序 */
function getInflowBoard(size = HOTLIST_SIZE, force = false) {
  return fetchRankBoard('inflow', 'f62', 'f12,f14,f2,f3,f62,f184', size, force);
}
