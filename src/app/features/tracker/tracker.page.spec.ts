import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveTimerState, AnyTrackerEvent, DiaperEvent, SleepEvent } from '../../core/models/tracker.models';
import { ClockService } from '../../core/services/clock.service';
import { StorageService } from '../../core/services/storage.service';
import { SyncService } from '../../core/services/sync.service';
import { YandexSyncService } from '../../core/services/yandex-sync.service';
import { TrackerPage } from './tracker.page';

const localDate = (day: number, hour = 12) => new Date(2026, 9, day, hour);

function setup(birthDate = '2026-06-17') {
  const events = signal<AnyTrackerEvent[]>([]);
  const activeTimers = signal<ActiveTimerState>({ sleepTimer: null, breastTimer: null });
  TestBed.configureTestingModule({
    providers: [{ provide: StorageService, useValue: {
      profile: signal({ id: 'baby', name: 'Малыш', birthDate, dueDate: '2026-06-15', gender: 'boy' }),
      events, activeTimers, isLoading: signal(false), error: signal(null),
    } }, { provide: SyncService, useValue: {} }, { provide: YandexSyncService, useValue: {} }],
  });
  const page = TestBed.runInInjectionContext(() => new TrackerPage());
  return { page, events, activeTimers, clock: TestBed.inject(ClockService) };
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

  it('не показывает отрицательные дни у ребёнка, родившегося в конце месяца', () => {
    vi.setSystemTime(new Date(2026, 2, 1, 12));
    const { page } = setup('2026-01-31');
    expect(page.babyAge()).toBe('1 мес. 1 дн.');
    page.moveDate(1);
    expect(page.babyAge()).toBe('1 мес. 2 дн.');
    page.moveDate(-2);
    expect(page.babyAge()).toBe('1 мес. 0 дн.');
  });
});

