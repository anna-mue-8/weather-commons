// A · II: Anna-Lena's Blender model of Schwarze Pumpe, with clouds simulated live from its two cooling towers.
// The clouds are a SYNTHETIC simulation, not data: puffs leave each tower top with an upward push (warm,
// buoyant air) that weakens as they cool, bend over with the wind, wobble with turbulence, swell as they mix
// with the surrounding air, and thin out downwind. The wind direction comes from the Wind object in the
// Blender scene. Drag to turn and tilt; there is no zoom.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const box = document.getElementById('pumpe-3d');
const status = box.querySelector('.model-status');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Settings for the plume. Units are Blender units (the towers are about 80 tall).
const PLUME = {
  perSecond: 16,      // puffs per tower per second
  mouth: 9,           // radius of the tower opening the puffs leave from
  exitSpeed: 7,       // upward speed when leaving the tower
  lift: 4.5,          // buoyancy: upward push at the start, fading as the puff cools
  liftFades: 5,       // seconds for the push to fall to about a third
  wind: 7,            // wind speed at the tower tops
  turbulence: 2.4,    // strength of the wobble
  life: [16, 26],     // seconds a puff lasts before it has mixed away
  size: 11,           // puff size at the tower top
  grows: 6.5,         // how fast puffs swell
  opacity: 0.6,
};
const MAX = 1700;

const renderer = new THREE.WebGLRenderer({ canvas: box.querySelector('canvas'), antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 900, 1900);
const camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-250, 420, 260);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;   // turn and tilt only
controls.enablePan = false;
controls.enableDamping = !still;
controls.minPolarAngle = 0.08 * Math.PI;  // nearly straight down
controls.maxPolarAngle = 0.48 * Math.PI;  // just above the ground

// --- the puffs: soft cloud sprites that always face the viewer -------------------------------------
function puffTexture() {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 26; k++) {   // a lumpy cloud: many round blobs, each lit from above
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * n * 0.24, r = n * (0.09 + rnd() * 0.13);
    const x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d;
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(205,205,205,0.4)');
    grad.addColorStop(1, 'rgba(160,160,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const geo = new THREE.InstancedBufferGeometry();
geo.index = new THREE.PlaneGeometry(1, 1).index;
geo.setAttribute('position', new THREE.PlaneGeometry(1, 1).getAttribute('position'));
geo.setAttribute('uv', new THREE.PlaneGeometry(1, 1).getAttribute('uv'));
const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
const iLook = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); // size, alpha, rotation, shade
iPos.setUsage(THREE.DynamicDrawUsage);
iLook.setUsage(THREE.DynamicDrawUsage);
geo.setAttribute('iPos', iPos);
geo.setAttribute('iLook', iLook);
geo.instanceCount = 0;

const mat = new THREE.ShaderMaterial({
  uniforms: { map: { value: puffTexture() }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far } },
  vertexShader: `
    attribute vec3 iPos; attribute vec4 iLook;
    uniform float fogNear, fogFar;
    varying vec2 vUv; varying float vAlpha, vShade, vLit, vFog;
    void main() {
      vUv = uv;
      vLit = position.y + 0.5;                       // 0 at the bottom of the puff, 1 at the top
      vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
      float c = cos(iLook.z), s = sin(iLook.z);
      mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iLook.x;
      gl_Position = projectionMatrix * mv;
      vAlpha = iLook.y; vShade = iLook.w;
      vFog = smoothstep(fogNear, fogFar, -mv.z);
    }`,
  fragmentShader: `
    uniform sampler2D map;
    varying vec2 vUv; varying float vAlpha, vShade, vLit, vFog;
    void main() {
      vec4 t = texture2D(map, vUv);
      float a = t.a * vAlpha * (1.0 - vFog);
      if (a < 0.004) discard;
      float shade = vShade * mix(0.72, 1.0, vLit);  // lit from above, a little darker underneath
      gl_FragColor = vec4(t.rgb / max(t.a, 0.001) * shade, a);
    }`,
  transparent: true,
  depthWrite: false,
});
const puffs = new THREE.Mesh(geo, mat);
puffs.frustumCulled = false;
scene.add(puffs);

