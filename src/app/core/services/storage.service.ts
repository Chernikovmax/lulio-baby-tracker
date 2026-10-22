import { Service, computed, resource } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  ActiveTimerState, AnyTrackerEvent, BabyProfile, TrackerBackup, TrackerData,
  isAnyTrackerEvent, isBabyProfile, isTrackerBackup, isTrackerData,
} from '../models/tracker.models';
import { SyncDocument, SyncEntry, isSyncDocument, newerEntry } from '../models/sync.models';

interface StoredData extends TrackerData { sync?: SyncDocument }

const STORAGE_KEY = 'baby-tracker.v1';
const EMPTY_DATA: TrackerData = {
  profile: null, events: [], activeTimers: { sleepTimer: null, breastTimer: null },
};

@Service()
export class StorageService {
  // Один снимок: завершение таймера и добавление события сохраняются атомарно.
  private readonly device = crypto.randomUUID();
  private readonly initialRead = Preferences.get({ key: STORAGE_KEY }).then<StoredData>(({ value }) => {
    if (value === null) return structuredClone(EMPTY_DATA);
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new Error('Не удалось прочитать сохранённые данные.'); }
    if (!isTrackerData(parsed)) throw new Error('Сохранённые данные имеют неверный формат.');
    if ('sync' in parsed && !isSyncDocument(parsed.sync)) throw new Error('Повреждены данные синхронизации.');
    return parsed;
  });
  private readonly dataResource = resource({ loader: () => this.initialRead });
  private writes: Promise<void> = Promise.resolve();
  readonly isLoading = this.dataResource.isLoading;
  readonly error = this.dataResource.error;
  readonly profile = computed(() => this.dataResource.hasValue() ? this.dataResource.value().profile : null);
  readonly events = computed<readonly AnyTrackerEvent[]>(() => this.dataResource.hasValue() ? this.dataResource.value().events : []);
  readonly activeTimers = computed<ActiveTimerState>(() => this.dataResource.hasValue() ? this.dataResource.value().activeTimers : EMPTY_DATA.activeTimers);
  readonly syncDocument = computed(() => this.dataResource.hasValue() ? this.dataResource.value().sync ?? null : null);

  async ready(): Promise<void> {
    const initial = await this.initialRead;
    if (!this.dataResource.hasValue()) this.dataResource.value.set(initial);
  }

  /** Finish already queued diary writes before a user-requested application reload. */
  async whenIdle(): Promise<void> {
    await this.writes;
    await this.ready();
  }

  /** Последовательная read–modify–write транзакция; при ошибке записи состояние не меняется. */
  update(transform: (data: TrackerData) => TrackerData): Promise<void> {
    return this.commit(data => {
      const next = transform(data);
      if (!data.sync) return next;
      const entries = { ...data.sync.entries };
      let revision = Date.now();
      for (const entry of Object.values(entries)) revision = Math.max(revision, entry.revision + 1);
      const previous = new Map(data.events.map(event => [event.id, event]));
      const current = new Map(next.events.map(event => [event.id, event]));
      for (const id of new Set([...previous.keys(), ...current.keys()])) {
        if (JSON.stringify(previous.get(id)) !== JSON.stringify(current.get(id))) {
          entries[`event:${id}`] = { revision, device: this.device, value: current.get(id) ?? null };
        }
      }
      for (const key of ['sleepTimer', 'breastTimer'] as const) {
        if (JSON.stringify(data.activeTimers[key]) !== JSON.stringify(next.activeTimers[key])) {
          entries[key] = { revision, device: this.device, value: next.activeTimers[key] };
        }
      }
      return { ...next, sync: { scope: data.sync.scope, entries } };
    });
  }

  /** The replication journal and visible data share the same atomic Preferences write. */
  private commit(transform: (data: StoredData) => StoredData): Promise<void> {
    const operation = this.writes.then(async () => {
      await this.ready();
      const next = transform(structuredClone(this.dataResource.value()!));
      if (!isTrackerData(next)) throw new Error('Невозможно сохранить некорректные данные.');
      const snapshot = JSON.stringify(next);
      if (snapshot === JSON.stringify(this.dataResource.value())) return;
      await Preferences.set({ key: STORAGE_KEY, value: snapshot });
      this.dataResource.value.set(JSON.parse(snapshot) as StoredData);
    });
    this.writes = operation.catch(() => undefined);
    return operation;
  }

  configureSync(scope: string): Promise<void> {
    return this.commit(data => {
      if (data.sync?.scope === scope) return data;
      const entries: Record<string, SyncEntry> = {};
      // Existing data seeds a new family but must not overwrite that family's newer changes.
      for (const event of data.events) entries[`event:${event.id}`] = { revision: 0, device: this.device, value: event };
      for (const key of ['sleepTimer', 'breastTimer'] as const) {
        entries[key] = { revision: 0, device: this.device, value: data.activeTimers[key] };
      }
      return { ...data, sync: { scope, entries } };
    });
  }

  mergeSync(remote: SyncDocument): Promise<void> {
    if (!isSyncDocument(remote)) return Promise.reject(new Error('Неверный формат семейных данных.'));
    return this.commit(data => {
      if (data.sync?.scope !== remote.scope) return data;
      const entries = { ...data.sync.entries };
      for (const [key, entry] of Object.entries(remote.entries)) {
        entries[key] = entries[key] ? newerEntry(entries[key], entry) : entry;
      }
      const events: AnyTrackerEvent[] = [];
      for (const [key, entry] of Object.entries(entries)) {
        if (key.startsWith('event:') && entry.value !== null) events.push(entry.value as AnyTrackerEvent);
      }
      const activeTimers: ActiveTimerState = {
        sleepTimer: (entries['sleepTimer']?.value ?? null) as ActiveTimerState['sleepTimer'],
        breastTimer: (entries['breastTimer']?.value ?? null) as ActiveTimerState['breastTimer'],
      };
      return { ...data, events, activeTimers, sync: { scope: remote.scope, entries } };
    });
  }

  saveProfile(profile: BabyProfile): Promise<void> {
    if (!isBabyProfile(profile)) return Promise.reject(new Error('Проверьте имя, дату рождения и ПДР.'));
    return this.update(data => ({ ...data, profile }));
  }

  saveEvent(event: AnyTrackerEvent): Promise<void> {
    if (!isAnyTrackerEvent(event)) return Promise.reject(new Error('Событие имеет неверный формат.'));
    return this.update(data => ({ ...data, events: [...data.events.filter(item => item.id !== event.id), event] }));
  }

  deleteEvent(id: string): Promise<void> {
    return this.update(data => ({ ...data, events: data.events.filter(event => event.id !== id) }));
  }

  async exportBackup(): Promise<string> {
    await this.writes;
    await this.ready();
    const { profile, events, activeTimers } = this.dataResource.value()!;
    const backup: TrackerBackup = { profile, events, activeTimers, version: 1, exportedAt: new Date().toISOString() };
    return JSON.stringify(backup, null, 2);
  }

  importBackup(json: string): Promise<void> {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return Promise.reject(new Error('Файл не является корректным JSON.')); }
    if (!isTrackerBackup(parsed)) return Promise.reject(new Error('Неверный формат или версия резервной копии.'));
    const { profile, events, activeTimers } = parsed;
    const replacement = structuredClone({ profile, events, activeTimers });
    return this.update(() => replacement);
  }
}
