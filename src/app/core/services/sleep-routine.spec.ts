import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import type { SleepRoutine } from '../models/sleep-routine.models';

const routine: SleepRoutine = { version: 1, timeZone: 'Europe/Moscow', nightStartFrom: '23:00', nightStartTo: '01:00',
  daytimeNaps: 3, dayPreparationMinutes: 10, nightPreparationMinutes: 25, assistantEnabled: true };
const event = { id: 'old-sleep', type: 'sleep' as const, startTime: '2026-10-23T19:00:00Z', endTime: '2026-10-24T05:00:00Z',
  updatedAt: '2026-10-24T05:00:00Z', isNightSleep: true, pauses: [{ startTime: '2026-10-23T23:00:00Z', endTime: '2026-10-23T23:10:00Z' }] };
const legacy = { profile: { id: 'baby', name: 'Synthetic', birthDate: '2026-06-01', dueDate: '2026-06-01', gender: 'girl' },
  events: [event], activeTimers: { sleepTimer: { startedAt: '2026-10-24T08:00:00Z', isNightSleep: false, pausedAt: '2026-10-24T08:10:00Z' },
    breastTimer: { startedAt: '2026-10-24T08:01:00Z', activeSide: 'left', currentSideStartedAt: '2026-10-24T08:02:00Z',
      accumulatedLeftSec: 20, accumulatedRightSec: 0, lastActiveSide: 'left' } } };
const scope = 'synthetic-family';
const device = '11111111-1111-4111-8111-111111111111';

async function load(): Promise<StorageService> {
  const storage = TestBed.inject(StorageService);
  await storage.ready();
  return storage;
}

