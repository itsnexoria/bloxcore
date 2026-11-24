-- Posts a quiet (no role ping) "value update" summary to the Discord `trading` webhook after staff finish a batch of
-- value changes: waits until nothing has changed for 15 minutes, then posts the biggest risers/droppers with a link
-- to /value-changes/. Skips tiny updates (fewer than 3 moves and nothing >= 20%). Marker lives in site_settings.
-- Dry run:   select public.post_value_changes_digest(true, timestamptz '2026-11-01');
create or replace function public.bf_fmt_value(n bigint) returns text language sql immutable as $$
  select case when n >= 1000000000 then trim(trailing '.' from trim(trailing '0' from to_char(n / 1e9, 'FM990.00'))) || 'B'
              when n >= 1000000 then trim(trailing '.' from trim(trailing '0' from to_char(n / 1e6, 'FM990.00'))) || 'M'
              when n >= 1000 then trim(trailing '.' from trim(trailing '0' from to_char(n / 1e3, 'FM990.00'))) || 'K'
              else n::text end
$$;

create or replace function public.post_value_changes_digest(p_dry_run boolean default false, p_since_override timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_last timestamptz; v_latest timestamptz; v_n int; v_big int; v_up text; v_down text; v_desc text; v_embed jsonb; v_url text;
begin
  v_last := coalesce(p_since_override, (select (value #>> '{}')::timestamptz from public.site_settings where key = 'last_value_digest_at'), now());
  select max(recorded_at) into v_latest from public.bf_item_price_history where recorded_at > v_last;
  if v_latest is null then return jsonb_build_object('skipped', 'no new changes'); end if;
  if v_latest > now() - interval '15 minutes' then return jsonb_build_object('skipped', 'changes still coming in'); end if;

  create temporary table if not exists _vd_moves (name text, old_v bigint, new_v bigint, pct numeric) on commit drop;
  truncate _vd_moves;
  insert into _vd_moves
  select i.name, p.old_v, l.new_v, round(((l.new_v - p.old_v)::numeric / p.old_v) * 100, 1)
  from (select distinct on (item_id) item_id, regular_value new_v from public.bf_item_price_history where regular_value > 0 and recorded_at > v_last order by item_id, recorded_at desc) l
  join (select distinct on (item_id) item_id, regular_value old_v from public.bf_item_price_history where regular_value > 0 and recorded_at <= v_last order by item_id, recorded_at desc) p using (item_id)
  join public.bf_items i on i.id = l.item_id
  where l.new_v <> p.old_v and i.category in ('fruit', 'limited', 'gamepass');

  select count(*), count(*) filter (where abs(pct) >= 20) into v_n, v_big from _vd_moves;
  if not p_dry_run then
    insert into public.site_settings (key, value) values ('last_value_digest_at', to_jsonb(v_latest::text))
    on conflict (key) do update set value = excluded.value; -- always advance, so the same changes are never re-examined
  end if;
  if v_n < 3 and v_big = 0 then return jsonb_build_object('skipped', 'too few moves', 'moves', v_n); end if;

  select string_agg(format('▲ **%s** %s → %s (+%s%%)', name, public.bf_fmt_value(old_v), public.bf_fmt_value(new_v), pct), E'\n' order by pct desc) into v_up
    from (select * from _vd_moves where pct > 0 order by pct desc limit 5) x;
  select string_agg(format('▼ **%s** %s → %s (%s%%)', name, public.bf_fmt_value(old_v), public.bf_fmt_value(new_v), pct), E'\n' order by pct asc) into v_down
    from (select * from _vd_moves where pct < 0 order by pct asc limit 5) x;
  v_desc := concat_ws(E'\n\n', case when v_up is not null then '**Rising**' || E'\n' || v_up end, case when v_down is not null then '**Dropping**' || E'\n' || v_down end,
                      format('%s items changed. Full list and price history: https://bloxcores.com/value-changes/', v_n),
                      '🔔 Want a ping when something hits your price? Set an alert on any item page: https://bloxcores.com/blox-fruits-values/');
  v_embed := jsonb_build_object('title', '📊 Blox Fruits value update', 'description', left(v_desc, 3900), 'color', 3447003,
                                'url', 'https://bloxcores.com/value-changes/', 'footer', jsonb_build_object('text', 'BloxCore values · community estimates'), 'timestamp', now());
  if p_dry_run then return jsonb_build_object('would_post', v_embed, 'moves', v_n); end if;

  select url into v_url from public.webhook_endpoints where channel = 'trading' and enabled = true and provider = 'discord' limit 1;
  if v_url is null then return jsonb_build_object('skipped', 'no trading webhook'); end if;
  perform net.http_post(url := v_url, headers := '{"Content-Type": "application/json"}'::jsonb, body := jsonb_build_object('embeds', jsonb_build_array(v_embed)));
  return jsonb_build_object('posted', v_n);
end $$;
revoke execute on function public.post_value_changes_digest(boolean, timestamptz), public.bf_fmt_value(bigint) from public, anon, authenticated;

-- start from "now" so only future updates are posted
insert into public.site_settings (key, value) values ('last_value_digest_at', to_jsonb(now()::text)) on conflict (key) do nothing;
select cron.schedule('bloxcore-value-digest', '*/15 * * * *', $c$select public.post_value_changes_digest()$c$);
