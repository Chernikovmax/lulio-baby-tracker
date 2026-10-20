import { Component, effect, inject, signal } from '@angular/core';
import { disabled, form, FormField, required } from '@angular/forms/signals';
import { IonButton, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import type { BabyProfile } from '../../core/models/tracker.models';
import { isIsoDate, isTrackerBackup } from '../../core/models/tracker.models';
import { StorageService } from '../../core/services/storage.service';
import { SyncService } from '../../core/services/sync.service';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

@Component({
  selector: 'app-settings-page',
  imports: [IonButton, IonContent, IonHeader, IonTitle, IonToolbar, FormField],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  readonly storage = inject(StorageService);
  readonly sync = inject(SyncService);
  readonly model = signal<Pick<BabyProfile, 'name' | 'birthDate' | 'dueDate' | 'gender'>>({ name: '', birthDate: '', dueDate: '', gender: 'boy' });
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
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `baby-tracker-backup-${today()}.json`; link.click();
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
}
