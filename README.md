# BloxCore — v1

A bounty-board style community site for Blox Fruits: browse challenges, submit screenshot proof, get reviewed, rank up from **Rookie** to **Pirate King**.

Static frontend (vanilla HTML/CSS/JS) + Supabase (auth, database, storage). No build step — deploys as-is.

## File structure

Clean-URL layout: every page except home lives in its own folder as `index.html`, so it's reachable at `/auth/`, `/dashboard/`, etc. with no `.html` in the address bar.

```
bloxcore/
├── index.html                      landing page + live activity feed — served at "/"
├── auth/index.html                  sign in / sign up (email + Discord) — "/auth/"
├── dashboard/index.html              your profile, rank stamp, XP bar, streak, submissions — "/dashboard/"
├── challenges/index.html             bounty board, grouped by daily/weekly/monthly/standing — "/challenges/"
├── leaderboard/index.html            top pirates by level/XP — "/leaderboard/"
├── profile/index.html                edit your own public profile — "/profile/"
├── player/index.html                 public profile view, e.g. "/player/?u=someusername"
├── admin/index.html                  review queue (admins only) — "/admin/"
├── admin/challenges/index.html        challenge CRUD + manual rotation trigger (admins only) — "/admin/challenges/"
├── assets/
│   ├── logo.png                     site logo, used as the nav mark and favicon
│   └── game/                        Blox Fruits wiki icon scrape (fruits/swords/guns/melee/races/accessories), used for build selectors
├── css/
│   └── style.css                    design system
└── js/
    ├── supabase-client.js           Supabase init, rank/XP math, shared helpers
    ├── nav.js                        hamburger + off-canvas drawer nav, auth-aware links, active-link matching
    ├── build-options.js              generated build option lists (fruit/sword/gun/melee/race/accessory) with icon paths
    ├── auth.js                       auth page logic
    ├── dashboard.js                  dashboard page logic
    ├── challenges.js                 challenges page logic
    ├── leaderboard.js                leaderboard page logic
    ├── activity.js                   home page live activity feed (realtime)
    ├── profile-edit.js               profile edit page logic
    ├── player.js                     public profile view logic
    ├── admin.js                      review-board page logic
    └── admin-challenges.js           challenge management page logic
```

All CSS/JS references and internal links use root-absolute paths (e.g. `/css/style.css`, `/dashboard/`) so they resolve correctly no matter how deep the current page is nested. `/player/` is the one page that isn't purely static — it reads a `?u=username` query string client-side, since a static host can't give every player their own folder.

Navigation is a hamburger + off-canvas drawer on every screen size (not just mobile) — tap the ☰ icon top-right to open it.

## Theme

Deep black-blue background, electric cyan glow, icy white text, and a small toxic-green accent — pulled straight from the logo. Bounty cards are cut like faceted ice shards with a cyan glow border instead of the earlier parchment look.

## v2 additions

- **Bounty rotation** — challenges can be tagged `daily`, `weekly`, `monthly`, or `none` (always-on/"standing"). A Postgres `pg_cron` job automatically rotates a random subset of each pool in (3 daily / 3 weekly / 2 monthly, on a midnight/Monday/1st-of-month schedule) via `rotate_bounties()`. Admins can also trigger a rotation early from `/admin/challenges/`.
- **Streaks** — `approve_submission()` now tracks each player's `current_streak`/`longest_streak` based on consecutive days with at least one approved submission, and applies a small XP bonus: +10% at a 3-day streak, +25% at 7 days, +50% at 30 days. Shown on the dashboard and leaderboard.
- **Admin challenge management** (`/admin/challenges/`) — create, edit, and archive challenges (title, description, difficulty, XP, rotation pool), plus manual "Rotate Now" buttons.

## v3 additions

- **Full challenge CRUD** — `/admin/challenges/` now has a real permanent **Delete** alongside Archive/Restore (with a confirm warning, since deleting cascades to any submissions tied to that challenge).
- **Live activity feed** on the home page — recent challenge approvals and rank-ups, backed by a public `activity_log` table populated automatically inside `approve_submission()`. Updates in real time via Supabase Realtime (no refresh needed) with a fallback initial load for anyone who arrives after the fact.
- **Customizable public profiles** — `/profile/` lets a signed-in player set an avatar (uploaded to a public `avatars` bucket), bio, region, Pirate Bounty, Marine Bounty, and social links (YouTube/Twitch/X/TikTok). `/player/?u=username` is the public view anyone can see — linked from the leaderboard, activity feed, and dashboard.
- **Universal hamburger + drawer nav** — the ☰ menu is now the nav pattern on every screen size, not just mobile, sliding in from the right with a dimmed backdrop.
- **Profile column protection** — a Postgres trigger (`protect_profile_privileged_columns`) blocks non-admin users from changing their own `xp`, `level`, `is_admin`, streak fields, or Discord identity via a direct profile update, even though the update-own-row RLS policy is otherwise open. Only the safe self-service fields (bio, avatar, socials, bounty numbers, region, username) go through.

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

