import { Component, inject, input, output, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/angular';
import { isIsoDate, type GrowthEvent } from '../../../../core/models/tracker.models';
import { StorageService } from '../../../../core/services/storage.service';
import { RussianSheetDirective } from '../russian-sheet.directive';

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const emptyModel = () => ({ date: localDate(), weightKg: '', heightCm: '', headCm: '', note: '' });

@Component({
  selector: 'app-growth-modal',
  imports: [IonButton, IonContent, IonHeader, IonModal, IonTitle, IonToolbar, FormField, RussianSheetDirective],
  template: `
    <ion-modal appRussianSheet aria-label="Новое измерение" [isOpen]="isOpen()" [breakpoints]="[0, 0.55, 0.9]" [initialBreakpoint]="0.9" [canDismiss]="!pending()" (didDismiss)="closed.emit()">
      <ng-template>
        <ion-header><ion-toolbar><ion-title>Новое измерение</ion-title><ion-button slot="end" fill="clear" [disabled]="pending()" (click)="closed.emit()">Закрыть</ion-button></ion-toolbar></ion-header>
        <ion-content>
          <form (submit)="$event.preventDefault(); save()" novalidate>
            <p id="growth-hint">Заполните хотя бы одно измерение. Можно использовать точку или запятую.</p>
            <label for="growth-date">Дата измерения</label><input id="growth-date" type="date" [max]="today" [formField]="growthForm.date" [readOnly]="pending()">
            <label for="growth-weight">Вес, кг</label><input id="growth-weight" type="text" inputmode="decimal" [formField]="growthForm.weightKg" aria-describedby="growth-hint" [readOnly]="pending()">
            <label for="growth-height">Рост, см</label><input id="growth-height" type="text" inputmode="decimal" [formField]="growthForm.heightCm" [readOnly]="pending()">
            <label for="growth-head">Окружность головы, см</label><input id="growth-head" type="text" inputmode="decimal" [formField]="growthForm.headCm" [readOnly]="pending()">
            <label for="growth-note">Заметка</label><textarea id="growth-note" rows="2" [formField]="growthForm.note" [readOnly]="pending()"></textarea>
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <ion-button type="submit" expand="block" [disabled]="pending()">{{ pending() ? 'Сохранение…' : 'Сохранить измерение' }}</ion-button>
          </form>
        </ion-content>
      </ng-template>
    </ion-modal>`,
  styles: [`form{display:grid;gap:10px;padding:20px 18px 32px}p{margin:0 0 8px;color:var(--ion-color-medium)}label{font-weight:600}input,textarea{font:inherit;min-height:52px;padding:12px;color:var(--ion-text-color);background:var(--ion-background-color);border:1px solid var(--ion-color-medium);border-radius:12px;box-sizing:border-box;width:100%}input:focus-visible,textarea:focus-visible{outline:2px solid var(--ion-color-primary);outline-offset:3px}.error{color:var(--ion-color-danger)}ion-button{min-height:52px;margin-top:12px}`],
})
export class GrowthModalComponent {
  readonly isOpen = input(false);
  readonly closed = output<void>();
  private readonly storage = inject(StorageService);
  readonly model = signal(emptyModel());
  readonly growthForm = form(this.model, path => required(path.date));
  readonly pending = signal(false);
  readonly error = signal('');
  get today() { return localDate(); }

  async save(): Promise<void> {
    if (this.pending()) return;
    this.error.set('');
    const value = this.model();
    if (!isIsoDate(value.date) || value.date > localDate()) { this.error.set('Укажите корректную дату не позднее сегодняшней.'); return; }
    const measurements: Pick<GrowthEvent, 'weightKg' | 'heightCm' | 'headCm'> = {};
    for (const key of ['weightKg', 'heightCm', 'headCm'] as const) {
      const raw = value[key].trim();
      if (!raw) continue;
      const number = Number(raw.replace(',', '.'));
      if (!/^\d+(?:[.,]\d+)?$/.test(raw) || !Number.isFinite(number) || number <= 0) {
        this.error.set('Измерения должны быть положительными числами.'); return;
      }
      measurements[key] = number;
    }
    if (Object.keys(measurements).length === 0) { this.error.set('Добавьте вес, рост или окружность головы.'); return; }
    this.pending.set(true);
    try {
      await this.storage.saveEvent({ id: crypto.randomUUID(), type: 'growth', startTime: new Date(`${value.date}T00:00:00`).toISOString(), updatedAt: new Date().toISOString(), ...measurements, ...(value.note.trim() ? { note: value.note.trim() } : {}) });
      this.growthForm().reset(emptyModel());
      this.closed.emit();
    } catch { this.error.set('Не удалось сохранить измерение. Данные сохранены в форме, попробуйте ещё раз.'); }
    finally { this.pending.set(false); }
  }
}
