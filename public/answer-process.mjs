export function createAnswerProcess(message, { locale = 'zh', history = [] } = {}) {
  let details, list;
  const entries = [];
  const push = item => {
    if (globalThis.ChatPresentation) {
      entries.push(item);
      globalThis.ChatPresentation.renderProcess(message, entries);
      return;
    }
    if (item?.kind !== 'status' || typeof item.text !== 'string'
        || !item.text.length || item.text.length > 2048 || entries.length >= 40) return;
    if (entries.at(-1)?.text === item.text) return;
    if (!details) {
      details = message.ownerDocument.createElement('details');
      details.className = 'answer-process';
      details.open = true;
      const summary = message.ownerDocument.createElement('summary');
      summary.textContent = locale === 'en' ? 'Answer progress' : '回答过程';
      list = message.ownerDocument.createElement('ul');
      details.append(summary, list);
      message.querySelector('.message-content')?.before(details);
    }
    const row = message.ownerDocument.createElement('li');
    row.textContent = item.text;
    list.append(row);
    entries.push({ kind: 'status', text: item.text });
  };
  const settle = outcome => {
    if (globalThis.ChatPresentation) { globalThis.ChatPresentation.renderProcess(message, entries, true); return; }
    if (!details) return;
    details.dataset.outcome = outcome;
    if (outcome === 'done') details.open = false;
  };
  for (const item of Array.isArray(history) ? history : []) push(item);
  if (Array.isArray(history) && history.length) settle('done');
  return { push, settle };
}
