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

  it('отклоняет несовместимые интервалы и сохраняет обе груди без изменения текущего таймера', async () => {
    TestBed.configureTestingModule({});
    const storage = TestBed.inject(StorageService);
    await storage.ready();
    const timers = TestBed.inject(ActiveTimerService);
    await timers.startBreastfeeding('left');
    const running = structuredClone(timers.breastTimer());
    const component = TestBed.createComponent(FeedingModalComponent).componentInstance;
    const start = new Date(2026, 9, 20, 23, 50).getTime();
    const end = new Date(2026, 9, 21, 0, 20).getTime();
    component.manualModel.set({ startTime: '2026-10-20T23:50', endTime: '2026-10-21T00:20', leftMinutes: 20, rightMinutes: 15, lastSide: 'right', note: ' Ночное кормление ' });
    await component.saveManualBreast();
    expect(storage.events()).toEqual([]);
    component.manualModel.update(value => ({ ...value, leftMinutes: 0, rightMinutes: 0 }));
    await component.saveManualBreast();
    expect(storage.events()).toEqual([]);
    component.manualModel.update(value => ({ ...value, leftMinutes: 15, rightMinutes: 0 }));
    await component.saveManualBreast();
    expect(storage.events()).toEqual([]);
    component.manualModel.update(value => ({ ...value, rightMinutes: 10 }));
    await component.saveManualBreast();
    const backup = JSON.parse(await storage.exportBackup());
    expect(backup.events).toEqual([expect.objectContaining({ type: 'breastfeeding', startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), leftDurationSec: 900, rightDurationSec: 600, lastSide: 'right', note: 'Ночное кормление' })]);
    expect(timers.breastTimer()).toEqual(running);
  });
});
