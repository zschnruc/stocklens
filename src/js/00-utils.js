/* ============================================================
   研值 StockLens — utilities
   ============================================================ */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const num = (v, fallback = null) => {
  if (v === null || v === undefined || v === '' || v === '-' || v === '--') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const uid = (prefix = 'sl') => prefix + '_' + Math.random().toString(36).slice(2, 9);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function stripTags(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
function safeUrl(u) {
  try {
    const url = new URL(String(u), location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (e) {}
  return '';
}
function debounce(fn, wait = 220) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function monthsAgoISO(months = 6) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseDateValue(s) {
  if (!s) return null;
  const str = String(s).replace(/\.\d+$/, '').replace(/\//g, '-').replace(' ', 'T');
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) {
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return null;
  }
  return d;
}
function fmtDate(s, withTime = false) {
  const d = parseDateValue(s);
  if (!d) return '—';
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${base} ${p(d.getHours())}:${p(d.getMinutes())}` : base;
}
/* 毫秒时间戳 → 本地 HH:MM:SS（withDate 时附带 YYYY-MM-DD），用于首页榜单的最后更新时间 */
function fmtClock(ts, withDate = false) {
  const ms = Number(ts);
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  if (!withDate) return time;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${time}`;
}
function formatQuoteTime(s) {
  if (!s) return '—';
  const str = String(s);
  let m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  return fmtDate(str, true);
}
function daysSince(s) {
  const d = parseDateValue(s);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function timeAgo(s) {
  const d = parseDateValue(s);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  if (diff < 0) return fmtDate(s);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return fmtDate(s);
}
function fmtPrice(n, digits = 2) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(n, sign = true) {
  if (!Number.isFinite(n)) return '—';
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}
function fmtSigned(n, digits = 2) {
  if (!Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
}
function fmtInt(n) {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('zh-CN');
}
function fmtBig(n, unit = '亿') {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 10000) return `${(n / 10000).toFixed(2)}万亿`;
  if (abs >= 100) return `${n.toFixed(0)}${unit}`;
  if (abs >= 1) return `${n.toFixed(2)}${unit}`;
  if (abs === 0) return `0${unit}`;
  return `${n.toFixed(4)}${unit}`;
}
function fmtMoneyCNY(yuan) {
  if (!Number.isFinite(yuan)) return '—';
  return fmtBig(yuan / 1e8, '亿');
}
function fmtCap(yi, currency = 'CNY') {
  if (!Number.isFinite(yi)) return '—';
  const unit = currency === 'HKD' ? '亿港元' : currency === 'USD' ? '亿美元' : '亿元';
  if (Math.abs(yi) >= 10000) return `${(yi / 10000).toFixed(2)}万亿${currency === 'CNY' ? '' : currency === 'HKD' ? '港元' : '美元'}`;
  return `${fmtPrice(yi, yi >= 100 ? 0 : 2)}${unit}`;
}
function fmtEps(n, currency) {
  if (!Number.isFinite(n)) return '—';
  const sym = currency === 'HKD' ? 'HK$' : currency === 'USD' ? '$' : '¥';
  return `${sym}${n.toFixed(2)}`;
}
function ratioText(n, digits = 1) {
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—';
}
/* A 股代码 → 腾讯行情前缀。ETF/基金代码段：沪市 50/51/52/56/58，深市 15/16/18。
   对普通个股代码返回与原规则完全一致的结果（6/9→sh、4/8→bj、其余→sz）。 */
function aSharePrefix(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (/^(50|51|52|56|58)/.test(c)) return 'sh';
  if (/^(15|16|18)/.test(c)) return 'sz';
  if (/^(6|9)/.test(c)) return 'sh';
  if (/^(4|8)/.test(c)) return 'bj';
  return 'sz';
}
/* ETF/场内基金代码段判定（用于搜索与输入自动打标） */
function isEtfCode(code) {
  return /^(50|51|52|56|58|15|16|18)\d{4}$/.test(String(code || '').replace(/\D/g, ''));
}
function marketFromKey(key) {
  if (!key) return 'A';
  if (key.startsWith('us')) return 'US';
  if (key.startsWith('hk')) return 'HK';
  return 'A';
}
function marketLabel(m) {
  return m === 'US' ? '美股' : m === 'HK' ? '港股' : m === 'CRYPTO' ? '加密' : 'A股';
}
function marketBadgeClass(m) {
  return m === 'US' ? 'blue' : m === 'HK' ? 'teal' : m === 'CRYPTO' ? 'violet' : 'gold';
}
function currencyOf(market) {
  return market === 'US' || market === 'CRYPTO' ? 'USD' : market === 'HK' ? 'HKD' : 'CNY';
}
function exchangeLabel(stock, quote) {
  if (stock.market === 'CRYPTO') return '7×24 加密市场';
  if (stock.market === 'HK') return '香港交易所';
  if (stock.market === 'US') {
    const raw = (quote && quote.rawCode) || stock.rawCode || '';
    if (/\.OQ$/i.test(raw)) return '纳斯达克';
    if (/\.N$/i.test(raw)) return '纽交所';
    if (/\.PS$/i.test(raw)) return 'OTC / ADR';
    if (/\.A$/i.test(raw)) return 'NYSE American';
    return '美国市场';
  }
  const c = String(stock.code || '');
  if (c.startsWith('6')) return '上海证券交易所';
  if (c.startsWith('8') || c.startsWith('4')) return '北京证券交易所';
  return '深圳证券交易所';
}
function formatVolume(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)} 万`;
  return fmtInt(n);
}
function pctClass(n) {
  if (!Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}
function monthLabel(d) {
  const dt = parseDateValue(d);
  return dt ? `${dt.getMonth() + 1}月` : '';
}
function compactDate(s) {
  const d = parseDateValue(s);
  if (!d) return '—';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function yearOf(s) {
  const d = parseDateValue(s);
  return d ? d.getFullYear() : null;
}
function ratio(n, digits = 1) {
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—';
}
function clampPct(n) {
  return clamp(n, 0, 100);
}

const RATING_RULES = [
  { re: /强烈推荐|买入|优于大市|强于大市|跑赢行业|推荐/i, label: '买入', score: 1, cls: 'red' },
  { re: /增持|谨慎增持|谨慎推荐|outperform|accumulate/i, label: '增持', score: 0.75, cls: 'orange' },
  { re: /中性|持有|同步大市|观望|equal|hold|neutral/i, label: '中性', score: 0.4, cls: 'blue' },
  { re: /减持|弱于大市|回避|underperform|reduce/i, label: '减持', score: 0, cls: 'green' },
  { re: /卖出|sell/i, label: '卖出', score: 0, cls: 'green' },
];
function ratingInfo(raw) {
  const s = String(raw || '').trim();
  if (!s) return { label: '未评级', score: null, cls: 'muted' };
  const hit = RATING_RULES.find((r) => r.re.test(s));
  return hit ? { label: hit.label, score: hit.score, cls: hit.cls } : { label: s, score: null, cls: 'muted' };
}
function verdictFor(score) {
  if (score >= 80) return { label: '强势', cls: 'strong', tone: 'gold', desc: '多维共振，优势较突出' };
  if (score >= 65) return { label: '偏多', cls: 'bull', tone: 'teal', desc: '多数维度偏向积极' };
  if (score >= 50) return { label: '中性', cls: 'neutral', tone: 'blue', desc: '多空因素相对均衡' };
  if (score >= 35) return { label: '偏空', cls: 'bear', tone: 'orange', desc: '部分维度存在压力' };
  return { label: '谨慎', cls: 'weak', tone: 'red', desc: '风险因素占主导' };
}

/* ---------- storage / cache ---------- */
const memCache = new Map();
const inflight = new Map();

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
let localWriteWarned = false;
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* 配额溢出等场景：只告警一次，缓存自动降级为内存模式，不影响功能 */
    if (!localWriteWarned) {
      localWriteWarned = true;
      console.warn('[StockLens] 本地缓存写入失败（可能超出配额），数据缓存将仅在本次会话内存中生效');
    }
  }
}
const store = {
  get(key, fallback = null) {
    const v = readLocal('sl:' + key);
    return v === null ? fallback : v;
  },
  set(key, value) {
    writeLocal('sl:' + key, value);
  },
  remove(key) {
    try {
      localStorage.removeItem('sl:' + key);
    } catch (e) {}
  },
};
async function cached(key, ttl, loader, force = false) {
  const now = Date.now();
  if (!force) {
    const mem = memCache.get(key);
    if (mem && now - mem.t < ttl) return mem.d;
    const disk = readLocal('sl:c:' + key);
    if (disk && now - disk.t < ttl) {
      memCache.set(key, disk);
      return disk.d;
    }
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = loader()
    .then((d) => {
      const entry = { t: Date.now(), d };
      memCache.set(key, entry);
      writeLocal('sl:c:' + key, entry);
      return d;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/* ---------- UI helpers ---------- */
function toast(message, type = 'info', ms = 3200) {
  const wrap = $('#toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="ico sm">${svgIcon(type === 'error' ? 'alert' : type === 'ok' ? 'check' : 'info')}</span><span>${esc(message)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }, ms);
}
function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => {
    if (el.dataset.iconDone) return;
    el.innerHTML = svgIcon(el.dataset.icon);
    el.dataset.iconDone = '1';
  });
}
function setViewHTML(html) {
  const view = $('#view');
  view.innerHTML = html;
  hydrateIcons(view);
}
function scrollTopSmooth() {
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    window.scrollTo(0, 0);
  }
}
function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
