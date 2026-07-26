// BloxCore — shared nav behavior, included on every page after supabase-client.js

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  highlightActiveLink();
  populateAuthArea();
});

function highlightActiveLink() {
  // Normalize both sides to no trailing slash (except root, which stays "/")
  let path = window.location.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '') path = '/';

  document.querySelectorAll('.nav-links a[href]').forEach(a => {
    let href = a.getAttribute('href');
    if (href.length > 1 && href.endsWith('/')) href = href.slice(0, -1);
    if (href === path) a.classList.add('active');
  });
}

async function populateAuthArea() {
  const slot = document.getElementById('nav-auth-slot');
  if (!slot) return;

  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    slot.innerHTML = `<a href="/auth/" class="btn btn-primary btn-sm">Sign In</a>`;
    return;
  }

  const { data: profile } = await sb.from('profiles').select('username, is_admin').eq('id', session.user.id).single();
  const adminLink = profile?.is_admin ? `<a href="/admin/">Review Board</a>` : '';

  slot.innerHTML = `
    ${adminLink}
    <a href="/dashboard/">${escapeHtml(profile?.username || 'Dashboard')}</a>
    <button class="btn btn-ghost btn-sm" id="nav-sign-out">Sign Out</button>
  `;

  document.getElementById('nav-sign-out')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = '/';
  });
}
