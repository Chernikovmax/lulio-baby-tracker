import { DatePipe, registerLocaleData } from '@angular/common';
import localeRu from '@angular/common/locales/ru';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import {
  IonAlert, IonButton, IonContent, IonFooter, IonIcon, IonItem, IonItemOptions, IonItemSliding, IonList,
  IonItemOption, IonLabel, IonSegment, IonSegmentButton, IonSpinner, IonText,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, chevronBack, chevronForward, createOutline, trashOutline } from 'ionicons/icons';
import type { AnyTrackerEvent, SleepEvent } from '../../core/models/tracker.models';
import { sleepIntervals } from '../../core/models/tracker.models';
import { ClockService } from '../../core/services/clock.service';
import { StorageService } from '../../core/services/storage.service';
import { DurationFormatPipe } from '../../shared/pipes/duration-format.pipe';
import type { QuickAction } from '../../shared/components/quick-action-dock/quick-action-dock.component';
import { LiveStatusBannerComponent } from '../../shared/components/live-status-banner/live-status-banner.component';
import { QuickActionDockComponent } from '../../shared/components/quick-action-dock/quick-action-dock.component';
import { SleepModalComponent } from '../../shared/components/modals/sleep-modal/sleep-modal.component';
import { FeedingModalComponent } from '../../shared/components/modals/feeding-modal/feeding-modal.component';
import { DiaperModalComponent } from '../../shared/components/modals/diaper-modal/diaper-modal.component';
import { EventTimeModalComponent } from '../../shared/components/modals/event-time-modal/event-time-modal.component';

