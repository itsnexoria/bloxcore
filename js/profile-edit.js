// BloxCore — profile/index.html logic (edit own profile)

let currentUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireAuth();
  if (!auth) return;
  currentUserId = auth.user.id;

  document.getElementById('view-public-link').href = `/player/?u=${encodeURIComponent(auth.profile.username)}`;

  populateForm(auth.profile);

  document.getElementById('avatar-file').addEventListener('change', handleAvatarUpload);
  document.getElementById('profile-form').addEventListener('submit', handleSave);
});

function populateForm(profile) {
  renderAvatar(profile.avatar_url);
  document.getElementById('bio').value = profile.bio || '';
  document.getElementById('region').value = profile.region || '';
  document.getElementById('pirate_bounty').value = profile.pirate_bounty || 0;
  document.getElementById('marine_bounty').value = profile.marine_bounty || 0;

  const social = profile.social_links || {};
  document.getElementById('social_youtube').value = social.youtube || '';
  document.getElementById('social_twitch').value = social.twitch || '';
  document.getElementById('social_twitter').value = social.twitter || '';
  document.getElementById('social_tiktok').value = social.tiktok || '';
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

async function handleSave(e) {
  e.preventDefault();
  const errorEl = document.getElementById('profile-error');
  const saveBtn = document.getElementById('save-profile-btn');
  errorEl.style.display = 'none';
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const payload = {
    bio: document.getElementById('bio').value.trim() || null,
    region: document.getElementById('region').value.trim() || null,
    pirate_bounty: parseInt(document.getElementById('pirate_bounty').value, 10) || 0,
    marine_bounty: parseInt(document.getElementById('marine_bounty').value, 10) || 0,
    social_links: {
      youtube: document.getElementById('social_youtube').value.trim(),
      twitch: document.getElementById('social_twitch').value.trim(),
      twitter: document.getElementById('social_twitter').value.trim(),
      tiktok: document.getElementById('social_tiktok').value.trim(),
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
