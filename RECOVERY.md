# READ FIRST — recovering from my earlier zips, and the new files

## What went wrong
The repo zip I was given at the start of our chat was **older than your live site** (your site has things it
doesn't: the "Skip to content" link, /whats-new/, newer scripts…). My earlier zips replaced whole shared files
(`css/style.css`, `js/supabase-client.js`, the generators…) with versions built from that older snapshot, which can
undo your newer work. Your own `client_errors` table shows the damage: `Identifier 'BOUNTY_TIERS' has already been
declared` went 4 → 25 → 44 hits/day (Nov 4 → 5 → 6) across /feed/, /friends/, /trading/, /admin/… That SyntaxError
stops the whole script that contains it, which breaks features on those pages (reactions, menus, …). The unstyled
"Skip to content" link is almost certainly `css/style.css` losing its skip-link rule.

## 1. Stop the bleeding (2 minutes)
```
grep -rn "BOUNTY_TIERS" --include=*.js --include=*.html . | grep -v node_modules
```
There must be exactly ONE declaration. If two files declare it, delete the extra one (the one from my zip is in
`js/supabase-client.js`).

## 2. Put your newer files back, then re-apply only what you want
In git, find the commit just before you applied my first zip:
```
git log --oneline -- css/style.css js/supabase-client.js
git checkout <that-commit> -- css/style.css js/supabase-client.js js/dashboard.js js/admin-overview.js \
  auth/index.html admin/overview/index.html admin/manage/index.html services/index.html \
  css/pages/admin-overview.css css/pages/admin-manage.css css/pages/auth.css css/pages/friends.css \
  scripts/generate-item-pages.mjs scripts/generate-guide-pages.mjs scripts/lib/shell.mjs scripts/lib/sparkline.mjs
```
`patches/` holds my edits to each of those files as a diff against the old snapshot. Re-apply any you still want
(dry-run first; conflicts land in `.rej` files so nothing is silently overwritten):
```
patch -p1 --dry-run < patches/09-css__style.css.patch      # then again without --dry-run
```
The generators (15, 16, 18, 19) are the riskiest: if your newer generators have features mine lack (breadcrumb/
ItemList schema, "similar value" block, skip link), keep yours and skip those patches.
Regenerated `blox-fruits-*` pages from my zips are built from the old generators — re-run your workflow after.

## 3. Files that are safe to take as-is (brand new, nothing of yours to overwrite)
`js/engage.js`, `js/traffic.js`, `js/seo-live.js`, `css/pages/seo.css`, `scripts/lib/seo-ui.mjs`, `supabase/*.sql`

## 4. Turn on the new features (one line, no edits to my old files)
Append to the END of `js/nav.js` (it already runs on every page):
```js
['engage', 'traffic'].forEach(n => { const s = document.createElement('script'); s.src = '/js/' + n + '.js'; document.head.appendChild(s); });
```
* `engage.js` — soft sign-up card for logged-out visitors, one-tap Discord sheet, and on phones the post/new-listing
  buttons become floating buttons (the /feed/ composer becomes a bottom sheet).
* `traffic.js` — the live-visitor / daily-weekly-monthly counter for the admin Traffic card (DB side is already live).
  If you already run the tracker from my old `supabase-client.js`, the database ignores the duplicate calls.

## 5. Hide browser-extension noise from the error log
In `reportClientError(message, stack)` add as the first line:
```js
if (/(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i.test(`${stack || ''} ${message || ''}`) || /^Script error\.?$/i.test(String(message || ''))) return;
```
