// Side view of the air above a 20 km line across Partwitzer See, Lusatia, in two panels side by side:
// 1991, when it was an open pit, and 2025, when it is a lake. Both run at the same time.
// A simplified 2D model: warm air rises, cool air flows in to replace it (lake breeze),
// rising air cools until its water vapour condenses into cloud or mist, cloud water turns into rain.
//
// What is observed and what is modelled:
// - the ground along the line (water, bare, vegetation; surface temperature): observed, Landsat
// - air temperature, dew point, pressure, wind through the day: observed at DWD Hoyerswerda (2025) and Cottbus,
//   or estimated for the area near the lake from Cottbus (1991; modelled, see scripts/estimate_weather.py)
// - how rough each surface is (roughness length): typical values from the literature, approximate
// - the starting profile of the air above the ground: synthetic, typical of the season and time of day
// - everything the model calculates (air movement, cloud, mist, rain): modelled, approximate
//
// No libraries. Data comes from data/ (relative paths).

(async function () {
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--fg').trim() || '#000';
  const paper = css.getPropertyValue('--bg').trim() || '#fff';
  const soft = css.getPropertyValue('--soft').trim() || '#f2f2f2';
  const muted = css.getPropertyValue('--muted').trim() || '#555';
  const el = id => document.getElementById(id);

  // the two seasons. Each pairs a 1991 day with a 2025 day. utcOffset: local time minus UTC (summer time in
  // August, winter time in late October and November, in both years). start and end: hours UTC.
  // profile: which synthetic starting air profile to use (see buildEnv). tsRange: °C range of the surface-temperature curve.
  const SEASONS = {
    summer: { file: 'data/slice-partwitz-summer.json', utcOffset: 2, start: 4, end: 18.5, profile: 'summer', tsRange: [5, 50] },
    autumn: { file: 'data/slice-partwitz-autumn.json', utcOffset: 1, start: 0, end: 14, profile: 'autumn', tsRange: [-10, 25] },
  };
  // which weather each panel uses.
  // own: each year's own day near the lake. 2025 as measured at Hoyerswerda (8 km); 1991 estimated from Cottbus
  //   (31 km), in a typical, cold or mild version (the night control).
  // same: both panels on the 2025 day at Hoyerswerda, so only the ground differs.
  // cottbus: each year's own day as measured at Cottbus, the same station in both years.
  const WEATHER = {
    own: { pit: 'estimated-1991', lake: 'hoyerswerda-2025' },
    same: { pit: 'hoyerswerda-2025', lake: 'hoyerswerda-2025' },
    cottbus: { pit: 'cottbus-1991', lake: 'cottbus-2025' },
  };
  const allData = {};
  try {
    for (const [s, c] of Object.entries(SEASONS)) allData[s] = await (await fetch(c.file)).json();
  } catch (err) {
    el('readout-pit').textContent = 'Could not load the files in data/. Open the page through a local server (see README).';
    return;
  }

  // ---------- controls, shared by both panels ----------
  const radio = (name, fallback) => (document.querySelector(`input[name=${name}]:checked`) || {}).value || fallback;
  const controls = {
    season: () => radio('season', 'autumn'),
    weather: () => radio('weather', 'own'),
    night: () => radio('night', 'typical'),
    moist: () => +el('moist').value,
    dust: () => +el('dust').value,
    windObs: () => el('windobs').checked,
    wind: () => +el('wind').value,
    speed: () => +el('speed').value,
  };
  const showValue = () => {
    el('moist-v').textContent = '×' + controls.moist().toFixed(2);
    el('dust-v').textContent = ['', 'clean', 'some', 'dusty', 'very dusty'][Math.round(controls.dust())] || controls.dust().toFixed(1);
    el('wind-v').textContent = controls.windObs() ? 'observed' : controls.wind().toFixed(1) + ' m/s';
    el('wind').disabled = controls.windObs();
  };

  // ---------- physical constants and model grid, the same for both panels ----------
  const G = 9.81, CP = 1004, RD = 287, RV = 461.5, LV = 2.5e6;
  const L = allData.summer.line.length_m;  // about 20 km along the line
  const H = 4000;                          // 4 km of air
  const NX = 160, NZ = 64;
  const DX = L / NX, DZ = H / NZ;
  const N = NX * NZ;
  const DT = 4;                            // seconds per model step
  const K = 25;                            // horizontal mixing by small eddies, m²/s (approximate)
  const at = (i, j) => i + j * NX;         // j = 0 is the lowest layer
  const EVAP = { water: 1.0, vegetation: 0.35, bare: 0.05 };  // how easily each surface gives off water (approximate)
  // how rough each surface is: roughness length in metres, typical values (for example Stull 1988, Wieringa 1993).
  // Water is very smooth; the bare floor of a pit is sand and spoil; vegetation here is mostly pine forest and fields.
  const Z0 = { water: 0.0002, bare: 0.03, vegetation: 0.5 };
  const KAPPA = 0.4, ZR = DZ / 2;                               // von Kármán constant; height of the lowest layer's middle
  // heat exchange coefficient for wind at ZR, in neutral air (heat roughness taken as a tenth of Z0)
  const CH = {};
  for (const [kind, z0] of Object.entries(Z0)) CH[kind] = KAPPA ** 2 / (Math.log(ZR / z0) * Math.log(ZR / (z0 / 10)));
  const EAST = [...Array(NX).keys()], WEST = [...EAST].reverse();   // column order following the wind
  const satP = Tc => 610.94 * Math.exp(17.625 * Tc / (Tc + 243.04));      // saturation vapour pressure, Pa
  const qsat = (Tk, p) => { const e = satP(Tk - 273.15); return 0.622 * e / (p - e); };
  // starting profile of the air above the ground: synthetic.
  // summer, 06:00: a cool layer near the ground after the night (up to 200 m), yesterday's well-mixed air above it
  //   (2 °C below the day's highest temperature) up to 1.8 km, stable air above.
  // autumn, 01:00: a strong cold layer near the ground after a clear, calm evening (up to 300 m), mixed air above it
  //   (4 °C below the day's highest temperature) up to 800 m, stable air above.
  const PROFILES = {
    summer: { inversionTop: 200, belowMax: 2, mixedTop: 1800 },
    autumn: { inversionTop: 300, belowMax: 4, mixedTop: 800 },
  };
  // the same small random nudges in both panels, so differences come from the ground and the weather
  function seeded(seed) {
    return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- one panel: one model run ----------
  function makeModel(role, canvas, readout) {
    const ctx = canvas.getContext('2d');
    let season, data, wx, hours;
    let START_UTC = 0, END_UTC = 1, tUtc = 0;

    // the day's weather (observed, hourly, UTC)
    function obs(key, t) {              // straight-line interpolation between hours
      const h0 = Math.max(0, Math.min(22, Math.floor(t)));
      const a = hours[h0][key], b = hours[h0 + 1][key];
      if (a == null) return b; if (b == null) return a;
      return a + (b - a) * (t - h0);
    }
    function obsWindEast(t) {           // wind component along the line (towards east = positive)
      const h = Math.max(0, Math.min(23, Math.round(t)));
      const f = hours[h].wind_ms, d = hours[h].wind_from_deg;
      if (f == null || d == null) return 0;
      return -f * Math.sin(d * Math.PI / 180);
    }
    const windEast = () => controls.windObs() ? obsWindEast(tUtc) : controls.wind();

    // ---------- ground along the line (observed, Landsat) ----------
    let groundKind, groundSt, landAnomaly, frameUtc;
    function buildGround() {
      const date = data[role];                      // the Landsat date of this panel's ground
      const g = data.ground[date];
      const n = g.kind.length;
      const own = wx.date === date;                 // ground and weather from the same day
      groundKind = new Array(NX); groundSt = new Float32Array(NX);
      // when the 1991 ground is put on the 2025 day, line its land up by the median vegetation temperature
      const veg = d => { const v = data.ground[d].st_c.filter((t, k) => t != null && data.ground[d].kind[k] === 'vegetation').sort((a, b) => a - b); return v[v.length >> 1]; };
      const shift = own ? 0 : veg(wx.date) - veg(date);
      frameUtc = data.ground[own ? date : wx.date].overpass_utc;
      for (let i = 0; i < NX; i++) {
        const k0 = Math.floor(i * n / NX), k1 = Math.max(k0 + 1, Math.floor((i + 1) * n / NX));
        const count = { water: 0, vegetation: 0, bare: 0 }; let s = 0, c = 0;
        for (let k = k0; k < k1; k++) { count[g.kind[k]]++; if (g.st_c[k] != null) { s += g.st_c[k]; c++; } }
        groundKind[i] = Object.keys(count).reduce((a, b) => count[a] >= count[b] ? a : b);
        groundSt[i] = (c ? s / c : 25) + (groundKind[i] === 'water' ? 0 : shift);
      }
      // land: how much warmer than the air it was at the satellite's time
      const airAtFrame = obs('temp_c', frameUtc);
      landAnomaly = Array.from(groundSt, t => t - airAtFrame);
    }
    // height of the sun (sine of its angle above the horizon) at 51.52° N, 14.14° E
    function sunHeight(t) {
      const d = new Date(wx.date + 'T00:00:00Z');
      const doy = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
      const decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
      const lat = 51.52 * Math.PI / 180, hourAngle = (t + 14.14 / 15 - 12) * Math.PI / 12;
      return Math.max(0, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle));
    }
    // surface temperature through the day: land follows the air, warmer in sunshine (as much as the
    // satellite saw, scaled by the height of the sun), about 1 °C colder than the air at night
    function surfaceTemp(i, t) {
      if (groundKind[i] === 'water') return groundSt[i];            // water barely changes in a day
      const air = obs('temp_c', t);
      return air - 1 + (landAnomaly[i] + 1) * sunHeight(t) / sunHeight(frameUtc);
    }

    // ---------- model state ----------
    const th = new Float32Array(N), qv = new Float32Array(N), qc = new Float32Array(N), qr = new Float32Array(N);
    const zeta = new Float32Array(N), psi = new Float32Array(N), u = new Float32Array(N), w = new Float32Array(N);
    const tmp = new Float32Array(N), buoy = new Float32Array(N), kz = new Float32Array(N);
    const thEnv = new Float32Array(NZ), qvEnv = new Float32Array(NZ), pEnv = new Float32Array(NZ), exner = new Float32Array(NZ), rho = new Float32Array(NZ);
    const thMean = new Float32Array(NZ), qvMean = new Float32Array(NZ);
    const rainSum = new Float32Array(NX);   // rain reaching the ground, mm
    const ustar = new Float32Array(NX);     // friction velocity: how strongly the surface brakes the wind, m/s

    function buildEnv() {
      const P = PROFILES[season.profile];
      const p0 = (obs('pressure_hpa', START_UTC) || 1008) * 100;
      const T0 = obs('temp_c', START_UTC) + 273.15;
      const Td0 = obs('dew_point_c', START_UTC);
      const tMax = Math.max(...hours.map(h => h.temp_c ?? -99));
      const thGround = T0 * Math.pow(1e5 / p0, RD / CP);
      const thResidual = (tMax - P.belowMax + 273.15) * Math.pow(1e5 / p0, RD / CP);
      const q0 = 0.622 * satP(Td0) / (p0 - satP(Td0)) * controls.moist();
      const zi = P.inversionTop, zm = P.mixedTop;
      for (let j = 0; j < NZ; j++) {
        const z = (j + 0.5) * DZ;
        pEnv[j] = p0 * Math.exp(-z / 8400);
        exner[j] = Math.pow(pEnv[j] / 1e5, RD / CP);
        let t;
        if (z < zi) t = thGround + (thResidual - thGround) * (z / zi);
        else if (z < zm) t = thResidual + 0.8e-3 * (z - zi);
        else t = thResidual + 0.8e-3 * (zm - zi) + 5e-3 * (z - zm);
        thEnv[j] = t;
        let q = z < zm ? q0 : q0 * Math.exp(-(z - zm) / 1200);
        q = Math.min(q, 0.9 * qsat(t * exner[j], pEnv[j]));          // start below saturation
        qvEnv[j] = q;
        rho[j] = pEnv[j] / (RD * t * exner[j]);
      }
    }

    function reset(seasonKey, weatherKey, nightKey, seed) {
      season = SEASONS[seasonKey]; data = allData[seasonKey];
      let key = WEATHER[weatherKey][role];
      if (key.startsWith('estimated') && nightKey !== 'typical') key += '-' + nightKey;
      wx = data.weather[key]; hours = wx.hours_utc;
      START_UTC = season.start; END_UTC = season.end; tUtc = START_UTC;
      buildGround();
      buildEnv();
      const rnd = seeded(seed);
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const k = at(i, j);
        th[k] = thEnv[j] + (j < 5 ? (rnd() - 0.5) * 0.1 : 0);       // tiny random nudges start the motion
        qv[k] = qvEnv[j]; qc[k] = 0; qr[k] = 0; zeta[k] = 0; psi[k] = 0; u[k] = 0; w[k] = 0;
      }
      rainSum.fill(0);
      resetDots();
    }

    // ---------- one model step ----------
    function solvePsi() {               // ∇²ψ = ζ, ψ = 0 on the edges; a few rounds of SOR each step
      const ax = 1 / (DX * DX), az = 1 / (DZ * DZ), d = 2 * (ax + az), om = 1.85;
      for (let it = 0; it < 20; it++) {
        for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
          const k = at(i, j);
          const r = (ax * (psi[k - 1] + psi[k + 1]) + az * (psi[k - NX] + psi[k + NX]) - zeta[k]) / d;
          psi[k] += om * (r - psi[k]);
        }
      }
    }
    const uRough = new Float32Array(N), wRough = new Float32Array(N), gEff = new Float32Array(NX), flux = new Float32Array(NX + 1);
    const BLEND = 200, Z0_REF = 0.1, ADJUST = 800;
    const LOW_LAYERS = Math.ceil(BLEND / DZ);
    function roughWind(ub) {
      uRough.fill(0); wRough.fill(0);
      const keep = Math.exp(-DX / ADJUST);
      for (let j = 0; j < LOW_LAYERS; j++) {
        const z = (j + 0.5) * DZ;
        // wind at height z over each surface, as a share of the wind over typical land (same wind at BLEND)
        const g = kind => z >= BLEND ? 1 : (Math.log(z / Z0[kind]) / Math.log(BLEND / Z0[kind])) * (Math.log(BLEND / Z0_REF) / Math.log(z / Z0_REF));
        // follow the wind: each column adjusts gradually from the surface upwind of it
        const order = ub >= 0 ? EAST : WEST;
        let prev = g(groundKind[order[0]]);
        for (const i of order) { prev = prev * keep + g(groundKind[i]) * (1 - keep); gEff[i] = prev; }
        for (let i = 0; i < NX; i++) uRough[at(i, j)] = ub * (gEff[i] - 1);
        if (j === 0) gEff0.set(gEff);
      }
      // rising and sinking air from where the wind speeds up or slows down: w = -(change along the line of the
      // air flowing through the layers below), so no air is made or lost
      flux.fill(0);
      for (let j = 0; j < LOW_LAYERS + 1 && j < NZ; j++) {
        for (let i = 0; i < NX; i++) {
          const below = flux[i];                                   // air flowing sideways below this layer, m²/s
          flux[i] += uRough[at(i, j)] * DZ;
          const here = below + 0.5 * uRough[at(i, j)] * DZ;
          tmp[at(i, j)] = here;
        }
        for (let i = 0; i < NX; i++) {
          const l = i > 0 ? tmp[at(i - 1, j)] : tmp[at(i, j)], r = i < NX - 1 ? tmp[at(i + 1, j)] : tmp[at(i, j)];
          wRough[at(i, j)] = -(r - l) / (2 * DX) * (j === 0 ? 0.5 : 1);
        }
      }
      // above the low layers the air flowing sideways is unchanged, so the rising or sinking fades out
      for (let j = LOW_LAYERS + 1; j < Math.min(NZ, LOW_LAYERS + 6); j++) {
        const fade = 1 - (j - LOW_LAYERS) / 6;
        for (let i = 0; i < NX; i++) wRough[at(i, j)] = wRough[at(i, LOW_LAYERS)] * fade;
      }
      // friction velocity (how strongly the surface brakes the wind), for the turbulence it makes
      for (let i = 0; i < NX; i++) ustar[i] = KAPPA * Math.abs(ub * gEff0[i]) / Math.log(ZR / Z0[groundKind[i]]);
    }
    const gEff0 = new Float32Array(NX);

    function velocities(ub) {
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const k = at(i, j);
        const pu = j < NZ - 1 ? psi[k + NX] : 0, pd = j > 0 ? psi[k - NX] : 0;
        const pr = i < NX - 1 ? psi[k + 1] : 0, pl = i > 0 ? psi[k - 1] : 0;
        u[k] = (pu - pd) / (2 * DZ) + ub;
        w[k] = -(pr - pl) / (2 * DX);
        if (j === 0) w[k] *= 0.5;
      }
    }
    // move a field with the wind: look back to where the air came from (semi-Lagrangian)
    function advect(f, edge) {
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const k = at(i, j);
        const x = i - u[k] * DT / DX, z = j - w[k] * DT / DZ;
        if (x < 0 || x > NX - 1) { tmp[k] = edge(Math.max(0, Math.min(NZ - 1, Math.round(z)))); continue; }
        const zc = Math.max(0, Math.min(NZ - 1.001, z));
        const i0 = Math.floor(x), j0 = Math.floor(zc), fx = x - i0, fz = zc - j0;
        const i1 = Math.min(NX - 1, i0 + 1), j1 = Math.min(NZ - 1, j0 + 1);
        tmp[k] = (1 - fz) * ((1 - fx) * f[at(i0, j0)] + fx * f[at(i1, j0)]) + fz * ((1 - fx) * f[at(i0, j1)] + fx * f[at(i1, j1)]);
      }
      f.set(tmp);
    }
    // vertical mixing (turbulence), two kinds:
    // - from heating: strong where warm air is under cooler air and churns, weak where the air is layered
    // - from friction: wind over rough ground churns the air near the surface (up to about 400 m),
    //   damped where the air is calm and layered
    function stability() {
      for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX; i++) {
        const k = at(i, j);
        const dthdz = (th[k + NX] - th[k]) / DZ;
        const thermal = 0.1 + 59.9 / (1 + Math.exp(Math.min(50, dthdz / 0.002)));   // about 0.1 to 60 m²/s
        const z = (j + 1) * DZ;
        const mech = z < 400 ? KAPPA * ustar[i] * z * (1 - z / 400) ** 2 / (1 + Math.max(0, dthdz) / 0.005) : 0;
        kz[k] = thermal + mech;
      }
    }
    function diffuse(f) {
      const cx = K * DT / (DX * DX), cz = DT / (DZ * DZ);
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const k = at(i, j);
        const l = i > 0 ? f[k - 1] : f[k], r = i < NX - 1 ? f[k + 1] : f[k];
        const down = j > 0 ? kz[k - NX] * (f[k - NX] - f[k]) : 0;
        const up = j < NZ - 1 ? kz[k] * (f[k + NX] - f[k]) : 0;
        tmp[k] = f[k] + cx * (l + r - 2 * f[k]) + cz * (down + up);
      }
      f.set(tmp);
    }

    function step() {
      if (tUtc >= END_UTC) return;
      const ub = windEast();
      solvePsi();
      velocities(ub);

      // friction: the surface brakes the wind near the ground, less over smooth water, more over rough forest.
      // The station's wind stands for the wind over typical land (roughness Z0_REF). Near the ground (below
      // BLEND m, where the wind is the same over every surface) each surface has its own wind speed, from the
      // log wind profile. After a shore or forest edge the air takes about ADJUST m to adjust to the new surface.
      // Where the wind speeds up or slows down along the line, air spreads out (sinks) or piles up (rises).
      roughWind(ub);
      for (let k = 0; k < N; k++) { u[k] += uRough[k]; w[k] += wRough[k]; }

      // buoyancy: warmer or moister than the layer average rises, cloud and rain water weigh it down
      for (let j = 0; j < NZ; j++) { let a = 0, b = 0; for (let i = 0; i < NX; i++) { a += th[at(i, j)]; b += qv[at(i, j)]; } thMean[j] = a / NX; qvMean[j] = b / NX; }
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const k = at(i, j);
        buoy[k] = G * ((th[k] - thMean[j]) / thMean[j] + 0.61 * (qv[k] - qvMean[j]) - qc[k] - qr[k]);
      }
      // spin of the air: changes where buoyancy differs from side to side
      for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
        const k = at(i, j);
        zeta[k] -= DT * (buoy[k + 1] - buoy[k - 1]) / (2 * DX);
      }

      // air coming in at the edges is like the air already at the edge (it has warmed through the day too)
      const edgeOf = f => j => (u[at(0, j)] > 0 ? f[at(0, j)] : f[at(NX - 1, j)]);
      advect(zeta, () => 0);
      advect(th, edgeOf(th));
      advect(qv, edgeOf(qv));
      advect(qc, () => 0);
      stability();
      diffuse(zeta); diffuse(th); diffuse(qv); diffuse(qc);

      // quiet layer at the top, so motion doesn't bounce back
      for (let j = NZ - 8; j < NZ; j++) {
        const a = 0.002 * (j - (NZ - 9));
        for (let i = 0; i < NX; i++) { const k = at(i, j); zeta[k] *= 1 - a; th[k] += a * (thEnv[j] - th[k]); }
      }

      // heat and water vapour from the ground into the lowest layer. The exchange speed (m/s) grows with the wind and
      // the roughness of the surface, plus rising warm air where the surface is warmer than the air (free convection).
      for (let i = 0; i < NX; i++) {
        const k = at(i, 0);
        const Ts = surfaceTemp(i, tUtc) + 273.15;
        const warmer = Ts - th[k] * exner[0];
        const exch = CH[groundKind[i]] * Math.max(1, Math.abs(u[k])) + (warmer > 0 ? 0.0013 * Math.cbrt(warmer) : 0);
        th[k] += DT * exch * (Ts / exner[0] - th[k]) / DZ;
        const qs = qsat(Ts, pEnv[0]);
        // evaporation where the surface is moister than the air; dew or frost where the air is moister
        // than a cold surface (any surface can take dew, so no EVAP factor for it)
        const evap = (qs > qv[k] ? EVAP[groundKind[i]] : 1) * exch * (qs - qv[k]) / DZ;
        qv[k] = Math.max(0, qv[k] + DT * evap);
      }

      microphysics();
      tUtc += DT / 3600;
    }

    // ---------- cloud and rain (Kessler 1969 warm-rain scheme, simplified) ----------
    function microphysics() {
      const dust = controls.dust();
      const threshold = 0.5e-3 * (0.6 + 0.4 * dust);   // cloud water needed before rain starts; more dust → later
      const k1 = 1e-3 / Math.sqrt(dust);                 // how fast cloud water turns into rain
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const k = at(i, j);
        const T = th[k] * exner[j], p = pEnv[j];
        const qs = qsat(T, p);
        // condensation and evaporation of cloud water, releasing or taking heat
        let dq = (qv[k] - qs) / (1 + LV * LV * qs / (CP * RV * T * T));
        if (dq < 0) dq = Math.max(dq, -qc[k]);
        qv[k] -= dq; qc[k] += dq; th[k] += LV * dq / (CP * exner[j]);
        // cloud water → rain
        const auto = qc[k] > threshold ? k1 * (qc[k] - threshold) * DT : 0;
        const accr = qr[k] > 0 ? 2.2 * qc[k] * Math.pow(qr[k], 0.875) * DT : 0;
        const take = Math.min(qc[k], auto + accr);
        qc[k] -= take; qr[k] += take;
        // rain evaporating in dry air below the cloud
        if (qr[k] > 0 && qv[k] < qs) {
          const ev = Math.min(qr[k], (1 - qv[k] / qs) * qr[k] * DT / 600);
          qr[k] -= ev; qv[k] += ev; th[k] -= LV * ev / (CP * exner[j]);
        }
      }
      // rain falls (speed from Kessler's formula) and lands on the ground
      for (let i = 0; i < NX; i++) {
        for (let j = 0; j < NZ; j++) {
          const k = at(i, j);
          if (qr[k] <= 0) continue;
          const vt = 36.34 * Math.pow(rho[j] * qr[k] * 1e-3, 0.1364) * Math.sqrt(1.2 / rho[j]);
          const out = Math.min(qr[k], qr[k] * vt * DT / DZ);
          qr[k] -= out;
          if (j === 0) rainSum[i] += out * rho[0] * DZ;          // kg/m² = mm
          else qr[k - NX] += out * rho[j] / rho[j - 1];
        }
      }
    }

    // ---------- dots that ride the air ----------
    const dots = [];
    function resetDots() { dots.length = 0; for (let n = 0; n < 900; n++) dots.push(newDot()); }
    function newDot() { const x = Math.random() * L, z = Math.random() * H * 0.95; return { x, z, px: x, pz: z }; }
    function sampleUW(x, z) {
      const fi = Math.max(0, Math.min(NX - 1.001, x / DX - 0.5)), fj = Math.max(0, Math.min(NZ - 1.001, z / DZ - 0.5));
      const i0 = Math.floor(fi), j0 = Math.floor(fj), a = fi - i0, b = fj - j0;
      const s = f => (1 - b) * ((1 - a) * f[at(i0, j0)] + a * f[at(i0 + 1, j0)]) + b * ((1 - a) * f[at(i0, j0 + 1)] + a * f[at(i0 + 1, j0 + 1)]);
      return [s(u), s(w)];
    }
    function moveDots(seconds) {
      for (const d of dots) {
        const [uu, ww] = sampleUW(d.x, d.z);
        d.px = d.x; d.pz = d.z;
        d.x += uu * seconds; d.z += ww * seconds;
        if (d.x < 0 || d.x > L || d.z < 0 || d.z > H || Math.random() < 0.002) Object.assign(d, newDot());
      }
    }

    // ---------- drawing ----------
    const W = canvas.width, AIR = 380, GROUND_TOP = AIR, GROUND_H = 18, BOTTOM = canvas.height - 8;
    const TS_TOP = 408, TS_H = 50, TU_TOP = 470, TU_H = 50, VW_TOP = 532, VW_H = 64;
    const W_LEVEL = Math.round(200 / DZ);  // the layer at about 200 m, for rising and sinking air
    const sx = x => x / L * W, sz = z => AIR - z / H * AIR;
    const lakeLon = [14.1107, 14.1742];   // Partwitzer See, west and east shore (OpenStreetMap)
    const lonToX = lon => (lon - data.line.lon_from) / (data.line.lon_to - data.line.lon_from) * L;
    const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

    function draw() {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, canvas.height);
      ctx.textAlign = 'left';

      // the Partwitzer See area, marked the same in both years
      ctx.fillStyle = soft;
      ctx.fillRect(sx(lonToX(lakeLon[0])), 0, sx(lonToX(lakeLon[1])) - sx(lonToX(lakeLon[0])), AIR);

      // cloud and mist: grey
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const c = qc[at(i, j)];
        if (c < 1e-5) continue;
        ctx.globalAlpha = Math.min(0.9, 0.25 + c / 0.8e-3);
        ctx.fillStyle = muted;
        ctx.fillRect(sx(i * DX), sz((j + 1) * DZ), Math.ceil(W / NX), Math.ceil(AIR / NZ));
      }
      ctx.globalAlpha = 1;

      // steam fog over the water (the forecasters' check, thinner than the model's layers): a wavy band
      ctx.strokeStyle = muted; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < NX; i++) {
        if (!steamFog(i)) continue;
        const x0 = sx(i * DX), x1 = sx((i + 1) * DX);
        for (let y = 2; y <= 8; y += 3) {
          ctx.moveTo(x0, AIR - y); ctx.quadraticCurveTo((x0 + x1) / 2, AIR - y - 2, x1, AIR - y);
        }
      }
      ctx.stroke(); ctx.lineWidth = 1;

      // rain: short falling strokes
      ctx.strokeStyle = ink; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const r = qr[at(i, j)];
        if (r < 2e-5 || Math.random() > Math.min(1, r / 2e-4)) continue;
        const x = sx((i + Math.random()) * DX), y = sz((j + Math.random()) * DZ);
        ctx.moveTo(x, y); ctx.lineTo(x - 1, y + 5);
      }
      ctx.stroke();

      // air movement: dots with a short tail
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (const d of dots) {
        const x1 = sx(d.px), y1 = sz(d.pz), x2 = sx(d.x), y2 = sz(d.z);
        if (Math.abs(x2 - x1) > 30) continue;
        ctx.moveTo(x1, y1); ctx.lineTo(x2 + 0.8, y2 + 0.8);
      }
      ctx.stroke(); ctx.globalAlpha = 1;

      // estimated cloud base from the station's temperature and dew point (about 125 m per °C of difference)
      const T = obs('temp_c', tUtc), Td = obs('dew_point_c', tUtc);
      const lcl = Math.max(0, (T - Td) * 125);
      ctx.font = '13px system-ui, sans-serif';
      if (lcl < H) {
        ctx.setLineDash([5, 5]); ctx.strokeStyle = ink; ctx.beginPath();
        ctx.moveTo(0, sz(lcl)); ctx.lineTo(W, sz(lcl)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ink; ctx.textAlign = 'right';
        ctx.fillText('estimated cloud base ' + (lcl / 1000).toFixed(1) + ' km', W - 6, Math.max(14, sz(lcl) - 5));
        ctx.textAlign = 'left';
      }

      // height scale
      ctx.fillStyle = muted;
      for (let km = 1; km < H / 1000; km++) { ctx.fillText(km + ' km', 4, sz(km * 1000) + 4); ctx.fillRect(38, sz(km * 1000), 6, 1); }

      // ground strip
      for (let i = 0; i < NX; i++) {
        const x = sx(i * DX), wpx = Math.ceil(W / NX);
        const kind = groundKind[i];
        ctx.fillStyle = kind === 'vegetation' ? muted : paper;
        ctx.fillRect(x, GROUND_TOP, wpx, GROUND_H);
        ctx.fillStyle = ink;
        if (kind === 'water') for (let y = 3; y < GROUND_H; y += 5) ctx.fillRect(x, GROUND_TOP + y, wpx, 1);
        if (kind === 'bare') for (let y = 2; y < GROUND_H; y += 5) for (let xx = (y % 2) * 2; xx < wpx; xx += 4) ctx.fillRect(x + xx, GROUND_TOP + y, 1, 1);
      }
      ctx.fillStyle = ink; ctx.fillRect(0, GROUND_TOP, W, 1); ctx.fillRect(0, GROUND_TOP + GROUND_H, W, 1);

      // surface temperature now, and rain so far
      const [tLo, tHi] = season.tsRange;
      const tsY = t => TS_TOP + TS_H - (t - tLo) / (tHi - tLo) * TS_H;
      ctx.strokeStyle = ink; ctx.beginPath();
      for (let i = 0; i < NX; i++) { const y = tsY(surfaceTemp(i, tUtc)); i ? ctx.lineTo(sx((i + 0.5) * DX), y) : ctx.moveTo(sx(0.5 * DX), y); }
      ctx.stroke();
      ctx.fillStyle = muted;
      for (const t of (season.profile === 'summer' ? [10, 30, 50] : [-10, 0, 10, 20])) { ctx.fillRect(0, tsY(t), 6, 1); ctx.fillText(t + ' °C', 8, tsY(t) + 4); }
      ctx.textAlign = 'right'; ctx.fillText('surface temperature', W - 4, TS_TOP + 10); ctx.textAlign = 'left';

      // turbulence near the ground: mixing between the two lowest layers, m²/s, on a log scale (0.1 to 100)
      const tuY = v => TU_TOP + TU_H - (Math.log10(Math.max(0.1, v)) + 1) / 3 * TU_H;
      ctx.strokeStyle = ink; ctx.beginPath();
      for (let i = 0; i < NX; i++) { const y = tuY(kz[at(i, 0)]); i ? ctx.lineTo(sx((i + 0.5) * DX), y) : ctx.moveTo(sx(0.5 * DX), y); }
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.fillRect(0, tuY(0.1), 6, 1); ctx.fillText('calm', 8, tuY(0.1));
      ctx.fillRect(0, tuY(100), 6, 1); ctx.fillText('churning', 8, tuY(100) + 10);
      ctx.textAlign = 'right'; ctx.fillText('turbulence near the ground', W - 4, TU_TOP + 10); ctx.textAlign = 'left';

      // rising (+) and sinking (−) air at about 200 m
      const wMax = season.profile === 'summer' ? 2 : 0.2;     // m/s at the top and bottom of the strip
      const vwY = v => VW_TOP + VW_H / 2 - Math.max(-1, Math.min(1, v / wMax)) * VW_H / 2;
      ctx.fillStyle = soft; ctx.fillRect(0, VW_TOP, W, VW_H);
      ctx.fillStyle = muted; ctx.fillRect(0, vwY(0), W, 1);
      ctx.fillStyle = ink;
      for (let i = 0; i < NX; i++) {
        const v = w[at(i, W_LEVEL)], y0 = vwY(0), y1 = vwY(v);
        ctx.fillRect(sx(i * DX), Math.min(y0, y1), Math.ceil(W / NX), Math.max(1, Math.abs(y1 - y0)));
      }
      ctx.fillStyle = muted;
      ctx.fillText('↑ rising, up to ' + wMax + ' m/s', 4, VW_TOP + 11);
      ctx.fillText('↓ sinking', 4, VW_TOP + VW_H - 3);
      ctx.textAlign = 'right'; ctx.fillText('air rising or sinking at 200 m', W - 4, VW_TOP + 11); ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      for (let i = 0; i < NX; i++) if (rainSum[i] > 0.01) {
        const h = Math.min(30, rainSum[i] * 10);
        ctx.fillRect(sx(i * DX), GROUND_TOP + GROUND_H + 1, Math.ceil(W / NX) - 1, h);
      }

      // labels along the bottom
      const midLake = sx(lonToX((lakeLon[0] + lakeLon[1]) / 2));
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.fillText('Partwitzer See area', midLake, BOTTOM);
      ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.fillText('west', 4, BOTTOM);
      ctx.textAlign = 'right'; ctx.fillText('east', W - 4, BOTTOM); ctx.textAlign = 'left';

      // which year, clock and station readings
      const local = tUtc + season.utcOffset, hh = Math.floor(local), mm = Math.floor((local - hh) * 60);
      ctx.fillStyle = ink; ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(`${data[role].slice(0, 4)} · ${role === 'pit' ? 'open pit' : 'lake'}`, 50, 20);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`weather of ${fmtDate(wx.date)}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} local time`, 50, 38);
      ctx.fillStyle = muted;
      const ub = windEast();
      const source = wx.estimated ? `near the lake, estimated from Cottbus${wx.version !== 'typical' ? ' (' + wx.version + ' version)' : ''}` : `${wx.station_name}, ${wx.distance_km} km (observed)`;
      ctx.fillText(`${source}: ${T.toFixed(1)} °C, dew point ${Td.toFixed(1)} °C`, 50, 55);
      ctx.fillText(`wind along the line ${Math.abs(ub).toFixed(1)} m/s towards the ${ub < 0 ? 'west' : 'east'}`, 50, 71);

      updateReadout();
    }

    // steam fog, the forecasters' check: mix saturated air at the water's temperature with the cold air arriving
    // from the land (the station's temperature and dew point). If some mixture holds more water vapour than it can,
    // the water steams. Steam fog is often only metres to tens of metres deep, thinner than the model's lowest
    // layer (62 m), so it is checked here for each water cell instead of being calculated by the model.
    function steamFog(i) {
      if (groundKind[i] !== 'water') return false;
      const p = pEnv[0], Tw = groundSt[i], Ta = obs('temp_c', tUtc), Td = obs('dew_point_c', tUtc);
      if (Tw <= Ta || Td == null) return false;
      const qw = qsat(Tw + 273.15, p), qa = 0.622 * satP(Td) / (p - satP(Td));
      for (let f = 0.05; f < 1; f += 0.05) {
        if (f * qw + (1 - f) * qa > 1.01 * qsat(f * Tw + (1 - f) * Ta + 273.15, p)) return true;
      }
      return false;
    }

    function updateReadout() {
      const x0 = lonToX(lakeLon[0]), x1 = lonToX(lakeLon[1]);
      const LOW = Math.round(250 / DZ);               // the lowest 250 m
      let cloudIn = 0, nIn = 0, cloudOut = 0, nOut = 0, rainIn = 0, rainOut = 0, mistIn = 0, mistOut = 0;
      let steamIn = 0, waterIn = 0, steamOut = 0, waterOut = 0;
      let kIn = 0, kOut = 0, uIn = 0, uOut = 0, wIn = 0, wOut = 0;
      for (let i = 0; i < NX; i++) {
        let col = 0; for (let j = 0; j < NZ; j++) col += qc[at(i, j)];
        let low = 0; for (let j = 0; j < LOW; j++) low = Math.max(low, qc[at(i, j)]);
        const misty = low > 2e-5 ? 1 : 0;             // more than 0.02 g of cloud water per kg of air
        const cloudy = col > 1e-4 ? 1 : 0;
        const x = (i + 0.5) * DX;
        const inside = x >= x0 && x <= x1;
        const nearEdge = x < 3000 || x > L - 3000;   // the model's side walls hold air back near the edges
        const kk = kz[at(i, 0)], uu = Math.abs(u[at(i, 0)]), ww = w[at(i, W_LEVEL)];
        if (groundKind[i] === 'water') {
          const s = steamFog(i) ? 1 : 0;
          if (inside) { waterIn++; steamIn += s; } else if (!nearEdge) { waterOut++; steamOut += s; }
        }
        if (inside) { cloudIn += cloudy; mistIn += misty; nIn++; rainIn += rainSum[i]; kIn += kk; uIn += uu; wIn += ww; }
        else if (!nearEdge) { cloudOut += cloudy; mistOut += misty; nOut++; rainOut += rainSum[i]; kOut += kk; uOut += uu; wOut += ww; }
      }
      const pc = (a, n) => Math.round(100 * a / n) + '%';
      stats = { mistIn: mistIn / nIn, mistOut: mistOut / nOut, cloudIn: cloudIn / nIn, rainIn: rainIn / nIn, rainOut: rainOut / nOut,
        kIn: kIn / nIn, kOut: kOut / nOut, uIn: uIn / nIn, uOut: uOut / nOut, wIn: wIn / nIn, wOut: wOut / nOut,
        steamIn: steamIn / nIn, steamOut: steamOut / nOut, waterIn: waterIn / nIn };
      const f1 = v => v.toFixed(1), f2 = v => (v >= 0 ? '+' : '') + v.toFixed(2);
      const steam = (s, n) => n ? `steam fog over ${s} of ${n} water cells` : 'no open water';
      readout.textContent =
        `Modelled. Partwitzer See area: wind near the ground ${f1(uIn / nIn)} m/s, turbulence ${f1(kIn / nIn)} m²/s, air at 200 m ${f2(wIn / nIn)} m/s, ` +
        `${steam(steamIn, waterIn)}, mist in the lowest 250 m ${pc(mistIn, nIn)}, cloud ${pc(cloudIn, nIn)}, rain ${(rainIn / nIn).toFixed(2)} mm. ` +
        `Rest of the line (without 3 km at each edge): wind ${f1(uOut / nOut)} m/s, turbulence ${f1(kOut / nOut)} m²/s, air at 200 m ${f2(wOut / nOut)} m/s, ` +
        `${steam(steamOut, waterOut)}, mist ${pc(mistOut, nOut)}, cloud ${pc(cloudOut, nOut)}, rain ${(rainOut / nOut).toFixed(2)} mm.`;
    }
    let stats = {};

    return {
      reset, step, moveDots, draw,
      get tUtc() { return tUtc; }, get done() { return tUtc >= END_UTC; }, get stats() { return stats; },
      th, qv, qc, qr, u, w, kz, ustar, uRough, wRough, rainSum, exner, pEnv, NX, NZ, DX, DZ,
    };
  }

  // ---------- run both panels ----------
  const models = [
    makeModel('pit', el('view-pit'), el('readout-pit')),
    makeModel('lake', el('view-lake'), el('readout-lake')),
  ];
  let running = true;
  function resetAll() {
    const seed = (Math.random() * 2 ** 31) | 0;
    for (const m of models) m.reset(controls.season(), controls.weather(), controls.night(), seed);
  }
  function setRunning(r) { running = r; el('play').textContent = r ? 'Pause' : 'Play'; }
  function frame() {
    if (running && !models.every(m => m.done)) {
      const n = controls.speed();
      for (const m of models) { for (let s = 0; s < n; s++) m.step(); m.moveDots(DT * n * 0.6); }
    } else if (running) setRunning(false);
    for (const m of models) m.draw();
    requestAnimationFrame(frame);
  }

  document.querySelectorAll('input[name=season], input[name=weather], input[name=night]').forEach(r => r.addEventListener('change', () => { resetAll(); setRunning(true); }));
  el('moist').addEventListener('input', showValue);
  el('moist').addEventListener('change', () => { resetAll(); setRunning(true); });
  ['dust', 'wind', 'windobs', 'speed'].forEach(id => el(id).addEventListener('input', showValue));
  el('play').addEventListener('click', () => {
    if (models.every(m => m.done)) resetAll();
    setRunning(!running);
  });
  el('restart').addEventListener('click', () => { resetAll(); setRunning(true); });

  // for checking the model from the browser console: __sim[0] is 1991, __sim[1] is 2025
  globalThis.__sim = models;

  showValue();
  resetAll();
  frame();
})();
