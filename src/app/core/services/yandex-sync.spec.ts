import { EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import { SyncService } from './sync.service';
import { YandexAuthService } from './yandex-auth.service';
import { YandexSyncService } from './yandex-sync.service';
import { YANDEX_CONFIG_KEY, YANDEX_MARKER, yandexScope, type YandexPacket } from '../models/yandex-sync.models';
import { sleepBoundary, type HistoryAssertion } from '../models/sleep-history.models';
import type { SleepEvent } from '../models/tracker.models';
import { calculateSleepForecast } from './sleep-forecast';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => undefined },
}));
vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { request: async () => ({ status: 500, data: null, headers: {}, url: '' }) },
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: () => ({}),
}));

const familyId = '11111111-1111-4111-8111-111111111111';
const settings = { clientId: 'a'.repeat(32), folderPath: '/Семья', familyId };
const bottle = { id: 'bottle', type: 'bottle' as const, content: 'formula' as const, volumeMl: 90,
  startTime: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };

describe('Ручной обмен через семейную папку', () => {
  let disk: Map<string, unknown>;
  let activePreferences: Map<string, string>;
  let failUpload: boolean;
  let afterUpload: (() => Promise<void>) | undefined;
  let injectors: EnvironmentInjector[];
  const supabaseConfig = signal({ enabled: false });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    injectors = []; disk = new Map(); activePreferences = new Map(); failUpload = false;
    afterUpload = undefined; supabaseConfig.set({ enabled: false });
    vi.spyOn(Preferences, 'get').mockImplementation(async ({ key }) => ({ value: activePreferences.get(key) ?? null }));
    vi.spyOn(Preferences, 'set').mockImplementation(async ({ key, value }) => { activePreferences.set(key, value); });
    vi.spyOn(CapacitorHttp, 'request').mockImplementation(async (options: HttpOptions): Promise<HttpResponse> => {
      const url = new URL(options.url);
      const path = options.params?.['path'] as string | undefined ?? url.searchParams.get('path') ?? '';
      const reply = (status: number, data: unknown): HttpResponse => ({ status, data, headers: {}, url: options.url });
      if (url.hostname === 'cloud-api.yandex.net') {
        if (url.pathname.endsWith('/download')) {
          return disk.has(path) ? reply(200, { href: `https://transfer.yandex.net/download?path=${encodeURIComponent(path)}` }) : reply(404, {});
        }
        if (url.pathname.endsWith('/upload')) {
          return disk.has(path) ? reply(409, {}) : reply(200, { href: `https://transfer.yandex.net/upload?path=${encodeURIComponent(path)}` });
        }
        if (path !== '/Семья') return reply(404, {});
        if (!options.params?.['offset']) return reply(200, { type: 'dir', path });
        const files = [...disk.keys()].sort().map(key => ({ name: key.slice(key.lastIndexOf('/') + 1), path: key, type: 'file' }));
        const offset = Number(options.params['offset']);
        return reply(200, { type: 'dir', _embedded: { items: files.slice(offset, offset + 2), total: files.length } });
      }
      if (url.pathname === '/download') return disk.has(path) ? reply(200, JSON.stringify(disk.get(path))) : reply(404, {});
      if (url.pathname === '/upload') {
        if (failUpload) return reply(503, {});
        if (disk.has(path)) return reply(409, {});
        disk.set(path, structuredClone(options.data));
        if (afterUpload) { const action = afterUpload; afterUpload = undefined; await action(); }
        return reply(201, '');
      }
      return reply(500, {});
    });
  });
  afterEach(() => { injectors.forEach(injector => injector.destroy()); TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.useRealTimers(); });

  async function device(saved = new Map<string, string>()) {
    activePreferences = saved;
    const injector = createEnvironmentInjector([
      StorageService, YandexSyncService,
      { provide: SyncService, useValue: { config: supabaseConfig, ready: async () => undefined } },
      { provide: YandexAuthService, useValue: { clientId: () => settings.clientId, token: async () => 'test-session', disconnect: async () => undefined } },
    ], TestBed.inject(EnvironmentInjector));
    injectors.push(injector);
    const storage = injector.get(StorageService);
    const sync = injector.get(YandexSyncService);
    await storage.ready(); await sync.ready();
    return {
      storage, sync, saved,
      async run(action: () => Promise<void>) { activePreferences = saved; await action(); },
    };
  }

  it('передаёт режим, принимает историю v1 и сохраняет явную смену пояса у второго родителя', async () => {
    const routine = { version: 1 as const, timeZone: 'Europe/Moscow', nightStartFrom: '23:00', nightStartTo: '01:00',
      daytimeNaps: 2, dayPreparationMinutes: 15, nightPreparationMinutes: 30, assistantEnabled: false };
    const first = await device();
    await first.run(() => first.sync.connect(settings));
    await first.run(() => first.storage.saveSleepRoutine(routine));
    disk.set(`/Семья/baby-tracker-${familyId}-00000000-0000-4000-8000-000000000000.json`, {
      format: 'baby-tracker-sync', version: 1, familyId, document: { scope: yandexScope(familyId),
        entries: { 'event:bottle': { revision: 1, device: '00000000-0000-4000-8000-000000000000', value: bottle } } },
    });
    await first.run(() => first.sync.synchronize());
    const second = await device();
    await second.run(() => second.sync.connect(settings));
    await second.run(() => second.sync.synchronize());
    expect(second.sync.error()).toBe('');
    expect(second.storage.sleepRoutine()).toEqual(routine);
    expect(second.storage.events()).toEqual([bottle]);
    await second.run(() => second.storage.saveSleepRoutine({ ...routine, timeZone: 'America/New_York', assistantEnabled: true }));
    await second.run(() => second.sync.synchronize());
    await first.run(() => first.sync.synchronize());
    expect(first.storage.sleepRoutine()).toEqual({ ...routine, timeZone: 'America/New_York', assistantEnabled: true });
    const restarted = await device(first.saved);
    expect(restarted.storage.sleepRoutine()).toEqual(first.storage.sleepRoutine());
    const packets = [...disk.values()].filter((value): value is YandexPacket =>
      typeof value === 'object' && value !== null && 'format' in value && value.format === 'baby-tracker-sync');
    for (const packet of packets) {
      expect(packet.document.entries).not.toHaveProperty('profile');
      expect(packet.document.entries).not.toHaveProperty('deviceReminderSettings');
      expect(packet.document.entries).not.toHaveProperty('pushSubscription');
    }
  });

  it('обменивается подтверждениями пробуждения и полноты с удалениями и сохраняет их после перезапуска', async () => {
    const first = await device(); await first.run(() => first.sync.connect(settings));
    const night: SleepEvent = { id: 'night', type: 'sleep', startTime: '2026-01-01T00:00:00Z',
      endTime: '2026-01-01T06:00:00Z', updatedAt: '2026-01-01T06:00:00Z', isNightSleep: true };
    const nap: SleepEvent = { ...night, id: 'nap', startTime: '2026-01-01T08:00:00Z', endTime: '2026-01-01T09:00:00Z', isNightSleep: false };
    const wake = { id: '22222222-2222-4222-8222-222222222222', at: '2026-01-01T10:00:00Z' };
    const assertion: HistoryAssertion = { id: '33333333-3333-4333-8333-333333333333', startAt: night.endTime,
      endAt: nap.startTime, status: 'complete', boundaries: [sleepBoundary(night), sleepBoundary(nap)] };
    await first.run(() => first.storage.saveEvent(night)); await first.run(() => first.storage.saveEvent(nap));
    await first.run(() => first.storage.saveConfirmedWake(wake)); await first.run(() => first.storage.saveHistoryAssertion(assertion));
    await first.run(() => first.sync.synchronize());
    const second = await device(); await second.run(() => second.sync.connect(settings)); await second.run(() => second.sync.synchronize());
    expect(second.storage.confirmedWakes()).toEqual([wake]); expect(second.storage.historyAssertions()).toEqual([assertion]);
    await second.run(() => second.storage.saveConfirmedWake({ ...wake, at: '2026-01-01T11:00:00Z' }));
    await second.run(() => second.storage.saveHistoryAssertion({ ...assertion, status: 'incomplete' }));
    await second.run(() => second.sync.synchronize()); await first.run(() => first.sync.synchronize());
    expect(first.storage.confirmedWakes()).toEqual([{ ...wake, at: '2026-01-01T11:00:00Z' }]);
    expect(first.storage.historyAssertions()[0].status).toBe('incomplete');
    await first.run(() => first.storage.deleteConfirmedWake(wake.id)); await first.run(() => first.storage.deleteHistoryAssertion(assertion.id));
    await first.run(() => first.sync.synchronize()); await second.run(() => second.sync.synchronize());
    const restarted = await device(second.saved);
    expect(restarted.storage.confirmedWakes()).toEqual([]); expect(restarted.storage.historyAssertions()).toEqual([]);
    expect(restarted.storage.events()).toEqual(expect.arrayContaining([night, nap]));
  });

  it('transfers real preparation without sleep, links on the other parent and retains invalidation across restart', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-10-24T08:30:00Z');
    const first = await device(); await first.run(() => first.sync.connect(settings));
    await first.run(() => first.storage.saveProfile({ id: 'baby', name: 'Synthetic', birthDate: '2026-06-01', dueDate: '2026-06-01', gender: 'girl' }));
    await first.run(() => first.storage.saveSleepRoutine({ version: 1, timeZone: 'UTC', nightStartFrom: '20:00', nightStartTo: '21:00',
      daytimeNaps: 3, dayPreparationMinutes: 10, nightPreparationMinutes: 20, assistantEnabled: true }));
    const wake = { id: '22222222-2222-4222-8222-222222222222', at: '2026-10-24T08:00:00.000Z' };
    await first.run(() => first.storage.saveConfirmedWake(wake));
    const plan = calculateSleepForecast({ profile: first.storage.profile(), events: [], activeTimers: first.storage.activeTimers(),
      sleepRoutine: first.storage.sleepRoutine(), confirmedWakes: [wake], historyAssertions: [],
      scope: yandexScope(familyId), importGeneration: 0, journal: first.storage.syncDocument() }, Date.now());
    await first.run(() => first.storage.beginSleepPreparation(plan)); await first.run(() => first.storage.suppressSleepCycle(plan));
    const prep = first.storage.sleepPreparations()[0];
    await first.run(() => first.sync.synchronize());
    const second = await device(); await second.run(() => second.sync.connect(settings)); await second.run(() => second.sync.synchronize());
    expect(second.storage.sleepPreparations()).toEqual([prep]); expect(second.storage.activeTimers().sleepTimer).toBeNull();
    expect(second.storage.sleepCycleSuppressions()[0].anchorId).toBe(plan.anchor!.id);
    await second.run(() => second.storage.completeSleepPreparation(prep.id, prep.preparationId, false));
    await second.run(() => second.sync.synchronize()); await first.run(() => first.sync.synchronize());
    expect(first.storage.activeTimers().sleepTimer).toMatchObject({ id: prep.id });
    expect(first.storage.sleepPreparations()[0]).toMatchObject({ state: 'completed', sleepEventId: prep.id });
    await first.run(() => first.storage.deleteConfirmedWake(wake.id));
    await first.run(() => first.sync.synchronize()); await second.run(() => second.sync.synchronize());
    const restarted = await device(second.saved);
    expect(restarted.storage.sleepPreparations()[0].state).toBe('cancelled');
    expect(restarted.storage.confirmedWakes()).toEqual([]);
  });

  it('передаёт офлайн-события, изменения, удаления и незавершённый сон без дублей после повторных обменов', async () => {
    const first = await device();
    await first.run(() => first.sync.connect(settings));
    await first.run(() => first.storage.saveEvent(bottle));
    const second = await device();
    await second.run(() => second.sync.connect(settings));
    await second.run(() => second.storage.update(data => ({ ...data, activeTimers: {
      ...data.activeTimers, sleepTimer: { startedAt: '2026-10-20T12:05:00Z', isNightSleep: true },
    } })));
    await first.run(() => first.sync.synchronize());
    await second.run(() => second.sync.synchronize());
    await first.run(() => first.sync.synchronize());
    expect(first.sync.error()).toBe(''); expect(second.sync.error()).toBe('');
    expect(second.storage.events()).toEqual([bottle]);
    expect(first.storage.activeTimers().sleepTimer).toEqual({ startedAt: '2026-10-20T12:05:00Z', isNightSleep: true });
    await second.run(() => second.storage.saveEvent({ ...bottle, volumeMl: 120 }));
    await second.run(() => second.sync.synchronize());
    await first.run(() => first.sync.synchronize());
    expect(first.storage.events()).toEqual([{ ...bottle, volumeMl: 120 }]);
    await first.run(() => first.storage.deleteEvent(bottle.id));
    await first.run(() => first.sync.synchronize());
    await second.run(() => second.sync.synchronize());
    await second.run(() => second.sync.synchronize());
    expect(second.storage.events()).toEqual([]);
    expect(second.sync.pending()).toBe(false);
    expect(second.sync.config().lastSyncAt).not.toBe('');
    const restarted = await device(second.saved);
    expect(restarted.storage.events()).toEqual([]);
    expect(restarted.storage.activeTimers().sleepTimer?.isNightSleep).toBe(true);
  });

  it('не применяет часть пакетов, если следующий повреждён, и не подтверждает неуспешный обмен', async () => {
    const parent = await device();
    await parent.run(() => parent.sync.connect(settings));
    const valid: YandexPacket = { format: 'baby-tracker-sync', version: 1, familyId, document: {
      scope: yandexScope(familyId), entries: { 'event:bottle': { revision: 10, device: crypto.randomUUID(), value: bottle } },
    } };
    disk.set(`/Семья/baby-tracker-${familyId}-00000000-0000-4000-8000-000000000000.json`, valid);
    disk.set(`/Семья/baby-tracker-${familyId}-ffffffff-ffff-4fff-bfff-ffffffffffff.json`, { ...valid, version: 999 });
    await parent.run(() => parent.sync.synchronize());
    expect(parent.sync.error()).toContain('повреждён');
    expect(parent.storage.events()).toEqual([]);
    expect(parent.sync.config().lastSyncAt).toBe('');
    expect(parent.sync.config().processed).toEqual([]);
  });

  it('сохраняет неотправленное после ошибки и перезапуска, а правку во время загрузки оставляет ожидающей', async () => {
    let parent = await device();
    await parent.run(() => parent.sync.connect(settings));
    await parent.run(() => parent.storage.saveEvent(bottle));
    failUpload = true;
    await parent.run(() => parent.sync.synchronize());
    expect(parent.sync.error()).not.toBe('');
    expect(parent.sync.config().lastSyncAt).toBe('');
    const saved = parent.saved;
    parent = await device(saved);
    expect(parent.sync.pending()).toBe(true);
    expect(parent.storage.events()).toEqual([bottle]);
    failUpload = false;
    afterUpload = () => parent.storage.saveEvent({ ...bottle, volumeMl: 150 });
    await parent.run(() => parent.sync.synchronize());
    expect(parent.sync.pending()).toBe(true);
    expect(parent.storage.events()).toEqual([{ ...bottle, volumeMl: 150 }]);
    await parent.run(() => parent.sync.synchronize());
    expect(parent.sync.pending()).toBe(false);
    const peer = await device();
    await peer.run(() => peer.sync.connect(settings));
    await peer.run(() => peer.sync.synchronize());
    expect(peer.storage.events()).toEqual([{ ...bottle, volumeMl: 150 }]);
  });

  it('повторный запрос обновления ждёт подтверждения уже выполняющейся отправки', async () => {
    const parent = await device();
    await parent.run(() => parent.sync.connect(settings));
    await parent.run(() => parent.storage.saveEvent(bottle));
    let release!: () => void;
    const upload = new Promise<void>(resolve => { release = resolve; });
    let uploading = false;
    afterUpload = async () => { uploading = true; await upload; };
    const first = parent.run(() => parent.sync.synchronize());
    await vi.waitFor(() => { expect(uploading).toBe(true); });
    let completed = false;
    const second = parent.run(() => parent.sync.synchronize()).then(() => { completed = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(parent.sync.pending()).toBe(true);
    release();
    await Promise.all([first, second]);
    expect(parent.sync.pending()).toBe(false);
    expect(parent.sync.busy()).toBe(false);
    expect(parent.sync.error()).toBe('');
  });

  it('при повторном подключении заново созданной папки публикует историю, а не использует старое подтверждение', async () => {
    const parent = await device();
    await parent.run(() => parent.sync.connect(settings));
    await parent.run(() => parent.storage.saveEvent(bottle));
    await parent.run(() => parent.sync.synchronize());
    await parent.run(() => parent.sync.disconnect());
    disk.clear();
    await parent.run(() => parent.sync.connect(settings));
    await parent.run(() => parent.sync.synchronize());
    const peer = await device();
    await peer.run(() => peer.sync.connect(settings));
    await peer.run(() => peer.sync.synchronize());
    expect(peer.storage.events()).toEqual([bottle]);
  });

  it('отказывается подключать чужой дневник и не включает Диск поверх Supabase', async () => {
    const parent = await device();
    disk.set(`/Семья/${YANDEX_MARKER}`, { format: 'baby-tracker-family', version: 1, familyId: crypto.randomUUID() });
    await parent.run(() => parent.sync.connect(settings));
    expect(parent.sync.config().enabled).toBe(false);
    expect(parent.sync.error()).toContain('другой идентификатор');
    expect(parent.saved.has(YANDEX_CONFIG_KEY)).toBe(false);
    supabaseConfig.set({ enabled: true });
    await parent.run(() => parent.sync.connect(settings));
    expect(parent.sync.error()).toContain('отключите');
  });
});
