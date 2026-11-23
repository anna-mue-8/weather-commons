// Visual essay for sketch 21: shows one <section class="page"> at a time.
// The arrows and numbered pages in the footer, the keyboard, swipes, the contents list and the start cards all flip pages.
// Under each page's text box, an archive box shows small images and clippings from media/media.json.
// The address ends with the page's id (#a3), so a page can be linked directly.

const pages = [...document.querySelectorAll('.page')];
const toc = document.getElementById('toc');
const where = document.getElementById('where');
const steps = document.getElementById('steps');
const essay = document.querySelector('.essay');
const GROUPS = {
  A: 'A · Extraction modifying the weather',
  B: 'B · Extracting for weather modification',
};
let current = 0;

// Page navigation: the contents open in a pop-up from the button at the right of the footer
const navBtn = document.getElementById('nav-btn');
const contentsBox = document.getElementById('contents');
function closeNav() { contentsBox.classList.remove('open'); navBtn.setAttribute('aria-expanded', 'false'); }
navBtn.addEventListener('click', () => {
  const open = contentsBox.classList.toggle('open');
  navBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
document.addEventListener('click', (e) => { if (contentsBox.classList.contains('open') && !e.target.closest('#contents, #nav-btn')) closeNav(); });

// Contents list, built from the pages' data-toc and data-group
let lastGroup = null;
const links = pages.map((p) => {
  const g = p.dataset.group;
  if (g !== lastGroup && GROUPS[g]) {
    const head = document.createElement('li');
    head.className = 'group';
    head.textContent = GROUPS[g];
    toc.append(head);
  }
  lastGroup = g;
  const li = document.createElement('li');
  if (g === 'end') li.className = 'end';
  const a = document.createElement('a');
  a.href = `#${p.id}`;
  a.innerHTML = `<span class="n">${p.dataset.num ?? ''}</span><span></span>`;
  a.lastChild.textContent = p.dataset.toc;
  li.append(a);
  toc.append(li);
  return a;
});

// Footer: ← 1 A 2 3 … B … → , one numbered button per page, as in sketch 04
const mk = (html, cls, label) => Object.assign(document.createElement('button'), { type: 'button', className: cls, innerHTML: html, ariaLabel: label });
const prev = mk('←', 'arrow', 'Previous page');
const next = mk('→', 'arrow', 'Next page');
steps.append(prev);
let partShown = null;
const nums = pages.map((p, k) => {
  const g = p.dataset.group;
  if (GROUPS[g] && g !== partShown) steps.append(Object.assign(document.createElement('span'), { className: 'part', textContent: g, title: GROUPS[g] }));
  partShown = g;
  const b = mk(String(k + 1), 'st', `Page ${k + 1}: ${p.dataset.toc}`);
  b.addEventListener('click', () => show(k));
  steps.append(b);
  return b;
});
steps.append(next);

function show(i) {
  current = Math.max(0, Math.min(pages.length - 1, i));
  pages.forEach((p, k) => { p.hidden = k !== current; });
  document.querySelectorAll('.page[hidden] video').forEach((v) => v.pause()); // stop videos on pages left behind
  pages[current].querySelectorAll('video').forEach(playVideo);                 // and start the one on this page
  links.forEach((a, k) => (k === current ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  nums.forEach((b, k) => b.setAttribute('aria-current', String(k === current)));
  essay.classList.toggle('on-start', pages[current].id === 'start');
  closeNav();
  const p = pages[current];
  const label = p.dataset.num ? `${p.dataset.group} · ${p.dataset.num} · ` : '';
  where.textContent = `${label}${p.dataset.toc} · ${current + 1} of ${pages.length}`;
  prev.disabled = current === 0;
  next.disabled = current === pages.length - 1;
  history.replaceState(null, '', current === 0 ? location.pathname + location.search : `#${p.id}`);
  document.title = `${current === 0 ? '' : p.dataset.toc + ' · '}21 · consequential weathering / earthly atmospheres · Realtime Weather`;
  if (p.id === 'start') wind.start(); else wind.stop();
}
// Videos start by themselves, muted and looping. Archive videos wait when the visitor has asked for less
// motion; the A · II animation (video.anim) always plays, as Anna-Lena wants (click pauses it).
function playVideo(v) {
  if (!v.classList.contains('anim') && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  v.muted = true;
  const p = v.play();
  if (p) p.catch(() => { v.controls = true; }); // if the browser refuses, show its play button
}
const showId = (id) => { const k = pages.findIndex((p) => p.id === id); if (k >= 0) show(k); };

prev.addEventListener('click', () => show(current - 1));
next.addEventListener('click', () => show(current + 1));

// Links to a page (#a1) flip to it instead of jumping
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  if (!pages.some((p) => p.id === id)) return;
  e.preventDefault();
  showId(id);
  closeNav();
});
window.addEventListener('hashchange', () => showId(location.hash.slice(1)));

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') show(current + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') show(current - 1);
  else if (e.key === 'Home') show(0);
  else if (e.key === 'End') show(pages.length - 1);
  else return;
  e.preventDefault();
});

