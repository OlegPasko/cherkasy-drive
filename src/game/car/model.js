// Procedural flying Cybertruck-style pickup (the player's car). buildCarModel() -> { object, body, set(state, dt), eye, interior, driver, materials }
// Car space: +z forward (nose), +x = LEFT side (driver sits at +x, left-hand drive), +y up, y 0 = ground contact.
// Shape after the Tesla Cybertruck (5.6 m, 3.6 m wheelbase, 1.8 m tall): one straight line from the nose over the hood
// and the huge windshield up to the roof peak, then the "sail" straight down to the tailgate; flat unpainted stainless
// panels, dark glass, full-width light bars front and rear, an Everlabs number plate low on the tailgate, trapezoid
// wheel arches with black cladding, aero wheel covers. Built only from closed solids (no view sees into the body): two side slabs extruded from the side profile
// (arches cut in, wheels sit in the notches), a centre slab between the wheels (nose, hood, cabin tub, bed / sail), a
// roof plate, A-beams, glass. Wheels hang off the body group so they pitch / roll with it.
// Interior after the real one: long flat dash with a vent line and an ambient light strip, 18.5" landscape centre screen
// (speed, PRND, flight kit, altitude: canvas), squircle wheel, bolstered seats, door cards with armrests and speakers,
// carpet, headliner, trimmed sills and A-pillars (no bare steel seen from the seat), rear-view mirror, one giant wiper.
// A driver sits at the wheel: hoodie, jeans, sunglasses, hands on the rim (two-bone arms follow the wheel, then slip
// on the rim past ~45 deg); from the cockpit the driver's head is hidden. A small windshield HUD (speed / altitude) is kept for
// flying. The glass is dark and mirror-like from outside and almost clear from the seat (state.cockpit).
// Flight kit (hidden while stowed): two swept wings that swing out from under the sills and telescope, two ducted-fan
// turbines that slide out of the bed sides and rotate from vertical (stowed) to horizontal (thrust aft), with spinning
// fans and additive exhaust flames (length from state.thrust).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { logoTexture } from '../../kit/logo.js';

const { clamp, lerp } = THREE.MathUtils;
const smooth = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); }; // smoothstep 0..1

export const DIM = { len: 5.68, wid: 2.03, wb: 3.6, track: 1.72, wheelR: 0.43, wheelZ: 1.8, wheelX: 0.86, height: 1.8 };
const EYE = new THREE.Vector3(0.42, 1.57, -0.18);

// a canvas of w x h painted once by paint(ctx2d) -> sRGB CanvasTexture
function paintedTexture(w, h, paint, flip = true) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  paint(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = flip;
  return tex;
}
// vertical colour ramp (flame cones): stops [[t, css], ...] from v = 0 down to v = 1
const gradTex = (stops) => paintedTexture(4, 64, (g, w, h) => {
  const ramp = g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([t, css]) => ramp.addColorStop(t, css));
  g.fillStyle = ramp; g.fillRect(0, 0, w, h);
}, false);
// soft round glow sprite for the nozzles
const radialTex = () => paintedTexture(64, 64, (g) => {
  const ramp = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(160,210,255,0.5)'], [1, 'rgba(60,120,255,0)']].forEach(([t, css]) => ramp.addColorStop(t, css));
  g.fillStyle = ramp; g.fillRect(0, 0, 64, 64);
});

// ---------------------------------------------------------------- centre screen (Tesla-style UI, canvas)
// a canvas redrawn at run time: { g (2d context), tex }
function liveCanvas(w, h) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { g: cv.getContext('2d'), tex };
}

function makeScreen() {
  const { g, tex } = liveCanvas(1024, 640);
  tex.anisotropy = 4;
  const F = (w, px) => `${w} ${px}px "Helvetica Neue", Arial, sans-serif`;
  function draw(st) {
    // left card: PRND, speed, car
    g.fillStyle = '#0d0f12'; g.fillRect(0, 0, 1024, 640);
    g.fillStyle = '#16191e'; g.fillRect(0, 0, 360, 640);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const gear = st.gear;
    ['P', 'R', 'N', 'D'].forEach((k, i) => { g.font = F(k === gear ? 700 : 500, 34); g.fillStyle = k === gear ? '#ffffff' : '#5b6370'; g.fillText(k, 105 + i * 50, 58); });
    g.font = F(300, 150); g.fillStyle = '#f2f4f7'; g.fillText(Math.round(Math.abs(st.speed) * 3.6), 180, 190);
    g.font = F(500, 30); g.fillStyle = '#8b94a3'; g.fillText('КМ/ГОД', 180, 280);
    // top view with the kit
    g.save(); g.translate(180, 470);
    const w = st.wing;
    g.fillStyle = 'rgba(62,160,255,0.28)'; g.strokeStyle = '#3ea0ff'; g.lineWidth = 3;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 34, -20); g.lineTo(s * (34 + 100 * w), 12 + 14 * w); g.lineTo(s * (34 + 100 * w), 30 + 14 * w); g.lineTo(s * 34, 40); g.closePath(); if (w > 0.02) { g.fill(); g.stroke(); } }
    g.fillStyle = '#c9cdd2'; g.beginPath(); g.moveTo(-36, -110); g.lineTo(36, -110); g.lineTo(38, 110); g.lineTo(-38, 110); g.closePath(); g.fill();
    g.fillStyle = '#2a2f36'; g.fillRect(-30, -60, 60, 70);
    for (const s of [-1, 1]) { g.fillStyle = st.jet > 0.2 ? '#ff8a3a' : '#4a5260'; if (st.turb > 0.02) { g.beginPath(); g.roundRect(s * (40 + 18 * st.turb) - 10, 60, 20, 36, 7); g.fill(); } }
    g.restore();
    // right: status panel
    g.textAlign = 'left';
    g.font = F(600, 30); g.fillStyle = '#e8ebef'; g.fillText(st.air ? 'Режим польоту' : st.wing > 0.05 ? 'Крила розгортаються' : 'Режим їзди', 410, 70);
    g.font = F(400, 22); g.fillStyle = '#8b94a3'; g.fillText(st.air ? 'Стрілки: тангаж · A / D: крен · Shift: тяга' : 'Тримай Shift: крила + тяга, зліт на 150 км/год', 410, 108);
    const bar = (y, label, v, max, col, txt) => {
      g.font = F(500, 22); g.fillStyle = '#8b94a3'; g.fillText(label, 410, y);
      g.fillStyle = '#23272e'; g.fillRect(560, y - 10, 400, 20); g.fillStyle = col; g.fillRect(560, y - 10, 400 * clamp(v / max, 0, 1), 20);
      g.fillStyle = '#e8ebef'; g.textAlign = 'right'; g.fillText(txt, 960, y - 30); g.textAlign = 'left';
    };
    bar(200, 'Потужність', st.power, 1, '#3ea0ff', Math.round(st.power * 630) + ' кВт');
    bar(290, 'Крила', st.wing, 1, st.wing > 0.98 ? '#3ea0ff' : '#e0b040', st.wing > 0.98 ? 'Зафіксовані' : st.wing > 0.02 ? 'Рухаються' : 'Складені');
    bar(380, 'Тяга', st.jet, 1, '#ff8a3a', Math.round(st.jet * 100) + ' %');
    bar(470, 'Висота', st.air ? st.alt : 0, 400, '#7fd88a', st.air ? Math.round(st.alt) + ' м' : '—');
    if (st.air) { g.font = F(600, 26); g.fillStyle = st.vy >= 0 ? '#7fd88a' : '#ffb35a'; g.fillText((st.vy >= 0 ? '▲ ' : '▼ ') + Math.abs(st.vy).toFixed(1) + ' м/с', 410, 560); }
    else if (st.handbrake) { g.font = F(600, 26); g.fillStyle = '#ff5050'; g.fillText('(P) Ручник', 410, 560); }
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

