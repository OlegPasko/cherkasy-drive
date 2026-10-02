// OWNER: cherkasy. A light plane over the city: a Piper PA-18 Super Cub style taildragger (high strut-braced wing, one
// prop, tundra tyres) in a Ukrainian livery – a fictional registration UR-CKD, no airline, no military marks: the
// fuselage blue over yellow (#0057B7 / #FFD700) with a white pinstripe at the split, the fin and rudder the flag, yellow
// wings and tailplane with blue tips. It flies one wide closed loop round the city at 27 m/s (~100 km/h), a constant
// ~190 m over the river (~150 m over the highest ground under the loop): north-west off Sosnivka, down the Dnipro 150 m
// out over the water past the Kazbet beach, the Rose Valley, the Mytnytsia beach and the embankment to the river
// station, then inland and back up over bul. Shevchenka and the centre (Druzhba, Soborna square), turning out to the
// river short of the TV tower. A lap is ~8 min, paced by the wall clock (like the balloon), so every player sees it in
// the same place. It banks into the turns (a coordinated turn: lift = g + the centripetal pull, capped at 35 degrees),
// the prop is a spinning blurred disc, and at dusk and night it shows red / green / white nav lights; the double-flash
// wingtip strobes run day and night. Its engine is heard only right next to it (src/audio/game.js reads `plane`).
//
// The model (~4k vertices, one mesh): a lofted fuselage (superellipse sections, smooth normals; the livery, windows,
// door outline and registration painted on a canvas in side projection, glossy glass from a roughness / metalness
// map), a lofted airfoil wing with dihedral, rounded tips and hinge lines, streamlined V struts, flat tail panels with
// open hinge gaps, the gear with tundra tyres, the tail wheel, exhaust and pitot.
//   buildPlane({ root, heightAt }) -> { update(dt), clear(x, z), plane: { x, y, z, fx, fz (heading), d (m along the loop), lap (s) } }
// No collision (the car flies through it); 3 draw calls; the update allocates nothing.
import * as THREE from 'three';
import { MB, rotX } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { WATER_Y } from '../water.js';

// the loop (map x, z), a closed centripetal Catmull-Rom: the shore leg ~150 m out over the water (sampled off
// ground.isWater), then inland over bul. Shevchenka and the centre, turning back to the river 500 m short of the TV tower
const LOOP = [
  [520, -2280], [800, -2350], [1000, -1700], [1060, -1150], [1080, -600], [1090, -50], [1300, 450], [1180, 1050],
  [1180, 1600], [1600, 2050], [1720, 2350], [1500, 2800], [1300, 3200], [800, 3500], [200, 3200], [-60, 2400],
  [-40, 1500], [10, 700], [80, 0], [160, -800], [260, -1500], [330, -2000]];
const SPEED = 27, G = 9.81, MAX_BANK = 35 * Math.PI / 180;
const ALT = 190, CLEAR = 150;         // m over the river datum / at least over the highest ground under the loop
const DS = 4;                         // path sample spacing (m)
const BLUE = '#0057b7', YELLOW = '#ffd700', DKBLUE = '#0a2f66', HINGE = '#7a6510', WHITE = '#f3f4f1', GLASS = '#1a2531';
const STRUT = '#aeb3b8', DARK = '#2b2e32', TYRE = '#1b1b1c', HUB = '#c9ccd0', EXH = '#4a4440';

// ---- fuselage: key sections (x forward, half width, y bottom, y top, superellipse exponent: round cowl -> boxy cabin)
const FK = [[3.02, 0.25, -0.2, 0.3, 2.2], [2.94, 0.33, -0.31, 0.4, 2.3], [2.75, 0.4, -0.41, 0.48, 2.5], [2.4, 0.43, -0.48, 0.55, 2.8],
  [2.0, 0.45, -0.53, 0.63, 3.2], [1.5, 0.455, -0.56, 0.76, 3.6], [1.05, 0.455, -0.58, 0.83, 4], [0, 0.445, -0.58, 0.85, 4],
  [-0.6, 0.42, -0.55, 0.84, 4], [-1.3, 0.36, -0.46, 0.7, 3.6], [-2.3, 0.27, -0.32, 0.56, 3.2], [-3.4, 0.17, -0.13, 0.43, 3],
  [-4.2, 0.08, 0.06, 0.34, 2.6], [-4.48, 0.03, 0.13, 0.3, 2.4]];
