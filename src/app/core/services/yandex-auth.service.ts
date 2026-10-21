import { Service, computed, resource, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage';
import { isRecord } from '../models/tracker.models';
import { responseJson, yandexRequest } from './yandex-disk.client';

const TOKEN_KEY = 'baby-tracker.yandex-token.v1';
const REDIRECT_URI = 'https://oauth.yandex.ru/verification_code';
interface Session { clientId: string; accessToken: string; expiresAt: number }
function isSession(value: unknown): value is Session {
  return isRecord(value) && typeof value['clientId'] === 'string' &&
    typeof value['accessToken'] === 'string' && typeof value['expiresAt'] === 'number' && Number.isFinite(value['expiresAt']);
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

@Service()
export class YandexAuthService {
  readonly native = Capacitor.isNativePlatform();
  private readonly session = signal<Session | null>(null);
  private readonly initialRead = (async () => {
    // The plugin's web implementation uses plaintext localStorage; deliberately never call it on web.
    if (this.native) {
      try {
        const saved = await SecureStorage.get(TOKEN_KEY, false, false);
        if (saved !== null && !isSession(saved)) throw new Error('invalid');
        this.session.set(saved);
      } catch { throw new Error('Не удалось прочитать защищённую сессию Яндекса.'); }
    }
    return true;
  })();
  private readonly loaded = resource({ loader: () => this.initialRead });
  readonly isLoading = this.loaded.isLoading;
  readonly loadError = this.loaded.error;
  readonly connected = computed(() => this.session() !== null);
  readonly clientId = computed(() => this.session()?.clientId ?? '');
  readonly awaitingCode = signal(false);
  private pending: { clientId: string; verifier: string; startedAt: number } | null = null;

  async ready(): Promise<void> { await this.initialRead; }

  async start(clientId: string): Promise<void> {
    await this.ready();
    if (!/^[a-f0-9]{32}$/i.test(clientId.trim())) throw new Error('Укажите ClientID OAuth-приложения Яндекса: 32 шестнадцатеричных символа.');
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const params = new URLSearchParams({
      response_type: 'code', client_id: clientId.trim(), redirect_uri: REDIRECT_URI,
      scope: 'cloud_api:disk.read cloud_api:disk.write', force_confirm: 'yes',
      code_challenge: challenge, code_challenge_method: 'S256',
    });
    this.pending = { clientId: clientId.trim(), verifier, startedAt: Date.now() };
    this.awaitingCode.set(true);
    const url = `https://oauth.yandex.ru/authorize?${params}`;
    try {
      if (this.native) await Browser.open({ url });
      else {
        this.authorizationUrl.set(url);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      this.pending = null; this.awaitingCode.set(false);
      throw new Error('Не удалось открыть браузер для входа в Яндекс.');
    }
  }
  readonly authorizationUrl = signal('');

  async finish(code: string): Promise<void> {
    const pending = this.pending;
    if (!pending || Date.now() - pending.startedAt > 10 * 60_000) {
      this.cancel();
      throw new Error('Запрос входа истёк. Нажмите «Войти в Яндекс» ещё раз.');
    }
    if (!/^\d{7}$/.test(code.trim())) throw new Error('Введите семизначный код, показанный Яндексом в браузере.');
    const response = await yandexRequest({
      url: 'https://oauth.yandex.ru/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, responseType: 'json',
      data: new URLSearchParams({
        grant_type: 'authorization_code', code: code.trim(),
        client_id: pending.clientId, code_verifier: pending.verifier,
      }).toString(),
    });
    if (response.status === 400) throw new Error('Яндекс не принял код. Проверьте ClientID, разрешения и начните вход заново.');
    const data = responseJson(response);
    if (!isRecord(data) || typeof data['access_token'] !== 'string' ||
        typeof data['expires_in'] !== 'number' || !Number.isFinite(data['expires_in']) || data['expires_in'] <= 0) {
      throw new Error('Яндекс не выдал сессию. Начните вход заново.');
    }
    if (typeof data['scope'] === 'string' &&
        !['cloud_api:disk.read', 'cloud_api:disk.write'].every(scope => (data['scope'] as string).split(' ').includes(scope))) {
      throw new Error('Не выданы права чтения и записи Диска. Проверьте разрешения OAuth-приложения.');
    }
    const session: Session = {
      clientId: pending.clientId, accessToken: data['access_token'], expiresAt: Date.now() + data['expires_in'] * 1000,
    };
    if (this.native) {
      try { await SecureStorage.set(TOKEN_KEY, { ...session }, false, false, KeychainAccess.whenUnlockedThisDeviceOnly); }
      catch { throw new Error('Не удалось сохранить сессию в защищённом хранилище. Повторите вход.'); }
    }
    this.session.set(session);
    this.cancel();
  }

  cancel(): void {
    this.pending = null; this.awaitingCode.set(false); this.authorizationUrl.set('');
  }

  async token(): Promise<string> {
    await this.ready();
    const session = this.session();
    if (!session || session.expiresAt <= Date.now()) throw new Error('Войдите в Яндекс заново: сессия отсутствует или истекла.');
    return session.accessToken;
  }

  async disconnect(): Promise<void> {
    if (this.native) {
      try { await SecureStorage.remove(TOKEN_KEY, false); }
      catch { throw new Error('Не удалось удалить защищённую сессию. Попробуйте ещё раз.'); }
    }
    this.session.set(null); this.cancel();
  }
}
