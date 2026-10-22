import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveTimerService } from '../../../../core/services/active-timer.service';
import { StorageService } from '../../../../core/services/storage.service';
import { FeedingModalComponent } from './feeding-modal.component';

describe('Ручное грудное кормление', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    await Preferences.remove({ key: 'baby-tracker.v1' });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('вычисляет окончание по сумме минут с переходом через полночь и не меняет текущий таймер', async () => {
    TestBed.configureTestingModule({});
    const storage = TestBed.inject(StorageService);
    await storage.ready();
    const timers = TestBed.inject(ActiveTimerService);
    await timers.startBreastfeeding('left');
    const running = structuredClone(timers.breastTimer());
    const component = TestBed.createComponent(FeedingModalComponent).componentInstance;
    const start = new Date(2026, 9, 20, 23, 50).getTime();
    const end = new Date(2026, 9, 21, 0, 15).getTime();
    component.manualModel.update(value => ({ ...value, startTime: '2026-10-20T23:50', leftMinutes: 15, rightMinutes: 10, lastSide: 'right', note: ' Ночное кормление ' }));
    await component.saveManualBreast();
    const backup = JSON.parse(await storage.exportBackup());
    expect(backup.events).toEqual([expect.objectContaining({ type: 'breastfeeding', startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), leftDurationSec: 900, rightDurationSec: 600, lastSide: 'right', note: 'Ночное кормление' })]);
    expect(timers.breastTimer()).toEqual(running);
  });

  it.each([
    { leftMinutes: 0, rightMinutes: 0, lastSide: 'left' as const },
    { leftMinutes: -1, rightMinutes: 10, lastSide: 'right' as const },
    { leftMinutes: 1.5, rightMinutes: 10, lastSide: 'right' as const },
    { leftMinutes: 15, rightMinutes: 0, lastSide: 'right' as const },
  ])('не сохраняет некорректные длительности или последнюю грудь: %j', async durations => {
    TestBed.configureTestingModule({});
    const storage = TestBed.inject(StorageService);
    await storage.ready();
    const component = TestBed.createComponent(FeedingModalComponent).componentInstance;
    component.manualModel.set({ startTime: '2026-10-20T23:50', ...durations, note: '' });
    await component.saveManualBreast();
    expect(storage.events()).toEqual([]);
    expect(component.error()).not.toBe('');
  });

  it('отклоняет рассчитанное окончание в будущем, но сохраняет кормление, закончившееся сейчас', async () => {
    TestBed.configureTestingModule({});
    const storage = TestBed.inject(StorageService);
    await storage.ready();
    const component = TestBed.createComponent(FeedingModalComponent).componentInstance;
    const start = new Date(2026, 9, 21, 10, 0);
    vi.setSystemTime(new Date(2026, 9, 21, 10, 15));
    component.manualModel.set({ startTime: '2026-10-21T10:00', leftMinutes: 10, rightMinutes: 6, lastSide: 'right', note: '' });
    await component.saveManualBreast();
    expect(storage.events()).toEqual([]);
    expect(component.error()).toContain('окончание');
    component.manualModel.update(value => ({ ...value, rightMinutes: 5 }));
    await component.saveManualBreast();
    expect(storage.events()).toEqual([expect.objectContaining({
      startTime: start.toISOString(),
      endTime: new Date(2026, 9, 21, 10, 15).toISOString(),
      leftDurationSec: 600,
      rightDurationSec: 300,
    })]);
  });
});
