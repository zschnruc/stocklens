/* ============================================================
   Data layer — Tencent quotes/kline, Eastmoney reports/F10/news
   ============================================================ */
'use strict';

const API = {
  quote: 'https://qt.gtimg.cn/q=',
  kline: 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get',
  usKline: 'https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get',
  smartbox: 'https://smartbox.gtimg.cn/s3/',
  report: 'https://reportapi.eastmoney.com/report/list',
  datacenter: 'https://datacenter-web.eastmoney.com/api/data/v1/get',
  news: 'https://search-api-web.eastmoney.com/search/jsonp',
  push2: 'https://push2.eastmoney.com/api/qt/',
  emKline: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
  pdf: 'https://pdf.dfcfw.com/pdf/H3_',
};

const TTL = {
  quote: 60 * 1000,
  kline: 10 * 60 * 1000,
  report: 30 * 60 * 1000,
  financial: 6 * 60 * 60 * 1000,
  profile: 24 * 60 * 60 * 1000,
  news: 10 * 60 * 1000,
  peers: 30 * 60 * 1000,
  boards: 24 * 60 * 60 * 1000,
};

/* ---------------- transport ---------------- */
async function fetchJSON(url, options = {}) {
  const { timeout = 15000, headers = {} } = options;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      /* 部署到 https（如 GitHub Pages）后浏览器会自动带 Referer，
         东方财富 WAF 会拦截非东财来源的 Referer（HTTP 567）。
         数据接口不依赖 Referer，显式关闭即可两地通用。 */
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json,text/plain,*/*', ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function jsonp(url, options = {}) {
  const { timeout = 12000, callbackParam = 'cb' } = options;
  return new Promise((resolve, reject) => {
    const cbName = '__slcb_' + Math.random().toString(36).slice(2, 10);
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      try {
        delete window[cbName];
      } catch (e) {}
    };
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      cleanup();
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('数据接口超时')), timeout);
    window[cbName] = (data) => finish(resolve, data);
    script.onerror = () => finish(reject, new Error('数据接口连接失败'));
    script.src = url + (url.includes('?') ? '&' : '?') + callbackParam + '=' + encodeURIComponent(cbName);
    script.charset = 'utf-8';
    script.referrerPolicy = 'no-referrer';
    document.head.appendChild(script);
  });
}

/* Eastmoney 接口串行 + 最小间隔，降低被限流概率 */
let emChain = Promise.resolve();
let emLast = 0;
function emQueue(fn, gap = 280) {
  const run = async () => {
    const wait = gap - (Date.now() - emLast);
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      emLast = Date.now();
    }
  };
  const p = emChain.then(run, run);
  emChain = p.catch(() => {});
  return p;
}
const emJsonp = (url) => emQueue(() => jsonp(url));
const emJSON = (url, opts) => emQueue(() => fetchJSON(url, opts));

/* ---------------- search ---------------- */
let searchChain = Promise.resolve();
const searchMemo = new Map();

function smartbox(query) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const prev = window.v_hint;
    let done = false;
    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      try {
        if (prev === undefined) delete window.v_hint;
        else window.v_hint = prev;
      } catch (e) {}
    };
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      cleanup();
      fn(v);
    };
    const timer = setTimeout(() => finish(reject, new Error('搜索超时')), 7000);
    script.onload = () => {
      const raw = window.v_hint || '';
      finish(resolve, raw);
    };
    script.onerror = () => finish(reject, new Error('搜索服务不可用'));
    script.charset = 'utf-8';
    script.src = `${API.smartbox}?q=${encodeURIComponent(query)}&t=all&r=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function normalizeSearchItem(part) {
  const f = part.split('~');
  if (f.length < 5) return null;
  const mk = f[0];
  const rawCode = (f[1] || '').trim();
  const name = stripTags(f[2] || '');
  const pinyin = (f[3] || '').trim();
  const type = f[4] || '';
  /* 放行个股(GP)与场内基金/ETF(ETF/ET/JJ)，其余类型维持原样丢弃 */
  if (!/^(GP|ETF|ET|JJ)/i.test(type)) return null;
  if (!rawCode || !name) return null;
  const kind = /^(ETF|ET|JJ)/i.test(type) ? 'etf' : 'stock';

  if (mk === 'sh' || mk === 'sz' || mk === 'bj') {
    return { market: 'A', code: rawCode, name, pinyin, quoteKey: mk + rawCode, rawCode, klineCode: mk + rawCode, kind };
  }
  if (mk === 'hk') {
    const code = rawCode.replace(/\D/g, '').padStart(5, '0');
    return { market: 'HK', code, name, pinyin, quoteKey: 'hk' + code, rawCode: code, klineCode: 'hk' + code };
  }
  if (mk === 'us') {
    const upper = rawCode.toUpperCase();
    const klineCode = 'us' + upper;
    const quoteRaw = upper.replace(/\.(OQ|N|PS|A|AMEX|NYSE)$/i, '');
    return { market: 'US', code: quoteRaw, name, pinyin, quoteKey: 'us' + quoteRaw, rawCode: upper, klineCode };
  }
  return null;
}

function parseSearchRaw(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const seen = new Set();
  const out = [];
  raw.split('^').forEach((part) => {
    const item = normalizeSearchItem(part);
    if (!item) return;
    const id = item.market + ':' + item.code;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(item);
  });
  return out.slice(0, 8);
}

const SEARCH_MEMO_MAX = 50;

function searchStocks(query) {
  const q = String(query || '').trim();
  if (!q) return Promise.resolve([]);
  const memo = searchMemo.get(q);
  if (memo && Date.now() - memo.t < 5 * 60 * 1000) return Promise.resolve(memo.d);
  if (memo) searchMemo.delete(q); /* 过期条目随手清除，避免 Map 只增不减 */
  /* 股票联想与加密候选并行；任一路失败都不影响另一路 */
  const run = async () => {
    const cryptoPromise = typeof searchCrypto === 'function' ? searchCrypto(q) : Promise.resolve([]);
    const [stockRes, cryptoRes] = await Promise.allSettled([smartbox(q), cryptoPromise]);
    const crypto = cryptoRes.status === 'fulfilled' ? cryptoRes.value || [] : [];
    const stocks = stockRes.status === 'fulfilled' ? parseSearchRaw(stockRes.value) : [];
    const seen = new Set(crypto.map((s) => s.market + ':' + s.code));
    return crypto.concat(stocks.filter((s) => !seen.has(s.market + ':' + s.code))).slice(0, 10);
  };
  const p = searchChain.then(run, run);
  searchChain = p.catch(() => {});
  return p.then((d) => {
    if (searchMemo.size >= SEARCH_MEMO_MAX) {
      searchMemo.delete(searchMemo.keys().next().value); /* 超上限淘汰最早插入的条目 */
    }
    searchMemo.set(q, { t: Date.now(), d });
    return d;
  });
}

function parseSymbolInput(input) {
  const q = String(input || '').trim();
  if (!q) return null;
  let m = q.match(/^(sh|sz|bj)(\d{6})$/i);
  if (m) {
    const mk = m[1].toLowerCase();
    const code = m[2];
    return { market: 'A', code, name: code, quoteKey: mk + code, rawCode: code, klineCode: mk + code };
  }
  if (/^\d{6}$/.test(q)) {
    const mk = aSharePrefix(q);
    return { market: 'A', code: q, name: q, quoteKey: mk + q, rawCode: q, klineCode: mk + q, kind: isEtfCode(q) ? 'etf' : 'stock' };
  }
  m = q.match(/^hk(\d{1,5})$/i);
  if (m) {
    const code = m[1].padStart(5, '0');
    return { market: 'HK', code, name: code, quoteKey: 'hk' + code, rawCode: code, klineCode: 'hk' + code };
  }
  if (/^\d{1,5}$/.test(q)) {
    const code = q.padStart(5, '0');
    return { market: 'HK', code, name: code, quoteKey: 'hk' + code, rawCode: code, klineCode: 'hk' + code };
  }
  m = q.match(/^us([A-Za-z][A-Za-z0-9.\-]*)$/i);
  if (m) {
    const raw = m[1].toUpperCase();
    const quoteRaw = raw.replace(/\.(OQ|N|PS|A|AMEX|NYSE)$/i, '');
    return { market: 'US', code: quoteRaw, name: quoteRaw, quoteKey: 'us' + quoteRaw, rawCode: raw, klineCode: 'us' + raw };
  }
  /* 加密货币别名优先于「字母即美股」的兜底：BTC / btc / 比特币 / 以太坊 */
  const coin = typeof cryptoResolveQuery === 'function' ? cryptoResolveQuery(q) : null;
  if (coin) return coin;
  if (/^[A-Za-z][A-Za-z0-9.\-]{0,11}$/.test(q)) {
    const raw = q.toUpperCase();
    const quoteRaw = raw.replace(/\.(OQ|N|PS|A|AMEX|NYSE)$/i, '');
    return { market: 'US', code: quoteRaw, name: quoteRaw, quoteKey: 'us' + quoteRaw, rawCode: raw, klineCode: 'us' + raw };
  }
  return null;
}

/* ---------------- Tencent quote ---------------- */
function decodeGBK(buffer) {
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch (e) {
    try {
      return new TextDecoder('utf-8').decode(buffer);
    } catch (e2) {
      return '';
    }
  }
}

function parseQuoteLine(key, raw) {
  if (!raw) throw new Error('行情数据为空');
  const f = raw.split('~');
  if (f.length < 38) throw new Error('行情数据格式异常');
  const market = marketFromKey(key);
  const price = num(f[3]);
  if (!Number.isFinite(price) || price <= 0) throw new Error('未找到该股票的行情');
  const quote = {
    key,
    market,
    name: stripTags(f[1] || ''),
    rawCode: f[2] || '',
    price,
    prevClose: num(f[4], 0),
    open: num(f[5], 0),
    volume: num(f[36], num(f[6], 0)),
    time: formatQuoteTime(f[30]),
    change: num(f[31], 0),
    changePct: num(f[32], 0),
    high: num(f[33], 0),
    low: num(f[34], 0),
    currency: currencyOf(market),
    source: '腾讯财经',
  };
  if (market === 'A') {
    quote.amount = num(f[37], 0) * 1e4;
    quote.turnover = num(f[38]);
    quote.pe = num(f[39]);
    quote.pb = num(f[46]);
    quote.floatCap = num(f[44]);
    quote.marketCap = num(f[45]);
    quote.high52 = num(f[67]);
    quote.low52 = num(f[68]);
    quote.volumeRatio = num(f[49]);
  } else if (market === 'HK') {
    quote.amount = num(f[37], 0);
    quote.turnover = null;
    quote.pe = num(f[39]);
    quote.pb = num(f[47]);
    quote.marketCap = num(f[45]);
    quote.high52 = num(f[48]);
    quote.low52 = num(f[49]);
  } else {
    quote.amount = num(f[37], 0);
    quote.turnover = num(f[38]);
    quote.pe = num(f[39]);
    quote.pb = num(f[47]);
    quote.marketCap = num(f[45]);
    quote.high52 = num(f[48]);
    quote.low52 = num(f[49]);
  }
  return quote;
}

async function getQuote(stock) {
  const key = stock.quoteKey || stock.klineCode;
  if (!key) throw new Error('缺少行情代码');
  return cached('quote:' + key, TTL.quote, async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(API.quote + encodeURIComponent(key), { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`行情 HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const text = decodeGBK(buf);
      const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let m = text.match(new RegExp('v_' + escKey + '="([^"]*)"'));
      if (!m) m = text.match(/v_[^=]+="([^"]*)"/);
      return parseQuoteLine(key, m ? m[1] : '');
    } finally {
      clearTimeout(timer);
    }
  });
}

