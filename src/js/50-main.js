/* ============================================================
   App shell — routing, search, orchestration, interactions
   ============================================================ */
'use strict';

const state = {
  route: 'home',
  token: 0,
  stock: null,
  quote: null,
  core: {},
  coreSettled: new Set(),
  score: null,
  profile: null,
  profileReady: false,
  reports: null,
  peers: null,
  industryName: '',
  industryCode: '',
  industryStarted: false,
  pendingStock: null,
  klinePeriod: 'day',
  periodKlines: {},
  technical: null,
  subChart: 'volume',
  bollOn: false,
  screener: {
    threshold: SCREENER_DEFAULT_THRESHOLD,
    size: SCREENER_DEFAULT_SIZE,
    rows: [],
    ranAt: null,
    stopped: false,
    error: '',
    running: false,
    token: 0,
    progressPct: 0,
    progressText: '准备中…',
  },
  etfScreener: {
    threshold: ETF_SCREENER_DEFAULT_THRESHOLD,
    size: ETF_SCREENER_DEFAULT_SIZE,
    rows: [],
    ranAt: null,
    stopped: false,
    error: '',
    running: false,
    token: 0,
    progressPct: 0,
    progressText: '准备中…',
  },
  timingWorkbench: {
    pool: [],
    rows: [],
    running: false,
    token: 0,
    progressPct: 0,
    progressText: '准备中…',
    ranAt: null,
    stopped: false,
    error: '',
  },
  search: { items: [], active: -1, query: '', seq: 0 },
  etf: null,
  crypto: null,
  commodity: null,
};

