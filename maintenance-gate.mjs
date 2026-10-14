import { constants, chmodSync, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, createConnection } from 'node:net';
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

function socketPath(file, instanceId) {
  const parent = join(realpathSync('/tmp'), `ztx-maint-${process.geteuid()}`);
  try { mkdirSync(parent, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o700) fail();
  return join(parent, `${createHash('sha256').update(`${file}\0${instanceId}`).digest('hex').slice(0, 32)}.sock`);
}

function readWriter(file) {
  const value = readPrivate(`${file}.writer/owner`);
  if (!exactKeys(value, ['pid', 'instanceId']) || !Number.isSafeInteger(value.pid) || value.pid < 1
      || typeof value.instanceId !== 'string' || !/^[a-f0-9-]{36}$/u.test(value.instanceId)) fail();
  return value;
}

export async function checkMaintenance(file) {
  const state = readState(file);
  const writer = readWriter(file);
  const address = socketPath(file, writer.instanceId);
  const stat = lstatSync(address);
  if (!stat.isSocket() || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o600) fail();
  const requestId = randomUUID();
  const snapshot = await new Promise((resolve, reject) => {
    const client = createConnection(address);
    let data = '', finished = false;
    const finish = (error, value) => {
      if (finished) return; finished = true; clearTimeout(timer); client.destroy();
      if (error) reject(new Error('maintenance_unavailable')); else resolve(value);
    };
    const timer = setTimeout(() => finish(true), 2000);
    client.once('error', () => finish(true));
    client.once('end', () => { if (!finished) finish(true); });
    client.once('connect', () => client.write(JSON.stringify({ requestId, instanceId: writer.instanceId,
      generation: state.generation, operationId: state.operationId }) + '\n'));
    client.on('data', chunk => {
      data += chunk.toString('utf8');
      if (Buffer.byteLength(data) > 16384) return finish(true);
      if (!data.includes('\n')) return;
      try {
        const value = JSON.parse(data);
        if (!exactKeys(value, ['requestId', 'snapshot']) || value.requestId !== requestId) return finish(true);
        finish(false, value.snapshot);
      } catch { finish(true); }
    });
  });
  const current = readState(file), currentWriter = readWriter(file);
  if (JSON.stringify(current) !== JSON.stringify(state) || currentWriter.pid !== writer.pid
      || currentWriter.instanceId !== writer.instanceId) fail();
  const now = Date.now();
  if (!exactKeys(snapshot, ['schemaVersion', 'generation', 'operationId', 'mode', 'observedAt', 'pid', 'instanceId', ...countKeys])
      || snapshot.schemaVersion !== 1 || snapshot.generation !== state.generation || snapshot.operationId !== state.operationId
      || snapshot.mode !== state.mode || !Number.isFinite(snapshot.observedAt) || snapshot.observedAt > now
      || now - snapshot.observedAt > 2000 || !Number.isSafeInteger(snapshot.pid) || snapshot.pid < 1
      || typeof snapshot.instanceId !== 'string'
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

  async start(counts) {
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
    this.publicationFailed = true;
    this.connections = new Set();
    try {
      this.address = socketPath(this.file, this.instanceId);
      this.server = createServer(socket => {
        if (this.connections.size >= 8) { socket.destroy(); return; }
        this.connections.add(socket);
        socket.once('close', () => this.connections.delete(socket));
        socket.setTimeout(2000, () => socket.destroy());
        socket.on('error', () => {});
        let data = '', replied = false;
        socket.on('data', chunk => {
          if (replied) { socket.destroy(); return; }
          data += chunk.toString('utf8');
          if (Buffer.byteLength(data) > 16384) { socket.destroy(); return; }
          if (!data.includes('\n')) return;
          replied = true;
          try {
            const request = JSON.parse(data), state = this.state();
            if (!exactKeys(request, ['requestId', 'instanceId', 'generation', 'operationId'])
                || typeof request.requestId !== 'string' || !/^[a-f0-9-]{36}$/u.test(request.requestId)
                || request.instanceId !== this.instanceId || request.generation !== state.generation
                || request.operationId !== state.operationId || !['OPEN', 'CLOSED'].includes(state.mode)) fail();
            const counts = { inflight: this.inflight, ...this.counts() };
            if (!exactKeys(counts, countKeys) || !countKeys.every(key => integer(counts[key]))
                || counts.pending !== counts.queued + counts.paused || counts.expiredPending > counts.pending) fail();
            socket.end(JSON.stringify({ requestId: request.requestId, snapshot: { schemaVersion: 1, ...state,
              observedAt: Date.now(), pid: process.pid, instanceId: this.instanceId, ...counts } }) + '\n');
          } catch { socket.destroy(); }
        });
      });
      await new Promise((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(this.address, () => { this.server.removeListener('error', reject); resolve(); });
      });
      // The containing directory is already private before listen creates the socket.
      chmodSync(this.address, 0o600);
      this.server.on('error', () => { this.publicationFailed = true; });
      this.server.unref();
      this.publish();
    } catch (error) { this.stop(); throw error; }
  }

  publish() {
    if (!this.writer) return;
    try {
      const state = this.state();
      const counts = { inflight: this.inflight, ...this.counts() };
      if (!exactKeys(counts, countKeys) || !countKeys.every(key => integer(counts[key]))
          || counts.pending !== counts.queued + counts.paused || counts.expiredPending > counts.pending) fail();
      if (!['OPEN', 'CLOSED'].includes(state.mode) || !this.server?.listening) fail();
      this.publicationFailed = false;
    } catch { this.publicationFailed = true; }
  }

  stop() {
    for (const connection of this.connections || []) connection.destroy();
    this.server?.close();
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