// Particle state
const P = {
  n: 0,
  pos: new Float32Array(MAX * 3), vel: new Float32Array(MAX * 3),
  age: new Float32Array(MAX), life: new Float32Array(MAX), seed: new Float32Array(MAX), rot: new Float32Array(MAX),
};
let towers = [];                         // tower-top positions
let windDir = new THREE.Vector2(1, 0);   // horizontal wind direction (x, z)
let simTime = 0;
const owed = [];                         // fractional puffs still to emit, per tower

function emit(top) {
  if (P.n >= MAX) return;
  const i = P.n++;
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * PLUME.mouth;
  P.pos.set([top.x + Math.cos(a) * r, top.y, top.z + Math.sin(a) * r], i * 3);
  P.vel.set([(Math.random() - 0.5) * 1.5, PLUME.exitSpeed * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 1.5], i * 3);
  P.age[i] = 0;
  P.life[i] = PLUME.life[0] + Math.random() * (PLUME.life[1] - PLUME.life[0]);
  P.seed[i] = Math.random() * 100;
  P.rot[i] = Math.random() * Math.PI * 2;
}

function kill(i) {   // move the last puff into slot i
  const j = --P.n;
  if (i === j) return;
  for (let k = 0; k < 3; k++) { P.pos[i * 3 + k] = P.pos[j * 3 + k]; P.vel[i * 3 + k] = P.vel[j * 3 + k]; }
  P.age[i] = P.age[j]; P.life[i] = P.life[j]; P.seed[i] = P.seed[j]; P.rot[i] = P.rot[j];
}

function step(dt) {
  simTime += dt;
  towers.forEach((top, k) => {
    owed[k] = (owed[k] || 0) + PLUME.perSecond * dt;
    while (owed[k] >= 1) { emit(top); owed[k] -= 1; }
  });
  for (let i = P.n - 1; i >= 0; i--) {
    const age = (P.age[i] += dt);
    if (age > P.life[i]) { kill(i); continue; }
    const o = i * 3, s = P.seed[i];
    const x = P.pos[o], y = P.pos[o + 1], z = P.pos[o + 2];
    // rise: buoyancy that fades as the puff cools, slowed by drag
    const lift = PLUME.lift * Math.exp(-age / PLUME.liftFades);
    P.vel[o + 1] += (lift - 0.32 * P.vel[o + 1]) * dt;
    // bend over: the puff is caught by the wind, a little stronger higher up
    const u = PLUME.wind * (1 + Math.max(0, y - 80) * 0.003);
    const catchUp = Math.min(0.7, 0.12 + 0.05 * age);
    P.vel[o] += (windDir.x * u - P.vel[o]) * catchUp * dt;
    P.vel[o + 2] += (windDir.y * u - P.vel[o + 2]) * catchUp * dt;
    // wobble: a smooth, slowly changing turbulence that grows once the puff has left the tower
    const w = PLUME.turbulence * Math.min(1, age / 5);
    const tx = Math.sin(y * 0.031 + simTime * 0.37 + s) + Math.sin(z * 0.018 - simTime * 0.21);
    const ty = Math.sin(x * 0.027 - simTime * 0.29 + s * 1.3) * 0.6;
    const tz = Math.cos(y * 0.025 + simTime * 0.33 - s) + Math.sin(x * 0.016 + simTime * 0.17);
    P.pos[o] = x + (P.vel[o] + tx * w) * dt;
    P.pos[o + 1] = y + (P.vel[o + 1] + ty * w) * dt;
    P.pos[o + 2] = z + (P.vel[o + 2] + tz * w) * dt;
    P.rot[i] += 0.04 * dt * (s % 2 > 1 ? 1 : -1);
  }
}

