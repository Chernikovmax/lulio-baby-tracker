import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

const publisher = resolve('scripts/publish-pwa.mjs');
async function fixture(t, { failAfterWriteKey, denyAllReads, changeManifestDuringDeps } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'pwa-publisher-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'dist/pwa');
  const files = join(directory, 'files');
  const remote = join(root, 'remote.json');
  await mkdir(files, { recursive: true });
  const entries = [
    ['chunk-a.js', 'dep-a', 'text/javascript', 'public, max-age=31536000, immutable'],
    ['chunk-b.js', 'dep-b', 'text/javascript', 'public, max-age=31536000, immutable'],
    ['manifest.webmanifest', 'webmanifest', 'application/manifest+json', 'no-cache'],
    ['index.html', 'index-v1', 'text/html; charset=utf-8', 'no-cache'],
    ['ngsw.json', 'manifest-sw', 'application/json', 'no-cache'],
  ];
  const plan = [];
  for (const [key, text, contentType, cacheControl] of entries) {
    const file = `files/${encodeURIComponent(key)}`;
    await writeFile(join(directory, file), text);
    plan.push({ key, file, contentType, cacheControl });
  }
  await writeFile(join(directory, 'upload-plan.json'), JSON.stringify(plan));
  await writeFile(remote, JSON.stringify({ 'old-chunk.js': { body: Buffer.from('retained-old-release').toString('base64'), type: 'text/javascript', cache: 'public, max-age=31536000, immutable' } }));
  const putKeys = [];
  const methods = [];
  const failed = new Set();
  let manifestChanged = false;
  let requests = 0;
  let writeQueue = Promise.resolve();
  const server = createServer(async (req, res) => {
    requests++;
    methods.push(req.method);
    const key = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1));
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      writeQueue = writeQueue.then(async () => {
        const data = JSON.parse(await readFile(remote, 'utf8'));
        data[key] = { body: Buffer.concat(chunks).toString('base64'), type: req.headers['content-type'], cache: req.headers['cache-control'] };
        if (changeManifestDuringDeps && key.startsWith('chunk-') && !manifestChanged) {
          data['ngsw.json'] = { body: Buffer.from('external-manifest').toString('base64'), type: 'application/json', cache: 'no-cache' };
          manifestChanged = true;
        }
        await writeFile(remote, JSON.stringify(data));
      });
      await writeQueue;
      putKeys.push(key);
      if (key === failAfterWriteKey && !failed.has(key)) {
        failed.add(key);
        res.writeHead(503); res.end('simulated lost acknowledgement'); return;
      }
      if (key === 'chunk-b.js' && failAfterWriteKey) await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
      res.writeHead(200); res.end(); return;
    }
    if (denyAllReads) { res.writeHead(403); res.end(); return; }
    const data = JSON.parse(await readFile(remote, 'utf8'));
    const object = data[key];
    if (!object) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': object.type, 'cache-control': object.cache }); res.end(Buffer.from(object.body, 'base64'));
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => new Promise(resolveClose => server.close(resolveClose)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function run(...args) {
    return await new Promise(resolveRun => {
      const child = spawn(process.execPath, [publisher, 'test-bucket', ...args], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
      child.on('close', code => resolveRun({ code, stdout, stderr }));
    });
  }
  return { root, directory, remote, origin, run, plan, putKeys, methods, requests: () => requests };
}
const args = f => ['--confirm-billable-operations', '--transport=local', `--loopback-origin=${f.origin}`];

test('dry run does not invoke transport or contact HTTP origin', async t => {
  const f = await fixture(t);
  const result = await f.run();
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(await readFile(f.remote, 'utf8')), { 'old-chunk.js': { body: Buffer.from('retained-old-release').toString('base64'), type: 'text/javascript', cache: 'public, max-age=31536000, immutable' } });
  const cloudCliRefusal = await f.run('--confirm-billable-operations', '--transport=aws', `--loopback-origin=${f.origin}`);
  assert.equal(cloudCliRefusal.code, 1);
  assert.equal(f.requests(), 0);
  assert.deepEqual(f.methods, []);
});

