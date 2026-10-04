import { createQuestionRotation } from './question-rotation.mjs';
import { createPromptSparks } from './prompt-sparks.mjs';
import { createVoicePreview } from './voice-preview.mjs';
import { inspectSourceEvidence } from './source-evidence.mjs';
import { lifecycleView } from './turn-lifecycle.mjs';
import { createAnswerProcess } from './answer-process.mjs';
import { createMessageShapes } from './message-shape.mjs';
import { resizeComposer, observeComposerWidth } from './composer-shape.mjs';
import { composerControlState, providerAccessState } from './composer-controls.mjs';
import { createAnswerCopy } from './answer-copy.mjs';
import { createSelectionCopy } from './selection-copy.mjs';
import { createHostBridge } from './host-bridge.mjs';

const assetPrefix = document.querySelector('meta[name="qa-asset-prefix"]')?.content || '';
const sitePath = path => `${assetPrefix}${path}`;
const storageKey = key => `${document.querySelector('meta[name="qa-storage-namespace"]')?.content || ''}${key}`;
let hostBridge = null;
const answerCopies = new WeakMap();

const log = document.querySelector('#chatLog');
const main = document.querySelector('#main');
const list = document.querySelector('#conversationList');
const question = document.querySelector('#question');
const form = document.querySelector('#askForm');
const messageShapes = createMessageShapes();
document.fonts?.ready.then(() => messageShapes.refresh());
const connection = document.querySelector('#connection');
const menuConnection = document.querySelector('#menuConnection');
const requestStatus = document.querySelector('#requestStatus');
const sendButton = document.querySelector('#sendButton');
const history = document.querySelector('#historySidebar');
const historySearch = document.querySelector('#historySearch');
const moreToggle = document.querySelector('#moreToggle');
const moreMenu = document.querySelector('#moreMenu');
const suggestionStrip = document.querySelector('#suggestionStrip');
const suggestionList = document.querySelector('#suggestionList');
const webSearchButton = document.querySelector('#webSearchButton');
const webIntentLabel = document.querySelector('#webIntentLabel');
const composerSparks = createPromptSparks(document.querySelector('#composerSparks'), { root: form });
const micButton = document.querySelector('#micButton');
const voicePreviewHint = document.querySelector('#voicePreviewHint');
const accessNote = document.querySelector('#composerAccessNote');
let voiceHintTimer = 0;
const voicePreview = createVoicePreview({
  setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
  onChange: updateVoicePreviewControl,
});
const composerWrap = document.querySelector('#composerWrap');
const composerFloatActions = document.querySelector('#composerFloatActions');
const jumpLatest = document.querySelector('#jumpLatest');
const queuedTurns = document.querySelector('#queuedTurns');
const adminLink = document.querySelector('.admin-link');
if (adminLink && ['localhost', '127.0.0.1'].includes(window.location?.hostname)) adminLink.hidden = false;
const state = {
  conversationId: sessionStorage.getItem(storageKey('qa-native-conversation-id')) || '',
  legacyMode: false, busy: false, controller: null, webIntentSupported: false, webRequested: false, access: 'checking',
  activeWebRequest: false, webRequestState: 'idle',
  queuedJobs: [], queueSubmitting: false, preparing: false, activeQueuedId: '',
  questionBank: [], questionRotation: null, currentSuggestions: null, carouselTimer: 0, carouselHover: false, carouselFocus: false, suggestionSelected: false, composing: false,
  followLatest: true,
};
let conversationItems = [];
let suggestionFlight = null;
let composerImpact = null;
let exitingWelcome = null;
let webStateTimer = 0;
const ui = {
  locale: localStorage.getItem(storageKey('qa-ui-locale')) === 'en' ? 'en' : 'zh',
  color: ['blue', 'teal', 'graphite'].includes(localStorage.getItem(storageKey('qa-ui-color'))) ? localStorage.getItem(storageKey('qa-ui-color')) : 'blue',
  dark: localStorage.getItem(storageKey('qa-ui-dark')) === 'true',
};
const labels = {
  zh: {
    qaNav: 'AI 问答', communityNav: '交流群', worldNav: '3DGS世界', computeNav: '免费计算', guideNav: '创作指南', aboutNav: '关于我们', adminNav: '问答管理',
    newChat: '新建对话', recentChats: '最近对话', moreOptions: '更多选项', historyClose: '关闭最近对话', language: '语言', themeColor: '主题色', darkMode: '深色模式', serviceStatus: '服务状态', historyFoot: '对话记录保留 7 天。',
    titleLead: '你的 3DGS 疑问，', titleSubject: '随时来聊。', intro: '由一线 3DGS 社群的真实交流与持续积累的实战经验强势驱动。', placeholder: '输入你的 3DGS 问题…',
    searchHistory: '搜索对话', noHistory: '还没有对话', noMatches: '没有匹配的对话', newConversation: '新对话', deleteConfirm: '确定删除这段对话吗？',
    disclaimer: '回答可能不完整，请自行核对重要信息。', webRequested: '本轮请求联网', webIntentOn: '本轮将请求联网',
    webEvidence: '已取得可验证网页来源 {count} 条', webNoEvidence: '已请求联网 · 未取得可验证网页来源', evidenceUnverified: '来源信息无法验证',
    webSources: '网页来源 {count} 条', micPreview: '预览语音动画（不录音）', micPreviewStop: '结束语音动画预览（不录音）', micPreviewHint: '仅动画预览，不录音',
    ready: '知识库问答可接收', verified: '知识库问答已验证', noCapacity: '账号容量暂不可用', noCredentials: '等待接入凭证', incompatible: '问答协议版本不兼容', offline: '服务暂不可用', checking: '正在检查连接',
    jumpLatest: '回到最新', sendQuestion: '发送问题', stopAnswer: '停止回答', enqueueQuestion: '加入队列', queued: '排队中', paused: '上一轮未完成，已暂停', starting: '即将回答', editQueued: '编辑待发问题', deleteQueued: '删除待发问题', saveQueued: '保存修改', cancelEdit: '取消编辑',
    copyAnswer: '复制回答 Markdown', copyPartial: '复制已收到的部分回答', copied: '已复制', copyFailed: '复制失败，请选择下面的文字复制', closeCopyText: '关闭可复制文字',
    copySelection: '复制选中文字', selectionActions: '选中文字操作', selectionCopyFailed: '复制失败，可选择下方文字复制',
  },
  en: {
    qaNav: 'AI Q&A', communityNav: 'Community', worldNav: '3DGS World', computeNav: 'Free Compute', guideNav: 'Guide', aboutNav: 'About', adminNav: 'Q&A Admin',
    newChat: 'New conversation', recentChats: 'Recent conversations', moreOptions: 'More options', historyClose: 'Close recent conversations', language: 'Language', themeColor: 'Accent color', darkMode: 'Dark mode', serviceStatus: 'Service status', historyFoot: 'Conversations are kept for 7 days.',
    titleLead: 'Have a 3DGS question?', titleSubject: "Let's talk.", intro: 'Powered by real 3DGS community conversations and a growing body of hands-on experience.', placeholder: 'Ask a 3DGS question…',
    searchHistory: 'Search conversations', noHistory: 'No conversations yet', noMatches: 'No matching conversations', newConversation: 'New conversation', deleteConfirm: 'Delete this conversation?',
    disclaimer: 'Answers may be incomplete. Verify important details.', webRequested: 'Request web sources for this turn', webIntentOn: 'Web sources requested for this turn',
    webEvidence: 'Verified web sources: {count}', webNoEvidence: 'Web requested · no verifiable web sources found', evidenceUnverified: 'Source evidence could not be verified',
    webSources: 'Web sources: {count}', micPreview: 'Preview voice animation (no recording)', micPreviewStop: 'End voice animation preview (no recording)', micPreviewHint: 'Animation only; no recording',
    ready: 'Knowledge Q&A available', verified: 'Knowledge Q&A verified', noCapacity: 'No account capacity', noCredentials: 'Waiting for credentials', incompatible: 'Incompatible Q&A contract', offline: 'Service unavailable', checking: 'Checking connection',
    jumpLatest: 'Jump to latest', sendQuestion: 'Send question', stopAnswer: 'Stop answer', enqueueQuestion: 'Queue next', queued: 'Queued', paused: 'Paused after an incomplete turn', starting: 'Starting next answer', editQueued: 'Edit queued question', deleteQueued: 'Remove queued question', saveQueued: 'Save changes', cancelEdit: 'Cancel editing',
    copyAnswer: 'Copy answer Markdown', copyPartial: 'Copy received partial answer', copied: 'Copied', copyFailed: 'Copy failed; select the text below to copy', closeCopyText: 'Close selectable text',
    copySelection: 'Copy selected text', selectionActions: 'Selected text actions', selectionCopyFailed: 'Copy failed; select the text below',
  },
};
function t(key) { return labels[ui.locale][key] || key; }

