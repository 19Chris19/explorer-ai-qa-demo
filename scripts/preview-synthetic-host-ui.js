const frame = document.querySelector('iframe');
const send = (type, values = {}) => frame.contentWindow.postMessage({ type, version: 1, ...values }, location.origin);
window.qaHostReady = false;
window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.version !== 1) return;
  if (event.data.type === 'explorer-qa:ready') window.qaHostReady = true;
  if (event.data.type === 'explorer-qa:focus-return') document.querySelector('#more').focus();
});
frame.addEventListener('load', () => send('explorer-qa:hello'));
for (const control of ['new', 'history', 'more']) document.querySelector(`#${control}`).onclick = () => send(`explorer-qa:${control}`);
document.querySelector('#preferences').onclick = () => send('explorer-qa:preferences', { locale: 'en', dark: true, color: 'blue' });
