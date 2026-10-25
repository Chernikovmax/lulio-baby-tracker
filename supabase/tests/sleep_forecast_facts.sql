-- Run in an isolated migrated database with psql -v ON_ERROR_STOP=1. All synthetic rows roll back.
begin;
insert into auth.users(id) values ('40000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select public.join_tracker_family('44444444-4444-4444-8444-444444444444');
do $$
declare
  family uuid := '44444444-4444-4444-8444-444444444444';
  device text := '40000000-0000-4000-8000-000000000001';
  wake_key text := 'wake:55555555-5555-4555-8555-555555555555';
  assertion_key text := 'assertion:66666666-6666-4666-8666-666666666666';
  wake jsonb := '{"id":"55555555-5555-4555-8555-555555555555","at":"2026-01-01T10:00:00Z"}';
  assertion jsonb := '{"id":"66666666-6666-4666-8666-666666666666","startAt":"2026-01-01T06:00:00Z","endAt":"2026-01-01T08:00:00Z","status":"complete","boundaries":[{"sleepId":"night","revision":"content-one"},{"sleepId":"nap","revision":"content-two"}]}';
  registers jsonb;
  reply jsonb;
  invalid jsonb;
  denied boolean;
  cursor_version bigint;
begin
  registers := jsonb_build_object(wake_key, jsonb_build_object('revision', 10, 'device', device, 'value', wake),
    assertion_key, jsonb_build_object('revision', 10, 'device', device, 'value', assertion),
    'event:night', jsonb_build_object('revision', 10, 'device', device, 'value', jsonb_build_object('id','night','type','sleep',
      'startTime','2026-01-01T00:00:00Z','endTime','2026-01-01T06:00:00Z','updatedAt','2026-01-01T06:00:00Z','isNightSleep',true)));
  reply := public.exchange_tracker_family(family, 0, registers);
  assert reply = jsonb_build_object('version', 1, 'entries', registers), 'facts and diary must commit atomically';
  assert public.exchange_tracker_family(family, 0, registers) = reply, 'retry must not create another revision';
  assert public.exchange_tracker_family(family, 1, '{}') = '{"version":1,"entries":{}}', 'idle delta must stay empty';
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    wake || '{"at":"2026-02-30T10:00:00Z"}', wake || '{"at":"2026-01-01T10:00:00+00:00"}',
    wake || '{"id":"different"}', wake || '{"pushSubscription":{}}', 'false'::jsonb
  )) loop
    denied := false;
    begin
      perform public.exchange_tracker_family(family, 1, jsonb_build_object(wake_key,
        jsonb_build_object('revision', 20, 'device', device, 'value', invalid)));
    exception when others then if sqlerrm <> 'Invalid sleep fact' then raise; end if; denied := true; end;
    assert denied, 'invalid waking/private data must reject';
  end loop;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    assertion || '{"status":"unknown"}', assertion || '{"endAt":"2026-01-01T06:00:00Z"}',
    assertion || '{"boundaries":[]}', assertion || '{"boundaries":[{"sleepId":"night","revision":"one"},{"sleepId":"night","revision":"two"}]}',
    assertion || '{"boundaries":[{"sleepId":"night","revision":1},{"sleepId":"nap","revision":"two"}]}',
    assertion || '{"devicePermission":true}'
  )) loop
    denied := false;
    begin
      perform public.exchange_tracker_family(family, 1, jsonb_build_object('event:night',
        jsonb_build_object('revision', 20, 'device', device, 'value', null), assertion_key,
        jsonb_build_object('revision', 20, 'device', device, 'value', invalid)));
    exception when others then if sqlerrm <> 'Invalid sleep fact' then raise; end if; denied := true; end;
    assert denied, 'invalid assertion must reject entire mixed write';
    assert public.exchange_tracker_family(family, 0, '{}') = reply, 'invalid facts must preserve prior events and cursor';
  end loop;
  reply := public.exchange_tracker_family(family, 1, jsonb_build_object(wake_key,
    jsonb_build_object('revision', 10, 'device', 'ffffffff-ffff-4fff-bfff-ffffffffffff', 'value', wake || '{"at":"2026-01-01T11:00:00Z"}')));
  assert reply->'entries'->wake_key->'value'->>'at' = '2026-01-01T11:00:00Z', 'UUID breaks equal-revision conflict';
  reply := public.exchange_tracker_family(family, 2, jsonb_build_object(wake_key,
    jsonb_build_object('revision', 30, 'device', device, 'value', null), assertion_key,
    jsonb_build_object('revision', 30, 'device', device, 'value', null)));
  assert reply->'entries'->wake_key->'value' = 'null'::jsonb and reply->'entries'->assertion_key->'value' = 'null'::jsonb, 'per-fact tombstones retained';
  reply := public.exchange_tracker_family(family, 0, registers);
  assert reply->'entries'->wake_key->'value' = 'null'::jsonb and reply->'entries'->assertion_key->'value' = 'null'::jsonb, 'stale packets cannot resurrect deleted facts';
  cursor_version := (reply->>'version')::bigint;
  assert cursor_version = 3, 'losing stale writes must not advance cursor';
  perform set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
  denied := false;
  begin perform public.exchange_tracker_family(family, 0, registers);
  exception when others then if sqlerrm <> 'Family membership required' then raise; end if; denied := true; end;
  assert denied, 'nonmember must not read or write facts';
  raise notice 'FORECAST_FACTS_SQL_OK';
end;
$$;
rollback;
