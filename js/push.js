// BloxCore — Web Push subscribe/unsubscribe. Registers the service worker on every
// page load (cheap, idempotent); actually subscribing only happens when the user
// opts in from Settings, since it needs a permission prompt.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => logError('SW registration failed:', e));
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getPushSubscriptionState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications aren\'t supported in this browser.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const { data: vapidKey, error: keyError } = await sb.rpc('get_vapid_public_key');
  if (keyError || !vapidKey) throw new Error('Could not load push config.');

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Sign in first.');

  const raw = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({
    user_id: session.user.id,
    endpoint: raw.endpoint,
    p256dh: raw.keys.p256dh,
    auth: raw.keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

// One-time, dismissible nudge to turn on push — shown right after the moments it matters (posting a listing,
// sending/receiving an offer). Never shown if push is unsupported, already on, blocked, or dismissed in the last 14 days.
async function promptForPush(message) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    if (Number(localStorage.getItem('bc_push_prompt_until') || 0) > Date.now()) return;
    if (document.getElementById('push-prompt')) return;
    if ((await getPushSubscriptionState()) !== 'unsubscribed') return;
  } catch { return; }
  const el = document.createElement('div');
  el.id = 'push-prompt'; el.className = 'push-prompt'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Turn on notifications');
  el.innerHTML = `<i data-lucide="bell-ring" class="icon-md" style="color:var(--brass-bright); flex:none;"></i>
    <p>${escapeHtml(message)}</p>
    <div style="display:flex; gap:6px; flex:none;"><button type="button" class="btn btn-primary btn-sm" data-push-yes>Turn on</button><button type="button" class="btn btn-ghost btn-sm" data-push-no aria-label="Not now">Not now</button></div>`;
  document.body.appendChild(el);
  if (typeof refreshIcons === 'function') refreshIcons();
  const dismiss = () => { try { localStorage.setItem('bc_push_prompt_until', String(Date.now() + 14 * 86400000)); } catch { /* ignore */ } el.remove(); };
  el.querySelector('[data-push-no]').addEventListener('click', dismiss);
  el.querySelector('[data-push-yes]').addEventListener('click', async () => {
    try { await subscribeToPush(); showToast('Push alerts are on for this device.'); el.remove(); }
    catch (e) { showToast(e.message || 'Couldn\'t turn on notifications.', true); dismiss(); }
  });
}
