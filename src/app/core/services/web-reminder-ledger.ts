import { Capacitor } from '@capacitor/core';

export interface WebReminderLedger {
  version: 1;
  api: string;
  device: string;
  credential: string;
  enrollment: { invitation: string; request: string } | null;
  consent: boolean;
  dirty: boolean;
  revoke: boolean;
}
const KEY = 'lulio.web-reminders.device.v1';
export function readWebReminderLedger(): WebReminderLedger | null {
  if (Capacitor.getPlatform() !== 'web') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as WebReminderLedger;
  if (value.version !== 1 || typeof value.api !== 'string' || typeof value.device !== 'string' || typeof value.credential !== 'string' || typeof value.consent !== 'boolean' || typeof value.dirty !== 'boolean' || typeof value.revoke !== 'boolean') throw new Error('Device reminder storage invalid');
  return value;
}
export function writeWebReminderLedger(value: WebReminderLedger | null): void {
  if (Capacitor.getPlatform() !== 'web') throw new Error('Web-only device state');
  if (value) localStorage.setItem(KEY, JSON.stringify(value)); else localStorage.removeItem(KEY);
}
/** Before a diary commit, persist cancellation debt without blocking offline diary use on HTTP. */
export function fenceWebReminderDiary(): void {
  const ledger = readWebReminderLedger();
  if (ledger) writeWebReminderLedger({ ...ledger, dirty: true });
}
