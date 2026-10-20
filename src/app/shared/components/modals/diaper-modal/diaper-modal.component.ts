import { Component, inject, input, output, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/angular';
import type { DiaperEvent, DiaperState } from '../../../../core/models/tracker.models';
import { StorageService } from '../../../../core/services/storage.service';
import { RussianSheetDirective } from '../russian-sheet.directive';

@Component({
 selector:'app-diaper-modal',imports:[IonModal,IonHeader,IonToolbar,IonTitle,IonContent,IonButton,FormField,RussianSheetDirective],
 template: `
 <ion-modal appRussianSheet aria-label="Подгузник" [isOpen]="isOpen()" [breakpoints]="[0, 0.55, 0.9]" [initialBreakpoint]="0.55" (didDismiss)="closed.emit()">
   <ng-template>
     <ion-header><ion-toolbar><ion-title>Подгузник</ion-title><ion-button slot="end" fill="clear" aria-label="Закрыть" (click)="closed.emit()">Закрыть</ion-button></ion-toolbar></ion-header>
     <ion-content>
       <section class="panel">
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
 styles:[`.panel{padding:22px 18px;display:grid;gap:16px}.choices{display:grid;gap:10px}label{display:grid;gap:8px;font-weight:600}textarea{font:inherit;padding:13px;border-radius:12px;border:1px solid var(--ion-color-medium);background:var(--ion-background-color);color:var(--ion-text-color);min-height:90px}.error{color:var(--ion-color-danger)}ion-button{min-height:52px}.save{margin-top:8px}`]
})
export class DiaperModalComponent {
 readonly isOpen = input(false);
 readonly closed = output<void>();
 private readonly storage = inject(StorageService);
 readonly pending = signal(false);
 readonly error = signal('');
 readonly noteModel = signal({ note: '' });
 readonly noteForm = form(this.noteModel);

 async save(state: DiaperState): Promise<void> {
   if (this.pending()) return;
   const now = new Date().toISOString();
   const note = this.noteModel().note.trim();
   const event: DiaperEvent = { id: crypto.randomUUID(), type: 'diaper', state, startTime: now, updatedAt: now, ...(note ? { note } : {}) };
   this.pending.set(true);
   this.error.set('');
   try {
     await this.storage.saveEvent(event);
     this.noteModel.set({ note: '' });
     this.closed.emit();
   } catch (reason) {
     this.error.set(reason instanceof Error ? reason.message : 'Не удалось сохранить данные.');
   } finally {
     this.pending.set(false);
   }
 }
}