const selectionCopy = createSelectionCopy(log, { getLabel: t });
applyPreferences();
resizeQuestion();
observeComposerWidth(question, resizeQuestion);
document.fonts?.ready.then(resizeQuestion);

function applyPreferences() {
  selectionCopy.refresh();
  document.documentElement.lang = ui.locale === 'zh' ? 'zh-CN' : 'en';
  document.body.dataset.color = ui.color;
  document.body.classList.toggle('dark', ui.dark);
  document.querySelector('meta[name="theme-color"]').content = ui.dark ? '#151e2b' : '#ffffff';
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  document.querySelector('#languageValue').textContent = ui.locale === 'zh' ? '中文' : 'English';
  document.querySelector('#darkModeButton').setAttribute('aria-pressed', String(ui.dark));
  document.querySelectorAll('[data-color-option]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.colorOption === ui.color));
  });
  updateQuestionPlaceholder();
  updateSendButton();
  renderQueue();
  historySearch.placeholder = t('searchHistory');
  for (const message of log.querySelectorAll('.message.assistant')) answerCopies.get(message)?.control.refresh();
  historySearch.setAttribute('aria-label', t('searchHistory'));
  moreToggle.setAttribute('aria-label', t('moreOptions'));
  moreToggle.title = t('moreOptions');
  moreMenu.setAttribute('aria-label', t('moreOptions'));
  history.setAttribute('aria-label', t('recentChats'));
  document.querySelector('#historyClose').setAttribute('aria-label', t('historyClose'));
  document.querySelector('#historyClose').title = t('historyClose');
  updateWebIntentControl();
  updateVoicePreviewControl();
  renderSuggestions();
  updateFloatingControls();
  hostBridge?.preferences({ locale: ui.locale, dark: ui.dark, color: ui.color });
}

function updateQuestionPlaceholder() {
  question.placeholder = main.classList.contains('is-empty') ? t('placeholder') : '';
}

function closeMore({ restore = false } = {}) {
  const ownedFocus = moreMenu.contains(document.activeElement);
  moreMenu.hidden = true;
  moreToggle.setAttribute('aria-expanded', 'false');
  if (restore && ownedFocus) moreToggle.focus();
}

function closeHistory({ restore = false } = {}) {
  const ownedFocus = history.contains(document.activeElement);
  history.hidden = true;
  document.querySelector('#showHistory').setAttribute('aria-expanded', 'false');
  if (restore && ownedFocus) moreToggle.focus();
}

