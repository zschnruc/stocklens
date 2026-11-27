/* ============================================================
   Timing Workbench renderer — 择时工作台（方案 C）
   输入：自选股池（sl:watchlist）+ 已缓存的日/周/月 K 线
   输出：跨周期共振排名 + 信号事件流。全部为状态描述，不含交易建议。
   ============================================================ */
'use strict';

function timingWorkbenchControlHTML() {
  const w = state.timingWorkbench;
  return `
  <div class="tw-controls card">
    <div class="tw-control-main">
      <div class="tw-pool-info">
        <span class="tw-pool-label">研判范围</span>
        <b id="twPoolCount">${w.pool.length} 只自选股</b>
        <span class="tw-pool-hint">日 / 周 / 月三周期 · 分钟线不参与</span>
      </div>
      <button class="btn primary" type="button" data-action="timing-workbench-run" id="twRunBtn">
        ${ico('compass', 'sm')}<span>${w.running ? '研判中…' : '开始研判'}</span>
      </button>
      <button class="btn ghost" type="button" data-action="timing-workbench-stop" id="twStopBtn" ${w.running ? '' : 'hidden'}>
        ${ico('x', 'sm')}<span>停止</span>
      </button>
    </div>
    <div class="tw-progress" id="twProgress" ${w.running ? '' : 'hidden'}>
      <div class="tw-progress-track"><i id="twProgressBar" style="width:${w.progressPct}%"></i></div>
      <span id="twProgressText">${esc(w.progressText)}</span>
    </div>
  </div>`;
}

function timingWorkbenchPageHTML() {
  return `
  <div class="tw-page">
    <section class="tw-hero">
      <span class="eyebrow"><i class="dot"></i>择时工作台 · 自选股批量共振</span>
      <h1>把自选股放在<br><span>同一张择时表上。</span></h1>
      <p class="lede">对自选股池逐只取日 / 周 / 月 K 线，运行与技术研判页相同的择时信号层，按跨周期共振度排名，给出机械化操作观点，并汇总近期交叉与突破事件。仅供自用参考。</p>
      <div class="tw-hero-note">${ico('info', 'sm')}三周期接口逐只获取，受公开行情接口限流约束；已缓存数据直接复用。低覆盖标的一律「观望待确认」，排在满覆盖之后，不与满覆盖分数混排。</div>
    </section>

    ${timingWorkbenchControlHTML()}

    <section class="tw-summary" id="twSummary">
      ${timingWorkbenchSummaryHTML([])}
    </section>

    <section class="tw-result" id="twResult">
      ${timingWorkbenchIdleHTML()}
    </section>

    <section class="tw-events" id="twEvents">
      ${timingWorkbenchEventsHTML([])}
    </section>

    <div class="source-note tw-disclaimer">
      口径：单周期状态 40% + 跨周期共振 60%，缺维按覆盖度折算；仅日 / 周 / 月三周期齐全者可比，低覆盖一律观望待确认。操作观点为基于历史价格的机械化分档（≥78 买入 / ≥62 增持 / 38–61 持有 / ≤38 减持 / ≤22 卖出），仅供自用参考，不含收益承诺或目标价，不构成投资建议。市场有风险，投资需谨慎。
    </div>
  </div>`;
}

function timingWorkbenchIdleHTML() {
  const w = state.timingWorkbench;
  if (!w.pool.length) {
    return `<div class="card tw-empty">${emptyState({
      icon: 'star',
      title: '自选股池为空',
      desc: '请先在个股研判页点击「加自选」，再回到本页运行批量择时。自选股上限 20 只。',
    })}</div>`;
  }
  return `<div class="card tw-empty">${emptyState({
    icon: 'compass',
    title: '点击「开始研判」生成共振排名',
    desc: '将对池内每只标的获取日 / 周 / 月 K 线，逐只计算择时状态与事件，结果按共振度排序。',
  })}</div>`;
}

function timingWorkbenchSummaryHTML(rows) {
  const s = timingSummary(rows);
  if (!s.total) {
    return `<div class="tw-summary-grid">
      <div class="tw-sum-cell"><span>已研判</span><b>—</b></div>
      <div class="tw-sum-cell"><span>满覆盖可比</span><b>—</b></div>
      <div class="tw-sum-cell"><span>买入 / 增持</span><b>—</b></div>
      <div class="tw-sum-cell"><span>减持 / 卖出</span><b>—</b></div>
    </div>`;
  }
  const c = s.adviceCounts;
  return `<div class="tw-summary-grid">
    <div class="tw-sum-cell"><span>已研判</span><b>${s.total}</b></div>
    <div class="tw-sum-cell"><span>满覆盖可比</span><b>${s.comparable}</b></div>
    <div class="tw-sum-cell"><span>买入 / 增持</span><b class="bullish">${c.strongBuy + c.buy}</b></div>
    <div class="tw-sum-cell"><span>减持 / 卖出</span><b class="bearish">${c.reduce + c.sell}</b></div>
  </div><p class="tw-summary-note">${esc(s.note)} · 观望待确认 ${c.watch} · 持有/观望 ${c.hold} · 平均状态分 ${s.avg === null ? '—' : s.avg} · 动能转换 ${s.turns}</p>`;
}

