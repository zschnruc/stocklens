/* ============================================================
   Analysis page renderers
   ============================================================ */
'use strict';

const SECTION_NAV = [
  ['overview', '综合研判'],
  ['technical', '技术研判'],
  ['reports', '个股研报'],
  ['industry', '行业研报'],
  ['peers', '同业对照'],
  ['financial', '财务成长'],
  ['news', '新闻舆情'],
];

function loadingCard(text = '正在获取数据…', rows = 3) {
  return `<div class="loading-card">
    <div class="loading-row"><span class="spinner"></span><span>${esc(text)}</span></div>
    ${Array.from({ length: rows }, (_, i) => `<div class="skeleton sk-line ${i % 2 ? 'w85' : 'w70'}"></div>`).join('')}
  </div>`;
}

function emptyState({ icon = 'info', title, desc, links = [], action = '' }) {
  return `<div class="empty-state">
    <div class="empty-icon">${ico(icon, 'lg')}</div>
    <h3>${esc(title)}</h3>
    <p>${desc || ''}</p>
    ${action || ''}
    ${
      links.length
        ? `<div class="empty-links">${links
            .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`)
            .join('')}</div>`
        : ''
    }
  </div>`;
}

function errorBox(title, message, retry = '') {
  return `<div class="error-box">
    ${ico('alert')}
    <div>
      <h4>${esc(title)}</h4>
      <p>${esc(message)}</p>
      ${retry ? `<button class="btn sm" type="button" data-retry="${esc(retry)}">${ico('refresh', 'sm')}重试</button>` : ''}
    </div>
  </div>`;
}

function sectionHead(num, title, desc, tools = '') {
  return `<div class="section-head">
    <div class="section-title">
      <span class="section-num">${num}</span>
      <div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div>
    </div>
    ${tools ? `<div class="section-tools">${tools}</div>` : ''}
  </div>`;
}

function crumbHTML(stock) {
  return `<div class="crumb">
    <a href="#" data-action="home">首页</a><span class="sep">/</span>
    <span>${marketLabel(stock.market)}</span><span class="sep">/</span>
    <span>${esc(stock.name || stock.code)}</span>
    <span class="badge ${marketBadgeClass(stock.market)}">${marketLabel(stock.market)}</span>
  </div>`;
}

function stockHeaderSkeleton(stock) {
  return `<header class="stock-head">
    <div class="stock-title">
      <div class="stock-tags"><span class="badge ${marketBadgeClass(stock.market)}">${marketLabel(stock.market)}</span></div>
      <h1>${esc(stock.name || stock.code)} <span class="code">${esc(stock.code)}</span></h1>
      <div class="stock-sub"><span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span>正在获取行情与公司信息…</div>
    </div>
    <div class="stock-price">
      <div class="skeleton" style="width:160px;height:38px;margin-left:auto"></div>
      <div class="skeleton" style="width:110px;height:12px;margin:10px 0 0 auto"></div>
    </div>
  </header>
  <div class="metric-strip">
    ${Array.from({ length: 6 }, () => '<div class="metric"><div class="skeleton" style="height:10px;width:52px"></div><div class="skeleton" style="height:16px;width:78px;margin-top:6px"></div></div>').join('')}
  </div>`;
}

function analysisShell(stock) {
  return `<div class="analysis-wrap" id="analysisWrap">
    ${crumbHTML(stock)}
    <div id="stockMeta">${stockHeaderSkeleton(stock)}</div>
    <nav class="section-nav" aria-label="页面章节">
      ${SECTION_NAV.map(([id, label]) => `<a href="#${id}" data-scroll="${id}">${label}</a>`).join('')}
      <span class="nav-live"><i></i>数据实时拉取</span>
    </nav>

    <div id="overviewArea">
      <div class="overview-grid">
        <aside class="card score-card">${loadingCard('正在汇总四维评分…', 4)}</aside>
        <article class="card factor-card">${loadingCard('正在建立因子雷达…', 5)}</article>
      </div>
      <div id="chartSection" style="margin-top:16px">${loadingCard('正在绘制近一年走势…', 2)}</div>
    </div>

    <section class="section-block" id="technical">
      ${sectionHead('02', '技术研判', '趋势、动量、随机、波动与量价五维度分析')}
      <div id="technicalSlot">${loadingCard('正在计算多维技术信号…', 4)}</div>
    </section>

    <section class="section-block" id="reports">
      ${sectionHead('03', '个股研报', '近 6 个月最新 20 篇，含机构评级、盈利预测与目标价')}
      <div id="reportsBody">${loadingCard('正在检索个股研报…', 4)}</div>
    </section>

    <section class="section-block" id="industry">
      ${sectionHead('04', '行业研报', '按所属行业聚合近 6 个月行业研报')}
      <div id="industryBody">${loadingCard('正在识别行业并检索行业研报…', 3)}</div>
    </section>

    <section class="section-block" id="peers">
      ${sectionHead('05', '同业对照', '行业市值前三与利润前三，并附同行最新研报')}
      <div id="peersBody">${loadingCard('正在获取行业成分股与同行数据…', 4)}</div>
    </section>

    <section class="section-block" id="financial">
      ${sectionHead('06', '财务与成长', '最近报告期核心指标，用于盈利与成长维度评分')}
      <div id="financialBody">${loadingCard('正在获取财务指标…', 3)}</div>
    </section>

    <section class="section-block" id="news">
      ${sectionHead('07', '新闻舆情', '公开资讯与关键词情绪，仅代表文本倾向，不代表股价方向')}
      <div id="newsBody">${loadingCard('正在检索相关新闻…', 4)}</div>
    </section>

    <p class="analysis-foot">本页数据来自腾讯财经与东方财富公开接口，可能存在延迟、限流或字段缺失。评分用于研究整理，不构成投资建议。</p>
  </div>`;
}

function renderAnalysisSkeleton(stock) {
  setViewHTML(analysisShell(stock));
  document.title = `${stock.name || stock.code} · 研值 StockLens`;
  syncTopbar('analysis');
}

function metricCell(label, value, cls = '', small = '') {
  return `<div class="metric"><label>${esc(label)}</label><strong class="${cls}">${value}${
    small ? `<small>${esc(small)}</small>` : ''
  }</strong></div>`;
}

function peText(v) {
  if (!Number.isFinite(v)) return '—';
  if (v <= 0) return '亏损';
  return v.toFixed(2);
}

function pbText(v) {
  return Number.isFinite(v) && v > 0 ? v.toFixed(2) : '—';
}

function amountText(quote) {
  if (!Number.isFinite(quote.amount)) return '—';
  const yi = quote.amount / 1e8;
  const unit = quote.currency === 'HKD' ? '港元' : quote.currency === 'USD' ? '美元' : '元';
  return fmtBig(yi) + unit;
}

function renderStockHeader(stock, quote, profile) {
  const box = $('#stockMeta');
  if (!box) return;
  const industry = (profile && profile.industryName) || '';
  const amp =
    quote.prevClose > 0 && Number.isFinite(quote.high) && Number.isFinite(quote.low)
      ? ((quote.high - quote.low) / quote.prevClose) * 100
      : null;
  const html = `<header class="stock-head">
    <div class="stock-title">
      <div class="stock-tags">
        <span class="badge ${marketBadgeClass(stock.market)}">${marketLabel(stock.market)}</span>
        <span id="industryBadge">${industry ? `<span class="badge">${esc(industry)}</span>` : ''}</span>
        <span class="badge">${esc(exchangeLabel(stock, quote))}</span>
      </div>
      <h1>${esc(quote.name || stock.name)} <span class="code">${esc(quote.rawCode || stock.code)}</span></h1>
      <div class="stock-sub">
        <span>${esc(exchangeLabel(stock, quote))}</span>
        <span class="mini-sep"></span>
        <span>${marketLabel(stock.market)} · ${esc(quote.currency)}</span>
        <span class="mini-sep"></span>
        <span class="source-note" style="margin:0">行情来自腾讯财经 · ${esc(quote.time)}</span>
      </div>
      <div class="data-status" id="dataStatus">
        ${statusPill('reports', 'loading', '研报 加载中')}
        ${statusPill('financial', 'loading', '财务 加载中')}
        ${statusPill('news', 'loading', '舆情 加载中')}
        ${statusPill('peers', 'loading', '同业 加载中')}
      </div>
    </div>
    <div class="stock-price">
      <div class="price-row">
        <span class="price-main ${pctClass(quote.changePct)}">${fmtPrice(quote.price, quote.price < 10 ? 3 : 2)}</span>
        <span class="price-change ${pctClass(quote.changePct)}">${fmtSigned(quote.change)} · ${fmtPct(quote.changePct)}</span>
      </div>
      <div class="price-time">${esc(quote.time)} · 前收 ${fmtPrice(quote.prevClose)}</div>
      <div class="stock-actions no-print">
        <button class="btn sm watch-btn ${watchlistHas(stock) ? 'on' : ''}" type="button" data-action="watch-toggle" aria-pressed="${watchlistHas(stock)}">${ico(
          'star',
          'sm'
        )}${watchlistHas(stock) ? '已自选' : '加自选'}</button>
        <button class="btn sm" type="button" data-action="copy-link">${ico('share', 'sm')}分享</button>
        <button class="btn sm" type="button" data-action="refresh">${ico('refresh', 'sm')}刷新</button>
      </div>
    </div>
  </header>
  <div class="metric-strip">
    ${metricCell('总市值', fmtCap(quote.marketCap, quote.currency))}
    ${metricCell('市盈率 TTM', peText(quote.pe))}
    ${metricCell('市净率', pbText(quote.pb))}
    ${metricCell('成交额', amountText(quote))}
    ${metricCell('52 周高', fmtPrice(quote.high52))}
    ${metricCell('52 周低', fmtPrice(quote.low52))}
  </div>`;
  box.innerHTML = html;
  hydrateIcons(box);
}

function statusPill(key, state, label) {
  return `<span class="status-pill ${state}" data-status="${key}"><i></i>${esc(label)}</span>`;
}

function updateStatus(key, state, label) {
  const el = document.querySelector(`[data-status="${key}"]`);
  if (!el) return;
  el.className = `status-pill ${state}`;
  el.innerHTML = `<i></i>${esc(label)}`;
}

function renderFatal(stock, message) {
  setViewHTML(`<div class="analysis-wrap">
    ${crumbHTML(stock)}
    <div class="empty-state" style="margin-top:34px">
      <div class="empty-icon">${ico('alert', 'lg')}</div>
      <h3>无法完成分析</h3>
      <p>${esc(message)}<br>请确认股票代码或网络连接后重试。</p>
      <div class="empty-links" style="margin-top:16px">
        <a href="#" data-action="home">返回首页</a>
        <a href="#" data-action="refresh">重新获取</a>
      </div>
    </div>
  </div>`);
  syncTopbar('analysis');
}

/* ---------------- overview ---------------- */
function dimRow(d) {
  return `<div class="dim-row ${d.available ? '' : 'unavailable'}">
    <div class="dim-top"><span>${esc(d.name)} <em>${d.weight}%</em></span><span class="dim-score"><b>${
    d.available ? d.score : '—'
  }</b>/100</span></div>
    <div class="dim-bar ${d.available ? '' : 'unavailable'}"><i style="width:${d.available ? d.score : 100}%"></i></div>
    <div class="dim-note" title="${esc(d.note)}">${esc(d.available ? d.note : '不可用 · ' + d.note)}</div>
  </div>`;
}

function renderFactorCard(score) {
  const dimCount = Number.isFinite(score.dimCount) ? score.dimCount : score.dims.length;
  const availCount = Number.isFinite(score.availableCount)
    ? score.availableCount
    : score.dims.filter((d) => d.available).length;
  const explain = score.dims
    .map(
      (d) => `<div class="explain-item ${d.available ? '' : 'unavailable'}">
        <h4>${esc(d.name)} <span>权重 ${d.weight}% · ${d.available ? d.score + ' 分' : '不可用'}</span></h4>
        ${
          d.available
            ? `<ul>${d.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
            : `<p>${esc(d.note)}，该维度不计入综合分，剩余维度按权重归一化。</p>`
        }
      </div>`
    )
    .join('');
  return `<article class="card factor-card">
    <div class="card-kicker">${ico('target')}四维因子 · 权重与依据</div>
    <div class="factor-grid">
      <div class="radar-wrap">${renderRadar(score.dims)}</div>
      <div class="dims">${score.dims.map(dimRow).join('')}</div>
    </div>
    <details class="score-explain" open>
      <summary>评分依据 <span>可用 ${availCount}/${dimCount} 维 · 权重覆盖 ${score.coverage}% · ${score.missing.length ? `缺失 ${esc(score.missing.join('、'))}` : '四维齐全'}</span></summary>
      <div class="explain-grid">${explain}</div>
      <p class="inline-note">综合分 = 可用维度加权平均（研报 30% / 盈利 25% / 技术 25% / 舆情 20%），缺失维度从权重中剔除。评级、目标价、财务与情绪均来自公开数据，不做主观填充。</p>
    </details>
  </article>`;
}

