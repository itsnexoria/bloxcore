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
├── crews/index.html                  browse crews, team leaderboard, create — "/crews/"
├── crew/index.html                   single crew view, e.g. "/crew/?name=SomeCrew"
├── settings/index.html               theme + reduce-motion preferences — "/settings/"
├── profile/index.html                edit your own public profile — "/profile/"
├── player/index.html                 public profile view, e.g. "/player/?u=someusername"
├── admin/index.html                  review queue (mod + admin) — "/admin/"
├── admin/challenges/index.html        challenge CRUD + manual rotation trigger (admin only) — "/admin/challenges/"
├── admin/giveaways/index.html         create giveaways, pick winners (mod + admin) — "/admin/giveaways/"
├── admin/users/index.html             search users, set roles (admin only) — "/admin/users/"
├── admin/titles/index.html            create/delete titles, grant/revoke to users (admin only) — "/admin/titles/"
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
    ├── crews.js                      crews browse + team leaderboard + create
    ├── crew.js                       single crew page — join/leave/edit/kick
    ├── settings.js                   theme + reduce-motion settings
    ├── profile-edit.js               profile edit page logic
    ├── player.js                     public profile view logic
    ├── admin.js                      review-board page logic
    ├── admin-challenges.js           challenge management page logic
    ├── admin-giveaways.js            giveaway management page logic
    ├── admin-users.js                user role management page logic
    └── admin-titles.js               title CRUD + grant/revoke page logic
```

All CSS/JS references and internal links use root-absolute paths (e.g. `/css/style.css`, `/dashboard/`) so they resolve correctly no matter how deep the current page is nested. `/player/` is the one page that isn't purely static — it reads a `?u=username` query string client-side, since a static host can't give every player their own folder.

Navigation is a hamburger + off-canvas drawer on every screen size (not just mobile) — tap the ☰ icon top-right to open it. Opening the drawer locks background scroll.

## Theme

Deep black-blue background, electric cyan glow, icy white text, and a small toxic-green accent — pulled straight from the logo. Bounty cards are cut like faceted ice shards with a cyan glow border.

## Roles

`profiles.role` is one of:
- **`user`** (default) — normal player.
- **`mod`** — can review submissions (approve/reject), create/delete giveaways (including picking winners), delete chat messages, and ban/unban regular users (not admins, not themselves). Can access `/admin/` and `/admin/giveaways/`.
- **`admin`** — everything mod can do, plus manage challenges/rotation (`/admin/challenges/`), manage other users' roles and adjust their XP directly (`/admin/users/`), and create/grant titles and configure seasonal auto-awards (`/admin/titles/`).

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
- Shareable rank-up image generated from a player's profile
- Server-side chat rate-limiting in addition to the client-side cooldown
- Crew banners/icons, crew chat channels

## Changelog

**Fruit stock removed, submission-history fix, titles overhaul, ban/XP admin tools**
- Removed the fruit stock feature entirely (page, nav links, table) — the RapidAPI feed turned out to error on their own backend even with the correct key/host, and there was no working data source left to justify keeping the UI around. The `fetch-fruit-stock` Edge Function is still deployed but unused/harmless; delete it from the Supabase dashboard's Edge Functions page if you want it gone too (no delete-function tool available here).
- **Fixed:** approving/rejecting a submission was deleting it from the player's own history too. Now only the screenshots get cleaned up from storage — the submission row (and its status/admin note) stays, so "Your Submissions" on the dashboard shows your real history again.
- Title equip control moved from the dashboard to `/profile/`, as a dropdown of titles you've been granted.
- Challenges can now specify a **Reward Title** — granted automatically the moment a submission for that challenge is approved.
- **Seasonal auto-titling**: in `/admin/titles/`, pick a title for "Top 10 Leaderboard" and a title for "Top 10 Crew". A scheduled job clears the previous holders and re-awards based on current standings, monthly (cron doesn't support an arbitrary "every 30 days" interval, so monthly-on-the-1st is the closest practical match) — plus a manual "Run Now" button.
- `/admin/users/` gained: a **Recently Active** list (last 10 seen, tracked via a throttled last-active timestamp updated at most every 5 minutes per browser), **Ban/Unban** (can't ban yourself or another admin; a banned player is signed out with the reason shown, and blocked at the database level from posting chat, submitting challenges, or entering giveaways even if they somehow stayed signed in), and a direct **XP adjustment** field (admin only, recalculates level automatically).
- Found and fixed a real gap along the way: several earlier `revoke execute ... from anon` statements weren't actually taking effect, because Postgres grants EXECUTE to the `PUBLIC` pseudo-role by default and that overrides role-specific revokes. Fixed properly (`revoke ... from public`) for the two functions where it mattered — the trigger-only ones that should never be invoked directly. Every staff-gated action function was already safe regardless, since each checks the caller's actual role internally before doing anything.

**SEO, dynamic hero card, avatar/chat/giveaway fixes**
- SEO pass across all 18 pages: per-page meta descriptions, canonical tags, Open Graph + Twitter Card tags (public pages only), `robots.txt`, `sitemap.xml`, and `noindex` on private/account/admin pages. JSON-LD (WebSite + Organization) on the homepage. Canonical URLs use `https://blox.nexorealm.org` (2026-08-10: corrected from an earlier `bloxcore.xyz` placeholder that never matched the real domain — search-and-replace across the HTML files, `robots.txt`, and `sitemap.xml` if the domain ever changes again). `/player/` and `/crew/` are query-string routes so they're left out of the sitemap (no fixed list to enumerate) but aren't blocked from crawling.
- Home page hero card now rotates through real active challenges every 12 seconds (was a static hardcoded example) instead of one fixed demo.
- Giveaways can have a prize icon now, picked from the same game-asset library used for player builds (Fruit/Sword/Gun/Fighting Style/Race/Accessory) — shown on both the admin list and the public giveaway cards.
- Dashboard now shows your avatar image next to the level stamp (it was only showing the stamp before).
- Chat: every message is left-aligned now (was flipping to the right for your own messages), and the page uses the full site width instead of a narrower column.

**Pagination, crews, fruit stock, settings/themes, titles**
- Pagination (20/page) on the leaderboard and all three admin list pages (challenges, giveaways, users).
- Crews (`/crews/` to browse + team leaderboard, `/crew/?name=X` for a single crew) — any player can create one (name, tag, description, leader's Roblox username, a Discord invite) and others can join through the site; one crew per player at a time. Team leaderboard ranks by total member XP. Leaders can edit/kick/delete; admins can also delete any crew.
- Fruit Stock board (`/fruit-stock/`) — later removed, see the changelog entry above for why.
- Settings (`/settings/`) — 3 color themes (Ice/Blood/Toxic) and a Reduce Motion toggle. Theme applies instantly (localStorage) and follows signed-in players to other devices (`profiles.theme`); both apply flash-free via a tiny inline script in every page's `<head>`.
- Titles — admins create titles (name + color) and grant/revoke them to specific players (`/admin/titles/`); players equip one of their owned titles from the dashboard. Shows next to the name on the dashboard, leaderboard, chat, public profile, and crew member lists. A player can only equip a title they've actually been granted (enforced in the same trigger that protects other privileged profile columns).

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
