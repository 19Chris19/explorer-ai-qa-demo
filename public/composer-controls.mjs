export function composerControlState({ draft = '', busy = false, preparing = false, queueSubmitting = false, access = 'ready' } = {}) {
  const stopping = busy && !draft.trim();
  return {
    action: stopping ? 'stopAnswer' : busy ? 'enqueueQuestion' : 'sendQuestion',
    stopping,
    disabled: preparing || queueSubmitting || (!busy && !draft.trim()) || (!stopping && access !== 'ready'),
  };
}

export function providerAccessState(ok, data) {
  if (!ok || !data.connected) return 'offline';
  if (!data.authenticated) return 'noCredentials';
  if (data.contractSupported === false) return 'incompatible';
  return data.ready ? 'ready' : 'noCapacity';
}
