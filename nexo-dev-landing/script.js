// Reveal-on-scroll for feature rows, grid cells and platform cards.
document.addEventListener('DOMContentLoaded', () => {
  const targets = document.querySelectorAll(
    '.feature-row, .grid .cell, .platform-card, .req, .theme-strip'
  );

  targets.forEach((el) => el.classList.add('reveal'));

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach((el) => io.observe(el));

  // Slight stagger for grid cells so they don't all pop at once.
  document.querySelectorAll('.grid .cell').forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.08}s`;
  });

  // Sticky nav gets a subtle border once the page scrolls.
  const nav = document.querySelector('header.nav');
  if (nav) {
    const onScroll = () => {
      nav.style.borderBottomColor = window.scrollY > 8 ? '#3a3a42' : '#28282f';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
});
