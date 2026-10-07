/* alloc3d: isometric 3D scene of a courier-allocation chain. Pages carry data only:
   window.ALLOC3D = { chain, mapLabel, sql?, scenarios: { key: Scenario } }   (see README)
   Beats run in code order: the postal lookup happens before the shortlist loop. */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/controls/OrbitControls.js/+esm';
import { CSS2DRenderer, CSS2DObject } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/renderers/CSS2DRenderer.js/+esm';

const D = window.ALLOC3D;
const PHASES = ['arrive', 'pool', 'chain', 'lookup', 'mine', 'job', 'pick', 'compare', 'gate2', 'end'];
const R = n => PHASES.indexOf(n);
const JOBS = ['firstmile', 'lastmile', 'domestic'];
const THEME_KEY = 'artifact-theme';  // shared with walkthrough.js so one choice holds across kit pages
const root = document.documentElement;
const $ = s => document.querySelector(s);

// ---- layout: place each pool on the shortlist pad and in the gate queue ----
function layout(s) {
  const foreign = s.pool.filter(c => c.foreign), cand = s.pool.filter(c => !c.foreign), big = cand.length > 4;
  const out = foreign.map((c, k) => ({ ...c, pad: [-11.5 - k * 1.8, 5.4], queue: [-7.5 - k * 2.2, 8.6] }));
  if (!big) {
    cand.forEach((c, i) => out.push({ ...c, pad: [-11.5, [2.7, 0, -2.7, -5.4][i]], queue: [-7.5, [4.5, 1.5, -1.5, -4.5][i]] }));
  } else {  // 3-deep grid, first candidate front-centre, last one in the back corner (its label stays clear)
    const slots = [];
    for (const z of [0, 1.6, -1.6, 3.2, -3.2, 4.8, -4.8]) for (const dx of [0, 1.4, 2.8]) if (!(dx === 2.8 && z === -3.2)) slots.push([dx, z]);
    cand.forEach((c, i) => {
      const [dx, z] = i === cand.length - 1 ? [2.8, -3.2] : slots[i];
      out.push({ ...c, pad: [-10 - dx, z], queue: [-6.5 - dx, z] });
    });
  }
  s.size = big ? 1.1 : 1.5;
  return out;
}

// ---- theme ----
function setTheme(t) {
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  localStorage.setItem(THEME_KEY, t);
  document.querySelectorAll('.theme-toggle button').forEach(b => b.setAttribute('aria-pressed', b.dataset.theme === t));
}
const header = $('.a3d header');
if (header) {
  const t = document.createElement('div');
  t.className = 'theme-toggle'; t.setAttribute('role', 'group'); t.setAttribute('aria-label', 'Theme');
  t.innerHTML = ['auto', 'light', 'dark'].map(m => `<button type="button" data-theme="${m}">${m}</button>`).join('');
  const bar = document.createElement('div'); bar.className = 'topbar';
  const eyebrow = header.querySelector('.eyebrow');
  if (eyebrow) header.insertBefore(bar, eyebrow), bar.appendChild(eyebrow); else header.prepend(bar);
  bar.appendChild(t);
}
setTheme(localStorage.getItem(THEME_KEY) || 'auto');

// ---- sidebar UI ----
const ui = $('#a3d-ui');
ui.innerHTML = `<div class="scen" role="group" aria-label="Scenario">${Object.entries(D.scenarios).map(([k, s]) =>
    `<button data-s="${k}">${s.btn[0]}<small>${s.btn[1]}</small></button>`).join('')}</div>
  <div class="ctrl"><button class="prev" aria-label="Previous step">&larr;</button><button class="play" aria-label="Play">&#9654;</button>
    <button class="next" aria-label="Next step">&rarr;</button><div class="dots"></div></div>
  <div class="step" aria-live="polite"></div>
  ${D.sql ? '<div><p class="eyebrow">Check this order yourself</p><div class="sql"></div></div>' : ''}`;

// ---- scene ----
const css = n => getComputedStyle(root).getPropertyValue(n).trim();
const C = { card: new THREE.Color('#C99A5B'), slab: new THREE.Color('#B3B9CA') };
function readColors() {
  for (const k of ['ground', 'rule', 'keep', 'lost', 'deep', 'warn', 'brand']) C[k] = new THREE.Color(css('--' + k) || '#888');
  C.floor = new THREE.Color(css('--surface-2'));
}

