export function shapeForLines(lines) {
  if (lines <= 1) return 'single';
  return lines <= 3 ? 'medium' : 'long';
}

export function renderedLines(height, lineHeight) {
  if (!(height > 0) || !(lineHeight > 0)) return 1;
  return Math.max(1, Math.ceil(height / lineHeight - 0.02));
}

export function createMessageShapes({
  Observer = globalThis.ResizeObserver,
  styleOf = node => node.ownerDocument.defaultView.getComputedStyle(node),
} = {}) {
  const contents = new Set();
  function update(content) {
    if (!contents.has(content) || !content.isConnected) return;
    const lines = renderedLines(content.getBoundingClientRect().height, parseFloat(styleOf(content).lineHeight));
    content.parentElement.dataset.textShape = shapeForLines(lines);
  }
  const observer = Observer ? new Observer(entries => entries.forEach(entry => update(entry.target))) : null;
  return {
    observe(content) {
      contents.add(content);
      observer?.observe(content);
      update(content);
    },
    refresh() { contents.forEach(update); },
    reset() { observer?.disconnect(); contents.clear(); },
  };
}
