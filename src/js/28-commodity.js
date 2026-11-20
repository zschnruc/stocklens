/* ============================================================
   大宗商品数据层（轻量版）
   行情：腾讯财经 hf_* 商品批量接口（GBK，CORS *）
   K 线：东方财富 push2his 商品 secid（日/周/月/分钟）
   首批 6 个品种：黄金 / 白银 / WTI / 布伦特 / 铜 / 天然气
   本模块不生成综合评分，只提供行情、K 线与技术研判所需数据。
   ============================================================ */
'use strict';

const COMMODITY_TTL = {
  board: 45 * 1000,
};

const COMMODITY_LIST = [
  {
    key: 'gold',
    code: 'GC',
    name: '黄金',
    en: 'Gold',
    group: '贵金属',
    tencent: 'hf_GC',
    spot: 'hf_XAU',
    secid: '101.GC00Y',
    unit: '美元/盎司',
    digits: 2,
    contract: 'COMEX 黄金连续合约',
  },
  {
    key: 'silver',
    code: 'SI',
    name: '白银',
    en: 'Silver',
    group: '贵金属',
    tencent: 'hf_SI',
    spot: 'hf_XAG',
    secid: '101.SI00Y',
    unit: '美元/盎司',
    digits: 2,
    contract: 'COMEX 白银连续合约',
  },
  {
    key: 'wti',
    code: 'CL',
    name: 'WTI 原油',
    en: 'WTI Crude',
    group: '能源',
    tencent: 'hf_CL',
    secid: '102.CL00Y',
    unit: '美元/桶',
    digits: 2,
    contract: 'NYMEX WTI 原油连续合约',
  },
  {
    key: 'brent',
    code: 'B',
    name: '布伦特原油',
    en: 'Brent Crude',
    group: '能源',
    tencent: 'hf_OIL',
    secid: '112.B00Y',
    unit: '美元/桶',
    digits: 2,
    contract: 'ICE 布伦特原油连续合约',
  },
  {
    key: 'copper',
    code: 'HG',
    name: '铜',
    en: 'Copper',
    group: '工业金属',
    tencent: 'hf_HG',
    secid: '101.HG00Y',
    unit: '美元/磅',
    digits: 4,
    contract: 'COMEX 铜连续合约',
  },
  {
    key: 'gas',
    code: 'NG',
    name: '天然气',
    en: 'Natural Gas',
    group: '能源',
    tencent: 'hf_NG',
    secid: '102.NG00Y',
    unit: '美元/百万英热',
    digits: 3,
    contract: 'NYMEX 天然气连续合约',
  },
];

const COMMODITY_BY_KEY = new Map(COMMODITY_LIST.map((c) => [c.key, c]));
const COMMODITY_BY_CODE = new Map(COMMODITY_LIST.map((c) => [c.code, c]));
const COMMODITY_BY_TENCENT = new Map(COMMODITY_LIST.map((c) => [c.tencent.toLowerCase(), c]));

/* 别名只收中文名与 3 字母以上的英文词：两个字母的 CL / GC / SI 等继续按美股代码解析 */
const COMMODITY_ALIASES = {
  gold: ['黄金', '金价', '纽约黄金', '伦敦金', '现货黄金', 'comex黄金', 'gold', 'xau', 'xauusd'],
  silver: ['白银', '银价', '纽约白银', '伦敦银', '现货白银', 'comex白银', 'silver', 'xag', 'xagusd'],
  wti: ['wti', 'wti原油', '原油', '美原油', '纽约原油', '轻质原油', 'crude', 'crudeoil', 'oil'],
  brent: ['布伦特', '布伦特原油', '布油', 'brent', 'brentoil'],
  copper: ['铜', '美铜', '伦铜', 'comex铜', 'copper'],
  gas: ['天然气', '美国天然气', 'nymex天然气', '亨利港', 'natgas', 'naturalgas'],
};
const COMMODITY_ALIAS_MAP = new Map();
Object.keys(COMMODITY_ALIASES).forEach((key) => {
  COMMODITY_ALIASES[key].forEach((alias) => COMMODITY_ALIAS_MAP.set(alias.toLowerCase(), key));
});

function commodityByKey(key) {
  const k = String(key || '').trim().toLowerCase();
  if (!k) return null;
  return COMMODITY_BY_KEY.get(k) || COMMODITY_BY_CODE.get(k.toUpperCase()) || null;
}

function commodityFields(def) {
  return {
    market: 'COMMODITY',
    kind: 'commodity',
    code: def.key,
    rawCode: def.key,
    name: def.name,
    quoteKey: 'commodity:' + def.key,
    klineCode: 'commodity:' + def.key,
  };
}

function normalizeCommodityStock(input) {
  const s = typeof input === 'string' ? { key: input } : input || {};
  const def =
    commodityByKey(s.key) ||
    commodityByKey(s.code) ||
    commodityByKey(s.rawCode) ||
    (s.name ? commodityByKey(COMMODITY_ALIAS_MAP.get(String(s.name).trim().toLowerCase()) || '') : null);
  if (!def) return null;
  return Object.assign(commodityFields(def), { name: s.name || def.name });
}

