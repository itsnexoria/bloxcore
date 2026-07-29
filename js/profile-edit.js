// BloxCore — profile/index.html logic (edit own profile)

let currentUserId = null;
let activeBuildKey = null;

const BUILD_FIELDS = [
  { id: 'build_fruit', key: 'fruit', label: 'Fruit' },
  { id: 'build_race', key: 'race', label: 'Race' },
  { id: 'build_sword', key: 'sword', label: 'Sword' },
  { id: 'build_gun', key: 'gun', label: 'Gun' },
  { id: 'build_melee', key: 'melee', label: 'Fighting Style' },
  { id: 'build_accessory', key: 'accessory', label: 'Accessory' },
];

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAuth();
  if (!auth) return;
  currentUserId = auth.user.id;

  document.getElementById('view-public-link').href = `/player/?u=${encodeURIComponent(auth.profile.username)}`;
  document.getElementById('username-hint').textContent = auth.profile.username;

  populateBountySelect('pirate_bounty');
  populateBountySelect('marine_bounty');
  populateForm(auth.profile);
  wireBuildPickers();

  document.getElementById('avatar-file').addEventListener('change', handleAvatarUpload);
  document.getElementById('profile-form').addEventListener('submit', handleSave);
});

function populateBountySelect(id) {
  const select = document.getElementById(id);
  const blank = document.createElement('option');
  blank.value = '0';
  blank.textContent = '— Not set —';
  select.appendChild(blank);

  BOUNTY_TIERS.forEach(tier => {
    const option = document.createElement('option');
    option.value = tier.value;
    option.textContent = tier.label;
    select.appendChild(option);
  });
}

function populateForm(profile) {
  renderAvatar(profile.avatar_url);
  document.getElementById('display_name').value = profile.display_name || '';
  document.getElementById('bio').value = profile.bio || '';
  document.getElementById('region').value = profile.region || '';
  document.getElementById('pirate_bounty').value = profile.pirate_bounty || 0;
  document.getElementById('marine_bounty').value = profile.marine_bounty || 0;

  BUILD_FIELDS.forEach(({ id, key, label }) => {
    setBuildValue(key, profile[id] || '', false);
  });

  const social = profile.social_links || {};
  document.getElementById('social_youtube').value = social.youtube || '';
  document.getElementById('social_twitch').value = social.twitch || '';
  document.getElementById('social_twitter').value = social.twitter || '';
  document.getElementById('social_tiktok').value = social.tiktok || '';
  document.getElementById('social_discord').value = social.discord || '';
}

