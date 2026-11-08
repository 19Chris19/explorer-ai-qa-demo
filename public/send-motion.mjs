const defaults = { flight: 620, arc: 14, rebound: 2, settle: 420 };

function setting(style, name, fallback, min, max) {
  const number = Number.parseFloat(style.getPropertyValue(`--send-motion-${name}`));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

// The lab sets these CSS variables only on its own synthetic preview document.
export function sendMotionSettings(document) {
  const style = document.defaultView.getComputedStyle(document.documentElement);
  return {
    flight: setting(style, 'flight', defaults.flight, 300, 1100),
    arc: setting(style, 'arc', defaults.arc, 0, 50),
    rebound: setting(style, 'rebound', defaults.rebound, 0, 8),
    settle: setting(style, 'settle', defaults.settle, 150, 800),
  };
}

// The overlay is decorative: the actual draft and target stay in the DOM.
export function playSendMotion({ source, sourceRect, target, text, holdSource = false }) {
  const document = source.ownerDocument;
  const window = document.defaultView;
  const noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bounds = sourceRect || source.getBoundingClientRect();
  const destination = target.getBoundingClientRect();
  if (noMotion || typeof target.animate !== 'function'
    || !bounds.width || !bounds.height || !destination.width || !destination.height) {
    return { cancel() {}, releaseSource() {} };
  }
  // An overflowing draft or an off-screen destination cannot be matched faithfully.
  if (source.scrollHeight > source.clientHeight + 2 || destination.top < 0
    || destination.height > Math.max(window.innerHeight * .65, 320)) {
    try {
      const fade = target.animate([{ opacity:0, transform:'translateY(8px)' }, { opacity:1, transform:'translateY(0)' }],
        { duration:240, easing:'ease-out' });
      return { cancel() { fade.cancel(); }, releaseSource() {} };
    } catch { return { cancel() {}, releaseSource() {} }; }
  }
  const settings = sendMotionSettings(document);
  const sourceStyle = window.getComputedStyle(source);
  const targetStyle = window.getComputedStyle(target);
  const content = target.querySelector('.message-content, .queued-question') || target;
  const contentStyle = window.getComputedStyle(content);
  const contentBounds = content.getBoundingClientRect();
  const inset = contentBounds.width > 0 ? [
    contentBounds.top - destination.top,
    destination.right - contentBounds.right,
    destination.bottom - contentBounds.bottom,
    contentBounds.left - destination.left,
  ].map(value => `${Math.max(0, value)}px`).join(' ') : targetStyle.padding;
  const ghost = document.createElement('div');
  ghost.className = 'send-motion-flight';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = text;
  Object.assign(ghost.style, {
    position: 'fixed', zIndex: '20', pointerEvents: 'none', boxSizing: 'border-box',
    left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`,
    height: `${bounds.height}px`, overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
    font: sourceStyle.font, color: contentStyle.color, background: 'transparent', contain:'layout paint style',
  });
  document.body.append(ghost);
  ghost.scrollTop = source.scrollTop;
  const oldSourceOpacity = source.style.opacity;
  const oldTargetOpacity = target.style.opacity;
  source.style.opacity = '0';
  target.style.opacity = '0';
  const dx = destination.left - bounds.left;
  const dy = destination.top - bounds.top;
  const finishText = {
    width: `${destination.width}px`, height: `${destination.height}px`,
    padding: inset, borderRadius: targetStyle.borderRadius,
    backgroundColor: targetStyle.backgroundColor, fontSize: contentStyle.fontSize,
    lineHeight: contentStyle.lineHeight,
  };
  let motion;
  try {
    motion = ghost.animate([
      { transform: 'translate(0, 0)', width: `${bounds.width}px`, height: `${bounds.height}px`,
        padding: '0px', borderRadius: '0px', backgroundColor: 'rgba(0,0,0,0)',
        fontSize: sourceStyle.fontSize, lineHeight: sourceStyle.lineHeight, offset: 0 },
      { transform: `translate(${dx * .72}px, ${dy * .72 - settings.arc}px)`, offset: .72 },
      { transform: `translate(${dx}px, ${dy}px)`, ...finishText, offset: 1 },
    ], { duration: settings.flight, easing: 'cubic-bezier(.3, .1, .25, 1)', fill: 'forwards' });
  } catch {
    source.style.opacity = oldSourceOpacity;
    target.style.opacity = oldTargetOpacity;
    ghost.remove();
    return { cancel() {}, releaseSource() {} };
  }
  let closed = false;
  let landing = null;
  let sourceReleased = false;
  function releaseSource() {
    if (sourceReleased) return;
    sourceReleased = true;
    source.style.opacity = oldSourceOpacity;
  }
  function finish(shouldSettle) {
    if (closed) return;
    closed = true;
    if (!holdSource || !shouldSettle) releaseSource();
    target.style.opacity = oldTargetOpacity;
    ghost.remove();
    if (shouldSettle && target.isConnected && settings.rebound > 0) {
      const amount = settings.rebound;
      try {
        landing = target.animate([
          { transform: 'translateY(0) scale(1)', offset: 0 },
          { transform: `translateY(-${amount}px) scaleX(1.004) scaleY(.984)`, offset: .25 },
          { transform: `translateY(${amount * .3}px) scaleX(.998) scaleY(1.005)`, offset: .62 },
          { transform: 'translateY(0) scale(1)', offset: 1 },
        ], { duration: settings.settle, easing: 'ease-out' });
      } catch { /* A visual effect must never prevent the message from being shown. */ }
    }
  }
  motion.onfinish = () => finish(true);
  motion.oncancel = () => finish(false);
  function cancel() { if (!closed) { motion.cancel(); finish(false); } releaseSource(); landing?.cancel(); }
  return {
    releaseSource, cancel,
    checkPosition() {
      if (closed) return;
      const current = target.getBoundingClientRect();
      if (!target.isConnected || Math.abs(current.top - destination.top) > 3 || Math.abs(current.left - destination.left) > 3) cancel();
    },
  };
}