const stage = $('#a3d-stage');
stage.innerHTML = '<div class="labels"></div><div class="hint">drag to rotate &middot; scroll to zoom &middot; &larr; &rarr; to step &middot; <a href="#" class="reset">reset view</a></div>';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);
const labelR = new CSS2DRenderer({ element: stage.querySelector('.labels') });

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(12, 24, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
scene.add(sun);

const TARGET = new THREE.Vector3(-1.5, 0, 0);
const camera = new THREE.OrthographicCamera();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = 1.35;
function resetView() {
  camera.position.set(TARGET.x + 30, 30, 30);  // true isometric angle
  camera.zoom = 1;
  controls.target.copy(TARGET);
  camera.updateProjectionMatrix();
}

const themed = [];  // [material, colour key] re-tinted on theme switch
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial());
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
themed.push([ground.material, 'floor']);

function box(w, h, d, color, { x = 0, y = h / 2, z = 0, edges = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, transparent: true }));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  if (edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: .18 })));
  scene.add(m);
  return m;
}
function label(parent, html, y, cls = '', x = 0, z = 0) {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  el.innerHTML = html;
  const o = new CSS2DObject(el);
  o.position.set(x, y, z);
  parent.add(o);
  return el;
}
function gate(x) {  // two pillars + lintel
  const parts = [box(.8, 3, .8, C.slab, { x, z: -6.2 }), box(.8, 3, .8, C.slab, { x, z: 6.2 }), box(.9, .6, 13.2, C.slab, { x, y: 3.3 })];
  return { parts, lintel: parts[2], nameEl: label(parts[2], '', 1.2, 'deep big', 0, 8), qEl: label(parts[2], '', 1.1, 'q3', 0, 0) };
}

// static set pieces
const pad = box(5, .2, 13.5, C.slab, { x: -11.5 });
const padEl = label(pad, '', .2, '', 2.5, -6.75);
const G1 = gate(-1), G2 = gate(4.5);
const lane = box(18, .05, 1.6, C.slab, { x: -.5, z: 8.6, edges: false });
themed.push([lane.material, 'rule']);
label(lane, '<small>bypass: not this filter’s courier</small>', .2, '', -4);
const chainEl = label(scene, '', 7.5, 'chain', 1.5, -2);

// lookup cabinet: right-hand column holds one drawer per job, firstmile on top
const cabinet = box(4.4, 5, 2, C.slab, { x: -1, z: -10.5 });
label(cabinet, D.mapLabel || '<b>Postal map</b>', 3.2);
const jobDrawers = {};
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
  const d = box(1.2, .9, .5, C.slab, { x: -2.35 + c * 1.35, y: .8 + r * 1.1, z: -9.4 });
  const job = c === 2 && JOBS[3 - r];
  if (job) jobDrawers[job] = { mesh: d, home: d.position.clone(), el: label(d, '', 0, '', 1.7, -1.7) };
  else themed.push([d.material, 'rule']);
}
for (const j of JOBS) {  // a beam per drawer -> gate 1 lintel
  const d = jobDrawers[j], a = d.home.clone().add(new THREE.Vector3(0, 0, 1.6)), b = new THREE.Vector3(-1, 3.3, -3.5);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 1, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  beam.position.copy(a).add(b).multiplyScalar(.5);
  beam.scale.y = a.distanceTo(b);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  scene.add(beam);
  d.beam = beam;
  d.tokAt = d.home.clone().add(new THREE.Vector3(0, 1.1, 2.6));  // tokens hover in front of the pulled drawer
}

const DOCK = [[11, 7], [11, 1.5]];
const dockEls = DOCK.map(([x, z]) => {
  box(1, 2.4, 3.6, C.slab, { x: x + 2.8, z });
  return label(box(4.5, .2, 3.6, C.slab, { x, z }), '', 3);
});
const logSlab = box(4.5, .15, 3.6, C.slab, { x: 11, z: -5 });
themed.push([logSlab.material, 'rule']);
const logEl = label(logSlab, '', .4);

// actors: things that move between steps
const actors = [];
function actor(mesh) {
  const a = { mesh, tgt: { pos: mesh.position.clone(), color: mesh.material.color.clone(), opacity: 1, scale: 1 } };
  actors.push(a);
  return a;
}
const parcel = actor(box(1.3, 1, 1.3, C.card, { x: -26, y: .5 }));
const parcelEl = label(parcel.mesh, '', 1.3, 'big');
for (const j of JOBS) jobDrawers[j].a = actor(jobDrawers[j].mesh);

