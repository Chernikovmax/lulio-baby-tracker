import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonHeader, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular';
import type { GrowthEvent } from '../../core/models/tracker.models';
import { ClockService } from '../../core/services/clock.service';
import { StorageService } from '../../core/services/storage.service';
import { GrowthModalComponent } from '../../shared/components/modals/growth-modal/growth-modal.component';
import { DurationFormatPipe } from '../../shared/pipes/duration-format.pipe';
import { calculateStats } from './stats-calculations';

@Component({
  selector: 'app-stats-page',
  imports: [IonButton, IonContent, IonHeader, IonSegment, IonSegmentButton, IonTitle, IonToolbar, DurationFormatPipe, GrowthModalComponent],
  templateUrl: './stats.page.html',
  styleUrl: './stats.page.scss',
})
export class StatsPage {
  readonly storage = inject(StorageService);
  private readonly clock = inject(ClockService);
  readonly period = signal(7);
  readonly growthOpen = signal(false);
  private readonly today = computed(() => {
    const now = new Date(this.clock.now());
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  });
  readonly stats = computed(() => calculateStats(this.storage.events(), this.today(), this.period(), this.clock.now()));
  readonly feedingAverage = computed(() => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(this.stats().averageFeedings));
  readonly growthHistory = computed(() => {
    const history = this.storage.events().filter((event): event is GrowthEvent => event.type === 'growth')
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || Date.parse(a.updatedAt) - Date.parse(b.updatedAt) || a.id.localeCompare(b.id));
    const previous: Partial<Record<'weightKg' | 'heightCm' | 'headCm', number>> = {};
    return history.map(event => {
      const measurements = (['weightKg', 'heightCm', 'headCm'] as const).flatMap(key => {
        const value = event[key];
        if (value === undefined) return [];
        const prior = previous[key];
        previous[key] = value;
        const delta = prior === undefined ? null : value - prior;
        const unit = key === 'weightKg' ? 'кг' : 'см';
        return [{ key, label: key === 'weightKg' ? 'Вес' : key === 'heightCm' ? 'Рост' : 'Окружность головы',
          value: `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value)} ${unit}`,
          gain: delta === null ? 'Первое измерение' : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3, signDisplay: 'exceptZero' }).format(delta)} ${unit} к предыдущему`,
        }];
      });
      return { id: event.id, date: new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(Date.parse(event.startTime)), measurements, note: event.note };
    }).reverse();
  });

  setPeriod(value: string | number | undefined): void {
    const period = Number(value);
    if (period === 7 || period === 14 || period === 30) this.period.set(period);
  }
}
