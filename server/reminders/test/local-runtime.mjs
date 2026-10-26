import http from 'node:http';
import { createHash, createECDH, randomBytes, randomUUID, createPublicKey, verify } from 'node:crypto';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import ece from 'http_ece';
import { ObjectStateStore } from '../storage.mjs';
import { createService, hash } from '../service.mjs';
import { createApi } from '../index.mjs';
import { createPushSender } from '../push.mjs';

export async function localRuntime({ origin: configuredOrigin } = {}) {
  let bytes = null, etag = null;
  let clock = Date.now();
  let beforePut = null;
  let failAfterPut = false;
  let responseStatus = 201;
  let dropResponse = false;
  const receipts = [];
  const requests = [];
  const secret = () => randomBytes(32).toString('base64url');
  const vapid = { ...webpush.generateVAPIDKeys(), subject: 'mailto:synthetic@example.invalid' };
  const recipient = createECDH('prime256v1'); recipient.generateKeys();
  const auth = randomBytes(16);
  const subscription = { endpoint: `https://web.push.apple.com/${randomUUID()}`, keys: { p256dh: recipient.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  const scope = secret(), invitation = secret(), credential = secret(), device = randomUUID();
  const policy = { inviteSeconds: 600, inactivityDays: 30, terminalHours: 24, maxDevices: 4, maxEnrollmentsPerDay: 8, maxMutationsPerDay: 500, maxCyclesPerDevice: 100 };
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (request.url === '/private/fixed-object') {
      requests.push({ method: request.method, conditional: request.headers['if-match'] ?? request.headers['if-none-match'], authorized: request.headers.authorization === 'Bearer synthetic-runtime-iam', storageClass: request.headers['x-amz-storage-class'] });
      if (request.headers.authorization !== 'Bearer synthetic-runtime-iam') { response.writeHead(403).end(); return; }
      if (request.method === 'GET') { if (!bytes) response.writeHead(404).end(); else response.writeHead(200, { ETag: etag, 'Content-Type': 'application/json', 'Content-Length': bytes.length }).end(bytes); return; }
      if (request.method !== 'PUT') { response.writeHead(405).end(); return; }
      if (beforePut) { const hook = beforePut; beforePut = null; await hook(JSON.parse(body.toString())); }
      if (request.headers['if-none-match'] === '*' ? bytes !== null : !bytes || request.headers['if-match'] !== etag) { response.writeHead(412).end(); return; }
      bytes = body; etag = `"${createHash('sha256').update(body).digest('hex')}"`;
      if (failAfterPut) { failAfterPut = false; response.destroy(); return; }
      response.writeHead(200, { ETag: etag }).end(); return;
    }
    if (request.url === '/recipient') {
      try {
        assert.equal(request.headers['content-encoding'], 'aes128gcm');
        assert.ok(Number(request.headers.ttl) > 0 && Number(request.headers.ttl) <= 600);
        const match = /^vapid t=([^,]+), k=(.+)$/.exec(request.headers.authorization);
        assert.ok(match);
        const [header, payload, signature] = match[1].split('.');
        const key = Buffer.from(match[2], 'base64url');
        const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: key.subarray(1, 33).toString('base64url'), y: key.subarray(33).toString('base64url') }, format: 'jwk' });
        assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
        const claims = JSON.parse(Buffer.from(payload, 'base64url'));
        assert.equal(claims.aud, 'https://web.push.apple.com');
        assert.ok(claims.exp > Date.now() / 1000);
        const decoded = JSON.parse(ece.decrypt(body, { version: 'aes128gcm', privateKey: recipient, authSecret: auth }).toString());
        assert.equal(decoded.notification.title, 'Скоро сон');
        assert.equal(decoded.notification.data.onActionClick.default.url, `${runtime.origin}/tabs/tracker`);
        receipts.push(decoded);
        if (dropResponse) { response.destroy(); return; }
        response.writeHead(responseStatus).end();
      } catch { response.writeHead(400).end(); }
      return;
    }
    const result = await api({ httpMethod: request.method, path: request.url, headers: request.headers, body: body.toString(), isBase64Encoded: false });
    response.writeHead(result.statusCode, result.headers).end(result.body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const store = new ObjectStateStore({ url: `${base}/private/fixed-object`, token: async () => 'synthetic-runtime-iam' });
  const runtime = { origin: configuredOrigin ?? base, scope, publicKey: vapid.publicKey, policy, store, clock: () => clock };
  const service = createService(runtime);
  const api = createApi(service, runtime.origin);
  const sender = createPushSender({ vapid, origin: runtime.origin, clock: () => clock, transport: async details => {
    const response = await fetch(`${base}/recipient`, { method: details.method, headers: details.headers, body: details.body, redirect: 'error', signal: AbortSignal.timeout(1000) });
    return response.status;
  } });
  await service.operator({ action: 'bootstrap', invitationHash: hash(invitation), request: randomUUID() });
  const authorization = `Bearer ${device}.${credential}`;
  const enroll = { invitation, device, credential, request: randomUUID() };
  async function call(operation, body, token = authorization, origin = runtime.origin) {
    const response = await fetch(base, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'X-Lulio-Device-Authorization': token, 'X-Lulio-Operation': operation, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  async function mutation(action, value, overrides = {}) {
    const status = await service.status(authorization);
    return call('mutate', { request: randomUUID(), revision: status.revision, action, value, ...overrides });
  }
  return { service, sender, store, subscription, scope, device, credential, invitation, enroll, authorization, policy, base, receipts, requests, call, mutation, secret,
    get now() { return clock; }, advance(ms) { clock += ms; }, state: () => JSON.parse(bytes),
    beforePut(hook) { beforePut = hook; }, loseNextPutResponse() { failAfterPut = true; },
    recipientStatus(status) { responseStatus = status; }, dropRecipientResponse() { dropResponse = true; },
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
