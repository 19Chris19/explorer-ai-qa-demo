import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, rmSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const pendingTtlMs = 60 * 60 * 1000;
const completedTtlMs = 10 * 60 * 1000;
const maxBufferedBytes = 2 * 1024 * 1024;
const maxReplayWireBytes = 16 * 1024 * 1024;

const ownerOf = clientId => createHash('sha256').update(clientId).digest('hex');
const laneOf = (owner, conversationId) => `${owner}:${conversationId}`;
const snapshot = job => ({ id: job.id, requestId: job.requestId, question: job.question, conversationId: job.conversationId, sourceIntent: job.sourceIntent, status: job.status, createdAt: job.createdAt, ...(job.taskId ? { taskId: job.taskId } : {}) });
const statusEvent = (status, job) => `event: queue.status\ndata: ${JSON.stringify({ status, ...(status === 'running' ? { question: job.question, ...(job.taskId ? { taskId: job.taskId } : {}) } : {}) })}\n\n`;

function validatePreservedRows(rows) {
  const keys = ['id', 'owner', 'conversationId', 'requestId', 'question', 'sourceIntent', 'preview', 'createdAt', 'status'];
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).some(key => ![...keys, 'taskId', 'submissionStarted', 'clientId', 'cancelRequested', 'providerStatus'].includes(key)) || !keys.every(key => Object.hasOwn(row, key))
        || (row.submissionStarted !== undefined && typeof row.submissionStarted !== 'boolean')
        || (row.cancelRequested !== undefined && typeof row.cancelRequested !== 'boolean')
        || (row.clientId !== undefined && (typeof row.clientId !== 'string' || ownerOf(row.clientId) !== row.owner))
        || (row.providerStatus !== undefined && !['queued', 'running'].includes(row.providerStatus))
        || (row.taskId !== undefined && (typeof row.taskId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/u.test(row.taskId)))
        || typeof row.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(row.id)
        || typeof row.owner !== 'string' || !/^[a-f0-9]{64}$/u.test(row.owner)
        || typeof row.conversationId !== 'string' || !row.conversationId.trim()
        || typeof row.requestId !== 'string' || !row.requestId.trim()
        || typeof row.question !== 'string' || !row.question.trim() || row.question.length > 2000
        || !['', 'web'].includes(row.sourceIntent) || typeof row.preview !== 'boolean'
        || !['queued', 'paused', 'running'].includes(row.status)
        || !Number.isSafeInteger(row.createdAt) || row.createdAt < 0 || row.createdAt > 8640000000000000
        || ids.has(row.id)) throw new Error('Invalid queued-turn storage');
    ids.add(row.id);
  }
}

function readPreservedStorage(file) {
  let stat;
  try { stat = lstatSync(file); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error('Invalid queued-turn storage');
  }
  if (!stat.isFile()) throw new Error('Invalid queued-turn storage');
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(file)));
  } catch { throw new Error('Invalid queued-turn storage'); }
}

