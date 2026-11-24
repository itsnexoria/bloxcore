# BloxCore

Community site for Blox Fruits (Roblox): quests and ranks, activity feed, crews and crew wars, trading (listings, offers, reputation), inventory and net worth, PvP, services, sea events, giveaways, plus SEO value pages (fruit values, tier lists, comparisons, calculators).

Stack: vanilla HTML/CSS/JS (no frontend build step) + Supabase (auth, Postgres, storage, realtime) + one Cloudflare Worker with static assets. Live at https://bloxcores.com.

## Layout

```
index.html                 homepage (also the source of the shared nav/footer for generated pages)
404.html                   not-found page (served by Workers Assets via not_found_handling)
offline/                   offline fallback page, served by sw.js when a navigation fails
<page>/index.html          one folder per page -> clean URLs (/feed/, /trading/, /crews/ ...)
blox-fruits-*/             generated SEO pages (values, tier lists, compare, calculators, guides)
admin/                     admin panel (noindex, disallowed in robots.txt)
css/style.css              design system; css/pages/*.css are per-page bundles; css/animations.css
js/                        one script per page + shared: supabase-client.js, nav.js, search.js, listings.js
  client-extras.js         less-used helpers split out of supabase-client.js (loaded only where needed)
  feed-sidebar/-poll-builder/-comments.js   lazy-loaded parts of feed.js (loadFeedModule)
  item-votes.js            Overpaid/Fair/Underpaid vote widget on /blox-fruits-values/<item>/ pages
assets/                    logo, icons, og-banner, assets/game/* (item/quest/pvp icons)
worker.js                  Cloudflare Worker: OG images (/og/*), meta rewriting, /csp-report sink
wrangler.jsonc             Worker config (assets dir, run_worker_first routes, 404 handling)
_headers                   security headers + cache rules
sw.js                      service worker: push notifications + offline fallback
scripts/                   generators and checks (see below)
supabase/                  dated SQL change logs + functions/send-push (edge function)
.github/workflows/         regenerate-value-pages.yml (daily), ci.yml (checks on push/PR)
```

All asset and link paths are root-absolute (`/css/style.css`, `/feed/`) so they work at any nesting depth.

## Deploy

Cloudflare builds from this repo and runs `npx wrangler deploy` (a plain Worker with static assets - not Pages, no `functions/` directory). Server-side logic belongs in `worker.js`. New Worker routes must also be added to `assets.run_worker_first` in `wrangler.jsonc`.

## Scripts

Run from the repo root.

| Script | What it does |
| --- | --- |
| `node scripts/generate-item-pages.mjs .` | Regenerates `/blox-fruits-values/*` from the live `bf_items` table |
| `node scripts/generate-guide-pages.mjs .` | Regenerates tier lists, compare pages, trading guide |
| `node scripts/generate-calculator-pages.mjs .` | Regenerates the value-converter and permanent-fruit calculator pages |
| `node scripts/generate-evergreen-guides.mjs .` | Regenerates the evergreen guides (`/blox-fruits-best-fruit-*`, grinding, raids, worth-it), the guides hub, `/about/` and the fruits/swords/guns/accessories hubs. Edit guide copy in that file; it also links every guide into the link graph |
| `node scripts/build-icons.mjs .` | Rebuilds `js/lucide-lite.js` (the ~40 KB icon subset used instead of the full Lucide library). Run after adding an icon: `npm i -D lucide@1.34.0 && node scripts/build-icons.mjs`. Unknown icons fall back to the full library automatically |
| `node scripts/stamp-release.mjs` | Stamps the commit SHA into `js/supabase-client.js` (`BC_RELEASE`). Set it as the host's **build command** so `/admin/errors/` can show which deploy an error first appeared in |
| `node scripts/generate-codes-page.mjs .` | Regenerates `/blox-fruits-codes/` |
| `node scripts/generate-sitemap.mjs .` | Rebuilds `sitemap.xml` / `sitemap.txt` (skips noindex and redirect pages) |
| `node scripts/check-css-split.mjs .` | Warns if a page uses classes from a stylesheet bundle it does not link |
| `node scripts/check-site.mjs .` | Smoke checks: broken local links/assets, robots/canonical/description rules, JS syntax, missing `client-extras.js`, **duplicate top-level `const`/`let`/`class` across scripts on one page** (the `BOUNTY_TIERS` outage), `#anchor` targets, and **orphan pages** (in the sitemap but linked from nowhere) |
| `node scripts/check-deploy.mjs .` | Deploy hygiene: dev files (patches, RECOVERY, sql, zips…) not ignored by `.assetsignore`, `_headers` limits (2,000 chars/line, 100 rules), and `/js` `/css` `/assets` files referenced but missing |
| `node scripts/csp-hashes.mjs .` | Rewrites the strict Report-Only CSP in `_headers` with sha256 hashes of every inline `<script>` (`--check` for CI). Re-run after adding an inline script |

