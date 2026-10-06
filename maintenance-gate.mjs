import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const countKeys = ['inflight', 'activeDirect', 'running', 'queued', 'paused', 'pending', 'expiredPending', 'previewActive', 'previewWaiters'];
const fail = () => { throw new Error('maintenance_unavailable'); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const operationValid = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

function assertPath(file) {
  if (typeof file !== 'string' || !isAbsolute(file) || file !== resolve(file)) fail();
  const parent = dirname(file);
  if (realpathSync(parent) !== parent) fail();
  const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o700) fail();
  // Private control data must not live in source, build or other project trees.
  for (let dir = parent; ; dir = dirname(dir)) {
    if (dir === projectRoot || dir === resolve(process.cwd()) || existsSync(join(dir, '.git')) || existsSync(join(dir, 'package.json'))) fail();
    if (dirname(dir) === dir) break;
  }
}

function assertFile(stat) {
  if (!stat.isFile() || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 16384) fail();
}

function readPrivate(file) {
  assertPath(file);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assertFile(fstatSync(fd));
    return JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
}

function atomicWrite(file, value) {
  assertPath(file);
  try {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) fail();
    assertFile(stat);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temp = `${file}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, JSON.stringify(value));
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temp, file);
    const directory = openSync(dirname(file), constants.O_RDONLY);
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temp, { force: true });
  }
}

function readState(file) {
  const value = readPrivate(file);
  if (!exactKeys(value, ['schemaVersion', 'generation', 'operationId', 'mode']) || value.schemaVersion !== 1
      || !integer(value.generation) || value.generation < 1 || !operationValid(value.operationId)
      || !['OPEN', 'CLOSED'].includes(value.mode)) fail();
  return value;
}

export function transitionMaintenance(file, action, { generation, operationId } = {}) {
  assertPath(file);
  if (!['close', 'open'].includes(action) || !integer(generation) || !operationValid(operationId)) fail();
  const lock = `${file}.lock`;
  mkdirSync(lock, { mode: 0o700 });
  try {
    let current;
    try { current = readState(file); }
    catch (error) {
      if (error.code !== 'ENOENT' || action !== 'close' || generation !== 0) throw error;
      current = { mode: 'OPEN', generation: 0, operationId: '' };
    }
    if (current.generation !== generation || generation >= Number.MAX_SAFE_INTEGER) fail();
    if (action === 'close' && (current.mode !== 'OPEN' || current.operationId === operationId)) fail();
    if (action === 'open' && (current.mode !== 'CLOSED' || current.operationId !== operationId)) fail();
    const next = { schemaVersion: 1, generation: generation + 1, operationId, mode: action === 'close' ? 'CLOSED' : 'OPEN' };
    atomicWrite(file, next);
    return next;
  } finally { rmSync(lock, { recursive: true }); }
}

export function checkMaintenance(file) {
  const state = readState(file);
  const snapshot = readPrivate(`${file}.snapshot`);
  const writer = readPrivate(`${file}.writer/owner`);
  const now = Date.now();
  if (!exactKeys(snapshot, ['schemaVersion', 'generation', 'operationId', 'mode', 'observedAt', 'pid', 'instanceId', ...countKeys])
      || snapshot.schemaVersion !== 1 || snapshot.generation !== state.generation || snapshot.operationId !== state.operationId
      || snapshot.mode !== state.mode || !Number.isFinite(snapshot.observedAt) || snapshot.observedAt > now
      || now - snapshot.observedAt > 2000 || !Number.isSafeInteger(snapshot.pid) || snapshot.pid < 1
      || typeof snapshot.instanceId !== 'string' || !exactKeys(writer, ['pid', 'instanceId'])
      || writer.pid !== snapshot.pid || writer.instanceId !== snapshot.instanceId
      || !countKeys.every(key => integer(snapshot[key]))
      || snapshot.pending !== snapshot.queued + snapshot.paused || snapshot.expiredPending > snapshot.pending) fail();
  process.kill(snapshot.pid, 0);
  return { state, snapshot, drained: state.mode === 'CLOSED' && countKeys.every(key => snapshot[key] === 0) };
}

export class MaintenanceGate {
  constructor(file = '') {
    this.file = file;
    this.enabled = Boolean(file);
    this.inflight = 0;
    this.last = null;
    this.instanceId = randomUUID();
    this.writer = false;
    this.publicationFailed = false;
  }

  state() {
    if (!this.enabled) return { mode: 'OPEN', generation: 0, operationId: '' };
    try {
      if (this.writer) {
        const owner = readPrivate(`${this.file}.writer/owner`);
        if (!exactKeys(owner, ['pid', 'instanceId']) || owner.pid !== process.pid || owner.instanceId !== this.instanceId) fail();
      }
      const next = readState(this.file);
      if (this.last && (next.generation < this.last.generation
          || (next.generation === this.last.generation
            && (next.mode !== this.last.mode || next.operationId !== this.last.operationId)))) fail();
      this.last = next;
      return next;
    } catch { return { mode: 'ERROR', generation: null, operationId: '' }; }
  }

  admit() {
    if (this.state().mode !== 'OPEN' || this.publicationFailed) return null;
    this.inflight++;
    let released = false;
    return () => { if (!released) { released = true; this.inflight--; } };
  }

  start(counts) {
    if (!this.enabled) return;
    assertPath(this.file);
    const writerPath = `${this.file}.writer`;
    // An existing lease is never stolen. After a crash an operator must first
    // prove the old BFF stopped, then remove its lease before restarting.
    mkdirSync(writerPath, { mode: 0o700 });
    try { atomicWrite(`${writerPath}/owner`, { pid: process.pid, instanceId: this.instanceId }); }
    catch (error) { rmSync(writerPath, { recursive: true }); throw error; }
    this.writer = true;
    this.counts = counts;
    this.publish();
    this.timer = setInterval(() => this.publish(), 250);
    this.timer.unref();
  }

  publish() {
    if (!this.writer) return;
    try {
      const state = this.state();
      const counts = { inflight: this.inflight, ...this.counts() };
      if (!countKeys.every(key => integer(counts[key]))) fail();
      atomicWrite(`${this.file}.snapshot`, { schemaVersion: 1, generation: state.generation,
        operationId: state.operationId, mode: state.mode, observedAt: Date.now(), pid: process.pid,
        instanceId: this.instanceId, ...counts });
      this.publicationFailed = false;
    } catch { this.publicationFailed = true; }
  }

  stop() {
    clearInterval(this.timer);
    this.publicationFailed = this.enabled;
    if (!this.writer) return;
    this.writer = false;
    // Remove only this process's lease, never another process's control state.
    try {
      const owner = readPrivate(`${this.file}.writer/owner`);
      if (owner.pid === process.pid && owner.instanceId === this.instanceId) rmSync(`${this.file}.writer`, { recursive: true });
    } catch { /* Unsafe or missing leases require an operator, not automatic cleanup. */ }
  }
}
