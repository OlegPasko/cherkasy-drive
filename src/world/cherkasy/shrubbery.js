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
//   - OSM hedges (barrier=hedge, hedges_data.js): clipped hedge blocks of the tree system (hedgeRows).
// Nothing stands on a building, a carriageway, a footway, a railway track, paving, a pitch, a playground, water, or
// where a hand-built site keeps the ground clear.
//
//   shrubSpots({ map, ground, footprints, occ, clear = null }) -> { data, kinds, stats }
//     ground: { heightAt, onAsphalt, isWater };  occ: the buildings' 1 m raster (greenery.js footprintRaster);
//     clear(x, z) -> bool: no shrub there (the hand-built sites' clear tests)
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
const table = (mix) => { const sum = mix.reduce((a, q) => a + q[1], 0); let acc = 0; return mix.map(([k, w]) => [KINDS.indexOf(k), (acc += w) / sum]); };
const PICK = Object.fromEntries(Object.entries(MIX).map(([k, m]) => [k, table(m)]));

export function hedgeRows({ ground, occ, clear = null }) {
  const out = [], r = rng(29);
  for (const H of HEDGES) {
    const h = H.h ? Math.min(1.8, Math.max(0.8, H.h * 0.7)) : 1.15 + 0.3 * r();
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

export function* shrubSteps({ map, ground, footprints, occ, clear = null }) {
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

  const out = [], counts = {};
  const mark = (name, n0) => { counts[name] = (out.length - n0) / SHRUB_STRIDE; };
  const free = (x, z) => x > R.x0 + 1 && x < R.x1 - 1 && z > R.z0 + 1 && z < R.z1 - 1 && no.get(x, z) !== 1 && occ.get(x, z) !== 1 && !ground.onAsphalt(x, z) && !ground.isWater(x, z);
  // a shrub of a mix at (x, z): its size, a 3 x 3 m claim in the raster so the next one keeps off; k: size factor
  const put = (x, z, mix, k = 1, kind = -1) => {
    if (!free(x, z) || occ.get(x + 0.9, z) === 1 || occ.get(x - 0.9, z) === 1 || occ.get(x, z + 0.9) === 1 || occ.get(x, z - 0.9) === 1 || (clear && clear(x, z))) return false;
    if (kind < 0) { const q = r(); kind = mix[mix.length - 1][0]; for (const [id, acc] of mix) if (q < acc) { kind = id; break; } }
    const S = SIZE[KINDS[kind]], w = (S[0] + (S[1] - S[0]) * r()) * k, h = (S[2] + (S[3] - S[2]) * r()) * k;
    out.push(x, ground.heightAt(x, z) - 0.06 * h, z, r() * 6.283, w, h, kind, r());
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
  return { data, kinds: KINDS, stats: { ...counts, total: data.length / SHRUB_STRIDE, ms: Math.round(work), wallMs: Math.round(performance.now() - t0) } };
}
