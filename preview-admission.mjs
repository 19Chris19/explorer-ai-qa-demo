import { qaAdmissionConfig } from './qa-admission-config.mjs';

export class PreviewAdmission {
  constructor(now = () => Date.now(), config = qaAdmissionConfig()) {
    this.config = config;
    this.now = now;
    this.recent = new Map();
    this.active = false;
    this.waiters = [];
  }

  admit(visitor, requestId) {
    const key = `${visitor}:${requestId}`;
    const now = this.now();
    for (const [id, time] of this.recent) if (now - time >= this.config.windowMs) this.recent.delete(id);
    if (this.recent.has(key)) return true;
    let count = 0;
    for (const id of this.recent.keys()) if (id.startsWith(`${visitor}:`)) count += 1;
    if (count >= this.config.maxSubmissions) return false;
    if (this.recent.size >= this.config.maxRecentRecords) return false;
    this.recent.set(key, now);
    return true;
  }

  maintenanceSnapshot() {
    return { previewActive: Number(this.active), previewWaiters: this.waiters.length };
  }

  hasRoom(pendingJobs = 0) {
    return this.waiters.length + pendingJobs < this.config.maxPending;
  }

  tryEnter() {
    if (this.active || this.waiters.length) return null;
    this.active = true;
    return () => this.leave();
  }

  async enter(signal) {
    const release = this.tryEnter();
    if (release) return release;
    if (!this.hasRoom()) throw new Error('preview_queue_full');
    if (signal?.aborted) throw new Error('preview_cancelled');
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal };
      const onAbort = () => {
        this.waiters = this.waiters.filter(item => item !== waiter);
        reject(new Error('preview_cancelled'));
      };
      waiter.onAbort = onAbort;
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  leave() {
    const next = this.waiters.shift();
    if (next) {
      next.signal?.removeEventListener('abort', next.onAbort);
      next.resolve(() => this.leave());
    } else {
      this.active = false;
    }
  }
}