/* 手输 / 搜索：只匹配别名表，避免劫持 CL、GC 等两字母美股代码 */
function commodityResolveQuery(query) {
  const raw = String(query || '').trim().toLowerCase();
  if (!raw) return null;
  const key = COMMODITY_ALIAS_MAP.get(raw);
  return key ? normalizeCommodityStock({ key }) : null;
}

function searchCommodities(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const out = [];
  const seen = new Set();
  COMMODITY_LIST.forEach((def) => {
    if (out.length >= 4) return;
    const aliases = COMMODITY_ALIASES[def.key] || [];
    const hit =
      def.key.startsWith(q) ||
      def.name.toLowerCase().includes(q) ||
      def.en.toLowerCase().includes(q) ||
      aliases.some((a) => a.toLowerCase().startsWith(q) || a.toLowerCase().includes(q));
    if (!hit || seen.has(def.key)) return;
    seen.add(def.key);
    out.push(normalizeCommodityStock({ key: def.key }));
  });
  return out;
}

/* ---------------- 行情 ---------------- */

function parseCommodityQuoteFields(def, f) {
  if (!def || !Array.isArray(f) || f.length < 14) return null;
  const price = num(f[0]);
  if (!Number.isFinite(price) || price <= 0) return null;
  const prevClose = num(f[7]);
  const change = Number.isFinite(prevClose) ? price - prevClose : null;
  const date = String(f[12] || '');
  const clock = String(f[6] || '');
  return Object.assign(commodityFields(def), {
    price,
    change,
    changePct: num(f[1]),
    prevClose,
    open: num(f[8]),
    high: num(f[4]),
    low: num(f[5]),
    date,
    quoteTime: clock,
    time: [date, clock].filter(Boolean).join(' '),
    currency: 'USD',
    unit: def.unit,
    digits: def.digits,
    group: def.group,
    contract: def.contract,
    secid: def.secid,
    tencentCode: def.tencent,
    source: '腾讯财经',
  });
}

function parseCommoditySpot(def, f) {
  if (!def || !def.spot || !Array.isArray(f)) return null;
  const price = num(f[0]);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    code: def.spot,
    name: String(f[13] || ''),
    price,
    changePct: num(f[1]),
    date: String(f[12] || ''),
    time: String(f[6] || ''),
  };
}

async function fetchCommodityQuoteMap() {
  const keys = COMMODITY_LIST.map((c) => c.tencent).concat(['hf_XAU', 'hf_XAG']);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(API.quote + keys.join(','), { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`商品行情 HTTP ${res.status}`);
    const text = decodeGBK(await res.arrayBuffer());
    const map = new Map();
    const re = /v_([^=]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(text))) map.set(m[1], m[2].split(','));
    if (!map.size) throw new Error('商品行情数据为空');
    return map;
  } finally {
    clearTimeout(timer);
  }
}

function commodityBoardRows(map) {
  return COMMODITY_LIST.map((def) => {
    const quote = parseCommodityQuoteFields(def, map.get(def.tencent));
    if (!quote) return Object.assign(commodityFields(def), { price: null, changePct: null, unit: def.unit });
    quote.spot = parseCommoditySpot(def, map.get(def.spot));
    return quote;
  });
}

function getCommodityBoard(force = false) {
  return cached('commodity:board', COMMODITY_TTL.board, async () => commodityBoardRows(await fetchCommodityQuoteMap()), force);
}

function getCommodityQuote(stock, force = false) {
  const def = commodityByKey(stock && (stock.code || stock.rawCode));
  if (!def) return Promise.reject(new Error('未知的大宗商品品种'));
  return getCommodityBoard(force).then((rows) => {
    const hit = rows.find((r) => r && r.code === def.key);
    if (!hit || !Number.isFinite(hit.price)) throw new Error('商品行情数据为空');
    return hit;
  });
}

/* ---------------- K 线 ---------------- */

function getCommodityKline(stock, period = 'day') {
  const def = commodityByKey(stock && (stock.code || stock.rawCode));
  if (!def) return Promise.reject(new Error('未知的大宗商品品种'));
  const p = normalizeKlinePeriod(period);
  const count = KLINE_COUNT[p] || 320;
  return cached(`commodity:kline:${p}:${def.secid}`, klineTtl(p), async () => {
    const params = new URLSearchParams({
      secid: def.secid,
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: 'f51,f52,f53,f54,f55,f56',
      klt: String(EM_KLT[p]),
      /* 商品无复权概念，传 1 与东财默认口径一致，页面不展示「前复权」字样 */
      fqt: '1',
      beg: emBegDate(p),
      end: '20500101',
      lmt: String(count),
    });
    const data = await emJsonp(`${API.emKline}?${params}`);
    const lines = data && data.data && data.data.klines;
    if (!Array.isArray(lines) || !lines.length) throw new Error('商品 K 线数据暂不可用');
    const points = parseEmKlines(lines.slice(-count));
    if (points.length < 5) throw new Error('商品 K 线数据不足');
    return {
      key: 'commodity:' + def.secid,
      period: p,
      points,
      metrics: p === 'day' ? klineMetrics(points) : null,
      source: '东方财富',
    };
  });
}

/* ---------------- 展示格式 ---------------- */

function fmtCommodityPrice(n, def) {
  const digits = def && Number.isFinite(def.digits) ? def.digits : 2;
  return fmtPrice(n, digits);
}
