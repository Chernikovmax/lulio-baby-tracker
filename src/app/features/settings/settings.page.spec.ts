import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_YANDEX_CONFIG } from '../../core/models/yandex-sync.models';
import { PwaService } from '../../core/services/pwa.service';
import { StorageService } from '../../core/services/storage.service';
import { SyncService } from '../../core/services/sync.service';
import { TimerNotificationService } from '../../core/services/timer-notification.service';
import { YandexSyncService } from '../../core/services/yandex-sync.service';
import { SettingsPage } from './settings.page';

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: async () => ({ uri: 'file:///data/cache/backup.json' }) },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: async () => ({ activityType: '' }) } }));

const backup = '{"version":1}';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      { provide: StorageService, useValue: { isLoading: signal(false), error: signal(null), profile: signal(null), exportBackup: async () => backup } },
      { provide: SyncService, useValue: { isLoading: signal(false), config: signal({ enabled: false, url: '', anonKey: '', familyId: '' }) } },
      { provide: YandexSyncService, useValue: { isLoading: signal(false), busy: signal(false), config: signal(EMPTY_YANDEX_CONFIG), auth: { isLoading: signal(false) } } },
      { provide: TimerNotificationService, useValue: {} },
      { provide: PwaService, useValue: {} },
    ],
  });
  return TestBed.runInInjectionContext(() => new SettingsPage());
}

describe('Резервная копия в настройках', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 25, 12));
    URL.createObjectURL = () => 'blob:backup';
    URL.revokeObjectURL = () => undefined;
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('в приложении сохраняет копию файлом и открывает выбор, куда её отправить', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const write = vi.spyOn(Filesystem, 'writeFile');
    const share = vi.spyOn(Share, 'share');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const page = setup();
    await page.exportBackup();
    expect(write).toHaveBeenCalledWith({ path: 'baby-tracker-backup-2026-10-25.json', data: backup, directory: 'CACHE', encoding: 'utf8' });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///data/cache/backup.json'] }));
    expect(click).not.toHaveBeenCalled();
    expect(page.backupError()).toBe('');
  });

  it('не показывает ошибку, если пользователь закрыл выбор приложения', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(Share, 'share').mockRejectedValue(new Error('Share canceled'));
    const page = setup();
    await page.exportBackup();
    expect(page.backupError()).toBe('');
    expect(page.backupMessage()).toBe('');
  });

  it('в браузере скачивает файл, как раньше', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const write = vi.spyOn(Filesystem, 'writeFile');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const page = setup();
    await page.exportBackup();
    expect(click).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    expect(page.backupMessage()).toBe('Резервная копия сохранена.');
  });
});