export class ConversationTurnQueue {
  constructor(file, dispatch, now = () => Date.now(), { preserveExpiredPending = false, maxReplayBytes = 32 * 1024 * 1024, maxJobs = 500, maxPendingPerConversation = 3 } = {}) {
    this.file = file;
    this.dispatch = dispatch;
    this.now = now;
    this.preserveExpiredPending = preserveExpiredPending;
    this.maxReplayBytes = maxReplayBytes;
    this.maxJobs = maxJobs;
    if (!Number.isSafeInteger(maxPendingPerConversation) || maxPendingPerConversation < 1 || maxPendingPerConversation > 50) throw new Error('Invalid maxPendingPerConversation');
    this.maxPendingPerConversation = maxPendingPerConversation;
    this.jobs = new Map();
    this.active = new Set();
    let saved;
    if (this.preserveExpiredPending) saved = readPreservedStorage(file);
    else {
      try { saved = JSON.parse(readFileSync(file, 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        saved = [];
      }
    }
    if (!Array.isArray(saved)) throw new Error('Invalid queued-turn storage');
    // Validate the whole file before restoring or normalizing any pending row.
    if (this.preserveExpiredPending) validatePreservedRows(saved);
    for (const row of saved) {
      if (!row || typeof row.id !== 'string' || typeof row.owner !== 'string' || typeof row.conversationId !== 'string'
          || typeof row.question !== 'string' || typeof row.requestId !== 'string' || !Number.isFinite(row.createdAt)) continue;
      // Acknowledged local cancellation is final only before submission intent.
      if (row.cancelRequested === true && !row.taskId && !row.submissionStarted) continue;
      if (!row.taskId && !row.submissionStarted && !this.preserveExpiredPending && this.now() - row.createdAt >= pendingTtlMs) continue;
      this.jobs.set(row.id, { ...row, status: 'paused', recoverTask: Boolean(row.taskId || row.submissionStarted), events: [], bytes: 0, subscribers: new Set(), controller: null, finishedAt: 0 });
    }
    if (saved.length) this.save();
  }

  beginDirect(clientId, conversationId) {
    const lane = laneOf(ownerOf(clientId), conversationId);
    if (this.active.has(lane) || this.laneJobs(lane).some(job => ['queued', 'paused', 'running'].includes(job.status))) return false;
    this.active.add(lane);
    return true;
  }

  finishDirect(clientId, conversationId, complete) {
    const lane = laneOf(ownerOf(clientId), conversationId);
    this.active.delete(lane);
    if (complete) this.startNext(lane);
    else this.pauseLane(lane);
  }

  hasItems(clientId, conversationId) {
    const lane = laneOf(ownerOf(clientId), conversationId);
    return this.active.has(lane) || this.laneJobs(lane).some(job => ['queued', 'paused', 'running'].includes(job.status));
  }

  list(clientId, conversationId) {
    this.prune();
    const lane = laneOf(ownerOf(clientId), conversationId);
    for (const job of this.laneJobs(lane)) this.resumeTask(job, clientId);
    return this.laneJobs(lane).filter(job => ['queued', 'paused', 'running'].includes(job.status)).map(snapshot);
  }

  get(clientId, id) {
    this.prune();
    const job = this.jobs.get(id);
    if (job?.owner === ownerOf(clientId)) this.resumeTask(job, clientId);
    return job?.owner === ownerOf(clientId) ? job : null;
  }

  resumeTask(job, clientId) {
    if (!job.recoverTask) return;
    // Observation restarts at Provider cursor zero. Replace the temporary replay
    // cache so an earlier partial prefix cannot accumulate across reconnects.
    job.events = []; job.bytes = 0; job.wireBytes = 0; job.providerError = false;
    job.recoverTask = false;
    job.clientId = clientId;
    job.status = 'running';
    job.controller = new AbortController();
    if (job.cancelRequested) job.controller.abort();
    const lane = laneOf(job.owner, job.conversationId);
    this.active.add(lane);
    void this.run(job, lane);
  }

  resumeRecovered() {
    for (const job of this.jobs.values()) if (job.recoverTask && job.clientId) this.resumeTask(job, job.clientId);
  }

  markSubmitting(job) {
    job.submissionStarted = true;
    this.save();
  }

  providerStatus(job, status) {
    if (!['queued', 'running'].includes(status) || job.providerStatus === status) return;
    job.providerStatus = status;
    this.save();
  }

  findRequest(clientId, requestId) {
    return [...this.jobs.values()].find(job => job.owner === ownerOf(clientId) && job.requestId === requestId);
  }

  attachTask(job, taskId) {
    job.taskId = taskId;
    this.save();
    this.broadcast(job, statusEvent('running', job));
  }

  previewPendingCount() {
    return [...this.jobs.values()].filter(job => job.preview && (['queued', 'paused'].includes(job.status)
      || (job.status === 'running' && job.providerStatus !== 'running'))).length;
  }

  maintenanceSnapshot() {
    let running = 0, queued = 0, paused = 0, expiredPending = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'running') running++;
      if (job.status === 'queued') queued++;
      if (job.status === 'paused') paused++;
      if (['queued', 'paused'].includes(job.status) && this.now() - job.createdAt >= pendingTtlMs) expiredPending++;
    }
    return { activeDirect: this.active.size - running, running, queued, paused, pending: queued + paused, expiredPending };
  }

