import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { StorageService } from './storage.service';

@Service()
export class PwaService {
  readonly web = !Capacitor.isNativePlatform();
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);
  readonly updateReady = signal(false);
  readonly recoveryRequired = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly persistence = signal<'unknown' | 'granted' | 'best-effort'>('unknown');

  constructor() {
    if (!this.web) return;
    const destroyRef = inject(DestroyRef);
    const versions = this.updates?.versionUpdates.subscribe(event => {
      if (event.type === 'VERSION_READY') this.updateReady.set(true);
      if (event.type === 'VERSION_INSTALLATION_FAILED') this.message.set('Обновление не загружено. Текущая версия остаётся доступной; повторите проверку с сетью.');
    });
    const recovery = this.updates?.unrecoverable.subscribe(() => this.recoveryRequired.set(true));
    const onVisible = () => {
      if (this.document.visibilityState === 'visible') void this.checkForUpdate();
    };
    this.document.addEventListener('visibilitychange', onVisible);
    destroyRef.onDestroy(() => {
      versions?.unsubscribe();
      recovery?.unsubscribe();
      this.document.removeEventListener('visibilitychange', onVisible);
    });
    void navigator.storage?.persisted?.().then(granted => {
      this.persistence.set(granted ? 'granted' : 'best-effort');
    }).catch(() => this.persistence.set('best-effort'));
  }

  async requestPersistence(): Promise<void> {
    try {
      const granted = await navigator.storage?.persist?.();
      this.persistence.set(granted ? 'granted' : 'best-effort');
    } catch { this.persistence.set('best-effort'); }
  }

  async checkForUpdate(): Promise<void> {
    if (!this.updates?.isEnabled || this.busy()) return;
    this.busy.set(true);
    try {
      const found = await this.updates.checkForUpdate();
      this.message.set(found || this.updateReady() ? 'Новая версия готова. Сохраните формы перед перезагрузкой.' : 'Используется последняя доступная версия.');
    } catch { this.message.set('Не удалось проверить обновление. Проверьте сеть; дневник остаётся на устройстве.'); }
    finally { this.busy.set(false); }
  }

  async reload(): Promise<void> {
    this.busy.set(true);
    try {
      await this.storage.whenIdle();
      // Never activateUpdate(): a full navigation keeps shell and lazy chunks on one version.
      this.document.location.reload();
    } catch {
      this.message.set('Не удалось прочитать дневник. Сначала сохраните резервную копию; перезагрузка отменена.');
      this.busy.set(false);
    }
  }
}
