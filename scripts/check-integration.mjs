const url = process.env.DEMO_HEALTH_URL || 'http://127.0.0.1:4317/api/qa/health';
const parsed = new URL(url);
if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/api/qa/health') {
  throw new Error('Integration check requires a local website health URL');
}
const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
const data = await response.json();
console.log(JSON.stringify({
  websiteRelease: data.websiteRelease || 'unknown',
  connected: data.connected === true,
  authenticated: data.authenticated === true,
  contractSupported: data.contractSupported === true,
  ready: data.ready === true,
  capacity: Number(data.capacity || 0),
  lastRealSuccess: Boolean(data.lastRealSuccessAt),
}));
if (!response.ok || data.ready !== true) process.exitCode = 1;