document.querySelector('#newChat').addEventListener('click', async () => {
  voicePreview.stop();
  if (state.busy || state.preparing || state.queueSubmitting || state.queuedJobs.length) return;
  try {
    const data = await api(sitePath('/api/qa/conversations'), { method: 'POST' });
    setConversation(data.conversation.conversationId);
    question.value = '';
    state.suggestionSelected = false;
    welcome();
    await loadConversations();
    closeMore();
    closeHistory();
    question.focus();
  } catch (error) { status(error.message, true); closeMore(); }
});
moreToggle.addEventListener('click', event => {
  closeHistory();
  if (!moreMenu.hidden) return closeMore();
  moreMenu.hidden = false;
  moreToggle.setAttribute('aria-expanded', 'true');
  if (event.detail === 0) document.querySelector('#newChat').focus();
});
document.querySelector('#showHistory').addEventListener('click', () => {
  closeMore();
  history.hidden = false;
  document.querySelector('#showHistory').setAttribute('aria-expanded', 'true');
  historySearch.focus();
});
document.querySelector('#historyClose').addEventListener('click', () => closeHistory({ restore: true }));
historySearch.addEventListener('input', renderConversationList);
document.querySelector('#languageButton').addEventListener('click', () => {
  ui.locale = ui.locale === 'zh' ? 'en' : 'zh';
  localStorage.setItem(storageKey('qa-ui-locale'), ui.locale);
  applyPreferences();
  if (main.classList.contains('is-empty')) welcome();
  renderConversationList();
  void checkHealth();
});
document.querySelectorAll('[data-color-option]').forEach(button => button.addEventListener('click', () => {
  ui.color = button.dataset.colorOption;
  localStorage.setItem(storageKey('qa-ui-color'), ui.color);
  applyPreferences();
}));
document.querySelector('#darkModeButton').addEventListener('click', () => {
  ui.dark = !ui.dark;
  localStorage.setItem(storageKey('qa-ui-dark'), String(ui.dark));
  applyPreferences();
});
micButton.addEventListener('click', () => {
  voicePreview.toggle();
  clearTimeout(voiceHintTimer);
  voicePreviewHint.textContent = t('micPreviewHint');
  voicePreviewHint.hidden = false;
  voiceHintTimer = window.setTimeout(() => { voicePreviewHint.hidden = true; }, 2400);
});
window.addEventListener('pagehide', () => {
  voicePreview.stop();
  composerSparks.setActive(false);
});
window.addEventListener('pageshow', updateWebIntentControl);
webSearchButton.addEventListener('click', () => {
  if (!state.webIntentSupported) return;
  state.webRequested = !state.webRequested;
  updateWebIntentControl();
});
suggestionStrip.addEventListener('pointerenter', () => { state.carouselHover = true; updateCarouselTimer(); });
suggestionStrip.addEventListener('pointerleave', () => { state.carouselHover = false; updateCarouselTimer(); });
suggestionStrip.addEventListener('focusin', () => { state.carouselFocus = true; updateCarouselTimer(); });
suggestionStrip.addEventListener('focusout', event => {
  if (!suggestionStrip.contains(event.relatedTarget)) { state.carouselFocus = false; updateCarouselTimer(); }
});
suggestionList.addEventListener('click', event => {
  const button = event.target.closest('[data-question-id]');
  if (!button || state.suggestionSelected || state.composing || question.value.trim()) return;
  const source = button.getBoundingClientRect();
  const computed = getComputedStyle(button);
  const style = { font: computed.font, lineHeight: computed.lineHeight, color: computed.color };
  question.value = button.dataset.question;
  resizeQuestion();
  updateSendButton();
  question.focus();
  question.setSelectionRange(question.value.length, question.value.length);
  state.suggestionSelected = true;
  renderSuggestions();
  updateCarouselTimer();
  animateSuggestionSelection(button.dataset.question, source, style);
});
question.addEventListener('focus', updateCarouselTimer);
question.addEventListener('blur', updateCarouselTimer);
question.addEventListener('compositionstart', () => { state.composing = true; updateCarouselTimer(); });
question.addEventListener('compositionend', () => { state.composing = false; updateSuggestionVisibility(); updateCarouselTimer(); });
question.addEventListener('input', () => {
  if (state.suggestionSelected && !question.value.trim()) {
    state.suggestionSelected = false;
    clearSuggestionMotion();
    renderSuggestions();
  }
  updateSuggestionVisibility();
  resizeQuestion(); updateSendButton(); updateCarouselTimer();
});
document.addEventListener('visibilitychange', updateCarouselTimer);
jumpLatest.addEventListener('click', () => {
  returnToLatest();
});
let userScrollUntil = 0;
let lastScrollTop = 0;
let touchStartY = 0;
const markUserScroll = () => { userScrollUntil = performance.now() + 200; };
log.addEventListener('wheel', event => {
  markUserScroll();
  if (event.deltaY > 0 && !state.followLatest && isNearLatest()) returnToLatest();
}, { passive: true });
log.addEventListener('touchstart', event => { touchStartY = event.touches[0]?.clientY ?? 0; }, { passive: true });
log.addEventListener('touchmove', event => {
  markUserScroll();
  if ((event.touches[0]?.clientY ?? touchStartY) < touchStartY && !state.followLatest && isNearLatest()) returnToLatest();
}, { passive: true });
log.addEventListener('pointerdown', markUserScroll);
log.addEventListener('pointermove', event => { if (event.buttons) markUserScroll(); });
document.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
      && !['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) {
    markUserScroll();
    if (['ArrowDown', 'PageDown', 'End'].includes(event.key) && !state.followLatest && isNearLatest()) returnToLatest();
  }
});
log.addEventListener('scroll', () => {
  const top = log.scrollTop;
  const direction = top - lastScrollTop;
  lastScrollTop = top;
  if (main.classList.contains('is-empty') || performance.now() > userScrollUntil) return;
  const nearLatest = isNearLatest();
  if (!nearLatest && direction < 0) {
    state.followLatest = false;
    updateFloatingControls();
  } else if (nearLatest && direction > 0) {
    state.followLatest = true;
    updateFloatingControls();
  }
});
new ResizeObserver(() => {
  if (main.classList.contains('is-empty')) return;
  const clearance = Math.ceil(composerWrap.getBoundingClientRect().height + 24);
  log.style.setProperty('--composer-clearance', `${clearance}px`);
  if (state.followLatest) requestAnimationFrame(scrollBottom);
}).observe(composerWrap);
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('#moreMenu, #moreToggle')) closeMore();
  if (!event.target.closest('#historySidebar, #showHistory')) closeHistory();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!history.hidden) closeHistory({ restore: true });
  else if (!moreMenu.hidden) closeMore({ restore: true });
});
sendButton.addEventListener('click', async () => {
  if (!state.busy || question.value.trim()) return;
  sendButton.disabled = true;
  if (state.activeQueuedId) {
    try { await api(sitePath(`/api/qa/queue/${encodeURIComponent(state.activeQueuedId)}`), { method: 'DELETE' }); }
    catch (error) { status(error.message, true); sendButton.disabled = false; }
  } else if (state.controller && !state.controller.signal.aborted) state.controller.abort();
  else sendButton.disabled = false;
});
form.addEventListener('submit', event => { event.preventDefault(); void submitQuestion(); });
question.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void submitQuestion(); }
});

void init();

async function init() {
  welcome();
  await Promise.all([checkHealth(), loadConversations(), loadQuestionBank()]);
  if (state.conversationId) await loadConversation(state.conversationId);
  updateCarouselTimer();
}

async function checkHealth() {
  try {
    const response = await fetch(sitePath('/api/qa/health'));
    const data = await response.json();
    state.webIntentSupported = response.ok && data.webIntentSupported === true;
    document.querySelector('#runtimeVersion').textContent = `${data.websiteRelease || 'local-dev'} · Provider 合同 ${data.contractSupported ? 'v1' : '未确认'}`;
    if (!state.webIntentSupported) state.webRequested = false;
    updateWebIntentControl();
    state.access = providerAccessState(response.ok, data);
    const ready = state.access === 'ready';
    const text = ready ? (data.lastRealSuccessAt ? t('verified') : t('ready')) : data.connected ? (!data.authenticated ? t('noCredentials') : data.contractSupported === false ? t('incompatible') : t('noCapacity')) : t('offline');
    const title = ready ? `原生知识库 Agent 容量 ${data.capacity}；${data.lastRealSuccessAt ? '最近一次真实回答已完成' : '尚无本次运行中的真实回答记录'}` : '';
    setConnection(text, ready, title);
  } catch {
    state.access = 'offline';
    state.webIntentSupported = false;
    state.webRequested = false;
    updateWebIntentControl();
    setConnection(t('offline'), false);
  }
  accessNote.textContent = ['ready', 'checking'].includes(state.access) ? '' : t(state.access);
  accessNote.hidden = !accessNote.textContent;
  updateSendButton();
}

function setConnection(text, ready, title = '') {
  connection.textContent = text;
  connection.title = title;
  connection.className = `connection ${ready ? 'online' : 'offline'}`;
  menuConnection.textContent = text;
  menuConnection.title = title;
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后重试');
  return data;
}

async function loadConversations() {
  try {
    const data = await api(sitePath('/api/qa/conversations'));
    conversationItems = data.conversations || [];
    renderConversationList();
  } catch { conversationItems = []; renderConversationList(); }
}

