import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBundle } from '../deploy/bundle.mjs';
test('private version images are gated and never drift a latest tag', () => {
  const workflow = readFileSync(new URL('../.github/workflows/images.yml', import.meta.url), 'utf8');
  assert.match(workflow, /IS_PRIVATE/);
  assert.match(workflow, /linux\/amd64,linux\/arm64/);
  assert.match(workflow, /release-manifest\.json/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /image-smoke/);
  assert.match(workflow, /ubuntu-24\.04-arm/);
  assert.match(workflow, /needs: \[publish, smoke\]/);
  assert.doesNotMatch(workflow, /tags:.*latest/);
  for (const line of workflow.split('\n').filter(line => line.includes('uses:'))) assert.match(line, /@[a-f0-9]{40}/);
});
test('Docker operator wrapper does not depend on host Node and scopes upgrades', () => {
  const wrapper = readFileSync(new URL('../deploy.sh', import.meta.url), 'utf8');
  assert.doesNotMatch(wrapper, /^\s*(?:node|npm|npx) /mu);
  assert.match(wrapper, /--network none/);
  assert.match(wrapper, /--no-recreate/);
  assert.match(wrapper, /--no-deps/);
  assert.match(wrapper, /release-config\.mjs idle/);
  assert.doesNotMatch(wrapper, /down -v|volume rm/);
});

test('default website image and lockfile follow the released package version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const wrapper = readFileSync(new URL('../deploy.sh', import.meta.url), 'utf8');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(readBundle().WEBSITE_VERSION, pkg.version);
  assert.ok(wrapper.includes('ghcr.io/19chris19/explorer-ai-qa-demo:v$WEBSITE_VERSION'));
});
