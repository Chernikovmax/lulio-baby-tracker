export class StorageFailure extends Error {
  constructor(status) { super('Private state unavailable'); this.status = status; }
}

/** The URL is fixed by operator configuration; no request-controlled paths or LIST. */
export class ObjectStateStore {
  constructor({ url, token, fetchImpl = fetch }) {
    this.url = url; this.token = token; this.fetch = fetchImpl;
  }
  async get() {
    const response = await this.fetch(this.url, { headers: { Authorization: `Bearer ${await this.token()}` }, redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new StorageFailure(response.status);
    const etag = response.headers.get('etag');
    if (!etag || Number(response.headers.get('content-length')) > 1_048_576) throw new StorageFailure(502);
    const text = await response.text();
    if (Buffer.byteLength(text) > 1_048_576) throw new StorageFailure(502);
    try { return { etag, state: JSON.parse(text) }; }
    catch { throw new StorageFailure(502); }
  }
  async put(state, etag) {
    const body = JSON.stringify(state);
    if (Buffer.byteLength(body) > 1_048_576) throw new StorageFailure(507);
    const response = await this.fetch(this.url, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(5000), body,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json', 'x-amz-storage-class': 'STANDARD',
        ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) } });
    if (!response.ok) throw new StorageFailure(response.status);
  }
}

export function productionStore(config, context) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) || !/^[a-zA-Z0-9_-]{32,128}$/.test(config.objectKey)) throw new Error('Invalid private storage configuration');
  return new ObjectStateStore({ url: `https://storage.yandexcloud.net/${config.bucket}/${config.objectKey}`, token: async () => {
    // Yandex Functions supplies the attached service account's runtime IAM credential.
    const token = context?.token?.access_token;
    if (!token) throw new StorageFailure(503);
    return token;
  } });
}
