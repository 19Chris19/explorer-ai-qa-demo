const mirrors = new WeakMap();

function compactHeight(form, input, style) {
  if (!input.ownerDocument || !form.getBoundingClientRect) return 0;
  const window = input.ownerDocument.defaultView;
  const shell = window.getComputedStyle(form);
  const foot = form.querySelector('.composer-foot');
  const groups = [...(foot?.children || [])].filter(node => window.getComputedStyle(node).display !== 'none');
  const toolsWidth = groups.reduce((total, node) => total + node.getBoundingClientRect().width, 0)
    + Math.max(0, groups.length - 1) * (parseFloat(foot && window.getComputedStyle(foot).columnGap) || 0);
  const width = form.clientWidth - (parseFloat(shell.paddingLeft) || 0)
    - (parseFloat(shell.paddingRight) || 0) - (parseFloat(shell.columnGap) || 0)
    - toolsWidth;
  if (width <= 0) return 0;
  let mirror = mirrors.get(input);
  if (!mirror) {
    mirror = input.ownerDocument.createElement('textarea');
    mirror.tabIndex = -1;
    mirror.setAttribute('aria-hidden', 'true');
    Object.assign(mirror.style, {
      position: 'fixed', visibility: 'hidden', pointerEvents: 'none', left: '-10000px', top: '0',
      height: '0px', minHeight: '0', maxHeight: 'none', padding: '0', border: '0',
      overflow: 'hidden', resize: 'none', boxSizing: 'content-box', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
    });
    input.ownerDocument.body.append(mirror);
    mirrors.set(input, mirror);
  }
  mirror.style.font = style.font;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.width = `${width}px`;
  mirror.value = input.value;
  return mirror.scrollHeight;
}

export function resizeComposer(form, input, style = input.ownerDocument.defaultView.getComputedStyle(input), measureCompact = compactHeight) {
  const lineHeight = parseFloat(style.lineHeight) || 24;
  const maxHeight = parseFloat(style.maxHeight) || 144;
  const stacked = Boolean(input.value) && (/\n/u.test(input.value) || measureCompact(form, input, style) > lineHeight + 1);
  form.dataset.layout = stacked ? 'stacked' : 'compact';
  input.style.height = '0px';
  const height = input.value ? Math.max(lineHeight, input.scrollHeight) : lineHeight;
  const lines = Math.max(1, Math.ceil(height / lineHeight - 0.02));
  input.style.height = `${Math.min(height, maxHeight)}px`;
  input.style.overflowY = height > maxHeight ? 'auto' : 'hidden';
  form.dataset.textShape = lines <= 1 && !stacked ? 'single' : lines <= 3 ? 'medium' : 'long';
  return { lines, height: Math.min(height, maxHeight), shape: form.dataset.textShape };
}

export function observeComposerWidth(input, resize, Observer = globalThis.ResizeObserver,
  schedule = callback => globalThis.requestAnimationFrame(callback)) {
  let width;
  let pending = false;
  const target = input.parentElement || input;
  const observer = Observer ? new Observer(entries => {
    for (const entry of entries) {
      if (entry.target !== target || entry.contentRect.width === width) continue;
      width = entry.contentRect.width;
      // Height writes inside ResizeObserver delivery can trigger a resize loop.
      if (!pending) {
        pending = true;
        schedule(() => { pending = false; resize(); });
      }
    }
  }) : null;
  observer?.observe(target);
  return observer;
}
