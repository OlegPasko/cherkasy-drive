// OWNER: cherkasy. A classic cruising sloop (~11 m) sailing a slow loop on the open Dnipro between the Rose Valley and
// the yacht club "Parus" (yachtclub.js): white hull with a fine sheer, a navy boot stripe and cove line, teak deck,
// a cabin trunk with dark windows, cockpit with a wheel, a 14 m mast with spreaders, a bellied mainsail and jib, boom,
// standing rigging and lifelines as lines, a Ukrainian flag on the stern staff. It keeps 2.5 m/s round a closed curve
// (~2 km, ~13 min a lap) paced by the wall clock like balloon.js, so every player sees it in the same place. A steady
// cross-river breeze sets the trim: the boom and jib swing to leeward by the point of sail (they cross over smoothly
// when it tacks or gybes at the loop's ends), the boat heels a few degrees to leeward, the sails flatten and flog head
// to wind; it bobs and pitches on the swell, the leech and the flag flutter, a foam wake fans out behind. At dusk and
// night (nightK) the masthead white and the red / green bow lights come on.
//   buildYacht({ root }) -> { update(dt, camera?), collide(p, r, h), yacht: { x, z, yaw, d } } | null
//   collide(p, r, h) -> null | { push, normal, depth, grounded: false, groundY: 0, vel }: the player's body (feet p.y,
//     radius r, height h) against the hull box and the mast (city.js chains it into world.collideDynamic, as the
//     traffic: the static solids grid cannot hold a moving body)
// Draw calls: hull + deck + trim (one mesh, one small data texture), sails + boom + flag (one dynamic mesh), rigging
// (one LineSegments), nav lights (one Points), wake (one transparent strip on the water).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { WATER_Y } from '../water.js';

// the loop (map x, z): open water 95+ m from any land, the embankment, the beaches and the marina's pontoons (checked
// against ground.isWater on the built city); a closed centripetal curve through these points
const LOOP = [[1110, -650], [1240, -560], [1370, -690], [1390, -1000], [1345, -1280], [1250, -1400], [1140, -1385], [1075, -1250], [1062, -950]];
const SPEED = 2.5;                         // m/s, a gentle reach in a light breeze
const WIND_FROM = [0.96, 0.28];            // unit (x, z) the breeze blows from: across the river, from the far bank
const L = 11.2, B = 3.5;                   // length over all, beam
const MAST_X = 1.0, MAST_TOP = 14.9, BOOM_Y = 2.35, BOOM_L = 4.6, TACK = [5.3, 1.45, 0];
const HEEL = 0.12, NEAR = 900;             // max heel (rad, ~7 deg); sails, sheets and wake are only reshaped within NEAR m of the camera

// hull lines over t = 0 (transom) .. 1 (stem): half-beam (share of B/2), sheer height, canoe-body bottom, section
// fullness (superellipse exponent: boxy aft, a V forward)
const HALF = [[0, 0.72], [0.2, 0.9], [0.45, 1], [0.7, 0.88], [0.88, 0.55], [1, 0]];
const SHEER = [[0, 1.12], [0.35, 1.03], [0.7, 1.1], [1, 1.38]];
const DEPTH = [[0, 0.18], [0.12, -0.12], [0.35, -0.5], [0.55, -0.55], [0.78, -0.35], [0.92, 0], [1, 0.38]];
const FULL = [[0, 3.2], [0.5, 2.6], [0.85, 2], [1, 1.6]];
// cubic Hermite through (t, value) points with finite-difference tangents: smooth lines, no overshoot worth noting
function lut(P, t) {
  let i = 0; while (i < P.length - 2 && t > P[i + 1][0]) i++;
  const [x0, y0] = P[i], [x1, y1] = P[i + 1], h = x1 - x0, s = Math.min(1, Math.max(0, (t - x0) / h));
  const m = (k) => (k <= 0 ? (P[1][1] - P[0][1]) / (P[1][0] - P[0][0]) : k >= P.length - 1 ? (P[k][1] - P[k - 1][1]) / (P[k][0] - P[k - 1][0])
    : (P[k + 1][1] - P[k - 1][1]) / (P[k + 1][0] - P[k - 1][0]));
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m(i) + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m(i + 1);
}
const tOf = (x) => x / L + 0.5;
const sheerAt = (x) => lut(SHEER, tOf(x)), halfAt = (x) => (B / 2) * Math.max(0, lut(HALF, tOf(x)));

