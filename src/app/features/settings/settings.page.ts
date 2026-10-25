import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { disabled, form, FormField, required } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { BabyProfile } from '../../core/models/tracker.models';
import { isIsoDate, isTrackerBackup } from '../../core/models/tracker.models';
import { StorageService } from '../../core/services/storage.service';
import { SyncService } from '../../core/services/sync.service';
import { YandexSyncService } from '../../core/services/yandex-sync.service';
import type { DiskItem } from '../../core/services/yandex-disk.client';
import { TimerNotificationService } from '../../core/services/timer-notification.service';
import { PwaService } from '../../core/services/pwa.service';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

@Component({
  selector: 'app-settings-page',
  imports: [IonButton, IonContent, IonHeader, IonTitle, IonToolbar, FormField, DatePipe],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  readonly storage = inject(StorageService);
  readonly sync = inject(SyncService);
  readonly yandex = inject(YandexSyncService);
  readonly timerNotifications = inject(TimerNotificationService);
  readonly pwa = inject(PwaService);
  readonly yandexModel = signal({ clientId: '', folderPath: '/Baby Tracker', familyId: '' });
  readonly yandexForm = form(this.yandexModel, path => {
    disabled(path, () => this.yandexBusy() || this.yandex.config().enabled);
  });
  readonly codeModel = signal({ code: '' });
  readonly codeForm = form(this.codeModel, path => { disabled(path, () => this.yandexBusy()); });
  readonly yandexBusy = computed(() => this.yandex.busy() || this.yandexActionBusy() || this.yandex.isLoading() || this.yandex.auth.isLoading());
  readonly yandexActionBusy = signal(false);
  readonly yandexActionError = signal('');
  readonly folderItems = signal<DiskItem[]>([]);
  readonly browsingPath = signal('');
  private yandexHydrated = false;
  readonly model = signal<Pick<BabyProfile, 'name' | 'birthDate' | 'dueDate' | 'gender'>>({ name: '', birthDate: today(), dueDate: today(), gender: 'boy' });
  readonly profileForm = form(this.model, path => {
    required(path.name); required(path.birthDate); required(path.dueDate);
    disabled(path, () => this.saving() || this.loading());
  });
  readonly syncModel = signal({ enabled: false, url: '', anonKey: '', familyId: '' });
  readonly syncForm = form(this.syncModel, path => {
    disabled(path, () => this.syncSaving() || this.sync.isLoading());
  });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly syncSaving = signal(false);
  readonly importing = signal(false);
  readonly exportBusy = signal(false);
  readonly profileMessage = signal('');
  readonly profileError = signal('');
  readonly backupMessage = signal('');
  readonly backupError = signal('');
  readonly syncMessage = signal('');
  readonly syncError = signal('');
  readonly confirmImport = signal(false);
  private readonly pendingBackup = signal<string | null>(null);
  private hydrated = false;
  private syncHydrated = false;
  constructor() {
    effect(() => {
      if (this.storage.isLoading()) return;
      if (this.storage.error()) {
        this.loading.set(false);
        this.profileError.set('Не удалось загрузить сохранённый профиль.');
        return;
      }
      if (this.hydrated) return;
      const profile = this.storage.profile();
      if (profile) this.model.set({ name: profile.name, birthDate: profile.birthDate, dueDate: profile.dueDate, gender: profile.gender });
      this.hydrated = true;
      this.loading.set(false);
    });
    effect(() => {
      if (this.sync.isLoading()) return;
      const config = this.sync.config();
      if (!this.syncHydrated) {
        this.syncModel.set({ ...config });
        this.syncHydrated = true;
      }
    });
    effect(() => {
      if (this.yandex.isLoading() || this.yandexHydrated) return;
      const config = this.yandex.config();
      this.yandexModel.set({ clientId: config.clientId, folderPath: config.folderPath || '/Baby Tracker', familyId: config.familyId });
      this.yandexHydrated = true;
    });
  }

  get maxDate(): string { return today(); }


  async saveProfile(): Promise<void> {
    if (this.saving() || this.loading()) return;
    this.profileError.set(''); this.profileMessage.set('');
    const value = this.model();
    if (!value.name.trim() || !isIsoDate(value.birthDate) || !isIsoDate(value.dueDate) || value.birthDate > today()) {
      this.profileError.set('Проверьте имя, дату рождения и предполагаемую дату родов. Дата рождения не может быть в будущем.');
      return;
    }
    this.saving.set(true);
    try {
      const profile: BabyProfile = { id: this.storage.profile()?.id ?? crypto.randomUUID(), name: value.name.trim(), birthDate: value.birthDate, dueDate: value.dueDate, gender: value.gender };
      await this.storage.saveProfile(profile);
      this.profileMessage.set('Профиль сохранён.');
    } catch {
      this.profileError.set('Не удалось сохранить профиль. Изменения остались в форме — попробуйте ещё раз.');
    } finally { this.saving.set(false); }
  }

  async exportBackup(): Promise<void> {
    if (this.exportBusy()) return;
    this.backupError.set(''); this.backupMessage.set(''); this.exportBusy.set(true);
    try {
      const json = await this.storage.exportBackup();
      const name = `baby-tracker-backup-${today()}.json`;
      if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
        try {
          await Share.share({ title: 'Резервная копия дневника', files: [uri] });
          this.backupMessage.set('Резервная копия передана в выбранное приложение.');
        } catch (error) {
          if (!(error instanceof Error && error.message === 'Share canceled')) throw error;
        }
        return;
      }
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      this.backupMessage.set('Резервная копия сохранена.');
    } catch {
      this.backupError.set('Не удалось подготовить резервную копию.');
    } finally { this.exportBusy.set(false); }
  }

  async chooseBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.backupError.set(''); this.backupMessage.set('');
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.json')) { this.backupError.set('Выберите файл резервной копии в формате JSON.'); return; }
    this.importing.set(true);
    try {
      const json = await file.text();
      const parsed: unknown = JSON.parse(json);
      if (!isTrackerBackup(parsed)) throw new Error('invalid');
      this.pendingBackup.set(json);
      this.confirmImport.set(true);
    } catch {
      this.backupError.set('Файл повреждён или имеет неподдерживаемый формат резервной копии. Данные не изменены.');
    } finally { this.importing.set(false); }
  }

  cancelImport(): void { this.pendingBackup.set(null); this.confirmImport.set(false); }

  async replaceFromBackup(): Promise<void> {
    const json = this.pendingBackup();
    if (!json || this.importing()) return;
    this.importing.set(true); this.backupError.set(''); this.backupMessage.set('');
    try {
      await this.storage.importBackup(json);
      const profile = this.storage.profile();
      this.model.set(profile ? { name: profile.name, birthDate: profile.birthDate, dueDate: profile.dueDate, gender: profile.gender } : { name: '', birthDate: '', dueDate: '', gender: 'boy' });
      this.backupMessage.set('Резервная копия восстановлена.');
      this.cancelImport();
    } catch {
      this.backupError.set('Не удалось восстановить резервную копию. Текущие данные сохранены.');
    } finally { this.importing.set(false); }
  }

  createFamilyId(): void {
    this.syncModel.update(config => ({ ...config, familyId: crypto.randomUUID() }));
  }

  async saveSync(): Promise<void> {
    if (this.syncSaving()) return;
    this.syncError.set(''); this.syncMessage.set(''); this.syncSaving.set(true);
    try {
      await this.sync.saveConfig(this.syncModel());
      this.syncMessage.set('Настройки семейной синхронизации сохранены.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      this.syncError.set(message || 'Не удалось сохранить настройки синхронизации. Проверьте адрес, ключ и идентификатор семьи.');
    } finally { this.syncSaving.set(false); }
  }

  createYandexFamilyId(): void {
    this.yandexModel.update(value => ({ ...value, familyId: crypto.randomUUID() }));
  }

  async startYandexLogin(): Promise<void> {
    if (this.yandexBusy()) return;
    this.yandexActionBusy.set(true); this.yandexActionError.set(''); this.codeModel.set({ code: '' });
    try { await this.yandex.auth.start(this.yandexModel().clientId); }
    catch (error) { this.yandexActionError.set(error instanceof Error ? error.message : 'Не удалось начать вход в Яндекс.'); }
    finally { this.yandexActionBusy.set(false); }
  }

  async finishYandexLogin(): Promise<void> {
    if (this.yandexBusy()) return;
    this.yandexActionBusy.set(true); this.yandexActionError.set('');
    try { await this.yandex.auth.finish(this.codeModel().code); this.codeModel.set({ code: '' }); }
    catch (error) { this.yandexActionError.set(error instanceof Error ? error.message : 'Не удалось завершить вход в Яндекс.'); }
    finally { this.yandexActionBusy.set(false); }
  }

  async browseYandexFolders(path: string): Promise<void> {
    if (this.yandexBusy()) return;
    this.yandexActionBusy.set(true); this.yandexActionError.set('');
    try {
      this.folderItems.set(await this.yandex.folders(path));
      this.browsingPath.set(path);
    } catch (error) { this.yandexActionError.set(error instanceof Error ? error.message : 'Не удалось прочитать папки.'); }
    finally { this.yandexActionBusy.set(false); }
  }

  chooseYandexFolder(): void {
    this.yandexModel.update(value => ({ ...value, folderPath: this.browsingPath() }));
    this.browsingPath.set(''); this.folderItems.set([]);
  }
}