  enqueue({ clientId, conversationId, requestId, question, sourceIntent = '', preview = false }) {
    this.prune();
    const owner = ownerOf(clientId);
    const lane = laneOf(owner, conversationId);
    const existing = [...this.jobs.values()].find(job => job.owner === owner && job.requestId === requestId);
    if (existing) return existing.conversationId === conversationId && existing.question === question && existing.sourceIntent === sourceIntent
      ? { job: snapshot(existing), repeated: true } : { error: 'conflict' };
    if (this.jobs.size >= this.maxJobs
      || [...this.jobs.values()].reduce((bytes, job) => bytes + job.bytes, 0) >= this.maxReplayBytes) return { error: 'busy' };
    const jobs = this.laneJobs(lane);
    if (jobs.some(job => job.status === 'paused')) return { error: 'paused' };
    if (jobs.filter(job => job.status === 'queued').length >= this.maxPendingPerConversation) return { error: 'full' };
    const job = {
      id: randomUUID(), owner, clientId, conversationId, requestId, question, sourceIntent, preview,
      createdAt: this.now(), status: 'queued', events: [], bytes: 0, subscribers: new Set(), controller: null, finishedAt: 0,
    };
    this.jobs.set(job.id, job);
    this.save();
    this.startNext(lane);
    return { job: snapshot(job), repeated: false };
  }

  edit(clientId, id, question, sourceIntent) {
    const job = this.get(clientId, id);
    if (!job) return { error: 'not_found' };
    if (job.submissionStarted || job.taskId || (job.status !== 'queued' && job.status !== 'paused')) return { error: 'already_started' };
    job.question = question;
    job.sourceIntent = sourceIntent;
    this.save();
    return { job: snapshot(job) };
  }

  remove(clientId, id) {
    const job = this.get(clientId, id);
    if (!job) return { error: 'not_found' };
    if (job.status === 'running') {
      job.cancelRequested = true;
      this.save();
      job.controller?.abort();
      return job.submissionStarted || job.taskId ? { removed: false, cancelPending: true } : { removed: true };
    }
    if (job.status !== 'queued' && job.status !== 'paused') return { error: 'already_finished' };
    this.jobs.delete(id);
    this.broadcast(job, statusEvent('deleted'));
    this.endSubscribers(job);
    this.save();
    return { removed: true };
  }

  subscribe(clientId, id, res) {
    const job = this.get(clientId, id);
    if (!job) return false;
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.write(statusEvent(job.status, job));
    for (const event of job.events) res.write(Buffer.isBuffer(event) ? event : inflateRawSync(event.compressed, { maxOutputLength: event.rawBytes }));
    if (['complete', 'failed', 'cancelled', 'paused'].includes(job.status)) res.end();
    else {
      job.subscribers.add(res);
      res.on('close', () => job.subscribers.delete(res));
    }
    return true;
  }

