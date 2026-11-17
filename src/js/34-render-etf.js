/* ============================================================
   ETF renderers — 独立研判页（综合分 + 五维评分 + 技术研判 + 行业研报 + 舆情）
   复用既有 gauge/radar/dimRow/chart/news 渲染器，仅 ETF 专属字段自建。
   ============================================================ */
'use strict';

const ETF_SECTION_NAV = [
  ['overview', '综合研判'],
  ['technical', '技术研判'],
  ['industry', '行业研报'],
  ['news', '新闻舆情'],
];

function etfShell(stock) {
  return `<div class="analysis-wrap" id="analysisWrap">
    ${crumbHTML(stock)}
    <div id="stockMeta">${etfHeaderSkeleton(stock)}</div>
    <nav class="section-nav" aria-label="页面章节">
      ${ETF_SECTION_NAV.map(([id, label]) => `<a href="#${id}" data-scroll="${id}">${label}</a>`).join('')}
      <span class="nav-live"><i></i>数据实时拉取</span>
    </nav>

    <div id="overviewArea">
      <div class="overview-grid">
        <aside class="card score-card">${loadingCard('正在汇总 ETF 五维评分…', 4)}</aside>
        <article class="card factor-card">${loadingCard('正在建立因子雷达…', 5)}</article>
      </div>
      <div id="chartSection" style="margin-top:16px">${loadingCard('正在绘制净值走势…', 2)}</div>
    </div>

    <section class="section-block" id="technical">
      ${sectionHead('02', '技术研判', '趋势、动量、随机、波动与量价五维度分析')}
      <div id="technicalSlot">${loadingCard('正在计算多维技术信号…', 4)}</div>
    </section>

    <section class="section-block" id="industry">
      ${sectionHead('03', '行业研报', '按 ETF 行业主题映射近 6 个月行业研报，作为行业景气的粗略代理')}
      <div id="etfIndustryBody">${loadingCard('正在识别行业主题并检索研报…', 3)}</div>
    </section>

    <section class="section-block" id="news">
      ${sectionHead('04', '新闻舆情', '公开资讯与关键词情绪，仅代表文本倾向，不代表净值方向')}
      <div id="newsBody">${loadingCard('正在检索相关新闻…', 4)}</div>
    </section>

    <p class="analysis-foot">ETF 数据来自腾讯财经与东方财富公开接口。ETF 无个股研报与财务报表，评分采用「技术/规模流动性/行业景气/量能/舆情」五维专属口径，缺失维度降级并计入覆盖惩罚。评分不构成投资建议。</p>
  </div>`;
}

function etfHeaderSkeleton(stock) {
  return `<header class="stock-head">
    <div class="stock-title">
      <div class="stock-tags"><span class="badge gold">ETF</span><span class="badge">场内基金</span></div>
      <h1>${esc(stock.name || stock.code)} <span class="code">${esc(stock.code)}</span></h1>
      <div class="stock-sub"><span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span>正在获取 ETF 行情…</div>
    </div>
    <div class="stock-price"><div class="skeleton" style="width:160px;height:38px;margin-left:auto"></div></div>
  </header>
  <div class="metric-strip">
    ${Array.from({ length: 6 }, () => '<div class="metric"><div class="skeleton" style="height:10px;width:52px"></div><div class="skeleton" style="height:16px;width:78px;margin-top:6px"></div></div>').join('')}
  </div>`;
}

function renderEtfSkeleton(stock) {
  setViewHTML(etfShell(stock));
  document.title = `${stock.name || stock.code} · ETF 研判 · 研值 StockLens`;
  syncTopbar('analysis');
}