function makeHud() {
  const { g, tex } = liveCanvas(320, 128);
  function draw(st) {
    g.clearRect(0, 0, 320, 128);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = st.air ? '#7fd8ff' : '#8dffc0';
    g.shadowColor = g.fillStyle; g.shadowBlur = 6;
    g.font = '700 64px "Arial Narrow", Arial, sans-serif'; g.fillText(Math.round(Math.abs(st.speed) * 3.6), 150, 52);
    g.font = '700 22px "Arial Narrow", Arial, sans-serif';
    g.fillText(st.air ? `ВИС ${Math.round(st.alt)} м  ${st.vy >= 0 ? '▲' : '▼'}${Math.abs(st.vy).toFixed(0)}` : `км/год · ${st.gear}${st.wing > 0.05 ? ' · КРИЛА' : ''}`, 160, 106);
    if (!st.air) { g.font = '700 30px "Arial Narrow", Arial, sans-serif'; g.fillText(st.gear, 272, 52); }
    tex.needsUpdate = true;
  }
  return { tex, draw };
}


// ---------------------------------------------------------------- body profiles (side view: [z, y])
const YB = 0.45;                                  // body bottom (air suspension, road height)
const NOSE = [2.84, 1.05], PEAK = [-0.25, 1.8], TAIL = [-2.84, 1.2];
const HOOD = z => NOSE[1] + (NOSE[0] - z) * (PEAK[1] - NOSE[1]) / (NOSE[0] - PEAK[0]);   // nose -> windshield -> peak
const SAIL = z => PEAK[1] - (PEAK[0] - z) * (PEAK[1] - TAIL[1]) / (PEAK[0] - TAIL[0]);    // peak -> tailgate
const BELT = 1.28, CZ = -0.95;                    // beltline, C-pillar z
const ZB = NOSE[0] - (BELT - NOSE[1]) * (NOSE[0] - PEAK[0]) / (PEAK[1] - NOSE[1]); // where the hood line meets the belt
const WS0 = ZB;                                   // the windshield starts right there (long glass, deep dash)
function arch(zc, out) { out.push([zc - 0.64, YB], [zc - 0.47, 0.96], [zc + 0.47, 0.96], [zc + 0.64, YB]); return out; }
function sideProfile() {
  const P = [[TAIL[0] + 0.02, 0.56], [TAIL[0] + 0.1, YB]];
  arch(-DIM.wheelZ, P); arch(DIM.wheelZ, P);
  P.push([NOSE[0] - 0.2, YB], [NOSE[0] + 0.02, 0.78], [NOSE[0], NOSE[1]], [ZB, BELT], [CZ, BELT], [CZ, SAIL(CZ)], [TAIL[0], TAIL[1]]);
  return P;
}
function centreProfile() { // nose, hood up to the windshield base, cabin tub (floor 0.72), back wall, bed under the sail
  return [[TAIL[0] + 0.02, 0.56], [TAIL[0] + 0.1, YB], [NOSE[0] - 0.2, YB], [NOSE[0] + 0.02, 0.78], [NOSE[0], NOSE[1]], [WS0, HOOD(WS0)], [WS0, 0.72],
    [-1.0, 0.72], [-1.0, SAIL(-1.0)], [TAIL[0], TAIL[1]]];
}
function extrudeX(P, x0, x1) {
  const sh = new THREE.Shape(P.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 });
  g.rotateY(-Math.PI / 2); g.translate(x1, 0, 0); return g;
}
function sidePlane(P, x) { const g = new THREE.ShapeGeometry(new THREE.Shape(P.map(([z, y]) => new THREE.Vector2(z, y)))); g.rotateY(-Math.PI / 2); g.translate(x, 0, 0); return g; }
// squircle ring (|x/a|^4 + |y/b|^4 = 1) as a closed tube
function squircle(a, b, r) {
  const pts = []; for (let i = 0; i < 48; i++) { const t = i / 48 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); pts.push(new THREE.Vector3(a * Math.sign(c) * Math.abs(c) ** 0.5, b * Math.sign(s) * Math.abs(s) ** 0.5, 0)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, r, 8, true);
}

