-- apply_referral() writes an activity_log row of type 'referral', but the check constraint only allowed four other
-- types, so every referral attempt raised an error and rolled back (0 of the first 57 profiles ever had a referrer).
alter table public.activity_log drop constraint if exists activity_log_type_check;
alter table public.activity_log add constraint activity_log_type_check
  check (type = any (array['challenge_approved'::text, 'rank_up'::text, 'giveaway_win'::text, 'daily_login'::text, 'referral'::text]));
