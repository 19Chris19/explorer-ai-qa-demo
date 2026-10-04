export function embedUrl(path) {
  if (path === '/') return '/?embed=1';
  if (!/^\/(?:[a-z0-9][a-z0-9_-]*)(?:\/[a-z0-9][a-z0-9_-]*)*\/?$/u.test(path)) throw Error('Same-origin module path required');
  return `${path.replace(/\/$/u, '')}/?embed=1`;
}

export function createHostBridge(window, { onCommand, onPreferences }) {
  if (window.parent === window) return { ready() {}, preferences() {}, dispose() {} };
  const origin = window.location.origin;
  const send = data => window.parent.postMessage({ ...data, version: 1 }, origin);
  const ready = () => send({ type: 'explorer-qa:ready' });
  const commands = new Map([['explorer-qa:new', 'new'], ['explorer-qa:history', 'history'], ['explorer-qa:more', 'more']]);
  const receive = event => {
    if (event.origin !== origin || event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    const command = commands.get(data.type);
    if (data.version !== 1 && !(data.version === undefined && command)) return;
    if (data.type === 'explorer-qa:hello') ready();
    else if (command) onCommand(command);
    else if (data.type === 'explorer-qa:preferences') {
      if (!['zh', 'en'].includes(data.locale) || typeof data.dark !== 'boolean'
        || (data.color !== undefined && !['blue', 'teal', 'graphite'].includes(data.color))) return;
      onPreferences({ locale: data.locale, dark: data.dark, ...(data.color === undefined ? {} : { color: data.color }) });
    }
  };
  window.addEventListener('message', receive);
  return { ready, preferences: values => send({ type: 'explorer-qa:preferences', ...values }),
    dispose: () => window.removeEventListener('message', receive) };
}
