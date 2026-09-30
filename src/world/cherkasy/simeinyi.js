// OWNER: cherkasy. ЖК «Сімейний Lux», вул. Героїв Дніпра 4, 4/1, 4/2, 4/3 (Mytnytsia, by the Dnipro embankment): the
// four 12-storey brick sections built by Artproektbud in 2017–2019, rebuilt after the developer's renders and the
// construction photos (novobudovy.com, in.ck.ua, dom.ria.com, vn.com.ua). Cream facing brick; stacks of floor-to-ceiling
// loggia glazing in graphite frames with a slab ledge per floor; narrow window stacks over chocolate-brown spandrels;
// the bowed corner bays (the two shallow facets in the OSM outlines) as blue curtain glass that rises above the roof as
// the complex's glass crowns; shopfronts under a brown fascia on the outer sides (a deep canopy along Героїв Дніпра),
// entrances, garage doors and service windows on the yard; parapets with a dark coping, lift rooms on the roofs; the
// one-storey cream-brick service block in the yard. No 4 stands alone; 4/1–4/2–4/3 are one chain on one floor level.
//   SIMEINYI_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildSimeinyi({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every outline edge becomes a facade in its own frame (s along the edge, y up, o outward); the parts of an edge that
// another section's wall covers are left out. Openings are recessed strips a whole stack high, glazed per floor so a
// share of the flats lights up at night (nightK); tiling textures carry the brick coursing and the window frames.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, area2, obb, rng, hash01, inPoly, convexParts } from './geo.js';

const NO4 = 712687188, B41 = 1225615929, B42 = 1225616100, B43 = 786358727, ANNEX = 996845713;
const CHAIN = new Set([B41, B42, B43]);
export const SIMEINYI_SKIP = new Set([NO4, B41, B42, B43, ANNEX]);
const NAMES = { [NO4]: 'Героїв Дніпра 4', [B41]: 'Героїв Дніпра 4/1', [B42]: 'Героїв Дніпра 4/2', [B43]: 'Героїв Дніпра 4/3', [ANNEX]: 'Героїв Дніпра 4' };

const GF = 3.6, FH = 3.05, UP_FLOORS = 11;     // commercial ground floor, typical storey, storeys above it
const PARA = 0.9, CROWN = 2.9;                 // parapet over the roof; the glass bays rise this far above the roof
const YARD = [1365, 2332];                     // the playground square the sections stand round (map metres)
const BRICK_U = 2.08, BRICK_V = 1.95;          // metres per brick texture repeat: 8 stretchers x 26 courses
const CHOC = '#5b4033', GRAPH = '#3b3a3b', REVEAL = '#d9c9ab', COPING = '#4e4038', PLINTH = '#8b8175';
const MAST = '#6d7174';
const TINT_C = ['#9cc2d2', '#8fb6c9', '#a7c9d4'], TINT_L = ['#aab8bf', '#9fb0b9', '#b4c0c4', '#98a9b3'];

