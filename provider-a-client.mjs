import { createHash } from 'node:crypto';

export function createProviderAClient({ baseUrl, apiToken, serviceToken, knowledgeScopeRef, allowHostGateway = false, mode = 'independent', gatewayUrl, gatewayToken, fetchImpl = fetch }) {
  if (mode === 'shared') return createSharedProviderClient({ gatewayUrl, gatewayToken, fetchImpl });
  if (mode !== 'independent') throw new Error('provider_mode_invalid');
  const localPort = /^http:\/\/127\.0\.0\.1:(\d+)$/u.exec(baseUrl)?.[1];
  if (!(localPort && Number(localPort) > 0 && Number(localPort) <= 65535) && baseUrl !== 'http://provider-a:3000'
      && !(allowHostGateway === true && baseUrl === 'http://host.docker.internal:3117')) {
    throw new Error('Provider A must use a localhost address or the private Compose service http://provider-a:3000');
  }
  const configured = Boolean(apiToken && serviceToken && /^[a-f0-9]{64}$/u.test(knowledgeScopeRef));

  async function readiness() {
    const health = await fetchImpl(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(3500), redirect: 'error' });
    if (!health.ok) throw new Error('provider_unreachable');
    const service = await health.json();
    if (!configured) return { connected: true, configured: false, authenticated: false, contractSupported: false, ready: false, capacity: 0, queued: service.queue?.queuedRequests ?? 0, webIntentSupported: false };
    const [ordinary, capacityResponse] = await Promise.all([
      fetchImpl(`${baseUrl}/api/conversations?limit=1`, {
        headers: { Authorization: `Bearer ${apiToken}`, 'X-IMA-Client-Id': 'demo:readiness' },
        signal: AbortSignal.timeout(3500),
        redirect: 'error',
      }),
      fetchImpl(`${baseUrl}/internal/provider-a/capacity`, {
        headers: { Authorization: `Bearer ${serviceToken}` },
        signal: AbortSignal.timeout(3500),
        redirect: 'error',
      }),
    ]);
    const authenticated = ordinary.ok && capacityResponse.ok;
    const capacity = capacityResponse.ok ? await capacityResponse.json() : {};
    const contractSupported = capacity.schemaVersion === 1 && capacity.features?.knowledge_agent_keyed_sse_v1 === true;
    const nativeCapacity = Number(capacity.policies?.knowledge_agent?.max_concurrent ?? capacity.policy_capacity?.knowledge_agent ?? 0);
    return {
      connected: true,
      configured: true,
      authenticated,
      contractSupported,
      ready: authenticated && contractSupported && Number.isInteger(nativeCapacity) && nativeCapacity > 0,
      capacity: authenticated ? nativeCapacity : 0,
      webIntentSupported: authenticated && contractSupported && capacity.features?.source_intent_web_requested_v1 === true,
      active: capacity.active ?? service.queue?.activeRequests ?? 0,
      queued: capacity.queued ?? service.queue?.queuedRequests ?? 0,
    };
  }

  function request({ route, method, clientId, body, requestId, sourceIntent, signal }) {
    const ask = route === '/api/ask';
    const internalRoute = ask ? '/internal/provider-a/deep-ask' : route;
    const headers = {
      'Authorization': `Bearer ${ask ? serviceToken : apiToken}`,
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
      redirect: 'error',
    });
  }

  return { configured, readiness, request };
}

function createSharedProviderClient({ gatewayUrl, gatewayToken, fetchImpl }) {
  // Only a server-configured Tailscale Serve origin is accepted, never a browser URL.
  if (typeof gatewayUrl !== 'string' || !/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.ts\.net$/u.test(gatewayUrl)) {
    throw new Error('shared_gateway_requires_tailscale_https_origin');
  }
  const configured = typeof gatewayToken === 'string' && gatewayToken.length > 0;
  const headers = { Authorization: `Bearer ${gatewayToken || ''}` };
  async function readiness() {
    if (!configured) return { connected: false, configured: false, authenticated: false, contractSupported: false, ready: false, capacity: 0, webIntentSupported: false };
    const response = await fetchImpl(`${gatewayUrl}/v1/capabilities`, { headers: { ...headers, 'X-IMA-Client-Id': 'demo:readiness' }, redirect: 'error', signal: AbortSignal.timeout(3500) });
    if (!response.ok) return { connected: true, configured, authenticated: false, contractSupported: false, ready: false, capacity: 0, webIntentSupported: false };
    const status = await response.json();
    const contractSupported = status.schemaVersion === 1 && status.features?.knowledge_agent_keyed_sse_v1 === true;
    const authenticated = status.authenticated === true;
    const capacity = authenticated && Number.isInteger(status.capacity) && status.capacity >= 0 ? status.capacity : 0;
    return { connected: status.connected === true, configured, authenticated, contractSupported,
      ready: status.ready === true && authenticated && contractSupported && capacity > 0,
      capacity, webIntentSupported: authenticated && contractSupported && status.webIntentSupported === true,
      active: Number.isInteger(status.active) && status.active >= 0 ? status.active : 0,
      queued: Number.isInteger(status.queued) && status.queued >= 0 ? status.queued : 0 };
  }
  function request({ route, method, clientId, body, requestId, sourceIntent, signal }) {
    if (!configured) throw new Error('shared_gateway_not_configured');
    const ask = route === '/api/ask' && method === 'POST';
    const list = /^\/api\/conversations(?:\?limit=\d{1,3})?$/u.test(route) && ['GET', 'POST'].includes(method);
    const detail = /^\/api\/conversations\/[a-zA-Z0-9_-]+$/u.test(route) && ['GET', 'DELETE'].includes(method);
    if (!ask && !list && !detail) throw new Error('shared_gateway_route_not_allowed');
    const requestHeaders = { ...headers, 'X-IMA-Client-Id': clientId, ...(body ? { 'Content-Type': 'application/json' } : {}) };
    if (ask) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(requestId || '')) throw new Error('request_id_invalid');
      requestHeaders.Accept = 'text/event-stream';
      body = JSON.stringify({ ...JSON.parse(body), request_id: requestId, ...(sourceIntent === 'web' ? { sourceIntent: 'web' } : {}) });
    }
    return fetchImpl(`${gatewayUrl}${route.replace(/^\/api\//u, '/v1/')}`, { method, headers: requestHeaders, body, signal, redirect: 'error' });
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
      if (Buffer.byteLength(packet, 'utf8') + 2 > 65536) throw new Error('provider_event_too_large');
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
    if (Buffer.byteLength(pending, 'utf8') > 65536) throw new Error('provider_event_too_large');
  }
  return { append, result: () => ({ ...counts, sourceCount, conversationId, complete: counts.done === 1 && counts.error === 0 && counts.delta > 0 }) };
}