function renderAvatar(url) {
  const img = document.getElementById('avatar-preview');
  const placeholder = document.getElementById('avatar-placeholder');
  if (url) {
    img.src = url;
    img.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    img.style.display = 'none';
    placeholder.style.display = 'flex';
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const ext = file.name.split('.').pop();
    const path = `${currentUserId}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('avatars').upload(path, file);
    if (uploadError) throw uploadError;

    const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await sb.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', currentUserId);
    if (updateError) throw updateError;

    renderAvatar(urlData.publicUrl);
    showToast('Avatar updated.');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not upload avatar.', true);
  }
}

// ---- Build picker popup ----

function wireBuildPickers() {
  document.querySelectorAll('.build-picker-btn').forEach(btn => {
    btn.addEventListener('click', () => openBuildModal(btn.dataset.buildKey));
  });
  document.getElementById('build-modal-close').addEventListener('click', closeBuildModal);
  document.getElementById('build-picker-modal').addEventListener('click', (e) => {
    if (e.target.id === 'build-picker-modal') closeBuildModal();
  });
  document.getElementById('build-modal-search').addEventListener('input', (e) => {
    renderModalGrid(activeBuildKey, e.target.value);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBuildModal();
  });
}

function openBuildModal(key) {
  activeBuildKey = key;
  const field = BUILD_FIELDS.find(f => f.key === key);
  document.getElementById('build-modal-title').textContent = `Choose ${field.label}`;
  document.getElementById('build-modal-search').value = '';
  renderModalGrid(key, '');
  document.getElementById('build-picker-modal').classList.add('open');
}

function closeBuildModal() {
  document.getElementById('build-picker-modal').classList.remove('open');
  activeBuildKey = null;
}

function renderModalGrid(key, filter) {
  const grid = document.getElementById('build-modal-grid');
  const field = BUILD_FIELDS.find(f => f.key === key);
  const currentValue = document.getElementById(field.id).value;
  const query = filter.trim().toLowerCase();

  const options = BUILD_OPTIONS[key].filter(opt => opt.value.toLowerCase().includes(query));

  const noneTile = `
    <div class="build-modal-tile ${currentValue === '' ? 'selected' : ''}" data-build-value="">
      <span style="font-size:1.4rem;">🚫</span>
      <span>None</span>
    </div>
  `;

  const tiles = options.map(opt => `
    <div class="build-modal-tile ${currentValue === opt.value ? 'selected' : ''}" data-build-value="${escapeHtml(opt.value)}">
      <img src="${opt.icon}" alt="${escapeHtml(opt.value)}" loading="lazy">
      <span>${escapeHtml(opt.value)}</span>
    </div>
  `).join('');

  grid.innerHTML = noneTile + tiles;

  grid.querySelectorAll('[data-build-value]').forEach(tile => {
    tile.addEventListener('click', () => {
      setBuildValue(key, tile.dataset.buildValue, true);
      closeBuildModal();
    });
  });
}

function setBuildValue(key, value, animate) {
  const field = BUILD_FIELDS.find(f => f.key === key);
  const hiddenInput = document.getElementById(field.id);
  hiddenInput.value = value;

  const btn = document.querySelector(`.build-picker-btn[data-build-key="${key}"]`);
  const valueEl = btn.querySelector('.build-picker-value');
  const icon = value ? findBuildIcon(key, value) : null;

  if (value) {
    valueEl.classList.remove('is-empty');
    valueEl.innerHTML = `${icon ? `<img src="${icon}" alt="">` : ''}${escapeHtml(value)}`;
  } else {
    valueEl.classList.add('is-empty');
    valueEl.textContent = '— Choose —';
  }

  if (animate) {
    btn.style.animation = 'none';
    requestAnimationFrame(() => { btn.style.animation = 'fadeInUp 0.25s ease both'; });
  }
}

function findBuildIcon(key, value) {
  const match = (BUILD_OPTIONS[key] || []).find(opt => opt.value === value);
  return match ? match.icon : null;
}

// ---- Save ----

async function handleSave(e) {
  e.preventDefault();
  const errorEl = document.getElementById('profile-error');
  const saveBtn = document.getElementById('save-profile-btn');
  errorEl.style.display = 'none';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const payload = {
    display_name: document.getElementById('display_name').value.trim() || null,
    bio: document.getElementById('bio').value.trim() || null,
    region: document.getElementById('region').value.trim() || null,
    pirate_bounty: parseInt(document.getElementById('pirate_bounty').value, 10) || 0,
    marine_bounty: parseInt(document.getElementById('marine_bounty').value, 10) || 0,
    build_fruit: document.getElementById('build_fruit').value || null,
    build_race: document.getElementById('build_race').value || null,
    build_sword: document.getElementById('build_sword').value || null,
    build_gun: document.getElementById('build_gun').value || null,
    build_melee: document.getElementById('build_melee').value || null,
    build_accessory: document.getElementById('build_accessory').value || null,
    social_links: {
      youtube: document.getElementById('social_youtube').value.trim(),
      twitch: document.getElementById('social_twitch').value.trim(),
      twitter: document.getElementById('social_twitter').value.trim(),
      tiktok: document.getElementById('social_tiktok').value.trim(),
      discord: document.getElementById('social_discord').value.trim(),
    },
  };

  const { error } = await sb.from('profiles').update(payload).eq('id', currentUserId);

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save Profile';

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Profile saved.');
}
