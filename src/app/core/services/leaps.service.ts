import { Service, computed, inject } from '@angular/core';
import { WONDER_WEEKS, WONDER_WEEKS_CALENDAR } from '../constants/wonder-weeks.const';
import { CalendarWeekItem } from '../models/leap.models';
import { ClockService } from './clock.service';
import { StorageService } from './storage.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Service()
export class LeapsService {
  private readonly storage = inject(StorageService);
  private readonly clock = inject(ClockService);
  readonly leaps = WONDER_WEEKS;
  // Не ограничиваем номер 1–75: до ПДР и после календаря нет текущей ячейки.
  readonly currentWeek = computed(() => {
    const profile = this.storage.profile();
    return profile ? Math.floor((this.clock.now() - Date.parse(`${profile.dueDate}T00:00:00Z`)) / WEEK_MS) + 1 : null;
  });
  readonly calendar = computed<readonly CalendarWeekItem[]>(() => {
    const current = this.currentWeek();
    return WONDER_WEEKS_CALENDAR.map(week => ({ ...week, isCurrentWeek: week.weekNumber === current }));
  });
  readonly currentCalendarWeek = computed(() => {
    const week = this.currentWeek();
    return week !== null && week >= 1 && week <= 75 ? this.calendar()[week - 1] : null;
  });
  readonly currentWeather = computed(() => this.currentCalendarWeek()?.weather ?? null);
  readonly currentLeap = computed(() => {
    const number = this.currentCalendarWeek()?.leapNumber;
    return number === undefined ? null : WONDER_WEEKS.find(leap => leap.leapNumber === number) ?? null;
  });
  readonly nextLeap = computed(() => {
    const week = this.currentWeek();
    return week === null ? null : WONDER_WEEKS.find(leap => leap.startWeek > week) ?? null;
  });
}
