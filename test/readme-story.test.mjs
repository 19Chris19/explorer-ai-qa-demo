import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = name => readFileSync(join(root, name), 'utf8');

test('README presents the brand, paired version and independent deployment honestly', () => {
  const text = read('README.md'), bundle = read('deploy/bundle.env');
  assert.match(text, /^# 知天下 AI 问答$/m);
  for (const value of ['v0.4.1', 'v0.6.1', '合成演示', '共享服务暂未开放', 'M1 Max', 'Windows', 'Linux',
    'sh onboard.sh doctor', 'sh onboard.sh init', '无需先手工部署两个仓库']) assert.ok(text.includes(value), value);
  assert.ok(text.length < 14000);
  assert.ok(text.indexOf('screenshots/welcome-desktop.png') < text.indexOf('## 开始部署'));
  assert.match(bundle, /PROVIDER_TAG=v0\.6\.1/);
  assert.match(read('docs/AGENT_DEPLOYMENT.md'), /固定 v0\.4\.1 \/ Provider v0\.6\.1/);
});

test('README local assets and links exist and logo provenance is explicit', () => {
  const text = read('README.md');
  const refs = [];
  marked.walkTokens(marked.lexer(text), token => {
    if (['link', 'image'].includes(token.type) && !token.href.startsWith('#')) refs.push(token.href.split('#')[0]);
  });
  for (const ref of refs) {
    if (/^[a-z]+:/i.test(ref)) continue;
    assert.ok(existsSync(join(root, ref)), ref);
    if (ref.endsWith('.svg')) {
      const svg = read(ref); assert.match(svg, /<title/); assert.match(svg, /viewBox=/);
      assert.doesNotMatch(svg, /<script|foreignObject/);
    }
    if (/\.(png|gif)$/.test(ref)) assert.ok(statSync(join(root, ref)).size < 1500000, ref);
  }
  assert.ok(read('assets/readme/ASSETS.md').includes('public/site/logo.png'));
  assert.ok(read('assets/readme/source/hero.html').includes('/public/site/logo.png'));
});
