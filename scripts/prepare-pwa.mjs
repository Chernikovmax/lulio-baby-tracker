import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Only SW-authenticated files, runtime/licenses and the exact public reminder configuration.
// Never recursively copy the repository or include local diary exports in a release.
const source = resolve('www');
const output = resolve('dist/pwa');
const manifest = JSON.parse(await readFile(`${source}/ngsw.json`, 'utf8'));
const types = { js: 'text/javascript', css: 'text/css', html: 'text/html; charset=utf-8', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/manifest+json', json: 'application/json', txt: 'text/plain; charset=utf-8' };
const plan = [];
async function stage(key, sourceKey = key, expectedHash) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.split('/').includes('..')) throw new Error('Unsafe release key');
  const bytes = await readFile(`${source}/${sourceKey}`);
  if (expectedHash && createHash('sha1').update(bytes).digest('hex') !== expectedHash) throw new Error(`SW hash mismatch: ${sourceKey}`);
  const contentType = types[key.split('.').pop()] ?? (key.startsWith('tabs') ? types.html : undefined);
  if (!contentType) throw new Error(`Unknown public MIME type: ${key}`);
  const file = `files/${encodeURIComponent(key)}`;
  await mkdir(`${output}/files`, { recursive: true });
  await copyFile(`${source}/${sourceKey}`, `${output}/${file}`);
  plan.push({ key, file, contentType, cacheControl: /^(?:main|chunk|styles)-[\w-]+\.(?:js|css)$/.test(key) ? 'public, max-age=31536000, immutable' : 'no-cache' });
}
const entries = Object.entries(manifest.hashTable);
for (const [url, hash] of entries) {
  const key = url.replace(/^\//, '');
  if (key === 'index.html' || key === 'manifest.webmanifest') continue;
  if (!/^(?:assets\/[\w/.-]+|[\w-]+\.(?:js|css))$/.test(key)) throw new Error(`Unexpected public resource: ${key}`);
  await stage(key, key, hash);
}
for (const key of ['ngsw-worker.js', 'safety-worker.js', 'worker-basic.min.js', '3rdpartylicenses.txt']) await stage(key);
// This optional public URL/policy gate must remain network-fresh, outside the SW cache.
const reminderConfig = JSON.parse(await readFile(`${source}/assets/reminders-config.json`, 'utf8'));
if (!reminderConfig || typeof reminderConfig !== 'object' || Array.isArray(reminderConfig) ||
    Object.keys(reminderConfig).some(key => !['apiUrl', 'privacyApproved'].includes(key)) ||
    ('apiUrl' in reminderConfig && (typeof reminderConfig.apiUrl !== 'string' || !/^https:\/\/functions\.yandexcloud\.net\/[a-z0-9-]+$/.test(reminderConfig.apiUrl))) ||
    ('privacyApproved' in reminderConfig && typeof reminderConfig.privacyApproved !== 'boolean')) throw new Error('Invalid public reminder configuration');
await stage('assets/reminders-config.json');
await stage('manifest.webmanifest', 'manifest.webmanifest', manifest.hashTable['/manifest.webmanifest']);
await stage('index.html', 'index.html', manifest.hashTable['/index.html']);
// Exact extensionless objects return 200 on a first visit, without paid SPA routing services.
for (const route of ['tabs', 'tabs/tracker', 'tabs/stats', 'tabs/leaps', 'tabs/settings']) {
  await stage(route, 'index.html', manifest.hashTable['/index.html']);
  await stage(`${route}/index.html`, 'index.html', manifest.hashTable['/index.html']);
}
await stage('ngsw.json'); // Always publish last; old bundles are deliberately retained remotely.
await writeFile(`${output}/upload-plan.json`, JSON.stringify(plan, null, 2) + '\n');
console.log(`Prepared ${plan.length} public objects in dist/pwa/files. Upload only keys in upload-plan.json, never a recursive directory sync.`);