test('403 target reads fail closed without a PUT', async t => {
  const f = await fixture(t, { denyAllReads: true });
  const result = await f.run(...args(f));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HTTP 403/);
  assert.deepEqual(f.putKeys, []);
  const journal = JSON.parse(await readFile(join(f.root, 'dist/pwa-publication/test-bucket.journal.json'), 'utf8'));
  assert.equal(journal.status, 'incomplete');
  assert.deepEqual(journal.objects, {});
});

test('unexpected manifest change during dependencies blocks transition', async t => {
  const f = await fixture(t, { changeManifestDuringDeps: true });
  const result = await f.run(...args(f));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /changed concurrently before transition: ngsw.json/);
  assert.ok(!f.putKeys.some(key => ['index.html', 'manifest.webmanifest', 'ngsw.json'].includes(key)));
});

test('invalid public key is rejected before network access', async t => {
  const f = await fixture(t);
  const planPath = join(f.directory, 'upload-plan.json');
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  plan[0].key = '.env';
  await writeFile(planPath, JSON.stringify(plan));
  const result = await f.run(...args(f));
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid, duplicate, or unsafe upload plan entry/);
  assert.equal(f.requests(), 0);
  assert.deepEqual(f.putKeys, []);
});
test('matching bytes and metadata skip; metadata-only mismatch uploads', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(...args(f))).code, 0);
  f.putKeys.length = 0;
  assert.equal((await f.run(...args(f))).code, 0);
  assert.deepEqual(f.putKeys, []);
  const remote = JSON.parse(await readFile(f.remote, 'utf8'));
  remote['chunk-a.js'].cache = 'no-cache'; await writeFile(f.remote, JSON.stringify(remote));
  assert.equal((await f.run(...args(f))).code, 0);
  assert.deepEqual(f.putKeys, ['chunk-a.js']);
});

test('dependency failure drains workers and blocks all entrypoint and manifest puts', async t => {
  const f = await fixture(t, { failAfterWriteKey: 'chunk-a.js' });
  const result = await f.run(...args(f));
  assert.equal(result.code, 1);
  assert.ok(f.putKeys.includes('chunk-b.js'));
  assert.ok(!f.putKeys.some(key => ['index.html', 'manifest.webmanifest', 'ngsw.json'].includes(key)));
  const journal = JSON.parse(await readFile(join(f.root, 'dist/pwa-publication/test-bucket.journal.json'), 'utf8'));
  assert.equal(journal.status, 'incomplete');
  assert.equal(journal.objects['chunk-b.js'].status, 'verified');
});

test('uncertain acknowledged write resumes by rereading the public object', async t => {
  const f = await fixture(t, { failAfterWriteKey: 'chunk-a.js' });
  const first = await f.run(...args(f));
  assert.equal(first.code, 1);
  assert.ok((await readFile(join(f.root, 'dist/pwa-publication/test-bucket.journal.json'), 'utf8')).includes('put-uncertain'));
  const resumed = await f.run(...args(f), '--resume');
  assert.equal(resumed.code, 0);
  assert.equal(f.putKeys.filter(key => key === 'chunk-a.js').length, 1);
  assert.equal(JSON.parse(await readFile(join(f.root, 'dist/pwa-publication/test-bucket.receipt.json'), 'utf8')).status, 'complete');
});

test('artifact or target mismatch is rejected on resume; no remote deletes occur', async t => {
  const f = await fixture(t, { failAfterWriteKey: 'chunk-a.js' });
  assert.equal((await f.run(...args(f))).code, 1);
  await writeFile(join(f.directory, f.plan[0].file), 'changed artifact');
  const artifactResult = await f.run(...args(f), '--resume');
  assert.equal(artifactResult.code, 1);
  assert.match(artifactResult.stderr, /mismatch/);
  await writeFile(join(f.directory, f.plan[0].file), 'dep-a');
  const targetResult = await f.run('--confirm-billable-operations', '--transport=local', '--resume', '--loopback-origin=http://127.0.0.1:1');
  assert.equal(targetResult.code, 1);
  assert.match(targetResult.stderr, /target\/artifact mismatch/);
  const remote = JSON.parse(await readFile(f.remote, 'utf8'));
  assert.equal(Buffer.from(remote['old-chunk.js'].body, 'base64').toString(), 'retained-old-release');
  assert.ok(!f.methods.includes('DELETE'));
});
