import { DestroyRef, Service, computed, effect, inject, resource, signal, untracked } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { StorageService } from './storage.service';
import { SleepForecastService } from './sleep-forecast.service';
import { readWebReminderLedger, writeWebReminderLedger, type WebReminderLedger } from './web-reminder-ledger';

interface DeviceStatus {
  scope: string; device: string; revision: number; role: 'owner' | 'member'; enrolled: boolean; retired: boolean; status: string;
  publicKey: string; origin: string;
  policy: { inviteSeconds: number; inactivityDays: number; terminalHours: number; maxDevices: number; maxEnrollmentsPerDay: number; maxMutationsPerDay: number; maxCyclesPerDevice: number };
  devices: { device: string; role: string; enrolled: boolean }[];
}
interface PublicConfig { apiUrl?: string; privacyApproved?: boolean }
const randomSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');

@Service()
export class WebPreparationReminderService {
  private readonly storage = inject(StorageService);
  private readonly forecasts = inject(SleepForecastService);
  private readonly push = inject(SwPush, { optional: true });
  private readonly destroy = inject(DestroyRef);
  readonly web = Capacitor.getPlatform() === 'web';
  private readonly configuration = resource({ loader: async (): Promise<PublicConfig> => {
    if (!this.web) return {};
    try {
      const response = await fetch('/assets/reminders-config.json', { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) return {};
      const value = await response.json() as PublicConfig;
      if (typeof value.apiUrl !== 'string' || value.privacyApproved !== true) return {};
      const url = new URL(value.apiUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'functions.yandexcloud.net' || !/^\/[a-z0-9-]+$/.test(url.pathname) || url.port || url.username || url.password || url.search || url.hash) return {};
      return { apiUrl: url.href, privacyApproved: true };
    } catch { return {}; }
  } });
  readonly configured = computed(() => !!this.configuration.value()?.apiUrl);
  readonly supported = computed(() => this.web && !!this.push?.isEnabled && globalThis.isSecureContext && 'PushManager' in globalThis && 'Notification' in globalThis &&
    /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true));
  readonly ledger = signal<WebReminderLedger | null>(null);
  readonly status = signal<DeviceStatus | null>(null);
  readonly busy = signal(false);
  readonly waiting = signal(false);
  readonly message = signal('');
  readonly invitation = signal('');
  readonly preflight = signal(false);
  private operations: Promise<void> = Promise.resolve();
  private lastPlan = '';
  private lastInputs = '';
  private consentEpoch = 0;
  readonly description = computed(() => {
    if (!this.web) return '';
    if (this.waiting() || !this.configured() && !!this.ledger()?.dirty) return 'Ожидает сети: сервер ещё не подтвердил изменение или удаление. Старое напоминание может прийти.';
    if (!this.configured()) return this.ledger()
      ? 'Конфигурация сервера сейчас недоступна. Прежний план может действовать; после восстановления связи повторите проверку.'
      : 'Облачные напоминания не настроены оператором и выключены. Прогноз работает офлайн.';
    if (!this.supported()) return 'Нужна установленная PWA на iPhone с iOS 17+, HTTPS и поддержкой уведомлений. Прогноз доступен без них.';
    if (this.message()) return this.message();
    if (!this.ledger()) return 'Получение выключено. Подключение — только по одноразовому приглашению владельца.';
    if (!this.ledger()?.consent) return 'Устройство подключено. Уведомления на этом телефоне ещё не включены.';
    if (this.status()?.status === 'unknown') return 'Результат отправки неизвестен. Автоматического повтора этого сигнала не будет.';
    if (['pending', 'leased', 'authorized'].includes(this.status()?.status ?? '')) return 'Сервер подтвердил актуальный план. Это не подтверждение доставки или прочтения.';
    if (this.status()?.status === 'accepted') return 'Push-служба приняла сигнал. Показ на телефоне не подтверждён.';
    return 'Получение включено. Сейчас нет актуального будущего напоминания.';
  });
  constructor() {
    if (!this.web) return;
    try { this.ledger.set(readWebReminderLedger()); } catch { this.message.set('Не удалось прочитать приватные настройки устройства. Доставка не включена.'); }
    const online = () => { this.configuration.reload(); this.lastPlan = ''; void this.refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') online(); };
    window.addEventListener('online', online); document.addEventListener('visibilitychange', visible);
    const subscription = this.push?.pushSubscriptionChanges.subscribe(() => { this.lastPlan = ''; void this.refresh(); });
    this.destroy.onDestroy(() => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visible); subscription?.unsubscribe(); });
    effect(() => {
      const forecast = this.forecasts.forecast();
      const inputs = JSON.stringify([this.configured(), forecast.inputVersion, forecast.state, this.storage.sleepPreparations(), this.storage.sleepCycleSuppressions(), this.storage.importGeneration(), this.storage.reminderGeneration()]);
      if (this.storage.isLoading() || this.storage.error()) return;
      untracked(() => { if (inputs !== this.lastInputs) { this.lastInputs = inputs; void this.refresh(); } });
    });
  }
  private save(value: WebReminderLedger | null): void {
    writeWebReminderLedger(value); this.ledger.set(value);
    if (value?.dirty || value?.revoke) this.waiting.set(true);
  }
  private async request(operation: 'status' | 'enroll' | 'mutate', body?: unknown, authenticate = true): Promise<DeviceStatus> {
    const ledger = readWebReminderLedger();
    const api = this.configuration.value()?.apiUrl;
    if (!api || authenticate && (!ledger || ledger.api !== api)) throw new Error('configuration');
    const response = await fetch(api, { method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(5000), headers: { 'X-Lulio-Operation': operation,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(authenticate && ledger ? { 'X-Lulio-Device-Authorization': `Bearer ${ledger.device}.${ledger.credential}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 410) {
        this.save(null); this.status.set(null); this.preflight.set(false);
        this.message.set('Доступ отозван или истёк. Нужны новое приглашение и повторное согласие.');
        throw new Error('auth');
      }
      if ([400, 403, 429].includes(response.status)) {
        if (!authenticate) this.save(null);
        this.message.set(response.status === 429 ? 'Достигнут лимит оператора. Повторите позже или запросите новое приглашение.' : 'Запрос отклонён. Проверьте приглашение, разрешённый сервер и права владельца.');
        throw new Error('rejected');
      }
      throw new Error(response.status === 409 ? 'conflict' : 'unavailable');
    }
    const value = await response.json() as DeviceStatus;
    if (value.origin !== location.origin || value.device !== ledger?.device || !Number.isSafeInteger(value.revision) || typeof value.publicKey !== 'string' || !value.policy) throw new Error('server-contract');
    this.status.set(value); return value;
  }
  private async mutate(action: string, value: unknown): Promise<DeviceStatus> {
    const status = this.status(); if (!status) throw new Error('preflight');
    return this.request('mutate', { request: crypto.randomUUID(), revision: status.revision, action, value });
  }
  private run(operation: () => Promise<void>): Promise<void> {
    this.operations = this.operations.catch(() => undefined).then(async () => {
      const epoch = this.consentEpoch;
      this.busy.set(true);
      try { await operation(); if (epoch === this.consentEpoch) this.waiting.set(false); }
      catch (error) {
        const definite = error instanceof Error && (['auth', 'rejected', 'invitation'].includes(error.message) || error.name === 'NotAllowedError');
        this.waiting.set(epoch !== this.consentEpoch || !definite); this.preflight.set(false);
        if (error instanceof Error && error.message === 'invitation') this.message.set('Нужно корректное одноразовое приглашение владельца.');
        if (error instanceof Error && error.name === 'NotAllowedError') this.message.set('Браузер не разрешил уведомления. Разрешение меняется в настройках устройства; дневник работает без них.');
      }
      finally { this.busy.set(false); }
    });
    return this.operations;
  }
  enroll(invitation: string): Promise<void> {
    return this.run(async () => {
      if (!this.supported() || !this.configured() || !/^[A-Za-z0-9_-]{43}$/.test(invitation)) throw new Error('invitation');
      let ledger = readWebReminderLedger();
      if (!ledger) {
        ledger = { version: 1, api: this.configuration.value()!.apiUrl!, device: crypto.randomUUID(), credential: randomSecret(),
          enrollment: { invitation, request: crypto.randomUUID() }, consent: false, dirty: true, revoke: false };
        // Persist before redeem so response loss can reuse the same device credential/request.
        this.save(ledger);
      }
      if (!ledger.enrollment) { await this.request('status'); return; }
      await this.request('enroll', { invitation: ledger.enrollment.invitation, request: ledger.enrollment.request, device: ledger.device, credential: ledger.credential }, false);
      const current = readWebReminderLedger();
      if (!current || current.device !== ledger.device) return;
      this.save({ ...current, enrollment: null }); this.preflight.set(false); this.message.set('Устройство подключено. Проверьте доступ перед отдельным запросом разрешения.');
    });
  }
  preparePermission(): Promise<void> {
    return this.run(async () => {
      await this.request('status');
      // Wait for the existing Angular registration BEFORE the separate permission gesture.
      await navigator.serviceWorker.ready;
      this.preflight.set(true); this.message.set('Проверка завершена. Следующее нажатие запросит разрешение браузера.');
    });
  }
  enable(): Promise<void> {
    if (!this.preflight() || !this.supported() || this.busy() || !this.status()) return Promise.resolve();
    const epoch = this.consentEpoch;
    // Called synchronously inside the explicit click; never await network before requestSubscription.
    const subscription = this.push!.requestSubscription({ serverPublicKey: this.status()!.publicKey });
    return this.run(async () => {
      const result = await subscription;
      if (epoch !== this.consentEpoch) { await result.unsubscribe(); return; }
      const ledger = readWebReminderLedger(); if (!ledger) throw new Error('enrollment');
      this.save({ ...ledger, consent: true, dirty: true });
      await this.request('status');
      if (epoch !== this.consentEpoch) return;
      await this.mutate('subscribe', this.subscriptionJson(result));
      this.message.set(''); this.lastPlan = '';
    }).then(() => this.ledger()?.consent ? this.refresh() : undefined);
  }
  private subscriptionJson(subscription: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.['p256dh'] || !json.keys['auth']) throw new Error('subscription');
    return { endpoint: json.endpoint, keys: { p256dh: json.keys['p256dh'], auth: json.keys['auth'] } };
  }
  disable(revoke = false): Promise<void> {
    const ledger = readWebReminderLedger();
    if (!ledger) return Promise.resolve();
    this.consentEpoch++;
    this.save({ ...ledger, consent: false, dirty: true, revoke: ledger.revoke || revoke });
    this.preflight.set(false); this.lastPlan = '';
    return this.refresh();
  }
  createInvitation(): Promise<void> {
    return this.run(async () => {
      await this.request('status'); const invitation = randomSecret();
      await this.mutate('invite', invitation); this.invitation.set(invitation);
    });
  }
  revokeDevice(device: string): Promise<void> {
    if (device === this.ledger()?.device) return this.disable(true);
    return this.run(async () => { await this.request('status'); await this.mutate('revoke', device); });
  }
  refresh(): Promise<void> {
    if (!this.configured() || !this.ledger()) return Promise.resolve();
    return this.run(() => this.storage.withCommittedSnapshot(async () => {
      let ledger = readWebReminderLedger(); if (!ledger || ledger.enrollment) return;
      const epoch = this.consentEpoch;
      this.ledger.set(ledger);
      if (ledger.dirty || ledger.revoke) this.waiting.set(true);
      await this.request('status');
      if (epoch !== this.consentEpoch) return;
      if (!ledger.consent || ledger.revoke) {
        await this.mutate(ledger.revoke ? 'revoke' : 'disable', ledger.revoke ? ledger.device : null);
        if (epoch !== this.consentEpoch) return;
        try { const registration = await navigator.serviceWorker.getRegistration(); await (await registration?.pushManager.getSubscription())?.unsubscribe(); } catch { /* Server revocation already acknowledged; browser permission remains user-controlled. */ }
        if (epoch !== this.consentEpoch) return;
        if (ledger.revoke) { this.save(null); this.status.set(null); }
        else this.save({ ...ledger, dirty: false });
        this.message.set(ledger.revoke ? 'Доступ этого устройства отозван; сервер удалил подписку.' : 'Сервер подтвердил отключение и удалил подписку.');
        return;
      }
      if (ledger.dirty) {
        // Never replay a queued old plan. Cancel at the freshly read server revision first.
        await this.mutate('plan', null); this.lastPlan = '';
        if (epoch !== this.consentEpoch) return;
        ledger = { ...ledger, dirty: false }; this.save(ledger);
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (epoch !== this.consentEpoch) return;
      if (this.status()?.retired || !subscription || Notification.permission !== 'granted') {
        await this.mutate('disable', null);
        if (this.status()?.retired) await subscription?.unsubscribe();
        if (epoch !== this.consentEpoch) return;
        this.save({ ...ledger, consent: false });
        this.message.set('Подписка завершена или разрешение отозвано. Серверная доставка выключена; новое включение требует отдельного нажатия.'); return;
      }
      const forecast = this.forecasts.forecast(); const anchor = forecast.anchor;
      const blocked = !!anchor && (this.storage.sleepPreparations().some(item => item.scope === forecast.scope && item.anchorId === anchor.id && item.state !== 'cancelled') ||
        this.storage.sleepCycleSuppressions().some(item => item.scope === forecast.scope && item.anchorId === anchor.id));
      let plan: { cycle: string; revision: string; due: number; expiry: number; blocked: boolean } | null = null;
      if (anchor && forecast.preparationAt && forecast.predictedSleepAt && (forecast.state === 'ready' || blocked)) {
        const due = Date.parse(forecast.preparationAt);
        plan = { cycle: await sha256(JSON.stringify([forecast.scope, anchor.id])), revision: await sha256(forecast.inputVersion), due,
          expiry: Math.min(due + 600_000, Date.parse(forecast.predictedSleepAt), forecast.applicableUntil ? Date.parse(forecast.applicableUntil) : Infinity), blocked };
      }
      const signature = JSON.stringify(plan);
      if (signature !== this.lastPlan) {
        if (epoch !== this.consentEpoch) return;
        await this.mutate('subscribe', this.subscriptionJson(subscription));
        if (epoch !== this.consentEpoch) return;
        await this.mutate('plan', plan);
        if (epoch !== this.consentEpoch) return;
        this.lastPlan = signature;
      }
      this.message.set('');
    }));
  }
}
