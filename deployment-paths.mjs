const prefixPattern = /^\/(?:[a-z0-9][a-z0-9_-]*)(?:\/[a-z0-9][a-z0-9_-]*)*\/?$/u;

export function deploymentPaths(env) {
  const value = env.DEMO_ASSET_PREFIX || '';
  if (value && !prefixPattern.test(value)) throw Error('Invalid DEMO_ASSET_PREFIX');
  const prefix = value.replace(/\/$/u, '');
  const cookieName = env.DEMO_COOKIE_NAME || 'qa_demo_client_v2';
  const cookiePath = env.DEMO_COOKIE_PATH || `${prefix}/`;
  if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(cookieName)) throw Error('Invalid DEMO_COOKIE_NAME');
  if (cookiePath !== '/' && (!prefixPattern.test(cookiePath) || !cookiePath.endsWith('/'))) throw Error('Invalid DEMO_COOKIE_PATH');
  if (prefix && cookiePath !== `${prefix}/`) throw Error('Cookie path must match the module prefix');
  if (env.DEMO_COOKIE_SECURE && !['0', '1'].includes(env.DEMO_COOKIE_SECURE)) throw Error('Invalid DEMO_COOKIE_SECURE');
  return { prefix, cookieName, cookiePath, secure: env.DEMO_COOKIE_SECURE === '1' };
}

export function routePath(path, prefix) {
  if (prefix && path === prefix) return '/';
  return prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
}

export function storageNamespace(paths) {
  return !paths.prefix && paths.cookieName === 'qa_demo_client_v2' ? '' : `${paths.cookieName}:${paths.prefix}:`;
}
