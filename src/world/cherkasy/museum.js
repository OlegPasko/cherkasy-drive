// OWNER: cherkasy. Черкаський обласний краєзнавчий музей, вул. Слави, 1 (OSM way 12510122), next to Pagorb Slavy (pagorb.js,
// ~190 m to the north-east). Opened 1985 (architects L. Kondratskyi, N. Sobchuk, S. Fursenko): the whole building reads as a
// Cossack chest, the region's treasury. Rebuilt after the Wikimedia Commons photos (2009, a panoramio shot, October 2020)
// and the OSM paths round it: a heavy pale limestone "chest" with battered walls (wider at the foot, leaning back to
// the roof) cantilevered over a recessed glazed ground floor; the colonnade under the overhang is a row of curved
// brackets – posts that sweep out into the soffit, diagonal ones at the corners –; tall round-headed windows in proud
// frames rise through the parapet as dormers with barrel hoods (three over the entrance, a single one near each end, three
// more with three square windows under them on the long sides); a row of carved cartouches (a sun rosette, "1985", the
// 1941–1945 star, a wheat wreath) along the lower wall; the name in bronze letters over three glazed door sets between
// marble pylons; a Ukrainian flag on a bracket; a grey service block on the roof with a barrel-vaulted hut. Around it
// the granite-paved podium (the forecourt to vul. Slavy, a terrace toward the Pagorb lawn with a round bastion), wide
// steps with yellow nosings, park lamps, benches with teal seats, blue spruces and a juniper hedge below the terrace.
//   MUSEUM_SKIP: the OSM id replaced here (buildings.js skips it);  FLOOR_Y: the podium / ground floor level (m)
//   shapeMuseum(hf, map) -> { lowered } | null   before the ground + buildings: the DEM rises ~3.5 m across the site
//     (west to east); height-field nodes within 30 m of the podium are capped so the terrain stays under the podium
//     edge on the high (west) side and eases back to natural further out. The low (Pagorb) side keeps its drop: the
//     podium stands there on 2–3 m walls, as in the photos.
//   buildMuseum({ root, map, solids, zips, heightAt }) -> { update(), clear(x, z), spots, footprints } | null
// Everything is modelled in a site frame: a along the entrance façade (toward the Pagorb, +x-ish), b from the entrance
// (north-west, vul. Slavy) to the back; per façade a face frame (s to the right of a viewer outside, o out from the roof
// outline, y up). One Matrix4 puts the frame into the map.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE, hedgeSpots } from '../trees.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, area2, inPoly } from './geo.js';

const OSM_ID = 12510122;
export const MUSEUM_SKIP = new Set([OSM_ID]);
export const FLOOR_Y = 27.0;
const GF = 4.6, BLOCK = 9.6, BAT = 1.6, INSET = 1.6, DROP = 0.7; // ground storey, the chest, its batter, glass inset, roof below parapet
const yF = FLOOR_Y, yS = yF + GF, yR = yS + BLOCK;
const POD = { nw: 10.5, ne: 8, se: 4, sw: 5 };                       // podium beyond the roof outline, per side
const BAST = { b: 5, r: 5.5 };                                        // the round bastion on the terrace (b of its centre)
const ENTRY_A = -3.5;                                                 // entrance axis (the OSM steps down to vul. Slavy)
const RISE = 0.16, TREAD = 0.34;
const STONE = '#ded4bf', SOFFIT = '#c2b9a6', FRAME = '#e9e1d0', MARBLE = '#ebe7de', GRANITE = '#9c968d', BRONZE = '#6e5a3c';
const GLASS = ['#34424b', '#3d4b54', '#2f3a42', '#46535b'];
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const neg = (v) => [-v[0], -v[1], -v[2]];
const PI = Math.PI;

// ------------------------------------------------------------------------------------------------ site frame
// the OSM ring is a 40 x 44.5 m rectangle (plus one vertex on a straight run): the entrance edge is the one furthest
// toward -z; a runs along it toward +x, b = (-a.z, a.x) points to the back
function siteFrame(map) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const R = ringPts(bld.p);
  const P = R.filter((p, i) => {
    const a = R[(i + R.length - 1) % R.length], c = R[(i + 1) % R.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    return Math.abs((p[0] - a[0]) * (c[1] - a[1]) - (p[1] - a[1]) * (c[0] - a[0])) / L > 0.5;
  });
  if (P.length !== 4) return null;
  let [p, q] = P.map((v, i) => [v, P[(i + 1) % 4]]).reduce((m, e) => (e[0][1] + e[1][1] < m[0][1] + m[1][1] ? e : m));
  if (q[0] < p[0]) [p, q] = [q, p];
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]), e1 = [(q[0] - p[0]) / L, (q[1] - p[1]) / L], e2 = [-e1[1], e1[0]];
  const O = [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4];
  const hd = Math.max(...P.map((v) => Math.abs((v[0] - O[0]) * e2[0] + (v[1] - O[1]) * e2[1])));
  return {
    bld, O, e1, e2, hw: L / 2, hd, ry: Math.atan2(-e1[1], e1[0]),
    w: (a, b) => [O[0] + a * e1[0] + b * e2[0], O[1] + a * e1[1] + b * e2[1]],
    l: (x, z) => [(x - O[0]) * e1[0] + (z - O[1]) * e1[1], (x - O[0]) * e2[0] + (z - O[1]) * e2[1]],
    dir: (n) => [n[0] * e1[0] + n[1] * e2[0], n[0] * e1[1] + n[1] * e2[1]], // local direction -> map
  };
}
// the podium outline in the site frame: the rectangle with the bastion's half disc on the terrace side
function podiumRing(F) {
  const a0 = -F.hw - POD.sw, a1 = F.hw + POD.ne, b0 = -F.hd - POD.nw, b1 = F.hd + POD.se, out = [[a0, b0], [a1, b0]];
  for (let k = 0; k <= 12; k++) { const t = -PI / 2 + PI * k / 12; out.push([a1 + BAST.r * Math.cos(t), BAST.b + BAST.r * Math.sin(t)]); }
  out.push([a1, b1], [a0, b1]);
  return { ring: out, a0, a1, b0, b1 };
}

