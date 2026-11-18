/* ============================================================
   加密资产数据层 + 五维评分
   行情/K 线：Binance 数据镜像（无需 Key，CORS *）
   市值/排名：CoinLore 前 100 名
   合约数据：Gate U 本位合约公开接口
   情绪/生态：alternative.me 恐慌贪婪指数 + DefiLlama 主链 TVL
   评分与股票/ETF 完全隔离：趋势 / 流动 / 波动 / 合约 / 情绪。
   缺失维度降级不臆造，并按权重覆盖率施加惩罚。
   ============================================================ */
'use strict';

const CRYPTO_API = {
  binance: 'https://data-api.binance.vision/api/v3',
  coinlore: 'https://api.coinlore.net/api',
  gate: 'https://api.gateio.ws/api/v4',
  fng: 'https://api.alternative.me/fng/',
  llama: 'https://api.llama.fi',
};

const CRYPTO_TTL = {
  quote: 60 * 1000,
  kline: 10 * 60 * 1000,
  meta: 5 * 60 * 1000,
  board: 90 * 1000,
  derivatives: 2 * 60 * 1000,
  fng: 10 * 60 * 1000,
  tvl: 30 * 60 * 1000,
};

/* 稳定币不参与评分与首页榜单：价格锚定法币，动量/波动维度会得出畸形分数 */
const CRYPTO_STABLES = new Set([
  'USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'PYUSD', 'BUSD', 'USDD', 'USDS',
  'USD1', 'EURC', 'EURT', 'GUSD', 'FRAX', 'LUSD', 'USDP', 'USTC', 'RLUSD', 'USDX',
  'USDB', 'SUSD', 'MIM', 'ALUSD', 'CRVUSD', 'GHO',
]);

/* 常见币种中文名（用于搜索、标题与榜单；未收录的币种回退英文名） */
const CRYPTO_NAMES = {
  BTC: '比特币', ETH: '以太坊', XRP: '瑞波币', BNB: '币安币', SOL: 'Solana',
  TRX: '波场', DOGE: '狗狗币', ADA: '艾达币', BCH: '比特币现金', LINK: 'Chainlink',
  HYPE: 'Hyperliquid', XLM: '恒星币', LTC: '莱特币', AVAX: '雪崩', SUI: 'Sui',
  TON: 'Toncoin', SHIB: '柴犬币', DOT: '波卡', UNI: 'Uniswap', NEAR: 'NEAR',
  APT: 'Aptos', ICP: 'Internet Computer', ETC: '以太经典', PEPE: 'Pepe', ARB: 'Arbitrum',
  OP: 'Optimism', ATOM: 'Cosmos', FIL: 'Filecoin', INJ: 'Injective', TIA: 'Celestia',
  SEI: 'Sei', STX: 'Stacks', IMX: 'Immutable', RENDER: 'Render', GRT: 'The Graph',
  AAVE: 'Aave', MKR: 'Maker', LDO: 'Lido', CRV: 'Curve', JUP: 'Jupiter',
  WIF: 'dogwifhat', BONK: 'Bonk', FLOKI: 'Floki', TAO: 'Bittensor', KAS: 'Kaspa',
  ALGO: 'Algorand', VET: 'VeChain', HBAR: 'Hedera', XMR: '门罗币', EOS: 'EOS',
  XTZ: 'Tezos', THETA: 'Theta', SAND: 'The Sandbox', MANA: 'Decentraland', AXS: 'Axie Infinity',
  GALA: 'Gala', ENS: 'ENS', ONDO: 'Ondo', WLD: 'Worldcoin', JTO: 'Jito',
};

/* 币种 → DefiLlama 主链名（仅 L1 / 有独立生态的资产；无映射则情绪维度只用 F&G） */
const CRYPTO_CHAINS = {
  ETH: 'Ethereum', BNB: 'BSC', SOL: 'Solana', AVAX: 'Avalanche', TRX: 'Tron',
  TON: 'TON', SUI: 'Sui', APT: 'Aptos', NEAR: 'Near', ADA: 'Cardano', DOT: 'Polkadot',
  ATOM: 'Cosmos', ICP: 'ICP', ALGO: 'Algorand', VET: 'VeChain', HBAR: 'Hedera',
  XRP: 'Ripple', LTC: 'Litecoin', BCH: 'Bitcoin', BTC: 'Bitcoin', ETC: 'EthereumClassic',
  ARB: 'Arbitrum', OP: 'Optimism', SEI: 'Sei', STX: 'Stacks', KAS: 'Kaspa', XLM: 'Stellar',
};