// Swipe left or right on a touch screen (not while turning an image or model)
let touch = null;
const stage = document.querySelector('.pages');
stage.addEventListener('touchstart', (e) => { if (e.target.closest('.orbit, .model3d, .rmap-stage')) { touch = null; return; } touch = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
stage.addEventListener('touchend', (e) => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch[0];
  const dy = e.changedTouches[0].clientY - touch[1];
  if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) show(current + (dx < 0 ? 1 : -1));
  touch = null;
});

// Page videos (A · II animation): click to pause or play
document.querySelectorAll('video.anim').forEach((v) => v.addEventListener('click', () => (v.paused ? v.play() : v.pause())));

// Archive box under each text box: small photos and clippings, one at a time, from media/media.json.
// Each item names its page ("page": "a2"); the README lists the fields.
let MEDIA = [];
const archives = {};
pages.forEach((p) => {
  if (p.id === 'start' || p.id === 'sources') return;
  const box = document.createElement('aside');
  box.className = 'archive';
  box.setAttribute('aria-label', 'Archive: images and clippings');
  box.innerHTML = '<div class="archive-head"><span>Archive</span><span class="archive-n"></span>'
    + '<button type="button" class="archive-prev" aria-label="Previous item">←</button>'
    + '<button type="button" class="archive-next" aria-label="Next item">→</button></div><div class="archive-body"></div>';
  p.append(box);
  const st = { box, at: 0 };
  archives[p.id] = st;
  box.querySelector('.archive-prev').addEventListener('click', () => fillArchive(p.id, st.at - 1));
  box.querySelector('.archive-next').addEventListener('click', () => fillArchive(p.id, st.at + 1));
});
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
function fillArchive(id, k) {
  const st = archives[id];
  const list = MEDIA.filter((m) => m.page === id);
  const body = st.box.querySelector('.archive-body');
  const many = list.length > 1;
  st.box.querySelector('.archive-prev').hidden = !many;
  st.box.querySelector('.archive-next').hidden = !many;
  st.box.classList.toggle('empty', !list.length);
  body.replaceChildren();
  if (!list.length) {
    st.box.querySelector('.archive-n').textContent = '';
    body.append(el('p', 'archive-empty', 'Images to come.'));
    return;
  }
  st.at = (k + list.length) % list.length;
  const m = list[st.at];
  st.box.querySelector('.archive-n').textContent = many ? `${st.at + 1} of ${list.length}` : '';
  if (m.src && m.type === 'video') {
    const v = el('video');
    Object.assign(v, { src: m.src, controls: true, muted: true, loop: true, playsInline: true, preload: 'auto' });
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    if (!st.box.closest('.page').hidden) playVideo(v);
    v.setAttribute('aria-label', m.alt || m.caption || 'Video');
    body.append(v);
  } else if (m.src) {
    const img = el('img');
    img.src = m.src; img.alt = m.alt || m.caption || ''; img.loading = 'lazy';
    if (m.type === 'article' && /^https?:\/\//.test(m.source || '')) {
      // an article: the screen grab links to it
      const link = el('a', 'archive-link');
      Object.assign(link, { href: m.source, target: '_blank', rel: 'noopener' });
      link.title = 'Open the article (new tab)';
      link.append(img);
      body.append(link);
    } else {
      img.title = 'Click to see it large';
      img.addEventListener('click', () => openViewer(m));
      body.append(img);
    }
  }
  if (m.headline) body.append(el('p', 'hl', m.headline));
  if (m.caption) body.append(el('p', '', m.caption));
  const credit = el('p', 'cr', [m.kind, m.credit || m.outlet, m.date].filter(Boolean).join(' · '));
  if (m.licence) {
    const lic = /^https?:\/\//.test(m.licence_url || '') ? Object.assign(el('a', '', m.licence), { href: m.licence_url, rel: 'noopener', target: '_blank' }) : m.licence;
    credit.append(credit.textContent ? ' · ' : '', lic);
  }
  if (m.changes) credit.append(credit.textContent ? ' · ' : '', m.changes);
  if (/^https?:\/\//.test(m.source || '')) {
    const a = el('a', '', 'source');
    a.href = m.source; a.rel = 'noopener'; a.target = '_blank';
    credit.append(credit.textContent ? ' · ' : '', a);
  }
  if (credit.textContent) body.append(credit);
}
// A large view of an archive image, closed by a click or Esc
const viewer = document.createElement('dialog');
viewer.className = 'viewer';
viewer.addEventListener('click', () => viewer.close());
document.body.append(viewer);
function openViewer(m) {
  const img = el('img');
  img.src = m.src; img.alt = m.alt || m.caption || '';
  viewer.replaceChildren(img, el('p', '', 'Click or press Esc to close.'));
  viewer.showModal();
}

