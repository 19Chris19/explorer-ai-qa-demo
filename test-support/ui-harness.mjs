import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Synthetic UI did not reach the expected state');
}

export async function openUi({ fetchImpl, setup, conversationId = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'explorer-ui-'));
  const dom = new JSDOM(readFileSync(join(root, 'public/index.html'), 'utf8'), {
    url: 'http://127.0.0.1:4318/', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true });
  window.Element.prototype.getAnimations = () => [];
  if (conversationId) window.sessionStorage.setItem('qa-native-conversation-id', conversationId);
  setup?.(window);
  const requests = [];
  const globals = ['window', 'document', 'localStorage', 'sessionStorage', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'fetch'];
  const saved = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const json = data => ({ ok: true, json: async () => data });
  const fetchMock = async (url, options) => {
    requests.push({ url, options });
    const custom = await fetchImpl?.(url, options, window);
    if (custom) return custom;
    if (url === '/api/qa/health') return json({ connected: true, configured: true, authenticated: true, contractSupported: true, durableTasksSupported: true, ready: true, capacity: 1, webIntentSupported: true });
    if (url === '/questions.json') return json(Array.from({ length: 50 }, (_, i) => ({ id: `q${i}`, zh: `合成问题 ${i}`, en: `Synthetic question ${i}` })));
    if (url === '/api/qa/conversations') return json({ conversations: [] });
    if (url.startsWith('/api/qa/queue?')) return json({ queue: [] });
    if (url.startsWith('/api/qa/tasks?')) return json({ tasks: [] });
    throw new Error(`Unexpected synthetic request: ${url}`);
  };
  const close = () => {
    window.dispatchEvent(new window.Event('pagehide'));
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    copyFileSync(join(root, 'public/app.js'), join(dir, 'app.mjs'));
    for (const name of readdirSync(join(root, 'public')).filter(name => name.endsWith('.mjs'))) copyFileSync(join(root, 'public', name), join(dir, name));
    for (const name of ['question-rotation.mjs', 'source-evidence.mjs']) copyFileSync(join(root, name), join(dir, name));
    Object.assign(globalThis, {
      window, document: window.document, localStorage: window.localStorage, sessionStorage: window.sessionStorage,
      ResizeObserver: class { observe() {} disconnect() {} },
      requestAnimationFrame: fn => window.setTimeout(fn, 0), cancelAnimationFrame: id => window.clearTimeout(id), fetch: fetchMock,
      getComputedStyle: window.getComputedStyle.bind(window),
    });
    await import(pathToFileURL(join(dir, 'app.mjs')).href);
    await until(() => window.document.querySelector('.suggestion-question'));
    return { window, document: window.document, requests, close };
  } catch (error) { close(); throw error; }
}