function renderScoreCard(score, createdAt) {
  const dimCount = Number.isFinite(score.dimCount) ? score.dimCount : score.dims.length;
  const availCount = Number.isFinite(score.availableCount)
    ? score.availableCount
    : score.dims.filter((d) => d.available).length;
  const coverageText =
    score.coverage === 100
      ? `${dimCount} 维数据齐全`
      : `可用 ${availCount}/${dimCount} 维 · 缺失 ${score.missing.join('、')}`;
  return `<aside class="card score-card">
    <div class="card-kicker">${ico('spark')}综合研判</div>
    ${renderGauge(score.total, score.verdict, score.coverage)}
    <p class="score-desc">${esc(score.desc)}</p>
    <div class="score-foot">
      <span class="confidence">${ico('shield', 'sm')}<span>权重覆盖 <b>${score.coverage}%</b><br>${esc(coverageText)}</span></span>
      <span class="score-mini-bars" title="权重覆盖 ${score.coverage}%">${renderScoreMiniBars(score.coverage)}</span>
    </div>
    <div class="score-updated">更新于 ${esc(
      createdAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    )} · 评分不构成投资建议</div>
  </aside>`;
}

function chartPeriodTabs() {
  const cur = state.klinePeriod || 'day';
  return `<div class="kline-tabs" role="tablist" aria-label="K 线周期">${[['day', '日K'], ['week', '周K'], ['month', '月K']]
    .map(
      ([p, label]) =>
        `<button class="kline-tab ${cur === p ? 'active' : ''}" type="button" role="tab" aria-selected="${cur === p}" data-action="kline-period" data-period="${p}">${label}</button>`
    )
    .join('')}</div>`;
}

