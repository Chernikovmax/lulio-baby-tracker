import { createPwaServer } from './serve-pwa.mjs';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULT_STEP_MS = 60_000;
const DEFAULT_TOTAL_MS = 300_000;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const HELP = `Usage:
  node scripts/smoke-pwa.mjs (--origin http://127.0.0.1:PORT | --root dist/pwa --plan dist/pwa/upload-plan.json [--previous-root <extracted-old-pwa> --previous-plan <old-upload-plan.json>]) [--playwright-module /absolute/path/to/playwright] [--browser-executable /absolute/path/to/chromium] [--evidence <new-dir>] [--step-timeout-ms 60000] [--timeout-ms 300000]
Only loopback origins are permitted by default. External-origin approval is implemented for a separately authorized rehearsal; this harness must not be run externally as part of local validation. Each run creates a fresh owned profile and evidence directory. Never pass a pre-existing browser profile.`;

function option(args, name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; }
function checkOrigin(origin, approve) {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Origin must be an HTTP(S) URL without credentials');
  if (!LOOPBACK.has(url.hostname.toLowerCase()) && !approve) throw new Error('Refusing non-loopback origin without --approve-external-origin');
  return url.origin;
}
function assert(condition, message) { if (!condition) throw new Error(message); }
async function loadPlaywright(modulePath) {
  const path = resolve(modulePath);
  const req = createRequire(import.meta.url);
  const resolved = req.resolve(path);
  const loaded = await import(pathToFileURL(resolved).href);
  return loaded.chromium ?? loaded.default?.chromium;
}

