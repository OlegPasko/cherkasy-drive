// Procedural Roadster (the second player car, after the 2026 Tesla Roadster shown on 2026-10-16), unlocked once every
// sight is found (src/game/garage.js). The same contract as the Cybertruck's model.js:
//   buildRoadsterModel() -> { object, body, set(state, dt), eye, interior, driver, materials, fx, gas, wing (getter, 0..1) }
//   WING_UP / WING_DOWN: the rear wing's deploy / fold speeds (m/s)
//   RDIM: { len, wid, wb, track, wheelR, wheelZ, wheelX, height } (car.js reads it like model.js's DIM)
//   fx: a world-space THREE.Points of cold-gas puffs; car.js adds it to the scene while this car is driven.
// Car space as in model.js: +z forward, +x = LEFT (the driver sits at +x), +y up, y 0 = ground contact.
// Shape (4.6 m, 3.0 m wheelbase, 1.15 m tall): one hull lofted through ~30 cross-sections, 9 points a half-section (the
// tables T.x / T.y by z), compared view by view with the reveal photos. It is shaded as sculpted steel, not as a pile of
// facets: corner normals are smooth along each strip and across the soft lines (the centre, the shoulder 4, the widest
// line 5) and split at the creases (bonnet edge, the pods' chamfer and crest, belt), or where a strip bends sharply.
// A wide bonnet with a faint crown and a bowed leading edge, sloping to the nose with a shut line by the windshield,
// between two fender pods: a short inner chamfer rising from the bonnet edge (fading out toward the windshield, so the
// bonnet runs into the pod top with one crease), a pod top rising gently to a crisp crest, a long triangular facet under
// the crest down to the crease that rises over the arch, and one curved flank to the sill. Each pod's front face is a
// plane canted outward (POD_CANT) with a raked brow over the bonnet edge (POD_RAKE) holding the inverted-triangle
// headlight (a black pocket, the lamp inset), a chin bevelled back into the splitter (POD_CHIN) and a narrow bevel round
// its outer corner (CORNER); a thin white light line along the bonnet's leading edge over a tall black recessed fascia,
// a black splitter swept back at its ends. A very wide windshield wraps over the pods' rear tips into thin A-pillars; one arched
// black glass canopy runs over the roof to the rear deck, the side glass under a white roof rail tapering to a point;
// one sharp belt crease, a thin black sill; a short front overhang. A sharp Kamm tail with a leaning white panel:
// the full-width red light line with a brighter centre and a short thin bar above, the Everlabs plate (as on the
// Cybertruck), a black diffuser set in under a lip, thin fins and four round bronze cold-gas nozzles. Six-blade dark aero
// wheels with bright swept blades, drawn at RW (0.38 m, a touch over RDIM.wheelR) with their centres raised to match.
// The body wears the Cybertruck's unpainted stainless (model.js STEEL); its inner side is dark matte trim, so from the
// seat the A-pillars and roof rails read as thin black lining (the rail is laid nearly level, edge-on to the eye). Arches are cut by tucking the lower section
// points into a liner (ARCH_IN). Butterfly doors: the door strips (rail to sill) are their own groups hinged on the roof
// rail; they swing up when the car stands parked in the chase view (state.parked). The rear wing (group 'RdWing', two
// stalks and a blade) is up while driving on the ground: it deploys over WING_UP m/s (100 km/h, state.speed) and folds
// under WING_DOWN (85 km/h), and folds whenever the car is in the air (state.air), easing both ways; the returned `wing` getter is
// its 0..1 deploy. Interior: white bolstered sport seats with grey stripes, a yoke, a low dark dash with a red
// ambient strip, a centre screen (canvas: speed, PRND, gas charge and thrust, altitude), door cards; a driver whose arms
// follow the yoke.
// Gas: state.charge (0..1, building on the ground: vents puff under the sills), state.burst (the jump: a blast down from
// the four belly nozzles that spreads over the ground), state.gasDown (hover jets) and state.gasRear (the four rear
// nozzles, forward thrust). state.groundY is the ground under the car (puffs spread on it).
import * as THREE from 'three';
import { STEEL, bakeStatic, liveCanvas, gradTex } from './model.js';
import { logoTexture } from '../../kit/logo.js';

const { clamp, lerp } = THREE.MathUtils;
const smooth = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

export const RDIM = { len: 4.6, wid: 2.0, wb: 3.0, track: 1.7, wheelR: 0.36, wheelZ: 1.5, wheelX: 0.85, height: 1.15 };
const EYE = new THREE.Vector3(0.4, 0.97, -0.3);
// key stations (z): the windshield base sits over the front axle, so the bonnet is short and the glass canopy long
const NOSE = 2.3, TAIL = -2.3, WC = RDIM.wheelZ;
const WSZ = 1.4, APZ = 1.3, DOOR_F = 0.95, ROOF_F = 0.3, DOOR_R = -0.4, ROOF_R = -0.75, WIN_R = -1.22, DECK = -2.0, CABIN_END = -0.95;
// the wheels are drawn a little larger than the physics radius (RDIM.wheelR), their centres raised to match
const RW = 0.38, ARCH_R = 0.42, ARCH_IN = 0.7, WHEEL_Y = RW;
const NOZ_Y = 0.5, NOZ_Z = TAIL + 0.11, DIF_Z = TAIL + 0.2, BAR_Y = 0.88;
// the pods' front faces turn POD_CANT (rad) outward; over the bonnet edge a brow leans back POD_RAKE (the headlight sits
// in it), under CHIN_Y the foot bevels back POD_CHIN into the splitter, and the outer corner turns through a CORNER-wide
// bevel (m)
const POD_CANT = 0.42, POD_RAKE = 0.6, POD_CHIN = 0.5, CHIN_Y = 0.36, CORNER = 0.03;
const CROWN = 0.018, BOW = 0.03; // the bonnet's centre stands this much over its edges, and its leading edge bows forward
// the rear wing deploys on the ground above WING_UP (m/s, 100 km/h) and folds below WING_DOWN (85 km/h: no flicker
// round the threshold), and in the air
export const WING_UP = 100 / 3.6, WING_DOWN = 85 / 3.6;

