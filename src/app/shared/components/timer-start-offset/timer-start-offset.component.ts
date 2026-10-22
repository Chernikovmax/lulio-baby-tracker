import { Component, input, model } from '@angular/core';
import { IonPicker, IonPickerColumn, IonPickerColumnOption } from '@ionic/angular';

const minuteOptions = Array.from({ length: 61 }, (_, minute) => minute);

@Component({
  selector: 'app-timer-start-offset',
  imports: [IonPicker, IonPickerColumn, IonPickerColumnOption],
  template: `
    <div class="offset">
      <p class="label">Началось минут назад</p>
      <ion-picker>
        <ion-picker-column aria-label="Началось минут назад" [value]="minutes()" [disabled]="disabled()" (ionChange)="select($event.detail.value)">
          @for (minute of minuteOptions; track minute) {
            <ion-picker-column-option [value]="minute">{{ minute }}</ion-picker-column-option>
          }
        </ion-picker-column>
      </ion-picker>
      <p class="hint">0 — начать с текущего момента</p>
    </div>
  `,
  styles: [`
    .offset { text-align: center; }
    .label { margin: 0 0 8px; font-weight: 600; }
    ion-picker { height: 200px; max-width: 240px; margin-inline: auto; }
    .hint { margin: 8px 0 0; color: var(--ion-color-medium); font-size: 0.9rem; }
  `],
})
export class TimerStartOffsetComponent {
  readonly minutes = model(0);
  readonly disabled = input(false);
  readonly minuteOptions = minuteOptions;

  select(value: string | number | undefined): void {
    const minutes = Number(value);
    if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 60) this.minutes.set(minutes);
  }
}
