// BloxCore — settings/index.html logic

document.addEventListener('DOMContentLoaded', async () => {
  const currentTheme = localStorage.getItem('bc_theme') || 'inferno';
  highlightSwatch(currentTheme);
  if (currentTheme === 'custom') {
    openCustomBuilder(loadStoredCustomVars());
  }

  document.querySelectorAll('[data-theme-choice]').forEach(swatch => {
    swatch.addEventListener('click', () => {
      if (swatch.dataset.themeChoice === 'custom') {
        openCustomBuilder(loadStoredCustomVars());
      } else {
        selectTheme(swatch.dataset.themeChoice);
      }
    });
  });

  CUSTOM_FIELDS.forEach(field => {
    document.getElementById(`ct-${field}`).addEventListener('input', previewCustomTheme);
  });
  document.getElementById('custom-theme-save').addEventListener('click', saveCustomTheme);

  const motionToggle = document.getElementById('reduce-motion-toggle');
  motionToggle.checked = localStorage.getItem('bc_reduce_motion') === '1';
  motionToggle.addEventListener('change', () => {
    if (motionToggle.checked) {
      localStorage.setItem('bc_reduce_motion', '1');
      document.documentElement.classList.add('reduce-motion');
    } else {
      localStorage.removeItem('bc_reduce_motion');
      document.documentElement.classList.remove('reduce-motion');
    }
  });

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    document.getElementById('account-panel').innerHTML = `<p class="muted">Sign in to manage your account.</p>`;
    document.getElementById('hide-leaderboard-toggle').disabled = true;
    document.getElementById('settings-signout-btn').disabled = true;
    return;
  }

  const { data: profile } = await sb.from('profiles')
    .select('username, display_name, role, hide_from_leaderboard, created_at')
    .eq('id', session.user.id).single();

  renderAccountPanel(profile);

  const hideToggle = document.getElementById('hide-leaderboard-toggle');
  hideToggle.checked = !!profile?.hide_from_leaderboard;
  hideToggle.addEventListener('change', async () => {
    hideToggle.disabled = true;
    const { error } = await sb.from('profiles').update({ hide_from_leaderboard: hideToggle.checked }).eq('id', session.user.id);
    hideToggle.disabled = false;
    if (error) {
      showToast(error.message, true);
      hideToggle.checked = !hideToggle.checked;
      return;
    }
    showToast(hideToggle.checked ? "You're hidden from the leaderboard." : "You're visible on the leaderboard again.");
  });

  document.getElementById('settings-signout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = '/';
  });
});

function renderAccountPanel(profile) {
  const panel = document.getElementById('account-panel');
  if (!profile) {
    panel.innerHTML = `<p class="muted">Couldn't load your account details.</p>`;
    return;
  }
  const roleTag = profile.role === 'admin'
    ? `<span class="tag" style="background:rgba(255,77,109,0.16); color:var(--blood-dim); margin-left:8px;">Admin</span>`
    : profile.role === 'mod'
    ? `<span class="tag" style="background:rgb(var(--brass-rgb) / 0.16); color:var(--brass-bright); margin-left:8px;">Mod</span>`
    : '';

  panel.innerHTML = `
    <div class="flex-between" style="flex-wrap:wrap; gap:14px;">
      <div>
        <p style="margin:0; font-weight:700;">${escapeHtml(displayNameFor(profile))}${roleTag}</p>
        <p class="muted" style="margin:2px 0 0; font-size:0.85rem;">@${escapeHtml(profile.username)} · joined ${formatDate(profile.created_at)}</p>
      </div>
      <a href="/profile/" class="btn btn-ghost btn-sm">Edit Profile</a>
    </div>
  `;
}

function highlightSwatch(theme) {
  document.querySelectorAll('[data-theme-choice]').forEach(s => {
    s.classList.toggle('selected', s.dataset.themeChoice === theme);
  });
}

async function selectTheme(theme) {
  document.getElementById('custom-theme-builder').style.display = 'none';
  applyTheme(theme);
  highlightSwatch(theme);

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await sb.from('profiles').update({ theme, custom_theme: null }).eq('id', session.user.id);
  }
  showToast('Theme updated.');
}

// ---- Custom theme builder ----

const CUSTOM_FIELDS = ['ink', 'navy', 'navyLight', 'brass', 'bone', 'ash', 'shadow'];
const CUSTOM_DEFAULTS = { ink: '#1a0f06', navy: '#241608', navyLight: '#4a2f12', brass: '#ff8a2b', bone: '#fbead9', ash: '#b39374', shadow: '#000000' };

function loadStoredCustomVars() {
  try {
    const stored = JSON.parse(localStorage.getItem('bc_custom_theme') || 'null');
    return stored ? { ...CUSTOM_DEFAULTS, ...stored } : CUSTOM_DEFAULTS;
  } catch {
    return CUSTOM_DEFAULTS;
  }
}

function openCustomBuilder(vars) {
  document.getElementById('custom-theme-builder').style.display = 'block';
  highlightSwatch('custom');
  CUSTOM_FIELDS.forEach(field => {
    document.getElementById(`ct-${field}`).value = vars[field] || CUSTOM_DEFAULTS[field];
  });
  previewCustomTheme();
}

function readCustomFields() {
  const vars = {};
  CUSTOM_FIELDS.forEach(field => { vars[field] = document.getElementById(`ct-${field}`).value; });
  vars.brassBright = lightenHex(vars.brass, 0.35);
  return vars;
}

// Lightens a hex color toward white by `amount` (0–1) — used to auto-derive the "bright"
// hover/glow shade from the single accent color the user picks.
function lightenHex(hex, amount) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function previewCustomTheme() {
  applyTheme('custom', readCustomFields());
}

async function saveCustomTheme() {
  const vars = readCustomFields();
  applyTheme('custom', vars);
  highlightSwatch('custom');

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const { error } = await sb.from('profiles').update({ theme: 'custom', custom_theme: vars }).eq('id', session.user.id);
    if (error) {
      showToast(error.message, true);
      return;
    }
  }
  showToast('Custom theme saved.');
}
