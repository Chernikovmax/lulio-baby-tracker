import { isRecord } from './tracker.models';

/** Shared family settings; never contains device permissions or delivery preferences. */
export interface SleepRoutine {
  version: 1;
  timeZone: string;
  nightStartFrom: string;
  nightStartTo: string;
  daytimeNaps: number;
  dayPreparationMinutes: number;
  nightPreparationMinutes: number;
  assistantEnabled: boolean;
}

const keys = ['version', 'timeZone', 'nightStartFrom', 'nightStartTo', 'daytimeNaps',
  'dayPreparationMinutes', 'nightPreparationMinutes', 'assistantEnabled'];
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isRoutineTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+)$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
}

/** Clock-time range, clockwise and inclusive; midnight crossing is intentional, not an error. */
export function nightStartRangeMinutes(from: string, to: string): number | null {
  if (!timePattern.test(from) || !timePattern.test(to)) return null;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const span = (minutes(to) - minutes(from) + 1440) % 1440;
  return span === 0 ? null : span;
}

export function isSleepRoutine(value: unknown): value is SleepRoutine {
  if (!isRecord(value) || Object.keys(value).length !== keys.length || !keys.every(key => key in value)) return false;
  const integerIn = (item: unknown, max: number) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= max;
  return value['version'] === 1 && isRoutineTimeZone(value['timeZone']) &&
    typeof value['nightStartFrom'] === 'string' && typeof value['nightStartTo'] === 'string' &&
    nightStartRangeMinutes(value['nightStartFrom'], value['nightStartTo']) !== null &&
    integerIn(value['daytimeNaps'], 12) && integerIn(value['dayPreparationMinutes'], 180) &&
    integerIn(value['nightPreparationMinutes'], 180) && typeof value['assistantEnabled'] === 'boolean';
}
