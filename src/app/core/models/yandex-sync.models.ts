import { isRecord } from './tracker.models';
import { isSyncDocument, type SyncDocument } from './sync.models';

export const YANDEX_CONFIG_KEY = 'baby-tracker.yandex.v1';
export const FAMILY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const YANDEX_MARKER = 'baby-tracker-family.json';

export interface YandexSettings {
  clientId: string;
  folderPath: string;
  familyId: string;
}
export interface YandexConfig extends YandexSettings {
  enabled: boolean;
  processed: string[];
  published: string;
  lastSyncAt: string;
}
export const EMPTY_YANDEX_CONFIG: YandexConfig = {
  clientId: '', folderPath: '', familyId: '', enabled: false,
  processed: [], published: '', lastSyncAt: '',
};
export function isYandexConfig(value: unknown): value is YandexConfig {
  return isRecord(value) && typeof value['enabled'] === 'boolean' &&
    ['clientId', 'folderPath', 'familyId', 'published', 'lastSyncAt'].every(key => typeof value[key] === 'string') &&
    Array.isArray(value['processed']) && value['processed'].every(item => typeof item === 'string');
}
export function yandexScope(familyId: string): string { return `yandex-disk:${familyId}`; }

export interface YandexPacket {
  format: 'baby-tracker-sync';
  version: 1 | 2 | 3 | 4;
  familyId: string;
  document: SyncDocument;
}
export function isYandexPacket(value: unknown, familyId: string): value is YandexPacket {
  return isRecord(value) && value['format'] === 'baby-tracker-sync' && [1, 2, 3, 4].includes(value['version'] as number) &&
    value['familyId'] === familyId && isSyncDocument(value['document']) &&
    value['document'].scope === yandexScope(familyId);
}
/** Values are identified by their durable revision/device pair, not array order. */
export function journalSignature(document: SyncDocument | null): string {
  if (!document) return '';
  return JSON.stringify(Object.keys(document.entries).sort().map(key => {
    const entry = document.entries[key];
    return [key, entry.revision, entry.device];
  }));
}
