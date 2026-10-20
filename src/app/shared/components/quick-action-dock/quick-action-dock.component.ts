import { Component, inject, output } from '@angular/core';
import { IonBadge, IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { moonOutline, heartOutline, waterOutline, happyOutline } from 'ionicons/icons';
import { ActiveTimerService } from '../../../core/services/active-timer.service';
import { DurationFormatPipe } from '../../pipes/duration-format.pipe';

export type QuickAction = 'sleep' | 'breastfeeding' | 'bottle' | 'diaper';

@Component({
  selector: 'app-quick-action-dock',
  imports: [IonBadge, IonButton, IonIcon, DurationFormatPipe],
  template: `
    <nav aria-label="Быстрое добавление события">
      <ion-button (click)="action.emit('sleep')" [attr.aria-label]="timers.sleepTimer() ? 'Сон: таймер запущен' : 'Сон'">
        <span><ion-icon name="moon-outline" aria-hidden="true" />Сон
        @if (timers.sleepTimer()) { <ion-badge class="live">{{ timers.sleepDurationSec() | durationFormat:'timer' }}</ion-badge> }</span>
      </ion-button>
      <ion-button (click)="action.emit('breastfeeding')" [attr.aria-label]="timers.breastTimer() ? 'Грудное вскармливание: таймер активен' : 'Грудное вскармливание'">
        <span><ion-icon name="heart-outline" aria-hidden="true" />ГВ
        @if (timers.breastTimer()) { <ion-badge [class.live]="timers.breastTimer()?.activeSide !== null">{{ timers.breastDurationSec() | durationFormat:'timer' }}{{ timers.breastTimer()?.activeSide === null ? ' · Пауза' : '' }}</ion-badge> }</span>
      </ion-button>
      <ion-button (click)="action.emit('bottle')"><span><ion-icon name="water-outline" aria-hidden="true" />Бутылочка</span></ion-button>
      <ion-button (click)="action.emit('diaper')"><span><ion-icon name="happy-outline" aria-hidden="true" />Подгузник</span></ion-button>
    </nav>
  `,
  styles: `
    :host { display: block; background: var(--ion-background-color); border-top: 1px solid #292929; }
    nav { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left)); }
    ion-button { min-height: 72px; margin: 0; --padding-start: 2px; --padding-end: 2px; --background: #202b40; --color: #edf2ff; font-size: .72rem; text-transform: none; letter-spacing: 0; }
    span { display: flex; align-items: center; flex-direction: column; gap: 5px; } ion-icon { font-size: 24px; }
    ion-badge { font-size: .65rem; max-width: 100%; font-variant-numeric: tabular-nums; }
    .live { animation: pulse 1.8s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .55; } }
    @media (prefers-reduced-motion: reduce) { .live { animation: none; } }
  `,
})
export class QuickActionDockComponent {
  readonly timers = inject(ActiveTimerService);
  readonly action = output<QuickAction>();
  constructor() { addIcons({ moonOutline, heartOutline, waterOutline, happyOutline }); }
}