const CRYPTO_HOT = ['BTC', 'ETH', 'SOL', 'BNB'];
const CRYPTO_BOARD_SIZE = 10;

const CRYPTO_DIM_META = [
  { key: 'trend', name: '趋势与动量', short: '趋势', weight: 25, icon: 'trendUp' },
  { key: 'liquidity', name: '流动性与规模', short: '流动', weight: 20, icon: 'layers' },
  { key: 'volatility', name: '波动与回撤', short: '波动', weight: 20, icon: 'activity' },
  { key: 'derivatives', name: '合约与杠杆', short: '合约', weight: 20, icon: 'pulse' },
  { key: 'sentiment', name: '情绪与生态', short: '情绪', weight: 15, icon: 'spark' },
];

/* ---------------- 币种对象与搜索别名 ---------------- */

function normalizeCoinStock(input) {
  const src = input || {};
  const symbol = String(src.symbol || src.code || src.rawCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 15);
  const name = src.name || CRYPTO_NAMES[symbol] || symbol;
  return {
    market: 'CRYPTO',
    kind: 'coin',
    code: symbol,
    rawCode: symbol,
    name,
    quoteKey: 'crypto:' + symbol,
    klineCode: 'crypto:' + symbol,
  };
}

const CRYPTO_ALIAS = new Map();
Object.keys(CRYPTO_NAMES).forEach((sym) => {
  CRYPTO_ALIAS.set(sym.toLowerCase(), sym);
  CRYPTO_ALIAS.set(String(CRYPTO_NAMES[sym]).toLowerCase(), sym);
});
/* 额外口语别名（不覆盖上面已登记的正式名） */
[
  ['大饼', 'BTC'], ['饼子', 'BTC'], ['以太', 'ETH'], ['二饼', 'ETH'],
  ['狗币', 'DOGE'], ['瑞波', 'XRP'], ['辣条', 'LTC'], ['柚子', 'EOS'],
  ['波卡', 'DOT'], ['雪崩', 'AVAX'], ['艾达', 'ADA'], ['柴犬', 'SHIB'],
].forEach(([alias, sym]) => {
  if (!CRYPTO_ALIAS.has(alias.toLowerCase())) CRYPTO_ALIAS.set(alias.toLowerCase(), sym);
});

/* 同步解析：代码 / 中文名 / 常见别名 → coin stock；无命中返回 null。
   仅用于输入框即时解析，完整候选由 searchCrypto 异步补全。 */
function cryptoResolveQuery(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (upper && !/^\d+$/.test(upper)) {
    const hit = CRYPTO_ALIAS.get(upper.toLowerCase());
    if (hit) return normalizeCoinStock({ symbol: hit });
  }
  const byName = CRYPTO_ALIAS.get(raw.toLowerCase());
  return byName ? normalizeCoinStock({ symbol: byName }) : null;
}

/* 异步搜索：代码/中英文名前缀匹配 CoinLore 前 100（含缓存，不额外请求） */
async function searchCrypto(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const direct = cryptoResolveQuery(q);
  const out = [];
  const seen = new Set();
  const push = (item) => {
    if (!item || seen.has(item.code)) return;
    seen.add(item.code);
    out.push(item);
  };
  push(direct);
  try {
    const rows = await getCryptoTop100();
    rows.forEach((r) => {
      if (out.length >= 6) return;
      if (CRYPTO_STABLES.has(r.symbol)) return;
      const en = String(r.name || '').toLowerCase();
      const zh = String(CRYPTO_NAMES[r.symbol] || '').toLowerCase();
      if (
        r.symbol.toLowerCase() === q ||
        r.symbol.toLowerCase().startsWith(q) ||
        zh.startsWith(q) ||
        en.startsWith(q)
      ) {
        push(normalizeCoinStock({ symbol: r.symbol, name: CRYPTO_NAMES[r.symbol] || r.name }));
      }
    });
  } catch (e) {
    /* 榜单不可用时仅返回同步别名命中 */
  }
  return out.slice(0, 6);
}

/* ---------------- 行情 / K 线 ---------------- */

function cryptoDateFromMs(ms) {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function cryptoDateFromSec(sec) {
  return cryptoDateFromMs(Number(sec) * 1000);
}
function cryptoTimeText(ms) {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function parseCryptoKlines(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      date: cryptoDateFromMs(row[0]),
      open: num(row[1]),
      high: num(row[2]),
      low: num(row[3]),
      close: num(row[4]),
      volume: num(row[5], 0),
      amount: num(row[7], 0),
    }))
    .filter((r) => r.date && Number.isFinite(r.close) && Number.isFinite(r.open));
}

