const copy = {
  zh: {
    queued: '排队中',
    connecting: '正在连接知识库',
    retrieving: '正在检索资料',
    composing: '正在组织回答',
    generating: '正在生成回答',
    done: '回答完成',
    history: '知识库回答',
    cancelled: '回答已停止',
    interrupted: '回答未完整结束',
    failed: '回答失败',
    seconds: value => `${value} 秒`,
    answer: value => `用时 ${value}`,
    elapsed: value => `已用时 ${value}`,
    wait: value => `等待 ${value}`,
  },
  en: {
    queued: 'Queued',
    connecting: 'Connecting to the knowledge base',
    retrieving: 'Retrieving sources',
    composing: 'Composing the answer',
    generating: 'Generating the answer',
    done: 'Answer complete',
    history: 'Knowledge base answer',
    cancelled: 'Answer stopped',
    interrupted: 'Answer incomplete',
    failed: 'Answer failed',
    seconds: value => `${value}s`,
    answer: value => `Duration ${value}`,
    elapsed: value => `Elapsed ${value}`,
    wait: value => `Wait ${value}`,
  },
};

export function formatElapsed(milliseconds, locale = 'zh') {
  const safe = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
  const seconds = safe / 1000;
  const value = seconds < 10 ? seconds.toFixed(1) : String(Math.round(seconds));
  return copy[locale === 'en' ? 'en' : 'zh'].seconds(value);
}

export function taskLifecycleTiming(task, previous = {}, now = performance.now(), wallNow = Date.now()) {
  const timestamp = value => {
    const ms = typeof value === 'string' && value.trim() ? Date.parse(value) : value;
    return Number.isFinite(ms) && ms > 0 && ms <= wallNow ? ms : null;
  };
  const created = timestamp(task.createdAt);
  const dispatched = [task.trace?.dispatchedAt, task.startedAt].map(timestamp)
    .find(value => value !== null && (created === null || value >= created));
  // Convert server wall-clock timestamps to the live timer's monotonic clock.
  const queuedAt = created === null ? (previous.queuedAt ?? now) : now - (wallNow - created);
  const queued = task.status === 'queued';
  const startedAt = queued ? null : dispatched !== undefined ? now - (wallNow - dispatched)
    : previous.startedAt ?? (task.status === 'running' ? now : null);
  const terminal = ['succeeded', 'failed', 'cancelled', 'indeterminate'].includes(task.status)
    ? timestamp(task.trace?.terminalAt) : null;
  const endedAt = terminal !== null && (created === null || terminal >= created)
    && (dispatched === undefined || terminal >= dispatched) ? now - (wallNow - terminal) : null;
  return { phase: startedAt === null ? 'queued' : previous.phase === 'generating' ? 'generating' : 'connecting',
    queuedAt, startedAt, endedAt, queueWaitMs: startedAt === null ? 0 : Math.max(0, startedAt - queuedAt) };
}

export function elapsedLifecycleTiming(timing, now = performance.now()) {
  const measuredAt = Number.isFinite(timing.endedAt) ? Math.min(now, timing.endedAt) : now;
  return { ...timing,
    elapsedMs: timing.startedAt === null ? 0 : Math.max(0, measuredAt - timing.startedAt),
    queueWaitMs: timing.startedAt === null ? Math.max(0, measuredAt - timing.queuedAt) : timing.queueWaitMs,
  };
}

export function lifecycleView({ phase = 'connecting', elapsedMs = 0, queueWaitMs = 0, outcome = '', locale = 'zh' } = {}) {
  const language = locale === 'en' ? 'en' : 'zh';
  const labels = copy[language];
  if (outcome === 'history') return { status: 'history', label: labels.history, details: '', settled: true };
  const settled = ['done', 'cancelled', 'interrupted', 'failed'].includes(outcome);
  const status = settled ? outcome : phase;
  const elapsed = formatElapsed(elapsedMs, language);
  if (phase === 'queued') return { status, label: labels[status],
    details: labels.wait(formatElapsed(queueWaitMs, language)), settled };
  const details = settled
    ? [queueWaitMs > 0 ? labels.wait(formatElapsed(queueWaitMs, language)) : '', labels.answer(elapsed)].filter(Boolean).join(' · ')
    : [queueWaitMs > 0 ? labels.wait(formatElapsed(queueWaitMs, language)) : '', labels.elapsed(elapsed)].filter(Boolean).join(' · ');
  return { status, label: labels[status] || labels.connecting, details, settled };
}
