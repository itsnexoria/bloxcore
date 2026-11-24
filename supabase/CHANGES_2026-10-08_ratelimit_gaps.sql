-- APPLIED to live BloxCore project on 2026-10-08 (migration: rate_limit_remaining_user_write_tables).
-- Extends the trg_rate_limit() coverage from CHANGES_2026-10-08.sql to the remaining user-facing write tables.
-- Args: (action, max events, window in minutes). Mods/admins and cron/service role are exempt (see trg_rate_limit).
create trigger rl_trade_listings   before insert on public.trade_listings   for each row execute function public.trg_rate_limit('trade_listing', 10, 60);
create trigger rl_service_listings before insert on public.service_listings for each row execute function public.trg_rate_limit('service_listing', 5, 60);
create trigger rl_combos           before insert on public.combos           for each row execute function public.trg_rate_limit('combo_post', 5, 60);
create trigger rl_submissions      before insert on public.submissions      for each row execute function public.trg_rate_limit('submission', 10, 60);
create trigger rl_vouches          before insert on public.vouches          for each row execute function public.trg_rate_limit('vouch', 10, 60);
create trigger rl_item_watchlist   before insert on public.item_watchlist   for each row execute function public.trg_rate_limit('watchlist_add', 50, 10);
create trigger rl_crew_wars        before insert on public.crew_wars        for each row execute function public.trg_rate_limit('crew_war', 5, 60);
create trigger rl_giveaway_entries before insert on public.giveaway_entries for each row execute function public.trg_rate_limit('giveaway_entry', 30, 10);
create trigger rl_blocked_users    before insert on public.blocked_users    for each row execute function public.trg_rate_limit('block_user', 20, 10);
