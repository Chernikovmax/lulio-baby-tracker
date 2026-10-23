import { CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';
import { isRecord } from '../models/tracker.models';

const API = 'https://cloud-api.yandex.net/v1/disk';
export class YandexDiskError extends Error {
  constructor(readonly status: number) {
    const message = status === 401 ? 'Сессия Яндекса истекла или отозвана. Войдите снова.'
      : status === 403 ? 'Нет доступа к папке или Диск ограничен. Проверьте право «Редактирование» и свободное место.'
      : status === 404 ? 'Папка или файл не найдены. Проверьте путь на этом аккаунте.'
      : status === 409 ? 'Файл уже существует. Повторите синхронизацию.'
      : status === 423 ? 'Яндекс временно запретил загрузку файлов. Попробуйте позже.'
      : status === 429 ? 'Слишком много запросов к Яндексу. Попробуйте позже.'
      : status === 507 ? 'На Яндекс Диске недостаточно места.'
      : 'Не удалось обратиться к Яндексу. Проверьте сеть и повторите попытку.';
    super(message);
  }
}
/** Messages in this class are authored locally, never copied from an upstream response. */
class DiskResponseError extends Error {}
/** Do not expose upstream bodies, request URLs or native error messages: they may contain credentials. */
export async function yandexRequest(options: HttpOptions): Promise<HttpResponse> {
  try {
    return await CapacitorHttp.request({ connectTimeout: 15_000, readTimeout: 30_000, ...options });
  } catch { throw new YandexDiskError(0); }
}
export function responseJson(response: HttpResponse): unknown {
  if (response.status < 200 || response.status >= 300) throw new YandexDiskError(response.status);
  try { return typeof response.data === 'string' ? JSON.parse(response.data) as unknown : response.data as unknown; }
  catch { throw new DiskResponseError('Яндекс вернул некорректный JSON. Данные не применены.'); }
}
function transferUrl(value: unknown): string {
  if (!isRecord(value) || typeof value['href'] !== 'string') throw new DiskResponseError('Яндекс не вернул ссылку передачи файла.');
  let url: URL;
  try { url = new URL(value['href']); }
  catch { throw new DiskResponseError('Яндекс вернул недопустимый адрес передачи файла.'); }
  if (url.protocol !== 'https:' || url.username || url.password ||
      !['yandex.net', 'yandex.ru'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new DiskResponseError('Яндекс вернул недопустимый адрес передачи файла.');
  }
  return url.href;
}
export interface DiskItem { name: string; path: string; type: 'dir' | 'file' }

const DISK_STEPS = {
  'YD-METADATA': 'Проверка выбранной папки',
  'YD-LIST': 'Чтение списка файлов и папок',
  'YD-DOWNLOAD-LINK': 'Получение ссылки на скачивание',
  'YD-DOWNLOAD': 'Скачивание файла',
  'YD-UPLOAD-LINK': 'Получение ссылки на загрузку',
  'YD-UPLOAD': 'Загрузка файла',
} as const;

/** Only static context is public; never include paths, signed links or upstream exceptions. */
async function diskStep<T>(step: keyof typeof DISK_STEPS, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (cause) {
    const error = cause instanceof YandexDiskError || cause instanceof DiskResponseError
      ? cause : new Error('Не удалось обработать ответ Яндекса. Данные не подтверждены.');
    const detail = cause instanceof YandexDiskError
      ? cause.status === 0 ? 'HTTP-ответ недоступен: сеть, блокировка браузером или ошибка транспорта'
        : `HTTP ${cause.status}`
      : 'ошибка обработки ответа';
    error.message = `${DISK_STEPS[step]}. ${error.message} [${step}; ${detail}]`;
    throw error;
  }
}

export class YandexDiskClient {
  constructor(private readonly token: string) {}

  async metadata(path: string): Promise<unknown> {
    return diskStep('YD-METADATA', async () => responseJson(await this.api('/resources', { path, fields: 'type,path' })));
  }

  async list(path: string): Promise<DiskItem[]> {
    const items: DiskItem[] = [];
    let offset = 0;
    for (;;) {
      const data = await diskStep('YD-LIST', async () => responseJson(await this.api('/resources', {
        path, offset: String(offset), limit: '100', sort: 'name',
        fields: 'type,_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.total',
      })));
      if (!isRecord(data) || data['type'] !== 'dir' || !isRecord(data['_embedded']) ||
          !Array.isArray(data['_embedded']['items']) || typeof data['_embedded']['total'] !== 'number') {
        throw new Error('Не удалось прочитать содержимое папки Яндекс Диска.');
      }
      const batch: unknown[] = data['_embedded']['items'];
      for (const item of batch) {
        if (!isRecord(item) || typeof item['name'] !== 'string' || typeof item['path'] !== 'string' ||
            (item['type'] !== 'file' && item['type'] !== 'dir')) {
          throw new Error('Некорректный список файлов Яндекс Диска.');
        }
        items.push({ name: item['name'], path: item['path'], type: item['type'] });
      }
      offset += batch.length;
      if (offset >= data['_embedded']['total']) return items;
      if (!batch.length) throw new Error('Яндекс вернул неполный список файлов. Повторите попытку.');
    }
  }

  async download(path: string): Promise<unknown> {
    const url = await diskStep('YD-DOWNLOAD-LINK', async () =>
      transferUrl(responseJson(await this.api('/resources/download', { path }))));
    return diskStep('YD-DOWNLOAD', async () =>
      responseJson(await yandexRequest({ url, method: 'GET', responseType: 'text' })));
  }

  async upload(path: string, content: unknown): Promise<void> {
    const url = await diskStep('YD-UPLOAD-LINK', async () =>
      transferUrl(responseJson(await this.api('/resources/upload', { path, overwrite: 'false' }))));
    const response = await diskStep('YD-UPLOAD', async () => {
      const result = await yandexRequest({
        url, method: 'PUT', data: content,
        headers: { 'Content-Type': 'application/json' }, responseType: 'text',
      });
      if (result.status !== 201 && result.status !== 202) throw new YandexDiskError(result.status);
      return result;
    });
    // 202 is not a completed publication. Verify the final file before acknowledging it.
    if (response.status === 202) {
      const actual = await this.download(path);
      if (JSON.stringify(actual) !== JSON.stringify(content)) throw new Error('Яндекс ещё обрабатывает загрузку. Повторите синхронизацию.');
    }
  }

  private api(endpoint: string, params: Record<string, string>): Promise<HttpResponse> {
    return yandexRequest({
      url: `${API}${endpoint}`, method: 'GET', params,
      headers: { Authorization: `OAuth ${this.token}`, Accept: 'application/json' }, responseType: 'json',
    });
  }
}
