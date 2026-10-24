-- Run with psql -v ON_ERROR_STOP=1 after applying both migrations to an isolated database.
-- Everything, including synthetic auth users and diary entries, is rolled back.
begin;
insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select public.join_tracker_family('22222222-2222-4222-8222-222222222222');

do $$
declare
  family uuid := '22222222-2222-4222-8222-222222222222';
  first_device text := '10000000-0000-4000-8000-000000000001';
  incoming jsonb;
  change jsonb;
  reply jsonb;
  snapshot_bytes integer;
  idle_bytes integer;
  denied boolean;
begin
  select jsonb_object_agg('event:' || n, jsonb_build_object(
    'revision', 10, 'device', first_device,
    'value', jsonb_build_object('id', n::text, 'type', 'bottle', 'content', 'formula', 'volumeMl', 90,
      'startTime', '2026-10-24T10:00:00Z', 'updatedAt', '2026-10-24T10:00:00Z')))
    into incoming from generate_series(1, 1000) n;
  reply := public.exchange_tracker_family(family, 0, incoming);
  assert (reply->>'version')::bigint = 1, 'one transaction must advance the cursor once';
  assert reply->'entries' = incoming, 'first exchange must return the entire snapshot';
  snapshot_bytes := octet_length(reply::text);

  change := jsonb_build_object('event:1', jsonb_build_object('revision', 20, 'device', first_device, 'value', null));
  reply := public.exchange_tracker_family(family, 1, change);
  assert reply = jsonb_build_object('version', 2, 'entries', change), 'a deletion must not download unrelated history';
  -- Retry after a lost response must neither lose the deletion nor produce a new server version.
  reply := public.exchange_tracker_family(family, 1, change);
  assert reply = jsonb_build_object('version', 2, 'entries', change), 'retries must be idempotent';
  reply := public.exchange_tracker_family(family, 2, '{}'::jsonb);
  assert reply = '{"version":2,"entries":{}}'::jsonb, 'idle polls must return only the cursor';
  idle_bytes := octet_length(reply::text);

  -- A stale offline write must not resurrect a tombstone.
  reply := public.exchange_tracker_family(family, 1, jsonb_build_object('event:1', incoming->'event:1'));
  assert reply = jsonb_build_object('version', 2, 'entries', change), 'stale events must not resurrect';
  -- The same revision is resolved by device UUID, independently of arrival order.
  change := jsonb_build_object('sleepTimer', jsonb_build_object('revision', 30,
    'device', 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    'value', jsonb_build_object('startedAt', '2026-10-24T10:00:00Z', 'isNightSleep', true)));
  reply := public.exchange_tracker_family(family, 2, change);
  assert reply = jsonb_build_object('version', 3, 'entries', change), 'timer changes must be incremental';
  reply := public.exchange_tracker_family(family, 2, jsonb_build_object('sleepTimer',
    jsonb_build_object('revision', 30, 'device', first_device, 'value', null)));
  assert reply = jsonb_build_object('version', 3, 'entries', change), 'device tie-break must preserve the winning timer';

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
  perform public.join_tracker_family(family);
  reply := public.exchange_tracker_family(family, 0, '{}'::jsonb);
  assert reply->'entries'->'event:1'->'value' = 'null'::jsonb, 'a new device must receive deletion tombstones';
  assert reply->'entries'->'sleepTimer' = change->'sleepTimer', 'a new device must receive active timers';
  assert (select count(*) from jsonb_object_keys(reply->'entries')) = 1001, 'a new device must receive the whole snapshot';

  -- An offline peer's independent event must coexist with the existing history.
  change := jsonb_build_object('event:peer', jsonb_build_object('revision', 40,
    'device', '10000000-0000-4000-8000-000000000002',
    'value', jsonb_build_object('id', 'peer', 'type', 'diaper', 'state', 'wet',
      'startTime', '2026-10-24T10:05:00Z', 'updatedAt', '2026-10-24T10:05:00Z')));
  reply := public.exchange_tracker_family(family, 3, change);
  assert reply = jsonb_build_object('version', 4, 'entries', change), 'offline additions must be independent';
  perform set_config('request.jwt.claim.sub', first_device, true);
  reply := public.exchange_tracker_family(family, 3, '{}'::jsonb);
  assert reply = jsonb_build_object('version', 4, 'entries', change), 'the other parent must receive the peer delta';
  assert not exists (select 1 from public.tracker_families f where to_jsonb(f) ? 'entries'),
    'Realtime metadata must not expose the diary';

  denied := false;
  begin
    perform public.exchange_tracker_family(family, 999, '{}'::jsonb);
  exception when others then
    if sqlerrm <> 'Invalid sync cursor' then raise; end if;
    denied := true;
  end;
  assert denied, 'an invalid cursor must not acknowledge skipped data';
  denied := false;
  begin
    perform public.exchange_tracker_family(family, 4, '{"event:invalid":{}}'::jsonb);
  exception when others then
    if sqlerrm <> 'Invalid register' then raise; end if;
    denied := true;
  end;
  assert denied, 'malformed writes must be rejected atomically';

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
  assert not exists (select 1 from public.tracker_families where family_id = family), 'RLS must hide other families';
  denied := false;
  begin
    perform public.exchange_tracker_family(family, 0, '{}'::jsonb);
  exception when others then
    if sqlerrm <> 'Family membership required' then raise; end if;
    denied := true;
  end;
  assert denied, 'non-members must not read or write deltas';
  denied := false;
  begin
    perform 1 from public.tracker_family_entries;
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'registers must be accessible only through the membership-checked RPC';
  raise notice 'SYNC_SQL_OK snapshot_bytes=% idle_bytes=%', snapshot_bytes, idle_bytes;
end;
$$;
rollback;
