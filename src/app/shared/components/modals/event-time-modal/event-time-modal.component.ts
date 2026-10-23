import { Component, inject, input, output, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/angular';
import type { AnyTrackerEvent } from '../../../../core/models/tracker.models';
import { StorageService } from '../../../../core/services/storage.service';
import { RussianSheetDirective } from '../russian-sheet.directive';

function localTimestamp(value: string): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 23);
}

@Component({
  selector: 'app-event-time-modal',
  imports: [IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, FormField, RussianSheetDirective],
  template: `
    <ion-modal appRussianSheet aria-label="Редактировать время" [isOpen]="event() !== null" [breakpoints]="[0, 0.55, 0.9]" [initialBreakpoint]="0.9" [expandToScroll]="false" [backdropDismiss]="!pending()" [canDismiss]="!pending()" (willPresent)="prepare()" (didDismiss)="closed.emit()">
      <ng-template>
        <ion-header><ion-toolbar><ion-title>Редактировать время</ion-title><ion-button slot="end" fill="clear" [disabled]="pending()" (click)="closed.emit()">Закрыть</ion-button></ion-toolbar></ion-header>
        <ion-content class="sheet-content">
          <form class="panel" (submit)="$event.preventDefault(); save()">
            <label>{{ event()?.endTime ? 'Начало' : 'Время события' }}<input type="datetime-local" step="0.001" [formField]="timeForm.startTime" [readOnly]="pending()"></label>
            @if (event()?.endTime) {
              <label>Окончание<input type="datetime-local" step="0.001" [formField]="timeForm.endTime" [readOnly]="pending()"></label>
            }
            @if (event()?.type === 'breastfeeding') {
              <p>Время у каждой груди остаётся прежним. Интервал должен вмещать суммарное время кормления.</p>
            }
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <ion-button type="button" expand="block" [disabled]="pending()" (click)="save()">{{ pending() ? 'Сохраняем…' : 'Сохранить изменения' }}</ion-button>
          </form>
        </ion-content>
      </ng-template>
    </ion-modal>`,
  styles: [`.sheet-content{--padding-bottom:24px}.panel{padding:20px 18px;display:grid;gap:16px}label{display:grid;gap:8px;font-weight:600}input{box-sizing:border-box;min-width:0;width:100%;font:inherit;padding:13px;border-radius:12px;border:1px solid var(--ion-color-medium);background:var(--ion-background-color);color:var(--ion-text-color);min-height:52px}p{margin:0}.error{color:var(--ion-color-danger)}ion-button{min-height:52px}`],
})
export class EventTimeModalComponent {
  readonly event = input<AnyTrackerEvent | null>(null);
  readonly closed = output<void>();
  private readonly storage = inject(StorageService);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly timeModel = signal({ startTime: '', endTime: '' });
  readonly timeForm = form(this.timeModel, path => { required(path.startTime); });

  prepare(): void {
    const event = this.event();
    this.timeForm().reset({ startTime: event ? localTimestamp(event.startTime) : '', endTime: event?.endTime ? localTimestamp(event.endTime) : '' });
    this.error.set('');
  }

  async save(): Promise<void> {
    const event = this.event();
    if (!event || this.pending()) return;
    const value = this.timeModel();
    const start = new Date(value.startTime).getTime();
    const end = event.endTime ? new Date(value.endTime).getTime() : null;
    if (!Number.isFinite(start) || (end !== null && !Number.isFinite(end))) {
      this.error.set('Укажите корректные дату и время.'); return;
    }
    if (end !== null && end <= start) {
      this.error.set('Окончание должно быть позже начала.'); return;
    }
    if (start > Date.now() || (end !== null && end > Date.now())) {
      this.error.set('Время не может быть в будущем.'); return;
    }
    this.pending.set(true);
    this.error.set('');
    try {
      await this.storage.update(data => {
        const current = data.events.find(item => item.id === event.id);
        if (!current) throw new Error('Запись уже удалена. Закройте окно и проверьте историю.');
        if (current.type === 'breastfeeding' && end !== null && current.leftDurationSec + current.rightDurationSec > (end - start) / 1000) {
          throw new Error('Интервал короче суммарного времени кормления у обеих грудей.');
        }
        const updated = { ...current, startTime: new Date(start).toISOString(), ...(end !== null ? { endTime: new Date(end).toISOString() } : {}), updatedAt: new Date().toISOString() };
        return { ...data, events: data.events.map(item => item.id === event.id ? updated : item) };
      });
      this.closed.emit();
    } catch (reason) {
      this.error.set(reason instanceof Error ? reason.message : 'Не удалось сохранить изменения. Попробуйте ещё раз.');
    } finally {
      this.pending.set(false);
    }
  }
}
