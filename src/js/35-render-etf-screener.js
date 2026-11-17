/* ============================================================
   ETF screener renderer — ETF 高分榜（反向选股）
   复用个股高分榜的控件/进度/汇总/表格骨架，五维列改为 ETF 专属口径。
   ============================================================ */
'use strict';

function etfScreenerControlHTML() {
  const s = state.etfScreener;
  return `
  <div class="screener-controls card">
    <div class="screener-control-main">
      <label class="screener-range">
        <span>综合分门槛 <b id="etfScreenerThresholdVal">${s.threshold}</b> 分</span>
        <input type="range" id="etfScreenerThreshold" min="60" max="95" step="1" value="${s.threshold}"
          aria-label="ETF 综合分门槛">
        <span class="range-hint">60 — 95 分</span>
      </label>
      <label class="screener-size">
        <span>候选池</span>
        <select id="etfScreenerSize" aria-label="ETF 热门榜单候选数量">
          ${[20, 30, 50]
            .map((n) => `<option value="${n}" ${n === s.size ? 'selected' : ''}>成交额前 ${n} 只</option>`)
            .join('')}
        </select>
      </label>
      <button class="btn primary" type="button" data-action="etf-screener-run" id="etfScreenerRunBtn">
        ${ico('spark', 'sm')}<span>${s.running ? '扫描中…' : '开始扫描'}</span>
      </button>
      <button class="btn ghost" type="button" data-action="etf-screener-stop" id="etfScreenerStopBtn" ${s.running ? '' : 'hidden'}>
        ${ico('x', 'sm')}<span>停止</span>
      </button>
    </div>
    <div class="screener-progress" id="etfScreenerProgress" ${s.running ? '' : 'hidden'}>
      <div class="screener-progress-track"><i id="etfScreenerProgressBar" style="width:${s.progressPct}%"></i></div>
      <span id="etfScreenerProgressText">${esc(s.progressText)}</span>
    </div>
  </div>`;
}

function etfScreenerPageHTML() {
  return `
  <div class="screener-page">
    <section class="screener-hero">
      <span class="eyebrow"><i class="dot"></i>反向选股 · ETF 五维研判</span>
      <h1>从热门 ETF 里，<br><span>筛出高分标的。</span></h1>
      <p class="lede">取沪深成交额前列的场内 ETF，逐只运行与 ETF 研判页完全相同的五维评分引擎（技术动量 / 规模流动性 / 行业景气 / 量能换手 / 新闻舆情），按综合分降序排列。阈值可调，超过门槛的标的自动高亮。</p>
      <div class="screener-hero-note">${ico('info', 'sm')}ETF 无个股研报与财务数据，行业景气以主题行业研报代理；扫描受公开接口限流约束，逐只获取 K 线与舆情，已缓存数据直接复用。</div>
    </section>

    ${etfScreenerControlHTML()}

    <section class="screener-result" id="etfScreenerResult">
      ${etfScreenerIdleHTML()}
    </section>

    <div class="source-note screener-disclaimer">
      候选池：东方财富沪深场内基金（b:MK0021）成交额排行。评分口径与 ETF 研判页一致：技术 28% · 规模流动性 22% · 行业景气 20% · 量能换手 15% · 舆情 15%（缺失维度从权重剔除并施加覆盖惩罚）。高分仅代表公开数据在该口径下的相对优势，不构成投资建议。
    </div>
  </div>`;
}

function etfScreenerIdleHTML() {
  return `<div class="card screener-empty">${emptyState({
    icon: 'layers',
    title: '设置门槛后开始扫描',
    desc: '默认筛选综合分 80 分以上的 ETF。扫描结果按分数降序展示，可随时调整门槛查看不同区间。',
  })}</div>`;
}

function etfScreenerLoadingHTML() {
  return `<div class="card screener-empty">${loadingCard('正在拉取 ETF 榜单与五维数据…', 5)}</div>`;
}

/* 单只 ETF 候选的一行 */
function etfScreenerRowHTML(row, threshold) {
  const stock = row.stock || {};
  const quote = row.quote || {};
  const score = row.score || {};
  const total = Number.isFinite(score.total) ? score.total : null;
  const hit = total !== null && total >= threshold;
  const verdict = total !== null ? verdictFor(total) : { label: '数据不足', cls: 'muted' };
  const cls = hit ? 'hit' : total !== null ? 'miss' : 'nodata';
  const dims = Array.isArray(score.dims) ? score.dims : [];
  const dimCells = dims
    .map(
      (d) => `
      <div class="sd-cell" title="${esc(d.name)}${d.available ? `：${d.score} 分（${esc(d.note || '')}）` : '：数据不足'}">
        <span class="sd-label">${esc(d.short)}</span>
        <span class="sd-bar"><i class="${d.available ? scoreColorClass(d.score) : 'muted'}" style="width:${
          d.available ? clamp(d.score, 0, 100) : 0
        }%"></i></span>
        <span class="sd-num ${d.available ? '' : 'muted'}">${d.available ? d.score : '—'}</span>
      </div>`
    )
    .join('');
  const cap = num(row.boardMeta && row.boardMeta.marketCap);
  const capText = Number.isFinite(cap) ? (cap >= 1e8 ? (cap / 1e8).toFixed(1) + '亿' : (cap / 1e4).toFixed(0) + '万') : '—';
  return `
  <tr class="screener-row ${cls}" ${stockDataset(stock)}>
    <td class="sr-rank"><span class="rank-num ${hit ? 'gold' : ''}">${row.rank || '—'}</span>${hit ? '<span class="hit-mark">达标</span>' : ''}</td>
    <td class="sr-name">
      ${stockButton(stock, 'sr-stock-btn')}
      <span class="sr-meta">${esc(stock.code)} · ETF · ${esc(capText)}</span>
    </td>
    <td class="sr-price">
      <b class="${pctClass(quote.changePct)}">${fmtPrice(quote.price, quote.price < 10 ? 3 : 2)}</b>
      <span class="${pctClass(quote.changePct)}">${fmtPct(quote.changePct)}</span>
    </td>
    <td class="sr-score">
      <div class="sr-score-num ${scoreColorClass(total)}">${total === null ? '—' : total}</div>
      <span class="verdict-pill ${verdict.cls}">${esc(verdict.label)}</span>
    </td>
    <td class="sr-dims">${dimCells || '<span class="muted">—</span>'}</td>
    <td class="sr-cover"><span class="badge ${score.coverage === 100 ? 'teal' : ''}">${Number.isFinite(score.coverage) ? score.coverage + '%' : '—'}</span></td>
    <td class="sr-action"><button class="btn sm" type="button" data-action="etf-screener-open">查看研判 ${ico('arrow', 'sm')}</button></td>
  </tr>`;
}

