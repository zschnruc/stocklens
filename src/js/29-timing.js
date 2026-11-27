/* ============================================================
   Timing — 择时信号层（方案 A）
   纯函数、零请求、零 DOM。只消费已缓存的 K 线与指标序列，
   输出「状态 + 事件 + 多周期共振」，不产出任何买卖类交易建议。
   分钟线按 FR-17.4 不参与技术研判，仅 day / week / month 进入共振判断。
   数据不足的维度标记 available:false，沿用 coverageMeta 的缺维折算口径。
   ============================================================ */
'use strict';

/* 参与多周期共振的周期（分钟线仅供图表，按 FR-17.4 排除） */
const TIMING_PERIODS = [
  { key: 'day', label: '日线' },
  { key: 'week', label: '周线' },
  { key: 'month', label: '月线' },
];

/* 事件标签按方向细分，避免「突破（偏空）」这类语义冲突 */
const TIMING_EVENT_META = {
  macdCross: { bullish: 'MACD 金叉', bearish: 'MACD 死叉' },
  kdjCross: { bullish: 'KDJ 金叉', bearish: 'KDJ 死叉' },
  bollBreak: { bullish: 'BOLL 突破上轨', bearish: 'BOLL 跌破下轨' },
};
function eventLabel(type, dir) {
  const m = TIMING_EVENT_META[type];
  return m ? (m[dir] || m.bullish) : type;
}

/* 与 analyzeTechnical 相同的清洗口径，保证事件日期与指标序列对齐 */
function timingRows(points) {
  return (Array.isArray(points) ? points : [])
    .map((p) => ({
      date: p && p.date,
      open: num(p && p.open),
      close: num(p && p.close),
      high: num(p && p.high),
      low: num(p && p.low),
      volume: num(p && p.volume, 0),
    }))
    .filter((p) => p.date && Number.isFinite(p.open) && Number.isFinite(p.close) && Number.isFinite(p.high) && Number.isFinite(p.low));
}

/* ---------- 1. 结构化事件：交叉 / 突破，带日期、方向与强度 ---------- */
function detectEvents(points) {
  const rows = timingRows(points);
  const n = rows.length;
  const events = [];
  const push = (type, i, dir, strength) => {
    events.push({
      type,
      label: eventLabel(type, dir),
      at: rows[i].date,
      index: i,
      barsAgo: n - 1 - i,
      dir,
      strength: Math.round(clamp(strength, 0, 100)),
    });
  };

  /* MACD：柱由负转正为金叉，由正转负为死叉；零轴同侧时强度更高 */
  if (n >= 35) {
    const closes = rows.map((p) => p.close);
    const macd = macdCalc(closes);
    const recent = macd.hist.slice(-Math.min(n, 60)).filter(Number.isFinite).map(Math.abs);
    const avgHist = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    for (let i = 1; i < n; i++) {
      const h = macd.hist[i];
      const prev = macd.hist[i - 1];
      if (!Number.isFinite(h) || !Number.isFinite(prev)) continue;
      const burst = clamp((Math.abs(h - prev) / (avgHist || 1)) * 8, 0, 12);
      if (prev <= 0 && h > 0) {
        const aboveZero = macd.dif[i] > 0 && macd.dea[i] > 0;
        push('macdCross', i, 'bullish', 62 + (aboveZero ? 12 : 0) + burst);
      } else if (prev >= 0 && h < 0) {
        const belowZero = macd.dif[i] < 0 && macd.dea[i] < 0;
        push('macdCross', i, 'bearish', 62 + (belowZero ? 12 : 0) + burst);
      }
    }
  }

  /* KDJ：K 上穿 D 为金叉（低位更强），下穿为死叉（高位更强） */
  if (n >= 15) {
    const kdj = kdjCalc(
      rows.map((p) => p.high),
      rows.map((p) => p.low),
      rows.map((p) => p.close)
    );
    for (let i = 1; i < n; i++) {
      const k = kdj.k[i], d = kdj.d[i];
      const pk = kdj.k[i - 1], pd = kdj.d[i - 1];
      if (pk <= pd && k > d) {
        push('kdjCross', i, 'bullish', 60 + clamp((50 - k) * 0.5, -10, 20));
      } else if (pk >= pd && k < d) {
        push('kdjCross', i, 'bearish', 60 + clamp((k - 50) * 0.5, -10, 20));
      }
    }
  }

  /* BOLL：收盘上穿上轨为突破，下穿下轨为跌破 */
  if (n >= 25) {
    const closes = rows.map((p) => p.close);
    const boll = bollCalc(closes);
    for (let i = 1; i < n; i++) {
      const c = closes[i], prev = closes[i - 1];
      const up = boll.up[i], low = boll.low[i];
      const upPrev = boll.up[i - 1], lowPrev = boll.low[i - 1];
      if (![up, low, upPrev, lowPrev].every(Number.isFinite)) continue;
      if (prev <= upPrev && c > up) {
        push('bollBreak', i, 'bullish', 62 + clamp((c / up - 1) * 400, 0, 20));
      } else if (prev >= lowPrev && c < low) {
        push('bollBreak', i, 'bearish', 62 + clamp((1 - c / low) * 400, 0, 20));
      }
    }
  }

  return events.sort((a, b) => a.index - b.index);
}