// ------------------------------------------------------------------------------------------------ textures
function paintTex(w, h, draw) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(cv.getContext('2d'), w, h);
  const wrap = THREE.RepeatWrapping;
  return Object.assign(new THREE.CanvasTexture(cv), { wrapS: wrap, wrapT: wrap, anisotropy: 8, colorSpace: THREE.SRGBColorSpace });
}
const paintRect = (g, style, x, y, w, h) => { g.fillStyle = style; g.fillRect(x, y, w, h); };
// cream facing brick: pale joints, each stretcher fired a touch warmer or cooler, a little weathering speckle
const creamBrick = (r) => paintTex(512, 512, (g, w, h) => {
  g.fillStyle = '#e4dbc9'; g.fillRect(0, 0, w, h);
  const cw = w / 8, ch = h / 26;
  for (let row = 0; row < 26; row++) {
    const shift = row % 2 ? cw * 0.5 : 0;
    for (let i = -1; i < 8; i++) {
      const warm = r(), k = 0.97 + r() * 0.05;
      const base = warm < 0.12 ? [234, 218, 186] : warm < 0.22 ? [228, 221, 206] : [236, 225, 202];
      g.fillStyle = `rgb(${base.map((c) => Math.min(255, Math.round(c * k))).join(',')})`;
      g.fillRect(i * cw + shift + 1, row * ch + 1, cw - 2, ch - 2);
    }
  }
  for (let q = 0; q < 1800; q++) {
    g.fillStyle = r() < 0.6 ? 'rgba(120,100,80,0.07)' : 'rgba(255,255,250,0.10)';
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
  }
});
// one bay x one storey of loggia / curtain glazing (v = 0 at the floor): graphite frame, a transom at the fanlight,
// the balustrade rail behind the glass, a sky sheen towards the top; mask: the glass only (for the lit windows)
const bayTex = (mask) => paintTex(128, 256, (g, w, h) => {
  const glass = g.createLinearGradient(0, 0, 0, h);
  glass.addColorStop(0, mask ? '#fff' : '#d4dde2'); glass.addColorStop(1, mask ? '#fff' : '#8f9ba3');
  g.fillStyle = glass; g.fillRect(0, 0, w, h);
  g.fillStyle = mask ? '#000' : '#38383a';
  g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);   // mullions
  g.fillRect(0, h - 22, w, 22);                          // sill / slab line
  g.fillRect(0, 0, w, 5);                                // head
  g.fillRect(0, Math.round(h * 0.2), w, 4);              // fanlight transom
  if (!mask) { g.fillStyle = 'rgba(40,40,44,0.55)'; g.fillRect(0, Math.round(h * 0.62), w, 4); } // rail inside
});
// one narrow window over its chocolate spandrel, one storey tall; mask: the glass only
const stripTex = (mask) => paintTex(64, 256, (g, w, h) => {
  paintRect(g, mask ? '#000' : '#5f4234', 0, 0, w, h); // the spandrel panel fills the storey, the window goes over it
  const top = Math.round(h * 0.05), sill = Math.round(h * 0.66);
  const glass = g.createLinearGradient(0, top, 0, sill);
  glass.addColorStop(0, mask ? '#fff' : '#bfcbd1'); glass.addColorStop(1, mask ? '#fff' : '#7d8a92');
  g.fillStyle = glass; g.fillRect(0, top, w, sill - top);
  g.fillStyle = mask ? '#000' : '#39383a';
  g.fillRect(0, top, 4, sill - top); g.fillRect(w - 4, top, 4, sill - top); g.fillRect(0, top, w, 4); g.fillRect(0, sill - 4, w, 4);
  g.fillRect(w / 2 - 2, top, 4, sill - top); g.fillRect(0, Math.round(h * 0.2), w, 3);
  if (!mask) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, sill + 8, w, 2); g.fillRect(0, h - 12, w, 2); } // panel joints
});

// ------------------------------------------------------------------------------------------------ edge frames
// a facade along edge a -> b of a positive ring: s from a, o along the outward normal (dz, -dx)
function edgeFrame(ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez);
  const tx = ex / L, tz = ez / L;
  return { ax, az, tx, tz, nx: tz, nz: -tx, L, N: [tz, 0, -tx], T: [tx, 0, tz] };
}
const pt = (F, s, y, o = 0) => [F.ax + F.tx * s + F.nx * o, y, F.az + F.tz * s + F.nz * o];
const flip = (v) => [-v[0], -v[1], -v[2]];
const UPV = [0, 1, 0], DNV = [0, -1, 0];

// four corners in order, facing n (the winding is chosen from n); uv optional per corner
const NOUV = [[0, 0], [0, 0], [0, 0], [0, 0]];
function face4(D, a, b, c, d, n, uv = NOUV) {
  // triple product n . ((b - a) x (d - a)): positive when a b c d already runs counter-clockwise seen from n
  const u = [0, 1, 2].map((k) => b[k] - a[k]), w = [0, 1, 2].map((k) => d[k] - a[k]);
  const turn = n[0] * (u[1] * w[2] - u[2] * w[1]) + n[1] * (u[2] * w[0] - u[0] * w[2]) + n[2] * (u[0] * w[1] - u[1] * w[0]);
  const corner = [a, b, c, d];
  const id = corner.map((p, k) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[k][0], uv[k][1]));
  const order = turn < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
  D.quad(id[order[0]], id[order[1]], id[order[2]], id[order[3]]);
}
// block over [s0, s1] x [y0, y1] x [o0, o1] in the frame; sides: 1 out, 2 in, 4 at s0, 8 at s1, 16 top, 32 bottom
function block(D, F, s0, s1, y0, y1, o0, o1, sides = 63) {
  const c = (s, y, o) => pt(F, s, y, o);
  if (sides & 1) face4(D, c(s0, y0, o1), c(s1, y0, o1), c(s1, y1, o1), c(s0, y1, o1), F.N);
  if (sides & 2) face4(D, c(s0, y0, o0), c(s1, y0, o0), c(s1, y1, o0), c(s0, y1, o0), flip(F.N));
  if (sides & 4) face4(D, c(s0, y0, o0), c(s0, y0, o1), c(s0, y1, o1), c(s0, y1, o0), flip(F.T));
  if (sides & 8) face4(D, c(s1, y0, o0), c(s1, y0, o1), c(s1, y1, o1), c(s1, y1, o0), F.T);
  if (sides & 16) face4(D, c(s0, y1, o0), c(s1, y1, o0), c(s1, y1, o1), c(s0, y1, o1), UPV);
  if (sides & 32) face4(D, c(s0, y0, o0), c(s1, y0, o0), c(s1, y0, o1), c(s0, y0, o1), DNV);
}
// collision prism over an s / o rectangle of the frame
function framePrism(S, F, s0, s1, o0, o1, y0, y1, kind, flags = 0) {
  const ring = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = pt(F, s, 0, o); return [p[0], p[2]]; });
  if (area2(ring) < 0) ring.reverse();
  S.prism(ring.flat(), y0, y1, 0, 0, kind, flags);
}

