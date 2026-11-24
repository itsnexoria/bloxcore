// "Tell me when <item> drops below / rises above X" — shown on every item value page (#price-alert).
// Uses the same item_watchlist columns as the Trading page (alert_direction / alert_target_value); the existing
// database trigger notify_price_alerts_on_value_change() sends the notification when the value crosses the target.
(function () {
  const box = document.getElementById('price-alert');
  if (!box || typeof sb === 'undefined') return;
  const itemId = Number(box.dataset.itemId);
  const name = box.dataset.name || 'this item';
  const cur = Number(box.dataset.value) || 0;
  const form = box.querySelector('form');
  const msg = box.querySelector('.seo-alert-msg');
  const dirEl = form.elements.dir;
  const tgtEl = form.elements.target;
  // 1.2B / 450M / 750K (formatValue isn't loaded on static value pages)
  const fmt = (n) => {
    n = Number(n) || 0;
    const t = (x, u) => `${Number(x.toFixed(2))}${u}`;
    return n >= 1e9 ? t(n / 1e9, 'B') : n >= 1e6 ? t(n / 1e6, 'M') : n >= 1e3 ? t(n / 1e3, 'K') : String(n);
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let userId = null;
  let current = null;

  // "400M", "1.2b", "750k" or a plain number
  function parse(text) {
    const m = String(text).trim().toLowerCase().replace(/[,\s]/g, '').match(/^(\d+(?:\.\d+)?)([kmb])?$/);
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1));
  }
  const say = (html) => { msg.innerHTML = html; };

  function render() {
    if (current) {
      say(`Alert on: tell me when <b>${esc(name)}</b> ${current.alert_direction === 'below' ? 'drops to' : 'rises to'} <b>${fmt(current.alert_target_value)}</b>${current.alert_triggered_at ? ' <span class="muted">(already triggered — set a new one)</span>' : ''} · <button type="button" class="seo-alert-clear">Remove</button>`);
      msg.querySelector('.seo-alert-clear').addEventListener('click', clearAlert);
    } else {
      say(`Now <b>${fmt(cur)}</b>. We'll notify you on BloxCore the moment the value crosses your target.`);
    }
  }

  async function load() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      userId = session && session.user ? session.user.id : null;
      if (userId) {
        const { data } = await sb.from('item_watchlist').select('alert_direction, alert_target_value, alert_triggered_at').eq('user_id', userId).eq('item_id', itemId).maybeSingle();
        current = data && data.alert_direction ? data : null;
      }
    } catch (e) { /* show the form anyway */ }
    render();
  }

  async function clearAlert() {
    const { error } = await sb.from('item_watchlist').update({ alert_direction: null, alert_target_value: null, alert_triggered_at: null }).eq('user_id', userId).eq('item_id', itemId);
    if (error) return say('Could not remove the alert — please try again.');
    current = null; render();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userId) {
      const opts = { title: 'Set a price alert', body: `Sign in with Discord (free) and we'll tell you when ${name} hits your price.` };
      if (typeof window.bcSignInPrompt === 'function') return window.bcSignInPrompt(opts);
      location.href = '/auth/';
      return;
    }
    const target = parse(tgtEl.value);
    if (!target) return say('Enter a value like <b>400M</b> or <b>1.2B</b>.');
    const dir = dirEl.value;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    // make sure the item is on the watchlist, then attach the alert to that row
    const up = await sb.from('item_watchlist').upsert({ user_id: userId, item_id: itemId }, { onConflict: 'user_id,item_id', ignoreDuplicates: true });
    const { error } = up.error ? up : await sb.from('item_watchlist').update({ alert_direction: dir, alert_target_value: target, alert_triggered_at: null }).eq('user_id', userId).eq('item_id', itemId);
    btn.disabled = false;
    if (error) return say(`Could not set the alert: ${esc(error.message || 'please try again')}`);
    current = { alert_direction: dir, alert_target_value: target, alert_triggered_at: null };
    tgtEl.value = '';
    render();
    if (typeof showToast === 'function') showToast(`Alert set for ${name}`);
  });

  tgtEl.placeholder = `e.g. ${fmt(Math.round(cur * 0.9))}`;
  load();
})();
