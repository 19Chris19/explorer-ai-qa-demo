const terminalStates = new Set(['succeeded', 'failed', 'cancelled', 'indeterminate']);
const taskStates = new Set(['queued', 'running', ...terminalStates]);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_:.-]{1,200}$/.test(value);
export const isTerminalTask = task => terminalStates.has(task?.status);
const fault = (code, status) => Object.assign(new Error(code), { code, status });

// Replay still consumes every event; only painting its accumulated value is batched.
export function createFrameUpdater(render, {
  schedule = globalThis.requestAnimationFrame.bind(globalThis),
  cancel = globalThis.cancelAnimationFrame.bind(globalThis),
} = {}) {
  let frame = null; let pending; let dirty = false; let disposed = false;
  const flush = () => {
    if (frame !== null) cancel(frame);
    frame = null;
    if (!dirty || disposed) return;
    dirty = false;
    render(pending);
    pending = undefined;
  };
  return {
    schedule(value) {
      if (disposed) return;
      pending = value; dirty = true;
      if (frame === null) frame = schedule(flush);
    },
    flush,
    dispose() { disposed = true; dirty = false; pending = undefined; if (frame !== null) cancel(frame); frame = null; },
  };
}

export function createTaskStore(storage, key) {
  let rows = [];
  const clean = row => row && validId(row.conversationId) && (validId(row.requestId) || validId(row.id))
    && (!row.id || validId(row.id)) ? {
      conversationId: row.conversationId, ...(validId(row.requestId) ? { requestId: row.requestId } : {}),
      ...(row.id ? { id: row.id } : {}), ...(validId(row.jobId) ? { jobId: row.jobId } : {}),
      ...(row.queue === true ? { queue: true } : {}),
    } : null;
  try {
    const saved = JSON.parse(storage?.getItem(key) || '[]');
    if (Array.isArray(saved)) rows = saved.map(clean).filter(Boolean).slice(-100);
  } catch { /* Storage can be blocked or contain an older format. */ }
  const save = () => { try { storage?.setItem(key, JSON.stringify(rows)); } catch { /* In-memory resume still works. */ } };
  return {
    list: () => rows.map(row => ({ ...row })),
    remember(row) {
      const safe = clean(row);
      if (!safe) return;
      const existing = rows.find(item => (safe.requestId && item.requestId === safe.requestId) || (safe.id && item.id === safe.id));
      rows = [...rows.filter(item => item !== existing), { ...existing, ...safe }].slice(-100);
      save();
    },
    forget(identity) { rows = rows.filter(row => row.requestId !== identity && row.id !== identity && row.jobId !== identity); save(); },
  };
}

