-- Community value votes: signed-in users vote an item Overpaid / Fair / Underpaid. Votes older than 30 days
-- stop counting (so the signal follows the market). Feeds the homepage "Trending" tiles via
-- get_community_trending() and the vote widget on every /blox-fruits-values/<item>/ page.
-- APPLIED to project hpvwxaubgiyqgqtyjofb on 2026-11-04.

create table if not exists public.bf_item_value_votes (
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  item_id    bigint not null references public.bf_items(id) on delete cascade,
  vote       text   not null check (vote in ('overpaid', 'fair', 'underpaid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index if not exists bf_item_value_votes_item_recent_idx on public.bf_item_value_votes (item_id, updated_at desc);

alter table public.bf_item_value_votes enable row level security;
-- Users can read only their own vote (to show "you voted X"); all writes go through vote_item_value().
create policy "users read their own value votes" on public.bf_item_value_votes
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.bf_item_value_votes from anon, authenticated;
grant select on table public.bf_item_value_votes to authenticated;

-- Cast, change or (p_vote = null) remove your vote. Rate limited.
create or replace function public.vote_item_value(p_item_id bigint, p_vote text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to vote.'; end if;
  if p_vote is not null and p_vote not in ('overpaid', 'fair', 'underpaid') then raise exception 'Invalid vote.'; end if;
  perform public.check_rate_limit('vote_item_value', 120, 60);
  if not exists (select 1 from public.bf_items where id = p_item_id) then raise exception 'Unknown item.'; end if;
  if p_vote is null then
    delete from public.bf_item_value_votes where user_id = v_uid and item_id = p_item_id;
  else
    insert into public.bf_item_value_votes (user_id, item_id, vote) values (v_uid, p_item_id, p_vote)
    on conflict (user_id, item_id) do update set vote = excluded.vote, updated_at = now();
  end if;
end $function$;

-- Vote counts (last 30 days) for up to 500 items. Public: shown on public item pages.
create or replace function public.get_item_value_votes(p_item_ids bigint[])
returns table (item_id bigint, overpaid int, fair int, underpaid int, total int)
language sql stable security definer set search_path to 'public' as $function$
  select v.item_id,
         count(*) filter (where v.vote = 'overpaid')::int,
         count(*) filter (where v.vote = 'fair')::int,
         count(*) filter (where v.vote = 'underpaid')::int,
         count(*)::int
  from public.bf_item_value_votes v
  where v.item_id = any (p_item_ids[1:500]) and v.updated_at > now() - interval '30 days'
  group by v.item_id;
$function$;

-- Items the community clearly leans on: >= 5 votes in 30 days and >= 60% of them on one side.
create or replace function public.get_community_trending(p_limit int default 6)
returns table (item_id bigint, name text, category text, regular_value bigint, icon_url text, verdict text, votes int, share int)
language sql stable security definer set search_path to 'public' as $function$
  with t as (
    select v.item_id,
           count(*) filter (where v.vote = 'overpaid')::int  as o,
           count(*) filter (where v.vote = 'underpaid')::int as u,
           count(*)::int as n
    from public.bf_item_value_votes v
    where v.updated_at > now() - interval '30 days'
    group by v.item_id
  ), r as (
    select t.*, greatest(t.o, t.u) as top, case when t.o >= t.u then 'overpaid' else 'underpaid' end as verdict
    from t where t.n >= 5
  )
  select i.id, i.name, i.category, i.regular_value, i.icon_url, r.verdict, r.n, round(100.0 * r.top / r.n)::int
  from r join public.bf_items i on i.id = r.item_id
  where r.top::numeric / r.n >= 0.6 and i.regular_value is not null
  order by r.top desc, r.n desc
  limit least(greatest(p_limit, 1), 12);
$function$;

revoke all on function public.vote_item_value(bigint, text) from public, anon, authenticated;
revoke all on function public.get_item_value_votes(bigint[]) from public, anon, authenticated;
revoke all on function public.get_community_trending(int) from public, anon, authenticated;
grant execute on function public.vote_item_value(bigint, text) to authenticated;
grant execute on function public.get_item_value_votes(bigint[]) to anon, authenticated;
grant execute on function public.get_community_trending(int) to anon, authenticated;
