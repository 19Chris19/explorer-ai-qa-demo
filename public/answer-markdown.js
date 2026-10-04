(function (root) {
  const marked = root.marked?.marked || root.marked;
  const purifier = root.DOMPurify;
  const allowedTags = [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del',
    'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'a', 'table', 'thead', 'tbody',
    'tr', 'th', 'td', 'div', 'span', 'details', 'summary',
  ];

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeHref(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function isContextRef(value) {
    return /^@context-ref\?id=\d+$/u.test(String(value || ''));
  }

  function stripKnownCitations(tokens, known) {
    for (const token of tokens || []) {
      if (token.type === 'link' && isContextRef(token.href) && known.has(Number(token.text))) {
        token.type = 'text';
        token.text = '';
        token.tokens = [];
        continue;
      }
      if (token.type === 'text') {
        if (Array.isArray(token.tokens)) stripKnownCitations(token.tokens, known);
        else token.text = token.text.replace(/(?<!\\)\[(\d+)\]/gu, (whole, index) => known.has(Number(index)) ? '' : whole);
      } else if (!['code', 'codespan', 'link', 'image'].includes(token.type)) {
        if (Array.isArray(token.tokens)) stripKnownCitations(token.tokens, known);
        for (const item of token.items || []) stripKnownCitations(item.tokens, known);
        for (const cell of [...(token.header || []), ...(token.rows || []).flat()]) stripKnownCitations(cell.tokens, known);
      }
    }
  }

  function answerMarkdownForCopy(value, options = {}) {
    const source = String(value ?? '');
    const known = new Set((options.sourceIndexes || []).map(Number).filter(n => Number.isSafeInteger(n) && n > 0));
    if (!known.size || !marked) return source;
    const edits = [];
    // Work from parser token boundaries so code, links and escaped literals stay intact.
    function visit(tokens, lower, upper) {
      let cursor = lower;
      for (const token of tokens || []) {
        const at = token.raw ? source.indexOf(token.raw, cursor) : -1;
        const located = at >= cursor && at + token.raw.length <= upper;
        const start = located ? at : cursor;
        const end = located ? at + token.raw.length : upper;
        if (token.type === 'link' && isContextRef(token.href) && known.has(Number(token.text))) {
          if (located) edits.push([start, end]);
        } else if (!['code', 'codespan', 'link', 'image', 'html', 'escape'].includes(token.type)) {
          if (token.type === 'text' && !token.tokens && located) {
            for (const match of token.raw.matchAll(/(?<!\\)\[(\d+)\]/gu)) {
              if (known.has(Number(match[1]))) edits.push([start + match.index, start + match.index + match[0].length]);
            }
          } else {
            let childCursor = visit(token.tokens, start, end);
            for (const item of token.items || []) childCursor = visit(item.tokens, childCursor, end);
            for (const cell of [...(token.header || []), ...(token.rows || []).flat()]) childCursor = visit(cell.tokens, childCursor, end);
            if (!located) cursor = childCursor;
          }
        }
        if (located) cursor = end;
      }
      return cursor;
    }
    visit(marked.lexer(source, { gfm: true }), 0, source.length);
    let result = source;
    for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) result = result.slice(0, start) + result.slice(end);
    return result;
  }

  function tableCells(line) {
    const inner = line.trim().replace(/^\|/u, '').replace(/(?<!\\)\|$/u, '');
    return inner.split(/(?<!\\)\|/u).map((cell) => cell.trim());
  }

  function isBrokenTableHeader(line, next) {
    if (!line.includes('|') || !next.includes('|') || !/^[\s|:\-]+$/u.test(next)) return false;
    const header = tableCells(line);
    const separator = tableCells(next);
    return header.length < 2 || header.length !== separator.length
      || separator.some((cell) => !/^:?-{3,}:?$/u.test(cell));
  }

  function partitionMalformedTables(input) {
    const lines = input.split('\n');
    const parts = [];
    let plain = [];
    const flush = () => { if (plain.length) parts.push({ type: 'markdown', text: plain.join('\n') }); plain = []; };
    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      const next = lines[index + 1] || '';
      const brokenHeader = isBrokenTableHeader(line, next);
      const flatRow = !next && (line.match(/(?<!\\)\|/gu) || []).length >= 3 && line.length >= 80;
      if (!brokenHeader && !flatRow) { plain.push(line); index += 1; continue; }
      flush();
      const raw = [line];
      index += 1;
      if (brokenHeader) {
        raw.push(lines[index]); index += 1;
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          raw.push(lines[index]); index += 1;
        }
      }
      parts.push({ type: 'malformed-table', text: raw.join('\n') });
    }
    flush();
    return parts;
  }

  function prepareLegacyAnswer(raw) {
    const input = String(raw ?? '');
    const suspect = input.length >= 200 && !/\s/u.test(input);
    if (/\s/u.test(input) || !/#{2,4}[\p{Script=Han}]/u.test(input) || /[`|]/u.test(input)) {
      return { text: input, changed: false, suspect };
    }
    const text = input.replace(/(^|[。！？；：])(?=#{2,4}[\p{Script=Han}])/gu, '$1\n\n')
      .replace(/(#{2,4}[\p{Script=Han}][^#。！？；：]*)(?=#{2,4}[\p{Script=Han}])/gu, '$1\n\n')
      .replace(/(^|\n\n)(#{2,4})(?=[\p{Script=Han}])/gu, '$1$2 ');
    return { text, changed: text !== input, suspect };
  }

  function renderMarkdown(source, options) {
    const renderer = new marked.Renderer();
    renderer.html = ({ text }) => escapeHtml(text);
    renderer.image = () => '<span class="answer-unsupported-media">图片内容尚未接通</span>';
    renderer.link = ({ href, title, tokens }) => {
      const label = marked.Parser.parseInline(tokens || [], { renderer });
      const safe = safeHref(href);
      return safe
        ? `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ''} target="_blank" rel="noopener noreferrer">${label}</a>`
        : label;
    };
    const tokens = marked.lexer(source, { gfm: true, breaks: true });
    if (options.hideCitations) {
      const known = new Set((options.sourceIndexes || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0));
      stripKnownCitations(tokens, known);
    }
    return marked.parser(tokens, { renderer, gfm: true, breaks: true });
  }

  function formatAnswerHtml(markdown, options = {}) {
    if (!marked || !purifier) throw new Error('Answer renderer dependencies are unavailable');
    const input = String(markdown ?? '').replace(/\r\n?/gu, '\n');
    if (!input.trim()) return '<p></p>';
    const rendered = partitionMalformedTables(input).map((part) => {
      if (part.type === 'markdown') return renderMarkdown(part.text, options);
      const raw = escapeHtml(part.text);
      return `<div class="answer-table-fallback"><div class="answer-table-lines">${raw.replace(/\n/gu, '<br>')}</div></div>`;
    }).join('');
    const cleaned = purifier.sanitize(rendered, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'start', 'align'],
    });
    const container = root.document.createElement('div');
    container.innerHTML = cleaned;
    for (const table of container.querySelectorAll('table')) {
      table.classList.add('answer-table');
      const wrap = root.document.createElement('div');
      wrap.className = 'answer-table-wrap';
      table.replaceWith(wrap);
      wrap.append(table);
    }
    return container.innerHTML;
  }

  function updateAnswerElement(element, markdown, options = {}) {
    const template = root.document.createElement('template');
    template.innerHTML = formatAnswerHtml(markdown, options);
    const next = [...template.content.children];
    const current = [...element.children];
    let stable = 0;
    while (stable < current.length && stable < next.length && current[stable].outerHTML === next[stable].outerHTML) stable += 1;
    for (let index = current.length - 1; index >= stable; index -= 1) current[index].remove();
    element.append(...next.slice(stable));
  }

  root.ImaAnswerMarkdown = { formatAnswerHtml, updateAnswerElement, prepareLegacyAnswer, answerMarkdownForCopy };
})(globalThis);
