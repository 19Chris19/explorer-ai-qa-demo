import { createHash } from 'node:crypto';

export function createProviderAClient({ baseUrl, apiToken, serviceToken, knowledgeScopeRef, fetchImpl = fetch }) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseUrl)) throw new Error('Provider A must use a localhost address or tunnel');
  const configured = Boolean(apiToken && serviceToken && /^[a-f0-9]{64}$/u.test(knowledgeScopeRef));

  async function readiness() {
    const health = await fetchImpl(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(3500) });
    if (!health.ok) throw new Error('provider_unreachable');
    const service = await health.json();
    if (!configured) return { connected: true, configured: false, authenticated: false, ready: false, capacity: 0, queued: service.queue?.queuedRequests ?? 0, webIntentSupported: false };
    const [ordinary, capacityResponse] = await Promise.all([
      fetchImpl(`${baseUrl}/api/conversations?limit=1`, {
        headers: { Authorization: `Bearer ${apiToken}`, 'X-IMA-Client-Id': 'demo:readiness' },
        signal: AbortSignal.timeout(3500),
      }),
      fetchImpl(`${baseUrl}/internal/provider-a/capacity`, {
        headers: { Authorization: `Bearer ${serviceToken}` },
        signal: AbortSignal.timeout(3500),
      }),
    ]);
    const authenticated = ordinary.ok && capacityResponse.ok;
    const capacity = capacityResponse.ok ? await capacityResponse.json() : {};
    const nativeCapacity = Number(capacity.policies?.knowledge_agent?.max_concurrent ?? capacity.policy_capacity?.knowledge_agent ?? 0);
    return {
      connected: true,
      configured: true,
      authenticated,
      ready: authenticated && Number.isInteger(nativeCapacity) && nativeCapacity > 0,
      capacity: authenticated ? nativeCapacity : 0,
      webIntentSupported: authenticated && capacity.features?.source_intent_web_requested_v1 === true,
      active: capacity.active ?? service.queue?.activeRequests ?? 0,
      queued: capacity.queued ?? service.queue?.queuedRequests ?? 0,
    };
  }

  function request({ route, method, clientId, body, requestId, sourceIntent, signal }) {
    const ask = route === '/api/ask';
    const internalRoute = ask ? '/internal/provider-a/deep-ask' : route;
    const headers = {
      Authorization: `Bearer ${ask ? serviceToken : apiToken}`,
      'X-IMA-Client-Id': clientId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    };
    if (ask) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(requestId || '')) throw new Error('request_id_invalid');
      headers.Accept = 'text/event-stream';
      headers['Idempotency-Key'] = createHash('sha256').update(`demo:v1:${clientId}:${requestId}`).digest('hex');
      body = JSON.stringify({
        ...JSON.parse(body),
        retrieval_policy: 'knowledge_agent',
        knowledge_scope_ref: knowledgeScopeRef,
        ...(sourceIntent === 'web' ? { source_intent: 'web_requested' } : {}),
      });
    }
    return fetchImpl(`${baseUrl}${internalRoute}`, {
      method,
      headers,
      body,
      signal,
      redirect: 'manual',
    });
  }

  return { configured, readiness, request };
}

export function createStreamObserver() {
  const decoder = new TextDecoder();
  let pending = '';
  const counts = { conversation: 0, sources: 0, delta: 0, done: 0, error: 0 };
  let sourceCount = 0;
  let conversationId = '';
  function append(chunk) {
    pending += decoder.decode(chunk, { stream: true });
    pending = pending.replace(/\r\n/gu, '\n');
    let boundary;
    while ((boundary = pending.indexOf('\n\n')) >= 0) {
      const packet = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      const name = /^event:\s*([^\s]+)$/mu.exec(packet)?.[1];
      if (!Object.hasOwn(counts, name)) continue;
      counts[name] += 1;
      if (name === 'conversation' || name === 'delta' || name === 'sources' || name === 'done') {
        const raw = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        const data = JSON.parse(raw);
        if (name === 'conversation' || name === 'done') conversationId = String(data.conversationId || conversationId);
        if (name === 'delta' && !String(data.text || '').trim()) counts.delta -= 1;
        if (name === 'sources') sourceCount = Math.max(sourceCount, Array.isArray(data.sources) ? data.sources.length : 0);
      }
    }
    if (pending.length > 65536) throw new Error('provider_event_too_large');
  }
  return { append, result: () => ({ ...counts, sourceCount, conversationId, complete: counts.done === 1 && counts.error === 0 && counts.delta > 0 }) };
}
