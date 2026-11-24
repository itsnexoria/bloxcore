-- Applied live 2026-10-15 (migration "net_worth_leaderboard_and_import"). Kept here for the repo record.
--
-- get_net_worth_leaderboard: top public inventories (opt-in via profiles.inventory_public), computed live from
--   current bf_items values (permanent falls back to regular_value, same rule as valueFor() in js/listings.js).
--   Never returns banned users; limit is clamped to 1..100.
-- import_inventory: bulk add/replace for the "Import list" modal. Max 100 rows per call, duplicates merged, invalid
--   rows skipped (unknown item, non-fruit permanent, qty 0), quantities capped at 999, 200 distinct items per user,
--   rate limited to 10 calls / 10 min, refreshes today's net-worth snapshot.

create or replace function public.get_net_worth_leaderboard(p_limit int default 50)
returns table (username text, display_name text, avatar_url text, avatar_frame text, total_value bigint, item_count bigint, top_item text)
language sql stable security definer set search_path = public as $$
  with holdings as (
    select i.user_id, b.name, i.qty,
           i.qty::bigint * case when i.value_type = 'permanent' then coalesce(b.permanent_value, b.regular_value) else b.regular_value end as v
    from public.user_inventory i join public.bf_items b on b.id = i.item_id
  ), tot as (
    select user_id, sum(v) as total, sum(qty) as cnt from holdings group by user_id
  )
  select p.username, p.display_name, p.avatar_url, p.avatar_frame, t.total::bigint, t.cnt::bigint,
         (select h.name from holdings h where h.user_id = t.user_id order by h.v desc, h.name limit 1)
  from tot t join public.profiles p on p.id = t.user_id
  where p.inventory_public and not coalesce(p.banned, false) and t.total > 0
  order by t.total desc, p.username
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke execute on function public.get_net_worth_leaderboard(int) from public;
grant execute on function public.get_net_worth_leaderboard(int) to anon, authenticated;

create or replace function public.import_inventory(p_rows jsonb, p_mode text default 'add')
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); valid jsonb; valid_n int; applied int; distinct_after int; total_n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_mode not in ('add','replace') then raise exception 'Invalid mode.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid rows.'; end if;
  total_n := jsonb_array_length(p_rows);
  if total_n < 1 or total_n > 100 then raise exception 'Import between 1 and 100 rows at a time.'; end if;
  if exists (select 1 from public.profiles where id = uid and banned) then raise exception 'Your account can''t do this.'; end if;
  perform public.check_rate_limit('inventory_import', 10, 10);

  begin
    select coalesce(jsonb_agg(jsonb_build_object('item_id', v.item_id, 'value_type', v.value_type, 'qty', v.qty)), '[]'::jsonb)
      into valid
    from (
      select m.item_id, m.value_type, least(sum(m.qty), 999)::int as qty
      from (
        select (e->>'item_id')::bigint as item_id, e->>'value_type' as value_type, least(greatest((e->>'qty')::int, 0), 999) as qty
        from jsonb_array_elements(p_rows) e
      ) m
      join public.bf_items b on b.id = m.item_id and b.regular_value is not null
      where m.value_type in ('physical','permanent') and (m.value_type = 'physical' or b.category = 'fruit') and m.qty > 0
      group by m.item_id, m.value_type
    ) v;
  exception when others then
    raise exception 'Those rows couldn''t be read.';
  end;
  valid_n := jsonb_array_length(valid);
  if valid_n = 0 then return jsonb_build_object('applied', 0, 'ignored', total_n); end if;

  select count(*) into distinct_after from (
    select item_id, value_type from public.user_inventory where user_id = uid
    union
    select (x->>'item_id')::bigint, x->>'value_type' from jsonb_array_elements(valid) x
  ) d;
  if distinct_after > 200 then raise exception 'That would put you over 200 different items.'; end if;

  insert into public.user_inventory (user_id, item_id, value_type, qty)
  select uid, (x->>'item_id')::bigint, x->>'value_type', (x->>'qty')::int from jsonb_array_elements(valid) x
  on conflict (user_id, item_id, value_type) do update
    set qty = case when p_mode = 'add' then least(public.user_inventory.qty + excluded.qty, 999) else excluded.qty end,
        updated_at = now();
  get diagnostics applied = row_count;
  perform public.snapshot_net_worth(uid);
  return jsonb_build_object('applied', applied, 'ignored', total_n - valid_n);
end; $$;
revoke execute on function public.import_inventory(jsonb, text) from public, anon;
grant execute on function public.import_inventory(jsonb, text) to authenticated;
