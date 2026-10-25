import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import { ActiveTimerService } from './active-timer.service';
import { SleepForecastService } from './sleep-forecast.service';
import { sleepCycleId } from '../models/sleep-assistant.models';
import type { SleepRoutine } from '../models/sleep-routine.models';

const wake = { id: '11111111-1111-4111-8111-111111111111', at: '2026-10-24T08:00:00.000Z' };
const routine: SleepRoutine = { version: 1, timeZone: 'UTC', nightStartFrom: '20:00', nightStartTo: '21:00', daytimeNaps: 3,
  dayPreparationMinutes: 10, nightPreparationMinutes: 20, assistantEnabled: true };
const device = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
async function load() { const storage = TestBed.inject(StorageService); await storage.ready(); return storage; }
function plan() { return TestBed.inject(SleepForecastService).forecast(); }
describe('Preparation and sleep identity at the durable transaction boundary', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-10-24T08:30:00Z');
    TestBed.configureTestingModule({}); await Preferences.remove({ key: 'baby-tracker.v1' });
    const storage = await load();
    await storage.saveProfile({ id: 'baby', name: 'Synthetic', birthDate: '2026-06-01', dueDate: '2026-06-01', gender: 'girl' });
    await storage.saveSleepRoutine(routine); await storage.saveConfirmedWake(wake);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it('persists preparation without sleep; atomically links once across reload, duplicate taps and pauses', async () => {
    let storage = await load();
    const original = plan();
    await Promise.all([storage.beginSleepPreparation(original), storage.beginSleepPreparation(original)]);
    expect(storage.sleepPreparations()).toHaveLength(1); expect(storage.activeTimers().sleepTimer).toBeNull(); expect(storage.events()).toEqual([]);
    const prep = storage.sleepPreparations()[0];
    TestBed.resetTestingModule(); TestBed.configureTestingModule({}); storage = await load();
    expect(storage.sleepPreparations()[0]).toEqual(prep);
    vi.setSystemTime('2026-10-24T08:40:00Z');
    await Promise.all([storage.completeSleepPreparation(prep.id, prep.preparationId, false), storage.completeSleepPreparation(prep.id, prep.preparationId, false)]);
    expect(storage.activeTimers().sleepTimer).toMatchObject({ id: prep.id, startedAt: '2026-10-24T08:40:00.000Z' });
    const timers = TestBed.inject(ActiveTimerService);
    vi.setSystemTime('2026-10-24T08:50:00Z'); await timers.pauseSleep();
    expect(plan().state).toBe('sleeping'); expect(storage.activeTimers().sleepTimer!.id).toBe(prep.id);
    vi.setSystemTime('2026-10-24T09:00:00Z'); await timers.resumeSleep();
    vi.setSystemTime('2026-10-24T09:10:00Z'); await Promise.all([timers.stopSleep(), timers.stopSleep()]);
    expect(storage.events()).toEqual([expect.objectContaining({ id: prep.id, startTime: '2026-10-24T08:40:00.000Z', endTime: '2026-10-24T09:10:00.000Z',
      pauses: [{ startTime: '2026-10-24T08:50:00.000Z', endTime: '2026-10-24T09:00:00.000Z' }] })]);
    expect(storage.sleepPreparations()[0].state).toBe('completed');
    expect(plan().anchor?.id).toBe(`sleep:${prep.id}`);
    await storage.completeSleepPreparation(prep.id, prep.preparationId, false);
    expect(storage.activeTimers().sleepTimer).toBeNull();
  });
  it('leaves no partial link on failed persistence and invalidates edited/deleted anchors and cancelled sleep', async () => {
    const storage = await load(); await storage.beginSleepPreparation(plan()); const prep = storage.sleepPreparations()[0];
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
    await expect(storage.completeSleepPreparation(prep.id, prep.preparationId, false)).rejects.toThrow('disk full');
    expect(storage.sleepPreparations()[0].state).toBe('preparing'); expect(storage.activeTimers().sleepTimer).toBeNull();
    await storage.saveConfirmedWake({ ...wake, at: '2026-10-24T08:05:00.000Z' });
    expect(storage.sleepPreparations()[0].state).toBe('cancelled');
    await expect(storage.completeSleepPreparation(prep.id, prep.preparationId, false)).rejects.toThrow();
    await storage.beginSleepPreparation(plan()); const next = storage.sleepPreparations()[0];
    await storage.completeSleepPreparation(next.id, next.preparationId, false); await TestBed.inject(ActiveTimerService).cancelSleep();
    expect(storage.sleepPreparations()[0].state).toBe('cancelled'); expect(storage.events()).toEqual([]);
    await storage.beginSleepPreparation(plan()); await storage.deleteConfirmedWake(wake.id);
    expect(storage.sleepPreparations()[0].state).toBe('cancelled'); expect(plan().state).toBe('unknown');
  });
  it('rejects stale/overdue actions and persists suppression by cycle, not changing routine revision', async () => {
    let storage = await load(); const old = plan(); await storage.suppressSleepCycle(old);
    await storage.saveSleepRoutine({ ...routine, dayPreparationMinutes: 15 });
    await expect(storage.beginSleepPreparation(old)).rejects.toThrow('изменился');
    expect(storage.sleepCycleSuppressions()).toHaveLength(1);
    TestBed.resetTestingModule(); TestBed.configureTestingModule({}); storage = await load();
    expect(storage.sleepCycleSuppressions()[0].anchorId).toBe(`wake:${wake.id}`);
    vi.setSystemTime('2026-10-24T11:00:00Z');
    await expect(storage.beginSleepPreparation(plan())).rejects.toThrow('просрочен');
    expect(storage.confirmedWakes()).toEqual([wake]); expect(storage.activeTimers().sleepTimer).toBeNull();
  });
  it('uses one shared cycle register and sleep ID for competing parents, preserves outbox edits and rejects late scope replies', async () => {
    const storage = await load(); await storage.configureSupabaseSync('family'); await storage.beginSleepPreparation(plan());
    const local = storage.sleepPreparations()[0], sent = structuredClone(storage.supabaseCheckpoint()!.pending);
    expect(local.id).toBe(await sleepCycleId('family', `wake:${wake.id}`));
    const remote = { ...local, preparationId: '22222222-2222-4222-8222-222222222222', startedAt: '2026-10-24T08:31:00.000Z', state: 'completed' as const,
      sleepEventId: local.id, completedAt: '2026-10-24T08:35:00.000Z' };
    const entries = { [`preparation:${local.id}`]: { revision: Date.now() + 1000, device, value: remote },
      sleepTimer: { revision: Date.now() + 1000, device, value: { id: local.id, startedAt: remote.completedAt, isNightSleep: false } } };
    await storage.mergeSupabase('family', 0, sent, { version: 1, entries });
    expect(storage.sleepPreparations()).toEqual([remote]);
    await expect(storage.completeSleepPreparation(local.id, local.preparationId, false)).rejects.toThrow('изменилась');
    await TestBed.inject(ActiveTimerService).stopSleep();
    await storage.mergeSync({ scope: 'family', entries });
    expect(storage.activeTimers().sleepTimer).toBeNull(); expect(storage.events().map(event => event.id)).toEqual([local.id]);
    await storage.deleteEvent(local.id);
    await storage.mergeSync({ scope: 'family', entries });
    expect(storage.sleepPreparations()[0].state).toBe('cancelled'); expect(storage.events()).toEqual([]);
    await storage.configureSupabaseSync('other');
    await storage.mergeSupabase('family', 1, {}, { version: 2, entries });
    expect(storage.supabaseCheckpoint()!.scope).toBe('other'); expect(storage.activeTimers().sleepTimer).toBeNull();
  });
  it('durably cancels remote invalidation so re-enabling the assistant cannot resurrect preparation', async () => {
    const storage = await load(); await storage.configureSupabaseSync('family'); await storage.beginSleepPreparation(plan());
    const prep = storage.sleepPreparations()[0], sent = structuredClone(storage.supabaseCheckpoint()!.pending);
    const revision = Date.now() + 1000;
    await storage.mergeSupabase('family', 0, sent, { version: 1, entries: {
      sleepRoutine: { revision, device, value: { ...routine, assistantEnabled: false } },
    } });
    expect(storage.sleepPreparations()[0].state).toBe('cancelled');
    await storage.mergeSync({ scope: 'family', entries: {
      sleepRoutine: { revision: revision + 2000, device, value: routine },
    } });
    expect(storage.sleepPreparations()[0].state).toBe('cancelled');
    expect(storage.supabaseCheckpoint()!.pending[`preparation:${prep.id}`].value).toMatchObject({ state: 'cancelled' });
  });

  it('imports all legacy diary versions with assistant off, keeps completed facts and cancels active preparation', async () => {
    const storage = await load(); await storage.beginSleepPreparation(plan()); await storage.suppressSleepCycle(plan());
    const backup = JSON.parse(await storage.exportBackup());
    await storage.importBackup(JSON.stringify(backup));
    expect(storage.sleepPreparations()[0].state).toBe('cancelled'); expect(storage.sleepRoutine()!.assistantEnabled).toBe(false);
    await storage.saveSleepRoutine(routine); await storage.beginSleepPreparation(plan());
    const prep = storage.sleepPreparations()[0]; await storage.completeSleepPreparation(prep.id, prep.preparationId, false);
    vi.setSystemTime('2026-10-24T08:45:00Z'); await TestBed.inject(ActiveTimerService).stopSleep();
    const completed = storage.sleepPreparations()[0], completedBackup = await storage.exportBackup();
    await storage.importBackup(completedBackup);
    expect(storage.sleepPreparations()).toEqual([completed]); expect(storage.events()[0].id).toBe(prep.id);
    for (const version of [1, 2, 3]) {
      const legacy = { ...backup, version }; delete legacy.sleepPreparations; delete legacy.sleepCycleSuppressions;
      await storage.importBackup(JSON.stringify(legacy));
      expect(storage.confirmedWakes()).toEqual([wake]); expect(storage.sleepPreparations()).toEqual([]); expect(storage.sleepRoutine()!.assistantEnabled).toBe(false);
    }
  });
});
