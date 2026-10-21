import { Component, computed, inject } from '@angular/core';
import { IonBadge, IonButton, IonCard, IonCardContent, IonProgressBar } from '@ionic/angular';
import { ActiveTimerService } from '../../../core/services/active-timer.service';
import { WakeWindowService } from '../../../core/services/wake-window.service';
import { DurationFormatPipe } from '../../pipes/duration-format.pipe';

@Component({
  selector: 'app-live-status-banner',
  imports: [IonBadge, IonButton, IonCard, IonCardContent, IonProgressBar, DurationFormatPipe],
  template: `
    <ion-card>
      <ion-card-content>
        <div class="heading">{{ timers.sleepTimer() ? 'Малыш спит' : 'Бодрствование' }} <ion-badge>{{ timers.sleepTimer() ? (timers.sleepTimer()?.isNightSleep ? 'Ночной сон' : 'Дневной сон') : 'Сейчас' }}</ion-badge></div>
        <div class="timer" role="timer" [attr.aria-label]="timers.sleepTimer() ? 'Длительность сна' : 'Длительность бодрствования'">{{ (timers.sleepTimer() ? timers.sleepDurationSec() : wake.wakeDurationSec()) | durationFormat:'timer' }}</div>
        @if (!timers.sleepTimer() && !wake.isNight()) {
          @if (wake.norm(); as norm) {
            <p>Ориентир: {{ norm.minWakeMinutes * 60 | durationFormat }} — {{ norm.maxWakeMinutes * 60 | durationFormat }}</p>
          } @else { <p>Укажите дату рождения для возрастных ориентиров.</p> }
          <ion-progress-bar [value]="progress()" [color]="color()" aria-label="Бодрствование относительно возрастного ориентира" />
          <p [class.warning]="wake.status() === 'approaching'" [class.danger]="wake.isOvertired()">{{ statusText() }}</p>
        }
        <div class="feeding">
          <span>После еды: {{ wake.timeSinceLastFeedingSec() | durationFormat }}</span>
          <ion-button fill="outline" size="small" (click)="toggleSide()" [attr.aria-label]="'Следующая грудь: ' + (wake.selectedNextBreastSide() === 'left' ? 'левая' : 'правая') + '. Нажмите, чтобы изменить'">
            Следующая <ion-badge>{{ wake.selectedNextBreastSide() === 'left' ? 'Л' : 'П' }}</ion-badge>
          </ion-button>
        </div>
      </ion-card-content>
    </ion-card>
  `,
  styles: `
    ion-card { margin: 12px 16px; border: 1px solid #292929; }
    .heading, .feeding { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .heading { color: var(--ion-text-color); font-size: 1rem; }
    .timer { font-size: clamp(2.8rem, 12vw, 4rem); font-weight: 650; font-variant-numeric: tabular-nums; color: var(--ion-text-color); margin: 8px 0; }
    p { margin: 8px 0; } ion-progress-bar { margin-top: 14px; height: 6px; border-radius: 4px; }
    ion-button { min-height: 44px; margin: 0; } ion-button ion-badge { margin-left: 8px; }
    .feeding { border-top: 1px solid #333; padding-top: 12px; margin-top: 16px; }
    .warning { color: var(--ion-color-warning); } .danger { color: var(--ion-color-danger); }
  `,
})
export class LiveStatusBannerComponent {
  readonly timers = inject(ActiveTimerService);
  readonly wake = inject(WakeWindowService);
  readonly progress = computed(() => Math.min(1, Math.max(0, this.wake.normProgressRatio() ?? 0)));
  readonly color = computed(() => this.wake.status() === 'overtired' ? 'danger' : this.wake.status() === 'approaching' ? 'warning' : 'success');
  readonly statusText = computed(() => {
    switch (this.wake.status()) {
      case 'optimal': return 'Можно ещё пободрствовать';
      case 'approaching': return 'Пора готовиться ко сну';
      case 'overtired': return 'Есть риск переутомления';
      default: return this.wake.wakeDurationSec() === null ? 'Добавьте завершённый сон для отсчёта ВБ.' : 'Возрастные ориентиры не заданы';
    }
  });
  toggleSide(): void {
    this.wake.selectedNextBreastSide.update(side => side === 'left' ? 'right' : 'left');
  }
}
