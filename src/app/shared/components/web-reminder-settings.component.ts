import { Component, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { IonButton } from '@ionic/angular';
import { WebPreparationReminderService } from '../../core/services/web-preparation-reminder.service';

@Component({
  selector: 'app-web-reminder-settings',
  imports: [IonButton, FormField],
  template: `
    @if (reminders.web) {
      <section aria-labelledby="web-reminder-title">
        <h2 id="web-reminder-title">Напоминания в установленной PWA</h2>
        <p role="status">{{ reminders.description() }}</p>
        @if (reminders.configured() || reminders.ledger()) {
          <p>Это отдельное согласие на передачу подписки устройства и минимального времени напоминания в приватное хранилище Яндекс и через глобальную push-инфраструктуру Apple. Имя, профиль и история не отправляются. Выбранный обмен дневником не меняется.</p>
          <p>Офлайн-изменение не отменяет уже известный серверу план до связи. Focus, ОС и сеть могут задержать или не показать сигнал. Уже принятый push нельзя отозвать.</p>
          @if (reminders.status(); as status) {
            <p>Политика оператора: приглашение {{ status.policy.inviteSeconds }} сек.; неактивное устройство {{ status.policy.inactivityDays }} дн.; подробности завершённой отправки {{ status.policy.terminalHours }} ч.; до {{ status.policy.maxDevices }} устройств и {{ status.policy.maxEnrollmentsPerDay }} регистраций в день. Минимальные отметки отправленных циклов сохраняются до отзыва/удаления области; после {{ status.policy.maxCyclesPerDevice }} циклов нужно новое приглашение. Права операторов, журналы провайдера и трансграничная обработка согласуются до запуска.</p>
          }
          @if (!reminders.ledger() || reminders.ledger()?.enrollment) {
            <form (submit)="$event.preventDefault(); enroll()">
              <label for="push-invitation">Одноразовое приглашение владельца</label>
              <input id="push-invitation" type="password" autocomplete="off" [formField]="invitationForm.code">
              <p>При утрате всех устройств владелец обращается к оператору: приватная IAM-функция восстановления отзывает прежние права и выдаёт новое одноразовое приглашение. Публичного восстановления по UUID нет.</p>
              <ion-button type="submit" expand="block" [disabled]="reminders.busy() || !reminders.supported()">Подключить только это устройство</ion-button>
            </form>
          } @else {
            @if (!reminders.ledger()?.consent) {
              <ion-button expand="block" [disabled]="reminders.busy() || !reminders.supported()" (click)="reminders.preparePermission()">Проверить перед включением</ion-button>
              @if (reminders.preflight()) {
                <ion-button expand="block" [disabled]="reminders.busy()" (click)="reminders.enable()">Согласен · разрешить уведомления на этом телефоне</ion-button>
              }
            } @else {
              <ion-button expand="block" fill="outline" [disabled]="reminders.busy()" (click)="reminders.disable()">Выключить и удалить подписку</ion-button>
            }
            <ion-button expand="block" fill="outline" [disabled]="reminders.busy()" (click)="reminders.refresh()">Проверить состояние / повторить удаление</ion-button>
            <ion-button expand="block" fill="outline" [disabled]="reminders.busy()" (click)="reminders.disable(true)">Отозвать доступ этого устройства</ion-button>
            @if (reminders.status()?.role === 'owner') {
              <ion-button expand="block" [disabled]="reminders.busy()" (click)="reminders.createInvitation()">Пригласить второй телефон</ion-button>
              @if (reminders.invitation()) {
                <label for="owner-push-invitation">Передайте приватно; действует один раз</label>
                <input id="owner-push-invitation" readonly type="text" [value]="reminders.invitation()" autocomplete="off">
                <ion-button fill="clear" (click)="reminders.invitation.set('')">Скрыть приглашение</ion-button>
              }
              @for (device of reminders.status()?.devices ?? []; track device.device) {
                @if (device.device !== reminders.ledger()?.device) {
                  <p>Устройство {{ device.device }} · {{ device.enrolled ? 'получение включено' : 'без подписки' }}</p>
                  <ion-button fill="outline" [disabled]="reminders.busy()" (click)="reminders.revokeDevice(device.device)">Отозвать это устройство</ion-button>
                }
              }
            }
          }
        }
      </section>
    }
  `,
  styles: `section { margin-block:16px; } p { color:var(--ion-color-medium); font-size:.9rem; } label { display:block; margin-block:12px 6px; } input { box-sizing:border-box; inline-size:100%; min-block-size:52px; background:var(--ion-background-color); color:var(--ion-text-color); border:1px solid var(--ion-color-medium); border-radius:8px; padding:12px; } ion-button { min-height:52px; white-space:normal; }`,
})
export class WebReminderSettingsComponent {
  readonly reminders = inject(WebPreparationReminderService);
  readonly invitationModel = signal({ code: '' });
  readonly invitationForm = form(this.invitationModel);
  async enroll(): Promise<void> {
    await this.reminders.enroll(this.invitationModel().code.trim());
    if (!this.reminders.waiting()) this.invitationModel.set({ code: '' });
  }
}