describe('Итоги ночи и следующего дня', () => {
  const iso = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
  const sleep = (id: string, day: number, from: number, toDay: number, to: number, night = true): SleepEvent =>
    ({ id, type: 'sleep', startTime: iso(day, from), endTime: iso(toDay, to), updatedAt: iso(toDay, to), isNightSleep: night });
  const diaper = (id: string, day: number, hour: number): DiaperEvent =>
    ({ id, type: 'diaper', startTime: iso(day, hour), updatedAt: iso(day, hour), state: 'wet' });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(localDate(20, 23));
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('относит всю прошлую ночь, еду и подгузники к следующему дню, исключая новую ночь', () => {
    const { page, events } = setup();
    events.set([
      sleep('night', 19, 21, 20, 7),
      sleep('nap', 20, 10, 20, 11, false),
      sleep('next-night', 20, 21, 20, 22),
      diaper('before', 19, 20), diaper('during', 19, 22), diaper('day', 20, 12), diaper('next', 20, 21),
      { id: 'bottle', type: 'bottle', startTime: iso(19, 23), updatedAt: iso(19, 23), content: 'formula', volumeMl: 120 },
      { id: 'solids', type: 'solids', startTime: iso(20, 12), updatedAt: iso(20, 12), food: 'Каша' },
    ]);
    expect(page.summary()).toEqual({ daytime: 3600, nighttime: 36000, feedings: 2, bottleMl: 120, diapers: 2 });
    page.moveDate(-1);
    expect(page.summary().nighttime).toBe(0);
    expect(page.summary().diapers).toBe(1);
    page.moveDate(2);
    expect(page.summary().nighttime).toBe(3600);
    expect(page.summary().diapers).toBe(1);
  });

  it('объединяет повторные засыпания после полуночи, вычитает паузы и пересечения', () => {
    const { page, events } = setup();
    const first = sleep('first', 19, 21, 20, 1);
    first.pauses = [{ startTime: iso(19, 23), endTime: iso(20, 0) }];
    events.set([first, sleep('second', 20, 2, 20, 7), sleep('overlap', 20, 3, 20, 4), diaper('wake', 20, 1)]);
    expect(page.summary().nighttime).toBe(8 * 3600);
    expect(page.summary().diapers).toBe(1);
  });

  it('обновляет незавершённый сон и кормление, не включая новую ночь до следующей даты', () => {
    vi.setSystemTime(localDate(20, 3));
    const { page, activeTimers, clock } = setup();
    activeTimers.set({
      sleepTimer: { startedAt: iso(19, 21), isNightSleep: true, pauses: [{ startTime: iso(20, 0), endTime: iso(20, 1) }] },
      breastTimer: { startedAt: iso(20, 1), activeSide: null, currentSideStartedAt: null,
        accumulatedLeftSec: 60, accumulatedRightSec: 0, lastActiveSide: 'left' },
    });
    expect(page.summary().nighttime).toBe(5 * 3600);
    expect(page.summary().feedings).toBe(1);
    vi.setSystemTime(localDate(20, 4));
    clock.refresh();
    expect(page.summary().nighttime).toBe(6 * 3600);
    activeTimers.update(value => ({ ...value, sleepTimer: { ...value.sleepTimer!, pausedAt: iso(20, 4) } }));
    vi.setSystemTime(localDate(20, 5));
    clock.refresh();
    expect(page.summary().nighttime).toBe(6 * 3600);
    activeTimers.update(value => ({ ...value, sleepTimer: { startedAt: iso(20, 21), isNightSleep: true }, breastTimer: null }));
    vi.setSystemTime(localDate(20, 23));
    clock.refresh();
    expect(page.summary().nighttime).toBe(0);
    vi.setSystemTime(localDate(21, 1));
    clock.refresh();
    expect(page.summary().nighttime).toBe(4 * 3600);
  });

  it('поддерживает начало ночи после полуночи и календарный день при отсутствии ночных записей', () => {
    const { page, events } = setup();
    events.set([sleep('late', 20, 1, 20, 7), diaper('before', 20, 0), diaper('during', 20, 2)]);
    expect(page.summary().nighttime).toBe(6 * 3600);
    expect(page.summary().diapers).toBe(1);
    events.set([diaper('today', 20, 10), diaper('yesterday', 19, 22)]);
    expect(page.summary()).toEqual({ daytime: 0, nighttime: 0, feedings: 0, bottleMl: 0, diapers: 1 });
  });
});

describe('Удаление записи из ленты', () => {
  const diaper: DiaperEvent = { id: 'diaper', type: 'diaper', state: 'wet',
    startTime: '2026-10-20T07:00:00.000Z', updatedAt: '2026-10-20T07:00:00.000Z' };

  async function render() {
    await Preferences.remove({ key: 'baby-tracker.v1' });
    TestBed.configureTestingModule({});
    const storage = TestBed.inject(StorageService);
    await storage.ready();
    await storage.saveEvent(diaper);
    const fixture = TestBed.createComponent(TrackerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    return { storage, fixture, page: fixture.componentInstance };
  }
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('не удаляет запись одним нажатием на корзину', async () => {
    const { storage, fixture } = await render();
    const hosts = Array.from(fixture.nativeElement.querySelectorAll('ion-button')) as HTMLElement[];
    const trash = hosts.flatMap(host => [host, ...Array.from(host.shadowRoot?.querySelectorAll('button') ?? [])])
      .find(button => button.getAttribute('aria-label')?.startsWith('Удалить:'))!;
    trash.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.pendingDelete()?.event).toEqual(diaper);
    expect(storage.events()).toEqual([diaper]);
  });

  it('удаляет запись только после подтверждения', async () => {
    const { storage, page } = await render();
    const sliding = { close: vi.fn(async () => true) };
    page.requestDelete(diaper, sliding as never);
    await page.onDeleteDismiss('cancel');
    expect(storage.events()).toEqual([diaper]);
    expect(sliding.close).toHaveBeenCalled();
    page.requestDelete(diaper, sliding as never);
    await page.onDeleteDismiss('destructive');
    expect(storage.events()).toEqual([]);
  });
});
