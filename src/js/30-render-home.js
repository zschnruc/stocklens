/* ============================================================
   Home / landing renderer
   ============================================================ */
'use strict';

const HOT_STOCKS = [
  { market: 'A', code: '600519', name: '贵州茅台', quoteKey: 'sh600519', klineCode: 'sh600519', rawCode: '600519' },
  { market: 'A', code: '300750', name: '宁德时代', quoteKey: 'sz300750', klineCode: 'sz300750', rawCode: '300750' },
  { market: 'HK', code: '00700', name: '腾讯控股', quoteKey: 'hk00700', klineCode: 'hk00700', rawCode: '00700' },
  { market: 'HK', code: '01810', name: '小米集团-W', quoteKey: 'hk01810', klineCode: 'hk01810', rawCode: '01810' },
  {
    market: 'US',
    code: 'NVDA',
    name: '英伟达',
    quoteKey: 'usNVDA',
    klineCode: 'usNVDA.OQ',
    rawCode: 'NVDA.OQ',
  },
  {
    market: 'US',
    code: 'AAPL',
    name: '苹果',
    quoteKey: 'usAAPL',
    klineCode: 'usAAPL.OQ',
    rawCode: 'AAPL.OQ',
  },
];

const FEATURES = [
  {
    icon: 'book',
    title: '研报聚合',
    desc: '抓取近半年个股与行业研报，给出机构评级、目标价与盈利预测，最多展示最新 20 篇。',
    tags: ['个股研报', '行业研报', 'PDF 原文'],
  },
  {
    icon: 'target',
    title: '四维研判',
    desc: '把研报、盈利成长、技术动量与新闻舆情拆成四个可解释维度，缺失数据不臆造、不计分。',
    tags: ['研报评级', '盈利成长', '技术动量', '新闻舆情'],
  },
  {
    icon: 'users',
    title: '同业对照',
    desc: '自动识别所属行业，列出行业市值前三与利润前三，并附上同行最新研报，避免只看单一标的。',
    tags: ['市值榜', '利润榜', '同行研报'],
  },
  {
    icon: 'pulse',
    title: '行情与舆情',
    desc: '近一年前复权走势、均线趋势、区间涨跌与回撤，叠加公开新闻的正负面关键词情绪分布。',
    tags: ['前复权 K 线', '技术指标', '新闻情绪'],
  },
];

function stockDataset(stock) {
  return [
    `data-market="${esc(stock.market)}"`,
    `data-code="${esc(stock.code)}"`,
    `data-name="${esc(stock.name)}"`,
    `data-quotekey="${esc(stock.quoteKey || '')}"`,
    `data-klinecode="${esc(stock.klineCode || '')}"`,
    `data-rawcode="${esc(stock.rawCode || '')}"`,
    `data-kind="${esc(stock.kind || 'stock')}"`,
  ].join(' ');
}

function stockButton(stock, cls, extra = '') {
  return `<button type="button" class="${cls}" ${stockDataset(stock)} ${extra}>${esc(stock.name)}<span class="hot-chg" data-chg="${esc(
    stock.quoteKey || ''
  )}">—</span></button>`;
}

function recentStocks() {
  const list = store.get('recent', []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s && s.market && s.code && s.name)
    .slice(0, 5)
    .map((s) => ({
      market: s.market,
      code: s.code,
      name: s.name,
      quoteKey: s.quoteKey || '',
      klineCode: s.klineCode || '',
      rawCode: s.rawCode || '',
    }));
}

function watchRowHTML() {
  const list = watchlistGet();
  if (!list.length) return '';
  return `<div class="watch-row" id="watchRow">
    <span class="hot-label">自选</span>
    ${list
      .map(
        (s) => `<div class="watch-item">
      <button type="button" class="hot-chip watch-chip" ${stockDataset(s)}>${esc(s.name)}<span class="watch-quote" data-wq="${esc(
          s.quoteKey || ''
        )}"><span class="skeleton" style="width:64px;height:10px"></span></span></button>
      <button type="button" class="watch-remove" data-action="watch-remove" data-market="${esc(s.market)}" data-code="${esc(
          s.code
        )}" aria-label="移除 ${esc(s.name)}">${ico('x', 'sm')}</button>
    </div>`
      )
      .join('')}
  </div>`;
}

