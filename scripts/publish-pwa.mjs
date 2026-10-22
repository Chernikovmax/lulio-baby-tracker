import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const [bucket, confirmation] = process.argv.slice(2);
if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Supply a dedicated bucket name without dots.');
const directory = resolve('dist/pwa');
const plan = JSON.parse(await readFile(`${directory}/upload-plan.json`, 'utf8'));
const origin = `https://${bucket}.website.yandexcloud.net`;
console.log(`Target: ${origin}; ${plan.length} STANDARD objects. No remote deletions. Bucket must already be configured for public website reads in Russia.`);
if (confirmation !== '--confirm-billable-operations') {
  console.log('Dry run only. After explicit cost approval and authenticated AWS CLI setup, add --confirm-billable-operations. Credentials must never be passed in command arguments.');
  process.exit(0);
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const object of plan) {
  if (object.file !== `files/${encodeURIComponent(object.key)}`) throw new Error('Invalid upload plan');
  execFileSync('aws', ['--endpoint-url', 'https://storage.yandexcloud.net', '--region', 'ru-central1', 's3api', 'put-object', '--bucket', bucket, '--key', object.key, '--body', `${directory}/${object.file}`, '--content-type', object.contentType, '--cache-control', object.cacheControl, '--storage-class', 'STANDARD'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const response = await fetch(`${origin}/${object.key}?release-check=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
  if (response.status !== 200 || response.headers.get('content-type') !== object.contentType || response.headers.get('cache-control') !== object.cacheControl) throw new Error(`Public HTTP metadata verification failed: ${object.key}`);
  const actual = Buffer.from(await response.arrayBuffer());
  if (digest(actual) !== digest(await readFile(`${directory}/${object.file}`))) throw new Error(`Public byte verification failed: ${object.key}`);
  console.log(`Verified ${object.key}`);
}
console.log(`Published and byte-verified ${origin}. Browser offline/update and real-iPhone acceptance are still required; HTTP verification alone is not PWA acceptance.`);
