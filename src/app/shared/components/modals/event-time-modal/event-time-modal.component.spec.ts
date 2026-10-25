import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BreastfeedingEvent, SleepEvent } from '../../../../core/models/tracker.models';
import { StorageService } from '../../../../core/services/storage.service';
import { TrackerPage } from '../../../../features/tracker/tracker.page';
import { EventTimeModalComponent } from './event-time-modal.component';

const sleep: SleepEvent = {
  id: 'sleep', type: 'sleep', startTime: '2026-10-20T22:00:12.345Z', endTime: '2026-10-21T08:00:34.567Z',
  isNightSleep: true, note: 'В кроватке', tags: ['crib'], updatedAt: '2026-10-21T08:00:34.567Z',
};
const local = (value: string) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 23);
};

async function setup(event: SleepEvent | BreastfeedingEvent = sleep) {
  TestBed.configureTestingModule({});
  const storage = TestBed.inject(StorageService);
  await storage.ready();
  await storage.saveEvent(event);
  const fixture = TestBed.createComponent(EventTimeModalComponent);
  fixture.componentRef.setInput('event', event);
  const modal = fixture.componentInstance;
  modal.prepare();
  return { storage, modal };
}

describe('Редактирование времени сохранённых записей', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'));
    await Preferences.remove({ key: 'baby-tracker.v1' });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('исправляет забытый сон через полночь, пересчитывает итоги и восстанавливает ту же запись после перезапуска', async () => {
    const { storage, modal } = await setup();
    const page = TestBed.runInInjectionContext(() => new TrackerPage());
    page.selectedDate.set(new Date(2026, 9, 21).getTime());
    modal.timeModel.update(value => ({ ...value, endTime: local('2026-10-21T06:00:12.345Z') }));
    await modal.save();
    expect(modal.error()).toBe('');
    expect(page.eventDuration(storage.events()[0])).toBe(28800);
    const expectedTotal = Math.floor((Date.parse('2026-10-21T06:00:12.345Z') - Math.max(Date.parse(sleep.startTime), page.selectedDate())) / 1000);
    expect(page.summary().nighttime).toBe(expectedTotal);
    TestBed.resetTestingModule();
    const restored = TestBed.inject(StorageService);
    await restored.ready();
    expect(restored.events()).toEqual([{ ...sleep, endTime: '2026-10-21T06:00:12.345Z', updatedAt: '2026-10-23T12:00:00.000Z' }]);
  });

  it('сокращает забытое кормление с часа до времени у каждой груди и восстанавливает исправленную запись', async () => {
    const feeding: BreastfeedingEvent = { id: 'feeding', type: 'breastfeeding',
      startTime: '2026-10-23T10:00:00.000Z', endTime: '2026-10-23T11:00:00.000Z',
      leftDurationSec: 3000, rightDurationSec: 600, lastSide: 'right', note: 'Забыли таймер', updatedAt: '2026-10-23T11:00:00.000Z' };
    const { storage, modal } = await setup(feeding);
    modal.timeModel.update(value => ({ ...value, leftMinutes: 5.5, rightMinutes: 0 }));
    await modal.save();
    expect(modal.error()).toBe('');
    const expected = { ...feeding, leftDurationSec: 330, rightDurationSec: 0, lastSide: 'left', endTime: '2026-10-23T10:05:30.000Z', updatedAt: '2026-10-23T12:00:00.000Z' };
    expect(storage.events()).toEqual([expected]);
    TestBed.resetTestingModule();
    const restored = TestBed.inject(StorageService);
    await restored.ready();
    expect(restored.events()).toEqual([expected]);
  });

  it('сохраняет дробные минуты кормления, округляя до секунд, без ошибки валидации', async () => {
    const feeding: BreastfeedingEvent = { id: 'feeding', type: 'breastfeeding',
      startTime: '2026-10-23T10:00:00.000Z', endTime: '2026-10-23T11:00:00.000Z',
      leftDurationSec: 3000, rightDurationSec: 600, lastSide: 'right', updatedAt: '2026-10-23T11:00:00.000Z' };
    const { storage, modal } = await setup(feeding);
    modal.timeModel.update(value => ({ ...value, leftMinutes: 17.09, rightMinutes: 12.34 }));
    await modal.save();
    expect(modal.error()).toBe('');
    expect(storage.events()).toEqual([{ ...feeding, leftDurationSec: 1025, rightDurationSec: 740,
      endTime: '2026-10-23T10:29:25.000Z', updatedAt: '2026-10-23T12:00:00.000Z' }]);
  });

  it.each([[0, 0], [-1, 5], [5, -1], [NaN, 5], [121, 0]])(
    'не меняет кормление при недопустимой длительности %s / %s', async (leftMinutes, rightMinutes) => {
      const feeding: BreastfeedingEvent = { id: 'feeding', type: 'breastfeeding',
        startTime: '2026-10-23T10:00:00.000Z', endTime: '2026-10-23T11:00:00.000Z',
        leftDurationSec: 3000, rightDurationSec: 600, lastSide: 'right', updatedAt: '2026-10-23T11:00:00.000Z' };
      const { storage, modal } = await setup(feeding);
      modal.timeModel.update(value => ({ ...value, leftMinutes, rightMinutes }));
      await modal.save();
      expect(modal.error()).not.toBe('');
      expect(storage.events()).toEqual([feeding]);
    },
  );

  it('обрезает паузы сна по исправленным границам, не возвращая их в длительность', async () => {
    const pausedSleep: SleepEvent = { ...sleep, pauses: [{ startTime: '2026-10-21T03:00:00.000Z', endTime: '2026-10-21T04:00:00.000Z' }] };
    const { storage, modal } = await setup(pausedSleep);
    modal.timeModel.update(value => ({ ...value, endTime: local('2026-10-21T03:30:00.000Z') }));
    await modal.save();
    expect(modal.error()).toBe('');
    expect(storage.events()[0]).toMatchObject({ endTime: '2026-10-21T03:30:00.000Z',
      pauses: [{ startTime: '2026-10-21T03:00:00.000Z', endTime: '2026-10-21T03:30:00.000Z' }] });
  });

  it('не округляет секунды и миллисекунды при сохранении без правок', async () => {
    const { storage, modal } = await setup();
    await modal.save();
    expect(storage.events()).toEqual([{ ...sleep, updatedAt: '2026-10-23T12:00:00.000Z' }]);
  });

  it.each(['', '2026-10-20T22:00:12.345Z', '2026-10-20T21:00:00Z', '2026-10-24T12:00:00Z'])(
    'не меняет сохранённый сон при недопустимом окончании %s', async end => {
      const { storage, modal } = await setup();
      modal.timeModel.update(value => ({ ...value, endTime: end ? local(end) : '' }));
      await modal.save();
      expect(modal.error()).not.toBe('');
      expect(storage.events()).toEqual([sleep]);
    },
  );

  it('сохраняет введённое время после ошибки записи и позволяет повторить сохранение', async () => {
    const { storage, modal } = await setup();
    const endTime = local('2026-10-21T06:00:00Z');
    modal.timeModel.update(value => ({ ...value, endTime }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Нет места'); });
    await modal.save();
    expect(modal.error()).toBe('Нет места');
    expect(modal.timeModel().endTime).toBe(endTime);
    expect(storage.events()).toEqual([sleep]);
    await modal.save();
    expect(storage.events()[0].endTime).toBe('2026-10-21T06:00:00.000Z');
  });

  it('не воскрешает запись, удалённую пока открыта форма', async () => {
    const { storage, modal } = await setup();
    await storage.deleteEvent(sleep.id);
    await modal.save();
    expect(modal.error()).toContain('уже удалена');
    expect(storage.events()).toEqual([]);
  });
});
