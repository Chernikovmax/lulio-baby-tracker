import { afterRenderEffect, Component, computed, ElementRef, inject, linkedSignal, viewChild } from '@angular/core';
import { IonAccordion, IonAccordionGroup, IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudyOutline, sunnyOutline, thunderstormOutline } from 'ionicons/icons';
import { LEAP_CALENDAR_NOTICE } from '../../core/constants/wonder-weeks.const';
import type { WeekWeather } from '../../core/models/leap.models';
import { LeapsService } from '../../core/services/leaps.service';
import { StorageService } from '../../core/services/storage.service';

@Component({
  selector: 'app-leaps-page',
  imports: [IonAccordion, IonAccordionGroup, IonButton, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonTitle, IonToolbar],
  templateUrl: './leaps.page.html',
  styleUrl: './leaps.page.scss',
})
export class LeapsPage {
  readonly leaps = inject(LeapsService);
  readonly storage = inject(StorageService);
  readonly notice = LEAP_CALENDAR_NOTICE;
  readonly icons = { sunny: 'sunny-outline', fussy: 'cloudy-outline', stormy: 'thunderstorm-outline' };
  readonly weatherLabels: Record<WeekWeather, string> = { sunny: 'Спокойная фаза', fussy: 'Беспокойная фаза', stormy: 'Кризисная фаза' };
  readonly selectedWeek = linkedSignal(() => Math.min(75, Math.max(1, this.leaps.currentWeek() ?? 1)));
  readonly selected = computed(() => this.leaps.calendar()[this.selectedWeek() - 1]);
  readonly selectedLeap = computed(() => {
    const selected = this.selected();
    return this.leaps.leaps.find(leap => leap.leapNumber === selected.leapNumber)
      ?? this.leaps.leaps.find(leap => leap.startWeek > selected.weekNumber)
      ?? this.leaps.leaps.at(-1)!;
  });
  readonly banner = computed(() => {
    const week = this.leaps.currentWeek();
    if (week === null) return 'Укажите ПДР в профиле малыша, чтобы увидеть текущую фазу.';
    if (week <= 0) return 'ПДР ещё не наступила. Календарь начнётся с первой недели от предполагаемой даты родов.';
    if (week > 75) return 'Малыш уже старше календаря скачков. Здесь можно посмотреть недели 1–75.';
    return this.leaps.currentLeap()?.title ?? 'Спокойная фаза: время осваивать новые навыки';
  });
  private readonly timeline = viewChild<ElementRef<HTMLElement>>('timeline');

  constructor() {
    addIcons({ cloudyOutline, sunnyOutline, thunderstormOutline });
    afterRenderEffect(() => {
      const week = this.selectedWeek();
      const container = this.timeline()?.nativeElement;
      const button = container?.querySelector<HTMLElement>(`[data-week="${week}"]`);
      if (container && button) container.scrollTo({ left: button.offsetLeft - (container.clientWidth - button.offsetWidth) / 2, behavior: 'instant' });
    });
  }

  ionViewDidEnter(): void {
    const week = this.leaps.currentWeek();
    if (week !== null && week >= 1 && week <= 75) this.selectedWeek.set(week);
  }
}
