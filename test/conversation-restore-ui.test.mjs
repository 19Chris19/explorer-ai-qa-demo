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
  const fetchMock = async url => {
    requests.push(url);
    if (url === '/api/qa/health') return json({ connected: true, authenticated: true, ready: true, capacity: 1, webIntentSupported: true });
    if (url === '/questions.json') return json(questions);
    if (url === '/api/qa/conversations') return json({ conversations: [
      { conversationId: 'synthetic-empty', title: '空会话' },
      { conversationId: 'synthetic-filled', title: '有消息的会话' },
    ] });
    if (url === '/api/qa/conversations/synthetic-empty') return json({ conversation: { conversationId: 'synthetic-empty' }, messages: [] });
    if (url === '/api/qa/conversations/synthetic-filled') return json({ conversation: { conversationId: 'synthetic-filled' }, messages: [
      { role: 'user', content: '合成首问' },
    ] });
    if (url.startsWith('/api/qa/queue?')) return json({ queue: [] });
    throw new Error(`Unexpected request: ${url}`);
  };
  const globals = ['window', 'document', 'localStorage', 'sessionStorage', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch'];
  const saved = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    copyFileSync(join(root, 'public/app.js'), join(moduleDir, 'app.mjs'));
    for (const name of ['question-rotation.mjs', 'source-evidence.mjs']) copyFileSync(join(root, name), join(moduleDir, name));
    Object.assign(globalThis, {
      window, document: window.document, localStorage: window.localStorage, sessionStorage: window.sessionStorage,
      ResizeObserver: class { observe() {} },
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
    const webToggle = window.document.querySelector('#webSearchButton');
    await until(() => !webToggle.hidden);
    webToggle.click();
    assert.equal(webToggle.getAttribute('aria-pressed'), 'true');
    assert.equal(window.document.querySelector('#requestStatus').textContent, '');
    webToggle.click();
    assert.equal(webToggle.getAttribute('aria-pressed'), 'false');
    assert.equal(window.document.querySelector('#requestStatus').textContent, '');

    const filled = [...window.document.querySelectorAll('.conversation-open')]
      .find(button => button.textContent === '有消息的会话');
    filled.click();
    await until(() => window.document.querySelector('.chat-thread .message'));
    assert.equal(main.classList.contains('is-empty'), false);
    assert.equal(window.document.querySelector('.chat-thread .message')?.textContent, '合成首问');
    assert.equal(window.document.querySelector('#question').placeholder, '');

    const empty = [...window.document.querySelectorAll('.conversation-open')]
      .find(button => button.textContent === '空会话');
    empty.click();
    await until(() => main.classList.contains('is-empty'));
    assert.ok(window.document.querySelector('.welcome'));
    assert.equal(window.sessionStorage.getItem('qa-native-conversation-id'), 'synthetic-empty');
    assert.equal(window.document.querySelector('#question').placeholder, '输入你的 3DGS 问题…');
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
