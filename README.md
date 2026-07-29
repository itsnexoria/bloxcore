# BloxCore

A bounty-board style community site for Blox Fruits: browse challenges, submit proof, get reviewed, rank up from **Rookie** to **Pirate King** — plus a live activity feed, global chat, and giveaways.

Static frontend (vanilla HTML/CSS/JS) + Supabase (auth, database, storage, realtime). No build step — deploys as-is.

## File structure

Clean-URL layout: every page except home lives in its own folder as `index.html`, so it's reachable at `/auth/`, `/dashboard/`, etc. with no `.html` in the address bar.

```
bloxcore/
├── index.html                      landing page + live activity feed — served at "/"
├── auth/index.html                  sign in / sign up (email + Discord) — "/auth/"
├── dashboard/index.html              your profile, rank stamp, XP bar, streak, submissions — "/dashboard/"
├── challenges/index.html             bounty board, grouped by daily/weekly/monthly/standing — "/challenges/"
├── leaderboard/index.html            top pirates by level/XP — "/leaderboard/"
├── chat/index.html                   global realtime chat — "/chat/"
├── giveaways/index.html              active + past giveaways, entry — "/giveaways/"
├── profile/index.html                edit your own public profile — "/profile/"
├── player/index.html                 public profile view, e.g. "/player/?u=someusername"
├── admin/index.html                  review queue (mod + admin) — "/admin/"
├── admin/challenges/index.html        challenge CRUD + manual rotation trigger (admin only) — "/admin/challenges/"
├── admin/giveaways/index.html         create giveaways, pick winners (mod + admin) — "/admin/giveaways/"
├── admin/users/index.html             search users, set roles (admin only) — "/admin/users/"
├── assets/
│   ├── logo.png                     site logo, used as the nav mark and favicon
│   └── game/                        Blox Fruits wiki icon scrape (fruits/swords/guns/melee/races/accessories), used for build selectors
├── css/
│   └── style.css                    design system
└── js/
    ├── supabase-client.js           Supabase init, rank/XP/bounty formatting, shared helpers
    ├── nav.js                        hamburger + off-canvas drawer nav, role-aware links, scroll lock
    ├── build-options.js              generated build option lists (fruit/sword/gun/melee/race/accessory) with icon paths
    ├── auth.js                       auth page logic
    ├── dashboard.js                  dashboard page logic
    ├── challenges.js                 challenges page logic
    ├── leaderboard.js                leaderboard page logic
    ├── activity.js                   home page live activity feed (realtime)
    ├── chat.js                       global chat logic (realtime)
    ├── giveaways.js                  public giveaways page logic
    ├── profile-edit.js               profile edit page logic
    ├── player.js                     public profile view logic
    ├── admin.js                      review-board page logic
    ├── admin-challenges.js           challenge management page logic
    ├── admin-giveaways.js            giveaway management page logic
    └── admin-users.js                user role management page logic
```

All CSS/JS references and internal links use root-absolute paths (e.g. `/css/style.css`, `/dashboard/`) so they resolve correctly no matter how deep the current page is nested. `/player/` is the one page that isn't purely static — it reads a `?u=username` query string client-side, since a static host can't give every player their own folder.

Navigation is a hamburger + off-canvas drawer on every screen size (not just mobile) — tap the ☰ icon top-right to open it. Opening the drawer locks background scroll.

## Theme

Deep black-blue background, electric cyan glow, icy white text, and a small toxic-green accent — pulled straight from the logo. Bounty cards are cut like faceted ice shards with a cyan glow border.

## Roles

`profiles.role` is one of:
- **`user`** (default) — normal player.
- **`mod`** — can review submissions (approve/reject), create/delete giveaways (including picking winners), and delete chat messages. Can access `/admin/` and `/admin/giveaways/`.
- **`admin`** — everything mod can do, plus manage challenges/rotation (`/admin/challenges/`) and manage other users' roles (`/admin/users/`).

