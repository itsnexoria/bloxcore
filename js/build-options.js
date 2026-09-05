// BloxCore — build option lists (fruits/swords/guns/fighting styles/races/accessories),
// now sourced live from the bf_items table (admin-managed via /admin/manage/#game-items)
// instead of a hardcoded object. BUILD_OPTIONS keeps the exact shape every existing
// consumer already expects — {fruit: [...], sword: [...], melee: [...], ...}, each entry
// {value, icon, rarity} — so nothing downstream needed to change except how the data gets
// in here. "melee" is kept as the JS-facing key (not "fighting_style", bf_items' category
// name for it) since profiles.build_melee and the picker UI already use that name
// everywhere; renaming it would mean migrating stored profile data too, for no benefit.
const BUILD_OPTIONS = { fruit: [], sword: [], gun: [], melee: [], race: [], accessory: [] };

const CATEGORY_JS_KEY = { fruit: 'fruit', sword: 'sword', gun: 'gun', fighting_style: 'melee', race: 'race', accessory: 'accessory' };
const RARITY_SORT = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythical: 4 };

// Other scripts call findBuildIcon()/read BUILD_OPTIONS from inside functions (never at
// module-parse time), so by the time anything actually needs this data, onReady()'s own
// await chain has given this plenty of time to resolve — see the resilience-pass notes
// elsewhere for why nothing here throws even if the fetch itself fails.
const _buildOptionsLoaded = (async () => {
  try {
    const { data, error } = await sb
      .from('bf_items')
      .select('name, category, rarity, icon_url')
      .in('category', Object.keys(CATEGORY_JS_KEY));
    if (error) throw error;

    const byKey = { fruit: [], sword: [], gun: [], melee: [], race: [], accessory: [] };
    (data || []).forEach(item => {
      const jsKey = CATEGORY_JS_KEY[item.category];
      if (!jsKey) return;
      byKey[jsKey].push({ value: item.name, icon: item.icon_url, rarity: item.rarity ? item.rarity.toLowerCase() : undefined });
    });
    Object.keys(byKey).forEach(k => {
      byKey[k].sort((a, b) => {
        const rDiff = (RARITY_SORT[a.rarity] ?? 9) - (RARITY_SORT[b.rarity] ?? 9);
        return rDiff !== 0 ? rDiff : a.value.localeCompare(b.value);
      });
      BUILD_OPTIONS[k] = byKey[k];
    });
  } catch (e) {
    logError('Failed to load game item catalog:', e);
  }
})();

// Shared by player.js and profile-edit.js (both already load this file for BUILD_OPTIONS
// itself) to look up an option's icon path from its stored value.
function findBuildIcon(key, value) {
  const match = (BUILD_OPTIONS[key] || []).find(opt => opt.value === value);
  return match ? match.icon : null;
}
