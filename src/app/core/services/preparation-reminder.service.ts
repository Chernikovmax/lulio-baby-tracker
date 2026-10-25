import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { StorageService } from './storage.service';
import { SleepForecastService } from './sleep-forecast.service';
import { androidPreparationSupported, preparationNative } from './preparation-reminder.native';
import type { PreparationPlan, PreparationStatus } from '@baby-tracker/timer-notification';

@Service()
export class PreparationReminderService {
  private readonly storage = inject(StorageService);
  private readonly forecasts = inject(SleepForecastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly supported = androidPreparationSupported();
  readonly status = signal<PreparationStatus | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  private updates: Promise<void> = Promise.resolve();
  readonly description = computed(() => {
    if (!this.supported) return 'Фоновые напоминания доступны в Android APK. В iPhone PWA доставка ещё не подключена.';
    if (this.error()) return this.error();
    const status = this.status();
    if (!status) return 'Проверяем настройки этого Android…';
    if (!status.enabled) return 'Напоминания на этом устройстве выключены.';
    if (!status.notifications) return 'Уведомления запрещены или канал выключен. Прогноз работает без напоминаний.';
    if (status.pending) return status.lastState === 'exact'
      ? 'Запланировано на этом Android; ОС может задержать или не показать сигнал.'
      : 'Запланировано приблизительно: нет доступа к точным сигналам, возможна значительная задержка или пропуск.';
    if (status.lastState === 'consumed') return 'Для этого цикла право напоминания уже использовано; повторного сигнала не будет.';
    if (status.lastState === 'expired') return 'Время подготовки прошло. Догоняющего сигнала не будет.';
    return 'Получение включено. Сейчас нет актуального будущего напоминания.';
  });

  constructor() {
    if (!this.supported) return;
    const resume = App.addListener('appStateChange', ({ isActive }) => { if (isActive) void this.refresh(true); });
    const opened = preparationNative.addListener('preparationOpened', () => { void this.openCurrent(); });
    this.destroyRef.onDestroy(() => { void resume.then(handle => handle.remove()); void opened.then(handle => handle.remove()); });
    effect(() => {
      this.storage.reminderGeneration();
      const plan = this.forecasts.forecast();
      const facts = [this.storage.sleepPreparations(), this.storage.sleepCycleSuppressions()];
      if (this.storage.isLoading() || this.storage.error()) return;
      // Clock ticks only affect ready/overdue, not a second calculation or native call per second.
      const key = JSON.stringify([plan.inputVersion, plan.state, facts, this.storage.reminderGeneration()]);
      untracked(() => { if (key !== this.lastInput) { this.lastInput = key; void this.refresh(); } });
    });
    void this.refresh(true);
  }
  private lastInput = '';

  private async openCurrent(): Promise<void> {
    await preparationNative.preparationTakeOpen();
    await this.router.navigateByUrl('/tabs/tracker');
  }
  refresh(checkOpen = false): Promise<void> {
    if (!this.supported) return Promise.resolve();
    this.updates = this.updates.catch(() => undefined).then(() => this.storage.withCommittedSnapshot(async () => {
      const status = await preparationNative.preparationStatus();
      // The diary write queue is held through native reconciliation. A later commit
      // durably fences this generation before changing any forecast inputs.
      const forecast = this.forecasts.forecast();
      const anchor = forecast.anchor;
      const key = anchor ? JSON.stringify([forecast.scope, anchor.id, status.device]) : null;
      const suppressed = !!anchor && this.storage.sleepCycleSuppressions().some(item => item.scope === forecast.scope && item.anchorId === anchor.id);
      const preparing = !!anchor && this.storage.sleepPreparations().some(item => item.scope === forecast.scope && item.anchorId === anchor.id && item.state !== 'cancelled');
      let plan: PreparationPlan | null = null;
      if (key && anchor && forecast.state === 'ready' && !suppressed && !preparing && forecast.preparationAt && forecast.predictedSleepAt) {
        const due = Date.parse(forecast.preparationAt);
        // Persist an opaque revision, not the forecast's raw diary/profile input tuple.
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(forecast.inputVersion)));
        const revision = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
        plan = { key, scope: forecast.scope, cycle: anchor.id, revision,
          due, expiry: Math.min(due + 600_000, Date.parse(forecast.predictedSleepAt), forecast.applicableUntil ? Date.parse(forecast.applicableUntil) : Infinity) };
      }
      this.status.set(await preparationNative.preparationReconcile({ generation: status.generation, plan, blockedKey: suppressed || preparing ? key : null }));
      this.error.set('');
    })).then(async () => {
      if (checkOpen && (await preparationNative.preparationTakeOpen()).open) await this.router.navigateByUrl('/tabs/tracker');
    }).catch(() => { this.error.set('Напоминания недоступны. Проверьте настройки Android; прогноз остаётся в приложении.'); });
    return this.updates;
  }
  async setEnabled(enabled: boolean): Promise<void> {
    if (!this.supported || this.busy()) return;
    this.busy.set(true);
    try { await this.updates; this.status.set(await preparationNative.preparationConsent({ enabled })); await this.refresh(); }
    catch { this.error.set('Не удалось изменить получение напоминаний.'); }
    finally { this.busy.set(false); }
  }
  async settings(exact: boolean): Promise<void> {
    if (!this.supported || this.busy()) return;
    this.busy.set(true);
    try { this.status.set(await preparationNative.preparationSettings({ exact })); }
    catch { this.error.set('Настройки Android недоступны.'); }
    finally { this.busy.set(false); }
  }
}
