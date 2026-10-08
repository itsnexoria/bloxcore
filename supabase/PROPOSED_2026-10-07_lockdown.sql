-- PROPOSED (not yet applied) — from the 2026-10-07 Supabase advisor + function audit of BloxCore (hpvwxaubgiyqgqtyjofb).
-- Problem: these SECURITY DEFINER functions have no auth guard and are callable by anyone with the public anon key
-- via /rest/v1/rpc/<name>. They are only ever called by pg_cron jobs or by other SECURITY DEFINER functions owned by
-- postgres (verified), never by the client or RLS policies, so revoking client roles is safe.
-- Worst offenders: discord_notify (anyone could spam your Discord webhooks) and send_weekly_recaps /
-- send_trade_listing_expiry_reminders (anyone could trigger mass notifications).
--
-- NOT touched on purpose: are_friends, is_blocked, has_pending_submission (used inside RLS policies — callers need EXECUTE),
-- and get_pvp_leaderboard / get_giveaway_entry_counts / get_on_this_day / get_vapid_public_key (called from the client).

revoke execute on function public.discord_notify(jsonb) from public, anon, authenticated;
revoke execute on function public.discord_notify(jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.discord_notify_giveaway_winners(uuid) from public, anon, authenticated;
revoke execute on function public.discord_mention_or_name(uuid) from public, anon, authenticated;
revoke execute on function public.sanitize_username(text, uuid) from public, anon, authenticated;

-- pg_cron-only jobs
revoke execute on function public.auto_pick_expired_giveaway_winners() from public, anon, authenticated;
revoke execute on function public.close_season_if_expired() from public, anon, authenticated;
revoke execute on function public.expire_old_watchlist_entries() from public, anon, authenticated;
revoke execute on function public.resolve_roblox_rechecks() from public, anon, authenticated;
revoke execute on function public.resolve_webhook_deliveries() from public, anon, authenticated;
revoke execute on function public.retry_failed_webhook_deliveries() from public, anon, authenticated;
revoke execute on function public.send_trade_listing_expiry_reminders() from public, anon, authenticated;
revoke execute on function public.send_weekly_recaps() from public, anon, authenticated;
revoke execute on function public.start_roblox_rechecks() from public, anon, authenticated;

-- Advisor WARN: mutable search_path
alter function public.validate_trade_listing_items() set search_path = public;
