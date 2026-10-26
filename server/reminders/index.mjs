import { ApiError, createService, validatePolicy } from './service.mjs';
import { productionStore } from './storage.mjs';
import { createPushSender } from './push.mjs';
import { ECDH } from 'node:crypto';

function configuration() {
  // Read only named deployment configuration; never serialize environment/context/events.
  const env = process.env;
  if (env.REMINDERS_APPROVED !== 'true') throw new ApiError(503, 'operator-approval-required');
  const config = { bucket: env.REMINDERS_BUCKET, objectKey: env.REMINDERS_OBJECT_KEY, scope: env.REMINDERS_SCOPE,
    origin: env.REMINDERS_ORIGIN, publicKey: env.VAPID_PUBLIC_KEY, policy: JSON.parse(env.REMINDERS_POLICY ?? 'null') };
  validatePolicy(config.policy);
  if (new URL(config.origin).protocol !== 'https:' || !/^[A-Za-z0-9_-]{87}$/.test(config.publicKey ?? '')) throw new ApiError(503, 'configuration');
  try { ECDH.convertKey(Buffer.from(config.publicKey, 'base64url'), 'prime256v1'); }
  catch { throw new ApiError(503, 'configuration'); }
  return config;
}
export function createApi(service, origin) {
  return async event => {
    const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    const output = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'X-Lulio-Device-Authorization, X-Lulio-Operation, Content-Type' };
    const response = (statusCode, body) => ({ statusCode, headers: output, body: JSON.stringify(body) });
    try {
      if (headers.origin !== origin) throw new ApiError(403, 'origin');
      if (event.httpMethod === 'OPTIONS') return response(204, null);
      // Direct Functions strips Authorization. Use a dedicated application header;
      // operation routing does not require API Gateway or undocumented URL suffixes.
      const operation = headers['x-lulio-operation'];
      if (event.httpMethod === 'GET' && operation === 'status') return response(200, await service.status(headers['x-lulio-device-authorization']));
      if (event.httpMethod !== 'POST' || !['enroll', 'mutate'].includes(operation)) throw new ApiError(404, 'route');
      if (!/^application\/json(?:\s*;.*)?$/i.test(headers['content-type'] ?? '') || event.isBase64Encoded || typeof event.body !== 'string' || Buffer.byteLength(event.body) > 8192) throw new ApiError(400, 'request');
      let body; try { body = JSON.parse(event.body); } catch { throw new ApiError(400, 'json'); }
      return response(200, operation === 'enroll' ? await service.redeem(body) : await service.mutate(headers['x-lulio-device-authorization'], body));
    } catch (error) { return response(error instanceof ApiError ? error.status : 503, { error: error instanceof ApiError ? error.code : 'unavailable' }); }
  };
}
export async function apiHandler(event, context) {
  try {
    const config = configuration();
    return await createApi(createService({ ...config, store: productionStore(config, context) }), config.origin)(event);
  } catch { return { statusCode: 503, headers: { 'Cache-Control': 'no-store' }, body: '{"error":"configuration"}' }; }
}
// Deploy these as DISTINCT private functions; no public URL route/event chooses either.
export async function operatorHandler(event, context) {
  try {
    const config = configuration();
    return await createService({ ...config, store: productionStore(config, context) }).operator(event);
  } catch { throw new Error('Reminder operator invocation failed'); }
}
export async function dispatchHandler(_event, context) {
  try {
    const config = configuration();
    if (process.env.REMINDERS_UNKNOWN_NO_RETRY_APPROVED !== 'true') throw new ApiError(503, 'send-policy-approval-required');
    const sender = createPushSender({ origin: config.origin, vapid: { subject: process.env.VAPID_SUBJECT,
      publicKey: config.publicKey, privateKey: process.env.VAPID_PRIVATE_KEY } });
    return await createService({ ...config, store: productionStore(config, context) }).dispatch(sender);
  } catch { throw new Error('Reminder dispatch invocation failed'); }
}
