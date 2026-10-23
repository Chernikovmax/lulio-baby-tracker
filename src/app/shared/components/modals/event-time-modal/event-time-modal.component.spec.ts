import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SleepEvent } from '../../../../core/models/tracker.models';
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

async function setup() {
  TestBed.configureTestingModule({});
  const storage = TestBed.inject(StorageService);
  await storage.ready();
  await storage.saveEvent(sleep);
  const fixture = TestBed.createComponent(EventTimeModalComponent);
  fixture.componentRef.setInput('event', sleep);
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