// crates (+ one lookup token each) are rebuilt per scenario: pool size differs
let crates = [], builtFor = null, prevPh = null;
function buildCrates(s) {
  for (const a of crates) for (const x of [a, a.tok].filter(Boolean)) { scene.remove(x.mesh); actors.splice(actors.indexOf(x), 1); }
  let n = 0;
  crates = layout(s).map(c => {
    const a = actor(box(s.size, s.size, s.size, c.foreign ? C.brand : C.card, { x: c.pad[0], y: s.size / 2 + .2, z: c.pad[1] }));
    a.c = c;
    a.el = label(a.mesh, '', s.size / 2 + .5);
    a.mesh.scale.setScalar(.001);
    if (!c.foreign) {  // the job this courier carries to the lookup
      const t = new THREE.Mesh(new THREE.SphereGeometry(.36, 16, 12), new THREE.MeshStandardMaterial({ color: C.brand, transparent: true }));
      t.position.set(c.queue[0], s.size + .4, c.queue[1]);
      t.scale.setScalar(.001);
      scene.add(t);
      a.tok = actor(t);
      a.tok.fan = new THREE.Vector3((n % 3 - 1) * .4, (Math.floor(n / 3) % 2) * .35, 0);  // spread so many tokens don't merge
      n++;
    }
    return a;
  });
}

// ---- state per step ----
const keys = Object.keys(D.scenarios);
let scen = keys[0], step = 0, retryTimer = null;
const set = (a, o) => {
  if (o.p) a.tgt.pos.set(...o.p);
  if (o.color) a.tgt.color.copy(o.color);
  if (o.opacity != null) a.tgt.opacity = o.opacity;
  if (o.scale != null) a.tgt.scale = o.scale;
};
const short = tn => `${tn.slice(0, 7)}&hellip;${tn.slice(-4)}`;

