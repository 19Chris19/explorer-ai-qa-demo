import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Deliberately restricted to this lab. Never accept a production project name.
const project = 'air-qa-synthetic';
const files = ['-f', 'compose.linux.yaml', '-f', 'deploy/docker/compose.synthetic.yaml'];
const run = (args) => execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 });
const compose = (args, extra = []) => run(['compose', '-p', project, ...files, ...extra, ...args]);
const stamp = Date.now().toString();
const backup = resolve('.docker-lab', `backup-${stamp}`);
mkdirSync(backup, { recursive: true, mode: 0o700 });
const override = { services: {}, volumes: {} };
compose(['stop']);
try {
  for (const [service, volume, target] of [['provider-a', 'provider-state', '/app/runtime'], ['explorer-qa', 'explorer-state', '/var/lib/explorer-qa']]) {
    const source = `${project}_${volume}`;
    const restored = `${project}_${volume}-restore-${stamp}`;
    run(['run', '--rm', '--network', 'none', '-v', `${source}:/data:ro`, '-v', `${backup}:/backup`, 'nginx:1.28-alpine', 'sh', '-c', `umask 077; tar -C /data -czf /backup/${volume}.tgz .`]);
    run(['volume', 'create', restored]);
    run(['run', '--rm', '--network', 'none', '-v', `${restored}:/data`, '-v', `${backup}:/backup:ro`, 'nginx:1.28-alpine', 'tar', '-C', '/data', '-xzf', `/backup/${volume}.tgz`]);
    override.volumes[`restored-${volume}`] = { external: true, name: restored };
    override.services[service] = { volumes: [`restored-${volume}:${target}`] };
  }
  const path = resolve(backup, 'restore.compose.json');
  writeFileSync(path, JSON.stringify(override, null, 2), { mode: 0o600 });
  compose(['up', '-d', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '180'], ['-f', path]);
  execFileSync(process.execPath, ['scripts/verify-docker-lab.mjs', '--synthetic', '--restore'], { stdio: 'inherit' });
  console.log('Backup restored into fresh volumes; session ownership and history survived.');
} finally {
  // Switch back to the original volumes, never restore over newer data.
  compose(['down']);
  compose(['up', '-d', '--no-build', '--wait', '--wait-timeout', '180']);
}