export async function runSmoke({ origin, evidence, stepTimeout = DEFAULT_STEP_MS, totalTimeout = DEFAULT_TOTAL_MS, playwrightModule, browserExecutable, server, switchRelease, plan, newPlan, approveExternal = false }) {
  origin = checkOrigin(origin, approveExternal);
  const localServer = server;
  const started = Date.now();
  const deadline = started + totalTimeout;
  const bounded = (operation, timeout, label) => {
    let timer;
    return Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeout} ms`)), timeout); }),
    ]).finally(() => clearTimeout(timer));
  };
  const evidenceDir = resolve(evidence ?? `dist/pwa-smoke-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(evidenceDir, { recursive: false });
  const profileDir = resolve(evidenceDir, 'owned-chromium-profile');
  await mkdir(profileDir, { recursive: false });
  const statePath = resolve(evidenceDir, 'scenario-state.json');
  const logPath = resolve(evidenceDir, 'steps.json');
  const steps = [];
  const state = { version: 1, origin, browserRestarts: 0, completed: [], assertions: {}, diary: null, upgraded: false, upgrade: null, pageErrors: [], blockedOrigins: [], sheets: [] };
  const writeEvidence = async (path, value) => {
    await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n');
    await rename(`${path}.tmp`, path);
  };
  const persist = () => writeEvidence(statePath, state);
  const remaining = () => Math.min(stepTimeout, deadline - Date.now());
  const fetch = url => globalThis.fetch(url, { signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, remaining()))), redirect: 'error' });
  let browser = null;
  let context = null;
  let page = null;
  let chromium;
  let failure;
  const saveScreenshot = async path => {
    if (!page || page.isClosed()) return;
    const timeout = Math.max(250, Math.min(4_000, deadline - Date.now()));
    await bounded(() => page.screenshot({ path }), timeout, 'Screenshot').catch(() => {});
  };
  const evidenceStep = async (name, action) => {
    const record = { name, startedAt: new Date().toISOString() };
    try {
      const timeout = remaining();
      assert(timeout > 0, 'Overall smoke timeout exceeded');
      let timer;
      record.result = await Promise.race([action(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Step exceeded ${timeout} ms`)), timeout); })]).finally(() => clearTimeout(timer));
      record.ok = true;
      state.completed.push(name);
    } catch (error) {
      record.ok = false; record.error = String(error?.stack ?? error);
      await saveScreenshot(resolve(evidenceDir, `failure-${steps.length + 1}.png`));
      await writeEvidence(resolve(evidenceDir, `failure-${steps.length + 1}.json`), { step: name, error: record.error, url: page?.url() ?? null });
      throw error;
    } finally {
      record.finishedAt = new Date().toISOString(); steps.push(record);
      await writeEvidence(logPath, steps);
      if (page && !page.isClosed()) await saveScreenshot(resolve(evidenceDir, `${String(steps.length).padStart(2, '0')}-${name.replace(/[^a-z0-9-]/gi, '-')}.png`));
      await persist();
    }
  };
  const initBrowser = async () => {
    const timeout = remaining(); assert(timeout > 0, 'Overall smoke timeout exceeded');
    browser = await chromium.launchPersistentContext(profileDir, {
      executablePath: browserExecutable || undefined,
      headless: true, timeout, serviceWorkers: 'allow', viewport: { width: 390, height: 844 },
      args: [
        '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
        `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1${LOOPBACK.has(new URL(origin).hostname.toLowerCase()) ? '' : `, EXCLUDE ${new URL(origin).hostname}`}`,
      ],
    });
    context = browser; page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(Math.min(10_000, stepTimeout));
    page.setDefaultNavigationTimeout(Math.min(15_000, stepTimeout));
    await context.addInitScript(() => {
      window.__pwaInstallPromptSeen = false;
      window.addEventListener('beforeinstallprompt', () => { window.__pwaInstallPromptSeen = true; });
    });
    await context.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin === origin) return route.continue();
      return route.abort('blockedbyclient');
    });
    page.on('pageerror', error => state.pageErrors.push(error.message));
    page.on('request', request => {
      const target = new URL(request.url()).origin;
      if (target !== origin && !state.blockedOrigins.includes(target)) state.blockedOrigins.push(target);
    });
  };
  const closeBrowser = async () => {
    if (browser) await bounded(() => browser.close(), 5_000, 'Owned browser shutdown').catch(() => {});
    browser = context = page = null;
  };
  const closeSheet = async () => {
    const close = page.getByRole('button', { name: 'Закрыть', exact: true });
    await close.click();
    await close.waitFor({ state: 'hidden' });
  };
  const readDiary = () => page.evaluate(() => localStorage.getItem('CapacitorStorage.baby-tracker.v1'));
  const dock = name => page.locator('app-quick-action-dock').getByRole('button', { name });
  const addBottle = async () => {
    const before = JSON.parse(await readDiary());
    await dock('Бутылочка').click();
    await page.getByLabel('Объём, мл', { exact: true }).fill('125');
    const save = page.getByRole('button', { name: 'Сохранить кормление', exact: true });
    await save.click();
    await save.waitFor({ state: 'hidden' });
    const after = JSON.parse(await readDiary());
    const bottles = after.events.filter(event => event.type === 'bottle');
    assert(bottles.length === before.events.filter(event => event.type === 'bottle').length + 1 && bottles.every(event => event.volumeMl === 125), 'Bottle UI did not persist exactly one 125 ml event');
  };
  const inspectThemeSheets = async theme => {
    await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
    await dock('Грудное вскармливание').click();
    const left = page.getByRole('button', { name: /^Левая/ });
    await left.waitFor();
    await left.scrollIntoViewIfNeeded();
    const controls = [];
    for (const side of ['Левая', 'Правая']) {
      const button = page.getByRole('button', { name: new RegExp(`^${side}`) });
      const box = await button.boundingBox();
      assert(box?.height >= 52, `${theme}: ${side} feeding target is smaller than 52px`);
      controls.push({ side, height: box.height, color: await button.evaluate(element => getComputedStyle(element).color) });
    }
    await saveScreenshot(resolve(evidenceDir, `${theme}-feeding.png`));
    await closeSheet();
    await dock(/^Сон/).click();
    const sleepControl = page.getByRole('button', { name: state.upgraded ? 'Завершить сон' : 'Начать сон', exact: true });
    await sleepControl.waitFor();
    await sleepControl.scrollIntoViewIfNeeded();
    const sleepBox = await sleepControl.boundingBox();
    assert(sleepBox?.height >= 52, `${theme}: sleep target is smaller than 52px`);
    await saveScreenshot(resolve(evidenceDir, `${theme}-sleep.png`));
    await closeSheet();
    state.sheets.push({ theme, controls, sleepHeight: sleepBox.height });
  };
  const appRelease = () => page.evaluate(async () => {
    const main = [...document.scripts].map(script => script.src).find(src => new URL(src).pathname.split('/').pop().startsWith('main-'));
    const registration = await navigator.serviceWorker?.getRegistration();
    return { main: main ? new URL(main).pathname.split('/').pop() : null, workerControlled: Boolean(navigator.serviceWorker?.controller), workerState: registration?.active?.state ?? 'unavailable' };
  });
  try {
    chromium = await loadPlaywright(playwrightModule);
    await evidenceStep('fixture-static-contract', async () => {
      const html = await fetch(`${origin}/index.html`);
      assert(html.status === 200 && html.headers.get('content-type')?.startsWith('text/html'), 'Fixture index must be served as HTML');
      const expectedIndex = await html.text();
      const aliases = ['/tabs/tracker', '/tabs/stats', '/tabs/leaps', '/tabs/settings'].flatMap(route => [route, `${route}/`, `${route}/index.html`]);
      for (const route of aliases) {
        const response = await fetch(`${origin}${route}`);
        assert(response.status === 200 && response.headers.get('content-type')?.startsWith('text/html'), `Alias ${route} must serve HTML`);
        assert(await response.text() === expectedIndex, `Alias ${route} did not serve the app entry document`);
      }
      const missing = await fetch(`${origin}/__smoke_missing_asset__.js`);
      assert(missing.status === 404, `Missing JavaScript asset unexpectedly returned ${missing.status}`);
      const checks = { htmlMime: html.headers.get('content-type'), aliases: aliases.length, missingJavaScript: missing.status };
      if (plan) {
        const entries = JSON.parse(await readFile(resolve(plan), 'utf8'));
        const manifest = entries.find(entry => entry.key === 'manifest.webmanifest');
        const main = entries.find(entry => /^main-[a-zA-Z0-9_-]+[.]js$/.test(entry.key));
        assert(manifest && main, 'Upload plan must contain manifest and hashed main bundle');
        const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
        assert(manifestResponse.headers.get('content-type') === manifest.contentType && manifestResponse.headers.get('cache-control') === manifest.cacheControl, 'Manifest MIME/cache metadata differs from upload plan');
        const mainResponse = await fetch(`${origin}/${main.key}`);
        assert(mainResponse.headers.get('content-type') === main.contentType && mainResponse.headers.get('cache-control') === main.cacheControl, 'Main bundle MIME/cache metadata differs from upload plan');
        checks.manifest = { mime: manifest.contentType, cacheControl: manifest.cacheControl };
        checks.mainBundle = { key: main.key, mime: main.contentType, cacheControl: main.cacheControl };
      }
      return checks;
    });
    await initBrowser();
    await evidenceStep('open-app', async () => {
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `App document returned ${response?.status()}`);
      await page.locator('ion-tab-bar[aria-label="Основная навигация"]').waitFor();
      await page.getByRole('button', { name: 'Сон', exact: true }).waitFor();
      if (await page.evaluate(() => 'serviceWorker' in navigator)) {
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
      state.initialRelease = await appRelease();
      assert(state.initialRelease.workerControlled && state.initialRelease.workerState === 'activated', 'The initial service worker must be active and control the page');
      return {
        status: response.status(), url: page.url(),
        secure: await page.evaluate(() => isSecureContext),
        serviceWorker: await page.evaluate(() => ({ available: 'serviceWorker' in navigator, controlled: Boolean(navigator.serviceWorker?.controller) })),
        installability: await page.evaluate(() => ({ manifestLink: Boolean(document.querySelector('link[rel="manifest"]')), beforeInstallPromptObserved: Boolean(window.__pwaInstallPromptSeen) })),
        release: state.initialRelease,
      };
    });
    if (switchRelease) {
      await evidenceStep('prepare-old-release-diary-and-update', async () => {
        await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
        await page.getByRole('heading', { name: 'Профиль малыша', exact: true }).waitFor();
        await page.locator('#baby-name').fill('Smoke Baby');
        await page.locator('#baby-birth').fill('2026-10-01');
        await page.locator('#baby-due').fill('2026-10-15');
        await page.locator('#baby-gender').selectOption('girl');
        await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'Профиль сохранён.' }).waitFor();
        await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
        await addBottle();
        await page.getByRole('button', { name: 'Сон', exact: true }).click();
        await page.getByRole('button', { name: 'Ночь', exact: true }).click();
        await page.getByRole('button', { name: 'Начать сон', exact: true }).click();
        await page.getByText('Идёт ночной сон', { exact: true }).waitFor();
        await closeSheet();
        const oldDiary = await page.evaluate(() => localStorage.getItem('CapacitorStorage.baby-tracker.v1'));
        assert(oldDiary, 'Old release did not persist the synthetic diary');
        const parsed = JSON.parse(oldDiary);
        assert(parsed.profile?.name === 'Smoke Baby' && parsed.events?.some(event => event.type === 'bottle' && event.volumeMl === 125) && parsed.activeTimers?.sleepTimer && !parsed.activeTimers.sleepTimer.pausedAt, 'Old release fixture lacks profile, bottle, or running sleep timer');
        state.upgradeBeforeDiary = oldDiary;
        state.upgradeBeforeRelease = await appRelease();
        assert(state.upgradeBeforeRelease.main && state.upgradeBeforeRelease.workerControlled, 'Old release main bundle and active service worker must be observable');
        const oldPlan = JSON.parse(await readFile(resolve(plan), 'utf8'));
        const oldMainEntry = oldPlan.find(entry => entry.key === state.upgradeBeforeRelease.main);
        assert(oldMainEntry, 'Old loaded main bundle is absent from the old upload plan');
        const oldMainResponse = await fetch(`${origin}/${oldMainEntry.key}`);
        assert(oldMainResponse.ok && oldMainResponse.headers.get('content-type') === oldMainEntry.contentType && oldMainResponse.headers.get('cache-control') === oldMainEntry.cacheControl, 'Old main bundle does not match old release plan metadata');
        const oldMainBytes = await oldMainResponse.arrayBuffer();
        const oldMainDigest = createHash('sha256').update(Buffer.from(oldMainBytes)).digest('hex');
        const oldSwResponse = await fetch(`${origin}/ngsw.json`);
        assert(oldSwResponse.ok, 'Old release service-worker manifest is unavailable');
        const oldSwDigest = createHash('sha256').update(Buffer.from(await oldSwResponse.arrayBuffer())).digest('hex');
        await switchRelease();
        const retainedOldMain = await fetch(`${origin}/${oldMainEntry.key}`);
        const retainedDigest = createHash('sha256').update(Buffer.from(await retainedOldMain.arrayBuffer())).digest('hex');
        assert(retainedOldMain.ok && retainedDigest === oldMainDigest, 'Switching releases did not retain the previous hashed main bundle bytes');
        const newSwResponse = await fetch(`${origin}/ngsw.json`);
        assert(newSwResponse.ok, 'New release service-worker manifest is unavailable');
        const newSwDigest = createHash('sha256').update(Buffer.from(await newSwResponse.arrayBuffer())).digest('hex');
        assert(newSwDigest !== oldSwDigest, 'Release switch did not change the service-worker manifest');
        await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
        await page.getByRole('button', { name: 'Проверить обновление', exact: true }).click();
        await page.getByRole('button', { name: 'Перезагрузить', exact: true }).waitFor();
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          page.getByRole('button', { name: 'Перезагрузить', exact: true }).click(),
        ]);
        await page.getByRole('heading', { name: 'Профиль и данные' }).waitFor();
        const newDiary = await page.evaluate(() => localStorage.getItem('CapacitorStorage.baby-tracker.v1'));
        assert(newDiary === oldDiary, 'Whole-version update changed the serialized synthetic diary');
        const newRelease = await appRelease();
        assert(newRelease.main && newRelease.main !== state.upgradeBeforeRelease.main, 'Whole-version update did not adopt the new main bundle');
        assert(newRelease.workerControlled && newRelease.workerState === 'activated', 'New release service worker is not active and controlling the page');
        let newMainEntry = null;
        if (newPlan) {
          const nextPlan = JSON.parse(await readFile(resolve(newPlan), 'utf8'));
          newMainEntry = nextPlan.find(entry => entry.key === newRelease.main);
          assert(newMainEntry && newMainEntry.cacheControl === 'public, max-age=31536000, immutable', 'New release main bundle is not present in the new local plan');
          const newMainResponse = await fetch(`${origin}/${newMainEntry.key}`);
          assert(newMainResponse.ok && newMainResponse.headers.get('content-type') === newMainEntry.contentType && newMainResponse.headers.get('cache-control') === newMainEntry.cacheControl, 'New main bundle does not match new release plan metadata');
        }
        state.upgraded = true;
        state.upgrade = { before: { ...state.upgradeBeforeRelease, serviceWorkerManifestDigest: oldSwDigest }, after: { ...newRelease, serviceWorkerManifestDigest: newSwDigest }, diaryUnchanged: true, workerState: newRelease.workerState, oldMainKey: oldMainEntry.key, oldMainDigest, newMainKey: newMainEntry?.key, retainedOldHashedObjects: retainedDigest === oldMainDigest };
        return state.upgrade;
      });
    }

    await evidenceStep('create-synthetic-profile', async () => {
      if (state.upgraded) {
        const value = await page.evaluate(() => localStorage.getItem('CapacitorStorage.baby-tracker.v1'));
        assert(JSON.parse(value ?? 'null')?.profile?.name === 'Smoke Baby', 'Upgrade did not retain the synthetic profile');
        return { profileRetainedAcrossUpgrade: true };
      }
      await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
      await page.getByRole('heading', { name: 'Профиль малыша', exact: true }).waitFor();
      await page.locator('#baby-name').fill('Smoke Baby');
      await page.locator('#baby-birth').fill('2026-10-01');
      await page.locator('#baby-due').fill('2026-10-15');
      await page.locator('#baby-gender').selectOption('girl');
      await page.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Профиль сохранён.' }).waitFor();
      const value = await page.evaluate(() => localStorage.getItem('CapacitorStorage.baby-tracker.v1'));
      return { profileSaved: true, serializedStoragePresent: Boolean(value) };
    });

    await evidenceStep('theme-switch-reload', async () => {
      await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
      await page.getByRole('button', { name: 'Muted Sage', exact: false }).click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'muted-sage');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Профиль и данные' }).waitFor();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'muted-sage');
      await inspectThemeSheets('muted-sage');
    });

    await evidenceStep('bottle-entry-and-sheet-close', async () => {
      await page.getByRole('tab', { name: 'Сегодня', exact: true }).click();
      await addBottle();
      return { volumeMl: 125, sheetClosed: true };
    });

    await evidenceStep('theme-second-choice-and-modals', async () => {
      await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
      await page.getByRole('button', { name: 'Terracotta', exact: false }).click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'terracotta');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Профиль и данные' }).waitFor();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'terracotta');
      await inspectThemeSheets('terracotta');
      assert(state.sheets[0].controls[0].color !== state.sheets[1].controls[0].color, 'Feeding controls did not change color between themes');
      return { theme: 'terracotta', sheetsClosed: true };
    });

    await evidenceStep('start-pause-offline-reload', async () => {
      if (!state.upgraded) {
        await page.getByRole('button', { name: 'Сон', exact: true }).click();
        await page.getByRole('button', { name: 'Ночь', exact: true }).click();
        await page.getByRole('button', { name: 'Начать сон', exact: true }).click();
      } else {
        await page.getByRole('button', { name: /^Сон/ }).click();
      }
      await page.locator('ion-modal').last().getByText('Идёт ночной сон', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Пауза', exact: true }).click();
      await page.locator('ion-modal').last().getByText('Сон на паузе', { exact: true }).waitFor();
      const serialized = await page.evaluate(() => localStorage.getItem('CapacitorStorage.baby-tracker.v1'));
      assert(serialized, 'Expected app diary value in Capacitor local storage');
      const data = JSON.parse(serialized);
      state.diary = { serializedStoragePresent: true, profile: data.profile?.name, bottleVolumeMl: data.events?.find(event => event.type === 'bottle')?.volumeMl, timerPaused: Boolean(data.activeTimers?.sleepTimer?.pausedAt) };
      assert(state.diary.profile === 'Smoke Baby' && state.diary.bottleVolumeMl === 125 && state.diary.timerPaused, 'Synthetic diary does not contain expected profile, bottle, and paused timer');
      state.diarySnapshot = serialized;
      state.assertions.serializedDiaryBeforeOffline = JSON.parse(serialized);
      await closeSheet();
      await context.setOffline(true);
      const response = await page.reload({ waitUntil: 'domcontentloaded' });
      assert(response?.ok() && response.fromServiceWorker(), 'Offline reload must load the app document from its service worker');
      await page.getByRole('button', { name: 'Продолжить сон', exact: true }).waitFor();
      assert(await readDiary() === state.diarySnapshot, 'Serialized diary changed across offline reload');
      return { offlineReload: true, pausedTimerRestored: true, documentFromServiceWorker: true };
    });

    await evidenceStep('terminate-and-restart-browser-offline', async () => {
      await closeBrowser();
      state.browserRestarts++;
      await initBrowser();
      await context.setOffline(true);
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
      assert(response?.ok() && response.fromServiceWorker(), 'Offline browser restart must load from its service worker');
      const restartedDiary = await page.evaluate(() => localStorage.getItem('CapacitorStorage.baby-tracker.v1'));
      assert(restartedDiary === state.diarySnapshot, 'Serialized diary changed across browser process restart');
      await page.locator('ion-tab-bar[aria-label="Основная навигация"]').waitFor();
      await page.getByRole('button', { name: /^Сон/ }).click();
      await page.locator('ion-modal').last().getByText('Сон на паузе', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Продолжить сон', exact: true }).click();
      await page.locator('ion-modal').last().getByText('Идёт ночной сон', { exact: true }).waitFor();
      return { offlineProcessRestart: true, diaryRestored: true, timerResumed: true, persistentOwnedProfile: profileDir };
    });

    await evidenceStep('finish-sleep-and-check-offline-routes', async () => {
      await page.getByRole('button', { name: 'Завершить сон', exact: true }).click();
      await page.getByRole('button', { name: 'Начать сон', exact: true }).waitFor();
      await closeSheet();
      for (const route of ['/tabs/tracker', '/tabs/stats', '/tabs/leaps', '/tabs/settings']) {
        const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
        assert(response?.ok() && response.fromServiceWorker(), `Route ${route} must load from its service worker offline (${response?.status()})`);
        if (route.endsWith('stats')) await page.getByRole('heading', { name: 'Ритм малыша', exact: true }).waitFor();
        if (route.endsWith('leaps')) await page.getByRole('heading', { name: 'Мир становится больше', exact: true }).waitFor();
        if (route.endsWith('settings')) await page.getByRole('heading', { name: 'Профиль и данные' }).waitFor();
      }
      return { finishedSleep: true, offlineRoutes: ['/tabs/tracker', '/tabs/stats', '/tabs/leaps', '/tabs/settings'] };
    });

    await evidenceStep('serialized-diary-invariants', async () => {
      const serialized = await page.evaluate(() => localStorage.getItem('CapacitorStorage.baby-tracker.v1'));
      assert(serialized, 'Could not locate serialized synthetic diary');
      const diary = JSON.parse(serialized);
      assert(diary.profile?.name === 'Smoke Baby', 'Persisted profile mismatch');
      const bottles = diary.events.filter(event => event.type === 'bottle');
      assert(bottles.length === (state.upgraded ? 2 : 1) && bottles.every(event => event.volumeMl === 125), 'Persisted bottle count or volume mismatch');
      assert(diary.events?.some(event => event.type === 'sleep' && event.isNightSleep === true && event.endTime), 'Finished night sleep event missing');
      assert(diary.activeTimers?.sleepTimer === null, 'Sleep timer did not finish');
      state.assertions.serializedDiary = { profile: diary.profile.name, bottleCount: bottles.length, bottleVolumeMl: 125, finishedNightSleep: true, activeTimerCleared: true };
    });
    await evidenceStep('service-worker-health', async () => {
      const release = await appRelease();
      const debug = await page.evaluate(async () => {
        const response = await fetch('/ngsw/state');
        if (!response.ok) throw new Error(`Service-worker diagnostics returned ${response.status}`);
        return response.text();
      });
      assert(release.workerControlled && release.workerState === 'activated', 'Service worker is no longer active and controlling the page');
      assert(/Driver state: NORMAL/.test(debug), 'Service worker is not in NORMAL state');
      const cdp = await context.newCDPSession(page);
      const installability = await cdp.send('Page.getInstallabilityErrors');
      await cdp.detach();
      assert(installability.installabilityErrors.length === 0, 'Chromium reported installability errors');
      assert(state.pageErrors.length === 0, `Browser page errors: ${state.pageErrors.join('; ')}`);
      return { release, driver: 'NORMAL', installability };
    });
    await persist();
    await writeEvidence(resolve(evidenceDir, 'result.json'), { ok: true, origin, evidenceDir, steps, state });
    return { ok: true, evidenceDir, steps: steps.length };
  } catch (error) {
    failure = error;
    await writeEvidence(resolve(evidenceDir, 'failure.json'), { ok: false, error: String(error?.stack ?? error), steps, state });
    throw error;
  } finally {
    await closeBrowser();
    if (localServer?.listening) await bounded(() => new Promise(resolveClose => localServer.close(resolveClose)), 5_000, 'Owned fixture server shutdown').catch(() => {});
    if (failure) await persist();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) { console.log(HELP); process.exit(0); }
  const root = option(args, '--root');
  const plan = option(args, '--plan');
  const previousRoot = option(args, '--previous-root');
  const previousPlan = option(args, '--previous-plan');
  if (Boolean(previousRoot) !== Boolean(previousPlan) || (previousRoot && (!root || !plan))) throw new Error('Whole-version rehearsal requires --root/--plan for the new release and --previous-root/--previous-plan for the old release');
  const evidence = option(args, '--evidence');
  const browserExecutable = option(args, '--browser-executable');
  const totalTimeout = Number(option(args, '--timeout-ms') ?? DEFAULT_TOTAL_MS);
  const stepTimeout = Number(option(args, '--step-timeout-ms') ?? DEFAULT_STEP_MS);
  if (!Number.isFinite(totalTimeout) || totalTimeout < 1_000 || !Number.isFinite(stepTimeout) || stepTimeout < 250) throw new Error('Timeouts must be positive finite milliseconds');
  let server = null;
  let switchRelease = null;
  let origin;
  if (root) {
    if (!plan) throw new Error('--plan is required with --root');
    const activeRoot = previousRoot ?? root;
    const activePlan = previousPlan ?? plan;
    const served = await createPwaServer({ root: resolve(activeRoot), plan: resolve(activePlan) });
    server = served.server;
    origin = served.origin;
    if (previousRoot) switchRelease = () => served.switchRelease(resolve(root), resolve(plan));
  } else if (option(args, '--origin')) origin = checkOrigin(option(args, '--origin'), args.includes('--approve-external-origin'));
  else throw new Error('--origin or --root is required');
  try {
    const result = await runSmoke({ origin, evidence, totalTimeout, stepTimeout, playwrightModule: option(args, '--playwright-module'), browserExecutable, server, switchRelease, plan: previousPlan ? resolve(previousPlan) : plan ? resolve(plan) : null, newPlan: plan ? resolve(plan) : null, approveExternal: args.includes('--approve-external-origin') });
    console.log(JSON.stringify(result));
  } catch (error) {
    if (server?.listening) await new Promise(resolveClose => server.close(resolveClose));
    console.error(`PWA smoke failed: ${error.message}`); process.exitCode = 1;
  }
}