// ---------------------------------------------------------------- hull sections
// piecewise-linear tables [[z, value], ...] from the nose back
const lin = (t, z) => {
  if (z >= t[0][0]) return t[0][1];
  for (let i = 0; i < t.length - 1; i++) {
    const [z0, a] = t[i], [z1, b] = t[i + 1];
    if (z <= z0 && z >= z1) return a + (b - a) * (z0 - z) / (z0 - z1);
  }
  return t[t.length - 1][1];
};
// nine section points a side, from the top centre round to the bottom centre. Their roles change along the car:
//   0 centre (bonnet / windshield and roof glass / black rear glass / white tail deck)
//   1 bonnet edge -> windshield edge, A-pillar and roof rail inner -> rear glass edge
//   2 the top of the pod's inner wall (a short steep face over the bonnet edge, fading out at the windshield base)
//     -> roof rail outer -> haunch inner crest
//   3 pod crest -> side glass bottom (belt) -> haunch outer crest
//   4 the soft line on the pod's outer face (low at the nose corner, rising over the arch to the A-pillar base, so the
//     facet between it and the crest is a long triangle) -> the shoulder under the belt
//   5 the widest line (soft too: the side is one curved face from 4 to the sill), 6 sill top, 7 sill bottom,
//   8 bottom centre
// The front is laid out on a few key stations with smooth runs between them, so each facet there is one clean plane
// or a gently curved patch. Between the bonnet's rear edge (WSZ) and the A-pillar base (APZ) points 1 and 2 swing out to
// the pod's rear tip: the windshield's lower edge runs up the pod top, and the thin A-pillar rises from its tip.
const T = {
  x: [
    null,
    [[NOSE, 0.625], [2.06, 0.617], [1.92, 0.609], [1.7, 0.596], [WSZ, 0.575], [APZ, 0.868], [DOOR_F, 0.812], [ROOF_F, 0.708], [DOOR_R, 0.69], [ROOF_R, 0.637], [WIN_R, 0.52], [DECK, 0.43], [TAIL, 0.43]],
    [[NOSE, 0.685], [2.06, 0.66], [1.92, 0.64], [1.7, 0.645], [WSZ, 0.63], [APZ, 0.886], [DOOR_F, 0.826], [ROOF_F, 0.72], [DOOR_R, 0.71], [ROOF_R, 0.675], [WIN_R, 0.64], [DECK, 0.56], [TAIL, 0.56]],
    [[NOSE, 0.815], [2.06, 0.865], [1.92, 0.908], [1.7, 0.93], [WSZ, 0.942], [APZ, 0.912], [DOOR_F, 0.896], [ROOF_F, 0.885], [DOOR_R, 0.88], [ROOF_R, 0.86], [WIN_R, 0.67], [DECK, 0.9], [TAIL, 0.94]],
    [[NOSE, 0.775], [2.06, 0.885], [1.92, 0.948], [1.7, 0.98], [WSZ, 0.99], [APZ, 0.978], [ROOF_F, 0.955], [DOOR_R, 0.95], [WIN_R, 0.98], [DECK, 0.99], [TAIL, 0.985]],
    [[NOSE, 0.705], [2.06, 0.865], [1.92, 0.955], [1.7, 0.993], [WC, 1.0], [-WC - ARCH_R, 1.0], [TAIL, 0.96]],
    [[NOSE, 0.655], [2.06, 0.815], [1.92, 0.89], [WC - 0.6, 0.95], [-WC - ARCH_R, 0.95], [TAIL, 0.9]],
    [[NOSE, 0.615], [2.06, 0.77], [1.92, 0.84], [1.6, 0.872], [TAIL, 0.86]],
  ],
  y: [ // the centre line arcs from the windshield over the roof down to the deck; the bonnet has a faint crown
    [[NOSE, 0.515], [2.06, 0.588], [1.92, 0.629], [1.7, 0.69], [WSZ, 0.77], [DOOR_F, 0.955], [0.65, 1.065], [ROOF_F, 1.12], [0, 1.14], [DOOR_R, 1.13], [ROOF_R, 1.105], [WIN_R, 1.03], [-1.6, 1.0], [DECK, 0.975], [TAIL, 0.965]],
    [[NOSE, 0.515], [2.06, 0.588], [1.92, 0.629], [1.7, 0.69], [WSZ, 0.77], [APZ, 0.845], [DOOR_F, 0.93], [0.65, 1.04], [ROOF_F, 1.095], [0, 1.115], [DOOR_R, 1.105], [ROOF_R, 1.08], [WIN_R, 1.0], [-1.6, 0.975], [DECK, 0.965], [TAIL, 0.955]],
    [[NOSE, 0.595], [2.06, 0.622], [1.92, 0.655], [1.7, 0.7], [WSZ, 0.778], [APZ, 0.842], [DOOR_F, 0.926], [0.65, 1.037], [ROOF_F, 1.092], [0, 1.112], [DOOR_R, 1.102], [ROOF_R, 1.076], [WIN_R, 0.98], [-1.6, 0.975], [DECK, 0.98], [TAIL, 0.97]],
    [[NOSE, 0.615], [2.06, 0.655], [1.92, 0.695], [1.7, 0.755], [WSZ, 0.825], [APZ, 0.838], [ROOF_F, 0.85], [DOOR_R, 0.88], [ROOF_R, 0.92], [WIN_R, 0.975], [-1.6, 0.98], [DECK, 0.985], [TAIL, 0.965]],
    [[NOSE, 0.45], [2.06, 0.56], [1.92, 0.65], [1.7, 0.735], [1.5, 0.795], [WSZ, 0.805], [APZ, 0.81], [ROOF_F, 0.75], [DOOR_R, 0.78], [ROOF_R, 0.83], [WIN_R, 0.9], [DECK, 0.95], [TAIL, 0.94]],
    [[NOSE, 0.36], [2.06, 0.42], [1.92, 0.46], [WC, 0.5], [0, 0.54], [-WC, 0.58], [TAIL, 0.65]],
    [[NOSE, 0.24], [WC - 0.6, 0.24], [-WC + 0.6, 0.27], [-WC - 0.45, 0.33], [TAIL, 0.4]],
    [[NOSE, 0.15], [WC - 0.6, 0.15], [-WC + 0.6, 0.16], [TAIL, 0.22]],
  ],
};
// per-point z offsets at the two ends (the pod front faces are laid on their own plane in the build); at the tail the
// corners reach out and the panel under the light bar leans in toward its foot
const DZ_NOSE = [BOW, 0, 0, 0, 0, 0, 0, -0.14, -0.14], DZ_TAIL = [0, 0, -0.01, -0.02, -0.02, 0.14, 0.2, 0.22, 0.22];
// stations (nose -> tail): the key lines plus each wheel arch (an outside and an inside station at its ends, so the arch
// edge drops straight down)
const archZ = (c) => [c + ARCH_R + 0.006, c + ARCH_R - 0.001, c + 0.36, c + 0.25, c + 0.12, c, c - 0.12, c - 0.25, c - 0.36, c - ARCH_R + 0.001, c - ARCH_R - 0.006];
const STATIONS = (() => {
  const key = [2.06, WSZ, APZ, DOOR_F, 0.65, ROOF_F, 0, DOOR_R, DOOR_R - 0.04, ROOF_R, WIN_R, -1.6, DECK, -2.1];
  const arch = [...archZ(WC), ...archZ(-WC)], z = [...arch];
  for (const k of key) if (arch.every((a) => Math.abs(a - k) > 0.015)) z.push(k);
  return [NOSE, ...z.sort((a, b) => b - a), TAIL];
})();
const archD = (z) => Math.min(Math.abs(z - WC), Math.abs(z + WC));
// half section at station i: { P: 9 points [x, y, z], tuck: points tucked in behind a tyre (the arch liner) }
function section(i) {
  const z = STATIONS[i];
  const P = [[0, lin(T.y[0], z)]];
  for (let k = 1; k <= 7; k++) P.push([lin(T.x[k], z), lin(T.y[k], z)]);
  if (z >= WSZ) { P[1][1] = P[0][1]; P[0][1] += CROWN; } // the bonnet: a faint crown across
  P.push([0, P[7][1]]);
  const tuck = P.map(() => false), d = archD(z);
  if (d < ARCH_R) { // a wheel arch: the first point under the arch line becomes the arch edge, the rest tuck in
    const ya = Math.min(WHEEL_Y + Math.sqrt(ARCH_R * ARCH_R - d * d), P[4][1] - 0.025);
    let k = 5; while (k < 7 && P[k][1] >= ya) k++;
    const a = P[k - 1], b = P[k], t = clamp((a[1] - ya) / Math.max(1e-6, a[1] - b[1]), 0, 1);
    P[k] = [lerp(a[0], b[0], t), ya];
    const yl = Math.min(ya, P[1][1] - 0.03, P[2][1] - 0.03); // the liner stays under the bonnet and the pod top
    for (let m = k + 1; m <= 7; m++) { P[m] = [ARCH_IN, yl]; tuck[m] = true; }
  }
  const dz = i === 0 ? DZ_NOSE : i === STATIONS.length - 1 ? DZ_TAIL : null;
  return { P: P.map(([x, y], k) => [x, y, z + (dz ? dz[k] : 0)]), tuck };
}

// which material a strip (j: between section points j and j+1) takes over the span centred at zm
function stripMat(j, zm, liner) {
  if (liner) return 'black';
  if (j === 0) return zm > WSZ ? 'paint' : zm > ROOF_R ? 'glass' : zm > DECK ? 'dark' : 'paint';
  if (j === 1) return zm < WSZ && zm > APZ ? 'glass' : 'paint';
  if (j === 2) return zm > APZ || zm < WIN_R ? 'paint' : zm < DOOR_R && zm > DOOR_R - 0.04 ? 'black' : 'glass';
  if (j >= 6) return 'black';
  return 'paint';
}

// a growable non-indexed triangle list (position, normal, uv in metres): flat facets (tri / quad) or a quad with its
// own corner normals (quadN: the hull's smooth panels)
function triList() {
  const pos = [], nrm = [], uv = [];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
  const put = (p, n = _n) => { pos.push(p[0], p[1], p[2]); nrm.push(n.x ?? n[0], n.y ?? n[1], n.z ?? n[2]); uv.push(p[2] + p[0] * 0.3, p[1]); };
  const facing = (out) => { _n.normalize(); if (_n.x * out[0] + _n.y * out[1] + _n.z * out[2] < 0) { _n.negate(); return true; } return false; };
  const wind = (a, b, c) => { // keep the triangle's winding in line with _n
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const cx = _a.y * _b.z - _a.z * _b.y, cy = _a.z * _b.x - _a.x * _b.z, cz = _a.x * _b.y - _a.y * _b.x;
    if (cx * _n.x + cy * _n.y + cz * _n.z < 0) { put(a); put(c); put(b); } else { put(a); put(b); put(c); }
  };
  return {
    // a triangle facing `out` (a rough outward direction)
    tri(a, b, c, out) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _n.crossVectors(_a, _b);
      facing(out); wind(a, b, c);
    },
    // a quad a-b-c-d with one normal (across its diagonals), so a slightly warped quad still reads as one facet
    quad(a, b, c, d, out) {
      _a.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _b.set(d[0] - b[0], d[1] - b[1], d[2] - b[2]); _n.crossVectors(_a, _b);
      if (_n.lengthSq() < 1e-12) return;
      facing(out); wind(a, b, c); wind(a, c, d);
    },
    // a quad a-b-c-d facing `face` (its outward normal) with the corner normals na..nd
    quadN(a, b, c, d, face, na, nb, nc, nd) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _n.crossVectors(_a, _b);
      if (_n.x * face[0] + _n.y * face[1] + _n.z * face[2] < 0) { put(a, na); put(c, nc); put(b, nb); put(a, na); put(d, nd); put(c, nc); }
      else { put(a, na); put(b, nb); put(c, nc); put(a, na); put(c, nc); put(d, nd); }
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return g;
    },
  };
}

