import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createSelectionCopy } from '../public/selection-copy.mjs';
import { openUi, until } from '../test-support/ui-harness.mjs';

function fixture(options = {}) {
  const window = new JSDOM('<main><div id="root"><article class="message assistant"><div class="message-content"><p>合成概念解释</p><pre>const a = 1;</pre></div><div class="source-count">检索资料 1 条</div></article><article class="message assistant"><div class="message-content">另一轮正文</div></article></div><textarea></textarea></main>', { pretendToBeVisual: true }).window;
  const doc = window.document, root = doc.querySelector('#root'), writes = [], timers = [];
  root.getBoundingClientRect = () => ({ left:0, right:1024, top:0, bottom:768 });
  window.Range.prototype.getClientRects = () => [{left:100,right:220,top:180,bottom:204,width:120,height:24}];
  const copy = createSelectionCopy(root, {
    getLabel: key => key, writeText: async text => writes.push(text),
    schedule: (fn, ms) => { timers.push({fn,ms}); return timers.length; }, cancel: () => {}, ...options,
  });
  const select = (node, start=0, end=node.textContent.length) => {
    const range=doc.createRange();range.setStart(node.firstChild,start);range.setEnd(node.firstChild,end);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);copy.refresh();
  };
  return {window,doc,root,copy,writes,timers,select,close(){copy.destroy();window.close();}};
}

test('selection copy captures just the displayed fragment and retains native highlight', async () => {
  const view=fixture();
  try {
    view.select(view.doc.querySelector('p'),2,6);
    assert.equal(view.doc.querySelector('.selection-copy-toolbar').hidden,false);
    const button=view.doc.querySelector('.selection-copy-button');
    const down=new view.window.Event('pointerdown',{bubbles:true,cancelable:true});button.dispatchEvent(down);
    assert.equal(down.defaultPrevented,true);
    button.click();button.click();await Promise.resolve();await Promise.resolve();
    assert.deepEqual(view.writes,['概念解释']);
    assert.equal(view.window.getSelection().toString(),'概念解释');
    assert.equal(button.getAttribute('aria-label'),'copied');
    assert.equal(view.timers.at(-1).ms,1500);
    view.timers.at(-1).fn();
    assert.equal(button.getAttribute('aria-label'),'copySelection');
    view.select(view.doc.querySelector('pre'));
    button.click();await Promise.resolve();await Promise.resolve();
    assert.equal(view.writes.at(-1),'const a = 1;');
  } finally {view.close();}
});

