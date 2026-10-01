import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const pendingTtlMs = 60 * 60 * 1000;
const completedTtlMs = 10 * 60 * 1000;
const maxPendingPerConversation = 3;
const maxBufferedBytes = 2 * 1024 * 1024;

const ownerOf = clientId => createHash('sha256').update(clientId).digest('hex');
const laneOf = (owner, conversationId) => `${owner}:${conversationId}`;
const snapshot = job => ({ id: job.id, question: job.question, conversationId: job.conversationId, sourceIntent: job.sourceIntent, status: job.status, createdAt: job.createdAt });
const statusEvent = (status, job) => `event: queue.status\ndata: ${JSON.stringify({ status, ...(status === 'running' ? { question: job.question } : {}) })}\n\n`;

export class ConversationTurnQueue {
  constructor(file, dispatch, now = () => Date.now()) {
    this.file = file;
    this.dispatch = dispatch;
    this.now = now;
    this.jobs = new Map();
    this.active = new Set();
    let saved;
    try { saved = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      saved = [];
    }
    if (!Array.isArray(saved)) throw new Error('Invalid queued-turn storage');
    for (const row of saved) {
      if (!row || typeof row.id !== 'string' || typeof row.owner !== 'string' || typeof row.conversationId !== 'string'
          || typeof row.question !== 'string' || typeof row.requestId !== 'string' || !Number.isFinite(row.createdAt)) continue;
      if (this.now() - row.createdAt >= pendingTtlMs) continue;
      this.jobs.set(row.id, { ...row, status: 'paused', events: [], bytes: 0, subscribers: new Set(), controller: null, finishedAt: 0 });
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
    return this.laneJobs(lane).filter(job => ['queued', 'paused', 'running'].includes(job.status)).map(snapshot);
  }

  get(clientId, id) {
    this.prune();
    const job = this.jobs.get(id);
    return job?.owner === ownerOf(clientId) ? job : null;
  }

  previewPendingCount() {
    return [...this.jobs.values()].filter(job => job.preview && ['queued', 'paused'].includes(job.status)).length;
  }

  enqueue({ clientId, conversationId, requestId, question, sourceIntent = '', preview = false }) {
    this.prune();
    const owner = ownerOf(clientId);
    const lane = laneOf(owner, conversationId);
    const existing = [...this.jobs.values()].find(job => job.owner === owner && job.requestId === requestId);
    if (existing) return existing.conversationId === conversationId && existing.question === question && existing.sourceIntent === sourceIntent
      ? { job: snapshot(existing), repeated: true } : { error: 'conflict' };
    const jobs = this.laneJobs(lane);
    if (jobs.some(job => job.status === 'paused')) return { error: 'paused' };
    if (jobs.filter(job => job.status === 'queued').length >= maxPendingPerConversation) return { error: 'full' };
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
    if (job.status !== 'queued' && job.status !== 'paused') return { error: 'already_started' };
    job.question = question;
    job.sourceIntent = sourceIntent;
    this.save();
    return { job: snapshot(job) };
  }

  remove(clientId, id) {
    const job = this.get(clientId, id);
    if (!job) return { error: 'not_found' };
    if (job.status === 'running') {
      job.controller?.abort();
      return { removed: true };
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
    for (const event of job.events) res.write(event);
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
      if (job.controller.signal.aborted) throw new Error('cancelled');
      job.status = 'complete';
    } catch {
      job.status = job.controller.signal.aborted ? 'cancelled' : 'failed';
      this.broadcast(job, `event: error\ndata: ${JSON.stringify({ error: job.status === 'cancelled' ? '已停止本次回答' : '排队问答未完整结束' })}\n\n`);
    } finally {
      job.finishedAt = this.now();
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
    job.bytes += buffer.length;
    if (job.bytes > maxBufferedBytes) throw new Error('queued_stream_too_large');
    job.events.push(buffer);
    this.broadcast(job, buffer);
  }

  broadcast(job, chunk) {
    for (const res of job.subscribers) {
      if (res.destroyed || !res.write(chunk)) { job.subscribers.delete(res); res.destroy(); }
    }
  }

  endSubscribers(job) {
    for (const res of job.subscribers) res.end();
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
      const age = this.now() - (job.finishedAt || job.createdAt);
      const limit = job.finishedAt ? completedTtlMs : pendingTtlMs;
      if (age < limit) continue;
      this.broadcast(job, statusEvent('expired'));
      this.endSubscribers(job);
      this.jobs.delete(id);
      changed = true;
    }
    if (changed) this.save();
  }

  save() {
    const rows = [...this.jobs.values()].filter(job => ['queued', 'paused', 'running'].includes(job.status))
      .map(({ id, owner, conversationId, requestId, question, sourceIntent, preview, createdAt, status }) => ({ id, owner, conversationId, requestId, question, sourceIntent, preview, createdAt, status }));
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(rows), { mode: 0o600 });
    renameSync(temp, this.file);
  }
}
