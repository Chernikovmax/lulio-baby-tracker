import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service';
import { SyncService } from './sync.service';
import type { SyncEntry, SyncResponse } from '../models/sync.models';

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
  async function connect() { await sync.saveConfig(config); await settle(); }

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
