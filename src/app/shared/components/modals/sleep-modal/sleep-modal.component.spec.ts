import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockService } from '../../../../core/services/clock.service';
import { StorageService } from '../../../../core/services/storage.service';
import { SleepModalComponent } from './sleep-modal.component';

describe('Тип сна в таймере', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await Preferences.remove({ key: 'baby-tracker.v1' });
    TestBed.configureTestingModule({});
    await TestBed.inject(StorageService).ready();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it.each([
    [19, 59, false],
    [20, 0, true],
    [23, 59, true],
    [0, 0, true],
    [7, 59, true],
    [8, 0, false],
  ])('при открытии в %i:%i запускает сон с ночным признаком %s', async (hour, minute, isNightSleep) => {
    const now = new Date(2026, 9, 23, hour, minute);
    vi.setSystemTime(now);
    TestBed.inject(ClockService).refresh();
    const component = TestBed.createComponent(SleepModalComponent).componentInstance;
    component.prepare();
    await component.start();
    expect(component.timer.sleepTimer()).toEqual(expect.objectContaining({ isNightSleep, startedAt: now.toISOString() }));
  });

  it('сохраняет ручной выбор при запуске, а при повторном открытии и возвращении в таймер выбирает тип по времени', async () => {
    const now = new Date(2026, 9, 23, 21, 0);
    vi.setSystemTime(now);
    TestBed.inject(ClockService).refresh();
    const component = TestBed.createComponent(SleepModalComponent).componentInstance;
    component.prepare();
    component.night.set(false);
    await component.start();
    expect(component.timer.sleepTimer()?.isNightSleep).toBe(false);
    component.prepare();
    expect(component.timer.sleepTimer()?.isNightSleep).toBe(false);
    expect(component.night()).toBe(true);
    component.night.set(false);
    component.setTab('manual');
    component.setTab('timer');
    expect(component.night()).toBe(true);
  });
});
