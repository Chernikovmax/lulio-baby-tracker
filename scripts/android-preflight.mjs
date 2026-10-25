import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Deliberately requires an already-created, committed linked worktree. Never switches,
// stashes, resets, stages, signs, tags or publishes; npm ci replaces node_modules here.
const args = process.argv.slice(2);
assert(args.length === 4 && args[0] === '--sha' && args[2] === '--version',
  'Usage: node scripts/android-preflight.mjs --sha <full-source-SHA> --version <major.minor.patch>');
const [, expectedSha, , expectedVersion] = args;
assert(/^[a-f0-9]{40}$/.test(expectedSha), 'Use the exact agreed full source SHA');
assert(/^\d+\.\d+\.\d+$/.test(expectedVersion), 'Use a numeric release version');
const [major, minor, patch] = expectedVersion.split('.').map(Number);
const code = major * 1_000_000 + minor * 1000 + patch;
assert(major <= 2100 && minor <= 999 && patch <= 999 && code >= 1 && code <= 2_100_000_000, 'Version exceeds Android versionCode bounds');
const [nodeMajor, nodeMinor, nodePatch] = process.versions.node.split('.').map(Number);
assert((nodeMajor === 22 && (nodeMinor > 22 || (nodeMinor === 22 && nodePatch >= 3))) ||
  (nodeMajor === 24 && nodeMinor >= 15) || nodeMajor >= 26,
  'Angular 22 requires Node ^22.22.3 || ^24.15.0 || >=26.0.0');
const cwd = realpathSync(process.cwd());
const git = (...argv) => execFileSync('git', argv, { cwd, encoding: 'utf8' }).trim();
assert.equal(realpathSync(git('rev-parse', '--show-toplevel')), cwd, 'Run from checkout root');
assert.equal(realpathSync(fileURLToPath(new URL('..', import.meta.url))), cwd, 'Script must belong to this checkout');
assert.notEqual(realpathSync(resolve(cwd, git('rev-parse', '--git-dir'))),
  realpathSync(resolve(cwd, git('rev-parse', '--git-common-dir'))),
  'Refusing the primary/shared checkout; use a dedicated linked worktree');
function sourceCheck() {
  assert.equal(git('rev-parse', 'HEAD'), expectedSha, 'Checkout differs from agreed source SHA');
  assert.equal(git('status', '--porcelain', '--untracked-files=normal'), '', 'Checkout must be clean, including untracked files');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(pkg.version, expectedVersion, 'Unexpected package version');
  assert.equal(lock.version, expectedVersion, 'Lockfile version differs');
  assert.equal(lock.packages[''].version, expectedVersion, 'Lockfile root package version differs');
}
sourceCheck();
console.log(JSON.stringify({ checkout: cwd, sha: expectedSha, version: expectedVersion, versionCode: code, node: process.version }));
for (const [command, argv] of [
  ['npm', ['ci']], ['npx', ['tsc', '--noEmit']], ['npm', ['run', 'build']],
  ['npx', ['ng', 'test', '--watch=false']],
  [process.execPath, ['scripts/android-smoke.mjs']],
]) {
  const start = performance.now();
  const result = spawnSync(command, argv, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${argv.join(' ')} failed (${result.signal ?? result.status})`);
  console.log(`PASS ${command} ${argv.join(' ')}: ${((performance.now() - start) / 1000).toFixed(2)}s`);
  sourceCheck();
}
console.log('Preflight passed; no APK signing, publication or device acceptance was performed.');
