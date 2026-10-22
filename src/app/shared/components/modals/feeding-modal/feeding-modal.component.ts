import { Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { form, FormField, max, min, required } from '@angular/forms/signals';
import { IonButton, IonContent, IonFooter, IonHeader, IonModal, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular';
import type { BottleContent, BreastSide, BottleEvent, BreastfeedingEvent } from '../../../../core/models/tracker.models';
import { ActiveTimerService } from '../../../../core/services/active-timer.service';
import { StorageService } from '../../../../core/services/storage.service';
import { WakeWindowService } from '../../../../core/services/wake-window.service';
import { localDateTime } from '../../../local-date-time';
import { DurationFormatPipe } from '../../../pipes/duration-format.pipe';
import { RussianSheetDirective } from '../russian-sheet.directive';
import { TimerStartOffsetComponent } from '../../timer-start-offset/timer-start-offset.component';

type FeedingTab = 'breastfeeding' | 'bottle';
@Component({
  selector: 'app-feeding-modal',
  imports: [IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonFooter, IonButton, IonSegment, IonSegmentButton, FormField, DurationFormatPipe, RussianSheetDirective, TimerStartOffsetComponent],
  template: `
    <ion-modal appRussianSheet aria-label="Кормление" [isOpen]="isOpen()" [breakpoints]="[0,0.55,0.9]" [initialBreakpoint]="0.9" [expandToScroll]="false" [canDismiss]="!pending()" (willPresent)="prepare()" (didDismiss)="closed.emit()"><ng-template>
      <ion-header><ion-toolbar><ion-title>Кормление</ion-title><ion-button slot="end" fill="clear" [disabled]="pending()" aria-label="Закрыть" (click)="closed.emit()">Закрыть</ion-button></ion-toolbar></ion-header>
      <ion-content class="sheet-content">
        <ion-segment [value]="tab()" (ionChange)="setTab($event.detail.value)"><ion-segment-button value="breastfeeding">Грудь</ion-segment-button><ion-segment-button value="bottle">Бутылочка</ion-segment-button></ion-segment>
        @if (tab() === 'breastfeeding') {
          <ion-segment aria-label="Способ записи грудного кормления" [value]="breastMode()" (ionChange)="setBreastMode($event.detail.value)"><ion-segment-button value="timer">Таймер</ion-segment-button><ion-segment-button value="manual">Вручную</ion-segment-button></ion-segment>
          @if (breastMode() === 'timer') {
            <section class="panel">
              <p class="elapsed">{{ timer.breastDurationSec() | durationFormat:'timer' }}</p>
              @if (!timer.breastTimer()) {
                <app-timer-start-offset [(minutes)]="minutesAgo" [disabled]="pending()" />
                <p class="hint">Прошедшие минуты будут добавлены выбранной при запуске груди.</p>
              }
              <div class="sides">
                <ion-button expand="block" [fill]="timer.breastTimer()?.activeSide==='left'||(!timer.breastTimer()&&selectedSide()==='left')?'solid':'outline'" [disabled]="pending()" (click)="choose('left')">Левая · {{ timer.leftDurationSec() | durationFormat:'timer' }}</ion-button>
                <ion-button expand="block" [fill]="timer.breastTimer()?.activeSide==='right'||(!timer.breastTimer()&&selectedSide()==='right')?'solid':'outline'" [disabled]="pending()" (click)="choose('right')">Правая · {{ timer.rightDurationSec() | durationFormat:'timer' }}</ion-button>
              </div>
              @if (timer.breastTimer()) { <div class="actions"><ion-button expand="block" [disabled]="pending()||!timer.breastTimer()?.activeSide" (click)="pause()">Пауза</ion-button><ion-button expand="block" [disabled]="pending()" (click)="finish()">Завершить кормление</ion-button></div> }
              @else { <p class="hint">Выберите грудь, чтобы начать кормление</p> }
            </section>
          } @else {
            <form id="manual-breast-form" class="panel" (submit)="$event.preventDefault(); saveManualBreast()">
              <label>Начало кормления<input type="datetime-local" [formField]="manualForm.startTime"></label>
              <label>Левая грудь, минут<input type="number" step="1" [formField]="manualForm.leftMinutes"></label>
              <label>Правая грудь, минут<input type="number" step="1" [formField]="manualForm.rightMinutes"></label>
              <p class="hint">Окончание рассчитывается автоматически: начало плюс сумма минут у обеих грудей, без пауз.</p>
              <label>Последняя грудь<select [formField]="manualForm.lastSide"><option value="left">Левая</option><option value="right">Правая</option></select></label>
              <label>Заметка<textarea rows="2" [formField]="manualForm.note"></textarea></label>
            </form>
          }
        } @else {
          <form id="bottle-form" class="panel" (submit)="$event.preventDefault(); saveBottle()">
            <label>Содержимое<select [formField]="bottleForm.content"><option value="breast_milk">Грудное молоко</option><option value="formula">Смесь</option><option value="water">Вода</option></select></label>
            <label>Объём, мл<input type="number" step="1" [formField]="bottleForm.volumeMl"></label>
            <div class="chips" aria-label="Добавить объём"><ion-button type="button" fill="outline" (click)="add(30)">+30 мл</ion-button><ion-button type="button" fill="outline" (click)="add(60)">+60 мл</ion-button><ion-button type="button" fill="outline" (click)="add(90)">+90 мл</ion-button><ion-button type="button" fill="outline" (click)="add(120)">+120 мл</ion-button></div>
            <label>Время кормления<input type="datetime-local" [formField]="bottleForm.startTime"></label>
            <label>Заметка<textarea rows="2" [formField]="bottleForm.note"></textarea></label>
          </form>
        }
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </ion-content>
      @if (tab() === 'bottle' || breastMode() === 'manual') {
        <ion-footer><ion-toolbar><ion-button expand="block" [disabled]="pending()" (click)="tab() === 'bottle' ? saveBottle() : saveManualBreast()">{{ pending() ? 'Сохранение…' : 'Сохранить кормление' }}</ion-button></ion-toolbar></ion-footer>
      }
    </ng-template></ion-modal>`,
  styles: [`.sheet-content{--padding-bottom:24px}.panel{padding:18px;display:grid;gap:14px}.elapsed{text-align:center;font-size:2.1rem;font-variant-numeric:tabular-nums;margin:4px}.sides,.actions,.chips{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hint{text-align:center;color:var(--ion-color-medium)}label{display:grid;gap:8px;font-weight:600}input,select,textarea{box-sizing:border-box;min-width:0;width:100%;font:inherit;padding:13px;border-radius:12px;border:1px solid var(--ion-color-medium);background:var(--ion-background-color);color:var(--ion-text-color);min-height:48px}.error{color:var(--ion-color-danger);padding:0 18px}ion-button{min-height:52px}ion-footer ion-button{margin:8px 18px}`],
})
export class FeedingModalComponent {
  readonly isOpen = input(false);
  readonly closed = output<void>();
  readonly initialTab = input<FeedingTab>('breastfeeding');
  readonly tab = linkedSignal({ source: () => ({ tab: this.initialTab(), open: this.isOpen() }), computation: source => source.tab });
  readonly breastMode = signal<'timer' | 'manual'>('timer');
  readonly timer = inject(ActiveTimerService);
  private readonly storage = inject(StorageService);
  private readonly wake = inject(WakeWindowService);
  readonly selectedSide = linkedSignal(() => this.wake.selectedNextBreastSide());
  readonly minutesAgo = signal(0);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly bottleModel = signal({ content: 'breast_milk' as BottleContent, volumeMl: 90, startTime: localDateTime(), note: '' });
  readonly bottleForm = form(this.bottleModel, path => { required(path.content); required(path.volumeMl); min(path.volumeMl, 5); max(path.volumeMl, 500); required(path.startTime); });
  readonly manualModel = signal({ startTime: localDateTime(), leftMinutes: 0, rightMinutes: 0, lastSide: 'left' as BreastSide, note: '' });
  readonly manualForm = form(this.manualModel, path => { required(path.startTime); min(path.leftMinutes, 0); min(path.rightMinutes, 0); });

  prepare(): void {
    const now = localDateTime();
    this.minutesAgo.set(0);
    this.bottleModel.update(value => ({ ...value, startTime: now }));
    this.manualModel.update(value => ({ ...value, startTime: now }));
    this.error.set('');
  }
  setTab(value: string | number | undefined): void { if (value === 'breastfeeding' || value === 'bottle') { this.tab.set(value); this.error.set(''); } }
  setBreastMode(value: string | number | undefined): void { if (value === 'timer' || value === 'manual') { this.breastMode.set(value); this.error.set(''); } }
  add(amount: number): void { this.bottleModel.update(model => ({ ...model, volumeMl: Math.min(500, Number(model.volumeMl || 0) + amount) })); }
  async choose(side: BreastSide): Promise<void> { await this.run(async () => { const current = this.timer.breastTimer(); if (!current) { await this.timer.startBreastfeeding(side, this.minutesAgo()); this.minutesAgo.set(0); } else if (current.activeSide !== side) await this.timer.switchBreast(side); this.selectedSide.set(side); }); }
  async pause(): Promise<void> { await this.run(() => this.timer.pauseBreastfeeding()); }
  async finish(): Promise<void> { await this.run(async () => { await this.timer.stopBreastfeeding(); this.closed.emit(); }); }

  async saveBottle(): Promise<void> {
    if (this.pending()) return;
    const value = this.bottleModel();
    const start = new Date(value.startTime);
    if (!Number.isFinite(start.getTime()) || start.getTime() > Date.now()) { this.error.set('Укажите корректное время кормления, не позднее текущего момента.'); return; }
    const volume = Number(value.volumeMl);
    if (!Number.isFinite(volume) || volume < 5 || volume > 500) { this.error.set('Объём должен быть от 5 до 500 мл.'); return; }
    const event: BottleEvent = { id: crypto.randomUUID(), type: 'bottle', content: value.content, volumeMl: volume, startTime: start.toISOString(), updatedAt: new Date().toISOString(), ...(value.note.trim() ? { note: value.note.trim() } : {}) };
    await this.run(async () => {
      await this.storage.saveEvent(event);
      this.bottleForm().reset({ content: 'breast_milk', volumeMl: 90, startTime: localDateTime(), note: '' });
      this.closed.emit();
    });
  }

  async saveManualBreast(): Promise<void> {
    if (this.pending()) return;
    const value = this.manualModel();
    const start = new Date(value.startTime).getTime();
    if (!Number.isFinite(start) || start > Date.now()) { this.error.set('Укажите корректное начало кормления, не позднее текущего момента.'); return; }
    const left = Number(value.leftMinutes), right = Number(value.rightMinutes);
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || right < 0 || left + right <= 0) { this.error.set('Укажите целые неотрицательные минуты у каждой груди; сумма должна быть больше нуля.'); return; }
    const end = start + (left + right) * 60_000;
    if (!Number.isFinite(end) || end > Date.now()) { this.error.set('Рассчитанное окончание кормления не может быть в будущем. Проверьте начало и длительность.'); return; }
    if ((value.lastSide === 'left' ? left : right) === 0) { this.error.set('Для последней груди укажите ненулевую длительность.'); return; }
    const event: BreastfeedingEvent = { id: crypto.randomUUID(), type: 'breastfeeding', startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), leftDurationSec: left * 60, rightDurationSec: right * 60, lastSide: value.lastSide, updatedAt: new Date().toISOString(), ...(value.note.trim() ? { note: value.note.trim() } : {}) };
    await this.run(async () => {
      await this.storage.saveEvent(event);
      this.manualForm().reset({ startTime: localDateTime(), leftMinutes: 0, rightMinutes: 0, lastSide: this.wake.selectedNextBreastSide(), note: '' });
      this.closed.emit();
    });
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.pending()) return;
    this.pending.set(true); this.error.set('');
    try { await operation(); }
    catch (reason) { this.error.set(reason instanceof Error ? reason.message : 'Не удалось сохранить данные.'); }
    finally { this.pending.set(false); }
  }
}
