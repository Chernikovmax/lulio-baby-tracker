import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { IonButton } from '@ionic/angular';
import { StorageService } from '../../core/services/storage.service';
import { SleepForecastService } from '../../core/services/sleep-forecast.service';
import { type WakeGap } from '../../core/services/sleep-history';
import { routineInstant } from '../../core/services/sleep-calendar';
import { sleepBoundary } from '../../core/models/sleep-history.models';

@Component({
  selector: 'app-sleep-history-editor',
  imports: [FormField, IonButton],
  template: `
    <details>
      <summary>Пробуждение и полнота истории сна</summary>
      <p>Для персонализации подтвердите, что между двумя снами нет пропущенных записей. Без подтверждения интервал неизвестен. Неполный интервал не участвует в расчёте.</p>
      @if (storage.sleepRoutine(); as routine) {
        <p>Часовой пояс: {{ routine.timeZone }}. При пропуске времени часами время переносится вперёд на величину перехода; при повторе часа выбирается первое вхождение.</p>
        <form (submit)="saveWake($event)">
          <label for="confirmed-wake-at">Подтверждённое пробуждение (время режима)</label>
          <input id="confirmed-wake-at" type="datetime-local" [formField]="wakeForm.localAt">
          <ion-button type="submit" [disabled]="busy() || !wakeModel().localAt">{{ editingWake() ? 'Сохранить пробуждение' : 'Подтвердить пробуждение' }}</ion-button>
          @if (editingWake()) { <ion-button fill="clear" (click)="cancelEdit()">Отменить редактирование</ion-button> }
        </form>
        @for (wake of storage.confirmedWakes(); track wake.id) {
          <p>{{ label(wake.at) }}
            <ion-button fill="clear" [disabled]="busy()" (click)="editWake(wake.id, wake.at)" [attr.aria-label]="'Уточнить пробуждение ' + label(wake.at)">Уточнить</ion-button>
            <ion-button fill="clear" [disabled]="busy()" (click)="removeWake(wake.id)" [attr.aria-label]="'Удалить пробуждение ' + label(wake.at)">Удалить</ion-button>
          </p>
        }
      } @else { <p>Сначала сохраните часовой пояс и индивидуальный режим в настройках.</p> }
      <p role="status">{{ message() }}</p>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      <ul>
        @for (gap of gaps(); track gap.before.id + ':' + gap.after.id) {
          <li>
            <p>{{ label(gap.startAt) }} — {{ label(gap.endAt) }}: {{ gap.status === 'complete' ? 'полный' : gap.status === 'incomplete' ? 'неполный' : 'неизвестный' }}.
              @if (gap.stale) { Границы изменились: требуется новое подтверждение. }
              @if (!gap.valid) { Будущий, нулевой или пересекающийся сон: интервал исключён. }
            </p>
            <ion-button [disabled]="busy() || !gap.valid" (click)="confirm(gap, 'complete')" [attr.aria-label]="'Все сны записаны: ' + label(gap.startAt)">Все сны записаны</ion-button>
            <ion-button fill="outline" [disabled]="busy() || !gap.valid" (click)="confirm(gap, 'incomplete')" [attr.aria-label]="'Есть пропуски: ' + label(gap.startAt)">Есть пропуски</ion-button>
            @if (gap.status !== 'unknown' || gap.stale) {
              <ion-button fill="clear" [disabled]="busy()" (click)="clear(gap)">Убрать подтверждение</ion-button>
            }
          </li>
        } @empty { <li>Для подтверждения интервала нужны два завершённых сна.</li> }
      </ul>
    </details>
  `,
  styles: `:host { display: block; margin-block: 1rem; } summary { padding: 16px 0; cursor: pointer; }
    label { display: block; } input { display: block; color: inherit; background: var(--ion-card-background); border: 1px solid var(--ion-color-medium); padding: 12px; min-height: 48px; width: 100%; box-sizing: border-box; color-scheme: dark; }
    ion-button { min-height: 52px; } ul { padding-inline-start: 20px; } li { margin-block: 16px; }`,
})
export class SleepHistoryEditorComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  openWake(): void {
    const details = this.host.nativeElement.querySelector('details');
    if (details) details.open = true;
    const field = this.host.nativeElement.querySelector<HTMLInputElement>('#confirmed-wake-at');
    field?.scrollIntoView({ block: 'center' });
    field?.focus({ preventScroll: true });
  }
  readonly storage = inject(StorageService);
  readonly forecasts = inject(SleepForecastService);
  readonly gaps = computed(() => this.forecasts.historyGaps().slice().reverse());
  readonly wakeModel = signal({ localAt: '' });
  readonly wakeForm = form(this.wakeModel, path => required(path.localAt));
  readonly editingWake = signal<string | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  label(at: string): string {
    return new Intl.DateTimeFormat('ru-RU', { timeZone: this.storage.sleepRoutine()?.timeZone ?? 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(at));
  }
  editWake(id: string, at: string): void {
    const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: this.storage.sleepRoutine()!.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
    this.editingWake.set(id); this.wakeModel.set({ localAt: parts.replace(' ', 'T') });
  }
  cancelEdit(): void { this.editingWake.set(null); this.wakeModel.set({ localAt: '' }); }
  async saveWake(event: Event): Promise<void> {
    event.preventDefault();
    await this.run(async () => {
      const routine = this.storage.sleepRoutine(), value = this.wakeModel().localAt;
      if (!routine || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Укажите дату и время пробуждения.');
      const at = new Date(routineInstant(value.slice(0, 10), value.slice(11), routine.timeZone)).toISOString();
      await this.storage.saveConfirmedWake({ id: this.editingWake() ?? crypto.randomUUID(), at });
      this.cancelEdit();
    });
  }
  async removeWake(id: string): Promise<void> { await this.run(() => this.storage.deleteConfirmedWake(id)); }
  async confirm(gap: WakeGap, status: 'complete' | 'incomplete'): Promise<void> {
    await this.run(async () => {
      // Reconfirm the same entity; conflicting independent assertions still have incomplete precedence.
      const previous = this.storage.historyAssertions().find(a => a.boundaries[0].sleepId === gap.before.id && a.boundaries[1].sleepId === gap.after.id);
      await this.storage.saveHistoryAssertion({ id: previous?.id ?? crypto.randomUUID(), startAt: gap.startAt, endAt: gap.endAt,
        status, boundaries: [sleepBoundary(gap.before), sleepBoundary(gap.after)] });
    });
  }
  async clear(gap: WakeGap): Promise<void> {
    await this.run(async () => {
      for (const assertion of this.storage.historyAssertions().filter(a => a.boundaries[0].sleepId === gap.before.id && a.boundaries[1].sleepId === gap.after.id)) {
        await this.storage.deleteHistoryAssertion(assertion.id);
      }
    });
  }
  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await operation(); this.message.set('Сохранено.'); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Не удалось сохранить.'); }
    finally { this.busy.set(false); }
  }
}
