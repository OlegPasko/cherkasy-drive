// OWNER: cherkasy. Міст закоханих (the Bridge of Lovers, 1968-69) in Sosnovyi Bir: a 64 m steel footbridge over the
// ravine that runs down from the park to the Sosnivka beach, on OSM way 131685129 (bridge:structure=arch, wood, lit)
// and the bridge outline 1162488681 (3.3 m deck, 4.5 m landings). Built from the Wikimedia Commons photos (category
// "Bridge of lovers in Cherkasy") and the local press (65-66 m long, "26 m high over a 30 m ravine", acacia boards and
// grey paint since the 2019 repair, 600+ padlocks): a humped plank deck on two arched lattice girders, grey railings of
// flat bars with a row of rings under a pale timber handrail, padlocks clustered on the rings, gull-wing LED lamps along
// the river side, concrete bank seats at both ends.
// TERRAIN
//   shapeLoveBridge(hf, map, geo) -> { carved, raised, floor }   call before the ground and the buildings are built.
//     The ~30 m SRTM lattice sees the ravine as a 3 m dip; here it becomes a real one: the floor follows the asphalt
//     path under the bridge (OSM 154583210, layer -1) at FLOOR m at the crossing, climbing UP per metre toward the park
//     and falling DOWN per metre toward the beach, with a flat bottom of +-W0 m and 48-degree walls (min with the DEM,
//     so it fades out by itself where the natural slope is lower); both hills are levelled to the deck ends first.
// SITE
//   buildLoveBridge({ root, map, solids, heightAt, geo, ground }) -> { update(dt), clear(x, z) } | null
//     collision: the deck as sloped prisms over the girders (the car fits between the rails, 2.8 m), railings, landings
//     as ramps, bank seats, lamp poles; the path under it stays open. The paved strip OSM draws for the bridge on the
//     ravine floor is covered with lawn (the ground material), the ground triangles on the carved walls switch from the
//     forest-floor / yard surfaces to grass (regrass), and clear() keeps trees off the deck and the path.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng } from './geo.js';
import { SURF } from './ground.js';

const ENDS = [[49.4641565, 32.0319029], [49.4637015, 32.032439]]; // way 131685129: north (park centre side), south
const RIM = [25.5, 24.0];            // deck level at those ends (m over the river plane), a touch over the DEM hilltops
// the path along the ravine floor, from the beach end uphill (OSM 154583210)
const GULLY = [[49.4642657, 32.0339986], [49.4642673, 32.0339026], [49.4642832, 32.0337731], [49.464289, 32.03359], [49.464285, 32.0335002],
  [49.4642472, 32.0332819], [49.4640926, 32.0326564], [49.4640548, 32.0325047], [49.4639509, 32.0322779], [49.4638372, 32.0320694],
  [49.463744, 32.0318763], [49.4636073, 32.0316855], [49.4634635, 32.0314946], [49.4634166, 32.0313297], [49.4633923, 32.0311039],
  [49.4633805, 32.0307952], [49.4634296, 32.0306494], [49.463548, 32.0303542], [49.463736, 32.0297085], [49.4637744, 32.0296399]];
const FLOOR = 7, UP = 0.21, DOWN = 0.012, W0 = 12, WALL = 1.1, REACH = [115, 150]; // carve fades out between these |s|
const LAND = 6.5, HALF = 1.6, RISE = 3.8, T_END = 3.2, T_MID = 1.7, RAIL = 1.1, PANELS = 20;
// 0 at or below a, 1 at or above b, a half cosine between
const ease = (a, b, v) => (v <= a ? 0 : v >= b ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * (v - a) / (b - a)));
const UV4 = [[0, 0], [1, 0], [1, 1], [0, 1]];

