import { TestBed } from '@angular/core/testing';
import { Capacitor, CapacitorHttp, type HttpOptions } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YandexAuthService } from './yandex-auth.service';
import { YandexDiskClient } from './yandex-disk.client';

vi.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: { get: async () => null, set: async () => undefined, remove: async () => true },
  KeychainAccess: { whenUnlockedThisDeviceOnly: 1 },
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: async () => undefined } }));
vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { request: async () => ({ status: 500, data: null, headers: {}, url: '' }) },
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({}),
}));

const clientId = 'a'.repeat(32);
describe('Защита сессии Яндекса', () => {
  beforeEach(() => TestBed.configureTestingModule({}));
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('связывает одноразовый код с PKCE и не сохраняет токен в браузерном localStorage', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const get = vi.spyOn(SecureStorage, 'get');
    const set = vi.spyOn(SecureStorage, 'set');
    const before = { ...localStorage };
    let exchange: URLSearchParams | undefined;
    vi.spyOn(CapacitorHttp, 'request').mockImplementation(async (options: HttpOptions) => {
      exchange = new URLSearchParams(options.data as string);
      return { status: 200, data: { access_token: 'test-access-session', expires_in: 3600 }, headers: {}, url: options.url };
    });
    const auth = TestBed.inject(YandexAuthService);
    await auth.start(clientId);
    const authorize = new URL(open.mock.calls[0][0] as string);
    await auth.finish('1234567');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(exchange!.get('code_verifier')!)));
    const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    expect(authorize.searchParams.get('code_challenge')).toBe(challenge);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(exchange!.has('client_secret')).toBe(false);
    expect(await auth.token()).toBe('test-access-session');
    expect(get).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
    await auth.disconnect();
    await expect(auth.token()).rejects.toThrow('Войдите');
  });

  it('не считает вход успешным, если защищённая запись на устройстве не удалась', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.spyOn(SecureStorage, 'get').mockResolvedValue(null);
    vi.spyOn(SecureStorage, 'set').mockRejectedValue(new Error('native confidential detail'));
    vi.spyOn(Browser, 'open').mockResolvedValue();
    vi.spyOn(CapacitorHttp, 'request').mockResolvedValue({ status: 200, data: { access_token: 'test-session', expires_in: 3600 }, headers: {}, url: '' });
    const auth = TestBed.inject(YandexAuthService);
    await auth.start(clientId);
    await expect(auth.finish('1234567')).rejects.toThrow('защищённом хранилище');
    expect(auth.connected()).toBe(false);
  });

  it('не передаёт OAuth-заголовок на файловый хост и отвергает посторонний адрес загрузки', async () => {
    const request = vi.spyOn(CapacitorHttp, 'request');
    request.mockResolvedValueOnce({ status: 200, data: { href: 'https://download.yandex.net/file' }, headers: {}, url: '' });
    request.mockResolvedValueOnce({ status: 200, data: '{"version":1}', headers: {}, url: '' });
    const client = new YandexDiskClient('test-session');
    expect(await client.download('/Family/file.json')).toEqual({ version: 1 });
    expect(request.mock.calls[1][0].headers?.['Authorization']).toBeUndefined();
    request.mockResolvedValueOnce({ status: 200, data: { href: 'https://example.org/upload' }, headers: {}, url: '' });
    await expect(client.upload('/Family/file.json', { version: 1 })).rejects.toThrow('недопустимый адрес');
    expect(request).toHaveBeenCalledTimes(3);
  });
});
