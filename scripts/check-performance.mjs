import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const walk = directory => readdirSync(directory).flatMap(name => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = [...walk(join(root, 'public')).filter(path => !/\/admin(?:\.html|\.js)$/u.test(path)),
  ...['question-rotation.mjs', 'source-evidence.mjs', 'node_modules/marked/lib/marked.umd.js',
    'node_modules/dompurify/dist/purify.min.js'].map(path => join(root, path))];
const rows = files.filter((path, index) => files.indexOf(path) === index && !path.includes('/public/vendor/')).map(path => {
  const body = readFileSync(path);
  const compressed = /\.(?:js|mjs|css|json|svg|html)$/u.test(path) ? Math.min(body.length, gzipSync(body).length) : body.length;
  return { file: relative(root, path), raw: body.length, gzip: compressed };
});
const total = rows.reduce((sum, row) => ({ raw: sum.raw + row.raw, gzip: sum.gzip + row.gzip,
  js: sum.js + (/\.(?:js|mjs)$/u.test(row.file) ? row.raw : 0) }), { raw: 0, gzip: 0, js: 0 });
const budgets = { raw: 600 * 1024, gzip: 200 * 1024, js: 300 * 1024, largest: 100 * 1024 };
const failures = Object.keys(total).filter(key => total[key] > budgets[key]);
if (rows.some(row => row.raw > budgets.largest)) failures.push('largest');
console.log(JSON.stringify({ scope: 'All public QA assets, including rarely requested icons; not a Lighthouse score', total, budgets,
  largest: rows.sort((a, b) => b.raw - a.raw).slice(0, 6), failures }, null, 2));
if (failures.length) process.exitCode = 1;