Generated pages take their nav, footer and theme script from `index.html` (`scripts/lib/shell.mjs`), so edit those in `index.html` and re-run the generators.

## Automation

- `regenerate-value-pages.yml` - daily 06:00 UTC (and manual): re-runs the generators and commits only if something changed. Needs Settings -> Actions -> General -> Workflow permissions -> Read and write.
- `ci.yml` - on every push and PR: `check-site.mjs` plus `wrangler deploy --dry-run` against the real `worker.js`, then a Lighthouse job (`lighthouserc.json`): accessibility and SEO scores below the thresholds fail it; performance, CLS, TBT and LCP only warn.

## Conventions

- `js/client-extras.js` must be loaded right after `supabase-client.js` on any page whose scripts use something from it (`reportContent`, `attachLoadMore`, `maybePromptFruitSkin`, ...). `check-site.mjs` fails the build if one is missing.
- Community value votes: table `bf_item_value_votes` (writes only via `vote_item_value()`), counts via `get_item_value_votes()`, homepage Trending uses `get_community_trending()` (>= 5 votes in 30 days, >= 60% one way). SQL: `supabase/CHANGES_2026-11-04_item_value_votes.sql`.
- New private/logged-in pages get `<meta name="robots" content="noindex">` (do not also block them in robots.txt, or crawlers never see the tag).
- Admin links live only in `/admin/`'s own nav, never the main drawer.
- New sensitive Postgres RPCs: explicit `GRANT EXECUTE` and `REVOKE ... FROM PUBLIC`, rate-limit via `check_rate_limit()`.
- JS/CSS are served with `max-age=0, must-revalidate`, so deploys are live immediately; images/fonts cache for 30 days.
- `Content-Security-Policy-Report-Only` in `_headers` reports to `/csp-report` (visible in Workers logs). It is hash-based (no `'unsafe-inline'` for scripts, `script-src-attr 'none'` — don't add inline `onclick=`; use `addEventListener`). Watch the reports for a week — especially the ad network — then rename the header to enforcing `Content-Security-Policy`. `object-src 'none'` is already enforced.
- Ads load only after consent where required (`js/consent.js`, region guessed from the browser time zone; set `window.BC_CONSENT_ALL = true` to ask everyone). `sw.js` caches `/assets/*` (stale-while-revalidate) and `/css`, `/js` (network-first, offline only).
- Ads: the 728x90 and 300x250 units run inside tiny same-origin pages (`/ads/728x90/`, `/ads/300x250/`) loaded by `<iframe loading="lazy">` with fixed sizes (no layout shift, nothing loads until the reader scrolls near it). The 728 slot is hidden below 760px. To change an ad unit, edit the snippet in the matching `ads/*/index.html`. These pages are `noindex`.
- Giveaway strip, Why-join strip, price-alert box and the item-vote box are placeholders filled/hidden by `js/giveaway-strip.js`, an inline script, `js/price-alert.js` and `js/item-votes.js`; the generators emit the markup (see `scripts/lib/guide-ui.mjs`).
- First-time badges (`first_listing`, `first_post`, `first_trade`) and their XP live in `check_achievements()`; bonuses are `site_settings` keys `xp_first_trade_listing`, `xp_first_post`, `xp_first_trade`, `xp_referral_welcome`. Migrations are in `supabase/CHANGES_*.sql`.
- A quiet Discord "value update" post (no role ping) goes to the `trading` webhook via `post_value_changes_digest()` (cron every 15 min, skips small updates). Dry run: `select post_value_changes_digest(true, timestamptz '2026-11-01');`