function homeHTML() {
  const recent = recentStocks();
  const featureCards = FEATURES.map(
    (f, i) => `
    <article class="card feature-card">
      <span class="feature-num">0${i + 1}</span>
      <div class="feature-icon">${ico(f.icon, 'lg')}</div>
      <h3>${f.title}</h3>
      <p>${f.desc}</p>
      <div class="feature-tags">${f.tags.map((t) => `<span>${t}</span>`).join('')}</div>
    </article>`
  ).join('');

  return `
  <section class="home">
    <div class="hero">
      <span class="eyebrow"><i class="dot"></i>公开数据 · 实时行情 · 可解释评分</span>
      <h1>读懂研报，<br><span>把判断交给证据。</span></h1>
      <p class="lede">输入 A 股、港股或美股，聚合近半年个股与行业研报、同行龙头、财务与舆情，用四维打分形成一张可追溯的研究底稿。</p>

      <div class="search-shell">
        <form class="search-box" id="searchForm" autocomplete="off">
          ${ico('search')}
          <input id="stockSearch" type="text" placeholder="输入股票名称、代码或拼音，如 贵州茅台 / 600519 / 00700 / NVDA"
            aria-label="搜索股票" spellcheck="false">
          <button class="search-submit" type="submit" aria-label="开始分析">
            <span>开始分析</span>${ico('arrow')}
          </button>
        </form>
        <div class="suggestions" id="suggestions" role="listbox" aria-label="股票搜索结果"></div>
      </div>

      <div class="hot-row" id="hotRow">
        <span class="hot-label">热门</span>
        ${HOT_STOCKS.map((s) => stockButton(s, 'hot-chip')).join('')}
      </div>
      ${
        recent.length
          ? `<div class="hot-row recent-row" id="recentRow">
              <span class="hot-label">最近查看</span>
              ${recent.map((s) => stockButton(s, 'hot-chip recent-chip')).join('')}
            </div>`
          : ''
      }
      ${watchRowHTML()}
      <div class="home-cta-row">
        <button class="btn primary" type="button" data-action="screener">${ico('filter', 'sm')}查看 80 分以上高分榜</button>
        <button class="btn primary etf-cta" type="button" data-action="etf-screener">${ico('layers', 'sm')}查看 80 分以上 ETF 榜</button>
        <button class="demo-link" type="button" data-action="demo">${ico('spark', 'sm')}没有目标？先看一份示例研判</button>
      </div>

      <div class="hero-stats">
        <div class="hero-stat"><strong>3 地市场</strong><span>A 股 · 港股 · 美股</span></div>
        <div class="hero-stat"><strong>4 个维度</strong><span>研报 · 盈利 · 技术 · 舆情</span></div>
        <div class="hero-stat"><strong>20 篇</strong><span>近半年最新个股研报</span></div>
      </div>
    </div>

    <section class="home-boards" aria-labelledby="boardsTitle">
      <div class="boards-head">
        <div class="section-kicker">市场动向</div>
        <h2 id="boardsTitle">当下热门 · 资金流向</h2>
        <p>点击任意一只，进入完整四维研判。榜单随行情刷新，数据来自公开接口。</p>
      </div>
      <div class="boards-grid">
        <article class="card board-card" id="hotBoardCard">
          <div class="board-card-head">
            <span class="board-ico">${ico('pulse', 'lg')}</span>
            <div>
              <h3>成交热门 TOP 10</h3>
              <span>沪深 A 股 · 按当日成交额</span>
            </div>
          </div>
          <div class="board-list" id="hotBoardBody">${loadingCard('正在获取热门榜…', 4)}</div>
        </article>
        <article class="card board-card" id="inflowBoardCard">
          <div class="board-card-head">
            <span class="board-ico inflow">${ico('trendUp', 'lg')}</span>
            <div>
              <h3>主力净流入 TOP 10</h3>
              <span>沪深 A 股 · 按当日主力资金净额</span>
            </div>
          </div>
          <div class="board-list" id="inflowBoardBody">${loadingCard('正在获取资金流向…', 4)}</div>
        </article>
      </div>
    </section>

    <section class="home-boards etf-board" aria-labelledby="etfBoardTitle">
      <div class="boards-head">
        <div class="section-kicker">行业 ETF</div>
        <h2 id="etfBoardTitle">热门行业 ETF TOP 10</h2>
        <p>按当日成交额排序的场内基金。点击进入 ETF 专属研判：技术 / 规模流动性 / 行业景气 / 量能 / 舆情五维评分。</p>
      </div>
      <div class="boards-grid">
        <article class="card board-card" id="etfBoardCard">
          <div class="board-card-head">
            <span class="board-ico etf">${ico('layers', 'lg')}</span>
            <div>
              <h3>行业 ETF 热门榜</h3>
              <span>沪深场内基金 · 按当日成交额 · 含规模</span>
            </div>
          </div>
          <div class="board-list" id="etfBoardBody">${loadingCard('正在获取行业 ETF 榜…', 4)}</div>
        </article>
      </div>
    </section>

    <section class="features" aria-labelledby="featureTitle">
      <div class="features-head">
        <div>
          <div class="section-kicker">研究框架</div>
          <h2 id="featureTitle">一张页面，四层证据</h2>
        </div>
        <p>不堆指标，只呈现能解释结论的证据。每项评分都能在页面上找到对应原文、财务数字或行情区间。</p>
      </div>
      <div class="feature-grid">${featureCards}</div>
    </section>

    <section class="card coverage" aria-labelledby="coverageTitle">
      <div>
        <div class="section-kicker">数据边界</div>
        <h3 id="coverageTitle">覆盖范围与降级说明</h3>
        <p>东方财富免费研报接口目前只覆盖 A 股。港美股保留行情、K 线、新闻舆情、技术与估值打分、市值与利润同行榜；拿不到的数据会明确标注，不会用猜测补齐。</p>
        <div class="coverage-foot">所有数据来自公开接口，可能存在延迟、限流或字段缺失。评分仅用于研究整理，不构成任何投资建议。</div>
      </div>
      <div class="coverage-list">
        <div class="coverage-row">${ico('check', 'sm')}<span><strong>A 股 · 全功能</strong>：行情 / K 线 / 个股与行业研报 / 财务成长 / 同业双榜 / 新闻舆情。</span></div>
        <div class="coverage-row warn">${ico('info', 'sm')}<span><strong>港股 · 简版</strong>：行情 / K 线 / 财务指标 / 同业标签 / 新闻舆情；研报区显示暂无免费中文源。</span></div>
        <div class="coverage-row warn">${ico('info', 'sm')}<span><strong>美股 · 简版</strong>：行情 / K 线 / 同业标签 / 新闻舆情；盈利成长与中文研报暂缺，评分按可用维度折算。</span></div>
        <div class="coverage-row">${ico('shield', 'sm')}<span><strong>可解释性</strong>：每个维度展示得分、权重、数据覆盖与理由；数据不足时直接标注「不可用」。</span></div>
      </div>
    </section>
  </section>`;
}

