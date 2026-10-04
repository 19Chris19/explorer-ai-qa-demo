import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const staged=process.argv.includes('--staged');
const files=execFileSync('git',staged?['diff','--cached','--name-only','--diff-filter=ACMR','-z']:['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
let inspected=0;
for(const file of files) {
  if(/(^|\/)(runtime|artifacts|node_modules|browser-profiles|\.docker-lab)(\/|$)/u.test(file)
    ||/(^|\/)\.env(?:$|\.)/u.test(file)&&! /\.(example|sample|template)$/u.test(file))throw new Error(`Private path in release: ${file}`);
  const blob=staged?execFileSync('git',['show',`:${file}`],{maxBuffer:16*1024*1024}):readFileSync(file);
  if(blob.length>10*1024*1024)throw new Error(`Oversized release file: ${file}`);
  if(blob.includes(0)){inspected++;continue;}
  const text=blob.toString('utf8');
  if(/\bsk-[A-Za-z0-9]{32,}\b/u.test(text)||/-----BEGIN (?:OPENSSH|RSA|EC|PRIVATE) (?:PRIVATE )?KEY-----/u.test(text))throw new Error(`Possible private credential in release: ${file}`);
  inspected++;
}
execFileSync('git',['diff',...(staged?['--cached']:[]),'--check']);
console.log(JSON.stringify({releaseFiles:inspected,privatePathsAndKeyPatterns:'PASS',staged}));
