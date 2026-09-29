import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
globalThis.document = window.document;
globalThis.marked = marked;
globalThis.DOMPurify = createDOMPurify(window);
await import('../public/answer-markdown.js');

const { formatAnswerHtml: render, updateAnswerElement: update, prepareLegacyAnswer } = globalThis.ImaAnswerMarkdown;

test('legacy repair only inserts deterministic display boundaries and retains raw facts', () => {
  const raw = '结论。###设备4090建议。###软件PostShot';
  const result = prepareLegacyAnswer(raw);
  assert.equal(result.changed, true);
  assert.equal(result.suspect, false);
  assert.equal(result.text.replace(/\s/g, ''), raw);
  assert.match(render(result.text), /<h3>设备4090建议。<\/h3>/u);
  assert.deepEqual(prepareLegacyAnswer('结论\n### 设备'), { text: '结论\n### 设备', changed: false, suspect: false });
  assert.deepEqual(prepareLegacyAnswer('a###标题`x`'), { text: 'a###标题`x`', changed: false, suspect: false });
  assert.deepEqual(prepareLegacyAnswer('|A|B|###标题'), { text: '|A|B|###标题', changed: false, suspect: false });
  assert.deepEqual(prepareLegacyAnswer('技术说明'.repeat(60)), { text: '技术说明'.repeat(60), changed: false, suspect: true });
});

test('renders GFM tables and inline structure at every answer state', () => {
  const answer = '**重叠率**\n\n| 方向 | 建议 |\n| --- | --- |\n| 航向 | 80% |';
  const live = render(answer, { answerComplete: false });
  const settled = render(answer, { answerComplete: true });
  assert.equal(live, settled);
  assert.match(live, /<strong>重叠率<\/strong>/u);
  assert.match(live, /<table class="answer-table">/u);
  assert.match(live, /<th>方向<\/th>/u);
  assert.match(live, /<td>80%<\/td>/u);
});

test('renders uncertain table as lines without diagnostic copy or invented cells', () => {
  const answer = '| 工具 | 建议 |\n| --- |\n| PostShot | 先试小场景 |';
  const live = render(answer, { answerComplete: false });
  assert.equal(render(answer, { answerComplete: true }), live);
  assert.doesNotMatch(live, /<table/u);
  assert.match(live, /answer-table-fallback/u);
  assert.doesNotMatch(live, /表格格式不完整|查看原文|<details/u);
  assert.match(live, /PostShot \| 先试小场景/u);
});

test('a provisional separator does not become a fabricated table', () => {
  const unfinished = '| 工具 | 建议 |\n| --- |';
  assert.doesNotMatch(render(unfinished), /<table/u);
  assert.doesNotMatch(render(unfinished), /表格格式不完整|查看原文|<details/u);
  assert.match(render('| 工具 | 建议 |\n| --- | --- |\n| PostShot | 小场景 |'), /<table/u);
});

test('preserves GFM headings, lists, code, links, escaped pipe and trailing numbers', () => {
  const html = render('# 操作\n\n- **第一步**\n- 预算 4090\n\n`a|b` 和 [文档](https://example.com)\n\n| 项 | 值 |\n| --- | --- |\n| a\\|b | 16GB |');
  assert.match(html, /<h1>操作<\/h1>/u);
  assert.match(html, /<li><strong>第一步<\/strong>/u);
  assert.match(html, /预算 4090/u);
  assert.match(html, /<code>a\|b<\/code>/u);
  assert.match(html, /href="https:\/\/example.com\//u);
  assert.match(html, /a\|b<\/td>/u);
});

test('hides only citations known from structured sources, never code or ordinary numbers', () => {
  const answer = '建议 [1]，保留字面 [9]、`[1]`、[参数](https://example.com) 和 4090。';
  const html = render(answer, { hideCitations: true, sourceIndexes: [1] });
  assert.doesNotMatch(html, /建议 \[1\]/u);
  assert.match(html, /字面 \[9\]/u);
  assert.match(html, /<code>\[1\]<\/code>/u);
  assert.match(html, /4090/u);
  assert.doesNotMatch(render('参考 [1](@context-ref?id=42)', { hideCitations: true, sourceIndexes: [1] }), /context-ref/u);
});

test('raw HTML, unsafe links, and unverified remote images never execute', () => {
  const html = render('<img src=x onerror=alert(1)> [open](javascript:alert(1)) ![image](https://evil.test/a.png) <script>alert(1)</script>');
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('img,script,[onerror],a[href^="javascript:"]'), null);
  assert.doesNotMatch(html, /evil\.test/iu);
  assert.match(html, /&lt;img/u);
  assert.match(html, /图片内容尚未接通/u);
});

test('stable blocks retain their DOM identity as later stream content arrives', () => {
  const element = window.document.createElement('div');
  update(element, '第一段。\n\n| 项 | 值 |\n| --- | --- |\n| A | 1 |');
  const first = element.firstElementChild;
  update(element, '第一段。\n\n| 项 | 值 |\n| --- | --- |\n| A | 1 |\n\n尾段。');
  assert.equal(element.firstElementChild, first);
  assert.match(element.innerHTML, /尾段/u);
});