/* 加密口径指标：额外补 7/30/90 日收益、90 日回撤、ATR(14)、30 日年化波动（365 天） */
function cryptoKlineMetrics(points) {
  const base = klineMetrics(points);
  const closes = points.map((p) => num(p.close)).filter((n) => Number.isFinite(n) && n > 0);
  const last = closes[closes.length - 1];
  const ret = (n) => (closes.length > n ? (last / closes[closes.length - 1 - n] - 1) * 100 : null);
  const mdd = (days) => {
    const arr = closes.slice(-days);
    if (!arr.length) return null;
    let peak = arr[0];
    let worst = 0;
    arr.forEach((c) => {
      peak = Math.max(peak, c);
      worst = Math.min(worst, (c / peak - 1) * 100);
    });
    return Math.abs(worst);
  };
  const trs = [];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    const tr = Math.max(p.high - p.low, Math.abs(p.high - prev.close), Math.abs(p.low - prev.close));
    if (Number.isFinite(tr)) trs.push(tr);
  }
  const atr = trs.length >= 14 ? trs.slice(-14).reduce((a, b) => a + b, 0) / 14 : null;
  let vol30 = null;
  const daily = [];
  for (let i = Math.max(1, closes.length - 30); i < closes.length; i++) daily.push(closes[i] / closes[i - 1] - 1);
  if (daily.length >= 10) {
    const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
    const variance = daily.reduce((a, b) => a + (b - mean) ** 2, 0) / daily.length;
    vol30 = Math.sqrt(variance) * Math.sqrt(365) * 100;
  }
  return {
    ...base,
    r7: ret(7),
    r30: ret(30),
    r90: ret(90),
    maxDrawdown90: mdd(90),
    atr14: atr,
    atrPct: Number.isFinite(atr) && last ? (atr / last) * 100 : null,
    vol30,
    /* 加密 7×24 交易，年化按 365 天折算，图表「年化波动」与评分口径保持一致 */
    volatility: Number.isFinite(vol30) ? vol30 : base.volatility,
  };
}

function getCryptoQuote(stock) {
  const symbol = String((stock && (stock.code || stock.rawCode)) || '').toUpperCase();
  return cached(`crypto:quote:${symbol}`, CRYPTO_TTL.quote, async () => {
    const data = await fetchJSON(`${CRYPTO_API.binance}/ticker/24hr?symbol=${symbol}USDT`, { timeout: 12000 });
    const price = num(data && data.lastPrice);
    if (!Number.isFinite(price)) throw new Error('加密行情数据为空');
    return {
      market: 'CRYPTO',
      code: symbol,
      name: CRYPTO_NAMES[symbol] || (stock && stock.name) || symbol,
      rawCode: symbol,
      price,
      change: num(data.priceChange),
      changePct: num(data.priceChangePercent),
      prevClose: num(data.openPrice),
      open: num(data.openPrice),
      high: num(data.highPrice),
      low: num(data.lowPrice),
      volume: num(data.volume, 0),
      amount: num(data.quoteVolume, 0),
      weightedAvg: num(data.weightedAvgPrice),
      trades: num(data.count),
      timeMs: num(data.closeTime),
      time: cryptoTimeText(data.closeTime),
      currency: 'USD',
      source: 'Binance',
    };
  });
}

const CRYPTO_INTERVAL = { day: '1d', week: '1w', month: '1M' };
const CRYPTO_KLINE_LIMIT = { day: 320, week: 260, month: 140 };

function getCryptoKline(stock, period = 'day') {
  const p = normalizeKlinePeriod(period);
  const symbol = String((stock && (stock.code || stock.rawCode)) || '').toUpperCase();
  return cached(`crypto:kline:${p}:${symbol}`, CRYPTO_TTL.kline, async () => {
    const url = `${CRYPTO_API.binance}/klines?symbol=${symbol}USDT&interval=${CRYPTO_INTERVAL[p]}&limit=${CRYPTO_KLINE_LIMIT[p]}`;
    const rows = await fetchJSON(url, { timeout: 15000 });
    const points = parseCryptoKlines(rows);
    if (points.length < 5) throw new Error('加密 K 线数据不足');
    return {
      key: 'crypto:' + symbol,
      period: p,
      points,
      metrics: p === 'day' ? cryptoKlineMetrics(points) : null,
      source: 'Binance',
    };
  });
}

function getCryptoBtcKline() {
  return getCryptoKline(normalizeCoinStock({ symbol: 'BTC' }), 'day');
}

