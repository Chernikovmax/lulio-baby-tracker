import { describe, expect, it } from 'vitest';
import type { AnyTrackerEvent, SleepEvent } from '../../core/models/tracker.models';
import { calculateStats } from './stats-calculations';

const today = new Date(2026, 9, 20).getTime();
const now = new Date(2026, 9, 20, 18).getTime();
function sleep(id: string, start: Date, end: Date, night: boolean): SleepEvent {
  return { id, type: 'sleep', startTime: start.toISOString(), endTime: end.toISOString(), isNightSleep: night, updatedAt: end.toISOString() };
}

describe('Статистика периода', () => {
  it('обрезает сон по границам календарных суток и не удваивает пересечения', () => {
    const events = [
      sleep('ночь', new Date(2026, 9, 19, 22), new Date(2026, 9, 20, 6), true),
      sleep('пересечение', new Date(2026, 9, 20, 4), new Date(2026, 9, 20, 7), true),
      sleep('день', new Date(2026, 9, 20, 10), new Date(2026, 9, 20, 11), false),
    ];
    const stats = calculateStats(events, today, 7, now);
    expect(stats.days.at(-2)?.nightSleepSec).toBe(2 * 3600);
    expect(stats.days.at(-1)?.nightSleepSec).toBe(7 * 3600);
    expect(stats.averageNightSec).toBe(9 * 3600 / 7);
    expect(stats.averageDaySec).toBe(3600 / 7);
    expect(stats.days.at(-2)?.blocks.find(block => block.night)?.end).toBe(100);
    expect(stats.days.at(-1)?.blocks.find(block => block.night)?.start).toBe(0);
    expect(stats.averageWakeSec).toBe(3 * 3600);
  });

  it('учитывает предшествующий периоду сон и исключает вложенные интервалы из окон бодрствования', () => {
    const events = [
      sleep('следующий', new Date(2026, 9, 14, 10), new Date(2026, 9, 14, 11), false),
      sleep('вложенный', new Date(2026, 9, 13, 21), new Date(2026, 9, 13, 22), true),
      sleep('предыдущий', new Date(2026, 9, 13, 20), new Date(2026, 9, 14, 6), true),
    ];
    expect(calculateStats(events, today, 7, now).averageWakeSec).toBe(4 * 3600);
  });

  it('переключает границы периода и считает кормления, но не сцеживания или будущее', () => {
    const at = new Date(2026, 9, 10, 12).toISOString();
    const events: AnyTrackerEvent[] = [
      { id: 'еда', type: 'bottle', content: 'formula', volumeMl: 90, startTime: at, updatedAt: at },
      { id: 'сцеживание', type: 'pumping', side: 'both', volumeMl: 90, startTime: at, updatedAt: at },
      { id: 'будущее', type: 'solids', food: 'Пюре', startTime: new Date(2026, 9, 20, 19).toISOString(), updatedAt: at },
    ];
    const short = calculateStats(events, today, 7, now);
    expect(short.averageFeedings).toBe(0);
    expect(short.averageWakeSec).toBeNull();
    expect(short.averageNightSec).toBeNull();
    expect(calculateStats(events, today, 14, now).averageFeedings).toBe(1 / 14);
  });
});
