import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import { ClockService } from './clock.service';
import { SleepForecastService } from './sleep-forecast.service';
import { PreparationReminderService } from './preparation-reminder.service';
import { TimerNotification, type PreparationPlan } from '@baby-tracker/timer-notification';
import { Capacitor } from '@capacitor/core';

vi.mock('@baby-tracker/timer-notification', () => ({ TimerNotification: {
  preparationStatus: vi.fn(), preparationInvalidate: vi.fn(), preparationConsent: vi.fn(), preparationReconcile: vi.fn(),
  preparationSettings: vi.fn(), preparationTakeOpen: vi.fn(), addListener: vi.fn(),
} }));
const native = vi.mocked(TimerNotification);
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: async () => undefined })) } }));
const now = Date.parse('2026-10-25T08:00:00Z');
const wake = { id: '11111111-1111-4111-8111-111111111111', at: '2026-10-25T08:00:00Z' };
const device = '22222222-2222-4222-8222-222222222222';

describe('Device reminder and committed diary boundary', () => {
  let storage: StorageService;
  let generation: number;
  const status = () => ({ device, generation, enabled: true, notifications: true, exact: true, pending: false, lastState: 'idle' });
  beforeEach(async () => {
    generation = 0; vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
    native.preparationStatus.mockImplementation(async () => status());
    native.preparationInvalidate.mockImplementation(async () => { generation++; return status(); });
    native.preparationReconcile.mockImplementation(async () => status());
    native.preparationConsent.mockImplementation(async () => status());
    native.preparationTakeOpen.mockResolvedValue({ open: false });
    native.addListener.mockResolvedValue({ remove: async () => undefined });
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ClockService, useValue: { now: signal(now) } }] });
    await Preferences.remove({ key: 'baby-tracker.v1' });
    storage = TestBed.inject(StorageService); await storage.ready();
    await storage.saveProfile({ id: 'synthetic', name: 'Synthetic', birthDate: '2026-06-25', dueDate: '2026-06-25', gender: 'girl' });
    await storage.saveSleepRoutine({ version: 1, timeZone: 'UTC', nightStartFrom: '20:00', nightStartTo: '21:00', daytimeNaps: 3,
      dayPreparationMinutes: 10, nightPreparationMinutes: 20, assistantEnabled: true });
    await storage.saveConfirmedWake(wake);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  it('does not arm old input with a new generation while a diary commit is in flight', async () => {
    const service = TestBed.inject(PreparationReminderService);
    await service.refresh();
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { entered = resolve; });
    native.preparationStatus.mockImplementationOnce(async () => { entered(); await waiting; return status(); });
    const refresh = service.refresh();
    await reached;
    const revision = native.preparationReconcile.mock.lastCall![0].plan!.revision;
    let committed = false;
    const edit = storage.saveConfirmedWake({ ...wake, at: '2026-10-25T07:30:00Z' }).then(() => { committed = true; });
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    expect(committed).toBe(false);
    release(); await refresh; await edit; await service.refresh();
    const plans = native.preparationReconcile.mock.calls.map(args => args[0] as { generation: number; plan: PreparationPlan | null });
    const old = plans.filter(item => item.plan?.revision === revision).at(-1)!;
    const latest = plans.at(-1)!;
    expect(latest.generation).toBeGreaterThan(old.generation);
    expect(latest.plan?.due).toBe(Date.parse('2026-10-25T09:20:00Z'));
    expect(latest.plan?.key).toBe(old.plan?.key);
    expect(latest.plan?.revision).not.toBe(revision);
  });
  it('cancels through actual preparation, suppression and import, excluding device consent from backup', async () => {
    const service = TestBed.inject(PreparationReminderService);
    await service.refresh();
    const forecast = TestBed.inject(SleepForecastService).forecast();
    await storage.beginSleepPreparation(forecast); await service.refresh();
    let request = native.preparationReconcile.mock.lastCall![0];
    expect(request.plan).toBeNull();
    expect(JSON.parse(request.blockedKey!)).toEqual(['local', `wake:${wake.id}`, device]);
    await storage.cancelSleepPreparation(storage.sleepPreparations()[0].id);
    await storage.suppressSleepCycle(forecast); await service.refresh();
    request = native.preparationReconcile.mock.lastCall![0];
    expect(request.plan).toBeNull();
    expect(request.blockedKey).not.toBeNull();
    const backup = JSON.parse(await storage.exportBackup());
    expect(backup.sleepCycleSuppressions[0].anchorId).toBe(`wake:${wake.id}`);
    expect(JSON.stringify(backup)).not.toContain(device);
    await storage.importBackup(JSON.stringify(backup)); await service.refresh();
    expect(storage.sleepRoutine()?.assistantEnabled).toBe(false);
    expect(native.preparationReconcile.mock.lastCall![0].plan).toBeNull();
    expect(native.preparationConsent).not.toHaveBeenCalled();
  });
  it('fails closed before changing diary when native cancellation cannot persist', async () => {
    native.preparationInvalidate.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(storage.saveConfirmedWake({ ...wake, at: '2026-10-25T07:00:00Z' })).rejects.toThrow('disk unavailable');
    expect(storage.confirmedWakes()).toEqual([wake]);
    await storage.saveConfirmedWake({ ...wake, at: '2026-10-25T07:30:00Z' });
    expect(storage.confirmedWakes()[0].at).toBe('2026-10-25T07:30:00Z');
  });
});
