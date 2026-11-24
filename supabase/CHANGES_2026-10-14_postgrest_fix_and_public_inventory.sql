-- Applied live 2026-10-14. Kept here for the repo record.
--
-- 1) FIX (migration "fix_postgrest_ambiguity_user_fks"): trade_votes (PK listing_id,user_id) had FKs to BOTH
--    trade_listings and profiles, which PostgREST reads as a many-to-many junction. Embeds of
--    trade_listings -> profiles then returned HTTP 300 ("more than one relationship") and /trading/ showed
--    "Couldn't load listings". Pointing user_id at auth.users (not exposed by the API) removes the extra path.
--    Same change for user_inventory and net_worth_snapshots. RULE: don't give a new table FKs to two exposed
--    tables that already have a direct relationship, unless the embed names the FK explicitly.
alter table public.trade_votes drop constraint trade_votes_user_id_fkey;
alter table public.trade_votes add constraint trade_votes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_inventory drop constraint user_inventory_user_id_fkey;
alter table public.user_inventory add constraint user_inventory_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.net_worth_snapshots drop constraint net_worth_snapshots_user_id_fkey;
alter table public.net_worth_snapshots add constraint net_worth_snapshots_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
notify pgrst, 'reload schema';

-- 2) Public profile inventory (migration "public_profile_inventory"). Opt-in: nothing is visible until the owner
--    switches it on from /inventory/. get_public_inventory returns rows only when the owner made it public (or the
--    caller is the owner) and never for banned users.
alter table public.profiles add column inventory_public boolean not null default false;

create or replace function public.set_inventory_public(p_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.check_rate_limit('inventory_visibility', 30, 10);
  update public.profiles set inventory_public = coalesce(p_public, false) where id = auth.uid();
end; $$;
revoke execute on function public.set_inventory_public(boolean) from public, anon;
grant execute on function public.set_inventory_public(boolean) to authenticated;

create or replace function public.get_public_inventory(p_user uuid)
returns table (item_id bigint, value_type text, qty int)
language sql stable security definer set search_path = public as $$
  select i.item_id, i.value_type, i.qty
  from public.user_inventory i
  join public.profiles p on p.id = i.user_id
  where i.user_id = p_user
    and (p.inventory_public or p.id = auth.uid())
    and not coalesce(p.banned, false);
$$;
revoke execute on function public.get_public_inventory(uuid) from public;
grant execute on function public.get_public_inventory(uuid) to anon, authenticated;