// nearest point of a polyline: { d, s } distance and arc length from its first point
function along(L, x, z) {
  let best = { d: Infinity, s: 0 }, run = 0;
  for (let k = 1; k < L.length; k++) {
    const [ax, az] = L[k - 1], ex = L[k][0] - ax, ez = L[k][1] - az, len = Math.hypot(ex, ez);
    const proj = len > 0 ? ((x - ax) * ex + (z - az) * ez) / len : 0, along_ = proj < 0 ? 0 : proj > len ? len : proj;
    const px = ax + ex * along_ / (len || 1), pz = az + ez * along_ / (len || 1), d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, s: run + along_ };
    run += len;
  }
  return best;
}
// where segment p-q crosses the polyline: arc length along it (null when it does not)
function crossing(L, p, q) {
  let run = 0;
  for (let k = 1; k < L.length; k++) {
    const a = L[k - 1], b = L[k], ex = b[0] - a[0], ez = b[1] - a[1], fx = q[0] - p[0], fz = q[1] - p[1];
    const den = ex * fz - ez * fx, len = Math.hypot(ex, ez);
    if (Math.abs(den) > 1e-9) {
      const t = ((p[0] - a[0]) * fz - (p[1] - a[1]) * fx) / den, u = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return run + t * len;
    }
    run += len;
  }
  return null;
}
// the carved section at (x, z): { cut: the ravine surface height there, fade: 1 inside the reach .. 0 beyond, d }
const cutAt = (G, s0, x, z) => {
  const { d, s } = along(G, x, z), sr = s - s0;
  return { d, fade: 1 - ease(REACH[0], REACH[1], Math.abs(sr)), cut: FLOOR + (sr > 0 ? UP * sr : DOWN * sr) + WALL * Math.max(0, d - W0) };
};
const siteOf = (geo) => {
  const [A, B] = ENDS.map(([la, lo]) => geo.toXZ(la, lo)), G = GULLY.map(([la, lo]) => geo.toXZ(la, lo));
  return { A, B, G, s0: crossing(G, A, B) };
};

