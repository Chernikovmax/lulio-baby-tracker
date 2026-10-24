import { DestroyRef, Service, computed, effect, inject, resource, signal, untracked } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { SyncConfig, isSyncConfig, isSyncResponse } from '../models/sync.models';
import { YANDEX_CONFIG_KEY } from '../models/yandex-sync.models';
import { StorageService } from './storage.service';

const CONFIG_KEY = 'baby-tracker.sync.v1';
const DEFAULT_CONFIG: SyncConfig = { enabled: false, url: '', anonKey: '', familyId: '' };
const FAMILY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface Connection {
  client: SupabaseClient;
  channel?: RealtimeChannel;
  scope: string;
  familyId: string;
  connected: boolean;
  running: boolean;
  requested: boolean;
}

@Service()
export class SyncService {
  private readonly storage = inject(StorageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly initialRead = Preferences.get({ key: CONFIG_KEY }).then(({ value }) => {
    if (value === null) return { ...DEFAULT_CONFIG };
    const parsed: unknown = JSON.parse(value);
    if (!isSyncConfig(parsed)) throw new Error('Не удалось прочитать настройки синхронизации.');
    return parsed;
  });
  private readonly configResource = resource({ loader: () => this.initialRead });
  readonly config = computed(() => this.configResource.hasValue() ? this.configResource.value() : DEFAULT_CONFIG);
  readonly isLoading = this.configResource.isLoading;
  readonly status = signal('Синхронизация выключена');
  readonly error = signal<string | null>(null);
  private connection: Connection | null = null;
  private connecting = false;
  private generation = 0;
  private configWrites: Promise<void> = Promise.resolve();

  constructor() {
    effect(() => {
      if (this.configResource.error()) {
        this.error.set('Не удалось прочитать настройки синхронизации. Локальный дневник доступен.');
        return;
      }
      if (!this.configResource.hasValue()) return;
      const config = this.config();
      untracked(() => { void this.connect(config); });
    });
    effect(() => {
      const checkpoint = this.storage.supabaseCheckpoint();
      if (checkpoint && Object.keys(checkpoint.pending).length) untracked(() => this.requestSync());
    });
    // Realtime is a hint; a small delta poll recovers missed notifications while visible.
    const retry = () => {
      if (!this.config().enabled || document.visibilityState === 'hidden') return;
      if (!this.connection && !this.connecting) void this.connect(this.config());
      else this.requestSync();
    };
    let interval: number | undefined;
    const visible = () => {
      clearInterval(interval);
      interval = undefined;
      if (document.visibilityState === 'hidden') return;
      interval = window.setInterval(retry, 10_000);
      retry();
    };
    visible();
    globalThis.addEventListener('online', retry);
    document.addEventListener('visibilitychange', visible);
    this.destroyRef.onDestroy(() => {
      clearInterval(interval);
      globalThis.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', visible);
      this.generation++;
      this.disconnect();
    });
  }

  async ready(): Promise<void> {
    try {
      const config = await this.initialRead;
      if (!this.configResource.hasValue()) this.configResource.value.set(config);
    } catch {
      this.error.set('Не удалось прочитать настройки синхронизации. Локальный дневник доступен.');
      throw new Error('Не удалось прочитать настройки синхронизации.');
    }
  }

  saveConfig(config: SyncConfig): Promise<void> {
    const operation = this.configWrites.then(async () => {
      await this.initialRead.catch(() => undefined);
      if (!isSyncConfig(config)) throw new Error('Проверьте настройки синхронизации.');
      const next = { ...config, url: config.url.trim(), anonKey: config.anonKey.trim(), familyId: config.familyId.trim().toLowerCase() };
      if (next.enabled) {
        this.resolveConfig(next);
        await this.assertYandexDisabled();
      }
      await Preferences.set({ key: CONFIG_KEY, value: JSON.stringify(next) });
      this.configResource.value.set(next);
    });
    this.configWrites = operation.catch(() => undefined);
    return operation;
  }

  private resolveConfig(config: SyncConfig): SyncConfig {
    const resolved = {
      ...config,
      url: (config.url || environment.supabase.url).replace(/\/+$/, ''),
      anonKey: config.anonKey || environment.supabase.anonKey,
      familyId: (config.familyId || environment.supabase.familyId).toLowerCase(),
    };
    let url: URL;
    try { url = new URL(resolved.url); } catch { throw new Error('Укажите корректный адрес Supabase.'); }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('Используйте защищённый адрес Supabase (HTTPS).');
    }
    if (!resolved.anonKey) throw new Error('Укажите публичный анонимный ключ Supabase.');
    if (!FAMILY_ID.test(resolved.familyId)) throw new Error('Идентификатор семьи должен быть случайным UUID v4, одинаковым на обоих устройствах.');
    return resolved;
  }

