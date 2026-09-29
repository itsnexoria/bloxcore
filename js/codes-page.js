// Small progressive-enhancement script for /blox-fruits-codes/ — copies a code to the
// clipboard when its button is clicked. No effect if clipboard access is unavailable/denied.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.codes-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.code);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 1500);
      } catch {
        // Clipboard API unavailable (e.g. insecure context) — the code is still selectable text.
      }
    });
  });
});
