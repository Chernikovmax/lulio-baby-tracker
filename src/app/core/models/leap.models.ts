import { isRecord } from './tracker.models';

export type WeekWeather = 'sunny' | 'fussy' | 'stormy';
export interface WonderLeap {
  leapNumber: number;
  title: string;
  peakWeek: number;
  startWeek: number;
  endWeek: number;
  whatHappens: string;
  cues: readonly string[];
  newSkills: readonly string[];
}
export interface CalendarWeekItem {
  weekNumber: number;
  weather: WeekWeather;
  leapNumber?: number;
  isCurrentWeek: boolean;
}
export function isWeekWeather(value: unknown): value is WeekWeather {
  return value === 'sunny' || value === 'fussy' || value === 'stormy';
}
function isWeek(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 75;
}
function isLeapNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
}
export function isWonderLeap(value: unknown): value is WonderLeap {
  if (!isRecord(value) || !isLeapNumber(value['leapNumber']) || !isWeek(value['startWeek']) ||
    !isWeek(value['peakWeek']) || !isWeek(value['endWeek'])) return false;
  return value['startWeek'] <= value['peakWeek'] && value['peakWeek'] <= value['endWeek'] &&
    ['title', 'whatHappens'].every(key => typeof value[key] === 'string' && value[key].trim().length > 0) &&
    ['cues', 'newSkills'].every(key => Array.isArray(value[key]) && value[key].length > 0 &&
      value[key].every((item: unknown) => typeof item === 'string' && item.trim().length > 0));
}
export function isCalendarWeekItem(value: unknown): value is CalendarWeekItem {
  return isRecord(value) && isWeek(value['weekNumber']) && isWeekWeather(value['weather']) &&
    typeof value['isCurrentWeek'] === 'boolean' && (value['leapNumber'] === undefined || isLeapNumber(value['leapNumber'])) &&
    (value['weather'] === 'sunny' ? value['leapNumber'] === undefined : isLeapNumber(value['leapNumber']));
}