const RING = 40;                                           // vertices round a section (j = 0 the keel, 10 right, 20 the top)
const X0 = -4.5, X1 = 3.05, Y0 = -0.62, Y1 = 0.9, UX = 0.9; // the livery canvas: x -> u in [0, UX], y -> v per side half
const WHITE_UV = [0.97, 0.5];                              // a plain white texel for the vertex-coloured parts
// ---- wing: 1.6 m chord from x 1.05, chord line at y 0.87, 1.5 degree dihedral outboard of the cabin, 10.7 m span
const WLE = 1.05, CH = 1.6, WY = 0.87, DIH = Math.tan(1.5 * Math.PI / 180), TIP = 5.35, ROUND = 0.4, BLUETIP = 4.6;
const dih = (z) => Math.max(0, Math.abs(z) - 0.45) * DIH;
// USA-35B-like section (x / chord, y / chord), the ring from the upper trailing edge round the nose; h = a hinge line row
const UP = [[0, 0], [0.0125, 0.0315], [0.025, 0.042], [0.05, 0.057], [0.1, 0.077], [0.2, 0.096], [0.3, 0.1], [0.4, 0.098], [0.5, 0.091],
  [0.6, 0.08], [0.7, 0.066], [0.8, 0.048], [0.9, 0.027], [1, 0.002]];
const LO = [[0, 0], [0.0125, -0.016], [0.025, -0.019], [0.05, -0.021], [0.1, -0.02], [0.2, -0.016], [0.4, -0.009], [0.6, -0.004], [0.8, 0], [1, 0]];
const lerpY = (T, x) => { let i = 1; while (i < T.length - 1 && T[i][0] < x) i++; const [a, b] = [T[i - 1], T[i]]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); };
const FOIL = [...[1, 0.9, 0.8, 0.76, 0.74, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0.025, 0.0125, 0].map((x) => [x, lerpY(UP, x), x === 0.76 || x === 0.74]),
  ...[0.0125, 0.025, 0.05, 0.1, 0.2, 0.4, 0.6, 0.7, 0.74, 0.76, 0.8, 0.9, 1].map((x) => [x, lerpY(LO, x), x === 0.76 || x === 0.74])];
const SPAN = [0, 0.45, 1.3, 2.2, 3, 3.8, BLUETIP - 0.02, BLUETIP + 0.02, 4.95, 5.09, 5.19, 5.27, 5.32, TIP];

// a fuselage section at x: Catmull-Rom through FK
function station(x) {
  let k = 0; while (k < FK.length - 2 && x < FK[k + 1][0]) k++;
  const a = FK[k], b = FK[k + 1], p0 = FK[Math.max(0, k - 1)], p3 = FK[Math.min(FK.length - 1, k + 2)];
  const t = Math.min(1, Math.max(0, (a[0] - x) / (a[0] - b[0]))), out = [x];
  for (let q = 1; q < 5; q++) {
    const P0 = p0[q], P1 = a[q], P2 = b[q], P3 = p3[q];
    out.push(0.5 * (2 * P1 + (P2 - P0) * t + (2 * P0 - 5 * P1 + 4 * P2 - P3) * t * t + (3 * P1 - P0 - 3 * P2 + P3) * t * t * t));
  }
  return out;
}
const ySplit = (x) => { const s = station(x); return s[2] + 0.47 * (s[3] - s[2]); }; // the blue / yellow line, a little under mid-height

