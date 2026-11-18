/* ============================================================
   加密资产 renderers — 独立研判页
   综合分 + 五维雷达 + K 线（复用 v1.9）+ 技术研判 + 合约 + 链上 + 舆情
   ============================================================ */
'use strict';

const CRYPTO_SECTION_NAV = [
  ['overview', '综合研判'],
  ['technical', '技术研判'],
  ['derivatives', '合约与杠杆'],
  ['onchain', '情绪与链上'],
  ['news', '新闻舆情'],
];

function cryptoShell(stock) {
  return `<div class="analysis-wrap" id="analysisWrap">
    ${crumbHTML(stock)}
    <div id="stockMeta">${cryptoHeaderSkeleton(stock)}</div>
    <div class="crypto-risk no-print">${ico('alert', 'sm')}<span>加密资产 7×24 连续交易、无涨跌幅限制，合约杠杆可能损失全部本金；本页仅聚合公开数据用于研究，不构成投资建议。</span></div>
    <nav class="section-nav" aria-label="页面章节">
      ${CRYPTO_SECTION_NAV.map(([id, label]) => `<a href="#${id}" data-scroll="${id}">${label}</a>`).join('')}
      <span class="nav-live"><i></i>数据实时拉取</span>
    </nav>

    <div id="overviewArea">
      <div class="overview-grid" id="cryptoOverviewGrid">
        <aside class="card score-card">${loadingCard('正在汇总加密五维评分…', 4)}</aside>
        <article class="card factor-card">${loadingCard('正在建立因子雷达…', 5)}</article>
      </div>
      <div id="chartSlot" style="margin-top:16px">${loadingCard('正在绘制价格 K 线…', 2)}</div>
    </div>

    <section class="section-block" id="technical">
      ${sectionHead('02', '技术研判', '趋势、动量、随机、波动与量价五维度分析，基于日线本地计算')}
      <div id="technicalSlot">${loadingCard('正在计算多维技术信号…', 4)}</div>
    </section>

    <section class="section-block" id="derivatives">
      ${sectionHead('03', '合约与杠杆', '资金费率、持仓量与期现基差；仅覆盖有 U 本位合约的币种')}
      <div id="cryptoDerivativesBody">${loadingCard('正在获取合约数据…', 3)}</div>
    </section>

    <section class="section-block" id="onchain">
      ${sectionHead('04', '情绪与链上', '恐慌贪婪指数与主链 TVL 变化，作为情绪与生态的粗略代理')}
      <div id="cryptoOnchainBody">${loadingCard('正在获取情绪与链上数据…', 3)}</div>
    </section>

    <section class="section-block" id="news">
      ${sectionHead('05', '新闻舆情', '公开中文资讯与关键词情绪，仅代表文本倾向，不代表价格方向')}
      <div id="newsBody">${loadingCard('正在检索相关新闻…', 4)}</div>
    </section>

    <p class="analysis-foot crypto-foot">加密行情与 K 线来自 Binance 公开数据镜像，市值与排名来自 CoinLore，合约数据来自 Gate，情绪与链上数据来自 alternative.me 与 DefiLlama。所有数据可能存在延迟、限流或字段缺失，缺失维度直接标注「不可用」并按覆盖率折算。境内虚拟货币相关业务活动属于非法金融活动，本页不提供交易入口，评分不构成任何投资建议。</p>
  </div>`;
}

function cryptoHeaderSkeleton(stock) {
  return `<header class="stock-head">
    <div class="stock-title">
      <div class="stock-tags"><span class="badge violet">加密</span><span class="badge">USD 计价</span></div>
      <h1>${esc(stock.name || stock.code)} <span class="code">${esc(stock.code)}</span></h1>
      <div class="stock-sub"><span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span>正在获取加密行情…</div>
    </div>
    <div class="stock-price"><div class="skeleton" style="width:160px;height:38px;margin-left:auto"></div></div>
  </header>
  <div class="metric-strip">
    ${Array.from({ length: 6 }, () => '<div class="metric"><div class="skeleton" style="height:10px;width:52px"></div><div class="skeleton" style="height:16px;width:78px;margin-top:6px"></div></div>').join('')}
  </div>`;
}

