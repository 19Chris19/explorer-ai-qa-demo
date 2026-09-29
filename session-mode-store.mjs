import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class SessionModeStore {
  constructor(file) {
    this.file = file;
    try { this.rows = JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.rows = {};
    }
  }

  belongsToNative(conversationId, clientId) {
    return this.rows[conversationId] === ownerDigest(clientId);
  }

  remember(conversationId, clientId) {
    if (!/^[a-z0-9-]{1,100}$/iu.test(conversationId || '')) return;
    this.rows[conversationId] = ownerDigest(clientId);
    this.save();
  }

  forget(conversationId, clientId) {
    if (!this.belongsToNative(conversationId, clientId)) return;
    delete this.rows[conversationId];
    this.save();
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(this.rows), { mode: 0o600 });
    renameSync(temp, this.file);
  }
}

function ownerDigest(value) {
  return createHash('sha256').update(value).digest('hex');
}
