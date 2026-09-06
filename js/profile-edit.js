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
let currentFruitSkin = '';
let currentFruitSkinIcon = '';

onReady(async () => {
  const auth = await requireAuth();
  if (!auth) return;
  currentUserId = auth.user.id;

  document.getElementById('view-public-link').href = `/player/?u=${encodeURIComponent(auth.profile.username)}`;
  document.getElementById('username-hint').textContent = auth.profile.username;

  populateBountySelect('pirate_bounty');
  populateBountySelect('marine_bounty');
  try {
    await populateTitleSelect(auth.user.id, auth.profile.active_title_id, auth.profile.title_color_override, auth.profile.role);
  } catch (e) {
    logError('Failed to load title picker:', e);
  }
  populateForm(auth.profile);
  wireBuildPickers();
  wireFramePicker();
  wireNameGradientPickers();

  document.getElementById('avatar-file').addEventListener('change', handleAvatarUpload);
  document.getElementById('banner-file').addEventListener('change', handleBannerUpload);
  document.getElementById('profile-form').addEventListener('submit', handleSave);
});

let allTitlesForPicker = [];
const RARITY_ORDER = { divine: 6, mythical: 5, legendary: 4, epic: 3, rare: 2, common: 0 };
let ownedTitleIds = new Set();
let activeTitleId = '';
let activeTitleColorOverride = '';
let activeNameGradient = '';
let activeAvatarFrame = '';
let framesCatalog = [];
let currentLevel = 0;
let canUseRainbow = false;

async function populateTitleSelect(userId, activeId, colorOverride, role) {
  activeTitleId = activeId || '';
  activeTitleColorOverride = colorOverride || '';
  canUseRainbow = role === 'mod' || role === 'admin';

  const [{ data: all }, { data: owned }] = await Promise.all([
    sb.from('titles').select('id, name, color, rarity').order('name'),
    sb.from('user_titles').select('title_id').eq('user_id', userId),
  ]);

  allTitlesForPicker = (all || []).slice().sort((a, b) => {
    const rarityDiff = (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0);
    return rarityDiff !== 0 ? rarityDiff : a.name.localeCompare(b.name);
  });
  ownedTitleIds = new Set((owned || []).map(o => o.title_id));

  document.getElementById('active_title').value = activeTitleId;
  document.getElementById('title-picker-count').textContent = `${ownedTitleIds.size}/${allTitlesForPicker.length} unlocked`;
  renderTitlePickerValue();

  document.getElementById('title-picker-btn').addEventListener('click', openTitleModal);
  document.getElementById('title-modal-close').addEventListener('click', closeTitleModal);
  document.getElementById('title-modal-done').addEventListener('click', closeTitleModal);
  document.getElementById('title-picker-modal').addEventListener('click', (e) => {
    if (e.target.id === 'title-picker-modal') closeTitleModal();
  });
}

function renderTitlePickerValue() {
  const valueEl = document.getElementById('title-picker-value');
  const active = allTitlesForPicker.find(t => t.id === activeTitleId);
  if (active) {
    valueEl.classList.remove('is-empty');
    const c = activeTitleColorOverride || active.color;
    valueEl.innerHTML = c === 'rainbow'
      ? `<span class="title-badge-rainbow" style="padding:0;">${escapeHtml(active.name)}</span>`
      : `<span style="${titleColorStyle(c)}">${escapeHtml(active.name)}</span>`;
  } else {
    valueEl.classList.add('is-empty');
    valueEl.textContent = '— None —';
  }
}

