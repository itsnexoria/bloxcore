import { supabaseGet, rewriteMeta, escapeAttr, SUPABASE_URL, SUPABASE_ANON_KEY } from '../_shared.js';

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  const listingId = url.searchParams.get('listing');
  if (!listingId) return response;

  const listing = await supabaseGet(
    `trade_listings?id=eq.${encodeURIComponent(listingId)}&select=offering_item_ids,requesting_item_ids,profiles(username,display_name)`
  );
  if (!listing) return response;

  const offeringIds = (listing.offering_item_ids || []).map(i => i.id);
  const requestingIds = (listing.requesting_item_ids || []).map(i => i.id);
  const allIds = [...new Set([...offeringIds, ...requestingIds])];

  let itemsById = {};
  if (allIds.length) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bf_items?id=in.(${allIds.join(',')})&select=id,name,icon_url`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (res.ok) {
      for (const item of await res.json()) itemsById[item.id] = item;
    }
  }

  const nameList = (ids) => ids.map(id => itemsById[id]?.name).filter(Boolean).join(', ') || 'items';
  const posterName = listing.profiles?.display_name || listing.profiles?.username || 'A trader';
  const firstImage = itemsById[offeringIds[0]]?.icon_url || itemsById[requestingIds[0]]?.icon_url;

  const title = `${posterName}'s Trade — BloxCore`;
  const description = `Offering: ${nameList(offeringIds)}. Looking for: ${nameList(requestingIds)}.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description.slice(0, 200)),
    image: firstImage || undefined,
    imageAlt: escapeAttr('Trade item'),
    url: `https://bloxcores.com/trading/?listing=${encodeURIComponent(listingId)}`,
  });
}
