import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Pinned tool-only install, outside the application lockfile and browser cache.
// CLI and browser always come from the same package; no cached revision guessing.
const playwrightVersion = '1.64.1';
const root = fileURLToPath(new URL('..', import.meta.url));
assert.equal(resolve(process.cwd()), resolve(root), 'Run from the isolated checkout root after a production build');
const www = resolve(root, 'www');
await readFile(join(www, 'ngsw.json')); // Require a production bundle, not ng serve.
const temp = await mkdtemp(join(tmpdir(), 'lulio-android-smoke-'));
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(temp, 'browsers') };
let browser, context, server, page;
const errors = [];
const external = [];
async function cleanup() {
  try {
    await context?.close();
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        if (server?.listening) await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    }
  }
}
// A killed run must not leave a browser/profile or loopback server behind.
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  cleanup().finally(() => process.exit(1));
});
function run(command, argv) {
  const result = spawnSync(command, argv, { cwd: temp, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed (${result.signal ?? result.status})`);
}
try {
  run('npm', ['install', '--prefix', temp, '--no-save', '--package-lock=false', '--ignore-scripts', '--no-audit', '--no-fund', `playwright@${playwrightVersion}`]);
  run(process.execPath, [join(temp, 'node_modules/playwright/cli.js'), 'install', 'chromium', '--only-shell']);
  // Playwright reads this at import time, after the matching browser installation.
  process.env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH;
  const { chromium } = await import(pathToFileURL(join(temp, 'node_modules/playwright/index.mjs')));
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(www, `.${pathname === '/' || !extname(pathname) ? '/index.html' : pathname}`);
      if (!file.startsWith(www + sep)) { response.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'ru-RU', timezoneId: 'Europe/Moscow' });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(new URL(route.request().url()).origin);
    return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  const themeKey = 'CapacitorStorage.baby-tracker-theme';
  const diaryKey = 'CapacitorStorage.baby-tracker.v1';
  const settings = () => page.goto(`${origin}/tabs/settings`);
  const selected = theme => page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
  const storedTheme = () => page.evaluate(key => localStorage.getItem(key), themeKey);
  const diary = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), diaryKey);
  const primary = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim());
  await settings();
  await selected('default');
  await page.getByRole('button', { name: /Terracotta/ }).waitFor({ state: 'visible' });
  const defaultColor = await primary();
  await page.getByRole('button', { name: /Terracotta/ }).click();
  await selected('terracotta');
  assert.equal(await storedTheme(), 'terracotta');
  const terracottaColor = await primary();
  assert.notEqual(terracottaColor, defaultColor);
  await page.reload();
  await selected('terracotta');
  assert.equal(await page.getByRole('button', { name: /Terracotta/ }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: /Muted Sage/ }).click();
  await selected('muted-sage');
  assert.equal(await storedTheme(), 'muted-sage');
  const sageColor = await primary();
  assert.notEqual(sageColor, defaultColor);
  assert.notEqual(sageColor, terracottaColor);
  await page.reload();
  await selected('muted-sage');
  assert.equal(await page.getByRole('button', { name: /Muted Sage/ }).getAttribute('aria-pressed'), 'true');
  console.log('PASS Terracotta and Muted Sage: applied colors, selected controls and reload persistence');

  // Fault injection is confined to this disposable page and this synthetic key.
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Synthetic smoke write failure', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, themeKey);
  await page.getByRole('button', { name: /Terracotta/ }).click();
  await page.getByRole('alert').filter({ hasText: 'Не удалось сохранить тему' }).waitFor();
  assert.equal(await storedTheme(), 'muted-sage');
  await selected('muted-sage');
  assert.equal(await page.getByRole('button', { name: /Muted Sage/ }).getAttribute('aria-pressed'), 'true');
  await page.reload(); // Removes the injected failure and proves durable retention.
  await selected('muted-sage');
  console.log('PASS failed theme save: previous palette and durable selection retained');

  await page.goto(`${origin}/tabs/tracker`);
  await page.locator('app-quick-action-dock').getByRole('button', { name: 'Сон', exact: true }).click();
  let modal = page.locator('ion-modal:visible');
  await modal.getByRole('button', { name: 'Начать сон', exact: true }).click();
  await modal.getByRole('button', { name: 'Пауза', exact: true }).waitFor();
  const running = (await diary()).activeTimers.sleepTimer;
  assert(Number.isFinite(Date.parse(running.startedAt)));
  await page.waitForFunction(start => Date.now() - Date.parse(start) >= 1200, running.startedAt);
  await modal.getByRole('button', { name: 'Пауза', exact: true }).click();
  await modal.getByText('Сон на паузе', { exact: true }).waitFor();
  const paused = (await diary()).activeTimers.sleepTimer;
  assert.equal(paused.startedAt, running.startedAt);
  assert(Number.isFinite(Date.parse(paused.pausedAt)));
  const elapsed = await modal.locator('.elapsed').innerText();
  await page.waitForFunction(at => Date.now() - Date.parse(at) >= 1200, paused.pausedAt);
  assert.equal(await modal.locator('.elapsed').innerText(), elapsed, 'Paused elapsed time must not grow');
  await page.reload();
  await page.locator('app-quick-action-dock').getByRole('button', { name: 'Сон: таймер запущен', exact: true }).click();
  modal = page.locator('ion-modal:visible');
  await modal.getByText('Сон на паузе', { exact: true }).waitFor();
  assert.deepEqual((await diary()).activeTimers.sleepTimer, paused);
  await modal.getByRole('button', { name: 'Завершить сон', exact: true }).click();
  await modal.getByRole('button', { name: 'Начать сон', exact: true }).waitFor();
  const finished = await diary();
  assert.equal(finished.activeTimers.sleepTimer, null);
  assert.equal(finished.events.length, 1);
  assert.equal(finished.events[0].type, 'sleep');
  assert.equal(finished.events[0].startTime, running.startedAt);
  assert.equal(finished.events[0].endTime, paused.pausedAt);
  await modal.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: /Редактировать время:.*сон/ }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: /Редактировать время:.*сон/ }).waitFor();
  assert.deepEqual(await diary(), finished);
  console.log('PASS sleep timer: UI start/pause, frozen elapsed, paused reload, atomic finish and diary reload');

  await page.evaluate(key => localStorage.setItem(key, 'unsupported-smoke-theme'), themeKey);
  await settings();
  await selected('default');
  assert.equal(await primary(), defaultColor);
  assert.equal(await page.getByRole('button', { name: /Стандартная/ }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, [], 'Unexpected page exceptions');
  assert.deepEqual(external, [], 'Unexpected external requests (all were blocked)');
  console.log(`PASS unsupported stored theme: default fallback; Chromium ${browser.version()}; no page exceptions or external requests`);
  console.log('Browser smoke passed against local production www/; native APK/device and service-worker lifecycle are not covered.');
} catch (error) {
  // Only this synthetic context is inspected; never attach a user's browser.
  console.error({ url: page?.url(), pageErrors: errors, externalRequests: external,
    buttons: page ? await page.getByRole('button').allTextContents() : [] });
  throw error;
} finally {
  await cleanup();
}