// ---------------------------------------------------------------- the centre screen (canvas)
function makeScreen() {
  const { g, tex } = liveCanvas(768, 448);
  tex.anisotropy = 4;
  const F = (w, px) => `${w} ${px}px "Helvetica Neue", Arial, sans-serif`;
  function bar(x, y, w, v, col, label, txt) {
    g.font = F(500, 20); g.fillStyle = '#8b94a3'; g.textAlign = 'left'; g.fillText(label, x, y - 16);
    g.textAlign = 'right'; g.fillStyle = '#e8ebef'; g.fillText(txt, x + w, y - 16);
    g.fillStyle = '#23272e'; g.fillRect(x, y, w, 14); g.fillStyle = col; g.fillRect(x, y, w * clamp(v, 0, 1), 14);
  }
  function draw(st) {
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, 768, 448);
    g.fillStyle = '#141619'; g.fillRect(0, 0, 290, 448);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    ['P', 'R', 'N', 'D'].forEach((k, i) => { g.font = F(k === st.gear ? 700 : 500, 28); g.fillStyle = k === st.gear ? '#fff' : '#5b6370'; g.fillText(k, 80 + i * 42, 46); });
    g.font = F(300, 120); g.fillStyle = '#f2f4f7'; g.fillText(Math.round(Math.abs(st.speed) * 3.6), 145, 160);
    g.font = F(500, 24); g.fillStyle = '#8b94a3'; g.fillText('КМ/ГОД', 145, 236);
    // top view: the four belly jets and the four rear nozzles light up with their thrust
    g.save(); g.translate(145, 350);
    g.fillStyle = '#c9cdd2'; g.beginPath(); g.moveTo(-30, -70); g.lineTo(30, -70); g.lineTo(36, 66); g.lineTo(-36, 66); g.closePath(); g.fill();
    g.fillStyle = '#1d2026'; g.fillRect(-22, -30, 44, 70);
    for (const [x, y] of [[-24, -48], [24, -48], [-24, 44], [24, 44]]) { g.fillStyle = st.gasDown > 0.1 || st.charge > 0.05 ? `rgba(160,220,255,${0.3 + 0.7 * Math.max(st.gasDown, st.charge)})` : '#4a5260'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
    for (let k = 0; k < 4; k++) { g.fillStyle = st.gasRear > 0.1 ? `rgba(160,220,255,${0.3 + 0.7 * st.gasRear})` : '#a0784a'; g.beginPath(); g.arc(-21 + k * 14, 72, 5, 0, 7); g.fill(); }
    g.restore();
    g.textAlign = 'left';
    g.font = F(600, 28); g.fillStyle = '#e8ebef';
    g.fillText(st.air ? 'Газові двигуни' : st.charge > 0.01 ? 'Набір тиску' : 'Режим їзди', 320, 50);
    g.font = F(400, 19); g.fillStyle = '#8b94a3';
    g.fillText(st.air ? 'Shift: зависання · W: тяга · S: гальмо' : 'Тримай Shift: тиск газу, відпусти: стрибок', 320, 84);
    bar(320, 150, 410, st.charge, st.charge > 0.98 ? '#ff5a4a' : '#7fd0ff', 'Тиск', st.charge > 0.01 ? `${Math.round(st.charge * 100)} % · ≈ ${Math.round(st.jumpH || 0)} м` : '–');
    bar(320, 220, 410, st.gasDown, '#7fd0ff', 'Підйомні струмені', `${Math.round(st.gasDown * 100)} %`);
    bar(320, 290, 410, st.gasRear, '#7fd0ff', 'Тяга вперед', `${Math.round(st.gasRear * 100)} %`);
    bar(320, 360, 410, st.air ? st.alt / 120 : 0, '#7fd88a', 'Висота', st.air ? `${Math.round(st.alt)} м` : '–');
    if (st.air) { g.font = F(600, 22); g.fillStyle = st.vy >= 0 ? '#7fd88a' : '#ffb35a'; g.fillText((st.vy >= 0 ? '▲ ' : '▼ ') + Math.abs(st.vy).toFixed(1) + ' м/с', 320, 420); }
    else if (st.handbrake) { g.font = F(600, 22); g.fillStyle = '#ff5050'; g.fillText('(P) Ручник', 320, 420); }
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

// ---------------------------------------------------------------- cold-gas puffs (world space)
const FX_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying float vA;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aAlpha > 0.0 ? min( aSize * uScale / max( -mvPosition.z, 0.3 ), 480.0 ) : 0.0;
  vA = aAlpha;
  #include <fog_vertex>
}`;
const FX_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vA;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot( c, c );
  if ( r > 1.0 ) discard;
  float k = 1.0 - r;
  gl_FragColor = vec4( uColor * ( 0.82 + 0.18 * c.y * -1.0 ), vA * k * k );
  #include <fog_fragment>
}`;
function createGasFx(N = 760) {
  const pos = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), s0 = new Float32Array(N), s1 = new Float32Array(N), a0 = new Float32Array(N), gy = new Float32Array(N), ox = new Float32Array(N), oz = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aSize = new THREE.BufferAttribute(size, 1), aAlpha = new THREE.BufferAttribute(alpha, 1);
  for (const a of [aPos, aSize, aAlpha]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('aSize', aSize); g.setAttribute('aAlpha', aAlpha);
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 }, uColor: { value: new THREE.Color(1.3, 1.34, 1.4) } }]),
    vertexShader: FX_VERT, fragmentShader: FX_FRAG, transparent: true, depthWrite: false, fog: true,
  });
  const points = new THREE.Points(g, mat);
  points.name = 'RoadsterGas'; points.frustumCulled = false; points.renderOrder = 9;
  const _sz = new THREE.Vector2();
  points.onBeforeRender = (renderer, scene, camera) => { // metres -> pixels at 1 m: half the buffer height / tan(fov / 2)
    renderer.getDrawingBufferSize(_sz);
    mat.uniforms.uScale.value = _sz.y * 0.5 * (camera.projectionMatrix?.elements[5] || 1);
  };
  let next = 0, live = 0;
  return {
    object: points,
    get live() { return live; },
    clear() { alpha.fill(0); aAlpha.needsUpdate = true; live = 0; }, // off the scene (a swap): no stale puffs on return
    // one puff at p with velocity v: life (s), size from a to b (m), opacity, the ground height under it
    emit(px, py, pz, vx, vy, vz, lf, sa, sb, op, ground) {
      const i = next; next = (next + 1) % N;
      pos[3 * i] = px; pos[3 * i + 1] = py; pos[3 * i + 2] = pz;
      vel[3 * i] = vx; vel[3 * i + 1] = vy; vel[3 * i + 2] = vz;
      age[i] = 0; life[i] = lf; s0[i] = sa; s1[i] = sb; a0[i] = op; gy[i] = ground; ox[i] = px; oz[i] = pz; alpha[i] = op; size[i] = sa;
    },
    update(dt, light) {
      live = 0;
      for (let i = 0; i < N; i++) {
        if (alpha[i] <= 0) continue;
        age[i] += dt;
        const t = age[i] / life[i];
        if (t >= 1) { alpha[i] = 0; continue; }
        live++;
        const k = Math.exp(-2.4 * dt), j = 3 * i;
        vel[j] *= k; vel[j + 2] *= k; vel[j + 1] = vel[j + 1] * k + 0.9 * dt; // drag, a little lift as it warms
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        if (pos[j + 1] < gy[i] + 0.15 && vel[j + 1] < 0) { // hits the ground: the down blast spreads out over it
          let dx = pos[j] - ox[i], dz = pos[j + 2] - oz[i]; const l = Math.hypot(dx, dz) || 1, sp = -vel[j + 1] * 0.75;
          dx /= l; dz /= l; if (l < 0.05) { const a = i * 2.39996; dx = Math.cos(a); dz = Math.sin(a); }
          vel[j] += dx * sp; vel[j + 2] += dz * sp; vel[j + 1] = 0.4; pos[j + 1] = gy[i] + 0.15;
        }
        size[i] = s0[i] + (s1[i] - s0[i]) * Math.sqrt(t);
        alpha[i] = a0[i] * (1 - t) * Math.min(1, t * 8 + 0.2);
      }
      mat.uniforms.uColor.value.setRGB(1.3, 1.34, 1.4).multiplyScalar(light);
      aPos.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- build
export function buildRoadsterModel() {
  const root = new THREE.Group(); root.name = 'PlayerRoadster';
  const body = new THREE.Group(); root.add(body);
  const M = {
    paint: new THREE.MeshStandardMaterial({ name: 'RdSteel', ...STEEL, side: THREE.DoubleSide }), // the Cybertruck's stainless
    black: new THREE.MeshStandardMaterial({ name: 'RdBlack', color: 0x101113, metalness: 0.2, roughness: 0.7, side: THREE.DoubleSide }),
    carbon: new THREE.MeshStandardMaterial({ name: 'RdCarbon', color: 0x1b1d20, metalness: 0.35, roughness: 0.38, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'RdGlass', color: 0x020305, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.95, envMapIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.6 }),
    dark: new THREE.MeshPhysicalMaterial({ name: 'RdDarkGlass', color: 0x050608, metalness: 0.3, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
    tire: new THREE.MeshStandardMaterial({ name: 'RdTire', color: 0x141415, roughness: 0.95 }),
    rim: new THREE.MeshStandardMaterial({ name: 'RdRim', color: 0x2a2c30, metalness: 0.7, roughness: 0.35 }),
    blade: new THREE.MeshStandardMaterial({ name: 'RdBlade', color: 0xa9adb3, metalness: 0.85, roughness: 0.25 }),
    bronze: new THREE.MeshStandardMaterial({ name: 'RdBronze', color: 0x9a7444, metalness: 0.9, roughness: 0.3 }),
    head: new THREE.MeshStandardMaterial({ name: 'RdHead', color: 0xffffff, emissive: 0xe8f2ff, emissiveIntensity: 2.4 }),
    tail: new THREE.MeshStandardMaterial({ name: 'RdTail', color: 0x400000, emissive: 0xff1010, emissiveIntensity: 1.4 }),
    tailHi: new THREE.MeshStandardMaterial({ name: 'RdTailHi', color: 0x600000, emissive: 0xff2a20, emissiveIntensity: 2.6 }),
    amber: new THREE.MeshStandardMaterial({ name: 'RdAmber', color: 0x803c00, emissive: 0xff8a1a, emissiveIntensity: 1.2 }),
    ambient: new THREE.MeshBasicMaterial({ name: 'RdAmbient', color: new THREE.Color(2.2, 0.12, 0.08), toneMapped: false }),
    dash: new THREE.MeshStandardMaterial({ name: 'RdDash', color: 0x1a1b1e, roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ name: 'RdTrim', color: 0x45484e, metalness: 0.5, roughness: 0.45 }),
    carpet: new THREE.MeshStandardMaterial({ name: 'RdCarpet', color: 0x111214, roughness: 1 }),
    seat: new THREE.MeshStandardMaterial({ name: 'RdSeat', color: 0xe6e5e1, roughness: 0.55 }),
    stripe: new THREE.MeshStandardMaterial({ name: 'RdSeatStripe', color: 0x6c6f75, roughness: 0.6 }),
    skin: new THREE.MeshStandardMaterial({ name: 'RdSkin', color: 0xc28a68, roughness: 0.7 }),
    hoodie: new THREE.MeshStandardMaterial({ name: 'RdHoodie', color: 0x2c3038, roughness: 0.9 }),
    jeans: new THREE.MeshStandardMaterial({ name: 'RdJeans', color: 0x2d3d5c, roughness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ name: 'RdHair', color: 0x2b1e15, roughness: 0.85 }),
  };
  // the steel's inner side (the hull is one skin, wound outward) is dark matte trim: from the seat the A-pillars and
  // the roof rails read as thin black lining, not as lit grey blades across the windshield
  M.paint.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tif ( !gl_FrontFacing ) diffuseColor.rgb = vec3( 0.03 );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tif ( !gl_FrontFacing ) metalnessFactor = 0.0;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\tif ( !gl_FrontFacing ) roughnessFactor = 0.9;');
  };
  M.paint.customProgramCacheKey = () => 'RdSteelLined';
  const add = (geo, mat, parent = body, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, x, y, z, mat, parent = body, shadow = true) => { const m = add(new THREE.BoxGeometry(w, h, d), mat, parent, shadow); m.position.set(x, y, z); return m; };

  // ---- the hull: strips between consecutive sections, both sides; the door strips go to their own lists
  const S = STATIONS.map((z, i) => section(i));
  // each pod's front face: a plane through the bonnet's front corner, canted POD_CANT outward, and over the bonnet
  // edge's height a brow raked back by POD_RAKE, under CHIN_Y a chin bevelled back by POD_CHIN (creases across the face)
  const Y1 = S[0].P[1][1], TR = Math.tan(POD_RAKE), TC = Math.tan(POD_CHIN);
  const podZ = (x, y = CHIN_Y) => NOSE - Math.tan(POD_CANT) * (x - S[0].P[1][0]) - TR * Math.max(0, y - Y1) - TC * Math.max(0, CHIN_Y - y);
  for (const k of [2, 3, 4, 5, 6]) S[0].P[k][2] = podZ(S[0].P[k][0], S[0].P[k][1]);
  // the pods' outer front corners turn through a narrow bevel, not one sharp edge: an extra section just behind the
  // nose, its points CORNER (m) back along the flank, and the face's outer edge pulled in as far along the face
  const ZS = [...STATIONS];
  {
    const N = S[0].P, M = S[1].P, c = Math.cos(POD_CANT), sn = Math.sin(POD_CANT);
    const P = N.map((p, k) => { const q = M[k], t = Math.min(0.45, CORNER / (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) || 1)); return p.map((v, a) => v + (q[a] - v) * t); });
    for (const k of [3, 4, 5, 6]) { N[k][0] -= c * CORNER; N[k][2] += sn * CORNER; }
    S.splice(1, 0, { P, tuck: P.map(() => false) });
    ZS.splice(1, 0, (STATIONS[0] + STATIONS[1]) / 2);
  }
  const LI = [S[0].P[1][0] - 0.06, 0.24, podZ(S[0].P[1][0] - 0.06, 0.24)]; // the face's lower inner corner, by the fascia
  const lists = new Map(), list = (k) => lists.get(k) ?? lists.set(k, triList()).get(k);
  const mir = (p, s) => [p[0] * s, p[1], p[2]];
  // the strip quads of the +x side: outward, area-weighted facet normals (null where a quad collapses)
  const NQ = S.length - 1, Q = [];
  for (let i = 0; i < NQ; i++) {
    const A = S[i], B = S[i + 1], zm = (ZS[i] + ZS[i + 1]) / 2, row = [];
    for (let j = 0; j < 8; j++) {
      const liner = A.tuck[j + 1] || B.tuck[j + 1], a = A.P[j], b = A.P[j + 1], c = B.P[j + 1], d = B.P[j];
      const n = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).cross(new THREE.Vector3(d[0] - b[0], d[1] - b[1], d[2] - b[2]));
      if (n.lengthSq() < 1e-12) { row.push(null); continue; }
      const cx = (a[0] + b[0] + c[0] + d[0]) / 4;
      // the points run round the section from the top centre and the stations from the nose, so the raw cross is
      // outward everywhere, inward-facing faces too (the pods' inner chamfers); the arch liner faces down and out
      if (liner && n.x * cx - n.y < 0) n.negate();
      row.push({ n, u: n.clone().normalize(), mat: stripMat(j, zm, liner), door: j >= 2 && j <= 5 && zm < DOOR_F && zm > DOOR_R });
    }
    Q.push(row);
  }
  // corner normals: smooth along a strip (the steel reads as a sculpted surface, not a pile of facets) unless it bends
  // more than ~40 degrees there; across strips only at the soft lines (the centre, 4 and 5) and under ~28 degrees, so
  // the bonnet edge, the pods' chamfer and crest and the belt stay crisp
  const ZC = Math.cos(0.7), XC = Math.cos(0.49), SOFT = [true, false, false, false, true, true, false, false, true];
  const qAt = (i, j) => (i >= 0 && i < NQ && j >= 0 && j < 8 ? Q[i][j] : null);
  const same = (q, r, c) => !!r && q.mat === r.mat && q.u.dot(r.u) > c;
  const cornerN = (i, j, ii, k) => {
    const q = Q[i][j], v = q.n.clone(), io = ii === i ? i - 1 : i + 1, qz = qAt(io, j);
    if (same(q, qz, ZC)) v.add(qz.n);
    if (SOFT[k]) {
      const qx = qAt(i, k === j ? j - 1 : j + 1);
      if (same(q, qx, XC)) { v.add(qx.n); const qd = qAt(io, k === j ? j - 1 : j + 1); if (same(qx, qd, ZC)) v.add(qd.n); }
      if (k === 0 || k === 8) v.x = 0; // the centre line: the mirrored strip's normal cancels the side component
    }
    return v.normalize();
  };
  for (let i = 0; i < NQ; i++) {
    for (let j = 0; j < 8; j++) {
      const q = Q[i][j]; if (!q) continue;
      const P = [S[i].P[j], S[i].P[j + 1], S[i + 1].P[j + 1], S[i + 1].P[j]];
      const N = [cornerN(i, j, i, j), cornerN(i, j, i, j + 1), cornerN(i, j, i + 1, j + 1), cornerN(i, j, i + 1, j)];
      for (const s of [1, -1]) {
        list(q.door ? `door${s}|${q.mat}` : q.mat).quadN(...P.map((p) => mir(p, s)), [q.n.x * s, q.n.y, q.n.z], ...N.map((n) => [n.x * s, n.y, n.z]));
      }
    }
  }
  // a convex polygon as one facet (fanned from its centre)
  const poly = (L, pts, out) => {
    const c = pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length], [0, 0, 0]);
    for (let k = 0; k < pts.length; k++) L.tri(c, pts[k], pts[(k + 1) % pts.length], out);
  };
  // the nose: each pod's front face (from the bonnet's corner up the inner wall, across under the pod top and down
  // the outer edge), its upper part the raked brow with the headlight, and a dark lower corner; between the pods the
  // black fascia (a box, set in under the light line) under the bonnet's bowed lip
  const n = S[0].P, LIb = [LI[0], n[7][1], NOSE - 0.06];
  const G = (() => { const t = (CHIN_Y - LI[1]) / (n[1][1] - LI[1]), x = lerp(LI[0], n[1][0], t); return [x, CHIN_Y, podZ(x, CHIN_Y)]; })();
  const E = (() => { const t = (n[3][1] - Y1) / (n[3][1] - n[4][1]); return [lerp(n[3][0], n[4][0], t), Y1, podZ(lerp(n[3][0], n[4][0], t))]; })();
  for (const s of [1, -1]) {
    const m = (p) => mir(p, s);
    poly(list('paint'), [n[1], n[2], n[3], E].map(m), [s * 0.4, 0.6, 1]);           // the brow
    poly(list('paint'), [n[1], E, n[4], n[5], G].map(m), [0, 0, 1]);
    poly(list('paint'), [G, n[5], n[6], LI].map(m), [0, -0.5, 1]);                  // the chin
    list('carbon').quad(m(LI), m(n[6]), m(n[7]), m(LIb), [0, 0, 1]);
    list('paint').tri(m(n[1]), n[0], [0, n[1][1], NOSE + BOW], [0, 0, 1]);
  }
  // the tail: a flat Kamm panel down to the crease, the lower part tucks under
  const t = S[S.length - 1].P;
  poly(list('paint'), [t[0], t[1], t[2], t[3], t[4], ...[4, 3, 2, 1].map((k) => mir(t[k], -1))], [0, 0, -1]);
  list('paint').quad(t[4], t[5], mir(t[5], -1), mir(t[4], -1), [0, -0.3, -1]);
  poly(list('carbon'), [t[5], t[6], t[7], t[8], ...[7, 6, 5].map((k) => mir(t[k], -1))], [0, -0.3, -1]);
  // shut lines: thin dark strips laid on the facets (the doors' front and rear edges, the bonnet's cross line)
  const seam = (L, p, q, w, o) => { // segment p -> q, w wide along z, lifted by o (outward)
    const a = [p[0] + o[0], p[1] + o[1], p[2] + o[2]], b = [q[0] + o[0], q[1] + o[1], q[2] + o[2]];
    L.quad([a[0], a[1], a[2] + w], [b[0], b[1], b[2] + w], [b[0], b[1], b[2] - w], [a[0], a[1], a[2] - w], o);
  };
  for (const z of [DOOR_F, DOOR_R]) {
    const P = section(STATIONS.indexOf(z)).P;
    for (const s of [1, -1]) for (let k = 3; k < 6; k++) seam(list('black'), mir(P[k], s), mir(P[k + 1], s), 0.005, [s * 0.004, 0, 0]);
  }
  { // the bonnet's shut line, laid on its slope and crown
    const z = WSZ + 0.17, w = 0.006, xe = lin(T.x[1], z), x = xe - 0.02, y = (xx, zz) => lin(T.y[0], zz) + CROWN * (1 - xx / xe) + 0.004;
    for (const s of [1, -1]) list('black').quad([0, y(0, z + w), z + w], [s * x, y(x, z + w), z + w], [s * x, y(x, z - w), z - w], [0, y(0, z - w), z - w], [0, 1, 0]); }
  const MATS = { paint: M.paint, glass: M.glass, dark: M.dark, black: M.black, carbon: M.carbon };
  const doors = [];
  for (const [k, L] of lists) {
    const [grp, mat] = k.includes('|') ? k.split('|') : [null, k];
    if (grp) continue;
    const m = add(L.geometry(), MATS[mat], body, mat !== 'glass');
    if (mat === 'glass') { m.renderOrder = 2; m.userData.solo = true; m.receiveShadow = false; }
  }
  // butterfly doors: hinged on the roof rail (the top of the side glass), swinging up and out
  for (const s of [1, -1]) {
    const A = new THREE.Vector3(s * lin(T.x[2], DOOR_F), lin(T.y[2], DOOR_F), DOOR_F);
    const B = new THREE.Vector3(s * lin(T.x[2], DOOR_R), lin(T.y[2], DOOR_R), DOOR_R);
    const axis = B.clone().sub(A).normalize();
    const hinge = new THREE.Group(); hinge.position.copy(A); hinge.userData.live = true; body.add(hinge);
    const leaf = new THREE.Group(); leaf.position.copy(A).negate(); hinge.add(leaf);
    for (const [k, L] of lists) {
      if (!k.startsWith(`door${s}|`)) continue;
      const mat = k.split('|')[1], m = add(L.geometry(), MATS[mat], leaf, mat !== 'glass');
      if (mat === 'glass') { m.renderOrder = 2; m.userData.solo = true; m.receiveShadow = false; }
    }
    // door card: dark panel, a trim strip and the red ambient line, inside the glass
    const dz = (DOOR_F + DOOR_R) / 2, dl = DOOR_F - DOOR_R - 0.08;
    box(0.03, 0.34, dl, s * 0.9, 0.5, dz, M.dash, leaf, false);
    box(0.012, 0.02, dl - 0.1, s * 0.88, 0.66, dz, M.trim, leaf, false);
    box(0.01, 0.008, dl - 0.2, s * 0.875, 0.6, dz, M.ambient, leaf, false);
    bakeStatic(leaf);
    // the sign that lifts the door's lower edge: the sill point must go up when turned by +a
    const p = new THREE.Vector3(s * 0.95, 0.3, dz).sub(A).applyAxisAngle(axis, 0.3).add(A);
    doors.push({ hinge, axis, sign: p.y > 0.3 ? 1 : -1, open: 0 });
  }

  // ---- nose: the light line along the bonnet's leading edge, the fascia, the splitter, the headlight notches
  box(2 * n[1][0], 0.013, 0.02, 0, n[1][1] - 0.008, NOSE + 0.004, M.head, body, false);
  { const top = n[1][1] - 0.005, bot = 0.22;
    const mid = 0.31;                                                                              // the fascia, set in: an upper band
    box(2 * n[1][0], top - mid, 0.36, 0, (top + mid) / 2, NOSE - 0.06 - 0.18, M.carbon);
    box(2 * LI[0] - 0.08, mid - bot, 0.3, 0, (mid + bot) / 2, NOSE - 0.25 - 0.15, M.black);              // the lower intake, deeper in
    box(0.85, 0.045, 0.02, 0, 0.245, NOSE - 0.245, M.dash, body, false);                           // its slot
    box(0.07, 0.03, 0.02, 0, 0.36, NOSE - 0.052, M.trim, body, false); }                          // the radar eye
  { // splitter: a black lip across the full width, swept back at its ends
    const sh = new THREE.Shape([[-0.8, -0.56], [-0.66, -0.02], [0.66, -0.02], [0.8, -0.56]].map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, 0.17, NOSE - 0.06);
    add(g, M.black);
  }
  { // headlights: an inverted triangle in each pod face's top inner corner, just under the pod top and outboard of the
    // bonnet's corner: a black pocket, the lamp inset in it, both laid on the face plane
    const pocket = triList(), lamp = triList(), bn = new THREE.Vector3(Math.tan(POD_CANT), TR, 1).normalize();
    const HL = [[n[2][0] + 0.004, n[2][1] - 0.008], [n[3][0] - 0.006, n[3][1] - 0.014], [n[2][0] + 0.04, Y1 + 0.03]];
    for (const s of [1, -1]) {
      const nrm = [s * bn.x, bn.y, bn.z];
      const on = (x, y, o) => [s * x + nrm[0] * o, y + nrm[1] * o, podZ(x, y) + nrm[2] * o];
      const cx = (HL[0][0] + HL[1][0] + HL[2][0]) / 3, cy = (HL[0][1] + HL[1][1] + HL[2][1]) / 3;
      const at = (k, o) => HL.map(([x, y]) => on(cx + (x - cx) * k, cy + (y - cy) * k, o));
      pocket.tri(...at(1, 0.003), nrm);
      lamp.tri(...at(0.9, 0.005), nrm);
      box(0.012, 0.024, 0.07, s * 1.004, 0.62, 1.0, M.amber, body, false);                     // the side marker behind the arch
    }
    add(pocket.geometry(), M.black, body, false); add(lamp.geometry(), M.head, body, false);
  }

  // ---- tail: the light bar (a full-width line, a brighter centre, a thin bar above), plate, diffuser, nozzles, fins.
  // The panel under the deck lip leans in toward its foot: tailZ(y) is its surface, TILT its lean.
  const t4 = S[S.length - 1].P[4], t5 = S[S.length - 1].P[5];
  const tailZ = (y) => lerp(t4[2], t5[2], clamp((t4[1] - y) / (t4[1] - t5[1]), 0, 1)), TILT = Math.atan2(t5[2] - t4[2], t4[1] - t5[1]);
  const tb = (w, h, d, y, o, mat) => { box(w, h, d, 0, y, tailZ(y) - o, mat, body, false).rotation.x = -TILT; };
  tb(1.97, 0.06, 0.02, BAR_Y, 0.012, M.dark);
  tb(1.92, 0.016, 0.02, BAR_Y - 0.008, 0.024, M.tail);
  tb(0.82, 0.02, 0.02, BAR_Y - 0.008, 0.027, M.tailHi);
  tb(1.0, 0.006, 0.02, BAR_Y + 0.018, 0.024, M.tail);
  {
    const tex = logoTexture('everlabs', { width: 1024, color: '#15161a', plate: { bg: '#f2f3ef', edge: '#202226' } }), w = 0.44, h = w * tex.userData.aspect;
    const m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ name: 'RdPlate', map: tex, roughness: 0.4, metalness: 0.1 }), body, false);
    m.position.set(0, 0.72, tailZ(0.72) - 0.006); m.rotation.set(-TILT, Math.PI, 0);
  }
  // the diffuser: a lip at the panel's foot, a floor block set in under it, deep fins between the four nozzles
  box(1.9, 0.03, 0.1, 0, t5[1] - 0.015, t5[2] + 0.01, M.carbon);
  box(1.5, 0.3, 0.25, 0, 0.39, DIF_Z + 0.175, M.black);
  const NOZ = [-0.45, -0.15, 0.15, 0.45];
  {
    const ring = new THREE.TorusGeometry(0.032, 0.008, 6, 16), cup = new THREE.CylinderGeometry(0.03, 0.027, 0.1, 14, 1, true); cup.rotateX(Math.PI / 2);
    const disc = new THREE.CircleGeometry(0.028, 14);
    for (const x of NOZ) {
      add(ring, M.bronze, body, false).position.set(x, NOZ_Y, NOZ_Z);
      add(cup, M.bronze, body, false).position.set(x, NOZ_Y, NOZ_Z + 0.05);
      const d = add(disc, M.black, body, false); d.position.set(x, NOZ_Y, NOZ_Z + 0.04); d.rotation.y = Math.PI;
    }
    { const sh = new THREE.Shape([[0, 0.03], [0.16, 0], [0.16, 0.19], [0, 0.12]].map(([z, y]) => new THREE.Vector2(z, y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(0.006, 0.24, TAIL + 0.1);
      for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) add(g, M.carbon, body, false).position.x = x; }
  }
  // belly nozzles (the jump and hover jets), barely seen from outside
  const BELLY = [[0.62, 0.95], [-0.62, 0.95], [0.62, -0.95], [-0.62, -0.95]];
  { const g = new THREE.CircleGeometry(0.07, 12); g.rotateX(Math.PI / 2); for (const [x, z] of BELLY) add(g, M.bronze, body, false).position.set(x, 0.145, z); }

  // ---- rear wing: rises from the deck on two swan-neck stalks while driving, folds into it when stopped or flying
  const DECK_Y = lin(T.y[0], -2.02);
  const wing = new THREE.Group(); wing.name = 'RdWing'; wing.position.set(0, DECK_Y, -2.02); wing.userData.live = true; body.add(wing);
  {
    for (const x of [-0.34, 0.34]) { const st = box(0.03, 0.34, 0.14, x, 0.16, 0.02, M.carbon, wing); st.rotation.x = -0.2; }
    const blade = box(1.96, 0.035, 0.36, 0, 0.33, -0.04, M.paint, wing); blade.rotation.x = 0.1;
    box(1.9, 0.012, 0.05, 0, 0.345, -0.22, M.carbon, wing, false);
    for (const x of [-0.99, 0.99]) box(0.02, 0.16, 0.42, x, 0.31, -0.04, M.carbon, wing);
    bakeStatic(wing);
    wing.visible = false;
  }

  // ---- wheels: tyre, sidewalls, a dark aero face with six bright twisted blades and a bright lip
  const R = RW, TW = 0.28;
  const tire = new THREE.CylinderGeometry(R - 0.01, R - 0.01, TW, 30); tire.rotateZ(Math.PI / 2);
  const side = new THREE.TorusGeometry(R - 0.035, 0.03, 4, 30); side.rotateY(Math.PI / 2);
  const face = new THREE.CylinderGeometry(0.31, 0.31, 0.03, 30); face.rotateZ(Math.PI / 2);
  const lip = new THREE.RingGeometry(0.297, 0.314, 30, 1); lip.rotateY(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.042, 0.042, 0.05, 14); hub.rotateZ(Math.PI / 2);
  // a swept aero blade: narrow at the hub, broad at the rim (shape in tangential x radial, extruded along the axle)
  const bladeG = new THREE.ExtrudeGeometry(new THREE.Shape([[-0.03, 0.04], [0.03, 0.04], [0.19, 0.302], [-0.06, 0.302]].map(([t, r]) => new THREE.Vector2(t, r))), { depth: 0.014, bevelEnabled: false });
  bladeG.rotateY(Math.PI / 2);
  function makeWheel(parent, sx, x = 0) {
    const h = new THREE.Group(); h.position.x = x; parent.add(h);
    add(tire, M.tire, h);
    for (const k of [1, -1]) add(side, M.tire, h, false).position.x = k * (TW / 2 - 0.03);
    const o = sx * TW / 2;
    add(face, M.rim, h).position.x = o;
    { const l = add(lip, M.blade, h, false); l.position.x = o + sx * 0.017; if (sx < 0) l.rotation.y = Math.PI; }
    add(hub, M.blade, h, false).position.x = o + sx * 0.01;
    for (let k = 0; k < 6; k++) { // six broad swept spokes
      const b = add(bladeG, M.blade, h, false); b.position.x = o + sx * 0.012;
      b.rotation.set(k / 6 * Math.PI * 2, sx * 0.4, 0, 'XYZ');
    }
  }
  const wheels = [[1, RDIM.wheelX], [-1, -RDIM.wheelX], [null, 0]].map(([sx, x]) => {
    const piv = new THREE.Group(); piv.position.set(x, R, sx ? WC : -WC); piv.userData.live = true; body.add(piv);
    const spin = new THREE.Group(); piv.add(spin);
    if (sx) makeWheel(spin, sx); else for (const s of [1, -1]) makeWheel(spin, s, s * RDIM.wheelX);
    bakeStatic(spin);
    return { piv, spin, front: !!sx };
  });

  // ---- interior: floor, bulkheads, the low dark dash with its red strip, the centre screen, console, seats, yoke
  const interior = new THREE.Group(); body.add(interior);
  const screen = makeScreen();
  const ib = (w, h, d, x, y, z, mat, parent = interior) => box(w, h, d, x, y, z, mat, parent, false);
  const limb = (p0, p1, r, mat, parent = interior) => {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), m = add(new THREE.CapsuleGeometry(r, Math.max(0.001, a.distanceTo(b)), 4, 10), mat, parent, false);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return m;
  };
  let yokeBase, yoke;
  {
    ib(1.5, 0.02, 1.95, 0, 0.2, -0.05, M.carpet);
    ib(1.5, 0.5, 0.04, 0, 0.45, 1.02, M.dash);                 // footwell front
    ib(1.5, 0.76, 0.04, 0, 0.57, CABIN_END + 0.01, M.dash);   // the bulkhead behind the seats (under the rear glass)
    ib(1.5, 0.12, 0.42, 0, 0.68, 0.78, M.dash);               // the low dash under the windshield
    ib(1.46, 0.016, 0.01, 0, 0.66, 0.565, M.ambient);         // red ambient strip along its face
    ib(1.46, 0.012, 0.36, 0, 0.745, 0.8, M.carbon);           // dash top
    ib(0.26, 0.24, 1.5, 0, 0.33, -0.15, M.dash);              // tunnel / console
    ib(0.22, 0.015, 0.9, 0, 0.455, 0.05, M.trim);
    ib(0.02, 0.004, 1.2, 0.12, 0.45, -0.1, M.ambient); ib(0.02, 0.004, 1.2, -0.12, 0.45, -0.1, M.ambient);
    for (const s of [1, -1]) ib(0.08, 0.5, 1.9, s * 0.86, 0.42, -0.05, M.dash); // sills inside
    // sport seats: low cushion, high side bolsters, a reclined back with wings, integrated headrest, grey stripes
    for (const s of [1, -1]) {
      const seat = new THREE.Group(); seat.position.set(s * 0.4, 0.24, -0.38); interior.add(seat);
      ib(0.46, 0.08, 0.5, 0, 0.04, 0.08, M.seat, seat);
      ib(0.14, 0.05, 0.46, 0, 0.09, 0.08, M.stripe, seat);
      for (const k of [1, -1]) { const b = ib(0.08, 0.12, 0.48, k * 0.21, 0.1, 0.08, M.seat, seat); b.rotation.z = k * 0.25; }
      const back = new THREE.Group(); back.position.set(0, 0.06, -0.18); back.rotation.x = -0.32; seat.add(back);
      ib(0.44, 0.62, 0.09, 0, 0.31, 0, M.seat, back);
      ib(0.14, 0.5, 0.02, 0, 0.3, 0.05, M.stripe, back);
      for (const k of [1, -1]) { const w = ib(0.08, 0.5, 0.16, k * 0.21, 0.28, 0.04, M.seat, back); w.rotation.y = -k * 0.3; }
      ib(0.26, 0.14, 0.1, 0, 0.66, 0.0, M.seat, back);
    }
    // centre screen on the dash, turned toward the driver
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.187), new THREE.MeshBasicMaterial({ map: screen.tex, color: new THREE.Color(1.4, 1.4, 1.4) }));
    const sg = new THREE.Group(); sg.userData.live = true; sg.position.set(0.03, 0.82, 0.5); sg.rotation.set(0.3, Math.PI - 0.22, 0); interior.add(sg); sg.add(sc);
    box(0.335, 0.2, 0.016, 0, 0, -0.01, M.black, sg, false);
    ib(0.05, 0.1, 0.05, 0.03, 0.74, 0.54, M.black);
    // the yoke: two grips and a lower bar round a dark hub, on a column into the dash
    yokeBase = new THREE.Group(); yokeBase.userData.live = true; yokeBase.position.set(0.4, 0.645, 0.25); yokeBase.rotation.x = 0.5; interior.add(yokeBase);
    yoke = new THREE.Group(); yokeBase.add(yoke);
    for (const k of [1, -1]) limb([k * 0.15, -0.06, 0], [k * 0.15, 0.07, 0], 0.024, M.seat, yoke);
    limb([-0.15, -0.075, 0], [0.15, -0.075, 0], 0.016, M.black, yoke);
    for (const k of [1, -1]) limb([k * 0.04, -0.01, 0], [k * 0.15, 0.02, 0], 0.014, M.black, yoke);
    { const g = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 18); g.rotateX(Math.PI / 2); add(g, M.dash, yoke, false).position.z = -0.01; }
    limb([0.4, 0.635, 0.28], [0.4, 0.6, 0.62], 0.035, M.dash);
  }
  // ---- driver: low seat, legs out, arms to the grips (re-solved as the yoke turns)
  const driver = new THREE.Group(); interior.add(driver);
  const head = new THREE.Group(); head.userData.live = true; head.position.set(0.4, 0.94, -0.37); driver.add(head);
  const L1 = 0.3, L2 = 0.28;
  const arms = [];
  {
    limb([0.4, 0.42, -0.5], [0.4, 0.74, -0.42], 0.12, M.hoodie, driver).scale.set(1.3, 1, 0.8);   // torso, reclined
    limb([0.23, 0.79, -0.42], [0.57, 0.79, -0.42], 0.065, M.hoodie, driver);
    limb([0.32, 0.36, -0.38], [0.48, 0.36, -0.38], 0.095, M.jeans, driver);
    limb([0.4, 0.82, -0.4], [0.4, 0.88, -0.38], 0.042, M.skin, driver);
    const skull = add(new THREE.SphereGeometry(0.1, 14, 10), M.skin, head, false); skull.scale.set(0.92, 1.12, 1);
    const hair = add(new THREE.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), M.hair, head, false); hair.position.set(0, 0.022, -0.012); hair.scale.set(0.93, 1.1, 1.02);
    ib(0.15, 0.032, 0.02, 0, 0.02, 0.092, M.black, head);
    for (const k of [1, -1]) {
      const x = 0.4 + k * 0.1, kx = 0.4 + k * 0.11;
      limb([x, 0.36, -0.34], [kx, 0.46, 0.12], 0.07, M.jeans, driver);
      limb([kx, 0.46, 0.12], [kx + k * 0.01, 0.28, 0.62], 0.054, M.jeans, driver);
      ib(0.1, 0.07, 0.24, kx + k * 0.01, 0.25, 0.7, M.black, driver);
    }
    const up = new THREE.CapsuleGeometry(0.042, L1, 4, 10), fore = new THREE.CapsuleGeometry(0.034, L2, 4, 10), palm = new THREE.SphereGeometry(0.044, 10, 8);
    for (const sh of [new THREE.Vector3(0.58, 0.79, -0.42), new THREE.Vector3(0.22, 0.79, -0.42)]) {
      const a = { sh, up: add(up, M.hoodie, driver, false), fore: add(fore, M.hoodie, driver, false), hand: add(palm, M.skin, driver, false), side: sh.x > 0.4 ? 1 : -1 };
      a.hand.scale.set(0.9, 1.1, 0.8); for (const m of [a.up, a.fore, a.hand]) m.userData.live = true; arms.push(a);
    }
  }
  const _h = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const bone = (m, a, b) => { m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_up, _d.subVectors(b, a).normalize()); };
  function poseArms() { // hands on the grips (they turn with the yoke), two-bone arms, elbows out and down
    yokeBase.updateMatrix(); yoke.updateMatrix();
    for (const a of arms) {
      _h.set(a.side * 0.15, 0.01, -0.02).applyMatrix4(yoke.matrix).applyMatrix4(yokeBase.matrix);
      const d = Math.min(a.sh.distanceTo(_h), L1 + L2 - 0.005), dir = _d.subVectors(_h, a.sh).normalize();
      const k = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, L1 * L1 - k * k));
      _p.set(a.side * 0.8, -1, -0.1); _p.addScaledVector(dir, -_p.dot(dir)).normalize();
      _e.copy(a.sh).addScaledVector(dir, k).addScaledVector(_p, hgt);
      _h.copy(a.sh).addScaledVector(dir, d);
      bone(a.up, a.sh, _e); bone(a.fore, _e, _h); a.hand.position.copy(_h);
    }
  }
  poseArms();
  bakeStatic(interior, { receiveShadow: false });
  bakeStatic(head); bakeStatic(yoke);
  interior.userData.live = true;

  bakeStatic(body);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  // ---- gas jets: pale additive cones out of the belly and rear nozzles (length by thrust), puffs below
  const jetTex = gradTex([[0, 'rgba(160,200,255,0)'], [0.7, 'rgba(210,235,255,0.4)'], [1, 'rgba(255,255,255,0.9)']]); // v 1 = the apex at the nozzle
  const jetMat = new THREE.MeshBasicMaterial({ map: jetTex, color: new THREE.Color(1.6, 1.7, 1.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const jets = [];
  {
    const cone = new THREE.ConeGeometry(0.32, 1, 14, 1, true); cone.translate(0, -0.5, 0); // apex at the nozzle (y 0), opening down
    for (const [x, z] of BELLY) { const m = new THREE.Mesh(cone, jetMat); m.position.set(x, 0.12, z); m.userData.live = true; m.renderOrder = 10; m.visible = false; m.frustumCulled = false; body.add(m); jets.push({ m, down: true }); }
    for (const x of NOZ) { const m = new THREE.Mesh(cone, jetMat); m.position.set(x, NOZ_Y, NOZ_Z - 0.01); m.rotation.x = Math.PI / 2; m.userData.live = true; m.renderOrder = 10; m.visible = false; m.frustumCulled = false; body.add(m); jets.push({ m, down: false }); }
  }

  // ---------------------------------------------------------------- gas puffs
  const fx = createGasFx();
  const NZ = {
    belly: BELLY.map(([x, z]) => new THREE.Vector3(x, 0.14, z)),
    rear: NOZ.map((x) => new THREE.Vector3(x, NOZ_Y, NOZ_Z - 0.02)),
    vent: [[0.98, 0.3, 0.95], [-0.98, 0.3, 0.95], [0.98, 0.32, -0.95], [-0.98, 0.32, -0.95]].map((p) => new THREE.Vector3(...p)),
  };
  const _w = new THREE.Vector3(), _dir = new THREE.Vector3(), _side = new THREE.Vector3();
  const rnd = (a) => (Math.random() * 2 - 1) * a;
  let accDown = 0, accRear = 0, accVent = 0;
  function emit(dt, st) {
    const W = body.matrixWorld, vel = st.velocity || { x: 0, y: 0, z: 0 }, gy = Number.isFinite(st.groundY) ? st.groundY : -1e3;
    // the jump: one blast from the belly that hits the ground and rolls out
    if (st.burst > 0) {
      const n = Math.round(70 + 170 * st.burst);
      for (let i = 0; i < n; i++) {
        _w.copy(NZ.belly[i & 3]).applyMatrix4(W);
        const sp = 14 + 12 * st.burst;
        fx.emit(_w.x + rnd(0.2), _w.y, _w.z + rnd(0.2), rnd(3) + vel.x * 0.2, -sp * (0.6 + Math.random() * 0.5), rnd(3) + vel.z * 0.2,
          1.1 + Math.random() * 1.2, 0.3, 2.2 + 1.6 * st.burst, 0.5, gy);
      }
    }
    // hover / balance jets: a steady stream down
    accDown += dt * 220 * st.gasDown;
    _dir.set(0, -1, 0).transformDirection(W);
    while (accDown >= 1) {
      accDown--;
      _w.copy(NZ.belly[(Math.random() * 4) | 0]).applyMatrix4(W);
      const sp = 14 + 10 * st.gasDown, j = Math.random() * dt; // spread over the frame, so the stream has no gaps
      fx.emit(_w.x + _dir.x * sp * j, _w.y + _dir.y * sp * j, _w.z + _dir.z * sp * j, _dir.x * sp + rnd(1.5) + vel.x * 0.6, _dir.y * sp + vel.y * 0.6, _dir.z * sp + rnd(1.5) + vel.z * 0.6,
        0.6 + Math.random() * 0.5, 0.15, 1.5, 0.26, gy);
    }
    // forward thrust: the four rear nozzles
    accRear += dt * 200 * st.gasRear;
    _dir.set(0, 0, -1).transformDirection(W);
    while (accRear >= 1) {
      accRear--;
      _w.copy(NZ.rear[(Math.random() * 4) | 0]).applyMatrix4(W);
      const sp = 16 + 10 * st.gasRear, j = Math.random() * dt;
      fx.emit(_w.x + _dir.x * sp * j, _w.y + _dir.y * sp * j, _w.z + _dir.z * sp * j, _dir.x * sp + rnd(0.8) + vel.x * 0.7, _dir.y * sp + rnd(0.8) + vel.y * 0.7, _dir.z * sp + rnd(0.8) + vel.z * 0.7,
        0.45 + Math.random() * 0.4, 0.1, 1.2, 0.3, gy);
    }
    // charging: pressure bleeds from the sill vents and the belly, more and faster as it builds
    accVent += dt * (st.charge > 0.005 ? 20 + 110 * st.charge : 0);
    while (accVent >= 1) {
      accVent--;
      const k = (Math.random() * 4) | 0;
      _w.copy(k < 2 || Math.random() < 0.5 ? NZ.vent[k] : NZ.belly[k]).applyMatrix4(W);
      _side.set(Math.sign(NZ.vent[k].x) * (2 + 4 * st.charge), -1 - 2 * st.charge, rnd(1)).transformDirection(W).multiplyScalar(2 + 4 * st.charge);
      fx.emit(_w.x, _w.y, _w.z, _side.x + rnd(0.6) + vel.x * 0.8, _side.y, _side.z + rnd(0.6) + vel.z * 0.8, 0.4 + Math.random() * 0.5, 0.08, 0.5 + 0.6 * st.charge, 0.16 + 0.24 * st.charge, gy);
    }
  }

  // ---------------------------------------------------------------- per-frame pose
  let time = 0, dispT = 0, glassIn = false, wingK = 0, wingUp = false, doorK = 0, blastK = 0;
  function set(st, dt) {
    time += dt;
    body.position.y = st.heave || 0;
    body.rotation.set(-(st.bodyPitch || 0), 0, st.bodyRoll || 0, 'YXZ');
    for (const w of wheels) { w.piv.rotation.y = w.front ? st.steer : 0; w.spin.rotation.x = st.wheelAngle; }
    yoke.rotation.z = clamp(-st.steer * 4, -1.7, 1.7);
    if (interior.visible) poseArms();
    head.visible = !st.cockpit;
    // rear wing: up while driving on the ground (over WING_UP, down again under WING_DOWN), folded when stopped or flying
    const sp = Math.abs(st.speed || 0);
    wingUp = !st.air && (wingUp ? sp > WING_DOWN : sp > WING_UP);
    wingK = clamp(wingK + dt * (wingUp ? 1.4 : -1.1), 0, 1);
    wing.visible = wingK > 0.01;
    if (wing.visible) { const k = smooth(wingK); wing.position.y = lerp(DECK_Y - 0.3, DECK_Y, k); wing.scale.set(1, lerp(0.15, 1, k), 1); }
    // butterfly doors: open while parked in the chase view
    doorK = clamp(doorK + dt * (st.parked && !st.cockpit ? 0.8 : -2.2), 0, 1);
    for (const d of doors) d.hinge.quaternion.setFromAxisAngle(d.axis, d.sign * 1.15 * smooth(doorK));
    M.tail.emissiveIntensity = st.brake ? 4.5 : 1.4;
    M.head.emissiveIntensity = st.night ? 3.6 : 2.4;
    if (glassIn !== !!st.cockpit) {
      glassIn = !!st.cockpit;
      Object.assign(M.glass, glassIn ? { opacity: 0.12, clearcoat: 0.12, envMapIntensity: 0.3 } : { opacity: 0.95, clearcoat: 0.6, envMapIntensity: 0.35 });
    }
    dispT -= dt; if (dispT <= 0 && st.cockpit) { dispT = 1 / 15; screen.draw(st); }
    // jets: the belly cones by the lift thrust (a long flash on the jump), the rear ones by the forward thrust
    if (st.burst > 0) blastK = 0.25 + 0.75 * st.burst;
    blastK = Math.max(0, blastK - dt * 2.5);
    for (const j of jets) {
      const k = j.down ? Math.max(st.gasDown || 0, blastK) : st.gasRear || 0, on = k > 0.03;
      j.m.visible = on;
      if (on) {
        const fl = 0.85 + 0.15 * Math.sin(time * 61 + j.m.position.x * 9), r = j.down ? 0.45 + 0.6 * k : 0.3 + 0.25 * k;
        j.m.scale.set(r, (0.5 + (j.down ? 2.4 : 1.8) * k) * fl, r);
      }
    }
    // gas: emit from this frame's pose, then age the puffs
    if (fx.object.parent) {
      if (st.burst > 0 || st.gasDown > 0.01 || st.gasRear > 0.01 || st.charge > 0.005) {
        (root.parent ?? root).updateMatrixWorld(true); // emit() reads the nozzles' world pose: car.js posed the car's node this frame
        emit(dt, st);
      }
      fx.update(dt, st.light ?? 1);
    }
  }
  return { object: root, body, set, eye: EYE.clone(), interior, driver, materials: M, fx: fx.object, gas: fx, get wing() { return wingK; } };
}