Object.keys(archives).forEach((id) => fillArchive(id, 0));
fetch('media/media.json')
  .then((r) => (r.ok ? r.json() : []))
  .then((j) => { MEDIA = Array.isArray(j) ? j.filter((m) => m && m.page) : []; Object.keys(archives).forEach((id) => fillArchive(id, 0)); })
  .catch(() => {});

// A · I: tilt (up and down) and turn (sideways) the satellite time-lapse by dragging or with the arrow keys. No zoom.
document.querySelectorAll('.orbit').forEach((box) => {
  const plane = box.querySelector('.orbit-plane');
  let tilt = 0, turn = 0, drag = null;
  const set = () => {
    tilt = Math.max(0, Math.min(70, tilt));
    plane.style.setProperty('--tilt', tilt + 'deg');
    plane.style.setProperty('--turn', turn + 'deg');
  };
  box.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY, tilt, turn]; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    turn = drag[3] + (e.clientX - drag[0]) * 0.4;
    tilt = drag[2] - (e.clientY - drag[1]) * 0.3;
    set();
  });
  const end = () => { drag = null; };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [0, -10], ArrowRight: [0, 10], ArrowUp: [-8, 0], ArrowDown: [8, 0] }[e.key];
    if (!k) return;
    tilt += k[0]; turn += k[1]; set();
    e.preventDefault(); e.stopPropagation(); // the arrow keys turn the image here instead of flipping the page
  });
  const reset = box.parentElement.querySelector('.orbit-reset');
  if (reset) reset.addEventListener('click', () => { tilt = 0; turn = 0; set(); });
});

// Start page: a faint wind in the background. Synthetic, not data: streaks carried by a gentle
// westerly that meanders and swirls, slowly changing over time.
const wind = (() => {
  const canvas = document.querySelector('.wind');
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pts = [], w = 0, h = 0, raf = 0, on = false, t = 0;
  const flow = (x, y) => {
    const a = Math.sin(x * .004 + t * .0007) * .9 + Math.cos(y * .006 - t * .0005) * .7 + Math.sin((x + y) * .002 + t * .0003) * .5;
    return [1.1 + .6 * Math.cos(a), .9 * Math.sin(a)];
  };
  const spawn = (p = {}) => Object.assign(p, { x: Math.random() * w, y: Math.random() * h, life: 60 + Math.random() * 180 });
  function size() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    w = r.width; h = r.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(700, (w * h) / 2200));
    while (pts.length < n) pts.push(spawn());
    pts.length = n;
  }
  function move(fg) {
    ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.globalAlpha = .24;
    ctx.beginPath();
    for (const p of pts) {
      const [u, v] = flow(p.x, p.y);
      ctx.moveTo(p.x, p.y);
      p.x += u; p.y += v;
      ctx.lineTo(p.x, p.y);
      if (--p.life < 0 || p.x > w + 2 || p.y < -2 || p.y > h + 2) { spawn(p); if (Math.random() < .5) p.x = -2; }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function frame() {
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#000';
    // fade old streaks a little each frame, so the wind leaves short trails
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,.045)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    t++;
    move(fg);
    if (on && !still) raf = requestAnimationFrame(frame);
  }
  function stillFrame() { // reduced motion: one still picture of the streaks
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#000';
    ctx.clearRect(0, 0, w, h);
    for (let k = 0; k < 24; k++) move(fg);
  }
  new ResizeObserver(() => { if (!on) return; size(); if (still) stillFrame(); }).observe(canvas);
  return {
    start() { cancelAnimationFrame(raf); on = true; size(); if (still) stillFrame(); else frame(); },
    stop() { cancelAnimationFrame(raf); on = false; },
  };
})();

show(Math.max(0, pages.findIndex((p) => p.id === location.hash.slice(1))));