/* 副图档位 + BOLL 开关（FR-4.1 / FR-4.5 / FR-4.7） */
function chartSubControls(rowsCount) {
  const cur = state.subChart || 'volume';
  const tabs = KLINE_SUBS.map((s) => {
    const ok = subAvailable(s.key, rowsCount);
    return `<button class="kline-tab sub-tab ${cur === s.key ? 'active' : ''}" type="button" ${
      ok ? '' : 'disabled title="数据不足，无法计算"'
    } aria-pressed="${cur === s.key}" data-action="kline-sub" data-sub="${s.key}">${s.label}</button>`;
  }).join('');
  const bollOk = rowsCount >= 20;
  const boll = `<button class="kline-tab boll-tab ${state.bollOn ? 'active' : ''}" type="button" ${
    bollOk ? '' : 'disabled title="数据不足，无法计算"'
  } aria-pressed="${!!state.bollOn}" data-action="kline-boll">BOLL</button>`;
  return `<div class="kline-subhead">
    <span class="sub-label">副图</span>${tabs}${boll}
    ${subLegendHTML(cur)}
  </div>`;
}

function subLegendHTML(sub) {
  if (sub === 'macd') return `<span class="kline-legend" aria-hidden="true"><i class="a"></i>DIF<i class="b"></i>DEA</span>`;
  if (sub === 'kdj') return `<span class="kline-legend" aria-hidden="true"><i class="a"></i>K<i class="b"></i>D<i class="c"></i>J</span>`;
  if (sub === 'rsi') return `<span class="kline-legend" aria-hidden="true"><i class="a"></i>RSI6<i class="b"></i>RSI12</span>`;
  if (sub === 'volume') return `<span class="kline-legend" aria-hidden="true"><i class="vol"></i>成交量</span>`;
  return '';
}