// wall plane of the frame from y0 to y1 with the openings cut out: bands between every opening top / bottom, and in
// each band the stretches no opening crosses; brick uv in metres (s0u shifts the coursing along the ring)
function holedWall(D, F, holes, y0, y1, s0u) {
  const levels = [y0, y1];
  holes.forEach((q) => { if (q.y0 > y0 && q.y0 < y1) levels.push(q.y0); if (q.y1 > y0 && q.y1 < y1) levels.push(q.y1); });
  levels.sort((p, q) => p - q);
  const piece = (a, b, ya, yb) => { // one brick rectangle, coursing continuous round the ring
    if (b <= a + 1e-3) return;
    const ua = (a + s0u) / BRICK_U, ub = (b + s0u) / BRICK_U, va = ya / BRICK_V, vb = yb / BRICK_V;
    face4(D, pt(F, a, ya), pt(F, b, ya), pt(F, b, yb), pt(F, a, yb), F.N, [[ua, va], [ub, va], [ub, vb], [ua, vb]]);
  };
  levels.forEach((yb, i) => {
    const ya = levels[i - 1];
    if (!i || yb - ya < 1e-4) return;
    const across = holes.filter((q) => q.y0 <= ya + 1e-4 && q.y1 >= yb - 1e-4);
    across.sort((p, q) => p.s0 - q.s0);
    const edge = across.reduce((s, q) => { piece(s, q.s0, ya, yb); return Math.max(s, q.s1); }, 0);
    piece(edge, F.L, ya, yb);
  });
}
// the four reveal faces of a recess depth d deep
function reveals(D, F, q, d, color) {
  D.setColor(color);
  const { s0, s1, y0, y1 } = q;
  face4(D, pt(F, s0, y0), pt(F, s0, y0, -d), pt(F, s0, y1, -d), pt(F, s0, y1), F.T);
  face4(D, pt(F, s1, y0), pt(F, s1, y0, -d), pt(F, s1, y1, -d), pt(F, s1, y1), flip(F.T));
  face4(D, pt(F, s0, y1), pt(F, s1, y1), pt(F, s1, y1, -d), pt(F, s0, y1, -d), DNV);
  face4(D, pt(F, s0, y0), pt(F, s1, y0), pt(F, s1, y0, -d), pt(F, s0, y0, -d), UPV);
}
// a glazed pane in the frame at depth o, uv: u in bays, v in storeys
function pane(D, F, s0, s1, y0, y1, o, u1, v0, v1) {
  face4(D, pt(F, s0, y0, o), pt(F, s1, y0, o), pt(F, s1, y1, o), pt(F, s0, y1, o), F.N, [[0, v0], [u1, v0], [u1, v1], [0, v1]]);
}

// tree keep-out: inside the outline or within m of a wall (the bbox test first, most calls are far away)
function keepOut(R, m) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of R) { b[0] = Math.min(b[0], x - m); b[1] = Math.min(b[1], z - m); b[2] = Math.max(b[2], x + m); b[3] = Math.max(b[3], z + m); }
  return { R, b, m };
}
function near({ R, b, m }, x, z) {
  const outside = x < b[0] || z < b[1] || x > b[2] || z > b[3];
  if (outside) return false;
  return inPoly(R, x, z) || R.some((p, i) => { // distance to each wall line, clamped to the wall
    const q = R[i + 1] || R[0], ex = q[0] - p[0], ez = q[1] - p[1];
    const f = Math.min(1, Math.max(0, ((x - p[0]) * ex + (z - p[1]) * ez) / Math.max(1e-9, ex * ex + ez * ez)));
    return Math.hypot(p[0] + f * ex - x, p[1] + f * ez - z) < m;
  });
}