function renderCryptoSkeleton(stock) {
  setViewHTML(cryptoShell(stock));
  document.title = `${stock.name || stock.code} · 加密研判 · 研值 StockLens`;
  syncTopbar('analysis');
}

function cryptoHeader(stock, quote, meta) {
  const rank = num(meta && meta.rank);
  const cap = num(meta && meta.marketCap);
  const circulating = num(meta && meta.circulating);
  const maxSupply = num(meta && meta.maxSupply);
  const chain = CRYPTO_CHAINS[stock.code];
  const supplyText = Number.isFinite(circulating)
    ? `${fmtCryptoSupply(circulating)}${Number.isFinite(maxSupply) && maxSupply > 0 ? ` / ${fmtCryptoSupply(maxSupply)}` : ''}`
    : '—';
  return `<header class="stock-head">
    <div class="stock-title">
      <div class="stock-tags">
        <span class="badge violet">加密</span>
        ${chain ? `<span class="badge teal">${esc(chain)}</span>` : ''}
        <span class="badge">7×24 · USD</span>
      </div>
      <h1>${esc(quote.name || stock.name)} <span class="code">${esc(stock.code)}</span></h1>
      <div class="stock-sub">
        <span>Binance 现货 · USD 计价</span>
        <span class="mini-sep"></span>
        <span>${esc(quote.time || '—')}</span>
        <span class="mini-sep"></span>
        <span class="source-note" style="margin:0">行情来自 Binance 公开数据镜像</span>
      </div>
      <div class="data-status" id="dataStatus">
        ${statusPill('derivatives', 'loading', '合约 加载中')}
        ${statusPill('onchain', 'loading', '链上 加载中')}
        ${statusPill('news', 'loading', '舆情 加载中')}
      </div>
    </div>
    <div class="stock-price">
      <div class="price-row">
        <span class="price-main ${pctClass(quote.changePct)}">${fmtCryptoPrice(quote.price)}</span>
        <span class="price-change ${pctClass(quote.changePct)}">${fmtSigned(quote.change, quote.price < 0.01 ? 8 : quote.price < 1 ? 6 : 2)} · ${fmtPct(quote.changePct)}</span>
      </div>
      <div class="price-time">24h 高 ${fmtCryptoPrice(quote.high)} · 低 ${fmtCryptoPrice(quote.low)}</div>
      <div class="stock-actions no-print">
        <button class="btn sm watch-btn ${watchlistHas(stock) ? 'on' : ''}" type="button" data-action="watch-toggle" aria-pressed="${watchlistHas(stock)}">${ico('star', 'sm')}${watchlistHas(stock) ? '已自选' : '加自选'}</button>
        <button class="btn sm" type="button" data-action="copy-link">${ico('share', 'sm')}分享</button>
        <button class="btn sm" type="button" data-action="refresh">${ico('refresh', 'sm')}刷新</button>
      </div>
    </div>
  </header>
  <div class="metric-strip">
    ${metricCell('市值排名', Number.isFinite(rank) ? `#${rank}` : '—')}
    ${metricCell('总市值', fmtUsdCompact(cap))}
    ${metricCell('24h 成交额', fmtUsdCompact(quote.amount))}
    ${metricCell('流通量 / 上限', supplyText)}
    ${metricCell('24h 最高', fmtCryptoPrice(quote.high))}
    ${metricCell('24h 最低', fmtCryptoPrice(quote.low))}
  </div>`;
}

function renderCryptoHeader(stock, quote, meta) {
  const box = $('#stockMeta');
  if (!box) return;
  box.innerHTML = cryptoHeader(stock, quote, meta);
  hydrateIcons(box);
}

/* 因子卡：复用雷达与 dimRow，文案改为加密五维口径 */
function renderCryptoFactorCard(score) {
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
  const weightLine = CRYPTO_DIM_META.map((d) => `${d.short} ${d.weight}%`).join(' / ');
  return `<article class="card factor-card">
    <div class="card-kicker">${ico('target')}加密五维 · 权重与依据</div>
    <div class="factor-grid">
      <div class="radar-wrap">${renderRadar(score.dims)}</div>
      <div class="dims">${score.dims.map(dimRow).join('')}</div>
    </div>
    <details class="score-explain" open>
      <summary>评分依据 <span>可用 ${score.availableCount}/${score.dimCount} 维 · 权重覆盖 ${score.coverage}% · ${score.missing.length ? `缺失 ${esc(score.missing.join('、'))}` : '五维齐全'}</span></summary>
      <div class="explain-grid">${explain}</div>
      <p class="inline-note">综合分 = 可用维度加权平均（${weightLine}）× (0.7 + 0.3 × 覆盖率)，缺失维度从权重中剔除并施加覆盖惩罚。加密资产没有财报与机构研报，评分只反映公开行情、衍生品与链上数据，不代表未来涨跌。</p>
    </details>
  </article>`;
}

/* 只更新评分区，不动 K 线容器，避免数据分路到达时图表闪烁 */
function renderCryptoOverview(score) {
  const grid = $('#cryptoOverviewGrid');
  if (!grid) return;
  grid.innerHTML = `${renderScoreCard(score, score.createdAt)}${renderCryptoFactorCard(score)}`;
  hydrateIcons(grid);
}

/* ---------------- 合约面板 ---------------- */

function renderCryptoDerivatives(stock, derivatives, meta) {
  const body = $('#cryptoDerivativesBody');
  if (!body) return;
  if (!derivatives || !Number.isFinite(derivatives.funding)) {
    updateStatus('derivatives', 'empty', '合约 无数据');
    body.innerHTML = emptyState({
      icon: 'pulse',
      title: '暂无 U 本位合约数据',
      desc: '该币种在 Gate 没有可用的 USDT 永续合约，合约与杠杆维度不计入综合分，其他维度不受影响。',
    });
    return;
  }
  const d = derivatives;
  const cap = num(meta && meta.marketCap);
  const oiRatio = Number.isFinite(d.oiUsd) && Number.isFinite(cap) && cap > 0 ? (d.oiUsd / cap) * 100 : null;
  const annual = Number.isFinite(d.funding) ? d.funding * 3 * 365 * 100 : null;
  const fundCls = d.funding > 0.0004 ? 'down' : d.funding < -0.0004 ? 'up' : 'flat';
  updateStatus('derivatives', 'ok', '合约 已获取');
  body.innerHTML = `<div class="crypto-stat-grid">
    <div class="crypto-stat"><label>资金费率（8h）</label><strong class="${fundCls}">${Number.isFinite(d.funding) ? (d.funding * 100).toFixed(4) + '%' : '—'}</strong><small>年化约 ${Number.isFinite(annual) ? annual.toFixed(2) + '%' : '—'}</small></div>
    <div class="crypto-stat"><label>标记价格</label><strong>${fmtCryptoPrice(d.mark)}</strong><small>指数价 ${fmtCryptoPrice(d.index)}</small></div>
    <div class="crypto-stat"><label>期现基差</label><strong class="${Math.abs(d.basisPct || 0) > 1 ? 'down' : 'flat'}">${Number.isFinite(d.basisPct) ? d.basisPct.toFixed(3) + '%' : '—'}</strong><small>|标记价−指数价| / 指数价</small></div>
    <div class="crypto-stat"><label>持仓量（USD）</label><strong>${fmtUsdCompact(d.oiUsd)}</strong><small>占市值 ${oiRatio !== null ? oiRatio.toFixed(2) + '%' : '—'}</small></div>
    <div class="crypto-stat"><label>24h 合约成交额</label><strong>${fmtUsdCompact(d.volume24)}</strong><small>${esc(d.contract || '')}</small></div>
    <div class="crypto-stat"><label>杠杆风险</label><strong class="${oiRatio !== null && oiRatio > 15 ? 'down' : 'flat'}">${oiRatio !== null ? (oiRatio > 15 ? '偏高' : oiRatio > 5 ? '中等' : '温和') : '—'}</strong><small>持仓量 / 市值 &gt;15% 视为高杠杆</small></div>
  </div>
  <p class="inline-note">资金费率为正表示多头向空头付费，极端正值往往意味着多头拥挤；为负则相反。持仓量高、基差大时，价格对强制平仓更敏感。合约数据来自 Gate 公开接口，仅作风险参考。</p>`;
  hydrateIcons(body);
}

/* ---------------- 情绪与链上面板 ---------------- */

function fngLabel(raw) {
  const s = String(raw || '');
  if (/Extreme Fear/i.test(s)) return '极度恐慌';
  if (/Fear/i.test(s)) return '恐慌';
  if (/Extreme Greed/i.test(s)) return '极度贪婪';
  if (/Greed/i.test(s)) return '贪婪';
  if (/Neutral/i.test(s)) return '中性';
  return s || '—';
}

function renderCryptoOnchain(stock, fng, tvl) {
  const body = $('#cryptoOnchainBody');
  if (!body) return;
  const fngCard = fng && Number.isFinite(fng.current)
    ? `<article class="card crypto-eco-card" id="cryptoFngCard">
        <div class="card-kicker">${ico('activity')}恐慌贪婪指数 · 逆向参考</div>
        <div class="crypto-fng-main"><strong class="${fng.current <= 25 ? 'up' : fng.current >= 75 ? 'down' : 'flat'}">${Math.round(fng.current)}</strong><span>/ 100</span><b>${esc(fngLabel(fng.classification))}</b></div>
        <div class="crypto-spark">${renderSparkline(fng.history)}</div>
        <p class="inline-note">0–25 极度恐慌、25–45 恐慌、45–55 中性、55–75 贪婪、75–100 极度贪婪。评分采用逆向口径：恐慌偏加分、贪婪偏扣分，但情绪指标不代表价格即将反转。</p>
      </article>`
    : `<article class="card crypto-eco-card">
        <div class="card-kicker">${ico('activity')}恐慌贪婪指数</div>
        ${emptyState({ icon: 'activity', title: '情绪数据暂不可用', desc: 'alternative.me 接口未返回数据，情绪与生态维度将按不可用处理。' })}
      </article>`;
  const tvlCard = tvl
    ? `<article class="card crypto-eco-card" id="cryptoTvlCard">
        <div class="card-kicker">${ico('layers')}主链 TVL · ${esc(tvl.chain)}</div>
        <div class="crypto-fng-main"><strong>${fmtUsdCompact(tvl.current)}</strong><b class="${pctClass(tvl.change30d)}">30日 ${fmtPct(tvl.change30d)}</b></div>
        <div class="crypto-spark">${renderSparkline(tvl.series)}</div>
        <p class="inline-note">TVL 为该主链 DeFi 协议锁仓总价值（DefiLlama 口径），反映生态资金规模，不等于该币种市值或价格支撑。</p>
      </article>`
    : `<article class="card crypto-eco-card">
        <div class="card-kicker">${ico('layers')}主链 TVL</div>
        ${emptyState({
          icon: 'database',
          title: '该币种无主链 TVL 映射',
          desc: '只有具备独立主链生态的资产（如 ETH/BNB/SOL/AVAX/TRX）才有可用的 TVL 数据；其余币种的情绪维度只使用恐慌贪婪指数。',
        })}
      </article>`;
  updateStatus('onchain', fng ? 'ok' : 'empty', fng ? '链上 已获取' : '链上 无数据');
  body.innerHTML = `<div class="crypto-eco-grid">${fngCard}${tvlCard}</div>`;
  hydrateIcons(body);
}
