/* ============================================================
   Screener renderer — 高分榜（反向选股）
   ============================================================ */
'use strict';

function screenerControlHTML() {
  const s = state.screener;
  return `
  <div class="screener-controls card">
    <div class="screener-control-main">
      <label class="screener-range">
        <span>综合分门槛 <b id="screenerThresholdVal">${s.threshold}</b> 分</span>
        <input type="range" id="screenerThreshold" min="60" max="95" step="1" value="${s.threshold}"
          aria-label="综合分门槛">
        <span class="range-hint">60 — 95 分</span>
      </label>
      <label class="screener-size">
        <span>候选池</span>
        <select id="screenerSize" aria-label="热门榜单候选数量">
          ${[20, 40, 60]
            .map((n) => `<option value="${n}" ${n === s.size ? 'selected' : ''}>成交额前 ${n} 只</option>`)
            .join('')}
        </select>
      </label>
      <button class="btn primary" type="button" data-action="screener-run" id="screenerRunBtn">
        ${ico('spark', 'sm')}<span>${s.running ? '扫描中…' : '开始扫描'}</span>
      </button>
      <button class="btn ghost" type="button" data-action="screener-stop" id="screenerStopBtn" ${s.running ? '' : 'hidden'}>
        ${ico('x', 'sm')}<span>停止</span>
      </button>
    </div>
    <div class="screener-progress" id="screenerProgress" ${s.running ? '' : 'hidden'}>
      <div class="screener-progress-track"><i id="screenerProgressBar" style="width:${s.progressPct}%"></i></div>
      <span id="screenerProgressText">${esc(s.progressText)}</span>
    </div>
  </div>`;
}

function screenerPageHTML() {
  return `
  <div class="screener-page">
    <section class="screener-hero">
      <span class="eyebrow"><i class="dot"></i>反向选股 · 批量研判</span>
      <h1>从热门股里，<br><span>筛出高分标的。</span></h1>
      <p class="lede">取沪深 A 股成交额前列的股票，逐只运行与个股研判页完全相同的四维评分引擎，按综合分降序排列。阈值可调，超过门槛的标的自动高亮。</p>
      <div class="screener-hero-note">${ico('info', 'sm')}扫描受公开接口限流约束，逐只串行获取研报与财务数据，通常需 1–3 分钟；已缓存的数据会直接复用。</div>
    </section>

    ${screenerControlHTML()}

    <section class="screener-result" id="screenerResult">
      ${screenerIdleHTML()}
    </section>

    <div class="source-note screener-disclaimer">
      候选池：东方财富沪深 A 股成交额排行（剔除 ST / 退市）。评分口径与个股研判页一致：研报 30% · 盈利成长 25% · 技术动量 25% · 新闻舆情 20%（缺失维度从权重中剔除）。高分仅代表公开数据在该口径下的相对优势，不构成投资建议。
    </div>
  </div>`;
}

function screenerIdleHTML() {
  return `<div class="card screener-empty">${emptyState({
    icon: 'filter',
    title: '设置门槛后开始扫描',
    desc: '默认筛选综合分 80 分以上的 A 股。扫描结果按分数降序展示，可随时调整门槛查看不同区间。',
  })}</div>`;
}

function screenerLoadingHTML() {
  return `<div class="card screener-empty">${loadingCard('正在拉取热门榜单与四维数据…', 5)}</div>`;
}

