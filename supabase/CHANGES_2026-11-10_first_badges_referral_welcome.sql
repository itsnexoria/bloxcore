-- First-time badges (+ small XP bonus) and a welcome bonus for people who join through a referral link.
--   first_listing  - posted a trade listing      (+xp_first_trade_listing)
--   first_post     - made a feed post            (+xp_first_post)
--   first_trade    - a confirmed trade           (+xp_first_trade)
-- Bonuses live in site_settings so you can tune them (set to 0 to switch one off).
insert into public.site_settings (key, value) values
  ('xp_first_trade_listing', '50'::jsonb), ('xp_first_post', '25'::jsonb), ('xp_first_trade', '100'::jsonb), ('xp_referral_welcome', '50'::jsonb)
on conflict (key) do nothing;

insert into public.achievements (key, name, description, icon, tier, sort_order) values
  ('first_listing', 'First Listing', 'Post your first trade listing', 'repeat', 'bronze', 41),
  ('first_post', 'First Post', 'Share your first post on the feed', 'message-circle', 'bronze', 42),
  ('first_trade', 'First Trade', 'Complete your first confirmed trade', 'handshake', 'silver', 43)
on conflict (key) do nothing;

create or replace function public.check_achievements(p_user_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_completions int; v_level int; v_wars_won int; v_referrals int; v_username text;
  v_longest_login int; v_pvp_wins int; v_pos_vouches int;
  v_listings int; v_posts int; v_trades int; v_bonus int;
  r record;
begin
  select count(*) into v_completions from public.completions where user_id = p_user_id;
  select level, crew_wars_won, username, coalesce(longest_login_streak, 0), coalesce(pvp_wins, 0)
    into v_level, v_wars_won, v_username, v_longest_login, v_pvp_wins
    from public.profiles where id = p_user_id;
  select count(*) into v_referrals from public.profiles where referred_by = p_user_id;
  select count(*) into v_pos_vouches from public.vouches where target_id = p_user_id and direction = 1;
  select count(*) into v_listings from public.trade_listings where user_id = p_user_id;
  select count(*) into v_posts from public.feed_posts where user_id = p_user_id;
  select count(*) into v_trades from public.trade_confirmations where status = 'confirmed' and (owner_id = p_user_id or partner_id = p_user_id);

  for r in
    select a.id, a.key, a.name from public.achievements a
    where a.key = any(array[
      case when v_completions >= 10 then 'challenges_10' end,
      case when v_completions >= 50 then 'challenges_50' end,
      case when v_completions >= 100 then 'challenges_100' end,
      case when v_completions >= 250 then 'challenges_250' end,
      case when v_level >= 10 then 'level_10' end,
      case when v_level >= 25 then 'level_25' end,
      case when v_level >= 50 then 'level_50' end,
      case when v_wars_won >= 1 then 'wars_1' end,
      case when v_wars_won >= 10 then 'wars_10' end,
      case when v_wars_won >= 25 then 'wars_25' end,
      case when v_referrals >= 1 then 'referrals_1' end,
      case when v_referrals >= 5 then 'referrals_5' end,
      case when v_referrals >= 15 then 'referrals_15' end,
      case when v_longest_login >= 7 then 'streak_7' end,
      case when v_longest_login >= 30 then 'streak_30' end,
      case when v_longest_login >= 100 then 'streak_100' end,
      case when v_pvp_wins >= 1 then 'pvp_1' end,
      case when v_pvp_wins >= 10 then 'pvp_10' end,
      case when v_pvp_wins >= 50 then 'pvp_50' end,
      case when v_pos_vouches >= 5 then 'trusted_5' end,
      case when v_listings >= 1 then 'first_listing' end,
      case when v_posts >= 1 then 'first_post' end,
      case when v_trades >= 1 then 'first_trade' end
    ])
    and not exists (select 1 from public.user_achievements ua where ua.user_id = p_user_id and ua.achievement_id = a.id)
  loop
    insert into public.user_achievements (user_id, achievement_id) values (p_user_id, r.id);
    v_bonus := coalesce((select (value)::int from public.site_settings where key =
      case r.key when 'first_listing' then 'xp_first_trade_listing' when 'first_post' then 'xp_first_post' when 'first_trade' then 'xp_first_trade' end), 0);
    if v_bonus > 0 then
      update public.profiles set xp = xp + v_bonus, level = public.xp_to_level(xp + v_bonus) where id = p_user_id;
    end if;
    perform public.notify(p_user_id, 'achievement_earned',
      case when v_bonus > 0 then format('Achievement unlocked: "%s"! +%s XP', r.name, v_bonus) else format('Achievement unlocked: "%s"!', r.name) end, '/profile/');
  end loop;
end;
$function$;

-- feed posts: check the first-post badge (no per-post XP, so there is nothing to farm)
create or replace function public.check_achievements_on_feed_post()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.check_achievements(new.user_id);
  return new;
end $$;
drop trigger if exists trg_check_achievements_on_feed_post on public.feed_posts;
create trigger trg_check_achievements_on_feed_post after insert on public.feed_posts
  for each row execute function public.check_achievements_on_feed_post();

-- confirmed trades: check both traders
create or replace function public.check_achievements_on_trade_confirmed()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.check_achievements(new.owner_id);
    perform public.check_achievements(new.partner_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_check_achievements_on_trade_confirmed on public.trade_confirmations;
create trigger trg_check_achievements_on_trade_confirmed after insert or update of status on public.trade_confirmations
  for each row execute function public.check_achievements_on_trade_confirmed();

-- referral: the new member also gets a small welcome bonus (the referrer still gets +200 XP)
create or replace function public.apply_referral(p_ref_username text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_referrer_id uuid; v_referrer_username text; v_recruiter_title_id uuid;
  v_new_xp int; v_old_level int; v_new_level int; v_new_username text; v_updated int; v_welcome int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.check_rate_limit('apply_referral', 10, 60);

  select id, username into v_referrer_id, v_referrer_username from public.profiles where username = p_ref_username;
  if v_referrer_id is null then raise exception 'invalid referral code'; end if;
  if v_referrer_id = auth.uid() then raise exception 'cannot refer yourself'; end if;

  perform set_config('bloxcore.bypass_referral_lock', 'true', true);
  update public.profiles set referred_by = v_referrer_id where id = auth.uid() and referred_by is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return; end if;

  v_welcome := coalesce((select (value)::int from public.site_settings where key = 'xp_referral_welcome'), 0);
  if v_welcome > 0 then
    update public.profiles set xp = xp + v_welcome, level = public.xp_to_level(xp + v_welcome) where id = auth.uid();
    perform public.notify(auth.uid(), 'referral', format('Welcome bonus: +%s XP for joining through a friend''s link!', v_welcome), '/dashboard/');
  end if;

  select xp, level into v_new_xp, v_old_level from public.profiles where id = v_referrer_id;
  v_new_xp := v_new_xp + 200;
  v_new_level := public.xp_to_level(v_new_xp);
  update public.profiles set xp = v_new_xp, level = v_new_level where id = v_referrer_id;

  select id into v_recruiter_title_id from public.titles where name = 'Recruiter';
  if v_recruiter_title_id is not null then
    insert into public.user_titles (user_id, title_id) values (v_referrer_id, v_recruiter_title_id) on conflict (user_id, title_id) do nothing;
  end if;

  select username into v_new_username from public.profiles where id = auth.uid();
  insert into public.activity_log (user_id, username, type, detail, xp_awarded)
  values (v_referrer_id, v_referrer_username, 'referral', coalesce(v_new_username, 'a new pirate'), 200);
  perform public.notify(v_referrer_id, 'referral', format('%s joined using your referral link! +200 XP', coalesce(v_new_username, 'A new pirate')), '/profile/');
  perform public.check_achievements(v_referrer_id);
end;
$function$;
