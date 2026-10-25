import { Component, inject, input, output, signal } from '@angular/core';
import { form, FormField, min, required } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/angular';
import type { AnyTrackerEvent } from '../../../../core/models/tracker.models';
import { StorageService } from '../../../../core/services/storage.service';
import { RussianSheetDirective } from '../russian-sheet.directive';

function localTimestamp(value: string): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
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
            <label>{{ event()?.endTime ? 'Начало' : 'Время события' }}<input type="datetime-local" step="60" [formField]="timeForm.startTime" [readOnly]="pending()"></label>
            @if (event()?.endTime && event()?.type !== 'breastfeeding') {
              <label>Окончание<input type="datetime-local" step="60" [formField]="timeForm.endTime" [readOnly]="pending()"></label>
            }
            @if (event()?.type === 'breastfeeding') {
              <label>Левая грудь, минут<input type="number" step="1" [formField]="timeForm.leftMinutes" [readOnly]="pending()"></label>
              <label>Правая грудь, минут<input type="number" step="1" [formField]="timeForm.rightMinutes" [readOnly]="pending()"></label>
              <p>Длительности округляются до целых минут. Окончание рассчитывается автоматически: начало плюс время у обеих грудей, без пауз.</p>
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
  readonly timeModel = signal({ startTime: '', endTime: '', leftMinutes: 0, rightMinutes: 0 });
  readonly timeForm = form(this.timeModel, path => { required(path.startTime); min(path.leftMinutes, 0); min(path.rightMinutes, 0); });

  prepare(): void {
    const event = this.event();
    this.timeForm().reset({
      startTime: event ? localTimestamp(event.startTime) : '', endTime: event?.endTime ? localTimestamp(event.endTime) : '',
      leftMinutes: event?.type === 'breastfeeding' ? Math.round(event.leftDurationSec / 60) : 0,
      rightMinutes: event?.type === 'breastfeeding' ? Math.round(event.rightDurationSec / 60) : 0,
    });
    this.error.set('');
  }

  async save(): Promise<void> {
    const event = this.event();
    if (!event || this.pending()) return;
    const value = this.timeModel();
    const start = new Date(value.startTime).getTime();
    const left = Math.round(Number(value.leftMinutes)) * 60;
    const right = Math.round(Number(value.rightMinutes)) * 60;
    if (event.type === 'breastfeeding' && (!Number.isFinite(left) || !Number.isFinite(right) || Number(value.leftMinutes) < 0 || Number(value.rightMinutes) < 0 || left + right <= 0)) {
      this.error.set('Укажите неотрицательное время у каждой груди; сумма должна быть больше нуля.'); return;
    }
    const end = event.type === 'breastfeeding' ? start + (left + right) * 1000 : event.endTime ? new Date(value.endTime).getTime() : null;
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
        const durations = current.type === 'breastfeeding' ? {
          leftDurationSec: left, rightDurationSec: right,
          lastSide: (current.lastSide === 'left' ? left : right) > 0 ? current.lastSide : left > 0 ? 'left' as const : 'right' as const,
        } : {};
        const pauses = current.type === 'sleep' && current.pauses && end !== null ? {
          pauses: current.pauses.flatMap(pause => {
            const from = Math.max(start, Date.parse(pause.startTime)), to = Math.min(end, Date.parse(pause.endTime));
            return to > from ? [{ startTime: new Date(from).toISOString(), endTime: new Date(to).toISOString() }] : [];
          }),
        } : {};
        const updated = { ...current, ...durations, ...pauses, startTime: new Date(start).toISOString(), ...(end !== null ? { endTime: new Date(end).toISOString() } : {}), updatedAt: new Date().toISOString() };
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
