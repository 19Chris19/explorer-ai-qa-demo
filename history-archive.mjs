import chatPresentation from './chat-presentation.cjs';
import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { isAbsolute } from 'node:path';

export const ARCHIVE_LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, conversations: 10000, turns: 50000, turnsPerConversation: 1000 });
const idPattern = /^[a-zA-Z0-9-]{1,100}$/u;
const ownerPattern = /^(?:demo:)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const fail = () => { throw new Error('Invalid PROVIDER_A_HISTORY_ARCHIVE_PATH archive'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, required = []) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail();
}
function string(value, max, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail();
}
function date(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) fail();
    return;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) fail();
  if (new Date(value).toISOString() !== value.replace(/(?:\.(\d{1,3}))?Z$/u, (_, fraction = '') => `.${fraction.padEnd(3, '0')}Z`)) fail();
}
const timestamp = value => typeof value === 'number' ? value : Date.parse(value);
function evidence(value) {
  if (value === null) return;
  keys(value, ['source_count', 'knowledge_source_count', 'web_source_count', 'answer_basis', 'source_intent', 'sourceIntent', 'complete', 'interrupted', 'timing', 'process']);
  if (Object.hasOwn(value, 'sourceIntent') && Object.hasOwn(value, 'source_intent') && value.sourceIntent !== value.source_intent) fail();
  for (const [key, item] of Object.entries(value)) {
    if (key.endsWith('_count')) { if (!Number.isInteger(item) || item < 0 || item > 100) fail(); }
    else if (key === 'answer_basis') { if (!['', 'knowledge', 'web', 'mixed', 'agent_general', 'provider_fallback'].includes(item)) fail(); }
    else if (key === 'source_intent' || key === 'sourceIntent') { if (!['', 'web_requested'].includes(item)) fail(); }
    else if (['complete', 'interrupted'].includes(key)) { if (typeof item !== 'boolean') fail(); }
    else if (key === 'timing') {
      keys(item, ['elapsed_ms', 'queue_wait_ms']);
      if (Object.values(item).some(n => !Number.isFinite(n) || n < 0 || n > 86400000)) fail();
    } else if (key === 'process') {
      if (!Array.isArray(item) || item.length > 100) fail();
      for (const row of item) {
        keys(row, ['kind', 'text'], ['kind', 'text']);
        string(row.kind, 40); string(row.text, 4000);
      }
    }
  }
}

export function parseHistoryArchive(input) {
  keys(input, ['schemaVersion', 'conversations'], ['schemaVersion', 'conversations']);
  if (input.schemaVersion !== 1 || !Array.isArray(input.conversations) || input.conversations.length > ARCHIVE_LIMITS.conversations) fail();
  const records = new Map();
  let turns = 0;
  for (const row of input.conversations) {
    const fields = ['id', 'ownerKey', 'title', 'createdAt', 'updatedAt', 'expiresAt', 'mode', 'turns'];
    keys(row, fields, ['id', 'ownerKey', 'createdAt', 'updatedAt', 'expiresAt', 'turns']);
    if (!idPattern.test(row.id) || typeof row.id !== 'string' || typeof row.ownerKey !== 'string' || !ownerPattern.test(row.ownerKey) || records.has(`archive:${row.id}`)) fail();
    if (row.title !== undefined) string(row.title, 500, true);
    if (row.mode !== undefined) string(row.mode, 80);
    for (const key of ['createdAt', 'updatedAt', 'expiresAt']) date(row[key]);
    if (timestamp(row.updatedAt) < timestamp(row.createdAt) || timestamp(row.expiresAt) < timestamp(row.updatedAt)) fail();
    if (!Array.isArray(row.turns) || !row.turns.length || row.turns.length > ARCHIVE_LIMITS.turnsPerConversation) fail();
    turns += row.turns.length;
    if (turns > ARCHIVE_LIMITS.turns) fail();
    let previous = timestamp(row.createdAt);
    for (const turn of row.turns) {
      const fields = ['question', 'answer', 'createdAt', 'sources', 'searchSummary', 'evidence', 'citationMap', 'suggestions', 'process'];
      keys(turn, fields, ['question', 'answer', 'createdAt']);
      string(turn.question, 2000); string(turn.answer, 200000); date(turn.createdAt);
      const at = timestamp(turn.createdAt);
      if (at < previous || at > timestamp(row.updatedAt)) fail();
      previous = at;
      if (turn.sources !== undefined && (!Array.isArray(turn.sources) || turn.sources.length > 100)) fail();
      for (const source of turn.sources || []) {
        keys(source, ['index', 'title', 'url', 'snippet', 'type', 'sourceType']);
        if (!Object.keys(source).length) fail();
        for (const [key, value] of Object.entries(source)) {
          if (key === 'index') { if (!Number.isInteger(value) || value < 1 || value > 100) fail(); }
          else if (key === 'sourceType') { if (![0, 1, 2].includes(value)) fail(); }
          else if (key === 'type' && typeof value === 'number') { if (!Number.isSafeInteger(value)) fail(); }
          else {
            string(value, key === 'snippet' ? 8000 : 2000, ['title', 'snippet'].includes(key));
            if (key === 'url') {
              let url;
              try { url = new URL(value); } catch { fail(); }
              if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail();
            }
          }
        }
      }
      if (turn.searchSummary !== undefined && turn.searchSummary !== null) string(turn.searchSummary, 16000, true);
      if (turn.evidence !== undefined) evidence(turn.evidence);
    }
    const record = structuredClone(row);
    for (const turn of record.turns) {
      Object.assign(turn, chatPresentation.metadata(turn));
      if (turn.evidence && Object.hasOwn(turn.evidence, 'sourceIntent')) {
        turn.evidence.source_intent = turn.evidence.sourceIntent;
        delete turn.evidence.sourceIntent;
      }
    }
    records.set(`archive:${row.id}`, record);
  }
  return records;
}

export function loadHistoryArchive(path = '') {
  let records = new Map();
  if (path) {
    let fd;
    try {
      if (typeof path !== 'string' || !isAbsolute(path)) fail();
      fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > ARCHIVE_LIMITS.bytes) fail();
      // A bounded read also detects growth between stat and read.
      const buffer = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const n = readSync(fd, buffer, length, buffer.length - length, null);
        if (!n) break;
        length += n;
      }
      if (length !== stat.size) fail();
      records = parseHistoryArchive(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))));
    } catch { fail(); }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  const visible = (row, owner, now) => row.ownerKey === owner && timestamp(row.expiresAt) > now;
  const summary = (id, row) => ({ conversationId: id, title: row.title || '', createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString(), expiresAt: new Date(row.expiresAt).toISOString(), archived: true, readOnly: true });
  return {
    enabled: Boolean(path),
    list(owner, now = Date.now()) {
      return [...records].filter(([, row]) => visible(row, owner, now)).map(([id, row]) => summary(id, row)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    detail(id, owner, now = Date.now()) {
      const row = records.get(id);
      if (!row || !visible(row, owner, now)) return null;
      return {
        conversation: summary(id, row), readOnly: true,
        messages: row.turns.flatMap(turn => [
          { role: 'user', content: turn.question, createdAt: turn.createdAt },
          { role: 'assistant', content: turn.answer, createdAt: turn.createdAt, sources: structuredClone(turn.sources || []), searchSummary: turn.searchSummary ?? null, ...structuredClone(turn.evidence || {}), ...chatPresentation.metadata(turn) },
        ]),
      };
    },
  };
}
