import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createQuestionRotation } from '../question-rotation.mjs';

const bank = JSON.parse(readFileSync(new URL('../public/questions.json', import.meta.url), 'utf8'));

test('published question bank is complete, unique, bilingual, and contains no scoring data', () => {
  assert.equal(bank.length, 50);
  assert.equal(new Set(bank.map(item => item.id)).size, 50);
  assert.equal(new Set(bank.map(item => item.zh)).size, 50);
  assert.equal(new Set(bank.map(item => item.category)).size, 5);
  for (const item of bank) {
    assert.deepEqual(Object.keys(item).sort(), ['category', 'en', 'id', 'zh']);
    assert.match(item.id, /^3dgs_[a-z]+_\d{3}$/u);
    assert.ok(item.category.trim());
    assert.ok(item.zh.trim());
    assert.ok(item.en.trim());
  }
});

test('shuffle bag rotates all 50 questions without repeats inside a cycle or displayed group', () => {
  const rotation = createQuestionRotation(bank, () => 0.37);
  const cycle = [];
  while (cycle.length < bank.length) {
    const group = rotation.next(3);
    assert.ok(group.length >= 1 && group.length <= 3);
    assert.equal(new Set(group.map(item => item.id)).size, group.length);
    cycle.push(...group);
  }
  assert.equal(cycle.length, 50);
  assert.equal(new Set(cycle.map(item => item.id)).size, 50);

  const nextGroup = rotation.next(3);
  assert.equal(new Set(nextGroup.map(item => item.id)).size, nextGroup.length);
  assert.notEqual(nextGroup[0].id, cycle.at(-1).id);
});

test('rotation accepts responsive group sizes and rejects malformed question entries', () => {
  for (const count of [1, 2, 3]) assert.equal(createQuestionRotation(bank).next(count).length, count);
  assert.throws(() => createQuestionRotation([{ id: 'duplicate', zh: '问题', en: 'Question' }, { id: 'duplicate', zh: '问题二', en: 'Question two' }, { id: 'third', zh: '问题三', en: 'Question three' }]), /unique bilingual/u);
});
