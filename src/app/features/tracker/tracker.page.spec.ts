import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiaperEvent } from '../../core/models/tracker.models';
import { ClockService } from '../../core/services/clock.service';
import { StorageService } from '../../core/services/storage.service';
import { SyncService } from '../../core/services/sync.service';
import { YandexSyncService } from '../../core/services/yandex-sync.service';
import { TrackerPage } from './tracker.page';

const localDate = (day: number, hour = 12) => new Date(2026, 9, day, hour);

function setup(birthDate = '2026-06-17') {
  TestBed.configureTestingModule({
    providers: [{ provide: StorageService, useValue: {
      profile: signal({ id: 'baby', name: 'Малыш', birthDate, dueDate: '2026-06-15', gender: 'boy' }),
      events: signal([]), isLoading: signal(false), error: signal(null),
    } }, { provide: SyncService, useValue: {} }, { provide: YandexSyncService, useValue: {} }],
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
