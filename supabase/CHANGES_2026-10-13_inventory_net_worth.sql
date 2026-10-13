-- Applied live 2026-10-13 (migration "user_inventory_and_net_worth"). Kept here for the repo record.
-- Private inventory + daily net-worth snapshots for /inventory/.
--   user_inventory: one row per (user, item, physical|permanent); qty 1..999; max 200 distinct rows per user.
--   net_worth_snapshots: one row per user per UTC day; written by set_inventory_item (today) and by the
--   daily cron job 'bloxcore-net-worth-snapshot' (00:20 UTC) so the chart moves when values do. Kept 365 days.
-- Clients can only SELECT their own rows; all writes go through set_inventory_item (rate-limited, bans blocked).
-- Net worth uses the same rule as valueFor() in js/listings.js: permanent falls back to regular_value.

create table public.user_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id bigint not null references public.bf_items(id) on delete cascade,
  value_type text not null default 'physical' check (value_type in ('physical','permanent')),
  qty int not null check (qty between 1 and 999),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id, value_type)
);
create index user_inventory_item_idx on public.user_inventory (item_id);
alter table public.user_inventory enable row level security;
create policy "users see their own inventory" on public.user_inventory for select using (user_id = (select auth.uid()));
revoke all on public.user_inventory from anon, authenticated;
grant select on public.user_inventory to authenticated;

create table public.net_worth_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,
  total_value bigint not null,
  primary key (user_id, snapshot_date)
);
alter table public.net_worth_snapshots enable row level security;
create policy "users see their own net worth history" on public.net_worth_snapshots for select using (user_id = (select auth.uid()));
revoke all on public.net_worth_snapshots from anon, authenticated;
grant select on public.net_worth_snapshots to authenticated;

create or replace function public.snapshot_net_worth(p_user uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.net_worth_snapshots (user_id, snapshot_date, total_value)
  select p_user, (now() at time zone 'utc')::date,
         coalesce(sum(i.qty::bigint * case when i.value_type = 'permanent' then coalesce(b.permanent_value, b.regular_value) else b.regular_value end), 0)
  from public.user_inventory i join public.bf_items b on b.id = i.item_id
  where i.user_id = p_user
  on conflict (user_id, snapshot_date) do update set total_value = excluded.total_value;
$$;
revoke execute on function public.snapshot_net_worth(uuid) from public, anon, authenticated;

create or replace function public.set_inventory_item(p_item_id bigint, p_value_type text, p_qty int)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_value_type not in ('physical','permanent') then raise exception 'Invalid value type.'; end if;
  if p_qty is null or p_qty < 0 or p_qty > 999 then raise exception 'Quantity must be between 0 and 999.'; end if;
  if exists (select 1 from public.profiles where id = uid and banned) then raise exception 'Your account can''t do this.'; end if;
  perform public.check_rate_limit('inventory_edit', 120, 10);
  if p_qty = 0 then
    delete from public.user_inventory where user_id = uid and item_id = p_item_id and value_type = p_value_type;
  else
    select * into it from public.bf_items where id = p_item_id and regular_value is not null;
    if not found then raise exception 'That item can''t be added to an inventory.'; end if;
    if p_value_type = 'permanent' and it.category <> 'fruit' then raise exception 'Only fruits have a permanent version.'; end if;
    if not exists (select 1 from public.user_inventory where user_id = uid and item_id = p_item_id and value_type = p_value_type)
       and (select count(*) from public.user_inventory where user_id = uid) >= 200 then
      raise exception 'Inventory is full (200 different items).';
    end if;
    insert into public.user_inventory (user_id, item_id, value_type, qty) values (uid, p_item_id, p_value_type, p_qty)
    on conflict (user_id, item_id, value_type) do update set qty = excluded.qty, updated_at = now();
  end if;
  perform public.snapshot_net_worth(uid);
end; $$;
revoke execute on function public.set_inventory_item(bigint, text, int) from public, anon;
grant execute on function public.set_inventory_item(bigint, text, int) to authenticated;

create or replace function public.snapshot_all_net_worth()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.net_worth_snapshots (user_id, snapshot_date, total_value)
  select i.user_id, (now() at time zone 'utc')::date,
         coalesce(sum(i.qty::bigint * case when i.value_type = 'permanent' then coalesce(b.permanent_value, b.regular_value) else b.regular_value end), 0)
  from public.user_inventory i join public.bf_items b on b.id = i.item_id
  group by i.user_id
  on conflict (user_id, snapshot_date) do update set total_value = excluded.total_value;
  delete from public.net_worth_snapshots where snapshot_date < (now() at time zone 'utc')::date - 365;
end; $$;
revoke execute on function public.snapshot_all_net_worth() from public, anon, authenticated;
select cron.schedule('bloxcore-net-worth-snapshot', '20 0 * * *', 'select public.snapshot_all_net_worth()');