/* 单只候选股的一行 */
function screenerRowHTML(row, threshold) {
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
  return `
  <tr class="screener-row ${cls}" ${stockDataset(stock)}>
    <td class="sr-rank"><span class="rank-num ${hit ? 'gold' : ''}">${row.rank || '—'}</span>${hit ? '<span class="hit-mark">达标</span>' : ''}</td>
    <td class="sr-name">
      ${stockButton(stock, 'sr-stock-btn')}
      <span class="sr-meta">${esc(stock.code)} · ${esc(stock.name)}</span>
    </td>
    <td class="sr-price">
      <b class="${pctClass(quote.changePct)}">${fmtPrice(quote.price)}</b>
      <span class="${pctClass(quote.changePct)}">${fmtPct(quote.changePct)}</span>
    </td>
    <td class="sr-score">
      <div class="sr-score-num ${scoreColorClass(total)}">${total === null ? '—' : total}</div>
      <span class="verdict-pill ${verdict.cls}">${esc(verdict.label)}</span>
    </td>
    <td class="sr-dims">${dimCells || '<span class="muted">—</span>'}</td>
    <td class="sr-cover"><span class="badge ${score.coverage === 100 ? 'teal' : ''}" title="${score.coverage === 100 ? '权重覆盖 100%' : `权重覆盖 ${score.coverage}% · 综合分已按覆盖度折算，不宜横向比较`}">${Number.isFinite(score.coverage) ? score.coverage + '%' : '—'}</span></td>
    <td class="sr-action"><button class="btn sm" type="button" data-action="screener-open">查看研判 ${ico('arrow', 'sm')}</button></td>
  </tr>`;
}

/* 汇总 + 全榜（达标高亮 + 未达标降序保留） */
function screenerResultsHTML(rows, threshold, meta = {}) {
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
    ? `<div class="screener-notice ok">${ico('check', 'sm')}当前门槛 ${threshold} 分，共 <b>${hits.length}</b> 只达标，已置顶高亮；下方保留全榜便于对照。</div>`
    : `<div class="screener-notice warn">${ico('info', 'sm')}当前门槛 ${threshold} 分下暂无达标标的，最高分为 <b>${best === null ? '—' : best}</b>。可下调左侧门槛查看接近达标的股票。</div>`;
  if (!list.length) {
    return `${summary}<div class="card screener-empty">${emptyState({
      icon: 'alert',
      title: '未能完成扫描',
      desc: (meta.error || '热门榜单或行情接口暂不可用，请稍后重试。'),
    })}</div>`;
  }
  return `
    ${summary}
    <div class="screener-meta">${ico('clock', 'sm')}更新于 ${esc(ranAt)} · 门槛 ${threshold} 分${stopped}</div>
    ${notice}
    <div class="card screener-table-card">
      <div class="screener-table-scroll">
        <table class="screener-table">
          <thead><tr>
            <th>#</th><th>股票</th><th>现价 / 涨跌</th><th>综合分</th>
            <th>四维分（研报 / 盈利 / 技术 / 舆情）</th><th>覆盖</th><th></th>
          </tr></thead>
          <tbody>${list.map((r) => screenerRowHTML(r, threshold)).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

/* 渲染整页（路由进入时） */
function renderScreenerPage() {
  setViewHTML(screenerPageHTML());
  document.title = '高分榜 · 80 分以上 A 股 · 研值 StockLens';
  syncTopbar('screener');
  scrollTopSmooth();
}

/* 更新进度条与文字 */
function updateScreenerProgress(done, total, row) {
  const s = state.screener;
  const bar = $('#screenerProgressBar');
  const text = $('#screenerProgressText');
  const wrap = $('#screenerProgress');
  if (wrap) wrap.hidden = false;
  if (bar) bar.style.width = `${Math.round((done / Math.max(total, 1)) * 100)}%`;
  s.progressPct = Math.round((done / Math.max(total, 1)) * 100);
  s.progressText = `已完成 ${done} / ${total} 只${row && row.stock ? ` · 最近：${row.stock.name}` : ''}`;
  if (text) text.textContent = s.progressText;
}

/* 仅更新结果区（扫描过程中增量刷新 / 阈值变更后重绘） */
function refreshScreenerResult() {
  const box = $('#screenerResult');
  if (!box) return;
  const s = state.screener;
  box.innerHTML = s.rows.length
    ? screenerResultsHTML(s.rows, s.threshold, { ranAt: s.ranAt, stopped: s.stopped, error: s.error })
    : loadingCard('正在获取候选池与行情…', 4);
  hydrateIcons(box);
}

/* 更新门槛：只重绘结果，不重复请求 */
function updateScreenerThreshold(value) {
  const v = clamp(Math.round(Number(value) || SCREENER_DEFAULT_THRESHOLD), 60, 95);
  state.screener.threshold = v;
  const label = $('#screenerThresholdVal');
  if (label) label.textContent = String(v);
  if (state.screener.rows.length) refreshScreenerResult();
}