/* 排名表：一行一只标的，低覆盖行加 muted 标记 */
function timingWorkbenchRowHTML(row) {
  const stock = row.stock || {};
  const dirCls = row.available ? (SIGNAL_META[row.dir] || SIGNAL_META.unavailable).cls : 'unavailable';
  const phaseCls = row.available ? timingPhaseClass(row.phase, row.dir) : 'unavailable';
  const scoreText = row.available ? row.total : '—';
  const alignText = row.available
    ? (row.align && row.align.available ? `${row.align.score} · ${row.align.agreement}%` : '—')
    : '—';
  const latest = row.latest;
  const eventText = latest ? `${latest.label} · ${latest.barsAgo} 根前` : '暂无事件';
  const covText = row.available ? `${row.coverage}%${row.comparable ? '' : '（不可比）'}` : '—';
  const advice = row.advice || timingAdvice(row.score, row.state);
  return `<tr class="${row.comparable ? '' : 'tw-row-muted'}">
    <td class="tw-rank">${row.rank || '—'}</td>
    <td class="tw-name">
      <a href="#/stock/${esc(stock.market)}/${esc(stock.code)}" title="打开个股研判">${esc(stock.name || stock.code)}</a>
      <small>${esc(stock.market)} · ${esc(stock.code)}</small>
    </td>
    <td class="tw-advice-cell ${advice.cls}"><b>${esc(advice.label)}</b></td>
    <td class="${dirCls}"><b>${scoreText}</b></td>
    <td>${esc(covText)}</td>
    <td class="${phaseCls}">${esc(row.phaseLabel || '数据不足')}</td>
    <td>${esc(alignText)}</td>
    <td class="tw-event-cell">${esc(eventText)}</td>
  </tr>`;
}

function timingWorkbenchResultsHTML(rows) {
  const ranked = rankTimingRows(rows);
  return `<div class="card tw-table-card">
    <div class="tw-table-head"><b>跨周期共振排名</b><span>${ranked.length} 只 · 满覆盖优先</span></div>
    <div class="tw-table-wrap">
      <table class="tw-table">
        <thead><tr><th>#</th><th>标的</th><th>操作观点</th><th>状态分</th><th>覆盖</th><th>阶段</th><th>共振 · 一致度</th><th>最近事件</th></tr></thead>
        <tbody>${ranked.map(timingWorkbenchRowHTML).join('')}</tbody>
      </table>
    </div>
  </div>`;
}

/* 信号事件流：按距今根数升序，跨标的汇总 */
function timingWorkbenchEventsHTML(events) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) {
    return `<div class="tw-events-head"><b>信号事件流</b><span>按距今根数排序</span></div>
      <div class="card tw-events-empty">${emptyState({
        icon: 'activity',
        title: '暂无可展示的事件',
        desc: '运行研判后，将汇总各标的近期的 MACD / KDJ 交叉与 BOLL 突破事件。',
      })}</div>`;
  }
  return `<div class="tw-events-head"><b>信号事件流</b><span>最近 ${list.length} 条 · 按距今根数排序</span></div>
    <div class="tw-event-list">${list.map((e) => `
      <div class="tw-event-row">
        <span class="tw-event-tag ${(SIGNAL_META[e.dir] || SIGNAL_META.unavailable).cls}">${esc(e.label)}</span>
        <span class="tw-event-stock">${esc(e.name)} <small>${esc(e.market)} · ${esc(e.code)}</small></span>
        <span class="tw-event-meta">强度 ${e.strength} · 距今 ${e.barsAgo} 根 · ${esc(e.at)}</span>
      </div>`).join('')}</div>`;
}

/* 渲染整页（路由进入时） */
function renderTimingWorkbenchPage() {
  setViewHTML(timingWorkbenchPageHTML());
  document.title = '择时工作台 · 自选股共振排名 · 研值 StockLens';
  syncTopbar('timing');
  scrollTopSmooth();
}

/* 更新进度条与文字 */
function updateTimingWorkbenchProgress(done, total, row) {
  const w = state.timingWorkbench;
  const bar = $('#twProgressBar');
  const text = $('#twProgressText');
  const wrap = $('#twProgress');
  if (wrap) wrap.hidden = false;
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  if (bar) bar.style.width = `${pct}%`;
  w.progressPct = pct;
  w.progressText = `已完成 ${done} / ${total} 只${row && row.stock ? ` · 最近：${row.stock.name}` : ''}`;
  if (text) text.textContent = w.progressText;
}

/* 增量刷新结果 / 汇总 / 事件流 */
function refreshTimingWorkbench() {
  const w = state.timingWorkbench;
  const resultBox = $('#twResult');
  if (resultBox) {
    resultBox.innerHTML = w.rows.length
      ? timingWorkbenchResultsHTML(w.rows)
      : (w.running ? loadingCard('正在获取三周期 K 线并计算择时状态…', 4) : timingWorkbenchIdleHTML());
    hydrateIcons(resultBox);
  }
  const sumBox = $('#twSummary');
  if (sumBox) {
    sumBox.innerHTML = timingWorkbenchSummaryHTML(w.rows);
    hydrateIcons(sumBox);
  }
  const eventBox = $('#twEvents');
  if (eventBox) {
    eventBox.innerHTML = timingWorkbenchEventsHTML(collectTimingEvents(w.rows, 12));
    hydrateIcons(eventBox);
  }
  const pool = $('#twPoolCount');
  if (pool) pool.textContent = `${w.pool.length} 只自选股`;
}

function syncTimingWorkbenchButtons(running) {
  const runBtn = $('#twRunBtn');
  const stopBtn = $('#twStopBtn');
  const prog = $('#twProgress');
  if (runBtn) {
    runBtn.disabled = running;
    const label = runBtn.querySelector('span:last-child');
    if (label) label.textContent = running ? '研判中…' : '开始研判';
  }
  if (stopBtn) stopBtn.hidden = !running;
  if (prog) prog.hidden = !running;
}
