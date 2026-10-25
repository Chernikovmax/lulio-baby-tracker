-- Local migration only; apply after 202610240002 and upgrade both family clients.
begin;
create or replace function public.valid_tracker_sleep_fact(register_key text, fact jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  boundary jsonb;
  stamp text;
  from_at timestamptz;
  to_at timestamptz;
begin
  if register_key !~ '^(wake|assertion):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  if fact = 'null'::jsonb then return true; end if;
  if jsonb_typeof(fact) is distinct from 'object' or jsonb_typeof(fact->'id') is distinct from 'string'
    or (fact->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
  if register_key like 'wake:%' then
    if register_key <> 'wake:' || (fact->>'id') or (select count(*) from jsonb_object_keys(fact)) <> 2
      or not (fact ?& array['id', 'at']) then return false; end if;
    stamp := fact->>'at';
    if jsonb_typeof(fact->'at') is distinct from 'string' or stamp !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$' then return false; end if;
    from_at := stamp::timestamptz;
    return true;
  end if;
  if register_key <> 'assertion:' || (fact->>'id') or (select count(*) from jsonb_object_keys(fact)) <> 5
    or not (fact ?& array['id', 'startAt', 'endAt', 'status', 'boundaries'])
    or jsonb_typeof(fact->'status') is distinct from 'string' or fact->>'status' not in ('complete', 'incomplete')
    or jsonb_typeof(fact->'boundaries') is distinct from 'array' then return false; end if;
  if jsonb_array_length(fact->'boundaries') <> 2 then return false; end if;
  foreach stamp in array array[fact->>'startAt', fact->>'endAt'] loop
    if stamp is null or stamp !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$' then return false; end if;
  end loop;
  from_at := (fact->>'startAt')::timestamptz;
  to_at := (fact->>'endAt')::timestamptz;
  if to_at <= from_at then return false; end if;
  for boundary in select value from jsonb_array_elements(fact->'boundaries') loop
    if jsonb_typeof(boundary) is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(boundary)) <> 2 or not (boundary ?& array['sleepId', 'revision'])
      or jsonb_typeof(boundary->'sleepId') is distinct from 'string' or length(boundary->>'sleepId') = 0
      or jsonb_typeof(boundary->'revision') is distinct from 'string' or length(boundary->>'revision') = 0 then return false; end if;
  end loop;
  return fact->'boundaries'->0->>'sleepId' <> fact->'boundaries'->1->>'sleepId';
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;
revoke all on function public.valid_tracker_sleep_fact(text, jsonb) from public, anon, authenticated;

create or replace function public.exchange_tracker_family(target_family uuid, since_version bigint, incoming jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_version bigint;
  next_version bigint;
  item record;
  previous jsonb;
  delta jsonb;
  routine jsonb;
  changed boolean := false;
begin
  if auth.uid() is null or not exists (
    select 1 from public.tracker_family_members where family_id = target_family and user_id = auth.uid()
  ) then raise exception 'Family membership required'; end if;
  if jsonb_typeof(incoming) is distinct from 'object' then raise exception 'Invalid document'; end if;
  select version into strict current_version from public.tracker_families
    where family_id = target_family for update;
  if since_version is null or since_version < 0 or since_version > current_version then
    raise exception 'Invalid sync cursor';
  end if;
  next_version := current_version + 1;
  for item in select key, value from jsonb_each(incoming) loop
    if not (item.key in ('sleepTimer', 'breastTimer', 'sleepRoutine') or item.key like 'event:_%' or item.key like 'wake:_%' or item.key like 'assertion:_%')
      or jsonb_typeof(item.value) is distinct from 'object'
      or jsonb_typeof(item.value->'revision') is distinct from 'number'
      or (item.value->>'revision') !~ '^[0-9]+$'
      or (item.value->>'revision')::numeric > 9007199254740991
      or jsonb_typeof(item.value->'device') is distinct from 'string'
      or (item.value->>'device') !~ '^[0-9a-f-]{36}$'
      or not (item.value ? 'value') then raise exception 'Invalid register';
    end if;
    if item.key = 'sleepRoutine' and item.value->'value' <> 'null'::jsonb then
      routine := item.value->'value';
      if jsonb_typeof(routine) is distinct from 'object' then raise exception 'Invalid routine'; end if;
      -- Exact fields: permissions, subscriptions and device opt-ins are not family data.
      if (select count(*) from jsonb_object_keys(routine)) <> 8
        or not (routine ?& array['version', 'timeZone', 'nightStartFrom', 'nightStartTo',
          'daytimeNaps', 'dayPreparationMinutes', 'nightPreparationMinutes', 'assistantEnabled'])
        or routine->'version' is distinct from '1'::jsonb
        or jsonb_typeof(routine->'assistantEnabled') is distinct from 'boolean'
        or jsonb_typeof(routine->'timeZone') is distinct from 'string'
        or (routine->>'timeZone') !~ '^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+\-]+)+)$'
        or not exists (select 1 from pg_catalog.pg_timezone_names where name = routine->>'timeZone')
        or jsonb_typeof(routine->'nightStartFrom') is distinct from 'string'
        or jsonb_typeof(routine->'nightStartTo') is distinct from 'string'
        or (routine->>'nightStartFrom') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or (routine->>'nightStartTo') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or routine->>'nightStartFrom' = routine->>'nightStartTo'
        or jsonb_typeof(routine->'daytimeNaps') is distinct from 'number'
        or jsonb_typeof(routine->'dayPreparationMinutes') is distinct from 'number'
        or jsonb_typeof(routine->'nightPreparationMinutes') is distinct from 'number'
        or (routine->>'daytimeNaps') !~ '^[0-9]+$'
        or (routine->>'dayPreparationMinutes') !~ '^[0-9]+$'
        or (routine->>'nightPreparationMinutes') !~ '^[0-9]+$' then
        raise exception 'Invalid routine';
      end if;
      if (routine->>'daytimeNaps')::numeric > 12
        or (routine->>'dayPreparationMinutes')::numeric > 180
        or (routine->>'nightPreparationMinutes')::numeric > 180 then raise exception 'Invalid routine'; end if;
    end if;
    if (item.key like 'wake:%' or item.key like 'assertion:%') and
      not public.valid_tracker_sleep_fact(item.key, item.value->'value') then raise exception 'Invalid sleep fact'; end if;
    previous := null;
    select entry into previous from public.tracker_family_entries
      where family_id = target_family and key = item.key;
    if previous is null
      or (item.value->>'revision')::numeric > (previous->>'revision')::numeric
      or ((item.value->>'revision')::numeric = (previous->>'revision')::numeric
        and (item.value->>'device') collate "C" > (previous->>'device') collate "C") then
      insert into public.tracker_family_entries (family_id, key, entry, version)
        values (target_family, item.key, item.value, next_version)
        on conflict (family_id, key) do update set entry = excluded.entry, version = excluded.version;
      changed := true;
    end if;
  end loop;
  if changed then
    current_version := next_version;
    update public.tracker_families set version = current_version where family_id = target_family;
  end if;
  select coalesce(jsonb_object_agg(key, entry), '{}'::jsonb) into delta
    from public.tracker_family_entries where family_id = target_family and version > since_version;
  return jsonb_build_object('version', current_version, 'entries', delta);
end;
$$;
revoke all on function public.exchange_tracker_family(uuid, bigint, jsonb) from public, anon;
grant execute on function public.exchange_tracker_family(uuid, bigint, jsonb) to authenticated;
commit;
