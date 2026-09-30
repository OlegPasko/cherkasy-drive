// Walking network built lazily from map.json: sidewalk bands beside streets, footways, park paths, steps and zebra
// crossings, resampled and checked against buildings, water and carriageway asphalt, then linked end-to-path and at
// intersections so walkers can turn corners and cross streets.
//   createNetwork({ map, isBuilding, isAsphalt, isWater, cell = 96 }) -> {
//     STEP, CELL, paths, cellKey(x, z), request(key, prio = 0) (lower prio is processed first; re-requesting re-prioritises), pump(budgetMs) -> sources done, ready(key) -> bool,
//     cellSamples(key) -> { s: [pathId, index, ...], wlen, wide: [pathId, index, ...] } | null,
//     place(path, u, lat, out) -> out { x, z, tx, tz, lo, hi, road }, stats() }
// A path: { id, kind, n, x, z, lo, hi (lateral free range per sample, + = right of travel toward +u), road (on the
// carriageway), seg (sample-to-sample length), links [{ u, p, u2, road }] sorted by u }.
export const KIND = { SIDE: 0, FOOT: 1, PED: 2, STEPS: 3, DIRT: 4, CROSS: 5 };
const KW = [1, 0.45, 1.8, 0.2, 0.25, 0]; // walker density weight per kind (crossings get walkers only in passing)
const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const SIDE = new Set([...MAIN, 'residential', 'living_street', 'unclassified']);
const BUSY = /Шевченка|Хрещатик|Соборн|Смілянськ|Байди Вишневецького|Гоголя|Святотроїцьк|Небесної Сотні|Дашковича|Благовісн/;
const STEP = 2.5, LINK_END = 4.2, LINK_X = 1.4;

