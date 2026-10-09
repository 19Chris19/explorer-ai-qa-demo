import { mkdirSync, openSync, closeSync, fsyncSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const TASK_WATCH_MAX_RECORDS = 20000;

// Only routing metadata is retained here; Provider owns answers and task execution.
export class TaskWatchStore {
  constructor(file, { maxRecords = TASK_WATCH_MAX_RECORDS } = {}) {
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new Error('invalid_task_watch_limit');
    this.file = file;
    this.maxRecords = maxRecords;
    let rows;
    try { rows = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; rows = []; }
    if (!Array.isArray(rows) || rows.some(row => !row || !['id', 'clientId', 'conversationId', 'status'].every(key => typeof row[key] === 'string')
      || !/^[a-zA-Z0-9-]{1,100}$/u.test(row.id) || !['unconfirmed', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'indeterminate', 'rejected'].includes(row.status)
      || typeof row.preview !== 'boolean'
      || (row.requestId !== undefined && (typeof row.requestId !== 'string' || typeof row.fingerprint !== 'string'))
      || (row.taskId !== undefined && !/^[a-zA-Z0-9-]{1,100}$/u.test(row.taskId))
      || (row.cancelRequested !== undefined && typeof row.cancelRequested !== 'boolean'))) throw new Error('invalid_task_watch_storage');
    this.rows = new Map(rows.map(row => [row.id, row]));
  }
  save() {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify([...this.rows.values()])); fsyncSync(fd); }
    finally { closeSync(fd); }
    try { renameSync(temporary, this.file); const dir = openSync(dirname(this.file), 'r'); try { fsyncSync(dir); } finally { closeSync(dir); } }
    finally { rmSync(temporary, { force: true }); }
  }
  hasRoom() { return this.rows.size < this.maxRecords; }
  set(row) {
    const old = this.rows.get(row.id);
    if (!old && !this.hasRoom()) throw new Error('task_storage_full');
    this.rows.set(row.id, row);
    try { this.save(); } catch (error) { if (old) this.rows.set(row.id, old); else this.rows.delete(row.id); throw error; }
  }
  delete(id) { const old = this.rows.get(id); if (!old) return; this.rows.delete(id); try { this.save(); } catch (error) { this.rows.set(id, old); throw error; } }
  findRequest(clientId, requestId) { return [...this.rows.values()].find(row => row.clientId === clientId && row.requestId === requestId); }
  findTask(clientId, taskId) { return [...this.rows.values()].find(row => row.clientId === clientId && (row.taskId || row.id) === taskId); }
  pendingCount() { return [...this.rows.values()].filter(row => !row.queueId && row.preview && ['unconfirmed', 'queued'].includes(row.status)).length; }
}
