import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));

test('restoring an empty conversation keeps the welcome screen and ID; history still opens', async () => {
  const moduleDir = mkdtempSync(join(tmpdir(), 'explorer-restore-ui-'));
  const dom = new JSDOM(readFileSync(join(root, 'public/index.html'), 'utf8'), {
    url: 'http://127.0.0.1:4318/', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.sessionStorage.setItem('qa-native-conversation-id', 'synthetic-empty');
  window.matchMedia = () => ({ matches: true });
  window.Element.prototype.getAnimations = () => [];
  const requests = [];
  const questions = Array.from({ length: 50 }, (_, index) => ({ id: `q${index}`, zh: `合成问题 ${index}`, en: `Synthetic question ${index}` }));
  const json = data => ({ ok: true, json: async () => data });
  const submissions = [];
  let archiveUnavailable = false;
  const fetchMock = async (url, options = {}) => {
    requests.push(url);
    if (options.method === 'POST') submissions.push({ url, body: options.body });
    if (url === '/api/qa/health') return json({ connected: true, authenticated: true, ready: true, capacity: 1, webIntentSupported: true });
    if (url === '/questions.json') return json(questions);
    if (url === '/api/qa/archive/conversations') {
      if (archiveUnavailable) throw new Error('Synthetic archive unavailable');
      return json({ conversations: [{ conversationId: 'archive:synthetic-filled', title: '合成迁移历史', updatedAt: '2026-01-01T00:00:00Z' }] });
    }
    if (url === '/api/qa/archive/conversations/archive%3Asynthetic-filled') return json({ conversation: { conversationId: 'archive:synthetic-filled' }, readOnly: true, messages: [
      { role: 'user', content: '合成归档问题' }, { role: 'assistant', content: '合成归档回答' },
    ] });
    if (url === '/api/qa/conversations' && options.method === 'POST') return json({ conversation: { conversationId: 'synthetic-fresh' } });
    if (url === '/api/qa/conversations') return json({ conversations: [
      { conversationId: 'synthetic-empty', title: '空会话' },
      { conversationId: 'synthetic-filled', title: '有消息的会话', updatedAt: 1767312000000 },
    ] });
    if (url === '/api/qa/conversations/synthetic-empty') return json({ conversation: { conversationId: 'synthetic-empty' }, messages: [] });
    if (url === '/api/qa/conversations/synthetic-filled') return json({ conversation: { conversationId: 'synthetic-filled' }, messages: [
      { role: 'user', content: '合成首问' },
      { role: 'assistant', content: '合成回答', process: [{ kind: 'status', text: '合成检索进度' }], timing: { elapsed_ms: 1200, queue_wait_ms: 400 } },
    ] });
    if (url.startsWith('/api/qa/queue?')) return json({ queue: [] });
    if (url === '/api/qa/ask') return { ok: false, json: async () => ({ error: '合成接入失败' }) };
    throw new Error(`Unexpected request: ${url}`);
  };
  const globals = ['window', 'document', 'localStorage', 'sessionStorage', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch'];
  const saved = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    copyFileSync(join(root, 'public/app.js'), join(moduleDir, 'app.mjs'));
    for (const name of ['question-rotation.mjs', 'source-evidence.mjs']) copyFileSync(join(root, name), join(moduleDir, name));
    copyFileSync(join(root, 'public/turn-lifecycle.mjs'), join(moduleDir, 'turn-lifecycle.mjs'));
    copyFileSync(join(root, 'public/answer-process.mjs'), join(moduleDir, 'answer-process.mjs'));
    copyFileSync(join(root, 'public/prompt-sparks.mjs'), join(moduleDir, 'prompt-sparks.mjs'));
    copyFileSync(join(root, 'public/voice-preview.mjs'), join(moduleDir, 'voice-preview.mjs'));
    copyFileSync(join(root, 'public/message-shape.mjs'), join(moduleDir, 'message-shape.mjs'));
    copyFileSync(join(root, 'public/composer-shape.mjs'), join(moduleDir, 'composer-shape.mjs'));
    copyFileSync(join(root, 'public/composer-controls.mjs'), join(moduleDir, 'composer-controls.mjs'));
    copyFileSync(join(root, 'public/answer-copy.mjs'), join(moduleDir, 'answer-copy.mjs'));
    copyFileSync(join(root, 'public/selection-copy.mjs'), join(moduleDir, 'selection-copy.mjs'));
    copyFileSync(join(root, 'public/host-bridge.mjs'), join(moduleDir, 'host-bridge.mjs'));
    Object.assign(globalThis, {
      window, document: window.document, localStorage: window.localStorage, sessionStorage: window.sessionStorage,
      ResizeObserver: class { observe() {} disconnect() {} },
      requestAnimationFrame: callback => setTimeout(callback, 0),
      cancelAnimationFrame: clearTimeout,
      fetch: fetchMock,
    });
    await import(pathToFileURL(join(moduleDir, 'app.mjs')).href);
    await until(() => requests.includes('/api/qa/queue?conversationId=synthetic-empty'));
    const main = window.document.querySelector('#main');
    assert.equal(main.classList.contains('is-empty'), true);
    assert.equal(window.document.querySelector('.welcome h2')?.textContent, '你的 3DGS 疑问，随时来聊。');
    assert.equal(window.document.querySelector('#suggestionStrip').hidden, false);
    assert.equal(window.sessionStorage.getItem('qa-native-conversation-id'), 'synthetic-empty');
    assert.equal(window.document.querySelector('#question').placeholder, '输入你的 3DGS 问题…');
    assert.equal(window.document.querySelector('#askForm').dataset.textShape, 'single');
    const webToggle = window.document.querySelector('#webSearchButton');
    await until(() => !webToggle.hidden);
    webToggle.click();
    assert.equal(webToggle.getAttribute('aria-pressed'), 'true');
    assert.equal(window.document.querySelector('#askForm').classList.contains('is-web-armed'), true);
    assert.equal(window.document.querySelector('#requestStatus').textContent, '');
    webToggle.click();
    assert.equal(webToggle.getAttribute('aria-pressed'), 'false');
    assert.equal(window.document.querySelector('#askForm').classList.contains('is-web-armed'), false);
    assert.equal(window.document.querySelector('#requestStatus').textContent, '');
    assert.equal(window.document.querySelectorAll('#sendButton .send-glyph').length, 2);
    const mic = window.document.querySelector('#micButton');
    const draft = window.document.querySelector('#question');
    assert.equal(window.document.querySelector('#sendButton').disabled, true);
    draft.value = '合成草稿';
    draft.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(window.document.querySelector('#sendButton').disabled, false);
    const requestCount = requests.length;
    mic.click();
    assert.equal(mic.getAttribute('aria-pressed'), 'true');
    assert.match(mic.title, /不录音/);
    assert.equal(window.document.querySelector('#voicePreviewHint').hidden, false);
    assert.match(window.document.querySelector('#voicePreviewHint').textContent, /不录音/);
    assert.equal(mic.querySelectorAll('.voice-equalizer i').length, 3);
    assert.equal(draft.value, '合成草稿');
    assert.equal(requests.length, requestCount);
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(mic.getAttribute('aria-pressed'), 'false');
    mic.click();

    const filled = [...window.document.querySelectorAll('.conversation-open')]
      .find(button => button.textContent === '有消息的会话');
    filled.click();
    await until(() => window.document.querySelector('.chat-thread .message'));
    assert.equal(main.classList.contains('is-empty'), false);
    assert.equal(mic.getAttribute('aria-pressed'), 'false');
    assert.equal(window.document.querySelector('.chat-thread .message')?.textContent, '合成首问');
    assert.equal(window.document.querySelector('.chat-thread .message.assistant .message-content')?.textContent, '合成回答');
    assert.equal(window.document.querySelector('.chat-thread .message-label'), null);
    const process = window.document.querySelector('.answer-process');
    assert.equal(process.open, false);
    process.open = true;
    assert.equal(process.querySelector('li').textContent, '合成检索进度');
    assert.equal(process.previousElementSibling.className.includes('answer-lifecycle'), true);
    assert.equal(window.document.querySelector('.answer-lifecycle-details').textContent, '等待 0.4 秒 · 用时 1.2 秒');
    assert.equal(window.document.querySelector('#question').placeholder, '');

    const empty = [...window.document.querySelectorAll('.conversation-open')]
      .find(button => button.textContent === '空会话');
    empty.click();
    await until(() => main.classList.contains('is-empty'));
    assert.ok(window.document.querySelector('.welcome'));
    assert.equal(window.sessionStorage.getItem('qa-native-conversation-id'), 'synthetic-empty');
    assert.equal(window.document.querySelector('#question').placeholder, '输入你的 3DGS 问题…');
    draft.value = '连接失败也保留这条合成草稿';
    draft.dispatchEvent(new window.Event('input', { bubbles: true }));
    window.document.querySelector('#askForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => window.document.querySelector('.message-error'));
    assert.equal(draft.value, '连接失败也保留这条合成草稿');
    assert.equal(requests.filter(url => url === '/api/qa/ask').length, 1);

    const archived = [...window.document.querySelectorAll('.conversation-open')].find(button => button.textContent.includes('合成迁移历史'));
    assert.equal(window.document.querySelector('.conversation-open').textContent, '有消息的会话');
    assert.match(archived.textContent, /迁移前记录，只读/);
    assert.equal(archived.parentElement.querySelector('.conversation-delete'), null);
    archived.click();
    await until(() => window.document.querySelector('.message.assistant .message-content')?.textContent === '合成归档回答');
    assert.equal(window.sessionStorage.getItem('qa-native-conversation-id'), null);
    assert.equal(window.document.querySelector('.answer-tools').hidden, false);
    let copied;
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => { copied = text; } } });
    window.document.querySelector('.answer-copy').click();
    await until(() => copied === '合成归档回答');
    assert.equal(requests.some(url => url.includes('/queue?conversationId=archive')), false);
    assert.equal(requests.some(url => url.includes('/conversations/archive') && !url.includes('/archive/conversations/')), false);
    draft.value = '合成归档后的新问题'; draft.dispatchEvent(new window.Event('input', { bubbles: true }));
    window.document.querySelector('#askForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await until(() => submissions.filter(item => item.url === '/api/qa/ask').length === 2);
    assert.equal(JSON.parse(submissions.at(-1).body).conversationId, 'synthetic-fresh');
    assert.equal(submissions.at(-2).url, '/api/qa/conversations');
    assert.equal(submissions.some(item => item.body?.includes('archive:')), false);
    assert.equal(window.document.querySelector('.chat-thread').textContent.includes('合成归档回答'), false);
    await until(() => window.document.querySelector('.message-error'));
    archiveUnavailable = true;
    [...window.document.querySelectorAll('.conversation-open')].find(button => button.textContent === '空会话').click();
    await until(() => window.document.querySelector('#conversationList').textContent.includes('部分历史记录加载失败'));
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
    rmSync(moduleDir, { recursive: true, force: true });
  }
});

async function until(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('UI did not reach the expected state');
}
