-- Watchlist match notifications: say whether the watched item is being OFFERED (the useful case)
-- or merely REQUESTED by the poster. Same trigger, same 'watchlist_match' type (opt-out unchanged),
-- Discord alert part unchanged.
create or replace function public.notify_watchlist_on_trade_listing()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_item_ids bigint[];
  v_offer_ids bigint[];
  v_watcher record;
  v_matched_names text;
  v_watcher_count int;
  v_icon text;
  v_first_id bigint;
  v_poster text;
begin
  select array(select distinct (elem->>'id')::bigint
    from jsonb_array_elements(coalesce(new.offering_item_ids, '[]'::jsonb) || coalesce(new.requesting_item_ids, '[]'::jsonb)) elem)
  into v_item_ids;

  if v_item_ids is null or array_length(v_item_ids, 1) is null then
    return new;
  end if;

  select array(select distinct (elem->>'id')::bigint
    from jsonb_array_elements(coalesce(new.offering_item_ids, '[]'::jsonb)) elem)
  into v_offer_ids;

  select coalesce(display_name, username) into v_poster from public.profiles where id = new.user_id;

  for v_watcher in
    select w.user_id,
      string_agg(distinct bi.name, ', ') filter (where w.item_id = any(v_offer_ids)) as offered_names,
      string_agg(distinct bi.name, ', ') filter (where not (w.item_id = any(v_offer_ids))) as wanted_names
    from public.item_watchlist w
    join public.bf_items bi on bi.id = w.item_id
    where w.item_id = any(v_item_ids) and w.user_id <> new.user_id
    group by w.user_id
  loop
    perform public.notify(
      v_watcher.user_id,
      'watchlist_match',
      case when v_watcher.offered_names is not null
        then format('%s is offering %s — an item on your watchlist.', coalesce(v_poster, 'Someone'), v_watcher.offered_names)
        else format('%s is looking for %s — an item on your watchlist.', coalesce(v_poster, 'Someone'), v_watcher.wanted_names)
      end,
      '/trading/#' || new.id
    );
  end loop;

  select string_agg(distinct bi.name, ', '), count(distinct w.user_id)
    into v_matched_names, v_watcher_count
  from public.item_watchlist w
  join public.bf_items bi on bi.id = w.item_id
  where w.item_id = any(v_item_ids) and w.user_id <> new.user_id;

  if v_matched_names is not null then
    v_first_id := (new.offering_item_ids->0->>'id')::bigint;
    if v_first_id is not null then
      select icon_url into v_icon from public.bf_items where id = v_first_id;
    end if;

    perform public.discord_notify(jsonb_strip_nulls(jsonb_build_object(
      'author', jsonb_build_object('name', 'BloxCore', 'icon_url', 'https://bloxcores.com/assets/logo.png'),
      'title', '🔥 Watched Item Alert',
      'description', concat(
        '• **Item(s):** ', v_matched_names, E'\n',
        '• **Posted By:** ', public.discord_mention_or_name(new.user_id), E'\n',
        '• **Watched By:** ', v_watcher_count, ' pirate(s)', E'\n\n',
        '**View →** bloxcores.com/trading/'
      ),
      'color', 16639626,
      'thumbnail', jsonb_build_object('url', coalesce(v_icon, 'https://bloxcores.com/assets/logo.png'))
    )), 'watchlist_alerts', 'Watched item listed: ' || v_matched_names);
  end if;

  return new;
end;
$function$;