/* FR-5.1：从研报数据提取目标价 高/中/低 三档锚点 */
function targetAnchors() {
  const list = Array.isArray(state.reports)
    ? state.reports.map((r) => num(r.target)).filter((v) => Number.isFinite(v) && v > 0)
    : [];
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return {
    low: sorted[0],
    mid: sorted[Math.floor((sorted.length - 1) / 2)],
    high: sorted[sorted.length - 1],
    count: list.length,
  };
}

function renderChartSection(kline) {
  /* 指标事实区始终基于日线数据（周/月线仅用于蜡烛展示） */
  const dayK = (state.periodKlines && state.periodKlines.day) || (state.core && state.core.kline) || null;
  const m = dayK && dayK.metrics;
  const pts = kline.points;
  const period = kline.period || 'day';
  const periodLabel = { day: '日K', week: '周K', month: '月K' }[period] || '日K';
  const first = pts[0];
  const last = pts[pts.length - 1];
  /* FR-3.6：蜡烛渲染条件不满足时降级为原有 sparkline */
  const anchors = targetAnchors();
  const candles = renderCandlestick(pts, {
    window: period === 'day' ? 240 : period === 'week' ? 260 : 140,
    sub: state.subChart || 'volume',
    boll: !!state.bollOn,
    targets: anchors,
  });
  const chartBody = candles
    ? `<div class="kline-wrap">${candles}</div>`
    : `<div class="spark-wrap">${renderSparkline(pts)}</div>`;
  const facts = m
    ? `<div class="chart-facts">
    <div class="chart-fact"><label>近 20 日</label><strong class="${pctClass(m.r20)}">${fmtPct(m.r20)}</strong></div>
    <div class="chart-fact"><label>近 60 日</label><strong class="${pctClass(m.r60)}">${fmtPct(m.r60)}</strong></div>
    <div class="chart-fact"><label>近 120 日</label><strong class="${pctClass(m.r120)}">${fmtPct(m.r120)}</strong></div>
    <div class="chart-fact"><label>最大回撤</label><strong class="down">${fmtPct(m.maxDrawdown)}</strong></div>
    <div class="chart-fact"><label>均线形态</label><strong>${esc(m.trend)}</strong></div>
    <div class="chart-fact"><label>年化波动</label><strong>${ratioText(m.volatility)}</strong></div>
    <div class="chart-fact"><label>区间位置</label><strong>${fmtPrice(m.last)}</strong></div>
  </div>`
    : '';
  return `<article class="card chart-card">
    <div>
      <div class="chart-head"><strong>股价 K 线</strong>${chartPeriodTabs()}
        <span class="kline-legend" aria-hidden="true"><i class="ma20"></i>MA20<i class="ma60"></i>MA60</span>
        <span>${esc(fmtDate(first.date))} — ${esc(fmtDate(last.date))} · ${period === 'day' ? '前复权 · ' : ''}${pts.length} 根${periodLabel}</span></div>
      ${chartSubControls(pts.length)}
      ${anchors ? '<span class="kline-note">目标价为研报发布口径，前复权 K 线在最新交易日与实际价格基本一致</span>' : ''}
      ${chartBody}
    </div>
    ${facts}
  </article>`;
}

function renderOverview(score, kline) {
  const overview = $('#overviewArea');
  if (!overview) return;
  overview.innerHTML = `<div class="overview-grid">
    ${renderScoreCard(score, score.createdAt)}
    ${renderFactorCard(score)}
  </div><div id="chartSlot">${
    kline ? renderChartSection(kline) : emptyState({ icon: 'chart', title: '历史行情不足', desc: '无法绘制近一年走势，技术面维度已按不可用处理。' })
  }</div>`;
  hydrateIcons(overview);
  hydrateCandles(overview);
}