Role changes go through `set_user_role()`, a narrow admin-only function — not a broad "admin can edit any profile" policy — so promoting someone to mod/admin doesn't also hand over edit access to their bio/bounty/build fields. An admin can't remove their own admin access (avoids accidentally locking everyone out).

## Backend (already set up in your Supabase project "BloxCore")

Row Level Security is on for every table. `approve_submission`/`reject_submission` (mod+admin), `pick_giveaway_winner` (mod+admin), `rotate_bounties` (admin only), and `set_user_role` (admin only) are all `SECURITY DEFINER` functions that check the caller's role internally before doing anything.

A trigger on `auth.users` auto-creates a `profiles` row on signup (falls back to a `pirate_xxxxx` username if none is set yet, then gets patched to the real username after email signup).

Storage buckets `screenshots` and `avatars` are public-read (so images render without extra auth) with insert restricted to signed-in users.

### 1. Enable Discord login

In the Supabase dashboard → **Authentication → Providers → Discord**:
1. Create a Discord application at https://discord.com/developers/applications
2. Add OAuth redirect URL: `https://hpvwxaubgiyqgqtyjofb.supabase.co/auth/v1/callback`
3. Copy the Discord Client ID + Secret into Supabase's Discord provider settings and enable it

Also add your site's URL (and `http://localhost:PORT` while testing) under **Authentication → URL Configuration → Redirect URLs**.

### 2. Make yourself an admin

