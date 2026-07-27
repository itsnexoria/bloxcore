# BloxCore — v1

A bounty-board style community site for Blox Fruits: browse challenges, submit screenshot proof, get reviewed, rank up from **Rookie** to **Pirate King**.

Static frontend (vanilla HTML/CSS/JS) + Supabase (auth, database, storage). No build step — deploys as-is.

## File structure

Clean-URL layout: every page except home lives in its own folder as `index.html`, so it's reachable at `/auth/`, `/dashboard/`, etc. with no `.html` in the address bar.

```
bloxcore/
├── index.html                      landing page — served at "/"
├── auth/index.html                  sign in / sign up (email + Discord) — "/auth/"
├── dashboard/index.html              your profile, rank stamp, XP bar, streak, submissions — "/dashboard/"
├── challenges/index.html             bounty board, grouped by daily/weekly/monthly/standing — "/challenges/"
├── leaderboard/index.html            top pirates by level/XP — "/leaderboard/"
├── admin/index.html                  review queue (admins only) — "/admin/"
├── admin/challenges/index.html        challenge CRUD + manual rotation trigger (admins only) — "/admin/challenges/"
├── assets/
│   └── logo.png                     site logo, used as the nav mark and favicon
├── css/
│   └── style.css                    design system
└── js/
    ├── supabase-client.js           Supabase init, rank/XP math, shared helpers
    ├── nav.js                        mobile nav + auth-aware nav links, active-link matching
    ├── auth.js                       auth page logic
    ├── dashboard.js                  dashboard page logic
    ├── challenges.js                 challenges page logic
    ├── leaderboard.js                leaderboard page logic
    ├── admin.js                      review-board page logic
    └── admin-challenges.js           challenge management page logic
```

All CSS/JS references and internal links use root-absolute paths (e.g. `/css/style.css`, `/dashboard/`) so they resolve correctly no matter how deep the current page is nested.

## Theme

Deep black-blue background, electric cyan glow, icy white text, and a small toxic-green accent — pulled straight from the logo. Bounty cards are cut like faceted ice shards with a cyan glow border instead of the earlier parchment look.

## v2 additions

- **Bounty rotation** — challenges can be tagged `daily`, `weekly`, `monthly`, or `none` (always-on/"standing"). A Postgres `pg_cron` job automatically rotates a random subset of each pool in (3 daily / 3 weekly / 2 monthly, on a midnight/Monday/1st-of-month schedule) via `rotate_bounties()`. Admins can also trigger a rotation early from `/admin/challenges/`.
- **Streaks** — `approve_submission()` now tracks each player's `current_streak`/`longest_streak` based on consecutive days with at least one approved submission, and applies a small XP bonus: +10% at a 3-day streak, +25% at 7 days, +50% at 30 days. Shown on the dashboard and leaderboard.
- **Admin challenge management** (`/admin/challenges/`) — create, edit, and archive challenges (title, description, difficulty, XP, rotation pool), plus manual "Rotate Now" buttons.

## Backend (already set up in your Supabase project "BloxCore")

Tables: `profiles`, `challenges`, `submissions`, `ranks`. Row Level Security is on for all of them. Two RPC functions, `approve_submission` and `reject_submission`, handle XP + level math and can only be called by users with `is_admin = true`.

A trigger on `auth.users` auto-creates a `profiles` row on signup (falls back to a `pirate_xxxxx` username if none is set yet, then gets patched to the real username after email signup).

Storage bucket `screenshots` is public-read (so images render on the review board and dashboard) with insert restricted to signed-in users.

### 1. Enable Discord login

In the Supabase dashboard → **Authentication → Providers → Discord**:
1. Create a Discord application at https://discord.com/developers/applications
2. Add OAuth redirect URL: `https://hpvwxaubgiyqgqtyjofb.supabase.co/auth/v1/callback`
3. Copy the Discord Client ID + Secret into Supabase's Discord provider settings and enable it

Also add your site's URL (and `http://localhost:PORT` while testing) under **Authentication → URL Configuration → Redirect URLs**.

### 2. Make yourself an admin

Sign up on the site once, then run this in the Supabase SQL editor:

```sql
update public.profiles set is_admin = true where username = 'your_username';
```

## Deployment

**GitHub:** push this folder as-is — no build step needed.

**Cloudflare Pages:**
- Framework preset: `None`
- Build command: *(leave empty)*
- Build output directory: `/` (repo root, or wherever this folder lands)
- Cloudflare Pages serves `folder/index.html` at `/folder/` automatically — no extra config needed for the clean URLs.

**GitHub Pages:** also serves `folder/index.html` at `/folder/` out of the box, so this same structure works there too.

The Supabase URL and publishable key are already hard-coded in `js/supabase-client.js` — that's expected, the publishable/anon key is safe to expose client-side (RLS does the real access control).

## Notes / known trade-offs

- The `screenshots` bucket is public so image URLs work directly in `<img>` tags — anyone with a direct link can view a screenshot, but files can't be browsed/listed without one.
- Leveling formula: `level = floor(xp / 100) + 1`. Tune the divisor in the `approve_submission` SQL function (and mirror it in `js/supabase-client.js`'s `xpForLevel`) if you want a slower/faster curve.
- No pagination yet on leaderboard (capped at top 50) or admin queue/challenge list — fine at small scale, worth adding if the board gets busy.
- Streak day boundaries use the database server's UTC date, not each player's local timezone.

## Ideas for v3

- Discord webhook ping when a submission is approved
- Crews/teams with a team leaderboard
- Shareable rank-up image generated from a player's profile
- Rate-limit submissions per user per day to prevent spam
