// OWNER: cherkasy. The shrub layer of the city (fed to world/trees.js buildTrees as `shrubs`): what grows under and
// between the trees. Scenery only: no colliders, nothing to break, nothing the people's walking areas know of.
//   - private houses: lilacs, jasmine and privet bushes, roses and hibiscus, a thuja or a juniper, by the walls and
//     in the garden, about 3.5 m or more from a carriageway (5.3 m on a main street), so they stand inside the
//     lot, behind its street fence;
//   - blocks of flats: the front gardens under the windows (lilac and bushes, some in bloom) along the long walls;
//   - public buildings: a formal row of thujas with a juniper or a clipped bush along the longest wall;
//   - parks: a loose belt of shrubs inside the edge and small groups on the lawns; lawns (grass) get a few groups;
//   - OSM scrub is filled with tall bushes, flowerbeds with low blooming ones, allotments with berry bushes;
//   - main streets: on some stretches a low clipped line of bushes along the lawn's edge, past the paving;
//   - OSM hedges (barrier=hedge; hedges_data.js: the fences' hedge lines, cut off other fences, gates and street
//     props by tools/cherkasy/build_hedges.mjs): clipped hedge blocks of the tree system round the thin hedge face
//     and the wall solid fences.js builds there (hedgeRows).
// Nothing stands on a building, a carriageway, a footway, a railway track, paving, a pitch, a playground, water, or
// where a hand-built site keeps the ground clear; nothing touches a fence or a street prop or blocks a gate.
//
//   shrubSpots({ map, ground, footprints, occ, clear = null, obstacles = null }) -> { data, kinds, stats }
//     ground: { heightAt, onAsphalt, isWater };  occ: the buildings' 1 m raster (greenery.js footprintRaster);
//     clear(x, z) -> bool: no shrub there (the hand-built sites' clear tests)
//     obstacles: { fences?, props? } | () -> that, asked when the layout starts (see obstacleSteps below): a shrub
//       that would touch a fence or a street prop is pushed off it, one in a gate's mouth is left out
//       (stats.moved / stats.dropped)
//     data: Float32Array of nature/shrubs.js records; kinds: the names its kind indices point at (trees.js SHRUBS);
//     stats: counts per rule and the time
//   shrubSteps(same) -> generator of the same work in small steps (it yields about every 3 ms of work; the last
//     value is the result): the city runs it in slices after the world is up, since ~100 thousand shrubs with the
//     sites' clear tests take about a second and nobody waits for a bush
//   hedgeRows({ ground, occ, clear = null }) -> tree spots of kind 'hedge' for the OSM hedges (they join the trees)
import { SHRUB_STRIDE } from '../nature/shrubs.js';
import { hedgeSpots } from '../trees.js';
import { ringPts, BitRaster, rng, inPoly, bboxOf, areaOf } from './geo.js';
import { HEDGES } from './hedges_data.js';

const KINDS = ['bush', 'lilac', 'olive', 'bloom', 'rose', 'pink', 'yellow', 'thuja', 'juniper'];
// [width range, height range] in metres
const SIZE = {
  bush: [1.1, 2.2, 0.9, 1.7], lilac: [1.8, 2.9, 2.0, 3.2], olive: [1.5, 3.0, 1.2, 2.4], bloom: [1.0, 1.8, 0.9, 1.5], rose: [0.8, 1.3, 0.7, 1.1],
  pink: [1.1, 1.9, 1.2, 2.2], yellow: [0.9, 1.5, 0.8, 1.3], thuja: [0.9, 1.4, 2.0, 4.0], juniper: [1.6, 2.6, 0.5, 0.9],
};
// what grows where: [kind, weight]
const MIX = {
  house: [['lilac', 22], ['bush', 26], ['bloom', 10], ['pink', 10], ['rose', 10], ['yellow', 4], ['thuja', 9], ['juniper', 4], ['olive', 5]],
  apt: [['lilac', 30], ['bush', 38], ['bloom', 10], ['pink', 8], ['rose', 4], ['olive', 6], ['thuja', 2], ['juniper', 2]],
  edge: [['bush', 40], ['lilac', 25], ['olive', 15], ['bloom', 12], ['pink', 8]],
  lawn: [['bush', 45], ['lilac', 20], ['olive', 15], ['bloom', 10], ['pink', 5], ['juniper', 5]],
  scrub: [['olive', 60], ['bush', 40]],
  bed: [['rose', 35], ['pink', 25], ['yellow', 20], ['bloom', 20]],
  allot: [['bush', 60], ['rose', 10], ['pink', 10], ['bloom', 10], ['lilac', 10]],
};
// the radius a shrub takes on the ground, in widths (a cone spreads at its foot: the shrub shader's taper)
export const FOOT = KINDS.map((k) => (k === 'thuja' ? 0.6 : k === 'juniper' ? 0.55 : 0.48));
const table = (mix) => { const sum = mix.reduce((a, q) => a + q[1], 0); let acc = 0; return mix.map(([k, w]) => [KINDS.indexOf(k), (acc += w) / sum]); };
const PICK = Object.fromEntries(Object.entries(MIX).map(([k, m]) => [k, table(m)]));

