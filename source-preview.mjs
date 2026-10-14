export const PREVIEW_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export async function readPreviewBody(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('preview_too_large'); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(), parts = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > limit) { await reader.cancel(); throw new Error('preview_too_large'); } parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(bytes); let at = 0;
  for (const part of parts) { result.set(part, at); at += part.length; } return result;
}
export async function relaySourcePreview(provider, { req, res, clientId, params, image, prefix = '' }) {
  const controller = new AbortController(), close = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', close);
  try {
    const fields = ['conversationId', 'taskId', 'citationKey', 'sourceId'];
    if ([...params.keys()].length !== 4 || fields.some(key => params.getAll(key).length !== 1) || [...params].some(([k, v]) => !fields.includes(k) || v.length > 160)) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"error":"preview_unavailable"}'); return;
    }
    const route = `/api/source-preview${image ? '/image' : ''}?${params}`;
    const response = await provider.request({ route, method: 'GET', clientId,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4500)]) });
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!response.ok) { await response.body?.cancel(); throw new Error('preview_unavailable'); }
    if (image) {
      if (!PREVIEW_IMAGE_TYPES.includes(type)) { await response.body?.cancel(); throw new Error('preview_unavailable'); }
      const bytes = await readPreviewBody(response, 512 * 1024);
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes);
    } else {
      if (type !== 'application/json') { await response.body?.cancel(); throw new Error('preview_unavailable'); }
      const value = JSON.parse(new TextDecoder().decode(await readPreviewBody(response, 4096)));
      const ready = value.status === 'ready';
      const data = { status: ready ? 'ready' : 'text_only', ...(ready ? { imageKind: 'cover', imagePath: `${prefix}/api/qa/source-preview/image?${params}` } : {}) };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
    }
  } catch {
    if (!res.destroyed && !res.headersSent) { res.writeHead(image ? 404 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(image ? '{"error":"preview_unavailable"}' : '{"status":"text_only"}'); }
  } finally { res.off('close', close); }
}
