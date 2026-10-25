import { isSleepRoutine, type SleepRoutine } from './sleep-routine.models';
import { isConfirmedWake, isHistoryAssertion, type ConfirmedWake, type HistoryAssertion } from './sleep-history.models';
import { isSleepPreparation, isSleepCycleSuppression, ASSISTANT_UUID, type SleepPreparation, type SleepCycleSuppression } from './sleep-assistant.models';

export type EventType = 'sleep' | 'breastfeeding' | 'bottle' | 'solids' | 'pumping' | 'diaper' | 'growth';
export type BreastSide = 'left' | 'right';
export type DiaperState = 'wet' | 'dirty' | 'mixed';
export type BottleContent = 'formula' | 'breast_milk' | 'water';
export type WakeStatusLevel = 'sleeping' | 'optimal' | 'approaching' | 'overtired';
export type SleepTag = 'crib' | 'stroller' | 'arms' | 'co_sleeping';

export interface BabyProfile {
  id: string;
  name: string;
  birthDate: string;
  dueDate: string;
  gender: 'boy' | 'girl';
}
export interface BaseEvent {
  id: string;
  type: EventType;
  startTime: string;
  endTime?: string;
  note?: string;
  updatedAt: string;
}
export interface SleepPause {
  startTime: string;
  endTime: string;
}
export interface SleepEvent extends BaseEvent {
  type: 'sleep';
  endTime: string;
  isNightSleep: boolean;
  pauses?: SleepPause[];
  tags?: SleepTag[];
}
export interface BreastfeedingEvent extends BaseEvent {
  type: 'breastfeeding';
  endTime: string;
  leftDurationSec: number;
  rightDurationSec: number;
  lastSide: BreastSide;
}
export interface BottleEvent extends BaseEvent {
  type: 'bottle';
  content: BottleContent;
  volumeMl: number;
}
export interface SolidsEvent extends BaseEvent {
  type: 'solids';
  food: string;
  amountGrams?: number;
}
export interface PumpingEvent extends BaseEvent {
  type: 'pumping';
  volumeMl: number;
  side: BreastSide | 'both';
}
export interface DiaperEvent extends BaseEvent {
  type: 'diaper';
  state: DiaperState;
}
export interface GrowthEvent extends BaseEvent {
  type: 'growth';
  weightKg?: number;
  heightCm?: number;
  headCm?: number;
}
export type AnyTrackerEvent = SleepEvent | BreastfeedingEvent | BottleEvent | SolidsEvent | PumpingEvent | DiaperEvent | GrowthEvent;
export interface ActiveSleepTimer {
  /** Allocated once at start; legacy snapshots receive an ID during storage migration. */
  id?: string;
  startedAt: string;
  isNightSleep: boolean;
  pausedAt?: string;
  pauses?: SleepPause[];
}
export interface ActiveBreastTimer {
  startedAt: string;
  activeSide: BreastSide | null;
  currentSideStartedAt: string | null;
  accumulatedLeftSec: number;
  accumulatedRightSec: number;
  lastActiveSide: BreastSide;
}
export interface ActiveTimerState {
  sleepTimer: ActiveSleepTimer | null;
  breastTimer: ActiveBreastTimer | null;
}
export interface TrackerData {
  profile: BabyProfile | null;
  events: AnyTrackerEvent[];
  activeTimers: ActiveTimerState;
  /** Absent only in legacy snapshots; persisted as null until a parent explicitly saves a routine. */
  sleepRoutine?: SleepRoutine | null;
  confirmedWakes?: ConfirmedWake[];
  historyAssertions?: HistoryAssertion[];
  sleepPreparations?: SleepPreparation[];
  sleepCycleSuppressions?: SleepCycleSuppression[];
}
export interface TrackerBackup extends TrackerData {
  version: 1 | 2 | 3 | 4;
  exportedAt: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && isIsoDate(value.slice(0, 10)) &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) &&
    Number.isFinite(Date.parse(value));
}
function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function positive(value: unknown): value is number {
  return nonnegative(value) && value > 0;
}
export function isBreastSide(value: unknown): value is BreastSide {
  return value === 'left' || value === 'right';
}
export function isBabyProfile(value: unknown): value is BabyProfile {
  return isRecord(value) && text(value['id']) && text(value['name']) &&
    isIsoDate(value['birthDate']) && isIsoDate(value['dueDate']) &&
    (value['gender'] === 'boy' || value['gender'] === 'girl');
}
function isBaseEvent(value: unknown): value is Record<string, unknown> & BaseEvent {
  return isRecord(value) && text(value['id']) && isIsoTimestamp(value['startTime']) &&
    isIsoTimestamp(value['updatedAt']) &&
    (value['endTime'] === undefined || (isIsoTimestamp(value['endTime']) && Date.parse(value['endTime']) >= Date.parse(value['startTime']))) &&
    (value['note'] === undefined || typeof value['note'] === 'string');
}
export function isSleepEvent(value: unknown): value is SleepEvent {
  return isBaseEvent(value) && value.type === 'sleep' && isIsoTimestamp(value.endTime) &&
    typeof value['isNightSleep'] === 'boolean' && validSleepPauses(value['pauses'], value.startTime, value.endTime) && (value['tags'] === undefined ||
      (Array.isArray(value['tags']) && value['tags'].every(tag => ['crib', 'stroller', 'arms', 'co_sleeping'].includes(tag))));
}
export function isBreastfeedingEvent(value: unknown): value is BreastfeedingEvent {
  return isBaseEvent(value) && value.type === 'breastfeeding' && isIsoTimestamp(value.endTime) &&
    nonnegative(value['leftDurationSec']) && nonnegative(value['rightDurationSec']) && isBreastSide(value['lastSide']) &&
    value['leftDurationSec'] + value['rightDurationSec'] <= (Date.parse(value.endTime) - Date.parse(value.startTime)) / 1000;
}
export function isBottleEvent(value: unknown): value is BottleEvent {
  return isBaseEvent(value) && value.type === 'bottle' &&
    typeof value['content'] === 'string' && ['formula', 'breast_milk', 'water'].includes(value['content']) && positive(value['volumeMl']);
}
export function isSolidsEvent(value: unknown): value is SolidsEvent {
  return isBaseEvent(value) && value.type === 'solids' && text(value['food']) &&
    (value['amountGrams'] === undefined || positive(value['amountGrams']));
}
export function isPumpingEvent(value: unknown): value is PumpingEvent {
  return isBaseEvent(value) && value.type === 'pumping' && nonnegative(value['volumeMl']) &&
    (isBreastSide(value['side']) || value['side'] === 'both');
}
export function isDiaperEvent(value: unknown): value is DiaperEvent {
  return isBaseEvent(value) && value.type === 'diaper' && typeof value['state'] === 'string' && ['wet', 'dirty', 'mixed'].includes(value['state']);
}
export function isGrowthEvent(value: unknown): value is GrowthEvent {
  return isBaseEvent(value) && value.type === 'growth' &&
    ['weightKg', 'heightCm', 'headCm'].some(key => positive(value[key])) &&
    ['weightKg', 'heightCm', 'headCm'].every(key => value[key] === undefined || positive(value[key]));
}
export function isAnyTrackerEvent(value: unknown): value is AnyTrackerEvent {
  if (!isRecord(value)) return false;
  switch (value['type']) {
    case 'sleep': return isSleepEvent(value);
    case 'breastfeeding': return isBreastfeedingEvent(value);
    case 'bottle': return isBottleEvent(value);
    case 'solids': return isSolidsEvent(value);
    case 'pumping': return isPumpingEvent(value);
    case 'diaper': return isDiaperEvent(value);
    case 'growth': return isGrowthEvent(value);
    default: return false;
  }
}
export function isActiveSleepTimer(value: unknown): value is ActiveSleepTimer {
  return isRecord(value) && isIsoTimestamp(value['startedAt']) && typeof value['isNightSleep'] === 'boolean' &&
    (value['id'] === undefined || (typeof value['id'] === 'string' && ASSISTANT_UUID.test(value['id']))) &&
    (value['pausedAt'] === undefined || (isIsoTimestamp(value['pausedAt']) && Date.parse(value['pausedAt']) >= Date.parse(value['startedAt']))) &&
    validSleepPauses(value['pauses'], value['startedAt'], value['pausedAt']);
}
export function isActiveBreastTimer(value: unknown): value is ActiveBreastTimer {
  if (!isRecord(value) || !isIsoTimestamp(value['startedAt']) || !isBreastSide(value['lastActiveSide']) ||
    !nonnegative(value['accumulatedLeftSec']) || !nonnegative(value['accumulatedRightSec'])) return false;
  return value['activeSide'] === null ? value['currentSideStartedAt'] === null :
    isBreastSide(value['activeSide']) && value['activeSide'] === value['lastActiveSide'] &&
    isIsoTimestamp(value['currentSideStartedAt']) && Date.parse(value['currentSideStartedAt']) >= Date.parse(value['startedAt']);
}
export function isActiveTimerState(value: unknown): value is ActiveTimerState {
  return isRecord(value) && (value['sleepTimer'] === null || isActiveSleepTimer(value['sleepTimer'])) &&
    (value['breastTimer'] === null || isActiveBreastTimer(value['breastTimer']));
}
export function isTrackerData(value: unknown): value is TrackerData {
  return isRecord(value) && (value['profile'] === null || isBabyProfile(value['profile'])) &&
    Array.isArray(value['events']) && value['events'].every(isAnyTrackerEvent) &&
    new Set(value['events'].map(event => event.id)).size === value['events'].length && isActiveTimerState(value['activeTimers']) &&
    (value['sleepRoutine'] === undefined || value['sleepRoutine'] === null || isSleepRoutine(value['sleepRoutine'])) &&
    (value['confirmedWakes'] === undefined || (Array.isArray(value['confirmedWakes']) && value['confirmedWakes'].every(isConfirmedWake) &&
      new Set(value['confirmedWakes'].map(item => item.id)).size === value['confirmedWakes'].length)) &&
    (value['historyAssertions'] === undefined || (Array.isArray(value['historyAssertions']) && value['historyAssertions'].every(isHistoryAssertion) &&
      new Set(value['historyAssertions'].map(item => item.id)).size === value['historyAssertions'].length)) &&
    (value['sleepPreparations'] === undefined || (Array.isArray(value['sleepPreparations']) && value['sleepPreparations'].every(isSleepPreparation) &&
      new Set(value['sleepPreparations'].map(item => item.id)).size === value['sleepPreparations'].length)) &&
    (value['sleepCycleSuppressions'] === undefined || (Array.isArray(value['sleepCycleSuppressions']) && value['sleepCycleSuppressions'].every(isSleepCycleSuppression) &&
      new Set(value['sleepCycleSuppressions'].map(item => item.id)).size === value['sleepCycleSuppressions'].length));
}
export function isTrackerBackup(value: unknown): value is TrackerBackup {
  return isTrackerData(value) && isRecord(value) && isIsoTimestamp(value['exportedAt']) &&
    (value['version'] === 1 || (value['version'] === 2 && value['sleepRoutine'] !== undefined) ||
      (value['version'] === 3 && value['sleepRoutine'] !== undefined && value['confirmedWakes'] !== undefined && value['historyAssertions'] !== undefined) ||
      (value['version'] === 4 && value['sleepRoutine'] !== undefined && value['confirmedWakes'] !== undefined && value['historyAssertions'] !== undefined &&
        value['sleepPreparations'] !== undefined && value['sleepCycleSuppressions'] !== undefined));
}

function validSleepPauses(value: unknown, start: string, end?: string): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  let previousEnd = Date.parse(start);
  for (const pause of value) {
    if (!isRecord(pause) || !isIsoTimestamp(pause['startTime']) || !isIsoTimestamp(pause['endTime'])) return false;
    const from = Date.parse(pause['startTime']), to = Date.parse(pause['endTime']);
    if (from < previousEnd || to < from || (end !== undefined && to > Date.parse(end))) return false;
    previousEnd = to;
  }
  return true;
}

/** Actual sleeping intervals, excluding pauses and clipped to the requested bounds. */
export function sleepIntervals(startTime: string, endTime: string, pauses: readonly SleepPause[] = []): { start: number; end: number }[] {
  const end = Date.parse(endTime);
  let cursor = Date.parse(startTime);
  const intervals: { start: number; end: number }[] = [];
  for (const pause of pauses) {
    const from = Math.min(end, Date.parse(pause.startTime));
    if (from > cursor) intervals.push({ start: cursor, end: from });
    cursor = Math.max(cursor, Date.parse(pause.endTime));
  }
  if (cursor < end) intervals.push({ start: cursor, end });
  return intervals;
}

