import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('container CI verifies the fixed actual Provider durable task implementation', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /readBundle\(\)\.PROVIDER_TAG/u);
  assert.match(workflow, /compose\.durable-test\.yaml/u);
  assert.match(workflow, /check-durable-docker\.mjs/u);
  assert.match(workflow, /check-durable-restart\.mjs/u);
  assert.doesNotMatch(workflow, /PROVIDER_IMAGE: node:22/u);
  assert.doesNotMatch(workflow, /down -v|volume prune/u);
});
