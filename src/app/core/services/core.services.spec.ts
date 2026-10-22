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
    await core.timers.startSleep(true, 10);
    expect(core.timers.sleepDurationSec()).toBe(600);
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date('2026-10-20T14:30:00Z'));
    core = await setup();
    expect(core.timers.sleepDurationSec()).toBe(9600);
    const [first, second] = await Promise.all([core.timers.stopSleep(), core.timers.stopSleep()]);
    expect(first).toMatchObject({ type: 'sleep', isNightSleep: true, startTime: '2026-10-20T11:50:00.000Z', endTime: '2026-10-20T14:30:00.000Z' });
    expect(second).toBeNull();
    expect(core.storage.events().filter(event => event.type === 'sleep')).toEqual([first]);
    expect(core.timers.sleepTimer()).toBeNull();
  });

  it('восстанавливает кормление с прошлым началом, считает обе груди и исключает паузы', async () => {
    let { timers, storage } = await setup();
    await timers.startBreastfeeding('left', 60);
    expect(timers.leftDurationSec()).toBe(3600);
    expect(timers.rightDurationSec()).toBe(0);
    vi.setSystemTime(Date.now() + 600);
    await timers.switchBreast('right');
    vi.setSystemTime(Date.now() + 2400);
    await timers.pauseBreastfeeding();
    vi.setSystemTime(Date.now() + 60_000);
    TestBed.resetTestingModule();
    ({ timers, storage } = await setup());
    expect(timers.breastDurationSec()).toBe(3602);
    await timers.switchBreast('left');
    vi.setSystemTime(Date.now() + 600);
    const result = await timers.stopBreastfeeding();
    expect(result).toMatchObject({ startTime: '2026-10-20T11:00:00.000Z', leftDurationSec: 3601, rightDurationSec: 2, lastSide: 'left' });
    const backup = JSON.parse(await storage.exportBackup()) as unknown;
    expect(isTrackerBackup(backup)).toBe(true);
  });

  it.each([-1, 61, 0.5, Number.NaN])('не запускает таймеры с недопустимым смещением %s', async minutes => {
    const { timers, storage } = await setup();
    await expect(timers.startSleep(false, minutes)).rejects.toThrow('от 0 до 60');
    await expect(timers.startBreastfeeding('right', minutes)).rejects.toThrow('от 0 до 60');
    expect(storage.activeTimers()).toEqual({ sleepTimer: null, breastTimer: null });
  });

  it('показывает прошедшие минуты сразу, даже если часы интерфейса ещё не обновились', async () => {
    const { timers } = await setup();
    vi.setSystemTime(Date.now() + 500);
    await timers.startSleep(false, 10);
    await timers.startBreastfeeding('right', 10);
    expect(timers.sleepDurationSec()).toBe(600);
    expect(timers.breastDurationSec()).toBe(600);
    await vi.advanceTimersByTimeAsync(2500);
    expect(timers.sleepDurationSec()).toBe(602);
    expect(timers.rightDurationSec()).toBe(602);
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
    expect(wake.selectedNextBreastSide()).toBe('right');
    wake.selectedNextBreastSide.set('left');
    await storage.saveProfile(profile);
    expect(wake.selectedNextBreastSide()).toBe('left');
    await storage.saveEvent({ ...event, id: 'новое гв', startTime: '2026-10-20T11:00:00Z', endTime: '2026-10-20T11:10:00Z' });
    expect(wake.selectedNextBreastSide()).toBe('right');
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

  it('считает календарный возраст от рождения и выбирает норму без поправки на ПДР', async () => {
    const { storage, wake } = await setup();
    await storage.saveProfile({ ...profile, birthDate: '2026-08-20', dueDate: '2026-10-20' });
    expect(wake.ageDays()).toBe(61);
    expect(wake.norm()).toMatchObject({ minWakeMinutes: 60, maxWakeMinutes: 80 });
    await storage.saveProfile({ ...profile, birthDate: '2026-10-19', dueDate: '2026-08-01' });
    expect(wake.ageDays()).toBe(1);
    expect(wake.norm()).toMatchObject({ minWakeMinutes: 40, maxWakeMinutes: 60 });
  });

  it('находит последние завершённые сон и кормление среди несортированных событий, игнорируя будущее и сцеживание', async () => {
    const { storage, wake } = await setup();
    await storage.saveProfile({ ...profile, birthDate: '2026-10-01' });
    await storage.saveEvent({ id: 'поздний сон', type: 'sleep', startTime: '2026-10-20T10:00:00Z', endTime: '2026-10-20T11:30:00Z', updatedAt: '2026-10-20T11:30:00Z', isNightSleep: false });
    await storage.saveEvent({ id: 'ранний сон', type: 'sleep', startTime: '2026-10-20T08:00:00Z', endTime: '2026-10-20T09:00:00Z', updatedAt: '2026-10-20T09:00:00Z', isNightSleep: false });
    await storage.saveEvent({ id: 'будущий сон', type: 'sleep', startTime: '2026-10-20T12:30:00Z', endTime: '2026-10-20T13:00:00Z', updatedAt: '2026-10-20T13:00:00Z', isNightSleep: false });
    await storage.saveEvent({ id: 'бутылочка', type: 'bottle', content: 'formula', volumeMl: 90, startTime: '2026-10-20T11:00:00Z', updatedAt: '2026-10-20T11:00:00Z' });
    await storage.saveEvent({ id: 'позднее гв', type: 'breastfeeding', startTime: '2026-10-20T11:30:00Z', endTime: '2026-10-20T11:40:00Z', updatedAt: '2026-10-20T11:40:00Z', leftDurationSec: 0, rightDurationSec: 0, lastSide: 'right' });
    await storage.saveEvent({ id: 'сцеживание', type: 'pumping', startTime: '2026-10-20T11:55:00Z', updatedAt: '2026-10-20T11:55:00Z', volumeMl: 50, side: 'both' });
    await storage.saveEvent({ id: 'будущее кормление', type: 'solids', food: 'каша', startTime: '2026-10-20T12:30:00Z', updatedAt: '2026-10-20T12:30:00Z' });
    expect(wake.lastSleepEnd()).toBe('2026-10-20T11:30:00Z');
    expect(wake.lastFeedingTime()).toBe('2026-10-20T11:30:00Z');
    expect(wake.timeSinceLastFeedingSec()).toBe(1800);
  });

  it('оставляет прогресс бодрствования выше единицы после превышения нормы', async () => {
    const { storage, wake } = await setup();
    await storage.saveProfile({ ...profile, birthDate: '2026-10-20' });
    await storage.saveEvent({ id: 'сон', type: 'sleep', startTime: '2026-10-20T10:00:00Z', endTime: '2026-10-20T11:00:00Z', updatedAt: '2026-10-20T11:00:00Z', isNightSleep: false });
    await vi.advanceTimersByTimeAsync(61 * 60_000);
    expect(wake.normProgressRatio()).toBeCloseTo(121 / 60);
  });

  it('поддерживает независимые таймеры, паузу и отмену без создания события', async () => {
    const { storage, timers } = await setup();
    await timers.startSleep();
    await timers.startBreastfeeding('left');
    await vi.advanceTimersByTimeAsync(1_500);
    expect(timers.sleepDurationSec()).toBe(1);
    expect(timers.leftDurationSec()).toBe(1);
    await timers.pauseBreastfeeding();
    const pausedDuration = timers.leftDurationSec();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(timers.leftDurationSec()).toBe(pausedDuration);
    await timers.switchBreast('right');
    await vi.advanceTimersByTimeAsync(1_500);
    await timers.cancelBreastfeeding();
    expect(storage.events()).toEqual([]);
    expect(timers.breastTimer()).toBeNull();
    expect(timers.sleepTimer()).not.toBeNull();
    await timers.cancelSleep();
    expect(storage.events()).toEqual([]);
  });

  it('не меняет состояние работающего таймера при ошибке сохранения', async () => {
    const { storage, timers } = await setup();
    await timers.startSleep();
    const before = timers.sleepTimer();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Ошибка хранилища'); });
    await expect(timers.cancelSleep()).rejects.toThrow('Ошибка хранилища');
    expect(timers.sleepTimer()).toEqual(before);
    expect(storage.events()).toEqual([]);
  });

  it('считает номер календарной недели по точной UTC-границе от ПДР и размечает все 75 ячеек', async () => {
    const { storage, leaps } = await setup();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await storage.saveProfile({ ...profile, dueDate: '2026-10-20' });
    vi.setSystemTime(new Date('2026-10-19T23:59:59.999Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(leaps.currentWeek()).toBe(0);
    expect(leaps.currentCalendarWeek()).toBeNull();
    vi.setSystemTime(new Date('2026-10-20T00:00:00.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(leaps.currentWeek()).toBe(1);
    vi.setSystemTime(new Date('2026-10-27T00:00:00.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(leaps.currentWeek()).toBe(2);
    expect(leaps.calendar()).toHaveLength(75);
    expect(leaps.calendar().filter(week => week.isCurrentWeek).map(week => week.weekNumber)).toEqual([2]);
    expect(leaps.calendar()[0].weather).toBe('sunny');
    expect(leaps.calendar()[13].weather).toBe('stormy');
    expect(leaps.calendar()[17].weather).toBe('fussy');
    expect(leaps.calendar()[19].weather).toBe('stormy');
    expect(leaps.calendar()[20].weather).toBe('sunny');
    expect(leaps.calendar()[3].weather).toBe('stormy');
    expect(leaps.calendar()[4].weather).toBe('stormy');
    vi.setSystemTime(new Date('2028-03-28T00:00:00.000Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(leaps.currentWeek()).toBeGreaterThan(75);
    expect(leaps.currentCalendarWeek()).toBeNull();
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