/* ---------------- stock objects ---------------- */
function normalizeStock(input) {
  const s = input || {};
  const market = String(s.market || 'A').toUpperCase();
  let code = String(s.code || s.rawCode || '').trim();
  let rawCode = String(s.rawCode || code).trim();
  let quoteKey = s.quoteKey || '';
  let klineCode = s.klineCode || '';
  let name = s.name || code;
  /* 标的类型：'etf' 走 ETF 专属研判，'coin' 走加密研判，'commodity' 走商品轻量研判，其余为个股 */
  let kind =
    s.kind === 'etf'
      ? 'etf'
      : s.kind === 'coin'
      ? 'coin'
      : s.kind === 'commodity' || market === 'COMMODITY'
      ? 'commodity'
      : 'stock';

  if (market === 'CRYPTO') {
    const symbol = (code || rawCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
    code = symbol;
    rawCode = symbol;
    kind = 'coin';
    if (!quoteKey) quoteKey = 'crypto:' + symbol;
    if (!klineCode) klineCode = 'crypto:' + symbol;
    name = s.name || (typeof CRYPTO_NAMES !== 'undefined' && CRYPTO_NAMES[symbol]) || symbol;
  } else if (market === 'A') {
    code = code.replace(/\D/g, '').slice(0, 6);
    rawCode = code;
    if (isEtfCode(code)) kind = 'etf'; /* 以代码为准，避免数据集丢失 kind 时误判 */
    if (!quoteKey) quoteKey = aSharePrefix(code) + code;
    if (!klineCode) klineCode = quoteKey;
  } else if (market === 'HK') {
    code = code.replace(/\D/g, '').padStart(5, '0').slice(-5);
    rawCode = code;
    if (!quoteKey) quoteKey = 'hk' + code;
    if (!klineCode) klineCode = 'hk' + code;
  } else if (market === 'COMMODITY' || kind === 'commodity') {
    const c =
      typeof normalizeCommodityStock === 'function'
        ? normalizeCommodityStock({ key: code, code, rawCode, name: s.name })
        : null;
    kind = 'commodity';
    code = c ? c.code : String(code || rawCode || '').toLowerCase();
    rawCode = code;
    name = s.name || (c && c.name) || code;
    if (!quoteKey) quoteKey = 'commodity:' + code;
    if (!klineCode) klineCode = 'commodity:' + code;
  } else {
    const f = usStockFields(rawCode || code);
    code = f.code;
    rawCode = f.rawCode;
    name = s.name || code;
    if (!quoteKey) quoteKey = f.quoteKey;
    if (!klineCode) klineCode = f.klineCode;
  }
  return { market, code, name, quoteKey, klineCode, rawCode, kind };
}

function stockFromDataset(ds) {
  return normalizeStock({
    market: ds.market,
    code: ds.code,
    name: ds.name,
    quoteKey: ds.quotekey,
    klineCode: ds.klinecode,
    rawCode: ds.rawcode,
    kind: ds.kind,
  });
}

function hashForStock(stock) {
  const raw = stock.market === 'US' ? stock.rawCode || stock.code : stock.code;
  /* 商品 / ETF / 加密使用独立路由，与个股研判分流 */
  if (stock.kind === 'commodity' || stock.market === 'COMMODITY') {
    return `#/commodity/${encodeURIComponent(stock.code)}`;
  }
  if (stock.kind === 'coin' || stock.market === 'CRYPTO') {
    return `#/coin/${encodeURIComponent(stock.code)}`;
  }
  if (stock.kind === 'etf' && stock.market === 'A') {
    return `#/etf/A/${encodeURIComponent(raw)}`;
  }
  return `#/stock/${stock.market}/${encodeURIComponent(raw)}`;
}

function lookupKnownStock(market, code) {
  const pending = state.pendingStock;
  if (pending && pending.market === market && pending.code === code) return pending;
  const recent = store.get('recent', []);
  if (Array.isArray(recent)) {
    const hit = recent.find((s) => s && s.market === market && s.code === code);
    if (hit) return normalizeStock(hit);
  }
  return null;
}

function stockFromHash() {
  const hash = location.hash || '';
  /* 大宗商品独立路由优先识别 */
  const commodityHash = hash.match(/^#\/commodity\/([a-z][a-z0-9_-]*)/i);
  if (commodityHash) {
    const key = decodeURIComponent(commodityHash[1]).toLowerCase();
    const hit = typeof normalizeCommodityStock === 'function' ? normalizeCommodityStock({ key }) : null;
    if (!hit) return null;
    const known = lookupKnownStock('COMMODITY', hit.code);
    return known ? normalizeStock(known) : normalizeStock(hit);
  }
  /* 加密独立路由优先识别 */
  const coinHash = hash.match(/^#\/coin\/([A-Za-z0-9]{2,15})/i);
  if (coinHash) {
    const symbol = decodeURIComponent(coinHash[1]).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!symbol) return null;
    const known = lookupKnownStock('CRYPTO', symbol);
    if (known) return normalizeCoinStock(known);
    return normalizeCoinStock({ symbol });
  }
  /* ETF 独立路由优先识别 */
  const etfHash = hash.match(/^#\/etf\/A\/([^/?#]+)/i);
  if (etfHash) {
    const code = decodeURIComponent(etfHash[1]).replace(/\D/g, '');
    if (code.length !== 6) return null;
    const known = lookupKnownStock('A', code);
    if (known) return normalizeStock({ ...known, kind: 'etf' });
    return normalizeStock({ market: 'A', code, name: code, kind: 'etf' });
  }
  const m = hash.match(/^#\/stock\/(A|HK|US)\/([^/?#]+)/i);
  if (!m) return null;
  const market = m[1].toUpperCase();
  const raw = decodeURIComponent(m[2]);
  if (market === 'A') {
    const code = raw.replace(/\D/g, '');
    if (code.length !== 6) return null;
    const known = lookupKnownStock('A', code);
    if (known) return known;
    return normalizeStock({ market: 'A', code, name: code });
  }
  if (market === 'HK') {
    const code = raw.replace(/\D/g, '').padStart(5, '0').slice(-5);
    const known = lookupKnownStock('HK', code);
    if (known) return known;
    return normalizeStock({ market: 'HK', code, name: code });
  }
  const fields = usStockFields(raw);
  const known = lookupKnownStock('US', fields.code);
  if (known) return normalizeStock({ ...known, rawCode: fields.rawCode });
  return normalizeStock(fields);
}

function goStock(input) {
  const stock = normalizeStock(input);
  state.pendingStock = stock;
  closeSuggestions();
  const hash = hashForStock(stock);
  if (location.hash === hash) {
    state.pendingStock = null;
    analyzeStock(stock);
  } else {
    location.hash = hash;
  }
}

/* ---------------- shell ---------------- */
function syncTopbar(route) {
  state.route = route;
  const topSearch = $('#topSearchTrigger');
  const printBtn = $('#printBtn');
  const screenerBtn = $('#topScreenerBtn');
  const etfScreenerBtn = $('#topEtfScreenerBtn');
  const timingBtn = $('#topTimingBtn');
  if (topSearch) topSearch.hidden = route !== 'analysis';
  if (printBtn) printBtn.hidden = route !== 'analysis';
  if (screenerBtn) screenerBtn.classList.toggle('active', route === 'screener');
  if (etfScreenerBtn) etfScreenerBtn.classList.toggle('active', route === 'etf-screener');
  if (timingBtn) timingBtn.classList.toggle('active', route === 'timing');
  document.body.dataset.route = route;
}

function applyTheme(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem('sl:theme', value);
  } catch (e) {}
  syncThemeButton();
}
function syncThemeButton() {
  const btn = document.querySelector('[data-action="toggle-theme"]');
  if (!btn) return;
  const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  btn.innerHTML = ico(theme === 'light' ? 'moon' : 'sun');
  btn.setAttribute('aria-label', theme === 'light' ? '切换到深色主题' : '切换到浅色主题');
  btn.setAttribute('title', theme === 'light' ? '切换到深色主题' : '切换到浅色主题');
}
function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
}

function addRecent(stock) {
  const entry = {
    market: stock.market,
    code: stock.code,
    name: stock.name,
    quoteKey: stock.quoteKey,
    klineCode: stock.klineCode,
    rawCode: stock.rawCode,
    t: Date.now(),
  };
  const list = store.get('recent', []);
  const rows = Array.isArray(list) ? list : [];
  const filtered = rows.filter((x) => !(x && x.market === entry.market && x.code === entry.code));
  filtered.unshift(entry);
  store.set('recent', filtered.slice(0, 6));
}

/* ---------------- routing ---------------- */
function routeFromHash() {
  if ((location.hash || '').startsWith('#/timing')) {
    state.pendingStock = null;
    ++state.token;
    enterTimingWorkbench();
    return;
  }
  if ((location.hash || '').startsWith('#/etf-screener')) {
    state.pendingStock = null;
    ++state.token;
    enterEtfScreener();
    return;
  }
  if ((location.hash || '').startsWith('#/screener')) {
    state.pendingStock = null;
    ++state.token; /* 中止可能进行中的个股研判 */
    enterScreener();
    return;
  }
  const stock = stockFromHash();
  if (!stock) {
    if (
      (location.hash || '').startsWith('#/stock/') ||
      (location.hash || '').startsWith('#/etf/') ||
      (location.hash || '').startsWith('#/coin/') ||
      (location.hash || '').startsWith('#/commodity/')
    ) {
      toast('链接中的代码无效，已返回首页', 'error');
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch (e) {
        location.hash = '';
      }
      state.pendingStock = null;
      state.route = 'home';
      renderHome();
      return;
    }
    state.pendingStock = null;
    state.route = 'home';
    renderHome();
    return;
  }
  state.pendingStock = null;
  analyzeStock(stock);
}

function goHome() {
  if ((location.hash || '') === '' || (location.hash || '') === '#') {
    state.route = 'home';
    renderHome();
    scrollTopSmooth();
  } else {
    location.hash = '';
  }
}

/* ---------------- 高分榜（反向选股）编排 ---------------- */
function goScreener() {
  if ((location.hash || '') === '#/screener') {
    enterScreener();
  } else {
    location.hash = '#/screener';
  }
}

function enterScreener() {
  ++state.screener.token; /* 取消上一次可能仍在进行的扫描 */
  state.screener.running = false;
  state.screener.rows = [];
  state.screener.ranAt = null;
  state.screener.stopped = false;
  state.screener.error = '';
  state.screener.progressPct = 0;
  state.screener.progressText = '准备中…';
  renderScreenerPage();
  startScreener();
}

async function runScreenerFlow() {
  const sc = state.screener;
  const token = ++sc.token;
  sc.running = true;
  sc.rows = [];
  sc.stopped = false;
  sc.error = '';
  sc.progressPct = 0;
  sc.progressText = '正在获取候选池…';
  syncScreenerButtons(true);
  refreshScreenerResult();
  try {
    const result = await runScreener({
      size: sc.size,
      onProgress: (done, total, row) => {
        if (token !== sc.token) return;
        updateScreenerProgress(done, total, row);
        if (row) sc.rows.push(row);
        refreshScreenerResult();
      },
      shouldStop: () => token !== sc.token,
    });
    if (token !== sc.token) return;
    sc.rows = result.rows;
    sc.ranAt = result.ranAt;
    sc.stopped = !!result.stopped;
    refreshScreenerResult();
  } catch (err) {
    if (token !== sc.token) return;
    sc.error = err && err.message ? err.message : '扫描失败，请稍后重试';
    sc.rows = [];
    refreshScreenerResult();
  } finally {
    if (token !== sc.token) return;
    sc.running = false;
    syncScreenerButtons(false);
  }
}

function startScreener() {
  if (state.screener.running) return;
  runScreenerFlow();
}

function stopScreener() {
  const sc = state.screener;
  if (!sc.running) return;
  ++sc.token;
  sc.running = false;
  sc.stopped = true;
  syncScreenerButtons(false);
  refreshScreenerResult();
  toast('扫描已停止，已完成的结果保留在下表', 'info');
}

function syncScreenerButtons(running) {
  const runBtn = $('#screenerRunBtn');
  const stopBtn = $('#screenerStopBtn');
  const prog = $('#screenerProgress');
  if (runBtn) {
    runBtn.disabled = running;
    const label = runBtn.querySelector('span:last-child');
    if (label) label.textContent = running ? '扫描中…' : '开始扫描';
  }
  if (stopBtn) stopBtn.hidden = !running;
  if (prog) prog.hidden = !running;
}

/* ---------------- 择时工作台（方案 C：自选股批量共振）编排 ---------------- */
function goTimingWorkbench() {
  if ((location.hash || '') === '#/timing') {
    enterTimingWorkbench();
  } else {
    location.hash = '#/timing';
  }
}

function enterTimingWorkbench() {
  const w = state.timingWorkbench;
  ++w.token;
  w.running = false;
  w.rows = [];
  w.ranAt = null;
  w.stopped = false;
  w.error = '';
  w.progressPct = 0;
  w.progressText = '准备中…';
  w.pool = watchlistGet().filter((s) => s && s.market && s.market !== 'CRYPTO' && s.market !== 'COMMODITY');
  renderTimingWorkbenchPage();
  if (w.pool.length) startTimingWorkbench();
}

/* 单只标的：批量行情已取到 quote，逐周期取 K 线（失败降级为 null，不阻断） */
async function fetchTimingKlines(stock, quote) {
  const [day, week, month] = await Promise.all([
    getKline(stock, quote, 'day').catch(() => null),
    getKline(stock, quote, 'week').catch(() => null),
    getKline(stock, quote, 'month').catch(() => null),
  ]);
  return { day, week, month };
}

async function runTimingWorkbenchFlow() {
  const w = state.timingWorkbench;
  const token = ++w.token;
  w.running = true;
  w.rows = [];
  w.stopped = false;
  w.error = '';
  w.progressPct = 0;
  w.progressText = '正在获取自选股行情…';
  syncTimingWorkbenchButtons(true);
  refreshTimingWorkbench();
  try {
    const keys = w.pool.map((s) => s.quoteKey).filter(Boolean);
    const quoteMap = keys.length ? await getQuoteBatch(keys) : new Map();
    const usable = w.pool.map((s) => ({ stock: s, quote: quoteMap.get(s.quoteKey) || null }));
    if (!usable.length) throw new Error('自选股池暂不可用，请稍后重试');
    const rows = [];
    let cursor = 0;
    let done = 0;
    const worker = async () => {
      while (cursor < usable.length) {
        if (token !== w.token) return;
        const item = usable[cursor++];
        let row;
        try {
          const klines = await fetchTimingKlines(item.stock, item.quote);
          row = buildTimingRow(item.stock, klines);
        } catch (e) {
          row = buildTimingRow(item.stock, null);
        }
        if (token !== w.token) return;
        rows.push(row);
        w.rows = rows.slice();
        done += 1;
        updateTimingWorkbenchProgress(done, usable.length, row);
        refreshTimingWorkbench();
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    if (token !== w.token) return;
    w.rows = rankTimingRows(rows);
    w.ranAt = new Date();
    w.stopped = false;
    refreshTimingWorkbench();
  } catch (err) {
    if (token !== w.token) return;
    w.error = err && err.message ? err.message : '研判失败，请稍后重试';
    w.rows = [];
    refreshTimingWorkbench();
    toast(w.error, 'error');
  } finally {
    if (token !== w.token) return;
    w.running = false;
    syncTimingWorkbenchButtons(false);
  }
}

function startTimingWorkbench() {
  const w = state.timingWorkbench;
  if (w.running) return;
  if (!w.pool.length) {
    toast('自选股池为空，请先在个股研判页加自选', 'info');
    return;
  }
  runTimingWorkbenchFlow();
}

function stopTimingWorkbench() {
  const w = state.timingWorkbench;
  if (!w.running) return;
  ++w.token;
  w.running = false;
  w.stopped = true;
  syncTimingWorkbenchButtons(false);
  refreshTimingWorkbench();
  toast('研判已停止，已完成的结果保留在表中', 'info');
}

/* ---------------- ETF 高分榜（ETF 五维反向选股）编排 ---------------- */
function goEtfScreener() {
  if ((location.hash || '') === '#/etf-screener') {
    enterEtfScreener();
  } else {
    location.hash = '#/etf-screener';
  }
}

function enterEtfScreener() {
  const es = state.etfScreener;
  ++es.token; /* 取消上一次可能仍在进行的扫描 */
  es.running = false;
  es.rows = [];
  es.ranAt = null;
  es.stopped = false;
  es.error = '';
  es.progressPct = 0;
  es.progressText = '准备中…';
  renderEtfScreenerPage();
  startEtfScreener();
}

async function runEtfScreenerFlow() {
  const es = state.etfScreener;
  const token = ++es.token;
  es.running = true;
  es.rows = [];
  es.stopped = false;
  es.error = '';
  es.progressPct = 0;
  es.progressText = '正在获取候选池…';
  syncEtfScreenerButtons(true);
  refreshEtfScreenerResult();
  try {
    const result = await runEtfScreener({
      size: es.size,
      onProgress: (done, total, row) => {
        if (token !== es.token) return;
        updateEtfScreenerProgress(done, total, row);
        if (row) es.rows.push(row);
        refreshEtfScreenerResult();
      },
      shouldStop: () => token !== es.token,
    });
    if (token !== es.token) return;
    es.rows = result.rows;
    es.ranAt = result.ranAt;
    es.stopped = !!result.stopped;
    refreshEtfScreenerResult();
  } catch (err) {
    if (token !== es.token) return;
    es.error = err && err.message ? err.message : '扫描失败，请稍后重试';
    es.rows = [];
    refreshEtfScreenerResult();
  } finally {
    if (token !== es.token) return;
    es.running = false;
    syncEtfScreenerButtons(false);
  }
}

function startEtfScreener() {
  if (state.etfScreener.running) return;
  runEtfScreenerFlow();
}

function stopEtfScreener() {
  const es = state.etfScreener;
  if (!es.running) return;
  ++es.token;
  es.running = false;
  es.stopped = true;
  syncEtfScreenerButtons(false);
  refreshEtfScreenerResult();
  toast('扫描已停止，已完成的结果保留在下表', 'info');
}

function syncEtfScreenerButtons(running) {
  const runBtn = $('#etfScreenerRunBtn');
  const stopBtn = $('#etfScreenerStopBtn');
  const prog = $('#etfScreenerProgress');
  if (runBtn) {
    runBtn.disabled = running;
    const label = runBtn.querySelector('span:last-child');
    if (label) label.textContent = running ? '扫描中…' : '开始扫描';
  }
  if (stopBtn) stopBtn.hidden = !running;
  if (prog) prog.hidden = !running;
}

/* ---------------- analysis orchestration ---------------- */
async function analyzeStock(inputStock, opts = {}) {
  /* 加密/ETF 标的统一分流到专属编排（覆盖搜索/榜单/路由/刷新所有入口） */
  const normalized = normalizeStock(inputStock);
  if (normalized.kind === 'coin' || normalized.market === 'CRYPTO') {
    return analyzeCoin(inputStock, opts);
  }
  if (normalized.kind === 'etf') {
    return analyzeEtf(inputStock, opts);
  }
  if (normalized.kind === 'commodity') {
    return analyzeCommodity(inputStock, opts);
  }
  const token = ++state.token;
  const stock = normalizeStock(inputStock);
  state.route = 'analysis';
  state.stock = stock;
  state.quote = null;
  state.core = {};
  state.coreSettled = new Set();
  state.score = null;
  state.profile = null;
  state.profileReady = false;
  state.reports = null;
  state.peers = null;
  state.industryName = '';
  state.industryCode = '';
  state.industryStarted = false;
  state.klinePeriod = 'day';
  state.periodKlines = {};
  state.technical = null;
  renderAnalysisSkeleton(stock);
  if (!opts.keepScroll) scrollTopSmooth();

  try {
    const quote = await getQuote(stock);
    if (token !== state.token) return;
    stock.name = quote.name || stock.name;
    stock.rawCode = quote.rawCode || stock.rawCode;
    stock.quoteKey = quote.key || stock.quoteKey;
    if (stock.market === 'US') stock.code = usBaseCode(quote.rawCode || stock.rawCode) || stock.code;
    state.stock = stock;
    state.quote = quote;
    addRecent(stock);
    renderStockHeader(stock, quote, null);
    document.title = `${stock.name} ${stock.code} · 研值 StockLens`;
    bindCoreData(token, quote);
  } catch (err) {
    if (token !== state.token) return;
    renderFatal(stock, quoteErrorText(err));
    toast('行情获取失败：' + quoteErrorText(err), 'error');
  }
}

function quoteErrorText(err) {
  if (!err) return '行情接口无响应';
  if (err.name === 'AbortError') return '行情接口超时，请检查网络后重试';
  return err.message || '行情接口无响应';
}

function markCoreSettled(key, value) {
  state.core[key] = value;
  state.coreSettled.add(key);
  if (['kline', 'reports', 'financials', 'news'].every((k) => state.coreSettled.has(k))) {
    refreshScore();
  }
}

/* 择时状态卡跨周期共振：日线到达后并发补齐周/月 K 线（方案 A）。
   - klineLoader(p) 由各市场入口注入，统一返回 Promise<K线对象>；
   - 单一 token 校验贯穿始终，切股后旧数据不落库、不重绘；
   - 周/月失败各自静默降级（不 toast、不阻断日线主流程），状态卡按可用周期显示；
   - 全部 settled 后重绘研判卡，让择时状态从「仅日线」平滑升级为三周期共振。 */
function prefetchTimingPeriods(token, klineLoader) {
  const pending = timingPrefetchPlan(state.periodKlines);
  if (!pending.length || token !== state.token) return;
  Promise.all(
    pending.map((p) =>
      Promise.resolve()
        .then(() => klineLoader(p))
        .then((kline) => {
          if (token === state.token) state.periodKlines[p] = kline;
        })
        .catch(() => {
          /* 周/月降级：保留已有缓存，不改写、不提示 */
        })
    )
  ).then(() => {
    if (token !== state.token) return;
    if (state.technical) updateTechnicalSection(state.technical);
  });
}

function bindCoreData(token, quote) {
  const stock = state.stock;

  getKline(stock, quote)
    .then((kline) => {
      if (token !== state.token) return;
      state.periodKlines.day = kline;
      markCoreSettled('kline', kline);
      updateChart(kline);
      /* 技术研判模块：基于完整日 K 纯本地计算，零新增网络请求 */
      const technical = analyzeTechnical(kline && kline.points);
      state.technical = technical;
      updateTechnicalSection(technical);
      /* 择时共振：日线渲染完成后并发补齐周/月，到位后重绘状态卡 */
      prefetchTimingPeriods(token, (p) => getKline(stock, quote, p));
    })
    .catch(() => {
      if (token !== state.token) return;
      markCoreSettled('kline', null);
      updateChart(null);
      state.technical = null;
      updateTechnicalSection(null);
    });

  getStockReports(stock)
    .then((reports) => {
      if (token !== state.token) return;
      state.reports = reports;
      markCoreSettled('reports', reports);
      renderStockReports(reports, stock.market);
      /* FR-5.1：研报（含目标价）到达后刷新 K 线，绘制目标价锚点 */
      const k = state.periodKlines[state.klinePeriod] || state.core.kline;
      if (k) updateChart(k);
    })
    .catch(() => {
      if (token !== state.token) return;
      state.reports = null;
      markCoreSettled('reports', null);
      renderStockReports(null, stock.market);
    })
    .finally(() => {
      if (token !== state.token) return;
      maybeStartIndustry();
    });

  getFinancials(stock)
    .then((financials) => {
      if (token !== state.token) return;
      markCoreSettled('financials', financials);
      renderFinancialSection(financials, stock.market);
    })
    .catch((err) => {
      if (token !== state.token) return;
      markCoreSettled('financials', null);
      const body = $('#financialBody');
      if (body) {
        body.innerHTML = errorBox('财务数据获取失败', err && err.message ? err.message : '接口未响应，请稍后重试。', 'financial');
      }
      updateStatus('financial', 'error', '财务 获取失败');
    });

  getNews(stock)
    .then((news) => {
      if (token !== state.token) return;
      markCoreSettled('news', news);
      renderNewsSection(news, stock.market);
    })
    .catch(() => {
      if (token !== state.token) return;
      markCoreSettled('news', []);
      renderNewsSection([], stock.market);
    });

  getOrgProfile(stock, quote)
    .then((profile) => {
      if (token !== state.token) return;
      state.profile = profile;
      if (profile && profile.industryName) {
        updateHeaderIndustry(profile);
        setIndustryBadge(profile.industryName);
      }
    })
    .catch(() => {
      if (token !== state.token) return;
      state.profile = null;
    })
    .finally(() => {
      if (token !== state.token) return;
      state.profileReady = true;
      maybeStartIndustry();
    });
}

function setIndustryBadge(name) {
  const el = $('#industryBadge');
  if (el && name) el.innerHTML = `<span class="badge">${esc(name)}</span>`;
}

function refreshScore() {
  if (!state.quote || !state.stock) return;
  if (!['kline', 'reports', 'financials', 'news'].every((k) => state.coreSettled.has(k))) return;
  const score = computeScore({
    market: state.stock.market,
    quote: state.quote,
    kline: state.core.kline,
    reports: state.core.reports,
    financials: state.core.financials,
    news: state.core.news,
  });
  state.score = score;
  /* 优先使用用户当前所选周期（周/月K），避免评分刷新时图表被重置回日K */
  renderOverview(score, state.periodKlines[state.klinePeriod] || state.core.kline);
}

/* ---------------- ETF 研判编排（独立路由 #/etf） ---------------- */
function goEtf(input) {
  const stock = normalizeStock({ ...input, kind: 'etf' });
  state.pendingStock = stock;
  closeSuggestions();
  const hash = hashForStock(stock);
  if (location.hash === hash) {
    state.pendingStock = null;
    analyzeEtf(stock);
  } else {
    location.hash = hash;
  }
}

/* ETF 榜单/快照指标：从候选池中按代码查找规模与成交额（零新增请求）；找不到时降级 */
function findEtfBoardMeta(code) {
  return getEtfIndustryPool()
    .catch(() => [])
    .then((list) => (Array.isArray(list) ? list : []).find((s) => s && s.code === code) || null);
}

async function analyzeEtf(inputStock) {
  const token = ++state.token;
  const stock = normalizeStock({ ...inputStock, kind: 'etf' });
  state.route = 'analysis';
  state.stock = stock;
  state.quote = null;
  state.core = {};
  state.coreSettled = new Set();
  state.technical = null;
  state.score = null;
  state.reports = null; /* ETF 无个股研报，清空避免沿用上一只股票的目标价锚点 */
  state.profile = null;
  state.periodKlines = {};
  state.klinePeriod = 'day';
  state.etf = { token, fundamentals: null, boardMeta: null, score: null };
  renderEtfSkeleton(stock);
  scrollTopSmooth();

  let quote;
  try {
    quote = await getQuote(stock);
    if (token !== state.token) return;
    stock.name = quote.name || stock.name;
    stock.rawCode = quote.rawCode || stock.rawCode;
    stock.quoteKey = quote.key || stock.quoteKey;
    if (stock.market === 'US') stock.code = usBaseCode(quote.rawCode || stock.rawCode) || stock.code;
    state.stock = stock;
    state.quote = quote;
    addRecent(stock);
    renderEtfHeader(stock, quote, null);
    document.title = `${stock.name} ${stock.code} · ETF 研判 · 研值 StockLens`;
    bindEtfData(token, quote, stock);
  } catch (err) {
    if (token !== state.token) return;
    renderFatal(stock, quoteErrorText(err));
    toast('ETF 行情获取失败：' + quoteErrorText(err), 'error');
  }
}

function bindEtfData(token, quote, stock) {
  /* 榜单指标（规模/成交额）：从缓存读取，零新增请求 */
  findEtfBoardMeta(stock.code)
    .then((meta) => {
      if (token !== state.token) return;
      state.etf.boardMeta = meta;
      /* 榜单指标到达后，若评分已算过则重算以纳入规模/量能维度 */
      if (state.etf.score) maybeRefreshEtfScore(token);
    })
    .catch(() => {});

  /* 技术研判：复用个股流程，日 K 到达即渲染五维技术 */
  getKline(stock, quote)
    .then((kline) => {
      if (token !== state.token) return;
      state.periodKlines.day = kline;
      state.core.kline = kline;
      state.coreSettled.add('kline');
      updateChart(kline);
      const technical = analyzeTechnical(kline && kline.points);
      state.technical = technical;
      updateTechnicalSection(technical);
      prefetchTimingPeriods(token, (p) => getKline(stock, quote, p));
      maybeRefreshEtfScore(token);
    })
    .catch(() => {
      if (token !== state.token) return;
      state.core.kline = null;
      state.coreSettled.add('kline');
      updateChart(null);
      state.technical = null;
      updateTechnicalSection(null);
      maybeRefreshEtfScore(token);
    });

  /* 行业研报 + 新闻：ETF 专属五维中的两维 */
  getEtfFundamentals(stock, quote)
    .then((result) => {
      if (token !== state.token) return;
      state.etf.fundamentals = result;
      renderEtfIndustrySection(result, stock);
      if (result.news) {
        state.core.news = result.news;
        state.coreSettled.add('news');
        renderNewsSection(result.news, stock.market);
      }
      renderEtfHeader(stock, quote, result);
      maybeRefreshEtfScore(token);
    })
    .catch(() => {
      if (token !== state.token) return;
      state.coreSettled.add('news');
      renderEtfIndustrySection(null, stock);
      maybeRefreshEtfScore(token);
    });
}

function maybeRefreshEtfScore(token) {
  if (token !== state.token) return;
  if (!state.quote || !state.stock) return;
  /* 等待技术(K线)与行业/舆情两路都结算后再算分，避免早算导致覆盖偏低 */
  if (!state.coreSettled.has('kline') || !state.coreSettled.has('news')) return;
  const board = state.etf.boardMeta;
  const score = computeEtfScore({
    quote: state.quote,
    kline: state.core.kline,
    technical: state.technical,
    fundamentals: state.etf.fundamentals,
    boardMeta: board,
  });
  state.etf.score = score;
  state.score = score;
  renderEtfOverview(score, state.core.kline);
}

/* ---------------- 加密研判编排（独立路由 #/coin） ---------------- */
async function analyzeCoin(inputStock, opts = {}) {
  const token = ++state.token;
  const stock = normalizeCoinStock(inputStock);
  state.route = 'analysis';
  state.stock = stock;
  state.quote = null;
  state.core = {};
  state.coreSettled = new Set();
  state.technical = null;
  state.score = null;
  state.reports = null;
  state.profile = null;
  state.profileReady = false;
  state.periodKlines = {};
  state.klinePeriod = 'day';
  state.crypto = { token, meta: null, derivatives: null, fng: null, tvl: null, btcKline: null, klineReady: false };
  renderCryptoSkeleton(stock);
  if (!opts.keepScroll) scrollTopSmooth();

  try {
    const quote = await getCryptoQuote(stock);
    if (token !== state.token) return;
    stock.name = quote.name || stock.name;
    state.stock = stock;
    state.quote = quote;
    addRecent(stock);
    renderCryptoHeader(stock, quote, null);
    document.title = `${quote.name} ${stock.code} · 加密研判 · 研值 StockLens`;
    bindCryptoData(token, stock, quote);
  } catch (err) {
    if (token !== state.token) return;
    renderFatal(stock, '加密行情获取失败：' + quoteErrorText(err));
    toast('加密行情获取失败：' + quoteErrorText(err), 'error');
  }
}

function bindCryptoData(token, stock, quote) {
  const symbol = stock.code;

  getCryptoMeta(symbol)
    .then((meta) => {
      if (token !== state.token) return;
      state.crypto.meta = meta;
      renderCryptoHeader(stock, quote, meta);
      /* 持仓量占市值依赖市值，市值晚到时要重绘合约面板 */
      if (state.crypto.derivatives) renderCryptoDerivatives(stock, state.crypto.derivatives, meta);
      maybeRefreshCryptoScore(token);
    })
    .catch(() => {
      if (token !== state.token) return;
      state.crypto.meta = null;
      maybeRefreshCryptoScore(token);
    });

  getCryptoKline(stock, 'day')
    .then((kline) => {
      if (token !== state.token) return;
      state.crypto.klineReady = true;
      state.periodKlines.day = kline;
      state.core.kline = kline;
      state.coreSettled.add('kline');
      updateChart(kline);
      const technical = analyzeTechnical(kline && kline.points);
      state.technical = technical;
      updateTechnicalSection(technical);
      prefetchTimingPeriods(token, (p) => getCryptoKline(stock, p));
      maybeRefreshCryptoScore(token);
    })
    .catch(() => {
      if (token !== state.token) return;
      state.crypto.klineReady = true;
      state.core.kline = null;
      state.coreSettled.add('kline');
      updateChart(null);
      state.technical = null;
      updateTechnicalSection(null);
      maybeRefreshCryptoScore(token);
    });

  getCryptoDerivatives(symbol)
    .then((derivatives) => {
      if (token !== state.token) return;
      state.crypto.derivatives = derivatives;
      renderCryptoDerivatives(stock, derivatives, state.crypto.meta);
      maybeRefreshCryptoScore(token);
    })
    .catch(() => {
      if (token !== state.token) return;
      state.crypto.derivatives = null;
      renderCryptoDerivatives(stock, null, state.crypto.meta);
      maybeRefreshCryptoScore(token);
    });

  Promise.all([
    getCryptoFearGreed().catch(() => null),
    getCryptoChainTvl(symbol).catch(() => null),
    getCryptoBtcKline().catch(() => null),
  ]).then(([fng, tvl, btcKline]) => {
    if (token !== state.token) return;
    state.crypto.fng = fng;
    state.crypto.tvl = tvl;
    state.crypto.btcKline = btcKline;
    renderCryptoOnchain(stock, fng, tvl);
    maybeRefreshCryptoScore(token);
  });

  getNews(stock)
    .then((news) => {
      if (token !== state.token) return;
      state.core.news = news;
      state.coreSettled.add('news');
      renderNewsSection(news, 'CRYPTO', {
        emptyDesc: '新闻接口未返回可展示的结果；加密情绪维度使用恐慌贪婪指数与主链数据，不受新闻缺失影响。',
      });
    })
    .catch(() => {
      if (token !== state.token) return;
      state.coreSettled.add('news');
      renderNewsSection([], 'CRYPTO', {
        emptyDesc: '新闻接口暂不可用；加密情绪维度使用恐慌贪婪指数与主链数据，不受新闻缺失影响。',
      });
    });
}

function maybeRefreshCryptoScore(token) {
  if (token !== state.token) return;
  if (!state.quote || !state.stock || !state.crypto || !state.crypto.klineReady) return;
  const c = state.crypto;
  const score = computeCryptoScore({
    quote: state.quote,
    kline: state.core.kline,
    btcKline: c.btcKline,
    meta: c.meta,
    derivatives: c.derivatives,
    fng: c.fng,
    chainTvl: c.tvl,
  });
  state.score = score;
  renderCryptoOverview(score);
}

/* ---------------- 大宗商品研判编排（独立路由 #/commodity） ---------------- */
async function analyzeCommodity(inputStock, opts = {}) {
  const token = ++state.token;
  const stock = normalizeStock(inputStock);
  state.route = 'analysis';
  state.stock = stock;
  state.quote = null;
  state.core = {};
  state.coreSettled = new Set();
  state.technical = null;
  state.score = null;
  state.reports = null; /* 商品没有研报目标价，清空避免沿用上一只股票锚点 */
  state.profile = null;
  state.profileReady = false;
  state.periodKlines = {};
  state.klinePeriod = 'day';
  state.commodity = { token };
  renderCommoditySkeleton(stock);
  if (!opts.keepScroll) scrollTopSmooth();

  try {
    const quote = await getCommodityQuote(stock);
    if (token !== state.token) return;
    stock.name = quote.name || stock.name;
    state.stock = stock;
    state.quote = quote;
    addRecent(stock);
    renderCommodityHeader(stock, quote);
    document.title = `${quote.name} · 大宗商品 · 研值 StockLens`;
    bindCommodityData(token, stock);
  } catch (err) {
    if (token !== state.token) return;
    renderFatal(stock, '商品行情获取失败：' + quoteErrorText(err));
    toast('商品行情获取失败：' + quoteErrorText(err), 'error');
  }
}

function bindCommodityData(token, stock) {
  getCommodityKline(stock, 'day')
    .then((kline) => {
      if (token !== state.token) return;
      state.periodKlines.day = kline;
      state.core.kline = kline;
      state.coreSettled.add('kline');
      updateChart(kline);
      const technical = analyzeTechnical(kline && kline.points);
      state.technical = technical;
      updateTechnicalSection(technical);
      prefetchTimingPeriods(token, (p) => getCommodityKline(stock, p));
    })
    .catch(() => {
      if (token !== state.token) return;
      state.core.kline = null;
      state.coreSettled.add('kline');
      updateChart(null);
      state.technical = null;
      updateTechnicalSection(null);
    });
}

/* ---------------- 自选股清单（FR-6） ---------------- */
const WATCHLIST_MAX = 20;

function watchlistGet() {
  const list = store.get('watchlist', []);
  return Array.isArray(list) ? list.filter((s) => s && s.market && s.code) : [];
}

function watchlistHas(stock) {
  return watchlistGet().some((s) => s.market === stock.market && s.code === stock.code);
}

function watchlistToggle(stock) {
  let list = watchlistGet();
  if (watchlistHas(stock)) {
    list = list.filter((s) => !(s.market === stock.market && s.code === stock.code));
    store.set('watchlist', list);
    toast('已从自选中移除', 'info');
    return false;
  }
  if (list.length >= WATCHLIST_MAX) {
    toast(`自选已达 ${WATCHLIST_MAX} 只上限，请先移除部分`, 'error');
    return true;
  }
  list.unshift({
    market: stock.market,
    code: stock.code,
    name: stock.name,
    quoteKey: stock.quoteKey,
    klineCode: stock.klineCode,
    rawCode: stock.rawCode,
    t: Date.now(),
  });
  store.set('watchlist', list);
  toast('已加入自选', 'ok');
  return true;
}

function watchlistRemove(market, code) {
  store.set(
    'watchlist',
    watchlistGet().filter((s) => !(s.market === market && s.code === code))
  );
}

function updateWatchButton() {
  const btn = document.querySelector('[data-action="watch-toggle"]');
  if (!btn || !state.stock) return;
  const on = watchlistHas(state.stock);
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.innerHTML = `${ico('star', 'sm')}${on ? '已自选' : '加自选'}`;
}

/* ---------------- K 线周期切换（FR-3.2 / FR-3.6） ---------------- */
function switchKlinePeriod(period) {
  const p = normalizeKlinePeriod(period);
  if (!state.stock || p === state.klinePeriod) return;
  state.klinePeriod = p;
  const token = state.token;
  const cachedKline = state.periodKlines[p];
  if (cachedKline) {
    updateChart(cachedKline);
    return;
  }
  const dayK = state.periodKlines.day || state.core.kline;
  updateChart(null, true);
  getKline(state.stock, state.quote, p)
    .then((kline) => {
      if (token !== state.token) return;
      state.periodKlines[p] = kline;
      updateChart(kline);
      /* 手动切换补齐的周/月数据同样参与择时共振：重绘状态卡 */
      if (state.technical) updateTechnicalSection(state.technical);
    })
    .catch(() => {
      /* FR-3.6：周/月获取失败降级回日K */
      if (token !== state.token) return;
      toast(`${KLINE_PERIOD_META[p] || 'K 线'}数据获取失败，已切回日K`, 'error');
      state.klinePeriod = 'day';
      if (dayK) updateChart(dayK);
      else updateChart(null);
    });
}

function maybeStartIndustry() {
  if (!state.coreSettled.has('reports')) return;
  if (!state.profileReady) return;
  if (state.industryStarted) return;
  state.industryStarted = true;
  loadIndustryAndPeers(state.token);
}

async function resolveIndustryCode(industryName, reports) {
  if (reports && reports.industryCode) {
    return { code: String(reports.industryCode), name: reports.industryName || industryName, reference: false };
  }
  const hit = findIndustryCode(industryName);
  if (hit) return hit;
  if (state.stock && state.stock.market === 'A') {
    try {
      const boards = await getIndustryBoards();
      const target = normIndustry(industryName);
      const board =
        boards.find((b) => b.name === industryName) ||
        boards.find((b) => normIndustry(b.name) === target) ||
        boards.find((b) => sameIndustry(b.name, industryName));
      if (board) return { code: board.code, name: board.name, reference: false };
    } catch (e) {}
  }
  return null;
}

async function loadIndustryAndPeers(token) {
  if (token !== state.token) return;
  const stock = state.stock;
  const industryName =
    (state.profile && state.profile.industryName) ||
    (state.reports && state.reports.industryName) ||
    '';
  state.industryName = industryName;
  const indBody = $('#industryBody');
  const peersBody = $('#peersBody');
  if (indBody) indBody.innerHTML = loadingCard('正在检索行业研报…', 3);
  if (peersBody) peersBody.innerHTML = loadingCard('正在获取行业成分股与同行数据…', 4);

  if (!industryName) {
    if (indBody) {
      indBody.innerHTML = emptyState({
        icon: 'building',
        title: '未能识别所属行业',
        desc: '公司资料接口未返回行业字段，无法匹配行业研报与同业列表。个股研报、行情与新闻仍可查看。',
      });
    }
    if (peersBody) {
      peersBody.innerHTML = emptyState({
        icon: 'users',
        title: '暂无同业对照',
        desc: '行业字段缺失，无法确定可比公司。你仍可以通过搜索查看其他股票。',
      });
    }
    updateStatus('peers', 'error', '同业 行业未知');
    return;
  }

  let codeInfo = null;
  try {
    codeInfo = await resolveIndustryCode(industryName, state.reports);
  } catch (e) {}
  if (token !== state.token) return;

  if (codeInfo) {
    getIndustryReports(codeInfo.code, codeInfo.name)
      .then((data) => {
        if (token !== state.token) return;
        renderIndustrySection(data, stock.market, industryName, codeInfo.reference ? codeInfo.name : '');
      })
      .catch((err) => {
        if (token !== state.token) return;
        if (indBody) {
          indBody.innerHTML = errorBox(
            '行业研报获取失败',
            err && err.message ? err.message : '行业研报接口未响应，请稍后重试。',
            'industry'
          );
        }
      });
  } else {
    const body = $('#industryBody');
    if (body) {
      body.innerHTML = emptyState({
        icon: 'layers',
        title: '未找到匹配的行业研报分类',
        desc: `已识别行业「${industryName}」，但免费研报接口中未找到同名或近似的 A 股行业分类，因此无法展示行业研报。`,
        links: [{ label: '东方财富研报中心', url: 'https://data.eastmoney.com/report/' }],
      });
    }
  }

  state.industryCode = codeInfo ? codeInfo.code : '';
  getPeers(stock, industryName, { industryCode: codeInfo ? codeInfo.code : '' })
    .then((peers) => {
      if (token !== state.token) return;
      state.peers = peers;
      renderPeersSection(peers, stock.market);
      loadPeerReports(token, peers);
    })
    .catch((err) => {
      if (token !== state.token) return;
      const body = $('#peersBody');
      if (body) {
        body.innerHTML = errorBox(
          '同业数据暂不可用',
          err && err.message
            ? err.message
            : '行业板块接口未响应。该接口可能对当前网络限流，请稍后重试。',
          'peers'
        );
      }
      updateStatus('peers', 'error', '同业 获取失败');
    });
}

function loadPeersOnly(token) {
  const stock = state.stock;
  const industryName = state.industryName;
  const body = $('#peersBody');
  if (!industryName) return;
  if (body) body.innerHTML = loadingCard('正在重新获取行业成分股与同行数据…', 4);
  getPeers(stock, industryName, { industryCode: state.industryCode || '' })
    .then((peers) => {
      if (token !== state.token) return;
      state.peers = peers;
      renderPeersSection(peers, stock.market);
      loadPeerReports(token, peers);
    })
    .catch((err) => {
      if (token !== state.token) return;
      if (body) {
        body.innerHTML = errorBox('同业数据暂不可用', err && err.message ? err.message : '行业板块接口未响应。', 'peers');
      }
      updateStatus('peers', 'error', '同业 获取失败');
    });
}

function loadPeerReports(token, peers) {
  const all = [...(peers.cap || []), ...(peers.profit || [])];
  if (!all.length) return;
  const seen = new Set();
  all.forEach((peer) => {
    if (peer.market !== 'A') {
      updatePeerReports(peer, []);
      return;
    }
    const key = peerKey(peer);
    if (seen.has(key)) return;
    seen.add(key);
    getPeerReports(peer)
      .then((reports) => {
        if (token !== state.token) return;
        updatePeerReports(peer, reports);
      })
      .catch(() => {
        if (token !== state.token) return;
        updatePeerReports(peer, []);
      });
  });
}

/* ---------------- retries ---------------- */
function retrySection(key) {
  const token = state.token;
  const stock = state.stock;
  if (!stock) return;
  if (key === 'reports') {
    const body = $('#reportsBody');
    if (body) body.innerHTML = loadingCard('正在重新检索个股研报…', 4);
    getStockReports(stock)
      .then((data) => {
        if (token !== state.token) return;
        state.reports = data;
        markCoreSettled('reports', data);
        renderStockReports(data, stock.market);
      })
      .catch((err) => {
        if (token !== state.token) return;
        if (body) body.innerHTML = errorBox('研报接口暂不可用', err && err.message ? err.message : '请稍后重试。', 'reports');
      });
  } else if (key === 'financial') {
    const body = $('#financialBody');
    if (body) body.innerHTML = loadingCard('正在重新获取财务指标…', 3);
    getFinancials(stock)
      .then((data) => {
        if (token !== state.token) return;
        markCoreSettled('financials', data);
        renderFinancialSection(data, stock.market);
      })
      .catch((err) => {
        if (token !== state.token) return;
        if (body) body.innerHTML = errorBox('财务数据获取失败', err && err.message ? err.message : '请稍后重试。', 'financial');
      });
  } else if (key === 'industry') {
    if (state.industryStarted) {
      const body = $('#industryBody');
      if (body) body.innerHTML = loadingCard('正在重新检索行业研报…', 3);
      resolveIndustryCode(state.industryName, state.reports)
        .then((info) => {
          if (token !== state.token) return;
          if (!info) throw new Error('未找到匹配的行业研报分类');
          return getIndustryReports(info.code, info.name);
        })
        .then((data) => {
          if (token !== state.token) return;
          renderIndustrySection(data, stock.market, state.industryName, '');
        })
        .catch((err) => {
          if (token !== state.token) return;
          const body = $('#industryBody');
          if (body) body.innerHTML = errorBox('行业研报获取失败', err && err.message ? err.message : '请稍后重试。', 'industry');
        });
    } else {
      state.industryStarted = true;
      loadIndustryAndPeers(token);
    }
  } else if (key === 'peers') {
    loadPeersOnly(token);
  }
}

/* ---------------- search ---------------- */
let searchTimer = null;

function filterSearchResults(items) {
  return items || [];
}

function handleSearchInput(input) {
  const q = input.value.trim();
  state.search.query = q;
  state.search.active = -1;
  state.search.seq += 1;
  const seq = state.search.seq;
  clearTimeout(searchTimer);
  const box = $('#suggestions');
  if (!q) {
    state.search.items = [];
    renderSuggestions([], '');
    return;
  }
  searchTimer = setTimeout(async () => {
    if (box) box.innerHTML = '<div class="sug-hint"><span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span><span>正在搜索…</span></div>';
    try {
      const items = filterSearchResults(await searchStocks(q));
      if (seq !== state.search.seq) return;
      const current = $('#stockSearch');
      if (!current || current.value.trim() !== q) return;
      state.search.items = items;
      state.search.active = -1;
      renderSuggestions(items, q);
    } catch (e) {
      if (seq !== state.search.seq) return;
      if (box) {
        box.innerHTML = `<div class="sug-empty">搜索服务暂不可用，可直接输入股票代码，如 <span class="mono">600519</span> / <span class="mono">00700</span> / <span class="mono">NVDA</span></div>`;
      }
    }
  }, 260);
}

function handleSearchKeydown(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!state.search.items.length) return;
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    const len = state.search.items.length;
    state.search.active = (state.search.active + dir + len) % len;
    $$('.sug-item').forEach((el) => {
      const active = Number(el.dataset.sugIndex) === state.search.active;
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  } else if (e.key === 'Escape') {
    closeSuggestions();
  } else if (e.key === 'Enter' && state.search.active >= 0) {
    const item = state.search.items[state.search.active];
    if (item) {
      e.preventDefault();
      goStock(item);
    }
  }
}

async function submitSearch(raw) {
  const q = String(raw || '').trim();
  if (!q) {
    focusSearch();
    return;
  }
  let stock = state.search.active >= 0 ? state.search.items[state.search.active] : null;
  if (!stock) stock = parseSymbolInput(q);
  if (!stock) {
    const box = $('#suggestions');
    if (box) box.innerHTML = '<div class="sug-hint"><span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span><span>正在搜索…</span></div>';
    try {
      const items = await searchStocks(q);
      if (items && items.length) stock = items[0];
      state.search.items = items || [];
    } catch (e) {}
  }
  if (!stock) {
    toast('未找到匹配的股票，请尝试名称或代码', 'error');
    const box = $('#suggestions');
    if (box) box.innerHTML = '<div class="sug-empty">未找到匹配的股票，请尝试完整代码或换个关键词。</div>';
    return;
  }
  /* 4–5 位纯数字会被解析为港股代码，提示一次避免 A 股用户误入 */
  if (stock.market === 'HK' && /^\d{1,5}$/.test(q)) {
    toast(`已按港股代码 ${stock.code} 解析；若想查 A 股请输入完整 6 位代码`, 'info');
  }
  goStock(stock);
}

function focusSearch() {
  const doFocus = () => {
    const input = $('#stockSearch');
    if (input) {
      input.focus();
      try {
        input.select();
      } catch (e) {}
    }
  };
  if (state.route === 'home' && $('#stockSearch')) {
    doFocus();
  } else {
    goHome();
    setTimeout(doFocus, 80);
  }
}

/* ---------------- interactions ---------------- */
function closeSearchIfOutside(target) {
  if (!target.closest('.search-shell') && !target.closest('#topSearchTrigger')) {
    closeSuggestions();
  }
}

function copyCurrentLink() {
  const url = location.href;
  const done = () => toast('链接已复制，可直接分享', 'ok');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
  } else {
    fallbackCopy(url, done);
  }
}
function fallbackCopy(text, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch (e) {
    toast('复制失败，请手动复制地址栏链接', 'error');
  }
}

function clearDataCache() {
  memCache.clear();
  inflight.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sl:c:')) localStorage.removeItem(key);
    }
  } catch (e) {}
}

function refreshCurrent() {
  if (state.route !== 'analysis' || !state.stock) {
    location.reload();
    return;
  }
  clearDataCache();
  analyzeStock(state.stock, { keepScroll: true });
  toast('已清除数据缓存，正在重新拉取', 'info');
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $$('.section-nav a').forEach((a) => a.classList.toggle('active', a.dataset.scroll === id));
}

function handleClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'home') {
      e.preventDefault();
      goHome();
      return;
    }
    if (action === 'board-refresh') {
      e.preventDefault();
      refreshHomeBoard(actionEl.dataset.board);
      return;
    }
    if (action === 'search-focus') {
      e.preventDefault();
      focusSearch();
      return;
    }
    if (action === 'toggle-theme') {
      e.preventDefault();
      toggleTheme();
      return;
    }
    if (action === 'print') {
      e.preventDefault();
      window.print();
      return;
    }
    if (action === 'copy-link') {
      e.preventDefault();
      copyCurrentLink();
      return;
    }
    if (action === 'refresh') {
      e.preventDefault();
      refreshCurrent();
      return;
    }
    if (action === 'kline-period') {
      e.preventDefault();
      switchKlinePeriod(actionEl.dataset.period);
      return;
    }
    if (action === 'kline-sub') {
      e.preventDefault();
      state.subChart = normalizeSubMode(actionEl.dataset.sub);
      const k = state.periodKlines[state.klinePeriod] || state.core.kline;
      if (k) updateChart(k);
      return;
    }
    if (action === 'kline-boll') {
      e.preventDefault();
      state.bollOn = !state.bollOn;
      const k = state.periodKlines[state.klinePeriod] || state.core.kline;
      if (k) updateChart(k);
      return;
    }
    if (action === 'kline-zoom') {
      e.preventDefault();
      candleZoomBy(actionEl.dataset.dir);
      return;
    }
    if (action === 'kline-reset') {
      e.preventDefault();
      candleResetCurrent();
      return;
    }
    if (action === 'watch-toggle') {
      e.preventDefault();
      if (state.stock) {
        watchlistToggle(state.stock);
        updateWatchButton();
      }
      return;
    }
    if (action === 'watch-remove') {
      e.preventDefault();
      watchlistRemove(actionEl.dataset.market, actionEl.dataset.code);
      toast('已从自选中移除', 'info');
      if (state.route === 'home') renderHome();
      return;
    }
    if (action === 'demo') {
      e.preventDefault();
      goStock(HOT_STOCKS[0]);
      return;
    }
    if (action === 'timing-workbench') {
      e.preventDefault();
      goTimingWorkbench();
      return;
    }
    if (action === 'timing-workbench-run') {
      e.preventDefault();
      startTimingWorkbench();
      return;
    }
    if (action === 'timing-workbench-stop') {
      e.preventDefault();
      stopTimingWorkbench();
      return;
    }
    if (action === 'screener') {
      e.preventDefault();
      goScreener();
      return;
    }
    if (action === 'screener-run') {
      e.preventDefault();
      startScreener();
      return;
    }
    if (action === 'screener-stop') {
      e.preventDefault();
      stopScreener();
      return;
    }
    if (action === 'screener-open') {
      e.preventDefault();
      const stockEl = actionEl.closest('[data-market][data-code]');
      if (stockEl) goStock(stockFromDataset(stockEl.dataset));
      return;
    }
    if (action === 'etf-screener') {
      e.preventDefault();
      goEtfScreener();
      return;
    }
    if (action === 'etf-screener-run') {
      e.preventDefault();
      startEtfScreener();
      return;
    }
    if (action === 'etf-screener-stop') {
      e.preventDefault();
      stopEtfScreener();
      return;
    }
    if (action === 'etf-screener-open') {
      e.preventDefault();
      const stockEl = actionEl.closest('[data-market][data-code]');
      if (stockEl) goEtf(stockFromDataset(stockEl.dataset));
      return;
    }
  }

  const sug = e.target.closest('[data-sug-index]');
  if (sug) {
    e.preventDefault();
    const index = Number(sug.dataset.sugIndex);
    const item = state.search.items[index] || stockFromDataset(sug.dataset);
    if (item) goStock(item);
    return;
  }

  const scrollEl = e.target.closest('[data-scroll]');
  if (scrollEl) {
    e.preventDefault();
    scrollToSection(scrollEl.dataset.scroll);
    return;
  }

  const retryEl = e.target.closest('[data-retry]');
  if (retryEl) {
    e.preventDefault();
    retrySection(retryEl.dataset.retry);
    return;
  }

  const stockEl = e.target.closest('[data-market][data-code]');
  if (stockEl) {
    e.preventDefault();
    goStock(stockFromDataset(stockEl.dataset));
    return;
  }

  closeSearchIfOutside(e.target);
}

function initEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'stockSearch') handleSearchInput(e.target);
    if (e.target && e.target.matches('[data-filter-target]')) updateFilter(e.target);
    if (e.target && e.target.id === 'screenerThreshold') updateScreenerThreshold(e.target.value);
    if (e.target && e.target.id === 'etfScreenerThreshold') updateEtfScreenerThreshold(e.target.value);
  });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'screenerSize') {
      state.screener.size = Number(e.target.value) || SCREENER_DEFAULT_SIZE;
      if (state.screener.running) stopScreener();
      toast(`候选池已切换，请点击「开始扫描」重新获取`, 'info');
    }
    if (e.target && e.target.id === 'etfScreenerSize') {
      state.etfScreener.size = Number(e.target.value) || ETF_SCREENER_DEFAULT_SIZE;
      if (state.etfScreener.running) stopEtfScreener();
      toast(`候选池已切换，请点击「开始扫描」重新获取`, 'info');
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      focusSearch();
      return;
    }
    if (e.target && e.target.id === 'stockSearch') handleSearchKeydown(e);
  });
  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'searchForm') {
      e.preventDefault();
      const input = $('#stockSearch');
      submitSearch(input ? input.value : '');
    }
  });
  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('scroll', () => {
    const bar = $('#topbar');
    if (bar) bar.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive: true });
}

function init() {
  hydrateIcons(document);
  syncThemeButton();
  initEvents();
  if ((location.hash || '').startsWith('#/timing')) {
    enterTimingWorkbench();
    return;
  }
  if ((location.hash || '').startsWith('#/etf-screener')) {
    enterEtfScreener();
    return;
  }
  if ((location.hash || '').startsWith('#/screener')) {
    enterScreener();
    return;
  }
  const route = stockFromHash();
  if (route) analyzeStock(route);
  else {
    state.route = 'home';
    syncTopbar('home');
    renderHome();
  }
}

init();