// A mirrored part (negative determinant) is drawn with the front face flipped by the renderer; once baked into a
// plain frame its triangles must be wound the other way round to keep the same faces (and gl_FrontFacing) in front.
function flipWinding(g) {
  for (const a of Object.values(g.attributes)) {
    const n = a.itemSize, v = a.array;
    for (let t = 0; t < a.count; t += 3) for (let k = 0; k < n; k++) { const i = (t + 1) * n + k, j = i + n, x = v[i]; v[i] = v[j]; v[j] = x; }
  }
}
// Merge the meshes under root into one mesh per draw state – material (the same instance, set() edits some), castShadow,
// receiveShadow, renderOrder – in root's frame: fewer draw calls in every pass (main, shadow cascades, reflection).
// Kept as they are: subtrees flagged userData.live (moved, spun or toggled at run time: bake those on their own),
// meshes flagged userData.solo (the glass panes, sorted back to front one by one) and draw states with a single mesh.
// opts.receiveShadow overrides the flag on the result (the cabin has always been lit without the roof's shadow).
function bakeStatic(root, opts = {}) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), bins = new Map(), rel = new THREE.Matrix4();
  (function walk(o) {
    for (const c of o.children) {
      if (c.userData.live) continue;
      if (!c.isMesh) { walk(c); continue; }
      if (c.userData.solo) continue;
      const recv = opts.receiveShadow ?? c.receiveShadow, key = `${c.material.uuid}|${c.castShadow}|${recv}|${c.renderOrder}`;
      (bins.get(key) ?? bins.set(key, []).get(key)).push(c);
    }
  })(root);
  for (const list of bins.values()) {
    const [c0] = list;
    if (list.length === 1) { if (opts.receiveShadow !== undefined) c0.receiveShadow = opts.receiveShadow; continue; }
    const gs = list.map((c) => {
      rel.multiplyMatrices(inv, c.matrixWorld);
      const g = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone()).applyMatrix4(rel);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.clearGroups(); if (rel.determinant() < 0) flipWinding(g);
      c.removeFromParent(); return g;
    });
    const m = new THREE.Mesh(mergeGeometries(gs), c0.material);
    m.castShadow = c0.castShadow; m.receiveShadow = opts.receiveShadow ?? c0.receiveShadow; m.renderOrder = c0.renderOrder; m.frustumCulled = false;
    root.add(m); gs.forEach((g) => g.dispose());
  }
}