/* ETF 头部：复用 exchange/metric 口径，规模替换市值，PE/PB 换为量比/换手代理 */
function renderEtfHeader(stock, quote, fundamentals) {
  const box = $('#stockMeta');
  if (!box) return;
  const board = state.etf && state.etf.boardMeta;
  const cap = num((board && board.marketCap) || quote.marketCap);
  const amount = num((board && board.amount) || quote.amount);
  const capText = Number.isFinite(cap) ? (cap >= 1e8 ? (cap / 1e8).toFixed(2) + ' 亿' : (cap / 1e4).toFixed(0) + ' 万') : '—';
  const theme = fundamentals && fundamentals.theme;
  const mapped = fundamentals && fundamentals.mapped;
  const industryBadge = mapped ? `<span class="badge teal">${esc(mapped.name)}</span>` : theme ? `<span class="badge">${esc(theme)}</span>` : '';
  const html = `<header class="stock-head">
    <div class="stock-title">
      <div class="stock-tags">
        <span class="badge gold">ETF</span>
        ${industryBadge}
        <span class="badge">${esc(exchangeLabel(stock, quote))}</span>
      </div>
      <h1>${esc(quote.name || stock.name)} <span class="code">${esc(quote.rawCode || stock.code)}</span></h1>
      <div class="stock-sub">
        <span>场内基金 · 跟踪主题 ${esc(theme || '未识别')}</span>
        <span class="mini-sep"></span>
        <span>${marketLabel(stock.market)} · ${esc(quote.currency)}</span>
        <span class="mini-sep"></span>
        <span class="source-note" style="margin:0">行情来自腾讯财经 · ${esc(quote.time)}</span>
      </div>
      <div class="data-status" id="dataStatus">
        ${statusPill('industry', 'loading', '行业 加载中')}
        ${statusPill('news', 'loading', '舆情 加载中')}
      </div>
    </div>
    <div class="stock-price">
      <div class="price-row">
        <span class="price-main ${pctClass(quote.changePct)}">${fmtPrice(quote.price, quote.price < 10 ? 3 : 2)}</span>
        <span class="price-change ${pctClass(quote.changePct)}">${fmtSigned(quote.change)} · ${fmtPct(quote.changePct)}</span>
      </div>
      <div class="price-time">${esc(quote.time)} · 前收 ${fmtPrice(quote.prevClose)}</div>
      <div class="stock-actions no-print">
        <button class="btn sm watch-btn ${watchlistHas(stock) ? 'on' : ''}" type="button" data-action="watch-toggle" aria-pressed="${watchlistHas(stock)}">${ico('star', 'sm')}${watchlistHas(stock) ? '已自选' : '加自选'}</button>
        <button class="btn sm" type="button" data-action="copy-link">${ico('share', 'sm')}分享</button>
        <button class="btn sm" type="button" data-action="refresh">${ico('refresh', 'sm')}刷新</button>
      </div>
    </div>
  </header>
  <div class="metric-strip">
    ${metricCell('基金规模', capText)}
    ${metricCell('成交额', Number.isFinite(amount) ? fmtBig(amount / 1e8, '亿') : '—')}
    ${metricCell('量比', Number.isFinite(quote.volumeRatio) ? quote.volumeRatio.toFixed(2) : '—')}
    ${metricCell('今日振幅', ampText(quote))}
    ${metricCell('52 周高', fmtPrice(quote.high52, quote.price < 10 ? 3 : 2))}
    ${metricCell('52 周低', fmtPrice(quote.low52, quote.price < 10 ? 3 : 2))}
  </div>`;
  box.innerHTML = html;
  hydrateIcons(box);
}

function ampText(quote) {
  if (!(quote.prevClose > 0) || !Number.isFinite(quote.high) || !Number.isFinite(quote.low)) return '—';
  return ((quote.high - quote.low) / quote.prevClose * 100).toFixed(2) + '%';
}