// one RGBA texture for hull and deck: v < 0.4 teak planks (u across the beam); v >= 0.5 the topsides, u = depth below
// the sheer (0..1 m, the cove line), v = height over the waterline (-0.8..1.6 m: antifouling, boot stripe, white)
const TW = 256, TH = 256, HULL_V = (y) => 0.5 + 0.5 * Math.min(1, Math.max(0, (y + 0.8) / 2.4));
const WHITE_UV = [0.6, HULL_V(1.2)];        // a plain white texel: the trim's vertex colours read through it
function hullTexture() {
  const d = new Uint8Array(TW * TH * 4), put = (i, j, c) => d.set(c, (j * TW + i) * 4);
  const hex = (h) => [h >> 16 & 255, h >> 8 & 255, h & 255, 255];
  const white = hex(0xf4f3ee), navy = hex(0x1d3a5f), anti = hex(0x7b2a26), caulk = hex(0x3a2a1e);
  const teak = [0xb08355, 0xa67a4c, 0xb98d5c, 0xa8804f].map(hex);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const u = (i + 0.5) / TW, v = (j + 0.5) / TH;
    if (v < 0.4) { // planks ~12 cm wide (u spans the beam), butt joints staggered along the length
      const pk = u * B / 0.12, n = Math.floor(pk), edge = pk - n < 0.08;
      const butt = ((v * 40 + (n * 0.37 % 1)) % 1) < 0.012;
      const c = teak[(n * 7 + Math.floor(v * 40 + n * 0.37)) & 3];
      put(i, j, edge || butt ? caulk : c);
    } else if (v < 0.5) put(i, j, white);
    else {
      const y = -0.8 + (v - 0.5) / 0.5 * 2.4, dd = u * 1.0;
      put(i, j, y < 0.04 ? anti : y < 0.24 ? navy : dd > 0.08 && dd < 0.135 ? navy : white);
    }
  }
  const tex = new THREE.DataTexture(d, TW, TH, THREE.RGBAFormat);
  Object.assign(tex, { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, anisotropy: 4, needsUpdate: true });
  return tex;
}

// the hull shell (+ transom) and the deck: smooth shading, uv into the texture above
function hullGeometry() {
  const N = 40, K = 21, M = 9, hull = new MB(), deck = new MB();
  const st = Array.from({ length: N }, (_, j) => {
    const t = j / (N - 1), x = -L / 2 + t * L;
    return { t, x, hb: halfAt(x), top: lut(SHEER, t), bot: lut(DEPTH, t), n: lut(FULL, t) };
  });
  const huv = (y, top) => [Math.min(1, Math.max(0, top - y)), HULL_V(y)];
  const sec = (s, k) => { // port gunwale (k = 0) round the bilge to the starboard gunwale (k = K - 1)
    const th = Math.PI * k / (K - 1), c = Math.cos(th), sn = Math.sin(th), e = 2 / s.n;
    return [s.x, s.top - (s.top - s.bot) * Math.pow(sn, e), -s.hb * Math.sign(c) * Math.pow(Math.abs(c), e)];
  };
  const grid = st.map((s) => Array.from({ length: K }, (_, k) => { const p = sec(s, k); return hull.vert(p[0], p[1], p[2], 0, 1, 0, ...huv(p[1], s.top)); }));
  for (let j = 0; j < N - 1; j++) for (let k = 0; k < K - 1; k++) hull.quad(grid[j][k], grid[j + 1][k], grid[j + 1][k + 1], grid[j][k + 1]);
  // transom: its own vertices for a crisp edge, fanned from the middle
  const s0 = st[0], mid = hull.vert(s0.x, (s0.top + s0.bot) / 2, 0, -1, 0, 0, ...huv((s0.top + s0.bot) / 2, s0.top));
  const ring = Array.from({ length: K }, (_, k) => { const p = sec(s0, k); return hull.vert(p[0], p[1], p[2], -1, 0, 0, ...huv(p[1], s0.top)); });
  for (let k = 0; k < K - 1; k++) hull.tri(mid, ring[k], ring[k + 1]);
  hull.tri(mid, ring[K - 1], ring[0]); // the top edge closes it under the deck
  // deck: a cambered surface over the sheer, planks along the length
  const dg = st.map((s) => Array.from({ length: M }, (_, m) => {
    const w = -1 + 2 * m / (M - 1), z = w * s.hb * 0.995;
    return deck.vert(s.x, s.top + 0.06 * (1 - w * w) * s.hb / (B / 2), z, 0, 1, 0, 0.5 + z / B, 0.02 + 0.36 * s.t);
  }));
  for (let j = 0; j < N - 1; j++) for (let m = 0; m < M - 1; m++) deck.quad(dg[j][m], dg[j][m + 1], dg[j + 1][m + 1], dg[j + 1][m]);
  const h = hull.build(), dk = deck.build();
  h.computeVertexNormals(); dk.computeVertexNormals();
  return [h, dk];
}

