import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { YandexSyncService } from './core/services/yandex-sync.service';
import { TimerNotificationService } from './core/services/timer-notification.service';
import { PwaService } from './core/services/pwa.service';
import { ThemeService } from './core/services/theme.service';
import { PreparationReminderService } from './core/services/preparation-reminder.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  readonly pwa = inject(PwaService);
  private readonly yandex = inject(YandexSyncService);
  private readonly timerNotifications = inject(TimerNotificationService);
  private readonly preparationReminders = inject(PreparationReminderService);
  private readonly theme = inject(ThemeService);
}
