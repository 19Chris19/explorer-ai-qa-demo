export function createAnswerCopy(message, {
  getMarkdown, getLabel, writeText = text => message.ownerDocument.defaultView.navigator.clipboard.writeText(text),
  schedule = (fn, ms) => message.ownerDocument.defaultView.setTimeout(fn, ms),
  cancel = id => message.ownerDocument.defaultView.clearTimeout(id),
}) {
  const doc = message.ownerDocument;
  const tools = doc.createElement('div'); tools.className = 'answer-tools'; tools.hidden = true;
  const button = doc.createElement('button'); button.type = 'button'; button.className = 'icon-button answer-copy answer-action';
  const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('icon'); icon.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  const prefix = doc.querySelector('meta[name="qa-asset-prefix"]')?.content || '';
  icon.append(use); button.append(icon);
  const status = doc.createElement('span'); status.className = 'copy-status'; status.setAttribute('role', 'status');
  tools.append(button, status); message.append(tools);
  let ready = false, partial = false, pending = false, feedback = '', timer = 0, destroyed = false;
  function refresh() {
    const label = getLabel(feedback === 'copied' ? 'copied' : partial ? 'copyPartial' : 'copyAnswer');
    button.title = label; button.setAttribute('aria-label', label);
    button.disabled = pending;
    use.setAttribute('href', `${prefix}/icons.svg#${feedback === 'copied' ? 'check' : 'copy'}`);
    status.textContent = feedback ? getLabel(feedback) : '';
  }
  button.addEventListener('click', async () => {
    if (!ready || pending || destroyed) return;
    pending = true; cancel(timer); feedback = ''; refresh();
    const markdown = getMarkdown();
    try {
      await writeText(markdown);
      if (destroyed || !message.isConnected) return;
      message.querySelector('.copy-fallback')?.remove();
      feedback = 'copied';
      timer = schedule(() => { feedback = ''; refresh(); }, 1500);
    } catch {
      if (destroyed || !message.isConnected) return;
      feedback = 'copyFailed';
      message.querySelector('.copy-fallback')?.remove();
      const fallback = doc.createElement('div'); fallback.className = 'copy-fallback';
      const label = doc.createElement('label'); label.textContent = getLabel('copyFailed');
      const text = doc.createElement('textarea'); text.readOnly = true; text.value = markdown;
      text.setAttribute('aria-label', getLabel(partial ? 'copyPartial' : 'copyAnswer')); label.append(text);
      const close = doc.createElement('button'); close.type = 'button'; close.className = 'icon-button copy-fallback-close';
      close.setAttribute('aria-label', getLabel('closeCopyText')); close.title = getLabel('closeCopyText');
      const closeIcon = icon.cloneNode(true); closeIcon.querySelector('use').setAttribute('href', `${prefix}/icons.svg#x`); close.append(closeIcon);
      close.addEventListener('click', () => { const restore = fallback.contains(doc.activeElement); fallback.remove(); if (restore) button.focus(); });
      fallback.append(label, close); tools.after(fallback);
      if (doc.activeElement === button) { text.focus(); text.select(); }
    } finally {
      pending = false;
      if (!destroyed) refresh();
    }
  });
  refresh();
  return {
    setReady(value, options = {}) { ready = Boolean(value); partial = Boolean(options.partial); button.hidden = !ready; tools.hidden = !ready && !tools.querySelector('.answer-retry'); refresh(); },
    refresh,
    destroy() { destroyed = true; cancel(timer); tools.remove(); message.querySelector('.copy-fallback')?.remove(); },
  };
}