Sign up on the site once, then run this in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where username = 'your_username';
```

(Use `role = 'mod'` instead if you want mod-level access for someone. Once you have one admin account, further role changes can be done from `/admin/users/` instead of SQL.)

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

- The `screenshots` and `avatars` buckets are public so image URLs work directly in `<img>` tags — anyone with a direct link can view a file, but files can't be browsed/listed without one.
- Leveling formula: `level = floor(xp / 100) + 1`. Tune the divisor in the `approve_submission` SQL function (and mirror it in `js/supabase-client.js`'s `xpForLevel`) if you want a slower/faster curve.
- No pagination yet on leaderboard (capped at top 50), admin queue/challenge/user list, or activity feed (capped at 15) — fine at small scale, worth adding if the board gets busy.
- Streak day boundaries use the database server's UTC date, not each player's local timezone.
- Pirate Bounty / Marine Bounty are self-reported flavor stats (fixed 2.5M-step tiers, 2.5M–30M) — not verified against anything, for profile flair rather than leaderboard ranking.
- `/player/?u=username` is a query-string route rather than a folder per player, since a static host can't pre-build a folder for every signup.
- Chat's 10-second send cooldown is client-side only — fine for casual spam, not someone hitting the API directly. Worth server-side rate-limiting if that becomes a problem.
- A challenge's one-time-per-player limit is enforced at the database level (an RLS check against a permanent `completions` table), not just hidden in the UI — but a challenge you mark `repeatable` (used for PvP-style challenges) can be claimed any number of times.

## Ideas for later

- Discord webhook ping when a submission is approved, a giveaway ends, or a chat message gets flagged
- Crews/teams with a team leaderboard
- Shareable rank-up image generated from a player's profile
- Server-side chat rate-limiting in addition to the client-side cooldown

## Changelog

**Roles, chat/giveaway polish, multi-proof submissions**
- Two-tier staff roles (`mod`/`admin`) replacing the old single `is_admin` flag — see **Roles** above.
- Drawer: locks background scroll while open; reordered to Home / Live Chat / Giveaways / Challenges / Leaderboard.
- Chat: wider layout (920px), 10-second send cooldown (was 2s).
- Multi-proof submissions — up to 5 screenshots and/or a video link per submission, so grindy challenges ("defeat 50 bosses") aren't stuck proving themselves with one screenshot. The review board shows the full gallery plus a "Watch video" link, and cleans up every screenshot from storage after review.
- Discord server invite added to profile social links.
- Social links show platform icons (simple generic glyphs, not exact brand logos) instead of text labels.

**Chat, giveaways, admin users, repeatable challenges, nav fixes**
- Global chat (`/chat/`) — realtime, public read, sign-in to post, staff can delete any message inline.
- Giveaways (`/giveaways/` public, `/admin/giveaways/` for staff) — prize/description/end-time, one entry per player, "Pick Winner" logs a `giveaway_win` to the public activity feed. Entry counts are public without exposing who entered.
- Admin user management (`/admin/users/`) — search players, set roles.
- Challenges are one-time-per-player by default (a `completions` table survives the auto-deleted submission rows); PvP-flavored challenges got flagged repeatable automatically, new ones get a checkbox.
- Site name added next to the logo. Fixed the drawer breaking on scroll (`100vh` doesn't track a mobile browser's collapsing toolbar; switched to `100dvh` with a `100vh` fallback). Renamed nav labels ("Profile" instead of your own name, "Admin" instead of "Review Board").

**Drawer redesign, display names, bounty tiers, build popup**
- Drawer redesign — "Menu" header label, full-width hover pills, active-page accent bar, divider before the account section, nicer hamburger button. Editing your profile is only reachable via the dashboard button, not the drawer.
- Display Name field, separate from your fixed/unique username — shows everywhere a name appears.
- Pirate/Marine Bounty are fixed 2.5M-step tier dropdowns (2.5M–30M), displayed compactly ("10M" not "10,000,000").
- Build picker is a searchable icon-grid popup instead of a giant native `<select>`.
- Fruit list cross-referenced against the wiki's own stats file (which separates real fruits from "Skins:"/"Mutations:") — removed 25 skin/mutation/unverified entries, leaving the 41 canonical base fruits.

**Nav/scrollbar fixes, admin's own nav, animations, player builds**
- Fixed the drawer washing out to near-illegible when opened (`.nav`'s stacking context was trapping the drawer under the dimming overlay — raised `.nav`'s z-index above it).
- Fixed a stray horizontal scrollbar clipping page content (`overflow-x: hidden` on `html`/`body`).
- Admin pages get their own dedicated nav (Review Board / Manage Challenges / View Site) instead of the public links, with an "Admin" badge next to the logo.
- Custom scrollbars site-wide; more motion throughout (card fade-ins, hover lifts, a breathing pulse on rank stamps, fading toasts).
- Player builds (Fruit/Race/Sword/Gun/Fighting Style/Accessory) on `/profile/`, shown as an icon grid on `/player/`.

**Bug fix + auto-cleanup + asset library**
- Fixed the admin review board failing to load submissions (an unqualified `profiles(username)` join was ambiguous — `submissions` has two FKs into `profiles` — fixed by specifying the FK explicitly).
- Reviewed submissions (approved or rejected) now auto-delete their screenshot + row afterward to keep storage/DB lean. XP/streak/rank effects and the public activity-feed record are unaffected — only the now-redundant screenshot and submission row go.
- Added `assets/game/` — Blox Fruits wiki icon scrape (fruits/swords/guns/melee/races/accessories) plus fruit stats, staged for future features.

**Customizable profiles, universal drawer nav, challenge CRUD, activity feed**
- `/admin/challenges/` got a real permanent Delete alongside Archive/Restore.
- Live activity feed on the home page (realtime).
- Customizable public profiles (`/profile/` to edit, `/player/?u=username` to view) — avatar, bio, region, bounties, social links.
- Universal hamburger + drawer nav on every screen size.
- A Postgres trigger blocks non-admin users from changing privileged profile columns (xp, level, role, streaks, Discord identity) via a direct update, even though the self-edit RLS policy is otherwise open.

**Bounty rotation, streaks, admin challenge management**
- Challenges can be tagged `daily`/`weekly`/`monthly`/`none`; a `pg_cron` job auto-rotates a random subset of each pool on schedule.
- Streaks — consecutive-day completion tracking with a small XP bonus (+10% at 3 days, +25% at 7, +50% at 30).
- `/admin/challenges/` — create/edit/archive challenges, manual "Rotate Now" buttons.
