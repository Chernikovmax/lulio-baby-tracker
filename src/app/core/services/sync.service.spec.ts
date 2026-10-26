import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import { SyncService } from './sync.service';
import type { SyncEntry, SyncResponse } from '../models/sync.models';
// Resolve the lazy client mock before fake-timer settling; module loading uses real I/O.
import '@supabase/supabase-js';

let client: unknown;
let created = 0;
vi.mock('@supabase/supabase-js', () => ({ createClient: () => { created++; return client; } }));

const familyId = '11111111-1111-4111-8111-111111111111';
const config = { enabled: true, url: 'https://example.supabase.co', anonKey: 'synthetic-public-key', familyId };
const bottle = { id: 'bottle', type: 'bottle' as const, content: 'formula' as const, volumeMl: 90,
  startTime: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
interface ExchangeArgs { target_family: string; since_version: number; incoming: Record<string, SyncEntry> }

describe('Экономный обмен Supabase', () => {
  let storage: StorageService;
  let sync: SyncService;
  let visible: boolean;
  let response: SyncResponse;
  let failExchange: boolean;
  let failJoin: boolean;
  let disposed: number;
  let notify: (payload: { new: { version: number } }) => void;
  let calls: ExchangeArgs[];

  beforeEach(async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    await Preferences.remove({ key: 'baby-tracker.v1' });
    await Preferences.remove({ key: 'baby-tracker.sync.v1' });
    await Preferences.remove({ key: 'baby-tracker.yandex.v1' });
    visible = true; failExchange = false; failJoin = false; response = { version: 1, entries: {} }; calls = [];
    created = 0; disposed = 0;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
    const channel = {
      on: (_event: string, _filter: unknown, callback: typeof notify) => { notify = callback; return channel; },
      subscribe: () => channel,
    };
    client = {
      auth: { getSession: async () => ({ data: { session: {} }, error: null }), dispose: async () => { disposed++; } },
      channel: () => channel,
      removeChannel: async () => 'ok',
      rpc: async (name: string, args: ExchangeArgs) => {
        if (name === 'join_tracker_family') return { data: null, error: failJoin ? new Error('offline') : null };
        if (name !== 'exchange_tracker_family') throw new Error(`Unexpected RPC: ${name}`);
        calls.push(structuredClone(args));
        return failExchange ? { data: null, error: new Error('offline') } : { data: structuredClone(response), error: null };
      },
    };
    storage = TestBed.inject(StorageService);
    await storage.ready();
    sync = TestBed.inject(SyncService);
    await sync.ready();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.useRealTimers(); });

  async function settle() {
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    await storage.whenIdle();
  }
  async function connect() {
    await sync.saveConfig(config); await settle();
    // Dynamic module loading may finish after the zero-time timer turns above.
    // Await the durable consumer-visible exchange result, not a fixed turn count.
    await vi.waitFor(() => {
      if (failJoin) expect(sync.error()).not.toBeNull();
      else expect(storage.supabaseCheckpoint()?.version).toBe(response.version);
    });
  }

  it('получает общий режим через RPC и отправляет последующее изменение, не копируя локальный профиль', async () => {
    const routine = { version: 1, timeZone: 'Europe/Moscow', nightStartFrom: '23:00', nightStartTo: '01:00',
      daytimeNaps: 3, dayPreparationMinutes: 10, nightPreparationMinutes: 20, assistantEnabled: false };
    const profile = { id: 'local', name: 'Synthetic', birthDate: '2026-06-01', dueDate: '2026-06-01', gender: 'boy' as const };
    await storage.saveProfile(profile);
    response = { version: 1, entries: { sleepRoutine: {
      revision: Date.now() + 1000, device: 'ffffffff-ffff-4fff-bfff-ffffffffffff', value: routine,
    } } };
    await connect();
    expect(storage.sleepRoutine()).toEqual(routine);
    expect(storage.profile()).toEqual(profile);
    expect(calls[0].incoming).not.toHaveProperty('profile');
    calls = [];
    await storage.saveSleepRoutine({ ...routine, version: 1, timeZone: 'Asia/Yekaterinburg', assistantEnabled: true });
    await settle();
    expect(calls[0].incoming['sleepRoutine'].value).toEqual({ ...routine, timeZone: 'Asia/Yekaterinburg', assistantEnabled: true });
    expect(Object.keys(calls[0].incoming)).toEqual(['sleepRoutine']);
    expect(storage.sleepRoutine()?.timeZone).toBe('Asia/Yekaterinburg');
    expect(storage.supabaseCheckpoint()!.pending).toEqual({});
  });

  it('получает подтверждённое пробуждение через RPC, отправляет правку и удаление без полного дневника', async () => {
    const wake = { id: '22222222-2222-4222-8222-222222222222', at: '2026-01-01T10:00:00Z' };
    response = { version: 1, entries: { [`wake:${wake.id}`]: {
      revision: Date.now() + 1000, device: 'ffffffff-ffff-4fff-bfff-ffffffffffff', value: wake,
    } } };
    await connect();
    expect(storage.confirmedWakes()).toEqual([wake]);
    calls = [];
    await storage.saveConfirmedWake({ ...wake, at: '2026-01-01T11:00:00Z' }); await settle();
    expect(calls[0].incoming).toMatchObject({ [`wake:${wake.id}`]: { value: { ...wake, at: '2026-01-01T11:00:00Z' } } });
    expect(storage.confirmedWakes()).toEqual([{ ...wake, at: '2026-01-01T11:00:00Z' }]);
    calls = [];
    await storage.deleteConfirmedWake(wake.id); await settle();
    expect(calls[0].incoming[`wake:${wake.id}`].value).toBeNull();
    expect(storage.confirmedWakes()).toEqual([]);
    expect(storage.supabaseCheckpoint()!.pending).toEqual({});
  });

  it('receives shared preparation and sends its cancellation as a durable delta through the existing RPC', async () => {
    const id = '88888888-8888-5888-8888-888888888888';
    const wake = { id: '22222222-2222-4222-8222-222222222222', at: '2026-01-01T10:00:00Z' };
    await connect();
    const prep = { id, scope: storage.syncDocument()!.scope, anchorId: `wake:${wake.id}`, anchorAt: wake.at,
      anchorRevision: JSON.stringify(wake), preparationId: '33333333-3333-4333-8333-333333333333', startedAt: '2026-01-01T11:00:00Z',
      state: 'preparing', sleepEventId: null, completedAt: null };
    const revision = Date.now() + 1000, device = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    response = { version: 2, entries: { [`wake:${wake.id}`]: { revision, device, value: wake },
      [`preparation:${id}`]: { revision, device, value: prep }, sleepRoutine: { revision, device, value: {
        version: 1, timeZone: 'UTC', nightStartFrom: '20:00', nightStartTo: '21:00', daytimeNaps: 3,
        dayPreparationMinutes: 10, nightPreparationMinutes: 20, assistantEnabled: true } } } };
    notify({ new: { version: 2 } }); await settle();
    expect(storage.sleepPreparations()).toEqual([prep]); expect(storage.activeTimers().sleepTimer).toBeNull();
    calls = []; await storage.cancelSleepPreparation(id); await settle();
    expect(calls[0].incoming[`preparation:${id}`].value).toMatchObject({ state: 'cancelled', sleepEventId: null });
    expect(storage.supabaseCheckpoint()!.pending).toEqual({});
  });

  it('после первоначальной публикации отправляет одну правку, а не накопленную историю', async () => {
    await storage.update(data => ({ ...data, events: Array.from({ length: 1000 }, (_, index) => ({ ...bottle, id: `old-${index}` })) }));
    await connect();
    expect(JSON.stringify(calls[0].incoming).length).toBeGreaterThan(200_000);
    expect(storage.supabaseCheckpoint()!.pending).toEqual({});
    calls = [];
    await storage.saveEvent(bottle);
    await settle();
    expect(Object.keys(calls[0].incoming)).toEqual(['event:bottle']);
    expect(JSON.stringify(calls[0].incoming).length).toBeLessThan(1024);
    calls = [];
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(calls).toEqual([{ target_family: familyId, since_version: 1, incoming: {} }]);
  });

  it('не обменивается в скрытом приложении и догоняет пропущенное при возвращении', async () => {
    await connect();
    visible = false;
    document.dispatchEvent(new Event('visibilitychange'));
    calls = [];
    await storage.saveEvent(bottle);
    response = { version: 2, entries: { sleepTimer: { revision: Date.now() + 1000,
      device: 'ffffffff-ffff-4fff-bfff-ffffffffffff', value: { startedAt: bottle.startTime, isNightSleep: true } } } };
    notify({ new: { version: 2 } });
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(calls).toEqual([]);
    expect(storage.supabaseCheckpoint()!.pending['event:bottle'].value).toEqual(bottle);
    visible = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(calls[0].since_version).toBe(1);
    expect(calls[0].incoming['event:bottle'].value).toEqual(bottle);
    expect(storage.activeTimers().sleepTimer).toEqual({ startedAt: bottle.startTime, isNightSleep: true });
    expect(storage.supabaseCheckpoint()!.pending).toEqual({});
    calls = [];
    notify({ new: { version: 2 } });
    await settle();
    expect(calls).toEqual([]);
  });

  it('после сетевой ошибки сохраняет дельту и повторяет её с прежним курсором', async () => {
    await connect();
    failExchange = true;
    await storage.saveEvent(bottle);
    await settle();
    expect(sync.error()).not.toBeNull();
    expect(storage.supabaseCheckpoint()!.version).toBe(1);
    expect(storage.supabaseCheckpoint()!.pending['event:bottle'].value).toEqual(bottle);
    failExchange = false;
    calls = [];
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(calls[0].since_version).toBe(1);
    expect(calls[0].incoming['event:bottle'].value).toEqual(bottle);
    expect(storage.supabaseCheckpoint()!.pending).toEqual({});
    expect(sync.error()).toBeNull();
  });

  it('освобождает клиента Supabase после каждой неудачной попытки подключения', async () => {
    failJoin = true;
    await connect();
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(created).toBeGreaterThan(1);
    expect(disposed).toBe(created);
  });
});
