import { Component, computed, inject, output, signal } from '@angular/core';
import { IonButton } from '@ionic/angular';
import { SleepForecastService } from '../../core/services/sleep-forecast.service';
import { StorageService } from '../../core/services/storage.service';
import { ClockService } from '../../core/services/clock.service';
import { cycleMatches } from '../../core/services/sleep-preparation';
import { PreparationReminderService } from '../../core/services/preparation-reminder.service';

    const labels: Record<string, string> = {
      'assistant-disabled': 'Помощник выключен', 'active-sleep-including-pause': 'Сон активен, включая паузу',
      'profile-required': 'Нужен профиль ребёнка', 'confirmed-wake-required': 'Нужно подтверждённое пробуждение',
      'no-midnight-anchor': 'Начало суток не считается пробуждением', 'outside-birth-until-18-calendar-months': 'Возраст вне применимости модели',
      'nonclinical-engineering-prior': 'Возрастной диапазон — инженерный ориентир, не клиническая норма',
      'confirmed-history-median-blend': 'Медиана подтверждённой истории смешана с возрастным ориентиром',
      'fewer-than-five-confirmed-comparable-gaps': 'Менее пяти подтверждённых сопоставимых интервалов: история не меняет ориентир',
      'unknown-incomplete-stale-or-conflicting-gaps-excluded': 'Неизвестные, неполные, изменённые и конфликтующие интервалы исключены',
      'dst-gap-collapsed-target-range': 'Перевод часов сузил желаемый диапазон ночи до одного момента',
      'target-night-conflict-do-not-delay-sleep-to-fit': 'Не откладывайте сон, чтобы подогнать его под желаемое время ночи',
      'newborn-variability-no-rigid-schedule-or-feeding-restriction': 'Для новорождённого не задаётся жёсткий график или ограничение кормлений',
      'edd-not-used-for-sleep-age': 'Возраст рассчитан от рождения, без поправки по ПДР',
    };
