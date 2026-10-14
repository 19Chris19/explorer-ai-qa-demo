import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { assertFreshProject } from '../deploy/project-resources.mjs';

export function parseStartOptions(args) {
  const { values }=parseArgs({args,options:{
    'provider-dir':{type:'string'},kb:{type:'string'},project:{type:'string',default:'zhitianxia-qa'},
    'web-port':{type:'string',default:'4417'},'provider-port':{type:'string',default:'3317'},plan:{type:'boolean'},
  }});
  const webPort=Number(values['web-port']),providerPort=Number(values['provider-port']);
  if(!values['provider-dir']||!/^\S(?:.*\S)?$/u.test(values['provider-dir'])||!/^\d+$/u.test(values.kb||'')||! /^[1-9][0-9]{0,31}$/u.test(values.kb)
    ||! /^[a-z0-9][a-z0-9_-]{0,48}$/u.test(values.project)
    ||[webPort,providerPort].some(port=>!Number.isInteger(port)||port<1||port>65535)||webPort===providerPort) {
    throw new Error('Provide --provider-dir and --kb; use valid distinct ports and project name');
  }
  return {providerDir:resolve(values['provider-dir']),kb:values.kb,project:values.project,webPort,providerPort,plan:Boolean(values.plan)};
}

export function assertStartedBundle(health, version, revision) {
  if (!health.authenticated || !health.contractSupported || health.websiteRelease !== `v${version}` || health.websiteRevision !== revision) throw new Error('Started containers did not pass authentication/contract/version checks; inspect privately before promotion');
}

async function start(args) {
  const options=parseStartOptions(args),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  if(resolve(process.cwd())!==root)throw new Error('Run this command from the website repository root');
  const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:900000});
  const revision=dir=>{
    if(run('git',['status','--porcelain','--untracked-files=normal'],dir).trim())throw new Error('Commit or isolate source changes before deployment');
    const sha=run('git',['rev-parse','HEAD'],dir).trim();
    if(!/^[a-f0-9]{40}$/u.test(sha))throw new Error('Cannot resolve source revision');
    return sha;
  };
  const providerPackage=JSON.parse(readFileSync(resolve(options.providerDir,'package.json'),'utf8'));
  if(providerPackage.name!=='ima-qa-web'||!existsSync(resolve(options.providerDir,'Dockerfile')))throw new Error('Provider source is not ima-qa-web');
  const explorerRevision=revision(root),providerRevision=revision(options.providerDir);
  const providerImage=`zhitianxia-provider:${providerRevision}`,explorerImage=`zhitianxia-explorer:${explorerRevision}`;
  if(options.plan){console.log(JSON.stringify({firstDeployment:true,project:options.project,explorerRevision,providerRevision,webPort:options.webPort,providerPort:options.providerPort,privateConfig:'values withheld'}));return;}
  run('docker',['info','--format','{{.OSType}}']);
  await assertFreshProject(options.project,args=>run('docker',args));
  const websiteVersion=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version;
  if(['provider.env','explorer.env','deployment.json','release.env'].some(name=>existsSync(resolve(root,'.docker-lab',name))))throw new Error('Private deployment config already exists; refusing to replace it');
  run(process.execPath,['scripts/prepare-docker-lab.mjs','--kb',options.kb]);
  console.log('Building Provider and website sequentially; configuration values withheld.');
  run('docker',['build','--build-arg',`SOURCE_REVISION=${providerRevision}`,'--build-arg',`RELEASE_VERSION=v${providerPackage.version}`,'-t',providerImage,options.providerDir]);
  run('docker',['build','--build-arg',`SOURCE_REVISION=${explorerRevision}`,'--build-arg',`RELEASE_VERSION=v${websiteVersion}`,'-t',explorerImage,'.']);
  const metadata={project:options.project,
    providerImage:run('docker',['image','inspect','--format','{{.Id}}',providerImage]).trim(),
    explorerImage:run('docker',['image','inspect','--format','{{.Id}}',explorerImage]).trim(),
    explorerRevision,providerRevision,webPort:options.webPort,providerPort:options.providerPort};
  writeFileSync(resolve(root,'.docker-lab/deployment.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx',mode:0o600});
  const env={...process.env,PROVIDER_IMAGE:metadata.providerImage,EXPLORER_IMAGE:metadata.explorerImage,EXPLORER_REVISION:explorerRevision,WEB_HOST_PORT:String(options.webPort),PROVIDER_HOST_PORT:String(options.providerPort)};
  execFileSync('docker',['compose','-p',options.project,'-f','compose.linux.yaml','up','-d','--no-build','--wait','--wait-timeout','180'],{cwd:root,env,stdio:['ignore','pipe','pipe'],timeout:240000});
  const h=await(await fetch(`http://127.0.0.1:${options.webPort}/api/qa/health`,{signal:AbortSignal.timeout(10000)})).json();
  assertStartedBundle(h,websiteVersion,explorerRevision);
  console.log(JSON.stringify({website:`http://127.0.0.1:${options.webPort}/`,accountAdmin:`http://127.0.0.1:${options.providerPort}/admin.html`,release:explorerRevision,capacity:h.capacity,ready:h.ready,accountOnboarding:'manual authorization required'}));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  start(process.argv.slice(2)).catch(error=>{console.error(error.status!==undefined?'Docker operation failed; inspect privately (logs and configuration not echoed).':error.message);process.exitCode=1;});
}