// What the other layers put on the ground, as the shrubs see it: the fences' lines (fencework.js parseFences: a wall
// 0.18 m thick each; a gate also keeps its mouth free, the driveway or the path through it) and the street props
// (street.js props(): poles, lamps, signs, benches, bins, shelters, container sites). 8 m cells; an entry lies in
// every cell a shrub that touches it can stand in.
//   obstacleSteps({ fences?, props?, skipKinds? = [] }) -> generator (it yields now and then) of
//     { n, hit(x, z, r) -> 0 | 1 fence | 2 gate mouth | 3 prop, settle(x, z, r) -> [x, z] | null }
//     settle: where a shrub of radius r may stand, at most 3 m from (x, z), pushed off the fence (to its own side) or
//     the prop it touches; null: nowhere near (in a gate's mouth, or boxed in)
//   obstacleIndex(same) -> the same at once
const PROP_R = { lamp: 0.3, pole: 0.3, cross: 0.2, stop: 0.25, bin: 0.4, bench: 1.0, shelter: 2.3, container: 2.6 };
const MOUTH = { gate: 2.2, oldgate: 2.2, gateopen: 2.6, wicket: 0.9, oldwicket: 0.9 }; // kept free round a gate (m)
const REACH = 2.4; // the widest shrub's radius and the gap it keeps
export function obstacleIndex(opts) { const job = obstacleSteps(opts); for (;;) { const q = job.next(); if (q.done) return q.value; } }
export function* obstacleSteps({ fences: F = null, props = null, skipKinds = [] } = {}) {
  const C = 8, cells = new Map(), key = (i, j) => (i + 4096) * 8192 + (j + 4096);
  const seg = [], mouth = [], P = [];
  const add = (id, x0, z0, x1, z1, pad) => {
    for (let i = Math.floor((Math.min(x0, x1) - pad) / C), i1 = Math.floor((Math.max(x0, x1) + pad) / C); i <= i1; i++)
      for (let j = Math.floor((Math.min(z0, z1) - pad) / C), j1 = Math.floor((Math.max(z0, z1) + pad) / C); j <= j1; j++) { const k = key(i, j), L = cells.get(k); if (L) L.push(id); else cells.set(k, [id]); }
  };
  if (F) {
    const skip = new Set(skipKinds), gap = F.kinds.map((name) => (skip.has(name) ? -1 : MOUTH[name] ?? 0));
    for (let k = 0; k < F.n; k++) {
      if ((k & 2047) === 2047) yield;
      const g = gap[F.kind[k]]; if (g < 0) continue;
      for (let i = F.start[k] + 1, e = F.start[k] + F.count[k]; i < e; i++) {
        const ax = F.pts[2 * i - 2], az = F.pts[2 * i - 1], bx = F.pts[2 * i], bz = F.pts[2 * i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 12));
        for (let q = 0; q < n; q++) { // a long run in pieces, so it does not fill the cells of its whole box
          const x0 = ax + (bx - ax) * q / n, z0 = az + (bz - az) * q / n, x1 = ax + (bx - ax) * (q + 1) / n, z1 = az + (bz - az) * (q + 1) / n;
          add(seg.length / 4, x0, z0, x1, z1, REACH + g); seg.push(x0, z0, x1, z1); mouth.push(g);
        }
      }
    }
  }
  if (props) for (let i = 0; i < props.length; i++) {
    const q = props[i]; if (q.alive === false) continue;
    const r = PROP_R[q.kind] ?? 0.3;
    add(-1 - P.length / 3, q.x, q.z, q.x, q.z, REACH + r); P.push(q.x, q.z, r);
  }
  // the deepest thing a disc touches: its kind, how deep, and the way out (nx, nz)
  let depth = 0, nx = 0, nz = 0;
  const hit = (x, z, r) => {
    const L = cells.get(key(Math.floor(x / C), Math.floor(z / C)));
    depth = 0; if (!L) return 0;
    let kind = 0;
    for (let q = 0; q < L.length; q++) {
      const id = L[q]; let cx, cz, need, t;
      if (id >= 0) {
        const o = id * 4, ax = seg[o], az = seg[o + 1], dx = seg[o + 2] - ax, dz = seg[o + 3] - az, l2 = dx * dx + dz * dz, u = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
        cx = ax + dx * u; cz = az + dz * u; t = mouth[id] > 0 ? 2 : 1; need = r + (t === 2 ? mouth[id] : 0.14);
      } else { const o = (-1 - id) * 3; cx = P[o]; cz = P[o + 1]; need = r + P[o + 2]; t = 3; }
      const ex = x - cx, ez = z - cz, d = Math.hypot(ex, ez);
      if (d >= need) continue;
      if (t === 2) { depth = need - d; return 2; }
      if (need - d > depth) { depth = need - d; kind = t; if (d > 0.03) { nx = ex / d; nz = ez / d; } else { nx = 0; nz = 0; } }
    }
    return kind;
  };
  const settle = (x, z, r) => {
    const x0 = x, z0 = z;
    for (let turn = 0; turn < 4; turn++) {
      const t = hit(x, z, r);
      if (!t) return [x, z];
      if (t === 2 || (nx === 0 && nz === 0)) return null; // in a gate's mouth, or right on the line: no side to keep
      x += nx * (depth + 0.06); z += nz * (depth + 0.06);
      if (Math.hypot(x - x0, z - z0) > 3) return null;
    }
    return hit(x, z, r) ? null : [x, z];
  };
  return { n: seg.length / 4 + P.length / 3, hit, settle };
}

