import { Service, computed, inject, resource, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { isRecord } from '../models/tracker.models';
import { newerEntry, type SyncDocument } from '../models/sync.models';
import {
  EMPTY_YANDEX_CONFIG, FAMILY_ID_PATTERN, YANDEX_CONFIG_KEY, YANDEX_MARKER,
  isYandexConfig, isYandexPacket, journalSignature, yandexScope,
  type YandexConfig, type YandexPacket, type YandexSettings,
} from '../models/yandex-sync.models';
import { StorageService } from './storage.service';
import { SyncService } from './sync.service';
import { YandexAuthService } from './yandex-auth.service';
import { YandexDiskClient, YandexDiskError, type DiskItem } from './yandex-disk.client';

function childPath(folder: string, name: string): string { return `${folder.replace(/\/$/, '')}/${name}`; }

@Service()
export class YandexSyncService {
  private readonly storage = inject(StorageService);
  private readonly supabase = inject(SyncService);
  readonly auth = inject(YandexAuthService);
  private readonly initialRead = this.load();
  private readonly configResource = resource({ loader: () => this.initialRead });
  readonly isLoading = this.configResource.isLoading;
  readonly loadError = this.configResource.error;
  readonly config = computed(() => this.configResource.hasValue() ? this.configResource.value() : EMPTY_YANDEX_CONFIG);
  readonly busy = signal(false);
  readonly status = signal('');
  readonly error = signal('');
  readonly pending = computed(() => this.config().enabled &&
    journalSignature(this.storage.syncDocument()) !== this.config().published);

  private async load(): Promise<YandexConfig> {
    const { value } = await Preferences.get({ key: YANDEX_CONFIG_KEY });
    let config = { ...EMPTY_YANDEX_CONFIG, processed: [] as string[] };
    if (value !== null) {
      let parsed: unknown;
      try { parsed = JSON.parse(value); } catch { throw new Error('Не удалось прочитать настройки Яндекс Диска.'); }
      if (!isYandexConfig(parsed)) throw new Error('Настройки Яндекс Диска повреждены.');
      config = parsed;
    }
    await this.supabase.ready();
    if (config.enabled) {
      if (this.supabase.config().enabled) throw new Error('Одновременно включены два способа синхронизации. Отключите Supabase.');
      await this.storage.configureSync(yandexScope(config.familyId));
    }
    return config;
  }

  async ready(): Promise<void> {
    const config = await this.initialRead;
    if (!this.configResource.hasValue()) this.configResource.value.set(config);
  }

  async connect(settings: YandexSettings): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.status.set('Проверяем общую папку…');
    try {
      await this.ready();
      if (this.supabase.config().enabled) throw new Error('Сначала отключите синхронизацию Supabase и сохраните её настройки.');
      const next = {
        clientId: settings.clientId.trim(), familyId: settings.familyId.trim().toLowerCase(),
        folderPath: settings.folderPath.trim().replace(/^disk:/, '').replace(/\/+$/, ''),
      };
      if (!FAMILY_ID_PATTERN.test(next.familyId)) throw new Error('Укажите одинаковый UUID v4 дневника на обоих телефонах.');
      if (!next.folderPath.startsWith('/') || next.folderPath === '/' || next.folderPath.includes('//') ||
          next.folderPath.split('/').some(part => part === '.' || part === '..')) {
        throw new Error('Выберите отдельную общую папку, например /Baby Tracker. Корень Диска использовать нельзя.');
      }
      if (this.auth.clientId() !== next.clientId) throw new Error('Войдите в Яндекс с указанным ClientID.');
      const previous = this.config();
      if (previous.enabled && (previous.familyId !== next.familyId || previous.folderPath !== next.folderPath || previous.clientId !== next.clientId)) {
        throw new Error('Перед сменой папки или дневника отключите текущее подключение.');
      }
      const client = new YandexDiskClient(await this.auth.token());
      const metadata = await client.metadata(next.folderPath);
      if (!isRecord(metadata) || metadata['type'] !== 'dir') throw new Error('Выбранный путь не является папкой.');
      const initialized = await this.checkMarker(client, next, true);
      await this.storage.configureSync(yandexScope(next.familyId));
      const sameDiary = !initialized && previous.familyId === next.familyId &&
        previous.folderPath === next.folderPath && previous.clientId === next.clientId;
      await this.persist({
        ...next, enabled: true, processed: sameDiary ? previous.processed : [],
        published: sameDiary ? previous.published : '', lastSyncAt: sameDiary ? previous.lastSyncAt : '',
      });
      this.status.set('Папка подключена. Нажмите «Синхронизировать».');
    } catch (error) { this.report(error); }
    finally { this.busy.set(false); }
  }

  async synchronize(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.status.set('Получаем семейные изменения…');
    try {
      await this.ready();
      const config = this.config();
      if (!config.enabled) throw new Error('Сначала подключите общую папку.');
      if (this.supabase.config().enabled) throw new Error('Отключите Supabase перед обменом через Диск.');
      const client = new YandexDiskClient(await this.auth.token());
      // Never recreate a missing marker during normal sync: a wrong/empty path must not split the diary.
      await this.checkMarker(client, config, false);
      const files = await client.list(config.folderPath);
      const processed = new Set(config.processed);
      const merged: SyncDocument = { scope: yandexScope(config.familyId), entries: {} };
      const packetName = new RegExp(`^baby-tracker-${config.familyId}-[0-9a-f-]{36}\\.json$`);
      for (const file of files) {
        if (file.type !== 'file' || !packetName.test(file.name) || processed.has(file.name)) continue;
        const packet = await client.download(childPath(config.folderPath, file.name));
        if (!isYandexPacket(packet, config.familyId)) throw new Error('Один из пакетов семейного дневника повреждён или имеет неподдерживаемую версию. Данные не применены.');
        for (const [key, entry] of Object.entries(packet.document.entries)) {
          merged.entries[key] = merged.entries[key] ? newerEntry(merged.entries[key], entry) : entry;
        }
        processed.add(file.name);
      }
      // Validate every downloaded packet before a single atomic local commit.
      await this.storage.mergeSync(merged);
      const document = structuredClone(this.storage.syncDocument()!);
      if (document.scope !== merged.scope) throw new Error('Дневник изменился во время обмена. Повторите синхронизацию.');
      const signature = journalSignature(document);
      let published = config.published;
      if (signature !== published) {
        this.status.set('Отправляем изменения на Яндекс Диск…');
        const name = `baby-tracker-${config.familyId}-${crypto.randomUUID()}.json`;
        const packet: YandexPacket = { format: 'baby-tracker-sync', version: 1, familyId: config.familyId, document };
        await client.upload(childPath(config.folderPath, name), packet);
        processed.add(name);
        published = signature;
      }
      await this.persist({ ...config, processed: [...processed], published, lastSyncAt: new Date().toISOString() });
      this.status.set(this.pending()
        ? 'Обмен завершён. Во время отправки появились новые записи — нажмите ещё раз.'
        : 'Синхронизация завершена. Получены доступные пакеты, изменения отправлены.');
    } catch (error) { this.report(error); }
    finally { this.busy.set(false); }
  }

  async folders(path: string): Promise<DiskItem[]> {
    return (await new YandexDiskClient(await this.auth.token()).list(path)).filter(item => item.type === 'dir');
  }

  async disconnect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      await this.ready();
      await this.persist({ ...this.config(), enabled: false });
      await this.auth.disconnect();
      this.status.set('Яндекс Диск отключён на этом телефоне. Локальные записи и файлы в папке сохранены.');
    } catch (error) { this.report(error); }
    finally { this.busy.set(false); }
  }

  private async checkMarker(client: YandexDiskClient, settings: YandexSettings, create: boolean): Promise<boolean> {
    const path = childPath(settings.folderPath, YANDEX_MARKER);
    let marker: unknown;
    let initialized = false;
    try { marker = await client.download(path); }
    catch (error) {
      if (!(error instanceof YandexDiskError) || error.status !== 404 || !create) throw error;
      initialized = true;
      try {
        await client.upload(path, { format: 'baby-tracker-family', version: 1, familyId: settings.familyId });
      } catch (uploadError) {
        // Both parents may initialize the same folder at once. Inspect the winner, never overwrite it.
        if (!(uploadError instanceof YandexDiskError) || uploadError.status !== 409) throw uploadError;
      }
      marker = await client.download(path);
    }
    if (!isRecord(marker) || marker['format'] !== 'baby-tracker-family' || marker['version'] !== 1 || marker['familyId'] !== settings.familyId) {
      throw new Error('В папке другой идентификатор дневника или неподдерживаемый формат. Укажите UUID с первого телефона. Не удаляйте служебный файл.');
    }
    return initialized;
  }

  private async persist(config: YandexConfig): Promise<void> {
    await Preferences.set({ key: YANDEX_CONFIG_KEY, value: JSON.stringify(config) });
    this.configResource.value.set(config);
  }

  private report(error: unknown): void {
    this.status.set('');
    this.error.set(error instanceof Error ? error.message : 'Не удалось синхронизировать. Локальные записи сохранены.');
  }
}