async function getQuoteBatch(keys) {
  const list = [...new Set((keys || []).filter(Boolean))];
  if (!list.length) return new Map();
  const chunks = [];
  for (let i = 0; i < list.length; i += 60) chunks.push(list.slice(i, i + 60));
  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      /* 与 getQuote 一致的超时控制，避免网络挂起时 Promise 长期悬空 */
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(API.quote + chunk.map(encodeURIComponent).join(','), {
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`行情 HTTP ${res.status}`);
        const text = decodeGBK(await res.arrayBuffer());
        const out = [];
        const re = /v_([^=]+)="([^"]*)"/g;
        let m;
        while ((m = re.exec(text))) {
          try {
            out.push(parseQuoteLine(m[1], m[2]));
          } catch (e) {}
        }
        return out;
      } finally {
        clearTimeout(timer);
      }
    })
  );
  return new Map(pages.flat().map((q) => [q.key, q]));
}

/* ---------------- Tencent K-line ---------------- */
/* K 线周期：同一腾讯接口切换 period 参数（FR-3.2） */
const KLINE_PERIODS = ['day', 'week', 'month'];
const KLINE_COUNT = { day: 320, week: 260, month: 140 };
/* 东财周期参数：101 日 / 102 周 / 103 月 */
const EM_KLT = { day: 101, week: 102, month: 103 };
/* 起始日期：早于所需根数即可，东财按 beg..end 返回区间，取尾部 KLINE_COUNT 根 */
const EM_BEG = { day: '20230101', week: '20180101', month: '20100101' };

function normalizeKlinePeriod(period) {
  return KLINE_PERIODS.includes(period) ? period : 'day';
}
/* 东财 secid：沪市 1. / 深市及北交所 0. / 港股 116.；美股不走东财（保留腾讯 usfqkline） */
function emSecid(stock) {
  if (stock.market === 'HK') return '116.' + String(stock.code || '').replace(/\D/g, '').padStart(5, '0').slice(-5);
  const c = String(stock.code || '').replace(/\D/g, '');
  return (aSharePrefix(c) === 'sh' ? '1.' : '0.') + c;
}
/* 解析东财 klines：f51日期 f52开 f53收 f54高 f55低 f56量（与腾讯列序一致） */
function parseEmKlines(lines) {
  return lines
    .map((line) => {
      const row = String(line).split(',');
      return {
        date: row[0],
        open: num(row[1]),
        close: num(row[2]),
        high: num(row[3]),
        low: num(row[4]),
        volume: num(row[5], 0),
      };
    })
    .filter((r) => Number.isFinite(r.close) && r.date);
}
function klineMetrics(points) {
  const closes = points.map((p) => num(p.close)).filter((n) => Number.isFinite(n) && n > 0);
  if (closes.length < 2) throw new Error('历史行情数据不足');
  const last = closes[closes.length - 1];
  const ret = (n) => (closes.length > n ? (last / closes[closes.length - 1 - n] - 1) * 100 : null);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const ma = (n) => (closes.length >= n ? avg(closes.slice(-n)) : null);
  const daily = [];
  for (let i = 1; i < closes.length; i++) daily.push(closes[i] / closes[i - 1] - 1);
  const recent = daily.slice(-120);
  const mean = recent.length ? avg(recent) : 0;
  const variance = recent.length ? avg(recent.map((r) => (r - mean) ** 2)) : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
  let peak = closes[0];
  let maxDrawdown = 0;
  closes.slice(-120).forEach((c) => {
    peak = Math.max(peak, c);
    maxDrawdown = Math.min(maxDrawdown, (c / peak - 1) * 100);
  });
  const ma20 = ma(20);
  const ma60 = ma(60);
  let trend = '震荡';
  if (ma20 && ma60) {
    if (last > ma20 && ma20 > ma60) trend = '多头排列';
    else if (last < ma20 && ma20 < ma60) trend = '空头排列';
  }
  return {
    last,
    r20: ret(20),
    r60: ret(60),
    r120: ret(120),
    ma20,
    ma60,
    volatility,
    maxDrawdown,
    trend,
    points: closes.length,
  };
}

