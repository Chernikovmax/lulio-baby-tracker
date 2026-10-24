import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { TimerNotification, type TimerNotificationState, type TimerNotificationStatus } from '@baby-tracker/timer-notification';
import { StorageService } from './storage.service';
import { WakeWindowService } from './wake-window.service';

@Service()
export class TimerNotificationService {
  private readonly storage = inject(StorageService);
  private readonly wake = inject(WakeWindowService);
  private readonly destroyRef = inject(DestroyRef);
  readonly supported = Capacitor.getPlatform() === 'android';
  readonly status = signal<TimerNotificationStatus | null>(null);
  readonly error = signal('');
  readonly requesting = signal(false);
  private updates: Promise<void> = Promise.resolve();

  // Only source timestamps are observed: the Android System UI ticks the clock.
  private readonly state = computed<TimerNotificationState>(() => {
    const { sleepTimer: sleep, breastTimer: breast } = this.storage.activeTimers();
    const lastWake = sleep ? null : this.wake.lastSleepEnd();
    // Match the UI: completed seconds on the inactive breast, fractional seconds on the active one.
    const accumulated = !breast ? 0 : breast.activeSide === 'left'
      ? breast.accumulatedLeftSec + Math.floor(breast.accumulatedRightSec)
      : Math.floor(breast.accumulatedLeftSec) + breast.accumulatedRightSec;
    const sleepPausedMs = sleep?.pauses?.reduce((total, pause) => total + Date.parse(pause.endTime) - Date.parse(pause.startTime), 0) ?? 0;
    return {
      sleepWake: sleep
        ? { title: `${sleep.isNightSleep ? 'Ночной сон' : 'Дневной сон'}${sleep.pausedAt ? ' · пауза' : ''}`,
          startedAt: sleep.pausedAt ? null : Date.parse(sleep.startedAt) + sleepPausedMs,
          elapsedSeconds: sleep.pausedAt ? Math.floor((Date.parse(sleep.pausedAt) - Date.parse(sleep.startedAt) - sleepPausedMs) / 1000) : 0 }
        : lastWake ? { title: 'Бодрствование', startedAt: Date.parse(lastWake), elapsedSeconds: 0 } : null,
      breastfeeding: breast ? {
        title: breast.activeSide === null ? 'Грудное кормление · пауза' : `Кормление · ${breast.activeSide === 'left' ? 'левая' : 'правая'} грудь`,
        startedAt: breast.currentSideStartedAt === null ? null : Date.parse(breast.currentSideStartedAt) - accumulated * 1000,
        elapsedSeconds: Math.floor(breast.accumulatedLeftSec) + Math.floor(breast.accumulatedRightSec),
      } : null,
    };
  });

  constructor() {
    if (!this.supported) return;
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && !this.storage.isLoading() && !this.storage.error()) void this.update(this.state());
    });
    this.destroyRef.onDestroy(() => { void listener.then(handle => handle.remove()); });
    effect(() => {
      if (this.storage.isLoading() || this.storage.error()) return;
      const state = this.state();
      untracked(() => { void this.update(state); });
    });
  }

  async requestAccess(): Promise<void> {
    if (!this.supported || this.requesting()) return;
    this.requesting.set(true);
    this.error.set('');
    try {
      await this.updates;
      this.status.set(await TimerNotification.requestAccess());
      if (!this.storage.isLoading() && !this.storage.error()) await this.update(this.state());
    } catch {
      this.error.set('Не удалось открыть доступ к уведомлениям. Проверьте настройки Android.');
    } finally {
      this.requesting.set(false);
    }
  }

  private update(state: TimerNotificationState): Promise<void> {
    this.updates = this.updates.then(async () => {
      this.status.set(await TimerNotification.update(state));
      this.error.set('');
    }).catch(() => {
      this.error.set('Не удалось обновить таймер в шторке. Таймер и записи в приложении сохранены.');
    });
    return this.updates;
  }
}
