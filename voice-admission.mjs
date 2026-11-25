import { randomUUID } from 'node:crypto';

// Protect session issuance in a single process. This does NOT prevent a signed
// direct-to-provider URL from being reused, and is not a complete spend limit.
export function createVoiceAdmission({ now = Date.now, maxActive = 4, maxStarts = 6, maxPerVisitor = 2,
  windowMs = 60000, leaseMs = 60000, maxVisitors = 4096, makeId = randomUUID } = {}) {
  const active = new Map(), starts = [], visitors = new Map();
  function prune(time) {
    while (starts.length && starts[0] <= time - windowMs) starts.shift();
    for (const [key, entries] of visitors) {
      while (entries.length && entries[0] <= time - windowMs) entries.shift();
      if (!entries.length) visitors.delete(key);
    }
    for (const [id, lease] of active) if (lease.expiresAt <= time) active.delete(id);
  }
  function admit(visitor) {
    if (typeof visitor !== 'string' || !/^[a-f0-9]{64}$/u.test(visitor)) return { ok:false, reason:'invalid_visitor' };
    const time = now(); if (!Number.isFinite(time)) return { ok:false, reason:'clock_error' };
    prune(time);
    if (active.size >= maxActive || starts.length >= maxStarts) return { ok:false, reason:'busy' };
    const entries = visitors.get(visitor) || [];
    if (entries.length >= maxPerVisitor || [...active.values()].some(lease => lease.visitor === visitor)) return { ok:false, reason:'visitor_limit' };
    if (!visitors.has(visitor) && visitors.size >= maxVisitors) return { ok:false, reason:'busy' };
    const id = makeId();
    if (typeof id !== 'string' || !id || active.has(id)) return { ok:false, reason:'internal_error' };
    entries.push(time); visitors.set(visitor, entries); starts.push(time); active.set(id, { visitor, expiresAt:time + leaseMs });
    return { ok:true, leaseId:id, expiresAt:time + leaseMs };
  }
  return { admit, release(id) { return active.delete(id); }, get activeCount() { prune(now()); return active.size; } };
}
