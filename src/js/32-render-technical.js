/* ============================================================
   Technical module renderer — 独立技术研判章节
   展示五维度信号矩阵、综合研判与各维度可解释依据。
   ============================================================ */
'use strict';

function techSignalBadge(dim) {
  const meta = SIGNAL_META[dim.dir] || SIGNAL_META.unavailable;
  return `<span class="tech-sig ${meta.cls}">${ico(dim.dir === 'bullish' ? 'trendUp' : dim.dir === 'bearish' ? 'trendDown' : 'info', 'sm')}${meta.label}</span>`;
}

/* 五维信号雷达：复用现有 radarPoints 思路，按维度方向映射为 0-100 的强度 */
function techRadarSVG(dims) {
  const usable = dims.filter((d) => d.available);
  if (usable.length < 3) return '';
  const cx = 118, cy = 108, r = 74;
  const vals = dims.map((d) => (d.available ? d.score : 0));
  const angle = (i) => (Math.PI * 2 * i) / dims.length - Math.PI / 2;
  const rings = [25, 50, 75, 100]
    .map((level) => `<polygon class="tech-radar-grid" points="${radarPoints(cx, cy, r, dims.map(() => level))}"></polygon>`)
    .join('');
  const axes = dims
    .map((_, i) => `<line class="tech-radar-axis" x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(angle(i)) * r).toFixed(1)}" y2="${(cy + Math.sin(angle(i)) * r).toFixed(1)}"></line>`)
    .join('');
  const consensusDir = signalDir(usable.reduce((a, d) => a + d.score, 0) / usable.length);
  const area = `<polygon class="tech-radar-area ${SIGNAL_META[consensusDir].cls}" points="${radarPoints(cx, cy, r, vals)}"></polygon>`;
  const dots = dims.map((d, i) => {
    const rr = r * (clamp(vals[i], 0, 100) / 100);
    return `<circle class="tech-radar-dot" cx="${(cx + Math.cos(angle(i)) * rr).toFixed(1)}" cy="${(cy + Math.sin(angle(i)) * rr).toFixed(1)}" r="2.8"></circle>`;
  }).join('');
  const labels = dims.map((d, i) => {
    const x = cx + Math.cos(angle(i)) * (r + 16);
    const y = cy + Math.sin(angle(i)) * (r + 14);
    const anchor = Math.abs(Math.cos(angle(i))) < 0.1 ? 'middle' : Math.cos(angle(i)) > 0 ? 'start' : 'end';
    return `<text class="tech-radar-label" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}">${esc(d.short)}</text>`;
  }).join('');
  return `<div class="tech-radar-wrap"><svg viewBox="0 0 236 226" role="img" aria-label="五维技术信号雷达图">${rings}${axes}${area}${dots}${labels}</svg></div>`;
}

/* 综合研判卡：得分环 + 结论 + 分歧提示 */
function techConsensusCard(result) {
  const c = result.consensus;
  if (!c.available) {
    return `<article class="card tech-consensus">
      <div class="card-kicker">${ico('pulse')}技术综合研判</div>
      <div class="tech-consensus-empty">${esc(c.summary)}</div>
    </article>`;
  }
  const meta = SIGNAL_META[c.dir];
  const usable = result.dims.filter((d) => d.available);
  const bulls = usable.filter((d) => d.dir === 'bullish').length;
  const bears = usable.filter((d) => d.dir === 'bearish').length;
  const neutrals = usable.length - bulls - bears;
  return `<article class="card tech-consensus">
    <div class="card-kicker">${ico('pulse')}技术综合研判 <span class="tech-source">基于 ${result.rows} 根日 K · 前复权</span></div>
    <div class="tech-consensus-main">
      <div class="tech-score-ring ${meta.cls}">
        <svg viewBox="0 0 132 132" role="img" aria-label="技术综合信号 ${c.score} 分">
          <circle class="tech-ring-track" cx="66" cy="66" r="55"></circle>
          <circle class="tech-ring-fill" cx="66" cy="66" r="55"
            stroke-dasharray="${((c.score / 100) * 2 * Math.PI * 55).toFixed(1)} ${(2 * Math.PI * 55).toFixed(1)}"></circle>
        </svg>
        <div class="tech-score-inner"><strong>${c.score}</strong><span>${esc(c.label)}</span></div>
      </div>
      <div class="tech-consensus-text">
        <p>${esc(c.summary)}</p>
        <div class="tech-votes">
          <span class="bullish">偏多 ${bulls}</span>
          <span class="neutral">中性 ${neutrals}</span>
          <span class="bearish">偏空 ${bears}</span>
          <span class="muted">可用 ${usable.length}/${result.dims.length}</span>
        </div>
        <div class="tech-divergence ${c.divergence >= 2 ? 'warn' : ''}">
          ${ico(c.divergence >= 2 ? 'alert' : 'shield', 'sm')}
          ${c.divergence >= 2 ? `维度分歧度 ${c.divergence}，信号一致性较弱，请谨慎解读` : '维度信号一致性较好'}
        </div>
      </div>
    </div>
  </article>`;
}