export function shapeLoveBridge(hf, map, geo) {
  const { meta: { x0, z0, cell, nx, nz }, grid } = hf.data;
  const { A, B, G, s0 } = siteOf(geo);
  if (s0 == null) return null;
  const cx = (A[0] + B[0]) / 2, cz = (A[1] + B[1]) / 2, R = REACH[1] + 40;
  const i0 = Math.max(0, Math.floor((cx - R - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((cx + R - x0) / cell));
  const j0 = Math.max(0, Math.floor((cz - R - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((cz + R - z0) / cell));
  let carved = 0, raised = 0;
  const cols = i1 - i0 + 1;
  for (let q = 0; q < cols * (j1 - j0 + 1); q++) {
    const i = i0 + (q % cols), j = j0 + Math.floor(q / cols), x = x0 + i * cell, z = z0 + j * cell;
    let h = grid[j * nx + i];
    // the two hilltops: level round each deck end, eased back to the DEM between 10 and 28 m out
    [A, B].forEach((E, e) => { const w = 1 - ease(10, 28, Math.hypot(x - E[0], z - E[1])); if (w > 0) { h += (RIM[e] - h) * w; raised++; } });
    // the ravine: a flat floor on the path, straight walls up to wherever the terrain is lower
    const { fade, cut } = cutAt(G, s0, x, z);
    if (fade > 0 && cut < h) { h += (cut - h) * fade; carved++; }
    grid[j * nx + i] = h;
  }
  return { carved, raised, floor: FLOOR };
}

// ------------------------------------------------------------------------------------------------ textures
// 1 x 1 m of acacia planks laid across the walk, rows 0.25 m apart with staggered butt joints
const plankTex = () => canvasTex(256, 256, (c, w, h) => {
  const r = rng(69), row = h / 4;
  c.fillStyle = '#6d5236'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) {
    let x = -r() * 120;
    while (x < w) {
      const L = 110 + r() * 110, v = r();
      c.fillStyle = `rgb(${172 + v * 36 | 0},${136 + v * 30 | 0},${92 + v * 22 | 0})`;
      c.fillRect(x + 2, y * row + 3, L - 4, row - 6);
      for (let g = 0; g < 7; g++) { c.fillStyle = `rgba(90,62,36,${0.12 + r() * 0.15})`; c.fillRect(x + 2, y * row + 5 + r() * (row - 10), L - 4, 1.5); }
      x += L;
    }
    c.fillStyle = 'rgba(40,28,18,0.55)'; c.fillRect(0, y * row, w, 3); // the cleat line of each row
  }
});
// the railing infill, 0.52 m x 0.94 m: flat bars every 0.13 m, a row of rings under the handrail, a bottom flat
const railTex = () => canvasTex(128, 232, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  c.strokeStyle = c.fillStyle = '#fff';
  const bar = w / 4, ringR = bar * 0.46, ringY = 20 + ringR;
  [0.5, 1.5, 2.5, 3.5].forEach((m) => c.fillRect(m * bar - 3, ringY, 6, h - ringY)); // bars between the rings
  c.lineWidth = 5;
  for (let k = 0; k <= 4; k++) { c.beginPath(); c.arc(k * bar, ringY, ringR, 0, Math.PI * 2); c.stroke(); }
  c.fillRect(0, 0, w, 10); c.fillRect(0, h - 12, w, 12);
}, { srgb: false });

// The ravine walls in grass. The land and cover layers keep their flat-ground surfaces when the carve drops them onto
// the new walls, and there the pine-forest floor (pale sand under needles) and the yard mottle read as bare sand
// triangles cut by the OSM polygon edges. Every such triangle whose centre sits on the carved section (or just over its
// rim) is re-pointed at copies of its vertices marked GRASS: copies, because the tile shares vertices per layer and a
// triangle half in and half out would blend the surface ids through the ones between them.
const SWAP = new Set([SURF.YARD, SURF.FOREST, SURF.DIRT, SURF.SAND, SURF.FARM, SURF.SCRUB]);
function regrass(tiles, G, s0, g) {
  let n = 0;
  const xs = G.map((q) => q[0]), zs = G.map((q) => q[1]), R = [Math.min(...xs) - 60, Math.min(...zs) - 60, Math.max(...xs) + 60, Math.max(...zs) + 60];
  for (const m of tiles) {
    const geo = m.geometry, bb = geo.boundingBox;
    if (!bb || bb.max.x < R[0] || bb.min.x > R[2] || bb.max.z < R[1] || bb.min.z > R[3]) continue;
    const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, Sf = geo.attributes.aSurf.array, I = geo.index.array;
    const add = { p: [], n: [], s: [] }, copy = new Map(), idx = Array.from(I);
    let base = P.length / 3, hit = 0;
    const dup = (v) => {
      let c = copy.get(v);
      if (c === undefined) { copy.set(v, c = base++); add.p.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); add.n.push(Nn[3 * v], Nn[3 * v + 1], Nn[3 * v + 2]); add.s.push(SURF.GRASS); }
      return c;
    };
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2];
      if (!SWAP.has(Sf[a])) continue;
      const x = (P[3 * a] + P[3 * b] + P[3 * c]) / 3, z = (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3;
      if (x < R[0] || x > R[2] || z < R[1] || z > R[3]) continue;
      const { d, fade, cut } = cutAt(G, s0, x, z);
      // on the carve: the ground there is no higher than the section 4 m further out (the rim included)
      if (fade <= 0 || d > W0 + 30 || g(x, z) > cut + WALL * 4 * fade) continue;
      idx[k] = dup(a); idx[k + 1] = dup(b); idx[k + 2] = dup(c); hit++;
    }
    if (!hit) continue;
    const grow = (arr, extra) => { const out = new Float32Array(arr.length + extra.length); out.set(arr); out.set(extra, arr.length); return out; };
    geo.dispose(); // drop the GPU buffers; three uploads the new ones on the next draw
    geo.setAttribute('position', new THREE.BufferAttribute(grow(P, add.p), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(grow(Nn, add.n), 3));
    geo.setAttribute('aSurf', new THREE.BufferAttribute(grow(Sf, add.s), 1));
    geo.setIndex(new THREE.BufferAttribute(base > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    n += hit;
  }
  return n;
}

// ------------------------------------------------------------------------------------------------ site
export function buildLoveBridge({ root, solids: S, heightAt, geo, ground }) {
  if (!geo) return null;
  const t0 = performance.now();
  const { A, B, G, s0 } = siteOf(geo);
  const safe = (h) => (isFinite(h) ? h : RIM[1]), g = (x, z) => safe(heightAt(x, z));
  const span = [B[0] - A[0], B[1] - A[1]], L = Math.hypot(...span), [ux, uz] = span.map((v) => v / L), sx = -uz, sz = ux;
  const riverSide = along(G, A[0] + sx * 20, A[1] + sz * 20).s < along(G, A[0] - sx * 20, A[1] - sz * 20).s ? 1 : -1; // +s side toward the beach end
  const yDeck = (t) => RIM[0] + (RIM[1] - RIM[0]) * t + 4 * RISE * t * (1 - t);
  const depth = (t) => T_MID + (T_END - T_MID) * (2 * t - 1) ** 2;
  // world point at t along the span (may run past 0..1 onto the landings), `o` metres to the side, height y
  const P = (t, o, y) => [A[0] + ux * L * t + sx * o, y, A[1] + uz * L * t + sz * o];
  const B_ = { deck: new MB(), rail: new MB(), det: new MB(), glow: new MB() };
  const r = rng(1969);
  const keep = []; // [ax, az, bx, bz, r] capsules generated trees stay out of

  // quad from 4 points in ring order facing along n, uv per corner
  const quad = (M, pts, n, uv = UV4) => {
    const [p0, p1, p2] = pts, ids = [];
    pts.forEach(([x, y, z], k) => ids.push(M.vert(x, y, z, ...n, ...uv[k])));
    // winding: the triangle normal (p1 - p0) x (p2 - p0) against the wanted facing
    const a = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], b = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const facing = n[0] * (a[1] * b[2] - a[2] * b[1]) + n[1] * (a[2] * b[0] - a[0] * b[2]) + n[2] * (a[0] * b[1] - a[1] * b[0]);
    const order = facing < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    M.tri(ids[order[0]], ids[order[1]], ids[order[2]]).tri(ids[order[3]], ids[order[4]], ids[order[5]]);
  };
  const ang = Math.atan2(uz, ux), ang0 = Math.atan2(-uz, ux); // obox angle for half-lengths along the span; M4 yaw with local +x along it

  // ---------------------------------------------------------------- the deck: plank surface, edge beams, underside
  const N = 48, ts = Array.from({ length: N + 1 }, (_, i) => i / N);
  const col = (hex) => B_.det.setColor(hex);
  ts.slice(1).forEach((t, k) => {
    const t0_ = ts[k], y0 = yDeck(t0_), y1 = yDeck(t), sl = N * (y1 - y0) / L, inv = 1 / Math.sqrt(1 + sl * sl);
    // a strip between the two sides at heights dy over the walk (left and right offsets o0 / o1)
    const strip = (M, o0, o1, dy0, dy1, n, uv) => quad(M, [P(t0_, o0, y0 + dy0), P(t, o0, y1 + dy0), P(t, o1, y1 + dy1), P(t0_, o1, y0 + dy1)], n, uv);
    strip(B_.deck, -HALF, HALF, 0, 0, [-ux * sl * inv, inv, -uz * sl * inv], [[0, t0_ * L], [0, t * L], [2 * HALF, t * L], [2 * HALF, t0_ * L]]);
    col('#9da3a8');
    strip(B_.det, -HALF, HALF, -0.42, -0.42, [0, -1, 0]); // soffit
    strip(B_.det, HALF, HALF, 0.04, -0.42, [sx, 0, sz]); strip(B_.det, -HALF, -HALF, 0.04, -0.42, [-sx, 0, -sz]); // fascias
    // collision: one sloped slab per piece, deep enough to cover the girders
    const gx = ux * sl, gz = uz * sl, [ax, , az] = P(t0_, 0, 0);
    const Q = [P(t0_, -HALF - 0.1, 0), P(t, -HALF - 0.1, 0), P(t, HALF + 0.1, 0), P(t0_, HALF + 0.1, 0)].flatMap(([x, , z]) => [x, z]);
    S.prism(Q, Math.min(y0, y1) - depth((t0_ + t) / 2) - 0.2, y0 - gx * ax - gz * az, gx, gz, 'bridge');
    for (const o of [-1, 1]) S.obox(...P((t0_ + t) / 2, o * (HALF - 0.04), 0).filter((_, i) => i !== 1), L / N / 2 + 0.05, 0.07, ang, Math.min(y0, y1) - 0.1, Math.max(y0, y1) + RAIL, 'rail');
  });
  // cleats: the low battens across the walk every 0.6 m that give the boards their stepped look
  B_.det.setColor('#7a5a3a');
  for (let v = 0.3; v < L; v += 0.6) {
    const t = v / L, y = yDeck(t), sl = (yDeck(t + 0.001) - y) / (L * 0.001);
    B_.det.with(M4(...P(t, 0, y), ang0).multiply(new THREE.Matrix4().makeRotationZ(Math.atan(sl))), (q) => q.box(-0.03, 0, -HALF + 0.08, 0.03, 0.03, HALF - 0.08));
  }
  keep.push([...P(-LAND / L, 0, 0).filter((_, i) => i !== 1), ...P(1 + LAND / L, 0, 0).filter((_, i) => i !== 1), HALF + 6]);

  // ---------------------------------------------------------------- the girders: two arched lattice trusses
  col('#aeb4b8');
  const panelT = (p) => p / PANELS, topY = (t) => yDeck(t) - 0.42, botY = (t) => yDeck(t) - depth(t);
  for (const o of [-1, 1]) {
    const e = o * (HALF - 0.15);
    for (let p = 0; p < PANELS; p++) {
      const a = panelT(p), b = panelT(p + 1);
      B_.det.tube(P(a, e, topY(a)), P(b, e, topY(b)), 0.1, 4).tube(P(a, e, botY(a)), P(b, e, botY(b)), 0.13, 4);
      B_.det.tube(P(a, e, botY(a)), P(a, e, topY(a)), 0.06, 4);
      const [lo, hi] = p % 2 ? [a, b] : [b, a];
      B_.det.tube(P(lo, e, botY(lo)), P(hi, e, topY(hi)), 0.06, 4);
    }
    B_.det.tube(P(1, e, botY(1)), P(1, e, topY(1)), 0.06, 4);
  }
  // floor beams at every panel point, X bracing between the bottom chords
  for (let p = 0; p <= PANELS; p++) {
    const a = panelT(p), b = panelT(Math.min(PANELS, p + 1));
    B_.det.tube(P(a, -HALF + 0.15, topY(a) - 0.05), P(a, HALF - 0.15, topY(a) - 0.05), 0.07, 4);
    B_.det.tube(P(a, -HALF + 0.15, botY(a)), P(a, HALF - 0.15, botY(a)), 0.05, 4);
    if (p < PANELS) B_.det.tube(P(a, -HALF + 0.15, botY(a)), P(b, HALF - 0.15, botY(b)), 0.035, 4).tube(P(a, HALF - 0.15, botY(a)), P(b, -HALF + 0.15, botY(b)), 0.035, 4);
  }

  // ---------------------------------------------------------------- landings and concrete bank seats
  const landY = [];
  for (const [e, t, dir] of [[0, 0, -1], [1, 1, 1]]) {
    const y0 = RIM[e], far = t + dir * LAND / L, [fx, , fz] = P(far, 0, 0), yF = g(fx, fz) + 0.18;
    landY.push(yF);
    // the paved landing: a ramp from the path level out there to the deck end
    const W = 2.25, Y = (tt) => y0 + (yF - y0) * Math.abs(tt - t) / Math.abs(far - t);
    const pts = [P(t, -W, Y(t)), P(far, -W, Y(far)), P(far, W, Y(far)), P(t, W, Y(t))];
    col('#77776f');
    quad(B_.det, pts, [0, 1, 0]);
    const low = Math.min(y0, yF, ...pts.map(([x, , z]) => g(x, z))) - 1.2;
    col('#a8a59c');
    [[0, 1, -1], [3, 2, 1]].forEach(([i, j, o]) => { // the landing's side walls down into the slope
      const drop = (q) => [q[0], low, q[2]];
      quad(B_.det, [pts[i], pts[j], drop(pts[j]), drop(pts[i])], [sx * o, 0, sz * o]);
    });
    const sl = (yF - y0) / (dir * LAND), gx = ux * sl, gz = uz * sl, [ax, , az] = P(t, 0, 0);
    S.prism(pts.flatMap(([x, , z]) => [x, z]), low, y0 - gx * ax - gz * az, gx, gz, 'ledge');
    // bank seat: a concrete block under the deck end, its face toward the ravine takes the girder bearings
    const seat = [P(t - dir * 0.6 / L, -W - 0.2, 0), P(t + dir * 2.4 / L, -W - 0.2, 0), P(t + dir * 2.4 / L, W + 0.2, 0), P(t - dir * 0.6 / L, W + 0.2, 0)];
    const yb = Math.min(...seat.map(([x, , z]) => g(x, z))) - 3;
    col('#9e9b93');
    B_.det.extrude(seat.map(([x, , z]) => [x, z]), [], yb, y0 - 0.45, { top: true });
    S.prism(seat.flatMap(([x, , z]) => [x, z]), yb, y0 - 0.45, 0, 0, 'wall');
    // railing along both landing sides, turning out at the far end the way the park fence does
    for (const o of [-1, 1]) {
      const a = P(t, o * (W - 0.05), Y(t)), b = P(far, o * (W - 0.05), Y(far)), [mx, , mz] = P((t + far) / 2, o * (W - 0.05), 0);
      railRun([a, b]);
      S.obox(mx, mz, LAND / 2, 0.07, ang, Math.min(y0, yF) - 0.2, Math.max(y0, yF) + RAIL, 'rail');
    }
    // the short return from the landing edge to the bridge rail at the deck end
    for (const o of [-1, 1]) railRun([P(t, o * (W - 0.05), y0), P(t, o * (HALF - 0.04), y0)]);
  }

  // ---------------------------------------------------------------- railings along the span
  function railRun(pts) {
    // posts at the ends and about every 2 m, a pale timber handrail, the grey infill (alpha texture) between
    let U0 = 0;
    pts.forEach((b, k) => {
      const a = pts[k - 1], len = a ? Math.hypot(b[0] - a[0], b[2] - a[2]) : 0;
      if (len < 0.05) return;
      const n = [(a[2] - b[2]) / len, 0, (b[0] - a[0]) / len];
      quad(B_.rail, [[a[0], a[1] + 0.06, a[2]], [b[0], b[1] + 0.06, b[2]], [b[0], b[1] + RAIL - 0.1, b[2]], [a[0], a[1] + RAIL - 0.1, a[2]]], n,
        [[U0 / 0.52, 0], [(U0 + len) / 0.52, 0], [(U0 + len) / 0.52, 1], [U0 / 0.52, 1]]);
      U0 += len;
      // handrail plank 0.2 x 0.07 on top
      B_.det.setColor('#cdb58a');
      const w = 0.075, top = (p, s, dy) => [p[0] + n[0] * s, p[1] + RAIL + dy, p[2] + n[2] * s];
      quad(B_.det, [top(a, -w, 0), top(b, -w, 0), top(b, w, 0), top(a, w, 0)], [0, 1, 0]);
      quad(B_.det, [top(a, w, 0), top(b, w, 0), top(b, w, -0.065), top(a, w, -0.065)], n);
      quad(B_.det, [top(a, -w, 0), top(b, -w, 0), top(b, -w, -0.065), top(a, -w, -0.065)], n.map((v) => -v));
      // square posts, the first run's start included
      B_.det.setColor('#8e9397');
      const nPost = Math.max(1, Math.round(len / 2)), mixP = (f) => a.map((v, i) => v + (b[i] - v) * f);
      for (let q = k === 1 ? 0 : 1; q <= nPost; q++) { const [x, y, z] = mixP(q / nPost); B_.det.boxC(x, y + (RAIL - 0.05) / 2 - 0.05, z, 0.09, RAIL - 0.05, 0.09); }
    });
  }
  for (const o of [-1, 1]) railRun(ts.map((t) => P(t, o * (HALF - 0.04), yDeck(t))));

  // ---------------------------------------------------------------- padlocks on the rings, thickest round midspan
  const LOCK = ['#c9a23a', '#b8923a', '#d8d8d2', '#9a9a96', '#3a3a3c', '#b33a3a', '#c43c6a', '#7a5a2a'];
  let locks = 0;
  for (let c = 0; c < 110; c++) {
    // a bell round midspan (three uniforms), either side
    const bell = (r() + r() + r()) / 3, t = 0.5 + (bell - 0.5) * 1.65, side = r() < 0.5 ? -1 : 1, ringY = yDeck(t) + RAIL - 0.26;
    for (let m = 1 + Math.floor(r() * 7); m > 0; m--, locks++) {
      const tt = t + (r() - 0.5) * 0.35 / L, [x, , z] = P(tt, side * (HALF + 0.02), 0), s = 0.8 + r() * 0.7, hy = ringY - r() * 0.07 * s;
      B_.det.setColor(LOCK[Math.floor(r() * LOCK.length)]).with(M4(x, hy, z, ang0 + (r() - 0.5) * 0.8), (q) => {
        q.box(-0.025 * s, -0.05 * s, -0.012 * s, 0.025 * s, 0, 0.012 * s);
        q.box(-0.017 * s, 0, -0.004, -0.011 * s, 0.03 * s, 0.004).box(0.011 * s, 0, -0.004, 0.017 * s, 0.03 * s, 0.004).box(-0.017 * s, 0.024 * s, -0.004, 0.017 * s, 0.03 * s, 0.004);
      });
    }
  }

  // ---------------------------------------------------------------- gull-wing LED lamps on the river side
  let lamps = 0;
  const lamp = (x, y, z, fy) => {
    B_.det.setColor('#6f7479').cyl(x, y, z, 0.09, 0.06, 5.2, 8);
    const H = y + 5.2, s = [Math.cos(fy), 0, -Math.sin(fy)];
    B_.det.setColor('#83888c');
    for (const d of [-1, 1]) {
      const inner = [x, H, z], outer = [x + s[0] * d * 0.62, H + 0.28, z + s[2] * d * 0.62], f = [Math.sin(fy) * 0.2, 0, Math.cos(fy) * 0.2];
      B_.det.face([[inner[0] - f[0], inner[1], inner[2] - f[2]], [outer[0] - f[0], outer[1], outer[2] - f[2]], [outer[0] + f[0], outer[1], outer[2] + f[2]], [inner[0] + f[0], inner[1], inner[2] + f[2]]]);
      B_.det.face([[inner[0] + f[0], inner[1], inner[2] + f[2]], [outer[0] + f[0], outer[1], outer[2] + f[2]], [outer[0] - f[0], outer[1], outer[2] - f[2]], [inner[0] - f[0], inner[1], inner[2] - f[2]]]);
      const m = [(inner[0] + outer[0]) / 2, (inner[1] + outer[1]) / 2 - 0.035, (inner[2] + outer[2]) / 2];
      B_.glow.ellipsoid(m, [0.2, 0.025, 0.2], 8, 3);
    }
    S.cyl(x, z, y, y + 5.2, 0.1, 0.08, 'pole');
    lamps++;
  };
  for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const [x, , z] = P(t, riverSide * (HALF + 0.22), 0), y = yDeck(t) - 0.42;
    B_.det.setColor('#8e9397').with(M4(x, y, z, 0), (q) => q.box(-0.12, 0, -0.12, 0.12, 0.3, 0.12));
    B_.det.tube(P(t, riverSide * (HALF - 0.1), y + 0.1), [x, y + 0.1, z], 0.05, 4);
    lamp(x, y, z, ang0);
  }
  for (const [t, dir] of [[0, -1], [1, 1]]) { const [x, , z] = P(t + dir * 4 / L, -riverSide * 3.1, 0); lamp(x, g(x, z), z, ang0); keep.push([x, z, x, z, 1.2]); }

  // ---------------------------------------------------------------- the ravine floor under the deck: no paving there
  // (map.walks buffers the bridge way like any footway and drapes it on the terrain, far below the deck now)
  // The drape is planar per triangle, not bilinear, and on the steep ravine walls the two part by up to ~0.8 m, so the
  // cover takes its height from the highest drawn ground triangle under each vertex
  const tiles = (ground?.root?.children ?? []).filter((m) => m.material?.name === 'cherkasy-ground' && m.geometry?.index);
  if (tiles.length) {
    const gmat = tiles[0].material, pos = [], nor = [], srf = [], idx = [], NA = Math.ceil(L), NW = 4, W = 2.2;
    const box = [P(0, -W - 1, 0), P(0, W + 1, 0), P(1, -W - 1, 0), P(1, W + 1, 0)];
    const bx0 = Math.min(...box.map((q) => q[0])), bx1 = Math.max(...box.map((q) => q[0])), bz0 = Math.min(...box.map((q) => q[2])), bz1 = Math.max(...box.map((q) => q[2]));
    const near = [];
    for (const m of tiles) {
      const bb = m.geometry.boundingBox;
      if (bb && (bb.max.x < bx0 || bb.min.x > bx1 || bb.max.z < bz0 || bb.min.z > bz1)) continue;
      const V = m.geometry.attributes.position.array, I = m.geometry.index.array;
      for (let k = 0; k < I.length; k += 3) {
        const c = [I[k] * 3, I[k + 1] * 3, I[k + 2] * 3], xs = c.map((o) => V[o]), zs = c.map((o) => V[o + 2]);
        if (Math.max(...xs) >= bx0 && Math.min(...xs) <= bx1 && Math.max(...zs) >= bz0 && Math.min(...zs) <= bz1) near.push(c.flatMap((o) => [V[o], V[o + 1], V[o + 2]]));
      }
    }
    const drawn = (x, z) => {
      let top = -Infinity;
      for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of near) {
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (!det) continue;
        const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, wc = 1 - wa - wb;
        if (wa > -1e-6 && wb > -1e-6 && wc > -1e-6) top = Math.max(top, wa * ay + wb * by + wc * cy);
      }
      return top;
    };
    const H = (x, z) => { const y = drawn(x, z); return (isFinite(y) ? Math.max(y, g(x, z)) : g(x, z) + 0.19) + 0.06; };
    const at = (i, j) => P(0.03 + 0.94 * i / NA, W * (2 * j / NW - 1), 0), row = NW + 1;
    for (let q = 0; q < (NA + 1) * row; q++) {
      const [x, , z] = at(Math.floor(q / row), q % row);
      const gx = g(x - 1, z) - g(x + 1, z), gz = g(x, z - 1) - g(x, z + 1), l = Math.hypot(gx, 2, gz);
      pos.push(x, H(x, z), z); nor.push(gx / l, 2 / l, gz / l); srf.push(SURF.GRASS);
    }
    const V = (k) => [pos[3 * k], pos[3 * k + 2]];
    for (let q = 0; q < NA * NW; q++) {
      const i = Math.floor(q / NW), j = q % NW, [mx, , mz] = at(i + 0.5, j + 0.5);
      if (along(G, mx, mz).d < 2.4 || yDeck(0.03 + 0.94 * i / NA) - g(mx, mz) < 1.2) continue; // the path under the bridge keeps its asphalt
      const c00 = i * row + j, c10 = c00 + row, [ax, az] = V(c00), [bx, bz] = V(c10), [cx, cz] = V(c00 + 1);
      const upY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az); // y of (b - a) x (c - a): > 0 faces up
      idx.push(...(upY > 0 ? [c00, c10, c00 + 1, c00 + 1, c10, c10 + 1] : [c00, c00 + 1, c10, c00 + 1, c10 + 1, c10]));
    }
    if (idx.length) {
      const geoP = new THREE.BufferGeometry();
      geoP.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geoP.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geoP.setAttribute('aSurf', new THREE.Float32BufferAttribute(srf, 1));
      geoP.setIndex(idx);
      root.add(Object.assign(new THREE.Mesh(geoP, gmat), { name: 'lovebridge-floor', receiveShadow: true }));
    }
  }
  const regrassed = regrass(tiles, G, s0, g);

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'lovebridge' });
  root.add(group);
  const M = {
    deck: new THREE.MeshStandardMaterial({ map: plankTex(), roughness: 0.85 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x9aa0a5, alphaMap: railTex(), alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.55 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.6 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.3, emissive: 0xfff1d6, emissiveIntensity: 0.05 }),
  };
  M.rail.alphaMap.wrapT = THREE.ClampToEdgeWrapping;
  let nV = 0;
  for (const [k, D] of Object.entries(B_)) {
    if (!D.v) continue;
    nV += D.v;
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'lovebridge-' + k, castShadow: k !== 'glow', receiveShadow: true }));
  }
  console.log(`[cherkasy] Bridge of Lovers: ${L.toFixed(1)} m span, deck ${RIM[0]}-${yDeck(0.5).toFixed(1)}-${RIM[1]} m over a ${FLOOR} m floor, landings ${landY.map((y) => y.toFixed(1)).join('/')}, ${regrassed} ground triangles regrassed, ${locks} locks, ${lamps} lamps, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  // generated trees: off the deck corridor and the landings, and off the path along the ravine near the bridge
  const inCapsule = (x, z, [ax, az, bx, bz, rr]) => {
    const ex = bx - ax, ez = bz - az, f = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    return (x - ax - ex * f) ** 2 + (z - az - ez * f) ** 2 < rr * rr;
  };
  // clear() runs for every generated tree of the city: a box around all of it turns the far ones away at once
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = (x, z, r) => { bb[0] = Math.min(bb[0], x - r); bb[1] = Math.min(bb[1], z - r); bb[2] = Math.max(bb[2], x + r); bb[3] = Math.max(bb[3], z + r); };
  for (const [ax, az, bx, bz, rr] of keep) { grow(ax, az, rr); grow(bx, bz, rr); }
  for (const [x, z] of G) grow(x, z, 3);
  return {
    clear: (x, z) => {
      if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) return false;
      if (keep.some((c) => inCapsule(x, z, c))) return true;
      const q = along(G, x, z); return q.d < 3 && Math.abs(q.s - s0) < 90;
    },
    update() { M.glow.emissiveIntensity = 0.05 + 2.6 * nightK.value; },
  };
}
