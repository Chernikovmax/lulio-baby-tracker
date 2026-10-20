import { isActiveBreastTimer, isActiveSleepTimer, isAnyTrackerEvent, isRecord } from './tracker.models';

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
    return key.startsWith('event:') && key.length > 6 &&
      (item === null || (isAnyTrackerEvent(item) && key === `event:${item.id}`));
  });
}
export function isSyncDocument(value: unknown): value is SyncDocument {
  return isRecord(value) && typeof value['scope'] === 'string' && isSyncEntries(value['entries']);
}
export function newerEntry(left: SyncEntry, right: SyncEntry): SyncEntry {
  return left.revision > right.revision || (left.revision === right.revision && left.device > right.device) ? left : right;
}
