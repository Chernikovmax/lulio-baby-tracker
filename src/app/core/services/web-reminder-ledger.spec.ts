import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import { readWebReminderLedger, writeWebReminderLedger } from './web-reminder-ledger';

const ledger = () => ({ version: 1 as const, api: 'https://functions.yandexcloud.net/synthetic', device: crypto.randomUUID(),
  credential: crypto.randomUUID(), enrollment: null, consent: true, dirty: false, revoke: false });

describe('Private PWA reminder state and diary commits', () => {
  beforeEach(async () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
    localStorage.removeItem('lulio.web-reminders.device.v1');
    await Preferences.remove({ key: 'baby-tracker.v1' });
  });
  afterEach(() => { localStorage.removeItem('lulio.web-reminders.device.v1'); TestBed.resetTestingModule(); vi.restoreAllMocks(); });
  it('durably records cancellation debt before a diary change and never exports enrollment or device consent', async () => {
    const storage = TestBed.inject(StorageService); await storage.ready();
    const device = ledger(); writeWebReminderLedger(device);
    await storage.saveProfile({ id: 'synthetic', name: 'Synthetic', birthDate: '2026-06-01', dueDate: '2026-06-01', gender: 'girl' });
    expect(readWebReminderLedger()?.dirty).toBe(true);
    const backup = await storage.exportBackup();
    expect(JSON.parse(backup).profile.name).toBe('Synthetic');
    expect(backup).not.toContain(device.device);
    expect(backup).not.toContain(device.credential);
    expect(backup).not.toContain(device.api);
    expect(JSON.parse(localStorage.getItem('CapacitorStorage.baby-tracker.v1')!).profile.name).toBe('Synthetic');
  });
  it('does not publish a new diary snapshot when its private cancellation fence cannot persist', async () => {
    const storage = TestBed.inject(StorageService); await storage.ready(); writeWebReminderLedger(ledger());
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'lulio.web-reminders.device.v1') throw new Error('private storage full');
      return setItem.call(this, key, value);
    });
    await expect(storage.saveProfile({ id: 'synthetic', name: 'New', birthDate: '2026-06-01', dueDate: '2026-06-01', gender: 'girl' })).rejects.toThrow('private storage full');
    expect(storage.profile()).toBeNull();
    expect((await Preferences.get({ key: 'baby-tracker.v1' })).value).toBeNull();
  });
  it('leaves the Android consent path independent of browser delivery state', async () => {
    writeWebReminderLedger(ledger());
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    expect(readWebReminderLedger()).toBeNull();
    const storage = TestBed.inject(StorageService); await storage.ready();
    await storage.saveProfile({ id: 'synthetic', name: 'Native', birthDate: '2026-06-01', dueDate: '2026-06-01', gender: 'girl' });
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    expect(readWebReminderLedger()?.dirty).toBe(false);
  });
});
