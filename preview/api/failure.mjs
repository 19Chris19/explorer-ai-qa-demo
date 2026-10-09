const messages = {
  400: '请求未能处理，请检查输入后重试。',
  403: '暂时无法完成此操作，请返回页面后重试。',
  404: '没有找到这个页面或记录。',
  409: '当前操作暂时无法完成，请检查会话状态后重试。',
  410: '这条记录的保留期限已结束，请查看原会话。',
  429: '当前访问较多，请稍后再试。',
};

function taskFailureCode(path, method, status) {
  if (method === 'GET' && /^api\/qa\/tasks\/[a-zA-Z0-9-]{1,100}\/events$/u.test(path)) {
    return { 409: 'task_cursor_mismatch', 410: 'task_events_expired', 503: 'task_subscription_unavailable' }[status];
  }
  if (method === 'POST' && ['api/qa/tasks', 'api/qa/queue'].includes(path)) {
    return { 409: 'task_request_conflict', 503: 'task_request_unconfirmed' }[status];
  }
  if (['GET', 'DELETE'].includes(method) && /^api\/qa\/tasks\/[a-zA-Z0-9-]{1,100}$/u.test(path)) {
    return { 410: 'task_request_unconfirmed', 503: 'task_request_unconfirmed' }[status];
  }
}

export function failure(request, status = 503, retryAfter, { apiJsonError = false } = {}) {
  const path = new URL(request.url).searchParams.get('path') || '';
  const code = Object.hasOwn(messages, status) && (status !== 410 || (apiJsonError && path.startsWith('api/'))) ? status : 503;
  const message = messages[code] || '服务暂时连接不上，请稍后重试。';
  const machineCode = apiJsonError && taskFailureCode(path, request.method, status);
  const page = !path.startsWith('api/') && (path === '' || request.headers.get('accept')?.includes('text/html'));
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' });
  if (/^\d{1,4}$/.test(retryAfter || '')) headers.set('Retry-After', retryAfter);
  headers.set('Content-Type', page ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8');
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  const body = page ? `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>知天下 · 暂时无法连接</title><style>
*{box-sizing:border-box}body{margin:0;background:#fafbfc;color:#20242b;font-family:system-ui,sans-serif;line-height:1.65}main{max-width:560px;margin:auto;padding:20vh 24px 60px}header{font-size:18px;font-weight:600;color:#1645a0;margin-bottom:48px}h1{font-size:28px;line-height:1.4;margin:0 0 16px}p{color:#626975;margin:0 0 28px}a{display:inline-block;background:#1645a0;color:white;padding:10px 22px;border-radius:24px;text-decoration:none}a:focus-visible{outline:3px solid #67b7ef;outline-offset:4px}small{display:block;margin-top:24px;color:#626975}@media(max-width:600px){main{padding-top:16vh}h1{font-size:24px}}</style><main><header>知天下</header><h1>${message}</h1><p>这次访问没有顺利完成。请稍等片刻，再返回问答页面。</p><a href="/">重新打开问答页</a><small>已经提交的问题不会自动重新发送。恢复后，请先查看最近对话。</small></main></html>`
    : JSON.stringify({ error: message, code: machineCode || `preview_${code}` });
  return new Response(request.method === 'HEAD' ? null : body, { status: code, headers });
}

export function validResponseType(path, type) {
  const mime = (type || '').split(';')[0].trim().toLowerCase();
  if (path.startsWith('api/')) return ['application/json', 'text/event-stream'].includes(mime);
  if (path === '') return mime === 'text/html';
  if (/\.m?js$/.test(path)) return ['text/javascript', 'application/javascript'].includes(mime);
  if (path.endsWith('.css')) return mime === 'text/css';
  if (path.endsWith('.json')) return mime === 'application/json';
  if (path.endsWith('.png')) return mime === 'image/png';
  if (path.endsWith('.svg')) return mime === 'image/svg+xml';
  if (path.endsWith('.woff2')) return ['font/woff2', 'application/font-woff2'].includes(mime);
  return false;
}