// smooth grid normals for a lofted surface G[i][j] (rows i, closed rings j): central differences, one global sign so they
// point away from the rows' centroids; a collapsed ring (a wing tip) takes the direction out along the rows
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function gridNormals(G) {
  const R = G.length, M = G[0].length, N = [];
  const C = G.map((row) => row.reduce((s, p) => [s[0] + p[0] / M, s[1] + p[1] / M, s[2] + p[2] / M], [0, 0, 0]));
  let sign = 0;
  for (let i = 0; i < R; i++) {
    N.push([]);
    for (let j = 0; j < M; j++) {
      const p = G[i][j];
      let n = cross(sub(G[i][(j + 1) % M], G[i][(j + M - 1) % M]), sub(G[Math.min(R - 1, i + 1)][j], G[Math.max(0, i - 1)][j]));
      if (Math.hypot(...n) < 1e-9) n = i === 0 ? sub(C[0], C[1]) : sub(C[i], C[i - 1]);
      else sign += dot(n, sub(p, C[i]));
      N[i].push(n);
    }
  }
  for (let i = 0; i < R; i++) for (let j = 0; j < M; j++) {
    const n = N[i][j], degenerate = Math.hypot(...sub(G[i][(j + 1) % M], G[i][j])) < 1e-9, l = Math.hypot(...n) * (sign < 0 && !degenerate ? -1 : 1);
    N[i][j] = [n[0] / l, n[1] / l, n[2] / l];
  }
  return N;
}
// rows i, ring indices j0..j1 (taken mod the ring) as quad strips; attr(i, j, p) sets the colour and returns [u, v]
function emitLoft(b, G, N, j0, j1, attr) {
  const M = G[0].length, ids = G.map((row, i) => {
    const out = [];
    for (let j = j0; j <= j1; j++) { const p = row[j % M], n = N[i][j % M], [u, v] = attr(i, j % M, p); out.push(b.vert(p[0], p[1], p[2], n[0], n[1], n[2], u, v)); }
    return out;
  });
  const tri = (a, c, d, pa, pc, pd, na) => { if (dot(cross(sub(pc, pa), sub(pd, pa)), na) >= 0) b.tri(a, c, d); else b.tri(a, d, c); };
  for (let i = 0; i < G.length - 1; i++) for (let k = 0; k < j1 - j0; k++) {
    const ja = (j0 + k) % M, jb = (j0 + k + 1) % M, P = [G[i][ja], G[i + 1][ja], G[i + 1][jb], G[i][jb]];
    const n = [0, 1, 2].map((q) => N[i][ja][q] + N[i + 1][ja][q] + N[i + 1][jb][q] + N[i][jb][q]);
    const I = [ids[i][k], ids[i + 1][k], ids[i + 1][k + 1], ids[i][k + 1]];
    if (Math.hypot(...sub(P[1], P[0])) + Math.hypot(...sub(P[2], P[3])) < 1e-9) continue;
    if (Math.hypot(...sub(P[2], P[1])) > 1e-9) tri(I[0], I[1], I[2], P[0], P[1], P[2], n);
    if (Math.hypot(...sub(P[3], P[0])) > 1e-9) tri(I[0], I[2], I[3], P[0], P[2], P[3], n);
  }
}

// Sutherland-Hodgman: the part of a polygon [[a, b], ...] with coordinate q above (keep > 0) or below a value
function clip(poly, q, val, above) {
  const out = [], inside = (p) => (above ? p[q] >= val : p[q] <= val);
  poly.forEach((p, i) => {
    const r = poly[(i + 1) % poly.length], a = inside(p), c = inside(r);
    if (a) out.push(p);
    if (a !== c) { const t = (val - p[q]) / (r[q] - p[q]); out.push([p[0] + (r[0] - p[0]) * t, p[1] + (r[1] - p[1]) * t]); }
  });
  return out;
}

const panel = (b, ring, y0, y1) => (ring.length > 2 ? b.extrude(ring, [], y0, y1, { bottom: true }) : b);