type EventFilter = 'all' | 'sleep' | 'food' | 'diaper';
type FeedRow = { kind: 'event'; event: AnyTrackerEvent } | { kind: 'wake'; seconds: number; beforeId: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const eventTime = (event: AnyTrackerEvent): number => Date.parse(event.startTime);
const eventEnd = (event: AnyTrackerEvent): number => event.endTime ? Date.parse(event.endTime) : eventTime(event);
const localDayStart = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

@Component({
  selector: 'app-tracker-page',
  templateUrl: './tracker.page.html',
  styleUrl: './tracker.page.scss',
  imports: [
    DatePipe, DurationFormatPipe, IonAlert, IonButton, IonContent, IonFooter, IonIcon, IonItem, IonList,
    IonItemSliding, IonItemOptions, IonItemOption, IonLabel, IonSegment, IonSegmentButton,
    IonSpinner, IonText, LiveStatusBannerComponent, QuickActionDockComponent,
    SleepModalComponent, FeedingModalComponent, DiaperModalComponent, EventTimeModalComponent,
  ],
})
export class TrackerPage {
  private readonly storage = inject(StorageService);
  private readonly clock = inject(ClockService);
  readonly todayStart = computed(() => localDayStart(new Date(this.clock.now())));
  readonly selectedDate = linkedSignal<number, number>({
    source: this.todayStart,
    computation: (today, previous) =>
      !previous || previous.value === previous.source ? today : previous.value,
  });
  readonly filter = signal<EventFilter>('all');
  readonly sleepModalOpen = signal(false);
  readonly feedingModalOpen = signal(false);
  readonly diaperModalOpen = signal(false);
  readonly editingEvent = signal<AnyTrackerEvent | null>(null);
  readonly feedingInitialTab = signal<'breastfeeding' | 'bottle'>('breastfeeding');
  readonly deletingIds = signal<ReadonlySet<string>>(new Set());
  readonly pendingDelete = signal<{ event: AnyTrackerEvent; sliding: IonItemSliding } | null>(null);
  readonly deleteButtons = [{ text: 'Отмена', role: 'cancel' }, { text: 'Удалить', role: 'destructive' }];
  readonly errorMessage = signal<string | null>(null);
  readonly profile = this.storage.profile;
  readonly isLoading = this.storage.isLoading;
  readonly storageError = this.storage.error;
  readonly isToday = computed(() => this.selectedDate() === this.todayStart());
  readonly dateLabel = computed(() => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(this.selectedDate())));
  readonly babyAge = computed(() => {
    const profile = this.profile();
    if (!profile) return null;
    const birth = new Date(`${profile.birthDate}T00:00:00`);
    const day = new Date(this.selectedDate());
    const monthsLater = (count: number) => {
      const lastDay = new Date(birth.getFullYear(), birth.getMonth() + count + 1, 0).getDate();
      return new Date(birth.getFullYear(), birth.getMonth() + count, Math.min(birth.getDate(), lastDay));
    };
    let months = (day.getFullYear() - birth.getFullYear()) * 12 + day.getMonth() - birth.getMonth();
    let anchor = monthsLater(months);
    if (anchor > day) {
      months--;
      anchor = monthsLater(months);
    }
    const days = Math.floor((Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / DAY_MS);
    if (months >= 12) return `${Math.floor(months / 12)} г. ${months % 12} мес.`;
    if (months > 0) return `${months} мес. ${days} дн.`;
    return `${Math.max(0, days)} дн.`;
  });
  private readonly dayBounds = computed(() => {
    const start = this.selectedDate();
    const day = new Date(start);
    return { start, end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime() };
  });
  readonly dayEvents = computed(() => {
    const { start, end } = this.dayBounds();
    return [...this.storage.events()]
      .filter(event => event.type === 'sleep'
        ? eventTime(event) < end && eventEnd(event) > start
        : eventTime(event) >= start && eventTime(event) < end)
      .sort((a, b) => eventTime(a) - eventTime(b) || a.id.localeCompare(b.id));
  });
  readonly visibleEvents = computed(() => {
    const filter = this.filter();
    return [...this.storage.events()]
      .filter(event => filter === 'all' ||
        (filter === 'sleep' && event.type === 'sleep') ||
        (filter === 'food' && ['breastfeeding', 'bottle', 'solids', 'pumping'].includes(event.type)) ||
        (filter === 'diaper' && event.type === 'diaper'))
      .sort((a, b) => eventTime(b) - eventTime(a) || b.id.localeCompare(a.id))
      .slice(0, 20);
  });
  readonly feedRows = computed<FeedRow[]>(() => {
    const events = this.visibleEvents();
    const all = [...this.storage.events()].filter((event): event is SleepEvent => event.type === 'sleep' && Number.isFinite(eventTime(event)) && Number.isFinite(eventEnd(event)) && eventEnd(event) <= Date.now())
      .sort((a, b) => eventTime(a) - eventTime(b) || a.id.localeCompare(b.id));
    const priorSleep = new Map<string, SleepEvent>();
    let previous: SleepEvent | undefined;
    for (const sleep of all) {
      priorSleep.set(sleep.id, previous!);
      previous = sleep;
    }
    const rows: FeedRow[] = [];
    for (const event of events) {
      rows.push({ kind: 'event', event });
      if (event.type === 'sleep' && Number.isFinite(eventTime(event)) && Number.isFinite(eventEnd(event))) {
        const previousSleep = priorSleep.get(event.id);
        if (previousSleep && eventTime(event) >= eventEnd(previousSleep)) {
          rows.push({ kind: 'wake', seconds: Math.floor((eventTime(event) - eventEnd(previousSleep)) / 1000), beforeId: event.id });
        }
      }
    }
    return rows;
  });
  readonly summary = computed(() => {
    const { start, end } = this.dayBounds();
    const events = this.storage.events();
    const sleeps = events.filter((event): event is SleepEvent => event.type === 'sleep');
    const daytime = this.sleepTotal(sleeps, start, end, false);
    const nighttime = this.sleepTotal(sleeps, start, end, true);
    const dayEvents = this.dayEvents();
    return {
      daytime, nighttime,
      feedings: dayEvents.filter(event => ['breastfeeding', 'bottle', 'solids'].includes(event.type)).length,
      bottleMl: dayEvents.reduce((sum, event) => sum + (event.type === 'bottle' ? event.volumeMl : 0), 0),
      diapers: dayEvents.filter(event => event.type === 'diaper').length,
    };
  });

  constructor() {
    registerLocaleData(localeRu);
    addIcons({ calendarOutline, chevronBack, chevronForward, createOutline, trashOutline });
  }

  goToday(): void { this.selectedDate.set(this.todayStart()); }
  moveDate(days: number): void {
    this.selectedDate.update(value => {
      const date = new Date(value);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
    });
  }
  onFilter(value: string | number | undefined): void {
    if (value === 'sleep' || value === 'food' || value === 'diaper') this.filter.set(value);
    else this.filter.set('all');
  }
  onDockAction(action: QuickAction): void {
    if (action === 'sleep') this.sleepModalOpen.set(true);
    else if (action === 'breastfeeding' || action === 'bottle') {
      this.feedingInitialTab.set(action);
      this.feedingModalOpen.set(true);
    } else this.diaperModalOpen.set(true);
  }
  requestDelete(event: AnyTrackerEvent, sliding: IonItemSliding): void {
    if (!this.deletingIds().has(event.id)) this.pendingDelete.set({ event, sliding });
  }
  async onDeleteDismiss(role: string | undefined): Promise<void> {
    const pending = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!pending) return;
    if (role === 'destructive') await this.deleteEvent(pending.event, pending.sliding);
    else await pending.sliding.close();
  }
  async deleteEvent(event: AnyTrackerEvent, sliding: IonItemSliding): Promise<void> {
    if (this.deletingIds().has(event.id)) return;
    this.errorMessage.set(null);
    this.deletingIds.update(ids => new Set(ids).add(event.id));
    try {
      await this.storage.deleteEvent(event.id);
      await sliding.close();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? `Не удалось удалить запись: ${error.message}` : 'Не удалось удалить запись. Попробуйте ещё раз.');
    } finally {
      this.deletingIds.update(ids => { const next = new Set(ids); next.delete(event.id); return next; });
    }
  }

  eventTitle(event: AnyTrackerEvent): string {
    switch (event.type) {
      case 'sleep': return event.isNightSleep ? 'Ночной сон' : 'Дневной сон';
      case 'breastfeeding': return `Грудное кормление · ${event.lastSide === 'left' ? 'левая' : 'правая'} грудь`;
      case 'bottle': return `Бутылочка · ${event.volumeMl} мл`;
      case 'solids': return `Прикорм · ${event.food}`;
      case 'pumping': return `Сцеживание · ${event.volumeMl} мл`;
      case 'diaper': return `Подгузник · ${{ wet: 'мокрый', dirty: 'грязный', mixed: 'мокрый и грязный' }[event.state]}`;
      case 'growth': return 'Измерение роста';
    }
  }
  eventDuration(event: AnyTrackerEvent): number | null {
    if (event.type === 'sleep') return sleepIntervals(event.startTime, event.endTime, event.pauses).reduce((total, interval) => total + interval.end - interval.start, 0) / 1000;
    if (event.type === 'breastfeeding') return event.leftDurationSec + event.rightDurationSec;
    return null;
  }
  wakeLabel(seconds: number): string {
    return `${Math.floor(seconds / 3600)} ч ${Math.floor(seconds / 60) % 60} мин`;
  }

  private sleepTotal(sleeps: SleepEvent[], start: number, end: number, night: boolean): number {
    const intervals = sleeps.filter(sleep => sleep.isNightSleep === night && Number.isFinite(eventTime(sleep)) && Number.isFinite(eventEnd(sleep)))
      .flatMap(sleep => sleepIntervals(sleep.startTime, sleep.endTime, sleep.pauses).map(interval => [Math.max(start, interval.start), Math.min(end, interval.end)] as const))
      .filter(([from, to]) => to > from)
      .sort((a, b) => a[0] - b[0]);
    let total = 0;
    let intervalStart: number | null = null;
    let intervalEnd = 0;
    for (const [from, to] of intervals) {
      if (intervalStart !== null && from <= intervalEnd) intervalEnd = Math.max(intervalEnd, to);
      else {
        if (intervalStart !== null) total += intervalEnd - intervalStart;
        intervalStart = from;
        intervalEnd = to;
      }
    }
    if (intervalStart !== null) total += intervalEnd - intervalStart;
    return Math.floor(total / 1000);
}
}