describe('Индивидуальный режим: хранение, миграция и резервирование', () => {
  beforeEach(async () => { TestBed.configureTestingModule({}); await Preferences.remove({ key: 'baby-tracker.v1' }); });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('мигрирует старый дневник и курсор без потери событий, пауз, таймеров, удалений и исходящих изменений', async () => {
    const deleted = { revision: 45, device, value: null };
    const sentEvent = { revision: 44, device, value: event };
    const sync = { scope, entries: { 'event:old-sleep': sentEvent, 'event:deleted': deleted } };
    await Preferences.set({ key: 'baby-tracker.v1', value: JSON.stringify({ ...legacy, sync,
      supabase: { scope, version: 7, pending: { 'event:deleted': deleted } } }) });
    const storage = await load();
    expect(storage.profile()).toEqual(legacy.profile);
    expect(storage.events()).toEqual(legacy.events);
    expect(storage.activeTimers()).toMatchObject(legacy.activeTimers);
    expect(storage.sleepRoutine()).toBeNull();
    expect(storage.syncDocument()!.entries['event:deleted']).toEqual(deleted);
    expect(storage.supabaseCheckpoint()).toMatchObject({ version: 7, pending: { 'event:deleted': deleted,
      sleepRoutine: { revision: 0, value: null } } });
    const saved = JSON.parse((await Preferences.get({ key: 'baby-tracker.v1' })).value!);
    expect(saved.sleepRoutine).toBeNull();
    expect(saved.events).toEqual(legacy.events);
  });

  it('сохраняет переход через полночь и явно выбранный пояс после перезапуска, не следуя поездке', async () => {
    let storage = await load();
    await storage.saveSleepRoutine(routine);
    TestBed.resetTestingModule(); TestBed.configureTestingModule({});
    storage = await load();
    expect(storage.sleepRoutine()).toEqual(routine);
    await storage.saveSleepRoutine({ ...routine, timeZone: 'America/New_York', daytimeNaps: 0,
      dayPreparationMinutes: 0, nightPreparationMinutes: 180 });
    expect(JSON.parse(await storage.exportBackup()).sleepRoutine).toEqual({ ...routine, timeZone: 'America/New_York',
      daytimeNaps: 0, dayPreparationMinutes: 0, nightPreparationMinutes: 180 });
  });

  it('принимает прежний JSON v1 и восстанавливает режим без автоматического согласия или настроек устройства', async () => {
    const storage = await load();
    await storage.saveSleepRoutine(routine);
    await storage.importBackup(JSON.stringify({ ...legacy, version: 1, exportedAt: event.updatedAt,
      deviceReminderSettings: { enabled: true }, pushSubscription: { synthetic: true } }));
    expect(storage.sleepRoutine()).toBeNull();
    expect(storage.events()).toEqual(legacy.events);
    expect(storage.activeTimers()).toEqual(legacy.activeTimers);
    await storage.saveSleepRoutine(routine);
    const backup = await storage.exportBackup();
    const exported = JSON.parse(backup);
    expect(exported.profile).toEqual(legacy.profile);
    expect(exported.events).toEqual(legacy.events);
    expect(exported.activeTimers).toEqual(legacy.activeTimers);
    expect(exported.sleepRoutine).toEqual(routine);
    await storage.saveSleepRoutine({ ...routine, timeZone: 'UTC' });
    await storage.importBackup(backup);
    expect(storage.sleepRoutine()).toEqual({ ...routine, assistantEnabled: false });
    expect(storage.activeTimers()).toEqual(legacy.activeTimers);
  });

  it.each([
    { timeZone: '' }, { timeZone: '+03:00' }, { timeZone: 'Europe/Imaginary' },
    { nightStartFrom: '24:00' }, { nightStartTo: '23:00' }, { nightStartTo: '1:00' },
    { daytimeNaps: -1 }, { daytimeNaps: 13 }, { daytimeNaps: 1.5 },
    { dayPreparationMinutes: -1 }, { nightPreparationMinutes: 181 }, { dayPreparationMinutes: 0.5 },
    { assistantEnabled: 'true' }, { version: 2 }, { pushSubscription: { synthetic: true } },
  ])('отклоняет некорректный режим %j до изменения дневника или журнала', async patch => {
    const storage = await load();
    await storage.saveSleepRoutine(routine);
    await storage.configureSupabaseSync(scope);
    const before = (await Preferences.get({ key: 'baby-tracker.v1' })).value;
    await expect(storage.importBackup(JSON.stringify({ ...legacy, version: 2, exportedAt: event.updatedAt,
      sleepRoutine: { ...routine, ...patch } }))).rejects.toThrow('формат');
    await expect(storage.mergeSync({ scope, entries: { sleepRoutine: { revision: 9999999999999, device,
      value: { ...routine, ...patch } } } })).rejects.toThrow('формат');
    expect((await Preferences.get({ key: 'baby-tracker.v1' })).value).toBe(before);
  });

  it('не принимает v2 без поля режима и не публикует неуспешную запись', async () => {
    const storage = await load();
    await expect(storage.importBackup(JSON.stringify({ ...legacy, version: 2, exportedAt: event.updatedAt }))).rejects.toThrow('формат');
    await storage.configureSupabaseSync(scope);
    const before = structuredClone(storage.supabaseCheckpoint());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
    await expect(storage.saveSleepRoutine(routine)).rejects.toThrow('disk full');
    expect(storage.sleepRoutine()).toBeNull();
    expect(storage.supabaseCheckpoint()).toEqual(before);
  });

  it('сохраняет новую локальную ревизию при позднем подтверждении и передаёт сброс режима как tombstone', async () => {
    const storage = await load();
    await storage.configureSupabaseSync(scope);
    await storage.saveSleepRoutine(routine);
    const sent = structuredClone(storage.supabaseCheckpoint()!.pending);
    await storage.saveSleepRoutine({ ...routine, timeZone: 'UTC' });
    await storage.mergeSupabase(scope, 0, sent, { version: 1, entries: sent });
    expect(storage.sleepRoutine()?.timeZone).toBe('UTC');
    expect(storage.supabaseCheckpoint()!.pending['sleepRoutine'].value).toEqual({ ...routine, timeZone: 'UTC' });
    await storage.importBackup(JSON.stringify({ ...legacy, version: 1, exportedAt: event.updatedAt }));
    const deletion = structuredClone(storage.syncDocument()!);
    expect(deletion.entries['sleepRoutine'].value).toBeNull();
    await storage.mergeSync({ scope, entries: sent });
    expect(storage.sleepRoutine()).toBeNull();
    await storage.mergeSync({ ...deletion, scope: 'other-family', entries: { sleepRoutine: {
      revision: Number.MAX_SAFE_INTEGER, device, value: routine } } });
    expect(storage.sleepRoutine()).toBeNull();
  });
});
