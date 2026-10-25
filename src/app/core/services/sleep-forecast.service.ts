import { Service, computed, inject, linkedSignal, untracked } from '@angular/core';
import { ClockService } from './clock.service';
import { StorageService } from './storage.service';
import { routineDate } from './sleep-calendar';
import { calculateSleepForecast, type ForecastInput, type SleepForecast } from './sleep-forecast';
import { historyWakeGaps } from './sleep-history';

@Service()
export class SleepForecastService {
  private readonly storage = inject(StorageService);
  private readonly clock = inject(ClockService);
  private readonly inputs = computed<ForecastInput>(() => ({
    scope: this.storage.syncDocument()?.scope ?? 'local', importGeneration: this.storage.importGeneration(),
    profile: this.storage.profile(), events: this.storage.events().slice(), activeTimers: this.storage.activeTimers(),
    sleepRoutine: this.storage.sleepRoutine(), confirmedWakes: this.storage.confirmedWakes(),
    historyAssertions: this.storage.historyAssertions(), journal: this.storage.syncDocument(),
  }));
  private readonly futureBoundaries = computed(() => [...new Set([
    ...this.storage.events().filter(event => event.type === 'sleep').flatMap(event => [Date.parse(event.startTime), Date.parse(event.endTime!)]),
    ...this.storage.confirmedWakes().map(wake => Date.parse(wake.at)),
  ])].sort((a, b) => a - b));
  /** Only calendar-day / future-fact applicability transitions invalidate the expensive calculation. */
  private readonly timeKey = computed(() => {
    const now = this.clock.now(), bounds = this.futureBoundaries();
    let low = 0, high = bounds.length;
    while (low < high) { const middle = (low + high) >>> 1; if (bounds[middle] <= now) low = middle + 1; else high = middle; }
    return `${routineDate(now, this.storage.sleepRoutine()?.timeZone ?? 'UTC')}:${low}`;
  });
  readonly historyGaps = computed(() => {
    this.timeKey();
    return historyWakeGaps(this.storage.events(), this.storage.historyAssertions(), untracked(this.clock.now));
  });
  private readonly calculated = linkedSignal({
    source: () => ({ input: this.inputs(), time: this.timeKey() }),
    computation: ({ input }, previous): SleepForecast & { recalculationReasons: string[] } => {
      const result = calculateSleepForecast(input, untracked(this.clock.now));
      const old = previous?.source.input;
      const reasons: string[] = [];
      if (!old) reasons.push('initial-load');
      else {
        for (const [field, reason] of [['profile', 'profile-change'], ['events', 'history-edit-or-delete'],
          ['activeTimers', 'sleep-timer-change'], ['sleepRoutine', 'routine-change'], ['confirmedWakes', 'confirmed-wake-change'],
          ['historyAssertions', 'completeness-change'], ['journal', 'family-revision-change'], ['scope', 'scope-change'],
          ['importGeneration', 'backup-import']] as const) {
          if (JSON.stringify(old[field]) !== JSON.stringify(input[field])) reasons.push(reason);
        }
        if (previous.source.time !== this.timeKey()) reasons.push('calendar-or-future-fact-applicability');
      }
      return { ...result, recalculationReasons: reasons };
    },
  });
  readonly forecast = computed(() => {
    const plan = this.calculated(), now = this.clock.now();
    return plan.predictedSleepAt && (plan.state === 'ready' || plan.state === 'overdue')
      ? { ...plan, state: now >= Date.parse(plan.predictedSleepAt) ? 'overdue' as const : 'ready' as const }
      : plan;
  });
  readonly countdownSeconds = computed(() => {
    const at = this.calculated().predictedSleepAt;
    return at ? Math.floor((Date.parse(at) - this.clock.now()) / 1000) : null;
  });
}