/* ---------------- 市值 / 排名 ---------------- */

function normalizeCoinloreRow(r) {
  if (!r) return null;
  const symbol = String(r.symbol || '').trim().toUpperCase();
  if (!symbol) return null;
  return {
    id: r.id,
    symbol,
    name: String(r.name || symbol),
    rank: num(r.rank),
    price: num(r.price_usd),
    change1h: num(r.percent_change_1h),
    change24h: num(r.percent_change_24h),
    change7d: num(r.percent_change_7d),
    marketCap: num(r.market_cap_usd),
    volume24: num(r.volume24),
    circulating: num(r.csupply),
    totalSupply: num(r.tsupply),
    maxSupply: num(r.msupply),
  };
}

function getCryptoTop100(force = false) {
  return cached('crypto:coinlore:top100', CRYPTO_TTL.meta, async () => {
    const data = await fetchJSON(`${CRYPTO_API.coinlore}/tickers/?start=0&limit=100`, { timeout: 12000 });
    const rows = data && Array.isArray(data.data) ? data.data : [];
    return rows
      .map(normalizeCoinloreRow)
      .filter(Boolean)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999));
  }, force);
}

function getCryptoMeta(symbol) {
  const s = String(symbol || '').toUpperCase();
  return getCryptoTop100()
    .then((rows) => rows.find((r) => r.symbol === s) || null)
    .catch(() => null);
}

/* 纯函数：CoinLore 榜单 → 首页加密热门（排除稳定币、按市值排名） */
function cryptoBoardRows(rows, size = 10) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.symbol && !CRYPTO_STABLES.has(r.symbol) && Number.isFinite(r.price))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999))
    .slice(0, size)
    .map((r) => ({
      ...normalizeCoinStock({ symbol: r.symbol, name: CRYPTO_NAMES[r.symbol] || r.name }),
      price: r.price,
      changePct: r.change24h,
      change7d: r.change7d,
      marketCap: r.marketCap,
      amount: r.volume24,
      rank: r.rank,
    }));
}

function getCryptoBoard(size = CRYPTO_BOARD_SIZE, force = false) {
  const n = clamp(Math.round(Number(size) || CRYPTO_BOARD_SIZE), 5, 30);
  return cached(
    `crypto:board:${n}`,
    CRYPTO_TTL.board,
    async () => cryptoBoardRows(await getCryptoTop100(force), n),
    force
  );
}

/* ---------------- 合约 / 情绪 / 链上 ---------------- */

function getCryptoDerivatives(symbol) {
  const s = String(symbol || '').toUpperCase();
  return cached(`crypto:derivatives:${s}`, CRYPTO_TTL.derivatives, async () => {
    try {
      const rows = await fetchJSON(`${CRYPTO_API.gate}/futures/usdt/tickers?contract=${s}_USDT`, { timeout: 12000 });
      const r = Array.isArray(rows) ? rows[0] : null;
      if (!r) return null;
      const mark = num(r.mark_price);
      const index = num(r.index_price);
      const mult = num(r.quanto_multiplier);
      const size = num(r.total_size);
      return {
        contract: r.contract || `${s}_USDT`,
        funding: num(r.funding_rate),
        fundingIndicative: num(r.funding_rate_indicative),
        mark,
        index,
        basisPct: mark && index ? ((mark - index) / index) * 100 : null,
        oiUsd: Number.isFinite(size) && Number.isFinite(mult) && Number.isFinite(mark) ? size * mult * mark : null,
        oiContracts: size,
        volume24: num(r.volume_24h_quote) ?? num(r.volume_24h_settle) ?? num(r.volume_24h),
        source: 'Gate',
      };
    } catch (e) {
      return null;
    }
  });
}

function getCryptoFearGreed() {
  return cached('crypto:fng:30', CRYPTO_TTL.fng, async () => {
    const data = await fetchJSON(`${CRYPTO_API.fng}?limit=30`, { timeout: 12000 });
    const rows = (data && data.data) || [];
    const history = rows
      .map((r) => ({
        date: cryptoDateFromSec(num(r.timestamp)),
        close: num(r.value),
        cls: r.value_classification || '',
      }))
      .filter((r) => r.date && Number.isFinite(r.close))
      .reverse();
    if (!history.length) return null;
    const last = history[history.length - 1];
    return { current: last.close, classification: last.cls, history, source: 'alternative.me' };
  });
}