// ------------------------------------------------------------------------------------------------ build
export function buildSimeinyi({ root, map, solids: S, zips: Z, heightAt }) {
  const recs = [NO4, B41, B42, B43].map((id) => map.buildings.find((b) => b.id === id)).filter(Boolean);
  if (!recs.length) return null;
  const t0 = performance.now();
  const B = { brick: new MB(), det: new MB(), glassB: new MB(), litB: new MB(), glassS: new MB(), litS: new MB() };
  const rings = new Map(recs.map((b) => { const R = ringPts(b.p); return [b.id, area2(R) < 0 ? R.reverse() : R]; }));

  // floor levels: the chain shares one (its sections are joined), No 4 has its own; both over the highest ground
  const groundOf = (R) => { const hs = R.map(([x, z]) => heightAt(x, z)); return { lo: Math.min(...hs), hi: Math.max(...hs) }; };
  const lvl = {};
  const chainG = [...CHAIN].filter((id) => rings.has(id)).map((id) => groundOf(rings.get(id)));
  const chainLevel = chainG.length ? { lo: Math.min(...chainG.map((g) => g.lo)), hi: Math.max(...chainG.map((g) => g.hi)) } : null;
  for (const [id, R] of rings) lvl[id] = CHAIN.has(id) ? chainLevel : groundOf(R);

  // edges covered by a neighbour's wall (collinear, facing the other way, within 40 cm): [t0, t1] per edge in metres
  const covered = (id, a, b) => {
    const F = edgeFrame(a[0], a[1], b[0], b[1]), out = [];
    for (const [jd, Q] of rings) {
      if (jd === id) continue;
      Q.forEach((p, k) => {
        const q = Q[k + 1] || Q[0];
        const ta = (p[0] - F.ax) * F.tx + (p[1] - F.az) * F.tz, tb = (q[0] - F.ax) * F.tx + (q[1] - F.az) * F.tz;
        const da = (p[0] - F.ax) * F.nx + (p[1] - F.az) * F.nz, db = (q[0] - F.ax) * F.nx + (q[1] - F.az) * F.nz;
        if (Math.abs(da) > 0.4 || Math.abs(db) > 0.4) return;
        const lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(F.L, Math.max(ta, tb));
        if (hi - lo > 0.2) out.push([lo, hi]);
      });
    }
    return out.sort((x, y) => x[0] - y[0]);
  };

  const groundAt = (F, s, o) => { const p = pt(F, s, 0, o); return heightAt(p[0], p[2]); };
  let nOpen = 0, nLit = 0;
  const footprints = [], keep = []; // keep: [ring, bbox grown by the margin, margin]
  for (const [id, R] of rings) {
    const r = rng(id % 99991), { lo: gLo, hi: gHi } = lvl[id];
    const yF = gHi + 0.15, y1st = yF + GF, yR = y1st + UP_FLOORS * FH, yTop = yR + PARA, yCrown = yR + CROWN, gBase = gLo - 0.5;
    const ob = obb(R), axis = Math.atan2(ob.uz, ob.ux);
    const flags = recs.find((b) => b.id === id).f || '';
    const n = R.length, at = (i) => R[((i % n) + n) % n];
    const len = (i) => Math.hypot(at(i + 1)[0] - at(i)[0], at(i + 1)[1] - at(i)[1]);
    const convex = (i) => { // corner at vertex i: the ring turns left there (outward corner of a positive ring)
      const [px, pz] = at(i - 1), [qx, qz] = at(i), [sx, sz] = at(i + 1);
      return (qx - px) * (sz - qz) > (qz - pz) * (sx - qx);
    };

    // ---- classify the edges and lay out their openings
    const faces = [], QUART = Math.PI / 2;
    R.reduce((ringS, a, i) => {
      const b = at(i + 1), Fe = edgeFrame(a[0], a[1], b[0], b[1]);
      const off = Math.atan2(Fe.tz, Fe.tx) - axis, wrapped = off - QUART * Math.floor(off / QUART); // 0 .. 90 degrees
      const dev = Math.min(wrapped, QUART - wrapped); // how far the edge leans off the section's grid
      const kind = dev > 0.09 && Fe.L > 2.5 ? 'bow' : Fe.L < 1.8 ? 'plain'
        : len(i - 1) < 2 && len(i + 1) < 2 && convex(i) && convex((i + 1) % n) ? 'bay' : 'wall';
      const toYard = [YARD[0] - (a[0] + b[0]) / 2, YARD[1] - (a[1] + b[1]) / 2], yd = Math.hypot(toYard[0], toYard[1]);
      const yard = yd < 48 && toYard[0] * Fe.nx + toYard[1] * Fe.nz > 0.3 * yd; // the wall looks into the playground square
      // the stretches of the edge no neighbour covers
      let s = 0;
      const parts = [];
      for (const [c0, c1] of covered(id, a, b)) { if (c0 - s > 0.25) parts.push([s, c0]); s = Math.max(s, c1); }
      if (Fe.L - s > 0.25) parts.push([s, Fe.L]);
      for (const [p0, p1] of parts) {
        const pa = pt(Fe, p0, 0), pb = pt(Fe, p1, 0), F = edgeFrame(pa[0], pa[2], pb[0], pb[2]);
        faces.push({ F, kind, yard, street: flags[i] === '2', holes: [], s0u: ringS + p0, seed: hash01(id * 131 + i * 7 + Math.round(p0)) });
      }
      return ringS + Fe.L;
    }, 0);

    const lit = (p) => r() < p;
    const stack = (f, kind, s0, s1) => f.holes.push({ kind, s0, s1, y0: y1st, y1: yR });
    for (const f of faces) {
      const W = f.F.L;
      if (f.kind === 'bow') { f.holes.push({ kind: 'curtain', s0: 0, s1: W, y0: y1st, y1: yCrown }); continue; }
      if (f.kind === 'plain') continue;
      // upper floors
      const m = f.kind === 'bay' ? 0.35 : 0.6, U = W - 2 * m;
      if (f.kind === 'bay') {
        const k = Math.max(1, Math.round(U / 3.4)), w = (U - (k - 1) * 0.4) / k;
        for (let j = 0; j < k; j++) stack(f, 'loggia', m + j * (w + 0.4), m + j * (w + 0.4) + w);
      } else if (U < 2.6) {
        if (U > 0.9) { const w = Math.min(1.2, U - 0.2); stack(f, 'strip', W / 2 - w / 2, W / 2 + w / 2); }
      } else {
        // modules of ~3.8 m: a loggia stack and a pair of narrow windows by turns, which one leads is per wall
        const mods = Math.max(1, Math.round(U / 3.8)), mw = U / mods, lead = f.seed >= 0.5;
        Array.from({ length: mods }, (_, j) => m + mw * (j + 0.5)).forEach((c, j) => {
          const glazed = (j % 2 === 0) !== lead || (mods === 1 && mw > 3.2), half = (mw - 0.9) / 2;
          if (glazed) stack(f, 'loggia', c - half, c + half);
          else if (mw < 2.8) stack(f, 'strip', c - 0.5, c + 0.5);
          else for (const side of [-1, 1]) stack(f, 'strip', c + side * 0.775 - 0.475, c + side * 0.775 + 0.475);
        });
      }
    }
    // ground floor: shopfronts on the outer sides, the entrance / garages / service windows on the yard
    const entry = faces.filter((f) => f.yard && f.kind !== 'plain' && f.F.L >= 3.5).sort((p, q) => q.F.L - p.F.L)[0];
    for (const f of faces) {
      const W = f.F.L;
      if (W < 2.4) continue;
      if (!f.yard) {
        f.shop = true;
        const k = Math.max(1, Math.round((W - 1) / 3.2)), w = (W - 1 - (k - 1) * 0.6) / k;
        if (w >= 0.9) for (let j = 0; j < k; j++) f.holes.push({ kind: 'shop', s0: 0.5 + j * (w + 0.6), s1: 0.5 + j * (w + 0.6) + w, y0: yF + 0.05, y1: y1st - 0.95 });
      } else if (f === entry) {
        const c = W / 2;
        f.holes.push({ kind: 'door', s0: c - 0.9, s1: c + 0.9, y0: yF, y1: yF + 2.45 });
        for (const d of [-2.4, 2.4]) if (c + d - 0.6 > 0.4 && c + d + 0.6 < W - 0.4) f.holes.push({ kind: 'service', s0: c + d - 0.6, s1: c + d + 0.6, y0: yF + 1.2, y1: yF + 2.6 });
      } else if (W >= 4 && f.seed < 0.55) {
        const k = Math.floor((W - 0.8) / 3.3), s0 = (W - k * 3.3) / 2;
        for (let j = 0; j < k; j++) f.holes.push({ kind: 'garage', s0: s0 + j * 3.3 + 0.35, s1: s0 + j * 3.3 + 2.95, y0: yF, y1: yF + 2.4 });
      } else {
        for (let s = 1.5; s + 1.4 < W; s += 3) f.holes.push({ kind: 'service', s0: s, s1: s + 1.2, y0: yF + 1.4, y1: yF + 2.4 });
      }
    }

    // ---- walls, openings, fascias, parapets
    const tintL = TINT_L[Math.floor(r() * TINT_L.length)], tintC = TINT_C[Math.floor(r() * TINT_C.length)];
    for (const f of faces) {
      const F = f.F, W = F.L;
      const solidTop = f.kind === 'bow' ? y1st : yTop;
      B.brick.setColor('#f6efe2');
      holedWall(B.brick, F, f.holes, yF, solidTop, f.s0u);
      B.det.setColor(PLINTH); block(B.det, F, 0, W, gBase, yF, -0.05, 0.03, 1);
      for (const q of f.holes) {
        nOpen++;
        const w = q.s1 - q.s0;
        if (q.kind === 'loggia') {
          reveals(B.det, F, q, 0.16, REVEAL);
          const bays = Math.max(1, Math.round(w / 1.15));
          for (let k = 0; k < UP_FLOORS; k++) {
            const on = lit(0.28), D = on ? B.litB : B.glassB;
            if (on) nLit++;
            D.setColor(tintL); pane(D, F, q.s0, q.s1, q.y0 + k * FH, q.y0 + (k + 1) * FH, -0.14, bays, 0, 1);
            if (k) { B.det.setColor(GRAPH); block(B.det, F, q.s0, q.s1, q.y0 + k * FH - 0.06, q.y0 + k * FH + 0.08, -0.14, 0.07, 1 | 16 | 32); }
          }
        } else if (q.kind === 'strip') {
          reveals(B.det, F, q, 0.18, REVEAL);
          for (let k = 0; k < UP_FLOORS; k++) {
            const on = lit(0.25), D = on ? B.litS : B.glassS;
            if (on) nLit++;
            D.setColor('#ffffff'); pane(D, F, q.s0, q.s1, q.y0 + k * FH, q.y0 + (k + 1) * FH, -0.16, 1, 0, 1);
          }
        } else if (q.kind === 'curtain') {
          const bays = Math.max(1, Math.round(w / 1.25));
          for (let k = 0; k <= UP_FLOORS; k++) {
            const ya = q.y0 + k * FH, yb = k < UP_FLOORS ? ya + FH : q.y1, on = k < UP_FLOORS && lit(0.3), D = on ? B.litB : B.glassB;
            if (on) nLit++;
            D.setColor(tintC); pane(D, F, 0, W, ya, yb, 0.02, bays, 0, (yb - ya) / FH);
          }
          B.det.setColor(GRAPH);
          for (const s of [0, W]) block(B.det, F, s - 0.05, s + 0.05, q.y0, q.y1, -0.05, 0.1, 1 | 4 | 8);
          block(B.det, F, 0, W, q.y1, q.y1 + 0.12, -0.3, 0.1, 1 | 2 | 16 | 32);
          framePrism(S, F, 0, W, -0.3, 0.1, yR, q.y1 + 0.12, 'wall');
        } else if (q.kind === 'shop') {
          reveals(B.det, F, q, 0.22, REVEAL);
          const on = lit(0.6), D = on ? B.litB : B.glassB;
          if (on) nLit++;
          D.setColor('#b9c6cc'); pane(D, F, q.s0, q.s1, q.y0, q.y1, -0.2, Math.max(1, Math.round(w / 1.5)), 0.1, 1);
        } else if (q.kind === 'door') {
          reveals(B.det, F, q, 0.3, REVEAL);
          B.litB.setColor('#c8d2d6'); pane(B.litB, F, q.s0, q.s1, q.y0, q.y1, -0.28, 2, 0.08, 0.95); nLit++;
          // canopy on two thin brackets, a step down to the ground
          B.det.setColor(CHOC); block(B.det, F, q.s0 - 0.9, q.s1 + 0.9, q.y1 + 0.3, q.y1 + 0.5, 0, 1.5, 1 | 4 | 8 | 16 | 32);
          framePrism(S, F, q.s0 - 0.9, q.s1 + 0.9, -0.05, 1.5, q.y1 + 0.3, q.y1 + 0.5, 'awning', 1);
          const gd = groundAt(F, (q.s0 + q.s1) / 2, 1.2);
          B.det.setColor('#9d978d'); block(B.det, F, q.s0 - 0.6, q.s1 + 0.6, Math.min(gd, yF) - 0.4, yF, 0, 1.6, 1 | 4 | 8 | 16);
        } else if (q.kind === 'garage') {
          reveals(B.det, F, q, 0.12, REVEAL);
          B.det.setColor('#a39b8d'); block(B.det, F, q.s0, q.s1, q.y0, q.y1, -0.12, -0.1, 1);
          B.det.setColor('#8a8377');
          for (let y = q.y0 + 0.3; y < q.y1 - 0.1; y += 0.3) block(B.det, F, q.s0, q.s1, y - 0.015, y + 0.015, -0.12, -0.09, 1 | 16);
          const gd = groundAt(F, (q.s0 + q.s1) / 2, 1.2);
          if (yF - gd > 0.05) { B.det.setColor('#9d978d'); block(B.det, F, q.s0, q.s1, gd - 0.4, yF, 0, 1.4, 1 | 4 | 8 | 16); }
        } else if (q.kind === 'service') {
          reveals(B.det, F, q, 0.14, REVEAL);
          const on = lit(0.2), D = on ? B.litS : B.glassS;
          D.setColor('#ffffff'); pane(D, F, q.s0, q.s1, q.y0, q.y1, -0.12, 1, 0.06, 0.64);
        }
      }
      if (f.shop) { // brown fascia over the shopfronts; along Героїв Дніпра it is a deep canopy
        B.det.setColor(CHOC); block(B.det, F, 0, W, y1st - 0.95, y1st - 0.05, 0, 0.3, 1 | 4 | 8 | 16 | 32);
        if (f.street) {
          block(B.det, F, 0, W, y1st - 0.95, y1st - 0.72, 0.3, 1.8, 1 | 4 | 8 | 16 | 32);
          framePrism(S, F, 0, W, 0, 1.8, y1st - 0.95, y1st - 0.72, 'awning', 1);
        }
      }
      if (f.kind !== 'bow') { // parapet: inner face and a dark coping; the roof edge anchor
        B.det.setColor('#cbbfa8'); face4(B.det, pt(F, 0, yR, -0.3), pt(F, W, yR, -0.3), pt(F, W, yTop, -0.3), pt(F, 0, yTop, -0.3), flip(F.N));
        B.det.setColor(COPING); block(B.det, F, -0.02, W + 0.02, yTop, yTop + 0.08, -0.32, 0.05, 1 | 16 | 32);
        if (W >= 3) { const a0 = pt(F, 0, 0, -0.12), a1 = pt(F, W, 0, -0.12); Z.edge(a0[0], a0[2], a1[0], a1[2], yTop, F.nx, F.nz); }
      }
    }

    // ---- roof, lift rooms and stair exits, a couple of masts
    B.det.setColor('#56534f'); B.det.fill(R, [], yR, true);
    const cx = ob.cx, cz = ob.cz, ux = ob.ux, uz = ob.uz;
    for (const [du, w, d, h] of [[-3, 3.2, 5.2, 3.4], [3.5, 2.6, 3.2, 2.6]]) {
      const x = cx + ux * du, z = cz + uz * du;
      if (!inPoly(R, x, z)) continue;
      const Fm = edgeFrame(x - ux * w / 2 + uz * d / 2, z - uz * w / 2 - ux * d / 2, x + ux * w / 2 + uz * d / 2, z + uz * w / 2 - ux * d / 2);
      B.brick.setColor('#f2ede4'); block(B.brick, Fm, 0, w, yR, yR + h, -d, 0, 1 | 2 | 4 | 8);
      B.det.setColor(COPING); block(B.det, Fm, -0.05, w + 0.05, yR + h, yR + h + 0.1, -d - 0.05, 0.05, 1 | 2 | 4 | 8 | 16);
      framePrism(S, Fm, 0, w, -d, 0, yR, yR + h + 0.1, 'bulkhead');
    }
    B.det.setColor(MAST);
    for (let k = 0; k < 2; k++) {
      const x = cx + ux * (7 + r() * 4) * (k ? 1 : -1) + uz * (r() - 0.5) * 4, z = cz + uz * (7 + r() * 4) * (k ? 1 : -1) - ux * (r() - 0.5) * 4;
      if (inPoly(R, x, z)) B.det.cyl(x, yR, z, 0.04, 0.03, 2.5 + r() * 1.5, 5);
    }

    // ---- collision and footprint
    for (const P of convexParts(R)) S.prism(P.flat(), gBase, yTop, 0, 0, 'wall');
    footprints.push({ poly: R.map((p) => [p[0], p[1]]), h: yTop - gLo, kind: 'apt', name: NAMES[id] });
    keep.push(keepOut(R, 3));
  }

  // ---- the service block in the yard: cream brick with two chocolate bands, steel double doors on the lane side
  const ax = map.buildings.find((b) => b.id === ANNEX);
  if (ax) {
    let A = ringPts(ax.p);
    if (area2(A) < 0) A = A.reverse();
    const hs = A.map(([x, z]) => heightAt(x, z)), gL = Math.min(...hs), yA = Math.max(...hs) + 0.1, yT = yA + 3.3;
    // the doors go on the long side nearest the service lane south of it
    const lane = (i) => { const p = A[i], q = A[i + 1] || A[0]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 8 ? Math.hypot((p[0] + q[0]) / 2 - 1362, (p[1] + q[1]) / 2 - 2360) : Infinity; };
    const best = A.map((_, i) => i).reduce((u, i) => (lane(i) < lane(u) ? i : u), 0);
    let su = 0;
    A.forEach((a, i) => {
      const b = A[(i + 1) % A.length], F = edgeFrame(a[0], a[1], b[0], b[1]), W = F.L;
      const holes = i === best ? [W * 0.3, W * 0.7].map((c) => ({ s0: c - 0.8, s1: c + 0.8, y0: yA, y1: yA + 2.3 })) : [];
      B.brick.setColor('#ffffff'); holedWall(B.brick, F, holes, yA, yT, su); su += W;
      B.det.setColor(PLINTH); block(B.det, F, 0, W, gL - 0.4, yA, -0.05, 0.03, 1);
      B.det.setColor(CHOC);
      for (const y of [yA + 2.55, yA + 2.95]) {
        const spans = holes.length ? [[0, holes[0].s0], [holes[0].s1, holes[1].s0], [holes[1].s1, W]] : [[0, W]];
        for (const [p, q] of spans) block(B.det, F, p, q, y, y + 0.18, 0, 0.03, 1 | 16 | 32);
        if (holes.length) for (const q of holes) block(B.det, F, q.s0, q.s1, y, y + 0.18, 0, 0.03, 1 | 16 | 32);
      }
      for (const q of holes) {
        reveals(B.det, F, q, 0.12, REVEAL);
        B.det.setColor('#4a4543'); block(B.det, F, q.s0, q.s1, q.y0, q.y1, -0.12, -0.1, 1);
        B.det.setColor('#2f2c2b'); block(B.det, F, (q.s0 + q.s1) / 2 - 0.02, (q.s0 + q.s1) / 2 + 0.02, q.y0, q.y1, -0.1, -0.08, 1);
      }
      B.det.setColor(COPING); block(B.det, F, -0.04, W + 0.04, yT, yT + 0.12, -0.25, 0.06, 1 | 16 | 32);
    });
    B.det.setColor('#5d5a55'); B.det.fill(A, [], yT + 0.02, true);
    S.prism(A.flat(), gL - 0.4, yT + 0.12, 0, 0, 'wall');
    footprints.push({ poly: A.map((p) => [p[0], p[1]]), h: yT - gL, kind: 'shed', name: NAMES[ANNEX] });
    keep.push(keepOut(A, 2));
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'simeinyi-lux' });
  root.add(group);
  const bay = bayTex(false), bayMask = bayTex(true), strip = stripTex(false), stripMask = stripTex(true);
  const warm = 0xffd49a;
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: creamBrick(rng(4417)), vertexColors: true, roughness: 0.88 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glassB: new THREE.MeshStandardMaterial({ map: bay, vertexColors: true, roughness: 0.1, metalness: 0.35, envMapIntensity: 1.3, side: THREE.DoubleSide }),
    litB: new THREE.MeshStandardMaterial({ map: bay, vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: warm, emissiveMap: bayMask, emissiveIntensity: 0, side: THREE.DoubleSide }),
    glassS: new THREE.MeshStandardMaterial({ map: strip, vertexColors: true, roughness: 0.15, metalness: 0.3, envMapIntensity: 1.2 }),
    litS: new THREE.MeshStandardMaterial({ map: strip, vertexColors: true, roughness: 0.15, metalness: 0.25, emissive: warm, emissiveMap: stripMask, emissiveIntensity: 0 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    const glassy = k !== 'brick' && k !== 'det';
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'simeinyi-' + k, castShadow: !glassy, receiveShadow: true }));
  }
  console.log(`[cherkasy] Simeinyi Lux: ${rings.size} sections + service block, ${nOpen} openings (${nLit} lit), ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints,
    // generated trees keep clear of the walls, canopies and entrance steps
    clear: (x, z) => keep.some((k) => near(k, x, z)),
    update() { const k = nightK.value; M.litB.emissiveIntensity = 1.5 * k; M.litS.emissiveIntensity = 1.5 * k; },
  };
}
