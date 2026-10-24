-- Apply after 202610200001_family_sync.sql. Update both clients together: the old RPC is removed.
begin;

-- Only this small row is published through Realtime; registers are fetched through the RPC.
alter table public.tracker_families add column version bigint not null default 0
  check (version between 0 and 9007199254740991);
create table public.tracker_family_entries (
  family_id uuid not null references public.tracker_families(family_id) on delete cascade,
  key text not null,
  entry jsonb not null,
  version bigint not null,
  primary key (family_id, key)
);
create index tracker_family_entries_version on public.tracker_family_entries (family_id, version);
alter table public.tracker_family_entries enable row level security;
revoke all on public.tracker_family_entries from public, anon, authenticated;

-- Preserve existing revisions, timers and deletion tombstones. Cursor zero fetches this snapshot.
insert into public.tracker_family_entries (family_id, key, entry, version)
  select f.family_id, e.key, e.value, 1
  from public.tracker_families f cross join lateral jsonb_each(f.entries) e;
update public.tracker_families f set version = 1
  where exists (select 1 from public.tracker_family_entries e where e.family_id = f.family_id);
drop function public.merge_tracker_family(uuid, jsonb);
alter table public.tracker_families drop column entries;

-- A single family lock serializes writes and the delta snapshot, so a cursor cannot skip commits.
create function public.exchange_tracker_family(target_family uuid, since_version bigint, incoming jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_version bigint;
  next_version bigint;
  item record;
  previous jsonb;
  delta jsonb;
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
    if not (item.key in ('sleepTimer', 'breastTimer') or item.key like 'event:_%')
      or jsonb_typeof(item.value) is distinct from 'object'
      or jsonb_typeof(item.value->'revision') is distinct from 'number'
      or (item.value->>'revision') !~ '^[0-9]+$'
      or (item.value->>'revision')::numeric > 9007199254740991
      or jsonb_typeof(item.value->'device') is distinct from 'string'
      or (item.value->>'device') !~ '^[0-9a-f-]{36}$'
      or not (item.value ? 'value') then raise exception 'Invalid register';
    end if;
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
