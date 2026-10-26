import { Service, computed, resource, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  ActiveTimerState, AnyTrackerEvent, BabyProfile, TrackerBackup, TrackerData,
  isAnyTrackerEvent, isBabyProfile, isTrackerBackup, isTrackerData,
} from '../models/tracker.models';
import {
  SupabaseCheckpoint, SyncDocument, SyncEntry, SyncResponse,
  isSupabaseCheckpoint, isSyncDocument, isSyncResponse, newerEntry,
} from '../models/sync.models';
import { isSleepRoutine, type SleepRoutine } from '../models/sleep-routine.models';
import { isConfirmedWake, isHistoryAssertion, assertionMatches, type ConfirmedWake, type HistoryAssertion } from '../models/sleep-history.models';
import { sleepCycleId, type SleepPreparation, type SleepCycleSuppression } from '../models/sleep-assistant.models';
import { calculateSleepForecast, type SleepForecast } from './sleep-forecast';
import { cycleAnchorRevision, reconcileSleepPreparations } from './sleep-preparation';
import { androidPreparationSupported, preparationNative } from './preparation-reminder.native';
import { fenceWebReminderDiary } from './web-reminder-ledger';

interface StoredData extends TrackerData {
  sync?: SyncDocument;
  supabase?: SupabaseCheckpoint;
}

const STORAGE_KEY = 'baby-tracker.v1';
const EMPTY_DATA: TrackerData = {
  profile: null, events: [], activeTimers: { sleepTimer: null, breastTimer: null }, sleepRoutine: null,
  confirmedWakes: [], historyAssertions: [], sleepPreparations: [], sleepCycleSuppressions: [],
};

