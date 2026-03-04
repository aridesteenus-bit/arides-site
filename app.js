/* Minimal JS to support modal gallery + smooth navigation */
document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll for internal links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Modal gallery (expects .work-item img with data-index)
  const items = Array.from(document.querySelectorAll('[data-work]')) // recommended selector
    .map(el => el);

  // Fallback: if markup differs, grab any .works img
  const imgs = items.length
    ? items
    : Array.from(document.querySelectorAll('.works img, #works img, [data-gallery] img'));

  if (!imgs.length) return;

  const modal = document.querySelector('.modal') || document.getElementById('modal');
  const modalImg = document.querySelector('.modal img') || document.getElementById('modalImage');
  const modalCap = document.querySelector('.modal .caption') || document.getElementById('modalCaption');
  const btnClose = document.querySelector('.modal .close') || document.getElementById('modalClose');
  const btnPrev = document.querySelector('.modal .prev') || document.getElementById('modalPrev');
  const btnNext = document.querySelector('.modal .next') || document.getElementById('modalNext');

  // If modal markup not found, do nothing (prevents JS errors)
  if (!modal || !modalImg || !btnClose) return;

  let index = 0;
  const getData = (i) => {
    const el = imgs[i];
    const src = el.getAttribute('data-full') || el.getAttribute('src');
    const cap = el.getAttribute('data-caption') || el.getAttribute('alt') || '';
    return { src, cap };
  };

  const open = (i) => {
    index = (i + imgs.length) % imgs.length;
    const { src, cap } = getData(index);
    modalImg.src = src;
    if (modalCap) modalCap.textContent = cap;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    btnClose.focus();
  };

  const close = () => {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };

  const prev = () => open(index - 1);
  const next = () => open(index + 1);

  imgs.forEach((el, i) => {
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', () => open(i));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
    });
  });

  btnClose.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  if (btnPrev) btnPrev.addEventListener('click', prev);
  if (btnNext) btnNext.addEventListener('click', next);

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  });
});
