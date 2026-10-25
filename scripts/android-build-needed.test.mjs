import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

// Real Git histories protect the build/skip boundary, including both rename paths.
test('Android gate uses complete Git changes and fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lulio-change-gate-'));
  const script = fileURLToPath(new URL('android-build-needed.mjs', import.meta.url));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const put = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  const commit = () => {
    git('add', '--all');
    git('-c', 'user.name=Gate Test', '-c', 'user.email=gate@example.invalid', 'commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const check = (name, eventName, event, build, ref = 'refs/heads/main') => {
    const eventPath = join(dir, '.git/event.json');
    const output = join(dir, '.git/output');
    writeFileSync(eventPath, JSON.stringify(event));
    writeFileSync(output, '');
    execFileSync(process.execPath, [script], { cwd: dir, env: { ...process.env,
      GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: output, GITHUB_EVENT_NAME: eventName, GITHUB_REF: ref,
    } });
    assert.equal(readFileSync(output, 'utf8'), `build=${build}\n`, name);
    console.log(`PASS ${name}`);
  };
  try {
    git('init', '-q', '-b', 'main');
    put('README.md', 'initial'); put('src/app.ts', 'initial');
    const base = commit();
    put('README.md', 'documentation');
    put('docs/android/release.md', 'documentation');
    const docs = commit();
    check('docs-only multi-file push', 'push', { before: base, after: docs }, false);
    check('docs-only tag still builds', 'push', { before: base, after: docs }, true, 'refs/tags/v1.4.0');
    check('manual dispatch always builds', 'workflow_dispatch', {}, true);
    check('unknown event always builds', 'schedule', {}, true);
    check('new branch zero before builds', 'push', { before: '0'.repeat(40), after: docs }, true);
    check('missing Git object builds', 'push', { before: 'a'.repeat(40), after: docs }, true);
    check('empty diff builds', 'push', { before: docs, after: docs }, true);
    check('invalid endpoints build', 'push', { before: '--help', after: docs }, true);
    rmSync(join(dir, 'docs/android/release.md'));
    const deletedDoc = commit();
    check('docs deletion can skip', 'push', { before: docs, after: deletedDoc }, false);
    git('mv', 'README.md', 'DEPLOY.md');
    const renamedDoc = commit();
    check('allowlisted docs rename can skip', 'push', { before: deletedDoc, after: renamedDoc }, false);
    git('mv', 'src/app.ts', 'docs/code.md');
    const renamedCode = commit();
    check('code renamed into docs must build', 'push', { before: renamedDoc, after: renamedCode }, true);
    git('mv', 'docs/code.md', 'src/restored.ts');
    const restoredCode = commit();
    check('docs renamed into code must build', 'push', { before: renamedCode, after: restoredCode }, true);
    rmSync(join(dir, 'src/restored.ts'));
    const deletedCode = commit();
    check('code deletion must build', 'push', { before: restoredCode, after: deletedCode }, true);
    put('DEPLOY.md', 'changed docs'); put('src/app.ts', 'code');
    const mixed = commit();
    check('mixed docs/code push builds', 'push', { before: deletedCode, after: mixed }, true);
    put('DEPLOY.md', 'last commit docs');
    const docsAfterCode = commit();
    check('PR includes earlier code, not only final docs commit', 'pull_request', { pull_request: { base: { sha: deletedCode }, head: { sha: docsAfterCode } } }, true, 'refs/pull/1/merge');
    check('docs-only PR skips', 'pull_request', { pull_request: { base: { sha: mixed }, head: { sha: docsAfterCode } } }, false, 'refs/pull/2/merge');
    git('checkout', '-qb', 'diverged', mixed);
    put('src/base-only.ts', 'base advanced after branch split');
    const advancedBase = commit();
    check('PR merge-base ignores unrelated base-only code', 'pull_request', { pull_request: { base: { sha: advancedBase }, head: { sha: docsAfterCode } } }, false, 'refs/pull/3/merge');
    check('force push compares before/after trees', 'push', { before: advancedBase, after: docsAfterCode }, true);
    put('docs/not-allowlisted.txt', 'unknown');
    const unknown = commit();
    check('unknown docs extension builds', 'push', { before: advancedBase, after: unknown }, true);
    put('docs/new\nline.md', 'unusual path');
    const unusual = commit();
    check('NUL-delimited unusual filenames build', 'push', { before: unknown, after: unusual }, true);
    check('incomplete PR payload builds', 'pull_request', {}, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
