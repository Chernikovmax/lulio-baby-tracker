import { Component, inject, signal } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonModal, IonHeader, IonToolbar, IonTitle, IonButton, IonContent } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { todayOutline, statsChartOutline, sparklesOutline, personOutline, timeOutline } from 'ionicons/icons';
import { StorageService } from '../core/services/storage.service';
import { SleepAssistantCardComponent } from '../shared/components/sleep-assistant-card.component';
import { SleepHistoryEditorComponent } from '../shared/components/sleep-history-editor.component';
import { RussianSheetDirective } from '../shared/components/modals/russian-sheet.directive';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonModal, IonHeader, IonToolbar, IonTitle, IonButton, IonContent, SleepAssistantCardComponent, SleepHistoryEditorComponent, RussianSheetDirective],
})
export class TabsPage {
  readonly storage = inject(StorageService);
  readonly assistantOpen = signal(false);
  constructor() {
    addIcons({ todayOutline, statsChartOutline, sparklesOutline, personOutline, timeOutline });
  }
}
