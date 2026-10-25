import { isIsoTimestamp, isRecord, type SleepEvent } from './tracker.models';

export interface ConfirmedWake { id: string; at: string; }
/** Content revision survives backup and transport changes; any boundary edit invalidates confirmation. */
export interface SleepBoundary { sleepId: string; revision: string; }
export interface HistoryAssertion {
  id: string;
  startAt: string;
  endAt: string;
  status: 'complete' | 'incomplete';
  boundaries: [SleepBoundary, SleepBoundary];
}
export const SLEEP_FACT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => key in value);
export function isConfirmedWake(value: unknown): value is ConfirmedWake {
  return isRecord(value) && exact(value, ['id', 'at']) && typeof value['id'] === 'string' &&
    SLEEP_FACT_UUID.test(value['id']) && isIsoTimestamp(value['at']) && value['at'].endsWith('Z');
}
export function isHistoryAssertion(value: unknown): value is HistoryAssertion {
  return isRecord(value) && exact(value, ['id', 'startAt', 'endAt', 'status', 'boundaries']) &&
    typeof value['id'] === 'string' && SLEEP_FACT_UUID.test(value['id']) &&
    isIsoTimestamp(value['startAt']) && value['startAt'].endsWith('Z') &&
    isIsoTimestamp(value['endAt']) && value['endAt'].endsWith('Z') && Date.parse(value['endAt']) > Date.parse(value['startAt']) &&
    (value['status'] === 'complete' || value['status'] === 'incomplete') &&
    Array.isArray(value['boundaries']) && value['boundaries'].length === 2 && value['boundaries'].every(boundary =>
      isRecord(boundary) && exact(boundary, ['sleepId', 'revision']) && typeof boundary['sleepId'] === 'string' &&
      boundary['sleepId'].length > 0 && typeof boundary['revision'] === 'string' && boundary['revision'].length > 0) &&
    value['boundaries'][0].sleepId !== value['boundaries'][1].sleepId;
}
/** Canonical semantic revision, not a hash with a collision risk or object property order. */
export function sleepBoundary(event: SleepEvent): SleepBoundary {
  return { sleepId: event.id, revision: JSON.stringify([event.startTime, event.endTime, event.updatedAt,
    event.isNightSleep, event.note ?? null, event.tags ?? [], (event.pauses ?? []).map(p => [p.startTime, p.endTime])]) };
}
export function assertionMatches(assertion: HistoryAssertion, before: SleepEvent, after: SleepEvent): boolean {
  return assertion.boundaries[0].sleepId === before.id && assertion.boundaries[1].sleepId === after.id &&
    assertion.boundaries[0].revision === sleepBoundary(before).revision &&
    assertion.boundaries[1].revision === sleepBoundary(after).revision;
}
