export function qaAdmissionConfig(env = {}) {
  const spec = {
    maxSubmissions: ['DEMO_PREVIEW_MAX_SUBMISSIONS', 10, 1, 1000],
    windowMs: ['DEMO_PREVIEW_WINDOW_MS', 60000, 1000, 3600000],
    maxPending: ['DEMO_PREVIEW_MAX_PENDING', 8, 1, 1000],
    maxRecentRecords: ['DEMO_PREVIEW_MAX_RECENT_RECORDS', 10000, 10, 100000],
    maxPendingPerConversation: ['DEMO_MAX_PENDING_PER_CONVERSATION', 3, 1, 50],
    submitTimeoutMs: ['DEMO_PROVIDER_SUBMIT_TIMEOUT_MS', 60000, 1000, 300000],
    legacyAskTimeoutMs: ['DEMO_LEGACY_ASK_TIMEOUT_MS', 190000, 1000, 300000],
  };
  return Object.freeze(Object.fromEntries(Object.entries(spec).map(([key, [name, fallback, min, max]]) => {
    const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
    return [key, value];
  })));
}

// Only an authenticated Provider response supplies this. Missing is legacy;
// malformed is rejected rather than replaced with an optimistic capacity.
export function allocationView(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || value.shared !== true) return null;
  const bounds = { maxConcurrent: [0, 100], active: [0, 100], queued: [0, 4096], available: [0, 100],
    queueLimit: [0, 4096], maxWaitMs: [1, 3600000], weight: [1, 20] };
  const result = { schemaVersion: 1, shared: true };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    if (!Number.isSafeInteger(value[key]) || value[key] < min || value[key] > max) return null;
    result[key] = value[key];
  }
  if (result.available > result.maxConcurrent) return null;
  return result;
}