function renderHome() {
  setViewHTML(homeHTML());
  document.title = '研值 StockLens · 股票研报与研判';
  syncTopbar('home');
  loadHotQuotes();
  loadWatchQuotes();
  loadHomeBoards();
  loadEtfBoard();
}

/* ---------------- 首页双榜单（FR-9） ---------------- */
function boardRowHTML(stock, index, metric) {
  const chgCls = pctClass(stock.changePct);
  const metricCls = metric === 'inflow' ? pctClass(stock.netInflow) : '';
  const metricText =
    metric === 'inflow'
      ? fmtBig(stock.netInflow != null ? stock.netInflow / 1e8 : null, '亿')
      : fmtBig(stock.amount != null ? stock.amount / 1e8 : null, '亿');
  return `
    <button type="button" class="board-row" ${stockDataset(stock)} ${extraBoardAttrs(stock)}>
      <span class="br-rank ${index < 3 ? 'top' : ''}">${index + 1}</span>
      <span class="br-name">
        <b>${esc(stock.name)}</b>
        <small>${esc(stock.code)}</small>
      </span>
      <span class="br-quote">
        <b>${fmtPrice(stock.price)}</b>
        <small class="${chgCls}">${fmtPct(stock.changePct)}</small>
      </span>
      <span class="br-metric ${metricCls}">${esc(metricText)}</span>
    </button>`;
}

/* 榜单行携带指标，进入研判后 header 可展示（沿用既有 dataset，不新增请求） */
function extraBoardAttrs(stock) {
  return [
    `data-amount="${stock.amount != null ? Number(stock.amount) : ''}"`,
    `data-netinflow="${stock.netInflow != null ? Number(stock.netInflow) : ''}"`,
  ].join(' ');
}

function boardEmptyHTML(kind) {
  const text = kind === 'inflow' ? '资金流向数据暂不可用，稍后刷新重试' : kind === 'etf' ? '行业 ETF 榜单暂不可用，稍后刷新重试' : '热门榜单暂不可用，稍后刷新重试';
  return `<div class="board-empty">${ico('info', 'sm')}<span>${text}</span></div>`;
}

function renderHomeBoard(kind, rows, error) {
  const body = $(kind === 'inflow' ? '#inflowBoardBody' : '#hotBoardBody');
  if (!body) return; /* 用户已离开首页 */
  if (error || !Array.isArray(rows) || !rows.length) {
    body.innerHTML = boardEmptyHTML(kind);
    return;
  }
  body.innerHTML = rows.map((s, i) => boardRowHTML(s, i, kind)).join('');
}

async function loadHomeBoards() {
  const hot = getHotBoard()
    .then((rows) => renderHomeBoard('hot', rows))
    .catch(() => renderHomeBoard('hot', null, true));
  const inflow = getInflowBoard()
    .then((rows) => renderHomeBoard('inflow', rows))
    .catch(() => renderHomeBoard('inflow', null, true));
  await Promise.all([hot, inflow]);
}

