import { readFileSync, writeFileSync, lstatSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
process.umask(0o077);
const [root, action = 'status'] = process.argv.slice(2);
const ids = ['provider', 'website-4317', 'relay', 'public-preview', 'public-tunnel', 'monitor'];
const domain = 'gui/' + process.getuid(), label = id => 'local.zhitianxia.migration.' + id;
const run = args => execFileSync('/bin/launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 45000 });
function registered(id) { try { run(['print', domain + '/' + label(id)]); return true; } catch { return false; } }
async function health() {
  try {
    const response = await fetch('http://127.0.0.1:4317/api/qa/health', { signal: AbortSignal.timeout(10000) });
    const data = await response.json(); return { ready: response.ok && data.ready === true, authenticated: data.authenticated === true,
      capacity: Number(data.capacity) || 0, active: Number(data.active) || 0, queued: Number(data.queued) || 0 };
  } catch { return { ready: false }; }
}
try {
  if (!isAbsolute(root || '')) throw Error('absolute_prepared_root_required');
  const envFile = join(root, 'website-4317-environment.json'), stat = lstatSync(envFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw Error('private_environment_required');
  const env = JSON.parse(readFileSync(envFile, 'utf8'));
  process.chdir(join(root, 'website-4317'));
  const { checkMaintenance, transitionMaintenance } = await import(join(root, 'website-4317/maintenance-gate.mjs'));
  const file = env.DEMO_MAINTENANCE_STATE_PATH;
  const gate = async () => { try { const value = await checkMaintenance(file); return { mode: value.state.mode, drained: value.drained }; } catch { return { mode: 'unavailable', drained: false }; } };
  if (action === 'status') {
    const status = { services: Object.fromEntries(ids.map(id => [id, { registered: registered(id) }])), provider: await health(), maintenance: await gate() };
    try { status.relay = await fetch('http://127.0.0.1:4328/healthz', { signal: AbortSignal.timeout(3000) }).then(r => r.json()); } catch { status.relay = { ok: false }; }
    console.log(JSON.stringify(status, null, 2));
  } else if (action === 'drain' || action === 'stop') {
    const before = await checkMaintenance(file);
    if (before.state.mode === 'OPEN') transitionMaintenance(file, 'close', { generation: before.state.generation, operationId: randomUUID() });
    let drained = false;
    for (let i = 0; i < 60; i++) { await delay(500); try { if ((await checkMaintenance(file)).drained) { drained = true; break; } } catch {} }
    if (!drained) throw Error('website_not_drained_no_force_stop');
    if (action === 'stop') {
      // Shut admission at the gateway before checking Provider capacity.
      const admissions = ['public-tunnel', 'public-preview', 'relay'];
      for (const id of admissions) if (registered(id)) run(['bootout', domain + '/' + label(id)]);
      for (const id of admissions) {
        const record = join(root, 'host-control', id + '-owner.json.child');
        for (let i = 0; i < 20 && existsSync(record); i++) await delay(500);
        if (existsSync(record)) throw Error('admission_service_not_stopped');
      }
      const status = await health();
      if (!status.ready || status.active !== 0 || status.queued !== 0) throw Error('provider_not_idle_no_force_stop');
      for (const id of ['monitor', 'website-4317', 'provider']) if (registered(id)) run(['bootout', domain + '/' + label(id)]);
    }
    console.log(JSON.stringify({ action, drained: true, serviceStopRequested: action === 'stop' }));
  } else if (action === 'start') {
    for (const id of ids) if (!registered(id)) {
      if (!existsSync(join(root, 'launchagents', id + '.plist'))) continue;
      const installed = join(homedir(), 'Library/LaunchAgents', label(id) + '.plist');
      copyFileSync(join(root, 'launchagents', id + '.plist'), installed); chmodSync(installed, 0o600); run(['bootstrap', domain, installed]);
    }
    console.log(JSON.stringify({ startupRequested: true, next: 'wait_for_ready_then_open', maintenanceAutoOpened: false }));
  } else if (action === 'open') {
    const status = await health(); if (!status.ready) throw Error('provider_not_ready');
    const before = await checkMaintenance(file); if (!before.drained) throw Error('website_not_drained');
    transitionMaintenance(file, 'open', { generation: before.state.generation, operationId: before.state.operationId });
    console.log(JSON.stringify({ maintenance: 'OPEN' }));
  } else throw Error('action_must_be_status_drain_stop_start_or_open');
} catch (error) { console.error(/^[a-z_]+$/.test(error.message) ? error.message : 'host_control_failed'); process.exitCode = 1; }
