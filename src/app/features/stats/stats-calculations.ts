import type { AnyTrackerEvent, SleepEvent } from '../../core/models/tracker.models';

interface Interval { start: number; end: number; }
export interface PatternBlock { start: number; end: number; night: boolean; label: string; }
export interface PatternDay {
  start: number;
  label: string;
  blocks: PatternBlock[];
  feedings: { id: string; position: number; label: string }[];
  daySleepSec: number;
  nightSleepSec: number;
}
const timeLabel = (time: number) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(time);

function merge(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const interval of intervals.sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else result.push({ ...interval });
  }
  return result;
}

/** Local calendar days for boundaries; elapsed milliseconds for durations, wall time for chart positions. */
export function calculateStats(events: readonly AnyTrackerEvent[], today: number, period: number, now: number) {
  const date = new Date(today);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - period + 1).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const sleeps = events.filter((event): event is SleepEvent => event.type === 'sleep' && Date.parse(event.endTime) <= now);
  const categories = [false, true].map(night => ({
    night,
    intervals: merge(sleeps.filter(sleep => sleep.isNightSleep === night).map(sleep => ({ start: Date.parse(sleep.startTime), end: Date.parse(sleep.endTime) }))),
  }));
  const feedings = events.filter(event => ['breastfeeding', 'bottle', 'solids'].includes(event.type) && Date.parse(event.startTime) <= now);
  const days: PatternDay[] = [];
  for (let index = 0; index < period; index++) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() - period + index + 1);
    const from = day.getTime();
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    const position = (time: number) => {
      if (time <= from) return 0;
      if (time >= to) return 100;
      const local = new Date(time);
      return (local.getHours() * 60 + local.getMinutes() + local.getSeconds() / 60) / 1440 * 100;
    };
    const blocks: PatternBlock[] = [];
    let daySleepSec = 0, nightSleepSec = 0;
    for (const { night, intervals } of categories) {
      for (const interval of intervals) {
        const a = Math.max(interval.start, from), b = Math.min(interval.end, to);
        if (b <= a) continue;
        if (night) nightSleepSec += (b - a) / 1000;
        else daySleepSec += (b - a) / 1000;
        // A repeated hour on clock-change days may map backwards; keep the elapsed interval visible.
        const left = position(a), right = position(b);
        blocks.push({ start: Math.min(left, right), end: Math.max(left, right), night,
          label: `${night ? 'Ночной' : 'Дневной'} сон: ${timeLabel(a)}–${b === to ? '24:00' : timeLabel(b)}` });
      }
    }
    days.push({ start: from, label: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(day), blocks, daySleepSec, nightSleepSec,
      feedings: feedings.filter(event => Date.parse(event.startTime) >= from && Date.parse(event.startTime) < to).map(event => ({
        id: event.id, position: position(Date.parse(event.startTime)),
        label: `${event.type === 'breastfeeding' ? 'Грудное кормление' : event.type === 'bottle' ? 'Бутылочка' : 'Прикорм'}: ${timeLabel(Date.parse(event.startTime))}`,
      })),
    });
  }
  const mergedSleeps = merge(sleeps.map(sleep => ({ start: Date.parse(sleep.startTime), end: Date.parse(sleep.endTime) })));
  const gaps: number[] = [];
  for (let index = 1; index < mergedSleeps.length; index++) {
    const sleep = mergedSleeps[index];
    if (sleep.start >= start && sleep.start < end && sleep.start > mergedSleeps[index - 1].end) gaps.push((sleep.start - mergedSleeps[index - 1].end) / 1000);
  }
  const sleepRecorded = days.some(day => day.blocks.length > 0);
  return { days,
    averageWakeSec: gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : null,
    averageDaySec: sleepRecorded ? days.reduce((sum, day) => sum + day.daySleepSec, 0) / period : null,
    averageNightSec: sleepRecorded ? days.reduce((sum, day) => sum + day.nightSleepSec, 0) / period : null,
    averageFeedings: days.reduce((sum, day) => sum + day.feedings.length, 0) / period,
  };
}