// The cursor belongs to this in-memory replay, never to a separately saved answer.
export function createTaskReplay(task) {
  let events = new Map();
  let cursor = 0;
  const ingest = event => {
    if (!Number.isSafeInteger(event?.id) || event.id < 1 || typeof event.event !== 'string'
      || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw fault('invalid_event');
    if (event.id <= cursor) return;
    if (event.id !== cursor + 1) throw fault('cursor_gap');
    events.set(event.id, event);
    cursor = event.id;
  };
  const view = () => {
    let text = '', sources = [], sourceCount = 0, done = null, error = false;
    const process = [];
    let current = { ...task };
    for (const { event, data = {} } of events.values()) {
      if (event === 'delta' && typeof data.text === 'string') text += data.text;
      if (event === 'sources') { sources = Array.isArray(data.sources) ? data.sources : []; sourceCount = data.sourceCount ?? sources.length; }
      if (event === 'process') process.push(data);
      if (event === 'done') done = data;
      if (event === 'error') error = true;
      if (event === 'task.status' && taskStates.has(data.status)) current.status = data.status;
    }
    // Snapshot metadata is newer than the events it contains.
    if (isTerminalTask(task)) current.status = task.status;
    return { task: current, cursor, text, sources, sourceCount, process, done, error };
  };
  return {
    event(event) { ingest(event); return view(); },
    snapshot(data) {
      if (data?.task?.id !== task.id || data.task.conversationId !== task.conversationId
        || !taskStates.has(data.task.status) || !Array.isArray(data.snapshot?.events)) throw fault('invalid_snapshot');
      const incoming = data.snapshot.events;
      // Full snapshots are authoritative; suffix snapshots may only extend a known prefix.
      if (incoming[0]?.id === 1 && incoming.at(-1).id >= cursor) {
        const previous = events, previousCursor = cursor;
        events = new Map(); cursor = 0;
        try { for (const event of incoming) ingest(event); }
        catch (error) { events = previous; cursor = previousCursor; throw error; }
      } else {
        for (const event of incoming) ingest(event);
      }
      task = { ...task, ...data.task };
      return view();
    },
    view,
  };
}

export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(fault('detached'));
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(fault('detached')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createTaskClient({ fetch: request = globalThis.fetch, path = value => value, store,
  delay = abortableDelay, heartbeatTimeoutMs = 45000, requestTimeoutMs = 20000 } = {}) {
  const endpoint = id => path(`/api/qa/tasks${id ? `/${encodeURIComponent(id)}` : ''}`);
  async function json(url, options = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(abort, requestTimeoutMs);
    try {
      const response = await request(url, { ...options, signal: controller.signal,
        headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
      if (!response.ok) throw fault('request_failed', response.status);
      return await response.json();
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  }
  const list = async (conversationId, signal) => {
    const data = await json(`${endpoint()}${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`, { signal });
    if (!Array.isArray(data.tasks)) throw fault('invalid_task_list');
    return data.tasks.filter(item => validId(item.id) && taskStates.has(item.status)
      && (!conversationId || item.conversationId === conversationId));
  };
  const remember = task => {
    store?.remember(task);
    return task;
  };
  async function lookup(record, signal) {
    const data = await json(`${endpoint()}?requestId=${encodeURIComponent(record.requestId)}&conversationId=${encodeURIComponent(record.conversationId)}`, { signal });
    if (!Array.isArray(data.tasks)) throw fault('invalid_task_list');
    if (data.receipt?.status === 'rejected') {
      if (data.receipt.requestId !== record.requestId || data.receipt.conversationId !== record.conversationId
          || ![400, 403, 404, 409, 410, 422, 429].includes(data.receipt.rejectionStatus)) throw fault('invalid_receipt');
      store?.forget(record.requestId);
      throw fault('submission_rejected', data.receipt.rejectionStatus);
    }
    if (data.receipt?.status === 'cancelled') {
      if (data.receipt.requestId !== record.requestId || data.receipt.conversationId !== record.conversationId
          || record.queue !== true) throw fault('invalid_receipt');
      store?.forget(record.requestId);
      throw fault('submission_cancelled');
    }
    if (data.job) {
      const job = data.job;
      if (!validId(job.id) || job.requestId !== record.requestId || job.conversationId !== record.conversationId
          || !['queued', 'paused', 'running'].includes(job.status) || (job.taskId && !validId(job.taskId))) throw fault('invalid_receipt');
      store?.remember({ ...record, queue: true, jobId: job.id, ...(job.taskId ? { id: job.taskId } : {}) });
      throw Object.assign(fault('submission_queued'), { job });
    }
    const task = data.tasks.find(item => item.conversationId === record.conversationId
      && (item.requestId || item.clientRequestId) === record.requestId)
      || (data.tasks.length === 1 && data.tasks[0].conversationId === record.conversationId
        && !data.tasks[0].requestId && !data.tasks[0].clientRequestId ? data.tasks[0] : null);
    return task ? remember({ ...task, requestId: record.requestId }) : null;
  }
  async function submit(input, { queue = false } = {}) {
    const record = { conversationId: input.conversationId, requestId: input.requestId, ...(queue ? { queue: true } : {}) };
    store?.remember(record);
    try {
      const data = await json(queue ? path('/api/qa/queue') : endpoint(), { method: 'POST', body: JSON.stringify(input) });
      if (queue && data.job?.id) {
        store?.remember({ ...record, jobId: data.job.id, ...(data.job.taskId ? { id: data.job.taskId } : {}) });
        return { job: { ...data.job, requestId: input.requestId } };
      }
      if (!validId(data.task?.id) || data.task.conversationId !== input.conversationId) throw fault('invalid_submission');
      return { task: remember({ ...data.task, requestId: input.requestId }) };
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        store?.forget(input.requestId);
        throw error;
      }
      try { const task = await lookup(record); if (task) return { task }; }
      catch (error) {
        if (queue && error.code === 'submission_queued') return { job: error.job };
        if (['submission_rejected', 'submission_cancelled'].includes(error.code)) throw error;
        // Keep unresolved request identities when observation is unavailable.
      }
      throw fault('submission_unknown');
    }
  }
  async function resolve(record, { signal, onConnection = () => {} } = {}) {
    let attempts = 0;
    while (!signal.aborted) {
      try { const task = await lookup(record, signal); if (task) return task; }
      catch (error) { if (['submission_rejected', 'submission_cancelled', 'submission_queued'].includes(error.code) || [401, 403, 404].includes(error.status)) throw error; }
      onConnection('confirming');
      await delay(Math.min(1000 * 2 ** Math.min(attempts++, 4), 15000), signal);
    }
    throw fault('detached');
  }
  async function subscribe(task, { signal, onUpdate = () => {}, onConnection = () => {} } = {}) {
    const replay = createTaskReplay(task);
    let attempts = 0;
    const publish = () => {
      const value = replay.view();
      if (!signal.aborted) onUpdate(value);
      return value;
    };
    while (!signal.aborted) {
      let controller, reader, watchdog;
      const abort = () => { controller?.abort(); void reader?.cancel().catch(() => {}); };
      try {
        const snapshot = await json(endpoint(task.id), { signal });
        if (signal.aborted) break;
        replay.snapshot(snapshot);
        if (snapshot.task.eventsExpired === true && isTerminalTask(snapshot.task)) return { ...replay.view(), eventsExpired: true };
        let value = publish();
        if (isTerminalTask(value.task) && value.cursor >= (value.task.lastEventId || 0)) return value;
        controller = new AbortController();
        signal.addEventListener('abort', abort, { once: true });
        const touch = () => { clearTimeout(watchdog); watchdog = setTimeout(abort, heartbeatTimeoutMs); };
        touch();
        const response = await request(`${endpoint(task.id)}/events?after=${value.cursor}`, {
          signal: controller.signal, headers: { Accept: 'text/event-stream' },
        });
        if (!response.ok) throw fault('stream_failed', response.status);
        if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw fault('invalid_stream');
        onConnection('connected');
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!signal.aborted) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          touch();
          buffer += decoder.decode(chunk, { stream: true });
          buffer = buffer.replace(/\r\n/g, '\n');
          let split;
          while ((split = buffer.indexOf('\n\n')) !== -1) {
            const packet = buffer.slice(0, split); buffer = buffer.slice(split + 2);
            const lines = packet.split('\n');
            const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            if (!data) continue; // Heartbeats have no event ID and never advance the cursor.
            const id = lines.find(line => line.startsWith('id:'))?.slice(3).trim();
            const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
            if (!/^\d+$/.test(id || '')) throw fault('invalid_event');
            replay.event({ id: Number(id), event, data: JSON.parse(data) });
            value = publish(); attempts = 0;
            if (isTerminalTask(value.task) && value.cursor >= (value.task.lastEventId || 0)) return value;
          }
          if (buffer.length > 2 * 1024 * 1024) throw fault('invalid_stream');
        }
      } catch (error) {
        if (signal.aborted) break;
        if ([401, 403, 404].includes(error.status) || (error.status === 410 && error.code !== 'stream_failed')) throw error;
      } finally {
        clearTimeout(watchdog);
        signal.removeEventListener('abort', abort);
        controller?.abort();
        try { await reader?.cancel(); } catch { /* The transport may already be closed. */ }
      }
      if (!signal.aborted) {
        onConnection('reconnecting');
        await delay(Math.min(500 * 2 ** Math.min(attempts++, 5), 15000), signal);
      }
    }
    throw fault('detached');
  }
  return { list, lookup, submit, resolve, subscribe, remember,
    cancel: (id, signal) => json(endpoint(id), { method: 'DELETE', signal }),
  };
}