// ------------------------------------------------------------------------------------------------ terrain
export function shapeMuseum(hf, map) {
  const F = siteFrame(map);
  if (!F) return null;
  const { meta: { x0, z0, cell, nx, nz }, grid } = hf.data;
  const ring = podiumRing(F).ring.map(([a, b]) => F.w(a, b)), REACH = 30;
  const edgeD = (x, z) => {
    let best = Infinity;
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1];
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - p[0] - dx * t, z - p[1] - dz * t));
    });
    return best;
  };
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - REACH - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) + REACH - x0) / cell));
  const j0 = Math.max(0, Math.floor((Math.min(...zs) - REACH - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((Math.max(...zs) + REACH - z0) / cell));
  let lowered = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, d = inPoly(ring, x, z) ? 0 : edgeD(x, z);
    if (d > REACH) continue;
    // under the podium: just below its top; outward a gentle 1:16 rise back to the natural ground
    const cap = yF - 0.3 + 0.06 * Math.max(0, d - 2), k = j * nx + i;
    if (grid[k] > cap) { grid[k] = cap; lowered++; }
  }
  return { lowered };
}

// ------------------------------------------------------------------------------------------------ textures
// sawn limestone slabs, 1.5 x 0.75 m in running bond, 6 x 3 m per repeat: per-slab tint, fine grain, thin joints,
// the grey rain streaks and blotches of 40 winters
const stoneTex = (r) => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#b9b3a6'; g.fillRect(0, 0, w, h);
  const sw = w / 4, sh = h / 4;
  for (let j = 0; j < 4; j++) for (let i = -1; i < 4; i++) {
    const x = i * sw + (j & 1 ? sw / 2 : 0), k = 222 + r() * 22;
    g.fillStyle = `rgb(${k | 0},${(k - 3) | 0},${(k - 10) | 0})`; g.fillRect(x + 1, j * sh + 1, sw - 2, sh - 2);
  }
  for (let q = 0; q < 6000; q++) { g.fillStyle = r() < 0.5 ? 'rgba(90,84,74,0.07)' : 'rgba(255,255,250,0.08)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  for (let q = 0; q < 26; q++) { // streaks run down from the slab joints
    const x = r() * w, L = h * (0.2 + r() * 0.8), y0 = Math.floor(r() * 4) * sh, gr = g.createLinearGradient(0, y0, 0, y0 + L);
    gr.addColorStop(0, 'rgba(70,68,62,0.22)'); gr.addColorStop(1, 'rgba(70,68,62,0)');
    g.fillStyle = gr; g.fillRect(x, y0, 2 + r() * 6, L);
  }
  for (let q = 0; q < 10; q++) { g.fillStyle = 'rgba(95,92,84,0.08)'; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 16, 0, 0, 2 * PI); g.fill(); }
});
// podium paving: 1 m granite slabs in pinkish greys, 8 m per repeat
const paveTex = (r) => canvasTex(512, 512, (g, w) => {
  const c = w / 8;
  g.fillStyle = '#6d6862'; g.fillRect(0, 0, w, w);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const k = 150 + r() * 34;
    g.fillStyle = `rgb(${(k + 6) | 0},${k | 0},${(k - 6) | 0})`; g.fillRect(i * c + 1.5, j * c + 1.5, c - 3, c - 3);
    for (let q = 0; q < 40; q++) { g.fillStyle = r() < 0.5 ? 'rgba(40,36,34,0.16)' : 'rgba(235,228,220,0.16)'; g.fillRect(i * c + r() * c, j * c + r() * c, 1 + r() * 2, 1 + r() * 2); }
  }
});
// the carved cartouches, four 256 px tiles in a row: sun rosette, "1985", the star with 1941 / 1945, a wheat wreath.
// Drawn as relief: each shape is laid down shadow, highlight, then face, so it reads carved at a distance
const reliefTex = () => canvasTex(1024, 256, (g) => {
  const carve = (path, fill = '#e3ddd0') => {
    for (const [dx, col] of [[4, 'rgba(60,56,48,0.55)'], [-2, 'rgba(255,255,250,0.8)'], [0, fill]]) {
      g.save(); g.translate(dx, dx); g.fillStyle = col; g.beginPath(); path(); g.fill(); g.restore();
    }
  };
  const text = (s, x, y, px) => { g.font = `bold ${px}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(70,64,56,0.8)'; g.fillText(s, x + 2, y + 2); g.fillStyle = '#efe9dd'; g.fillText(s, x, y); };
  for (let t = 0; t < 4; t++) {
    const cx = t * 256 + 128, cy = 128;
    // the cartouche: a rounded shield with curled corners
    carve(() => { g.roundRect(cx - 96, cy - 100, 192, 200, 46); for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.moveTo(cx + sx * 100 + 22, cy + sy * 100); g.arc(cx + sx * 100, cy + sy * 100, 22, 0, 2 * PI); } });
    carve(() => g.roundRect(cx - 78, cy - 82, 156, 164, 36), '#d6cfc1');
    if (t === 0) { // sun rosette
      carve(() => { for (let k = 0; k < 12; k++) { const a = k * PI / 6; g.moveTo(cx, cy); g.ellipse(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42, 30, 11, a, 0, 2 * PI); } });
      carve(() => g.arc(cx, cy, 22, 0, 2 * PI));
    } else if (t === 1) { // the year of the opening on a scroll
      carve(() => { g.moveTo(cx - 70, cy - 22); g.lineTo(cx + 70, cy - 22); g.lineTo(cx + 58, cy); g.lineTo(cx + 70, cy + 22); g.lineTo(cx - 70, cy + 22); g.lineTo(cx - 58, cy); g.closePath(); });
      text('1985', cx, cy + 1, 38);
      carve(() => { for (let k = 0; k < 7; k++) { const a = PI * (1.15 + 0.7 * k / 6); g.moveTo(cx, cy); g.arc(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58, 8, 0, 2 * PI); } });
    } else if (t === 2) { // the star with the war years
      carve(() => { for (let k = 0; k < 10; k++) { const a = -PI / 2 + k * PI / 5, rr = k & 1 ? 26 : 62; k ? g.lineTo(cx + Math.cos(a) * rr, cy - 8 + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy - 8 + Math.sin(a) * rr); } g.closePath(); });
      text('1941', cx - 34, cy + 58, 22); text('1945', cx + 34, cy + 58, 22);
    } else { // wheat wreath round a lozenge ornament
      for (const s of [-1, 1]) carve(() => { for (let k = 0; k < 8; k++) { const a = PI / 2 + s * (0.35 + k * 0.3); g.moveTo(cx, cy); g.ellipse(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60, 15, 6, a + s * 0.9, 0, 2 * PI); } });
      carve(() => { g.moveTo(cx, cy - 34); g.lineTo(cx + 26, cy); g.lineTo(cx, cy + 34); g.lineTo(cx - 26, cy); g.closePath(); });
    }
  }
}, { repeat: false });
const lettersTex = () => canvasTex(2048, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.font = 'bold 84px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(40,30,18,0.9)'; g.fillText('ОБЛАСНИЙ   КРАЄЗНАВЧИЙ   МУЗЕЙ', w / 2 + 3, h / 2 + 5, w - 40);
  const gr = g.createLinearGradient(0, 20, 0, 108); gr.addColorStop(0, '#e2c58a'); gr.addColorStop(1, '#8c6a36');
  g.fillStyle = gr; g.fillText('ОБЛАСНИЙ   КРАЄЗНАВЧИЙ   МУЗЕЙ', w / 2, h / 2 + 2, w - 40);
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ build
export function buildMuseum({ root, map, solids: S, zips: Z, heightAt }) {
  const F = siteFrame(map);
  if (!F) return null;
  const t0 = performance.now(), s0 = S.count, r = rng(OSM_ID % 99991);
  const { hw, hd } = F;
  const g = (a, b) => { const [x, z] = F.w(a, b), h = heightAt(x, z); return Number.isFinite(h) ? h : yF - 1; };
  const xf = M4(F.O[0], 0, F.O[1], F.ry); // site frame -> map
  const B = { stone: new MB(), det: new MB(), glass: new MB(), lit: new MB(), pave: new MB(), relief: new MB(), letters: new MB(), flag: new MB(), lamp: new MB() };
  for (const m of Object.values(B)) m.setXf(xf);
  const St = B.stone, D = B.det;

  // collision in the site frame
  const prismL = (pts, y0, y1, kind = 'wall', flags = 0) => {
    const Q = pts.map(([a, b]) => F.w(a, b));
    S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), y0, y1, 0, 0, kind, flags);
  };
  const rectL = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];

  // face frames: n outward, r = the viewer's right, origin at the left corner of the roof outline
  const frame = (n, w, oa, ob) => ({ n, r: [n[1], -n[0]], w, oa, ob, N: [n[0], 0, n[1]], R: [n[1], 0, -n[0]] });
  const FACES = { nw: frame([0, -1], 2 * hw, hw, -hd), ne: frame([1, 0], 2 * hd, hw, hd), se: frame([0, 1], 2 * hw, -hw, hd), sw: frame([-1, 0], 2 * hd, -hw, -hd) };
  const P = (f, s, y, o = 0) => [f.oa + f.r[0] * s + f.n[0] * o, y, f.ob + f.r[1] * s + f.n[1] * o];
  const flat = (f, s, o) => { const p = P(f, s, 0, o); return [p[0], p[2]]; };
  const fq = (M, f, s0, s1, y0, y1, o, n = f.N) => M.face([P(f, s0, y0, o), P(f, s1, y0, o), P(f, s1, y1, o), P(f, s0, y1, o)], n);
  // box in a face frame; m bits: 1 front, 2 back, 4 left, 8 right, 16 top, 32 bottom
  const fbox = (M, f, s0, s1, y0, y1, o0, o1, m = 63) => {
    const c = (s, y, o) => P(f, s, y, o);
    if (m & 1) M.face([c(s0, y0, o1), c(s1, y0, o1), c(s1, y1, o1), c(s0, y1, o1)], f.N);
    if (m & 2) M.face([c(s0, y0, o0), c(s1, y0, o0), c(s1, y1, o0), c(s0, y1, o0)], neg(f.N));
    if (m & 4) M.face([c(s0, y0, o0), c(s0, y0, o1), c(s0, y1, o1), c(s0, y1, o0)], neg(f.R));
    if (m & 8) M.face([c(s1, y0, o0), c(s1, y0, o1), c(s1, y1, o1), c(s1, y1, o0)], f.R);
    if (m & 16) M.face([c(s0, y1, o0), c(s1, y1, o0), c(s1, y1, o1), c(s0, y1, o1)], UP);
    if (m & 32) M.face([c(s0, y0, o0), c(s1, y0, o0), c(s1, y0, o1), c(s0, y0, o1)], DOWN);
  };
  // quad with uv = (s, y) in metres, so the slab courses run on across the strips of one façade
  const quadSY = (M, pts, sy, n) => {
    const id = pts.map((p, i) => M.vert(p[0], p[1], p[2], n[0], n[1], n[2], sy[i][0], sy[i][1]));
    M.quad(id[0], id[1], id[2], id[3]);
  };
  const ow = (y) => BAT * (yR - y) / BLOCK;                     // the battered wall's offset at height y
  const wallN = (f) => { const l = Math.hypot(BLOCK, BAT); return [f.n[0] * BLOCK / l, BAT / l, f.n[1] * BLOCK / l]; };
  const glassOf = () => GLASS[Math.floor(r() * GLASS.length)];

  // ---- the chest: battered walls, soffit, parapet, roof
  for (const f of Object.values(FACES)) {
    const N = wallN(f);
    St.setColor(STONE);
    quadSY(St, [P(f, -BAT, yS, BAT), P(f, f.w + BAT, yS, BAT), P(f, f.w, yR, 0), P(f, 0, yR, 0)], [[-BAT, yS], [f.w + BAT, yS], [f.w, yR], [0, yR]], N);
    St.setColor(SOFFIT);
    quadSY(St, [P(f, -BAT, yS, BAT), P(f, INSET, yS, -INSET), P(f, f.w - INSET, yS, -INSET), P(f, f.w + BAT, yS, BAT)], [[-BAT, BAT], [INSET, -INSET], [f.w - INSET, -INSET], [f.w + BAT, BAT]], DOWN);
    St.setColor('#e1dbcd');
    St.face([P(f, 0, yR, 0), P(f, f.w, yR, 0), P(f, f.w - 0.5, yR, -0.5), P(f, 0.5, yR, -0.5)], UP);
    St.setColor('#b9b3a6'); fq(St, f, 0.5, f.w - 0.5, yR - DROP, yR, -0.5, neg(f.N));
    const a0 = P(f, 0, 0, -0.15), a1 = P(f, f.w, 0, -0.15), n = F.dir(f.n), [ax, az] = F.w(a0[0], a0[2]), [bx, bz] = F.w(a1[0], a1[2]);
    Z.edge(ax, az, bx, bz, yR, n[0], n[1]);
  }
  D.setColor('#6c6a66'); D.fill(rectL(-hw + 0.5, -hd + 0.5, hw - 0.5, hd - 0.5), [], yR - DROP, true);
  for (let k = 0; k < 3; k++) { // stepped collision following the batter
    const o = BAT * (1 - k / 3);
    prismL(rectL(-hw - o, -hd - o, hw + o, hd + o), yS + k * BLOCK / 3, yS + (k + 1) * BLOCK / 3);
  }

  // ---- windows: arched dormer frames through the parapet, framed square windows, carved cartouches, the name
  const wins = { nw: [], ne: [], se: [], sw: [] }; // [s0, s1, y0, y1] spans the cartouches keep clear of
  let nWin = 0;
  const arch = (fk, sc, gw, y0, y1) => {
    const f = FACES[fk], ft = 0.28, ri = gw / 2, ro = ri + ft, yA = y1 - ro, of = ow(y0) + 0.1, ob = -1.4, rec = 0.22, NA = 10;
    const arc = (rad) => Array.from({ length: NA + 1 }, (_, k) => { const t = PI * (1 - k / NA); return [sc + rad * Math.cos(t), yA + rad * Math.sin(t), t]; });
    const A = arc(ro), I = arc(ri), yG = y0 + 0.2;
    wins[fk].push([sc - ro, sc + ro, y0, y1]);
    St.setColor(FRAME);
    fq(St, f, sc - ro, sc - ri, y0, yA, of); fq(St, f, sc + ri, sc + ro, y0, yA, of); fq(St, f, sc - ri, sc + ri, y0, yG, of);
    for (let k = 0; k < NA; k++) St.face([P(f, A[k][0], A[k][1], of), P(f, A[k + 1][0], A[k + 1][1], of), P(f, I[k + 1][0], I[k + 1][1], of), P(f, I[k][0], I[k][1], of)], f.N);
    // reveals and intrados, the outer cheeks back to the hood's end, the barrel hood, its back cap over the roof
    St.setColor('#cfc8ba');
    St.face([P(f, sc - ri, yG, of), P(f, sc - ri, yA, of), P(f, sc - ri, yA, of - rec), P(f, sc - ri, yG, of - rec)], f.R);
    St.face([P(f, sc + ri, yG, of), P(f, sc + ri, yA, of), P(f, sc + ri, yA, of - rec), P(f, sc + ri, yG, of - rec)], neg(f.R));
    St.face([P(f, sc - ri, yG, of), P(f, sc + ri, yG, of), P(f, sc + ri, yG, of - rec), P(f, sc - ri, yG, of - rec)], UP);
    for (let k = 0; k < NA; k++) {
      const [s1, y1a, t1] = I[k], [s2, y2a, t2] = I[k + 1], tm = (t1 + t2) / 2, n = [-Math.cos(tm) * f.R[0], -Math.sin(tm), -Math.cos(tm) * f.R[2]];
      St.face([P(f, s1, y1a, of), P(f, s2, y2a, of), P(f, s2, y2a, of - rec), P(f, s1, y1a, of - rec)], n);
    }
    St.setColor(FRAME);
    St.face([P(f, sc - ro, y0, ob), P(f, sc - ro, y0, of), P(f, sc - ro, yA, of), P(f, sc - ro, yA, ob)], neg(f.R));
    St.face([P(f, sc + ro, y0, ob), P(f, sc + ro, y0, of), P(f, sc + ro, yA, of), P(f, sc + ro, yA, ob)], f.R);
    St.setColor('#d3ccbe');
    for (let k = 0; k < NA; k++) {
      const [s1, y1a, t1] = A[k], [s2, y2a, t2] = A[k + 1], tm = (t1 + t2) / 2, n = [Math.cos(tm) * f.R[0], Math.sin(tm), Math.cos(tm) * f.R[2]];
      St.face([P(f, s1, y1a, of), P(f, s2, y2a, of), P(f, s2, y2a, ob), P(f, s1, y1a, ob)], n);
    }
    St.face([P(f, sc + ro, yR - DROP, ob), P(f, sc - ro, yR - DROP, ob), ...A.map(([s, y]) => P(f, s, y, ob))], neg(f.N));
    // the glass, a centre mullion and transoms
    const lit = r() < 0.4, G = lit ? B.lit : B.glass;
    G.setColor(lit ? '#6e685c' : glassOf());
    G.face([P(f, sc - ri, yG, of - rec), P(f, sc + ri, yG, of - rec), ...I.slice().reverse().map(([s, y]) => P(f, s, y, of - rec))].reverse(), f.N);
    D.setColor('#4a4640');
    fbox(D, f, sc - 0.035, sc + 0.035, yG, yA + ri * 0.55, of - rec, of - rec + 0.06, 1 | 4 | 8);
    for (let y = yG + 1.4; y < yA; y += 1.4) fbox(D, f, sc - ri, sc + ri, y - 0.035, y + 0.035, of - rec, of - rec + 0.06, 1 | 16 | 32);
    fbox(D, f, sc - ri, sc + ri, yA - 0.035, yA + 0.035, of - rec, of - rec + 0.06, 1 | 16 | 32);
    St.setColor('#cdc6b8'); fbox(St, f, sc - ro - 0.06, sc + ro + 0.06, y0 - 0.14, y0, ow(y0) - 0.3, of + 0.08, 1 | 4 | 8 | 16 | 32);
    const C = [flat(f, sc - ro, ob), flat(f, sc + ro, ob), flat(f, sc + ro, of), flat(f, sc - ro, of)];
    prismL(C, y0, y1);
    nWin++;
  };
  const square = (fk, sc, sw, y0, y1) => {
    const f = FACES[fk], ft = 0.2, of = ow(y0) + 0.14, ob = ow(y1) - 0.3, rec = 0.18;
    wins[fk].push([sc - sw / 2, sc + sw / 2, y0, y1]);
    St.setColor(FRAME);
    fq(St, f, sc - sw / 2, sc - sw / 2 + ft, y0, y1, of); fq(St, f, sc + sw / 2 - ft, sc + sw / 2, y0, y1, of);
    fq(St, f, sc - sw / 2 + ft, sc + sw / 2 - ft, y0, y0 + ft, of); fq(St, f, sc - sw / 2 + ft, sc + sw / 2 - ft, y1 - ft, y1, of);
    fbox(St, f, sc - sw / 2, sc + sw / 2, y0, y1, ob, of, 4 | 8 | 16 | 32);
    St.setColor('#cfc8ba');
    St.face([P(f, sc - sw / 2 + ft, y0 + ft, of), P(f, sc - sw / 2 + ft, y1 - ft, of), P(f, sc - sw / 2 + ft, y1 - ft, of - rec), P(f, sc - sw / 2 + ft, y0 + ft, of - rec)], f.R);
    St.face([P(f, sc + sw / 2 - ft, y0 + ft, of), P(f, sc + sw / 2 - ft, y1 - ft, of), P(f, sc + sw / 2 - ft, y1 - ft, of - rec), P(f, sc + sw / 2 - ft, y0 + ft, of - rec)], neg(f.R));
    St.face([P(f, sc - sw / 2 + ft, y1 - ft, of), P(f, sc + sw / 2 - ft, y1 - ft, of), P(f, sc + sw / 2 - ft, y1 - ft, of - rec), P(f, sc - sw / 2 + ft, y1 - ft, of - rec)], DOWN);
    St.face([P(f, sc - sw / 2 + ft, y0 + ft, of), P(f, sc + sw / 2 - ft, y0 + ft, of), P(f, sc + sw / 2 - ft, y0 + ft, of - rec), P(f, sc - sw / 2 + ft, y0 + ft, of - rec)], UP);
    const lit = r() < 0.35, G = lit ? B.lit : B.glass;
    G.setColor(lit ? '#6e685c' : glassOf()); fq(G, f, sc - sw / 2 + ft, sc + sw / 2 - ft, y0 + ft, y1 - ft, of - rec);
    D.setColor('#4a4640'); fbox(D, f, sc - 0.03, sc + 0.03, y0 + ft, y1 - ft, of - rec, of - rec + 0.05, 1 | 4 | 8);
    prismL([flat(f, sc - sw / 2, ob), flat(f, sc + sw / 2, ob), flat(f, sc + sw / 2, of), flat(f, sc - sw / 2, of)], y0, y1);
    nWin++;
  };
  const sT = hw - ENTRY_A; // the entrance axis on the entrance façade
  for (const d of [-3.05, 0, 3.05]) arch('nw', sT + d, 2.3, yS + 1.55, yR + 2.0);
  for (const s of [5.6, 36.4]) arch('nw', s, 1.5, yS + 3.6, yR + 1.7);
  for (const [fk, single, trio, single2] of [['ne', 10.6, 28.1, null], ['sw', 8.2, 24.2, 39.3]]) {
    arch(fk, single, 1.5, yS + 3.6, yR + 1.7);
    if (single2) arch(fk, single2, 1.5, yS + 3.6, yR + 1.7);
    for (const d of [-2.5, 0, 2.5]) { arch(fk, trio + d, 1.8, yS + 4.6, yR + 1.8); square(fk, trio + d, 2.2, yS + 1.6, yS + 3.9); }
  }
  for (const s of [8, 32]) arch('se', s, 1.5, yS + 3.6, yR + 1.7);

  // cartouches: a row along the lower wall, clear of the windows; the two by the entrance are the "1985" and the star
  const cartouche = (f, sc, yc, half, tile) => {
    const ya = yc - half, yb = yc + half, u0 = tile / 4, u1 = (tile + 1) / 4, N = wallN(f);
    const pts = [P(f, sc - half, ya, ow(ya) + 0.05), P(f, sc + half, ya, ow(ya) + 0.05), P(f, sc + half, yb, ow(yb) + 0.05), P(f, sc - half, yb, ow(yb) + 0.05)];
    const id = pts.map((p, i) => B.relief.vert(p[0], p[1], p[2], N[0], N[1], N[2], i === 1 || i === 2 ? u1 : u0, i < 2 ? 0 : 1));
    B.relief.quad(id[0], id[1], id[2], id[3]);
  };
  cartouche(FACES.nw, sT - 5.6, yS + 3.3, 0.7, 1); cartouche(FACES.nw, sT + 5.6, yS + 3.3, 0.7, 2);
  wins.nw.push([sT - 6.5, sT + 6.5, yS, yR]);
  let nC = 2;
  for (const [fk, f] of Object.entries(FACES)) {
    const yc = yS + 2.3;
    for (let s = 3.5, k = 0; s < f.w - 3; s += 5.4, k++) {
      if (wins[fk].some(([a, c, y0]) => s + 0.9 > a && s - 0.9 < c && y0 < yc + 0.9)) continue;
      cartouche(f, s, yc, 0.6, [0, 3][k % 2]); nC++;
    }
  }
  { // the name in bronze letters under the three arches
    const f = FACES.nw, a = sT - 5.7, c = sT + 5.7, ya = yS + 0.55, yb = yS + 1.2, N = wallN(f);
    const pts = [P(f, a, ya, ow(ya) + 0.07), P(f, c, ya, ow(ya) + 0.07), P(f, c, yb, ow(yb) + 0.07), P(f, a, yb, ow(yb) + 0.07)];
    const id = pts.map((p, i) => B.letters.vert(p[0], p[1], p[2], N[0], N[1], N[2], i === 1 || i === 2 ? 1 : 0, i < 2 ? 0 : 1));
    B.letters.quad(id[0], id[1], id[2], id[3]);
  }

  // ---- the ground floor: glazing behind the curved brackets, the entrance between marble pylons
  const PR = 0.5, PB = 0.1, TH = 0.32, NARC = 7;
  // one bracket: base on the glass line at (a, b), sweeping out along d over `reach` m into the soffit edge
  const bracket = (a, b, d, reach) => {
    const t = [d[1], -d[0]], Rf = reach - PR, prof = [[PB, yS], [PB, yF], [PR, yF], [PR, yS - Rf]];
    for (let k = 1; k <= NARC; k++) { const th = PI - (PI / 2) * k / NARC; prof.push([reach + Rf * Math.cos(th), yS - Rf + Rf * Math.sin(th)]); }
    const at = ([o, y], side) => [a + d[0] * o + t[0] * side, y, b + d[1] * o + t[1] * side];
    St.face(prof.map((p) => at(p, TH / 2)), [t[0], 0, t[1]]);
    St.face(prof.map((p) => at(p, -TH / 2)), [-t[0], 0, -t[1]]);
    for (let i = 0; i + 1 < prof.length; i++) {
      const [o0, y0] = prof[i], [o1, y1] = prof[i + 1], L = Math.hypot(o1 - o0, y1 - y0) || 1, no = (y1 - y0) / L, ny = -(o1 - o0) / L;
      St.face([at(prof[i], -TH / 2), at(prof[i + 1], -TH / 2), at(prof[i + 1], TH / 2), at(prof[i], TH / 2)], [d[0] * no, ny, d[1] * no]);
    }
  };
  const eA = [sT - 5.5, sT + 5.5]; // the entrance span on the north-west glass line
  for (const [fk, f] of Object.entries(FACES)) {
    const s0 = INSET, s1 = f.w - INSET, o = -INSET, nb = Math.round((s1 - s0 - 2) / 1.9), step = (s1 - s0 - 2) / nb;
    St.setColor(STONE);
    fq(St, f, s0, s1, yS - 0.3, yS, o);                                    // head band under the soffit
    const skip = (s) => fk === 'nw' && s > eA[0] - 0.2 && s < eA[1] + 0.2;
    const door = fk === 'se' ? [f.w / 2 + 6, f.w / 2 + 8.6] : null;       // service doors at the back
    // the glazing: bays between the brackets, a stone plinth under them, bronze mullions and a transom
    for (let i = 0; i <= nb; i++) {
      const a = i ? s0 + 1 + (i - 0.5) * step : s0, c = i === nb ? s1 : s0 + 1 + (i + 0.5) * step;
      if (fk === 'nw' && c > eA[0] && a < eA[1]) { // the entrance: stone infill up to the pylons
        St.setColor(STONE);
        for (const [u, v] of [[a, Math.min(c, eA[0])], [Math.max(a, eA[1]), c]]) if (v - u > 0.01) fq(St, f, u, v, yF, yS - 0.3, o);
        continue;
      }
      St.setColor(MARBLE); fq(St, f, a, c, yF, yF + 0.45, o);
      if (door && a < door[1] && c > door[0]) { D.setColor('#5d5a55'); fq(D, f, a, c, yF + 0.45, yS - 0.3, o); continue; }
      const lit = fk === 'nw' || r() < 0.45, G = lit ? B.lit : B.glass;
      G.setColor(lit ? '#77705f' : glassOf()); fq(G, f, a, c, yF + 0.45, yS - 0.3, o);
      D.setColor(BRONZE);
      fbox(D, f, a - 0.04, a + 0.04, yF + 0.45, yS - 0.3, o, o + 0.08, 1 | 4 | 8);
      fbox(D, f, a, c, yF + 2.75, yF + 2.83, o, o + 0.06, 1 | 16 | 32);
    }
    St.setColor(FRAME);
    for (let i = 0; i <= nb; i++) {
      const s = s0 + 1 + i * step;
      if (skip(s)) continue;
      const [a, , b] = P(f, s, 0, o);
      bracket(a, b, f.n, BAT + INSET);
    }
    // the diagonal bracket at the corner, out to the chest's corner
    const [ca, , cb] = P(f, s0, 0, o), dg = [(f.n[0] - f.r[0]) / Math.SQRT2, (f.n[1] - f.r[1]) / Math.SQRT2];
    bracket(ca, cb, dg, (BAT + INSET) * Math.SQRT2);
  }
  prismL(rectL(-hw + INSET - PR, -hd + INSET - PR, hw - INSET + PR, hd - INSET + PR), yF - 0.2, yS);
  prismL(rectL(-hw - BAT + 0.5, -hd - BAT + 0.5, hw + BAT - 0.5, hd + BAT - 0.5), yS - 0.9, yS);
  { // the entrance: four marble pylons with a dark groove, three bronze door sets, plaques
    const f = FACES.nw, o = -INSET, W = 0.8, DW = 2.6;
    for (let k = 0; k < 4; k++) {
      const a = eA[0] + k * (W + DW);
      St.setColor(MARBLE); fbox(St, f, a, a + W, yF, yS - 0.3, o, o + 0.6, 1 | 4 | 8);
      D.setColor('#57534c'); fbox(D, f, a + W / 2 - 0.07, a + W / 2 + 0.07, yF + 0.3, yS - 0.5, o + 0.6, o + 0.62, 1 | 4 | 8);
      if (k === 1 || k === 2) { D.setColor('#1d1d1f'); fbox(D, f, a + 0.08, a + W - 0.08, yF + 1.7, yF + 2.35, o + 0.6, o + 0.64, 1 | 4 | 8 | 16 | 32); }
      if (k === 3) continue;
      const c0 = a + W, c1 = c0 + DW;
      B.lit.setColor('#80786a'); fq(B.lit, f, c0, c1, yF, yS - 0.3, o);
      D.setColor(BRONZE);
      for (const s of [c0 + 0.05, (c0 + c1) / 2, c1 - 0.05]) fbox(D, f, s - 0.05, s + 0.05, yF, yF + 2.6, o, o + 0.1, 1 | 4 | 8);
      fbox(D, f, c0, c1, yF + 2.6, yF + 2.72, o, o + 0.1, 1 | 16 | 32);
      fbox(D, f, c0, c1, yF + 1.0, yF + 1.06, o + 0.05, o + 0.12, 1 | 16);
    }
    // the flag on its bracket at the soffit edge, left of the doors
    const s = eA[0] - 0.8, p0 = P(f, s, yS - 0.25, BAT - 0.1), dv = [f.n[0] * 0.72, -0.69, f.n[1] * 0.72], L = 2.8;
    const at = (k, dy = 0) => [p0[0] + dv[0] * L * k, p0[1] + dv[1] * L * k - dy, p0[2] + dv[2] * L * k];
    D.setColor('#c9c9c6'); D.tube(p0, at(1), 0.03, 6);
    const fn = [f.r[0], 0, f.r[1]];
    B.flag.setColor('#1f5fbf'); B.flag.face([at(0.3), at(1), at(1, 0.55), at(0.3, 0.55)], fn);
    B.flag.setColor('#f2c21b'); B.flag.face([at(0.3, 0.55), at(1, 0.55), at(1, 1.1), at(0.3, 1.1)], fn);
  }

  // ---- the roof: the grey service block, its barrel-vaulted hut, vents
  {
    const rb = [-13, -12, 13, 17], yT = yR + 3.0, ring = rectL(...rb);
    St.setColor('#aaa59b'); St.extrude(ring, [], yR - DROP, yT, { top: false });
    D.setColor('#75726c'); D.fill(ring, [], yT, true);
    D.setColor('#bdb8ae');
    for (let i = 0; i < 4; i++) { const [a0, b0] = ring[i], [a1, b1] = ring[(i + 1) % 4]; D.face([[a0, yT, b0], [a1, yT, b1], [a1, yT + 0.12, b1], [a0, yT + 0.12, b0]]); }
    prismL(ring, yR - DROP, yT);
    for (let i = 0; i < 4; i++) { const [a0, b0] = ring[i], [a1, b1] = ring[(i + 1) % 4], [x0, z0] = F.w(a0, b0), [x1, z1] = F.w(a1, b1); Z.edge(x0, z0, x1, z1, yT); }
    // the hut: a half cylinder along a with flat ends
    const hb = 13.5, hr = 1.9, a0 = -10, a1 = -3.5, NS = 12;
    St.setColor('#c4beb2');
    for (let k = 0; k < NS; k++) {
      const t0 = PI * k / NS, t1 = PI * (k + 1) / NS, tm = (t0 + t1) / 2;
      St.face([[a0, yT + hr * Math.sin(t0), hb + hr * Math.cos(t0)], [a1, yT + hr * Math.sin(t0), hb + hr * Math.cos(t0)], [a1, yT + hr * Math.sin(t1), hb + hr * Math.cos(t1)], [a0, yT + hr * Math.sin(t1), hb + hr * Math.cos(t1)]], [0, Math.sin(tm), Math.cos(tm)]);
    }
    for (const [a, sx] of [[a0, -1], [a1, 1]]) St.face(Array.from({ length: NS + 1 }, (_, k) => [a, yT + hr * Math.sin(PI * k / NS), hb + hr * Math.cos(PI * k / NS)]), [sx, 0, 0]);
    D.setColor('#4f4c47'); D.face([[a1 + 0.01, yT, hb - 0.5], [a1 + 0.01, yT, hb + 0.5], [a1 + 0.01, yT + 1.7, hb + 0.5], [a1 + 0.01, yT + 1.7, hb - 0.5]], [1, 0, 0]);
    prismL(rectL(a0, hb - hr, a1, hb + hr), yT, yT + hr);
    D.setColor('#9ea09e');
    for (const [a, b] of [[4, -4], [7, 6], [-6, 2]]) { D.box(a - 0.7, yT, b - 0.5, a + 0.7, yT + 0.9, b + 0.5); prismL(rectL(a - 0.7, b - 0.5, a + 0.7, b + 0.5), yT, yT + 0.9, 'equipment'); }
    D.setColor('#7d8083');
    for (const [a, b, h] of [[10, 14, 3.5], [11, -9, 2.6]]) { D.cyl(a, yT, b, 0.06, 0.04, h, 6); const [x, z] = F.w(a, b); S.cyl(x, z, yT, yT + h, 0.1, 0.1, 'antenna'); Z.add(x, yT + h, z, 0, 1, 0, 'antenna'); }
  }

  // ---- the podium: granite paving, walls down to the ground, coping, the bastion, steps
  const pod = podiumRing(F), { a0: pa0, a1: pa1, b0: pb0, b1: pb1 } = pod;
  B.pave.setColor('#ffffff'); B.pave.fill(pod.ring, [], yF, true);
  prismL(rectL(pa0, pb0, pa1, pb1), yF - 6, yF, 'ledge');
  const bastion = pod.ring.slice(2, 15);
  prismL(bastion, yF - 6, yF, 'ledge');
  const E = { nw: frame([0, -1], pa1 - pa0, pa1, pb0), ne: frame([1, 0], pb1 - pb0, pa1, pb1), se: frame([0, 1], pa1 - pa0, pa0, pb1), sw: frame([-1, 0], pb1 - pb0, pa0, pb0) };
  const lowAlong = (f, s0, s1) => { let m = Infinity; for (let s = s0; s <= s1 + 1e-3; s += 2) { const [a, b] = flat(f, Math.min(s, s1), 0.5); m = Math.min(m, g(a, b)); } return m; };
  const bs = [pb1 - BAST.b - BAST.r, pb1 - BAST.b + BAST.r]; // the bastion's span on the terrace edge (s runs toward -b there)
  for (const [ek, f] of Object.entries(E)) {
    for (const [s0, s1] of ek === 'ne' ? [[0, bs[0]], [bs[1], f.w]] : [[0, f.w]]) {
      const y0 = Math.min(yF - 0.2, lowAlong(f, s0, s1) - 0.4);
      St.setColor('#c9c2b3'); fq(St, f, s0, s1, y0, yF, 0);
      D.setColor('#aaa49a'); fbox(D, f, s0, s1, yF, yF + 0.07, -0.45, 0.05, 1 | 16 | 4 | 8);
    }
  }
  { // the bastion: a curved wall to the lawn and a curved parapet round its top
    const cA = pa1, cB = BAST.b, NS = 12, y0 = Math.min(yF - 0.2, g(cA + BAST.r, cB) - 0.4), yP = yF + 1.0;
    for (let k = 0; k < NS; k++) {
      const t0 = -PI / 2 + PI * k / NS, t1 = t0 + PI / NS, tm = (t0 + t1) / 2, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const pt = (rr, c, s, y) => [cA + rr * c, y, cB + rr * s], n = [Math.cos(tm), 0, Math.sin(tm)];
      St.setColor('#c9c2b3'); St.face([pt(BAST.r, c0, s0, y0), pt(BAST.r, c1, s1, y0), pt(BAST.r, c1, s1, yP), pt(BAST.r, c0, s0, yP)], n);
      St.setColor('#bdb6a8'); St.face([pt(BAST.r - 0.3, c0, s0, yF), pt(BAST.r - 0.3, c1, s1, yF), pt(BAST.r - 0.3, c1, s1, yP), pt(BAST.r - 0.3, c0, s0, yP)], neg(n));
      D.setColor('#aaa49a'); D.face([pt(BAST.r + 0.05, c0, s0, yP + 0.07), pt(BAST.r + 0.05, c1, s1, yP + 0.07), pt(BAST.r - 0.35, c1, s1, yP + 0.07), pt(BAST.r - 0.35, c0, s0, yP + 0.07)], UP);
      D.face([pt(BAST.r + 0.05, c0, s0, yP), pt(BAST.r + 0.05, c1, s1, yP), pt(BAST.r + 0.05, c1, s1, yP + 0.07), pt(BAST.r + 0.05, c0, s0, yP + 0.07)], n);
      if (k % 3 === 0) {
        const t2 = Math.min(PI / 2, t0 + 3 * PI / NS), q = (rr, t) => [cA + rr * Math.cos(t), cB + rr * Math.sin(t)];
        prismL([q(BAST.r - 0.3, t0), q(BAST.r, t0), q(BAST.r, t2), q(BAST.r - 0.3, t2)], yF, yP + 0.07);
      }
    }
    St.setColor('#bdb6a8');
    for (const s of [-1, 1]) St.face([[cA, yF, cB + s * (BAST.r - 0.3)], [cA, yF, cB + s * BAST.r], [cA, yP, cB + s * BAST.r], [cA, yP, cB + s * (BAST.r - 0.3)]], [0, 0, -s]);
  }
  // steps out from a podium edge until they meet the ground; granite treads, the top nosing painted yellow
  let nSteps = 0;
  const stairs = (f, sc, width) => {
    const s0 = sc - width / 2, s1 = sc + width / 2;
    for (let k = 0; k < 24; k++) {
      const yt = yF - RISE * (k + 1), o0 = k * TREAD, o1 = o0 + TREAD, [ma, mb] = flat(f, sc, o1);
      if (yt < g(ma, mb) + 0.04) break;
      const y0 = Math.min(g(...flat(f, s0, o1)), g(...flat(f, s1, o1)), g(ma, mb)) - 0.3;
      D.setColor(k & 1 ? '#8e8a84' : '#96928b'); fbox(D, f, s0, s1, y0, yt, o0, o1, 1 | 4 | 8 | 16);
      D.setColor('#d9b52a'); fbox(D, f, s0 + 0.1, s1 - 0.1, yt, yt + 0.006, o1 - 0.07, o1 - 0.01, 16);
      prismL([flat(f, s0, o0), flat(f, s1, o0), flat(f, s1, o1), flat(f, s0, o1)], y0, yt, 'ledge');
      nSteps++;
    }
    D.setColor('#d9b52a'); fbox(D, f, s0 + 0.1, s1 - 0.1, yF, yF + 0.006, -0.07, -0.01, 16);
  };
  stairs(E.nw, pa1 - ENTRY_A, 14);        // the main flight down to vul. Slavy (the OSM steps)
  stairs(E.ne, pb1 + 22, 4);              // down to the Pagorb lawn at the entrance end
  stairs(E.se, 7 - pa0, 5);               // the back, toward the service drive

  // ---- lamps, benches with flower boxes
  const lamps = [];
  for (const [a, b] of [[-16, pb0 + 1.2], [ENTRY_A - 8.5, pb0 + 1.2], [ENTRY_A + 8.5, pb0 + 1.2], [16, pb0 + 1.2], [pa1 - 1.2, -18], [pa1 - 1.2, 17], [pa0 + 1.2, -14], [pa0 + 1.2, 14]]) {
    D.setColor('#2b2c2e'); D.cyl(a, yF, b, 0.2, 0.2, 0.45, 8); D.cyl(a, yF, b, 0.1, 0.06, 3.9, 8);
    B.lamp.setColor('#fff3dc'); B.lamp.ellipsoid([a, yF + 4.2, b], [0.3, 0.32, 0.3], 10, 6);
    D.setColor('#2b2c2e'); D.cyl(a, yF + 4.45, b, 0.12, 0.02, 0.2, 8);
    const [x, z] = F.w(a, b); S.cyl(x, z, yF, yF + 4.1, 0.12, 0.12, 'pole'); lamps.push([x, z]);
  }
  for (let b = -12; b <= 12; b += 6) {
    const a = pa0 + 1.1;
    D.setColor('#2f8a82'); D.box(a - 0.25, yF + 0.42, b - 0.9, a + 0.25, yF + 0.47, b + 0.9); D.box(a - 0.32, yF + 0.5, b - 0.9, a - 0.26, yF + 0.9, b + 0.9, 1 | 2 | 4 | 16 | 32);
    D.setColor('#3a3b3d'); for (const e of [-0.75, 0.75]) D.box(a - 0.3, yF, b + e - 0.04, a + 0.25, yF + 0.44, b + e + 0.04);
    prismL(rectL(a - 0.32, b - 0.9, a + 0.25, b + 0.9), yF, yF + 0.9, 'bench');
    if (b < 12) { // a concrete flower box between the benches
      const bb = b + 3;
      D.setColor('#b9b3a8'); D.box(a - 0.5, yF, bb - 1.2, a + 0.5, yF + 0.5, bb + 1.2, 1 | 2 | 4 | 16 | 32);
      for (let i = 0; i < 9; i++) { D.setColor(['#c8322c', '#e0a21f', '#d95a8c', '#3f7a2e'][Math.floor(r() * 4)]); D.boxC(a - 0.3 + r() * 0.6, yF + 0.58, bb - 1 + r() * 2, 0.22, 0.16, 0.22); }
      prismL(rectL(a - 0.5, bb - 1.2, a + 0.5, bb + 1.2), yF, yF + 0.5, 'bench');
    }
  }

  // ---- plantings: blue spruces and a juniper hedge on the lawn below the terrace, thujas at the entrance corner
  const spots = [], blue = [PARK_PINE[0].map(([rr, gg, bb]) => [0.8 * rr, 0.95 * gg, 1.25 * bb])];
  for (let b = pb0 + 3; b < pb1; b += 5.5 + r() * 2) {
    if (Math.abs(b - BAST.b) < BAST.r + 2.5 || Math.abs(b + 22) < 3.5) continue; // clear of the bastion and the steps
    const a = pa1 + 4.5 + r() * 3, [x, z] = F.w(a, b);
    spots.push({ x, z, y: heightAt(x, z), kind: 'conifer', variant: 'spruce', sc: 0.7 + 0.35 * r(), pal: blue, s3: [0.85, 1.1, 0.85] });
  }
  for (const [bA, bB] of [[pb0 + 1, -25], [-19, BAST.b - BAST.r - 1], [BAST.b + BAST.r + 1, pb1 - 1]]) {
    const [x0, z0] = F.w(pa1 + 1.3, bA), [x1, z1] = F.w(pa1 + 1.3, bB);
    spots.push(...hedgeSpots(x0, z0, x1, z1, { h: 0.8, w: 1.4, heightAt }));
  }
  for (const b of [pb0 + 2, pb0 + 4.5]) { const [x, z] = F.w(pa1 + 2.2, b); spots.push({ x, z, y: heightAt(x, z), kind: 'conifer', variant: 'spruce', sc: 0.55, s3: [0.4, 1.3, 0.4] }); }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'museum' });
  root.add(group);
  const stone = stoneTex(r), pave = paveTex(r);
  stone.repeat.set(1 / 6, 1 / 3); pave.repeat.set(1 / 8, 1 / 8);
  const Mt = {
    stone: new THREE.MeshStandardMaterial({ map: stone, vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    pave: new THREE.MeshStandardMaterial({ map: pave, vertexColors: true, roughness: 0.85 }),
    relief: new THREE.MeshStandardMaterial({ map: reliefTex(), alphaTest: 0.5, roughness: 0.9 }),
    letters: new THREE.MeshStandardMaterial({ map: lettersTex(), alphaTest: 0.4, metalness: 0.55, roughness: 0.4, emissive: 0xffc27a, emissiveIntensity: 0 }),
    flag: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xfff0d0, emissiveIntensity: 0 }),
  };
  Mt.letters.emissiveMap = Mt.letters.map;
  let nV = 0;
  for (const [k, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const flatish = k === 'glass' || k === 'lit' || k === 'relief' || k === 'letters' || k === 'pave';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), Mt[k]), { name: 'museum-' + k, castShadow: !flatish, receiveShadow: true }));
  }
  console.log(`[cherkasy] Museum: ${nWin} windows, ${nC} cartouches, ${nSteps} steps, ${spots.length} plantings, ${(nV / 1000).toFixed(1)}k verts, ${S.count - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const inBast = (a, b) => Math.hypot(a - pa1, b - BAST.b) < BAST.r + 0.5;
  return {
    footprints: [{ poly: ringPts(F.bld.p), h: yR + 3 - yF, kind: 'public', name: 'Краєзнавчий музей' }],
    spots,
    // generated trees keep off the podium, its steps and the bastion
    clear: (x, z) => { const [a, b] = F.l(x, z); return (a > pa0 - 1.5 && a < pa1 + 1 && b > pb0 - 6 && b < pb1 + 3) || inBast(a, b); },
    update() { const k = nightK.value; Mt.lit.emissiveIntensity = 1.2 * k; Mt.lamp.emissiveIntensity = 2.2 * k; Mt.letters.emissiveIntensity = 0.5 * k; },
  };
}
