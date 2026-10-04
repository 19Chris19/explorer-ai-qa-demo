// Visual preview only: deliberately has no recording or transcription dependency.
export function createVoicePreview(options = {}) {
  const documentRef = options.documentRef || globalThis.document;
  const schedule = options.setTimeout || globalThis.setTimeout;
  const cancel = options.clearTimeout || globalThis.clearTimeout;
  let active = false;
  let timer = 0;
  let generation = 0;
  let destroyed = false;

  const stop = () => {
    generation += 1;
    if (timer) cancel(timer);
    timer = 0;
    if (!active) return;
    active = false;
    options.onChange?.(active);
  };
  const onVisibility = () => { if (documentRef.hidden) stop(); };
  const onKey = event => { if (event.key === 'Escape') stop(); };
  documentRef?.addEventListener('visibilitychange', onVisibility);
  documentRef?.addEventListener('keydown', onKey);

  return {
    get active() { return active; },
    toggle() {
      if (destroyed || documentRef?.hidden) return;
      if (active) { stop(); return; }
      active = true;
      options.onChange?.(active);
      const current = ++generation;
      timer = schedule(() => {
        if (current === generation) stop();
      }, 4000);
    },
    stop,
    destroy() {
      destroyed = true;
      stop();
      documentRef?.removeEventListener('visibilitychange', onVisibility);
      documentRef?.removeEventListener('keydown', onKey);
    },
  };
}
