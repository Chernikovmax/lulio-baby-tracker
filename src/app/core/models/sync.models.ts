import { isActiveBreastTimer, isActiveSleepTimer, isAnyTrackerEvent, isRecord } from './tracker.models';
import { isSleepRoutine } from './sleep-routine.models';
import { isConfirmedWake, isHistoryAssertion, SLEEP_FACT_UUID } from './sleep-history.models';
import { ASSISTANT_UUID, isSleepPreparation, isSleepCycleSuppression } from './sleep-assistant.models';

export interface SyncConfig {
  enabled: boolean;
  url: string;
  anonKey: string;
  familyId: string;
}

/** Per-entity last-write-wins registers; null event values are durable deletion tombstones. */
export interface SyncEntry {
  revision: number;
  device: string;
  value: unknown;
}
export interface SyncDocument {
  scope: string;
  entries: Record<string, SyncEntry>;
}

/** Durable outbox and server cursor; kept separate from transport-independent journal packets. */
export interface SupabaseCheckpoint {
  scope: string;
  version: number;
  pending: Record<string, SyncEntry>;
}
export interface SyncResponse {
  version: number;
  entries: Record<string, SyncEntry>;
}

export function isSyncConfig(value: unknown): value is SyncConfig {
  return isRecord(value) && typeof value['enabled'] === 'boolean' &&
    ['url', 'anonKey', 'familyId'].every(key => typeof value[key] === 'string');
}
export function isSyncEntries(value: unknown): value is Record<string, SyncEntry> {
  return isRecord(value) && Object.entries(value).every(([key, entry]) => {
    if (!isRecord(entry) || !Number.isSafeInteger(entry['revision']) || (entry['revision'] as number) < 0 ||
        typeof entry['device'] !== 'string' || !/^[a-f0-9-]{36}$/.test(entry['device'])) return false;
    const item = entry['value'];
    if (key === 'sleepTimer') return item === null || isActiveSleepTimer(item);
    if (key === 'breastTimer') return item === null || isActiveBreastTimer(item);
    if (key === 'sleepRoutine') return item === null || isSleepRoutine(item);
    if (key.startsWith('wake:')) return SLEEP_FACT_UUID.test(key.slice(5)) && (item === null || (isConfirmedWake(item) && key === `wake:${item.id}`));
    if (key.startsWith('assertion:')) return SLEEP_FACT_UUID.test(key.slice(10)) && (item === null || (isHistoryAssertion(item) && key === `assertion:${item.id}`));
    if (key.startsWith('preparation:')) return ASSISTANT_UUID.test(key.slice(12)) && (item === null || (isSleepPreparation(item) && key === `preparation:${item.id}`));
    if (key.startsWith('suppression:')) return ASSISTANT_UUID.test(key.slice(12)) && (item === null || (isSleepCycleSuppression(item) && key === `suppression:${item.id}`));
    return key.startsWith('event:') && key.length > 6 &&
      (item === null || (isAnyTrackerEvent(item) && key === `event:${item.id}`));
  });
}
export function isSyncDocument(value: unknown): value is SyncDocument {
  return isRecord(value) && typeof value['scope'] === 'string' && isSyncEntries(value['entries']);
}
export function isSyncResponse(value: unknown): value is SyncResponse {
  return isRecord(value) && Number.isSafeInteger(value['version']) && (value['version'] as number) >= 0 &&
    isSyncEntries(value['entries']);
}
export function isSupabaseCheckpoint(value: unknown): value is SupabaseCheckpoint {
  return isRecord(value) && typeof value['scope'] === 'string' &&
    Number.isSafeInteger(value['version']) && (value['version'] as number) >= 0 && isSyncEntries(value['pending']);
}
export function newerEntry(left: SyncEntry, right: SyncEntry): SyncEntry {
  return left.revision > right.revision || (left.revision === right.revision && left.device > right.device) ? left : right;
}