function renderTitleColorSwatches() {
  const colorRow = document.getElementById('title-color-row');
  const active = allTitlesForPicker.find(t => t.id === activeTitleId);
  if (!active) { colorRow.style.display = 'none'; return; }
  colorRow.style.display = 'block';

  document.getElementById('title_color_override').value = activeTitleColorOverride;
  const presets = TITLE_COLOR_PRESETS.filter(p => p.key !== 'rainbow' || canUseRainbow);

  document.getElementById('title-color-swatches').innerHTML = presets.map(p => {
    const selected = (activeTitleColorOverride || 'default') === p.key;
    // The default swatch previews the title's own actual color (or its own rainbow, if that's
    // what the title itself is) — not a generic placeholder — so it's clear what "Default" means.
    const isDefault = p.key === 'default';
    const previewColor = isDefault ? active.color : p.swatch;
    const isRainbowPreview = previewColor === 'rainbow';
    const cls = isRainbowPreview ? 'swatch-rainbow' : '';
    const bg = isRainbowPreview ? '' : previewColor;
    return `<button type="button" class="color-swatch-btn ${cls} ${selected ? 'selected' : ''}" style="background:${bg};" data-color-key="${p.key}" title="${p.label}"></button>`;
  }).join('');

  document.querySelectorAll('#title-color-swatches [data-color-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTitleColorOverride = btn.dataset.colorKey === 'default' ? '' : btn.dataset.colorKey;
      renderTitlePickerValue();
      renderTitleColorSwatches();
    });
  });
}

