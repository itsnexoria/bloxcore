-- Release tags + fingerprint grouping for client errors.
--   release     - build id stamped into js/supabase-client.js at deploy time (see scripts/stamp-release.mjs)
--   fingerprint - the message with numbers / hex ids collapsed, so "x is 42" and "x is 57" group together
alter table public.client_errors add column if not exists release text, add column if not exists fingerprint text;

create or replace function public.client_error_fingerprint(m text) returns text language sql immutable as $$
  select left(regexp_replace(regexp_replace(coalesce(m, ''), '0x[0-9a-fA-F]+|[0-9a-fA-F]{12,}', '#', 'g'), '[0-9]+', '#', 'g'), 200)
$$;

create or replace function public.client_errors_prepare() returns trigger language plpgsql as $$
begin
  new.fingerprint := public.client_error_fingerprint(new.message);
  new.release := nullif(left(new.release, 40), '');
  return new;
end $$;
drop trigger if exists trg_client_errors_prepare on public.client_errors;
create trigger trg_client_errors_prepare before insert on public.client_errors for each row execute function public.client_errors_prepare();
update public.client_errors set fingerprint = public.client_error_fingerprint(message) where fingerprint is null;
create index if not exists client_errors_fingerprint_idx on public.client_errors (fingerprint, created_at desc);

-- Grouped view for /admin/errors/: one row per fingerprint, with the release it first appeared in and a per-release breakdown.
create or replace function public.get_client_error_groups_v2(p_days integer default 14)
returns table(fingerprint text, message text, n bigint, users bigint, first_seen timestamptz, last_seen timestamptz,
              sample_page text, sample_stack text, sample_agent text, first_release text, last_release text, releases jsonb)
language sql stable security definer set search_path to 'public' as $$
  with e as (
    select * from public.client_errors c
    where exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
      and c.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90))
  ), per_release as (
    select fingerprint, coalesce(release, 'unknown') as release, count(*) as n, min(created_at) as fs, max(created_at) as ls
    from e group by 1, 2
  )
  select e.fingerprint, (array_agg(e.message order by e.created_at desc))[1], count(*), count(distinct e.user_id), min(e.created_at), max(e.created_at),
         (array_agg(e.page_url order by e.created_at desc))[1], (array_agg(e.stack order by e.created_at desc))[1], (array_agg(e.user_agent order by e.created_at desc))[1],
         (array_agg(coalesce(e.release, 'unknown') order by e.created_at asc))[1],
         (array_agg(coalesce(e.release, 'unknown') order by e.created_at desc))[1],
         (select jsonb_agg(jsonb_build_object('release', r.release, 'n', r.n, 'first_seen', r.fs, 'last_seen', r.ls) order by r.fs) from per_release r where r.fingerprint = e.fingerprint)
  from e group by e.fingerprint order by max(e.created_at) desc limit 200;
$$;

create or replace function public.clear_client_error_group(p_fingerprint text) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then raise exception 'not allowed'; end if;
  delete from public.client_errors where fingerprint = p_fingerprint;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.get_client_error_groups_v2(integer), public.clear_client_error_group(text) from public, anon;
grant execute on function public.get_client_error_groups_v2(integer), public.clear_client_error_group(text) to authenticated;