@Component({
  selector: 'app-sleep-assistant-card',
  imports: [IonButton],
  template: `
    <section aria-labelledby="sleep-assistant-title">
      @let plan = forecasts.forecast();
      <h2 id="sleep-assistant-title">Помощник сна · {{ stateLabel() }}</h2>
      @if (preparation(); as prep) {
        <p>Подготовка с {{ time(prep.startedAt) }} · {{ preparationMinutes() }} мин. Таймер сна ещё не запущен.</p>
      } @else if (plan.state === 'ready' || plan.state === 'overdue') {
        <p>Примерно {{ plan.kind === 'night' ? 'ночной' : 'дневной' }} сон: {{ time(plan.predictedSleepAt) }} · подготовка {{ time(plan.preparationAt) }}</p>
        @if (plan.range; as range) { <p>Ориентир {{ time(range.from) }}–{{ time(range.to) }} · {{ countdownLabel() }}</p> }
        @if (plan.state === 'overdue') { <p>Ориентир прошёл. Уточните фактическое пробуждение; время не сдвигается автоматически.</p> }
      } @else {
        <p>{{ explanation() }}</p>
        @if (plan.state === 'sleeping') { <p>{{ completedPreparationLabel() }}</p> }
      }
      <p role="status">{{ reminders.description() }}</p>
      <details>
        <summary>Основание и ограничения прогноза</summary>
      @if (plan.anchor) {
        @if (suppressed()) { <p>Для этого цикла напоминание пропущено.</p> }
        @else { <ion-button fill="clear" [disabled]="busy()" (click)="run('skip')">Не напоминать об этом сне</ion-button> }
      }
        <p>{{ plan.source === 'blended-history' ? 'Возрастной ориентир и подтверждённая история' : plan.source === 'age-prior' ? 'Возрастной инженерный ориентир' : 'Расчёт недоступен' }}. Подходящих интервалов: {{ plan.sampleCount }}.</p>
        @if (plan.nightConflict) { <p>Конфликт с желаемым началом ночи: {{ plan.nightConflict === 'before-target' ? 'раньше диапазона' : 'позже диапазона' }}. Прогноз не подгоняется под режим.</p> }
        @if (plan.targetNight; as target) { <p>Желаемая ночь {{ time(target.from) }}–{{ time(target.to) }}.</p> }
        <ul>@for (reason of plan.reasons; track reason) { <li>{{ reasonLabel(reason) }}</li> }</ul>
        <p>Это приблизительный ориентир, не медицинская рекомендация. Получение на этом устройстве включается отдельно в Профиле. Недавние семейные изменения без обмена могут быть неизвестны этому телефону.</p>
      </details>
      @if (preparation()) {
        <div class="actions">
          <ion-button [disabled]="busy()" (click)="asleep()">Уснул</ion-button>
          <ion-button fill="outline" [disabled]="busy()" (click)="run('cancel')">Отменить подготовку</ion-button>
        </div>
      } @else if (plan.state === 'ready' || plan.state === 'overdue') {
        <div class="actions">
          @if (plan.state === 'ready') { <ion-button [disabled]="busy()" (click)="run('prepare')">Начать подготовку</ion-button> }
          <ion-button fill="outline" [disabled]="busy()" (click)="clarify.emit()">Уточнить пробуждение</ion-button>
        </div>
      } @else if (plan.state === 'unknown') {
        @if (plan.state === 'unknown') { <ion-button fill="outline" (click)="clarify.emit()">Уточнить пробуждение</ion-button> }
      }
      @if (error()) { <p role="alert">{{ error() }}</p> }
    </section>
  `,
  styles: `:host { display:block; } section { padding: 8px 16px; background: var(--ion-card-background); border-top: 1px solid var(--ion-color-medium); }
    h2 { font-size:1rem; margin:4px 0; } p { margin:6px 0; font-size:.9rem; } .actions { display:flex; flex-wrap:wrap; } ion-button { min-height:52px; flex:1; white-space:normal; } summary { min-height:52px; display:flex; align-items:center; cursor:pointer; } details[open] { max-height:30vh; overflow:auto; }`,
})
export class SleepAssistantCardComponent {
  readonly forecasts = inject(SleepForecastService);
  readonly reminders = inject(PreparationReminderService);
  private readonly storage = inject(StorageService);
  private readonly clock = inject(ClockService);
  readonly clarify = output<void>();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly preparation = computed(() => {
    const plan = this.forecasts.forecast();
    return this.storage.sleepPreparations().find(prep => prep.state === 'preparing' && prep.scope === plan.scope &&
      (!plan.anchor || cycleMatches(prep, plan.scope, plan.anchor.id, plan.anchor.at))) ?? null;
  });
  readonly preparationMinutes = computed(() => Math.max(0, Math.floor((this.clock.now() - Date.parse(this.preparation()?.startedAt ?? new Date(this.clock.now()).toISOString())) / 60_000)));
  readonly completedPreparationLabel = computed(() => {
    const timer = this.storage.activeTimers().sleepTimer;
    const prep = this.storage.sleepPreparations().find(item => item.state === 'completed' && item.sleepEventId === timer?.id);
    if (!prep?.completedAt) return 'Длительность подготовки неизвестна: связанной записи нет.';
    const minutes = Math.floor((Date.parse(prep.completedAt) - Date.parse(prep.startedAt)) / 60_000);
    return minutes < 1 ? 'Подготовка: менее минуты.' : `Подготовка: ${minutes} мин.`;
  });
  readonly suppressed = computed(() => {
    const plan = this.forecasts.forecast();
    return !!plan.anchor && this.storage.sleepCycleSuppressions().some(item => item.scope === plan.scope && item.anchorId === plan.anchor!.id);
  });
  readonly stateLabel = computed(() => this.preparation() ? 'подготовка' : ({ disabled: 'выключен', unknown: 'нужно пробуждение', sleeping: 'сон идёт', 'out-of-age': 'вне возрастного диапазона', ready: 'ориентир', overdue: 'нужно уточнение' })[this.forecasts.forecast().state]);
  readonly explanation = computed(() => ({ disabled: 'Включите индивидуальный режим в настройках. Это не разрешение на уведомления.', unknown: 'Для расчёта нужны профиль, режим и подтверждённое пробуждение.', sleeping: 'Активный или приостановленный сон. Новое пробуждение появится только после завершения сна.', 'out-of-age': 'Прогноз применим от рождения до 18 календарных месяцев.', ready: '', overdue: '' })[this.forecasts.forecast().state]);
  readonly countdownLabel = computed(() => {
    const seconds = this.forecasts.countdownSeconds();
    return seconds === null ? '' : seconds < 0 ? `прошло ${Math.ceil(-seconds / 60)} мин` : `через ${Math.ceil(seconds / 60)} мин`;
  });
  private readonly timeFormatter = computed(() => new Intl.DateTimeFormat('ru-RU', {
    timeZone: this.storage.sleepRoutine()?.timeZone ?? 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }));
  time(at: string | null): string {
    return at ? this.timeFormatter().format(Date.parse(at)) : 'неизвестно';
  }
  reasonLabel(reason: string): string {
    return labels[reason] ?? reason;
  }
  async asleep(): Promise<void> {
    const prep = this.preparation();
    if (!prep || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await this.storage.completeSleepPreparation(prep.id, prep.preparationId, this.forecasts.forecast().kind === 'night'); this.clock.refresh(); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Не удалось сохранить сон.'); }
    finally { this.busy.set(false); }
  }
  async run(action: 'prepare' | 'cancel' | 'skip'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      if (action === 'prepare') await this.storage.beginSleepPreparation(this.forecasts.forecast());
      else if (action === 'cancel') { const prep = this.preparation(); if (prep) await this.storage.cancelSleepPreparation(prep.id); }
      else await this.storage.suppressSleepCycle(this.forecasts.forecast());
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Не удалось сохранить.'); }
    finally { this.busy.set(false); }
  }
}
