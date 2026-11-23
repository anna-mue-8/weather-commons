// A · III: the radar map of 9 January 2015, 13:00-18:00 UTC, after Anna-Lena's QGIS project
// (assets/gis/Radar GIS file.qgz): the same view, Sentinel-2 underneath (true or false colour), the DWD
// radar every 5 minutes in her QGIS colours, and Schwarze Pumpe as a white cross (explained in the legend,
// which opens from the footer).
// Wind: measured every 10 minutes at four DWD stations, spread over the map by distance weighting and
// blended in time; drawn as streaks (after sketch 04's currents) and as a small indicator, bottom left.
// Black dots: particles from the cooling towers, carried by that wind. Synthetic.
// The view can be zoomed (wheel, pinch), moved (drag) and tilted (right-drag or Shift-drag; two fingers up
// or down on a touch screen); Reset view undoes both. The playback can be slowed down.
// Data: images/radar-map/ (scripts/make_radar_map.py).

(() => {
  const box = document.getElementById('rmap');
  if (!box) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = box.querySelector('.rmap-stage');
  const base = box.querySelector('.rmap-base');
  const buf = document.createElement('canvas');   // the image and radar, prepared off screen
  const page = box.closest('.page');          // the view buttons sit beside the legend, outside the map box
  const tl = box.querySelector('.rmap-tl');
  const playBtn = box.querySelector('.rmap-play');
  const timeEl = box.querySelector('.rmap-time');
  const phaseEl = box.querySelector('.rmap-phase');

  // Anna-Lena's reading of the radar against the particles (interpretive): minutes after 13:00 UTC.
  // To change a phase, edit its times or text here.
  const PHASES = [
    { from: 0, to: 35, text: 'Before the rain crosses the plant and meets the particles of its condensation clouds.' },
    { from: 40, to: 225, text: 'Downwind of the plant, the rain becomes stronger.' },
    { from: 230, to: 280, text: 'The wind turns, and the rain stays in line with the direction the condensation clouds are blowing.' },
    { from: 285, to: 300, text: 'The rain dies down, but stays a little longer in the streak of the plant\u2019s clouds.' },
  ];
  // Where to look: from chapter 2 (13:40 UTC) a white dashed box in every 5-minute frame, around the rain
  // that lies in the path of the particles from the cooling towers (derived: radar + interpolated wind +
  // the simulated plume). Worked out once the data has loaded (computeFocus, below).
  const FOCUS_FROM = 40;            // minutes after 13:00
  let FOCUS = [];                   // per frame: { x0, x1, y0, y1 } in map km, or null
  const hhmm = (m) => { const h = 13 + Math.floor(m / 60), mm = Math.round(m % 60); return `${h}:${String(mm).padStart(2, '0')}`; };
  const phaseAt = (m) => PHASES.reduce((k, p, i) => (m >= p.from - 2.5 ? i : k), 0);
  const DIR = 'images/radar-map/';
  const MIN_PER_S = 5 / 0.28;            // at full speed: 5 minutes of weather every 0.28 seconds
  const KM_PER_S = MIN_PER_S * 60 / 1000; // per m/s of wind: km moved per second of playback (full speed)
  const ZMAX = 12;
  // The first view (Anna-Lena's frame), in map km: the full width, from about 26 km below the top to
  // about 212 km. It is zoomed to fill the space; zooming out shows the whole map. Reset view returns here.
  const START = { x0: 0, x1: 242.5, y0: 26, y1: 212 };

  let M = null, frames = [], n = 0, imgs = {}, ground = 'false';   // false colour by default
  let t = 0;                              // minutes since 13:00 UTC
  let speed = 0.25;                       // 1, 1/2 or 1/4; a quarter by default
  let playing = !still, visible = false, raf = 0, last = 0, frameShown = -1, looping = false;
  let W = 0, H = 0, k = 1, dpr = 1;       // canvas size in device pixels; px per km at zoom 1
  let z = 1, cx = 0, cy = 0;              // zoom, and the map point (km) at the centre of the view
  let tilt = 0;                           // degrees, 0-60

  // radar colours from the QGIS style: linear between the stops, transparent below the first
  let STOPS = [];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function rainColour(mm) {
    if (mm < STOPS[0][0]) return null;
    for (let i = 1; i < STOPS.length; i++) {
      const [v1, c1] = STOPS[i], [v0, c0] = STOPS[i - 1];
      if (mm <= v1) { const f = (mm - v0) / (v1 - v0); return c0.map((c, j) => Math.round(c + (c1[j] - c) * f)); }
    }
    return STOPS[STOPS.length - 1][1];
  }

  // the view: map km <-> canvas pixels ----------------------------------------------------------------
  const sc = () => k * z;                                       // px per km now
  const px = (x) => (x - cx) * sc() + W / 2;
  const py = (y) => (y - cy) * sc() + H / 2;
  let viewTouched = false;
  function startView() {
    z = Math.max(W / (START.x1 - START.x0), H / (START.y1 - START.y0)) / k;
    cx = (START.x0 + START.x1) / 2; cy = (START.y0 + START.y1) / 2;
    clampView();
  }
  function clampView() {
    z = Math.max(1, Math.min(ZMAX, z));
    const hw = W / 2 / sc(), hh = H / 2 / sc();
    cx = hw * 2 >= M.width_km ? M.width_km / 2 : Math.max(hw, Math.min(M.width_km - hw, cx));
    cy = hh * 2 >= M.height_km ? M.height_km / 2 : Math.max(hh, Math.min(M.height_km - hh, cy));
  }
  const visibleBox = () => {
    const hw = W / 2 / sc(), hh = H / 2 / sc();
    return [Math.max(0, cx - hw), Math.max(0, cy - hh), Math.min(M.width_km, cx + hw), Math.min(M.height_km, cy + hh)];
  };

  // wind ------------------------------------------------------------------------------------------
  // each station: u (east) and v (north) in m/s for every 10 minutes; blended in time, then weighted by
  // 1 / distance² between stations
  let ST = [];
  function prepareWind() {
    ST = M.stations.map((s) => {
      const keys = Object.keys(s.wind).sort();
      const series = keys.map((key) => {
        const [dd, ff] = s.wind[key];
        const a = dd * Math.PI / 180;       // dd = direction the wind comes FROM
        return { m: (+key.slice(0, 2) - 13) * 60 + +key.slice(3, 5), u: -ff * Math.sin(a), v: -ff * Math.cos(a) };
      });
      return { x: s.x, y: s.y, series };
    });
  }
  function stationAt(s, minute) {
    const q = s.series;
    if (minute <= q[0].m) return [q[0].u, q[0].v];
    for (let i = 1; i < q.length; i++) if (minute <= q[i].m) {
      const f = (minute - q[i - 1].m) / (q[i].m - q[i - 1].m);
      return [q[i - 1].u + (q[i].u - q[i - 1].u) * f, q[i - 1].v + (q[i].v - q[i - 1].v) * f];
    }
    const e = q[q.length - 1];
    return [e.u, e.v];
  }
  let nowW = [];                            // the stations' wind at the current time
  function windAt(x, y) {                   // m/s, east and north
    let su = 0, sv = 0, sw = 0;
    for (let i = 0; i < ST.length; i++) {
      const w = 1 / ((x - ST[i].x) ** 2 + (y - ST[i].y) ** 2 + 4);
      su += nowW[i][0] * w; sv += nowW[i][1] * w; sw += w;
    }
    return [su / sw, sv / sw];
  }

  // streaks, after sketch 04: specks carried by the wind, each with a short fading tail ---------------
  // (dropped within the part of the map in view, so they stay as dense when zoomed in)
  const NT = 1200, TK = 17;                 // 16 tail pieces: longer, fainter trails to follow the wind's path
  const trX = new Float32Array(NT * TK), trY = new Float32Array(NT * TK);
  const trAge = new Float32Array(NT), trLife = new Float32Array(NT), trSp = new Float32Array(NT);
  let tailClock = 0;
  function seed(i) {
    const [x0, y0, x1, y1] = visibleBox();
    const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
    for (let j = 0; j < TK; j++) { trX[i * TK + j] = x; trY[i * TK + j] = y; }
    trAge[i] = 0; trLife[i] = 3.5 + Math.random() * 4;
  }
  function stepStreaks(dt) {                // dt in weather-scaled seconds
    const [x0, y0, x1, y1] = visibleBox();
    tailClock += dt;
    const shift = tailClock >= 0.06;        // the tail keeps a point every 0.06 s
    if (shift) tailClock = 0;
    for (let i = 0; i < NT; i++) {
      const o = i * TK;
      trAge[i] += dt;
      const x = trX[o], y = trY[o];
      if (trAge[i] > trLife[i] || x < x0 || y < y0 || x > x1 || y > y1) { seed(i); trSp[i] = 0; continue; }
      const [u, v] = windAt(x, y);
      trSp[i] = Math.hypot(u, v);
      if (shift) for (let j = TK - 1; j > 0; j--) { trX[o + j] = trX[o + j - 1]; trY[o + j] = trY[o + j - 1]; }
      trX[o] = x + u * KM_PER_S * dt;
      trY[o] = y - v * KM_PER_S * dt;       // map y runs south
    }
  }

  // particles from the cooling towers (synthetic): many small black dots on the same wind ----------
  let parts = [], owed = 0;
  function stepParticles(dt) {
    owed += dt * 520;          // many: the particles stand for ultrafine particles (UFP)
    while (owed >= 1) { parts.push({ x: M.plant.x, y: M.plant.y, s: 0, side: (Math.random() - 0.5) }); owed -= 1; }
    for (const p of parts) {
      const [u, v] = windAt(p.x, p.y);
      const sp = Math.hypot(u, v) || 1;
      const d = sp * KM_PER_S * dt;
      p.s += d;
      // along the wind, and slowly sideways so the cloud widens downwind
      p.x += (u / sp) * d + (v / sp) * p.side * 0.3 * d;
      p.y += -(v / sp) * d + (u / sp) * p.side * 0.3 * d;
    }
    parts = parts.filter((p) => p.s < 120 && p.x > 0 && p.y > 0 && p.x < M.width_km && p.y < M.height_km);
  }

  // drawing --------------------------------------------------------------------------------------
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    // the canvas fills the whole space (on phones: the full width, at the map's proportions)
    const ratio = M.width_km / M.height_km;
    const narrow = matchMedia('(max-width: 860px)').matches;
    const cw = stage.clientWidth;
    if (!cw) return false;
    const ch = narrow || stage.clientHeight < 100 ? cw / ratio : stage.clientHeight;
    base.style.width = cw + 'px'; base.style.height = ch + 'px';
    const W2 = Math.round(cw * dpr), H2 = Math.round(ch * dpr);
    if (W2 === W && H2 === H) return false;
    W = W2; H = H2;
    for (const c of [base, buf]) { c.width = W; c.height = H; }
    k = Math.min(W / M.width_km, H / M.height_km);   // zoom 1: the whole map fits
    if (!viewTouched) startView(); else clampView();
    frameShown = -1;
    return true;
  }
  const tmp = document.createElement('canvas');
  function drawBase(fi) {
    const g = buf.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const s = sc();
    g.setTransform(s, 0, 0, s, W / 2 - cx * s, H / 2 - cy * s);   // from here on, drawing in map km
    // barely visible 10 km grid
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1 / s;
    g.beginPath();
    for (let x = 0; x <= M.width_km; x += M.grid_km) { g.moveTo(x, 0); g.lineTo(x, M.height_km); }
    for (let y = 0; y <= M.height_km; y += M.grid_km) { g.moveTo(0, y); g.lineTo(M.width_km, y); }
    g.stroke();
    // Sentinel-2, true or false colour
    const sn = M.sentinel[ground], im = imgs[ground];
    g.imageSmoothingEnabled = true;
    if (im) g.drawImage(im, sn.x, sn.y, sn.w, sn.h);
    // radar, 1 km cells, as in QGIS
    const R = M.radar, a = frames[fi];
    tmp.width = R.w; tmp.height = R.h;
    const tg = tmp.getContext('2d');
    const id = tg.createImageData(R.w, R.h);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === 255) continue;
      const c = rainColour(a[i] / 100);
      if (!c) continue;
      id.data[i * 4] = c[0]; id.data[i * 4 + 1] = c[1]; id.data[i * 4 + 2] = c[2]; id.data[i * 4 + 3] = 255;
    }
    tg.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(tmp, 0, 0, R.w, R.h);
    g.setTransform(1, 0, 0, 1, 0, 0);
    frameShown = fi;
  }

  function drawFx() {   // everything on the one visible canvas: the prepared image and radar, then what moves
    const g = base.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.drawImage(buf, 0, 0);
    // wind streaks (pale, brighter where the wind is stronger)
    g.lineWidth = 1 * dpr; g.lineCap = 'round';
    const LV = 8, paths = Array.from({ length: LV }, () => new Path2D());   // tail pieces grouped by brightness
    for (let i = 0; i < NT; i++) {
      if (!trSp[i]) continue;
      const o = i * TK;
      const fade = Math.min(1, trAge[i] * 2, (trLife[i] - trAge[i]) * 2) * Math.min(1, Math.max(0.15, trSp[i] / 14)) * 0.45;
      for (let j = 0; j < TK - 1; j++) {
        const a = fade * (1 - j / (TK - 1));
        if (a <= 0.02) continue;
        const p = paths[Math.min(LV - 1, Math.floor(a * LV))];
        p.moveTo(px(trX[o + j]), py(trY[o + j])); p.lineTo(px(trX[o + j + 1]), py(trY[o + j + 1]));
      }
    }
    paths.forEach((p, l) => { g.strokeStyle = `rgba(207,230,255,${((l + 0.5) / LV).toFixed(3)})`; g.stroke(p); });
    // particles from the cooling towers: small black dots, fading with distance (grouped by fade)
    const r = Math.max(0.25, 0.2 * dpr * Math.sqrt(z));
    const PL = 5, dots = Array.from({ length: PL }, () => new Path2D());
    for (const p of parts) {
      const X = px(p.x), Y = py(p.y);
      if (X < -2 || Y < -2 || X > W + 2 || Y > H + 2) continue;
      dots[Math.min(PL - 1, Math.floor((p.s / 120) * PL))].rect(X - r, Y - r, 2 * r, 2 * r);
    }
    dots.forEach((d, l) => { g.fillStyle = `rgba(0,0,0,${(0.9 * (1 - l / PL)).toFixed(3)})`; g.fill(d); });
    drawFocus(g);
    drawMarker(g);
    drawWindIndicator(g);
  }

  function focusAt(m) {     // each 5-minute frame has its own box; it jumps with the radar, no blending
    return FOCUS[Math.min(n - 1, Math.floor(m / 5 + 1e-6))] || null;
  }
  // For each frame: trace the plume (particles let out every 2.5 minutes over the past two hours, carried
  // minute by minute by the interpolated wind, spreading sideways as they go), find the radar rain within
  // its corridor (up to 60 km downwind), and frame it. With no rain in the corridor, frame the plume's
  // first 25 km. Each frame keeps its own box, which changes with the radar picture.
  function computeFocus() {
    const R = M.radar, keep = nowW;
    const wind = (m, x, y) => { nowW = ST.map((s) => stationAt(s, m)); return windAt(x, y); };
    const raw = [];
    for (let fi = 0; fi < n; fi++) {
      const T = fi * 5;
      if (T < FOCUS_FROM) { raw.push(null); continue; }
      const pts = [];                                  // [x, y, km travelled]
      for (let e = Math.max(0, T - 120); e <= T; e += 2.5) {
        let x = M.plant.x, y = M.plant.y, sKm = 0;
        for (let m = e; m < T; m += 1) {
          const [u, v] = wind(m, x, y);
          x += u * 0.06; y -= v * 0.06; sKm += Math.hypot(u, v) * 0.06;   // m/s for one minute = 0.06 km per m/s
          if (sKm > 60) break;
        }
        if (sKm <= 60) pts.push([x, y, sKm]);
      }
      const a = frames[fi], hit = [];
      const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - 12)), maxX = Math.min(R.w - 1, Math.ceil(Math.max(...pts.map((p) => p[0])) + 12));
      const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - 12)), maxY = Math.min(R.h - 1, Math.ceil(Math.max(...pts.map((p) => p[1])) + 12));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const v = a[y * R.w + x];
        if (v === 255 || v < 2) continue;              // dry, or no radar data
        const cx = x + 0.5, cy = y + 0.5;
        if (pts.some((p) => Math.hypot(cx - p[0], cy - p[1]) <= 2 + 0.15 * p[2])) hit.push([cx, cy]);
      }
      const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * (arr.length - 1)))];
      if (hit.length >= 6) {
        const xs = hit.map((h) => h[0]).sort((p, q) => p - q), ys = hit.map((h) => h[1]).sort((p, q) => p - q);
        raw.push({ x0: pct(xs, 0.05) - 2, x1: pct(xs, 0.95) + 2, y0: pct(ys, 0.05) - 2, y1: pct(ys, 0.95) + 2 });
      } else {
        const near = pts.filter((p) => p[2] <= 25);
        const xs = near.map((p) => p[0]), ys = near.map((p) => p[1]);
        raw.push({ x0: Math.min(...xs) - 3, x1: Math.max(...xs) + 3, y0: Math.min(...ys) - 3, y1: Math.max(...ys) + 3 });
      }
    }
    FOCUS = raw;                                      // each frame its own box, not smoothed
    nowW = keep;
  }

  function drawFocus(g) {   // the dashed box for this moment, if there is one
    const f = focusAt(t);
    if (!f) return;
    const X0 = px(f.x0), Y0 = py(f.y0), X1 = px(f.x1), Y1 = py(f.y1);
    g.save();
    g.setLineDash([6 * dpr, 4 * dpr]);
    g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(0,0,0,.45)';   // a soft dark edge, so the white reads on rain
    g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    g.lineWidth = 1.5 * dpr; g.strokeStyle = '#fff';
    g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    g.restore();
  }

  function drawMarker(g) {   // as in QGIS: white cross (cross_fill, 5 mm) with a thin black outline
    const X = px(M.plant.x), Y = py(M.plant.y), r = 9 * dpr, a = r / 3;
    g.beginPath();
    g.moveTo(X - a, Y - r); g.lineTo(X + a, Y - r); g.lineTo(X + a, Y - a); g.lineTo(X + r, Y - a);
    g.lineTo(X + r, Y + a); g.lineTo(X + a, Y + a); g.lineTo(X + a, Y + r); g.lineTo(X - a, Y + r);
    g.lineTo(X - a, Y + a); g.lineTo(X - r, Y + a); g.lineTo(X - r, Y - a); g.lineTo(X - a, Y - a); g.closePath();
    g.fillStyle = '#fff'; g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 0.75 * dpr; g.stroke();
  }

  function drawWindIndicator(g) {   // bottom left, white: the wind at Schwarze Pumpe
    const [u, v] = windAt(M.plant.x, M.plant.y);
    const sp = Math.hypot(u, v);
    const from = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    const R = 20 * dpr, x0 = 16 * dpr + R, y0 = H - 30 * dpr - R;
    // a thin dark edge under the white, so it reads over rain and image
    g.save(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(x0, y0, R, 0, Math.PI * 2); g.stroke(); g.restore();
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 1 * dpr;
    g.beginPath(); g.arc(x0, y0, R, 0, Math.PI * 2); g.stroke();
    g.font = `${9 * dpr}px "Open Sans", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText('N', x0, y0 - R - 2 * dpr);
    const ux = u / (sp || 1), uy = -v / (sp || 1), L = R * 0.8;   // arrow toward where the wind blows
    g.lineWidth = 1.6 * dpr;
    g.beginPath(); g.moveTo(x0 - ux * L, y0 - uy * L); g.lineTo(x0 + ux * L, y0 + uy * L); g.stroke();
    const ang = Math.atan2(uy, ux), hx = x0 + ux * L, hy = y0 + uy * L;
    g.beginPath(); g.moveTo(hx, hy);
    g.lineTo(hx - 7 * dpr * Math.cos(ang - 0.45), hy - 7 * dpr * Math.sin(ang - 0.45));
    g.lineTo(hx - 7 * dpr * Math.cos(ang + 0.45), hy - 7 * dpr * Math.sin(ang + 0.45));
    g.fill();
    g.font = `${11 * dpr}px "Open Sans", system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
    const txt = `Wind ${sp.toFixed(1)} m/s from ${Math.round(from)}°`;
    g.save(); g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3 * dpr; g.lineJoin = 'round'; g.strokeText(txt, 16 * dpr, y0 + R + 8 * dpr); g.restore();
    g.fillText(txt, 16 * dpr, y0 + R + 8 * dpr);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  // time ------------------------------------------------------------------------------------------
  const total = () => (n - 1) * 5;
  function setTime(m) {
    t = Math.max(0, Math.min(total(), m));
    nowW = ST.map((s) => stationAt(s, t));
    const fi = Math.min(n - 1, Math.floor(t / 5 + 1e-6));
    if (fi !== frameShown) drawBase(fi);
    timeEl.textContent = `${M.radar.times_utc[fi]} UTC`;
    tl.setAttribute('aria-valuenow', String(Math.round(t)));
    tl.setAttribute('aria-valuetext', `${M.radar.times_utc[fi]} UTC`);
    const ph = phaseAt(t), P = PHASES[ph];
    phaseEl.innerHTML = `<b>${ph + 1}</b> · ${hhmm(P.from)}–${hhmm(P.to)} UTC · ${P.text}`;
    drawTimeline();
    if (!looping) drawFx();
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0) * speed;   // slower playback slows everything
    last = now;
    if (playing) {
      let m = t + dt * MIN_PER_S;
      if (m > total()) { m = 0; parts = []; }
      setTime(m);
    }
    stepStreaks(dt);
    stepParticles(dt);
    drawFx();
    raf = requestAnimationFrame(loop);
  }
  function run() {
    cancelAnimationFrame(raf);
    looping = visible && n && !still;
    if (looping) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }
  function stillPicture() {   // less motion: one still picture with streaks and the particle trail
    for (let i = 0; i < 90; i++) { stepStreaks(1 / 30); stepParticles(1 / 30); }
    drawFx();
  }
  function redraw() { frameShown = -1; setTime(t); drawFx(); }
  function setPlaying(p) { playing = p; playBtn.textContent = p ? '\u275A\u275A Pause' : '\u25B6 Run'; }

  playBtn.addEventListener('click', () => {
    if (still) { setTime(t + 5); stillPicture(); return; }   // with less motion: step forward
    setPlaying(!playing);
  });

  // timeline, after sketch 04's (colours inverted): 15-minute ticks, hour labels, the four phases ---------
  function drawTimeline() {
    const d = Math.min(2, devicePixelRatio || 1), cw = tl.clientWidth, chh = tl.clientHeight;
    if (!cw) return;
    if (tl.width !== Math.round(cw * d) || tl.height !== Math.round(chh * d)) { tl.width = Math.round(cw * d); tl.height = Math.round(chh * d); }
    const g = tl.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, cw, chh);
    const x0 = 18, x1 = cw - 18, y = 30, X = (m) => x0 + (m / total()) * (x1 - x0);
    g.textAlign = 'center';
    // the line
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y + 0.5); g.lineTo(x1, y + 0.5); g.stroke();
    // 15-minute ticks; hours a little longer, with a small label below
    g.font = '10px system-ui, sans-serif';
    for (let m = 0; m <= total(); m += 15) {
      const hour = m % 60 === 0, x = Math.round(X(m)) + 0.5;
      g.strokeStyle = hour ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.4)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + (hour ? 7 : 4)); g.stroke();
      if (hour) { g.fillStyle = '#9a9a9a'; g.fillText(hhmm(m), x, y + 19); }
    }
    // the phases: a thick mark where each begins, its number above; the current one's span drawn thick
    const cur = phaseAt(t);
    PHASES.forEach((p, i) => {
      const xa = X(p.from), xb = X(p.to);
      g.strokeStyle = i === cur ? '#fff' : 'rgba(255,255,255,.55)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(xa, y - 9); g.lineTo(xa, y + 1); g.stroke();
      if (i === cur) { g.beginPath(); g.moveTo(xa, y + 0.5); g.lineTo(Math.max(xb, xa + 2), y + 0.5); g.stroke(); }
      g.fillStyle = i === cur ? '#fff' : '#9a9a9a';
      g.font = (i === cur ? '600 ' : '') + '11px system-ui, sans-serif';
      g.fillText(String(i + 1), xa, y - 13);
    });
    // where we are
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(X(t), y + 0.5, 5, 0, Math.PI * 2); g.fill();
  }
  const tlTime = (e) => { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left - 18) / (r.width - 36))) * total(); };
  let scrubbing = false;
  tl.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    try { tl.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ }
    setPlaying(false); setTime(tlTime(e)); if (still) stillPicture();
  });
  tl.addEventListener('pointermove', (e) => { if (scrubbing) { setTime(tlTime(e)); if (still) stillPicture(); } });
  tl.addEventListener('pointerup', () => { scrubbing = false; });
  tl.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -5, ArrowRight: 5 }[e.key];
    if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault(); e.stopPropagation();   // here the arrow keys move the time, not the page
    setPlaying(false);
    setTime(e.key === 'Home' ? 0 : e.key === 'End' ? total() : t + step);
    if (still) stillPicture();
  });
  // the arrows under Run: straight to the previous or next change in the rain
  function jump(dir) {
    const cur = phaseAt(t);
    let i = dir > 0 ? cur + 1 : (t > PHASES[cur].from + 2.5 ? cur : cur - 1);
    i = Math.max(0, Math.min(PHASES.length - 1, i));
    setPlaying(false);
    setTime(PHASES[i].from);
    if (still) stillPicture();
  }
  box.querySelector('.rmap-prev').addEventListener('click', () => jump(-1));
  box.querySelector('.rmap-next').addEventListener('click', () => jump(1));
  page.querySelectorAll('.rmap-ground button').forEach((b) => b.addEventListener('click', () => {
    ground = b.dataset.ground;
    page.querySelectorAll('.rmap-ground button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    redraw();
  }));
  page.querySelectorAll('.rmap-speed button').forEach((b) => b.addEventListener('click', () => {
    speed = +b.dataset.speed;
    page.querySelectorAll('.rmap-speed button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  // zoom, move and tilt ---------------------------------------------------------------------------
  function zoomAt(f, X, Y) {               // X, Y: canvas pixels that should stay in place
    viewTouched = true;
    const s0 = sc(), mx = cx + (X - W / 2) / s0, my = cy + (Y - H / 2) / s0;
    z *= f;
    clampView();
    const s1 = sc();
    cx = mx - (X - W / 2) / s1; cy = my - (Y - H / 2) / s1;
    clampView();
    for (let i = 0; i < NT; i++) trSp[i] = 0, trAge[i] = trLife[i] + 1;   // drop the streaks anew in the new view
    base.style.touchAction = 'none';
    base.style.cursor = 'grab';
    redraw();
  }
  const toCanvas = (e) => { const r = base.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  base.addEventListener('wheel', (e) => { e.preventDefault(); const [X, Y] = toCanvas(e); zoomAt(Math.exp(-e.deltaY * 0.0015), X, Y); }, { passive: false });
  base.addEventListener('dblclick', (e) => { const [X, Y] = toCanvas(e); zoomAt(2, X, Y); });
  const setTilt = (deg) => {
    tilt = Math.max(0, Math.min(60, deg));
    stage.style.setProperty('--tilt', tilt + 'deg');
    stage.classList.toggle('tilted', tilt > 0);
  };
  page.querySelector('.rmap-reset').addEventListener('click', () => { viewTouched = false; startView(); setTilt(0); zoomAt(1, W / 2, H / 2); viewTouched = false; });
  base.addEventListener('contextmenu', (e) => e.preventDefault());   // right-drag tilts
  // drag to move; right-drag or Shift-drag to tilt; two fingers: pinch to zoom, move up or down to tilt
  const pointers = new Map();
  let pinch0 = 0, tilting = false;
  base.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, toCanvas(e));
    tilting = e.button === 2 || e.shiftKey;
    try { base.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  base.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId), cur = toCanvas(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch0) zoomAt(d / pinch0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinch0 = d;
      setTilt(tilt - (cur[1] - prev[1]) / dpr * 0.25);    // both fingers up: tilt back
    } else if (tilting) {
      setTilt(tilt - (cur[1] - prev[1]) / dpr * 0.35);    // drag up: tilt back
    } else {
      viewTouched = true;
      cx -= (cur[0] - prev[0]) / sc(); cy -= (cur[1] - prev[1]) / sc();
      clampView(); redraw();
      base.style.cursor = 'grabbing';
    }
  });
  const up = (e) => { pointers.delete(e.pointerId); pinch0 = 0; tilting = false; base.style.cursor = 'grab'; };
  base.addEventListener('pointerup', up);
  base.addEventListener('pointercancel', up);

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }).observe(box);
  new ResizeObserver(() => { if (M && n) { size(); redraw(); } }).observe(stage);
  new ResizeObserver(() => { if (M && n) drawTimeline(); }).observe(tl);

  // load ------------------------------------------------------------------------------------------
  const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  (async () => {
    M = await (await fetch(DIR + 'map.json')).json();
    STOPS = M.radar_colours.map(([v, c]) => [v, hex(c)]);
    prepareWind();
    cx = M.width_km / 2; cy = M.height_km / 2;
    const [rad, it, ifl] = await Promise.all([
      fetch(DIR + M.radar.file).then((r) => r.blob()).then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })),
      loadImg(DIR + M.sentinel.true.file), loadImg(DIR + M.sentinel.false.file),
    ]);
    imgs = { true: it, false: ifl };
    const c = document.createElement('canvas');
    c.width = rad.width; c.height = rad.height;
    const cg = c.getContext('2d', { willReadFrequently: true });
    cg.drawImage(rad, 0, 0);
    const pxl = cg.getImageData(0, 0, rad.width, rad.height).data;
    const fw = M.radar.w, fh = M.radar.h;
    n = rad.height / fh;
    for (let f = 0; f < n; f++) {
      const a = new Uint8Array(fw * fh);
      for (let i = 0; i < fw * fh; i++) a[i] = pxl[(f * fw * fh + i) * 4];
      frames.push(a);
    }
    try { await document.fonts.load('13px "Open Sans"'); } catch (e) { /* the fallback font is fine */ }
    computeFocus();
    size();
    for (let i = 0; i < NT; i++) { seed(i); trAge[i] = Math.random() * trLife[i]; }
    base.style.cursor = 'grab';
    base.style.touchAction = 'none';
    setTime(0);
    setPlaying(playing);
    if (still) stillPicture(); else drawFx();
    run();
  })().catch(() => { timeEl.textContent = 'The map could not be loaded.'; });
})();