function renderConversationList() {
    list.replaceChildren();
    const search = historySearch.value.trim().toLocaleLowerCase();
    const filtered = conversationItems.filter(item => (item.title || '').toLocaleLowerCase().includes(search));
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = search ? t('noMatches') : t('noHistory');
      list.append(empty);
    }
    for (const item of filtered) {
      const row = document.createElement('div'); row.className = `conversation-item ${item.conversationId === state.conversationId ? 'active' : ''}`;
      const open = document.createElement('button'); open.type = 'button'; open.className = 'conversation-open';
      open.textContent = item.title || t('newConversation'); open.title = item.title || t('newConversation');
      open.addEventListener('click', () => { if (!state.busy && !state.preparing && !state.queueSubmitting) void loadConversation(item.conversationId); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'conversation-delete';
      remove.textContent = '×'; remove.setAttribute('aria-label', `${t('deleteConfirm')} ${item.title || t('newConversation')}`);
      remove.addEventListener('click', async () => {
        if (state.busy || state.preparing || state.queueSubmitting || !confirm(t('deleteConfirm'))) return;
        try {
          await api(sitePath(`/api/qa/conversations/${encodeURIComponent(item.conversationId)}`), { method: 'DELETE' });
          if (state.conversationId === item.conversationId) { setConversation(''); welcome(); }
          await loadConversations();
        } catch (error) { status(error.message, true); closeHistory(); }
      });
      row.append(open, remove); list.append(row);
    }
}

async function loadConversation(id) {
  try {
    const data = await api(sitePath(`/api/qa/conversations/${encodeURIComponent(id)}`));
    setConversation(data.conversation.conversationId);
    state.legacyMode = data.legacyMode === true;
    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (messages.length) renderThread(messages);
    else welcome();
    if (state.legacyMode) status('这段历史可查看。继续提问请新建会话，使用原生知识库 Agent。', true);
    closeHistory({ restore: true });
    await loadConversations();
    await syncQueue();
  } catch {
    if (id === state.conversationId) { setConversation(''); welcome(); }
  }
}

function setConversation(id) {
  voicePreview.stop();
  state.conversationId = id;
  state.legacyMode = false;
  if (id) sessionStorage.setItem(storageKey('qa-native-conversation-id'), id);
  else sessionStorage.removeItem(storageKey('qa-native-conversation-id'));
}

function status(message, showInThread = false) {
  requestStatus.textContent = message || '';
  if (!showInThread || main.classList.contains('is-empty')) return;
  const thread = log.querySelector('.chat-thread');
  if (!thread) return;
  let notice = thread.querySelector('.chat-notice');
  if (!notice) {
    notice = document.createElement('p');
    notice.className = 'chat-notice';
    thread.append(notice);
  }
  notice.textContent = message;
  state.followLatest = true;
  updateFloatingControls();
  requestAnimationFrame(scrollBottom);
}
function busy(value) {
  state.busy = value;
  updateSendButton();
  updateWebIntentControl();
  updateFloatingControls();
}

function updateSendButton() {
  const { stopping, disabled, action } = composerControlState({ ...state, draft: question.value });
  const label = t(action);
  sendButton.type = stopping ? 'button' : 'submit';
  sendButton.disabled = disabled;
  sendButton.classList.toggle('is-busy', stopping);
  sendButton.setAttribute('aria-label', label);
  sendButton.title = disabled && state.access !== 'ready' ? t(state.access) : label;
}

function queueIcon(symbol, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.setAttribute('aria-label', label);
  button.title = label;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('icon');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', sitePath(`/icons.svg#${symbol}`));
  icon.append(use);
  button.append(icon);
  return button;
}

function renderQueue() {
  queuedTurns.replaceChildren();
  const visible = state.queuedJobs.filter(job => job.id !== state.activeQueuedId || ['queued', 'paused', 'replay'].includes(job.status));
  queuedTurns.hidden = main.classList.contains('is-empty') || !visible.length;
  for (const job of visible) {
    const row = document.createElement('div'); row.className = 'queued-item';
    const body = document.createElement('div'); body.className = 'queued-body';
    const stateLabel = document.createElement('span'); stateLabel.className = 'queued-state';
    stateLabel.textContent = t(job.status === 'paused' ? 'paused' : ['running', 'replay'].includes(job.status) ? 'starting' : 'queued');
    const text = document.createElement('p'); text.className = 'queued-question'; text.textContent = job.question;
    body.append(stateLabel, text);
    row.append(body);
    if (job.status === 'queued' || job.status === 'paused') {
      const controls = document.createElement('div'); controls.className = 'queued-controls';
      const edit = queueIcon('pencil', t('editQueued'));
      const remove = queueIcon('trash', t('deleteQueued'));
      edit.addEventListener('click', () => {
        const editor = document.createElement('textarea'); editor.className = 'queued-editor';
        editor.maxLength = 2000; editor.value = job.question; editor.setAttribute('aria-label', t('editQueued'));
        text.replaceWith(editor);
        edit.replaceWith(queueIcon('check', t('saveQueued')));
        const save = controls.firstElementChild;
        const cancel = queueIcon('x', t('cancelEdit'));
        controls.insertBefore(cancel, remove);
        save.addEventListener('click', async () => {
          const questionText = editor.value.trim();
          if (!questionText) { editor.focus(); return; }
          save.disabled = true;
          try {
            await api(sitePath(`/api/qa/queue/${encodeURIComponent(job.id)}`), {
              method: 'PATCH', body: JSON.stringify({ question: questionText, ...(job.sourceIntent === 'web' ? { sourceIntent: 'web' } : {}) }),
            });
            await syncQueue(false);
          } catch (error) { save.disabled = false; status(error.message, true); }
        });
        cancel.addEventListener('click', renderQueue);
        editor.focus();
      });
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await api(sitePath(`/api/qa/queue/${encodeURIComponent(job.id)}`), { method: 'DELETE' }); await syncQueue(false); }
        catch (error) { remove.disabled = false; status(error.message, true); }
      });
      controls.append(edit, remove); row.append(controls);
    }
    queuedTurns.append(row);
  }
}

async function syncQueue(autoConsume = true) {
  const conversationId = state.conversationId;
  if (!conversationId) { state.queuedJobs = []; renderQueue(); return false; }
  try {
    const data = await api(sitePath(`/api/qa/queue?conversationId=${encodeURIComponent(conversationId)}`));
    if (conversationId !== state.conversationId) return false;
    const fresh = Array.isArray(data.queue) ? data.queue : [];
    const replay = autoConsume ? state.queuedJobs.filter(job =>
      ['queued', 'running', 'replay'].includes(job.status)
      && job.id !== state.activeQueuedId && !fresh.some(item => item.id === job.id),
    ).map(job => ({ ...job, status: 'replay' })) : [];
    state.queuedJobs = [...fresh, ...replay];
    const next = state.queuedJobs.find(job => ['running', 'queued', 'replay'].includes(job.status));
    if (autoConsume && next && !state.controller && !state.activeQueuedId) {
      state.activeQueuedId = next.id;
      renderQueue();
      void streamAnswer(
        next.question,
        next.sourceIntent === 'web',
        signal => fetch(sitePath(`/api/qa/queue/${encodeURIComponent(next.id)}/events`), { signal }),
        next.id,
        next.createdAt,
      );
      return true;
    }
    renderQueue();
    return Boolean(next);
  } catch (error) { status(error.message, true); return false; }
}