/* 单维度详细卡片 */
function techDimCard(dim) {
  const head = `<div class="tech-dim-head">
    <span class="tech-dim-icon">${ico(dim.icon)}</span>
    <div class="tech-dim-title"><h4>${esc(dim.name)}</h4><p>${esc(dim.desc)}</p></div>
    ${dim.available ? `<div class="tech-dim-score ${SIGNAL_META[dim.dir].cls}"><b>${dim.score}</b><small>/100</small></div>` : ''}
  </div>`;
  if (!dim.available) {
    return `<article class="card tech-dim unavailable">
      ${head}
      <p class="tech-unavailable">${esc(dim.reason || '数据不足，本维度不计入研判')}</p>
    </article>`;
  }
  const details = (dim.details || [])
    .map((line) => `<li>${esc(line)}</li>`)
    .join('');
  return `<article class="card tech-dim ${SIGNAL_META[dim.dir].cls}">
    ${head}
    <div class="tech-dim-signal">${techSignalBadge(dim)}<span>${esc(dim.note || '')}</span></div>
    <ul class="tech-details">${details}</ul>
  </article>`;
}

/* ---------- 择时状态卡（方案 A）：消费已缓存 K 线，零新增请求 ----------
   阶段 / 方向 / 共振 / 事件全部来自 29-timing.js 的纯函数输出；
   文案为状态描述，不产出买入卖出类建议（FR-14.7）。 */
/* 阶段徽章配色：仅趋势延续携带方向色，动能转换/震荡整理为中性状态（金色） */
function timingPhaseClass(phase, dir) {
  if (phase !== 'trend') return 'neutral';
  return (SIGNAL_META[dir] || SIGNAL_META.unavailable).cls;
}

