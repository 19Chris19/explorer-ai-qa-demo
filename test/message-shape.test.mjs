import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageShapes, renderedLines, shapeForLines } from '../public/message-shape.mjs';

test('bubble shape follows rendered lines, including fractional layout rounding', () => {
  for (const [height, expected] of [[0, 'single'], [24.1, 'single'], [48, 'medium'], [72, 'medium'], [96, 'long']]) {
    assert.equal(shapeForLines(renderedLines(height, 24)), expected);
  }
  assert.equal(renderedLines(48, 0), 1);
});

test('bubble observer remeasures attachment and width changes and disconnects old history', () => {
  let resized;
  let disconnected = 0;
  const observed = [];
  const shapes = createMessageShapes({
    Observer: class {
      constructor(callback) { resized = callback; }
      observe(content) { observed.push(content); }
      disconnect() { disconnected += 1; }
    },
    styleOf: () => ({ lineHeight: '24px' }),
  });
  let height = 24;
  const bubble = { dataset: {} };
  const content = { isConnected: false, parentElement: bubble, getBoundingClientRect: () => ({ height }) };
  shapes.observe(content);
  assert.deepEqual(bubble.dataset, {});
  content.isConnected = true;
  resized([{ target: content }]);
  assert.equal(bubble.dataset.textShape, 'single');
  height = 96;
  resized([{ target: content }]);
  assert.equal(bubble.dataset.textShape, 'long');
  height = 48;
  shapes.refresh();
  assert.equal(bubble.dataset.textShape, 'medium');
  shapes.reset();
  height = 24;
  resized([{ target: content }]);
  assert.equal(bubble.dataset.textShape, 'medium');
  assert.equal(disconnected, 1);
  assert.deepEqual(observed, [content]);
});
