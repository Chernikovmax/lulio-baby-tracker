import { isIsoTimestamp, isRecord } from './tracker.models';

export const ASSISTANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export interface SleepCycle {
  id: string;
  scope: string;
  anchorId: string;
  anchorAt: string;
  anchorRevision: string;
}
export interface SleepPreparation extends SleepCycle {
  preparationId: string;
  startedAt: string;
  state: 'preparing' | 'completed' | 'cancelled';
  sleepEventId: string | null;
  completedAt: string | null;
}
export interface SleepCycleSuppression extends SleepCycle { suppressedAt: string; }
const utc = (value: unknown): value is string => isIsoTimestamp(value) && value.endsWith('Z');
function exact(value: Record<string, unknown>, fields: string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every(field => field in value);
}
function cycle(value: Record<string, unknown>): boolean {
  return typeof value['id'] === 'string' && ASSISTANT_UUID.test(value['id']) &&
    typeof value['anchorRevision'] === 'string' && value['anchorRevision'].length > 0 &&
    typeof value['anchorId'] === 'string' && /^(sleep|wake):.+$/.test(value['anchorId']) && utc(value['anchorAt']) &&
    typeof value['scope'] === 'string' && value['scope'].length > 0;
}
export function isSleepPreparation(value: unknown): value is SleepPreparation {
  if (!isRecord(value) || !cycle(value) || !exact(value, ['id', 'scope', 'anchorId', 'anchorAt', 'anchorRevision', 'preparationId', 'startedAt', 'state', 'sleepEventId', 'completedAt']) ||
    typeof value['preparationId'] !== 'string' || !ASSISTANT_UUID.test(value['preparationId']) || !utc(value['startedAt']) ||
    Date.parse(value['startedAt']) < Date.parse(value['anchorAt'] as string)) return false;
  if (value['state'] === 'completed') return value['sleepEventId'] === value['id'] && utc(value['completedAt']) &&
    Date.parse(value['completedAt']) >= Date.parse(value['startedAt']);
  return (value['state'] === 'preparing' || value['state'] === 'cancelled') && value['sleepEventId'] === null && value['completedAt'] === null;
}
export function isSleepCycleSuppression(value: unknown): value is SleepCycleSuppression {
  return isRecord(value) && cycle(value) && exact(value, ['id', 'scope', 'anchorId', 'anchorAt', 'anchorRevision', 'suppressedAt']) && utc(value['suppressedAt']);
}

/** UUID-v5 in the URL namespace: concurrent parents allocate the same sleep identity for a cycle. */
export async function sleepCycleId(scope: string, anchorId: string): Promise<string> {
  const namespace = Uint8Array.from([0x6b, 0xa7, 0xb8, 0x11, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8]);
  const name = new TextEncoder().encode(JSON.stringify(['baby-tracker-sleep-cycle', scope, anchorId]));
  const bytes = new Uint8Array(namespace.length + name.length);
  bytes.set(namespace); bytes.set(name, namespace.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)).slice(0, 16);
  hash[6] = (hash[6] & 15) | 0x50; hash[8] = (hash[8] & 63) | 0x80;
  const hex = [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
