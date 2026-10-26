import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './local-runtime.mjs';
import { createService, hash } from '../service.mjs';
import { productionStore } from '../storage.mjs';

async function enrolled(t) {
  const runtime = await localRuntime(); t.after(() => runtime.close());
  assert.equal((await runtime.call('enroll', runtime.enroll)).status, 200);
  assert.equal((await runtime.mutation('subscribe', runtime.subscription)).status, 200);
  return runtime;
}
const plan = runtime => ({ cycle: hash('synthetic-cycle'), revision: hash('revision-1'), due: runtime.now + 60_000, expiry: runtime.now + 360_000, blocked: false });

test('HTTP authentication, exact guards, one-use enrollment, origin and endpoint restrictions', async t => {
  const r = await enrolled(t);
  assert.equal((await r.call('status', undefined, 'Bearer invalid')).status, 401);
  assert.equal((await r.call('status', undefined, r.authorization, 'https://wrong.invalid')).status, 403);
  assert.equal((await r.call('enroll', r.enroll)).status, 200);
  assert.equal((await r.call('enroll', { ...r.enroll, device: randomUUID(), request: randomUUID() })).status, 403);
  for (const endpoint of ['http://127.0.0.1/ssrf', 'https://127.0.0.1/send', 'https://web.push.apple.com.evil.invalid/send', 'https://web.push.apple.com:8443/send', 'https://user@web.push.apple.com/send', 'https://web.push.apple.com/send?x=1']) {
    assert.equal((await r.mutation('subscribe', { ...r.subscription, endpoint })).status, 400);
  }
  assert.equal((await r.mutation('plan', { ...plan(r), recipient: randomUUID() })).status, 400);
  assert.equal((await r.mutation('revoke', randomUUID())).status, 404);
  const second = createService({ store: r.store, scope: r.secret(), origin: r.base, publicKey: '', policy: r.policy });
  await assert.rejects(second.status(r.authorization), error => error.status === 410);
  assert.ok(r.requests.every(request => request.authorized));
  assert.ok(r.requests.filter(request => request.method === 'PUT').every(request => request.conditional && request.storageClass === 'STANDARD'));
  assert.equal(r.requests[1].conditional, '*');
  assert.ok(!r.requests.some(request => request.method === 'LIST'));
});

test('old versions, request replay and lost conditional-PUT response do not duplicate state', async t => {
  const r = await enrolled(t);
  const revision = (await r.service.status(r.authorization)).revision;
  const body = { request: randomUUID(), revision, action: 'plan', value: plan(r) };
  r.loseNextPutResponse();
  const accepted = await r.call('mutate', body);
  assert.equal(accepted.status, 200);
  assert.deepEqual((await r.call('mutate', body)).body, accepted.body);
  assert.equal((await r.call('mutate', { ...body, value: null })).status, 409);
  assert.equal((await r.call('mutate', { ...body, request: randomUUID() })).status, 409);
  assert.equal(r.state().devices[r.device].revision, revision + 1);
});

test('concurrent dispatch performs one encrypted send; changed forecast cannot regain sent entitlement', async t => {
  const r = await enrolled(t); const value = plan(r);
  await r.mutation('plan', value); r.advance(60_001);
  await Promise.all([r.service.dispatch(r.sender), r.service.dispatch(r.sender)]);
  assert.equal(r.receipts.length, 1);
  assert.equal(r.receipts[0].notification.tag, `lulio-${value.cycle}`);
  await r.mutation('plan', { ...value, due: r.now + 60_000, expiry: r.now + 300_000, revision: hash('revision-2') });
  r.advance(60_001); await r.service.dispatch(r.sender);
  assert.equal(r.receipts.length, 1);
});

test('cancel and revoke win CAS before send authorization; expired work is never caught up', async t => {
  for (const action of ['cancel', 'revoke', 'expire']) {
    const r = await enrolled(t); await r.mutation('plan', plan(r)); r.advance(60_001);
    r.beforePut(async state => {
      if (state.devices[r.device].intent.status === 'leased') {
        if (action === 'cancel') await r.mutation('plan', null);
        if (action === 'revoke') await r.mutation('revoke', r.device);
        if (action === 'expire') r.advance(600_000);
      }
    });
    await r.service.dispatch(r.sender); assert.equal(r.receipts.length, 0);
    if (action === 'revoke') assert.equal((await r.call('status')).status, 401);
  }
});

