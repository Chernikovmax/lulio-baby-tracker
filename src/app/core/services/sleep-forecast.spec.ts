import { describe, expect, it } from 'vitest';
import { calculateSleepForecast, type ForecastInput } from './sleep-forecast';
import { calendarAnniversary, routineDayBounds, routineInstant, targetNight } from './sleep-calendar';
import { sleepBoundary } from '../models/sleep-history.models';
import type { SleepEvent } from '../models/tracker.models';

const now = Date.parse('2026-10-24T08:00:00Z');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base: ForecastInput = { scope: 'local', importGeneration: 0,
  profile: { id: 'baby', name: 'Synthetic', birthDate: '2026-06-01', dueDate: '2026-07-01', gender: 'girl' },
  events: [], activeTimers: { sleepTimer: null, breastTimer: null }, confirmedWakes: [], historyAssertions: [],
  sleepRoutine: { version: 1, timeZone: 'UTC', nightStartFrom: '20:00', nightStartTo: '21:00', daytimeNaps: 3,
    dayPreparationMinutes: 10, nightPreparationMinutes: 20, assistantEnabled: true } };
function history(): ForecastInput {
  const input = structuredClone(base);
  for (let day = 18; day <= 22; day++) {
    const before: SleepEvent = { id: `night-${day}`, type: 'sleep', startTime: `2026-10-${day}T00:00:00Z`,
      endTime: `2026-10-${day}T06:00:00Z`, updatedAt: `2026-10-${day}T06:00:00Z`, isNightSleep: true };
    const after: SleepEvent = { id: `nap-${day}`, type: 'sleep', startTime: `2026-10-${day}T09:00:00Z`,
      endTime: `2026-10-${day}T10:00:00Z`, updatedAt: `2026-10-${day}T10:00:00Z`, isNightSleep: false };
    input.events.push(before, after);
    input.historyAssertions!.push({ id: uuid(day), startAt: before.endTime, endAt: after.startTime, status: 'complete',
      boundaries: [sleepBoundary(before), sleepBoundary(after)] });
  }
  input.confirmedWakes = [{ id: uuid(1), at: '2026-10-24T08:00:00Z' }];
  return input;
}