export function hedgeRows({ ground, occ, clear = null }) {
  const out = [];
  for (const H of HEDGES) {
    const h = Math.max(0.9, H.h + 0.06); // a touch over the fences' hedge face on the same line, which it wraps
    for (let i = 2; i < H.p.length; i += 2) {
      const ax = H.p[i - 2], az = H.p[i - 1], bx = H.p[i], bz = H.p[i + 1];
      if (Math.hypot(bx - ax, bz - az) < 0.6) continue;
      // block by block: a way that runs into a building, a road or a site's cleared ground loses only those blocks
      for (const q of hedgeSpots(ax, az, bx, bz, { h, w: 0.9, heightAt: ground.heightAt })) if (occ.get(q.x, q.z) !== 1 && !ground.onAsphalt(q.x, q.z) && !(clear && clear(q.x, q.z))) out.push(q);
    }
  }
  return out;
}

export function shrubSpots(opts) {
  const job = shrubSteps(opts);
  for (;;) { const q = job.next(); if (q.done) return q.value; }
}

export function* shrubSteps({ map, ground, footprints, occ, clear = null, obstacles = null }) {
  const t0 = performance.now(), R = map.region, r = rng(23);
  let work = 0, tick = 0; // work: the time spent inside the steps (the wall time includes the pauses between them)
  let tS = t0; const pause = () => { work += performance.now() - tS; }, resume = () => { tS = performance.now(); };
  const due = () => (++tick & 7) === 0 && performance.now() - tS > 2.5; // a step runs ~3 ms, then yields
  // ---- where nothing may stand: footways and paths (thick lines), paving, pitches and playgrounds (scanline fills)
  const no = new BitRaster(R.x0, R.z0, R.x1, R.z1, 1);
  const bits = no.bits, NX = no.nx, NZ = no.nz;
  const setc = (i, j) => { if (i >= 0 && j >= 0 && i < NX && j < NZ) { const k = j * NX + i; bits[k >>> 5] |= 1 << (k & 31); } };
  const cell = (x, z) => setc(Math.floor(x - R.x0), Math.floor(z - R.z0));
  for (const rd of [...map.roads, ...(map.rails ?? [])]) {
    if (due()) { pause(); yield; resume(); }
    if (rd.k === 'm') continue; // carriageways are ground.onAsphalt
    const p = rd.p, h = Math.max(1, Math.round((rd.w || (rd.k ? 2 : 4)) / 2 + 0.4)); // a railway track: 2 m each side
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], az = p[i - 1], dx = p[i] - ax, dz = p[i + 1] - az;
      if (Math.max(ax, p[i]) < R.x0 || Math.min(ax, p[i]) > R.x1 || Math.max(az, p[i + 1]) < R.z0 || Math.min(az, p[i + 1]) > R.z1) continue;
      // a plus-shaped stamp every metre covers the thick line
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz))));
      for (let k = 0; k <= n; k++) {
        const ci = Math.floor(ax + dx * k / n - R.x0), cj = Math.floor(az + dz * k / n - R.z0);
        if (ci < h || cj < h || ci >= NX - h || cj >= NZ - h) continue;
        for (let q = cj * NX + ci - h, e = q + 2 * h; q <= e; q++) bits[q >>> 5] |= 1 << (q & 31);
        for (let q = (cj - h) * NX + ci, e = (cj + h) * NX + ci; q <= e; q += NX) bits[q >>> 5] |= 1 << (q & 31);
      }
    }
  }
  const xs = [];
  const fillRings = (rings) => { // even-odd scanline fill of a polygon: the outer ring and its holes, flat [x, z, ...]
    const F0 = rings[0]; let z0 = Infinity, z1 = -Infinity;
    for (let k = 1; k < F0.length; k += 2) { const z = F0[k]; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    for (let j = Math.max(0, Math.floor(z0 - R.z0)), j1 = Math.min(NZ - 1, Math.floor(z1 - R.z0)); j <= j1; j++) {
      const z = R.z0 + j + 0.5; let m = 0;
      for (const F of rings) for (let n = F.length >> 1, k = 0, q = n - 1; k < n; q = k++) {
        const az = F[2 * q + 1], bz = F[2 * k + 1];
        if ((az <= z) === (bz <= z)) continue;
        let x = F[2 * q] + (F[2 * k] - F[2 * q]) * (z - az) / (bz - az), c = m++; // insertion keeps xs sorted
        for (; c > 0 && xs[c - 1] > x; c--) xs[c] = xs[c - 1];
        xs[c] = x;
      }
      for (let q = 0; q + 1 < m; q += 2) { // a run of bits, a word at a time
        const i0 = Math.max(0, Math.floor(xs[q] - R.x0)), i1 = Math.min(NX - 1, Math.floor(xs[q + 1] - R.x0));
        for (let k = j * NX + i0, e = j * NX + i1; k <= e;) { const b = k & 31, w = Math.min(32 - b, e - k + 1); bits[k >>> 5] |= (w === 32 ? -1 : ((1 << w) - 1) << b); k += w; }
      }
    }
  };
  for (const rings of map.walks ?? []) { if (due()) { pause(); yield; resume(); } fillRings(rings); }
  for (const key of ['pitch', 'track', 'play', 'parking']) for (const rings of map.cover[key] ?? []) { if (due()) { pause(); yield; resume(); } fillRings(rings); }

  // the fences and the street props, as they are when the layout starts (the city gives what has landed by then)
  const O = typeof obstacles === 'function' ? obstacles() : obstacles, avoided = { moved: 0, dropped: 0 };
  let obs = null;
  if (O && (O.fences || O.props)) for (const job = obstacleSteps(O); ;) { const q = job.next(); if (q.done) { obs = q.value; break; } pause(); yield; resume(); }
  const out = [], counts = {};
  const mark = (name, n0) => { counts[name] = (out.length - n0) / SHRUB_STRIDE; };
  const free = (x, z) => x > R.x0 + 1 && x < R.x1 - 1 && z > R.z0 + 1 && z < R.z1 - 1 && no.get(x, z) !== 1 && occ.get(x, z) !== 1 && !ground.onAsphalt(x, z) && !ground.isWater(x, z);
  // a shrub of a mix at (x, z): its size, a 3 x 3 m claim in the raster so the next one keeps off; k: size factor
  const built = (x, z) => occ.get(x + 0.9, z) === 1 || occ.get(x - 0.9, z) === 1 || occ.get(x, z + 0.9) === 1 || occ.get(x, z - 0.9) === 1;
  const put = (x, z, mix, k = 1, kind = -1) => {
    if (!free(x, z) || built(x, z)) return false;
    if (kind < 0) { const q = r(); kind = mix[mix.length - 1][0]; for (const [id, acc] of mix) if (q < acc) { kind = id; break; } }
    const S = SIZE[KINDS[kind]], w = (S[0] + (S[1] - S[0]) * r()) * k, h = (S[2] + (S[3] - S[2]) * r()) * k;
    if (obs) { // off the fences, out of the gates' mouths, off the street props: pushed aside if there is room
      const q = obs.settle(x, z, w * FOOT[kind]);
      if (!q) { avoided.dropped++; return false; }
      if (q[0] !== x || q[1] !== z) { x = q[0]; z = q[1]; avoided.moved++; if (!free(x, z) || built(x, z)) { avoided.dropped++; avoided.moved--; return false; } }
    }
    if (clear && clear(x, z)) return false;
    // the lowest ground under the bush, so on a slope its downhill side still stands in the earth
    const e = w * 0.35, y = Math.min(ground.heightAt(x, z), ground.heightAt(x + e, z), ground.heightAt(x - e, z), ground.heightAt(x, z + e), ground.heightAt(x, z - e));
    out.push(x, y - 0.03 * h, z, r() * 6.283, w, h, kind, r());
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) cell(x + a, z + b);
    return true;
  };
  const near = (x, z, d) => { // a carriageway about d away: eight probes round the spot
    const e = d * 0.7071;
    return ground.onAsphalt(x + d, z) || ground.onAsphalt(x - d, z) || ground.onAsphalt(x, z + d) || ground.onAsphalt(x, z - d)
      || ground.onAsphalt(x + e, z + e) || ground.onAsphalt(x - e, z + e) || ground.onAsphalt(x + e, z - e) || ground.onAsphalt(x - e, z - e);
  };
  // the lots' street fences stand up to 4.8 m from a main street's carriageway (2.9 m on the others): a 2 m raster
  // of the main streets' corridors, half-width + 5.3 m, keeps the house shrubs behind them
  const MAIN = /^(trunk|primary|secondary|tertiary)$/, wide = new BitRaster(R.x0, R.z0, R.x1, R.z1, 2);
  for (const rd of map.roads) {
    if (rd.k !== 'm' || !MAIN.test(rd.c)) continue;
    if (due()) { pause(); yield; resume(); }
    const p = rd.p, h = Math.ceil(((rd.w || 7) / 2 + 5.3) / 2);
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], az = p[i - 1], dx = p[i] - ax, dz = p[i + 1] - az, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 2));
      for (let k = 0; k <= n; k++) {
        const ci = Math.floor((ax + dx * k / n - R.x0) / 2), cj = Math.floor((az + dz * k / n - R.z0) / 2);
        for (let j = Math.max(0, cj - h), j1 = Math.min(wide.nz - 1, cj + h); j <= j1; j++) for (let q = Math.max(0, ci - h), q1 = Math.min(wide.nx - 1, ci + h); q <= q1; q++) wide.set(q, j);
      }
    }
  }
  const inLot = (x, z) => !near(x, z, 1.8) && !near(x, z, 3.5) && wide.get(x, z) !== 1; // behind the lot's street fence

  // ---- 1) buildings: houses, blocks of flats, public buildings
  let n0 = out.length;
  const THUJA = KINDS.indexOf('thuja'), JUNIPER = KINDS.indexOf('juniper'), BUSH = KINDS.indexOf('bush');
  for (const f of footprints) {
    const P = f.poly, n = P.length;
    if (f.kind !== 'house' && f.kind !== 'apt' && f.kind !== 'public') continue;
    if (due()) { pause(); yield; resume(); }
    let cx = 0, cz = 0; for (const q of P) { cx += q[0]; cz += q[1]; } cx /= n; cz /= n;
    if (cx < R.x0 || cx > R.x1 || cz < R.z0 || cz > R.z1) continue;
    // a point d metres out of edge i at t; -> [x, z, nx, nz]
    const off = (i, t, d) => {
      const a = P[i], b = P[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1, mx = a[0] + ex * t, mz = a[1] + ez * t;
      let nx = ez / L, nz = -ex / L; if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
      return [mx + nx * d, mz + nz * d, nx, nz];
    };
    if (f.kind === 'house') {
      if (r() < 0.15) continue;
      for (let left = 2 + (r() < 0.6) + (r() < 0.3); left > 0; left--) { // by the walls
        const [x, z] = off(Math.floor(r() * n), 0.1 + 0.8 * r(), 1.4 + 2.2 * r());
        if (inLot(x, z)) put(x, z, PICK.house);
      }
      for (let left = 1 + (r() < 0.5); left > 0; left--) { // in the garden: berry bushes, a lilac by the gate side
        const a = r() * 6.283, d = 5 + 6 * r(), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (inLot(x, z)) put(x, z, PICK.house, 0.9);
      }
      continue;
    }
    const len = (i) => Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]);
    if (f.kind === 'apt') {
      for (let i = 0; i < n; i++) {
        const L = len(i); if (L < 10) continue;
        for (let s = 2 + r() * 3; s < L - 2; s += 4.5 + r() * 4.5) {
          if (r() < 0.35) continue;
          const [x, z] = off(i, s / L, 2.2 + 1.6 * r());
          if (!near(x, z, 1.2)) put(x, z, PICK.apt);
        }
      }
      continue;
    }
    // public: the two longest walls; a formal row on the first of about half the buildings
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => len(b) - len(a)).slice(0, 2);
    order.forEach((i, rank) => {
      const L = len(i); if (L < 12 || r() > (rank ? 0.2 : 0.5)) return;
      const step = 3.4 + r() * 1.8, size = 0.8 + r() * 0.4, other = r() < 0.5 ? JUNIPER : BUSH;
      for (let s = 2.5, k = 0; s < L - 2.5; s += step, k++) { const [x, z] = off(i, s / L, 2.3); put(x, z, null, size * (0.94 + 0.12 * r()), k % 4 === 3 ? other : THUJA); }
    });
  }
  mark('buildings', n0);

  // ---- 2) land cover: belts inside the park edges, groups on lawns, scrub, flowerbeds, allotments
  const inRegion = (b) => !(b.x1 < R.x0 || b.x0 > R.x1 || b.z1 < R.z0 || b.z0 > R.z1);
  const grid = function* (rings, step, p, each) {
    const outer = ringPts(rings[0]), bb = bboxOf(outer); if (!inRegion(bb)) return;
    const holes = rings.length > 1 ? rings.slice(1).map(ringPts) : null;
    for (let gx = Math.max(bb.x0, R.x0); gx < Math.min(bb.x1, R.x1); gx += step) for (let gz = Math.max(bb.z0, R.z0); gz < Math.min(bb.z1, R.z1); gz += step) {
      if (due()) { pause(); yield; resume(); }
      if (r() > p) continue;
      const x = gx + r() * step, z = gz + r() * step;
      if (inPoly(outer, x, z) && !(holes && holes.some((h) => inPoly(h, x, z)))) each(x, z);
    }
  };
  const group = (mix, most, k = 1) => (x, z) => { for (let left = 1 + Math.floor(r() * most); left > 0; left--) put(x + (r() - 0.5) * 5 * (left > 1), z + (r() - 0.5) * 5 * (left > 1), mix, k); };
  n0 = out.length;
  for (const rings of map.cover.park ?? []) {
    const P = ringPts(rings[0]); if (!inRegion(bboxOf(P)) || areaOf(P) < 400) continue;
    let run = r() * 8;
    for (let i = 0; i < P.length; i++) {
      if (due()) { pause(); yield; resume(); }
      const a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez); if (L < 0.5) continue;
      for (; run < L; run += 6 + r() * 6) {
        if (r() < 0.4) continue;
        const mx = a[0] + ex * run / L, mz = a[1] + ez * run / L, d = 1.6 + 2.6 * r(); let nx = ez / L, nz = -ex / L;
        if (!inPoly(P, mx + nx * 2, mz + nz * 2)) { nx = -nx; nz = -nz; }
        if (inPoly(P, mx + nx * d, mz + nz * d)) put(mx + nx * d, mz + nz * d, PICK.edge);
      }
      run -= L;
    }
    yield* grid(rings, 24, 0.35, group(PICK.lawn, 3));
  }
  mark('parks', n0);
  n0 = out.length;
  for (const rings of map.cover.grass ?? []) yield* grid(rings, 11, 0.3, group(PICK.lawn, 2));
  mark('lawns', n0);
  n0 = out.length;
  for (const rings of map.cover.scrub ?? []) yield* grid(rings, 5, 0.65, (x, z) => put(x, z, PICK.scrub, 1.15));
  mark('scrub', n0);
  n0 = out.length;
  for (const rings of map.cover.flowers ?? []) { let left = 60; yield* grid(rings, 2.2, 0.8, (x, z) => { if (left > 0 && put(x, z, PICK.bed, 0.8)) left--; }); }
  mark('beds', n0);
  n0 = out.length;
  for (const rings of map.cover.allot ?? []) yield* grid(rings, 11, 0.35, (x, z) => put(x, z, PICK.allot, 0.85));
  mark('allotments', n0);

  // ---- 3) verges: on some stretches of the main streets a low clipped line of bushes along the lawn's edge
  n0 = out.length;
  const OLIVE = KINDS.indexOf('olive');
  for (const rd of map.roads) {
    if (rd.k !== 'm' || rd.br || !MAIN.test(rd.c) || r() > 0.3) continue;
    if (due()) { pause(); yield; resume(); }
    const p = rd.p, o = rd.w / 2 + 1.2, kind = r() < 0.7 ? BUSH : OLIVE, size = 0.75 + 0.2 * r();
    for (const side of [-1, 1]) {
      if (r() < 0.4) continue;
      let run = 4 + r() * 6;
      for (let i = 2; i < p.length; i += 2) {
        const ax = p[i - 2], az = p[i - 1], ex = p[i] - ax, ez = p[i + 1] - az, L = Math.hypot(ex, ez); if (L < 1) continue;
        for (; run < L; run += 1.9) { // the first open ground past the kerb and the paving, within 8 m
          const mx = ax + ex * run / L, mz = az + ez * run / L, ux = -ez / L * side, uz = ex / L * side;
          for (let d = o; d < o + 8; d += 0.8) if (free(mx + ux * d, mz + uz * d)) { if (occ.get(mx + ux * (d + 2.5), mz + uz * (d + 2.5)) !== 1) put(mx + ux * (d + 0.7), mz + uz * (d + 0.7), null, size, kind); break; }
        }
        run -= L;
      }
    }
  }
  mark('verges', n0);

  const data = Float32Array.from(out);
  pause();
  return { data, kinds: KINDS, stats: { ...counts, total: data.length / SHRUB_STRIDE, obstacles: obs ? obs.n : 0, ...avoided, ms: Math.round(work), wallMs: Math.round(performance.now() - t0) } };
}