// cabin, cockpit, wheel, mast, spreaders, toe rails, keel and rudder: vertex-coloured, uv on the white texel
function trimGeometry() {
  const b = new MB(), W = 0xf2f0ea, GLASS = 0x18222c, TEAK = 0x9a6b40, TEAKD = 0x7a5232, ALU = 0xc8ccd0, ANTI = 0x7b2a26, DARK = 0x2a2d30;
  const deckY = (x) => sheerAt(x) + 0.06;
  // cabin trunk: tapered plan, rounded front; dark windows along the sides and on the front
  const cab = [[-1.4, -1.02], [2.2, -0.8], [2.55, -0.45], [2.65, 0], [2.55, 0.45], [2.2, 0.8], [-1.4, 1.02]];
  b.setColor(W).extrude(cab, [], 0.95, 1.62, { top: true });
  b.setColor(TEAK).box(-1.2, 1.62, -0.55, 2.0, 1.68, -0.5).box(-1.2, 1.62, 0.5, 2.0, 1.68, 0.55);      // handrails
  b.setColor(W).box(-1.45, 1.62, -0.4, -0.5, 1.72, 0.4);                                              // sliding hatch
  b.setColor(GLASS);
  for (const sz of [-1, 1]) {
    const a = [-1.4, 1.02 * sz], c = [2.2, 0.8 * sz], ang = Math.atan2(-(c[1] - a[1]), c[0] - a[0]);
    for (const [k, w] of [[0.18, 0.7], [0.48, 0.9], [0.77, 0.55]]) {
      const x = a[0] + (c[0] - a[0]) * k, z = a[1] + (c[1] - a[1]) * k + sz * 0.012;
      b.with(M4(x, 1.36, z, ang), (s) => s.boxC(0, 0, 0, w, 0.16, 0.03));
    }
  }
  for (const sz of [-1, 1]) b.with(M4(2.6, 1.4, sz * 0.24, sz * 0.5), (s) => s.boxC(0, 0, 0, 0.03, 0.14, 0.34));
  // cockpit: teak sole and benches inside white coamings, winches, the wheel on its pedestal
  b.setColor(TEAKD).box(-4.3, 1.0, -0.85, -1.45, deckY(-3) + 0.02, 0.85);
  b.setColor(TEAK).box(-4.1, 1.0, -0.88, -1.6, deckY(-3) + 0.2, -0.55).box(-4.1, 1.0, 0.55, -1.6, deckY(-3) + 0.2, 0.88);
  b.setColor(W);
  for (const sz of [-1, 1]) b.box(-4.4, 1.0, sz * 0.92, -1.35, deckY(-3) + 0.32, sz * 0.98);
  b.box(-4.4, 1.0, -0.98, -4.34, deckY(-4.4) + 0.2, 0.98);
  b.setColor(DARK);
  for (const sz of [-1, 1]) for (const x of [-2.2, -3.6]) b.cyl(x, deckY(x) + 0.32, sz * 0.95, 0.08, 0.07, 0.14, 8);
  b.setColor(ALU).cyl(-3.85, deckY(-3.85), 0, 0.07, 0.06, 0.72, 8);
  const wc = [-3.8, deckY(-3.8) + 0.78, 0], wr = 0.45, ws = 14;
  for (let i = 0; i < ws; i++) {
    const a0 = i / ws * Math.PI * 2, a1 = (i + 1) / ws * Math.PI * 2;
    b.tube([wc[0], wc[1] + Math.sin(a0) * wr, Math.cos(a0) * wr], [wc[0], wc[1] + Math.sin(a1) * wr, Math.cos(a1) * wr], 0.022, 5);
  }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; b.tube(wc, [wc[0], wc[1] + Math.sin(a) * wr, Math.cos(a) * wr], 0.012, 4); }
  // toe rails along the sheer, a bow roller, the stern flagstaff
  b.setColor(TEAK);
  for (const sz of [-1, 1]) for (let x = -5.5; x < 5.2; x += 0.9) {
    const x1 = Math.min(5.3, x + 0.9);
    b.tube([x, sheerAt(x) + 0.04, sz * (halfAt(x) - 0.03)], [x1, sheerAt(x1) + 0.04, sz * (halfAt(x1) - 0.03)], 0.035, 4);
  }
  b.setColor(ALU).box(5.2, sheerAt(5.2), -0.07, 5.75, sheerAt(5.2) + 0.12, 0.07);
  b.tube([-5.5, sheerAt(-5.5) + 0.05, 0.6], [-5.85, 2.45, 0.6], 0.02, 5);
  // mast on the cabin top, spreaders, gooseneck fitting
  b.setColor(ALU).cyl(MAST_X, 1.62, 0, 0.09, 0.06, MAST_TOP - 1.62, 10);
  for (const sz of [-1, 1]) b.tube([MAST_X, 8.3, 0], [MAST_X - 0.05, 8.3, sz * 0.95], 0.025, 4);
  b.box(MAST_X - 0.06, MAST_TOP, -0.06, MAST_X + 0.12, MAST_TOP + 0.08, 0.06);
  // under water: fin keel with a bulb, spade rudder (only from a low angle through the surface)
  b.setColor(ANTI);
  b.with(M4(0.1, 0, 0), (s) => s.extrude([[-0.7, -0.06], [0.6, -0.06], [0.6, 0.06], [-0.7, 0.06]], [], -1.75, -0.4, { top: false }));
  b.ellipsoid([0, -1.8, 0], [0.9, 0.16, 0.2], 10, 5);
  b.box(-4.6, -1.25, -0.05, -4.1, 0.05, 0.05);
  const g = b.build(), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
  return g;
}

