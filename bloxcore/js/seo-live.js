// Live "open listings" strip on item value pages. Public read of trade_listings (RLS: publicly viewable).
(function () {
  const box = document.querySelector('.seo-live[data-item-id]');
  if (!box || typeof sb === 'undefined') return;
  const id = Number(box.dataset.itemId);
  const name = box.dataset.name || 'this item';
  const count = (col) => sb.from('trade_listings').select('id', { count: 'exact', head: true })
    .eq('active', true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .contains(col, JSON.stringify([{ id }])).then(r => (r.error ? null : r.count || 0), () => null);
  Promise.all([count('offering_item_ids'), count('requesting_item_ids')]).then(([off, req]) => {
    if (off == null || req == null) return; // keep the strip hidden if the lookup failed
    const text = box.querySelector('.seo-live-text');
    text.textContent = off + req === 0
      ? `No open listings for ${name} right now — post the first one.`
      : `On the board right now: ${off} offering ${name} · ${req} looking for it.`;
    box.hidden = false;
  });
})();
