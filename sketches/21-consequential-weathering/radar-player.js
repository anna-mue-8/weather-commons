// A · III: radar time-lapse around Schwarze Pumpe (observed: DWD RADKLIM, every 5 minutes).
// Left: the rain in each 5 minutes. Right: minutes of rain so far at each square kilometre (derived),
// so rain that lingers builds up as a bright spot. Below: minutes of rain at the plant against the
// typical value around it (median of everything 6-45 km away). Data: images/radar/ (scripts/make_radar_timelapse.py).

(() => {
  const box = document.getElementById('radar');
  if (!box) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cNow = box.querySelector('.radar-now');
  const cSum = box.querySelector('.radar-sum');
  const scrub = box.querySelector('.radar-scrub');
  const playBtn = box.querySelector('.radar-play');
  const timeEl = box.querySelector('.radar-time');
  const noteEl = box.querySelector('.radar-note');
  const statEl = box.querySelector('.radar-stat');
  const daysEl = box.querySelector('.radar-days');

  let meta = null, day = null, frames = [], sums = [], n = 0, size = 90, at = 0;
  let playing = !still, visible = false, timer = 0;
  const cache = {};

  // pixels 6-45 km from the plant: the 'surroundings'
  let ring = [];
  let plantPx = [];

  async function loadDay(d) {
    if (!cache[d.file]) {
      const blob = await (await fetch('images/radar/' + d.file)).blob();
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
      const s = bmp.width, count = bmp.height / s;
      const fr = [];
      for (let k = 0; k < count; k++) {
        const a = new Uint8Array(s * s);
        for (let i = 0; i < s * s; i++) a[i] = px[(k * s * s + i) * 4];
        fr.push(a);
      }
      // running count of rainy 5-minute steps (>= 0.05 mm) per pixel
      const sm = [];
      let run = new Uint16Array(s * s);
      for (const a of fr) {
        run = run.slice();
        for (let i = 0; i < a.length; i++) if (a[i] !== 255 && a[i] >= 5) run[i]++;
        sm.push(run);
      }
      cache[d.file] = { fr, sm, s };
    }
    const c = cache[d.file];
    day = d; frames = c.fr; sums = c.sm; size = c.s; n = frames.length;
    scrub.max = String(n - 1);
    noteEl.textContent = d.note;
    daysEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === d.date)));
    if (!ring.length) {
      const [px0, py0] = meta.places['Schwarze Pumpe'];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const r = Math.hypot(x + 0.5 - px0, y + 0.5 - py0);
        if (r <= 1.6) plantPx.push(y * size + x);
        else if (r >= 6 && r <= 45) ring.push(y * size + x);
      }
    }
    parts = [];
    show(0);
    setPlaying(playing);   // start (again) now that there is something to play
    setFx();
  }

  // drawing ---------------------------------------------------------------------------------------
  const tmp = document.createElement('canvas');
  function paint(canvas, values, colour) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    if (!w) return null;
    if (canvas.width !== w) { canvas.width = w; canvas.height = w; }
    tmp.width = size; tmp.height = size;
    const tg = tmp.getContext('2d');
    const img = tg.createImageData(size, size);
    for (let i = 0; i < values.length; i++) {
      const [r, g, b] = colour(values[i]);
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    tg.putImageData(img, 0, 0);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, w, w);
    return { g, k: w / size, dpr };
  }
  // Rain colours, light to heavy: green, yellow, blue (Anna-Lena's choice). 0.5 mm in 5 minutes (6 mm/h) = full blue.
  const RAMP = [[0, [46, 160, 67]], [0.5, [255, 214, 10]], [1, [40, 110, 255]]];
  const ramp = (t) => {
    for (let i = 1; i < RAMP.length; i++) {
      const [t1, c1] = RAMP[i], [t0, c0] = RAMP[i - 1];
      if (t <= t1) {
        const f = (t - t0) / (t1 - t0);
        return c0.map((c, j) => Math.round(c + (c1[j] - c) * f));
      }
    }
    return RAMP[RAMP.length - 1][1];
  };
  const nowColour = (v) => {
    if (v === 255) return [22, 22, 22];          // no radar data
    if (v < 2) return [0, 0, 0];
    return ramp(Math.sqrt(Math.min(1, v / 50)));
  };

  function legend(p, left = 'light', right = '6+ mm/h') {   // colour key, bottom right of a panel
    if (!p) return;
    const { g, dpr } = p;
    const w = g.canvas.width, bw = 90 * dpr, bh = 7 * dpr, x = w - bw - 10 * dpr, y = w - 20 * dpr;
    for (let i = 0; i < bw; i++) {
      g.fillStyle = `rgb(${ramp(i / (bw - 1)).join(',')})`;
      g.fillRect(x + i, y, 1, bh);
    }
    g.font = `${9 * dpr}px system-ui, sans-serif`;
    g.fillStyle = '#fff';
    g.textAlign = 'left'; label(g, left, x, y - 4 * dpr, dpr);
    g.textAlign = 'right'; label(g, right, x + bw, y - 4 * dpr, dpr);
    g.textAlign = 'left';
  }
  let sumMax = 1;
  const sumColour = (m) => {   // same colours: green = a few minutes, blue = the longest rain of the day
    if (!m) return [0, 0, 0];
    return ramp(Math.pow(Math.min(1, m / sumMax), 0.6));
  };

  function label(g, text, x, y, dpr) {   // text with a thin dark outline, readable on rain
    g.save(); g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 3 * dpr; g.lineJoin = 'round';
    g.strokeText(text, x, y); g.restore(); g.fillText(text, x, y);
  }

  function overlay(p, title) {
    if (!p) return;
    const { g, k, dpr } = p;
    const f = (s) => `${s * dpr}px system-ui, sans-serif`;
    g.lineWidth = 1.2 * dpr;
    for (const [name, [x, y]] of Object.entries(meta.places)) {
      const X = x * k, Y = y * k;
      if (name === 'Schwarze Pumpe') {
        g.strokeStyle = '#ff3b30'; g.lineWidth = 2 * dpr;
        g.beginPath(); g.arc(X, Y, 7 * dpr, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#ff3b30'; g.font = f(11); g.textAlign = 'center'; label(g, 'Schwarze Pumpe', X, Y + 21 * dpr, dpr); g.textAlign = 'left';
        g.lineWidth = 1.2 * dpr;
      } else {
        g.fillStyle = '#9a9a9a';
        g.beginPath(); g.arc(X, Y, 2 * dpr, 0, Math.PI * 2); g.fill();
        g.font = f(10); label(g, name, X + 5 * dpr, Y - 4 * dpr, dpr);
      }
    }
    // 10 km scale bar and the panel's name
    const w = g.canvas.width;
    g.strokeStyle = '#fff'; g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(10 * dpr, w - 12 * dpr); g.lineTo(10 * dpr + 10 * k, w - 12 * dpr); g.stroke();
    g.font = f(10); label(g, '10 km', 10 * dpr, w - 17 * dpr, dpr);
    g.font = f(11); label(g, title, 10 * dpr, 16 * dpr, dpr);
  }

  function windArrow(p, hour) {
    const wv = day.wind[hour];
    if (!p || !wv) return;
    const { g, dpr } = p;
    const w = g.canvas.width;
    const label = (t, x, y) => { g.save(); g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 3 * dpr; g.strokeText(t, x, y); g.restore(); g.fillText(t, x, y); };
    const to = (wv[0] + 180) * Math.PI / 180;           // direction the wind blows toward
    const cx = w - 34 * dpr, cy = 34 * dpr, L = 16 * dpr;
    const dx = Math.sin(to) * L, dy = -Math.cos(to) * L;
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 1.5 * dpr;
    g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.stroke();
    const a = Math.atan2(dy, dx);
    g.beginPath(); g.moveTo(cx + dx, cy + dy);
    g.lineTo(cx + dx - 7 * dpr * Math.cos(a - 0.5), cy + dy - 7 * dpr * Math.sin(a - 0.5));
    g.lineTo(cx + dx - 7 * dpr * Math.cos(a + 0.5), cy + dy - 7 * dpr * Math.sin(a + 0.5));
    g.fill();
    g.font = `${10 * dpr}px system-ui, sans-serif`; g.textAlign = 'right';
    label(`wind ${wv[1]} m/s`, w - 8 * dpr, 64 * dpr);
    g.textAlign = 'left';
  }

  function show(i) {
    if (!n) return;
    at = (i + n) % n;
    scrub.value = String(at);
    const t = day.times_utc[at];
    timeEl.textContent = `${day.title}, ${t} UTC`;
    sumMax = Math.max(6, ...sums[n - 1]);
    const steps = sums[at];
    const pNow = paint(cNow, frames[at], nowColour);
    overlay(pNow, 'Rain now (5 minutes)');
    windArrow(pNow, t.slice(0, 2));
    legend(pNow);
    const pSum = paint(cSum, steps, sumColour);
    overlay(pSum, 'Minutes of rain so far');
    legend(pSum, '5 min', `${sumMax * 5} min`);
    if (still) drawParticlesStill();
    // the plant against its surroundings
    const plant = plantPx.reduce((s, i) => s + steps[i], 0) / plantPx.length * 5;
    const around = ring.map((i) => steps[i]).sort((a, b) => a - b);
    const median = around[Math.floor(around.length / 2)] * 5;
    const higher = around.filter((v) => v * 5 < plant).length / around.length * 100;
    statEl.textContent = `Since ${day.times_utc[0]} UTC: ${Math.round(plant / 5) * 5} min of rain at the plant; `
      + `typical around it (6–45 km): ${Math.round(median)} min.`
      + (plant >= 10 ? ` More than at ${Math.round(higher)} % of the surroundings.` : '');
  }

  // particles from the plant, drifting with the measured wind (synthetic, illustrative) ------------
  // A transparent layer over each panel. The specks move at the station wind speed scaled to the
  // time-lapse (one 5-minute step every 0.28 s), and spread out slowly sideways like a plume.
  const fx = [cNow, cSum].map((c) => {
    const wrap = document.createElement('div');
    wrap.className = 'radar-cell';
    c.replaceWith(wrap);
    wrap.append(c);
    const o = document.createElement('canvas');
    o.className = 'radar-fx';
    o.setAttribute('aria-hidden', 'true');
    wrap.append(o);
    return o;
  });
  const KM_PER_S = 300 / 1000 / 0.28;   // per m/s of wind: km moved per second of playback
  let parts = [], owed = 0, lastT = 0, fxRaf = 0;
  const windNow = () => (day ? day.wind[day.times_utc[at].slice(0, 2)] : null);

  function moveParticles(dt) {
    const w = windNow();
    if (!w || !meta) return;
    const [x0, y0] = meta.places['Schwarze Pumpe'];
    const to = (w[0] + 180) * Math.PI / 180;
    const ux = Math.sin(to), uy = -Math.cos(to);     // x right, y down (north up)
    const d = Math.max(0.6, w[1]) * KM_PER_S * dt;
    owed += dt * 45;
    while (owed >= 1) { parts.push({ x: x0, y: y0, s: 0, side: Math.random() - 0.5 }); owed -= 1; }
    for (const p of parts) {
      p.s += d;
      p.x += ux * d - uy * p.side * 0.35 * d;      // along the wind, plus a slow sideways spread
      p.y += uy * d + ux * p.side * 0.35 * d;
    }
    parts = parts.filter((p) => p.s < 55 && p.x > -2 && p.y > -2 && p.x < size + 2 && p.y < size + 2);
  }

  function drawParticles() {
    for (let i = 0; i < 2; i++) {
      const base = [cNow, cSum][i], o = fx[i];
      if (o.width !== base.width) { o.width = base.width; o.height = base.height; }
      const g = o.getContext('2d');
      g.clearRect(0, 0, o.width, o.height);
      const k = o.width / size, dpr = Math.min(2, devicePixelRatio || 1);
      for (const p of parts) {
        const a = 0.95 * (1 - p.s / 55);
        // a small cross (+) for each particle
        const X = p.x * k, Y = p.y * k, r = 1.1 * dpr;
        g.strokeStyle = `rgba(255,0,127,${a.toFixed(3)})`;
        g.lineWidth = 0.8 * dpr;
        g.beginPath(); g.moveTo(X - r, Y); g.lineTo(X + r, Y); g.moveTo(X, Y - r); g.lineTo(X, Y + r); g.stroke();
      }
    }
  }

  function fxLoop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
    lastT = now;
    moveParticles(dt);
    drawParticles();
    fxRaf = requestAnimationFrame(fxLoop);
  }
  function setFx() {
    cancelAnimationFrame(fxRaf);
    if (!still && visible && n) { lastT = performance.now(); fxRaf = requestAnimationFrame(fxLoop); }
  }
  function drawParticlesStill() {   // less motion: one still picture of the trail for this hour
    parts = []; owed = 0;
    for (let t = 0; t < 7; t += 1 / 30) moveParticles(1 / 30);
    drawParticles();
  }

  // playback --------------------------------------------------------------------------------------
  function tick() {
    show(at + 1);
    timer = setTimeout(tick, at === n - 1 ? 1600 : 280);
  }
  function setPlaying(p) {
    playing = p;
    playBtn.textContent = p ? 'Pause' : 'Play';
    clearTimeout(timer);
    if (p && visible && n) timer = setTimeout(tick, 280);
  }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  scrub.addEventListener('input', () => { setPlaying(false); show(+scrub.value); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; setPlaying(playing); setFx(); if (visible && n) show(at); }).observe(box);
  new ResizeObserver(() => { if (n) show(at); }).observe(cNow);

  fetch('images/radar/radar.json').then((r) => r.json()).then((m) => {
    meta = m;
    for (const d of m.days) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.date = d.date; b.textContent = d.title;
      b.addEventListener('click', () => loadDay(d));
      daysEl.append(b);
    }
    loadDay(m.days[0]);
    playBtn.textContent = playing ? 'Pause' : 'Play';
  }).catch(() => { noteEl.textContent = 'The radar data could not be loaded.'; });
})();