async function getKline(stock, quote, period = 'day') {
  const p = normalizeKlinePeriod(period);
  /* 加密资产走 Binance 数据镜像，与 A/HK/US 的东财/腾讯链路完全隔离 */
  if (stock.market === 'CRYPTO' || stock.kind === 'coin') return getCryptoKline(stock, p);
  let key = stock.klineCode || stock.quoteKey;
  if (stock.market === 'US') {
    if (quote && quote.rawCode) key = 'us' + quote.rawCode;
    else if (!key || !/\.(OQ|N|PS|A)$/i.test(key)) {
      key = 'us' + (stock.rawCode || stock.code || '');
    }
  }
  if (!key) throw new Error('缺少 K 线代码');
  const isUS = stock.market === 'US';
  const count = KLINE_COUNT[p] || 320;
  const build = (points, source) => {
    if (points.length < 5) throw new Error('K 线数据不足');
    /* 技术面指标仅在日线上有意义，周/月只返回原始点供图表使用 */
    return { key, period: p, points, metrics: p === 'day' ? klineMetrics(points) : null, source };
  };
  return cached(`kline:${p}:${key}`, TTL.kline, async () => {
    /* A股/港股主源：东财 push2his 前复权（腾讯 fqkline 已被 WAF 拦截返回 501）。
       ETF 不做前复权（fqt=0），个股与港股用前复权（fqt=1）。 */
    if (!isUS) {
      try {
        const params = new URLSearchParams({
          secid: emSecid(stock),
          fields1: 'f1,f2,f3,f4,f5,f6',
          fields2: 'f51,f52,f53,f54,f55,f56',
          klt: String(EM_KLT[p]),
          fqt: stock.kind === 'etf' || isEtfCode(stock.code) ? '0' : '1',
          beg: EM_BEG[p],
          end: '20500101',
          lmt: String(count),
        });
        const data = await emJsonp(`${API.emKline}?${params}`);
        const lines = data && data.data && data.data.klines;
        if (Array.isArray(lines) && lines.length) {
          const points = parseEmKlines(lines.slice(-count));
          if (points.length >= 5) return build(points, '东方财富');
        }
      } catch (e) {
        /* 东财不可用则回退腾讯 */
      }
    }
    /* 回退 / 美股：腾讯 fqkline（美股为 usfqkline）。注：腾讯 A股/港股 fqkline 当前被 WAF 拦截，
       仅在东财异常时才可能失败，保留兜底以便上游恢复后自动可用。 */
    const base = isUS ? API.usKline : API.kline;
    const url = `${base}?param=${encodeURIComponent(key)},${p},,,${count},qfq`;
    const data = await fetchJSON(url, { timeout: 15000 });
    const block = data && data.data && (data.data[key] || Object.values(data.data)[0]);
    if (!block) throw new Error('K 线数据为空');
    /* A/美股前复权键为 qfqday/qfqweek/qfqmonth，港股直接为 day/week/month（FR-3.7） */
    const arr = block[`qfq${p}`] || block[p] || [];
    return build(
      arr
        .map((row) => ({
          date: row[0],
          open: num(row[1]),
          close: num(row[2]),
          high: num(row[3]),
          low: num(row[4]),
          volume: num(row[5], 0),
        }))
        .filter((r) => Number.isFinite(r.close) && r.date),
      '腾讯财经'
    );
  });
}

/* ---------------- Eastmoney reports ---------------- */
function aShareSecucode(code) {
  const c = String(code || '');
  const p = aSharePrefix(c);
  return c + (p === 'sh' ? '.SH' : p === 'bj' ? '.BJ' : '.SZ');
}

function normalizeReport(r) {
  const ratingRaw = r.emRatingName || r.sRatingName || '';
  const info = ratingInfo(ratingRaw);
  const target = num(r.indvAimPriceT) || num(r.indvAimPriceL) || null;
  const analyst =
    r.researcher ||
    (Array.isArray(r.author) ? r.author.map((a) => String(a).split('.').pop()).filter(Boolean).join('、') : '');
  return {
    title: stripTags(r.title),
    date: fmtDate(r.publishDate),
    rawDate: r.publishDate,
    org: stripTags(r.orgSName || r.orgName || ''),
    orgFull: stripTags(r.orgName || ''),
    rating: ratingRaw,
    ratingLabel: info.label,
    ratingScore: info.score,
    ratingCls: info.cls,
    analyst,
    eps: num(r.predictThisYearEps),
    pe: num(r.predictThisYearPe),
    target,
    pdf: r.infoCode ? API.pdf + r.infoCode + '_1.pdf' : '',
    pages: num(r.attachPages),
    industryName: r.indvInduName || r.industryName || '',
    industryCode: r.indvInduCode || r.industryCode || '',
    stockName: stripTags(r.stockName || ''),
    stockCode: r.stockCode || '',
  };
}

async function getStockReports(stock, opts = {}) {
  if (stock.market !== 'A') {
    return { supported: false, hits: 0, list: [], industryCode: '', industryName: '' };
  }
  const pageSize = opts.pageSize || 20;
  const months = opts.months || 6;
  const code = stock.code;
  const cacheKey = `reports:${code}:${pageSize}:${months}`;
  return cached(cacheKey, TTL.report, async () => {
    const params = new URLSearchParams({
      industryCode: '*',
      pageSize: String(pageSize),
      industry: '*',
      rating: '',
      ratingChange: '',
      beginTime: monthsAgoISO(months),
      endTime: todayISO(),
      pageNo: '1',
      fields: '',
      qType: '0',
      orgCode: '',
      code,
      rcode: '',
      p: '1',
      pageNum: '1',
      pageNumber: '1',
      _: String(Date.now()),
    });
    const data = await emJSON(`${API.report}?${params}`);
    const rows = Array.isArray(data.data) ? data.data : [];
    let industryCode = '';
    let industryName = '';
    rows.forEach((r) => {
      if (!industryCode && r.indvInduCode) industryCode = r.indvInduCode;
      if (!industryName && r.indvInduName) industryName = r.indvInduName;
    });
    if (!rows.length) {
      try {
        const extra = await emJSON(
          `${API.report}?industryCode=*&pageSize=1&industry=*&rating=&ratingChange=&beginTime=2010-01-01&endTime=${todayISO()}&pageNo=1&fields=&qType=0&orgCode=&code=${code}&rcode=&p=1&pageNum=1&pageNumber=1&_=${Date.now()}`
        );
        const r = extra && extra.data && extra.data[0];
        if (r) {
          industryCode = r.indvInduCode || r.industryCode || '';
          industryName = r.indvInduName || r.industryName || '';
        }
      } catch (e) {}
    }
    return {
      supported: true,
      hits: num(data.hits, rows.length),
      list: rows.map(normalizeReport),
      industryCode,
      industryName,
    };
  });
}

async function getIndustryReports(industryCode, industryName, opts = {}) {
  if (!industryCode) return { supported: true, hits: 0, list: [], industryName: industryName || '' };
  const months = opts.months || 6;
  const pageSize = opts.pageSize || 20;
  return cached(`industry-reports:${industryCode}:${pageSize}`, TTL.report, async () => {
    const params = new URLSearchParams({
      industryCode: String(industryCode),
      pageSize: String(pageSize),
      industry: '*',
      rating: '',
      ratingChange: '',
      beginTime: monthsAgoISO(months),
      endTime: todayISO(),
      pageNo: '1',
      fields: '',
      qType: '1',
      orgCode: '',
      code: '',
      rcode: '',
      p: '1',
      pageNum: '1',
      pageNumber: '1',
      _: String(Date.now()),
    });
    const data = await emJSON(`${API.report}?${params}`);
    return {
      supported: true,
      hits: num(data.hits, (data.data || []).length),
      list: (data.data || []).map(normalizeReport),
      industryName: industryName || '',
    };
  });
}

