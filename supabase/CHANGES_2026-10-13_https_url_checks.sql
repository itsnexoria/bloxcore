-- Applied live 2026-10-13 (migration "https_only_url_checks"). Kept here for the repo record.
-- Backstop to the client-side safeImgUrl() helper: user-writable URL columns must be https,
-- <=500 chars, with no whitespace / quotes / angle brackets / backslash / backtick (the characters
-- that let a URL break out of an HTML attribute or CSS url('') string). NULL is allowed.
-- Existing data was checked first: 0 violating rows across all 14 columns.

create or replace function public.is_safe_https_url(u text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select u is null or (char_length(u) <= 500 and u ~ '^https://[^\s''"<>\\`]+$');
$$;

alter table public.profiles add constraint profiles_avatar_url_https_chk check (public.is_safe_https_url(avatar_url));
alter table public.profiles add constraint profiles_banner_url_https_chk check (public.is_safe_https_url(banner_url));
alter table public.crews add constraint crews_logo_url_https_chk check (public.is_safe_https_url(logo_url));
alter table public.crews add constraint crews_banner_url_https_chk check (public.is_safe_https_url(banner_url));
alter table public.feed_posts add constraint feed_posts_image_url_https_chk check (public.is_safe_https_url(image_url));
alter table public.giveaways add constraint giveaways_image_url_https_chk check (public.is_safe_https_url(image_url));
alter table public.giveaways add constraint giveaways_proof_url_https_chk check (public.is_safe_https_url(proof_url));
alter table public.pvp_result_proofs add constraint pvp_result_proofs_proof_url_https_chk check (public.is_safe_https_url(proof_url));
alter table public.pvp_result_proofs add constraint pvp_result_proofs_video_url_https_chk check (public.is_safe_https_url(video_url));
alter table public.pvp_matches add constraint pvp_matches_link_https_chk check (public.is_safe_https_url(link));
alter table public.submissions add constraint submissions_screenshot_url_https_chk check (public.is_safe_https_url(screenshot_url));
alter table public.tournament_matches add constraint tournament_matches_proof_url_https_chk check (public.is_safe_https_url(proof_url));
alter table public.tournament_matches add constraint tournament_matches_video_url_https_chk check (public.is_safe_https_url(video_url));
alter table public.combos add constraint combos_video_url_https_chk check (public.is_safe_https_url(video_url));
