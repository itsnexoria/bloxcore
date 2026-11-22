-- Live visitors + daily/weekly/monthly visit counts for /admin/overview/.
-- Anonymous visitor id (random uuid in the visitor's localStorage) -> presence heartbeat + per-day unique counts.
-- No IPs, no query strings, no cross-site tracking. RLS on, no policies: only the RPCs below touch the tables.

create table if not exists public.site_presence (
  visitor_id uuid primary key,
  user_id    uuid,
  path       text not null default '/',
  last_seen  timestamptz not null default now()
);
create index if not exists site_presence_last_seen_idx on public.site_presence (last_seen);

create table if not exists public.site_visit_days (
  day       date primary key,
  pageviews integer not null default 0
);

create table if not exists public.site_visit_visitors (
  day        date not null,
  visitor_id uuid not null,
  primary key (day, visitor_id)
);

alter table public.site_presence enable row level security;
alter table public.site_visit_days enable row level security;
alter table public.site_visit_visitors enable row level security;
revoke all on public.site_presence, public.site_visit_days, public.site_visit_visitors from anon, authenticated;

-- Page load (counted once per page view; ignores >1 call per 3 s per visitor)
create or replace function public.track_pageview(p_visitor uuid, p_path text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_prev timestamptz;
begin
  if p_visitor is null then return; end if;
  select last_seen into v_prev from public.site_presence where visitor_id = p_visitor;
  insert into public.site_presence(visitor_id, user_id, path, last_seen)
  values (p_visitor, auth.uid(), left(coalesce(p_path, '/'), 200), now())
  on conflict (visitor_id) do update
    set user_id = coalesce(excluded.user_id, public.site_presence.user_id), path = excluded.path, last_seen = now();
  if v_prev is not null and v_prev > now() - interval '3 seconds' then return; end if;
  insert into public.site_visit_visitors(day, visitor_id) values (v_day, p_visitor) on conflict do nothing;
  insert into public.site_visit_days(day, pageviews) values (v_day, 1)
  on conflict (day) do update set pageviews = public.site_visit_days.pageviews + 1;
end $$;

-- Keep-alive while a tab is open and visible (throttled to once per 20 s per visitor)
create or replace function public.track_heartbeat(p_visitor uuid, p_path text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_visitor is null then return; end if;
  insert into public.site_presence(visitor_id, user_id, path, last_seen)
  values (p_visitor, auth.uid(), left(coalesce(p_path, '/'), 200), now())
  on conflict (visitor_id) do update
    set user_id = coalesce(excluded.user_id, public.site_presence.user_id), path = excluded.path, last_seen = now()
    where public.site_presence.last_seen < now() - interval '20 seconds';
end $$;

-- Staff-only read for the overview card
create or replace function public.get_site_traffic()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('mod','admin')) then
    raise exception 'not authorized';
  end if;
  return jsonb_build_object(
    'live', (select count(*) from public.site_presence where last_seen > now() - interval '90 seconds'),
    'live_users', (select count(*) from public.site_presence where last_seen > now() - interval '90 seconds' and user_id is not null),
    'live_paths', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'n', n)) from (
        select path, count(*) n from public.site_presence where last_seen > now() - interval '90 seconds'
        group by path order by n desc, path limit 5) t), '[]'::jsonb),
    'since', (select min(day) from public.site_visit_days),
    'today',     jsonb_build_object('visitors', (select count(*) from public.site_visit_visitors where day = v_today),
                                    'pageviews', coalesce((select pageviews from public.site_visit_days where day = v_today), 0)),
    'yesterday', jsonb_build_object('visitors', (select count(*) from public.site_visit_visitors where day = v_today - 1),
                                    'pageviews', coalesce((select pageviews from public.site_visit_days where day = v_today - 1), 0)),
    'week',      jsonb_build_object('visitors', (select count(distinct visitor_id) from public.site_visit_visitors where day > v_today - 7),
                                    'pageviews', coalesce((select sum(pageviews) from public.site_visit_days where day > v_today - 7), 0)),
    'month',     jsonb_build_object('visitors', (select count(distinct visitor_id) from public.site_visit_visitors where day > v_today - 30),
                                    'pageviews', coalesce((select sum(pageviews) from public.site_visit_days where day > v_today - 30), 0)),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date,
                 'visitors', (select count(*) from public.site_visit_visitors v where v.day = d::date),
                 'pageviews', coalesce((select pageviews from public.site_visit_days s where s.day = d::date), 0)) order by d), '[]'::jsonb)
              from generate_series(v_today - 13, v_today, interval '1 day') d)
  );
end $$;

revoke execute on function public.track_pageview(uuid, text), public.track_heartbeat(uuid, text), public.get_site_traffic() from public, anon, authenticated;
grant execute on function public.track_pageview(uuid, text), public.track_heartbeat(uuid, text) to anon, authenticated;
grant execute on function public.get_site_traffic() to authenticated;

-- Housekeeping: presence rows older than a day, per-visitor day rows older than 40 days (daily totals are kept)
select cron.schedule('bloxcore-site-traffic-cleanup', '5 * * * *', $c$
  delete from public.site_presence where last_seen < now() - interval '1 day';
  delete from public.site_visit_visitors where day < (now() at time zone 'utc')::date - 40;
$c$);
