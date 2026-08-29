// BloxCore — admin/manage/#frames logic (admin only)
// Frames are images stored in the 'avatar-frames' Storage bucket, cataloged in the
// avatar_frames table (key/name/image_url/min_level/sort_order). avatarHtml() in
// supabase-client.js reads this same table (cached client-side) to render whichever
// frame a profile has equipped — see that file for the render side of this feature.

let allFrames = [];
let frameEditId = null;
const FRAME_MAX_MB = 2;
const FRAME_ALLOWED_TYPES = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

let _framesTabInit = false;

async function initFramesTab() {
  if (_framesTabInit) return;
  _framesTabInit = true;

  try {
    await loadFrames();
    document.getElementById('frame-form').addEventListener('submit', handleCreateFrame);
    document.getElementById('frame-form-cancel').addEventListener('click', resetFrameForm);
    document.getElementById('frame-image-file').addEventListener('change', handleFrameImagePreview);
  } catch (e) {
    logError('Failed to init Frames tab:', e);
    _framesTabInit = false;
    showToast('Something went wrong loading avatar frames. Try again.', true);
  }
}

async function loadFrames() {
  const list = document.getElementById('frames-list');
  const { data, error } = await sb.from('avatar_frames').select('*').order('sort_order', { ascending: true });

  if (error) {
    list.innerHTML = errorStateHtml("Couldn't load avatar frames right now.", 'loadFrames()');
    refreshIcons();
    logError(error);
    return;
  }

  allFrames = data;

  if (!data.length) {
    list.innerHTML = `<div class="empty-state">No frames yet — upload the first one above.</div>`;
    return;
  }

  list.innerHTML = `<div class="panel panel-plain" style="padding:0;">` +
    data.map((f, i) => `
      <div class="flex-between" style="padding:12px 20px; ${i === data.length - 1 ? '' : 'border-bottom:1px solid var(--navy-light);'}">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${f.image_url}" alt="${escapeHtml(f.name)}" loading="lazy" style="width:44px; height:44px; object-fit:contain; background:var(--navy); border-radius:8px; padding:4px; border:1px solid var(--glass-border);">
          <div>
            <p style="margin:0; font-weight:700; font-size:0.9rem;">${escapeHtml(f.name)}</p>
            <p class="muted" style="margin:2px 0 0; font-size:0.76rem;">Level ${f.min_level}+ · key: ${escapeHtml(f.key)}</p>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-ghost btn-sm" data-move-frame="${f.id}" data-dir="up" ${i === 0 ? 'disabled' : ''} title="Move up"><i data-lucide="chevron-up" class="icon-sm"></i></button>
          <button class="btn btn-ghost btn-sm" data-move-frame="${f.id}" data-dir="down" ${i === data.length - 1 ? 'disabled' : ''} title="Move down"><i data-lucide="chevron-down" class="icon-sm"></i></button>
          <button class="btn btn-ghost btn-sm" data-edit-frame="${f.id}" title="Edit"><i data-lucide="pencil" class="icon-sm"></i></button>
          <button class="btn btn-danger btn-sm" data-delete-frame="${f.id}" data-name="${escapeHtml(f.name)}" title="Delete"><i data-lucide="trash-2" class="icon-sm"></i></button>
        </div>
      </div>
    `).join('') +
    `</div>`;

  document.querySelectorAll('[data-delete-frame]').forEach(btn => {
    btn.addEventListener('click', () => deleteFrame(btn.dataset.deleteFrame, btn.dataset.name));
  });
  document.querySelectorAll('[data-edit-frame]').forEach(btn => {
    btn.addEventListener('click', () => loadFrameIntoForm(btn.dataset.editFrame));
  });
  document.querySelectorAll('[data-move-frame]').forEach(btn => {
    btn.addEventListener('click', () => moveFrame(btn.dataset.moveFrame, btn.dataset.dir));
  });
  refreshIcons();
}