// standing rigging, lifelines, pulpit and pushpit (static) + the two sheets (moved each frame: the last 6 vertices)
function riggingPositions() {
  const P = [], seg = (a, b) => P.push(...a, ...b), M = [MAST_X, MAST_TOP, 0];
  seg(TACK, M);                                                 // forestay
  seg([-5.5, sheerAt(-5.5) + 0.1, 0], M);                       // backstay
  for (const sz of [-1, 1]) {
    const cp = [MAST_X + 0.05, sheerAt(MAST_X) + 0.05, sz * (halfAt(MAST_X) - 0.12)], tip = [MAST_X - 0.05, 8.3, sz * 0.95];
    seg(cp, tip); seg(tip, [MAST_X, MAST_TOP - 0.3, sz * 0.03]);                 // cap shroud over the spreader
    seg([MAST_X + 0.45, cp[1], cp[2]], [MAST_X, 8.2, 0]); seg([MAST_X - 0.45, cp[1], cp[2]], [MAST_X, 8.2, 0]); // lowers
    // stanchions and two lifelines, from the pushpit to the pulpit
    const xs = [-5.2, -3.7, -2.2, -0.7, 0.8, 2.3, 3.6], top = [], low = [];
    for (const x of xs) {
      const z = sz * (halfAt(x) - 0.1), y = sheerAt(x) + 0.06;
      seg([x, y, z], [x, y + 0.65, z]); top.push([x, y + 0.65, z]); low.push([x, y + 0.35, z]);
    }
    const pul = [[4.6, sheerAt(4.6) + 0.7, sz * (halfAt(4.6) - 0.1)], [5.15, sheerAt(5.15) + 0.7, sz * 0.25], [5.4, sheerAt(5.3) + 0.7, 0]];
    seg(pul[0], [pul[0][0], pul[0][1] - 0.7, pul[0][2]]); seg(pul[1], [pul[1][0], pul[1][1] - 0.7, pul[1][2]]);
    for (const line of [[...top, ...pul], low.concat([[4.6, pul[0][1] - 0.3, pul[0][2]]])]) for (let i = 1; i < line.length; i++) seg(line[i - 1], line[i]);
    seg([-5.45, sheerAt(-5.45) + 0.71, sz * 1.15], [-5.45, sheerAt(-5.45) + 0.71, 0]);           // pushpit rail
    seg([-5.45, sheerAt(-5.45) + 0.71, sz * 1.15], top[0]);
  }
  for (let i = 0; i < 6; i++) P.push(0, 0, 0);                  // main sheet, jib sheet via its fairlead
  return new Float32Array(P);
}