export function createNetwork({ map, isBuilding, isAsphalt, isWater, cell = 96 }) {
  const K = (i, j) => (i + 32768) * 65536 + (j + 32768);
  const cellKey = (x, z) => K(Math.floor(x / cell), Math.floor(z / cell));
  const srcs = [], cellSrc = new Map();
  for (const r of map.roads || []) {
    if (r.br || !r.p || r.p.length < 4) continue;
    const busy = BUSY.test(r.n || '') ? 1.8 : 1;
    if (r.k === 'm' && SIDE.has(r.c)) {
      const band = MAIN.has(r.c) ? 4.5 : 2.6;
      for (const sg of [1, -1]) srcs.push({ P: r.p, off: sg * (r.w / 2 + band / 2), hw: band / 2 - 0.45, kind: KIND.SIDE, w: (MAIN.has(r.c) ? 1 : 0.35) * busy });
    } else if (r.k === 'p' && r.c !== 'cycleway') {
      const kind = r.c === 'steps' ? KIND.STEPS : r.c === 'pedestrian' ? KIND.PED : KIND.FOOT;
      srcs.push({ P: r.p, off: 0, hw: Math.max(0.3, r.w / 2 - 0.3), kind, w: KW[kind] * busy });
    } else if (r.k === 'd' && (r.c === 'footway' || r.c === 'path')) srcs.push({ P: r.p, off: 0, hw: 0.35, kind: KIND.DIRT, w: KW[KIND.DIRT] });
    else if (r.k === 'x') srcs.push({ P: r.p, off: 0, hw: 0.7, kind: KIND.CROSS, w: 0 });
  }
  srcs.forEach((s, si) => {
    s.state = 0; s.cells = [];
    const P = s.P, m = Math.abs(s.off) + s.hw + 2;
    for (let i = 0; i + 3 < P.length; i += 2) {
      const i0 = Math.floor((Math.min(P[i], P[i + 2]) - m) / cell), i1 = Math.floor((Math.max(P[i], P[i + 2]) + m) / cell);
      const j0 = Math.floor((Math.min(P[i + 1], P[i + 3]) - m) / cell), j1 = Math.floor((Math.max(P[i + 1], P[i + 3]) + m) / cell);
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) {
        const k = K(a, b); let c = cellSrc.get(k);
        if (!c) cellSrc.set(k, c = { list: [], left: 0 });
        if (c.list[c.list.length - 1] !== si) { c.list.push(si); c.left++; s.cells.push(k); }
      }
    }
  });

  const paths = [], queue = [], cellData = new Map();
  let sorted = true;
  const sHash = new Map(), eHash = new Map(); // 4 m buckets: samples [path, idx, ...], path ends [path, u, ...]
  const hk = (x, z) => K(Math.floor(x / 4), Math.floor(z / 4));
  const hpush = (M, x, z, a, b) => { const k = hk(x, z); let L = M.get(k); if (!L) M.set(k, L = []); L.push(a, b); };
  let nSamples = 0, nLinks = 0;

  const blocked = (x, z) => isBuilding(x, z) || isWater(x, z);
  const free = (x, z) => !blocked(x, z) && !isAsphalt(x, z);
  const clearLine = (x0, z0, x1, z1, asphOk) => {
    const dt = 0.5 / (Math.hypot(x1 - x0, z1 - z0) || 1);
    for (let t = dt; t < 1; t += dt) {
      const px = x0 + t * (x1 - x0), pz = z0 + t * (z1 - z0);
      if (blocked(px, pz) || (!asphOk && isAsphalt(px, pz))) return false;
    }
    return true;
  };

  // polyline offset sideways (mitred, capped) and resampled every STEP
  const unitRight = (P, v) => { // right-hand unit normal of polyline segment v (vertex v -> v + 1)
    const ex = P[2 * v + 2] - P[2 * v], ez = P[2 * v + 3] - P[2 * v + 1], len = Math.hypot(ex, ez) || 1;
    return [-ez / len, ex / len];
  };
  function resample(P, off) {
    const nv = P.length / 2, Q = [];
    for (let v = 0; v < nv; v++) {
      const before = v > 0 ? unitRight(P, v - 1) : null, after = v < nv - 1 ? unitRight(P, v) : null;
      const sx = (before ? before[0] : 0) + (after ? after[0] : 0), sz = (before ? before[1] : 0) + (after ? after[1] : 0), sl = Math.hypot(sx, sz) || 1;
      // mitre: push corners out so the band keeps its width, at most twice the offset
      const miter = before && after ? Math.min(2, 1 / Math.max(0.5, Math.abs(after[0] * sx / sl + after[1] * sz / sl))) : 1;
      Q.push(P[2 * v] + sx / sl * off * miter, P[2 * v + 1] + sz / sl * off * miter);
    }
    const out = [Q[0], Q[1]];
    let carry = 0;
    for (let i = 0; i + 3 < Q.length; i += 2) {
      const dx = Q[i + 2] - Q[i], dz = Q[i + 3] - Q[i + 1], L = Math.hypot(dx, dz);
      let t = STEP - carry;
      while (t <= L) { out.push(Q[i] + dx * t / L, Q[i + 1] + dz * t / L); t += STEP; }
      carry = L - (t - STEP);
    }
    const lx = Q[Q.length - 2], lz = Q[Q.length - 1];
    if (Math.hypot(lx - out[out.length - 2], lz - out[out.length - 1]) > STEP * 0.3) out.push(lx, lz);
    return out;
  }

  function processSource(s) {
    const S = resample(s.P, s.off), n = S.length / 2;
    if (n < 2) return;
    const X = new Float32Array(n), Z = new Float32Array(n), st = new Uint8Array(n); // st: 0 bad, 1 walkable, 2 carriageway
    const NX = new Float32Array(n), NZ = new Float32Array(n);
    const cross = s.kind === KIND.CROSS;
    for (let i = 0; i < n; i++) {
      const [nx, nz] = unitRight(S, i === n - 1 ? i - 1 : i), x = S[2 * i], z = S[2 * i + 1];
      NX[i] = nx; NZ[i] = nz; X[i] = x; Z[i] = z;
      if (cross) { st[i] = blocked(x, z) ? 0 : isAsphalt(x, z) ? 2 : 1; continue; }
      let ok = false;
      for (let o = 0; o <= s.hw + 0.01 && !ok; o += 0.5) for (const sg of o ? [1, -1] : [1]) {
        const px = x + nx * o * sg, pz = z + nz * o * sg;
        if (free(px, pz)) { X[i] = px; Z[i] = pz; ok = true; break; }
      }
      st[i] = ok ? 1 : blocked(x, z) ? 0 : 2;
    }
    // runs of walkable samples; short carriageway gaps between them become crossings, anything else splits
    const maxGap = s.kind === KIND.SIDE ? 5 : 4;
    let i = 0;
    while (i < n) {
      while (i < n && st[i] !== 1 && !(cross && st[i])) i++;
      if (i >= n) break;
      let j = i;
      for (;;) {
        if (j + 1 < n && (st[j + 1] === 1 || (cross && st[j + 1]))) { j++; continue; }
        let g = j + 1; while (g < n && st[g] === 2) g++;
        if (!cross && g < n && st[g] === 1 && g - j - 1 <= maxGap && g - j - 1 > 0 && clearLine(X[j], Z[j], X[g], Z[g], true)) { j = g; continue; }
        break;
      }
      if (j > i) makePath(s, X, Z, NX, NZ, st, i, j);
      i = j + 1;
    }
  }

  function makePath(s, X, Z, NX, NZ, st, i0, i1) {
    const n = i1 - i0 + 1, id = paths.length;
    const p = { id, kind: s.kind, w: s.w, n, x: new Float32Array(n), z: new Float32Array(n), lo: new Float32Array(n), hi: new Float32Array(n), road: new Uint8Array(n), seg: new Float32Array(n), links: [] };
    for (let m = 0; m < n; m++) {
      const i = i0 + m, x = X[i], z = Z[i], k = m;
      p.x[k] = x; p.z[k] = z; p.road[k] = st[i] === 2 ? 1 : 0;
      if (st[i] === 2) { p.lo[k] = -0.7; p.hi[k] = 0.7; continue; }
      const lim = s.hw + 0.5;
      const reach = (sg) => { let d = 0; for (let o = 0.5; o <= lim + 0.01; o += 0.5) { if (!free(x + NX[i] * o * sg, z + NZ[i] * o * sg)) break; d = o; } return Math.max(0, d - 0.35); };
      p.lo[k] = -Math.min(s.hw, reach(-1)); p.hi[k] = Math.min(s.hw, reach(1));
    }
    p.seg.forEach((_, m) => { const b = Math.min(n - 1, m + 1), a = b - 1; p.seg[m] = Math.max(0.05, Math.hypot(p.x[b] - p.x[a], p.z[b] - p.z[a])); });
    paths.push(p); nSamples += n;
    // index, per-cell spawn lists
    for (let m = 0, k = 0; m < n; k = ++m) {
      hpush(sHash, p.x[k], p.z[k], id, k);
      if (p.road[k] || !s.w) continue;
      const ck = cellKey(p.x[k], p.z[k]);
      let c = cellData.get(ck); if (!c) cellData.set(ck, c = { s: [], wlen: 0, wide: [] });
      c.s.push(id, k); c.wlen += STEP * s.w;
      if (p.hi[k] - p.lo[k] > 2.6) c.wide.push(id, k);
    }
    // links: our ends onto other paths, other paths' ends onto us, and crossings of the two lines
    const R = s.kind === KIND.CROSS ? LINK_END + 1 : LINK_END;
    for (const k of [0, n - 1]) {
      near(sHash, p.x[k], p.z[k], R, (q, j, d) => { if (q !== id) tryLink(p, k, paths[q], j, d, R); });
      hpush(eHash, p.x[k], p.z[k], id, k);
    }
    for (let k = n; k-- > 0;) {
      near(eHash, p.x[k], p.z[k], LINK_END + 1, (q, j, d) => { if (q !== id) tryLink(paths[q], j, p, k, d, paths[q].kind === KIND.CROSS ? LINK_END + 1 : LINK_END); });
      near(sHash, p.x[k], p.z[k], LINK_X, (q, j, d) => { if (q !== id && j > 0 && j < paths[q].n - 1 && k > 0 && k < n - 1) tryLink(p, k, paths[q], j, d, LINK_X); });
    }
  }
  const near = (M, x, z, r, fn) => {
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4), span = Math.ceil(r / 4);
    for (let di = -span; di <= span; di++) for (let dj = -span; dj <= span; dj++) {
      const L = M.get(K(cx + di, cz + dj)); if (!L) continue;
      for (let a = 0; a < L.length; a += 2) {
        const q = paths[L[a]], k = L[a + 1], d = Math.hypot(q.x[k] - x, q.z[k] - z);
        if (d <= r) fn(L[a], k, d);
      }
    }
  };
  function tryLink(A, ka, B, kb, d, r) {
    if (d > r) return;
    for (const l of A.links) if (l.p === B.id && Math.abs(l.u - ka) < 3) return;
    const road = A.kind === KIND.CROSS || B.kind === KIND.CROSS;
    if (d > 0.3 && !clearLine(A.x[ka], A.z[ka], B.x[kb], B.z[kb], road || A.road[ka] || B.road[kb])) return;
    const rr = road && (A.road[ka] || B.road[kb]) ? 1 : 0;
    A.links.push({ u: ka, p: B.id, u2: kb, road: rr }); A.links.sort((a, b) => a.u - b.u);
    B.links.push({ u: kb, p: A.id, u2: ka, road: rr }); B.links.sort((a, b) => a.u - b.u);
    nLinks++;
  }

  return {
    STEP, CELL: cell, KIND, paths, cellKey,
    request(key, prio = 0) {
      const c = cellSrc.get(key); if (!c || c.left <= 0) return;
      for (const si of c.list) {
        const src = srcs[si];
        if (src.state === 0) { src.state = 1; src.prio = prio; queue.push(si); sorted = false; }
        else if (src.state === 1 && prio < src.prio) { src.prio = prio; sorted = false; }
      }
    },
    pump(budgetMs) {
      const t0 = performance.now(); let done = 0;
      if (!sorted) { queue.sort((a, b) => srcs[b].prio - srcs[a].prio); sorted = true; } // nearest last: pop() takes it
      while (queue.length && performance.now() - t0 < budgetMs) {
        const s = srcs[queue.pop()];
        try { processSource(s); } catch (e) { console.warn('[people] path source failed', e); }
        s.state = 2; done++;
        for (const k of s.cells) cellSrc.get(k).left--;
      }
      return done;
    },
    ready: (key) => { const c = cellSrc.get(key); return !c || c.left <= 0; },
    pending: () => queue.length,
    cellSamples: (key) => cellData.get(key) || null,
    place(p, u, lat, out) {
      const i = Math.max(0, Math.min(p.n - 2, Math.floor(u))), f = Math.min(1, Math.max(0, u - i));
      const ax = p.x[i], az = p.z[i], dx = p.x[i + 1] - ax, dz = p.z[i + 1] - az, len = Math.hypot(dx, dz) || 1e-6;
      const tx = dx / len, tz = dz / len;
      const lo = Math.max(p.lo[i], p.lo[i + 1]), hi = Math.min(p.hi[i], p.hi[i + 1]); // the tighter side: kerbs bend between samples
      const l = Math.min(hi, Math.max(lo, lat));
      out.x = ax + dx * f - tz * l; out.z = az + dz * f + tx * l;
      out.tx = tx; out.tz = tz; out.lo = lo; out.hi = hi; out.road = p.road[Math.round(u) < p.n ? Math.max(0, Math.round(u)) : p.n - 1];
      return out;
    },
    stats: () => ({ sources: srcs.length, done: srcs.filter(s => s.state === 2).length, paths: paths.length, samples: nSamples, links: nLinks, queued: queue.length }),
  };
}