function updateHeaderIndustry(profile) {
  const el = $('#industryBadge');
  if (!el) return;
  const industry = (profile && profile.industryName) || '';
  el.innerHTML = industry ? `<span class="badge">${esc(industry)}</span>` : '';
}

function updateChart(kline, loading = false) {
  const slot = $('#chartSlot') || $('#chartSection');
  if (!slot) return;
  if (!kline) {
    slot.innerHTML = loading
      ? `<article class="card chart-card"><div class="kline-loading"><span class="spinner"></span>正在获取 K 线数据…</div></article>`
      : emptyState({ icon: 'chart', title: '历史行情不足', desc: '无法绘制近一年走势，技术面维度将按不可用处理。' });
    return;
  }
  slot.innerHTML = renderChartSection(kline);
  hydrateCandles(slot);
}

/* ---------------- reports ---------------- */
function reportItemHTML(r, showStock = false) {
  const title = r.pdf
    ? `<a href="${esc(r.pdf)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a>`
    : esc(r.title);
  const meta = [];
  if (r.org) meta.push(`<span class="org">${esc(r.org)}</span>`);
  if (showStock && r.stockName) meta.push(`<span>覆盖 ${esc(r.stockName)}</span>`);
  if (r.analyst) meta.push(`<span class="analyst">${esc(r.analyst)}</span>`);
  if (Number.isFinite(r.eps)) meta.push(`<span>预测 EPS ${fmtPrice(r.eps, 2)}</span>`);
  if (Number.isFinite(r.pe)) meta.push(`<span>预测 PE ${fmtPrice(r.pe, 1)}</span>`);
  if (Number.isFinite(r.target)) meta.push(`<span class="target">目标价 ${fmtPrice(r.target)}</span>`);
  const days = daysSince(r.rawDate);
  return `<div class="report-item" data-search="${esc(
    `${r.title} ${r.org} ${r.analyst} ${r.rating} ${r.stockName}`.toLowerCase()
  )}">
    <div class="report-date"><b>${esc(r.date)}</b><span>${days !== null && days >= 0 ? `${days} 天前` : ''}</span></div>
    <div class="report-main">
      <div class="report-title">${title}</div>
      <div class="report-meta">${meta.join('<span class="dot"></span>')}</div>
    </div>
    <div class="report-side">
      ${r.rating ? `<span class="rating-badge ${r.ratingCls}">${esc(r.ratingLabel)}</span>` : ''}
      ${
        r.pdf
          ? `<a class="pdf-link" href="${esc(r.pdf)}" target="_blank" rel="noopener noreferrer">${ico(
              'file',
              'sm'
            )}PDF${r.pages ? ' ' + r.pages + '页' : ''}</a>`
          : ''
      }
    </div>
  </div>`;
}

function reportsTools(count) {
  return `<span class="badge">${count} 篇</span>
    <input class="filter-input" type="search" placeholder="筛选标题 / 机构" data-filter-target="reportsBody" aria-label="筛选研报">
    <span class="source-note">东方财富研报</span>`;
}

function renderStockReports(data, market) {
  const body = $('#reportsBody');
  if (!body) return;
  if (market !== 'A') {
    const links =
      market === 'HK'
        ? [
            { label: '港交所披露易', url: 'https://www.hkexnews.hk/' },
            { label: '东方财富研报中心', url: 'https://data.eastmoney.com/report/' },
          ]
        : [
            { label: 'SEC EDGAR', url: 'https://www.sec.gov/edgar/searchedgar/companysearch' },
            { label: '东方财富研报中心', url: 'https://data.eastmoney.com/report/' },
          ];
    body.innerHTML = emptyState({
      icon: 'lock',
      title: '港股 / 美股暂无可用的免费中文研报源',
      desc: `东方财富免费研报接口目前只覆盖 A 股，${marketLabel(
        market
      )}个股研报无法展示。行情、K 线、新闻、同业与技术评分仍可使用；下方提供官方披露渠道供进一步查阅。`,
      links,
    });
    updateStatus('reports', 'empty', '研报 暂无免费源');
    return;
  }
  if (!data || !data.supported) {
    body.innerHTML = errorBox('研报接口暂不可用', '当前网络无法访问东方财富研报接口，请稍后重试。', 'reports');
    updateStatus('reports', 'error', '研报 获取失败');
    return;
  }
  if (!data.list.length) {
    body.innerHTML = emptyState({
      icon: 'book',
      title: '近 6 个月暂无个股研报',
      desc: '研报接口可用，但没有检索到覆盖该股票的最新研报。可能是标的关注度较低，或近期无机构发布报告。',
      links: [{ label: '东方财富研报中心', url: 'https://data.eastmoney.com/report/' }],
    });
    updateStatus('reports', 'empty', '研报 0 篇');
    return;
  }
  const section = $('#reports');
  const head = section && section.querySelector('.section-head');
  if (head) {
    const tools = head.querySelector('.section-tools');
    if (tools) tools.innerHTML = reportsTools(data.list.length);
    else head.insertAdjacentHTML('beforeend', `<div class="section-tools">${reportsTools(data.list.length)}</div>`);
  }
  body.innerHTML = `<div class="report-list">${data.list.slice(0, 20).map((r) => reportItemHTML(r)).join('')}</div>
    <div class="source-note" style="margin-top:10px">共 ${data.list.length} 篇 · 数据来自东方财富研报中心 · 点击标题或 PDF 查看原文${
    data.hits > data.list.length ? ` · 接口命中 ${data.hits} 篇，仅展示最新 ${data.list.length} 篇` : ''
  }</div>`;
  updateStatus('reports', 'ok', `研报 ${data.list.length} 篇`);
}

