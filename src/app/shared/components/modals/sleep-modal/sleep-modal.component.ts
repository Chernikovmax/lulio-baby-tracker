import { Component, inject, input, output, signal } from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonModal, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular';
import { DurationFormatPipe } from '../../../pipes/duration-format.pipe';
import type { SleepEvent } from '../../../../core/models/tracker.models';
import { ActiveTimerService } from '../../../../core/services/active-timer.service';
import { StorageService } from '../../../../core/services/storage.service';
import { WakeWindowService } from '../../../../core/services/wake-window.service';
import { RussianSheetDirective } from '../russian-sheet.directive';
import { localDateTime } from '../../../local-date-time';
import { TimerStartOffsetComponent } from '../../timer-start-offset/timer-start-offset.component';

@Component({
  selector: 'app-sleep-modal',
  imports: [IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonSegment, IonSegmentButton, FormField, DurationFormatPipe, RussianSheetDirective, TimerStartOffsetComponent],
  template: `
    <ion-modal appRussianSheet aria-label="Сон" [isOpen]="isOpen()" [breakpoints]="[0, 0.55, 0.9]" [initialBreakpoint]="0.9" [expandToScroll]="false" (willPresent)="prepare()" (didDismiss)="closed.emit()">
      <ng-template>
        <ion-header><ion-toolbar><ion-title>Сон</ion-title><ion-button slot="end" fill="clear" aria-label="Закрыть" (click)="closed.emit()">Закрыть</ion-button></ion-toolbar></ion-header>
        <ion-content class="sheet-content">
          <ion-segment [value]="tab()" (ionChange)="setTab($event.detail.value)">
            <ion-segment-button value="timer">Таймер</ion-segment-button><ion-segment-button value="manual">Вручную</ion-segment-button>
          </ion-segment>
          @if (tab() === 'timer') {
            <section class="panel">
              @if (timer.sleepTimer(); as running) {
                <p class="elapsed">{{ timer.sleepDurationSec() | durationFormat:'timer' }}</p>
                <p>{{ running.pausedAt ? 'Сон на паузе' : (running.isNightSleep ? 'Идёт ночной сон' : 'Идёт дневной сон') }}</p>
                <ion-button expand="block" fill="outline" [disabled]="pending()" (click)="togglePause()">{{ running.pausedAt ? 'Продолжить сон' : 'Пауза' }}</ion-button>
                <ion-button expand="block" [disabled]="pending()" (click)="stop()">Завершить сон</ion-button>
              } @else {
                <div class="toggle" role="group" aria-label="Тип сна">
                  <ion-button expand="block" [fill]="!night() ? 'solid' : 'outline'" [disabled]="pending()" (click)="night.set(false)">День</ion-button>
                  <ion-button expand="block" [fill]="night() ? 'solid' : 'outline'" [disabled]="pending()" (click)="night.set(true)">Ночь</ion-button>
                </div>
                <app-timer-start-offset [(minutes)]="minutesAgo" [disabled]="pending()" />
                <ion-button class="primary" expand="block" [disabled]="pending()" (click)="start()">Начать сон</ion-button>
              }
            </section>
          } @else {
            <form class="panel" (submit)="$event.preventDefault(); saveManual()">
              <label>Начало сна<input type="datetime-local" [formField]="manualForm.startTime"></label>
              <label>Окончание сна<input type="datetime-local" [formField]="manualForm.endTime"></label>
              <div class="toggle" role="group" aria-label="Тип сна">
                <ion-button expand="block" [fill]="!manualModel().isNightSleep ? 'solid' : 'outline'" (click)="patchManual({isNightSleep:false})">День</ion-button>
                <ion-button expand="block" [fill]="manualModel().isNightSleep ? 'solid' : 'outline'" (click)="patchManual({isNightSleep:true})">Ночь</ion-button>
              </div>
              <label>Заметка<textarea [formField]="manualForm.note" rows="2"></textarea></label>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              <ion-button class="primary" type="button" expand="block" [disabled]="pending()" (click)="saveManual()">Сохранить сон</ion-button>
            </form>
          }
          @if (tab() === 'timer' && error()) { <p class="error" role="alert">{{ error() }}</p> }
        </ion-content>
      </ng-template>
    </ion-modal>`,
  styles: [`.sheet-content{--padding-bottom:24px}.panel{padding:20px 18px;display:grid;gap:16px}.elapsed{text-align:center;font-size:2.4rem;font-variant-numeric:tabular-nums;margin:8px 0}.toggle{display:grid;grid-template-columns:1fr 1fr;gap:10px}.primary{margin-top:8px}label{display:grid;gap:8px;font-weight:600}input,textarea{font:inherit;padding:13px;border-radius:12px;border:1px solid var(--ion-color-medium);background:var(--ion-background-color);color:var(--ion-text-color);min-height:48px}.error{color:var(--ion-color-danger);padding:0 18px}ion-button{min-height:52px}`]
})
export class SleepModalComponent {
  readonly isOpen = input(false);
  readonly closed = output<void>();
  readonly timer = inject(ActiveTimerService);
  private readonly storage = inject(StorageService);
  private readonly wake = inject(WakeWindowService);
  readonly tab = signal<'timer' | 'manual'>('timer');
  readonly night = signal(false);
  readonly minutesAgo = signal(0);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly manualModel = signal({ startTime: localDateTime(), endTime: localDateTime(), isNightSleep: false, note: '' });
  readonly manualForm = form(this.manualModel, path => { required(path.startTime); required(path.endTime); });
  prepare(): void {
    const now = localDateTime();
    this.night.set(this.wake.isNight());
    this.minutesAgo.set(0);
    this.manualModel.update(value => ({ ...value, startTime: now, endTime: now }));
    this.error.set('');
  }
  setTab(value: string | number | undefined) {
    if (value === 'timer' || value === 'manual') {
      if (value === 'timer' && this.tab() !== 'timer') this.night.set(this.wake.isNight());
      this.tab.set(value);
      this.error.set('');
    }
  }
  patchManual(patch: Partial<{ isNightSleep: boolean }>) { this.manualModel.update(model => ({ ...model, ...patch })); }
  async start() { await this.run(async () => { await this.timer.startSleep(this.night(), this.minutesAgo()); this.minutesAgo.set(0); }); }
  async stop() { await this.run(async () => { await this.timer.stopSleep(); }); }
  async togglePause() { await this.run(() => this.timer.sleepTimer()?.pausedAt ? this.timer.resumeSleep() : this.timer.pauseSleep()); }
  async saveManual() {
    const value = this.manualModel();
    const start = new Date(value.startTime), end = new Date(value.endTime), now = Date.now();
    if (!value.startTime || !value.endTime || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) { this.error.set('Укажите корректные даты начала и окончания.'); return; }
    if (end.getTime() <= start.getTime()) { this.error.set('Окончание должно быть позже начала.'); return; }
    if (end.getTime() > now) { this.error.set('Окончание не может быть в будущем.'); return; }
    const event: SleepEvent = { id: crypto.randomUUID(), type: 'sleep', startTime: start.toISOString(), endTime: end.toISOString(), isNightSleep: value.isNightSleep, ...(value.note.trim() ? { note: value.note.trim() } : {}), updatedAt: new Date().toISOString() };
    await this.run(async () => { await this.storage.saveEvent(event); this.manualForm().reset({ startTime: localDateTime(), endTime: localDateTime(), isNightSleep: false, note: '' }); this.closed.emit(); });
  }
  private async run(operation: () => Promise<void>) { if (this.pending()) return; this.pending.set(true); this.error.set(''); try { await operation(); } catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'Не удалось сохранить данные.'); } finally { this.pending.set(false); } }
}
