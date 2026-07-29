// BloxCore — fruit-stock/index.html logic

let isStaff = false;

document.addEventListener('DOMContentLoaded', async () => {
  const { user, profile } = await getCurrentProfile();
  isStaff = profile?.role === 'mod' || profile?.role === 'admin';
  document.getElementById('staff-hint').style.display = isStaff ? 'block' : 'none';

  await loadStock();
});

async function loadStock() {
  const { data, error } = await sb.from('fruit_stock').select('dealer, fruit_name, in_stock, updated_at');

  if (error) {
    console.error(error);
    document.getElementById('normal-stock').innerHTML = `<p class="muted">Couldn't load stock right now.</p>`;
    return;
  }

  const stockMap = new Map(data.map(row => [`${row.dealer}:${row.fruit_name}`, row]));
  const latest = data.reduce((max, r) => (new Date(r.updated_at) > max ? new Date(r.updated_at) : max), new Date(0));
  document.getElementById('stock-freshness').textContent = data.length
    ? `Last updated ${timeAgo(latest.toISOString())}`
    : 'No stock data yet — check back once staff have set it.';

  renderDealer('normal', stockMap);
  renderDealer('mirage', stockMap);
}

function renderDealer(dealer, stockMap) {
  const container = document.getElementById(`${dealer}-stock`);
  const fruits = BUILD_OPTIONS.fruit;

  container.innerHTML = fruits.map(f => {
    const row = stockMap.get(`${dealer}:${f.value}`);
    const inStock = row?.in_stock || false;
    return `
      <div class="panel" data-stock-tile data-dealer="${dealer}" data-fruit="${escapeHtml(f.value)}"
           style="padding:10px; text-align:center; cursor:${isStaff ? 'pointer' : 'default'}; ${inStock ? '' : 'opacity:0.35;'}">
        <img src="${f.icon}" alt="${escapeHtml(f.value)}" style="width:36px; height:36px; object-fit:contain; margin-bottom:6px;">
        <p style="margin:0; font-size:0.76rem;">${escapeHtml(f.value)}</p>
        ${inStock ? `<span class="tag tag-easy" style="margin-top:6px;">In Stock</span>` : ''}
      </div>
    `;
  }).join('');

  if (isStaff) {
    container.querySelectorAll('[data-stock-tile]').forEach(tile => {
      tile.addEventListener('click', () => toggleStock(tile.dataset.dealer, tile.dataset.fruit));
    });
  }
}

async function toggleStock(dealer, fruitName) {
  const { data: { session } } = await sb.auth.getSession();
  const { data: existing } = await sb.from('fruit_stock').select('in_stock').eq('dealer', dealer).eq('fruit_name', fruitName).maybeSingle();
  const nextState = !(existing?.in_stock || false);

  const { error } = await sb.from('fruit_stock').upsert({
    dealer, fruit_name: fruitName, in_stock: nextState, updated_at: new Date().toISOString(), updated_by: session.user.id,
  }, { onConflict: 'dealer,fruit_name' });

  if (error) {
    showToast(error.message, true);
    return;
  }
  await loadStock();
}