// Parses an existing `linear-gradient(120deg, #xxxxxx 30%, #yyyyyy 90%)` string (as saved
// by this picker) back into its two hex stops, so re-opening the edit page shows the
// colors the user actually picked instead of resetting to the defaults.
function parseNameGradient(value) {
  const matches = value?.match(/#[0-9a-fA-F]{6}/g);
  return matches && matches.length >= 2 ? [matches[0], matches[1]] : null;
}

function renderNameGradientPreview() {
  const c1 = document.getElementById('name_gradient_color1').value;
  const c2 = document.getElementById('name_gradient_color2').value;
  activeNameGradient = `linear-gradient(120deg, ${c1} 30%, ${c2} 90%)`;
  document.getElementById('name_gradient').value = activeNameGradient;
  const preview = document.getElementById('name-gradient-preview');
  preview.textContent = document.getElementById('display_name').value || 'Preview';
  preview.style.cssText += titleColorStyle(activeNameGradient);
}

function wireNameGradientPickers() {
  document.getElementById('name_gradient_color1').addEventListener('input', renderNameGradientPreview);
  document.getElementById('name_gradient_color2').addEventListener('input', renderNameGradientPreview);
}

// ---- Avatar frame picker ----
// Frames are admin-uploaded (see /admin/manage/#frames) rather than a hardcoded list —
// getAvatarFramesCatalog() (supabase-client.js) fetches+caches the avatar_frames table
// once per page load, which this reuses instead of firing a second query. Uses the same
// modal tile-grid pattern as the fruit/sword/etc. build pickers, rather than an inline
// swatch row, for visual consistency across every picker on this page.
function frameAvatarPreviewFor(frame) {
  const avatarUrl = document.getElementById('avatar-preview').style.display !== 'none'
    ? document.getElementById('avatar-preview').src
    : '';
  const style = `width:48px;height:48px;border-radius:50%;object-fit:cover;background:linear-gradient(150deg, var(--navy-light), var(--navy));box-shadow:0 0 0 3px var(--ink), 0 0 0 4px rgb(var(--brass-rgb) / 0.5);`;
  const avatarEl = avatarUrl
    ? `<img src="${avatarUrl}" alt="" style="${style}">`
    : `<div style="${style}"></div>`;
  if (!frame) return avatarEl;
  return `<span style="position:relative; display:inline-flex; width:48px; height:48px;">${avatarEl}<img src="${frame.image_url}" alt="" style="position:absolute; top:50%; left:50%; width:65px; height:65px; transform:translate(-50%,-50%); pointer-events:none;"></span>`;
}

async function updateFramePickerButton() {
  if (!framesCatalog.length) framesCatalog = await getAvatarFramesCatalog();
  const current = framesCatalog.find(f => f.key === activeAvatarFrame);
  const valueEl = document.getElementById('frame-picker-value');
  valueEl.textContent = current ? current.name : 'None';
  valueEl.classList.toggle('is-empty', !current);
}

function openFramePickerModal() {
  renderFrameModalGrid();
  document.getElementById('frame-picker-modal').classList.add('open');
}

function closeFramePickerModal() {
  document.getElementById('frame-picker-modal').classList.remove('open');
}

function renderFrameModalGrid() {
  const grid = document.getElementById('frame-modal-grid');
  const options = [{ key: '', name: 'None', min_level: 0 }, ...framesCatalog];

  grid.innerHTML = options.map(frame => {
    const locked = currentLevel < frame.min_level;
    const selected = (activeAvatarFrame || '') === frame.key;
    return `
      <div class="build-modal-tile ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}" data-frame-key="${frame.key}" data-frame-min-level="${frame.min_level}" title="${escapeHtml(frame.name)}${locked ? ` — unlocks at level ${frame.min_level}` : ''}">
        ${frameAvatarPreviewFor(frame.key ? frame : null)}
        <span>${escapeHtml(frame.name)}</span>
        ${locked ? '<span class="build-modal-tile-lock"><i data-lucide="lock" class="icon-sm"></i></span>' : ''}
      </div>
    `;
  }).join('');
  refreshIcons();

  grid.querySelectorAll('[data-frame-key]').forEach(tile => {
    if (tile.classList.contains('locked')) return;
    tile.addEventListener('click', () => {
      activeAvatarFrame = tile.dataset.frameKey || '';
      updateFramePickerButton();
      closeFramePickerModal();
    });
  });
}

function openTitleModal() {
  document.getElementById('title-modal-progress').textContent =
    `${ownedTitleIds.size} of ${allTitlesForPicker.length} titles unlocked`;

  const noneTile = `
    <div class="build-modal-tile title-tile ${activeTitleId === '' ? 'selected' : ''}" data-title-id="">
      <i data-lucide="ban" class="icon-lg"></i>
      <span class="title-tile-name">None</span>
    </div>
  `;

  const tiles = allTitlesForPicker.map(t => {
    const owned = ownedTitleIds.has(t.id);
    return `
      <div class="build-modal-tile title-tile ${!owned ? 'locked' : ''} ${activeTitleId === t.id ? 'selected' : ''}" data-rarity="${t.rarity}" ${owned ? `data-title-id="${t.id}"` : ''}>
        ${owned ? '' : '<i data-lucide="lock" class="icon-sm lock-icon"></i>'}
        <span class="title-tile-name" style="${owned ? titleColorStyle(t.color) : 'color:var(--ash);'}">${escapeHtml(t.name)}</span>
        <span class="title-rarity-pill title-rarity-${t.rarity}">${t.rarity}</span>
      </div>
    `;
  }).join('');

  document.getElementById('title-modal-grid').innerHTML = noneTile + tiles;
  renderTitleColorSwatches();
  refreshIcons();

  document.querySelectorAll('#title-modal-grid [data-title-id]').forEach(tile => {
    tile.addEventListener('click', () => {
      activeTitleId = tile.dataset.titleId;
      activeTitleColorOverride = '';
      document.getElementById('active_title').value = activeTitleId;
      renderTitlePickerValue();
      openTitleModal(); // re-render selection state + color row without closing the modal
    });
  });

  document.getElementById('title-picker-modal').classList.add('open');
}

function closeTitleModal() {
  document.getElementById('title-picker-modal').classList.remove('open');
}

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

async function populateForm(profile) {
  renderAvatar(profile.avatar_url);
  renderBanner(profile.banner_url);
  currentLevel = profile.level || 0;
  document.getElementById('display_name').value = profile.display_name || '';
  activeAvatarFrame = profile.avatar_frame || '';
  // Fire-and-forget, not awaited: a failure here (bad data, slow network) must never
  // block the rest of the form below from populating — this cosmetic picker isn't
  // worth the whole page looking broken over.
  updateFramePickerButton().catch(err => logError('Failed to render avatar frame picker:', err));
  activeNameGradient = profile.name_gradient || '';
  document.getElementById('name_gradient').value = activeNameGradient;
  const stops = parseNameGradient(activeNameGradient) || ['#ffffff', '#d99b4e'];
  document.getElementById('name_gradient_color1').value = stops[0];
  document.getElementById('name_gradient_color2').value = stops[1];
  renderNameGradientPreview();
  document.getElementById('bio').value = profile.bio || '';
  document.getElementById('status_line').value = profile.status_line || '';
  document.getElementById('region').value = profile.region || '';
  document.getElementById('pirate_bounty').value = profile.pirate_bounty || 0;
  document.getElementById('marine_bounty').value = profile.marine_bounty || 0;

  currentFruitSkin = profile.build_fruit_skin || '';
  currentFruitSkinIcon = '';
  if (currentFruitSkin) {
    const { data: skinRow } = await sb.from('bf_items').select('icon_url').eq('category', 'limited').eq('name', currentFruitSkin).maybeSingle();
    currentFruitSkinIcon = skinRow?.icon_url || '';
  }
  BUILD_FIELDS.forEach(({ id, key, label }) => {
    setBuildValue(key, profile[id] || '', false);
  });

  const social = profile.social_links || {};
  document.getElementById('social_youtube').value = social.youtube || '';
  document.getElementById('social_twitch').value = social.twitch || '';
  document.getElementById('social_twitter').value = social.twitter || '';
  document.getElementById('social_tiktok').value = social.tiktok || '';
  document.getElementById('social_discord').value = social.discord || '';
  document.getElementById('social_instagram').value = social.instagram || '';
  document.getElementById('social_kick').value = social.kick || '';
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

function renderBanner(url) {
  const img = document.getElementById('banner-preview');
  if (url) {
    img.src = url;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
}

const AVATAR_MAX_MB = 5;
const AVATAR_ALLOWED_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const BANNER_MAX_MB = 5;
const BANNER_ALLOWED_TYPES = AVATAR_ALLOWED_TYPES;

async function handleBannerUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!BANNER_ALLOWED_TYPES[file.type]) {
    showToast('Banner must be a PNG, JPG, WEBP, or GIF image.', true);
    e.target.value = '';
    return;
  }
  if (file.size > BANNER_MAX_MB * 1024 * 1024) {
    showToast(`Banner must be under ${BANNER_MAX_MB}MB.`, true);
    e.target.value = '';
    return;
  }

  // GIFs go straight through — cropping would flatten it to a single static frame,
  // losing the animation. Everything else gets cropped to the banner's 18:5 shape
  // before upload, so it's not just a random slice of whatever the source photo was.
  let uploadBlob = file;
  let ext = BANNER_ALLOWED_TYPES[file.type];
  if (file.type !== 'image/gif') {
    const cropped = await openImageCropper({
      file, aspect: 18 / 5, outputW: 1440, outputH: 400,
      title: 'Crop Banner', mimeType: 'image/jpeg', quality: 0.9,
    });
    if (!cropped) { e.target.value = ''; return; }
    uploadBlob = cropped;
    ext = 'jpg';
  }

  try {
    const path = `${currentUserId}/banner-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('banners').upload(path, uploadBlob);
    if (uploadError) throw uploadError;

    const { data: urlData } = sb.storage.from('banners').getPublicUrl(path);
    const { error: updateError } = await sb.from('profiles').update({ banner_url: urlData.publicUrl }).eq('id', currentUserId);
    if (updateError) throw updateError;

    renderBanner(urlData.publicUrl);
    showToast('Banner updated.');
  } catch (err) {
    logError(err);
    showToast(err.message || 'Could not upload banner.', true);
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!AVATAR_ALLOWED_TYPES[file.type]) {
    showToast('Avatar must be a PNG, JPG, WEBP, or GIF image.', true);
    e.target.value = '';
    return;
  }
  if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
    showToast(`Avatar must be under ${AVATAR_MAX_MB}MB.`, true);
    e.target.value = '';
    return;
  }

  // Same GIF exception as the banner above — keep the animation instead of flattening it.
  let uploadBlob = file;
  let ext = AVATAR_ALLOWED_TYPES[file.type];
  if (file.type !== 'image/gif') {
    const cropped = await openImageCropper({
      file, aspect: 1, outputW: 512, outputH: 512, circle: true,
      title: 'Crop Avatar', mimeType: 'image/png',
    });
    if (!cropped) { e.target.value = ''; return; }
    uploadBlob = cropped;
    ext = 'png';
  }

  try {
    const path = `${currentUserId}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('avatars').upload(path, uploadBlob);
    if (uploadError) throw uploadError;

    const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
    const { error: updateError } = await sb.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', currentUserId);
    if (updateError) throw updateError;

    renderAvatar(urlData.publicUrl);
    updateFramePickerButton();
    showToast('Avatar updated.');
  } catch (err) {
    logError(err);
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
    if (e.key === 'Escape') {
      closeBuildModal();
      closeTitleModal();
      closeFramePickerModal();
    }
  });
}

