const WINDOW_MS = 60_000;
const MAX_SUBMISSIONS = 10;
const MAX_PENDING = 8;

export class PreviewAdmission {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.recent = new Map();
    this.active = false;
    this.waiters = [];
  }

  admit(visitor, requestId) {
    const key = `${visitor}:${requestId}`;
    const now = this.now();
    for (const [id, time] of this.recent) if (now - time >= WINDOW_MS) this.recent.delete(id);
    if (this.recent.has(key)) return true;
    let count = 0;
    for (const id of this.recent.keys()) if (id.startsWith(`${visitor}:`)) count += 1;
    if (count >= MAX_SUBMISSIONS) return false;
    this.recent.set(key, now);
    return true;
  }

  maintenanceSnapshot() {
    return { previewActive: Number(this.active), previewWaiters: this.waiters.length };
  }

  hasRoom(pendingJobs = 0) {
    return this.waiters.length + pendingJobs < MAX_PENDING;
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
