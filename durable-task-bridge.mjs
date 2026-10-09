import { setTimeout as delay } from 'node:timers/promises';

export const terminalTask = status => ['succeeded', 'failed', 'cancelled', 'indeterminate'].includes(status);

export function taskTerminalError(status) {
  return Object.assign(new Error(status === 'cancelled' ? 'cancelled' : 'task_failed'), { confirmedTerminal: true, taskStatus: status });
}

function finish(status) {
  if (status !== 'succeeded') throw taskTerminalError(status);
}

// An empty lookup cannot prove that a dispatched POST was never accepted.
export async function lookupSubmittedTask(provider, { clientId, requestKey }) {
  try {
    const response = await provider.request({ route: `/api/tasks?requestKey=${requestKey}`, method: 'GET', clientId, signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const data = await response.json();
    return data.tasks?.find(task => typeof task.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/u.test(task.id)
      && ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'indeterminate'].includes(task.status)) || null;
  } catch { return null; }
}

export async function recoverSubmittedTask(provider, options) {
  for (;;) {
    const recorded = options.recordedTask?.();
    if (recorded) return recorded;
    const task = await lookupSubmittedTask(provider, options);
    if (task) return task;
    await delay(options.retryMs ?? 500);
  }
}

export async function cancelTaskAttempt(provider, { clientId, taskId }) {
  try {
    const response = await provider.request({ route: `/api/tasks/${taskId}`, method: 'DELETE', clientId, signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const data = await response.json();
    return data.task?.id === taskId ? data.task : null;
  } catch { return null; }
}

// A watcher may be replaced freely. Only persisted explicit cancellation sends DELETE.
export async function followTask(provider, { clientId, taskId, emit, signal, onStatus = () => {}, confirmedStatus = () => null, retryMs = 500 }) {
  let cursor = 0;
  let terminal;
  const consume = event => {
    if (!Number.isSafeInteger(event.id) || event.id <= cursor) return;
    if (event.id !== cursor + 1) throw new Error('task_cursor_gap');
    emit(Buffer.from(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`));
    cursor = event.id;
    if (event.event === 'task.status') {
      onStatus(event.data.status);
      if (terminalTask(event.data.status) && event.data.status !== 'succeeded') terminal = event.data.status;
    }
    if (event.event === 'done') terminal = 'succeeded';
    // Error bodies describe the failure; task.status owns its terminal category.
  };
  for (;;) {
    if (terminalTask(confirmedStatus())) return finish(confirmedStatus());
    if (signal?.aborted) {
      const task = await cancelTaskAttempt(provider, { clientId, taskId });
      if (terminalTask(task?.status)) return finish(task.status);
    } else {
      try {
        const timeout = AbortSignal.timeout(245000);
        const observationSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const response = await provider.request({ route: `/api/tasks/${taskId}/events?after=${cursor}`, method: 'GET', clientId, signal: observationSignal });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
          await response.body?.cancel();
          throw new Error('task_subscription_unavailable');
        }
        let pending = '';
        const decoder = new TextDecoder();
        for await (const chunk of response.body) {
          pending += decoder.decode(chunk, { stream: true });
          let boundary;
          while ((boundary = /\r?\n\r?\n/u.exec(pending))) {
            const packet = pending.slice(0, boundary.index);
            pending = pending.slice(boundary.index + boundary[0].length);
            const name = /^event:\s*(\S+)/mu.exec(packet)?.[1];
            const id = /^id:\s*(\d+)/mu.exec(packet)?.[1];
            if (name && id) consume({ id: Number(id), event: name, data: JSON.parse(packet.split(/\r?\n/u).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')) });
          }
          if (pending.length > 2 * 1024 * 1024) throw new Error('task_event_too_large');
          if (terminal) break;
        }
      } catch {
        // Subscription rotation, truncated JSON and cursor gaps are not execution failure.
      }
      if (terminal) return finish(terminal);
    }
    let data;
    try {
      const response = await provider.request({ route: `/api/tasks/${taskId}`, method: 'GET', clientId, signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        data = await response.json();
        if (data.task?.id && data.task.id !== taskId) data = undefined;
        for (const event of data?.snapshot?.events || []) consume(event);
      } else await response.body?.cancel();
    } catch { /* Retain the task and cursor when observation fails. */ }
    if (data?.task?.id === taskId && data.task.status === 'succeeded' && data.task.eventsExpired
        && data.task.history?.taskId === taskId) return;
    if (terminal) return finish(terminal);
    if (data?.task?.id === taskId && terminalTask(data.task.status) && data.task.status !== 'succeeded') return finish(data.task.status);
    if (['queued', 'running'].includes(data?.task?.status)) onStatus(data.task.status);
    await delay(retryMs);
  }
}

export async function relayTaskEvents(provider, { req, res, route, clientId, rotationMs = 240000, heartbeatMs = 15000 }) {
  const controller = new AbortController();
  const detach = () => controller.abort();
  res.once('close', detach);
  const rotate = setTimeout(() => { res.end(); detach(); }, rotationMs);
  let heartbeat;
  try {
    const upstream = await provider.request({ route, method: 'GET', clientId, signal: controller.signal });
    if (!upstream.ok || !upstream.headers.get('content-type')?.includes('text/event-stream')) {
      res.writeHead([400, 403, 404, 409, 410].includes(upstream.status) ? upstream.status : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '暂时无法订阅回答，请重新连接原任务。', code: upstream.status === 409 ? 'task_cursor_mismatch' : 'task_subscription_unavailable' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(': transport-heartbeat\n\n'); }, heartbeatMs);
    for await (const chunk of upstream.body) {
      if (res.destroyed || res.writableEnded) break;
      if (!res.write(chunk)) await new Promise(resolve => {
        const settle = () => { res.off('drain', settle); res.off('close', settle); resolve(); };
        res.once('drain', settle); res.once('close', settle);
        if (res.destroyed || res.writableEnded) settle();
      });
    }
  } catch {
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.write(JSON.stringify({ error: '连接暂时中断，正在等待重新连接。', code: 'task_subscription_unavailable' }));
    }
  } finally {
    clearTimeout(rotate); clearInterval(heartbeat); res.off('close', detach);
    controller.abort(); res.end();
  }
}
