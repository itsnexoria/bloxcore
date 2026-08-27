// BloxCore — shared listing/marketplace + proof-upload + countdown helpers.
//
// These were independently copy-pasted across trading.js, services.js, pvp.js,
// sea-events.js, giveaways.js, and challenges.js. Centralized here so there's one
// place to fix a bug or tweak formatting instead of N places.
//
// Load this after supabase-client.js and build-options.js (needs sb, escapeHtml,
// BUILD_OPTIONS) and before any page script that calls into it.

// ---- Value formatting + bf_items catalog (trading.js, services.js) ---------------------

function formatValue(n) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K`;
  return String(n);
}

const BF_ITEM_RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythical: 4, limited: 5 };

// Fruits sort in their in-game unlock order (via BUILD_OPTIONS.fruit); everything else
// sorts by rarity, then name.
function sortBfItems(items) {
  const fruitOrder = new Map(BUILD_OPTIONS.fruit.map((f, i) => [f.value.toLowerCase(), i]));
  return (items || []).slice().sort((a, b) => {
    if (a.category === 'fruit' && b.category === 'fruit') {
      const ai = fruitOrder.get(a.name.toLowerCase());
      const bi = fruitOrder.get(b.name.toLowerCase());
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
    }
    const rarityDiff = (BF_ITEM_RARITY_ORDER[(a.rarity || '').toLowerCase()] ?? 9) - (BF_ITEM_RARITY_ORDER[(b.rarity || '').toLowerCase()] ?? 9);
    return rarityDiff !== 0 ? rarityDiff : a.name.localeCompare(b.name);
  });
}

// Fetches the tradeable/priceable item catalog (fruits, limiteds, gamepasses by default),
// pre-sorted. Each page keeps the result in its own module-level array and looks items up
// by id itself — the catalog is small enough site-wide that there's no need for a shared
// cache here.
async function fetchBfItemCatalog(categories = ['fruit', 'limited', 'gamepass']) {
  const { data } = await sb.from('bf_items').select('*').in('category', categories);
  return sortBfItems(data);
}

function valueFor(item, valueType) {
  // Skins and gamepasses only ever have a regular_value (they're always account-bound,
  // never a "physical" dupeable drop like a fruit can be), so permanent_value is null for
  // them — fall back to regular_value rather than showing a blank/zero value.
  return valueType === 'permanent' ? (item.permanent_value ?? item.regular_value) : item.regular_value;
}

// Picker grid tile — icon only, tinted by rarity. No value shown here: which value applies
// (physical vs. permanent) isn't decided until the item is actually added to a side.
function pickerTileHtml(item) {
  const rarity = (item.rarity || '').toLowerCase();
  return `
    <div class="build-modal-tile" data-rarity="${rarity}" data-pick-item="${item.id}" style="padding:8px;">
      ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-lg"></i>`}
      <span style="font-size:0.72rem;">${escapeHtml(item.name)}</span>
    </div>
  `;
}

// Slot / listing tile — shows the value for whichever type is set, and (when editable) a
// small toggle to flip between physical and permanent.
function valueTileHtml(item, valueType, { editable = false } = {}) {
  const rarity = (item.rarity || '').toLowerCase();
  const value = valueFor(item, valueType);
  // Only fruits can be a "physical" drop vs. a permanent (gamepass-bought) copy — skins and
  // gamepasses are always permanent, so don't offer a toggle that has nothing to toggle to.
  const canToggle = editable && item.category === 'fruit';
  return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
      <div class="build-modal-tile" data-rarity="${rarity}" style="width:56px; height:56px; padding:4px; cursor:default;" title="${escapeHtml(item.name)} — ${item.trend || 'stable'} trend, demand ${item.demand ?? '?'}/10">
        ${item.icon_url ? `<img src="${item.icon_url}" alt="" loading="lazy" onerror="this.style.display='none';">` : `<i data-lucide="sparkles" class="icon-md"></i>`}
      </div>
      <span style="font-size:0.66rem; font-family:var(--font-mono); color:var(--gold-bright);">${formatValue(value)}</span>
      ${canToggle
        ? `<button type="button" class="tag tag-${valueType === 'permanent' ? 'legendary' : 'medium'}" data-toggle-value-type style="border:none; cursor:pointer;">${valueType === 'permanent' ? 'Permanent' : 'Physical'}</button>`
        : `<span class="tag tag-${valueType === 'permanent' ? 'legendary' : 'medium'}">${valueType === 'permanent' ? 'Permanent' : 'Physical'}</span>`}
    </div>
  `;
}

// ---- Deep-link scroll-to (trading.js, services.js, combos.js) --------------------------

function scrollToHashTarget(attr) {
  const id = location.hash.slice(1);
  if (!id) return;
  const el = document.querySelector(`[${attr}="${id}"]`);
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('deep-link-highlight');
  }, 150);
}

// ---- Countdown formatting ---------------------------------------------------------------

// Short-lived listings (trading, services): hours/minutes only, no "ends"/"expires" verb.
function hoursLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  const hrs = Math.floor(ms / 3600000);
  if (hrs < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  return `${hrs}h`;
}

// Longer-lived listings (pvp matches, giveaways): day/hour granularity, "Ends in ...".
function timeRemaining(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Ending soon';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `Ends in ${days}d ${hours}h`;
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `Ends in ${hours}h ${minutes}m`;
  return `Ends in ${minutes}m`;
}

// Sea events run much shorter than pvp/giveaways, so this reads "Expires in ...", down to
// the minute, and reports "Expired" rather than "Ending soon" once it's past.
function timeRemainingCompact(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'Expires in <1m';
  if (minutes < 60) return `Expires in ${minutes}m`;
  return `Expires in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// ---- Link validation (pvp.js, sea-events.js) --------------------------------------------

function isRobloxLink(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'roblox.com' || host.endsWith('.roblox.com');
  } catch {
    return false;
  }
}

// ---- Screenshot proof upload (challenges.js, pvp.js, giveaways.js) ----------------------

// Uploads to the shared 'screenshots' storage bucket under the user's own folder and
// returns the public URL. `key` should already be a unique-enough string (callers include
// their own id + Date.now(), same as before this was centralized) — this just wraps the
// upload + getPublicUrl boilerplate that was identical in all three callers.
async function uploadScreenshot(userId, file, key) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/${key}.${ext}`;
  const { error: uploadError } = await sb.storage.from('screenshots').upload(path, file);
  if (uploadError) throw uploadError;
  const { data } = sb.storage.from('screenshots').getPublicUrl(path);
  return data.publicUrl;
}

// ---- Trivial modal close-by-id (challenges.js, crews.js each had their own one-liner) ---

function hideModalById(id) {
  document.getElementById(id).style.display = 'none';
}
