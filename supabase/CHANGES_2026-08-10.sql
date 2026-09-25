-- Applied directly to the live BloxCore project (hpvwxaubgiyqgqtyjofb) on 2026-08-10.
-- Recorded here since the repo has no migration history — see RLS_AUDIT.sql's note.

-- 1. RLS audit found one gap: `auto_approve_disabled` (an admin flag that pulls a
--    specific user out of the auto-approve trusted-submitter track) wasn't in the
--    protect_profile_columns trigger's protected-column list, so a flagged user could
--    un-flag themselves via a direct `profiles` update. Everything else the audit
--    checked (RLS enabled on all 9 tables, admin-only RPCs, self-edit column locking,
--    active_title_id ownership check) was already correct.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller_role text;
  ban_bypass boolean;
  referral_bypass boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role = 'admin' then
    return new;
  end if;

  ban_bypass := coalesce(current_setting('bloxcore.bypass_ban_lock', true), '') = 'true';
  referral_bypass := coalesce(current_setting('bloxcore.bypass_referral_lock', true), '') = 'true';

  new.xp := old.xp;
  new.level := old.level;
  new.is_admin := old.is_admin;
  new.role := old.role;
  new.current_streak := old.current_streak;
  new.longest_streak := old.longest_streak;
  new.last_completed_date := old.last_completed_date;
  new.discord_id := old.discord_id;
  new.discord_username := old.discord_username;
  new.crew_wars_won := old.crew_wars_won;
  new.id := old.id;
  new.auto_approve_disabled := old.auto_approve_disabled; -- added

  if not ban_bypass then
    new.banned := old.banned;
    new.banned_reason := old.banned_reason;
  end if;

  if not referral_bypass then
    new.referred_by := old.referred_by;
  end if;

  if new.active_title_id is distinct from old.active_title_id and new.active_title_id is not null then
    if not exists (select 1 from public.user_titles where user_id = new.id and title_id = new.active_title_id) then
      new.active_title_id := old.active_title_id;
    end if;
  end if;

  return new;
end;
$function$;