describe('Explainable nearest sleep forecast', () => {
  it('never invents a midnight wake; manual confirmed anchor yields an age prior with preparation', () => {
    expect(calculateSleepForecast(base, now)).toMatchObject({ state: 'unknown', anchor: null, predictedSleepAt: null });
    const input = { ...base, confirmedWakes: [{ id: uuid(1), at: '2026-10-24T08:00:00Z' }] };
    const forecast = calculateSleepForecast(input, now);
    expect(forecast).toMatchObject({ state: 'ready', source: 'age-prior', sampleCount: 0, kind: 'day',
      predictedSleepAt: '2026-10-24T10:00:00.000Z', preparationAt: '2026-10-24T09:50:00.000Z' });
    expect(calculateSleepForecast(input, now)).toEqual(forecast);
    expect(calculateSleepForecast(input, now + 3 * 3600_000)).toMatchObject({ state: 'overdue',
      predictedSleepAt: forecast.predictedSleepAt, inputVersion: forecast.inputVersion, anchor: forecast.anchor });
  });

  it('five explicitly complete comparable gaps shift the estimate by a transparent median blend', () => {
    const input = history(), forecast = calculateSleepForecast(input, now);
    expect(forecast).toMatchObject({ source: 'blended-history', sampleCount: 5, historyMedianMinutes: 180,
      historyWeight: 0.5, predictedSleepAt: '2026-10-24T10:30:00.000Z' });
    const reordered = structuredClone(input);
    reordered.events.reverse(); reordered.historyAssertions!.reverse();
    expect(calculateSleepForecast(reordered, now)).toEqual(forecast);
    input.historyAssertions![0].status = 'incomplete';
    expect(calculateSleepForecast(input, now)).toMatchObject({ source: 'age-prior', sampleCount: 4,
      predictedSleepAt: '2026-10-24T10:00:00.000Z' });
    input.historyAssertions = [];
    expect(calculateSleepForecast(input, now)).toMatchObject({ source: 'age-prior', sampleCount: 0 });
  });

  it('incomplete overlapping assertions override complete and boundary edits require reconfirmation', () => {
    const input = history();
    const assertion = input.historyAssertions![0];
    input.historyAssertions!.push({ ...assertion, id: uuid(99), status: 'incomplete',
      startAt: '2026-10-18T07:00:00Z', endAt: '2026-10-18T08:00:00Z' });
    expect(calculateSleepForecast(input, now).sampleCount).toBe(4);
    input.historyAssertions!.pop();
    const boundary = input.events[0] as SleepEvent;
    boundary.endTime = '2026-10-18T06:30:00Z'; // Same updatedAt must not bypass invalidation.
    expect(calculateSleepForecast(input, now).sampleCount).toBe(4);
    assertion.boundaries[0] = sleepBoundary(boundary);
    expect(calculateSleepForecast(input, now).sampleCount).toBe(5);
  });

  it('excludes future, overlapping and zero-duration boundaries without deleting raw history', () => {
    const input = history();
    const first = input.events[0] as SleepEvent;
    input.events.push({ ...first, id: 'overlap', startTime: '2026-10-18T05:30:00Z', endTime: '2026-10-18T06:15:00Z' });
    expect(calculateSleepForecast(input, now).sampleCount).toBe(4);
    input.events = input.events.filter(event => event.id !== 'overlap');
    first.endTime = first.startTime;
    expect(calculateSleepForecast(input, now).sampleCount).toBe(4);
    const future = structuredClone(base);
    future.events = [{ ...first, startTime: '2026-10-25T01:00:00Z', endTime: '2026-10-25T02:00:00Z' }];
    expect(calculateSleepForecast(future, now).anchor).toBeNull();
  });

  it('retains a completed sleep cycle identity across edits while changing the input version', () => {
    const input = history(); input.confirmedWakes = [];
    const old = calculateSleepForecast(input, now);
    const anchor = input.events.at(-1) as SleepEvent;
    anchor.endTime = '2026-10-22T10:30:00Z';
    const edited = calculateSleepForecast(input, now);
    expect(edited.anchor?.id).toBe(old.anchor?.id);
    expect(edited.anchor?.at).toBe(anchor.endTime);
    expect(edited.inputVersion).not.toBe(old.inputVersion);
    input.events = [];
    expect(calculateSleepForecast(input, now).state).toBe('unknown');
  });

  it('separates night samples, exposes target conflict and never forces predicted sleep into the routine', () => {
    const input = history(); input.sleepRoutine!.daytimeNaps = 0;
    const forecast = calculateSleepForecast(input, now);
    expect(forecast).toMatchObject({ kind: 'night', sampleCount: 0, source: 'age-prior',
      predictedSleepAt: '2026-10-24T10:00:00.000Z', nightConflict: 'before-target', preparationAt: '2026-10-24T09:40:00.000Z' });
    expect(forecast.reasons).toContain('target-night-conflict-do-not-delay-sleep-to-fit');
  });

  it('returns disabled, paused-sleeping and out-of-age states without a forecast', () => {
    const input = history(); input.sleepRoutine!.assistantEnabled = false;
    expect(calculateSleepForecast(input, now).state).toBe('disabled');
    input.sleepRoutine!.assistantEnabled = true;
    input.activeTimers.sleepTimer = { startedAt: '2026-10-24T07:00:00Z', pausedAt: '2026-10-24T07:30:00Z', isNightSleep: false };
    expect(calculateSleepForecast(input, now)).toMatchObject({ state: 'sleeping', predictedSleepAt: null });
    input.activeTimers.sleepTimer = null; input.profile!.birthDate = '2025-04-24';
    expect(calculateSleepForecast(input, now)).toMatchObject({ state: 'out-of-age', predictedSleepAt: null });
  });

  it('uses calendar birthdays with month-end clamp in the saved zone, not EDD or fixed days', () => {
    expect(calendarAnniversary('2024-08-31', 18)).toBe('2026-02-28');
    const input = history(); input.profile!.birthDate = '2024-08-31'; input.sleepRoutine!.timeZone = 'America/New_York';
    expect(calculateSleepForecast(input, Date.parse('2026-02-28T04:59:59Z')).state).not.toBe('out-of-age');
    expect(calculateSleepForecast(input, Date.parse('2026-02-28T05:00:00Z')).state).toBe('out-of-age');
    const young = history(); const before = calculateSleepForecast(young, now);
    young.profile!.dueDate = '2025-01-01';
    expect(calculateSleepForecast(young, now).predictedSleepAt).toBe(before.predictedSleepAt);
  });

  it('selects same-ordinal windows only with a confirmed chain, separately from the evening sample', () => {
    const input = history(); input.confirmedWakes = [];
    for (let i = 0; i < input.events.length; i += 2) {
      const before = input.events[i] as SleepEvent, first = input.events[i + 1] as SleepEvent;
      const date = first.startTime.slice(0, 10);
      first.startTime = `${date}T07:00:00Z`; first.endTime = `${date}T08:00:00Z`;
      input.historyAssertions![i / 2].endAt = first.startTime;
      input.historyAssertions![i / 2].boundaries = [sleepBoundary(before), sleepBoundary(first)];
    }
    const firsts = input.events.filter((event): event is SleepEvent => event.type === 'sleep' && !event.isNightSleep);
    for (const [i, first] of firsts.entries()) {
      const date = first.startTime.slice(0, 10);
      const second: SleepEvent = { ...first, id: `second-${i}`, startTime: `${date}T12:00:00Z`, endTime: `${date}T13:00:00Z` };
      input.events.push(second);
      input.historyAssertions!.push({ id: uuid(50 + i), startAt: first.endTime, endAt: second.startTime,
        status: 'complete', boundaries: [sleepBoundary(first), sleepBoundary(second)] });
    }
    input.events.push({ id: 'current-night', type: 'sleep', startTime: '2026-10-24T00:00:00Z',
      endTime: '2026-10-24T06:00:00Z', updatedAt: '2026-10-24T06:00:00Z', isNightSleep: true });
    expect(calculateSleepForecast(input, now)).toMatchObject({ ordinal: 1, sampleKind: 'day-ordinal', sampleCount: 5,
      historyMedianMinutes: 60, predictedSleepAt: '2026-10-24T07:30:00.000Z' });
    for (const assertion of input.historyAssertions!.slice(0, 5)) assertion.status = 'incomplete';
    expect(calculateSleepForecast(input, now)).toMatchObject({ sampleKind: 'day', sampleCount: 5, historyMedianMinutes: 240 });
    input.sleepRoutine!.daytimeNaps = 0;
    expect(calculateSleepForecast(input, now)).toMatchObject({ sampleKind: 'night', sampleCount: 0 });
  });

  it.each([
    ['2026-09-24', '2026-10-24T09:02:30.000Z'],
    ['2026-07-24', '2026-10-24T09:35:00.000Z'],
    ['2026-06-24', '2026-10-24T10:00:00.000Z'],
    ['2025-10-24', '2026-10-24T12:15:00.000Z'],
  ])('switches engineering priors on calendar-month boundaries for birth %s', (birthDate, expected) => {
    const input = structuredClone(base); input.profile!.birthDate = birthDate;
    input.confirmedWakes = [{ id: uuid(1), at: '2026-10-24T08:00:00Z' }];
    expect(calculateSleepForecast(input, now).predictedSleepAt).toBe(expected);
  });

  it('resolves DST gaps forward, folds first, and short/long day assertions as calendar days', () => {
    expect(new Date(routineInstant('2026-03-08', '02:30', 'America/New_York')).toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(new Date(routineInstant('2026-11-01', '01:30', 'America/New_York')).toISOString()).toBe('2026-11-01T05:30:00.000Z');
    const spring = routineDayBounds('2026-03-08', 'America/New_York'), fall = routineDayBounds('2026-11-01', 'America/New_York');
    expect((spring.end - spring.start) / 3600_000).toBe(23); expect((fall.end - fall.start) / 3600_000).toBe(25);
    expect(targetNight(Date.parse('2026-10-24T00:30:00Z'), '23:00', '01:00', 'UTC')).toEqual({
      start: Date.parse('2026-10-23T23:00:00Z'), end: Date.parse('2026-10-24T01:00:00Z'), localDate: '2026-10-23', collapsedByDst: false });
    expect(targetNight(Date.parse('2026-03-08T05:00:00Z'), '02:30', '03:00', 'America/New_York')).toEqual({
      start: Date.parse('2026-03-08T07:30:00Z'), end: Date.parse('2026-03-08T07:30:00Z'), localDate: '2026-03-08', collapsedByDst: true });
  });
});
