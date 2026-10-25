import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyTrackerEvent } from '../../core/models/tracker.models';
import { StorageService } from '../../core/services/storage.service';
import { StatsPage } from './stats.page';

function setup(events: AnyTrackerEvent[] = []) {
  TestBed.configureTestingModule({
    providers: [{ provide: StorageService, useValue: { events: signal(events), isLoading: signal(false), error: signal(null) } }],
  });
  return TestBed.runInInjectionContext(() => new StatsPage());
}

describe('Страница статистики', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 10));
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('пересчитывает статистику раз в минуту, а не на каждый тик часов', async () => {
    const page = setup();
    const first = page.stats();
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.stats()).toBe(first);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(page.stats()).not.toBe(first);
  });

  it('сразу учитывает сон, завершённый несколько секунд назад', () => {
    const page = setup([{ id: 'sleep', type: 'sleep', isNightSleep: false,
      startTime: new Date(2026, 9, 25, 11).toISOString(), endTime: new Date(2026, 9, 25, 12, 0, 5).toISOString(),
      updatedAt: new Date(2026, 9, 25, 12, 0, 5).toISOString() }]);
    expect(page.stats().days.at(-1)!.daySleepSec).toBe(3605);
  });
});