function timingStatusCard(periodKlines) {
  const src = periodKlines && typeof periodKlines === 'object' ? periodKlines : {};
  const pointsOf = (v) => (v && Array.isArray(v.points) ? v.points : null);
  const state = timingState(pointsOf(src.day));
  const align = multiPeriodAlignment({
    day: pointsOf(src.day),
    week: pointsOf(src.week),
    month: pointsOf(src.month),
  });
  const score = timingScore(state, align);
  const kicker = `<div class="card-kicker">${ico('compass')}择时状态 <span class="tech-source">日线信号 · 日/周/月共振</span></div>`;

  if (!state.available) {
    return `<article class="card timing-card">
      ${kicker}
      <div class="timing-empty">${esc(state.note)} 现有研判与行情模块不受影响。</div>
    </article>`;
  }

  const dir = state.consensus.dir;
  const meta = SIGNAL_META[dir] || SIGNAL_META.unavailable;
  const phaseIcon = state.phase === 'trend' ? 'trendUp' : state.phase === 'turn' ? 'activity' : 'layers';
  const metric = (label, value, cls) => `<div class="timing-metric"><div class="timing-metric-label">${label}</div><div class="timing-metric-value ${cls}">${value}</div></div>`;
  const alignScore = align.available ? align.score : '—';
  const alignCls = align.available ? SIGNAL_META[align.dir].cls : 'unavailable';
  const agreement = align.available ? `${align.agreement}%` : '—';
  const agreementCls = !align.available ? 'unavailable' : align.agreement >= 67 ? meta.cls : 'neutral';
  const latest = state.latest;
  const eventHtml = latest
    ? `<div class="timing-event"><span class="timing-event-tag ${SIGNAL_META[latest.dir].cls}">${esc(latest.label)}</span><span>强度 ${latest.strength} · 距今 ${latest.barsAgo} 根日 K（${esc(latest.at)}）</span></div>`
    : '<div class="timing-event"><span class="timing-event-tag">暂无事件</span><span>当前窗口未检测到交叉或突破</span></div>';
  const phaseCls = timingPhaseClass(state.phase, dir);

  return `<article class="card timing-card">
    ${kicker}
    <div class="timing-head">
      <span class="timing-phase ${phaseCls}">${ico(phaseIcon, 'sm')}${esc(state.phaseLabel)}</span>
      <span class="timing-dir">${esc(state.note)} · ${esc(score.available ? `状态分 ${score.total}（覆盖 ${score.coverage}%）` : '状态分暂不可用')}</span>
    </div>
    <p class="timing-summary">${esc(state.reasons[1] || state.reasons[0] || '')}</p>
    <div class="timing-metrics">
      ${metric('日线状态', state.consensus.score, meta.cls)}
      ${metric('跨周期共振', alignScore, alignCls)}
      ${metric('方向一致度', agreement, agreementCls)}
    </div>
    ${eventHtml}
    <p class="timing-note">${align.available ? esc(align.note) : '周线 / 月线尚未加载，跨周期共振暂不可用。'} 以上为基于历史价格的机械化状态描述，存在滞后与钝化可能，不构成买卖建议。</p>
  </article>`;
}

/* 更新已渲染章节（K 线到达后异步调用） */
function updateTechnicalSection(result) {
  const slot = $('#technicalSlot');
  if (!slot) return;
  slot.innerHTML = renderTechnicalSectionInner(result);
  hydrateIcons(slot);
}

/* 渲染 section 内部：综合卡 + 雷达 + 五维详情 */
function renderTechnicalSectionInner(result) {
  const isCommodity = !!(state.stock && (state.stock.kind === 'commodity' || state.stock.market === 'COMMODITY'));
  if (!result) {
    return emptyState({
      icon: 'chart',
      title: '技术数据暂不可用',
      desc: isCommodity
        ? '历史 K 线数据不足，无法生成技术研判。商品行情与价格 K 线不受影响。'
        : '历史 K 线数据不足，无法生成技术研判。行情、研报与新闻等其他模块不受影响。',
    });
  }
  return `${techConsensusCard(result)}
    ${timingStatusCard(state.periodKlines)}
    <div class="tech-overview-grid">
      ${techRadarSVG(result.dims) ? `<article class="card tech-radar-card"><div class="card-kicker">${ico('target')}信号雷达</div>${techRadarSVG(result.dims)}</article>` : ''}
      <article class="card tech-summary-card">
        <div class="card-kicker">${ico('spark')}研判说明</div>
        <ul class="tech-summary-list">
          ${result.dims.map((d) => `<li><span class="tech-sum-dot ${SIGNAL_META[d.dir].cls}"></span><b>${esc(d.short)}</b>${d.available ? `${esc(SIGNAL_META[d.dir].label)} · ${d.score} 分` : '数据不足'}</li>`).join('')}
        </ul>
        <p class="tech-note">五维度等权合成综合信号；数据不足的维度自动剔除。技术指标基于历史价格的机械化计算，存在滞后与钝化可能，不构成买卖建议。</p>
      </article>
    </div>
    <div class="tech-dim-grid">${result.dims.map(techDimCard).join('')}</div>
    <div class="source-note" style="margin-top:12px">计算口径：MA(5/10/20/60) · MACD(12,26,9) · RSI(6,12) · KDJ(9,3,3) · BOLL(20,2) · OBV · 量比(5/20)。全部基于${isCommodity ? '商品连续合约日 K' : '前复权日 K'}本地计算，无额外网络请求。</div>`;
}