/* 行业 ETF 榜单：单行沿用 boardRowHTML，指标列为规模（复用 kind='etf' 路由直达） */
function etfRowHTML(stock, index) {
  const chgCls = pctClass(stock.changePct);
  const cap = num(stock.marketCap);
  const capText = Number.isFinite(cap) ? (cap >= 1e8 ? (cap / 1e8).toFixed(1) + '亿' : (cap / 1e4).toFixed(0) + '万') : '—';
  return `
    <button type="button" class="board-row" ${stockDataset(stock)}>
      <span class="br-rank ${index < 3 ? 'top' : ''}">${index + 1}</span>
      <span class="br-name">
        <b>${esc(stock.name)}</b>
        <small>${esc(stock.code)} · ETF</small>
      </span>
      <span class="br-quote">
        <b>${fmtPrice(stock.price, stock.price < 10 ? 3 : 2)}</b>
        <small class="${chgCls}">${fmtPct(stock.changePct)}</small>
      </span>
      <span class="br-metric">${esc(capText)}</span>
    </button>`;
}

async function loadEtfBoard() {
  const body = $('#etfBoardBody');
  if (!body) return;
  try {
    const rows = await getEtfBoard(ETF_BOARD_SIZE);
    if (!body.isConnected) return; /* 已离开首页 */
    if (!rows.length) {
      body.innerHTML = boardEmptyHTML('etf');
      return;
    }
    body.innerHTML = rows.map((s, i) => etfRowHTML(s, i)).join('');
  } catch (e) {
    if (body.isConnected) body.innerHTML = boardEmptyHTML('etf');
  }
}

/* FR-6.2：自选股行情速览，批量接口一次拉取 */
async function loadWatchQuotes() {
  const list = watchlistGet();
  if (!list.length) return;
  const keys = list.map((s) => s.quoteKey).filter(Boolean);
  if (!keys.length) return;
  try {
    const map = await getQuoteBatch(keys);
    list.forEach((s) => {
      const q = map.get(s.quoteKey);
      if (!q) return;
      $$(`[data-wq="${s.quoteKey}"]`).forEach((el) => {
        const cls = pctClass(q.changePct);
        el.innerHTML = `<b class="${cls}">${fmtPrice(q.price, q.price < 10 ? 3 : 2)}</b><span class="${cls}">${fmtPct(
          q.changePct
        )}</span>`;
      });
    });
  } catch (e) {
    /* FR-6.5：失败显示占位，不阻塞其他标的 */
    $$('[data-wq]').forEach((el) => {
      el.textContent = '—';
    });
  }
}

/* 热门股行情：复用批量接口一次拉取（与自选股一致），并回填内存缓存保持 getQuote 口径一致 */
async function loadHotQuotes() {
  const keys = HOT_STOCKS.map((s) => s.quoteKey).filter(Boolean);
  if (!keys.length) return;
  try {
    const map = await getQuoteBatch(keys);
    keys.forEach((key) => {
      const q = map.get(key);
      if (!q) return;
      memCache.set('quote:' + key, { t: Date.now(), d: q });
      $$(`[data-chg="${key}"]`).forEach((el) => {
        el.textContent = fmtPct(q.changePct);
        el.classList.remove('up', 'down', 'flat');
        el.classList.add(pctClass(q.changePct));
      });
    });
  } catch (e) {
    /* 首页热门行情失败不影响主流程 */
  }
}

function suggestionHTML(items) {
  if (!items.length) {
    return `<div class="sug-empty">没有匹配结果。试试股票代码，如 <span class="mono">600519</span> / <span class="mono">00700</span> / <span class="mono">NVDA</span></div>`;
  }
  return (
    items
      .map(
        (item, i) => `
    <button type="button" class="sug-item" role="option" data-sug-index="${i}" ${stockDataset(item)}>
      <span class="badge ${marketBadgeClass(item.market)}">${marketLabel(item.market)}</span>
      <span class="sug-name">${esc(item.name)}</span>
      <span class="sug-code">${esc(item.code)}</span>
      <span class="sug-pinyin">${esc(item.pinyin || '')}</span>
    </button>`
      )
      .join('') +
    `<div class="sug-hint"><span>↑ ↓ 选择 · Enter 打开</span><span>行情来自腾讯财经</span></div>`
  );
}

function renderSuggestions(items, query) {
  const box = $('#suggestions');
  if (!box) return;
  if (!query) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = suggestionHTML(items || []);
}

function closeSuggestions() {
  const box = $('#suggestions');
  if (box) box.innerHTML = '';
}