## v4 additions / fixes

- **Fixed: admin review board couldn't load submissions.** `submissions` has two foreign keys into `profiles` (`user_id` and `reviewed_by`), so the review board's unqualified `profiles(username)` join was ambiguous to PostgREST and failed with a "300 Multiple Choices" error — the queue just silently showed nothing. Fixed by specifying the FK explicitly (`profiles!submissions_user_id_fkey(username)`). Submitting a bounty itself was already working; this only affected the admin's view of the queue.
- **Auto-cleanup after review.** Once an admin approves or rejects a submission, its screenshot is deleted from storage and the submission row itself is deleted from the database — keeping both lean over time. The XP/level/streak effects of an approval are already permanently recorded on the player's profile, and the completion is preserved forever in the public `activity_log`, so no outcome is lost — only the now-redundant screenshot and submission record. **Trade-off:** a player's dashboard "Your Submissions" list will only ever show submissions still awaiting review — reviewed ones disappear once cleaned up. If you'd rather keep full submission history, say so and this can be changed to only delete the screenshot (keeping a lightweight row).
- **Game asset library** (`assets/game/`) — icons scraped from the Blox Fruits wiki: Fruits, Swords, Guns, Melee styles, Races, and Accessories, plus `assets/game/Fruits/Fruit_Data.txt` with rarity/price/trade-value stats. Not wired into the site yet — just staged for future features (e.g. challenge icons, a fruit database page, race selection on profiles). These are game-owned assets from the wiki, so keep any use to fan/informational context in line with the "unofficial fan project" framing already in the footer.

## v5 additions / fixes

- **Fixed: the drawer washed out to near-illegible when opened.** `.nav` establishes its own CSS stacking context (`position: sticky` + `z-index`), which traps its descendants — the drawer and hamburger button — inside that context. Since the dimming overlay lives at the document root with a *higher* z-index than `.nav`'s own, the whole drawer was rendering underneath the overlay instead of above it, even though the drawer's z-index was higher *within* its trapped context. Fixed by raising `.nav`'s z-index above the overlay's.
- **Fixed: a stray horizontal scrollbar could clip page content** (rotated bounty cards can extend slightly past 100vw). `overflow-x: hidden` on `html`/`body` now prevents that outright.
- **Admin gets its own nav** — `/admin/` and `/admin/challenges/` now show a dedicated drawer (Review Board / Manage Challenges / View Site) instead of the public Home/Challenges/Leaderboard links, with a small "Admin" badge next to the logo so it's unmistakable which mode you're in.
- **Custom scrollbars** site-wide (thin, dark track, cyan-on-hover thumb) for both Chromium/WebKit and Firefox.
- **More motion throughout** — cards/panels fade up on entry, bounty cards lift on hover, rank stamps have a slow breathing pulse, nav links nudge sideways on hover, and toasts fade in/out instead of popping.
- **Player builds** — `/profile/` now has Fruit, Race, Sword, Gun, Fighting Style, and Accessory selectors, populated from the Blox Fruits asset scrape (`assets/game/`). Shown as an icon grid on the public `/player/` page.

## Notes / known trade-offs

- The `screenshots` and `avatars` buckets are public so image URLs work directly in `<img>` tags — anyone with a direct link can view a file, but files can't be browsed/listed without one.
- Leveling formula: `level = floor(xp / 100) + 1`. Tune the divisor in the `approve_submission` SQL function (and mirror it in `js/supabase-client.js`'s `xpForLevel`) if you want a slower/faster curve.
- No pagination yet on leaderboard (capped at top 50), admin queue/challenge list, or activity feed (capped at 15) — fine at small scale, worth adding if the board gets busy.
- Streak day boundaries use the database server's UTC date, not each player's local timezone.
- Pirate Bounty / Marine Bounty are self-reported flavor stats (not verified against anything) — they're for profile flair, not leaderboard ranking.
- `/player/?u=username` is a query-string route rather than a folder per player, since a static host can't pre-build a folder for every signup.

## Ideas for v4

- Discord webhook ping when a submission is approved
- Crews/teams with a team leaderboard
- Shareable rank-up image generated from a player's profile
- Rate-limit submissions per user per day to prevent spam
