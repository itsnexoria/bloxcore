-- APPLIED to live BloxCore project on 2026-10-08 (migrations: cron_health_rate_limits + cron_health_keep_last_run).

-- ===== Cron monitoring (admin-only RPC, drives Admin > Site > Cron Health) =====
create or replace function public.get_cron_health()
returns table(jobid bigint, jobname text, schedule text, active boolean, last_status text, last_run timestamptz,
              last_message text, runs_24h bigint, fails_24h bigint, stale boolean)
language plpgsql security definer set search_path = public, cron
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'not authorized';
  end if;
  return query
  select j.jobid, j.jobname::text, j.schedule::text, j.active,
         l.status::text, l.start_time, left(l.return_message, 300),
         coalesce(s.r, 0), coalesce(s.f, 0),
         (j.active and ((l.start_time is not null and l.start_time < now() - t.iv)
                     or (l.start_time is null and t.iv <= interval '2 days')))
  from cron.job j
  cross join lateral (select case
       when j.schedule = '* * * * *' then interval '5 minutes'
       when j.schedule ~ '^\*/\d+ \* \* \* \*$' then ((regexp_match(j.schedule, '^\*/(\d+)'))[1]::int * 3) * interval '1 minute'
       when j.schedule ~ '^\d+ \* \* \* \*$' then interval '3 hours'
       when j.schedule ~ '^\d+ \d+ \* \* \*$' then interval '36 hours'
       when j.schedule ~ '^\d+ \d+ \* \* \d$' then interval '8 days'
       when j.schedule ~ '^\d+ \d+ 1 \* \*$' then interval '33 days'
       else interval '10 years' end as iv) t
  left join lateral (select d.status, d.start_time, d.return_message from cron.job_run_details d
                     where d.jobid = j.jobid order by d.start_time desc limit 1) l on true
  left join lateral (select count(*) r, count(*) filter (where d.status = 'failed') f from cron.job_run_details d
                     where d.jobid = j.jobid and d.start_time > now() - interval '24 hours') s on true
  order by j.jobname;
end;
$$;
revoke execute on function public.get_cron_health() from public, anon;
grant execute on function public.get_cron_health() to authenticated;

-- cron.job_run_details had 146k rows. Prune daily, but always keep each job's latest run.
delete from cron.job_run_details where end_time < now() - interval '3 days';
select cron.schedule('bloxcore-cron-history-cleanup', '30 3 * * *',
  $$delete from cron.job_run_details d where d.end_time < now() - interval '3 days'
    and d.runid not in (select max(runid) from cron.job_run_details group by jobid)$$);

-- ===== Rate limiting for tables clients can insert into directly (bypassing the RPCs) =====
-- Generic trigger: counts events in rate_limit_events (24h retention) per user+action. Mods/admins and
-- cron/service-role (auth.uid() is null) are exempt.
create or replace function public.trg_rate_limit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_action text := tg_argv[0]; v_max int := tg_argv[1]::int; v_win int := tg_argv[2]::int; v_count int;
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role in ('mod','admin')) then return new; end if;
  select count(*) into v_count from public.rate_limit_events
   where user_id = auth.uid() and action = v_action and created_at >= now() - make_interval(mins => v_win);
  if v_count >= v_max then
    raise exception 'Slow down — you''re doing that too often. Try again in a few minutes.';
  end if;
  insert into public.rate_limit_events (user_id, action) values (auth.uid(), v_action);
  return new;
end;
$$;
revoke execute on function public.trg_rate_limit() from public, anon, authenticated;

create trigger rl_feed_posts          before insert on public.feed_posts          for each row execute function public.trg_rate_limit('feed_post', 10, 10);
create trigger rl_feed_comments       before insert on public.feed_comments       for each row execute function public.trg_rate_limit('feed_comment', 20, 10);
create trigger rl_feed_likes          before insert on public.feed_likes          for each row execute function public.trg_rate_limit('feed_like', 60, 10);
create trigger rl_direct_messages     before insert on public.direct_messages     for each row execute function public.trg_rate_limit('dm_send', 30, 1);
create trigger rl_sea_events          before insert on public.sea_events          for each row execute function public.trg_rate_limit('sea_event_post', 5, 60);
create trigger rl_pvp_matches         before insert on public.pvp_matches         for each row execute function public.trg_rate_limit('pvp_match_post', 5, 60);
create trigger rl_reports             before insert on public.reports             for each row execute function public.trg_rate_limit('report_insert', 10, 60);
create trigger rl_tournament_messages before insert on public.tournament_messages for each row execute function public.trg_rate_limit('tournament_msg', 20, 1);
create trigger rl_friendships         before insert on public.friendships         for each row execute function public.trg_rate_limit('friend_request', 20, 60);
create trigger rl_follows             before insert on public.follows             for each row execute function public.trg_rate_limit('follow', 40, 60);
create trigger rl_crew_join_requests  before insert on public.crew_join_requests  for each row execute function public.trg_rate_limit('crew_join_req', 15, 60);
create trigger rl_ban_appeals         before insert on public.ban_appeals         for each row execute function public.trg_rate_limit('ban_appeal', 3, 60);
create trigger rl_giveaways           before insert on public.giveaways           for each row execute function public.trg_rate_limit('giveaway_insert', 5, 60);
create trigger rl_combo_votes         before insert on public.combo_votes         for each row execute function public.trg_rate_limit('combo_vote', 60, 10);

-- anon-writable client_errors: global flood cap (silently drops rows past 120/min)
create or replace function public.trg_client_errors_cap()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 120 then
    return null;
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_client_errors_cap() from public, anon, authenticated;
create trigger rl_client_errors_cap before insert on public.client_errors for each row execute function public.trg_client_errors_cap();
