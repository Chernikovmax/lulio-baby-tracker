import { WAKE_NORMS } from '../constants/wake-norms.const';
import type { TrackerData, SleepEvent } from '../models/tracker.models';
import type { SyncDocument } from '../models/sync.models';
import { calendarAgeMonths, calendarAnniversary, routineDate, routineInstant, targetNight } from './sleep-calendar';
import { historyWakeGaps } from './sleep-history';

export interface ForecastInput extends TrackerData {
  scope: string;
  importGeneration: number;
  journal?: SyncDocument | null;
}
export interface SleepForecast {
  state: 'disabled' | 'unknown' | 'sleeping' | 'out-of-age' | 'ready' | 'overdue';
  scope: string;
  anchor: { id: string; at: string } | null;
  inputVersion: string;
  kind: 'day' | 'night' | null;
  ordinal: number | null;
  predictedSleepAt: string | null;
  preparationAt: string | null;
  range: { from: string; to: string } | null;
  targetNight: { from: string; to: string; localDate: string; collapsedByDst: boolean } | null;
  nightConflict: 'before-target' | 'after-target' | null;
  source: 'none' | 'age-prior' | 'blended-history';
  sampleCount: number;
  sampleKind: 'day' | 'day-ordinal' | 'night' | null;
  historyMedianMinutes: number | null;
  historyWeight: number;
  reasons: string[];
  applicableUntil: string | null;
}
const MINUTE = 60_000;
const compareIds = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
/** Existing engineering priors; calendar bands, never clinical precision or a feeding timetable. */
export function ageWakePrior(months: number): { min: number; max: number } | null {
  if (months < 0 || months >= 18) return null;
  const index = months < 6 ? months : months < 8 ? 6 : months < 12 ? 7 : 8;
  const norm = WAKE_NORMS[index];
  return { min: norm.minWakeMinutes, max: norm.maxWakeMinutes };
}