@Service()
export class StorageService {
  // Один снимок: завершение таймера и добавление события сохраняются атомарно.
  private readonly device = crypto.randomUUID();
  private readonly initialRead = Preferences.get({ key: STORAGE_KEY }).then<StoredData>(async ({ value }) => {
    if (value === null) return structuredClone(EMPTY_DATA);
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new Error('Не удалось прочитать сохранённые данные.'); }
    if (!isTrackerData(parsed)) throw new Error('Сохранённые данные имеют неверный формат.');
    if ('sync' in parsed && !isSyncDocument(parsed.sync)) throw new Error('Повреждены данные синхронизации.');
    if ('supabase' in parsed && (!isSupabaseCheckpoint(parsed.supabase) ||
      !('sync' in parsed) || (parsed.sync as SyncDocument).scope !== parsed.supabase.scope)) {
      throw new Error('Повреждён курсор синхронизации.');
    }
    const migrated: StoredData = { ...parsed, sleepRoutine: parsed.sleepRoutine ?? null,
      confirmedWakes: parsed.confirmedWakes ?? [], historyAssertions: parsed.historyAssertions ?? [],
      sleepPreparations: parsed.sleepPreparations ?? [], sleepCycleSuppressions: parsed.sleepCycleSuppressions ?? [] };
    if (migrated.activeTimers.sleepTimer && !migrated.activeTimers.sleepTimer.id) {
      migrated.activeTimers.sleepTimer.id = await sleepCycleId('legacy-sleep-timer', migrated.activeTimers.sleepTimer.startedAt);
      if (migrated.sync?.entries['sleepTimer']?.value) {
        migrated.sync.entries['sleepTimer'].value = migrated.activeTimers.sleepTimer;
        if (migrated.supabase?.pending['sleepTimer']) migrated.supabase.pending['sleepTimer'].value = migrated.activeTimers.sleepTimer;
      }
    }
    // Upgrade an existing family journal/outbox without inventing a newer edit.
    if (migrated.sync && !('sleepRoutine' in migrated.sync.entries)) {
      const entry: SyncEntry = { revision: 0, device: this.device, value: migrated.sleepRoutine };
      migrated.sync = { ...migrated.sync, entries: { ...migrated.sync.entries, sleepRoutine: entry } };
      if (migrated.supabase) migrated.supabase = { ...migrated.supabase,
        pending: { ...migrated.supabase.pending, sleepRoutine: entry } };
    }
    if (JSON.stringify(migrated) !== value) await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(migrated) });
    return migrated;
  });
  private readonly dataResource = resource({ loader: () => this.initialRead });
  private writes: Promise<void> = Promise.resolve();
  readonly isLoading = this.dataResource.isLoading;
  readonly error = this.dataResource.error;
  readonly profile = computed(() => this.dataResource.hasValue() ? this.dataResource.value().profile : null);
  readonly events = computed<readonly AnyTrackerEvent[]>(() => this.dataResource.hasValue() ? this.dataResource.value().events : []);
  readonly activeTimers = computed<ActiveTimerState>(() => this.dataResource.hasValue() ? this.dataResource.value().activeTimers : EMPTY_DATA.activeTimers);
  readonly sleepRoutine = computed(() => this.dataResource.hasValue() ? this.dataResource.value().sleepRoutine ?? null : null);
  readonly confirmedWakes = computed(() => this.dataResource.hasValue() ? this.dataResource.value().confirmedWakes ?? [] : []);
  readonly historyAssertions = computed(() => this.dataResource.hasValue() ? this.dataResource.value().historyAssertions ?? [] : []);
  readonly sleepPreparations = computed(() => this.dataResource.hasValue() ? this.dataResource.value().sleepPreparations ?? [] : []);
  readonly sleepCycleSuppressions = computed(() => this.dataResource.hasValue() ? this.dataResource.value().sleepCycleSuppressions ?? [] : []);
  /** Import invalidation is independent of repeated event IDs and timestamps. */
  readonly importGeneration = signal(0);
  /** Device fence changes also reconcile after failed diary persistence. */
  readonly reminderGeneration = signal(0);
  readonly syncDocument = computed(() => this.dataResource.hasValue() ? this.dataResource.value().sync ?? null : null);
  readonly supabaseCheckpoint = computed(() => this.dataResource.hasValue() ? this.dataResource.value().supabase ?? null : null);

  async ready(): Promise<void> {
    const initial = await this.initialRead;
    if (!this.dataResource.hasValue()) this.dataResource.value.set(initial);
  }

  /** Finish already queued diary writes before a user-requested application reload. */
  async whenIdle(): Promise<void> {
    await this.writes;
    await this.ready();
  }

  /** Serialize native publication rights with diary writes across the two durable stores. */
  withCommittedSnapshot(read: () => Promise<void>): Promise<void> {
    const operation = this.writes.then(async () => { await this.ready(); await read(); });
    this.writes = operation.catch(() => undefined);
    return operation;
  }

  /** Последовательная read–modify–write транзакция; при ошибке записи состояние не меняется. */
  update(transform: (data: TrackerData) => TrackerData): Promise<void> {
    return this.commit(data => {
      const next = reconcileSleepPreparations(transform(data), data.sync?.scope ?? 'local');
      if (!data.sync) return next;
      const entries = { ...data.sync.entries };
      const pending = data.supabase ? { ...data.supabase.pending } : null;
      let revision = Date.now();
      for (const entry of Object.values(entries)) revision = Math.max(revision, entry.revision + 1);
      const previous = new Map(data.events.map(event => [event.id, event]));
      const current = new Map(next.events.map(event => [event.id, event]));
      for (const id of new Set([...previous.keys(), ...current.keys()])) {
        if (JSON.stringify(previous.get(id)) !== JSON.stringify(current.get(id))) {
          entries[`event:${id}`] = { revision, device: this.device, value: current.get(id) ?? null };
          if (pending) pending[`event:${id}`] = entries[`event:${id}`];
        }
      }
      for (const [field, prefix] of [['confirmedWakes', 'wake'], ['historyAssertions', 'assertion'],
        ['sleepPreparations', 'preparation'], ['sleepCycleSuppressions', 'suppression']] as const) {
        const oldFacts = new Map((data[field] ?? []).map(item => [item.id, item]));
        const newFacts = new Map((next[field] ?? []).map(item => [item.id, item]));
        for (const id of new Set([...oldFacts.keys(), ...newFacts.keys()])) {
          if (JSON.stringify(oldFacts.get(id)) !== JSON.stringify(newFacts.get(id))) {
            const key = `${prefix}:${id}`;
            entries[key] = { revision, device: this.device, value: newFacts.get(id) ?? null };
            if (pending) pending[key] = entries[key];
          }
        }
      }
      for (const key of ['sleepTimer', 'breastTimer'] as const) {
        if (JSON.stringify(data.activeTimers[key]) !== JSON.stringify(next.activeTimers[key])) {
          entries[key] = { revision, device: this.device, value: next.activeTimers[key] };
          if (pending) pending[key] = entries[key];
        }
      }
      if (JSON.stringify(data.sleepRoutine ?? null) !== JSON.stringify(next.sleepRoutine ?? null)) {
        entries['sleepRoutine'] = { revision, device: this.device, value: next.sleepRoutine ?? null };
        if (pending) pending['sleepRoutine'] = entries['sleepRoutine'];
      }
      return { ...next, sync: { scope: data.sync.scope, entries },
        ...(data.supabase && pending ? { supabase: { ...data.supabase, pending } } : {}) };
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
      if (androidPreparationSupported()) {
        // Cancel and durably fence before the diary commit. A crash between stores misses
        // a reminder rather than publishing a superseded plan while JavaScript is closed.
        await preparationNative.preparationInvalidate();
      }
      fenceWebReminderDiary();
      this.reminderGeneration.update(value => value + 1);
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
      entries['sleepRoutine'] = { revision: 0, device: this.device, value: data.sleepRoutine ?? null };
      for (const [field, prefix] of [['confirmedWakes', 'wake'], ['historyAssertions', 'assertion'],
        ['sleepPreparations', 'preparation'], ['sleepCycleSuppressions', 'suppression']] as const) {
        for (const fact of data[field] ?? []) entries[`${prefix}:${fact.id}`] = { revision: 0, device: this.device, value: fact };
      }
      return { ...reconcileSleepPreparations(data, scope), sync: { scope, entries }, supabase: undefined };
    });
  }

  configureSupabaseSync(scope: string): Promise<void> {
    return this.configureSync(scope).then(() => this.commit(data => {
      if (data.sync?.scope !== scope || data.supabase?.scope === scope) return data;
      // Existing installations publish their journal once; subsequent exchanges use only the outbox.
      return { ...data, supabase: { scope, version: 0, pending: { ...data.sync.entries } } };
    }));
  }

  mergeSupabase(scope: string, sinceVersion: number, sent: Record<string, SyncEntry>, remote: SyncResponse): Promise<void> {
    if (!isSyncResponse(remote) || remote.version < sinceVersion) {
      return Promise.reject(new Error('Неверный ответ синхронизации.'));
    }
    return this.commit(data => {
      if (data.sync?.scope !== scope || data.supabase?.scope !== scope || data.supabase.version !== sinceVersion) return data;
      const pending = { ...data.supabase.pending };
      for (const [key, entry] of Object.entries(sent)) {
        // A local edit made while the request was in flight must remain in the durable outbox.
        if (pending[key]?.revision === entry.revision && pending[key]?.device === entry.device) delete pending[key];
      }
      const merged = this.mergeEntries(data, { scope, entries: remote.entries });
      return { ...merged.snapshot,
        supabase: { scope, version: remote.version, pending: { ...pending, ...merged.reconciled } } };
    });
  }

  mergeSync(remote: SyncDocument): Promise<void> {
    if (!isSyncDocument(remote)) return Promise.reject(new Error('Неверный формат семейных данных.'));
    return this.commit(data => {
      if (data.sync?.scope !== remote.scope) return data;
      return this.mergeEntries(data, remote).snapshot;
    });
  }

  private mergeEntries(data: StoredData, remote: SyncDocument): { snapshot: StoredData; reconciled: Record<string, SyncEntry> } {
    const entries = { ...data.sync!.entries };
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
    const sleepRoutine = (entries['sleepRoutine']?.value ?? null) as SleepRoutine | null;
    const confirmedWakes = Object.entries(entries).filter(([key, entry]) => key.startsWith('wake:') && entry.value !== null)
      .map(([, entry]) => entry.value as ConfirmedWake);
    const historyAssertions = Object.entries(entries).filter(([key, entry]) => key.startsWith('assertion:') && entry.value !== null)
      .map(([, entry]) => entry.value as HistoryAssertion);
    const sleepPreparations = Object.entries(entries).filter(([key, entry]) => key.startsWith('preparation:') && entry.value !== null)
      .map(([, entry]) => entry.value as SleepPreparation);
    const sleepCycleSuppressions = Object.entries(entries).filter(([key, entry]) => key.startsWith('suppression:') && entry.value !== null)
      .map(([, entry]) => entry.value as SleepCycleSuppression);
    // A late timer value cannot resurrect a sleep already completed/deleted in this journal.
    const terminal = activeTimers.sleepTimer?.id ? entries[`event:${activeTimers.sleepTimer.id}`] : undefined;
    if (terminal && newerEntry(terminal, entries['sleepTimer']) === terminal) activeTimers.sleepTimer = null;
    const next = reconcileSleepPreparations({ ...data, events, activeTimers, sleepRoutine, confirmedWakes, historyAssertions,
      sleepPreparations, sleepCycleSuppressions }, remote.scope);
    // Invalidation is a durable lifecycle transition, not a temporary display filter.
    // Otherwise restoring old settings/anchor content could resurrect a cancelled attempt.
    const reconciled: Record<string, SyncEntry> = {};
    let revision = Date.now();
    for (const entry of Object.values(entries)) revision = Math.max(revision, entry.revision + 1);
    for (const prep of next.sleepPreparations ?? []) {
      const key = `preparation:${prep.id}`;
      if (JSON.stringify(entries[key]?.value) !== JSON.stringify(prep)) {
        entries[key] = reconciled[key] = { revision, device: this.device, value: prep };
      }
    }
    return { snapshot: { ...next, sync: { scope: remote.scope, entries },
      ...(data.supabase ? { supabase: { ...data.supabase, pending: { ...data.supabase.pending, ...reconciled } } } : {}) }, reconciled };
  }

  saveSleepRoutine(sleepRoutine: SleepRoutine): Promise<void> {
    if (!isSleepRoutine(sleepRoutine)) return Promise.reject(new Error('Проверьте настройки индивидуального режима.'));
    return this.update(data => ({ ...data, sleepRoutine }));
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

  saveConfirmedWake(wake: ConfirmedWake): Promise<void> {
    if (!isConfirmedWake(wake) || Date.parse(wake.at) > Date.now()) return Promise.reject(new Error('Укажите прошедшее время пробуждения.'));
    return this.update(data => {
      if (data.activeTimers.sleepTimer) throw new Error('Сначала завершите или отмените таймер сна.');
      if (data.events.some(event => event.type === 'sleep' && Date.parse(wake.at) >= Date.parse(event.startTime) &&
        Date.parse(wake.at) < Date.parse(event.endTime))) throw new Error('Пробуждение попадает внутрь записанного сна.');
      return { ...data, confirmedWakes: [...(data.confirmedWakes ?? []).filter(item => item.id !== wake.id), wake] };
    });
  }

  deleteConfirmedWake(id: string): Promise<void> {
    return this.update(data => ({ ...data, confirmedWakes: (data.confirmedWakes ?? []).filter(item => item.id !== id) }));
  }

  saveHistoryAssertion(assertion: HistoryAssertion): Promise<void> {
    if (!isHistoryAssertion(assertion) || Date.parse(assertion.endAt) > Date.now()) {
      return Promise.reject(new Error('Проверьте прошедший интервал истории.'));
    }
    return this.update(data => {
      const before = data.events.find(event => event.id === assertion.boundaries[0].sleepId);
      const after = data.events.find(event => event.id === assertion.boundaries[1].sleepId);
      if (before?.type !== 'sleep' || after?.type !== 'sleep' || !assertionMatches(assertion, before, after) ||
        Date.parse(before.endTime) < Date.parse(assertion.startAt) || Date.parse(after.startTime) > Date.parse(assertion.endAt)) {
        throw new Error('Границы изменились. Подтвердите интервал заново.');
      }
      return { ...data, historyAssertions: [...(data.historyAssertions ?? []).filter(item => item.id !== assertion.id), assertion] };
    });
  }

  deleteHistoryAssertion(id: string): Promise<void> {
    return this.update(data => ({ ...data, historyAssertions: (data.historyAssertions ?? []).filter(item => item.id !== id) }));
  }

  async beginSleepPreparation(plan: SleepForecast): Promise<void> {
    if (!plan.anchor) throw new Error('Уточните пробуждение.');
    const generation = this.importGeneration();
    const id = await sleepCycleId(plan.scope, plan.anchor.id);
    await this.update(data => {
      const fresh = calculateSleepForecast({ ...data, scope: this.syncDocument()?.scope ?? 'local',
        journal: this.syncDocument(), importGeneration: this.importGeneration() }, Date.now());
      if (generation !== this.importGeneration() || fresh.state !== 'ready' || fresh.scope !== plan.scope ||
        fresh.anchor?.id !== plan.anchor!.id || fresh.anchor.at !== plan.anchor!.at || fresh.inputVersion !== plan.inputVersion) {
        throw new Error('Прогноз изменился или просрочен. Уточните пробуждение.');
      }
      const existing = data.sleepPreparations?.find(item => item.id === id);
      if (existing && existing.state !== 'cancelled') return data;
      const prep: SleepPreparation = { id, scope: plan.scope, anchorId: plan.anchor!.id, anchorAt: plan.anchor!.at,
        anchorRevision: cycleAnchorRevision(data, plan.anchor!.id)!, preparationId: crypto.randomUUID(),
        startedAt: new Date().toISOString(), state: 'preparing', sleepEventId: null, completedAt: null };
      return { ...data, sleepPreparations: [...(data.sleepPreparations ?? []).filter(item => item.id !== id), prep] };
    });
  }

  completeSleepPreparation(id: string, preparationId: string, isNightSleep: boolean): Promise<void> {
    return this.update(data => {
      const prep = data.sleepPreparations?.find(item => item.id === id);
      if (!prep || prep.preparationId !== preparationId || prep.state === 'cancelled') throw new Error('Подготовка изменилась. Проверьте семейные записи.');
      if (prep.state === 'completed') return data;
      if (prep.scope !== (this.syncDocument()?.scope ?? 'local') || cycleAnchorRevision(data, prep.anchorId) !== prep.anchorRevision ||
        !data.sleepRoutine?.assistantEnabled) throw new Error('Подготовка больше не актуальна.');
      if (data.activeTimers.sleepTimer || data.events.some(event => event.id === id)) throw new Error('Сон уже записан или запущен.');
      const now = new Date().toISOString();
      return { ...data, sleepPreparations: data.sleepPreparations!.map(item => item.id === id
        ? { ...item, state: 'completed' as const, sleepEventId: id, completedAt: now } : item),
        activeTimers: { ...data.activeTimers, sleepTimer: { id, startedAt: now, isNightSleep } } };
    });
  }

  cancelSleepPreparation(id: string): Promise<void> {
    return this.update(data => ({ ...data, sleepPreparations: (data.sleepPreparations ?? []).map(item =>
      item.id === id && item.state === 'preparing' ? { ...item, state: 'cancelled' as const, sleepEventId: null, completedAt: null } : item) }));
  }

  async suppressSleepCycle(plan: SleepForecast): Promise<void> {
    if (!plan.anchor) throw new Error('Нет подтверждённого цикла.');
    const generation = this.importGeneration(), id = await sleepCycleId(plan.scope, plan.anchor.id);
    await this.update(data => {
      const fresh = calculateSleepForecast({ ...data, scope: this.syncDocument()?.scope ?? 'local', importGeneration: this.importGeneration() }, Date.now());
      if (generation !== this.importGeneration() || fresh.scope !== plan.scope || fresh.anchor?.id !== plan.anchor!.id ||
        fresh.anchor.at !== plan.anchor!.at) throw new Error('Цикл изменился.');
      if (data.sleepCycleSuppressions?.some(item => item.id === id)) return data;
      const suppression: SleepCycleSuppression = { id, scope: plan.scope, anchorId: plan.anchor!.id, anchorAt: plan.anchor!.at,
        anchorRevision: cycleAnchorRevision(data, plan.anchor!.id)!, suppressedAt: new Date().toISOString() };
      return { ...data, sleepCycleSuppressions: [...(data.sleepCycleSuppressions ?? []), suppression] };
    });
  }

  async exportBackup(): Promise<string> {
    await this.writes;
    await this.ready();
    const { profile, events, activeTimers, sleepRoutine = null, confirmedWakes = [], historyAssertions = [],
      sleepPreparations = [], sleepCycleSuppressions = [] } = this.dataResource.value()!;
    const backup: TrackerBackup = { profile, events, activeTimers, sleepRoutine, confirmedWakes, historyAssertions,
      sleepPreparations, sleepCycleSuppressions, version: 4, exportedAt: new Date().toISOString() };
    return JSON.stringify(backup, null, 2);
  }

  importBackup(json: string): Promise<void> {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return Promise.reject(new Error('Файл не является корректным JSON.')); }
    if (!isTrackerBackup(parsed)) return Promise.reject(new Error('Неверный формат или версия резервной копии.'));
    const { profile, events, activeTimers } = parsed;
    // Import is not consent to enable the assistant, even if it was enabled on the exporting device.
    const sleepRoutine = parsed.sleepRoutine ? { ...parsed.sleepRoutine, assistantEnabled: false } : null;
    const replacement = structuredClone({ profile, events, activeTimers, sleepRoutine,
      confirmedWakes: parsed.confirmedWakes ?? [], historyAssertions: parsed.historyAssertions ?? [],
      sleepPreparations: (parsed.sleepPreparations ?? []).map(prep => prep.state === 'preparing'
        ? { ...prep, state: 'cancelled' as const, sleepEventId: null, completedAt: null } : prep),
      sleepCycleSuppressions: parsed.sleepCycleSuppressions ?? [] });
    return this.update(() => replacement).then(() => { this.importGeneration.update(value => value + 1); });
  }
}
