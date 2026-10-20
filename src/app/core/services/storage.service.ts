import { Service, computed, resource } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  ActiveTimerState, AnyTrackerEvent, BabyProfile, TrackerBackup, TrackerData,
  isAnyTrackerEvent, isBabyProfile, isTrackerBackup, isTrackerData,
} from '../models/tracker.models';

const STORAGE_KEY = 'baby-tracker.v1';
const EMPTY_DATA: TrackerData = {
  profile: null, events: [], activeTimers: { sleepTimer: null, breastTimer: null },
};

@Service()
export class StorageService {
  // Один снимок: завершение таймера и добавление события сохраняются атомарно.
  private readonly initialRead = Preferences.get({ key: STORAGE_KEY }).then(({ value }) => {
    if (value === null) return structuredClone(EMPTY_DATA);
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new Error('Не удалось прочитать сохранённые данные.'); }
    if (!isTrackerData(parsed)) throw new Error('Сохранённые данные имеют неверный формат.');
    return parsed;
  });
  private readonly dataResource = resource({ loader: () => this.initialRead });
  private writes: Promise<void> = Promise.resolve();
  readonly isLoading = this.dataResource.isLoading;
  readonly error = this.dataResource.error;
  readonly profile = computed(() => this.dataResource.hasValue() ? this.dataResource.value().profile : null);
  readonly events = computed<readonly AnyTrackerEvent[]>(() => this.dataResource.hasValue() ? this.dataResource.value().events : []);
  readonly activeTimers = computed<ActiveTimerState>(() => this.dataResource.hasValue() ? this.dataResource.value().activeTimers : EMPTY_DATA.activeTimers);

  async ready(): Promise<void> {
    const initial = await this.initialRead;
    if (!this.dataResource.hasValue()) this.dataResource.value.set(initial);
  }

  /** Последовательная read–modify–write транзакция; при ошибке записи состояние не меняется. */
  update(transform: (data: TrackerData) => TrackerData): Promise<void> {
    const operation = this.writes.then(async () => {
      await this.ready();
      const next = transform(structuredClone(this.dataResource.value()!));
      if (!isTrackerData(next)) throw new Error('Невозможно сохранить некорректные данные.');
      const snapshot = JSON.stringify(next);
      await Preferences.set({ key: STORAGE_KEY, value: snapshot });
      this.dataResource.value.set(JSON.parse(snapshot) as TrackerData);
    });
    this.writes = operation.catch(() => undefined);
    return operation;
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
    const backup: TrackerBackup = { ...this.dataResource.value()!, version: 1, exportedAt: new Date().toISOString() };
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
