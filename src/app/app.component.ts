import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { YandexSyncService } from './core/services/yandex-sync.service';
import { TimerNotificationService } from './core/services/timer-notification.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly yandex = inject(YandexSyncService);
  private readonly timerNotifications = inject(TimerNotificationService);
}
