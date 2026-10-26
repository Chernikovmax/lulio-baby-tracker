import { createServer } from 'node:http';
import { readFile, stat, realpath, lstat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
};
const routes = new Set(['tabs', 'tabs/tracker', 'tabs/stats', 'tabs/leaps', 'tabs/settings']);
const publicKey = key => typeof key === 'string'
  && /^[A-Za-z0-9_./-]+$/.test(key)
  && key.split('/').every(part => part.length > 0 && !part.startsWith('.'))
  && (routes.has(key) || [...routes].some(route => key === `${route}/index.html`) || Boolean(mime[extname(key)]));
async function publicFile(base, file) {
  const info = await lstat(file);
  const actual = await realpath(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || !actual.startsWith(base + sep)) throw new Error('Artifact escapes the public root');
  return actual;
}

export async function createPwaServer({ root, plan, host = '127.0.0.1', port = 0 }) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Fixture server only binds loopback');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid fixture port');
  let base = await realpath(resolve(root));
  let files = null;
  const readPlan = async (source, uploadPlan) => {
    const entries = JSON.parse(await readFile(resolve(uploadPlan), 'utf8'));
    if (!Array.isArray(entries) || !entries.length) throw new Error('Empty upload plan');
    const mapped = new Map();
    for (const { key, file, contentType, cacheControl } of entries) {
      if (!publicKey(key) || file !== `files/${encodeURIComponent(key)}` || mapped.has(key) || typeof contentType !== 'string' || typeof cacheControl !== 'string' || /[\r\n]/.test(contentType + cacheControl)) throw new Error('Unsafe public upload plan');
      mapped.set(key, { file: await publicFile(source, resolve(source, file)), base: source, contentType, cacheControl });
    }
    return mapped;
  };
  if (plan) files = await readPlan(base, plan);
  else {
    await publicFile(base, resolve(base, 'index.html'));
    await publicFile(base, resolve(base, 'ngsw.json'));
  }
  const switchRelease = async (nextRoot, nextPlan) => {
    const nextBase = await realpath(resolve(nextRoot));
    const nextFiles = await readPlan(nextBase, nextPlan);
    files = new Map([...(files ?? []), ...nextFiles]);
    base = nextBase;
    return { files: files.size, origin };
  };
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
      if (pathname && !publicKey(pathname.replace(/\/+$/, ''))) { response.writeHead(404); response.end('Not found'); return; }
      let target;
      let type;
      let cache = 'no-cache';
      if (files) {
        const slashless = (pathname || 'index.html').replace(/\/+$/, '');
        const routeIndex = slashless && `${slashless}/index.html`;
        const entry = files.get(pathname) ?? (routeIndex && files.get(routeIndex)) ?? files.get(slashless);
        if (!entry) { response.writeHead(404); response.end('Not found'); return; }
        target = await publicFile(entry.base, entry.file); type = entry.contentType; cache = entry.cacheControl;
      } else {
        let relative = (pathname || 'index.html').replace(/\/+$/, '');
        if (['tabs', 'tabs/tracker', 'tabs/stats', 'tabs/leaps', 'tabs/settings'].includes(relative) || ['tabs/index.html', 'tabs/tracker/index.html', 'tabs/stats/index.html', 'tabs/leaps/index.html', 'tabs/settings/index.html'].includes(relative)) relative = 'index.html';
        target = resolve(base, relative);
        if (target !== base && !target.startsWith(base + sep)) { response.writeHead(404); response.end('Not found'); return; }
        try { if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html'); }
        catch { /* exact-file roots intentionally do not provide SPA fallback */ }
        type = mime[extname(target).toLowerCase()];
      }
      if (!files) target = await publicFile(base, target);
      const bytes = await readFile(target);
      const headers = {
        'Content-Type': type ?? 'application/octet-stream', 'Content-Length': bytes.length,
        'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'",
      };
      response.writeHead(200, headers);
      if (request.method === 'HEAD') response.end(); else response.end(bytes);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Cache-Control': 'no-store' });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Local fixture error');
    }
  });
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveReady);
  });
  const address = server.address();
  const origin = `http://${host.includes(':') ? `[${host}]` : host}:${address.port}`;
  return { server, origin, switchRelease };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  if (args.includes('--help')) {
    console.log('Usage: node scripts/serve-pwa.mjs --root <www-or-dist/pwa> [--plan <upload-plan.json>] [--host 127.0.0.1] [--port 0]');
    process.exit(0);
  }
  const root = value('--root');
  if (!root) throw new Error('--root is required');
  const host = value('--host') ?? '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Fixture server only binds loopback');
  const { server, origin } = await createPwaServer({ root, plan: value('--plan'), host, port: Number(value('--port') ?? 0) });
  console.log(`Local PWA fixture: ${origin}`);
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
