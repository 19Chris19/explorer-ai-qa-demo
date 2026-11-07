// A session ticket is sensitive. Never log, persist, or put it in page history.
// The actual ticket route remains closed until replay and spending limits are proven.
export function openTencentVoiceTransport(session, { signal, onMessage, onError, onClose },
  { WebSocketImpl = globalThis.WebSocket, maxBufferedBytes = 128000, setTimer = setTimeout, clearTimer = clearTimeout, handshakeTimeoutMs = 10000 } = {}) {
  let url;
  try { url = new URL(session?.socketUrl); } catch { return Promise.reject(new Error('invalid_voice_ticket')); }
  if (!WebSocketImpl || url.href.length > 4096 || url.protocol !== 'wss:' || url.hostname !== 'asr.cloud.tencent.com' || url.port ||
      url.username || url.password || url.hash || !/^\/asr\/v2\/[0-9]+$/u.test(url.pathname) ||
      url.searchParams.get('voice_id') !== session.voiceId || !url.searchParams.has('signature')) {
    return Promise.reject(new Error('invalid_voice_ticket'));
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('cancelled'));
    let ready = false, closed = false, timer;
    const socket = new WebSocketImpl(url.href);
    const close = () => { if (closed) return; closed = true; clearTimer(timer); signal?.removeEventListener('abort', abort); try { socket.close(); } catch {} };
    const abort = () => { close(); if (!ready) reject(new Error('cancelled')); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimer(() => { close(); reject(new Error('voice_connect_timeout')); }, handshakeTimeoutMs);
    socket.onerror = () => { if (closed) return; if (!ready) { close(); reject(new Error('voice_connect_failed')); } else onError(); };
    socket.onclose = () => { if (closed) return; closed = true; clearTimer(timer); signal?.removeEventListener('abort', abort); if (!ready) reject(new Error('voice_connect_failed')); else onClose(); };
    socket.onmessage = event => {
      if (closed) return;
      if (typeof event.data !== 'string' || event.data.length > 16384) { if (!ready) { close(); reject(new Error('voice_connect_failed')); } else onError(); return; }
      let message; try { message = JSON.parse(event.data); } catch { if (!ready) { close(); reject(new Error('voice_connect_failed')); } else onError(); return; }
      if (!ready) {
        if (message?.code !== 0 || message?.voice_id !== session.voiceId) { close(); reject(new Error('voice_connect_failed')); return; }
        ready = true; clearTimer(timer); resolve({
          sendAudio(frame) { if (closed || socket.readyState !== 1 || socket.bufferedAmount > maxBufferedBytes || !(frame instanceof ArrayBuffer)) return false; socket.send(frame); return true; },
          end() { if (!closed && socket.readyState === 1) socket.send(JSON.stringify({ type: 'end' })); else throw new Error('voice_closed'); },
          close,
        });
      } else onMessage(message);
    };
  });
}
