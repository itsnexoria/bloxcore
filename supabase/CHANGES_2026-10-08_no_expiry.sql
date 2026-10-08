-- APPLIED to live BloxCore project on 2026-10-08 (migration: admin_no_expiry_listings).
-- duration_hours = 0 means "never expires" (admin only). Stored as expires_at = 2100-01-01 so every
-- "expires_at > now()" filter, cleanup cron and RLS rule keeps working unchanged (no NULL handling needed).
-- Non-admins posting duration_hours = 0 get: "Only admins can post ... with no expiry."
alter table public.trade_listings drop constraint trade_listings_duration_check;
alter table public.trade_listings add constraint trade_listings_duration_check check (duration_hours = 0 or (duration_hours >= 1 and duration_hours <= 24));
alter table public.sea_events drop constraint sea_events_duration_check;
alter table public.sea_events add constraint sea_events_duration_check check (duration_hours = 0 or (duration_hours >= 1 and duration_hours <= 24));
-- set_trade_listing_expiry(), set_sea_event_expiry(), set_service_listing_expiry(): if duration_hours = 0 -> require
-- profiles.role = 'admin' for auth.uid(), then expires_at := '2100-01-01'; else unchanged (now()/created_at + N hours).
-- All three are SECURITY DEFINER with search_path=public and EXECUTE revoked from public/anon/authenticated.