async function submitQuestion() {
  voicePreview.stop();
  const text = question.value.trim();
  if (!text || state.preparing || state.queueSubmitting) return;
  if (state.access !== 'ready') { status(t(state.access), true); return; }
  if (state.busy) { await enqueueQuestion(text); return; }
  if (state.queuedJobs.some(job => job.status === 'paused')) { status('请先删除上一轮未完成的待发问题，再继续提问。', true); return; }
  await ask(text);
}

async function enqueueQuestion(text) {
  if (!state.conversationId) { status('正在准备会话，请稍后再发送。', true); return; }
  state.queueSubmitting = true;
  updateSendButton();
  try {
    const data = await api(sitePath('/api/qa/queue'), {
      method: 'POST',
      body: JSON.stringify({ question: text, conversationId: state.conversationId, requestId: crypto.randomUUID(), ...(state.webRequested ? { sourceIntent: 'web' } : {}) }),
    });
    if (question.value.trim() === text) { question.value = ''; resizeQuestion(); }
    state.webRequested = false;
    updateWebIntentControl();
    state.queuedJobs = [...state.queuedJobs.filter(job => job.id !== data.job.id), data.job];
    renderQueue();
    status('下一问已加入队列');
  } catch (error) { status(error.message, true); }
  finally { state.queueSubmitting = false; updateSendButton(); }
}

function isNearLatest() { return log.scrollHeight - log.clientHeight - log.scrollTop <= 80; }

function returnToLatest() {
  state.followLatest = true;
  updateFloatingControls();
  requestAnimationFrame(scrollBottom);
}

function updateFloatingControls() {
  const empty = main.classList.contains('is-empty');
  jumpLatest.hidden = empty || state.followLatest;
  jumpLatest.title = t('jumpLatest');
  jumpLatest.setAttribute('aria-label', t('jumpLatest'));
  composerFloatActions.hidden = jumpLatest.hidden;
}

function resizeQuestion() {
  resizeComposer(form, question);
}

function updateWebIntentControl() {
  webSearchButton.hidden = !state.webIntentSupported;
  webSearchButton.setAttribute('aria-pressed', String(state.webRequested));
  webSearchButton.classList.toggle('is-active', state.webRequested);
  webSearchButton.title = t('webRequested');
  webSearchButton.setAttribute('aria-label', t('webRequested'));
  webIntentLabel.hidden = !state.webRequested;
  form.classList.toggle('is-web-armed', state.webRequested && !state.busy);
  form.classList.toggle('is-web-searching', state.activeWebRequest && state.webRequestState === 'searching');
  form.classList.toggle('is-web-verified', state.webRequestState === 'verified');
  form.classList.toggle('is-web-missing', state.webRequestState === 'missing');
  composerSparks.setActive(state.webRequested || (state.activeWebRequest && state.webRequestState === 'searching'));
}

function updateVoicePreviewControl() {
  micButton.classList.toggle('is-previewing', voicePreview.active);
  micButton.setAttribute('aria-pressed', String(voicePreview.active));
  const label = t(voicePreview.active ? 'micPreviewStop' : 'micPreview');
  micButton.title = label;
  micButton.setAttribute('aria-label', label);
}

function setWebRequestState(value) {
  if (webStateTimer) clearTimeout(webStateTimer);
  webStateTimer = 0;
  state.webRequestState = value;
  updateWebIntentControl();
  if (!['verified', 'missing'].includes(value)) return;
  webStateTimer = setTimeout(() => {
    webStateTimer = 0;
    state.webRequestState = 'idle';
    updateWebIntentControl();
  }, 2400);
}

async function loadQuestionBank() {
  try {
    const response = await fetch(sitePath('/questions.json'));
    if (!response.ok) throw new Error('question_bank_unavailable');
    const items = await response.json();
    if (!Array.isArray(items) || items.length !== 50) throw new Error('question_bank_invalid');
    state.questionBank = items;
    state.questionRotation = createQuestionRotation(items);
    state.currentSuggestions = null;
    renderSuggestions(true);
  } catch {
    suggestionStrip.hidden = true;
  }
}

function renderSuggestions(advance = false) {
  if (!suggestionList || !state.questionRotation) return;
  const items = advance || !state.currentSuggestions
    ? state.questionRotation.next(1)
    : state.currentSuggestions;
  state.currentSuggestions = items;
  suggestionList.replaceChildren();
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-question';
    button.dataset.questionId = item.id;
    button.dataset.question = ui.locale === 'en' ? item.en : item.zh;
    const text = document.createElement('span'); text.textContent = button.dataset.question;
    const arrow = document.createElement('span'); arrow.className = 'suggestion-arrow'; arrow.textContent = '→'; arrow.setAttribute('aria-hidden', 'true');
    button.append(text, arrow);
    button.title = button.dataset.question;
    suggestionList.append(button);
  }
  updateSuggestionVisibility();
  suggestionStrip.hidden = !main.classList.contains('is-empty');
  if (advance) updateCarouselTimer();
}

function updateSuggestionVisibility() {
  const hidden = state.suggestionSelected || Boolean(question.value.trim());
  suggestionStrip.classList.toggle('has-draft', hidden);
  suggestionStrip.classList.toggle('is-selected', state.suggestionSelected);
  for (const button of suggestionList.querySelectorAll('button')) button.tabIndex = hidden ? -1 : 0;
}

function rotateSuggestions() {
  if (!state.questionRotation || !main.classList.contains('is-empty')) return;
  renderSuggestions(true);
  updateCarouselTimer();
}

function updateCarouselTimer() {
  if (state.carouselTimer) clearTimeout(state.carouselTimer);
  state.carouselTimer = 0;
  const paused = !state.questionRotation || !main.classList.contains('is-empty')
    || state.suggestionSelected || state.composing
    || state.carouselHover || state.carouselFocus || document.hidden
    || document.activeElement === question || question.value.trim()
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (paused) return;
  state.carouselTimer = setTimeout(() => {
    state.carouselTimer = 0;
    rotateSuggestions();
  }, 12000);
}

function clearSuggestionMotion() {
  suggestionFlight?.remove();
  suggestionFlight = null;
  composerImpact?.cancel();
  composerImpact = null;
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function animateContentIn(element, { distance = 8, duration = 240 } = {}) {
  if (!element || typeof element.animate !== 'function') return;
  if (reducedMotion()) {
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'linear' });
    return;
  }
  element.animate([
    { opacity: 0, transform: `translateY(${distance}px)` },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration, easing: 'cubic-bezier(.2, .8, .2, 1)' });
}

function fadeContentIn(element, duration = 180) {
  if (!element || typeof element.animate !== 'function') return;
  element.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: reducedMotion() ? 100 : duration,
    easing: 'ease-out',
  });
}

function createAnswerLifecycle(message) {
  const lifecycle = document.createElement('div');
  lifecycle.className = 'answer-lifecycle';
  const mark = document.createElement('span');
  mark.className = 'answer-status-mark';
  mark.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'answer-lifecycle-label';
  label.setAttribute('role', 'status');
  const details = document.createElement('span');
  details.className = 'answer-lifecycle-details';
  lifecycle.append(mark, label, details);
  message.querySelector('.message-content')?.before(lifecycle);
  return lifecycle;
}

