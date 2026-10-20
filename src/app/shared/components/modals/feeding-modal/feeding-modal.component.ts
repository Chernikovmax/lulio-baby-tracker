import { Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { form, FormField, max, min, required } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonModal, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular';
import type { BottleContent, BreastSide, BottleEvent } from '../../../../core/models/tracker.models';
import { ActiveTimerService } from '../../../../core/services/active-timer.service';
import { StorageService } from '../../../../core/services/storage.service';
import { WakeWindowService } from '../../../../core/services/wake-window.service';
import { DurationFormatPipe } from '../../../pipes/duration-format.pipe';
import { RussianSheetDirective } from '../russian-sheet.directive';

type FeedingTab = 'breastfeeding' | 'bottle';
@Component({
 selector:'app-feeding-modal',
 imports:[IonModal,IonHeader,IonToolbar,IonTitle,IonContent,IonButton,IonSegment,IonSegmentButton,FormField,DurationFormatPipe,RussianSheetDirective],
 template:`<ion-modal appRussianSheet aria-label="Кормление" [isOpen]="isOpen()" [breakpoints]="[0,0.55,0.9]" [initialBreakpoint]="0.55" (didDismiss)="closed.emit()"><ng-template>
 <ion-header><ion-toolbar><ion-title>Кормление</ion-title><ion-button slot="end" fill="clear" aria-label="Закрыть" (click)="closed.emit()">Закрыть</ion-button></ion-toolbar></ion-header>
 <ion-content class="sheet-content"><ion-segment [value]="tab()" (ionChange)="setTab($event.detail.value)"><ion-segment-button value="breastfeeding">Грудь</ion-segment-button><ion-segment-button value="bottle">Бутылочка</ion-segment-button></ion-segment>
 @if(tab()==='breastfeeding'){<section class="panel"><p class="elapsed">{{timer.breastDurationSec()|durationFormat:'timer'}}</p><div class="sides">
 <ion-button expand="block" [fill]="timer.breastTimer()?.activeSide==='left'||(!timer.breastTimer()&&selectedSide()==='left')?'solid':'outline'" [disabled]="pending()" (click)="choose('left')">Левая · {{timer.leftDurationSec()|durationFormat:'timer'}}</ion-button>
 <ion-button expand="block" [fill]="timer.breastTimer()?.activeSide==='right'||(!timer.breastTimer()&&selectedSide()==='right')?'solid':'outline'" [disabled]="pending()" (click)="choose('right')">Правая · {{timer.rightDurationSec()|durationFormat:'timer'}}</ion-button></div>
 @if(timer.breastTimer()){<div class="actions"><ion-button expand="block" [disabled]="pending()||!timer.breastTimer()?.activeSide" (click)="pause()">Пауза</ion-button><ion-button expand="block" [disabled]="pending()" (click)="finish()">Завершить кормление</ion-button></div>} @else {<p class="hint">Выберите грудь, чтобы начать кормление</p>}
 @if(error()) {<p class="error" role="alert">{{error()}}</p>}</section>}
 @else {<form class="panel" (submit)="$event.preventDefault();saveBottle()"><label>Содержимое<select [formField]="bottleForm.content"><option value="breast_milk">Грудное молоко</option><option value="formula">Смесь</option><option value="water">Вода</option></select></label>
 <label>Объём, мл<input type="number" step="1" [formField]="bottleForm.volumeMl"></label>
 <div class="chips" aria-label="Добавить объём"><ion-button type="button" fill="outline" (click)="add(30)">+30 мл</ion-button><ion-button type="button" fill="outline" (click)="add(60)">+60 мл</ion-button><ion-button type="button" fill="outline" (click)="add(90)">+90 мл</ion-button><ion-button type="button" fill="outline" (click)="add(120)">+120 мл</ion-button></div>
 <label>Время кормления<input type="datetime-local" [formField]="bottleForm.startTime"></label><label>Заметка<textarea rows="2" [formField]="bottleForm.note"></textarea></label>
 @if(error()){<p class="error" role="alert">{{error()}}</p>}<ion-button type="button" expand="block" [disabled]="pending()" (click)="saveBottle()">Сохранить кормление</ion-button></form>}</ion-content></ng-template></ion-modal>`,
 styles:[`.sheet-content{--padding-bottom:24px}.panel{padding:18px;display:grid;gap:14px}.elapsed{text-align:center;font-size:2.1rem;font-variant-numeric:tabular-nums;margin:4px}.sides,.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}.hint{text-align:center;color:var(--ion-color-medium)}label{display:grid;gap:8px;font-weight:600}input,select,textarea{font:inherit;padding:13px;border-radius:12px;border:1px solid var(--ion-color-medium);background:var(--ion-background-color);color:var(--ion-text-color);min-height:48px}.error{color:var(--ion-color-danger)}ion-button{min-height:52px}`]
})
export class FeedingModalComponent {
 readonly isOpen=input(false); readonly closed=output<void>(); readonly initialTab=input<FeedingTab>('breastfeeding');
 readonly tab=linkedSignal({source:()=>({tab:this.initialTab(),open:this.isOpen()}),computation:source=>source.tab}); readonly timer=inject(ActiveTimerService); private readonly storage=inject(StorageService); private readonly wake=inject(WakeWindowService);
 readonly selectedSide=linkedSignal(()=>this.wake.selectedNextBreastSide()); readonly pending=signal(false); readonly error=signal('');
 readonly bottleModel=signal({content:'breast_milk' as BottleContent,volumeMl:90,startTime:this.localDateTime(),note:''});
 readonly bottleForm=form(this.bottleModel,path=>{required(path.content);required(path.volumeMl);min(path.volumeMl,5);max(path.volumeMl,500);required(path.startTime);});
 setTab(value:string|number|undefined){if(value==='breastfeeding'||value==='bottle'){this.tab.set(value);this.error.set('');}}
 add(amount:number){this.bottleModel.update(model=>({...model,volumeMl:Math.min(500,Number(model.volumeMl||0)+amount)}));}
 async choose(side:BreastSide){await this.run(async()=>{const current=this.timer.breastTimer(); if(!current) await this.timer.startBreastfeeding(side); else if(current.activeSide!==side) await this.timer.switchBreast(side); this.selectedSide.set(side);});}
 async pause(){await this.run(()=>this.timer.pauseBreastfeeding());}
 async finish(){await this.run(async()=>{await this.timer.stopBreastfeeding();this.closed.emit();});}
 async saveBottle(){const value=this.bottleModel();const start=new Date(value.startTime);if(!Number.isFinite(start.getTime())||start.getTime()>Date.now()){this.error.set('Укажите корректное время кормления, не позднее текущего момента.');return;}const volume=Number(value.volumeMl);if(!Number.isFinite(volume)||volume<5||volume>500){this.error.set('Объём должен быть от 5 до 500 мл.');return;}const startTime=start.toISOString();const event:BottleEvent={id:crypto.randomUUID(),type:'bottle',content:value.content,volumeMl:volume,startTime,updatedAt:new Date().toISOString(),...(value.note.trim()?{note:value.note.trim()}:{})};await this.run(async()=>{await this.storage.saveEvent(event);this.bottleModel.set({content:'breast_milk',volumeMl:90,startTime:this.localDateTime(),note:''});this.closed.emit();});}
 private localDateTime(){const date=new Date();date.setMinutes(date.getMinutes()-date.getTimezoneOffset());return date.toISOString().slice(0,16);}
 private async run(operation:()=>Promise<void>){this.pending.set(true);this.error.set('');try{await operation();}catch(reason){this.error.set(reason instanceof Error?reason.message:'Не удалось сохранить данные.');}finally{this.pending.set(false);}}
}
