import { Service, computed, inject } from '@angular/core';
import { ActiveBreastTimer, BreastSide, BreastfeedingEvent, SleepEvent, isBreastSide } from '../models/tracker.models';
import { ClockService } from './clock.service';
import { StorageService } from './storage.service';

@Service()
export class ActiveTimerService {
  private readonly storage = inject(StorageService);
  private readonly clock = inject(ClockService);
  readonly sleepTimer = computed(() => this.storage.activeTimers().sleepTimer);
  readonly breastTimer = computed(() => this.storage.activeTimers().breastTimer);
  readonly sleepDurationSec = computed(() => {
    const timer = this.sleepTimer();
    return timer ? Math.floor(Math.max(0, this.clock.now() - Date.parse(timer.startedAt)) / 1000) : 0;
  });
  readonly leftDurationSec = computed(() => this.sideDuration('left'));
  readonly rightDurationSec = computed(() => this.sideDuration('right'));
  readonly breastDurationSec = computed(() => this.leftDurationSec() + this.rightDurationSec());

  startSleep(isNightSleep = false): Promise<void> {
    return this.storage.update(data => {
      if (data.activeTimers.sleepTimer) throw new Error('Таймер сна уже запущен.');
      return { ...data, activeTimers: { ...data.activeTimers, sleepTimer: { startedAt: new Date().toISOString(), isNightSleep } } };
    });
  }

  async stopSleep(): Promise<SleepEvent | null> {
    let event: SleepEvent | null = null;
    await this.storage.update(data => {
      const timer = data.activeTimers.sleepTimer;
      if (!timer) return data;
      const endTime = new Date(Math.max(Date.now(), Date.parse(timer.startedAt))).toISOString();
      event = { id: crypto.randomUUID(), type: 'sleep', startTime: timer.startedAt, endTime, updatedAt: endTime, isNightSleep: timer.isNightSleep };
      return { ...data, events: [...data.events, event], activeTimers: { ...data.activeTimers, sleepTimer: null } };
    });
    return event;
  }

  cancelSleep(): Promise<void> {
    return this.storage.update(data => ({ ...data, activeTimers: { ...data.activeTimers, sleepTimer: null } }));
  }

  startBreastfeeding(side: BreastSide): Promise<void> {
    if (!isBreastSide(side)) return Promise.reject(new Error('Выберите левую или правую грудь.'));
    return this.storage.update(data => {
      if (data.activeTimers.breastTimer) throw new Error('Таймер кормления уже запущен.');
      const startedAt = new Date().toISOString();
      return { ...data, activeTimers: { ...data.activeTimers, breastTimer: {
        startedAt, activeSide: side, currentSideStartedAt: startedAt,
        accumulatedLeftSec: 0, accumulatedRightSec: 0, lastActiveSide: side,
      } } };
    });
  }

  switchBreast(side: BreastSide): Promise<void> {
    if (!isBreastSide(side)) return Promise.reject(new Error('Выберите левую или правую грудь.'));
    return this.storage.update(data => {
      const timer = data.activeTimers.breastTimer;
      if (!timer) throw new Error('Сначала запустите таймер кормления.');
      if (timer.activeSide === side) return data;
      const now = Math.max(Date.now(), Date.parse(timer.currentSideStartedAt ?? timer.startedAt));
      const settled = this.settle(timer, now);
      return { ...data, activeTimers: { ...data.activeTimers, breastTimer: {
        ...settled, activeSide: side, lastActiveSide: side, currentSideStartedAt: new Date(now).toISOString(),
      } } };
    });
  }

  pauseBreastfeeding(): Promise<void> {
    return this.storage.update(data => {
      const timer = data.activeTimers.breastTimer;
      if (!timer || timer.activeSide === null) return data;
      return { ...data, activeTimers: { ...data.activeTimers, breastTimer: this.settle(timer, Date.now()) } };
    });
  }

  async stopBreastfeeding(): Promise<BreastfeedingEvent | null> {
    let event: BreastfeedingEvent | null = null;
    await this.storage.update(data => {
      const timer = data.activeTimers.breastTimer;
      if (!timer) return data;
      const now = Math.max(Date.now(), Date.parse(timer.currentSideStartedAt ?? timer.startedAt));
      const settled = this.settle(timer, now);
      const endTime = new Date(now).toISOString();
      event = {
        id: crypto.randomUUID(), type: 'breastfeeding', startTime: timer.startedAt, endTime, updatedAt: endTime,
        leftDurationSec: Math.floor(settled.accumulatedLeftSec), rightDurationSec: Math.floor(settled.accumulatedRightSec), lastSide: settled.lastActiveSide,
      };
      return { ...data, events: [...data.events, event], activeTimers: { ...data.activeTimers, breastTimer: null } };
    });
    return event;
  }

  cancelBreastfeeding(): Promise<void> {
    return this.storage.update(data => ({ ...data, activeTimers: { ...data.activeTimers, breastTimer: null } }));
  }

  private sideDuration(side: BreastSide): number {
    const timer = this.breastTimer();
    if (!timer) return 0;
    const accumulated = side === 'left' ? timer.accumulatedLeftSec : timer.accumulatedRightSec;
    const current = timer.activeSide === side && timer.currentSideStartedAt ? Math.max(0, this.clock.now() - Date.parse(timer.currentSideStartedAt)) / 1000 : 0;
    return Math.floor(accumulated + current);
  }

  private settle(timer: ActiveBreastTimer, now: number): ActiveBreastTimer {
    const elapsed = timer.currentSideStartedAt ? Math.max(0, now - Date.parse(timer.currentSideStartedAt)) / 1000 : 0;
    // Сохраняем доли секунды между переключениями, округляем только вывод и итоговое событие.
    return {
      ...timer, activeSide: null, currentSideStartedAt: null,
      accumulatedLeftSec: timer.accumulatedLeftSec + (timer.activeSide === 'left' ? elapsed : 0),
      accumulatedRightSec: timer.accumulatedRightSec + (timer.activeSide === 'right' ? elapsed : 0),
    };
  }
}