function getCryptoChainTvl(symbol) {
  const s = String(symbol || '').toUpperCase();
  const chain = CRYPTO_CHAINS[s];
  if (!chain) return Promise.resolve(null);
  return cached(`crypto:tvl:${chain}`, CRYPTO_TTL.tvl, async () => {
    const rows = await fetchJSON(`${CRYPTO_API.llama}/v2/historicalChainTvl/${encodeURIComponent(chain)}`, { timeout: 15000 });
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const points = rows
      .map((r) => ({ date: cryptoDateFromSec(num(r.date)), close: num(r.tvl) }))
      .filter((p) => p.date && Number.isFinite(p.close));
    if (points.length < 2) return null;
    const last = points[points.length - 1];
    const prev = points[Math.max(0, points.length - 31)];
    return {
      chain,
      current: last.close,
      change30d: prev && prev.close > 0 ? (last.close / prev.close - 1) * 100 : null,
      series: points.slice(-45),
      source: 'DefiLlama',
    };
  });
}

/* ---------------- 五维评分（纯函数，可离线单测） ---------------- */

/* 波动率健康度：加密资产 40%–80% 年化波动较健康；
   过低说明流动性/关注度不足，过高说明风险失控。 */
function cryptoVolScore(vol) {
  if (!Number.isFinite(vol)) return null;
  if (vol < 15) return 30;
  if (vol < 25) return 45;
  if (vol < 40) return 48 + ((vol - 25) / 15) * 32;
  if (vol <= 80) return 88 - ((vol - 40) / 40) * 4;
  if (vol <= 120) return 84 - ((vol - 80) / 40) * 30;
  return clamp(54 - ((vol - 120) / 80) * 34, 12, 54);
}

/* 换手率：1%–15% 为健康活跃区；>50% 多为投机换手，扣分但不归零。 */
function cryptoTurnoverScore(turnover) {
  if (!Number.isFinite(turnover)) return null;
  if (turnover > 80) return 38;
  if (turnover > 50) return 48;
  if (turnover > 30) return 58;
  if (turnover > 15) return 72;
  if (turnover > 8) return 88;
  if (turnover > 3) return 92;
  if (turnover > 1) return 84;
  if (turnover > 0.3) return 68;
  return 52;
}

/* 资金费率：极端正值=多头拥挤；负值=空头拥挤，按逆向情绪小幅加分。 */
function cryptoFundingScore(funding) {
  if (!Number.isFinite(funding)) return null;
  if (funding > 0.0008) return 20;
  if (funding > 0.0004) return 34;
  if (funding > 0.00015) return 48;
  if (funding >= -0.00005) return 60;
  if (funding >= -0.0003) return 70;
  if (funding >= -0.0008) return 82;
  return 62;
}

function cryptoBasisScore(basisPct) {
  const abs = Number.isFinite(basisPct) ? Math.abs(basisPct) : null;
  if (abs === null) return null;
  if (abs > 2) return 30;
  if (abs > 1) return 45;
  if (abs > 0.5) return 60;
  if (abs > 0.2) return 76;
  return 88;
}

function scoreCryptoTrend(kline, btcKline) {
  const m = kline && kline.metrics;
  if (!m || !Number.isFinite(m.r30)) {
    return { available: false, note: '日 K 数据不足，趋势动量不计入', reasons: [] };
  }
  const r30s = band(m.r30, [[60, 98], [35, 92], [15, 82], [5, 72], [-5, 60], [-15, 46], [-30, 28]], 14);
  const r90s = Number.isFinite(m.r90)
    ? band(m.r90, [[150, 98], [80, 92], [30, 82], [0, 68], [-25, 50], [-50, 30]], 14)
    : null;
  let align = null;
  if (Number.isFinite(m.ma20) && Number.isFinite(m.ma60)) {
    if (m.last > m.ma20 && m.ma20 > m.ma60) align = 92;
    else if (m.last < m.ma20 && m.ma20 < m.ma60) align = 24;
    else align = 55;
  }
  const bm = btcKline && btcKline.metrics;
  const excess =
    bm && Number.isFinite(bm.r60) && Number.isFinite(m.r60) ? m.r60 - bm.r60 : null;
  const excessS = excess === null
    ? null
    : band(excess, [[60, 96], [30, 88], [10, 76], [0, 60], [-15, 44], [-35, 26]], 14);
  let sum = 0;
  let w = 0;
  if (r30s !== null) { sum += r30s * 0.35; w += 0.35; }
  if (r90s !== null) { sum += r90s * 0.25; w += 0.25; }
  if (align !== null) { sum += align * 0.2; w += 0.2; }
  if (excessS !== null) { sum += excessS * 0.2; w += 0.2; }
  const score = w > 0 ? Math.round(sum / w) : 50;
  const reasons = [
    `30 日收益 ${fmtPct(m.r30)}，90 日收益 ${fmtPct(m.r90)}，收益分分别为 ${r30s} / ${r90s ?? '—'}。`,
    Number.isFinite(m.ma20) && Number.isFinite(m.ma60)
      ? `现价 ${fmtPrice(m.last, m.last < 1 ? 4 : 2)}，MA20 ${fmtPrice(m.ma20, m.ma20 < 1 ? 4 : 2)}、MA60 ${fmtPrice(m.ma60, m.ma60 < 1 ? 4 : 2)}，均线形态「${m.trend}」。`
      : '均线数据不足，均线排列子项按中性处理。',
    excess === null
      ? 'BTC 基准数据不可用，相对强弱子项未计入。'
      : `相对 BTC 的 60 日超额收益 ${fmtPct(excess)}，超额分 ${excessS}。`,
    '子项权重：30 日收益 35% / 90 日收益 25% / 均线排列 20% / 相对 BTC 超额 20%。',
  ];
  return {
    available: true,
    score: clamp(score, 0, 100),
    note: `30日 ${fmtPct(m.r30)} · 90日 ${fmtPct(m.r90)}${excess !== null ? ` · 超额 ${fmtPct(excess)}` : ''}`,
    reasons,
  };
}