/* ---------------- Eastmoney financials / profile ---------------- */
/* 美股 secucode：腾讯 .OQ/.N/.PS → 东财 .O/.N/.A，缺省按纳斯达克 .O */
function usSecucode(stock, quote) {
  const raw = String((quote && quote.rawCode) || (stock && stock.rawCode) || (stock && stock.code) || '')
    .replace(/^us/i, '')
    .trim();
  if (!raw) return '';
  if (/\.OQ$/i.test(raw)) return raw.replace(/\.OQ$/i, '.O');
  if (/\.PS$/i.test(raw)) return raw.replace(/\.PS$/i, '.O');
  if (/\.[A-Z]{1,2}$/i.test(raw)) return raw;
  return raw + '.O';
}

/* 东财美股财报为长表：每行一个科目，按 REPORT（如 2026/FY）分组后透视 */
function usReportGroups(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || !r.REPORT) return;
    const key = String(r.REPORT);
    let g = map.get(key);
    if (!g) {
      g = {
        report: key,
        date: String(r.REPORT_DATE || ''),
        type: String(r.REPORT_TYPE || ''),
        label: String(r.REPORT_TYPE_DETAILS || r.REPORT_TYPE || key),
        currency: r.CURRENCY_ABBR || r.CURRENCY || 'USD',
        items: new Map(),
      };
      map.set(key, g);
    }
    const name = String(r.ITEM_NAME || '').trim();
    if (name && !g.items.has(name)) g.items.set(name, r);
  });
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function usItem(group, names) {
  if (!group) return null;
  for (const name of names) {
    const row = group.items.get(name);
    if (row && Number.isFinite(num(row.AMOUNT))) return row;
  }
  return null;
}

const US_REVENUE_ITEMS = ['营业收入', '主营收入', '收入总额', '营业总收入', '总营业收入'];
const US_PROFIT_ITEMS = ['归属于母公司股东净利润', '归属于普通股股东净利润', '净利润'];
const US_EQUITY_ITEMS = ['股东权益合计', '归属于母公司股东权益', '总权益'];
const US_EPS_ITEMS = ['基本每股收益-普通股', '摊薄每股收益-普通股'];
const US_SHARES_ITEMS = ['基本加权平均股数-普通股', '摊薄加权平均股数-普通股'];

/* 纯函数：长表行 → 与 A 股/港股同字段口径的财务对象（可离线单测） */
function buildUSFinancials(incomeRows, balanceRows) {
  const groups = usReportGroups(incomeRows);
  if (!groups.length) return { supported: true, empty: true, history: [] };
  const balanceMap = new Map(usReportGroups(balanceRows).map((g) => [g.report, g]));
  const isAnnual = (g) => /年报|年度/.test(g.type || '') || /FY$/i.test(g.report || '');

  const readGroup = (g) => {
    const b = balanceMap.get(g.report) || null;
    const revenue = usItem(g, US_REVENUE_ITEMS);
    const profit = usItem(g, US_PROFIT_ITEMS);
    const gross = usItem(g, ['毛利']);
    const eps = usItem(g, US_EPS_ITEMS);
    const shares = usItem(g, US_SHARES_ITEMS);
    const equity = usItem(b, US_EQUITY_ITEMS);
    const assets = usItem(b, ['总资产']);
    const liabilities = usItem(b, ['总负债']);
    return {
      revenue: revenue ? num(revenue.AMOUNT) : null,
      revenueYoY: revenue ? num(revenue.YOY_RATIO) : null,
      profit: profit ? num(profit.AMOUNT) : null,
      profitYoY: profit ? num(profit.YOY_RATIO) : null,
      gross: gross ? num(gross.AMOUNT) : null,
      eps: eps ? num(eps.AMOUNT) : null,
      shares: shares ? num(shares.AMOUNT) : null,
      equity: equity ? num(equity.AMOUNT) : null,
      assets: assets ? num(assets.AMOUNT) : null,
      liabilities: liabilities ? num(liabilities.AMOUNT) : null,
    };
  };

  const latest = groups[0];
  const cur = readGroup(latest);
  const prev = groups[1] ? readGroup(groups[1]) : null;
  const avgEquity =
    Number.isFinite(cur.equity) && prev && Number.isFinite(prev.equity) && prev.equity > 0
      ? (cur.equity + prev.equity) / 2
      : cur.equity;
  /* 单季/中报利润不能直接当年度回报，ROE 仅在年报口径下计算 */
  const roe = isAnnual(latest) && cur.profit > 0 && avgEquity > 0 ? (cur.profit / avgEquity) * 100 : null;
  const grossMargin = cur.gross > 0 && cur.revenue > 0 ? (cur.gross / cur.revenue) * 100 : null;
  const debtRatio = cur.liabilities > 0 && cur.assets > 0 ? (cur.liabilities / cur.assets) * 100 : null;
  const bps = cur.equity > 0 && cur.shares > 0 ? cur.equity / cur.shares : null;

  const history = groups.slice(0, 4).map((g, i) => {
    const row = readGroup(g);
    const prior = groups[i + 1] ? readGroup(groups[i + 1]) : null;
    const eqAvg =
      Number.isFinite(row.equity) && prior && Number.isFinite(prior.equity) && prior.equity > 0
        ? (row.equity + prior.equity) / 2
        : row.equity;
    return {
      period: g.label,
      revenueYoY: row.revenueYoY,
      profitYoY: row.profitYoY,
      roe: isAnnual(g) && row.profit > 0 && eqAvg > 0 ? (row.profit / eqAvg) * 100 : null,
    };
  });

  return {
    supported: true,
    period: latest.label,
    reportDate: fmtDate(latest.date),
    revenue: cur.revenue,
    revenueYoY: cur.revenueYoY,
    profit: cur.profit,
    profitYoY: cur.profitYoY,
    grossMargin,
    roe,
    eps: cur.eps,
    bps,
    debtRatio,
    pe: null,
    pb: null,
    currency: latest.currency || 'USD',
    history,
    source: '东方财富 F10 · 美股年报',
  };
}

async function fetchUSReport(reportName, secucode, filterExtra = '', pageSize = 200) {
  const params = new URLSearchParams({
    reportName,
    columns: 'ALL',
    filter: `(SECUCODE="${secucode}")${filterExtra}`,
    pageNumber: '1',
    pageSize: String(pageSize),
    sortTypes: '-1',
    sortColumns: 'REPORT_DATE',
    source: 'HSF10',
    client: 'PC',
  });
  const data = await emJSON(`${API.datacenter}?${params}`);
  return (data && data.result && data.result.data) || [];
}