function wireFramePicker() {
  document.getElementById('frame-picker-btn').addEventListener('click', openFramePickerModal);
  document.getElementById('frame-modal-close').addEventListener('click', closeFramePickerModal);
  document.getElementById('frame-picker-modal').addEventListener('click', (e) => {
    if (e.target.id === 'frame-picker-modal') closeFramePickerModal();
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
      <i data-lucide="ban" class="icon-lg"></i>
      <span>None</span>
    </div>
  `;

  const tiles = options.map(opt => `
    <div class="build-modal-tile ${currentValue === opt.value ? 'selected' : ''}" ${opt.rarity ? `data-rarity="${opt.rarity}"` : ''} data-build-value="${escapeHtml(opt.value)}">
      <img src="${opt.icon}" alt="${escapeHtml(opt.value)}" loading="lazy">
      <span>${escapeHtml(opt.value)}</span>
    </div>
  `).join('');

  grid.innerHTML = noneTile + tiles;
  refreshIcons();

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

  if (key === 'fruit' && !value) { currentFruitSkin = ''; currentFruitSkinIcon = ''; }

  const renderFruitValueLabel = () => {
    const skinSuffix = key === 'fruit' && currentFruitSkin ? ` <span class="muted" style="font-weight:400;">(${escapeHtml(currentFruitSkin)})</span>` : '';
    const displayIcon = (key === 'fruit' && currentFruitSkin && currentFruitSkinIcon) ? currentFruitSkinIcon : icon;
    valueEl.innerHTML = `${displayIcon ? `<img src="${displayIcon}" alt="">` : ''}${escapeHtml(value)}${skinSuffix}`;
  };

  if (value) {
    valueEl.classList.remove('is-empty');
    renderFruitValueLabel();
  } else {
    valueEl.classList.add('is-empty');
    valueEl.textContent = '— Choose —';
  }

  // Only prompt when the user just hand-picked a fruit (animate = true from the modal), not
  // while the form is being populated from the saved profile on page load.
  if (key === 'fruit' && animate && value) {
    maybePromptFruitSkin(value, currentFruitSkin, (skin, skinIcon) => {
      currentFruitSkin = skin || '';
      currentFruitSkinIcon = skinIcon || '';
      document.getElementById('build_fruit_skin').value = currentFruitSkin;
      renderFruitValueLabel();
    });
  }
  if (key === 'fruit') {
    document.getElementById('build_fruit_skin').value = currentFruitSkin;
  }

  if (animate) {
    btn.style.animation = 'none';
    requestAnimationFrame(() => { btn.style.animation = 'fadeInUp 0.25s ease both'; });
  }
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
    name_gradient: document.getElementById('name_gradient').value || null,
    avatar_frame: activeAvatarFrame || null,
    active_title_id: document.getElementById('active_title').value || null,
    title_color_override: document.getElementById('title_color_override').value || null,
    bio: document.getElementById('bio').value.trim() || null,
    status_line: document.getElementById('status_line').value.trim() || null,
    region: document.getElementById('region').value.trim() || null,
    pirate_bounty: parseInt(document.getElementById('pirate_bounty').value, 10) || 0,
    marine_bounty: parseInt(document.getElementById('marine_bounty').value, 10) || 0,
    build_fruit: document.getElementById('build_fruit').value || null,
    build_fruit_skin: document.getElementById('build_fruit_skin').value || null,
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
      instagram: document.getElementById('social_instagram').value.trim(),
      kick: document.getElementById('social_kick').value.trim(),
    },
  };

  // Reject anything that isn't a plain http(s) link (e.g. "javascript:...")
  // before it ever reaches the database — the public profile page renders
  // these as real <a href> links for every visitor.
  const badLink = Object.entries(payload.social_links).find(([, v]) => v && safeUrl(v) === '#');
  if (badLink) {
    errorEl.textContent = `That ${badLink[0]} link doesn't look like a valid web address.`;
    errorEl.style.display = 'block';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
    return;
  }

  const { error } = await sb.from('profiles').update(payload).eq('id', currentUserId);

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save Profile';

  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }

  invalidateProfileCache();
  showToast('Profile saved.');
}