/* 阶段判定（独立纯函数，便于离线断言）：噪音 → 震荡；近期方向切换 → 转折；维度一致 → 趋势 */
function timingPhase(consensus, events) {
  const usable = consensus && consensus.available ? consensus : null;
  const latest = events.length ? events[events.length - 1] : null;
  const fresh = !!latest && latest.barsAgo <= 5;
  /* 震荡中 KDJ/MACD 会反复交叉：既看事件密度，也看方向是否来回切换，避免把噪音误标为转折 */
  const recent = events.filter((e) => e.barsAgo <= 20);
  const switches = recent.slice(1).filter((e, i) => e.dir !== recent[i].dir).length;
  const noisy = recent.length >= 8 && switches >= 4;

  let phase = 'range';
  let text = '维度分歧或方向中性，处于震荡整理';
  if (noisy) {
    text = `近 20 根出现 ${recent.length} 次交叉/突破、${switches} 次方向切换，信号频繁反复，处于震荡整理`;
  } else if (fresh && switches >= 1) {
    phase = 'turn';
    text = `近 ${latest.barsAgo} 根出现${latest.label}，且近期事件方向切换 ${switches} 次，短期动能转换中`;
  } else if (usable && usable.divergence <= 1 && usable.dir !== 'neutral') {
    phase = 'trend';
    text = `${usable.label}信号维度基本一致，处于趋势延续`;
  }
  return { phase, text, latest, switches, noisy };
}

/* ---------- 2. 单周期择时状态：阶段 + 信号一致性 + 事件新鲜度 ---------- */
function timingState(points) {
  const tech = analyzeTechnical(points);
  const c = tech.consensus;
  if (!c.available || tech.rows < 25) {
    return {
      available: false,
      phase: 'unavailable',
      consensus: { score: null, dir: 'unavailable', label: '数据不足' },
      divergence: null,
      rows: tech.rows,
      events: [],
      latest: null,
      note: '有效技术数据不足，暂不给出择时状态。',
      reasons: [],
    };
  }
  const events = detectEvents(points);
  const judged = timingPhase(c, events);
  const { phase, latest, switches, noisy } = judged;
  const phaseText = judged.text;
  const phaseLabel = phase === 'trend' ? '趋势延续' : phase === 'turn' ? '动能转换' : '震荡整理';
  const reasons = [
    `综合技术信号 ${c.score}，方向${c.label}，维度分歧度 ${c.divergence}。`,
    `${phaseText}。`,
  ];
  if (latest) {
    reasons.push(`最近事件：${latest.at} ${latest.label}（强度 ${latest.strength}），距今 ${latest.barsAgo} 根 K 线。`);
  } else {
    reasons.push('当前历史窗口内未检测到 MACD / KDJ 交叉或 BOLL 突破事件。');
  }
  return {
    available: true,
    phase,
    phaseLabel,
    consensus: { score: c.score, dir: c.dir, label: c.label },
    divergence: c.divergence,
    rows: tech.rows,
    events,
    latest,
    note: `${c.label} · ${phaseLabel}`,
    reasons,
  };
}

