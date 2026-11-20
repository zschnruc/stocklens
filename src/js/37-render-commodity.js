/* ============================================================
   大宗商品 renderers — 独立研判页（轻量版）
   行情头 + K 线（复用 v1.9+）+ 技术研判（复用五维引擎）
   不做综合评分、期限结构、库存与持仓。
   ============================================================ */
'use strict';

const COMMODITY_SECTION_NAV = [
  ['chart', '价格走势'],
  ['technical', '技术研判'],
  ['limits', '数据边界'],
];

function commodityShell(stock) {
  const def = commodityByKey(stock.code);
  return `<div class="analysis-wrap" id="analysisWrap">
    ${crumbHTML(stock)}
    <div id="stockMeta">${commodityHeaderSkeleton(stock)}</div>
    <div class="commodity-risk no-print">${ico('alert', 'sm')}<span>页面展示的是 <b>${esc(
      (def && def.contract) || '期货连续合约'
    )}</b>，与现货存在基差且会定期移仓；期货为保证金杠杆交易，波动可能放大损失。本页仅聚合公开数据用于研究，不构成投资建议。</span></div>
    <nav class="section-nav" aria-label="页面章节">
      ${COMMODITY_SECTION_NAV.map(([id, label]) => `<a href="#${id}" data-scroll="${id}">${label}</a>`).join('')}
      <span class="nav-live"><i></i>数据实时拉取</span>
    </nav>

    <div id="overviewArea">
      <div id="chartSlot">${loadingCard('正在绘制商品 K 线…', 2)}</div>
      <p class="inline-note commodity-inline">K 线来自东方财富商品连续合约，价格为 USD 计价；连续合约会随主力换月跳空，长周期比较时需注意移仓影响。</p>
    </div>

    <section class="section-block" id="technical">
      ${sectionHead('02', '技术研判', '趋势、动量、随机、波动与量价五维度分析，基于日线本地计算')}
      <div id="technicalSlot">${loadingCard('正在计算多维技术信号…', 4)}</div>
    </section>

    <section class="section-block" id="limits">
      ${sectionHead('03', '数据边界', '本页只做公开行情与技术面的研究整理')}
      <article class="card commodity-limits">
        <div class="commodity-limit-grid">
          <div><b>已提供</b><span>实时行情（腾讯财经）· 日/周/月与分钟 K 线（东方财富）· 五维技术研判（本地计算）</span></div>
          <div><b>暂不提供</b><span>库存数据（EIA / LME）· CFTC 持仓报告 · 期限结构曲线 · 商品专属综合评分</span></div>
          <div><b>为什么</b><span>上述数据缺少稳定且允许浏览器直连的免费来源，缺失时明确标注，不用估算值填充。</span></div>
        </div>
        <p class="inline-note">商品没有财报、机构研报与市盈率，个股式四维评分不适用；技术研判只反映历史价格，不判断供需与宏观方向。</p>
      </article>
    </section>

    <p class="analysis-foot commodity-foot">行情来自腾讯财经公开接口，K 线来自东方财富，技术指标由浏览器本地计算。期货交易具有杠杆效应，境内相关业务需遵守监管规定；本页不提供交易入口，评分与信号不构成任何投资建议。</p>
  </div>`;
}

function commodityHeaderSkeleton(stock) {
  return `<header class="stock-head">
    <div class="stock-title">
      <div class="stock-tags"><span class="badge gold">大宗商品</span><span class="badge">USD 计价</span></div>
      <h1>${esc(stock.name || stock.code)} <span class="code">${esc(stock.code)}</span></h1>
      <div class="stock-sub"><span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span>正在获取商品行情…</div>
    </div>
    <div class="stock-price"><div class="skeleton" style="width:160px;height:38px;margin-left:auto"></div></div>
  </header>
  <div class="metric-strip">
    ${Array.from({ length: 6 }, () => '<div class="metric"><div class="skeleton" style="height:10px;width:52px"></div><div class="skeleton" style="height:16px;width:78px;margin-top:6px"></div></div>').join('')}
  </div>`;
}

function renderCommoditySkeleton(stock) {
  setViewHTML(commodityShell(stock));
  document.title = `${stock.name || stock.code} · 大宗商品 · 研值 StockLens`;
  syncTopbar('analysis');
}