/* ETF 因子卡：复用雷达与 dimRow，文案改为五维专属口径 */
function renderEtfFactorCard(score) {
  const explain = score.dims
    .map(
      (d) => `<div class="explain-item ${d.available ? '' : 'unavailable'}">
        <h4>${esc(d.name)} <span>权重 ${d.weight}% · ${d.available ? d.score + ' 分' : '不可用'}</span></h4>
        ${
          d.available
            ? `<ul>${d.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
            : `<p>${esc(d.note)}，该维度不计入综合分。</p>`
        }
      </div>`
    )
    .join('');
  const weightLine = ETF_DIM_META.map((d) => `${d.short} ${d.weight}%`).join(' / ');
  return `<article class="card factor-card">
    <div class="card-kicker">${ico('target')}五维因子 · 权重与依据</div>
    <div class="factor-grid">
      <div class="radar-wrap">${renderRadar(score.dims)}</div>
      <div class="dims">${score.dims.map(dimRow).join('')}</div>
    </div>
    <details class="score-explain" open>
      <summary>评分依据 <span>数据覆盖 ${score.coverage}% · ${score.missing.length ? `缺失 ${esc(score.missing.join('、'))}` : '五维齐全'}</span></summary>
      <div class="explain-grid">${explain}</div>
      <p class="inline-note">综合分 = 可用维度加权平均（${weightLine}），缺失维度从权重中剔除并施加覆盖惩罚。ETF 无个股研报与财务，行业景气以行业研报代理，仅作研究整理。</p>
    </details>
  </article>`;
}

function renderEtfOverview(score, kline) {
  const overview = $('#overviewArea');
  if (!overview) return;
  const createdAt = score.createdAt && typeof score.createdAt.toLocaleTimeString === 'function' ? score.createdAt : new Date();
  overview.innerHTML = `<div class="overview-grid">
    ${renderScoreCard(score, createdAt)}
    ${renderEtfFactorCard(score)}
  </div><div id="chartSlot">${
    kline ? renderChartSection(kline) : emptyState({ icon: 'chart', title: '历史行情不足', desc: '无法绘制净值走势，技术面维度已按不可用处理。' })
  }</div>`;
  hydrateIcons(overview);
  hydrateCandles(overview);
}

/* 行业研报区：复用标准研报卡片结构 */
function renderEtfIndustrySection(result, stock) {
  const body = $('#etfIndustryBody');
  if (!body) return;
  if (!result || !result.mapped) {
    updateStatus('industry', 'done', '行业 未识别');
    body.innerHTML = emptyState({
      icon: 'building',
      title: '未识别行业主题',
      desc: '未能从该 ETF 名称推断所属行业，行业景气维度不计入综合分。其他维度不受影响。',
    });
    return;
  }
  const reports = (result.reports && result.reports.list) || [];
  if (!reports.length) {
    updateStatus('industry', 'done', '行业 无研报');
    body.innerHTML = emptyState({
      icon: 'book',
      title: `${esc(result.mapped.name)} · 近 6 个月无行业研报`,
      desc: '该行业主题暂无免费中文研报覆盖，行业景气维度不计入综合分。',
    });
    return;
  }
  updateStatus('industry', 'done', `行业 ${reports.length} 篇`);
  const rows = reports
    .slice(0, 20)
    .map(
      (r) => `<article class="etf-report-item">
        <div class="etf-report-top">
          <span class="etf-report-org">${esc(r.org || '机构')}</span>
          <span class="etf-report-date">${esc(fmtDate(r.rawDate))}</span>
          ${r.rating ? `<span class="etf-report-rating">${esc(r.rating)}</span>` : ''}
        </div>
        <h4>${r.pdf ? `<a href="${esc(r.pdf)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a>` : esc(r.title)}</h4>
        <p>${esc((r.content || '').slice(0, 90))}</p>
      </article>`
    )
    .join('');
  body.innerHTML = `<div class="etf-industry-head">
      <span class="badge teal">${esc(result.mapped.name)}</span>
      <span>近 6 个月 ${reports.length} 篇行业研报 · 用于行业景气代理，不代表该 ETF 净值方向</span>
    </div>
    <div class="etf-report-list">${rows}</div>`;
  hydrateIcons(body);
}
