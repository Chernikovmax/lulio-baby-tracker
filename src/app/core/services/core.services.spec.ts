import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveTimerService } from './active-timer.service';
import { ClockService } from './clock.service';
import { StorageService } from './storage.service';
import { WakeWindowService } from './wake-window.service';
import { LeapsService } from './leaps.service';
import { BabyProfile, isTrackerBackup } from '../models/tracker.models';
import { DurationFormatPipe } from '../../shared/pipes/duration-format.pipe';

const profile: BabyProfile = { id: 'малыш', name: 'Миша', birthDate: '2026-08-01', dueDate: '2026-08-15', gender: 'boy' };

async function setup() {
  TestBed.configureTestingModule({});
  const storage = TestBed.inject(StorageService);
  await storage.ready();
  return { storage, timers: TestBed.inject(ActiveTimerService), wake: TestBed.inject(WakeWindowService), leaps: TestBed.inject(LeapsService) };
}

describe('Ядро трекера', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    await Preferences.remove({ key: 'baby-tracker.v1' });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('восстанавливает сон после уничтожения сервиса и завершает его ровно одним событием', async () => {
    let core = await setup();
    await core.timers.startSleep(true);
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date('2026-10-20T14:30:00Z'));
    core = await setup();
    expect(core.timers.sleepDurationSec()).toBe(9000);
    const [first, second] = await Promise.all([core.timers.stopSleep(), core.timers.stopSleep()]);
    expect(first).toMatchObject({ type: 'sleep', isNightSleep: true, startTime: '2026-10-20T12:00:00.000Z', endTime: '2026-10-20T14:30:00.000Z' });
    expect(second).toBeNull();
    expect(core.storage.events().filter(event => event.type === 'sleep')).toEqual([first]);
    expect(core.timers.sleepTimer()).toBeNull();
  });

  it('считает обе груди по меткам времени, исключает паузы и сохраняет доли секунды', async () => {
    const { timers, storage } = await setup();
    await timers.startBreastfeeding('left');
    vi.setSystemTime(Date.now() + 600);
    await timers.switchBreast('right');
    vi.setSystemTime(Date.now() + 2400);
    await timers.pauseBreastfeeding();
    vi.setSystemTime(Date.now() + 60_000);
    await timers.switchBreast('left');
    vi.setSystemTime(Date.now() + 600);
    const result = await timers.stopBreastfeeding();
    expect(result).toMatchObject({ leftDurationSec: 1, rightDurationSec: 2, lastSide: 'left' });
    const backup = JSON.parse(await storage.exportBackup()) as unknown;
    expect(isTrackerBackup(backup)).toBe(true);
  });

  it('не теряет параллельные изменения, а ошибка записи не изменяет видимое состояние', async () => {
    const { storage } = await setup();
    await Promise.all([
      storage.saveProfile(profile),
      storage.saveEvent({ id: 'еда', type: 'bottle', content: 'formula', volumeMl: 90, startTime: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    ]);
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Нет места'); });
    await expect(storage.deleteEvent('еда')).rejects.toThrow('Нет места');
    expect(storage.profile()).toEqual(profile);
    expect(storage.events().map(event => event.id)).toEqual(['еда']);
    fail.mockRestore();
    await storage.deleteEvent('еда');
    expect(storage.events()).toEqual([]);
  });

  it('отклоняет повреждённый импорт до записи и восстанавливает полный снимок', async () => {
    const { storage, timers } = await setup();
    await storage.saveProfile(profile);
    await timers.startSleep();
    const backup = await storage.exportBackup();
    const invalid = JSON.parse(backup);
    invalid.activeTimers.breastTimer = { startedAt: 'вчера' };
    await expect(storage.importBackup(JSON.stringify(invalid))).rejects.toThrow('Неверный формат');
    expect(await storage.exportBackup()).toBe(backup);
    await timers.cancelSleep();
    await storage.importBackup(backup);
    expect(timers.sleepTimer()?.startedAt).toBe('2026-10-20T12:00:00.000Z');
    expect(storage.profile()).toEqual(profile);
    invalid.activeTimers.breastTimer = null;
    invalid.profile.birthDate = '2026-02-30';
    await expect(storage.importBackup(JSON.stringify(invalid))).rejects.toThrow();
    const invalidEvent = JSON.parse(backup);
    invalidEvent.events = [{ id: 'еда', type: 'bottle', startTime: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z', content: ['formula'], volumeMl: 90 }];
    await expect(storage.importBackup(JSON.stringify(invalidEvent))).rejects.toThrow('Неверный формат');
  });

  it('различает неизвестное ВБ, границы нормы, перегул и активный сон', async () => {
    const { storage, wake, timers } = await setup();
    await storage.saveProfile({ ...profile, birthDate: '2026-10-01' });
    expect(wake.wakeDurationSec()).toBeNull();
    expect(wake.status()).toBeNull();
    await storage.saveEvent({ id: 'сон', type: 'sleep', startTime: '2026-10-20T10:00:00Z', endTime: '2026-10-20T11:20:00Z', updatedAt: '2026-10-20T11:20:00Z', isNightSleep: false });
    expect(wake.status()).toBe('approaching');
    expect(wake.normProgressRatio()).toBeCloseTo(2 / 3);
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(wake.status()).toBe('approaching');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wake.isOvertired()).toBe(true);
    await timers.startSleep();
    expect(wake.status()).toBe('sleeping');
    expect(wake.wakeDurationSec()).toBe(0);
  });

  it('выбирает последнюю по времени грудь и сбрасывает ручной выбор только при новом кормлении', async () => {
    const { storage, wake } = await setup();
    const event = { id: 'гв', type: 'breastfeeding' as const, startTime: '2026-10-20T10:00:00Z', endTime: '2026-10-20T10:10:00Z', updatedAt: '2026-10-20T10:10:00Z', leftDurationSec: 600, rightDurationSec: 0, lastSide: 'left' as const };
    await storage.saveEvent(event);
    expect(wake.nextBreastSide()).toBe('right');
    wake.nextBreastSide.set('left');
    await storage.saveProfile(profile);
    expect(wake.nextBreastSide()).toBe('left');
    await storage.saveEvent({ ...event, id: 'новое гв', startTime: '2026-10-20T11:00:00Z', endTime: '2026-10-20T11:10:00Z' });
    expect(wake.nextBreastSide()).toBe('right');
    expect(wake.timeSinceLastFeedingSec()).toBe(3600);
  });

  it('использует только ПДР, отмечает погоду и не прижимает возраст к краям календаря', async () => {
    const { storage, leaps } = await setup();
    await storage.saveProfile({ ...profile, dueDate: '2026-09-01' });
    expect(leaps.currentWeek()).toBe(8);
    expect(leaps.currentWeather()).toBe('stormy');
    await storage.saveProfile({ ...profile, birthDate: '2026-09-10', dueDate: '2026-09-01' });
    expect(leaps.currentWeek()).toBe(8);
    await storage.saveProfile({ ...profile, dueDate: '2026-10-21' });
    expect(leaps.currentWeek()).toBe(0);
    expect(leaps.currentCalendarWeek()).toBeNull();
    await storage.saveProfile({ ...profile, dueDate: '2025-01-01' });
    expect(leaps.currentWeek()).toBeGreaterThan(75);
    expect(leaps.calendar().some(week => week.isCurrentWeek)).toBe(false);
  });

  it('обновляет единые часы при возврате во вкладку и снимает обработчик при уничтожении', async () => {
    await setup();
    const clock = TestBed.inject(ClockService);
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.now()).toBe(Date.parse('2026-10-21T12:00:00Z'));
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.now()).toBe(Date.parse('2026-10-21T12:00:00Z'));
  });
});

describe('Форматирование длительности', () => {
  it.each([
    [5700, 'human', '1 ч 35 мин'], [252, 'timer', '04:12'], [3661, 'timer', '01:01:01'],
    [0, 'human', '0 мин'], [-10, 'timer', '00:00'], [NaN, 'human', '—'], [null, 'human', '—'],
  ] as const)('форматирует %s в режиме %s', (seconds, format, expected) => {
    expect(new DurationFormatPipe().transform(seconds, format)).toBe(expected);
  });
});
