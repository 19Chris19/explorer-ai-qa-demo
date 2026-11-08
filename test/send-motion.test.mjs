import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { playSendMotion, sendMotionSettings } from '../public/send-motion.mjs';

function fixture({ reduced = false } = {}) {
  const dom = new JSDOM('<!doctype html><textarea></textarea><article><div class="message-content">Question</div></article>', { pretendToBeVisual:true });
  const { window } = dom;
  window.matchMedia = () => ({ matches:reduced });
  const source = window.document.querySelector('textarea');
  const target = window.document.querySelector('article');
  source.value = 'Question';
  source.getBoundingClientRect = () => ({ left:20, top:300, width:250, height:24 });
  target.getBoundingClientRect = () => ({ left:80, top:100, width:200, height:44 });
  const motions = [];
  window.Element.prototype.animate = function(frames, options) {
    const motion = { target:this, frames, options, cancelled:false,
      cancel() { this.cancelled = true; this.oncancel?.(); },
      finish() { this.onfinish?.(); } };
    motions.push(motion); return motion;
  };
  return { dom, source, target, motions };
}

test('flight is decorative, retains the draft, and releases it only after acknowledgement or interruption', () => {
  const f = fixture();
  try {
    const motion = playSendMotion({ source:f.source, target:f.target, text:'Question', holdSource:true });
    const ghost = f.dom.window.document.querySelector('.send-motion-flight');
    assert.equal(ghost.getAttribute('aria-hidden'), 'true');
    assert.equal(f.source.value, 'Question');
    assert.equal(f.source.style.opacity, '0');
    assert.equal(f.target.style.opacity, '0');
    f.motions[0].finish();
    assert.equal(f.dom.window.document.querySelector('.send-motion-flight'), null);
    assert.equal(f.source.style.opacity, '0');
    assert.equal(f.target.style.opacity, '');
    assert.equal(f.motions[1].target, f.target);
    motion.releaseSource();
    assert.equal(f.source.style.opacity, '');
    motion.cancel();
    assert.equal(f.motions[1].cancelled, true);
  } finally { f.dom.window.close(); }
});

test('interruption restores both real elements, and reduced motion never hides them', () => {
  const f = fixture();
  try {
    const motion = playSendMotion({ source:f.source, target:f.target, text:'Question', holdSource:true });
    motion.cancel();
    assert.equal(f.source.style.opacity, '');
    assert.equal(f.target.style.opacity, '');
    assert.equal(f.dom.window.document.querySelector('.send-motion-flight'), null);
  } finally { f.dom.window.close(); }
  const reduced = fixture({ reduced:true });
  try {
    playSendMotion({ source:reduced.source, target:reduced.target, text:'Question', holdSource:true });
    assert.equal(reduced.source.style.opacity, '');
    assert.equal(reduced.target.style.opacity, '');
    assert.equal(reduced.motions.length, 0);
  } finally { reduced.dom.window.close(); }
});

test('preview settings have bounded defaults and cannot create unbounded motion', () => {
  const f = fixture();
  try {
    const style = f.dom.window.document.documentElement.style;
    style.setProperty('--send-motion-flight', '9000');
    style.setProperty('--send-motion-arc', '-20');
    assert.deepEqual(sendMotionSettings(f.dom.window.document), { flight:1100, arc:0, rebound:2, settle:420 });
  } finally { f.dom.window.close(); }
});

test('an unavailable animation engine leaves the draft and message visible', () => {
  const f = fixture();
  try {
    f.dom.window.Element.prototype.animate = () => { throw new Error('synthetic animation failure'); };
    const motion = playSendMotion({ source:f.source, target:f.target, text:'Question', holdSource:true });
    assert.equal(f.source.style.opacity, '');
    assert.equal(f.target.style.opacity, '');
    assert.equal(f.dom.window.document.querySelector('.send-motion-flight'), null);
    assert.doesNotThrow(() => motion.cancel());
  } finally { f.dom.window.close(); }
});

test('a scrolling draft uses a bounded fade instead of flying clipped text', () => {
  const f = fixture();
  try {
    Object.defineProperty(f.source, 'scrollHeight', { value:500 });
    Object.defineProperty(f.source, 'clientHeight', { value:144 });
    playSendMotion({ source:f.source, target:f.target, text:'Question', holdSource:true });
    assert.equal(f.dom.window.document.querySelector('.send-motion-flight'), null);
    assert.equal(f.source.style.opacity, '');
    assert.equal(f.motions[0].target, f.target);
  } finally { f.dom.window.close(); }
});

test('a moving destination interrupts the flight and restores the real elements', () => {
  const f = fixture();
  try {
    const motion = playSendMotion({ source:f.source, target:f.target, text:'Question', holdSource:true });
    f.target.getBoundingClientRect = () => ({ left:80, top:70, width:200, height:44 });
    motion.checkPosition();
    assert.equal(f.source.style.opacity, '');
    assert.equal(f.target.style.opacity, '');
    assert.equal(f.dom.window.document.querySelector('.send-motion-flight'), null);
  } finally { f.dom.window.close(); }
});