  laneJobs(lane) {
    return [...this.jobs.values()].filter(job => laneOf(job.owner, job.conversationId) === lane)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  startNext(lane) {
    this.prune();
    if (this.active.has(lane)) return;
    if (this.laneJobs(lane).some(job => job.status === 'paused')) return;
    const job = this.laneJobs(lane).find(item => item.status === 'queued');
    if (!job) return;
    this.active.add(lane);
    job.status = 'running';
    job.controller = new AbortController();
    this.save();
    this.broadcast(job, statusEvent('running', job));
    void this.run(job, lane);
  }

  async run(job, lane) {
    try {
      await this.dispatch(job, chunk => this.emit(job, chunk), job.controller.signal);
      if (job.controller.signal.aborted && !job.submissionStarted && !job.taskId) throw new Error('cancelled');
      job.status = 'complete';
    } catch (error) {
      if ((job.submissionStarted || job.taskId) && !error.confirmedTerminal) {
        job.status = 'paused';
        job.recoverTask = true;
        return;
      }
      job.status = error.taskStatus === 'cancelled' || (!error.confirmedTerminal && job.controller.signal.aborted) ? 'cancelled' : 'failed';
      if (!job.providerError) this.broadcast(job, `event: error\ndata: ${JSON.stringify({ error: job.status === 'cancelled' ? '已停止本次回答' : '排队问答未完整结束' })}\n\n`);
    } finally {
      job.finishedAt = job.recoverTask ? 0 : this.now();
      job.controller = null;
      this.endSubscribers(job);
      this.active.delete(lane);
      if (job.status === 'complete') this.startNext(lane);
      else this.pauseLane(lane);
      this.save();
    }
  }

  emit(job, chunk) {
    const buffer = Buffer.from(chunk);
    if (/^event: error\r?$/mu.test(buffer.toString('utf8'))) job.providerError = true;
    const wire = (job.wireBytes || 0) + buffer.length;
    if (buffer.length > maxBufferedBytes || wire > maxReplayWireBytes) throw new Error('queued_stream_too_large');
    // The Provider is the durable record. This bounded, temporary reconnect cache
    // need not retain each repeated reference excerpt as another full byte copy.
    const candidate = buffer.length >= 4096 ? deflateRawSync(buffer, { level: 1 }) : buffer;
    const compressed = candidate.length < buffer.length;
    const retained = compressed ? candidate.length : buffer.length;
    if (job.bytes + retained > maxBufferedBytes
      || [...this.jobs.values()].reduce((bytes, item) => bytes + item.bytes, 0) + retained > this.maxReplayBytes) throw new Error('queued_stream_too_large');
    job.bytes += retained; job.wireBytes = wire;
    job.events.push(compressed ? { compressed: candidate, rawBytes: buffer.length } : buffer);
    this.broadcast(job, buffer);
  }

  broadcast(job, chunk) {
    for (const res of job.subscribers) {
      try { if (!res.destroyed && res.write(chunk)) continue; } catch { /* A broken observer cannot stop the task. */ }
      job.subscribers.delete(res);
      try { res.destroy(); } catch { /* Already closed. */ }
    }
  }

  endSubscribers(job) {
    for (const res of job.subscribers) { try { res.end(); } catch { /* Observation is independent of execution. */ } }
    job.subscribers.clear();
  }

  pauseLane(lane) {
    for (const job of this.laneJobs(lane)) {
      if (job.status !== 'queued') continue;
      job.status = 'paused';
      this.broadcast(job, statusEvent('paused'));
      this.endSubscribers(job);
    }
    this.save();
  }

  prune() {
    let changed = false;
    for (const [id, job] of this.jobs) {
      if (job.status === 'running') continue;
      if (job.recoverTask) continue;
      const age = this.now() - (job.finishedAt || job.createdAt);
      const limit = job.finishedAt ? completedTtlMs : pendingTtlMs;
      if (age < limit) continue;
      if (this.preserveExpiredPending && ['queued', 'paused'].includes(job.status)) {
        if (job.status === 'queued') {
          job.status = 'paused';
          this.broadcast(job, statusEvent('paused'));
          this.endSubscribers(job);
          changed = true;
        }
        continue;
      }
      this.broadcast(job, statusEvent('expired'));
      this.endSubscribers(job);
      this.jobs.delete(id);
      changed = true;
    }
    if (changed) this.save();
  }

  save() {
    const rows = [...this.jobs.values()].filter(job => ['queued', 'paused', 'running'].includes(job.status))
      .map(({ id, owner, conversationId, requestId, question, sourceIntent, preview, createdAt, status, taskId, submissionStarted, clientId, cancelRequested, providerStatus }) => ({ id, owner, conversationId, requestId, question, sourceIntent, preview, createdAt, status, ...(taskId ? { taskId } : {}),
        ...(cancelRequested ? { cancelRequested: true } : {}),
        ...(submissionStarted || taskId ? { submissionStarted: true, clientId, cancelRequested: Boolean(cancelRequested), ...(providerStatus ? { providerStatus } : {}) } : {}) }));
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    const fd = openSync(temp, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(rows)); fsyncSync(fd); } finally { closeSync(fd); }
    try {
      renameSync(temp, this.file);
      const dir = openSync(dirname(this.file), 'r');
      try { fsyncSync(dir); } finally { closeSync(dir); }
    } finally { rmSync(temp, { force: true }); }
  }
}