  private disconnect(): void {
    const connection = this.connection;
    this.connection = null;
    if (!connection) return;
    connection.connected = false;
    if (connection.channel) void connection.client.removeChannel(connection.channel);
    connection.client.auth.stopAutoRefresh();
  }

  private async connect(config: SyncConfig): Promise<void> {
    const generation = ++this.generation;
    this.disconnect();
    this.connecting = false;
    this.error.set(null);
    if (!config.enabled) { this.status.set('Синхронизация выключена'); return; }
    if (document.visibilityState === 'hidden') return;
    this.status.set('Подключение к семье…');
    this.connecting = true;
    let client: SupabaseClient | undefined;
    try {
      await this.assertYandexDisabled();
      const resolved = this.resolveConfig(config);
      await this.storage.ready();
      if (generation !== this.generation) return;
      const scope = `${resolved.url}/${resolved.familyId}`;
      await this.storage.configureSupabaseSync(scope);
      if (generation !== this.generation) return;
      client = createClient(resolved.url, resolved.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      const { data: session, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session.session) {
        const { error } = await client.auth.signInAnonymously();
        if (error) throw error;
      }
      if (generation !== this.generation) { client.auth.stopAutoRefresh(); return; }
      const { error: joinError } = await client.rpc('join_tracker_family', { target_family: resolved.familyId });
      if (joinError) throw joinError;
      if (generation !== this.generation) { client.auth.stopAutoRefresh(); return; }
      const connection: Connection = { client, scope, familyId: resolved.familyId, connected: true, running: false, requested: false };
      this.connection = connection;
      connection.channel = client.channel(`family:${resolved.familyId}`, {
        config: { postgres_changes_options: { wait: true } },
      }).on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tracker_families', filter: `family_id=eq.${resolved.familyId}`,
      }, payload => {
        const version: unknown = payload.new['version'];
        const checkpoint = this.storage.supabaseCheckpoint();
        if (this.connection === connection && typeof version === 'number' &&
          checkpoint?.scope === connection.scope && version > checkpoint.version) this.requestSync();
      }).subscribe(status => {
        if (this.connection !== connection) return;
        if (status === 'SUBSCRIBED') {
          connection.connected = true;
          this.requestSync();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.status.set('Нет связи в реальном времени. Данные сохранены на устройстве.');
        }
      });
      this.requestSync();
    } catch {
      client?.auth.stopAutoRefresh();
      if (generation !== this.generation) return;
      this.connection = null;
      this.error.set('Не удалось подключиться. Проверьте настройки, схему базы и анонимный вход Supabase.');
      this.status.set('Нет связи. Локальные изменения сохранены и будут отправлены после подключения.');
    } finally {
      if (generation === this.generation) this.connecting = false;
    }
  }

  private requestSync(): void {
    const connection = this.connection;
    if (!connection?.connected || document.visibilityState === 'hidden') return;
    connection.requested = true;
    if (!connection.running) void this.synchronize(connection);
  }

  private async synchronize(connection: Connection): Promise<void> {
    connection.running = true;
    try {
      while (connection.requested && this.connection === connection && document.visibilityState !== 'hidden') {
        connection.requested = false;
        const checkpoint = this.storage.supabaseCheckpoint();
        if (!checkpoint || checkpoint.scope !== connection.scope) return;
        const { data, error } = await connection.client.rpc('exchange_tracker_family', {
          target_family: connection.familyId, since_version: checkpoint.version, incoming: checkpoint.pending,
        });
        if (this.connection !== connection) return;
        if (error || !isSyncResponse(data)) throw new Error('Неверный ответ синхронизации.');
        await this.storage.mergeSupabase(connection.scope, checkpoint.version, checkpoint.pending, data);
        if (this.connection !== connection) return;
        this.error.set(null);
        this.status.set('Семейная синхронизация включена');
      }
    } catch {
      if (this.connection !== connection) return;
      this.error.set('Не удалось синхронизировать. Изменения сохранены на устройстве; повторим автоматически.');
      this.status.set('Ожидание сети');
    } finally {
      connection.running = false;
    }
  }

  private async assertYandexDisabled(): Promise<void> {
    const { value } = await Preferences.get({ key: YANDEX_CONFIG_KEY });
    if (value !== null) {
      let config: unknown;
      try { config = JSON.parse(value); } catch { throw new Error('Не удалось прочитать настройки Яндекс Диска.'); }
      if (typeof config === 'object' && config !== null && 'enabled' in config && config.enabled === true) {
        throw new Error('Сначала отключите Яндекс Диск. Одновременно можно использовать только один способ синхронизации.');
      }
    }
  }
}
