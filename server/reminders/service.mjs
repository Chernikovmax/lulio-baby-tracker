import { createHash, randomUUID, timingSafeEqual, ECDH } from 'node:crypto';
import { StorageFailure } from './storage.mjs';

export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const deny = (status, code) => { throw new ApiError(status, code); };
export const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) && Buffer.from(value, 'base64url').length === 32;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const exact = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...fields].sort().join(',');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const terminal = new Set(['accepted', 'unknown', 'expired', 'cancelled', 'permanent']);

export function validatePolicy(policy) {
  const limits = { inviteSeconds: [60, 3600], inactivityDays: [1, 90], terminalHours: [1, 168], maxDevices: [1, 10], maxEnrollmentsPerDay: [1, 30], maxMutationsPerDay: [10, 1000], maxCyclesPerDevice: [30, 1000] };
  if (!exact(policy, Object.keys(limits))) throw new Error('Explicit retention and enrollment policy required');
  for (const [key, [min, max]] of Object.entries(limits)) if (!integer(policy[key]) || policy[key] < min || policy[key] > max) throw new Error('Invalid policy');
  return policy;
}

export function validateSubscription(value) {
  if (!exact(value, ['endpoint', 'keys']) || !exact(value.keys, ['p256dh', 'auth'])) deny(400, 'subscription');
  let url;
  try { url = new URL(value.endpoint); } catch { deny(400, 'endpoint'); }
  // Apple-only production egress. No suffix lookalikes, custom port, userinfo, IP or redirect.
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search ||
      !/^(?:[a-z0-9-]+\.)*push\.apple\.com$/.test(url.hostname) || url.pathname === '/' || value.endpoint.length > 2048) deny(400, 'endpoint');
  if (typeof value.keys.p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(value.keys.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(value.keys.auth)) deny(400, 'subscription');
  try { ECDH.convertKey(Buffer.from(value.keys.p256dh, 'base64url'), 'prime256v1'); } catch { deny(400, 'subscription'); }
  return structuredClone(value);
}

