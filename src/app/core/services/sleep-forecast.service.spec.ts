import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageService } from './storage.service';
import { ClockService } from './clock.service';
import { SleepForecastService } from './sleep-forecast.service';
const at = Date.parse('2026-10-24T08:00:00Z');

describe('Forecast from real persisted signals', () => {
  const clock = { now: signal(at) };
  beforeEach(async () => {
    clock.now.set(at);
    TestBed.configureTestingModule({ providers: [{ provide: ClockService, useValue: clock }] });
    await Preferences.remove({ key: 'baby-tracker.v1' });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('keeps the same prediction/revision while time expires, then reacts to wake edits, import and active sleep', async () => {
    const storage = TestBed.inject(StorageService); await storage.ready();
    await storage.saveProfile({ id: 'baby', name: 'Synthetic', birthDate: '2026-06-01', dueDate: '2026-06-01', gender: 'girl' });
    await storage.saveSleepRoutine({ version: 1, timeZone: 'UTC', nightStartFrom: '20:00', nightStartTo: '21:00',
      daytimeNaps: 3, dayPreparationMinutes: 10, nightPreparationMinutes: 20, assistantEnabled: true });
    const forecasts = TestBed.inject(SleepForecastService);
    expect(forecasts.forecast().state).toBe('unknown');
    const id = '11111111-1111-4111-8111-111111111111';
    await storage.saveConfirmedWake({ id, at: '2026-10-24T08:00:00Z' });
    const original = forecasts.forecast();
    expect(original.predictedSleepAt).toBe('2026-10-24T10:00:00.000Z');
    clock.now.set(at + 1000);
    expect(forecasts.countdownSeconds()).toBe(7199);
    expect(forecasts.forecast().inputVersion).toBe(original.inputVersion);
    clock.now.set(at + 3 * 3600_000);
    expect(forecasts.forecast()).toMatchObject({ state: 'overdue', predictedSleepAt: original.predictedSleepAt, inputVersion: original.inputVersion });
    await storage.saveConfirmedWake({ id, at: '2026-10-24T07:30:00Z' });
    expect(forecasts.forecast().anchor?.id).toBe(original.anchor?.id);
    expect(forecasts.forecast().predictedSleepAt).toBe('2026-10-24T09:30:00.000Z');
    expect(forecasts.forecast().recalculationReasons).toContain('confirmed-wake-change');
    const version = forecasts.forecast().inputVersion, backup = await storage.exportBackup();
    await storage.importBackup(backup);
    expect(forecasts.forecast().state).toBe('disabled');
    expect(forecasts.forecast().inputVersion).not.toBe(version);
    await storage.saveSleepRoutine({ ...storage.sleepRoutine()!, assistantEnabled: true });
    await storage.update(data => ({ ...data, activeTimers: { ...data.activeTimers, sleepTimer: { startedAt: '2026-10-24T11:00:00Z', isNightSleep: false } } }));
    expect(forecasts.forecast().state).toBe('sleeping');
    await storage.update(data => ({ ...data, activeTimers: { ...data.activeTimers, sleepTimer: null } }));
    expect(forecasts.forecast().anchor?.id).toBe(original.anchor?.id); // Cancellation did not invent waking.
  });
});
