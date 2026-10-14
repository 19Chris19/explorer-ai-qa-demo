import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writePrivateJson } from './private-json-file.mjs';

export class SessionModeStore {
  constructor(file) {
    this.file = file;
    try { this.rows = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.rows = {};
    }
    if (!this.rows || typeof this.rows !== 'object' || Array.isArray(this.rows)
      || Object.entries(this.rows).some(([key, owner]) => !/^[a-z0-9-]{1,100}$/iu.test(key)
        || typeof owner !== 'string' || !/^[a-f0-9]{64}$/u.test(owner))) throw new Error('invalid_session_mode_storage');
  }

  belongsToNative(conversationId, clientId) {
    return this.rows[conversationId] === ownerDigest(clientId);
  }

  remember(conversationId, clientId) {
    if (!/^[a-z0-9-]{1,100}$/iu.test(conversationId || '')) return;
    const previous = this.rows;
    this.rows = { ...previous, [conversationId]: ownerDigest(clientId) };
    try { this.save(); } catch (error) { this.rows = previous; throw error; }
  }

  forget(conversationId, clientId) {
    if (!this.belongsToNative(conversationId, clientId)) return;
    const previous = this.rows;
    this.rows = { ...previous }; delete this.rows[conversationId];
    try { this.save(); } catch (error) { this.rows = previous; throw error; }
  }

  save() {
    writePrivateJson(this.file, this.rows);
  }
}

function ownerDigest(value) {
  return createHash('sha256').update(value).digest('hex');
}