function scoreCryptoLiquidity(quote, meta) {
  const volume = num(quote && (quote.amount ?? quote.quoteVolume));
  if (!Number.isFinite(volume)) {
    return { available: false, note: '24h 成交额数据缺失', reasons: [] };
  }
  const cap = num(meta && meta.marketCap);
  const rank = num(meta && meta.rank);
  const turnover = Number.isFinite(cap) && cap > 0 ? (volume / cap) * 100 : null;
  const volS = band(volume, [
    [5e9, 98], [1e9, 92], [3e8, 84], [1e8, 76], [3e7, 64], [1e7, 52], [3e6, 38], [5e5, 24],
  ], 12);
  const turnS = cryptoTurnoverScore(turnover);
  const rankS = Number.isFinite(rank)
    ? rank <= 10 ? 95 : rank <= 30 ? 84 : rank <= 50 ? 74 : rank <= 100 ? 62 : 50
    : null;
  let sum = 0;
  let w = 0;
  if (volS !== null) { sum += volS * 0.5; w += 0.5; }
  if (turnS !== null) { sum += turnS * 0.3; w += 0.3; }
  if (rankS !== null) { sum += rankS * 0.2; w += 0.2; }
  const reasons = [`24h 成交额约 ${fmtUsdCompact(volume)}，成交额分 ${volS}。`];
  if (turnover !== null) {
    reasons.push(`换手率（24h 成交额 ÷ 市值）约 ${turnover.toFixed(2)}%，换手分 ${turnS}；1%–15% 为健康活跃区，>50% 多为投机换手。`);
  } else {
    reasons.push('市值数据缺失，换手率子项未计入。');
  }
  if (rankS !== null) reasons.push(`CoinLore 市值排名第 ${rank}，排名分 ${rankS}。`);
  else reasons.push('市值排名数据缺失，排名子项未计入。');
  reasons.push('子项权重：成交额 50% / 换手率 30% / 市值排名 20%。');
  return {
    available: true,
    score: Math.round(w > 0 ? sum / w : 50),
    note: `24h ${fmtUsdCompact(volume)}${turnover !== null ? ` · 换手 ${turnover.toFixed(2)}%` : ''}${Number.isFinite(rank) ? ` · #${rank}` : ''}`,
    reasons,
  };
}

