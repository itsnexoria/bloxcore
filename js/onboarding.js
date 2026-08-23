// BloxCore — onboarding/index.html logic

const STEPS = [
  {
    icon: 'anchor',
    title: 'Welcome to BloxCore',
    body: `A community hub for Blox Fruits players — track bounties, trade fruits, find a squad for a raid boss, and run your crew, all in one place. Quick tour, then you're in.`,
  },
  {
    icon: 'swords',
    title: 'Challenges & Leaderboard',
    body: `Complete in-game challenges, submit proof, and earn XP and titles. Keep a daily streak going for bonus XP, and climb the leaderboard against everyone else.`,
  },
  {
    icon: 'repeat',
    title: 'Trading',
    body: `Post what you're offering and what you want. Listings auto-delete after 24 hours to keep things current — no stale posts to sift through.`,
  },
  {
    icon: 'waves',
    title: 'Sea Events',
    body: `Need a squad for a Sea Beast, Leviathan, Kitsune Shrine, or another world event? Post your server link or join someone else's — listings clear out after an hour.`,
  },
  {
    icon: 'users',
    title: 'Crews & Crew Wars',
    body: `Join or start a crew, then call out rival crews to a war. Add video proof of the result and staff will settle any dispute.`,
  },
  {
    icon: 'gift',
    title: 'Giveaways & Chat',
    body: `Enter community giveaways for fruits and limiteds, and jump into live chat to talk with everyone else online right now.`,
  },
];

let currentStep = 0;

onReady(async () => {
  const auth = await requireAuth();
  if (!auth) return;

  render();
});

function render() {
  const container = document.getElementById('onboarding-content');
  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  container.innerHTML = `
    <div class="panel" style="text-align:center; padding:40px 30px;">
      <div style="width:64px; height:64px; border-radius:50%; background:rgb(var(--brass-rgb) / 0.12); display:flex; align-items:center; justify-content:center; margin:0 auto 20px;">
        <i data-lucide="${step.icon}" class="icon-lg" style="color:var(--brass-bright); width:30px; height:30px;"></i>
      </div>
      <h1 style="font-size:1.4rem; margin-bottom:10px;">${step.title}</h1>
      <p class="muted" style="max-width:440px; margin:0 auto; line-height:1.6;">${step.body}</p>

      <div style="display:flex; justify-content:center; gap:6px; margin:28px 0;">
        ${STEPS.map((_, i) => `<span style="width:${i === currentStep ? '20px' : '7px'}; height:7px; border-radius:4px; background:${i === currentStep ? 'var(--brass-bright)' : 'rgba(255,255,255,0.15)'}; transition:width 0.2s;"></span>`).join('')}
      </div>

      <div style="display:flex; gap:10px; justify-content:center;">
        ${currentStep > 0 ? `<button type="button" class="btn btn-ghost" id="onboard-back">Back</button>` : ''}
        <button type="button" class="btn btn-primary" id="onboard-next">${isLast ? "Let's Go" : 'Next'}</button>
      </div>
      ${!isLast ? `<p style="margin-top:18px;"><button type="button" class="btn-link" id="onboard-skip">Skip tour</button></p>` : ''}
    </div>
  `;
  refreshIcons();

  document.getElementById('onboard-next').addEventListener('click', () => {
    if (isLast) return finishOnboarding();
    currentStep++;
    render();
  });
  document.getElementById('onboard-back')?.addEventListener('click', () => {
    currentStep--;
    render();
  });
  document.getElementById('onboard-skip')?.addEventListener('click', finishOnboarding);
}

async function finishOnboarding() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await sb.from('profiles').update({ onboarded: true }).eq('id', session.user.id);
  }
  window.location.href = '/dashboard/';
}