/* ---------------- industry ---------------- */
function renderIndustrySection(industry, market, industryName, refInfo) {
  const body = $('#industryBody');
  if (!body) return;
  if (!industryName) {
    body.innerHTML = emptyState({
      icon: 'building',
      title: '未能识别所属行业',
      desc: '公司资料接口未返回行业字段，无法匹配行业研报与同业列表。个股研报、行情与新闻仍可查看。',
    });
    updateStatus('peers', 'error', '同业 行业未知');
    return;
  }
  if (!industry || !industry.supported) {
    body.innerHTML = errorBox('行业研报获取失败', '行业映射成功，但行业研报接口未返回数据。', 'industry');
    return;
  }
  const note =
    market === 'A'
      ? `行业分类：${industryName}${industry.industryName && industry.industryName !== industryName ? `（接口口径：${industry.industryName}）` : ''}`
      : `行业分类：${industryName} · 免费行业研报以 A 股同名/近似行业作参考${refInfo ? `（对应「${refInfo}」）` : ''}`;
  const section = $('#industry');
  const head = section && section.querySelector('.section-head');
  if (head) {
    const desc = head.querySelector('p');
    if (desc) desc.textContent = note;
    const tools = head.querySelector('.section-tools');
    const toolsHTML = `<span class="badge">${industry.list.length} 篇</span>
      <input class="filter-input" type="search" placeholder="筛选标题 / 机构" data-filter-target="industryBody" aria-label="筛选行业研报">
      <span class="source-note">东方财富行业研报</span>`;
    if (tools) tools.innerHTML = toolsHTML;
    else head.insertAdjacentHTML('beforeend', `<div class="section-tools">${toolsHTML}</div>`);
  }
  if (!industry.list.length) {
    body.innerHTML = emptyState({
      icon: 'layers',
      title: '近 6 个月暂无行业研报',
      desc: `${note}。该行业近期可能没有新的行业报告，或接口分类与公司行业名称未完全匹配。`,
      links: [{ label: '东方财富研报中心', url: 'https://data.eastmoney.com/report/' }],
    });
    return;
  }
  body.innerHTML = `<div class="report-list">${industry.list.map((r) => reportItemHTML(r, true)).join('')}</div>
    <div class="source-note" style="margin-top:10px">${esc(note)} · 共 ${industry.list.length} 篇 · 数据来自东方财富</div>`;
}

/* ---------------- peers ---------------- */
function peerKey(p) {
  return `${p.market}_${String(p.code).replace(/[^\w]/g, '_')}`;
}

function peerCardHTML(peer, rank, metricKey, market) {
  const metricLabel = metricKey === 'cap' ? '总市值' : '归母净利';
  const metricValue =
    metricKey === 'cap'
      ? fmtCap(peer.marketCap, peer.market === 'HK' ? 'HKD' : peer.market === 'US' ? 'USD' : 'CNY')
      : peerMoney(peer.profit, peer.currency || (peer.market === 'HK' ? 'HKD' : peer.market === 'US' ? 'USD' : 'CNY'));
  return `<div class="peer-card">
    <div class="peer-top">
      <span class="peer-rank">${rank}</span>
      <div style="min-width:0">
        <button class="peer-name" type="button" ${stockDataset(peer)}>${esc(peer.name)}</button>
        <span class="peer-code">${esc(peer.code)}</span>
      </div>
      <div class="peer-stat"><label>${metricLabel}</label><span>${metricValue}</span></div>
    </div>
    <div class="peer-reports" data-peer-reports="${peerKey(peer)}">
      <div class="peer-empty"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span> 同行研报加载中…</div>
    </div>
  </div>`;
}