function renderAnswerLifecycle(lifecycle, timing) {
  if (!lifecycle) return;
  const view = lifecycleView({ ...timing, locale: ui.locale });
  lifecycle.dataset.status = view.status;
  const label = lifecycle.querySelector('.answer-lifecycle-label');
  const details = lifecycle.querySelector('.answer-lifecycle-details');
  if (label.textContent !== view.label) label.textContent = view.label;
  details.textContent = view.details;
  lifecycle.classList.toggle('is-settled', view.settled);
}

function startAnswerLifecycle(lifecycle, timing) {
  renderAnswerLifecycle(lifecycle, timing);
  return setInterval(() => {
    renderAnswerLifecycle(lifecycle, {
      ...timing,
      elapsedMs: performance.now() - timing.startedAt,
    });
  }, 250);
}

function settleAnswerLifecycle(lifecycle, ticker, timing, outcome) {
  if (ticker) clearInterval(ticker);
  if (!lifecycle) return;
  renderAnswerLifecycle(lifecycle, {
    ...timing,
    elapsedMs: Math.max(0, performance.now() - timing.startedAt),
    outcome,
  });
}

function animateSuggestionSelection(text, source, style) {
  clearSuggestionMotion();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = question.getBoundingClientRect();
  const flight = document.createElement('span');
  flight.className = 'suggestion-flight';
  flight.textContent = text;
  flight.style.left = `${source.left}px`;
  flight.style.top = `${source.top}px`;
  flight.style.width = `${source.width}px`;
  flight.style.font = style.font;
  flight.style.lineHeight = style.lineHeight;
  flight.style.color = style.color;
  document.body.append(flight);
  suggestionFlight = flight;
  const finish = () => {
    if (suggestionFlight === flight) suggestionFlight = null;
    flight.remove();
  };
  const motion = flight.animate([
    { transform: 'translate(0, 0)', opacity: 1 },
    { transform: `translate(${target.left - source.left}px, ${target.top - source.top}px)`, opacity: 0 },
  ], { duration: 240, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  motion.onfinish = finish;
  motion.oncancel = finish;
  composerImpact = form.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(3px)', offset: .52 },
    { transform: 'translateY(-1px)', offset: .78 },
    { transform: 'translateY(0)' },
  ], { duration: 260, easing: 'ease-out' });
  composerImpact.onfinish = () => { composerImpact = null; };
}

function captureComposerPosition() {
  const position = form.getBoundingClientRect();
  for (const animation of form.getAnimations()) animation.cancel();
  return position;
}

