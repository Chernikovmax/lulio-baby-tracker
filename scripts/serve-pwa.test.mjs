import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPwaServer } from './serve-pwa.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'pwa-server-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'public');
  await mkdir(root);
  await writeFile(join(root, 'index.html'), '<h1>Public fixture</h1>');
  await writeFile(join(root, 'ngsw.json'), '{}');
  await writeFile(join(root, '.private.txt'), 'not-public');
  await writeFile(join(directory, 'private.txt'), 'outside-public-root');
  await symlink(join(directory, 'private.txt'), join(root, 'leak.txt'));
  return { directory, root };
}

test('raw artifact server refuses private paths, escaping symlinks, and writes', async t => {
  const { root } = await fixture(t);
  const { server, origin } = await createPwaServer({ root });
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(await (await fetch(origin)).text(), '<h1>Public fixture</h1>');
  for (const path of ['/.private.txt', '/src/main.ts', '/leak.txt']) {
    const response = await fetch(origin + path);
    assert.notEqual(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /not-public|outside-public-root/);
  }
  const write = await fetch(origin + '/index.html', { method: 'PUT', body: 'replacement' });
  assert.equal(write.status, 405);
  assert.equal(await (await fetch(origin)).text(), '<h1>Public fixture</h1>');
});

test('fixture server rejects non-loopback binding and escaping upload plans before serving', async t => {
  const { root, directory } = await fixture(t);
  await assert.rejects(createPwaServer({ root, host: '0.0.0.0' }), /only binds loopback/);
  const plan = join(directory, 'upload-plan.json');
  await writeFile(plan, JSON.stringify([{ key: 'leak.txt', file: '../private.txt', contentType: 'text/plain', cacheControl: 'no-cache' }]));
  await assert.rejects(createPwaServer({ root, plan }), /Unsafe public upload plan/);
});