// the fuselage livery in side projection: the right side on the lower half of the canvas, the left side (mirrored, so
// it reads from outside) on the upper half; `rm` paints the roughness (G) / metalness (B) map with the same shapes
function paintLivery(g, W, H, rm) {
  const sx = (UX * W) / (X1 - X0), sy = H / 2 / (Y1 - Y0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = rm ? 'rgb(0,120,0)' : WHITE; g.fillRect(0, 0, W, H);
  const rr = (x0, y0, x1, y1, r) => { g.beginPath(); g.roundRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0), r); };
  for (const left of [false, true]) {
    g.setTransform(sx, 0, 0, -sy, -X0 * sx, (left ? H / 2 : H) + Y0 * sy); // metres in, y up
    g.save(); g.beginPath(); g.rect(X0, Y0, X1 - X0, Y1 - Y0); g.clip();
    if (!rm) {
      g.fillStyle = YELLOW; g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      g.fillStyle = BLUE; g.beginPath(); g.moveTo(X0, Y1);
      for (let x = X0; x <= X1 + 1e-6; x += 0.05) g.lineTo(x, ySplit(Math.min(x, FK[0][0])));
      g.lineTo(X1, Y1); g.closePath(); g.fill();
      g.strokeStyle = WHITE; g.lineWidth = 0.028; g.beginPath(); // the pinstripe
      for (let x = X0; x <= X1 + 1e-6; x += 0.05) g.lineTo(x, ySplit(Math.min(x, FK[0][0])));
      g.stroke();
      g.strokeStyle = 'rgba(10,20,40,0.45)'; g.lineWidth = 0.012; // the cowl joint behind the engine
      g.beginPath(); g.moveTo(2.02, Y0); g.lineTo(2.02, Y1); g.stroke();
    }
    // windscreen (wraps over the top and the corners), the door / front window, the rear window
    const wins = [[[1.97, 0.5], [1.1, 0.58], [1.06, 0.95], [1.99, 0.95]], [1.0, 0.27, 0.12, 0.79], [0.02, 0.3, -0.52, 0.79]];
    g.fillStyle = rm ? 'rgb(0,16,150)' : GLASS;
    for (const w of wins) {
      if (w.length === 4 && Array.isArray(w[0])) { g.beginPath(); w.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
      else rr(w[0], w[1], w[2], w[3], 0.07);
      g.fill();
      if (!rm) { g.strokeStyle = '#d9dee3'; g.lineWidth = 0.022; g.stroke(); }
    }
    if (!rm) {
      if (!left) { // the door (the Cub's is on the right): outline, hinge line between its halves, the handle
        g.strokeStyle = 'rgba(8,18,40,0.7)'; g.lineWidth = 0.014;
        rr(1.04, -0.36, 0.08, 0.81, 0.05); g.stroke();
        g.beginPath(); g.moveTo(1.04, 0.2); g.lineTo(0.08, 0.2); g.stroke();
        g.fillStyle = '#c8ccd0'; g.fillRect(0.16, 0.08, 0.12, 0.035);
      }
      // the registration, aft of the cabin on the yellow, reading from the tail toward the nose on both sides
      const px = (-2.35 - X0) * sx, py = (left ? H / 2 : H) - (-0.13 - Y0) * sy;
      g.setTransform(((left ? -1 : 1) * sx) / sy, 0, 0, 1, px, py);
      g.fillStyle = DKBLUE; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 ${Math.round(0.34 * sy)}px "Arial Narrow", Arial, sans-serif`;
      g.fillText('UR-CKD', 0, 0);
    }
    g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = rm ? 'rgb(0,120,0)' : '#ffffff'; g.fillRect(W * 0.93, 0, W * 0.07, H); // the white column
}

function buildModel() {
  const b = new MB();
  // ---- fuselage: rows nose -> tail, each ring split into the right and the left strip (their own side of the livery)
  const xs = [];
  for (let k = 0; k < FK.length - 1; k++) { const n = Math.max(1, Math.ceil((FK[k][0] - FK[k + 1][0]) / 0.28)); for (let q = 0; q < n; q++) xs.push(FK[k][0] + (FK[k + 1][0] - FK[k][0]) * q / n); }
  xs.push(FK.at(-1)[0]);
  const Gf = xs.map((x) => {
    const s = station(x), yc = (s[2] + s[3]) / 2, hh = (s[3] - s[2]) / 2, e = 2 / s[4], row = [];
    for (let j = 0; j < RING; j++) {
      const th = -Math.PI / 2 + (2 * Math.PI * j) / RING, c = Math.cos(th), sn = Math.sin(th);
      row.push([x, yc + hh * Math.sign(sn) * Math.abs(sn) ** e, s[1] * Math.sign(c) * Math.abs(c) ** e]);
    }
    return row;
  });
  const Nf = gridNormals(Gf), U = (x) => ((x - X0) / (X1 - X0)) * UX, V = (y) => ((y - Y0) / (Y1 - Y0)) * 0.5;
  b.setColor('#ffffff');
  emitLoft(b, Gf, Nf, 0, RING / 2, (i, j, p) => [U(p[0]), V(p[1])]);
  emitLoft(b, Gf, Nf, RING / 2, RING, (i, j, p) => [U(p[0]), 0.5 + V(p[1])]);
  const textured = b.v;
  // the cowl front (dark: the inlets round the spinner) and the tail post cap
  b.setColor(DARK).face(Gf[0].slice().reverse(), [1, 0, 0]);
  b.setColor(BLUE).face(Gf.at(-1), [-1, 0, 0]);
  // spinner (a lathe stands on +y: lay it along +x)
  b.setColor(WHITE).with(new THREE.Matrix4().makeRotationZ(-Math.PI / 2).setPosition(3.0, 0.05, 0),
    (s) => s.lathe([[0.175, 0], [0.172, 0.06], [0.155, 0.15], [0.12, 0.24], [0.07, 0.31], [0.02, 0.345], [0, 0.35]], 16));

  // ---- wing: an airfoil loft across the whole span
  const Gw = [], cols = [];
  for (const z of [...SPAN.slice(1).reverse().map((z) => -z), ...SPAN]) {
    const k = Math.abs(z) > 4.95 ? (Math.abs(z) - 4.95) / ROUND : 0, cs = Math.sqrt(Math.max(0, 1 - k * k)), y0 = WY + dih(z);
    Gw.push(FOIL.map(([fx, fy]) => [WLE - (0.4 + (fx - 0.4) * cs) * CH, y0 + fy * CH * cs, z]));
    cols.push(z);
  }
  const Nw = gridNormals(Gw);
  emitLoft(b, Gw, Nw, 0, FOIL.length, (i, j) => {
    const az = Math.abs(cols[i]), tip = az > BLUETIP, hinge = FOIL[j][2] && az > 0.55 && az < 4.95;
    b.setColor(hinge ? (tip ? DKBLUE : HINGE) : tip ? BLUE : YELLOW);
    return WHITE_UV;
  });
  // nav light lenses at the tips (the glow itself is the Points below)
  b.setColor('#d8262b').ellipsoid([WLE - 0.4 * CH, WY + dih(TIP), -TIP], [0.06, 0.035, 0.03], 8, 4);
  b.setColor('#22b04a').ellipsoid([WLE - 0.4 * CH, WY + dih(TIP), TIP], [0.06, 0.035, 0.03], 8, 4);

  // ---- struts: streamlined V struts from the lower longeron to the spars at 3 m out, jury struts, the pitot under the left wing
  const strut = (a, c, rw, rt) => {
    const ax = sub(c, a), len = Math.hypot(...ax); const u = ax.map((v) => v / len);
    let s = [1 - u[0] * u[0], -u[0] * u[1], -u[0] * u[2]]; const sl = Math.hypot(...s); s = s.map((v) => v / sl);
    const t = cross(s, u);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...s).multiplyScalar(rw), new THREE.Vector3(...u), new THREE.Vector3(...t).multiplyScalar(rt)).setPosition(...a);
    b.with(m, (q) => q.cyl(0, 0, 0, 1, 1, len, 8, false));
  };
  const yUnder = (x, z) => WY + dih(z) + lerpY(LO, (WLE - x) / CH) * CH - 0.005;
  b.setColor(STRUT);
  for (const s of [-1, 1]) {
    strut([0.92, -0.47, s * 0.43], [0.86, yUnder(0.86, 3), s * 3], 0.045, 0.018);
    strut([0.62, -0.47, s * 0.43], [0.06, yUnder(0.06, 3), s * 3], 0.045, 0.018);
    const fa = [0.9, -0.47 + (yUnder(0.86, 3) + 0.47) * 0.6, s * (0.43 + 2.57 * 0.6)], ra = [0.28, -0.47 + (yUnder(0.06, 3) + 0.47) * 0.6, s * (0.43 + 2.57 * 0.6)];
    b.tube(fa, [fa[0], yUnder(fa[0], fa[2]), fa[2]], 0.012, 4).tube(ra, [ra[0], yUnder(ra[0], ra[2]), ra[2]], 0.012, 4);
  }
  b.tube([0.75, yUnder(0.75, -3.6) - 0.08, -3.6], [1.25, yUnder(0.75, -3.6) - 0.08, -3.6], 0.012, 4).tube([0.8, yUnder(0.8, -3.6), -3.6], [0.8, yUnder(0.8, -3.6) - 0.08, -3.6], 0.01, 4);

  // ---- landing gear: V legs to the axles, tundra tyres (fat, soft-shouldered) with polished hubs; the tail wheel on its leaf spring
  const AX = 1.55, AY = -1.12, AZ = 0.98;
  b.setColor(DARK);
  for (const s of [-1, 1]) {
    b.tube([1.8, -0.5, s * 0.3], [AX, AY, s * 0.82], 0.035, 6).tube([1.05, -0.54, s * 0.32], [AX, AY, s * 0.82], 0.03, 6);
    b.tube([AX, AY, s * 0.78], [AX, AY, s * 1.0], 0.03, 6);
  }
  const tyre = [[0.13, -0.155], [0.29, -0.158], [0.36, -0.14], [0.395, -0.09], [0.405, 0], [0.395, 0.09], [0.36, 0.14], [0.29, 0.158], [0.13, 0.155]];
  for (const s of [-1, 1]) {
    b.setColor(TYRE).with(rotX(Math.PI / 2).setPosition(AX, AY, s * AZ), (q) => q.lathe(tyre, 24));
    b.setColor(HUB).with(rotX(Math.PI / 2).setPosition(AX, AY, s * AZ), (q) => q.cyl(0, -0.15, 0, 0.13, 0.1, 0.3, 12, true));
  }
  b.setColor(DARK).tube([-4.12, 0.07, 0], [-4.6, -0.14, 0], 0.02, 5, true);
  b.setColor(TYRE).with(rotX(Math.PI / 2).setPosition(-4.62, -0.18, 0), (q) => q.lathe([[0.03, -0.035], [0.085, -0.035], [0.1, 0], [0.085, 0.035], [0.03, 0.035]], 12));
  // exhaust stack under the cowl on the right, and a carb air box under the nose
  b.setColor(EXH).tube([2.35, -0.38, 0.16], [2.02, -0.6, 0.2], 0.035, 8, true);
  b.setColor(DARK).box(2.2, -0.52, -0.1, 2.55, -0.42, 0.1);

  // ---- tail: stabiliser + elevators and fin + rudder as flat panels with an open hinge gap; flag colours
  const STAB = [[-3.7, 0.06], [-3.78, 1.2], [-3.9, 1.45], [-4.05, 1.6], [-4.22, 1.66], [-4.4, 1.66], [-4.4, 0.06]];
  const ELEV = [[-4.43, 0.1], [-4.43, 1.66], [-4.55, 1.62], [-4.68, 1.5], [-4.78, 1.3], [-4.84, 1.0], [-4.86, 0.1]];
  for (const s of [-1, 1]) for (const P of [STAB, ELEV]) {
    const ring = P.map(([x, z]) => [x, s * z]);
    panel(b.setColor(YELLOW), clip(ring, 1, s * 1.3, s < 0), 0.29, 0.33);
    panel(b.setColor(BLUE), clip(ring, 1, s * 1.3, s > 0), 0.29, 0.33);
  }
  const FIN = [[-3.62, 0.36], [-4.2, 1.18], [-4.3, 1.26], [-4.41, 1.28], [-4.41, 0.3]];
  const RUD = [[-4.44, 0.04], [-4.44, 1.3], [-4.52, 1.36], [-4.64, 1.36], [-4.76, 1.28], [-4.86, 1.12], [-4.92, 0.88], [-4.93, 0.55], [-4.88, 0.25], [-4.78, 0.08], [-4.62, 0.02]];
  const SPLIT = 0.82; // blue over yellow
  b.with(rotX(-Math.PI / 2), (q) => { // (x, z) rings -> (x, height), thickness along z
    for (const P of [FIN, RUD]) {
      panel(q.setColor(BLUE), clip(P, 1, SPLIT, true), -0.03, 0.03);
      panel(q.setColor(YELLOW), clip(P, 1, SPLIT, false), -0.03, 0.03);
    }
  });
  // stabiliser bracing wires and the tail light
  b.setColor(STRUT);
  for (const s of [-1, 1]) b.tube([-4.3, 0.95, 0], [-4.3, 0.33, s * 1.1], 0.008, 4).tube([-4.3, 0.29, s * 1.1], [-4.1, 0.1, s * 0.07], 0.008, 4);
  b.setColor('#f0f0f0').ellipsoid([-4.94, 0.6, 0], [0.03, 0.04, 0.03], 6, 4);

  const geo = b.build();
  const uv = geo.attributes.uv;
  for (let i = textured; i < uv.count; i++) uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
  return geo;
}

export function buildPlane({ root, heightAt }) {
  const t0 = performance.now();
  // ---- the path: spaced samples with the heading and the banked "up" (lift) vector, all in flat arrays
  const curve = new THREE.CatmullRomCurve3(LOOP.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  curve.arcLengthDivisions = 6000;
  const total = curve.getLength(), N = Math.round(total / DS), ds = total / N;
  const pts = curve.getSpacedPoints(N); // N + 1 points, the last = the first
  const PX = new Float32Array(N), PZ = new Float32Array(N), FX = new Float32Array(N), FZ = new Float32Array(N);
  const UX_ = new Float32Array(N), UY = new Float32Array(N), UZ = new Float32Array(N);
  let hiGround = WATER_Y;
  for (let i = 0; i < N; i++) {
    PX[i] = pts[i].x; PZ[i] = pts[i].z;
    const h = heightAt(PX[i], PZ[i]); if (Number.isFinite(h)) hiGround = Math.max(hiGround, h);
  }
  const Y = Math.max(WATER_Y + ALT, hiGround + CLEAR);
  const w = (i) => (i + N) % N;
  for (let i = 0; i < N; i++) {
    const dx = PX[w(i + 1)] - PX[w(i - 1)], dz = PZ[w(i + 1)] - PZ[w(i - 1)], l = Math.hypot(dx, dz) || 1;
    FX[i] = dx / l; FZ[i] = dz / l;
  }
  // centripetal acceleration v^2 * curvature (dT/ds points to the turn centre), smoothed over ~±60 m so the roll eases in
  const K = 15, ax = new Float32Array(N), az = new Float32Array(N);
  for (let i = 0; i < N; i++) { ax[i] = SPEED * SPEED * (FX[w(i + 1)] - FX[w(i - 1)]) / (2 * ds); az[i] = SPEED * SPEED * (FZ[w(i + 1)] - FZ[w(i - 1)]) / (2 * ds); }
  const maxA = G * Math.tan(MAX_BANK);
  let maxBank = 0;
  for (let i = 0; i < N; i++) {
    let sx = 0, sz = 0;
    for (let k = -K; k <= K; k++) { sx += ax[w(i + k)]; sz += az[w(i + k)]; }
    sx /= 2 * K + 1; sz /= 2 * K + 1;
    const a = Math.hypot(sx, sz); if (a > maxA) { sx *= maxA / a; sz *= maxA / a; }
    const l = Math.hypot(sx, G, sz); UX_[i] = sx / l; UY[i] = G / l; UZ[i] = sz / l;
    maxBank = Math.max(maxBank, Math.acos(UY[i]));
  }
  // linear lookup at arc length d (wrapped): position, heading and the lift vector
  const S = { x: 0, z: 0, fx: 1, fz: 0, ux: 0, uy: 1, uz: 0 };
  const sample = (d) => {
    d = ((d % total) + total) % total;
    const f = d / ds, i = Math.floor(f) % N, j = (i + 1) % N, k = f - Math.floor(f);
    S.x = PX[i] + (PX[j] - PX[i]) * k; S.z = PZ[i] + (PZ[j] - PZ[i]) * k;
    S.fx = FX[i] + (FX[j] - FX[i]) * k; S.fz = FZ[i] + (FZ[j] - FZ[i]) * k;
    S.ux = UX_[i] + (UX_[j] - UX_[i]) * k; S.uy = UY[i] + (UY[j] - UY[i]) * k; S.uz = UZ[i] + (UZ[j] - UZ[i]) * k;
    return S;
  };

  // ---- the plane: body, prop disc, nav lights / strobes (points), one group placed by a basis matrix
  const livery = canvasTex(1024, 512, (g, cw, ch) => paintLivery(g, cw, ch, false), { repeat: false });
  const rough = canvasTex(512, 256, (g, cw, ch) => paintLivery(g, cw, ch, true), { repeat: false, srgb: false });
  const body = new THREE.Mesh(buildModel(), new THREE.MeshStandardMaterial({ vertexColors: true, map: livery, roughnessMap: rough, metalnessMap: rough, roughness: 1, metalness: 1 }));
  body.castShadow = true;
  const propTex = canvasTex(128, 128, (g) => { // two blurred blades: dark smears fading out from the hub, a faint ring of the yellow tips
    const c = 64; g.clearRect(0, 0, 128, 128);
    for (let a = 0; a < 360; a += 3) {
      const r = (a * Math.PI) / 180, k = Math.pow(Math.abs(Math.cos(r)), 6) * 0.55 + 0.12;
      g.strokeStyle = `rgba(30,30,30,${k})`; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(r) * 60, c + Math.sin(r) * 60); g.stroke();
    }
    g.strokeStyle = 'rgba(240,200,40,0.2)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, 59, 0, Math.PI * 2); g.stroke();
  }, { repeat: false });
  const prop = new THREE.Mesh(new THREE.CircleGeometry(0.96, 24).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: propTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 }));
  prop.position.set(3.14, 0.05, 0);
  const glowTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }, { repeat: false, srgb: false });
  // left tip red, right tip green, tail white, two wingtip strobes (white)
  const lx = WLE - 0.4 * CH, ly = WY + dih(TIP);
  const LP = new Float32Array([lx, ly, -TIP - 0.05, lx, ly, TIP + 0.05, -4.97, 0.6, 0, lx - 0.35, ly + 0.02, -TIP + 0.02, lx - 0.35, ly + 0.02, TIP - 0.02]);
  const LC = new Float32Array(15), BASE = [[3, 0.15, 0.1], [0.15, 3, 0.4], [2.2, 2.2, 2.2]];
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute('position', new THREE.BufferAttribute(LP, 3));
  lightGeo.setAttribute('color', new THREE.BufferAttribute(LC, 3));
  const lightMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: glowTex, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const lights = new THREE.Points(lightGeo, lightMat);
  const plane = Object.assign(new THREE.Group(), { name: 'plane', matrixAutoUpdate: false });
  plane.add(body, prop, lights);
  for (const o of [body, prop, lights]) o.updateMatrix();
  // small meshes meant to be spotted from afar: off the far cull of the lower levels (world/farcull.js); the group
  // moves every frame, so its bounds would be stale for the frustum test too
  for (const o of [body, prop, lights]) o.frustumCulled = false;
  root.add(plane);

  const live = { x: 0, y: Y, z: 0, fx: 1, fz: 0, d: 0, lap: total / SPEED };
  const m = plane.matrix.elements;
  const epoch = Date.now() - performance.now(); // the wall clock at sub-ms resolution: smooth, and the same for everyone
  let t = 0, spin = 0;
  console.log(`[cherkasy] Plane: ${(total / 1000).toFixed(1)} km loop, ${(total / SPEED / 60).toFixed(1)} min a lap, ${Y.toFixed(0)} m (ground under the loop up to ${hiGround.toFixed(0)} m), bank up to ${(maxBank * 180 / Math.PI).toFixed(0)} deg, ${body.geometry.attributes.position.count} verts in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    plane: live,
    clear: () => false,
    update(dt) {
      t += dt;
      const d = (((epoch + performance.now()) / 1000) * SPEED) % total;
      const y = Y + Math.sin(t * 0.37) * 2.5 + Math.sin(t * 1.1) * 0.4; // gentle bumps
      const s = sample(d);
      // basis: x forward (level heading), y the banked lift vector made square to it, z = x * y (the right wing)
      let fx = s.fx, fz = s.fz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const wob = Math.sin(t * 0.9) * 0.03 + Math.sin(t * 2.3) * 0.012; // a little roll in the bumps
      let ux = s.ux, uy = s.uy, uz = s.uz; const pr = ux * fx + uz * fz; ux -= pr * fx; uz -= pr * fz;
      let ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      let rx = -uy * fz, ry = fz * ux - fx * uz, rz = uy * fx; // f x u with f.y = 0
      const cw = Math.cos(wob), sw = Math.sin(wob); // roll u about f: u cos + (f x u) sin
      ux = ux * cw + rx * sw; uy = uy * cw + ry * sw; uz = uz * cw + rz * sw;
      ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      rx = -uy * fz; ry = fz * ux - fx * uz; rz = uy * fx;
      m[0] = fx; m[1] = 0; m[2] = fz; m[4] = ux; m[5] = uy; m[6] = uz; m[8] = rx; m[9] = ry; m[10] = rz;
      m[12] = s.x; m[13] = y; m[14] = s.z;
      plane.matrixWorldNeedsUpdate = true;
      live.x = s.x; live.y = y; live.z = s.z; live.fx = fx; live.fz = fz; live.d = d;
      spin += dt * 230; prop.rotation.x = spin % (Math.PI * 2);

      // lights: steady nav lights at dusk and night, the double strobe flash every 1.2 s day and night
      const nk = nightK.value, ph = t % 1.2, flash = ph < 0.05 || (ph > 0.15 && ph < 0.2) ? 1 : 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) LC[i * 3 + j] = BASE[i][j] * nk;
      for (let i = 3; i < 5; i++) for (let j = 0; j < 3; j++) LC[i * 3 + j] = flash * (1 + 3 * nk);
      lightGeo.attributes.color.needsUpdate = true;
      lightMat.size = 4 + 8 * nk;
    },
  };
}
