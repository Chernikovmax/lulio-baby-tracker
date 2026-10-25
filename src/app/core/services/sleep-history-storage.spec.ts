import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import { sleepBoundary, type HistoryAssertion } from '../models/sleep-history.models';
import type { SleepEvent } from '../models/tracker.models';
const device = '11111111-1111-4111-8111-111111111111';
const before: SleepEvent = { id: 'night', type: 'sleep', startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-01T06:00:00Z', updatedAt: '2026-01-01T06:00:00Z', isNightSleep: true };
const after: SleepEvent = { ...before, id: 'nap', startTime: '2026-01-01T08:00:00Z', endTime: '2026-01-01T09:00:00Z', isNightSleep: false };
const wake = { id: device, at: '2026-01-01T10:00:00Z' };
const assertion: HistoryAssertion = { id: '22222222-2222-4222-8222-222222222222', startAt: before.endTime, endAt: after.startTime,
  status: 'complete', boundaries: [sleepBoundary(before), sleepBoundary(after)] };
describe('Persisted confirmed waking and completeness facts', () => {
  beforeEach(async () => { TestBed.configureTestingModule({}); await Preferences.remove({ key: 'baby-tracker.v1' }); });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  async function load() { const storage = TestBed.inject(StorageService); await storage.ready(); return storage; }
  it('roundtrips facts losslessly, disables restored assistant and invalidates identical-input plans', async () => {
    let storage = await load(); await storage.saveEvent(before); await storage.saveEvent(after);
    await storage.saveConfirmedWake(wake); await storage.saveHistoryAssertion(assertion);
    const backup = await storage.exportBackup();
    TestBed.resetTestingModule(); TestBed.configureTestingModule({}); storage = await load();
    expect(storage.confirmedWakes()).toEqual([wake]); expect(storage.historyAssertions()).toEqual([assertion]);
    await storage.importBackup(backup);
    expect(storage.confirmedWakes()).toEqual([wake]); expect(storage.historyAssertions()).toEqual([assertion]);
    expect(storage.importGeneration()).toBe(1);
    await storage.importBackup(JSON.stringify({ version: 1, exportedAt: before.endTime, profile: null, events: [before],
      activeTimers: { sleepTimer: null, breastTimer: null } }));
    expect(storage.confirmedWakes()).toEqual([]); expect(storage.historyAssertions()).toEqual([]);
    expect(storage.events()).toEqual([before]);
  });
  it('rejects invalid and stale confirmation before writing; edits preserve manual identity', async () => {
    const storage = await load(); await storage.saveEvent(before); await storage.saveEvent(after);
    await expect(storage.saveConfirmedWake({ ...wake, at: '2999-01-01T10:00:00Z' })).rejects.toThrow();
    await expect(storage.saveConfirmedWake({ ...wake, at: '2026-01-01T01:00:00Z' })).rejects.toThrow('внутрь');
    await storage.saveConfirmedWake(wake); await storage.saveConfirmedWake({ ...wake, at: '2026-01-01T11:00:00Z' });
    expect(storage.confirmedWakes()).toEqual([{ ...wake, at: '2026-01-01T11:00:00Z' }]);
    await storage.saveEvent({ ...before, endTime: '2026-01-01T06:30:00Z' });
    await expect(storage.saveHistoryAssertion(assertion)).rejects.toThrow('Границы');
    expect(storage.historyAssertions()).toEqual([]);
    const snapshot = (await Preferences.get({ key: 'baby-tracker.v1' })).value;
    const invalid = JSON.parse(await storage.exportBackup()); invalid.confirmedWakes[0].pushSubscription = {};
    await expect(storage.importBackup(JSON.stringify(invalid))).rejects.toThrow('формат');
    expect((await Preferences.get({ key: 'baby-tracker.v1' })).value).toBe(snapshot);
  });
  it('replicates per-fact deletions, protects in-flight edits and ignores old scope replies', async () => {
    const storage = await load(); await storage.configureSupabaseSync('first');
    await storage.saveEvent(before); await storage.saveEvent(after); await storage.saveConfirmedWake(wake); await storage.saveHistoryAssertion(assertion);
    const sent = structuredClone(storage.supabaseCheckpoint()!.pending);
    await storage.saveConfirmedWake({ ...wake, at: '2026-01-01T11:00:00Z' });
    await storage.mergeSupabase('first', 0, sent, { version: 1, entries: sent });
    expect(storage.supabaseCheckpoint()!.pending[`wake:${wake.id}`].value).toEqual({ ...wake, at: '2026-01-01T11:00:00Z' });
    await storage.deleteConfirmedWake(wake.id); await storage.deleteHistoryAssertion(assertion.id);
    await storage.mergeSync({ scope: 'first', entries: sent });
    expect(storage.confirmedWakes()).toEqual([]); expect(storage.historyAssertions()).toEqual([]);
    expect(storage.syncDocument()!.entries[`assertion:${assertion.id}`].value).toBeNull();
    await storage.configureSupabaseSync('second');
    await storage.mergeSupabase('first', 1, {}, { version: 2, entries: { [`wake:${wake.id}`]: { revision: Number.MAX_SAFE_INTEGER, device, value: wake } } });
    expect(storage.confirmedWakes()).toEqual([]); expect(storage.supabaseCheckpoint()!.scope).toBe('second');
  });
});
