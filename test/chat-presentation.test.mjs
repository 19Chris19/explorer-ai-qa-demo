import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import chat from '../chat-presentation.cjs';
import { createPresentationProjector } from '../durable-task-bridge.mjs';
import { createTaskReplay } from '../public/task-stream.mjs';
import { loadHistoryArchive } from '../history-archive.mjs';
import { owner, syntheticConversation } from '../test-support/history-fixture.mjs';

const citationMap = { 'index:42': { type: 'web', sources: [{ url: 'https://example.org/paper', title: 'Synthetic web', snippet: '真实提供的合成摘要' }] },
  'index:9': { type: 'knowledge', title: 'PRIVATE KB', sources: [{ url: 'https://example.org/private', snippet: 'PRIVATE FILE' }] } };
const raw = [
  { id: 1, event: 'sources', data: { sources: [{ title: 'PRIVATE KB', snippet: 'PRIVATE FILE' }], searchSummary: 'PRIVATE IMA', citationMap } },
  { id: 2, event: 'delta', data: { text: '合成回答[7](@index-ref?id=42)' } },
  { id: 3, event: 'process', data: { phase: 'web', status: 'completed', text: 'PRIVATE IMA' } },
  { id: 4, event: 'suggestions', data: { suggestions: [{ text: '追问一', knowledgeBaseId: 'PRIVATE KB' }, '追问二', '追问三', '追问四'] } },
  { id: 5, event: 'done', data: { citationMap, suggestions: ['追问一', '追问二', '追问三'], web_source_count: 1 } },
  { id: 6, event: 'task.status', data: { status: 'succeeded' } },
];

test('BFF streaming projection preserves UTF-8, heartbeats, IDs and every frame across arbitrary byte boundaries', () => {
  const wire = ': heartbeat\n\n' + raw.map(item => `id: ${item.id}\nevent: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`).join('');
  const projector = createPresentationProjector();
  const bytes = Buffer.from(wire); let output = '';
  for (let index = 0; index < bytes.length; index += 7) output += projector.append(bytes.subarray(index, index + 7));
  assert.match(output, /: heartbeat/);
  assert.match(output, /真实提供的合成摘要/);
  assert.doesNotMatch(output, /PRIVATE/);
  assert.deepEqual([...output.matchAll(/^id: (\d+)$/gmu)].map(match => Number(match[1])), [1, 2, 3, 4, 5, 6]);
  assert.equal((output.match(/event: done/gu) || []).length, 1);
  assert.equal(raw[0].data.sources[0].title, 'PRIVATE KB', 'background/default contract is not mutated');
});

test('task refresh and overlapping SSE replay preserve citations, stages and recommendations without another submission', () => {
  const task = { id: 'task', conversationId: 'conversation', status: 'running' };
  const projected = raw.map(event => ({ ...event, data: chat.projectData(event.event, event.data) }));
  const replay = createTaskReplay(task);
  replay.snapshot({ task, snapshot: { events: projected.slice(0, 3) } });
  replay.event(projected[2]);
  for (const event of projected.slice(3)) replay.event(event);
  const expected = replay.view();
  const restored = createTaskReplay(task).snapshot({ task: { ...task, status: 'succeeded' }, snapshot: { events: projected } });
  assert.equal(restored.text, expected.text);
  assert.deepEqual(restored.citationMap, expected.citationMap);
  assert.deepEqual(restored.process, expected.process);
  assert.deepEqual(restored.suggestions, ['追问一', '追问二', '追问三']);
  assert.equal(restored.cursor, 6);
  assert.doesNotMatch(JSON.stringify(restored), /PRIVATE/);
});

test('archive accepts new optional fields, restores them and removes knowledge metadata from chat_v1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-chat-archive-'));
  try {
    const row = syntheticConversation();
    Object.assign(row.turns[0], { citationMap, suggestions: ['追问一', '追问二'],
      process: [{ phase: 'knowledge', status: 'completed' }] });
    const file = join(dir, 'archive.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, conversations: [row] }));
    const detail = loadHistoryArchive(file).detail('archive:synthetic-collision', owner);
    const view = chat.projectHistory(detail).messages.at(-1);
    assert.deepEqual(view.citationMap['index:9'], { type: 'knowledge' });
    assert.equal(view.citationMap['index:42'].sources[0].snippet, '真实提供的合成摘要');
    assert.deepEqual(view.suggestions, ['追问一', '追问二']);
    assert.doesNotMatch(JSON.stringify(view), /PRIVATE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