/* ---------- 3. 多周期共振：只用日 / 周 / 月，分钟线按 FR-17.4 排除 ---------- */
function multiPeriodAlignment(periodKlines) {
  const src = periodKlines && typeof periodKlines === 'object' && !Array.isArray(periodKlines) ? periodKlines : {};
  const periods = TIMING_PERIODS.map((meta) => {
    const s = timingState(src[meta.key]);
    return {
      key: meta.key,
      label: meta.label,
      available: s.available,
      score: s.consensus.score,
      dir: s.consensus.dir,
      phase: s.phase,
      note: s.note,
    };
  });
  const usable = periods.filter((p) => p.available && Number.isFinite(p.score));
  if (usable.length < 2) {
    return {
      available: false,
      score: null,
      dir: 'unavailable',
      agreement: null,
      periods,
      note: '可用周期不足 2 个，暂不判断跨周期共振。',
      reasons: [],
    };
  }
  const score = Math.round(usable.reduce((a, p) => a + p.score, 0) / usable.length);
  const dir = signalDir(score);
  const bulls = usable.filter((p) => p.dir === 'bullish').length;
  const bears = usable.filter((p) => p.dir === 'bearish').length;
  const agreement = Math.round((Math.max(bulls, bears) / usable.length) * 100);
  const reasons = usable.map(
    (p) => `${p.label} ${p.score} 分（${SIGNAL_META[p.dir].label}，${p.phase === 'trend' ? '趋势延续' : p.phase === 'turn' ? '动能转换' : '震荡整理'}）。`
  );
  reasons.push(`可用 ${usable.length} 个周期，方向一致度 ${agreement}%。`);
  return {
    available: true,
    score,
    dir,
    agreement,
    periods,
    note: `${usable.length} 周期共振 · 一致度 ${agreement}% · ${SIGNAL_META[dir].label}`,
    reasons,
  };
}

/* ---------- 4. 综合择时状态分：沿用 coverageMeta 缺维折算口径 ---------- */
function timingScore(state, alignment) {
  const s = state && state.available ? state : null;
  const a = alignment && alignment.available ? alignment : null;
  const reasons = [];
  let sum = 0;
  let weight = 0;
  if (s && Number.isFinite(s.consensus.score)) {
    sum += s.consensus.score * 0.4;
    weight += 0.4;
    reasons.push(`单周期状态 ${s.consensus.score}（权重 40%）。`);
  }
  if (a && Number.isFinite(a.score)) {
    sum += a.score * 0.6;
    weight += 0.6;
    reasons.push(`多周期共振 ${a.score}（权重 60%）。`);
  }
  if (!weight) {
    return {
      total: null,
      available: false,
      dir: 'unavailable',
      coverage: 0,
      comparable: false,
      note: '择时所需数据不足，暂不给出状态分。',
      reasons: [],
    };
  }
  const cov = coverageMeta(Math.round(weight * 100));
  const total = Math.round((sum / weight) * cov.factor);
  const dir = signalDir(total);
  const fresh = !!(s && s.latest && s.latest.barsAgo <= 5);
  if (fresh) {
    reasons.push(`近期出现${s.latest.label}，处于动能转换窗口。`);
  }
  if (cov.coverage < 100) {
    reasons.push(`可用信息覆盖 ${cov.coverage}%，已按覆盖度折算，不与满覆盖直接比较。`);
  }
  return {
    total,
    available: true,
    dir,
    label: SIGNAL_META[dir].label,
    coverage: cov.coverage,
    comparable: cov.comparable,
    note: `${SIGNAL_META[dir].label} · ${fresh ? '短期动能转换' : '状态平稳'} · 覆盖 ${cov.coverage}%`,
    reasons,
  };
}
