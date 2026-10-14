-- GateCount schema for Supabase (Postgres)
-- Run the whole file in Supabase Dashboard > SQL Editor.
-- Each QR pass belongs to exactly one category. One active entry per QR pass.
-- Category row locking in scan_qr() makes the capacity check safe under concurrent scans.

create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 100),
  token text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  daily_entry_limit integer check (daily_entry_limit is null or daily_entry_limit >= 1),
  daily_exit_limit integer check (daily_exit_limit is null or daily_exit_limit >= 1),
  daily_suspended_until timestamptz
);

alter table public.qr_codes
  add column if not exists daily_entry_limit integer check (daily_entry_limit >= 1),
  add column if not exists daily_exit_limit integer check (daily_exit_limit >= 1),
  add column if not exists daily_suspended_until timestamptz,
  add column if not exists expires_at timestamptz;

update public.qr_codes
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.qr_codes
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null;

create table if not exists public.entry_events (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  action text not null check (action in ('IN','OUT')),
  scanned_by uuid not null references auth.users(id) on delete cascade,
  scanned_at timestamptz not null default now()
);

create index if not exists entry_events_qr_code_scanned_at_idx
  on public.entry_events(qr_code_id, scanned_at);

-- Current occupancy is derived from the latest event per pass.
create or replace view public.category_occupancy
with (security_invoker = true) as
select c.id as category_id,
       count(q.id) filter (where latest.action = 'IN')::integer as active_count
from public.categories c
left join public.qr_codes q on q.category_id = c.id and q.enabled = true
left join lateral (
  select e.action
  from public.entry_events e
  where e.qr_code_id = q.id
  order by e.scanned_at desc, e.id desc
  limit 1
) latest on true
group by c.id;

-- RLS: signed-in users can only see/manage their own categories and related records.
alter table public.categories enable row level security;
alter table public.qr_codes enable row level security;
alter table public.entry_events enable row level security;

drop policy if exists "owners manage own categories" on public.categories;
create policy "owners manage own categories" on public.categories
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owners manage own qr codes" on public.qr_codes;
create policy "owners manage own qr codes" on public.qr_codes
for all to authenticated
using (exists (select 1 from public.categories c where c.id = category_id and c.owner_id = auth.uid()))
with check (exists (select 1 from public.categories c where c.id = category_id and c.owner_id = auth.uid()));

drop policy if exists "owners read own entry events" on public.entry_events;
create policy "owners read own entry events" on public.entry_events
for select to authenticated
using (exists (select 1 from public.categories c where c.id = category_id and c.owner_id = auth.uid()));

