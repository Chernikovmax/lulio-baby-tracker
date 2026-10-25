import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

// No path filters on the workflow: the existing required `build` check always finishes.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value);
const docs = path => path === 'README.md' || path === 'DEPLOY.md' || /^docs\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/.test(path);

function classify() {
  if (process.env.GITHUB_REF?.startsWith('refs/tags/')) return [true, 'Tags always run the complete gate'];
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let base, head;
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    base = event.pull_request?.base?.sha;
    head = event.pull_request?.head?.sha;
    if (!sha(base) || !sha(head)) return [true, 'Missing PR endpoints'];
    // Compare the complete PR, not the synthetic merge commit or only its last commit.
    base = git('merge-base', base, head);
  } else if (process.env.GITHUB_EVENT_NAME === 'push') {
    base = event.before;
    head = event.after;
  } else {
    return [true, 'Manual/unknown events always build'];
  }
  if (!sha(base) || !sha(head)) return [true, 'Missing push/merge-base endpoints'];
  // Disable rename detection: both deleted and added paths must be allowlisted.
  // NUL delimiters preserve spaces, tabs and newlines; do not trim path bytes.
  const paths = execFileSync('git', ['diff', '--name-only', '-z', '--no-renames', base, head, '--'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  if (!paths.length) return [true, 'Empty diff is not proof of a docs-only change'];
  return paths.every(docs) ? [false, 'All changed paths are explicitly allowlisted documentation'] : [true, 'Code, mixed or unknown paths require the full gate'];
}

let result;
try { result = classify(); } catch { result = [true, 'Comparison unavailable; conservatively building']; }
const [build, reason] = result;
console.log(`build=${build}: ${reason}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `build=${build}\n`);