function animateComposerPosition(previous, content) {
  if (!previous) { animateContentIn(content, { distance: 10, duration: 260 }); return; }
  if (reducedMotion()) { fadeContentIn(content); return; }
  const next = form.getBoundingClientRect();
  const x = previous.left - next.left;
  const y = previous.top - next.top;
  if (Math.abs(x) > 1 || Math.abs(y) > 1) {
    form.animate([
      { transform: `translate(${x}px, ${y}px)` },
      { transform: 'translate(0, 0)' },
    ], { duration: 380, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
  fadeContentIn(content, 220);
}

function clearWelcomeExit() {
  exitingWelcome?.getAnimations().forEach(animation => animation.cancel());
  exitingWelcome?.remove();
  exitingWelcome = null;
}

function fadeWelcomeOut() {
  const current = log.querySelector('.welcome');
  if (!current || reducedMotion()) return;
  const bounds = current.getBoundingClientRect();
  const copy = current.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  copy.style.position = 'fixed';
  copy.style.left = `${bounds.left}px`;
  copy.style.top = `${bounds.top}px`;
  copy.style.width = `${bounds.width}px`;
  copy.style.height = `${bounds.height}px`;
  copy.style.margin = '0';
  copy.style.pointerEvents = 'none';
  copy.style.zIndex = '5';
  document.body.append(copy);
  exitingWelcome = copy;
  const motion = copy.animate([
    { opacity: 1, transform: 'translateY(0)' },
    { opacity: 0, transform: 'translateY(-12px)' },
  ], { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' });
  const finish = () => {
    if (exitingWelcome === copy) exitingWelcome = null;
    copy.remove();
  };
  motion.onfinish = finish;
  motion.oncancel = finish;
}

function welcome() {
  const previous = main.classList.contains('is-empty') ? null : captureComposerPosition();
  clearWelcomeExit();
  clearSuggestionMotion();
  messageShapes.reset();
  log.replaceChildren();
  main.classList.add('is-empty');
  updateQuestionPlaceholder();
  status('');
  state.queuedJobs = [];
  state.activeQueuedId = '';
  renderQueue();
  resizeQuestion();
  state.followLatest = true;
  updateFloatingControls();
  suggestionStrip.hidden = false;
  const welcome = document.createElement('section'); welcome.className = 'welcome';
  const mark = document.createElement('div'); mark.className = 'welcome-mark';
  const image = document.createElement('img'); image.src = sitePath('/brand-orbit.png'); image.alt = '';
  mark.append(image);
  const title = document.createElement('h2');
  const lead = document.createElement('span'); lead.textContent = t('titleLead');
  const subject = document.createElement('span'); subject.textContent = t('titleSubject');
  title.append(lead, ui.locale === 'zh' ? '' : ' ', subject);
  const intro = document.createElement('p'); intro.textContent = t('intro');
  if (ui.locale === 'zh') {
    const phrase = '实战经验强势驱动。';
    const at = intro.textContent.lastIndexOf(phrase);
    if (at !== -1) {
      const finalPhrase = document.createElement('span');
      finalPhrase.className = 'welcome-intro-phrase';
      finalPhrase.textContent = phrase;
      intro.replaceChildren(intro.textContent.slice(0, at), finalPhrase);
    }
  }
  welcome.append(mark, title, intro); log.append(welcome);
  animateComposerPosition(previous, welcome);
  renderSuggestions();
  updateCarouselTimer();
}

function renderThread(messages) {
  const fromWelcome = main.classList.contains('is-empty');
  const previous = fromWelcome ? captureComposerPosition() : null;
  clearWelcomeExit();
  if (fromWelcome) fadeWelcomeOut();
  clearSuggestionMotion();
  messageShapes.reset();
  log.replaceChildren();
  main.classList.remove('is-empty');
  updateQuestionPlaceholder();
  resizeQuestion();
  state.followLatest = true;
  updateFloatingControls();
  suggestionStrip.hidden = true;
  const thread = document.createElement('div'); thread.className = 'chat-thread';
  for (const message of messages) thread.append(createMessage(message.role, message.content, message.sources || [], message.sourceCount, message, true));
  log.append(thread); scrollBottom();
  animateComposerPosition(previous, thread);
  updateCarouselTimer();
  return thread;
}

function currentThread() {
  let thread = log.querySelector('.chat-thread');
  if (!thread) thread = renderThread([]);
  return thread;
}

function createMessage(role, text, sources = [], sourceCount, evidence = {}, historic = false) {
  const outer = document.createElement('article'); outer.className = `message ${role === 'user' ? 'user' : 'assistant'}`;
  const content = document.createElement('div'); content.className = 'message-content';
  if (role === 'user') content.textContent = text || '';
  else {
    const prepared = historic ? globalThis.ImaAnswerMarkdown?.prepareLegacyAnswer(text || '') : null;
    renderAnswer(content, prepared?.text ?? text ?? '', sources);
  }
  outer.append(content);
  if (role === 'user') messageShapes.observe(content);
  if (role !== 'user') {
    if (historic) {
      renderAnswerLifecycle(createAnswerLifecycle(outer), {
        elapsedMs: evidence.timing?.elapsed_ms, queueWaitMs: evidence.timing?.queue_wait_ms,
        outcome: Number.isFinite(evidence.timing?.elapsed_ms) ? 'done' : 'history',
      });
    }
    if (historic) createAnswerProcess(outer, { locale: ui.locale, history: evidence.process });
    setSourceCount(outer, sourceCount ?? evidence.source_count ?? sources.length);
    setEvidenceStatus(outer, inspectSourceEvidence(evidence, false, sourceCount ?? sources.length));
    const copy = { text: text || '', sources };
    copy.control = createAnswerCopy(outer, {
      getLabel: t,
      getMarkdown: () => globalThis.ImaAnswerMarkdown?.answerMarkdownForCopy(copy.text, { sourceIndexes: sourceIndexes(copy.sources) }) ?? copy.text,
    });
    answerCopies.set(outer, copy);
    copy.control.setReady(historic && Boolean(copy.text.trim()), { partial: evidence.complete === false || evidence.interrupted === true });
  }
  return outer;
}

function setSourceCount(message, value) {
  const count = Number.isSafeInteger(Number(value)) ? Math.max(0, Number(value)) : 0;
  let badge = message.querySelector('.source-count');
  if (!count) { badge?.remove(); return; }
  if (!badge) { badge = document.createElement('div'); badge.className = 'source-count'; appendAnswerMeta(message, badge); }
  badge.textContent = `检索资料 ${count} 条`;
}

function setEvidenceStatus(message, evidence, requestedWeb = false) {
  message.querySelector('.evidence-status')?.remove();
  const labels = {
    unverified: t('evidenceUnverified'),
    requested_web_missing: t('webNoEvidence'),
    requested_web_found: t('webEvidence').replace('{count}', String(evidence.count)),
    web_present: t('webSources').replace('{count}', String(evidence.count)),
    none: '',
  };
  const text = labels[evidence?.kind] || (requestedWeb ? t('evidenceUnverified') : '');
  if (!text) return;
  const note = document.createElement('div');
  note.className = `evidence-status${evidence?.verified ? ' verified' : ''}`;
  note.textContent = text;
  appendAnswerMeta(message, note);
}

function appendAnswerMeta(message, node) {
  const tools = message.querySelector('.answer-tools');
  if (tools) tools.before(node);
  else message.append(node);
}

function sourceIndexes(sources) {
  return sources.map((source, index) => Number.isInteger(Number(source?.index)) && Number(source.index) > 0 ? Number(source.index) : index + 1);
}

function renderAnswer(element, text, sources = [], answerComplete = true) {
  const copy = answerCopies.get(element.parentElement);
  if (copy) { copy.text = text; copy.sources = sources; }
  try {
    if (!globalThis.ImaAnswerMarkdown?.updateAnswerElement) throw new Error('answer_renderer_unavailable');
    globalThis.ImaAnswerMarkdown.updateAnswerElement(element, text, {
      answerComplete, hideCitations: true, sourceIndexes: sourceIndexes(sources),
    });
  } catch {
    element.textContent = text;
  }
}

async function ask(raw) {
  const text = raw.trim();
  if (!text || state.busy || state.preparing) return;
  if (state.legacyMode) { status('请先新建会话，再使用原生知识库 Agent 提问。', true); return; }
  if (!state.conversationId) {
    state.preparing = true;
    updateSendButton();
    try {
      const data = await api(sitePath('/api/qa/conversations'), { method: 'POST' });
      setConversation(data.conversation.conversationId);
      await loadConversations();
    } catch (error) { status(error.message, true); return; }
    finally { state.preparing = false; updateSendButton(); }
  }
  const requestedWeb = state.webRequested;
  state.webRequested = false;
  updateWebIntentControl();
  const requestId = crypto.randomUUID();
  await streamAnswer(text, requestedWeb, signal => fetch(sitePath('/api/qa/ask'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ question: text, conversationId: state.conversationId, requestId, ...(requestedWeb ? { sourceIntent: 'web' } : {}) }),
    signal,
  }));
}

async function streamAnswer(text, requestedWeb, request, queuedId = '', queuedCreatedAt = '') {
  let displayText = text;
  const draftBeforeRequest = question.value;
  let clearedDraft = false;
  const controller = new AbortController(); state.controller = controller;
  state.activeWebRequest = requestedWeb;
  setWebRequestState(requestedWeb ? 'searching' : 'idle');
  busy(true); status(queuedId ? '正在等待上一轮完成…' : '正在连接知识库…');
  if (!queuedId && question.value.trim() === text) {
    question.value = ''; clearedDraft = true;
    resizeQuestion(); question.blur(); updateSendButton();
  }
  updateCarouselTimer();
  let reply, content, lifecycle, processView, lifecycleTicker = 0;
  let lifecycleTiming = null;
  const numericQueuedAt = Number(queuedCreatedAt);
  const queuedAt = Number.isFinite(numericQueuedAt) && numericQueuedAt > 0 ? numericQueuedAt : Date.parse(queuedCreatedAt);
  const setLifecyclePhase = phase => {
    if (!lifecycleTiming) return;
    lifecycleTiming.phase = phase;
    renderAnswerLifecycle(lifecycle, {
      ...lifecycleTiming,
      elapsedMs: performance.now() - lifecycleTiming.startedAt,
    });
  };
  const beginTurn = () => {
    if (reply) return;
    const thread = currentThread();
    thread.querySelector('.chat-notice')?.remove();
    if (!queuedId) state.followLatest = true;
    updateFloatingControls();
    const userMessage = createMessage('user', displayText);
    thread.append(userMessage);
    reply = createMessage('assistant', '正在查找相关资料…');
    content = reply.querySelector('.message-content'); content.classList.add('typing');
    lifecycle = createAnswerLifecycle(reply);
    processView = createAnswerProcess(reply, { locale: ui.locale });
    lifecycleTiming = {
      phase: 'connecting', startedAt: performance.now(),
      queueWaitMs: queuedId && Number.isFinite(queuedAt) ? Math.max(0, Date.now() - queuedAt) : 0,
    };
    lifecycleTicker = startAnswerLifecycle(lifecycle, lifecycleTiming);
    thread.append(reply);
    animateContentIn(userMessage, { distance: 6, duration: 220 });
    fadeContentIn(reply, 200);
    if (state.followLatest) scrollBottom();
  };
  let doneCount = 0, receivedDelta = false, parser = '', answerText = '', answerSources = [], doneMetadata = null;
  let renderFrame = 0;
  const scheduleRender = () => {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      renderAnswer(content, answerText, answerSources, false);
      if (state.followLatest) scrollBottom();
    });
  };
  try {
    if (!queuedId) beginTurn();
    const response = await request(controller.signal);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || '问答服务暂不可用');
    }
    if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('服务返回了意外的响应格式');
    setLifecyclePhase('retrieving');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      parser += decoder.decode(value, { stream: true });
      parser = parser.replace(/\r\n/g, '\n');
      let split;
      while ((split = parser.indexOf('\n\n')) !== -1) {
        const packet = parser.slice(0, split); parser = parser.slice(split + 2);
        const event = /^event:\s*(.+)$/mu.exec(packet)?.[1];
        const dataLine = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        let data = {}; try { data = JSON.parse(dataLine); } catch { continue; }
        if (event === 'queue.status') {
          if (data.status === 'deleted' || data.status === 'expired') {
            state.queuedJobs = state.queuedJobs.filter(job => job.id !== queuedId);
            throw new Error('待发问题已移除，没有发送');
          }
          if (data.status === 'paused') throw new Error('待发问题未发送，请检查队列状态');
          if (data.status === 'running') {
            if (typeof data.question === 'string') displayText = data.question;
            beginTurn();
            state.queuedJobs = state.queuedJobs.filter(job => job.id !== queuedId);
            renderQueue();
            status('正在连接知识库…');
            setLifecyclePhase('connecting');
          }
        }
        if (queuedId && data.conversationId && data.conversationId !== state.conversationId) throw new Error('待发问题的会话不一致');
        if (queuedId && ['conversation', 'process', 'sources', 'delta', 'done'].includes(event)) beginTurn();
        if (event === 'conversation' && data.conversationId) setConversation(data.conversationId);
        if (event === 'process') {
          processView?.push(data);
          if (state.followLatest) scrollBottom();
        }
        if (event === 'sources') {
          answerSources = Array.isArray(data.sources) ? data.sources : [];
          setSourceCount(reply, data.sourceCount ?? answerSources.length);
          if (receivedDelta) scheduleRender();
          if (!receivedDelta) {
            status('已找到资料，正在组织回答…');
            setLifecyclePhase('composing');
          }
        }
        if (event === 'delta' && typeof data.text === 'string') {
          if (!receivedDelta) {
            content.textContent = '';
            content.classList.remove('typing');
            receivedDelta = true;
            fadeContentIn(content, 180);
          }
          answerText += data.text;
          scheduleRender();
          status('正在生成回答…');
          setLifecyclePhase('generating');
        }
        if (event === 'done') {
          doneCount += 1;
          doneMetadata = data;
          if (data.conversationId) setConversation(data.conversationId);
        }
        if (event === 'error') throw new Error(data.error || '问答服务暂不可用');
      }
    }
    if (renderFrame) { cancelAnimationFrame(renderFrame); renderFrame = 0; }
    if (doneCount !== 1) throw new Error(doneCount ? '服务返回了重复的完成确认' : '连接中断，未收到完成确认');
    if (!answerText.trim()) throw new Error('本次请求未返回回答正文');
    renderAnswer(content, answerText, answerSources);
    const evidence = inspectSourceEvidence(doneMetadata || {}, requestedWeb, answerSources.length);
    const finalSourceCount = doneMetadata?.source_count ?? doneMetadata?.sourceCount ?? answerSources.length;
    setSourceCount(reply, finalSourceCount);
    setEvidenceStatus(reply, evidence, requestedWeb);
    content.classList.remove('typing'); status('回答已完成');
    answerCopies.get(reply)?.control.setReady(Boolean(answerText.trim()));
    processView?.settle('done');
    settleAnswerLifecycle(lifecycle, lifecycleTicker, lifecycleTiming, 'done');
    if (Number.isFinite(doneMetadata?.timing?.elapsed_ms)) {
      renderAnswerLifecycle(lifecycle, {
        elapsedMs: doneMetadata.timing.elapsed_ms,
        queueWaitMs: lifecycleTiming.queueWaitMs + (doneMetadata.timing.queue_wait_ms || 0), outcome: 'done',
      });
    }
    lifecycleTicker = 0;
    if (requestedWeb) setWebRequestState(evidence.kind === 'requested_web_found' ? 'verified' : 'missing');
    updateFloatingControls();
    await loadConversations();
  } catch (error) {
    processView?.settle(controller.signal.aborted ? 'cancelled' : 'interrupted');
    if (clearedDraft && !receivedDelta && !controller.signal.aborted && !question.value.trim()) {
      question.value = draftBeforeRequest;
      resizeQuestion(); renderSuggestions();
    }
    if (renderFrame) { cancelAnimationFrame(renderFrame); renderFrame = 0; }
    if (reply) {
      if (receivedDelta) renderAnswer(content, answerText, answerSources, false);
      content.classList.remove('typing');
      if (!receivedDelta) content.textContent = '';
      const warning = document.createElement('div'); warning.className = 'message-error';
      warning.textContent = controller.signal.aborted ? '已停止本次回答。' : `${error.message}。这轮回答未完成，可稍后重试。`;
      appendAnswerMeta(reply, warning);
      answerCopies.get(reply)?.control.setReady(receivedDelta && Boolean(answerText.trim()), { partial: true });
    }
    settleAnswerLifecycle(
      lifecycle,
      lifecycleTicker,
      lifecycleTiming,
      controller.signal.aborted ? 'cancelled' : receivedDelta ? 'interrupted' : 'failed',
    );
    lifecycleTicker = 0;
    if (requestedWeb) setWebRequestState('idle');
    status(controller.signal.aborted ? '已停止' : reply ? '回答未完成' : error.message, !reply);
    updateFloatingControls();
  } finally {
    if (lifecycleTicker) clearInterval(lifecycleTicker);
    state.controller = null;
    state.activeWebRequest = false;
    updateWebIntentControl();
    if (queuedId) state.activeQueuedId = '';
    const nextStarted = await syncQueue();
    if (!nextStarted || !state.activeQueuedId) busy(false);
    if (state.followLatest) scrollBottom();
    void checkHealth(); updateCarouselTimer();
  }
}

function scrollBottom() {
  log.scrollTop = log.scrollHeight;
  lastScrollTop = log.scrollTop;
}

if (document.body.classList.contains('qa-embedded')) {
  hostBridge = createHostBridge(window, {
    onCommand: command => document.querySelector({ new: '#newChat', history: '#showHistory', more: '#moreToggle' }[command])?.click(),
    onPreferences: preferences => {
      Object.assign(ui, preferences);
      applyPreferences();
      if (main.classList.contains('is-empty')) welcome();
      renderConversationList();
    },
  });
  hostBridge.ready();
  window.addEventListener('pagehide', () => hostBridge.dispose(), { once: true });
}