function commodityHeader(stock, quote) {
  const def = commodityByKey(stock.code);
  const digits = def ? def.digits : 2;
  const spot = quote.spot;
  const spotCell = spot
    ? metricCell(
        '伦敦现货参考',
        `${fmtPrice(spot.price, digits)}`,
        pctClass(spot.changePct),
        `${fmtPct(spot.changePct)} · 与期货口径不同`
      )
    : metricCell('合约口径', esc((def && def.group) || '商品'), '', esc((def && def.unit) || ''));
  return `<header class="stock-head">
    <div class="stock-title">
      <div class="stock-tags">
        <span class="badge gold">大宗商品</span>
        ${def ? `<span class="badge teal">${esc(def.group)}</span>` : ''}
        <span class="badge">USD · ${esc((def && def.unit) || '')}</span>
      </div>
      <h1>${esc(quote.name || stock.name)} <span class="code">${esc((def && def.code) || stock.code)}</span></h1>
      <div class="stock-sub">
        <span>${esc(quote.contract || (def && def.contract) || '期货连续合约')}</span>
        <span class="mini-sep"></span>
        <span>${esc(quote.time || '—')}</span>
        <span class="mini-sep"></span>
        <span class="source-note" style="margin:0">行情来自腾讯财经公开接口</span>
      </div>
    </div>
    <div class="stock-price">
      <div class="price-row">
        <span class="price-main ${pctClass(quote.changePct)}">${fmtCommodityPrice(quote.price, def)}</span>
        <span class="price-change ${pctClass(quote.changePct)}">${fmtSigned(quote.change, digits)} · ${fmtPct(quote.changePct)}</span>
      </div>
      <div class="price-time">最高 ${fmtCommodityPrice(quote.high, def)} · 最低 ${fmtCommodityPrice(quote.low, def)}</div>
      <div class="stock-actions no-print">
        <button class="btn sm" type="button" data-action="copy-link">${ico('share', 'sm')}分享</button>
        <button class="btn sm" type="button" data-action="refresh">${ico('refresh', 'sm')}刷新</button>
      </div>
    </div>
  </header>
  <div class="metric-strip">
    ${metricCell('昨收', fmtCommodityPrice(quote.prevClose, def))}
    ${metricCell('今开', fmtCommodityPrice(quote.open, def))}
    ${metricCell('最高', fmtCommodityPrice(quote.high, def))}
    ${metricCell('最低', fmtCommodityPrice(quote.low, def))}
    ${spotCell}
    ${metricCell('报价单位', esc((def && def.unit) || '—'), '', esc(quote.quoteTime || ''))}
  </div>`;
}

function renderCommodityHeader(stock, quote) {
  const box = $('#stockMeta');
  if (!box) return;
  box.innerHTML = commodityHeader(stock, quote);
  hydrateIcons(box);
}

/* ---------------- 首页商品板块 ---------------- */

function commodityChipHTML(key) {
  const stock = normalizeCommodityStock({ key });
  if (!stock) return '';
  return `<button type="button" class="hot-chip commodity-chip" ${stockDataset(stock)}>${esc(stock.name)}<span class="hot-chg" data-commchg="${esc(
    stock.code
  )}">—</span></button>`;
}

function commodityBoardHTML() {
  return `<section class="home-boards commodity-board" aria-labelledby="commodityBoardTitle">
    <div class="boards-head">
      <div class="section-kicker">大宗商品</div>
      <h2 id="commodityBoardTitle">黄金 · 原油 · 工业金属</h2>
      <p>6 个核心品种的期货连续合约行情，点击进入独立页面查看日/周/月与分钟 K 线、五维技术研判。USD 计价，连续合约与现货存在基差。</p>
    </div>
    <div class="boards-grid">
      <article class="card board-card" id="commodityBoardCard">
        <div class="board-card-head">
          <span class="board-ico commodity">${ico('pulse', 'lg')}</span>
          <div class="board-head-main">
            <h3>核心商品 6 品种</h3>
            <span>腾讯财经行情 · 东方财富 K 线 · 期货连续合约</span>
          </div>
          <div class="board-update">
            <span class="board-time" id="commodityBoardTime">更新中…</span>
            <button type="button" class="board-refresh" data-action="board-refresh" data-board="commodity" aria-label="手动刷新大宗商品行情" title="手动刷新">${ico('refresh', 'sm')}</button>
          </div>
        </div>
        <div class="board-list" id="commodityBoardBody">${loadingCard('正在获取商品行情…', 4)}</div>
      </article>
    </div>
  </section>`;
}

function commodityTileHTML(row) {
  const def = commodityByKey(row.code);
  return `<button type="button" class="commodity-tile" ${stockDataset(row)}>
    <span class="ct-top"><b>${esc(row.name)}</b><small>${esc((def && def.code) || '')} · ${esc((def && def.group) || '商品')}</small></span>
    <span class="ct-price">${fmtCommodityPrice(row.price, def)}</span>
    <span class="ct-chg ${pctClass(row.changePct)}">${fmtSigned(row.change, def ? def.digits : 2)} · ${fmtPct(row.changePct)}</span>
    <span class="ct-range">高 ${fmtCommodityPrice(row.high, def)} · 低 ${fmtCommodityPrice(row.low, def)}</span>
  </button>`;
}

async function loadCommodityBoard(force = false) {
  const body = $('#commodityBoardBody');
  if (!body) return;
  setBoardStatus('commodity', 'loading');
  try {
    const rows = await getCommodityBoard(force);
    if (!body.isConnected) return;
    if (!rows.length) throw new Error('empty');
    body.innerHTML = `<div class="commodity-grid">${rows.map(commodityTileHTML).join('')}</div>`;
    body.dataset.loaded = '1';
    setBoardStatus('commodity', 'ok', Date.now());
  } catch (e) {
    if (!body.isConnected) return;
    if (!(force && body.dataset.loaded === '1')) body.innerHTML = boardEmptyHTML('commodity');
    setBoardStatus('commodity', 'error');
  }
}

async function loadCommodityHotQuotes() {
  try {
    const rows = await getCommodityBoard();
    rows.forEach((row) => {
      $$(`[data-commchg="${row.code}"]`).forEach((el) => {
        const def = commodityByKey(row.code);
        el.textContent = def ? fmtPct(row.changePct) : '—';
        el.classList.remove('up', 'down', 'flat');
        el.classList.add(pctClass(row.changePct));
      });
    });
  } catch (e) {
    /* 首页商品行情失败不影响其他板块 */
  }
}
