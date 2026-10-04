// Adapted from the React Bits Prompt Bar spark layer.
// Source: https://github.com/DavidHDev/react-bits/tree/main/src/content/Micro/PromptBar
// License notice: ../THIRD_PARTY_NOTICES.md

const MAX_PARTICLES = 30;

export function createPromptSparks(canvas, options = {}) {
  const root = options.root || canvas;
  const windowRef = options.windowRef || globalThis.window;
  const requestFrame = options.requestAnimationFrame || windowRef?.requestAnimationFrame?.bind(windowRef);
  const cancelFrame = options.cancelAnimationFrame || windowRef?.cancelAnimationFrame?.bind(windowRef);
  const ResizeObserverImpl = options.ResizeObserver || windowRef?.ResizeObserver;
  const getStyle = options.getComputedStyle || windowRef?.getComputedStyle?.bind(windowRef);
  const reduceMotion = windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const documentRef = options.documentRef || windowRef?.document;

  let enabled = false;
  let requestedActive = false;
  let context = null;
  let resizeObserver = null;
  let frame = 0;
  let last = 0;
  let width = 0;
  let height = 0;
  let due = 0;
  let particles = [];

  const color = () => {
    const configured = options.color?.();
    if (configured) return configured;
    return getStyle?.(root)?.getPropertyValue('--web-spark')?.trim() || '#00a3ff';
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, windowRef?.devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const spawn = burst => {
    particles.push({
      x: Math.random() * width,
      y: burst ? height * (0.2 + Math.random() * 0.8) : height + 3,
      radius: 0.9 + Math.random() * 1.1,
      velocityY: -(7 + Math.random() * 9),
      sway: (Math.random() - 0.5) * 10,
      phase: Math.random() * Math.PI * 2,
      life: burst ? Math.random() * 1.2 : 0,
      span: 2.4 + Math.random() * 2.4,
    });
  };

  const tick = now => {
    if (!enabled) return;
    const delta = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    due += delta;
    while (due > 0.14) {
      due -= 0.14;
      if (particles.length < MAX_PARTICLES) spawn(false);
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = color();
    context.shadowColor = color();
    context.shadowBlur = 7;
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life += delta;
      if (particle.life > particle.span) {
        particles.splice(index, 1);
        continue;
      }
      const progress = particle.life / particle.span;
      const twinkle = 0.7 + 0.3 * Math.sin(now / 160 + particle.phase);
      particle.y += particle.velocityY * delta;
      if (particle.y < -4) {
        particle.y = height + 3;
        particle.x = Math.random() * width;
      }
      const edge = Math.min(1, Math.max(0, particle.y / 14), Math.max(0, (height - particle.y) / 14));
      context.globalAlpha = Math.min(1, Math.sin(progress * Math.PI) * 0.9 * twinkle) * edge;
      context.beginPath();
      context.arc(
        particle.x + Math.sin(now / 900 + particle.phase) * particle.sway,
        particle.y,
        particle.radius * twinkle,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.globalAlpha = 1;
    frame = requestFrame(tick);
  };

  const stop = () => {
    enabled = false;
    if (frame) cancelFrame?.(frame);
    frame = 0;
    resizeObserver?.disconnect();
    resizeObserver = null;
    context?.clearRect(0, 0, width, height);
    particles = [];
    last = 0;
    due = 0;
    delete canvas.dataset.active;
  };

  const start = () => {
    if (enabled || reduceMotion?.matches || documentRef?.hidden || !requestFrame || !ResizeObserverImpl) return;
    try {
      context = canvas.getContext('2d');
    } catch {
      context = null;
    }
    if (!context) return;
    enabled = true;
    canvas.dataset.active = '';
    resize();
    for (let index = 0; index < 26; index += 1) spawn(true);
    resizeObserver = new ResizeObserverImpl(resize);
    resizeObserver.observe(canvas);
    frame = requestFrame(tick);
  };

  const synchronize = () => {
    stop();
    if (requestedActive) start();
  };
  reduceMotion?.addEventListener?.('change', synchronize);
  documentRef?.addEventListener?.('visibilitychange', synchronize);

  return {
    setActive(next) {
      requestedActive = Boolean(next);
      if (requestedActive) start();
      else stop();
    },
    destroy() {
      requestedActive = false;
      stop();
      reduceMotion?.removeEventListener?.('change', synchronize);
      documentRef?.removeEventListener?.('visibilitychange', synchronize);
    },
  };
}
