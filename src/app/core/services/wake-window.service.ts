import { Service, computed, inject, linkedSignal } from '@angular/core';
import { WAKE_NORMS } from '../constants/wake-norms.const';
import { BreastfeedingEvent, BreastSide, WakeStatusLevel } from '../models/tracker.models';
import { ClockService } from './clock.service';
import { StorageService } from './storage.service';

const DAY_MS = 86_400_000;

@Service()
export class WakeWindowService {
  private readonly storage = inject(StorageService);
  private readonly clock = inject(ClockService);
  readonly ageDays = computed(() => {
    const profile = this.storage.profile();
    if (!profile) return null;
    // Возраст в календарных днях: переход на летнее время не меняет возраст.
    const now = new Date(this.clock.now());
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.floor((today - Date.parse(`${profile.birthDate}T00:00:00Z`)) / DAY_MS));
  });
  readonly norm = computed(() => {
    const age = this.ageDays();
    return age === null ? null : WAKE_NORMS.find(item => age >= item.minAgeDays && (item.maxAgeDays === null || age <= item.maxAgeDays)) ?? null;
  });
  readonly isSleeping = computed(() => this.storage.activeTimers().sleepTimer !== null);
  readonly lastSleepEnd = computed(() => {
    const now = this.clock.now();
    let latest: string | null = null;
    for (const event of this.storage.events()) {
      if (event.type === 'sleep' && Date.parse(event.endTime) <= now && (latest === null || Date.parse(event.endTime) > Date.parse(latest))) latest = event.endTime;
    }
    return latest;
  });
  // Без завершённого сна начало бодрствования неизвестно; не подменяем его полуночью.
  readonly wakeDurationSec = computed(() => {
    if (this.isSleeping()) return 0;
    const end = this.lastSleepEnd();
    return end === null ? null : Math.floor(Math.max(0, this.clock.now() - Date.parse(end)) / 1000);
  });
  readonly normProgressRatio = computed(() => {
    const duration = this.wakeDurationSec();
    const norm = this.norm();
    return duration === null || norm === null ? null : duration / (norm.maxWakeMinutes * 60);
  });
  readonly status = computed<WakeStatusLevel | null>(() => {
    if (this.isSleeping()) return 'sleeping';
    const duration = this.wakeDurationSec();
    const norm = this.norm();
    if (duration === null || norm === null) return null;
    if (duration > norm.maxWakeMinutes * 60) return 'overtired';
    return duration >= norm.minWakeMinutes * 60 ? 'approaching' : 'optimal';
  });
  readonly isOvertired = computed(() => this.status() === 'overtired');
  readonly lastFeedingTime = computed(() => {
    const now = this.clock.now();
    let latest: string | null = null;
    for (const event of this.storage.events()) {
      if ((event.type === 'breastfeeding' || event.type === 'bottle' || event.type === 'solids') &&
        Date.parse(event.startTime) <= now && (latest === null || Date.parse(event.startTime) > Date.parse(latest))) latest = event.startTime;
    }
    const active = this.storage.activeTimers().breastTimer;
    if (active && Date.parse(active.startedAt) <= now && (latest === null || Date.parse(active.startedAt) > Date.parse(latest))) latest = active.startedAt;
    return latest;
  });
  readonly timeSinceLastFeedingSec = computed(() => {
    const last = this.lastFeedingTime();
    return last === null ? null : Math.floor(Math.max(0, this.clock.now() - Date.parse(last)) / 1000);
  });
  private readonly lastBreastfeeding = computed(() => {
    const now = this.clock.now();
    let latest: BreastfeedingEvent | null = null;
    for (const event of this.storage.events()) {
      if (event.type === 'breastfeeding' && Date.parse(event.endTime) <= now &&
        (latest === null || Date.parse(event.endTime) > Date.parse(latest.endTime))) latest = event;
    }
    return latest;
  });
  readonly lastUsedBreastSide = computed(() => this.lastBreastfeeding()?.lastSide ?? null);
  private readonly lastBreastfeedingKey = computed(() => {
    const last = this.lastBreastfeeding();
    return last ? `${last.id}:${last.updatedAt}:${last.lastSide}` : '';
  });
  readonly selectedNextBreastSide = linkedSignal<string, BreastSide>({
    source: this.lastBreastfeedingKey,
    computation: source => source.endsWith(':left') ? 'right' : 'left',
  });
}
