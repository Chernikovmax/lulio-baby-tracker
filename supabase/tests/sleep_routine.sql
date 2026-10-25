-- Run with psql -v ON_ERROR_STOP=1 after all three migrations in an isolated Supabase-compatible database.
-- No live service is required or authorized by this file; synthetic changes are rolled back.
begin;
insert into auth.users (id) values ('20000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select public.join_tracker_family('33333333-3333-4333-8333-333333333333');
do $$
declare
  family uuid := '33333333-3333-4333-8333-333333333333';
  device text := '20000000-0000-4000-8000-000000000001';
  routine jsonb := '{"version":1,"timeZone":"Europe/Moscow","nightStartFrom":"23:00","nightStartTo":"01:00","daytimeNaps":3,"dayPreparationMinutes":10,"nightPreparationMinutes":20,"assistantEnabled":false}';
  entry jsonb;
  reply jsonb;
  invalid jsonb;
  registers jsonb;
  denied boolean;
begin
  entry := jsonb_build_object('revision', 10, 'device', device, 'value', routine);
  reply := public.exchange_tracker_family(family, 0, jsonb_build_object('sleepRoutine', entry));
  assert reply = jsonb_build_object('version', 1, 'entries', jsonb_build_object('sleepRoutine', entry)),
    'midnight-crossing routine must replicate unchanged';
  reply := public.exchange_tracker_family(family, 0, jsonb_build_object('sleepRoutine', entry));
  assert (reply->>'version')::bigint = 1, 'routine retry must be idempotent';
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    routine || '{"timeZone":"Europe/Imaginary"}', routine || '{"nightStartTo":"23:00"}',
    routine || '{"daytimeNaps":1.5}', routine || '{"dayPreparationMinutes":-1}',
    routine || '{"nightPreparationMinutes":181}', routine || '{"assistantEnabled":null}',
    routine || '{"deviceReminderSettings":{"enabled":true}}', 'false'::jsonb
  )) loop
    denied := false;
    begin
      perform public.exchange_tracker_family(family, 1, jsonb_build_object('sleepRoutine',
        jsonb_build_object('revision', 20, 'device', device, 'value', invalid)));
    exception when others then
      if sqlerrm <> 'Invalid routine' then raise; end if;
      denied := true;
    end;
    assert denied, 'invalid routine/device data must be rejected';
    reply := public.exchange_tracker_family(family, 1, '{}'::jsonb);
    assert reply = '{"version":1,"entries":{}}'::jsonb, 'rejection must not advance the cursor';
  end loop;
  reply := public.exchange_tracker_family(family, 1, jsonb_build_object('sleepRoutine',
    jsonb_build_object('revision', 30, 'device', device, 'value', null)));
  assert reply->'entries'->'sleepRoutine'->'value' = 'null'::jsonb, 'reset must create a durable tombstone';
  reply := public.exchange_tracker_family(family, 0, jsonb_build_object('sleepRoutine', entry));
  assert reply->'entries'->'sleepRoutine'->'value' = 'null'::jsonb, 'stale routine must not resurrect';
  -- Equal-revision routine conflicts use exactly the same UUID ordering as timers/events.
  entry := jsonb_build_object('revision', 30, 'device', 'ffffffff-ffff-4fff-bfff-ffffffffffff',
    'value', routine || '{"timeZone":"UTC","assistantEnabled":true}');
  reply := public.exchange_tracker_family(family, 2, jsonb_build_object('sleepRoutine', entry));
  assert reply = jsonb_build_object('version', 3, 'entries', jsonb_build_object('sleepRoutine', entry)),
    'the greater UUID must win an equal-revision routine conflict';
  reply := public.exchange_tracker_family(family, 3, jsonb_build_object('sleepRoutine',
    jsonb_build_object('revision', 30, 'device', device, 'value', null)));
  assert reply = '{"version":3,"entries":{}}'::jsonb, 'a losing routine edit must not advance the cursor';

  -- The unchanged RPC accepts a durable outbox of mixed registers in one server version.
  registers := jsonb_build_object(
    'sleepRoutine', jsonb_build_object('revision', 40, 'device', device, 'value', routine),
    'event:synthetic', jsonb_build_object('revision', 40, 'device', device, 'value',
      jsonb_build_object('id', 'synthetic', 'type', 'sleep', 'startTime', '2026-10-24T10:00:00Z',
        'endTime', '2026-10-24T11:00:00Z', 'updatedAt', '2026-10-24T11:00:00Z', 'isNightSleep', false)),
    'sleepTimer', jsonb_build_object('revision', 40, 'device', device, 'value',
      jsonb_build_object('startedAt', '2026-10-24T12:00:00Z', 'isNightSleep', false)));
  reply := public.exchange_tracker_family(family, 3, registers);
  assert reply = jsonb_build_object('version', 4, 'entries', registers),
    'routine, completed event and next active timer must share one atomic delta';
  reply := public.exchange_tracker_family(family, 3, registers);
  assert reply = jsonb_build_object('version', 4, 'entries', registers),
    'replayed mixed outbox after a lost response must remain idempotent';
  reply := public.exchange_tracker_family(family, 4, '{}'::jsonb);
  assert reply = '{"version":4,"entries":{}}'::jsonb, 'acknowledged cursor must return no redundant history';

  denied := false;
  begin
    perform public.exchange_tracker_family(family, 4, jsonb_build_object(
      'event:synthetic', jsonb_build_object('revision', 50, 'device', device, 'value', null),
      'sleepRoutine', jsonb_build_object('revision', 50, 'device', device,
        'value', routine || '{"pushSubscription":{"synthetic":true}}')));
  exception when others then
    if sqlerrm <> 'Invalid routine' then raise; end if;
    denied := true;
  end;
  assert denied, 'device subscription material must reject the entire mixed outbox';
  reply := public.exchange_tracker_family(family, 0, '{}'::jsonb);
  assert reply = jsonb_build_object('version', 4, 'entries', registers),
    'failed routine validation must roll back earlier event writes and preserve the timer';

  reply := public.exchange_tracker_family(family, 4, jsonb_build_object('sleepRoutine',
    jsonb_build_object('revision', 60, 'device', device, 'value', null)));
  assert reply->'entries' = jsonb_build_object('sleepRoutine',
    jsonb_build_object('revision', 60, 'device', device, 'value', null)),
    'routine reset must not return or mutate unrelated events and timers';
  reply := public.exchange_tracker_family(family, 0, '{}'::jsonb);
  assert reply->'entries'->'event:synthetic' = registers->'event:synthetic'
    and reply->'entries'->'sleepTimer' = registers->'sleepTimer', 'routine reset must preserve diary state';

  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
  denied := false;
  begin
    perform public.exchange_tracker_family(family, 0, jsonb_build_object('sleepRoutine', entry));
  exception when others then
    if sqlerrm <> 'Family membership required' then raise; end if;
    denied := true;
  end;
  assert denied, 'a non-member must not read or alter a routine';
  assert not exists (select 1 from public.tracker_families where family_id = family),
    'RLS must hide routine-family metadata from a non-member';
  perform set_config('request.jwt.claim.sub', '', true);
  denied := false;
  begin
    perform public.exchange_tracker_family(family, 0, '{}'::jsonb);
  exception when others then
    if sqlerrm <> 'Family membership required' then raise; end if;
    denied := true;
  end;
  assert denied, 'a missing authenticated identity must not access a routine';
  raise notice 'ROUTINE_SQL_OK';
end;
$$;
rollback;
