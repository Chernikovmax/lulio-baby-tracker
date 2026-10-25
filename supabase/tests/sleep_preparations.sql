-- Isolated database only. Synthetic users/data roll back.
begin;
insert into auth.users(id) values ('70000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
select public.join_tracker_family('77777777-7777-4777-8777-777777777777');
do $$
declare
  family uuid := '77777777-7777-4777-8777-777777777777';
  device text := '70000000-0000-4000-8000-000000000001';
  id text := '88888888-8888-5888-8888-888888888888';
  prep jsonb := '{"id":"88888888-8888-5888-8888-888888888888","scope":"synthetic","anchorId":"wake:11111111-1111-4111-8111-111111111111","anchorAt":"2026-10-24T08:00:00Z","anchorRevision":"wake-content","preparationId":"99999999-9999-4999-8999-999999999999","startedAt":"2026-10-24T09:00:00Z","state":"preparing","sleepEventId":null,"completedAt":null}';
  suppression jsonb;
  entries jsonb;
  reply jsonb;
  bad jsonb;
  denied boolean;
begin
  suppression := (prep - array['preparationId','startedAt','state','sleepEventId','completedAt']) || '{"suppressedAt":"2026-10-24T09:00:00Z"}';
  entries := jsonb_build_object('preparation:'||id, jsonb_build_object('revision',10,'device',device,'value',prep),
    'suppression:'||id,jsonb_build_object('revision',10,'device',device,'value',suppression));
  reply := public.exchange_tracker_family(family,0,entries);
  assert reply = jsonb_build_object('version',1,'entries',entries), 'preparation/suppression atomic exchange';
  assert public.exchange_tracker_family(family,0,entries) = reply, 'idempotent replay';
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    prep || '{"pushSubscription":{}}', prep || '{"startedAt":"2026-02-30T09:00:00Z"}',
    prep || '{"startedAt":"2026-10-24T07:00:00Z"}', prep || '{"state":"unknown"}',
    prep || '{"completedAt":"2026-10-24T09:10:00Z"}', prep || '{"sleepEventId":"other"}',
    prep || '{"state":"completed","sleepEventId":"88888888-8888-5888-8888-888888888888","completedAt":"2026-10-24T08:59:00Z"}',
    prep || '{"anchorRevision":null}', prep || '{"preparationId":"bad"}'
  )) loop
    denied := false;
    begin
      perform public.exchange_tracker_family(family,1,jsonb_build_object('event:preserve',jsonb_build_object('revision',20,'device',device,'value',null),
        'preparation:'||id,jsonb_build_object('revision',20,'device',device,'value',bad)));
    exception when others then if sqlerrm <> 'Invalid assistant fact' then raise; end if; denied := true; end;
    assert denied, 'invalid lifecycle or private data must reject';
    assert public.exchange_tracker_family(family,0,'{}') = reply, 'mixed invalid write must roll back diary and cursor';
  end loop;
  prep := prep || jsonb_build_object('state','completed','sleepEventId',id,'completedAt','2026-10-24T09:10:00Z');
  entries := jsonb_build_object('preparation:'||id,jsonb_build_object('revision',20,'device',device,'value',prep),
    'sleepTimer',jsonb_build_object('revision',20,'device',device,'value',jsonb_build_object('id',id,'startedAt','2026-10-24T09:10:00Z','isNightSleep',false)));
  reply := public.exchange_tracker_family(family,1,entries);
  assert reply->'entries' = entries and reply->>'version' = '2', 'link and sleep timer must share transaction';
  assert public.exchange_tracker_family(family,2,'{}') = '{"version":2,"entries":{}}', 'empty idle delta';
  reply := public.exchange_tracker_family(family,2,jsonb_build_object('preparation:'||id,jsonb_build_object('revision',30,'device',device,'value',null),
    'suppression:'||id,jsonb_build_object('revision',30,'device',device,'value',null)));
  reply := public.exchange_tracker_family(family,0,entries);
  assert reply->'entries'->('preparation:'||id)->'value' = 'null'::jsonb and reply->'entries'->('suppression:'||id)->'value' = 'null'::jsonb, 'retained tombstones defeat stale packets';
  perform set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
  denied := false;
  begin perform public.exchange_tracker_family(family,0,entries);
  exception when others then if sqlerrm <> 'Family membership required' then raise; end if; denied := true; end;
  assert denied, 'nonmember denied';
  raise notice 'PREPARATIONS_SQL_OK';
end;
$$;
rollback;