function apply() {
  const s = D.scenarios[scen], st = s.steps[step], P = R(st.ph), bad = !!s.zero, end = st.ph === 'end';
  if (builtFor !== scen) { buildCrates(s); builtFor = scen; prevPh = null; }
  clearInterval(retryTimer);
  scene.background = C.ground;
  for (const [m, k] of themed) m.color.copy(C[k]);

  const yG = s.size / 2, yP = s.size / 2 + .2;
  const at = (x, z) => [x, x <= -9 && Math.abs(z) <= 6.75 ? yP : yG, z];  // sit on the pad when over it
  const ans = j => (s.map[j] || [])[0];

  // which crates survive: foreign pass untouched, candidates need map[job] == their partner name
  for (const a of crates) a.kept = !bad && (a.c.foreign || ans(a.c.leg) === a.c.partner);
  const keptN = crates.filter(a => a.kept).length;
  const usedJobs = new Set(crates.filter(a => !a.c.foreign).map(a => a.c.leg));

  // parcel + pad
  set(parcel, { p: [-17, .5, 0], color: end ? (bad ? C.warn : C.keep) : C.card });
  parcelEl.className = 'lbl big' + (end ? (bad ? ' warn' : ' keep') : '');
  parcelEl.innerHTML = `<b class="mono">${short(s.tn)}</b><small>${s.route} ${s.postal}${s.payment ? ' &middot; ' + s.payment : ''}</small>`
    + (end ? `<small>${bad ? 'no courier' : `booked: ${keptN} courier${keptN === 1 ? '' : 's'}`}</small>` : '');
  padEl.style.opacity = P <= R('chain') ? 1 : 0;  // context for the opening beats only
  padEl.innerHTML = `<b>${s.shortlist[0]}</b><small>${s.pool.length} couriers${s.shortlist[1] ? ' &middot; ' + s.shortlist[1] : ''}</small>`;

  // crates + their lookup tokens
  for (const a of crates) {
    const c = a.c, g = c.group;
    let p = at(...c.pad), color = c.foreign ? C.brand : C.card, opacity = 1, cls = '', show = c.label !== false;
    let sub = g ? g.pool : `id ${c.id}`;
    if (P >= R('mine')) {
      p = at(...c.queue);
      if (c.foreign) { cls = 'deep'; sub = 'not mine &rarr; pass'; }
    }
    if (P >= R('job') && !c.foreign) sub = g ? g.job : `id ${c.id} &rarr; ${c.leg}${c.dflt ? ' (default)' : ''}`;
    if (P >= R('pick') && !c.foreign) { cls = 'deep'; sub = `&rarr; map[&lsquo;${c.leg}&rsquo;]`; }
    if (P >= R('compare')) {
      if (a.kept) {
        color = C.keep; cls = 'keep';
        p = at(...(c.foreign ? [2, 8.6] : [1.5, 0]));
        sub = c.foreign ? 'never asked &rarr; keep' : `${c.partner} == ${ans(c.leg)} &rarr; keep`;
        if (st.ph === 'gate2') { p = at(...(c.foreign ? [6, 8.6] : [6, 0])); sub = 'not its courier &rarr; pass'; }
        if (end) { const [x, z] = DOCK[c.foreign ? 0 : 1]; p = [x, yP, z]; show = false; }  // dock label speaks for it
      } else {
        color = C.lost; cls = 'lost'; opacity = .35;
        p = at(c.queue[0] - 2.5, c.queue[1]);  // pushed back, ghosted
        sub = bad ? 'order zeroed &rarr; []' : g ? g.drop : `${c.partner} &ne; ${ans(c.leg) || 'none'} &rarr; drop`;
      }
    }
    set(a, { p, color, opacity, scale: P === 0 ? .001 : 1 });
    a.el.className = 'lbl ' + cls;
    a.el.style.opacity = P === 0 || !show ? 0 : 1;
    a.el.innerHTML = `<b>${g ? g.name : c.name}</b><small>${sub}</small>`;

    if (a.tok) {  // pick: fly to the drawer of its job; compare: come back carrying the verdict
      const top = [p[0], p[1] + s.size / 2 + .4, p[2]];
      if (st.ph === 'pick') {
        if (prevPh !== 'pick') a.tok.mesh.position.set(c.queue[0], yG + s.size / 2 + .4, c.queue[1]);
        set(a.tok, { p: jobDrawers[c.leg].tokAt.clone().add(a.tok.fan).toArray(), color: C.brand, scale: 1, opacity: 1 });
      } else if (st.ph === 'compare') {
        set(a.tok, { p: top, color: a.kept ? C.keep : C.lost, scale: 1, opacity: 1 });
      } else set(a.tok, { p: top, scale: .001 });
    }
  }
  prevPh = st.ph;

  // gates
  [G1, G2].forEach((g, i) => {
    const has = i < s.gates.length;
    g.parts.forEach(m => { m.visible = has; });
    g.nameEl.style.display = g.qEl.style.display = has ? '' : 'none';
    if (!has) return;
    g.nameEl.innerHTML = `<b>${s.gates[i][0]}</b><small>${s.gates[i][1]}</small>`;
    const q = (st.q || [])[i] || '';
    g.qEl.textContent = q;
    g.qEl.style.opacity = q ? 1 : 0;
    const lit = i === 0 ? P >= R('pick') : P >= R('gate2');
    g.qEl.className = 'lbl q3' + (lit ? (bad ? ' lost' : ' keep') : ['chain', 'lookup'].includes(st.ph) ? ' deep' : '');
    g.lintel.material.color.copy(lit ? (bad ? C.lost : C.keep) : C.brand);
  });

  // chain board
  chainEl.style.opacity = st.ph === 'chain' ? 1 : 0;
  chainEl.innerHTML = '<b>Allocator chain: who runs?</b>' + (D.chain || []).map(n =>
    `<span class="${s.ran.includes(n) ? 'on' : ''}">${s.ran.includes(n) ? '&check;' : '&middot;'} ${n}</span>`).join('');

  // lookup drawers: all three out at lookup; from pick on only the jobs in play stay out
  for (const j of JOBS) {
    const d = jobDrawers[j], [name, note] = s.map[j] || [null, ''];
    const used = usedJobs.has(j) && P >= R('pick');
    const out = P >= R('lookup') && (P < R('pick') || used);
    set(d.a, { p: [d.home.x, d.home.y, d.home.z + (out ? 1.4 : 0)],
      color: used ? (name ? C.keep : C.lost) : out && name ? C.brand : C.rule });
    d.el.style.opacity = P < R('lookup') ? 0 : out ? 1 : .45;
    d.el.className = 'lbl ' + (used ? (name ? 'keep' : 'lost') : '');
    d.el.innerHTML = `<b>${j}</b> &rarr; ${name ? `<b>${name}</b>` : 'none'}${used ? `<small>${note}</small>` : P >= R('pick') ? ' &middot; not read' : ''}`;
    d.beam.material.color.copy(name ? C.keep : C.lost);
    d.beam.userData.op = used && P <= R('compare') ? .9 : 0;
  }

  // docks + log
  dockEls.forEach((el, i) => {
    el.className = 'lbl' + (end ? (bad ? ' lost' : ' keep') : '');
    el.innerHTML = `<b>${s.docks[i][0]}</b><small>${end && bad ? 'never called' : s.docks[i][1]}</small>`;
  });
  logEl.style.opacity = end ? 1 : 0;
  logEl.className = 'lbl ' + (bad ? 'lost' : 'keep');
  logEl.innerHTML = s.log;

  if (end && s.retries) {  // replay the real attempts
    let n = 0;
    retryTimer = setInterval(() => {
      parcelEl.innerHTML = `<b class="mono">${short(s.tn)}</b>` + (n < s.retries.length
        ? `<small>attempt ${n + 1}/${s.retries.length} &middot; ${s.retries[n]}</small>` : `<small>${s.retryEnd || 'stopped'}</small>`);
      if (++n > s.retries.length) clearInterval(retryTimer);
    }, 650);
  }

  // sidebar
  ui.querySelector('.step').innerHTML = `<p class="eyebrow">Step ${step + 1} of ${s.steps.length}</p><h2>${st.t}</h2>${st.b}`;
  ui.querySelector('.dots').replaceChildren(...s.steps.map((_, i) => {
    const d = document.createElement('i');
    d.className = i === step ? 'on' : '';
    d.onclick = () => { stop(); go(i); };
    return d;
  }));
  ui.querySelectorAll('.scen button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === scen));
  if (D.sql) ui.querySelector('.sql').textContent = D.sql(s.tn);
  history.replaceState(null, '', `#s=${scen}&step=${step + 1}`);
}

// ---- controls ----
let playing = null;
const last = () => D.scenarios[scen].steps.length - 1;
const playBtn = ui.querySelector('.play');
function go(i) { step = Math.max(0, Math.min(last(), i)); apply(); }
function stop() { clearInterval(playing); playing = null; playBtn.innerHTML = '&#9654;'; }
ui.querySelector('.prev').onclick = () => { stop(); go(step - 1); };
ui.querySelector('.next').onclick = () => { stop(); go(step + 1); };
playBtn.onclick = () => {
  if (playing) return stop();
  if (step === last()) go(0);
  playBtn.innerHTML = '&#10074;&#10074;';
  playing = setInterval(() => step === last() ? stop() : go(step + 1), 4500);
};
ui.querySelectorAll('.scen button').forEach(b => b.onclick = () => {
  stop();
  const ph = D.scenarios[scen].steps[step].ph;  // keep the same beat when switching story
  scen = b.dataset.s;
  const i = D.scenarios[scen].steps.findIndex(x => x.ph === ph);
  go(i < 0 ? step : i);
});
document.querySelectorAll('.theme-toggle button').forEach(b => b.onclick = () => { setTheme(b.dataset.theme); readColors(); apply(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); apply(); });
addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') { stop(); go(step + 1); }
  if (e.key === 'ArrowLeft') { stop(); go(step - 1); }
});
stage.querySelector('.reset').onclick = e => { e.preventDefault(); resetView(); };

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight, asp = w / h;
  const H = Math.max(20, 34 / asp);  // keep ~34 world units visible horizontally
  Object.assign(camera, { left: -H * asp / 2, right: H * asp / 2, top: H / 2, bottom: -H / 2, near: -200, far: 400 });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelR.setSize(w, h);
}
addEventListener('resize', resize);

