# BloxCore — v1

A bounty-board style community site for Blox Fruits: browse challenges, submit screenshot proof, get reviewed, rank up from **Rookie** to **Pirate King**.

Static frontend (vanilla HTML/CSS/JS) + Supabase (auth, database, storage). No build step — deploys as-is.

## File structure

Clean-URL layout: every page except home lives in its own folder as `index.html`, so it's reachable at `/auth/`, `/dashboard/`, etc. with no `.html` in the address bar.

```
bloxcore/
├── index.html               landing page — served at "/"
├── auth/index.html           sign in / sign up (email + Discord) — "/auth/"
├── dashboard/index.html       your profile, rank stamp, XP bar, submissions — "/dashboard/"
├── challenges/index.html      bounty board — browse + claim + submit proof — "/challenges/"
├── leaderboard/index.html     top pirates by level/XP — "/leaderboard/"
├── admin/index.html           review queue (admins only) — "/admin/"
├── css/
│   └── style.css             design system (bounty-poster theme)
└── js/
    ├── supabase-client.js    Supabase init, rank/XP math, shared helpers
    ├── nav.js                 mobile nav + auth-aware nav links, active-link matching
    ├── auth.js                auth page logic
    ├── dashboard.js           dashboard page logic
    ├── challenges.js          challenges page logic
    ├── leaderboard.js         leaderboard page logic
    └── admin.js               admin page logic
```

All CSS/JS references and internal links use root-absolute paths (e.g. `/css/style.css`, `/dashboard/`) so they resolve correctly no matter how deep the current page is nested.

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

## Notes / known trade-offs for v1

- The `screenshots` bucket is public so image URLs work directly in `<img>` tags — anyone with a direct link can view a screenshot, but files can't be browsed/listed without one.
- Leveling formula: `level = floor(xp / 100) + 1`. Tune the divisor in the `approve_submission` SQL function (and mirror it in `js/supabase-client.js`'s `xpForLevel`) if you want a slower/faster curve.
- No pagination yet on leaderboard (capped at top 50) or admin queue — fine at small scale, worth adding if the board gets busy.

## Ideas for v2

- Discord webhook ping when a submission is approved
- Weekly/seasonal bounty rotation
- Badges for streaks (e.g. 7 days in a row)
- Comments/reactions on the leaderboard