export function createService({ store, scope, origin, publicKey, policy, clock = Date.now }) {
  validatePolicy(policy);
  if (!opaque(scope) || new URL(origin).origin !== origin) throw new Error('Invalid scope/origin');
  const now = () => clock();
  const day = () => Math.floor(now() / 86_400_000);
  function check(state) {
    if (state?.format !== 1 || state.scope !== scope || state.origin !== origin || state.closed) deny(410, 'scope-closed');
  }
  function authenticate(state, authorization) {
    const match = /^Bearer ([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(authorization ?? '');
    const device = match && state.devices[match[1]];
    if (!device || !equal(device.verifier, hash(match[2])) || device.lastSeen + policy.inactivityDays * 86_400_000 <= now()) deny(401, 'device-auth');
    return { id: match[1], device };
  }
  function prune(state) {
    for (const device of Object.values(state.devices)) {
      if (device.lastSeen + policy.inactivityDays * 86_400_000 <= now()) {
        device.verifier = null; device.subscription = null; device.intent = null; device.cycles = {}; device.lastRequest = null;
      }
      if (device.intent && terminal.has(device.intent.status) && device.intent.updatedAt + policy.terminalHours * 3_600_000 <= now()) device.intent = null;
    }
    for (const [id, invitation] of Object.entries(state.invitations)) if (invitation.expires <= now()) delete state.invitations[id];
  }
  async function transaction(change, create = false) {
    // A timeout can mean committed PUT. Every retry re-reads and change checks its durable operation receipt.
    for (let attempt = 0; attempt < 6; attempt++) {
      const loaded = await store.get();
      if (!loaded && !create) deny(410, 'scope-closed');
      const state = loaded ? structuredClone(loaded.state) : null;
      if (state) check(state);
      const result = change(state);
      if (!result.write) return result.value;
      result.state.revision = (state?.revision ?? 0) + 1;
      result.state.nonce = randomUUID();
      try { await store.put(result.state, loaded?.etag); return result.value; }
      catch (error) {
        if (error instanceof StorageFailure && ![404, 409, 412].includes(error.status)) throw error;
        if (attempt === 5) deny(503, 'state-conflict');
      }
    }
  }
  const summary = (state, id) => {
    const device = state.devices[id];
    return { scope, device: id, revision: device.revision, role: device.role, enrolled: !!device.subscription, retired: device.retired === true,
      status: device.intent?.status ?? 'idle', publicKey, policy, origin,
      devices: device.role === 'owner' ? Object.entries(state.devices).filter(([, d]) => d.verifier).map(([device, d]) => ({ device, role: d.role, enrolled: !!d.subscription })) : [] };
  };
  async function status(authorization) {
    const loaded = await store.get(); if (!loaded) deny(410, 'scope-closed');
    check(loaded.state); const { id } = authenticate(loaded.state, authorization);
    return summary(loaded.state, id);
  }
  async function redeem(body) {
    if (!exact(body, ['invitation', 'device', 'credential', 'request']) || !opaque(body.invitation) || !opaque(body.credential) || !uuid(body.device) || !uuid(body.request)) deny(400, 'enrollment');
    return transaction(state => {
      const previous = state.devices[body.device];
      if (previous?.enrollmentRequest === body.request && equal(previous.verifier, hash(body.credential))) return { write: false, value: summary(state, body.device) };
      if (previous) deny(409, 'device-exists');
      prune(state);
      const invitation = state.invitations[hash(body.invitation)];
      if (!invitation || invitation.expires <= now()) deny(403, 'invitation');
      if (Object.values(state.devices).filter(d => d.verifier).length >= policy.maxDevices) deny(429, 'device-limit');
      if (state.enrollmentDay !== day()) { state.enrollmentDay = day(); state.enrollments = 0; }
      if (state.enrollments >= policy.maxEnrollmentsPerDay) deny(429, 'enrollment-limit');
      delete state.invitations[hash(body.invitation)]; state.enrollments++;
      state.devices[body.device] = { role: invitation.role, verifier: hash(body.credential), enrollmentRequest: body.request,
        revision: 0, lastSeen: now(), subscription: null, retired: false, intent: null, cycles: {}, lastRequest: null, mutationDay: day(), mutations: 0 };
      return { write: true, state, value: summary(state, body.device) };
    });
  }
  async function mutate(authorization, body) {
    if (!exact(body, ['request', 'revision', 'action', 'value']) || !uuid(body.request) || !integer(body.revision)) deny(400, 'request');
    const fingerprint = hash(JSON.stringify(body));
    return transaction(state => {
      const { id, device } = authenticate(state, authorization);
      if (device.lastRequest?.id === body.request) {
        if (device.lastRequest.fingerprint !== fingerprint) deny(409, 'request-reuse');
        return { write: false, value: device.lastRequest.response };
      }
      if (device.revision !== body.revision) deny(409, 'old-version');
      if (device.mutationDay !== day()) { device.mutationDay = day(); device.mutations = 0; }
      if (++device.mutations > policy.maxMutationsPerDay) deny(429, 'mutation-limit');
      prune(state);
      if (body.action === 'subscribe') {
        const subscription = validateSubscription(body.value);
        if (Object.entries(state.devices).some(([other, d]) => other !== id && d.subscription?.endpoint === subscription.endpoint)) deny(409, 'recipient-in-use');
        device.subscription = subscription; device.retired = false;
        if (device.intent && !terminal.has(device.intent.status)) device.intent.status = 'cancelled';
      } else if (body.action === 'plan') {
        const value = body.value;
        if (value === null) {
          if (device.intent && !terminal.has(device.intent.status)) { device.intent.status = 'cancelled'; device.intent.updatedAt = now(); }
        } else {
          if (!exact(value, ['cycle', 'revision', 'due', 'expiry', 'blocked']) || !digest(value.cycle) || !digest(value.revision) || typeof value.blocked !== 'boolean' ||
              !integer(value.due) || !integer(value.expiry) || value.expiry <= value.due || value.expiry > value.due + 600_000 || value.due > now() + 86_400_000) deny(400, 'plan');
          if (!device.subscription) deny(409, 'not-subscribed');
          const old = device.intent;
          if (old && old.cycle !== value.cycle && !terminal.has(old.status)) old.status = 'cancelled';
          if (!(value.cycle in device.cycles) && Object.keys(device.cycles).length >= policy.maxCyclesPerDevice) deny(429, 'cycle-limit-reenroll');
          if (value.blocked || value.due <= now()) device.cycles[value.cycle] = true;
          if (!device.cycles[value.cycle]) device.intent = { ...value, status: 'pending', attempt: null, attempts: 0, nextAt: value.due, updatedAt: now() };
          else if (old?.cycle === value.cycle && !terminal.has(old.status)) { old.status = 'cancelled'; old.updatedAt = now(); }
        }
      } else if (body.action === 'invite') {
        if (device.role !== 'owner') deny(403, 'owner-only');
        if (!opaque(body.value)) deny(400, 'invitation');
        if (Object.keys(state.invitations).length >= policy.maxDevices) deny(429, 'invitation-limit');
        state.invitations[hash(body.value)] = { role: 'member', expires: now() + policy.inviteSeconds * 1000 };
      } else if (body.action === 'revoke') {
        if (!uuid(body.value) || (body.value !== id && device.role !== 'owner')) deny(403, 'recipient');
        const target = state.devices[body.value]; if (!target) deny(404, 'recipient');
        // The final owner can revoke itself; recovery then requires the protected operator function.
        target.verifier = null; target.subscription = null; target.intent = null; target.cycles = {}; target.lastRequest = null;
      } else if (body.action === 'disable') {
        if (body.value !== null) deny(400, 'request');
        device.subscription = null;
        if (device.intent && !terminal.has(device.intent.status)) { device.intent.status = 'cancelled'; device.intent.updatedAt = now(); }
      } else if (body.action === 'close') {
        if (device.role !== 'owner' || body.value !== null) deny(403, 'owner-only');
        state.closed = true; state.devices = {}; state.invitations = {};
        return { write: true, state, value: { closed: true } };
      } else deny(400, 'action');
      device.lastSeen = now(); device.revision++;
      const response = summary(state, id);
      device.lastRequest = { id: body.request, fingerprint, response };
      return { write: true, state, value: response };
    });
  }
  async function operator(body) {
    // Only the separate IAM-private handler calls this. No public request can select it.
    if (!exact(body, ['action', 'invitationHash', 'request']) || !['bootstrap', 'recover'].includes(body.action) || !digest(body.invitationHash) || !uuid(body.request)) deny(400, 'operator-request');
    return transaction(state => {
      if (state?.operatorRequest === body.request) return { write: false, value: { ready: true } };
      if (body.action === 'bootstrap' && state) deny(409, 'already-bootstrapped');
      if (body.action === 'recover' && !state) deny(410, 'scope-closed');
      const next = state ?? { format: 1, scope, origin, closed: false, revision: 0 };
      next.devices = {}; next.invitations = { [body.invitationHash]: { role: 'owner', expires: now() + policy.inviteSeconds * 1000 } };
      next.operatorRequest = body.request; next.enrollmentDay = day(); next.enrollments = 0;
      return { write: true, state: next, value: { ready: true } };
    }, body.action === 'bootstrap');
  }
  async function dispatch(send) {
    const loaded = await store.get();
    if (!loaded) return { processed: 0 };
    check(loaded.state);
    const candidates = Object.keys(loaded.state.devices).filter(id => {
      const device = loaded.state.devices[id], intent = device.intent;
      if (!intent) return false;
      if (intent.status === 'authorized') return true;
      if (terminal.has(intent.status)) return intent.updatedAt + policy.terminalHours * 3_600_000 <= now();
      return !device.verifier || !device.subscription || device.lastSeen + policy.inactivityDays * 86_400_000 <= now() ||
        intent.expiry <= now() || intent.due <= now() && intent.nextAt <= now() && (intent.status !== 'leased' || intent.leaseUntil <= now());
    }).slice(0, 10);
    let processed = 0;
    for (const id of candidates) {
      const token = randomUUID();
      const claim = await transaction(state => {
        const device = state.devices[id], intent = device?.intent;
        if (!intent) return { write: false, value: null };
        if (intent.status === 'authorized') { // Previous invocation may have submitted. Never automatically resend.
          intent.status = 'unknown'; intent.updatedAt = now();
          return { write: true, state, value: null };
        }
        if (terminal.has(intent.status)) {
          if (intent.updatedAt + policy.terminalHours * 3_600_000 > now()) return { write: false, value: null };
          device.intent = null; return { write: true, state, value: null };
        }
        if (!device.verifier || !device.subscription || device.lastSeen + policy.inactivityDays * 86_400_000 <= now() || intent.expiry <= now()) {
          intent.status = 'expired'; intent.updatedAt = now(); device.cycles[intent.cycle] = true;
          if (device.lastSeen + policy.inactivityDays * 86_400_000 <= now()) {
            device.verifier = null; device.subscription = null; device.intent = null; device.cycles = {}; device.lastRequest = null;
          }
          return { write: true, state, value: null };
        }
        if (intent.due > now() || intent.nextAt > now() || (intent.status === 'leased' && intent.leaseUntil > now())) return { write: false, value: null };
        intent.status = 'leased'; intent.attempt = token; intent.leaseUntil = now() + 15_000; intent.updatedAt = now();
        return { write: true, state, value: { cycle: intent.cycle, revision: intent.revision } };
      });
      if (!claim) continue;
      const authorization = await transaction(state => {
        const device = state.devices[id], intent = device?.intent;
        if (!device?.verifier || !device.subscription || device.lastSeen + policy.inactivityDays * 86_400_000 <= now() || !intent || intent.status !== 'leased' || intent.attempt !== token || intent.leaseUntil <= now() || intent.expiry <= now() || intent.cycle !== claim.cycle || intent.revision !== claim.revision || device.cycles[intent.cycle]) return { write: false, value: null };
        intent.status = 'authorized'; intent.attempts++; intent.updatedAt = now(); device.cycles[intent.cycle] = true;
        return { write: true, state, value: { subscription: structuredClone(device.subscription), cycle: intent.cycle, expiry: intent.expiry } };
      });
      if (!authorization) continue;
      let outcome;
      try { outcome = await send(authorization); } catch { outcome = { status: 'unknown' }; }
      await transaction(state => {
        const device = state.devices[id], intent = device?.intent;
        if (!intent || intent.attempt !== token || !['authorized', 'unknown'].includes(intent.status)) return { write: false, value: null };
        intent.status = outcome.status; intent.updatedAt = now();
        if (outcome.status === 'retry' && intent.attempts < 3 && now() + 60_000 < intent.expiry && device.verifier && device.subscription) {
          intent.status = 'pending'; intent.nextAt = now() + 60_000; delete device.cycles[intent.cycle];
        } else if (outcome.status === 'retry') intent.status = 'permanent';
        if (outcome.gone) { device.subscription = null; device.retired = true; intent.status = 'permanent'; }
        return { write: true, state, value: null };
      });
      processed++;
    }
    // Retention runs daily, not an unconditional PUT on each idle minute.
    if (loaded.state.purgeDay !== day()) await transaction(state => {
      if (state.purgeDay === day()) return { write: false, value: null };
      prune(state); state.purgeDay = day(); return { write: true, state, value: null };
    });
    return { processed };
  }
  return { status, redeem, mutate, operator, dispatch };
}