function renderPeersSection(peers, market) {
  const body = $('#peersBody');
  if (!body) return;
  if (!peers || !peers.supported) {
    body.innerHTML = errorBox('同业数据暂不可用', '行业板块或市场列表接口未返回数据，可能被限流。', 'peers');
    updateStatus('peers', 'error', '同业 获取失败');
    return;
  }
  const note = peers.note || '按行业成分股排序';
  const source = peers.source || '东方财富行业板块';
  const profitNote = peers.profitPeriod
    ? `按 ${peers.profitPeriod} 归母净利从高到低`
    : '按各公司最新报告期归母净利从高到低';
  const reportNote = market === 'A' ? '同行研报取近 6 个月最新 3 篇' : '同行研报仅覆盖 A 股';
  body.innerHTML = `<div class="peer-columns">
    <div class="peer-group">
      <div class="peer-group-head">${ico('trendUp')}<h3>行业市值前三</h3><span class="badge gold">${esc(peers.boardName || '')}</span></div>
      ${
        peers.cap.length
          ? peers.cap.map((p, i) => peerCardHTML(p, i + 1, 'cap', market)).join('')
          : `<div class="empty-state" style="padding:24px 16px"><div class="empty-icon">${ico(
              'users',
              'lg'
            )}</div><h3>暂无市值数据</h3><p>该行业未返回可用的市值排序结果。</p></div>`
      }
      <div class="peer-foot"><span>按最新总市值从高到低</span><span>${esc(source)}</span></div>
    </div>
    <div class="peer-group">
      <div class="peer-group-head">${ico('chart')}<h3>行业利润前三</h3><span class="badge teal">${esc(peers.boardName || '')}</span></div>
      ${
        peers.profit.length
          ? peers.profit.map((p, i) => peerCardHTML(p, i + 1, 'profit', market)).join('')
          : `<div class="empty-state" style="padding:24px 16px"><div class="empty-icon">${ico(
              'chart',
              'lg'
            )}</div><h3>暂无利润数据</h3><p>${
              market === 'A'
                ? '该行业未返回可用的归母净利排序结果。'
                : '港股 / 美股免费接口的利润字段不完整，无法稳定排出前三。'
            }</p></div>`
      }
      <div class="peer-foot"><span>${peers.profit.length ? profitNote : '利润数据暂不可用'}</span><span>${reportNote}</span></div>
    </div>
  </div>
  <div class="source-note" style="margin-top:10px">${esc(note)} · 已剔除本股 · 点击公司名可查看完整分析</div>`;
  const count = new Set([...peers.cap, ...peers.profit].map((p) => `${p.market}_${p.code}`)).size;
  updateStatus('peers', 'ok', `同业 ${count} 家`);
}

function updatePeerReports(peer, reports) {
  const boxes = document.querySelectorAll(`[data-peer-reports="${peerKey(peer)}"]`);
  if (!boxes.length) return;
  let html;
  if (peer.market !== 'A') {
    html = `<div class="peer-empty">研报源仅覆盖 A 股，暂无同行研报</div>`;
  } else if (!reports || !reports.length) {
    html = `<div class="peer-empty">近 6 个月暂无同行研报</div>`;
  } else {
    html = reports
      .map(
        (r) => `<div class="peer-report-line"><time>${esc(compactDate(r.rawDate))}</time>${
          r.pdf
            ? `<a href="${esc(r.pdf)}" target="_blank" rel="noopener noreferrer" title="${esc(r.title)}">${esc(r.title)}</a>`
            : `<span>${esc(r.title)}</span>`
        }${r.rating ? `<span class="mini-rating">${esc(r.ratingLabel)}</span>` : ''}</div>`
      )
      .join('');
  }
  boxes.forEach((box) => {
    box.innerHTML = html;
  });
}

/* ---------------- financial ---------------- */
function finMoney(n, currency) {
  if (!Number.isFinite(n)) return '—';
  const yi = n / 1e8;
  if (currency === 'HKD') return fmtBig(yi) + '港元';
  if (currency === 'USD') return fmtBig(yi) + '美元';
  return fmtBig(yi) + '元';
}