-- 2. Chat had no server-side rate limit or length cap — only a client-side timer
--    (js/chat.js's SEND_COOLDOWN_MS), which anyone can bypass by calling
--    supabase.from('chat_messages').insert(...) directly. This trigger enforces both,
--    reading the same site_settings the client already uses (chat_cooldown_seconds,
--    max_chat_message_length), and exempts mod/admin from the cooldown.
create or replace function public.enforce_chat_rate_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cooldown_seconds int;
  v_max_length int;
  v_last_sent timestamptz;
  v_caller_role text;
begin
  select coalesce((value #>> '{}')::int, 10) into v_cooldown_seconds
    from public.site_settings where key = 'chat_cooldown_seconds';
  select coalesce((value #>> '{}')::int, 500) into v_max_length
    from public.site_settings where key = 'max_chat_message_length';

  select role into v_caller_role from public.profiles where id = new.user_id;

  new.message := left(trim(new.message), coalesce(v_max_length, 500));
  if length(new.message) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  if v_caller_role not in ('mod', 'admin') then
    select max(created_at) into v_last_sent
      from public.chat_messages where user_id = new.user_id;

    if v_last_sent is not null
       and v_last_sent > now() - make_interval(secs => coalesce(v_cooldown_seconds, 10)) then
      raise exception 'You are sending messages too fast. Please wait a moment.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger chat_messages_rate_limit
before insert on public.chat_messages
for each row execute function public.enforce_chat_rate_limit();

-- 3. Added two more notification preferences (chat replies/mentions, sea event joins)
-- to match the pattern already used by notify_new_giveaways / notify_new_sea_events —
-- these two previously had no opt-out at all. Wired into settings/index.html +
-- js/settings.js as new toggles under Notifications.
alter table public.profiles
  add column if not exists notify_chat_mentions boolean not null default true,
  add column if not exists notify_sea_event_joins boolean not null default true;

create or replace function public.notify_on_chat_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sender_name text;
  reply_author uuid;
  mention_username text;
  mention_user_id uuid;
  already_notified uuid[] := '{}';
begin
  select coalesce(display_name, username) into v_sender_name from public.profiles where id = new.user_id;

  if new.reply_to_id is not null then
    select user_id into reply_author from public.chat_messages where id = new.reply_to_id;
    if reply_author is not null and reply_author <> new.user_id
       and coalesce((select notify_chat_mentions from public.profiles where id = reply_author), true) then
      perform public.notify(reply_author, 'chat_reply', format('%s replied to your message in chat', v_sender_name), '/chat/');
      already_notified := already_notified || reply_author;
    end if;
  end if;

  for mention_username in select distinct (regexp_matches(new.message, '@([a-zA-Z0-9_.]{2,32})', 'g'))[1] loop
    select id into mention_user_id from public.profiles where lower(username) = lower(mention_username);
    if mention_user_id is not null and mention_user_id <> new.user_id and not (mention_user_id = any(already_notified))
       and coalesce((select notify_chat_mentions from public.profiles where id = mention_user_id), true) then
      perform public.notify(mention_user_id, 'chat_mention', format('%s mentioned you in chat', v_sender_name), '/chat/');
      already_notified := already_notified || mention_user_id;
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.notify_on_sea_event_join()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  host uuid;
  ev_type text;
  joiner_name text;
begin
  select host_id, type into host, ev_type from public.sea_events where id = new.event_id;
  select coalesce(display_name, username) into joiner_name from public.profiles where id = new.user_id;
  if host is not null and host <> new.user_id
     and coalesce((select notify_sea_event_joins from public.profiles where id = host), true) then
    perform public.notify(host, 'sea_event_joined',
      format('%s joined your %s event', coalesce(joiner_name, 'Someone'), replace(ev_type, '_', ' ')), '/sea-events/');
  end if;
  return new;
end;
$function$;

-- 4. (2026-08-11) Fixed a real bug: check_challenge_cooldown() only ever blocked
-- resubmission for repeatable challenges with cooldown_hours > 0 — a non-repeatable
-- challenge could be resubmitted infinitely, and nothing stopped duplicate *pending*
-- submissions for any challenge type (queue-spam). Also added period-based resets for
-- rotation challenges (daily/weekly/monthly now mean "once per calendar period", not
-- just "which pool is this drawn from") — previously `rotation` didn't touch completion
-- frequency at all. repeatable=true + cooldown_hours=0 still means fully unlimited
-- repeats with no wait (PvP-style), unchanged.
create or replace function public.check_challenge_cooldown()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_repeatable boolean;
  v_cooldown_hours int;
  v_rotation text;
  v_last_completed timestamptz;
  v_ready_at timestamptz;
  v_pending_exists boolean;
  v_period text;
begin
  select repeatable, cooldown_hours, rotation into v_repeatable, v_cooldown_hours, v_rotation
  from public.challenges where id = new.challenge_id;

  select exists (
    select 1 from public.submissions
    where user_id = new.user_id and challenge_id = new.challenge_id and status = 'pending'
  ) into v_pending_exists;
  if v_pending_exists then
    raise exception 'You already have a pending submission for this challenge.';
  end if;

  select completed_at into v_last_completed
  from public.completions
  where user_id = new.user_id and challenge_id = new.challenge_id;

  if v_last_completed is null then
    return new;
  end if;

  if v_rotation in ('daily', 'weekly', 'monthly') then
    v_period := case v_rotation when 'daily' then 'day' when 'weekly' then 'week' else 'month' end;
    if date_trunc(v_period, v_last_completed) = date_trunc(v_period, now()) then
      raise exception 'You have already completed this % challenge — check back next period.', v_rotation;
    end if;
    return new;
  end if;

  if not v_repeatable then
    raise exception 'You have already completed this challenge.';
  end if;

  if v_cooldown_hours > 0 then
    v_ready_at := v_last_completed + (v_cooldown_hours || ' hours')::interval;
    if now() < v_ready_at then
      raise exception 'on cooldown until %', v_ready_at;
    end if;
  end if;

  return new;
end;
$function$;

-- 5. (2026-08-11) Discord webhook announcements — posts a rich embed to Discord
-- whenever a new giveaway goes active, a trade listing/combo/sea event is posted, or a
-- new active challenge is added. Applied directly against the live project (not run
-- from this file) since it embeds the webhook URL — that URL is only readable inside
-- these SECURITY DEFINER function bodies, never exposed via a client-readable table
-- like site_settings, since anyone who could read it could spam the channel directly.
-- Fire-and-forget via pg_net (already enabled on this project) so a Discord outage can
-- never block giveaway/trade/combo/event/challenge creation.
--
-- Functions: discord_notify(jsonb), bf_item_names_from_jsonb(jsonb),
--            notify_discord_new_giveaway/trade/combo/sea_event/challenge()
-- Triggers:  discord_notify_giveaway   AFTER INSERT OR UPDATE ON giveaways
--              (fires once, when status transitions to 'active' — covers both
--              admin-created giveaways, which insert as active directly, and
--              user-submitted ones, which go pending -> active via review_giveaway())
--            discord_notify_trade      AFTER INSERT ON trade_listings
--            discord_notify_combo      AFTER INSERT ON combos
--            discord_notify_sea_event  AFTER INSERT ON sea_events
--            discord_notify_challenge  AFTER INSERT ON challenges (only when active)
--
-- Tested live 2026-08-11: sent a labeled test embed through discord_notify() directly,
-- confirmed Discord returned 204 (success) via net._http_response.
--
-- To rotate the webhook URL later: replace it inside discord_notify()'s function body
-- and re-run a `create or replace function` — nowhere else references it.