/* 汇总 + 全榜（达标高亮 + 未达标降序保留） */
function etfScreenerResultsHTML(rows, threshold, meta = {}) {
  const list = rankScreenerRows(rows);
  const hits = filterScreenerRows(list, threshold);
  const scored = list.filter((r) => r && r.score && Number.isFinite(r.score.total));
  const best = scored.length ? scored[0].score.total : null;
  const avg = scored.length
    ? Math.round(scored.reduce((a, r) => a + r.score.total, 0) / scored.length)
    : null;
  const ranAt = meta.ranAt ? fmtDate(meta.ranAt, true) : '';
  const stopped = meta.stopped ? '<span class="badge orange">已停止</span>' : '';
  const summary = `
    <div class="screener-summary">
      <div class="ss-card"><span>扫描标的</span><b>${scored.length}</b><small>只${meta.candidates ? ` / 候选 ${meta.candidates}` : ''}</small></div>
      <div class="ss-card gold"><span>达标 (≥${threshold})</span><b>${hits.length}</b><small>只</small></div>
      <div class="ss-card teal"><span>最高分</span><b>${best === null ? '—' : best}</b><small>${best === null ? '' : esc(verdictFor(best).label)}</small></div>
      <div class="ss-card"><span>平均分</span><b>${avg === null ? '—' : avg}</b><small>全体候选</small></div>
    </div>`;
  const notice = hits.length
    ? `<div class="screener-notice ok">${ico('check', 'sm')}当前门槛 ${threshold} 分，共 <b>${hits.length}</b> 只 ETF 达标，已置顶高亮；下方保留全榜便于对照。</div>`
    : `<div class="screener-notice warn">${ico('info', 'sm')}当前门槛 ${threshold} 分下暂无达标 ETF，最高分为 <b>${best === null ? '—' : best}</b>。可下调门槛查看接近达标的标的，或按 ETF 榜单直接进入五维研判。</div>`;
  if (!list.length) {
    return `${summary}<div class="card screener-empty">${emptyState({
      icon: 'alert',
      title: '未能完成扫描',
      desc: meta.error || 'ETF 榜单或行情接口暂不可用，请稍后重试。',
    })}</div>`;
  }
  return `
    ${summary}
    <div class="screener-meta">${ico('clock', 'sm')}更新于 ${esc(ranAt)} · 门槛 ${threshold} 分${stopped}</div>
    ${notice}
    <div class="card screener-table-card">
      <div class="screener-table-scroll">
        <table class="screener-table etf-screener-table">
          <thead><tr>
            <th>#</th><th>ETF</th><th>现价 / 涨跌</th><th>综合分</th>
            <th>五维分（技术 / 规模 / 行业 / 量能 / 舆情）</th><th>覆盖</th><th></th>
          </tr></thead>
          <tbody>${list.map((r) => etfScreenerRowHTML(r, threshold)).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

/* 渲染整页（路由进入时） */
function renderEtfScreenerPage() {
  setViewHTML(etfScreenerPageHTML());
  document.title = 'ETF 高分榜 · 80 分以上 ETF · 研值 StockLens';
  syncTopbar('etf-screener');
  scrollTopSmooth();
}

/* 更新进度条与文字 */
function updateEtfScreenerProgress(done, total, row) {
  const s = state.etfScreener;
  const bar = $('#etfScreenerProgressBar');
  const text = $('#etfScreenerProgressText');
  const wrap = $('#etfScreenerProgress');
  if (wrap) wrap.hidden = false;
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  if (bar) bar.style.width = `${pct}%`;
  s.progressPct = pct;
  s.progressText = `已完成 ${done} / ${total} 只${row && row.stock ? ` · 最近：${row.stock.name}` : ''}`;
  if (text) text.textContent = s.progressText;
}

/* 仅更新结果区（扫描过程中增量刷新 / 阈值变更后重绘） */
function refreshEtfScreenerResult() {
  const box = $('#etfScreenerResult');
  if (!box) return;
  const s = state.etfScreener;
  box.innerHTML = s.rows.length
    ? etfScreenerResultsHTML(s.rows, s.threshold, { ranAt: s.ranAt, stopped: s.stopped, error: s.error })
    : loadingCard('正在获取 ETF 榜单与行情…', 4);
  hydrateIcons(box);
}

/* 更新门槛：只重绘结果，不重复请求 */
function updateEtfScreenerThreshold(value) {
  const v = clamp(Math.round(Number(value) || ETF_SCREENER_DEFAULT_THRESHOLD), 60, 95);
  state.etfScreener.threshold = v;
  const label = $('#etfScreenerThresholdVal');
  if (label) label.textContent = String(v);
  if (state.etfScreener.rows.length) refreshEtfScreenerResult();
}
