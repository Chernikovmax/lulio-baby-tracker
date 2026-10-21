import { Component, inject, input, output, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/angular';
import type { DiaperEvent, DiaperState } from '../../../../core/models/tracker.models';
import { StorageService } from '../../../../core/services/storage.service';
import { RussianSheetDirective } from '../russian-sheet.directive';
import { localDateTime } from '../../../local-date-time';

@Component({
 selector:'app-diaper-modal',imports:[IonModal,IonHeader,IonToolbar,IonTitle,IonContent,IonButton,FormField,RussianSheetDirective],
 template: `
 <ion-modal appRussianSheet aria-label="Подгузник" [isOpen]="isOpen()" [breakpoints]="[0, 0.55, 0.9]" [initialBreakpoint]="0.9" [expandToScroll]="false" [canDismiss]="!pending()" (willPresent)="prepare()" (didDismiss)="closed.emit()">
   <ng-template>
     <ion-header><ion-toolbar><ion-title>Подгузник</ion-title><ion-button slot="end" fill="clear" aria-label="Закрыть" (click)="closed.emit()">Закрыть</ion-button></ion-toolbar></ion-header>
     <ion-content>
       <section class="panel">
         <label>Время смены<input type="datetime-local" [formField]="noteForm.startTime"></label>
         <label>Заметка<textarea rows="2" [formField]="noteForm.note" placeholder="Необязательно"></textarea></label>
         <p>Нажмите, чтобы сразу сохранить:</p>
         <div class="choices" role="group" aria-label="Сохранить смену подгузника">
           <ion-button expand="block" [disabled]="pending()" (click)="save('wet')">Мокрый</ion-button>
           <ion-button expand="block" [disabled]="pending()" (click)="save('dirty')">Грязный</ion-button>
           <ion-button expand="block" [disabled]="pending()" (click)="save('mixed')">Смешанный</ion-button>
         </div>
         @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
       </section>
     </ion-content>
   </ng-template>
 </ion-modal>`,
 styles:[`.panel{padding:22px 18px;display:grid;gap:16px}.choices{display:grid;gap:10px}label{display:grid;gap:8px;font-weight:600}input,textarea{box-sizing:border-box;width:100%;min-width:0;font:inherit;padding:13px;border-radius:12px;border:1px solid var(--ion-color-medium);background:var(--ion-background-color);color:var(--ion-text-color);min-height:52px}.error{color:var(--ion-color-danger)}ion-button{min-height:52px}`]
})
export class DiaperModalComponent {
 readonly isOpen = input(false);
 readonly closed = output<void>();
 private readonly storage = inject(StorageService);
 readonly pending = signal(false);
 readonly error = signal('');
 readonly noteModel = signal({ note: '', startTime: localDateTime() });
 readonly noteForm = form(this.noteModel);
 prepare(): void {
   this.noteModel.update(value => ({ ...value, startTime: localDateTime() }));
   this.error.set('');
 }

 async save(state: DiaperState): Promise<void> {
   if (this.pending()) return;
   const start = new Date(this.noteModel().startTime);
   if (!Number.isFinite(start.getTime()) || start.getTime() > Date.now()) {
     this.error.set('Укажите корректное время смены, не позднее текущего момента.');
     return;
   }
   const now = new Date().toISOString();
   const note = this.noteModel().note.trim();
   const event: DiaperEvent = { id: crypto.randomUUID(), type: 'diaper', state, startTime: start.toISOString(), updatedAt: now, ...(note ? { note } : {}) };
   this.pending.set(true);
   this.error.set('');
   try {
     await this.storage.saveEvent(event);
     this.noteForm().reset({ note: '', startTime: localDateTime() });
     this.closed.emit();
   } catch (reason) {
     this.error.set(reason instanceof Error ? reason.message : 'Не удалось сохранить данные.');
   } finally {
     this.pending.set(false);
   }
 }
}