async function getFinancials(stock) {
  if (stock.market === 'US') {
    const secucode = usSecucode(stock);
    if (!secucode) return { supported: false, reason: '缺少美股代码，无法获取财务数据' };
    return cached('financial:' + secucode, TTL.financial, async () => {
      const [annualIncome, annualBalance] = await Promise.all([
        fetchUSReport('RPT_USF10_FN_INCOME', secucode, '(REPORT_TYPE="年报")'),
        fetchUSReport('RPT_USF10_FN_BALANCE', secucode, '(REPORT_TYPE="年报")'),
      ]);
      if (!annualIncome.length) {
        /* 无年报（部分外国私人发行人）时回退最近报告期，ROE 自动留空 */
        const [income, balance] = await Promise.all([
          fetchUSReport('RPT_USF10_FN_INCOME', secucode),
          fetchUSReport('RPT_USF10_FN_BALANCE', secucode),
        ]);
        return buildUSFinancials(income, balance);
      }
      return buildUSFinancials(annualIncome, annualBalance);
    });
  }
  const code = stock.code;
  const isHK = stock.market === 'HK';
  const secucode = isHK ? `${code}.HK` : aShareSecucode(code);
  return cached('financial:' + secucode, TTL.financial, async () => {
    let reportName;
    let columns;
    if (isHK) {
      reportName = 'RPT_HKF10_FN_MAININDICATOR';
      columns =
        'SECUCODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_TYPE,OPERATE_INCOME,OPERATE_INCOME_YOY,GROSS_PROFIT,GROSS_PROFIT_YOY,HOLDER_PROFIT,HOLDER_PROFIT_YOY,GROSS_PROFIT_RATIO,ROE_YEARLY,ROE_AVG,ROIC_YEARLY,BASIC_EPS,BPS,DEBT_ASSET_RATIO,DIVIDEND_RATE,PE_TTM,PB_TTM,TOTAL_MARKET_CAP,CURRENCY';
    } else {
      reportName = 'RPT_F10_FINANCE_MAINFINADATA';
      columns = 'SECUCODE,SECURITY_NAME_ABBR,REPORT_DATE,REPORT_DATE_NAME,EPSJB,BPS,TOTALOPERATEREVE,PARENTNETPROFIT,TOTALOPERATEREVETZ,PARENTNETPROFITTZ,XSMLL,ROEJQ,ZCFZL';
    }
    const params = new URLSearchParams({
      reportName,
      columns,
      filter: `(SECUCODE="${secucode}")`,
      pageNumber: '1',
      pageSize: '4',
      sortTypes: '-1',
      sortColumns: 'REPORT_DATE',
      source: 'HSF10',
      client: 'PC',
    });
    const data = await emJSON(`${API.datacenter}?${params}`);
    const rows = (data && data.result && data.result.data) || [];
    if (!rows.length) return { supported: true, empty: true, history: [] };
    const latest = rows[0];
    const normalized = isHK
      ? {
          period: latest.REPORT_TYPE || fmtDate(latest.REPORT_DATE),
          revenue: num(latest.OPERATE_INCOME),
          revenueYoY: num(latest.OPERATE_INCOME_YOY),
          profit: num(latest.HOLDER_PROFIT),
          profitYoY: num(latest.HOLDER_PROFIT_YOY),
          grossMargin: num(latest.GROSS_PROFIT_RATIO),
          roe: num(latest.ROE_YEARLY, num(latest.ROE_AVG)),
          roic: num(latest.ROIC_YEARLY),
          pe: num(latest.PE_TTM),
          pb: num(latest.PB_TTM),
          eps: num(latest.BASIC_EPS),
          bps: num(latest.BPS),
          debtRatio: num(latest.DEBT_ASSET_RATIO),
          dividendRate: num(latest.DIVIDEND_RATE),
          currency: latest.CURRENCY || 'HKD',
          reportDate: fmtDate(latest.REPORT_DATE),
          history: rows.map((r) => ({
            period: r.REPORT_TYPE || fmtDate(r.REPORT_DATE),
            revenueYoY: num(r.OPERATE_INCOME_YOY),
            profitYoY: num(r.HOLDER_PROFIT_YOY),
            roe: num(r.ROE_YEARLY, num(r.ROE_AVG)),
          })),
        }
      : {
          period: latest.REPORT_DATE_NAME || fmtDate(latest.REPORT_DATE),
          revenue: num(latest.TOTALOPERATEREVE),
          revenueYoY: num(latest.TOTALOPERATEREVETZ),
          profit: num(latest.PARENTNETPROFIT),
          profitYoY: num(latest.PARENTNETPROFITTZ),
          grossMargin: num(latest.XSMLL),
          roe: num(latest.ROEJQ),
          pe: null,
          pb: null,
          eps: num(latest.EPSJB),
          bps: num(latest.BPS),
          debtRatio: num(latest.ZCFZL),
          currency: 'CNY',
          reportDate: fmtDate(latest.REPORT_DATE),
          history: rows.map((r) => ({
            period: r.REPORT_DATE_NAME || fmtDate(r.REPORT_DATE),
            revenueYoY: num(r.TOTALOPERATEREVETZ),
            profitYoY: num(r.PARENTNETPROFITTZ),
            roe: num(r.ROEJQ),
          })),
        };
    return { supported: true, ...normalized, source: '东方财富 F10' };
  });
}

async function getOrgProfile(stock, quote) {
  const code = stock.code;
  const market = stock.market;
  const cacheKey = `profile:${market}:${code}`;
  return cached(cacheKey, TTL.profile, async () => {
    let reportName;
    let secucode;
    if (market === 'A') {
      reportName = 'RPT_F10_BASIC_ORGINFO';
      secucode = aShareSecucode(code);
    } else if (market === 'HK') {
      reportName = 'RPT_HKF10_INFO_ORGPROFILE';
      secucode = `${code}.HK`;
    } else {
      reportName = 'RPT_USF10_INFO_ORGPROFILE';
      secucode = usSecucode(stock, quote);
    }
    const params = new URLSearchParams({
      reportName,
      columns: 'ALL',
      filter: `(SECUCODE="${secucode}")`,
      pageNumber: '1',
      pageSize: '1',
      source: 'HSF10',
      client: 'PC',
    });
    const data = await emJSON(`${API.datacenter}?${params}`);
    const row = data && data.result && data.result.data && data.result.data[0];
    if (!row) return { industryName: '', companyName: '' };
    let industryName = '';
    if (market === 'A') {
      const em = row.EM2016 || '';
      industryName = em.split('-').filter(Boolean).pop() || '';
      if (!industryName) industryName = (row.INDUSTRYCSRC1 || '').split('-').filter(Boolean).pop() || '';
    } else {
      industryName = row.BELONG_INDUSTRY || '';
    }
    return {
      industryName,
      industryRaw: row.EM2016 || row.BELONG_INDUSTRY || '',
      companyName: row.ORG_NAME || row.SECURITY_NAME_ABBR || '',
      source: '东方财富 F10',
    };
  });
}

/* ---------------- Eastmoney news ---------------- */
async function getNews(stock) {
  const keyword = stock.name || stock.code;
  const cacheKey = `news:${stock.market}:${stock.code}`;
  return cached(cacheKey, TTL.news, async () => {
    const payload = {
      uid: '',
      keyword,
      type: ['cmsArticleWebOld'],
      client: 'web',
      clientType: 'web',
      clientVersion: 'curr',
      param: {
        cmsArticleWebOld: {
          searchScope: 'default',
          sort: 'default',
          pageIndex: 1,
          pageSize: 15,
          preTag: '',
          postTag: '',
        },
      },
    };
    const url = `${API.news}?param=${encodeURIComponent(JSON.stringify(payload))}`;
    /* 与其他东财接口一致走 emQueue 串行限流（NFR-3），避免高频触发对方限流 */
    const data = await emJsonp(url);
    const rows = (data && data.result && data.result.cmsArticleWebOld) || [];
    const name = String(stock.name || '').toLowerCase();
    const code = String(stock.code || '').toLowerCase();
    const normalized = rows.map((r) => ({
      title: stripTags(r.title),
      content: stripTags(r.content),
      date: r.date || '',
      source: stripTags(r.mediaName || '东方财富资讯'),
      url: safeUrl(r.url),
    }));
    let filtered = normalized.filter((n) => {
      const text = (n.title + ' ' + n.content).toLowerCase();
      return (name && text.includes(name)) || (code && text.includes(code));
    });
    if (filtered.length < 5) filtered = normalized;
    return filtered
      .filter((n) => n.title)
      .sort((a, b) => (parseDateValue(b.date)?.getTime() || 0) - (parseDateValue(a.date)?.getTime() || 0))
      .slice(0, 15);
  });
}

