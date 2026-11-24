-- Applied live 2026-10-12 (migration "trade_listing_votes_wl_fair"). Kept here for the repo record.
-- Community W/L/Fair votes on trade listings. Votes are from the TAKER's side:
--   w = good deal for whoever accepts, l = bad for them, fair = balanced. One vote per user per listing.
-- Table is read-only to clients (own rows); writes go through cast_trade_vote (rate-limited 60/10min,
-- blocks own listing, banned users, inactive/expired listings). Counts are public via get_trade_vote_counts.

create table public.trade_votes (
  listing_id uuid not null references public.trade_listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('w','l','fair')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);
create index trade_votes_user_idx on public.trade_votes (user_id);
alter table public.trade_votes enable row level security;
create policy "users see their own trade votes" on public.trade_votes for select using (user_id = (select auth.uid()));
revoke all on public.trade_votes from anon, authenticated;
grant select on public.trade_votes to authenticated;

create or replace function public.cast_trade_vote(p_listing_id uuid, p_vote text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l record; r jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_vote is not null and p_vote not in ('w','l','fair') then raise exception 'Invalid vote.'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then raise exception 'Your account can''t vote.'; end if;
  perform public.check_rate_limit('trade_vote', 60, 10);
  select * into l from public.trade_listings where id = p_listing_id and active and expires_at > now();
  if not found then raise exception 'Listing not found or no longer active.'; end if;
  if l.user_id = auth.uid() then raise exception 'You can''t vote on your own listing.'; end if;
  if p_vote is null then
    delete from public.trade_votes where listing_id = p_listing_id and user_id = auth.uid();
  else
    insert into public.trade_votes (listing_id, user_id, vote) values (p_listing_id, auth.uid(), p_vote)
    on conflict (listing_id, user_id) do update set vote = excluded.vote, updated_at = now();
  end if;
  select jsonb_build_object('w', count(*) filter (where vote='w'), 'l', count(*) filter (where vote='l'), 'fair', count(*) filter (where vote='fair'), 'my_vote', p_vote)
    into r from public.trade_votes where listing_id = p_listing_id;
  return r;
end; $$;

create or replace function public.get_trade_vote_counts(p_listing_ids uuid[])
returns table (listing_id uuid, w int, l int, fair int, my_vote text)
language sql stable security definer set search_path = public as $$
  select v.listing_id,
         (count(*) filter (where v.vote='w'))::int, (count(*) filter (where v.vote='l'))::int, (count(*) filter (where v.vote='fair'))::int,
         max(v.vote) filter (where v.user_id = auth.uid())
  from public.trade_votes v
  where v.listing_id = any (p_listing_ids[1:100])
  group by v.listing_id;
$$;

revoke execute on function public.cast_trade_vote(uuid, text) from public, anon;
grant execute on function public.cast_trade_vote(uuid, text) to authenticated;
revoke execute on function public.get_trade_vote_counts(uuid[]) from public;
grant execute on function public.get_trade_vote_counts(uuid[]) to anon, authenticated;