test('UI metadata and cross-answer ranges are ignored; dismissal does not change the selection', () => {
  const view=fixture();
  try {
    const toolbar=view.doc.querySelector('.selection-copy-toolbar');
    view.select(view.doc.querySelector('.source-count'));assert.equal(toolbar.hidden,true);
    const bodies=view.doc.querySelectorAll('.message-content');
    const range=view.doc.createRange();range.setStart(bodies[0].querySelector('p').firstChild,0);range.setEnd(bodies[1].firstChild,2);
    view.window.getSelection().removeAllRanges();view.window.getSelection().addRange(range);view.copy.refresh();
    assert.equal(toolbar.hidden,true);
    view.select(view.doc.querySelector('p'));
    view.doc.dispatchEvent(new view.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(toolbar.hidden,true);assert.equal(view.window.getSelection().toString(),'合成概念解释');
    view.copy.refresh();assert.equal(toolbar.hidden,true);
    view.select(view.doc.querySelector('p'),0,2);assert.equal(toolbar.hidden,false);
    view.root.dispatchEvent(new view.window.Event('scroll'));assert.equal(toolbar.hidden,true);
    view.select(view.doc.querySelector('p'),2,4);view.window.dispatchEvent(new view.window.Event('resize'));
    assert.equal(toolbar.hidden,true);
  } finally {view.close();}
});

test('clipboard denial yields safe selectable text and toolbar remains in the viewport', async () => {
  const view=fixture({writeText:async()=>{throw new Error('synthetic denied');}});
  try {
    const p=view.doc.querySelector('p');p.textContent='<img onerror=alert(1)>';
    view.window.Range.prototype.getClientRects=()=>[{left:980,right:1020,top:2,bottom:20,width:40,height:18}];
    view.select(p);
    const toolbar=view.doc.querySelector('.selection-copy-toolbar');
    assert.ok(Number.parseFloat(toolbar.style.left)<=1024-12-44);
    view.doc.querySelector('.selection-copy-button').click();await Promise.resolve();await Promise.resolve();
    const fallback=view.doc.querySelector('.selection-copy-fallback');
    assert.equal(fallback.value,p.textContent);assert.equal(fallback.readOnly,true);
    assert.equal(toolbar.querySelector('img'),null);assert.equal(view.doc.activeElement,fallback);
    assert.equal(fallback.selectionEnd,fallback.value.length);
  } finally {view.close();}
});

test('stale clipboard results cannot overwrite a later selection', async () => {
  let resolve;const view=fixture({writeText:()=>new Promise(done=>{resolve=done;})});
  try {
    view.select(view.doc.querySelector('p'),0,2);view.doc.querySelector('.selection-copy-button').click();
    view.select(view.doc.querySelector('p'),2,6);resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(view.doc.querySelector('.selection-copy-button').getAttribute('aria-label'),'copySelection');
    assert.equal(view.doc.querySelector('.selection-copy-status').textContent,'');
  } finally {view.close();}
});

test('multi-block selection preserves displayed newlines and conversation replacement dismisses the toolbar', async () => {
  const view=fixture();
  try {
    const body=view.doc.querySelector('.message-content'),range=view.doc.createRange();
    range.selectNodeContents(body);
    const selection=view.window.getSelection();selection.removeAllRanges();selection.addRange(range);
    const expected=selection.toString();view.copy.refresh();
    view.doc.querySelector('.selection-copy-button').click();await Promise.resolve();await Promise.resolve();
    assert.equal(view.writes[0],expected);
    body.replaceChildren();await Promise.resolve();
    assert.equal(view.doc.querySelector('.selection-copy-toolbar').hidden,true);
    view.copy.destroy();assert.equal(view.doc.querySelector('.selection-copy-toolbar'),null);
  } finally {view.close();}
});

test('app selection copy is bilingual and never submits a question', async () => {
  const writes=[];
  const view=await openUi({
    conversationId:'synthetic-selection',
    setup:window=>{
      window.Range.prototype.getClientRects=()=>[{left:100,right:200,top:180,bottom:200,width:100,height:20}];
      Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async text=>writes.push(text)}});
    },
    fetchImpl:async url=>url==='/api/qa/conversations/synthetic-selection'?{ok:true,json:async()=>({
      conversation:{conversationId:'synthetic-selection'},messages:[{role:'assistant',content:'合成选区正文'}],
    })}:null,
  });
  try {
    await until(()=>view.document.querySelector('.message.assistant'));
    view.document.querySelector('#chatLog').getBoundingClientRect=()=>({left:0,right:1024,top:0,bottom:768});
    const range=view.document.createRange();range.selectNodeContents(view.document.querySelector('.message-content'));
    const selection=view.window.getSelection();selection.removeAllRanges();selection.addRange(range);
    view.document.dispatchEvent(new view.window.Event('selectionchange'));
    const button=view.document.querySelector('.selection-copy-button');
    assert.equal(button.getAttribute('aria-label'),'复制选中文字');
    button.click();await until(()=>writes.length===1);
    assert.equal(writes[0],'合成选区正文');
    assert.equal(view.requests.some(item=>item.options?.method==='POST'),false);
    view.document.querySelector('#languageButton').click();
    assert.equal(button.getAttribute('aria-label'),'Copied');
  } finally {view.close();}
});
