import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { open, readFile, lstat, realpath, mkdir, rm, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const bucket = args.shift();
if (bucket === '--help' || args.includes('--help')) {
  console.log('Usage: node scripts/publish-pwa.mjs <bucket> [--confirm-billable-operations] [--transport=aws|yc|local] [--resume] [--loopback-origin=http://127.0.0.1:<port>]');
  process.exit(0);
}
const confirm = args.includes('--confirm-billable-operations');
const transportArg = args.find(arg => arg.startsWith('--transport='));
const resume = args.includes('--resume');
const originArg = args.find(arg => arg.startsWith('--loopback-origin='));
if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Supply a dedicated bucket name without dots.');
if (args.some(arg => !['--confirm-billable-operations', '--resume'].includes(arg) && !arg.startsWith('--transport=') && !arg.startsWith('--loopback-origin='))) throw new Error('Unknown publisher option.');
const transport = transportArg?.slice('--transport='.length) ?? 'aws';
if (!['aws', 'yc', 'local'].includes(transport)) throw new Error('Transport must be aws, yc, or local.');
const directory = resolve('dist/pwa');
const directoryInfo = await lstat(directory);
if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Unsafe PWA staging directory.');
const realDirectory = await realpath(directory);
const planPath = `${directory}/upload-plan.json`;
const planInfo = await lstat(planPath);
if (!planInfo.isFile() || planInfo.isSymbolicLink() || planInfo.nlink !== 1 || !(await realpath(planPath)).startsWith(`${realDirectory}/`)) throw new Error('Unsafe upload plan path.');
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const origin = originArg ? originArg.slice('--loopback-origin='.length) : `https://${bucket}.website.yandexcloud.net`;
if (originArg && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Loopback origin must be an explicit 127.0.0.1 HTTP origin.');
if (originArg && transport !== 'local') throw new Error('Loopback rehearsal requires --transport=local; cloud CLIs are refused.');
if (transport === 'local' && !originArg) throw new Error('Local transport requires a loopback origin.');
const phase = key => key === 'ngsw.json' ? 2 : ['index.html', 'manifest.webmanifest', 'tabs', 'tabs/index.html', 'tabs/tracker', 'tabs/tracker/index.html', 'tabs/stats', 'tabs/stats/index.html', 'tabs/leaps', 'tabs/leaps/index.html', 'tabs/settings', 'tabs/settings/index.html'].includes(key) ? 1 : 0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validKey = key => typeof key === 'string'
  && /^[A-Za-z0-9_./-]+$/.test(key)
  && key.split('/').every(part => part.length > 0 && !part.startsWith('.'));
const routeKeys = new Set(['tabs', 'tabs/index.html', 'tabs/tracker', 'tabs/tracker/index.html', 'tabs/stats', 'tabs/stats/index.html', 'tabs/leaps', 'tabs/leaps/index.html', 'tabs/settings', 'tabs/settings/index.html']);
const fixedKeys = new Set(['index.html', 'manifest.webmanifest', 'ngsw.json', 'ngsw-worker.js', 'safety-worker.js', 'worker-basic.min.js', '3rdpartylicenses.txt']);
const allowedKey = key => fixedKeys.has(key) || routeKeys.has(key) || /^[A-Za-z0-9_-]+\.(?:js|css)$/.test(key) || /^assets\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:html|png|svg|webmanifest|json|txt)$/.test(key);
if (!Array.isArray(plan) || !plan.length) throw new Error('Upload plan must be a non-empty array.');
let currentPhase = 0;
const seen = new Set();
const objects = [];
for (const object of plan) {
  if (!object || !validKey(object.key) || !allowedKey(object.key) || seen.has(object.key) || object.file !== `files/${encodeURIComponent(object.key)}` || !/^[\w.+-]+\/[\w.+-]+(?:; charset=[\w-]+)?$/.test(object.contentType) || typeof object.cacheControl !== 'string' || !object.cacheControl || /[\r\n]/.test(object.cacheControl)) throw new Error('Invalid, duplicate, or unsafe upload plan entry.');
  seen.add(object.key);
  const p = phase(object.key);
  if (p < currentPhase) throw new Error('Upload plan violates dependency/entrypoint/manifest ordering.');
  currentPhase = p;
  const file = resolve(directory, object.file);
  const fileInfo = await lstat(file);
  const realFile = await realpath(file);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.nlink !== 1 || !realFile.startsWith(`${realDirectory}/files/`)) throw new Error('Unsafe local artifact path.');
  const bytes = await readFile(file);
  objects.push({ ...object, file, sha256: hash(bytes), phase: p });
}
if (plan.at(-1)?.key !== 'ngsw.json' || !seen.has('index.html') || !seen.has('manifest.webmanifest')) throw new Error('Plan must include index.html and manifest.webmanifest and publish ngsw.json last.');
if (plan.findIndex(item => item.key === 'manifest.webmanifest') > plan.findIndex(item => item.key === 'index.html')) throw new Error('manifest.webmanifest must precede index.html.');
console.log(`Target: ${origin}; ${objects.length} STANDARD objects. No remote deletions. The publisher lock coordinates processes only on this local filesystem.`);
const identity = hash(Buffer.from(JSON.stringify({ bucket, origin, transport, objects: objects.map(({ key, contentType, cacheControl, sha256 }) => ({ key, contentType, cacheControl, sha256 })) })));
if (!confirm) {
  console.log('Dry run only: no network requests, uploads, or cloud CLI calls.');
  process.exit(0);
}
const stateDir = resolve('dist/pwa-publication');
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const lockPath = join(stateDir, `${bucket}.lock`);
let lock;
try { lock = await open(lockPath, 'wx', 0o600); }
catch { throw new Error(`Publisher lock exists at ${lockPath}; inspect owner and process before manually removing it. Never steal a live/uncertain lock.`); }
await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), identity }));
const journalPath = join(stateDir, `${bucket}.journal.json`);
const receiptPath = join(stateDir, `${bucket}.receipt.json`);
let journal;
let puts = 0, skipped = 0, gets = 0;
const started = Date.now();
const retries = async fn => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); } catch (error) { if (!error.retryable || attempt === 2) throw error; await new Promise(r => setTimeout(r, 200 * (attempt + 1))); }
  }
};
async function targetState(key) {
  return retries(async () => {
    gets++;
    let response;
    try {
      response = await fetch(`${origin}/${key.split('/').map(encodeURIComponent).join('/')}?release-check=${Date.now()}-${Math.random()}`, { signal: AbortSignal.timeout(30000), cache: 'no-store', redirect: 'error' });
    } catch (error) { error.retryable = true; throw error; }
    if (response.status >= 500 || response.status === 429) {
      await response.body?.cancel().catch(() => {});
      const error = new Error(`Public GET unavailable (${response.status})`);
      error.retryable = true;
      throw error;
    }
    if (response.status === 404) { await response.body?.cancel().catch(() => {}); return { status: 404 }; }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Cannot establish target state for ${key}: HTTP ${response.status}`);
    }
    try {
      const bytes = Buffer.from(await response.arrayBuffer());
      return { status: 200, sha256: hash(bytes), contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control') };
    } catch (error) {
      await response.body?.cancel().catch(() => {});
      error.retryable = true;
      throw error;
    }
  });
}
async function publicCheck(object) {
  const state = await targetState(object.key);
  if (state.status === 404 || !matchesTarget(state, object)) {
    const error = new Error(state.status === 404 ? `Public object missing: ${object.key}` : `Public object bytes/metadata differ: ${object.key}`);
    error.mismatch = true;
    throw error;
  }
}
const matchesTarget = (state, object) => state.status === 200 && state.sha256 === object.sha256 && state.contentType === object.contentType && state.cacheControl === object.cacheControl;
const entrypoints = objects.filter(object => object.phase > 0);
async function put(object) {
  if (hash(await readFile(object.file)) !== object.sha256) throw new Error(`Local artifact changed after preflight: ${object.key}`);
  const common = ['--bucket', bucket, '--key', object.key, '--body', object.file, '--content-type', object.contentType, '--cache-control', object.cacheControl];
  if (transport === 'local') {
    const bytes = await readFile(object.file);
    let response;
    try {
      puts++;
      response = await fetch(`${origin}/${object.key.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { 'content-type': object.contentType, 'cache-control': object.cacheControl }, body: bytes, signal: AbortSignal.timeout(30000), redirect: 'error' });
    } catch (error) { throw new Error(`Local rehearsal PUT outcome uncertain for ${object.key}: ${error.message}`); }
    if (![200, 201, 204].includes(response.status)) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`Local rehearsal PUT outcome uncertain for ${object.key} (HTTP ${response.status}).`);
    }
    await response.body?.cancel().catch(() => {});
    return;
  }
  const command = transport === 'aws' ? ['--endpoint-url', 'https://storage.yandexcloud.net', '--region', 'ru-central1', 's3api', 'put-object', ...common, '--storage-class', 'STANDARD'] : ['storage', 's3api', 'put-object', ...common, '--storage-class', 'STANDARD', '--no-pager'];
  puts++;
  await new Promise((resolvePromise, reject) => {
    const child = spawn(transport, command, { stdio: ['ignore', 'ignore', 'ignore'] });
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => { if (!settled) child.kill('SIGKILL'); }, 3000).unref();
    }, 30000);
    child.once('error', error => { settled = true; clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { settled = true; clearTimeout(timer); if (code === 0) resolvePromise(); else reject(new Error(`${transport} PUT failed for ${object.key} (exit ${code ?? signal}).`)); });
  });
}
try {
  try {
    journal = JSON.parse(await readFile(journalPath, 'utf8'));
    if (!resume || journal.identity !== identity || journal.bucket !== bucket || journal.origin !== origin || journal.transport !== transport) throw new Error('Existing journal target/artifact mismatch; refusing resume.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (resume) throw new Error('Cannot resume: no operation journal exists.');
    journal = { version: 1, bucket, origin, transport, identity, startedAt: new Date().toISOString(), status: 'incomplete', objects: {} };
  }
  const durableWrite = async (path, value) => {
    const temp = `${path}.${process.pid}.tmp`;
    const handle = await open(temp, 'w', 0o600);
    try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, path);
  };
  let saveQueue = Promise.resolve();
  const save = () => {
    saveQueue = saveQueue.then(() => durableWrite(journalPath, JSON.stringify(journal, null, 2) + '\n'));
    return saveQueue;
  };
  await save();
  if (!journal.baseline) {
    const baseline = {};
    for (const object of entrypoints) baseline[object.key] = await targetState(object.key);
    journal.baseline = baseline;
  }
  await rm(receiptPath, { force: true });
  await save();
  async function processObject(object) {
    try {
      await publicCheck(object);
      skipped++;
      journal.objects[object.key] = { status: 'verified', sha256: object.sha256, contentType: object.contentType, cacheControl: object.cacheControl };
      await save();
      return;
    } catch (error) {
      if (!error.mismatch) throw error;
    }
    if (object.phase > 0) {
      const current = await targetState(object.key);
      if (matchesTarget(current, object)) {
        skipped++;
        journal.objects[object.key] = { status: 'verified', sha256: object.sha256, contentType: object.contentType, cacheControl: object.cacheControl };
        await save();
        return;
      }
      if (JSON.stringify(current) !== JSON.stringify(journal.baseline[object.key])) throw new Error(`Entrypoint/manifest changed concurrently: ${object.key}; stop and reconcile manually.`);
    }
    journal.objects[object.key] = { status: 'put-uncertain', sha256: object.sha256, contentType: object.contentType, cacheControl: object.cacheControl };
    await save();
    await put(object);
    await publicCheck(object);
    journal.objects[object.key].status = 'verified';
    await save();
  }
  const dependencies = objects.filter(object => object.phase === 0);
  let next = 0, failed;
  await Promise.all(Array.from({ length: Math.min(4, dependencies.length) }, async () => {
    while (!failed) {
      const object = dependencies[next++];
      if (!object) return;
      try { await processObject(object); } catch (error) { failed ??= error; }
    }
  }));
  if (failed) throw failed;
  for (const object of entrypoints) {
    const current = await targetState(object.key);
    if (!matchesTarget(current, object) && JSON.stringify(current) !== JSON.stringify(journal.baseline[object.key])) throw new Error(`Entrypoint/manifest changed concurrently before transition: ${object.key}; stop and reconcile manually.`);
  }
  for (const object of objects.filter(item => item.phase === 1)) await processObject(object);
  for (const object of objects.filter(item => item.phase < 2)) await publicCheck(object);
  for (const object of objects.filter(item => item.phase === 2)) await processObject(object);
  for (const object of objects) await publicCheck(object);
  journal.status = 'complete';
  journal.completedAt = new Date().toISOString();
  await durableWrite(receiptPath, JSON.stringify({ ...journal, counts: { puts, skipped, gets }, elapsedMs: Date.now() - started }, null, 2) + '\n');
  await rm(journalPath, { force: true });
  console.log(`Published with a fresh final public verification ${origin}; puts=${puts}, skipped=${skipped}, gets=${gets}, elapsed=${Date.now() - started}ms. Browser offline/update acceptance remains required.`);
} catch (error) {
  console.error(`Publication incomplete; inspect the journal before --resume. No automatic rollback is attempted. On post-entrypoint failure restore the complete matching previous index/manifest while retaining dependencies; never clear user data. ${error.message} puts=${puts}, skipped=${skipped}, gets=${gets}, elapsed=${Date.now() - started}ms.`);
  process.exitCode = 1;
} finally {
  await lock.close();
  await rm(lockPath, { force: true });
}