/* ---------------- Industry mapping / peers ---------------- */
const INDUSTRY_CODES = {
  光伏设备: '1031', 风电设备: '1032', 电池: '1033', 其他电源设备Ⅱ: '1034', 半导体: '1036',
  消费电子: '1037', 光学光电子: '1038', 中药Ⅱ: '1040', 医药商业: '1042', 生物制品: '1044',
  房地产服务: '1045', 游戏Ⅱ: '1046', 服装家纺: '1225', 航空装备Ⅱ: '1231', 航天装备Ⅱ: '1232',
  IT服务Ⅱ: '1238', 白色家电: '1239', 黑色家电: '1241', 煤炭开采: '1250', 化妆品: '1252',
  医疗美容: '1253', 农业综合Ⅱ: '1257', 饲料: '1258', 养殖业: '1259', 摩托车及其他: '1263',
  造纸: '1267', 酒店餐饮: '1271', 白酒Ⅱ: '1277', 食品加工: '1280', 休闲食品: '1281',
  饮料乳品: '1282', 工业金属: '1287', 物流: '422', 电力: '428', 通信设备: '448',
  房地产开发: '451', 电网设备: '457', 元件: '459', 化学制药: '465', 证券Ⅱ: '473',
  保险Ⅱ: '474', 银行Ⅱ: '475', 汽车零部件: '481', 一般零售: '482', 化学制品: '538',
  通用设备: '545', 医疗服务: '727', 通信服务: '736', 软件开发: '737', 多元金融: '738', 专用设备: '910',
};

const INDUSTRY_ALIASES = {
  软件服务: ['软件开发', 'IT服务Ⅱ'],
  半导体产品: ['半导体'],
  银行: ['银行Ⅱ'],
  保险: ['保险Ⅱ'],
  证券: ['证券Ⅱ'],
  汽车: ['汽车零部件'],
  媒体: ['游戏Ⅱ'],
  娱乐: ['游戏Ⅱ'],
  互联网: ['软件开发', 'IT服务Ⅱ'],
  医药: ['化学制药', '生物制品'],
  生物科技: ['生物制品'],
  食品饮料: ['食品加工', '饮料乳品'],
  消费: ['一般零售'],
  新能源: ['电池', '光伏设备'],
  通信: ['通信服务', '通信设备'],
  地产: ['房地产开发'],
  房地产: ['房地产开发'],
  家电: ['白色家电'],
  餐饮: ['酒店餐饮'],
  旅游: ['酒店餐饮'],
  服装: ['服装家纺'],
  化工: ['化学制品'],
  机械: ['通用设备', '专用设备'],
};

