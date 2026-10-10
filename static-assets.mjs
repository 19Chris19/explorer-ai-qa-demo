import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

// Used only after the server's explicit public-asset allowlist, never for API data.
export function createStaticResponder(root) {
  const cache = new Map();
  return (req, res, file, type) => {
    let asset = cache.get(file);
    if (!asset) {
      const body = readFileSync(join(root, file));
      const compressed = /^(?:text\/|application\/(?:json|javascript)|image\/svg\+xml)/u.test(type) && body.length >= 512
        ? gzipSync(body) : null;
      asset = { body, compressed: compressed && compressed.length < body.length ? compressed : null,
        hash: createHash('sha256').update(body).digest('hex') };
      cache.set(file, asset);
    }
    const gzip = asset.compressed && String(req.headers['accept-encoding'] || '').split(',').some(entry => {
      const [name, ...parameters] = entry.trim().split(';');
      const quality = parameters.find(value => value.trim().startsWith('q='));
      return name === 'gzip' && (!quality || Number(quality.trim().slice(2)) > 0);
    });
    const body = gzip ? asset.compressed : asset.body;
    const etag = `"${asset.hash}${gzip ? '-gzip' : ''}"`;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('ETag', etag);
    if (gzip) res.setHeader('Content-Encoding', 'gzip');
    if (String(req.headers['if-none-match'] || '').split(',').some(value => ['*', etag, `W/${etag}`].includes(value.trim()))) {
      res.writeHead(304); res.end(); return;
    }
    res.setHeader('Content-Length', body.length);
    res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
