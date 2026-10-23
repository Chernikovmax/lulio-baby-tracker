import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockService } from '../../core/services/clock.service';
import { StorageService } from '../../core/services/storage.service';
import { TrackerPage } from './tracker.page';

const localDate = (day: number, hour = 12) => new Date(2026, 9, day, hour);

function setup() {
  TestBed.configureTestingModule({
    providers: [{ provide: StorageService, useValue: {
      profile: signal({ id: 'baby', name: 'Малыш', birthDate: '2026-06-17', dueDate: '2026-06-15', gender: 'boy' }),
      events: signal([]), isLoading: signal(false), error: signal(null),
    } }],
  });
  const page = TestBed.runInInjectionContext(() => new TrackerPage());
  return { page, clock: TestBed.inject(ClockService) };
}

describe('Дата дневника и возраст ребёнка', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(localDate(20));
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('обновляет Сегодня и возраст после нескольких дней в фоне и при следующей полуночи', async () => {
    const { page } = setup();
    expect(page.babyAge()).toBe('4 мес. 3 дн.');
    expect(page.isToday()).toBe(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.setSystemTime(localDate(23));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(page.babyAge()).toBe('4 мес. 6 дн.');
    expect(page.isToday()).toBe(true);
    expect(page.selectedDate()).toBe(localDate(23, 0).getTime());
    vi.setSystemTime(new Date(2026, 9, 23, 23, 59, 59));
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.babyAge()).toBe('4 мес. 7 дн.');
    expect(page.isToday()).toBe(true);
  });

  it('сохраняет выбранный прошлый день, а после возврата к Сегодня снова следует за часами', () => {
    const { page, clock } = setup();
    page.moveDate(-1);
    expect(page.babyAge()).toBe('4 мес. 2 дн.');
    vi.setSystemTime(localDate(23));
    clock.refresh();
    expect(page.selectedDate()).toBe(localDate(19, 0).getTime());
    expect(page.babyAge()).toBe('4 мес. 2 дн.');
    expect(page.isToday()).toBe(false);
    page.goToday();
    expect(page.babyAge()).toBe('4 мес. 6 дн.');
    vi.setSystemTime(localDate(24));
    clock.refresh();
    expect(page.babyAge()).toBe('4 мес. 7 дн.');
    expect(page.isToday()).toBe(true);
  });
});