test('definite transient rejection retries boundedly but ambiguous submission never retries', async t => {
  const r = await enrolled(t); await r.mutation('plan', plan(r)); r.advance(60_001);
  r.recipientStatus(503); await r.service.dispatch(r.sender);
  assert.equal(r.state().devices[r.device].intent.status, 'pending');
  r.advance(60_001); r.recipientStatus(201); await r.service.dispatch(r.sender);
  assert.equal(r.state().devices[r.device].intent.status, 'accepted');
  assert.equal(r.receipts.length, 2); // Two definite submissions, only second accepted.
  const u = await enrolled(t); await u.mutation('plan', plan(u)); u.advance(60_001); u.dropRecipientResponse();
  await u.service.dispatch(u.sender); assert.equal(u.state().devices[u.device].intent.status, 'unknown');
  u.advance(60_001); await u.service.dispatch(u.sender); assert.equal(u.receipts.length, 1);
});

test('owner pairing, member recipient denial, private recovery and closure cannot resurrect membership', async t => {
  const r = await enrolled(t); const invite = r.secret();
  await r.mutation('invite', invite);
  const member = { invitation: invite, device: randomUUID(), credential: r.secret(), request: randomUUID() };
  assert.equal((await r.call('enroll', member)).status, 200);
  const token = `Bearer ${member.device}.${member.credential}`;
  assert.equal((await r.call('mutate', { request: randomUUID(), revision: 0, action: 'revoke', value: r.device }, token)).status, 403);
  assert.equal((await r.call('mutate', { request: randomUUID(), revision: 0, action: 'invite', value: r.secret() }, token)).status, 403);
  assert.equal((await r.call('mutate', { request: randomUUID(), revision: 0, action: 'subscribe', value: r.subscription }, token)).status, 409);
  const recovery = r.secret();
  await r.service.operator({ action: 'recover', invitationHash: hash(recovery), request: randomUUID() });
  assert.equal((await r.call('status')).status, 401);
  assert.equal((await r.call('status', undefined, token)).status, 401);
  const next = { invitation: recovery, device: randomUUID(), credential: r.secret(), request: randomUUID() };
  await r.call('enroll', next);
  const nextToken = `Bearer ${next.device}.${next.credential}`;
  assert.equal((await r.call('mutate', { request: randomUUID(), revision: 0, action: 'close', value: null }, nextToken)).status, 200);
  await assert.rejects(r.service.operator({ action: 'bootstrap', invitationHash: hash(r.secret()), request: randomUUID() }), error => error.status === 410);
});

test('expired invitations, enrollment limits and inactivity deletion are enforced durably', async t => {
  const r = await enrolled(t); const invite = r.secret(); await r.mutation('invite', invite);
  r.advance(r.policy.inviteSeconds * 1000 + 1);
  assert.equal((await r.call('enroll', { invitation: invite, device: randomUUID(), credential: r.secret(), request: randomUUID() })).status, 403);
  r.advance(r.policy.inactivityDays * 86_400_000);
  await r.service.dispatch(r.sender);
  assert.equal((await r.call('status')).status, 401);
  assert.equal(r.state().devices[r.device].subscription, null);
  assert.equal(r.state().devices[r.device].verifier, null);
});

test('production IAM adapter preserves the provider URL, quoted ETag and conditional-write contract', async t => {
  const r = await enrolled(t);
  const store = productionStore({ bucket: 'synthetic-private', objectKey: r.scope }, { token: { access_token: 'synthetic-runtime-iam' } });
  store.fetch = (url, options) => {
    assert.equal(url, `https://storage.yandexcloud.net/synthetic-private/${r.scope}`);
    assert.equal(options.redirect, 'error');
    return fetch(`${r.base}/private/fixed-object`, options);
  };
  const original = await store.get();
  assert.match(original.etag, /^"[a-f0-9]+"$/);
  await store.put({ ...original.state, revision: original.state.revision + 1 }, original.etag);
  await assert.rejects(store.put(original.state, original.etag), error => error.status === 412);
  assert.equal((await store.get()).state.revision, original.state.revision + 1);
});