/** No wall-clock reads, mutations or I/O. All times are UTC instants; now only gates applicability. */
export function calculateSleepForecast(input: ForecastInput, now: number): SleepForecast {
  const sleeps = input.events.filter((event): event is SleepEvent => event.type === 'sleep');
  const months = input.profile && input.sleepRoutine
    ? calendarAgeMonths(input.profile.birthDate, routineDate(now, input.sleepRoutine.timeZone)) : -1;
  const relevantJournal = Object.entries(input.journal?.entries ?? {}).filter(([key]) => key === 'sleepRoutine' ||
    key === 'sleepTimer' || key.startsWith('wake:') || key.startsWith('assertion:') ||
    (key.startsWith('event:') && sleeps.some(event => key === `event:${event.id}`)))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, entry.revision, entry.device]);
  const inputVersion = JSON.stringify([input.scope, input.importGeneration, input.profile, input.sleepRoutine,
    sleeps.slice().sort(compareIds).map(event => [event, Date.parse(event.endTime) <= now]),
    (input.confirmedWakes ?? []).slice().sort(compareIds).map(wake => [wake, Date.parse(wake.at) <= now]),
    (input.historyAssertions ?? []).slice().sort(compareIds), input.activeTimers.sleepTimer, relevantJournal, months]);
  const result: SleepForecast = { state: 'unknown', scope: input.scope, anchor: null, inputVersion,
    kind: null, ordinal: null, predictedSleepAt: null, preparationAt: null, range: null, targetNight: null,
    nightConflict: null, source: 'none', sampleCount: 0, sampleKind: null, historyMedianMinutes: null,
    historyWeight: 0, reasons: [], applicableUntil: null };
  const routine = input.sleepRoutine;
  if (!routine?.assistantEnabled) return { ...result, state: 'disabled', reasons: ['assistant-disabled'] };
  if (input.activeTimers.sleepTimer) return { ...result, state: 'sleeping', reasons: ['active-sleep-including-pause'] };
  if (!input.profile) return { ...result, reasons: ['profile-required'] };
  const prior = ageWakePrior(months);
  result.applicableUntil = new Date(routineInstant(calendarAnniversary(input.profile.birthDate, 18), '00:00', routine.timeZone)).toISOString();
  if (!prior) return { ...result, state: 'out-of-age', reasons: ['outside-birth-until-18-calendar-months'] };
  const eligible = sleeps.filter(event => Date.parse(event.endTime) <= now && Date.parse(event.endTime) > Date.parse(event.startTime) &&
    !sleeps.some(other => other.id !== event.id && Date.parse(other.startTime) < Date.parse(event.endTime) && Date.parse(other.endTime) > Date.parse(event.startTime)));
  const anchors = eligible.map(event => ({ id: `sleep:${event.id}`, at: event.endTime }));
  for (const wake of input.confirmedWakes ?? []) {
    if (Date.parse(wake.at) <= now && !sleeps.some(sleep => Date.parse(wake.at) >= Date.parse(sleep.startTime) && Date.parse(wake.at) < Date.parse(sleep.endTime))) {
      anchors.push({ id: `wake:${wake.id}`, at: wake.at });
    }
  }
  anchors.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || compareIds(a, b));
  const anchor = anchors[0];
  if (!anchor) return { ...result, reasons: ['confirmed-wake-required', 'no-midnight-anchor'] };
  result.anchor = anchor;
  const anchorMs = Date.parse(anchor.at);
  const night = targetNight(anchorMs, routine.nightStartFrom, routine.nightStartTo, routine.timeZone);
  const gaps = historyWakeGaps(input.events, input.historyAssertions ?? [], now);
  const anchorSleep = eligible.find(event => anchor.id === `sleep:${event.id}`);
  const previousNight = eligible.filter(event => event.isNightSleep && Date.parse(event.endTime) <= anchorMs &&
    routineDate(Date.parse(event.endTime), routine.timeZone) === routineDate(anchorMs, routine.timeZone))
    .sort((a, b) => Date.parse(b.endTime) - Date.parse(a.endTime))[0];
  const naps = !anchorSleep || !previousNight ? null : anchorSleep.isNightSleep ? 0 :
    gaps.find(gap => gap.after.id === anchorSleep.id)?.ordinal ?? null;
  const midpoint = (prior.min + prior.max) / 2;
  // Count is a reference, not a restriction: no sleep recording/action is prevented by this choice.
  const kind = (naps !== null && naps >= routine.daytimeNaps) || routine.daytimeNaps === 0 || anchorMs + midpoint * MINUTE >= night.start ? 'night' : 'day';
  const ordinal = kind === 'day' && naps !== null ? naps + 1 : null;
  const comparable = gaps.filter(gap => gap.valid && gap.status === 'complete' && Date.parse(gap.endAt) <= anchorMs &&
    Date.parse(gap.endAt) >= anchorMs - 14 * 86_400_000 && gap.after.isNightSleep === (kind === 'night'));
  const ordinalSamples = ordinal === null ? [] : comparable.filter(gap => gap.ordinal === ordinal);
  const samples = kind === 'day' && ordinalSamples.length >= 5 ? ordinalSamples : comparable;
  const minutes = samples.map(gap => (Date.parse(gap.endAt) - Date.parse(gap.startAt)) / MINUTE).sort((a, b) => a - b);
  const n = minutes.length;
  const median = n ? (minutes[Math.floor((n - 1) / 2)] + minutes[Math.floor(n / 2)]) / 2 : null;
  const weight = n >= 5 ? Math.min(0.8, n / (n + 5)) : 0;
  const estimate = midpoint * (1 - weight) + (median ?? midpoint) * weight;
  const predicted = anchorMs + estimate * MINUTE;
  const iso = (instant: number) => new Date(Math.round(instant)).toISOString();
  return { ...result, state: now >= predicted ? 'overdue' : 'ready', kind, ordinal,
    predictedSleepAt: iso(predicted), preparationAt: iso(predicted - (kind === 'night' ? routine.nightPreparationMinutes : routine.dayPreparationMinutes) * MINUTE),
    // Engineering range translated by the same transparent blend, not a statistical confidence interval.
    range: { from: iso(anchorMs + (prior.min * (1 - weight) + (median ?? midpoint) * weight) * MINUTE),
      to: iso(anchorMs + (prior.max * (1 - weight) + (median ?? midpoint) * weight) * MINUTE) },
    targetNight: { from: iso(night.start), to: iso(night.end), localDate: night.localDate, collapsedByDst: night.collapsedByDst },
    nightConflict: kind === 'night' && predicted < night.start ? 'before-target' : predicted > night.end ? 'after-target' : null,
    source: weight ? 'blended-history' : 'age-prior', sampleCount: n,
    sampleKind: kind === 'night' ? 'night' : ordinalSamples.length >= 5 ? 'day-ordinal' : 'day',
    historyMedianMinutes: median, historyWeight: weight,
    reasons: ['nonclinical-engineering-prior', weight ? 'confirmed-history-median-blend' : 'fewer-than-five-confirmed-comparable-gaps',
      ...(gaps.some(gap => !gap.valid || gap.status !== 'complete') ? ['unknown-incomplete-stale-or-conflicting-gaps-excluded'] : []),
      ...(night.collapsedByDst ? ['dst-gap-collapsed-target-range'] : []),
      ...((kind === 'night' && predicted < night.start) || predicted > night.end ? ['target-night-conflict-do-not-delay-sleep-to-fit'] : []),
      ...(months < 4 ? ['newborn-variability-no-rigid-schedule-or-feeding-restriction'] : []), 'edd-not-used-for-sleep-age'] };
}
