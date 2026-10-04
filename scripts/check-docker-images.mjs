import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const secrets = ['provider.env', 'explorer.env'].flatMap(file => readFileSync(`.docker-lab/${file}`, 'utf8').split('\n').filter(line => /(?:TOKEN|SECRET)=/.test(line)).map(line => line.slice(line.indexOf('=') + 1)));
const scan = `const fs=require('fs');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const secrets=JSON.parse(input);let files=0;function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory()){if(entry.name!=='node_modules')walk(p)}else if(entry.isFile()){if((entry.name.startsWith('.env')&&!entry.name.endsWith('.example'))||p.includes('/.docker-lab/')||p.includes('/runtime/'))throw Error('private_path_in_image');const content=fs.readFileSync(p).toString();if(secrets.some(s=>content.includes(s)))throw Error('secret_in_image');files++}}}walk('/app');console.log(JSON.stringify({files,clean:true,uid:process.getuid()}))})`;
for (const image of ['air-provider-baseline-ima-qa-web:latest', 'air-explorer:lab']) {
  const config = execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' });
  assert.equal(secrets.some(secret => config.includes(secret)), false, 'Credential baked into image configuration');
  const output = execFileSync('docker', ['run', '--rm', '-i', '--network', 'none', '--entrypoint', 'node', image, '-e', scan], { input: JSON.stringify(secrets), encoding: 'utf8', timeout: 60000 });
  const result = JSON.parse(output);
  assert.equal(result.clean, true);
  if (image.startsWith('air-explorer')) assert.equal(result.uid, 1000);
  console.log(JSON.stringify({ image, ...result }));
}