test('expired pre-send lease fences its old holder and authorized unfinished submission is not reclaimed', async t => {
  const r = await enrolled(t); await r.mutation('plan', plan(r)); r.advance(60_001);
  let held = false;
  r.beforePut(async state => {
    if (state.devices[r.device].intent.status === 'leased') {
      r.beforePut(async authorization => {
        if (authorization.devices[r.device].intent.status === 'authorized') {
          held = true; r.advance(15_001);
          await r.service.dispatch(r.sender);
        }
      });
    }
  });
  await r.service.dispatch(r.sender);
  assert.equal(held, true);
  assert.equal(r.receipts.length, 1);
  const u = await enrolled(t); await u.mutation('plan', plan(u)); u.advance(60_001);
  let entered, release;
  const reached = new Promise(resolve => { entered = resolve; });
  const completion = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const unfinished = u.service.dispatch(async () => { calls++; entered(); return completion; });
  await reached;
  await u.service.dispatch(async () => { calls++; return { status: 'accepted' }; });
  assert.equal(u.state().devices[u.device].intent.status, 'unknown');
  release({ status: 'unknown' }); await unfinished;
  u.advance(60_001); await u.service.dispatch(u.sender);
  assert.equal(calls, 1); assert.equal(u.receipts.length, 0);
});

test('HTTP 410 retires subscription and bounded rejection attempts stop without gaining a second accepted send', async t => {
  const r = await enrolled(t); await r.mutation('plan', plan(r)); r.advance(60_001);
  r.recipientStatus(410); await r.service.dispatch(r.sender);
  assert.equal(r.state().devices[r.device].subscription, null);
  assert.equal((await r.service.status(r.authorization)).retired, true);
  await r.service.dispatch(r.sender); assert.equal(r.receipts.length, 1);
  const u = await enrolled(t); await u.mutation('plan', plan(u)); u.advance(60_001);
  u.recipientStatus(503);
  for (let attempt = 0; attempt < 5; attempt++) { await u.service.dispatch(u.sender); u.advance(60_001); }
  assert.equal(u.receipts.length, 3);
  assert.equal(u.state().devices[u.device].intent.status, 'permanent');
  u.advance(u.policy.terminalHours * 3_600_000); await u.service.dispatch(u.sender);
  assert.equal(u.state().devices[u.device].intent, null);
  assert.equal(u.state().devices[u.device].cycles[hash('synthetic-cycle')], true);
});

test('enrollment quotas reject excess rights and revoked devices do not starve a newly enrolled recipient', async t => {
  const r = await enrolled(t); r.policy.maxDevices = 1;
  const invite = r.secret(); await r.mutation('invite', invite);
  const member = { invitation: invite, device: randomUUID(), credential: r.secret(), request: randomUUID() };
  assert.equal((await r.call('enroll', member)).status, 429);
  await r.mutation('revoke', r.device);
  assert.equal((await r.call('enroll', member)).status, 200);
  const token = `Bearer ${member.device}.${member.credential}`;
  const mutate = (revision, action, value) => r.call('mutate', { request: randomUUID(), revision, action, value }, token);
  assert.equal((await mutate(0, 'subscribe', r.subscription)).status, 200);
  assert.equal((await mutate(1, 'plan', plan(r))).status, 200);
  r.advance(60_001); await r.service.dispatch(r.sender);
  assert.equal(r.receipts.length, 1);
  const u = await enrolled(t);
  const invite2 = u.secret(); await u.mutation('invite', invite2);
  u.policy.maxEnrollmentsPerDay = 1;
  assert.equal((await u.call('enroll', { invitation: invite2, device: randomUUID(), credential: u.secret(), request: randomUUID() })).status, 429);
});

test('an idle minute uses one billable fixed-object GET and no PUT after the daily retention pass', async t => {
  const r = await enrolled(t); await r.mutation('plan', plan(r));
  await r.service.dispatch(r.sender);
  const revision = r.state().revision, before = r.requests.length;
  for (let minute = 0; minute < 3; minute++) {
    r.advance(10_000);
    assert.equal((await r.service.dispatch(r.sender)).processed, 0);
  }
  const requests = r.requests.slice(before);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.method === 'GET'));
  assert.equal(r.state().revision, revision);
  assert.equal(r.receipts.length, 0);
});