function normIndustry(s) {
  return String(s || '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/(Ⅱ|Ⅲ|II|III|行业|板块|产品|服务|制造|设备|其他)/gi, '')
    .replace(/[\s·\-—]/g, '')
    .toLowerCase();
}
function sameIndustry(a, b) {
  if (!a || !b) return false;
  if (String(a) === String(b)) return true;
  const na = normIndustry(a);
  const nb = normIndustry(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
function findIndustryCode(industryName) {
  if (!industryName) return null;
  const direct = Object.entries(INDUSTRY_CODES).find(([name]) => name === industryName);
  if (direct) return { code: direct[1], name: direct[0], reference: false };
  const norm = normIndustry(industryName);
  const candidates = Object.entries(INDUSTRY_CODES).filter(([name]) => {
    const n = normIndustry(name);
    return n === norm || n.includes(norm) || norm.includes(n);
  });
  if (candidates.length) return { code: candidates[0][1], name: candidates[0][0], reference: true };
  for (const [key, aliases] of Object.entries(INDUSTRY_ALIASES)) {
    if (normIndustry(key) === norm) {
      for (const alias of aliases) {
        if (INDUSTRY_CODES[alias]) return { code: INDUSTRY_CODES[alias], name: alias, reference: true };
      }
    }
  }
  return null;
}

async function fetchBoardConstituents(boardCode, sortField) {
  const params = new URLSearchParams({
    pn: '1',
    pz: '30',
    po: '1',
    np: '1',
    fltt: '2',
    invt: '2',
    fid: sortField,
    fs: `b:${boardCode}+f:!50`,
    fields: 'f12,f13,f14,f20,f105,f9,f23',
  });
  const data = await emJsonp(`${API.push2}clist/get?${params}`);
  const diff = data && data.data && data.data.diff;
  const rows = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
  return rows.map((r) => ({
    market: 'A',
    code: String(r.f12 || ''),
    name: stripTags(r.f14 || ''),
    marketCap: num(r.f20) != null ? num(r.f20) / 1e8 : null,
    profit: num(r.f105) != null ? num(r.f105) / 1e8 : null,
    pe: num(r.f9),
    pb: num(r.f23),
    marketId: num(r.f13),
  }));
}

async function getIndustryBoards() {
  return cached('industry-boards', TTL.boards, async () => {
    const out = [];
    for (let page = 1; page <= 2; page++) {
      const data = await emJsonp(
        `${API.push2}clist/get?pn=${page}&pz=300&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14`
      );
      const diff = data && data.data && data.data.diff;
      const rows = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
      rows.forEach((r) => out.push({ code: r.f12, name: stripTags(r.f14) }));
      if (!data || !data.data || out.length >= num(data.data.total, 0)) break;
    }
    return out;
  });
}

function normalizeASharePeer(row, extras = {}) {
  if (!row || !row.SECURITY_CODE) return null;
  const code = String(row.SECURITY_CODE);
  if (/^(200|900)/.test(code)) return null;
  const mk = /^(6|9)/.test(code) ? 'sh' : /^(4|8)/.test(code) ? 'bj' : 'sz';
  return {
    market: 'A',
    code,
    name: stripTags(row.SECURITY_NAME_ABBR || code),
    marketCap: Number.isFinite(extras.marketCap) ? extras.marketCap : null,
    profit: Number.isFinite(extras.profit) ? extras.profit : null,
    pe: num(row.PE_RATIO),
    pb: num(row.PB_RATIO),
    quoteKey: mk + code,
    klineCode: mk + code,
    rawCode: code,
  };
}

async function dcQuery(reportName, columns, filter, sortColumns, sortTypes = '-1', pageSize = 20) {
  const params = new URLSearchParams({
    reportName,
    columns,
    filter,
    pageNumber: '1',
    pageSize: String(pageSize),
    sortTypes,
    sortColumns,
    source: 'WEB',
    client: 'WEB',
  });
  const data = await emJSON(`${API.datacenter}?${params}`);
  return (data && data.result && data.result.data) || [];
}

async function getAShareIndustryCode(stock) {
  const rows = await dcQuery(
    'RPT_STOCK_INDUSTRY_STA',
    'SECURITY_CODE,SECURITY_NAME_ABBR,INDUSTRY_NAME,INDUSTRY_CODE,TOTAL_MARKET_CAP,PE_RATIO,PB_RATIO,TMC_RANK',
    `(SECURITY_CODE="${stock.code}")`,
    'TRADE_DATE',
    '-1',
    1
  );
  const row = rows[0];
  if (!row || !row.INDUSTRY_CODE) return null;
  return { code: String(row.INDUSTRY_CODE), name: row.INDUSTRY_NAME || '' };
}

async function getASharePeersFromDataCenter(stock, industryName, industryCode) {
  let info =
    industryCode && /^\d+$/.test(String(industryCode))
      ? { code: String(industryCode), name: industryName || '' }
      : await getAShareIndustryCode(stock);
  if (!info || !info.code) throw new Error('数据中心未返回行业代码');
  const code = info.code;

  const capColumns =
    'SECURITY_CODE,SECURITY_NAME_ABBR,INDUSTRY_NAME,INDUSTRY_CODE,TOTAL_MARKET_CAP,PE_RATIO,PB_RATIO,TMC_RANK';
  const profitColumns =
    'SECURITY_CODE,SECURITY_NAME_ABBR,PARENT_NETPROFIT,REPORTDATE,BOARD_NAME,ORI_BOARD_CODE';

  const [capRows, latestRows] = await Promise.all([
    dcQuery(
      'RPT_STOCK_INDUSTRY_STA',
      capColumns,
      `(INDUSTRY_CODE="${code}")`,
      'TOTAL_MARKET_CAP',
      '-1',
      30
    ),
    dcQuery(
      'RPT_LICO_FN_CPD',
      profitColumns,
      `(ORI_BOARD_CODE="${code}")`,
      'REPORTDATE',
      '-1',
      1
    ),
  ]);

  const cap = capRows
    .map((r) => normalizeASharePeer(r, { marketCap: num(r.TOTAL_MARKET_CAP) != null ? num(r.TOTAL_MARKET_CAP) / 1e8 : null }))
    .filter((p) => p && p.code !== stock.code && Number.isFinite(p.marketCap))
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 3);

  let profit = [];
  let profitPeriod = '';
  const latest = latestRows[0];
  if (latest && latest.REPORTDATE) {
    profitPeriod = fmtDate(latest.REPORTDATE);
    const profitRows = await dcQuery(
      'RPT_LICO_FN_CPD',
      profitColumns,
      `(REPORTDATE='${latest.REPORTDATE.slice(0, 10)}')(ORI_BOARD_CODE="${code}")`,
      'PARENT_NETPROFIT',
      '-1',
      30
    );
    profit = profitRows
      .map((r) => normalizeASharePeer(r, { profit: num(r.PARENT_NETPROFIT) != null ? num(r.PARENT_NETPROFIT) / 1e8 : null }))
      .filter((p) => p && p.code !== stock.code && Number.isFinite(p.profit) && p.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 3);
  }

  if (!cap.length && !profit.length) throw new Error('数据中心行业榜暂无可用数据');

  return {
    supported: true,
    boardCode: code,
    boardName: info.name || industryName || '',
    cap,
    profit,
    profitPeriod,
    source: '东方财富数据中心',
    note: '行业板块接口不可用，已回退到东方财富数据中心行业榜',
  };
}

async function getASharePeers(stock, industryName, industryCode) {
  if (!industryName && !industryCode) throw new Error('未识别到所属行业');
  try {
    const boards = await getIndustryBoards();
    const targetNorm = normIndustry(industryName);
    const board =
      boards.find((b) => b.name === industryName) ||
      boards.find((b) => normIndustry(b.name) === targetNorm) ||
      boards.find((b) => sameIndustry(b.name, industryName));
    if (!board) throw new Error(`未找到「${industryName}」行业板块`);

    const [capRows, profitRows] = await Promise.all([
      fetchBoardConstituents(board.code, 'f20'),
      fetchBoardConstituents(board.code, 'f105'),
    ]);
    const cap = capRows
      .filter((r) => r.code && r.code !== stock.code && Number.isFinite(r.marketCap))
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 3);
    const profit = profitRows
      .filter((r) => r.code && r.code !== stock.code && Number.isFinite(r.profit) && r.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 3);
    if (!cap.length && !profit.length) throw new Error('行业板块未返回成分股');
    [...cap, ...profit].forEach((p) => {
      const mk = p.marketId === 1 ? 'sh' : /^(4|8)/.test(p.code) ? 'bj' : 'sz';
      p.quoteKey = mk + p.code;
      p.klineCode = p.quoteKey;
      p.market = 'A';
      p.rawCode = p.code;
    });

    if (!cap.length || !profit.length) {
      try {
        const dcInfo = industryCode ? { code: String(industryCode) } : await getAShareIndustryCode(stock);
        const dc = await getASharePeersFromDataCenter(
          stock,
          industryName,
          dcInfo && /^\d+$/.test(dcInfo.code || '') ? dcInfo.code : ''
        );
        return {
          supported: true,
          boardCode: board.code,
          boardName: board.name || dc.boardName,
          cap: cap.length ? cap : dc.cap,
          profit: profit.length ? profit : dc.profit,
          profitPeriod: dc.profitPeriod || '',
          source: '东方财富行业板块 / 数据中心',
          note: `行业板块接口返回不完整，已用数据中心补齐${profit.length ? '' : '利润榜'}`,
        };
      } catch (e) {}
    }

    return {
      supported: true,
      boardCode: board.code,
      boardName: board.name,
      cap,
      profit,
      profitPeriod: '',
      source: '东方财富行业板块',
      note: '按行业板块成分股排序',
    };
  } catch (e) {
    return getASharePeersFromDataCenter(stock, industryName, industryCode);
  }
}

async function fetchMarketPeerPage(fs, sortField, page) {
  const params = new URLSearchParams({
    pn: String(page),
    pz: '100',
    po: '1',
    np: '1',
    fltt: '2',
    invt: '2',
    fid: sortField,
    fs,
    fields: 'f12,f13,f14,f20,f105,f9,f23,f100',
  });
  const data = await emJsonp(`${API.push2}clist/get?${params}`);
  const diff = data && data.data && data.data.diff;
  const rows = Array.isArray(diff) ? diff : diff ? Object.values(diff) : [];
  return {
    total: num(data && data.data && data.data.total, 0),
    rows: rows.map((r) => ({
      code: String(r.f12 || ''),
      name: stripTags(r.f14 || ''),
      marketCap: num(r.f20) != null ? num(r.f20) / 1e8 : null,
      profit: num(r.f105) != null ? num(r.f105) / 1e8 : null,
      pe: num(r.f9),
      pb: num(r.f23),
      industry: stripTags(r.f100 || ''),
      marketId: num(r.f13),
    })),
  };
}

async function getHKUSPeersFromPush2(stock, industryName) {
  if (!industryName) throw new Error('未识别到所属行业');
  const isHK = stock.market === 'HK';
  const fs = isHK ? 'm:128' : 'm:105,m:106,m:107';
  const collect = async (sortField) => {
    const matched = [];
    for (let page = 1; page <= 3; page++) {
      const { rows, total } = await fetchMarketPeerPage(fs, sortField, page);
      rows.forEach((r) => {
        if (sameIndustry(r.industry, industryName)) matched.push(r);
      });
      if (matched.length >= 3 || page * 100 >= total) break;
    }
    return matched
      .filter((r) => r.code && r.code !== stock.code)
      .slice(0, 3)
      .map((r) => ({
        market: stock.market,
        code: isHK ? String(r.code).padStart(5, '0') : String(r.code).replace(/\..*$/, ''),
        name: r.name,
        marketCap: Number.isFinite(r.marketCap) ? r.marketCap : null,
        profit: Number.isFinite(r.profit) ? r.profit : null,
        pe: r.pe,
        pb: r.pb,
        quoteKey: isHK ? 'hk' + String(r.code).padStart(5, '0') : 'us' + String(r.code).replace(/\..*$/, ''),
        klineCode: isHK ? 'hk' + String(r.code).padStart(5, '0') : 'us' + String(r.code),
      }));
  };
  const [cap, profit] = await Promise.all([collect('f20'), collect('f105')]);
  const hasProfit = profit.some((p) => Number.isFinite(p.profit) && p.profit > 0);
  return {
    supported: true,
    boardCode: '',
    boardName: industryName,
    cap,
    profit: hasProfit ? profit : [],
    profitPeriod: '',
    source: '东方财富市场列表',
    note: `按「${industryName}」行业标签匹配，覆盖可能不完整`,
  };
}

function dcQuoteString(s) {
  return String(s || '').replace(/["\\]/g, '');
}
function dcCodeInFilter(codes) {
  const unique = [...new Set((codes || []).map((c) => dcQuoteString(c)).filter(Boolean))];
  if (!unique.length) return '';
  return `(SECURITY_CODE in (${unique.map((c) => `"${c}"`).join(',')}))`;
}
function usBaseCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/^US/, '')
    .replace(/\.(OQ|N|PS|A|AMEX|NYSE)$/i, '');
}
function peerCurrencyLabel(currency) {
  const c = String(currency || '').toUpperCase();
  if (c === 'HKD') return '港元';
  if (c === 'USD') return '美元';
  if (c === 'TWD') return '新台币';
  if (c === 'CNY' || c === 'RMB') return '元';
  return c || '元';
}
function peerMoney(yi, currency) {
  if (!Number.isFinite(yi)) return '—';
  const label = peerCurrencyLabel(currency);
  if (Math.abs(yi) >= 10000) return `${(yi / 10000).toFixed(2)}万亿${label}`;
  return `${fmtBig(yi)}${label}`;
}

async function getHKUSPeersFromDataCenter(stock, industryName) {
  if (!industryName) throw new Error('未识别到所属行业');
  const isHK = stock.market === 'HK';
  const profileReport = isHK ? 'RPT_HKF10_INFO_ORGPROFILE' : 'RPT_USF10_INFO_ORGPROFILE';
  const profiles = await dcQuery(
    profileReport,
    'SECURITY_CODE,SECURITY_NAME_ABBR,ORG_CODE,BELONG_INDUSTRY',
    `(BELONG_INDUSTRY="${dcQuoteString(industryName)}")`,
    'SECURITY_CODE',
    '1',
    500
  );
  const rows = (profiles || []).filter((r) => r && r.SECURITY_CODE);
  if (!rows.length) throw new Error(`未找到「${industryName}」行业成分股`);

  const orgMap = new Map();
  rows.forEach((r) => {
    const org = r.ORG_CODE || String(r.SECURITY_CODE);
    if (!orgMap.has(org)) {
      orgMap.set(org, {
        org,
        code: String(r.SECURITY_CODE),
        name: stripTags(r.SECURITY_NAME_ABBR || r.SECURITY_CODE),
      });
    }
  });
  const filter = dcCodeInFilter(rows.map((r) => r.SECURITY_CODE));

  if (isHK) {
    const finRows = await dcQuery(
      'RPT_HKF10_FN_MAININDICATOR',
      'SECURITY_CODE,SECURITY_NAME_ABBR,ORG_CODE,TOTAL_MARKET_CAP,HOLDER_PROFIT,REPORT_DATE,CURRENCY',
      filter,
      'REPORT_DATE',
      '-1',
      500
    );
    const latest = new Map();
    finRows.forEach((r) => {
      const org = r.ORG_CODE || String(r.SECURITY_CODE);
      if (!latest.has(org)) latest.set(org, r);
    });
    const peers = [...latest.entries()].map(([org, r]) => {
      const pref = orgMap.get(org) || { code: String(r.SECURITY_CODE), name: r.SECURITY_NAME_ABBR };
      const marketCap = num(r.TOTAL_MARKET_CAP);
      const profit = num(r.HOLDER_PROFIT);
      return {
        market: 'HK',
        code: pref.code,
        name: stripTags(pref.name || r.SECURITY_NAME_ABBR || pref.code),
        marketCap: marketCap != null ? marketCap / 1e8 : null,
        profit: profit != null ? profit / 1e8 : null,
        pe: null,
        pb: null,
        currency: 'HKD',
        reportDate: r.REPORT_DATE,
        quoteKey: 'hk' + pref.code,
        klineCode: 'hk' + pref.code,
      };
    });
    const cap = peers
      .filter((p) => p.code !== stock.code && Number.isFinite(p.marketCap) && p.marketCap > 0)
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 3);
    const profit = peers
      .filter((p) => p.code !== stock.code && Number.isFinite(p.profit) && p.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 3);
    if (!cap.length && !profit.length) throw new Error('港股 F10 暂无行业排行数据');
    const dates = [...new Set(profit.map((p) => String(p.reportDate || '').slice(0, 10)).filter(Boolean))];
    return {
      supported: true,
      boardCode: '',
      boardName: industryName,
      cap,
      profit,
      profitPeriod: dates.length === 1 ? dates[0] : '',
      source: '东方财富港股 F10',
      note: `按「${industryName}」行业分类匹配，报告期以各公司最新可得数据为准`,
    };
  }

  const quoteMap = await getQuoteBatch([...orgMap.values()].map((p) => 'us' + p.code));
  const peerFromQuote = (org) => {
    const pref = orgMap.get(org);
    if (!pref) return null;
    const q = quoteMap.get('us' + pref.code);
    const rawCode = (q && q.rawCode) || pref.code;
    const code = usBaseCode(rawCode || pref.code);
    return {
      market: 'US',
      code,
      name: stripTags((q && q.name) || pref.name || code),
      rawCode: String(rawCode).toUpperCase(),
      marketCap: q && Number.isFinite(q.marketCap) ? q.marketCap : null,
      profit: null,
      pe: q ? q.pe : null,
      pb: q ? q.pb : null,
      currency: 'USD',
      quoteKey: 'us' + code,
      klineCode: 'us' + String(rawCode).toUpperCase(),
    };
  };

  const cap = [...orgMap.keys()]
    .map(peerFromQuote)
    .filter((p) => p && p.code !== stock.code && Number.isFinite(p.marketCap) && p.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 3);

  const incomeRows = await dcQuery(
    'RPT_USF10_FN_INCOME',
    'SECURITY_CODE,SECURITY_NAME_ABBR,ORG_CODE,REPORT_DATE,REPORT_TYPE,AMOUNT,CURRENCY,CURRENCY_ABBR',
    `${filter}(REPORT_TYPE in ("累计季报","年报"))(ITEM_NAME="归属于母公司股东净利润")`,
    'REPORT_DATE',
    '-1',
    500
  );
  const latestProfit = new Map();
  incomeRows.forEach((r) => {
    const org = r.ORG_CODE || String(r.SECURITY_CODE);
    if (!latestProfit.has(org)) latestProfit.set(org, r);
  });
  const profit = [...latestProfit.entries()]
    .map(([org, r]) => {
      const p = peerFromQuote(org);
      if (!p) return null;
      return {
        ...p,
        profit: num(r.AMOUNT) != null ? num(r.AMOUNT) / 1e8 : null,
        currency: r.CURRENCY_ABBR || r.CURRENCY || 'USD',
        reportDate: r.REPORT_DATE,
      };
    })
    .filter(
      (p) =>
        p &&
        p.code !== stock.code &&
        Number.isFinite(p.profit) &&
        p.profit > 0 &&
        String(p.currency).toUpperCase() === 'USD'
    )
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 3);

  if (!cap.length && !profit.length) throw new Error('美股 F10 暂无行业排行数据');
  const dates = [...new Set(profit.map((p) => String(p.reportDate || '').slice(0, 10)).filter(Boolean))];
  return {
    supported: true,
    boardCode: '',
    boardName: industryName,
    cap,
    profit,
    profitPeriod: dates.length === 1 ? dates[0] : '',
    source: '东方财富美股 F10 / 腾讯财经',
    note: `按「${industryName}」行业分类匹配；利润榜仅统计美元口径，报告期以各公司最新累计数据为准`,
  };
}

async function getHKUSPeers(stock, industryName) {
  try {
    const dc = await getHKUSPeersFromDataCenter(stock, industryName);
    if (dc && (dc.cap.length || dc.profit.length)) return dc;
  } catch (e) {}
  return getHKUSPeersFromPush2(stock, industryName);
}

async function getPeers(stock, industryName, opts = {}) {
  const cacheKey = `peers:${stock.market}:${stock.code}:${industryName}:${opts.industryCode || ''}`;
  return cached(cacheKey, TTL.peers, async () => {
    if (stock.market === 'A') return getASharePeers(stock, industryName, opts.industryCode);
    return getHKUSPeers(stock, industryName);
  });
}

async function getPeerReports(peer) {
  if (peer.market !== 'A') return [];
  try {
    const data = await getStockReports(peer, { pageSize: 3, months: 6 });
    return data.list.slice(0, 3);
  } catch (e) {
    return [];
  }
}
