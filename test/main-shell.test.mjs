import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('shell uses the real main-site asset and complete navigation without a second QA shell', () => {
  const doc = new JSDOM(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')).window.document;
  assert.equal(doc.querySelector('.site-sidebar .brand img').getAttribute('src'), '/site/logo.png');
  assert.equal(doc.querySelectorAll('.site-nav a').length, 9);
  assert.equal(doc.querySelectorAll('.site-nav .nav-icon').length, 9);
  assert.equal(doc.querySelector('.site-nav [aria-current="page"]').textContent.trim(), 'AI 问答');
  for (const text of ['我的创作', '上传作品', '视频渲染', '创作大赛']) assert.ok(doc.querySelector('.site-nav').textContent.includes(text));
  assert.equal(doc.querySelectorAll('#askForm').length, 1);
  assert.equal(doc.querySelector('#moreMenu').closest('.site-header, .site-sidebar'), null);
  const css = readFileSync(new URL('../public/main-shell.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns:\s*256px/u);
  assert.match(css, /grid-template-rows:\s*82px/u);
  assert.match(css, /qa-embedded/u);
  assert.doesNotMatch(css, /\.composer\s*\{|\.welcome\s*\{|\.message-content\s*\{/u);
  for (const match of css.matchAll(/url\("\.\/([^"\s]+)"\)/gu)) {
    const asset = readFileSync(new URL(`../public/${match[1]}`, import.meta.url));
    assert.ok(asset.length > 0);
    if (match[1].endsWith('.svg')) assert.doesNotMatch(asset.toString(), /<script|<foreignObject|\bon\w+=|\bhref=|\bstyle=/iu);
  }
});
