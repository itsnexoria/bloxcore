// BloxCore — /blox-fruits-value-converter/ : "how many X equal Y" using live bf_items values.
// Shareable: ?from=Dragon&to=Kitsune&qty=3 (and &ft= / &tt= for permanent).

onReady(async () => {
  const out = document.getElementById('conv-out');
  const items = await fetchBfItemCatalog(['fruit', 'limited', 'gamepass']);
  // the catalog can hold both "Magnet" and "Magnet Fruit" — hide the "<Name> Fruit" twin
  const allNames = new Set(items.map(i => i.name.toLowerCase()));
  const usable = items.filter(i => i.regular_value != null
    && !(i.category === 'fruit' && i.name.toLowerCase().endsWith(' fruit') && allNames.has(i.name.toLowerCase().slice(0, -6))));
  if (!usable.length) {
    out.innerHTML = '<p class="muted" style="margin:0;">Couldn\'t load values right now — try again in a moment.</p>';
    return;
  }

  const els = {
    qty: document.getElementById('conv-qty'),
    from: document.getElementById('conv-from'), fromType: document.getElementById('conv-from-type'),
    to: document.getElementById('conv-to'), toType: document.getElementById('conv-to-type'),
    link: document.getElementById('conv-link'),
  };
  const byName = new Map(usable.map(i => [i.name.toLowerCase(), i]));
  const groups = [['fruit', 'Fruits'], ['limited', 'Limiteds'], ['gamepass', 'Gamepasses']];
  const optionsHtml = groups.map(([cat, label]) => {
    const list = usable.filter(i => i.category === cat);
    return list.length ? `<optgroup label="${label}">${list.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  els.from.innerHTML = optionsHtml;
  els.to.innerHTML = optionsHtml;
  const byId = new Map(usable.map(i => [String(i.id), i]));

  // defaults: the two most valuable fruits, or whatever the link asks for
  const fruits = usable.filter(i => i.category === 'fruit').sort((a, b) => b.regular_value - a.regular_value);
  const params = new URLSearchParams(location.search);
  const pick = (name, fallback) => (byName.get((name || '').toLowerCase()) || fallback || usable[0]);
  els.from.value = String(pick(params.get('from'), fruits[1] || fruits[0]).id);
  els.to.value = String(pick(params.get('to'), fruits[0]).id);
  if (params.get('qty')) els.qty.value = String(Math.max(1, Math.min(9999, parseInt(params.get('qty'), 10) || 1)));
  if (params.get('ft') === 'permanent') els.fromType.value = 'permanent';
  if (params.get('tt') === 'permanent') els.toType.value = 'permanent';

  // only fruits have a permanent version
  const syncTypes = () => {
    [[els.from, els.fromType], [els.to, els.toType]].forEach(([sel, typeSel]) => {
      const isFruit = byId.get(sel.value)?.category === 'fruit';
      typeSel.disabled = !isFruit;
      if (!isFruit) typeSel.value = 'physical';
    });
  };

  const fmtRatio = (r) => r >= 100 ? Math.round(r).toLocaleString() : r >= 10 ? r.toFixed(1).replace(/\.0$/, '') : r.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  const label = (item, type) => `${escapeHtml(item.name)}${item.category === 'fruit' && type === 'permanent' ? ' (permanent)' : ''}`;

  function render() {
    syncTypes();
    const qty = Math.max(1, Math.min(9999, parseInt(els.qty.value, 10) || 1));
    const a = byId.get(els.from.value), b = byId.get(els.to.value);
    const ft = els.fromType.value, tt = els.toType.value;
    const unitA = valueFor(a, ft), unitB = valueFor(b, tt);
    if (!unitA || !unitB) { out.innerHTML = '<p class="muted" style="margin:0;">No value is listed for one of those yet.</p>'; return; }
    const totalA = qty * unitA;
    const eq = totalA / unitB;
    const whole = Math.floor(eq);
    const rem = totalA - whole * unitB;
    const lines = [
      `<p class="conv-big">${qty.toLocaleString()}× ${label(a, ft)} ≈ <strong>${fmtRatio(eq)}× ${label(b, tt)}</strong></p>`,
      `<p class="muted" style="margin:4px 0 0;">${formatValue(totalA)} total (${formatValue(unitA)} each) vs ${formatValue(unitB)} per ${escapeHtml(b.name)}.</p>`,
    ];
    if (whole >= 1) lines.push(`<p style="margin:8px 0 0;">That covers <strong>${whole.toLocaleString()}</strong> ${escapeHtml(b.name)}${rem > 0 ? `, with ${formatValue(rem)} of value left over` : ' exactly'}.</p>`);
    else lines.push(`<p style="margin:8px 0 0;">You'd need about <strong>${fmtRatio(unitB / unitA)}</strong> ${escapeHtml(a.name)} to match one ${escapeHtml(b.name)}.</p>`);
    out.innerHTML = lines.join('');
    els.link.href = `/trading/?tab=calculator&give=${encodeURIComponent(a.name)}&get=${encodeURIComponent(b.name)}`;
    const q = new URLSearchParams({ from: a.name, to: b.name });
    if (qty !== 1) q.set('qty', String(qty));
    if (ft === 'permanent') q.set('ft', 'permanent');
    if (tt === 'permanent') q.set('tt', 'permanent');
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }

  [els.qty, els.from, els.fromType, els.to, els.toType].forEach(el => el.addEventListener('input', render));
  document.getElementById('conv-swap').addEventListener('click', () => {
    [els.from.value, els.to.value] = [els.to.value, els.from.value];
    [els.fromType.value, els.toType.value] = [els.toType.value, els.fromType.value];
    render();
  });
  render();
});