function scoreCryptoVolatility(kline) {
  const m = kline && kline.metrics;
  if (!m || !Number.isFinite(m.vol30)) {
    return { available: false, note: '波动率数据不足', reasons: [] };
  }
  const volS = cryptoVolScore(m.vol30);
  const mddS = Number.isFinite(m.maxDrawdown90)
    ? band(m.maxDrawdown90, [[10, 96], [20, 88], [35, 76], [50, 58], [65, 40], [80, 24]], 12)
    : null;
  const atrS = Number.isFinite(m.atrPct)
    ? band(m.atrPct, [[12, 50], [9, 66], [6, 88], [4, 92], [2.5, 82], [1.5, 66]], 40)
    : null;
  let sum = 0;
  let w = 0;
  if (volS !== null) { sum += volS * 0.45; w += 0.45; }
  if (mddS !== null) { sum += mddS * 0.35; w += 0.35; }
  if (atrS !== null) { sum += atrS * 0.2; w += 0.2; }
  return {
    available: true,
    score: Math.round(w > 0 ? sum / w : 50),
    note: `30日波动 ${volS !== null ? m.vol30.toFixed(1) + '%' : '—'} · 90日回撤 ${Number.isFinite(m.maxDrawdown90) ? m.maxDrawdown90.toFixed(1) + '%' : '—'}`,
    reasons: [
      `30 日年化波动率约 ${m.vol30.toFixed(1)}%，波动分 ${volS}；40%–80% 为相对健康区间。`,
      Number.isFinite(m.maxDrawdown90)
        ? `90 日最大回撤约 ${m.maxDrawdown90.toFixed(1)}%，回撤分 ${mddS}；回撤越深说明此前的下行风险越大。`
        : '90 日回撤数据不足，回撤子项未计入。',
      Number.isFinite(m.atrPct)
        ? `ATR(14)/价格 约 ${m.atrPct.toFixed(2)}%，ATR 分 ${atrS}；2%–6% 属于加密常态波动。`
        : 'ATR 数据不足，ATR 子项未计入。',
      '子项权重：波动率 45% / 最大回撤 35% / ATR 20%。波动低不等于风险低，极端行情下历史波动会失效。',
    ],
  };
}

function scoreCryptoDerivatives(derivatives, meta) {
  const d = derivatives;
  if (!d || !Number.isFinite(d.funding)) {
    return { available: false, note: '暂无 U 本位合约数据', reasons: [] };
  }
  const fundS = cryptoFundingScore(d.funding);
  const cap = num(meta && meta.marketCap);
  const ratio = Number.isFinite(d.oiUsd) && Number.isFinite(cap) && cap > 0 ? (d.oiUsd / cap) * 100 : null;
  const oiS = Number.isFinite(ratio)
    ? band(ratio, [[25, 30], [15, 42], [8, 56], [4, 72], [1.5, 84], [0.5, 70]], 55)
    : null;
  const basisS = cryptoBasisScore(d.basisPct);
  let sum = 0;
  let w = 0;
  if (fundS !== null) { sum += fundS * 0.45; w += 0.45; }
  if (oiS !== null) { sum += oiS * 0.3; w += 0.3; }
  if (basisS !== null) { sum += basisS * 0.25; w += 0.25; }
  const reasons = [
    `当前 8h 资金费率 ${(d.funding * 100).toFixed(4)}%，费率分 ${fundS}；极端正费率代表多头拥挤，负费率代表空头拥挤（逆向情绪小幅加分）。`,
  ];
  if (Number.isFinite(ratio)) {
    reasons.push(`持仓量约 ${fmtUsdCompact(d.oiUsd)}，占市值 ${ratio.toFixed(2)}%，杠杆分 ${oiS}；1%–5% 相对健康，>15% 需警惕高杠杆清算风险。`);
  } else {
    reasons.push('市值或持仓量数据缺失，持仓量占市值子项未计入。');
  }
  if (Number.isFinite(d.basisPct)) {
    reasons.push(`标记价 ${fmtPrice(d.mark, 2)} / 指数价 ${fmtPrice(d.index, 2)}，基差 ${d.basisPct.toFixed(3)}%，基差分 ${basisS}。`);
  } else {
    reasons.push('基差数据缺失，基差子项未计入。');
  }
  reasons.push('子项权重：资金费率 45% / 持仓量÷市值 30% / 期现基差 25%。合约数据来自 Gate，仅覆盖有 U 本位合约的币种。');
  return {
    available: true,
    score: Math.round(w > 0 ? sum / w : 50),
    note: `费率 ${(d.funding * 100).toFixed(4)}%${Number.isFinite(ratio) ? ` · OI/市值 ${ratio.toFixed(1)}%` : ''}`,
    reasons,
  };
}