// ---- loop: ease every actor toward its target ----
const clock = new THREE.Clock();
function tick() {
  const k = 1 - Math.exp(-clock.getDelta() * 5);
  for (const a of actors) {
    a.mesh.position.lerp(a.tgt.pos, k);
    a.mesh.material.color.lerp(a.tgt.color, k);
    a.mesh.material.opacity += (a.tgt.opacity - a.mesh.material.opacity) * k;
    const edges = a.mesh.children[0];
    if (edges?.isLineSegments) edges.material.opacity = .18 * a.mesh.material.opacity;
    a.mesh.scale.setScalar(a.mesh.scale.x + (a.tgt.scale - a.mesh.scale.x) * k);
  }
  for (const j of JOBS) { const b = jobDrawers[j].beam; b.material.opacity += ((b.userData.op || 0) - b.material.opacity) * k; }
  controls.update();
  renderer.render(scene, camera);
  labelR.render(scene, camera);
  requestAnimationFrame(tick);
}

// deep link for demos: #s=<scenario>&step=<n>; also followed when an in-page link changes the hash
function fromHash() {
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('s') in D.scenarios) scen = hp.get('s');
  if (hp.has('step')) step = Math.max(0, Math.min(last(), +hp.get('step') - 1));
}
addEventListener('hashchange', () => { stop(); fromHash(); apply(); });
fromHash();
readColors(); resetView(); resize(); apply(); tick();
