import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const [image, platform] = process.argv.slice(2);
if (!image || !['linux/amd64', 'linux/arm64'].includes(platform)) throw Error('Image and supported platform required');
const name = `explorer-image-${randomUUID()}`;
const run = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  run(['run', '-d', '--name', name, '--network', 'none', '--platform', platform, '-e', 'DEMO_LISTEN_HOST=0.0.0.0', image]);
  for (let attempt = 0; ; attempt++) {
    try {
      run(['exec', name, 'node', '-e', "fetch('http://127.0.0.1:4317/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]);
      break;
    } catch { if (attempt >= 60) throw Error('Image startup failed'); await new Promise(r => setTimeout(r, 1000)); }
  }
  run(['exec', name, 'node', '-e', "const f=require('fs');for(const p of ['/app/.env.local','/app/.docker-lab','/app/runtime/accounts.json'])if(f.existsSync(p))process.exit(1);Promise.all(['/','/admin','/internal/provider-a/capacity'].map(async(p,i)=>{const r=await fetch('http://127.0.0.1:4317'+p);if(r.status!==[200,404,404][i])throw Error('boundary')})).catch(()=>process.exit(1))"]);
  console.log(JSON.stringify({ platform, startup: 'PASS', paths: 'PASS', providerCredentials: 'absent', realIMA: 'NOT RUN' }));
} catch {
  console.error('Isolated website image verification failed; logs withheld.'); process.exitCode = 1;
} finally { try { run(['rm', '-f', name]); } catch {} }
