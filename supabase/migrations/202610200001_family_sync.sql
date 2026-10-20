-- Выполните в Supabase SQL Editor; включите Authentication → Anonymous Sign-Ins.
-- UUID семьи — секрет приглашения. Не публикуйте его и не используйте предсказуемые UUID.
begin;

create table if not exists public.tracker_families (
  family_id uuid primary key,
  entries jsonb not null default '{}'::jsonb check (jsonb_typeof(entries) = 'object')
);
create table if not exists public.tracker_family_members (
  family_id uuid not null references public.tracker_families(family_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (family_id, user_id)
);
alter table public.tracker_families enable row level security;
alter table public.tracker_family_members enable row level security;
revoke all on public.tracker_families, public.tracker_family_members from anon, authenticated;
grant select on public.tracker_families, public.tracker_family_members to authenticated;

drop policy if exists tracker_own_membership on public.tracker_family_members;
create policy tracker_own_membership on public.tracker_family_members for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists tracker_family_read on public.tracker_families;
create policy tracker_family_read on public.tracker_families for select to authenticated
  using (exists (select 1 from public.tracker_family_members m
    where m.family_id = tracker_families.family_id and m.user_id = (select auth.uid())));

create or replace function public.join_tracker_family(target_family uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_family::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Random UUID v4 required';
  end if;
  insert into public.tracker_families(family_id) values (target_family) on conflict do nothing;
  insert into public.tracker_family_members(family_id, user_id) values (target_family, auth.uid()) on conflict do nothing;
end;
$$;

-- The row lock makes simultaneous device merges atomic, including stop-event + timer clear.
create or replace function public.merge_tracker_family(target_family uuid, incoming jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  merged jsonb;
  original jsonb;
  item record;
  previous jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.tracker_family_members where family_id = target_family and user_id = auth.uid()
  ) then raise exception 'Family membership required'; end if;
  if jsonb_typeof(incoming) is distinct from 'object' then raise exception 'Invalid document'; end if;
  select entries into strict merged from public.tracker_families where family_id = target_family for update;
  original := merged;
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
    previous := merged->item.key;
    if previous is null
      or (item.value->>'revision')::numeric > (previous->>'revision')::numeric
      or ((item.value->>'revision')::numeric = (previous->>'revision')::numeric
        and (item.value->>'device') collate "C" > (previous->>'device') collate "C") then
      merged := jsonb_set(merged, array[item.key], item.value);
    end if;
  end loop;
  if merged is distinct from original then
    update public.tracker_families set entries = merged where family_id = target_family;
  end if;
  return merged;
end;
$$;
revoke all on function public.join_tracker_family(uuid) from public, anon;
revoke all on function public.merge_tracker_family(uuid, jsonb) from public, anon;
grant execute on function public.join_tracker_family(uuid) to authenticated;
grant execute on function public.merge_tracker_family(uuid, jsonb) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tracker_families') then
    alter publication supabase_realtime add table public.tracker_families;
  end if;
end $$;
commit;
