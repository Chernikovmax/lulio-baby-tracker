import webpush from 'web-push';
import https from 'node:https';
import { lookup } from 'node:dns';
import { isIP } from 'node:net';
import { validateSubscription } from './service.mjs';

function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && (b === 0 || b === 168 || b === 88 && c === 99) ||
      a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113);
  }
  // Global unicast only; reject mapped/local/link-local/multicast and special
  // 2001/2002 transition/tunnel space rather than risk an embedded private target.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^200[12]:/i.test(address);
}
function productionTransport(details) {
  return new Promise((resolve, reject) => {
    const request = https.request(details.endpoint, { method: 'POST', headers: details.headers, agent: false,
      lookup(host, options, callback) {
        lookup(host, { ...options, all: true }, (error, addresses) => {
          if (error || !addresses?.length || addresses.some(item => !publicAddress(item.address))) return callback(new Error('Endpoint DNS denied'));
          if (options.all) callback(null, addresses); else callback(null, addresses[0].address, addresses[0].family);
        });
      } }, response => { response.resume(); resolve(response.statusCode); });
    request.setTimeout(5000, () => request.destroy(new Error('Submission outcome unknown')));
    request.once('error', () => reject(new Error('Submission outcome unknown')));
    request.end(details.body);
  });
}

/** Test recipient transport is constructor-injected, never enabled by environment or an API flag. */
export function createPushSender({ vapid, origin, clock = Date.now, transport = productionTransport }) {
  webpush.getVapidHeaders('https://push.apple.com', vapid.subject, vapid.publicKey, vapid.privateKey, 'aes128gcm');
  return async ({ subscription, cycle, expiry }) => {
    validateSubscription(subscription);
    const ttl = Math.floor((expiry - clock()) / 1000);
    if (ttl <= 0) return { status: 'expired' };
    const payload = JSON.stringify({ notification: { title: 'Скоро сон', body: 'Можно начинать спокойную подготовку',
      tag: `lulio-${cycle}`, data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: `${origin}/tabs/tracker` } } } } });
    let details;
    try { details = webpush.generateRequestDetails(subscription, payload, { TTL: Math.min(ttl, 600), urgency: 'normal', contentEncoding: 'aes128gcm', vapidDetails: vapid }); }
    catch { return { status: 'permanent' }; }
    try {
      const status = await transport(details);
      if (status === 201 || status === 202) return { status: 'accepted' };
      if (status === 404 || status === 410) return { status: 'permanent', gone: true };
      // Only a definite HTTP rejection can be retried. Network timeout/crash is unknown.
      return { status: status === 429 || status >= 500 && status <= 599 ? 'retry' : 'permanent' };
    } catch { return { status: 'unknown' }; }
  };
}
