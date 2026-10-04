import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('private version images are gated and never drift a latest tag', () => {
  const workflow = readFileSync(new URL('../.github/workflows/images.yml', import.meta.url), 'utf8');
  assert.match(workflow, /IS_PRIVATE/);
  assert.match(workflow, /linux\/amd64,linux\/arm64/);
  assert.match(workflow, /release-manifest\.json/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /image-smoke/);
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
