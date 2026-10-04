import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStartOptions } from '../scripts/docker-start.mjs';

test('Docker gateway serves every browser module required by the accepted UI', () => {
  const config=readFileSync(new URL('../deploy/docker/nginx.conf',import.meta.url),'utf8');
  for(const name of ['turn-lifecycle','answer-process','prompt-sparks','voice-preview','message-shape','composer-shape','composer-controls','answer-copy','selection-copy']) {
    assert.ok(config.includes(name),`Missing gateway asset ${name}`);
  }
});

test('image carries a source revision and has writable non-root persistent storage', () => {
  const dockerfile=readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');
  assert.match(dockerfile,/org.opencontainers.image.revision/);
  assert.match(dockerfile,/DEMO_RELEASE_REVISION/);
  assert.match(dockerfile,/chown node:node \/var\/lib\/explorer-qa/);
  assert.match(dockerfile,/USER node/);
});

test('first deployment requires explicit Provider source and scope; invalid inputs fail closed', () => {
  const args=['--provider-dir','../provider','--kb','999000111'];
  const options=parseStartOptions(args);
  assert.equal(options.project,'zhitianxia-qa');
  assert.equal(options.webPort,4417);assert.equal(options.providerPort,3317);
  assert.equal(options.kb,'999000111');
  for(const bad of [[],['--provider-dir','x'],[...args,'--web-port','0'],[...args,'--provider-port','99999'],[...args,'--project','bad/name'],[...args,'--unsafe'],['--provider-dir','x','--kb','not-a-scope']]) {
    assert.throws(()=>parseStartOptions(bad));
  }
});