export function buildYacht({ root }) {
  const t0 = performance.now();
  // the loop resampled by arc length, a point per metre: position and heading by distance are lookups
  const cr = (a, b, c, d, s, k) => 0.5 * (2 * b[k] + (c[k] - a[k]) * s + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * s * s + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * s * s * s);
  const raw = [], n = LOOP.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < 40; j++) {
    const a = LOOP[(i - 1 + n) % n], b = LOOP[i], c = LOOP[(i + 1) % n], d = LOOP[(i + 2) % n];
    raw.push([cr(a, b, c, d, j / 40, 0), cr(a, b, c, d, j / 40, 1)]);
  }
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) { const p = raw[i - 1], q = raw[i % raw.length]; cum.push(cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const total = cum.at(-1), NP = Math.floor(total), path = new Float32Array(NP * 2);
  for (let m = 0, i = 0; m < NP; m++) {
    const d = m * total / NP; while (cum[i + 1] < d) i++;
    const k = (d - cum[i]) / (cum[i + 1] - cum[i]), p = raw[i], q = raw[(i + 1) % raw.length];
    path[2 * m] = p[0] + (q[0] - p[0]) * k; path[2 * m + 1] = p[1] + (q[1] - p[1]) * k;
  }
  const at = (d, out) => { // position and a smoothed unit heading at distance d along the loop
    const u = ((d % NP) + NP) % NP, i = Math.floor(u), k = u - i, j = (i + 1) % NP;
    out.x = path[2 * i] + (path[2 * j] - path[2 * i]) * k; out.z = path[2 * i + 1] + (path[2 * j + 1] - path[2 * i + 1]) * k;
    // the chord over +-10 m, blended between neighbouring samples so the heading never steps
    const a = (i - 10 + NP) % NP, b = (i + 10) % NP, a1 = (a + 1) % NP, b1 = (b + 1) % NP;
    const tx = (path[2 * b] - path[2 * a]) * (1 - k) + (path[2 * b1] - path[2 * a1]) * k;
    const tz = (path[2 * b + 1] - path[2 * a + 1]) * (1 - k) + (path[2 * b1 + 1] - path[2 * a1 + 1]) * k, tl = Math.hypot(tx, tz) || 1;
    out.tx = tx / tl; out.tz = tz / tl; return out;
  };

  // ---- the boat: hull + deck + trim in one mesh
  const tex = hullTexture();
  const [hullG, deckG] = hullGeometry(), trimG = trimGeometry();
  const body = new THREE.Mesh(mergeGeometries([hullG, deckG, trimG]), new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.42 }));
  body.castShadow = true; body.receiveShadow = true; body.name = 'yacht-hull';

  // ---- sails, boom and flag: one dynamic mesh, vertices recomputed per frame (near the camera)
  const NU = 10, NV = 14, FU = 8;                        // sail grid (chord x height), flag columns
  const nMain = NU * NV, nJib = NU * NV, nBoom = 24, nFlag = FU * 4, nDyn = nMain + nJib + nBoom + nFlag;
  const dPos = new Float32Array(nDyn * 3), dCol = new Float32Array(nDyn * 3), idx = [];
  const lin = (h) => new THREE.Color(h);              // Color(hex) is converted to linear (ColorManagement)
  const paint = (from, cnt, c) => { for (let i = from; i < from + cnt; i++) dCol.set([c.r, c.g, c.b], i * 3); };
  const cloth = lin(0xf3f1ea);
  paint(0, nMain + nJib, cloth);
  for (const o of [0, nMain]) for (let v = 0; v < NV - 1; v++) for (let u = 0; u < NU - 1; u++) {
    const a = o + v * NU + u; idx.push(a, a + 1, a + NU + 1, a, a + NU + 1, a + NU);
  }
  const oBoom = nMain + nJib; paint(oBoom, nBoom, lin(0xb8bcc0));
  for (let f = 0; f < 6; f++) { const a = oBoom + f * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3); }
  const oFlag = oBoom + nBoom;                        // rows: top, middle (blue), middle (yellow), bottom
  paint(oFlag, FU * 2, lin(0x0057b7)); paint(oFlag + FU * 2, FU * 2, lin(0xffd500));
  for (const r of [0, 2]) for (let u = 0; u < FU - 1; u++) { const a = oFlag + r * FU + u; idx.push(a, a + 1, a + FU + 1, a, a + FU + 1, a + FU); }
  const dyn = new THREE.BufferGeometry();
  dyn.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
  dyn.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
  dyn.setIndex(idx);
  dyn.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 7, 0), 10.5); // covers every trim of the sails
  const sails = new THREE.Mesh(dyn, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  sails.castShadow = true; sails.name = 'yacht-sails';

  // ---- rigging lines
  const rPos = riggingPositions(), nR = rPos.length / 3;
  const rigG = new THREE.BufferGeometry();
  rigG.setAttribute('position', new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage));
  rigG.boundingSphere = dyn.boundingSphere.clone();
  const rigging = new THREE.LineSegments(rigG, new THREE.LineBasicMaterial({ color: 0x80878d }));
  rigging.name = 'yacht-rigging';

  // ---- nav lights: masthead white, port red, starboard green (pixel size and brightness shrink with distance, faded in by nightK)
  const glow = (() => {
    const S = 32, d = new Uint8Array(S * S * 4);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const r = Math.hypot(i + 0.5 - S / 2, j + 0.5 - S / 2) / (S / 2), a = Math.max(0, 1 - r);
      d.set([255, 255, 255, Math.round(255 * Math.min(1, a * a * 0.7 + (r < 0.3 ? 0.6 : 0)))], (j * S + i) * 4);
    }
    return Object.assign(new THREE.DataTexture(d, S, S), { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, needsUpdate: true });
  })();
  const lightG = new THREE.BufferGeometry();
  lightG.setAttribute('position', new THREE.Float32BufferAttribute([MAST_X, MAST_TOP + 0.15, 0, 4.85, sheerAt(4.85) + 0.25, -0.62, 4.85, sheerAt(4.85) + 0.25, 0.62], 3));
  lightG.setAttribute('color', new THREE.Float32BufferAttribute([3, 2.85, 2.5, 3, 0.15, 0.08, 0.2, 3, 0.75], 3)); // HDR: the bloom picks them up
  const lightMat = new THREE.PointsMaterial({ size: 20, sizeAttenuation: false, map: glow, vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false }); // normal blending: an additive red would vanish against a sunset
  const lights = new THREE.Points(lightG, lightMat);
  lights.name = 'yacht-lights'; lights.visible = false;

  // ---- wake: a soft strip down the loop behind the stern (3 vertices across: clear, foam, clear) + the bow's V
  const WK = 22, WS = 4, BW = 7, nW = WK * 3 + 2 * BW * 2;
  const wPos = new Float32Array(nW * 3), wCol = new Float32Array(nW * 4), wIdx = [];
  for (let k = 0; k < WK - 1; k++) { const a = k * 3; wIdx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  for (let s = 0; s < 2; s++) for (let k = 0; k < BW - 1; k++) { const a = WK * 3 + s * BW * 2 + k * 2; wIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  for (let k = 0; k < WK; k++) {
    const al = 0.45 * Math.pow(1 - k / (WK - 1), 2) * Math.min(1, 0.4 + k * 0.3); // fades in off the stern, out with age
    wCol.set([1, 1, 1, 0, 1, 1, 1, al, 1, 1, 1, 0], k * 12);
  }
  for (let s = 0; s < 2; s++) for (let k = 0; k < BW; k++) { const al = 0.5 * (1 - k / (BW - 1)), o = (WK * 3 + s * BW * 2 + k * 2) * 4; wCol.set([1, 1, 1, al, 1, 1, 1, 0], o); }
  const wUv = new Float32Array(nW * 2);
  for (let k = 0; k < WK; k++) wUv.set([0, 0, 0.5, 0, 1, 0], k * 6);
  for (let s = 0; s < 2; s++) for (let k = 0; k < BW; k++) wUv.set([0, k * 0.5, 0.6, k * 0.5], (WK * 3 + s * BW * 2 + k * 2) * 2);
  const foam = (() => { // clumpy foam: soft random blobs on a tiling 64 x 64 alpha
    const S = 64, a = new Float32Array(S * S), d = new Uint8Array(S * S * 4);
    let q = 7; const rnd = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    for (let b = 0; b < 90; b++) {
      const cx = rnd() * S, cy = rnd() * S, r = 1.5 + rnd() * 4.5;
      for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) {
        const f = 1 - Math.hypot(i - cx, j - cy) / r; if (f > 0) a[((j + S) % S) * S + (i + S) % S] += f * f;
      }
    }
    for (let i = 0; i < S * S; i++) d.set([255, 255, 255, Math.min(255, 40 + a[i] * 260)], i * 4);
    return Object.assign(new THREE.DataTexture(d, S, S), { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, needsUpdate: true });
  })();
  const wakeG = new THREE.BufferGeometry();
  wakeG.setAttribute('position', new THREE.BufferAttribute(wPos, 3).setUsage(THREE.DynamicDrawUsage));
  wakeG.setAttribute('color', new THREE.BufferAttribute(wCol, 4));
  wakeG.setAttribute('uv', new THREE.BufferAttribute(wUv, 2).setUsage(THREE.DynamicDrawUsage));
  wakeG.setIndex(wIdx);
  wakeG.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 70);
  const wake = new THREE.Mesh(wakeG, new THREE.MeshBasicMaterial({ map: foam, color: 0xdfe8ee, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1 }));
  wake.name = 'yacht-wake'; wake.renderOrder = 1;
  root.add(wake);

  const group = Object.assign(new THREE.Group(), { name: 'yacht' });
  group.rotation.order = 'YXZ';                        // heading, then heel about the fore-aft axis, then pitch
  group.add(body, sails, rigging, lights);
  root.add(group);
  // the far cull (farcull.js) of the lower levels would drop a whole boat beyond ~500 m, and it is meant to be seen
  // from the embankment and the air: farcull skips meshes with frustumCulled off when it registers them (after the sites
  // build), and the first update turns frustum culling back on
  for (const o of [body, sails, lights]) o.frustumCulled = false;
  let cullBack = true;

  // ---- per frame
  const pos = { x: 0, z: 0, tx: 1, tz: 0 }, tmp = { x: 0, z: 0, tx: 1, tz: 0 }, live = { x: 0, z: 0, yaw: 0, d: 0 };
  let t = 0, boom = 0.5, camber = 1, heel = 0, luff = 0;
  const v3 = new THREE.Vector3();
  const put = (i, x, y, z) => { dPos[i * 3] = x; dPos[i * 3 + 1] = y; dPos[i * 3 + 2] = z; };

  function shapeSails(wl) {
    const cs = camber, fl = 0.012 + 0.09 * luff;
    // mainsail: luff up the mast, the foot on the boom, the leech twisting off with height
    const head = MAST_TOP - 0.45;
    for (let v = 0; v < NV; v++) {
      const s = v / (NV - 1), y = BOOM_Y + 0.08 + s * (head - BOOM_Y - 0.08), ch = Math.max(0.15, BOOM_L * Math.pow(1 - s, 0.92) + 0.35 * Math.sin(Math.PI * s));
      const b = boom + Math.sign(boom || 1) * 0.16 * s, dx = -Math.cos(b), dz = Math.sin(b);
      for (let u = 0; u < NU; u++) {
        const c = u / (NU - 1), bel = cs * 0.11 * ch * Math.sin(Math.PI * Math.pow(c, 0.8)) * (1 - 0.25 * s);
        const fla = fl * ch * c * Math.sin(t * 8 + c * 5 + s * 4);
        put(v * NU + u, MAST_X - 0.1 + dx * ch * c + dz * (bel + fla), y, dx * -(bel + fla) + dz * ch * c);
      }
    }
    // jib: tack at the bow, head up the forestay, clew sheeted to leeward
    const g = Math.sign(boom || 1) * Math.min(1.0, 0.14 + Math.abs(boom) * 0.75), gx = -Math.cos(g), gz = Math.sin(g);
    const H = [TACK[0] + (MAST_X - TACK[0]) * 0.86, TACK[1] + (MAST_TOP - TACK[1]) * 0.86, 0], C = [TACK[0] + gx * 3.7, TACK[1] + 0.35, gz * 3.7];
    for (let v = 0; v < NV; v++) {
      const s = v / (NV - 1), lx = TACK[0] + (H[0] - TACK[0]) * s, ly = TACK[1] + (H[1] - TACK[1]) * s;
      const rx = C[0] + (H[0] - C[0]) * s, ry = C[1] + (H[1] - C[1]) * s, rz = C[2] * (1 - s), ch = Math.hypot(rx - lx, rz);
      for (let u = 0; u < NU; u++) {
        const c = u / (NU - 1), bel = cs * 0.12 * ch * Math.sin(Math.PI * Math.pow(c, 0.85)) + fl * 1.3 * ch * c * Math.sin(t * 9 + c * 6 + s * 3);
        put(nMain + v * NU + u, lx + (rx - lx) * c + gz * bel, ly + (ry - ly) * c, rz * c - gx * bel); // belly along (gz, -gx), to leeward
      }
    }
    // boom: a box from the gooseneck to the clew of the main
    const bx = -Math.cos(boom), bz = Math.sin(boom), x0 = MAST_X - 0.1, x1 = x0 + bx * BOOM_L, z1 = bz * BOOM_L, w = 0.06;
    const nx = bz * w, nz = -bx * w, Y0 = BOOM_Y - 0.06, Y1 = BOOM_Y + 0.08;
    const pts = [[x0 - nx, -nz], [x1 - nx, z1 - nz], [x1 + nx, z1 + nz], [x0 + nx, nz]];
    const faces = [[0, 1, 2, 3, Y1, Y1, Y1, Y1], [3, 2, 1, 0, Y0, Y0, Y0, Y0]];
    let o = oBoom;
    for (const [a, b2, c, d, ya, yb, yc, yd] of faces) { put(o++, pts[a][0], ya, pts[a][1]); put(o++, pts[b2][0], yb, pts[b2][1]); put(o++, pts[c][0], yc, pts[c][1]); put(o++, pts[d][0], yd, pts[d][1]); }
    for (let e = 0; e < 4; e++) { const p = pts[e], q = pts[(e + 1) % 4]; put(o++, p[0], Y0, p[1]); put(o++, q[0], Y0, q[1]); put(o++, q[0], Y1, q[1]); put(o++, p[0], Y1, p[1]); }
    // flag: flies downwind from the staff, a travelling ripple
    const fx = -5.85, fy = 2.45, fz = 0.6, px = -wl[1], pz = wl[0];
    for (const [r, h] of [[0, 0], [1, 0.2], [2, 0.2], [3, 0.4]]) for (let u = 0; u < FU; u++) {
      const c = u / (FU - 1), wv = Math.sin(t * 7 - c * 5) * 0.06 * c;
      put(oFlag + r * FU + u, fx + wl[0] * 0.6 * c + px * wv, fy - h, fz + wl[1] * 0.6 * c + pz * wv);
    }
    dyn.attributes.position.needsUpdate = true;
    dyn.computeVertexNormals();
    // sheets: main from 80% down the boom to the traveller, jib from the clew via the fairlead to the leeward winch
    const sd = Math.sign(boom || 1), k = nR - 6, r = rPos;
    r.set([x0 + bx * BOOM_L * 0.8, BOOM_Y - 0.05, bz * BOOM_L * 0.8, -2.0 + bx * 0.3, sheerAt(-2) + 0.7, bz * BOOM_L * 0.3], k * 3);
    const fair = [-0.3, sheerAt(-0.3) + 0.1, sd * (halfAt(-0.3) - 0.15)];
    r.set([...C, ...fair, ...fair, -2.2, sheerAt(-2.2) + 0.45, sd * 0.95], (k + 2) * 3);
    rigG.attributes.position.needsUpdate = true;
  }

  console.log(`[cherkasy] Yacht: ${total.toFixed(0)} m loop, ${(total / SPEED / 60).toFixed(1)} min a lap, ${body.geometry.attributes.position.count + nDyn + nR + nW} verts in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    yacht: live,
    update(dt, camera) {
      t += dt;
      if (cullBack) { cullBack = false; for (const o of [body, sails, lights]) o.frustumCulled = true; }
      const d = (Date.now() / 1000 * SPEED) % total;
      at(d, pos);
      // the breeze in the boat's frame: angle off the bow (0 = head to wind) and the side it comes over
      const cosA = pos.tx * WIND_FROM[0] + pos.tz * WIND_FROM[1], stb = -pos.tz * WIND_FROM[0] + pos.tx * WIND_FROM[1];
      const A = Math.acos(Math.max(-1, Math.min(1, cosA))), lee = stb > 0 ? -1 : 1; // leeward: away from the wind
      const k = Math.min(1, dt * 0.7);
      luff += ((A < 0.7 ? 1 - A / 0.7 : 0) - luff) * Math.min(1, dt * 2);
      boom += (lee * Math.max(0.08, Math.min(1.35, 0.2 + (A - 0.75) / (Math.PI - 0.75) * 1.15)) - boom) * k;
      camber += (lee * (1 - 0.8 * luff) - camber) * Math.min(1, dt * 1.2);
      heel += (lee * HEEL * Math.sin(A) * (1 - luff) - heel) * Math.min(1, dt * 0.5);
      const bob = Math.sin(t * 0.9) * 0.06 + Math.sin(t * 1.7 + 1) * 0.03;
      group.position.set(pos.x, WATER_Y + bob, pos.z);
      const yaw = Math.atan2(-pos.tz, pos.tx);
      group.rotation.set(heel + Math.sin(t * 0.8) * 0.015, yaw, Math.sin(t * 0.7) * 0.02 + Math.sin(t * 1.3) * 0.008);
      Object.assign(live, { x: pos.x, z: pos.z, yaw, d });
      // the wind (to) in the boat's frame for the flag: rotate the world vector by -yaw
      const wx = -WIND_FROM[0], wz = -WIND_FROM[1], cy = Math.cos(yaw), sy = Math.sin(yaw);
      const wl = [wx * cy - wz * sy, wx * sy + wz * cy];
      // the sails, the sheets and the wake are reshaped (and re-uploaded) only within NEAR m of the camera: beyond
      // it the boat is a few pixels and the stale geometry cannot be told apart; the first near frame refreshes them
      const near = !camera || camera.position.distanceTo(v3.set(pos.x, WATER_Y, pos.z)) < NEAR;
      const Y = WATER_Y + 0.06;
      at(d - 45, tmp); wakeG.boundingSphere.center.set(tmp.x, Y, tmp.z);
      if (near) {
        shapeSails(wl);
        // wake: the loop behind the stern, widening and fading; the bow wave a V off the stem
        for (let i = 0; i < WK; i++) {
          at(d - 5.3 - i * WS, tmp);
          const w = 0.9 + i * 0.32, nx = -tmp.tz * w, nz = tmp.tx * w;
          wPos.set([tmp.x - nx, Y, tmp.z - nz, tmp.x, Y, tmp.z, tmp.x + nx, Y, tmp.z + nz], i * 9);
          const v = (d - 5.3 - i * WS) / 7; wUv[i * 6 + 1] = wUv[i * 6 + 3] = wUv[i * 6 + 5] = v; // the foam stays put on the water
        }
        const bx = pos.x + pos.tx * 5.0, bz = pos.z + pos.tz * 5.0, ang = 0.34;
        for (let s = 0; s < 2; s++) {
          const sg = s ? 1 : -1, ca = Math.cos(ang), sa = Math.sin(ang) * sg;
          const ex = -(pos.tx * ca - pos.tz * sa), ez = -(pos.tz * ca + pos.tx * sa); // back and out from the stem
          const ox = -ez * sg * 0.5, oz = ex * sg * 0.5;                                // the outer edge, half a metre out
          for (let i = 0; i < BW; i++) {
            const r = i * 2.2, x = bx + ex * r, z = bz + ez * r, o = (WK * 3 + s * BW * 2 + i * 2) * 3;
            wPos.set([x, Y + 0.01, z, x + ox * (1 + i * 0.4), Y + 0.01, z + oz * (1 + i * 0.4)], o);
          }
        }
        wakeG.attributes.position.needsUpdate = true; wakeG.attributes.uv.needsUpdate = true;
      }
      const nk = nightK.value;
      lights.visible = nk > 0.02; lightMat.opacity = Math.min(1, nk * 1.3);
      if (lights.visible && camera) { // pinpoints from afar: a fixed 20 px HDR sprite bloomed into a big halo across the river
        const dist = camera.position.distanceTo(v3.set(pos.x, WATER_Y, pos.z));
        lightMat.size = Math.max(3, Math.min(20, 900 / dist)); lightMat.color.setScalar(Math.max(0.3, Math.min(1, 60 / dist)));
      }
    },
    collide(p, r = 1, h = 1.3) {
      const ox = p.x - live.x, oz = p.z - live.z;
      if (ox * ox + oz * oz > 100 || p.y > WATER_Y + MAST_TOP + 0.5 || p.y + h < WATER_Y - 0.5) return null;
      const fx = Math.cos(live.yaw), fz = -Math.sin(live.yaw), lx = ox * fx + oz * fz, lz = -ox * fz + oz * fx; // local: +x bow, +z starboard
      let px = 0, pz = 0;
      if (p.y < WATER_Y + 1.7) { // the hull (a box hugging it) up to the cabin top
        const hx = L / 2 + r, hz = halfAt(Math.max(-L / 2, Math.min(L / 2, lx))) + 0.1 + r;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
          const ex = hx - Math.abs(lx), ez = hz - Math.abs(lz);
          if (ex < ez) px = Math.sign(lx) * ex; else pz = Math.sign(lz || 1) * ez;
        }
      }
      if (!px && !pz) { // the mast
        const mx = lx - MAST_X, dd = Math.hypot(mx, lz), rr = r + 0.12;
        if (dd < rr) { const s = (rr - dd) / (dd || 1); px = mx * s || rr; pz = lz * s; } else return null;
      }
      const wx = px * fx - pz * fz, wz = px * fz + pz * fx, dep = Math.hypot(wx, wz);
      return { push: new THREE.Vector3(wx, 0, wz), normal: new THREE.Vector3(wx / dep, 0, wz / dep), depth: dep, grounded: false, groundY: 0, vel: null };
    },
  };
}