-- Capacity-safe scan function. The category is discovered from the token, never trusted
-- from the browser, so a Vada Pav QR cannot be treated as a different category.
drop function if exists public.scan_qr(text);
create or replace function public.scan_qr(p_token text, p_action text)
returns table(ok boolean, message text, category_name text, action text, active_count integer, capacity integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_qr public.qr_codes%rowtype;
  v_category public.categories%rowtype;
  v_latest_action text;
  v_active integer;
  v_today_entries integer;
  v_today_exits integer;
  v_day_start timestamptz := date_trunc('day', now());
  v_next_day timestamptz;
begin
  if v_user is null then
    return query select false, 'Please sign in before scanning.', null::text, null::text, 0, 0;
    return;
  end if;

  if p_action is null or p_action not in ('IN','OUT') then
    return query select false, 'Choose Entry or Exit before scanning.', null::text, 'REJECTED', 0, 0;
    return;
  end if;

  select q.* into v_qr
  from public.qr_codes q
  join public.categories c on c.id = q.category_id
  where q.token = p_token and q.enabled = true and c.owner_id = v_user;

  if not found then
    return query select false, 'Invalid, disabled, or unauthorized QR code.', null::text, null::text, 0, 0;
    return;
  end if;

  -- Serialize scans within the category to prevent two simultaneous scans from
  -- both claiming the final available place.
  select c.* into v_category from public.categories c
  where c.id = v_qr.category_id and c.owner_id = v_user
  for update;

  if not found then
    return query select false, 'Category not found or access denied.', null::text, null::text, 0, 0;
    return;
  end if;

  select e.action into v_latest_action
  from public.entry_events e
  where e.qr_code_id = v_qr.id
  order by e.scanned_at desc, e.id desc
  limit 1;

  if v_qr.expires_at <= now() and not (p_action = 'OUT' and v_latest_action = 'IN') then
    return query select false,
      'This QR code expired after 24 hours.',
      v_category.name, 'REJECTED', 0, v_category.capacity;
    return;
  end if;

  if v_qr.daily_suspended_until > now() then
    if not (p_action = 'OUT' and v_latest_action = 'IN') then
      return query select false,
        'Your limit is finished for today. This QR is suspended until tomorrow.',
        v_category.name, 'REJECTED', 0, v_category.capacity;
      return;
    end if;
  elsif v_qr.daily_suspended_until is not null then
    update public.qr_codes set daily_suspended_until = null where id = v_qr.id;
  end if;

  select count(*)::integer into v_active
  from public.qr_codes q
  join public.categories c on c.id = q.category_id
  join lateral (
    select e.action from public.entry_events e
    where e.qr_code_id = q.id
    order by e.scanned_at desc, e.id desc
    limit 1
  ) latest on true
  where q.category_id = v_category.id and q.enabled = true and latest.action = 'IN';

  v_next_day := v_day_start + interval '1 day';
  select count(*) filter (where e.action = 'IN')::integer,
         count(*) filter (where e.action = 'OUT')::integer
  into v_today_entries, v_today_exits
  from public.entry_events e
  where e.qr_code_id = v_qr.id
    and e.scanned_at >= v_day_start
    and e.scanned_at < v_next_day;

  if p_action = 'OUT' then
    if v_latest_action is distinct from 'IN' then
      return query select false,
        format('%s is not currently inside. Select Entry instead.', v_qr.label),
        v_category.name, 'REJECTED', v_active, v_category.capacity;
      return;
    end if;

    if v_qr.daily_exit_limit is not null and v_today_exits >= v_qr.daily_exit_limit then
      return query select false,
        format('Daily exit limit reached for %s (%s/%s exits today).', v_qr.label, v_today_exits, v_qr.daily_exit_limit),
        v_category.name, 'REJECTED', v_active, v_category.capacity;
      return;
    end if;

    insert into public.entry_events(category_id, qr_code_id, action, scanned_by)
    values (v_category.id, v_qr.id, 'OUT', v_user);
    v_today_exits := v_today_exits + 1;
    if (v_qr.daily_entry_limit is not null and v_today_entries >= v_qr.daily_entry_limit)
       or (v_qr.daily_exit_limit is not null and v_today_exits >= v_qr.daily_exit_limit) then
      update public.qr_codes set daily_suspended_until = v_next_day where id = v_qr.id;
      return query select true,
        format('Exit recorded for %s. Your limit is finished for today; this QR is suspended until tomorrow.', v_qr.label),
        v_category.name, 'OUT', greatest(v_active - 1, 0), v_category.capacity;
      return;
    end if;
    return query select true,
      format('Exit recorded for %s.', v_qr.label),
      v_category.name, 'OUT', greatest(v_active - 1, 0), v_category.capacity;
    return;
  end if;

  if v_latest_action = 'IN' then
    return query select false,
      format('%s is already inside. Select Exit instead.', v_qr.label),
      v_category.name, 'REJECTED', v_active, v_category.capacity;
    return;
  end if;

  if v_qr.daily_entry_limit is not null and v_today_entries >= v_qr.daily_entry_limit then
    update public.qr_codes set daily_suspended_until = v_next_day where id = v_qr.id;
    return query select false,
      'Your limit is finished for today. This QR is suspended until tomorrow.',
      v_category.name, 'REJECTED', v_active, v_category.capacity;
    return;
  end if;

  if v_qr.daily_exit_limit is not null and v_today_exits >= v_qr.daily_exit_limit then
    update public.qr_codes set daily_suspended_until = v_next_day where id = v_qr.id;
    return query select false,
      'Your limit is finished for today. This QR is suspended until tomorrow.',
      v_category.name, 'REJECTED', v_active, v_category.capacity;
    return;
  end if;

  if v_active >= v_category.capacity then
    return query select false,
      format('Capacity reached for %s (%s/%s inside). Entry rejected.', v_category.name, v_active, v_category.capacity),
      v_category.name, 'REJECTED', v_active, v_category.capacity;
    return;
  end if;

  insert into public.entry_events(category_id, qr_code_id, action, scanned_by)
  values (v_category.id, v_qr.id, 'IN', v_user);

  v_today_entries := v_today_entries + 1;
  if v_qr.daily_entry_limit is not null and v_today_entries >= v_qr.daily_entry_limit then
    update public.qr_codes set daily_suspended_until = v_next_day where id = v_qr.id;
    return query select true,
      format('Entry approved for %s (%s/%s inside). Your entry limit is finished for today; Exit is still allowed.', v_qr.label, v_active + 1, v_category.capacity),
      v_category.name, 'IN', v_active + 1, v_category.capacity;
    return;
  end if;

  return query select true,
    format('Entry approved for %s (%s/%s inside).', v_qr.label, v_active + 1, v_category.capacity),
    v_category.name, 'IN', v_active + 1, v_category.capacity;
end;
$$;

revoke all on function public.scan_qr(text, text) from public;
grant execute on function public.scan_qr(text, text) to authenticated;

-- The UI needs occupancy and pass-count columns. Keep these as a convenience view.
create or replace view public.category_dashboard
with (security_invoker = true) as
select c.id, c.owner_id, c.name, c.capacity, c.created_at,
       coalesce(o.active_count, 0)::integer as active_count,
       (select count(*)::integer from public.qr_codes q where q.category_id = c.id and q.enabled = true) as code_count
from public.categories c
left join public.category_occupancy o on o.category_id = c.id;

create or replace view public.qr_code_daily_usage
with (security_invoker = true) as
select q.id as qr_code_id,
       count(e.id) filter (where e.action = 'IN')::integer as entries_today,
       count(e.id) filter (where e.action = 'OUT')::integer as exits_today
from public.qr_codes q
left join public.entry_events e
  on e.qr_code_id = q.id
  and e.scanned_at >= date_trunc('day', now())
  and e.scanned_at < date_trunc('day', now()) + interval '1 day'
group by q.id;

grant select on public.category_occupancy, public.category_dashboard, public.qr_code_daily_usage to authenticated;