function scoreCryptoSentiment(fng, chainTvl) {
  const value = num(fng && fng.current);
  if (!Number.isFinite(value)) {
    return { available: false, note: '恐慌贪婪指数不可用', reasons: [] };
  }
  const fngS = clamp(100 - value, 0, 100);
  const tvlS = chainTvl && Number.isFinite(chainTvl.change30d)
    ? band(chainTvl.change30d, [[60, 94], [30, 88], [10, 78], [0, 64], [-15, 52], [-35, 36]], 22)
    : null;
  let sum = fngS * 0.6;
  let w = 0.6;
  if (tvlS !== null) {
    sum += tvlS * 0.4;
    w += 0.4;
  }
  const reasons = [
    `恐慌贪婪指数 ${Math.round(value)}（${fng.classification || '—'}），按逆向口径换算 ${Math.round(fngS)} 分；极度恐慌偏加分、极度贪婪偏扣分。`,
  ];
  if (tvlS !== null) {
    reasons.push(
      `主链 ${chainTvl.chain} TVL 约 ${fmtUsdCompact(chainTvl.current)}，30 日变化 ${fmtPct(chainTvl.change30d)}，生态分 ${tvlS}。`
    );
  } else {
    reasons.push('该币种没有可用的主链 TVL 映射，生态子项未计入，仅使用恐慌贪婪指数。');
  }
  reasons.push('子项权重：恐慌贪婪指数 60% / 主链 TVL 30 日变化 40%。情绪指标是逆向参考，不代表价格即将反转。');
  return {
    available: true,
    score: Math.round(sum / w),
    note: `F&G ${Math.round(value)} · ${fng.classification || '—'}${tvlS !== null ? ` · TVL ${fmtPct(chainTvl.change30d)}` : ''}`,
    reasons,
  };
}

function cryptoVerdict(score) {
  if (score >= 80) return { label: '强势', cls: 'strong', tone: 'gold', desc: '多维共振，趋势与流动性优势较突出' };
  if (score >= 65) return { label: '偏强', cls: 'bull', tone: 'teal', desc: '多数维度偏向积极，仍需关注波动与杠杆' };
  if (score >= 50) return { label: '中性', cls: 'neutral', tone: 'blue', desc: '多空与风险因素相对均衡' };
  if (score >= 35) return { label: '偏弱', cls: 'bear', tone: 'orange', desc: '部分维度存在压力，波动或流动性偏弱' };
  return { label: '弱势', cls: 'weak', tone: 'red', desc: '风险因素占主导，数据覆盖或流动性不足' };
}

/* 主入口：加密五维综合评分。覆盖惩罚 0.7 + 0.3 × 覆盖率 */
function computeCryptoScore({ quote, kline, btcKline, meta, derivatives, fng, chainTvl } = {}) {
  const results = {
    trend: scoreCryptoTrend(kline, btcKline),
    liquidity: scoreCryptoLiquidity(quote, meta),
    volatility: scoreCryptoVolatility(kline),
    derivatives: scoreCryptoDerivatives(derivatives, meta),
    sentiment: scoreCryptoSentiment(fng, chainTvl),
  };
  const dims = CRYPTO_DIM_META.map((m) => {
    const r = results[m.key];
    return {
      ...m,
      available: !!r.available && Number.isFinite(r.score),
      score: r.available && Number.isFinite(r.score) ? clamp(Math.round(r.score), 0, 100) : null,
      note: r.note || '数据不可用',
      reasons: r.reasons || [],
    };
  });
  const available = dims.filter((d) => d.available);
  const weightSum = available.reduce((a, d) => a + d.weight, 0);
  const coverage = Math.round(weightSum);
  let total = null;
  if (weightSum > 0) {
    const weighted = available.reduce((a, d) => a + d.score * d.weight, 0) / weightSum;
    const factor = 0.7 + 0.3 * (coverage / 100);
    total = clamp(Math.round(weighted * factor), 0, 100);
  }
  const verdict = cryptoVerdict(total === null ? 0 : total);
  const sorted = available.slice().sort((a, b) => b.score - a.score);
  let desc = total === null ? '有效数据不足，暂不给出综合分。' : verdict.desc + '。';
  if (sorted.length >= 2) {
    desc += `最强项为${sorted[0].name}（${sorted[0].score}），最弱项为${sorted[sorted.length - 1].name}（${sorted[sorted.length - 1].score}）。`;
  }
  if (coverage < 100) desc += `当前权重覆盖 ${coverage}%，缺失维度已计入覆盖惩罚。`;
  return {
    total,
    verdict,
    dims,
    coverage,
    availableCount: available.length,
    dimCount: dims.length,
    desc,
    missing: dims.filter((d) => !d.available).map((d) => d.short),
    createdAt: new Date(),
    kind: 'coin',
  };
}

/* ---------------- 展示格式 ---------------- */

function fmtUsdCompact(n) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtCryptoPrice(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1) return fmtPrice(n, 2);
  if (n >= 0.01) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toFixed(8);
}

function fmtCryptoSupply(n, symbol = '') {
  if (!Number.isFinite(n)) return '—';
  const unit = n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : fmtInt(n);
  return unit + (symbol ? ` ${symbol}` : '');
}