function handleFrameImagePreview(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('frame-image-preview');
  if (!file) { preview.style.display = 'none'; return; }

  if (!FRAME_ALLOWED_TYPES[file.type]) {
    showToast('Frame image must be a PNG, WEBP, or GIF (needs a transparent center).', true);
    e.target.value = '';
    preview.style.display = 'none';
    return;
  }
  if (file.size > FRAME_MAX_MB * 1024 * 1024) {
    showToast(`Frame image must be under ${FRAME_MAX_MB}MB.`, true);
    e.target.value = '';
    preview.style.display = 'none';
    return;
  }

  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
}

function slugifyFrameKey(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `frame-${Date.now()}`;
}

async function handleCreateFrame(e) {
  e.preventDefault();
  const name = document.getElementById('frame-name').value.trim();
  const minLevel = parseInt(document.getElementById('frame-min-level').value, 10) || 0;
  const file = document.getElementById('frame-image-file').files[0];
  const btn = e.target.querySelector('button[type="submit"]');

  if (!frameEditId && !file) {
    showToast('Choose a frame image to upload.', true);
    return;
  }

  btn.disabled = true;
  try {
    let imageUrl = null;
    if (file) {
      const ext = FRAME_ALLOWED_TYPES[file.type];
      const path = `${slugifyFrameKey(name)}-${Date.now()}.${ext}`;
      const { error: uploadError } = await sb.storage.from('avatar-frames').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = sb.storage.from('avatar-frames').getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }

    if (frameEditId) {
      const patch = { name, min_level: minLevel };
      if (imageUrl) patch.image_url = imageUrl;
      const { error } = await sb.from('avatar_frames').update(patch).eq('id', frameEditId);
      if (error) throw error;
      showToast('Frame updated.');
    } else {
      const maxSort = allFrames.reduce((m, f) => Math.max(m, f.sort_order), -1);
      const { error } = await sb.from('avatar_frames').insert({
        key: slugifyFrameKey(name),
        name,
        image_url: imageUrl,
        min_level: minLevel,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
      showToast('Frame added.');
    }

    resetFrameForm();
    await loadFrames();
  } catch (err) {
    logError(err);
    showToast(err.message || 'Could not save frame.', true);
  } finally {
    btn.disabled = false;
  }
}

function loadFrameIntoForm(id) {
  const f = allFrames.find(x => x.id === id);
  if (!f) return;

  frameEditId = f.id;
  document.getElementById('frame-name').value = f.name;
  document.getElementById('frame-min-level').value = f.min_level;
  document.getElementById('frame-image-file').value = '';
  document.getElementById('frame-image-file').required = false;
  const preview = document.getElementById('frame-image-preview');
  preview.src = f.image_url;
  preview.style.display = 'block';

  document.getElementById('frame-form-heading').textContent = `Editing "${f.name}"`;
  document.getElementById('frame-form-submit').textContent = 'Save Changes';
  document.getElementById('frame-form-cancel').style.display = 'inline-block';
  document.getElementById('frame-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetFrameForm() {
  frameEditId = null;
  document.getElementById('frame-form').reset();
  document.getElementById('frame-image-file').required = true;
  document.getElementById('frame-image-preview').style.display = 'none';
  document.getElementById('frame-form-heading').textContent = 'Upload a Frame';
  document.getElementById('frame-form-submit').textContent = 'Add Frame';
  document.getElementById('frame-form-cancel').style.display = 'none';
}

async function deleteFrame(id, name) {
  if (!window.confirm(`Delete "${name}"? Anyone with it equipped will just show no frame — it won't remove their profile.`)) return;

  const { error } = await sb.from('avatar_frames').delete().eq('id', id);
  if (error) {
    showToast(error.message, true);
    return;
  }
  showToast('Frame deleted.');
  await loadFrames();
}

async function moveFrame(id, dir) {
  const idx = allFrames.findIndex(f => f.id === id);
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= allFrames.length) return;

  const a = allFrames[idx];
  const b = allFrames[swapIdx];
  const [{ error: err1 }, { error: err2 }] = await Promise.all([
    sb.from('avatar_frames').update({ sort_order: b.sort_order }).eq('id', a.id),
    sb.from('avatar_frames').update({ sort_order: a.sort_order }).eq('id', b.id),
  ]);
  const error = err1 || err2;
  if (error) {
    showToast(error.message, true);
    return;
  }
  await loadFrames();
}
