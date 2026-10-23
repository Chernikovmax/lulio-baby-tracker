import { CapacitorHttp, type HttpResponse } from '@capacitor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YandexDiskClient, YandexDiskError } from './yandex-disk.client';

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { request: vi.fn() },
}));

const reply = (status: number, data: unknown): HttpResponse => ({ status, data, headers: {}, url: '' });
const client = new YandexDiskClient('private-token');
const path = '/private-folder/baby-tracker-family.json';
const signedUrl = 'https://transfer.yandex.net/file?secret=private-signature';
const steps = [
  { code: 'YD-METADATA', run: () => client.metadata(path), transfer: false },
  { code: 'YD-LIST', run: () => client.list(path), transfer: false },
  { code: 'YD-DOWNLOAD-LINK', run: () => client.download(path), transfer: false },
  { code: 'YD-DOWNLOAD', run: () => client.download(path), transfer: true },
  { code: 'YD-UPLOAD-LINK', run: () => client.upload(path, {}), transfer: false },
  { code: 'YD-UPLOAD', run: () => client.upload(path, {}), transfer: true },
];

afterEach(() => vi.restoreAllMocks());

describe('Безопасная диагностика запросов Диска', () => {
  it.each(steps)('различает HTTP 404 на этапе $code без раскрытия данных доступа', async ({ code, run, transfer }) => {
    const request = vi.spyOn(CapacitorHttp, 'request');
    if (transfer) request.mockResolvedValueOnce(reply(200, { href: signedUrl }));
    request.mockResolvedValueOnce(reply(404, { secret: 'private-upstream-body' }));
    const error = await run().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(YandexDiskError);
    expect(error).toMatchObject({ status: 404, message: expect.stringContaining(`[${code}; HTTP 404]`) });
    expect((error as Error).message).not.toMatch(/private-|https:\/\//);
  });

  it('отличает отсутствие HTTP-ответа от ошибки обработки скачанного JSON и скрывает исходное исключение', async () => {
    const request = vi.spyOn(CapacitorHttp, 'request');
    request.mockResolvedValueOnce(reply(200, { href: signedUrl }))
      .mockRejectedValueOnce(new Error(`private-token ${signedUrl}`));
    const network = await client.download(path).catch((cause: unknown) => cause);
    expect(network).toMatchObject({ status: 0, message: expect.stringContaining('[YD-DOWNLOAD; HTTP-ответ недоступен:') });
    expect((network as Error).message).not.toMatch(/private-|https:\/\//);

    request.mockResolvedValueOnce(reply(200, { href: signedUrl }))
      .mockResolvedValueOnce(reply(200, 'private-invalid-json'));
    const invalid = await client.download(path).catch((cause: unknown) => cause);
    expect(invalid).toBeInstanceOf(Error);
    expect((invalid as Error).message).toContain('[YD-DOWNLOAD; ошибка обработки ответа]');
    expect((invalid as Error).message).not.toMatch(/private-|https:\/\//);
  });
});
