import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ttlMs = 7 * 24 * 60 * 60 * 1000;

export class RequestLedger {
  constructor(file, now = () => Date.now()) {
    this.file = file;
    this.now = now;
    try { this.rows = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.rows = {};
    }
  }

  claim({ clientId, requestId, question, conversationId, sourceIntent = '' }) {
    const key = digest(`${clientId}:${requestId}`);
    const fingerprint = digest(JSON.stringify([question, conversationId, sourceIntent]));
    const row = this.rows[key];
    if (row && this.now() - row.createdAt < ttlMs) {
      return { accepted: false, reason: row.fingerprint === fingerprint ? 'duplicate' : 'conflict', key };
    }
    this.rows[key] = { fingerprint, createdAt: this.now(), state: 'unknown' };
    this.save();
    return { accepted: true, key };
  }

  complete(key) {
    if (!this.rows[key]) return;
    this.rows[key].state = 'complete';
    this.save();
  }

  save() {
    const cutoff = this.now() - ttlMs;
    for (const [key, row] of Object.entries(this.rows)) {
      if (!row || row.createdAt < cutoff) delete this.rows[key];
    }
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(this.rows), { mode: 0o600 });
    renameSync(temp, this.file);
  }
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
