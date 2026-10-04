function sameRange(a, b) {
  return a && b && a.startContainer === b.startContainer && a.startOffset === b.startOffset
    && a.endContainer === b.endContainer && a.endOffset === b.endOffset;
}

function answerSelection(root) {
  const selection = root.ownerDocument.defaultView.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  const element = node => node.nodeType === 1 ? node : node.parentElement;
  const content = element(range.startContainer)?.closest('.message.assistant .message-content');
  if (!content || !root.contains(content) || !content.contains(range.endContainer)) return null;
  const text = selection.toString();
  if (!text.trim()) return null;
  const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
  const backwards = selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset;
  const rect = backwards ? rects[0] : rects.at(-1);
  return rect ? { text, range: range.cloneRange(), content, rect } : null;
}

export function createSelectionCopy(root, {
  getLabel,
  writeText = text => root.ownerDocument.defaultView.navigator.clipboard.writeText(text),
  schedule = (fn, ms) => root.ownerDocument.defaultView.setTimeout(fn, ms),
  cancel = id => root.ownerDocument.defaultView.clearTimeout(id),
}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const toolbar = doc.createElement('div'); toolbar.className = 'selection-copy-toolbar'; toolbar.hidden = true;
  toolbar.setAttribute('role', 'group');
  const button = doc.createElement('button'); button.type = 'button'; button.className = 'icon-button selection-copy-button';
  const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('icon'); icon.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use'); icon.append(use); button.append(icon);
  const status = doc.createElement('span'); status.className = 'selection-copy-status'; status.setAttribute('role', 'status');
  toolbar.append(button, status); doc.body.append(toolbar);
  const prefix = doc.querySelector('meta[name="qa-asset-prefix"]')?.content || '';
  let current = null, blocked = null, selecting = false, pending = false, feedback = '', timer = 0, revision = 0, destroyed = false;
  const labels = () => {
    toolbar.dataset.feedback = feedback;
    const label = getLabel(feedback === 'copied' ? 'copied' : 'copySelection');
    toolbar.setAttribute('aria-label', getLabel('selectionActions'));
    button.setAttribute('aria-label', label); button.title = label; button.disabled = pending;
    use.setAttribute('href', `${prefix}/icons.svg#${feedback === 'copied' ? 'check' : 'copy'}`);
    status.textContent = feedback ? getLabel(feedback) : '';
  };
  function hide(suppress = true) {
    if (suppress && current) blocked = current.range;
    current = null; revision += 1; pending = false; feedback = ''; cancel(timer);
    toolbar.hidden = true; toolbar.querySelector('textarea')?.remove(); labels();
  }
  function position() {
    if (!current) return;
    const area = root.getBoundingClientRect(), rect = current.rect;
    const top = Math.max(0, area.top), bottom = Math.min(win.innerHeight, area.bottom);
    if (rect.bottom <= top || rect.top >= bottom || rect.right <= 0 || rect.left >= win.innerWidth) return hide();
    const bounds = toolbar.getBoundingClientRect();
    const width = bounds.width || (feedback ? 180 : 56), height = bounds.height || 56;
    const x = Math.max(12, Math.min(win.innerWidth - width - 12, (rect.left + rect.right - width) / 2));
    const above = rect.top - height - 8;
    const y = above >= top + 8 ? above : rect.bottom + 8;
    toolbar.style.left = `${x}px`;
    toolbar.style.top = `${Math.max(top + 8, Math.min(bottom - height - 8, y))}px`;
  }
  function refresh() {
    if (destroyed) return;
    labels();
    if (selecting || toolbar.querySelector('textarea') && toolbar.contains(doc.activeElement)) return;
    const next = answerSelection(root);
    if (!next || sameRange(next.range, blocked)) return hide(false);
    if (!sameRange(next.range, current?.range) || next.text !== current?.text) {
      hide(false); blocked = null; current = next;
    } else current.rect = next.rect;
    toolbar.hidden = false; position();
  }
  button.addEventListener('click', async () => {
    if (!current || pending) return;
    const text = current.text, activeRevision = revision, beforeFocus = doc.activeElement;
    pending = true; cancel(timer); feedback = ''; labels();
    try {
      await writeText(text);
      if (destroyed || activeRevision !== revision || toolbar.hidden) return;
      feedback = 'copied';
      timer = schedule(() => { feedback = ''; labels(); position(); }, 1500);
    } catch {
      if (destroyed || activeRevision !== revision || toolbar.hidden) return;
      feedback = 'selectionCopyFailed';
      const fallback = doc.createElement('textarea'); fallback.className = 'selection-copy-fallback';
      fallback.readOnly = true; fallback.value = text; fallback.setAttribute('aria-label', getLabel('copySelection'));
      toolbar.querySelector('textarea')?.remove(); toolbar.append(fallback);
      labels(); position();
      if (doc.activeElement === button || doc.activeElement === beforeFocus) { fallback.focus({ preventScroll: true }); fallback.select(); }
    } finally {
      if (!destroyed && activeRevision === revision) { pending = false; labels(); position(); }
    }
  });
  const down = event => {
    if (toolbar.contains(event.target)) {
      if (event.target.closest('button')) event.preventDefault();
      return;
    }
    selecting = true; blocked = null; hide(false);
  };
  const up = event => { selecting = false; if (!toolbar.contains(event.target)) refresh(); };
  const key = event => { if (event.key === 'Escape') hide(); };
  const dismiss = () => hide();
  const visibility = () => { if (doc.hidden) hide(); };
  const observer = new win.MutationObserver(() => {
    if (current && !toolbar.querySelector('textarea')) refresh();
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  doc.addEventListener('selectionchange', refresh);
  doc.addEventListener('pointerdown', down);
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', up);
  doc.addEventListener('keydown', key);
  doc.addEventListener('visibilitychange', visibility);
  root.addEventListener('scroll', dismiss, { passive: true });
  win.addEventListener('scroll', dismiss, { passive: true });
  win.addEventListener('resize', dismiss);
  win.visualViewport?.addEventListener('resize', dismiss);
  labels();
  return {
    refresh,
    destroy() {
      destroyed = true; cancel(timer); observer.disconnect(); toolbar.remove();
      doc.removeEventListener('selectionchange', refresh); doc.removeEventListener('pointerdown', down);
      doc.removeEventListener('pointerup', up); doc.removeEventListener('pointercancel', up);
      doc.removeEventListener('keydown', key); doc.removeEventListener('visibilitychange', visibility);
      root.removeEventListener('scroll', dismiss); win.removeEventListener('scroll', dismiss); win.removeEventListener('resize', dismiss);
      win.visualViewport?.removeEventListener('resize', dismiss);
    },
  };
}