function renderFinancialSection(f, market) {
  const body = $('#financialBody');
  if (!body) return;
  if (!f || !f.supported) {
    body.innerHTML = emptyState({
      icon: 'database',
      title: market === 'US' ? '美股财务数据暂不可用' : '财务数据暂不可用',
      desc:
        (f && f.reason) ||
        '当前接口未返回可用的财务数据。盈利与成长维度会标记为不可用，评分按剩余维度折算，不会用估值字段替代成长数据。',
    });
    updateStatus('financial', 'empty', '财务 暂无数据');
    return;
  }
  if (f.empty) {
    body.innerHTML = emptyState({
      icon: 'database',
      title: '财务接口未返回有效指标',
      desc: '可能是报告期字段缺失或接口限流，稍后可重试。盈利与成长维度暂不计分。',
    });
    updateStatus('financial', 'empty', '财务 无有效数据');
    return;
  }
  const currency = f.currency || (market === 'HK' ? 'HKD' : market === 'US' ? 'USD' : 'CNY');
  const periodLabel = f.period || f.reportDate || '最近报告期';
  const history = (f.history || []).slice(0, 4);
  const f10Label = market === 'A' ? 'A 股 F10' : market === 'HK' ? '港股 F10' : '美股 F10';
  const sourceNote =
    market === 'US'
      ? '美股为年报口径；ROE = 归母净利 ÷ 平均股东权益，BPS 以加权股数近似计算'
      : market === 'HK'
        ? '港股为年报 / 中报口径，指标来自东财港股 F10'
        : '财务口径可能与公司公告存在差异';
  body.innerHTML = `<div class="card financial-card">
    <div class="fin-head">
      <div>
        <span class="card-kicker">${ico('database')}核心财务指标</span>
        <div class="fin-period">${esc(periodLabel)} <span>· ${esc(f.reportDate || '')}</span></div>
      </div>
      <span class="badge">${f10Label} · ${esc(currency)}</span>
    </div>
    <div class="fin-grid">
      <div class="fin-item"><label>营业收入</label><strong>${finMoney(f.revenue, currency)}</strong>${
        Number.isFinite(f.revenueYoY) ? `<span class="${pctClass(f.revenueYoY)}">同比 ${fmtPct(f.revenueYoY)}</span>` : ''
      }</div>
      <div class="fin-item"><label>${market === 'A' ? '归母净利润' : '股东应占溢利'}</label><strong>${finMoney(
        f.profit,
        currency
      )}</strong>${
        Number.isFinite(f.profitYoY) ? `<span class="${pctClass(f.profitYoY)}">同比 ${fmtPct(f.profitYoY)}</span>` : ''
      }</div>
      <div class="fin-item"><label>毛利率</label><strong>${ratioText(f.grossMargin)}</strong><span>盈利质量参考</span></div>
      <div class="fin-item"><label>ROE</label><strong>${ratioText(f.roe)}</strong><span>净资产收益率</span></div>
      <div class="fin-item"><label>每股收益</label><strong>${fmtEps(f.eps, currency)}</strong><span>${esc(periodLabel)}</span></div>
      <div class="fin-item"><label>每股净资产</label><strong>${fmtEps(f.bps, currency)}</strong><span>${
        Number.isFinite(f.debtRatio) ? `资产负债率 ${ratioText(f.debtRatio)}` : 'F10 指标'
      }</span></div>
    </div>
    ${
      history.length
        ? `<div class="fin-history"><table>
            <thead><tr><th>报告期</th><th>营收同比</th><th>净利同比</th><th>ROE</th></tr></thead>
            <tbody>${history
              .map(
                (h) => `<tr><td>${esc(h.period)}</td><td class="${pctClass(h.revenueYoY)}">${fmtPct(
                  h.revenueYoY
                )}</td><td class="${pctClass(h.profitYoY)}">${fmtPct(h.profitYoY)}</td><td>${ratioText(h.roe)}</td></tr>`
              )
              .join('')}</tbody>
          </table></div>`
        : ''
    }
    <div class="source-note" style="margin-top:12px">${esc(f.source || '东方财富 F10')} · ${esc(sourceNote)}，请以正式报告为准</div>
  </div>`;
  updateStatus('financial', 'ok', `财务 ${f.period || '已获取'}`);
}

/* ---------------- news ---------------- */
function renderNewsSection(news, market) {
  const body = $('#newsBody');
  if (!body) return;
  if (!news || !news.length) {
    body.innerHTML = emptyState({
      icon: 'news',
      title: '暂未获取到相关新闻',
      desc: '新闻接口未返回可展示的结果，新闻舆情维度将标记为不可用。行情、研报与财务不受影响。',
    });
    updateStatus('news', 'empty', '舆情 0 条');
    return;
  }
  const s = analyzeSentiment(news);
  const label = sentimentLabel(s.score);
  body.innerHTML = `<div class="news-grid">
    <aside class="card sentiment-card">
      <div class="sentiment-title">${ico('pulse')}新闻情绪 · 关键词法</div>
      <div class="sentiment-big"><strong>${Number.isFinite(s.score) ? Math.round(s.score) : '—'}</strong><span>/ 100</span></div>
      <div class="sentiment-label">${esc(label)} · 共 ${s.total} 条相关资讯</div>
      ${renderSentimentBar(s)}
      <div class="senti-note">按标题与摘要命中正面 / 负面关键词计数，无法识别反讽、否定与语境，属于粗略文本指标。新闻情绪不等于股价方向。</div>
    </aside>
    <div class="news-list">
      ${s.details
        .slice(0, 15)
        .map(
          (n) => `<div class="news-item">
            <div>
              <div class="news-title">${
                n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)
              }</div>
              <div class="news-meta"><span>${esc(n.source || '东方财富资讯')}</span><span class="dot"></span><span>${esc(
                timeAgo(n.date)
              )}</span><span class="dot"></span><span>${esc(fmtDate(n.date))}</span></div>
            </div>
            <div class="news-tags"><span class="senti-tag ${n.senti}">${
              n.senti === 'pos' ? '正面' : n.senti === 'neg' ? '负面' : '中性'
            }</span></div>
          </div>`
        )
        .join('')}
    </div>
  </div>
  <div class="source-note" style="margin-top:10px">新闻来自东方财富资讯搜索 · 展示最新 ${Math.min(
    s.total,
    15
  )} 条 · ${marketLabel(market)}关键词匹配</div>`;
  updateStatus('news', 'ok', `舆情 ${s.total} 条`);
}

function updateFilter(input) {
  const id = input.dataset.filterTarget;
  const root = document.getElementById(id);
  if (!root) return;
  const q = input.value.trim().toLowerCase();
  root.querySelectorAll('.report-item').forEach((item) => {
    const text = item.dataset.search || '';
    item.hidden = !!q && !text.includes(q);
  });
}