// Write the puffs into the GPU buffers, farthest first so the see-through puffs overlap correctly
const order = new Uint32Array(MAX), depth = new Float32Array(MAX);
const tmp = new THREE.Vector3();
function upload() {
  const n = P.n;
  const view = camera.matrixWorldInverse.elements;
  for (let i = 0; i < n; i++) {
    tmp.set(P.pos[i * 3], P.pos[i * 3 + 1], P.pos[i * 3 + 2]);
    depth[i] = view[2] * tmp.x + view[6] * tmp.y + view[10] * tmp.z + view[14]; // view-space z (more negative = farther)
    order[i] = i;
  }
  const idx = Array.from(order.subarray(0, n)).sort((a, b) => depth[a] - depth[b]);
  const pa = iPos.array, la = iLook.array;
  idx.forEach((i, k) => {
    const age = P.age[i], life = P.life[i];
    const fadeIn = Math.min(1, age / 0.8);
    const fadeOut = Math.pow(Math.max(0, 1 - age / life), 1.3);
    pa[k * 3] = P.pos[i * 3]; pa[k * 3 + 1] = P.pos[i * 3 + 1]; pa[k * 3 + 2] = P.pos[i * 3 + 2];
    la[k * 4] = PLUME.size + PLUME.grows * Math.pow(age, 0.85);
    la[k * 4 + 1] = PLUME.opacity * fadeIn * fadeOut;
    la[k * 4 + 2] = P.rot[i];
    la[k * 4 + 3] = (0.8 + 0.2 * Math.min(1, Math.max(0, (P.pos[i * 3 + 1] - 80) / 160))) * (0.9 + 0.1 * Math.sin(P.seed[i] * 12.9));
  });
  geo.instanceCount = n;
  iPos.needsUpdate = true;
  iLook.needsUpdate = true;
}

// --- size, drawing, and running only while the model is on screen -----------------------------------
function resize() {
  const w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  draw();
}
function render() {
  camera.updateMatrixWorld();
  upload();
  renderer.render(scene, camera);
}
function draw() {
  controls.update();   // may announce a 'change', which only renders (below), so no loop
  render();
}

let running = false, visible = false, last = 0, raf = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  step(dt);
  draw();
  raf = requestAnimationFrame(loop);
}
function setRunning() {
  const want = visible && !document.hidden && !still && towers.length > 0;
  if (want === running) return;
  running = want;
  cancelAnimationFrame(raf);
  if (running) { last = performance.now(); raf = requestAnimationFrame(loop); }
}
new ResizeObserver(resize).observe(box);
new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(); }, { threshold: 0.05 }).observe(box);
document.addEventListener('visibilitychange', setRunning);
controls.addEventListener('change', () => { if (!running) render(); });

const resetButton = box.parentElement.querySelector('.model-reset');
if (resetButton) resetButton.addEventListener('click', () => { controls.reset(); draw(); });

// --- load the model ----------------------------------------------------------------------------------
const plain = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
new GLTFLoader().load(box.dataset.src, (gltf) => {
  const model = gltf.scene;
  scene.add(model);
  model.updateMatrixWorld(true);
  const byName = {};
  model.traverse((o) => { byName[plain(o.name)] = o; });

  // the markers Anna-Lena placed at the tower tops; if missing, the top of each tower's shape
  const marks = ['empty', 'empty001'].map((n) => byName[n]).filter(Boolean);
  if (marks.length) {
    towers = marks.map((m) => m.getWorldPosition(new THREE.Vector3()));
  } else {
    towers = ['coolingtower1', 'coolingtower2'].map((n) => byName[n]).filter(Boolean).map((t) => {
      const b = new THREE.Box3().setFromObject(t);
      return new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
    });
  }
  // the wind: the Wind object in Blender blows along its own Z axis (Y in the exported file)
  if (byName.wind) {
    const d = new THREE.Vector3(0, 1, 0).applyQuaternion(byName.wind.getWorldQuaternion(new THREE.Quaternion()));
    if (Math.hypot(d.x, d.z) > 0.05) windDir = new THREE.Vector2(d.x, d.z).normalize();
  }
  // first view: from the south, looking over the plant at the towers, with room for the plume downwind
  const mid = towers.reduce((a, t) => a.add(t), new THREE.Vector3()).divideScalar(towers.length || 1);
  controls.target.set(mid.x + windDir.x * 60, mid.y + 10, mid.z + windDir.y * 60);
  camera.position.copy(controls.target).add(new THREE.Vector3(-210, 190, 640));
  controls.update();
  controls.saveState();

  for (let t = 0; t < 30; t += 1 / 15) step(1 / 15);   // let the plume build up before the first picture
  status.remove();
  resize();
  setRunning();
}, undefined, () => {
  status.textContent = 'The 3D model could not be loaded.';
});
