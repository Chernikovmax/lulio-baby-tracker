import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import type { SyncDocument } from '../models/sync.models';

const scope = 'https://example.supabase.co/11111111-1111-4111-8111-111111111111';
const feeding = { id: 'bottle', type: 'bottle' as const, content: 'formula' as const, volumeMl: 90, startTime: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };

async function device(): Promise<StorageService> {
  const storage = TestBed.runInInjectionContext(() => new StorageService());
  await storage.ready();
  await storage.configureSync(scope);
  return storage;
}

describe('Устойчивое семейное хранилище', () => {
  beforeEach(async () => {
    TestBed.configureTestingModule({});
    await Preferences.remove({ key: 'baby-tracker.v1' });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('объединяет независимые изменения, передаёт удаление и не воскрешает устаревшую запись', async () => {
    const first = await device();
    const second = await device();
    await first.saveEvent(feeding);
    await second.update(data => ({ ...data, activeTimers: { ...data.activeTimers, sleepTimer: { startedAt: '2026-10-20T12:05:00Z', isNightSleep: true } } }));
    const firstOffline = structuredClone(first.syncDocument()!);
    const secondOffline = structuredClone(second.syncDocument()!);
    await first.mergeSync(secondOffline);
    await second.mergeSync(firstOffline);
    expect(first.events()).toEqual([feeding]);
    expect(second.events()).toEqual([feeding]);
    expect(first.activeTimers().sleepTimer).toEqual(second.activeTimers().sleepTimer);
    expect(first.activeTimers().sleepTimer?.isNightSleep).toBe(true);
    await first.deleteEvent(feeding.id);
    await second.mergeSync(first.syncDocument()!);
    await second.mergeSync(firstOffline);
    expect(second.events()).toEqual([]);
  });

  it('сохраняет офлайн-журнал вместе с таймером, переживает перезапуск и не публикует неудачную запись', async () => {
    let storage = await device();
    await storage.update(data => ({ ...data, activeTimers: { ...data.activeTimers, breastTimer: {
      startedAt: '2026-10-20T12:00:00Z', activeSide: 'right', currentSideStartedAt: '2026-10-20T12:00:01Z',
      accumulatedLeftSec: 1, accumulatedRightSec: 0, lastActiveSide: 'right',
    } } }));
    const pending = structuredClone(storage.syncDocument());
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    storage = TestBed.inject(StorageService);
    await storage.ready();
    expect(storage.activeTimers().breastTimer?.activeSide).toBe('right');
    expect(storage.syncDocument()).toEqual(pending);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Нет места'); });
    await expect(storage.saveEvent(feeding)).rejects.toThrow('Нет места');
    expect(storage.events()).toEqual([]);
    expect(storage.syncDocument()).toEqual(pending);
  });

  it('разрешает конфликт таймера детерминированно, не затирает локальную правку запоздалым ответом и изолирует семьи', async () => {
    const storage = await device();
    await storage.saveEvent(feeding);
    const stale = structuredClone(storage.syncDocument()!);
    await storage.saveEvent({ ...feeding, volumeMl: 120 });
    await storage.mergeSync(stale);
    expect(storage.events()[0]).toMatchObject({ volumeMl: 120 });
    const remote: SyncDocument = { scope, entries: { sleepTimer: {
      revision: 100, device: 'ffffffff-ffff-4fff-bfff-ffffffffffff', value: { startedAt: '2026-10-20T12:00:00Z', isNightSleep: true },
    } } };
    await storage.mergeSync(remote);
    await storage.mergeSync({ scope, entries: { sleepTimer: { revision: 100, device: '00000000-0000-4000-8000-000000000000', value: null } } });
    expect(storage.activeTimers().sleepTimer?.isNightSleep).toBe(true);
    await storage.mergeSync({ ...remote, scope: 'другая семья', entries: { sleepTimer: { ...remote.entries['sleepTimer'], revision: 999, value: null } } });
    expect(storage.activeTimers().sleepTimer?.isNightSleep).toBe(true);
  });

  it('импорт резервной копии реплицирует удаление старых событий и атомарную замену таймеров без переноса настроек доступа', async () => {
    const first = await device();
    const second = await device();
    await first.saveEvent(feeding);
    await second.mergeSync(first.syncDocument()!);
    await first.importBackup(JSON.stringify({ version: 1, exportedAt: '2026-10-20T12:00:00Z', profile: null, events: [], activeTimers: { sleepTimer: { startedAt: '2026-10-20T12:00:00Z', isNightSleep: false }, breastTimer: null } }));
    await second.mergeSync(first.syncDocument()!);
    expect(second.events()).toEqual([]);
    expect(second.activeTimers().sleepTimer?.isNightSleep).toBe(false);
    const backup = JSON.parse(await first.exportBackup());
    expect(backup).not.toHaveProperty('sync');
  });
});
