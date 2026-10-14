import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writePrivateJson } from './private-json-file.mjs';

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
    if (!this.rows || typeof this.rows !== 'object' || Array.isArray(this.rows)
      || Object.entries(this.rows).some(([key, row]) => !/^[a-f0-9]{64}$/u.test(key) || !row
        || !/^[a-f0-9]{64}$/u.test(row.fingerprint) || !Number.isFinite(row.createdAt)
        || !['unknown', 'complete'].includes(row.state))) throw new Error('invalid_request_ledger');
  }

  claim({ clientId, requestId, question, conversationId, sourceIntent = '' }) {
    const key = digest(`${clientId}:${requestId}`);
    const fingerprint = digest(JSON.stringify([question, conversationId, sourceIntent]));
    const row = this.rows[key];
    if (row && this.now() - row.createdAt < ttlMs) {
      return { accepted: false, reason: row.fingerprint === fingerprint ? 'duplicate' : 'conflict', key };
    }
    const previous = this.rows;
    this.rows = { ...previous, [key]: { fingerprint, createdAt: this.now(), state: 'unknown' } };
    try { this.save(); } catch (error) { this.rows = previous; throw error; }
    return { accepted: true, key };
  }

  complete(key) {
    if (!this.rows[key]) return;
    const previous = this.rows;
    this.rows = { ...previous, [key]: { ...previous[key], state: 'complete' } };
    try { this.save(); } catch (error) { this.rows = previous; throw error; }
  }

  save() {
    const cutoff = this.now() - ttlMs;
    for (const [key, row] of Object.entries(this.rows)) {
      if (!row || row.createdAt < cutoff) delete this.rows[key];
    }
    writePrivateJson(this.file, this.rows);
  }
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