// ---------------------------------------------------------------- build
export function buildCarModel({ accent = 0xf2c230 } = {}) {
  const root = new THREE.Group(); root.name = 'PlayerCar';
  const body = new THREE.Group(); root.add(body);
  const M = {
    paint: new THREE.MeshStandardMaterial({ name: 'CarSteel', color: 0xbfc3c7, metalness: 0.9, roughness: 0.3 }), // unpainted stainless
    accent: new THREE.MeshPhysicalMaterial({ name: 'CarAccent', color: accent, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
    black: new THREE.MeshStandardMaterial({ name: 'CarBlack', color: 0x141517, metalness: 0.2, roughness: 0.7 }),
    plastic: new THREE.MeshStandardMaterial({ name: 'CarPlastic', color: 0x1b1c1f, roughness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'CarGlass', color: 0x020305, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.86, envMapIntensity: 0.55, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 }),
    tire: new THREE.MeshStandardMaterial({ name: 'CarTire', color: 0x141415, roughness: 0.95 }),
    rim: new THREE.MeshStandardMaterial({ name: 'CarRim', color: 0x8d9197, metalness: 0.6, roughness: 0.4 }),
    interior: new THREE.MeshStandardMaterial({ name: 'CarInterior', color: 0x232427, roughness: 0.75 }),
    trimLight: new THREE.MeshStandardMaterial({ name: 'CarTrimLight', color: 0x5a5d62, roughness: 0.5, metalness: 0.4 }),
    leather: new THREE.MeshStandardMaterial({ name: 'CarSeat', color: 0x1e1f22, roughness: 0.6 }),
    head: new THREE.MeshStandardMaterial({ name: 'CarHead', color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 2.2 }),
    tail: new THREE.MeshStandardMaterial({ name: 'CarTail', color: 0x400000, emissive: 0xff1010, emissiveIntensity: 1.2 }),
    ambient: new THREE.MeshBasicMaterial({ name: 'CarAmbient', color: new THREE.Color(0.55, 0.75, 1.3), toneMapped: false }),
    dashTop: new THREE.MeshStandardMaterial({ name: 'CarDashTop', color: 0x2f3034, roughness: 0.9 }),
    headliner: new THREE.MeshStandardMaterial({ name: 'CarHeadliner', color: 0x2a2b2e, roughness: 0.95 }),
    carpet: new THREE.MeshStandardMaterial({ name: 'CarCarpet', color: 0x121315, roughness: 1 }),
    mirror: new THREE.MeshStandardMaterial({ name: 'CarMirror', color: 0x9aa3ad, metalness: 1, roughness: 0.08 }),
    skin: new THREE.MeshStandardMaterial({ name: 'DriverSkin', color: 0xc28a68, roughness: 0.7 }),
    hoodie: new THREE.MeshStandardMaterial({ name: 'DriverHoodie', color: 0x2c3038, roughness: 0.9 }),
    jeans: new THREE.MeshStandardMaterial({ name: 'DriverJeans', color: 0x2d3d5c, roughness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ name: 'DriverHair', color: 0x2b1e15, roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ name: 'CarMetal', color: 0x6a7078, metalness: 0.85, roughness: 0.35 }),
    fan: new THREE.MeshStandardMaterial({ name: 'CarFan', color: 0x8e949c, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ name: 'CarGlow', color: new THREE.Color(0.5, 1.3, 2.6), toneMapped: false }),
  };
  M.paintW = M.paint.clone(); M.paintW.side = THREE.DoubleSide;
  const add = (geo, mat, parent = body, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, x, y, z, mat, parent = body, shadow = true) => { const m = add(new THREE.BoxGeometry(w, h, d), mat, parent, shadow); m.position.set(x, y, z); return m; };
  const beam = (p0, p1, w, d, mat, parent = body) => {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), L = a.distanceTo(b);
    const m = add(new THREE.BoxGeometry(w, L, d), mat, parent); m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return m;
  };
  const slope = Math.atan2(PEAK[1] - NOSE[1], NOSE[0] - PEAK[0]); // windshield / hood line rake

  // ---- shell
  const SX0 = 0.68, SX1 = 1.0;
  for (const s of [1, -1]) add(extrudeX(sideProfile(), s > 0 ? SX0 : -SX1, s > 0 ? SX1 : -SX0), M.paint);
  add(extrudeX(centreProfile(), -SX0, SX0), M.paint);
  // roof plate: peak -> C pillar (over the rear seats), full width
  add(extrudeX([[PEAK[0], PEAK[1]], [-1.0, SAIL(-1.0)], [-1.0, SAIL(-1.0) - 0.06], [PEAK[0], PEAK[1] - 0.06]], -SX1, SX1), M.paint); // one material: a [paint] array would leave the extrude side walls (top / bottom) unrendered
  // A-beams along the windshield line (x 0.84..1.0), from where the hood line meets the belt up to the peak
  for (const s of [1, -1]) beam([s * 0.94, BELT - 0.01, ZB], [s * 0.94, PEAK[1] - 0.03, PEAK[0]], 0.12, 0.04, M.paint);
  // glass: windshield (base -> peak), side DLO triangles, rear slider window in the back wall
  {
    const L = Math.hypot(WS0 - PEAK[0], PEAK[1] - HOOD(WS0));
    const m = add(new THREE.PlaneGeometry(1.78, L), M.glass, body, false);
    m.position.set(0, (HOOD(WS0) + PEAK[1]) / 2 + 0.005, (WS0 + PEAK[0]) / 2); m.rotation.x = -(Math.PI / 2 - slope); m.renderOrder = 2; m.userData.solo = true;
  }
  for (const s of [1, -1]) { const m = add(sidePlane([[ZB - 0.02, BELT + 0.005], [CZ, BELT + 0.005], [CZ, SAIL(CZ) - 0.005], [PEAK[0], PEAK[1] - 0.03]], s * 0.99), M.glass, body, false); m.renderOrder = 2; m.userData.solo = true; }
  // light bars: front across the nose edge, rear across the tailgate top; black lower cladding
  box(1.96, 0.028, 0.03, 0, NOSE[1] - 0.01, NOSE[0] + 0.005, M.head, body, false);
  box(1.96, 0.04, 0.03, 0, TAIL[1] - 0.04, TAIL[0] - 0.01, M.tail, body, false);
  box(2.0, 0.2, 0.08, 0, 0.56, NOSE[0] - 0.17, M.plastic);
  box(2.0, 0.2, 0.08, 0, 0.56, TAIL[0] + 0.08, M.plastic);
  { // number plate carrying the Everlabs logo, low on the tailgate just above the black cladding
    const tex = logoTexture('everlabs', { width: 1024, color: '#15161a', plate: { bg: '#f2f3ef', edge: '#202226' } }), w = 0.56, h = w * tex.userData.aspect, y = 0.57 + h / 2;
    const m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ name: 'CarPlate', map: tex, roughness: 0.4, metalness: 0.1 }), body, false);
    m.position.set(0, y, TAIL[0] + 0.02 - (y - 0.56) / (TAIL[1] - 0.56) * 0.02 - 0.008); m.rotation.y = Math.PI;
  }

  for (const s of [1, -1]) {
    box(0.03, 0.14, DIM.wb - 1.3, s * 1.005, 0.52, 0, M.plastic);                    // rocker cladding between the arches
    for (const zc of [DIM.wheelZ, -DIM.wheelZ]) {                                       // trapezoid arch cladding
      const P = [[zc - 0.78, YB], [zc - 0.56, 1.06], [zc + 0.56, 1.06], [zc + 0.78, YB], [zc + 0.64, YB], [zc + 0.47, 0.96], [zc - 0.47, 0.96], [zc - 0.64, YB]];
      add(extrudeX(P, s > 0 ? SX1 : -SX1 - 0.035, s > 0 ? SX1 + 0.035 : -SX1), M.plastic);
    }
    // panel gaps (doors), door handles are flush on the real truck
    box(0.006, BELT - 0.5, 0.012, s * 1.002, (BELT + 0.5) / 2 + 0.02, 1.12, M.black, body, false);
    box(0.006, BELT - 0.5, 0.012, s * 1.002, (BELT + 0.5) / 2 + 0.02, -0.02, M.black, body, false);
    box(0.006, 0.012, 2.1, s * 1.002, 0.72, 0.05, M.black, body, false);
    // camera "mirrors" (small stalks)
    const mr = new THREE.Group(); mr.position.set(s * 1.0, BELT + 0.1, ZB - 0.25); body.add(mr);
    box(0.12, 0.03, 0.05, s * 0.06, 0, 0, M.black, mr); box(0.05, 0.12, 0.16, s * 0.14, 0.02, 0, M.black, mr);
  }
  // giant single wiper resting at the windshield base
  { const w = box(1.45, 0.02, 0.03, 0.05, HOOD(WS0) + 0.03, WS0 - 0.04, M.black, body, false); w.rotation.x = slope; }
  // sail seams (vault cover slats)
  for (let i = 1; i < 4; i++) { const z = -1.0 - i * 0.45; box(1.98, 0.006, 0.012, 0, SAIL(z) + 0.004, z, M.black, body, false); }

  // ---- wheels: tyre + sidewalls + lugs, flat aero cover
  const R = DIM.wheelR, TW = 0.3;
  const tire = new THREE.CylinderGeometry(R - 0.012, R - 0.012, TW, 32); tire.rotateZ(Math.PI / 2);
  const side = new THREE.TorusGeometry(R - 0.07, 0.065, 8, 32); side.rotateY(Math.PI / 2);
  const lug = new THREE.BoxGeometry(TW * 0.4, 0.028, 0.09);
  const cover = new THREE.CylinderGeometry(0.29, 0.29, 0.03, 6); cover.rotateZ(Math.PI / 2); // hexagonal-ish aero cover
  const coverRing = new THREE.CylinderGeometry(0.2, 0.2, 0.035, 24); coverRing.rotateZ(Math.PI / 2);
  const slot = new THREE.BoxGeometry(0.036, 0.16, 0.035); slot.translate(0, 0.19, 0);
  function makeWheel(parent, sx, x = 0) { // one wheel centred at x on its spin group
    const hub = new THREE.Group(); hub.position.x = x; parent.add(hub);
    add(tire, M.tire, hub);
    for (const k of [1, -1]) { const w = add(side, M.tire, hub, false); w.position.x = k * (TW / 2 - 0.03); }
    for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2, l = add(lug, M.tire, hub, false); l.position.set((k % 2 ? 1 : -1) * TW * 0.22, Math.cos(a) * (R - 0.004), Math.sin(a) * (R - 0.004)); l.rotation.x = -a; }
    const o = sx * (TW / 2 - 0.02);
    add(cover, M.rim, hub).position.x = o;
    add(coverRing, M.black, hub, false).position.x = o + sx * 0.004;
    for (let k = 0; k < 6; k++) { const sl = add(slot, M.black, hub, false); sl.rotation.x = k / 6 * Math.PI * 2 + Math.PI / 6; sl.position.x = o + sx * 0.003; }
  }
  // each front wheel steers on its own pivot; the rear pair turns about one shared axle line, so it spins as one group.
  // Every spin group is then baked into a few meshes (tyre, rim, black: 33 parts per wheel -> 4 draws)
  const wheels = [[1, DIM.wheelX], [-1, -DIM.wheelX], [null, 0]].map(([sx, x]) => {
    const piv = new THREE.Group(); piv.position.set(x, R, sx ? DIM.wheelZ : -DIM.wheelZ); piv.userData.live = true; body.add(piv);
    const spin = new THREE.Group(); piv.add(spin);
    if (sx) makeWheel(spin, sx); else for (const s of [1, -1]) makeWheel(spin, s, s * DIM.wheelX);
    bakeStatic(spin);
    return { piv, spin, front: !!sx };
  });

  // ---- interior: trim over the steel, dash, screen, seats, doors, wheel, driver
  const interior = new THREE.Group(); body.add(interior);
  const screen = makeScreen(), hud = makeHud();
  const ib = (w, h, d, x, y, z, mat, parent = interior) => box(w, h, d, x, y, z, mat, parent, false);
  const limb = (p0, p1, r, mat, parent = interior) => { // capsule from p0 to p1
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), m = add(new THREE.CapsuleGeometry(r, Math.max(0.001, a.distanceTo(b)), 4, 10), mat, parent, false);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return m;
  };
  let wheelBase, wheelGrp;
  {
    // trim: carpet, back wall, headliner under the roof plate, sill caps and A-pillar covers (the steel stays outside)
    ib(1.34, 0.02, 2.87, 0, 0.73, 0.435, M.carpet);
    ib(1.34, SAIL(-1.0) - 0.74, 0.02, 0, (SAIL(-1.0) + 0.74) / 2, -0.985, M.headliner);
    add(extrudeX([[PEAK[0] + 0.02, PEAK[1] - 0.062], [-1.0, SAIL(-1.0) - 0.062], [-1.0, SAIL(-1.0) - 0.08], [PEAK[0] + 0.02, PEAK[1] - 0.08]], -0.98, 0.98), M.headliner, interior, false);
    for (const s of [1, -1]) {
      ib(0.32, 0.024, ZB - CZ - 0.04, s * 0.83, BELT + 0.012, (ZB + CZ) / 2, M.interior);
      beam([s * 0.93, BELT - 0.02, ZB - 0.02], [s * 0.93, PEAK[1] - 0.06, PEAK[0] - 0.02], 0.13, 0.02, M.headliner, interior).castShadow = false;
    }
    // the long, deep, flat dash: textile top, vent line, face, ambient strip
    ib(1.34, 0.05, 1.08, 0, 1.22, 1.33, M.dashTop);
    ib(1.3, 0.014, 0.03, 0, 1.24, 0.815, M.black);
    ib(1.34, 0.4, 0.2, 0, 1.0, 0.89, M.plastic);
    ib(1.3, 0.012, 0.01, 0, 1.16, 0.786, M.ambient);
    ib(0.3, 0.3, 1.5, 0, 0.87, 0.0, M.interior);              // console
    ib(0.28, 0.02, 0.5, 0, 1.03, 0.25, M.trimLight);          // console top (charging pads)
    ib(0.26, 0.012, 0.3, 0, 1.025, -0.45, M.leather);         // armrest lid
    for (const s of [1, -1]) {
      // door cards: panel, metal strip, armrest, pull, speaker
      ib(0.04, 0.5, 2.2, s * 0.66, 1.03, 0.1, M.interior);
      ib(0.03, 0.02, 1.6, s * 0.64, 1.2, 0.15, M.trimLight);
      ib(0.07, 0.04, 0.55, s * 0.62, 1.07, -0.05, M.leather);
      ib(0.02, 0.03, 0.14, s * 0.635, 1.14, 0.3, M.black);
      { const g = new THREE.CylinderGeometry(0.075, 0.075, 0.012, 16); g.rotateZ(Math.PI / 2); add(g, M.black, interior, false).position.set(s * 0.638, 0.88, 0.62); }
      // seats: cushion with bolsters, reclined back with side wings, headrest (rear bench shorter)
      for (const rear of [false, true]) {
        const seat = new THREE.Group(); seat.position.set(s * (rear ? 0.38 : 0.42), 0, rear ? -0.72 : -0.2); interior.add(seat);
        const d = rear ? 0.42 : 0.5;
        ib(0.5, 0.1, d, 0, 0.87, 0.05, M.leather, seat);
        for (const k of [1, -1]) ib(0.07, 0.07, d - 0.04, k * 0.23, 0.94, 0.05, M.leather, seat);
        const back = new THREE.Group(); back.position.set(0, 0.92, rear ? -0.17 : -0.2); back.rotation.x = rear ? -0.12 : -0.15; seat.add(back);
        ib(0.5, rear ? 0.46 : 0.56, 0.1, 0, rear ? 0.23 : 0.28, 0, M.leather, back);
        if (!rear) for (const k of [1, -1]) ib(0.07, 0.44, 0.15, k * 0.23, 0.27, 0.03, M.leather, back);
        ib(0.27, rear ? 0.12 : 0.14, 0.09, 0, rear ? 0.52 : 0.63, -0.01, M.leather, back); // headrests clear the roof
      }
    }
    // 18.5" landscape screen on a short stalk, turned a little toward the driver
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.41, 0.256), new THREE.MeshBasicMaterial({ map: screen.tex, color: new THREE.Color(1.5, 1.5, 1.5) }));
    const sg = new THREE.Group(); sg.userData.live = true; sg.position.set(0.02, 1.38, 0.86); sg.rotation.set(0.22, Math.PI - 0.12, 0); interior.add(sg); sg.add(sc);
    box(0.43, 0.276, 0.02, 0, 0, -0.012, M.black, sg, false); // bezel behind the glass (the group faces the driver)
    ib(0.06, 0.14, 0.06, 0.02, 1.27, 0.9, M.black);
    // rear-view mirror high on the glass: housing + mirror face toward the cabin
    ib(0.02, 0.05, 0.02, 0.05, 1.65, 0.36, M.black);
    ib(0.2, 0.055, 0.025, 0.05, 1.6, 0.36, M.black);
    ib(0.186, 0.044, 0.004, 0.05, 1.6, 0.346, M.mirror);
    const hudM = new THREE.MeshBasicMaterial({ map: hud.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.2, 1.2, 1.2) });
    const hp = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.104), hudM); hp.position.set(0.42, 1.52, 0.82); hp.rotation.set(-0.3, Math.PI, 0); hp.renderOrder = 12; hp.userData.live = true; interior.add(hp);
    // squircle wheel: wheelBase is the tilted column end, wheelGrp turns in it
    wheelBase = new THREE.Group(); wheelBase.userData.live = true; wheelBase.position.set(0.42, 1.25, 0.24); wheelBase.rotation.x = 0.3; interior.add(wheelBase); // faces the chest, top forward
    wheelGrp = new THREE.Group(); wheelBase.add(wheelGrp);
    add(squircle(0.175, 0.15, 0.026), M.leather, wheelGrp, false);
    for (const k of [1, -1]) { const sp = add(new THREE.BoxGeometry(0.12, 0.04, 0.025), M.black, wheelGrp, false); sp.position.set(k * 0.1, -0.01, 0.005); sp.rotation.z = -k * 0.12; }
    { const g = new THREE.CylinderGeometry(0.062, 0.062, 0.05, 20); g.rotateX(Math.PI / 2); add(g, M.plastic, wheelGrp, false).position.z = -0.01; }
    { const g = new THREE.TorusGeometry(0.062, 0.006, 6, 24); add(g, M.trimLight, wheelGrp, false).position.z = -0.036; }
    for (const k of [1, -1]) ib(0.03, 0.012, 0.01, k * 0.12, 0.028, -0.02, M.trimLight, wheelGrp); // scroll wheels
    limb([0.42, 1.24, 0.28], [0.42, 1.07, 0.84], 0.04, M.plastic);  // column into the dash
  }

  // ---- driver: static body and legs, arms re-solved every frame toward the hands on the rim
  const driver = new THREE.Group(); interior.add(driver);
  const head = new THREE.Group(); head.userData.live = true; head.position.set(0.42, 1.55, -0.27); driver.add(head);
  const L1 = 0.3, L2 = 0.28;                                            // upper arm, forearm
  const shoulders = [new THREE.Vector3(0.61, 1.37, -0.3), new THREE.Vector3(0.23, 1.37, -0.3)]; // left (+x), right
  const arms = [];
  {
    limb([0.42, 1.0, -0.31], [0.42, 1.33, -0.32], 0.13, M.hoodie, driver).scale.set(1.3, 1, 0.8);   // torso
    limb([0.26, 1.37, -0.31], [0.58, 1.37, -0.31], 0.07, M.hoodie, driver);                          // shoulder line
    limb([0.34, 0.99, -0.27], [0.5, 0.99, -0.27], 0.1, M.jeans, driver);                             // hips
    { const hood = add(new THREE.TorusGeometry(0.085, 0.035, 6, 14), M.hoodie, driver, false); hood.position.set(0.42, 1.43, -0.36); hood.rotation.x = Math.PI / 2 - 0.5; }
    limb([0.42, 1.4, -0.29], [0.42, 1.48, -0.28], 0.045, M.skin, driver);                            // neck
    const skull = add(new THREE.SphereGeometry(0.1, 14, 10), M.skin, head, false); skull.scale.set(0.92, 1.12, 1);
    const hair = add(new THREE.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), M.hair, head, false); hair.position.set(0, 0.022, -0.012); hair.scale.set(0.93, 1.1, 1.02);
    ib(0.15, 0.032, 0.02, 0, 0.02, 0.092, M.black, head);                                            // sunglasses
    ib(0.02, 0.035, 0.05, 0.093, 0, 0.005, M.skin, head); ib(0.02, 0.035, 0.05, -0.093, 0, 0.005, M.skin, head); // ears
    for (const k of [1, -1]) {
      const x = 0.42 + k * 0.1, kx = 0.42 + k * 0.115, ax = 0.42 + k * 0.125;
      limb([x, 0.97, -0.25], [kx, 1.0, 0.14], 0.072, M.jeans, driver);        // thigh
      limb([kx, 1.0, 0.14], [ax, 0.8, 0.46], 0.056, M.jeans, driver);         // shin
      ib(0.1, 0.07, 0.25, ax, 0.765, 0.53, M.black, driver);                  // shoe
    }
    const up = new THREE.CapsuleGeometry(0.043, L1, 4, 10), fore = new THREE.CapsuleGeometry(0.035, L2, 4, 10), palm = new THREE.SphereGeometry(0.045, 10, 8);
    for (const sh of shoulders) {
      const a = { sh, up: add(up, M.hoodie, driver, false), fore: add(fore, M.hoodie, driver, false), hand: add(palm, M.skin, driver, false), side: sh.x > 0.42 ? 1 : -1 };
      a.hand.scale.set(0.9, 1.1, 0.8); for (const m of [a.up, a.fore, a.hand]) m.userData.live = true; arms.push(a);
    }
  }
  const _h = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const bone = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_up, _d.subVectors(b, a).normalize()); };
  function poseArms(turn) {
    wheelBase.updateMatrix();
    const t = clamp(turn, -0.8, 0.8); // the hands follow the rim so far, then it slides through them
    for (const a of arms) {
      const th = (a.side > 0 ? 0.42 : Math.PI - 0.42) + t;
      _h.set(0.168 * Math.cos(th), 0.142 * Math.sin(th), -0.035).applyMatrix4(wheelBase.matrix);
      const d = Math.min(a.sh.distanceTo(_h), L1 + L2 - 0.005), dir = _d.subVectors(_h, a.sh).normalize();
      const k = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, L1 * L1 - k * k));
      _p.set(a.side * 0.8, -1, -0.1); _p.addScaledVector(dir, -_p.dot(dir)).normalize(); // elbow bends out and down
      _e.copy(a.sh).addScaledVector(dir, k).addScaledVector(_p, hgt);
      _h.copy(a.sh).addScaledVector(dir, d);
      bone(a.up, a.sh, _e); bone(a.fore, _e, _h); a.hand.position.copy(_h);
    }
  }
  poseArms(0);
  bakeStatic(interior, { receiveShadow: false }); // trim, seats and the driver's body: one draw call per material
  bakeStatic(head); bakeStatic(wheelGrp);          // they move as a whole: bake each on its own
  interior.userData.live = true;                   // car.js hides it beyond 45 m

  // ---- flight kit: wings (swing out from under the sills, between the wheels)
  const wings = [];
  {
    const sh = new THREE.Shape();
    const P = [[0, 0], [0.3, 0.02], [2.05, -0.62], [2.25, -0.78], [2.25, -1.18], [1.9, -1.2], [0.25, -1.7], [0, -1.7]];
    sh.moveTo(P[0][0], -P[0][1]); for (const [x, z] of P.slice(1)) sh.lineTo(x, -z);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, -0.02, 0);
    const tip = new THREE.Shape(); tip.moveTo(0, 0); tip.lineTo(0.35, 0.28); tip.lineTo(0.62, 0.3); tip.lineTo(0.42, 0); tip.closePath();
    const tipG = new THREE.ExtrudeGeometry(tip, { depth: 0.03, bevelEnabled: false }); tipG.translate(0, 0, -0.015); tipG.rotateY(Math.PI / 2);
    const stripe = new THREE.BoxGeometry(1.5, 0.012, 0.08);
    const lampG2 = new THREE.SphereGeometry(0.035, 8, 6);
    for (const s of [1, -1]) {
      const piv = new THREE.Group(); piv.position.set(s * 0.76, 0.5, 0.95); body.add(piv);
      const tele = new THREE.Group(); piv.add(tele);
      const w = add(geo, M.paintW, tele); w.scale.x = s;
      const tp = add(tipG, M.black, tele); tp.position.set(s * 2.25, 0.02, -0.78); if (s < 0) tp.scale.x = -1;
      const st = add(stripe, M.black, tele); st.position.set(s * 1.2, 0.036, -0.52); st.rotation.y = s * 0.35;
      const lm = new THREE.Mesh(lampG2, new THREE.MeshBasicMaterial({ color: s > 0 ? new THREE.Color(3, 0.2, 0.2) : new THREE.Color(0.2, 3, 0.4), toneMapped: false }));
      lm.position.set(s * 2.27, 0.03, -0.85); lm.userData.live = true; tele.add(lm); // blinks
      bakeStatic(tele);
      piv.visible = false; piv.userData.live = true;
      wings.push({ piv, tele, s, lamp: lm });
    }
  }
  // ---- flight kit: turbines (out of the bed sides, above the rear wheels)
  const turbs = [];
  const flameTex = gradTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(170,215,255,0.8)'], [1, 'rgba(40,90,255,0)']]);
  const coreTex = gradTex([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,240,220,0.6)'], [1, 'rgba(255,200,150,0)']]);
  const glowTex = radialTex();
  {
    const nac = new THREE.CylinderGeometry(0.27, 0.23, 1.05, 6, 1, true); nac.rotateX(Math.PI / 2); nac.rotateZ(Math.PI / 6); // faceted nacelle
    const lip = new THREE.TorusGeometry(0.265, 0.035, 8, 24);
    const inner = new THREE.CylinderGeometry(0.24, 0.2, 1.0, 20, 1, true); inner.rotateX(Math.PI / 2);
    const spinner = new THREE.ConeGeometry(0.08, 0.2, 16); spinner.rotateX(Math.PI / 2);
    const blade = new THREE.BoxGeometry(0.035, 0.2, 0.01); blade.translate(0, 0.12, 0);
    const nozzle = new THREE.CylinderGeometry(0.2, 0.15, 0.12, 20, 1, true); nozzle.rotateX(Math.PI / 2);
    const pylon = new THREE.BoxGeometry(0.44, 0.08, 0.5);
    const fl = r => { const g = new THREE.ConeGeometry(r, 1, 16, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); return g; };
    const flMat = (tex, col) => new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    for (const s of [1, -1]) {
      const slide = new THREE.Group(); body.add(slide);
      const rot = new THREE.Group(); rot.scale.setScalar(0.88); slide.add(rot);
      add(pylon, M.black, slide).position.set(-s * 0.26, 0, 0);
      add(nac, M.paintW, rot); add(inner, M.black, rot, false);
      add(lip, M.black, rot).position.z = 0.525;
      const fan = new THREE.Group(); fan.position.z = 0.36; rot.add(fan);
      add(spinner, M.metal, fan).position.z = 0.05;
      for (let k = 0; k < 11; k++) { const b = add(blade, M.fan, fan, false); b.rotation.z = k / 11 * Math.PI * 2; b.rotation.y = 0.5; }
      bakeStatic(fan);
      add(nozzle, M.metal, rot).position.z = -0.56;
      const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), M.glow.clone()); glowDisc.position.z = -0.5; glowDisc.rotation.y = Math.PI; rot.add(glowDisc);
      const fz = new THREE.Group(); fz.position.z = -0.6; rot.add(fz);
      const outer = new THREE.Mesh(fl(0.17), flMat(flameTex, new THREE.Color(0.6, 0.9, 1.6).multiplyScalar(3)));
      const core = new THREE.Mesh(fl(0.08), flMat(coreTex, new THREE.Color(1.3, 1.2, 1.1).multiplyScalar(3.5)));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.6, 0.9, 1.6).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      for (const o of [outer, core, glow]) { o.renderOrder = 10; o.frustumCulled = false; fz.add(o); }
      slide.visible = false; slide.userData.live = true;
      turbs.push({ slide, rot, fan, s, outer, core, glow, glowDisc });
    }
  }
  bakeStatic(body); // shell, cladding, trims, lights: everything left that neither moves nor hides
  root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });

  // ---------------------------------------------------------------- per-frame pose
  let time = 0, fanA = 0, dispT = 0, glassIn = false;
  function set(st, dt) {
    time += dt;
    body.position.y = st.heave || 0;
    body.rotation.set(-(st.bodyPitch || 0), 0, st.bodyRoll || 0, 'YXZ');
    for (const w of wheels) { w.piv.rotation.y = w.front ? st.steer : 0; w.spin.rotation.x = st.wheelAngle; }
    wheelGrp.rotation.z = -st.steer * 5; // steer-by-wire: ~ +-170 deg lock to lock
    if (interior.visible) poseArms(wheelGrp.rotation.z);
    head.visible = !st.cockpit;          // the camera sits in it
    const W = st.wing;
    for (const w of wings) {
      w.piv.visible = W > 0.01;
      const sw = smooth(W / 0.7), te = smooth((W - 0.3) / 0.7);
      w.piv.rotation.set(0, w.s * lerp(Math.PI / 2, 0.05, sw), w.s * lerp(0, 0.07, te));
      w.tele.scale.set(lerp(0.42, 1, te), 1, lerp(0.8, 1, sw));
      w.lamp.visible = W > 0.95 && (time * 1.2 % 1) < 0.12;
    }
    const T = st.turb;
    fanA += dt * (4 + 60 * st.thrust + 30 * T);
    for (const t of turbs) {
      t.slide.visible = T > 0.01;
      const so = smooth(T / 0.55), ro = smooth((T - 0.35) / 0.65);
      t.slide.position.set(t.s * lerp(0.5, 1.32, so), lerp(1.1, 1.36, so), -1.95);
      t.rot.rotation.x = lerp(-Math.PI / 2, 0, ro);
      t.fan.rotation.z = fanA * t.s;
      const k = st.thrust, fl = k > 0.02 && ro > 0.9;
      const flick = 0.9 + 0.1 * Math.sin(time * 53 + t.s * 2) + 0.06 * Math.sin(time * 91);
      t.outer.visible = t.core.visible = t.glow.visible = fl;
      if (fl) {
        const L = (0.5 + 2.6 * k) * flick;
        t.outer.scale.set(0.8 + 0.4 * k, 0.8 + 0.4 * k, L); t.core.scale.set(1, 1, L * 0.55);
        t.glow.scale.setScalar(0.5 + 0.9 * k); t.glow.material.opacity = 0.5 + 0.5 * k;
      }
      t.glowDisc.material.color.setRGB(0.3 + 0.5 * k, 0.8 + 1.2 * k, 1.6 + 2.4 * k);
    }
    M.tail.emissiveIntensity = st.brake ? 4.5 : 1.3;
    M.head.emissiveIntensity = st.night ? 3.4 : 2.4;
    // from the cockpit the glass is nearly clear (a faint tint and a weak sheen), from outside it stays dark; clearcoat
    // stays above 0 so the switch never recompiles the shader
    if (glassIn !== !!st.cockpit) {
      glassIn = !!st.cockpit;
      Object.assign(M.glass, glassIn ? { opacity: 0.1, clearcoat: 0.12, envMapIntensity: 0.3 } : { opacity: 0.86, clearcoat: 1, envMapIntensity: 0.55 });
    }
    dispT -= dt; if (dispT <= 0 && st.cockpit) { dispT = 1 / 15; screen.draw(st); hud.draw(st); }
  }
  return { object: root, body, set, eye: EYE.clone(), interior, driver, materials: M };
}
