import { assertionMatches, type HistoryAssertion } from '../models/sleep-history.models';
import type { AnyTrackerEvent, SleepEvent } from '../models/tracker.models';

export interface WakeGap {
  before: SleepEvent;
  after: SleepEvent;
  startAt: string;
  endAt: string;
  status: 'unknown' | 'complete' | 'incomplete';
  stale: boolean;
  valid: boolean;
  ordinal: number | null;
}
/** Whole sleep spans, not individual pauses: a pause never becomes a training wake cycle. */
export function historyWakeGaps(events: readonly AnyTrackerEvent[], assertions: readonly HistoryAssertion[], now: number): WakeGap[] {
  const sleeps = events.filter((event): event is SleepEvent => event.type === 'sleep')
    .slice().sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const conflicted = new Set<string>();
  for (let i = 0; i < sleeps.length; i++) {
    const sleep = sleeps[i];
    if (Date.parse(sleep.endTime) <= Date.parse(sleep.startTime) || Date.parse(sleep.endTime) > now) conflicted.add(sleep.id);
    for (let j = i + 1; j < sleeps.length && Date.parse(sleeps[j].startTime) < Date.parse(sleep.endTime); j++) {
      conflicted.add(sleep.id); conflicted.add(sleeps[j].id);
    }
  }
  let ordinal: number | null = null;
  const gaps: WakeGap[] = [];
  for (let i = 1; i < sleeps.length; i++) {
    const before = sleeps[i - 1], after = sleeps[i];
    if (before.isNightSleep) ordinal = 1;
    else if (ordinal !== null) ordinal++;
    const start = Date.parse(before.endTime), end = Date.parse(after.startTime);
    const related = assertions.filter(a => a.boundaries[0].sleepId === before.id && a.boundaries[1].sleepId === after.id);
    const current = related.filter(a => assertionMatches(a, before, after));
    const incomplete = current.some(a => a.status === 'incomplete' && Date.parse(a.startAt) < end && Date.parse(a.endAt) > start);
    const complete = current.some(a => a.status === 'complete' && Date.parse(a.startAt) <= start && Date.parse(a.endAt) >= end);
    const valid = end > start && !conflicted.has(before.id) && !conflicted.has(after.id);
    if (!valid || incomplete || !complete) ordinal = null;
    gaps.push({ before, after, startAt: before.endTime, endAt: after.startTime,
      status: incomplete ? 'incomplete' : complete ? 'complete' : 'unknown',
      stale: related.length > current.length, valid, ordinal: after.isNightSleep ? null : ordinal });
  }
  return gaps;
}
