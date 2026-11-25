// Offline-testable interpretation of the provider's incremental transcript.
// This module deliberately does not fetch, log or persist speech or credentials.
export function createVoiceTranscript(expectedVoiceId, limit = 2000) {
  if (typeof expectedVoiceId !== 'string' || !expectedVoiceId) throw new TypeError('voice_id_required');
  const segments = new Map();
  let completed = false;
  const text = () => {
    let joined = '';
    for (const [, value] of [...segments.entries()].sort(([a], [b]) => a - b)) {
      for (const char of value.text) { if (joined.length + char.length > limit) return joined; joined += char; }
    }
    return joined;
  };
  return {
    read(message) {
      if (completed || !message || typeof message !== 'object' || message.voice_id !== expectedVoiceId || !Number.isInteger(message.code)) {
        return { kind: 'invalid', text: text() };
      }
      if (message.code !== 0) return { kind: 'error', text: text() };
      if (message.result !== undefined) {
        const result = message.result;
        if (!result || !Number.isInteger(result.index) || result.index < 0 || result.index >= 500 ||
            ![0, 1, 2].includes(result.slice_type) || typeof result.voice_text_str !== 'string' || result.voice_text_str.length > limit) {
          return { kind: 'invalid', text: text() };
        }
        const old = segments.get(result.index);
        if (!old?.stable) segments.set(result.index, { text: result.voice_text_str, stable: result.slice_type === 2 });
      }
      if (message.final === 1) { completed = true; return { kind: 'final', text: text() }; }
      return { kind: 'partial', text: text() };
    },
    get text() { return text(); },
  };
}

// Preserve the current draft and selection, even when the user edited while recording.
export function insertVoiceText(value, selectionEnd, transcript, maxLength = 2000) {
  if (typeof value !== 'string' || typeof transcript !== 'string') throw new TypeError('text_required');
  const at = Math.max(0, Math.min(value.length, Number.isInteger(selectionEnd) ? selectionEnd : value.length));
  const room = Math.max(0, maxLength - value.length);
  // Slice by code points so a boundary never creates a dangling surrogate.
  let addition = '';
  for (const char of transcript) { if (addition.length + char.length > room) break; addition += char; }
  return { value: value.slice(0, at) + addition + value.slice(at), caret: at + addition.length,
    truncated: addition.length !== transcript.length };
}
