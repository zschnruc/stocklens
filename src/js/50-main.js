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
  reports: null,
  peers: null,
  industryName: '',
  industryStarted: false,
  pendingStock: null,
  klinePeriod: 'day',
  periodKlines: {},
  subChart: 'volume',
  bollOn: false,
  search: { items: [], active: -1, query: '', seq: 0 },
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

  if (market === 'A') {
    code = code.replace(/\D/g, '').slice(0, 6);
    rawCode = code;
    if (!quoteKey) {
      const prefix = /^(6|9)/.test(code) ? 'sh' : /^(4|8)/.test(code) ? 'bj' : 'sz';
      quoteKey = prefix + code;
    }
    if (!klineCode) klineCode = quoteKey;
  } else if (market === 'HK') {
    code = code.replace(/\D/g, '').padStart(5, '0').slice(-5);
    rawCode = code;
    if (!quoteKey) quoteKey = 'hk' + code;
    if (!klineCode) klineCode = 'hk' + code;
  } else {
    rawCode = rawCode.toUpperCase();
    code = rawCode.replace(/\.(OQ|N|PS|A|AMEX|NYSE)$/i, '').replace(/^US/i, '');
    if (!quoteKey) quoteKey = 'us' + code;
    if (!klineCode) klineCode = 'us' + rawCode;
    name = s.name || code;
  }
  return { market, code, name, quoteKey, klineCode, rawCode };
}

function stockFromDataset(ds) {
  return normalizeStock({
    market: ds.market,
    code: ds.code,
    name: ds.name,
    quoteKey: ds.quotekey,
    klineCode: ds.klinecode,
    rawCode: ds.rawcode,
  });
}

function hashForStock(stock) {
  const raw = stock.market === 'US' ? stock.rawCode || stock.code : stock.code;
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
  const m = hash.match(/^#\/stock\/(A|HK|US)\/([^/?#]+)/i);
  if (!m) return null;
  const market = m[1].toUpperCase();
  const raw = decodeURIComponent(m[2]);
  if (market === 'A') {
    const code = raw.replace(/\D/g, '');
    if (code.length !== 6) return null;
    const known = lookupKnownStock('A', code);
    if (known) return known;
    const prefix = /^(6|9)/.test(code) ? 'sh' : /^(4|8)/.test(code) ? 'bj' : 'sz';
    return normalizeStock({ market: 'A', code, name: code, quoteKey: prefix + code, klineCode: prefix + code });
  }
  if (market === 'HK') {
    const code = raw.replace(/\D/g, '').padStart(5, '0').slice(-5);
    const known = lookupKnownStock('HK', code);
    if (known) return known;
    return normalizeStock({ market: 'HK', code, name: code });
  }
  const upper = raw.toUpperCase();
  const code = upper.replace(/\.(OQ|N|PS|A|AMEX|NYSE)$/i, '');
  const known = lookupKnownStock('US', code);
  if (known) return { ...known, rawCode: upper, klineCode: 'us' + upper };
  return normalizeStock({ market: 'US', code, rawCode: upper, name: code });
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
  if (topSearch) topSearch.hidden = route !== 'analysis';
  if (printBtn) printBtn.hidden = route !== 'analysis';
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
  /* v1.3：klinecharts 画布配色在挂载时读取 CSS 变量，主题切换后需重挂载刷新 */
  if (document.body.dataset.route === 'analysis' && typeof remountCharts === 'function') {
    try {
      remountCharts();
    } catch (e) {}
  }
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
  const stock = stockFromHash();
  if (!stock) {
    if ((location.hash || '').startsWith('#/stock/')) {
      toast('链接中的股票代码无效，已返回首页', 'error');
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

/* ---------------- analysis orchestration ---------------- */
async function analyzeStock(inputStock, opts = {}) {
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
  renderAnalysisSkeleton(stock);
  if (!opts.keepScroll) scrollTopSmooth();

  try {
    const quote = await getQuote(stock);
    if (token !== state.token) return;
    stock.name = quote.name || stock.name;
    stock.rawCode = quote.rawCode || stock.rawCode;
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

function bindCoreData(token, quote) {
  const stock = state.stock;

  getKline(stock, quote)
    .then((kline) => {
      if (token !== state.token) return;
      state.periodKlines.day = kline;
      markCoreSettled('kline', kline);
      updateChart(kline);
    })
    .catch(() => {
      if (token !== state.token) return;
      markCoreSettled('kline', null);
      updateChart(null);
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
  renderOverview(score, state.core.kline);
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
    })
    .catch(() => {
      /* FR-3.6：周/月获取失败降级回日K */
      if (token !== state.token) return;
      toast(`${p === 'week' ? '周' : '月'}K 数据获取失败，已切回日K`, 'error');
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
  const route = stockFromHash();
  if (route) analyzeStock(route);
  else {
    state.route = 'home';
    syncTopbar('home');
    renderHome();
  }
}

init();
