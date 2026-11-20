// The fences' builder, free of three.js so it runs in a worker (fences.js starts it) and in plain node (tests):
// map_fences.json (tools/cherkasy/build_fences.mjs) -> merged geometry per 512 m chunk, collision runs, the atlas.
//
//   parseFences(json) -> F { n, kind, seed, h, flags, start, count (per piece), pts: Float32Array [x, z, ...], kinds: [names] }
//   samplePoints(F) -> Float32Array [x, z] x 3 per piece (first point, middle, last): what fences.js tests the sites with
//   buildFenceChunks(F, heightAt, dead?, { size = 512 }) -> { chunks, solids, stats }
//     dead: Uint8Array per piece, 1 = not built (a hand-built site's lot)
//     chunks: [{ box: [x0, y0, z0, x1, y1, z1], position, normal (Int8, normalised), uv, color (Uint8, linear,
//       normalised), index (Uint32), lite }] – index holds the panels first (`lite` indices: what a far chunk draws),
//       then the near detail (brick posts, plinths, gate posts, open gate leaves)
//     solids: Float32Array [x0, z0, x1, z1, y0, y1] per straight run of fence (collinear pieces merged, <= 48 m,
//       within 0.25 m of the fence line and 1.2 m of ground rise)
//   makeFenceAtlas() -> { data: Uint8Array RGBA (sRGB), width, height, mips: [{ data, width, height }] }  16 rows of
//     256 px, one per fence face, light grey detail that the vertex colour tints; u repeats every 4 m, a row is never
//     left in v; mips: the levels below, each row's see-through share kept for the alpha test (atlasMips)
//   gridHeight({ meta, grid }) -> heightAt(x, z)   the ground's 16 m lattice, bilinear (ground.js heightFieldFrom)
// As a worker: { url } -> { samples, n, atlas }; then { hf, dead } -> { chunks, solids, stats } and it closes.
// Fence faces are single quads drawn double-sided, 0.3 m into the ground so a slope shows no gap; a fence follows the
// terrain, split where the ground bends. Styles, colours and post spacing come from the piece's kind and seed (TINT).

const ROWS = 16, RH = 256, PAD = 16, BAND = RH - 2 * PAD, AW = 512, AH = ROWS * RH;
const ROW = { sheet: 0, plank: 1, picket: 2, slate: 3, brick: 4, euro: 5, mesh: 6, slab: 7, bars: 8, hedge: 9, gate: 10, forged: 11, oldgate: 12 };
const vOf = (row, f) => (row * RH + PAD + f * BAND) / AH;
const SINK = 0.3; // how far a face reaches into the ground
const TOL = 0.25; // a collision run may leave the fence line by this much (a wobbly OSM line is one wall)
const RISE = 1.2; // ... and its ground may rise by this much (its box has a flat top)

const lin = (hex) => { const n = parseInt(hex.slice(1), 16); return [16, 8, 0].map((s) => Math.round(255 * (((n >> s) & 255) / 255) ** 2.2)); };
const P = (...list) => list.map(lin);
const SHEETS = P('#74232b', '#2f5a3c', '#5c3b2b', '#474b50', '#b4b8ba', '#2d4f78', '#244a35', '#8a4c37', '#d5ceba', '#6b2a2e', '#3a3d41');
const WOODS = P('#8d877d', '#4e7a5a', '#3f7f86', '#5a7fa8', '#6e4c34', '#a48864', '#7a7468', '#55745c');
const BRICKS = P('#c8a66a', '#9c5a40', '#6e4636', '#d6d2c8', '#b98f58');
// per kind: the atlas row, the tints a seed picks from, brick posts on a street front, a brick plinth under the face
const TINT = {
  sheet: { row: ROW.sheet, tints: SHEETS },
  sheetbrick: { row: ROW.sheet, tints: SHEETS, posts: true, plinth: true },
  plank: { row: ROW.plank, tints: WOODS },
  picket: { row: ROW.picket, tints: [...WOODS, lin('#d8d6cf')] },
  slate: { row: ROW.slate, tints: P('#9c9c96', '#8c8e87', '#a5a39b', '#878d7d') },
  brick: { row: ROW.brick, tints: P('#d9d6cc', '#c8a66a', '#9a5038', '#d2cec2'), posts: true, own: true },
  euro: { row: ROW.euro, tints: P('#bcb9b1', '#cbc7bc', '#abaaa4', '#d8cfb4', '#b3b6b9') },
  mesh: { row: ROW.mesh, tints: P('#9aa19b', '#4e6e54', '#84898c') },
  slab: { row: ROW.slab, tints: P('#aba9a1', '#9e9c94', '#c6c4bc', '#a39f93') },
  bars: { row: ROW.bars, tints: P('#3e6a48', '#2e3033', '#7d8285', '#3f5f86', '#5b3a2e') },
  forged: { row: ROW.forged, tints: P('#26282a', '#3a2c26', '#2a2f2c'), posts: true, plinth: true },
  hedge: { row: ROW.hedge, tints: P('#4c6e3a', '#3f6336', '#5a7a42') },
  gate: { row: ROW.gate, tints: SHEETS, leaf: 1 },
  wicket: { row: ROW.gate, tints: SHEETS, leaf: 0.5 },
  oldgate: { row: ROW.oldgate, tints: P('#3f6e4c', '#4a6c9a', '#6b4530', '#7c7f80', '#8a4a2a', '#2f5a52'), leaf: 1 },
  oldwicket: { row: ROW.oldgate, tints: P('#3f6e4c', '#4a6c9a', '#6b4530', '#7c7f80', '#8a4a2a', '#2f5a52'), leaf: 0.5 },
  gateopen: { row: ROW.gate, tints: SHEETS, open: true },
};
const STEEL = lin('#3a3c3f');

// ---------------------------------------------------------------------------------------------- data
export function parseFences(json) {
  const d = json.d, R = json.region, u = json.unit ?? 0.1;
  let n = 0, np = 0;
  for (let i = 0; i < d.length; i += 5 + 2 * d[i + 4]) { n++; np += d[i + 4]; }
  const F = { n, kinds: json.kinds, kind: new Uint8Array(n), seed: new Uint8Array(n), h: new Float32Array(n), flags: new Uint8Array(n),
    start: new Uint32Array(n), count: new Uint16Array(n), pts: new Float32Array(np * 2) };
  for (let i = 0, k = 0, q = 0; i < d.length; k++) {
    const m = d[i + 4];
    F.kind[k] = d[i]; F.seed[k] = d[i + 1]; F.h[k] = d[i + 2] * u; F.flags[k] = d[i + 3]; F.start[k] = q; F.count[k] = m;
    let x = d[i + 5], z = d[i + 6];
    F.pts[2 * q] = x * u + R.x0; F.pts[2 * q + 1] = z * u + R.z0;
    for (let j = 1; j < m; j++) { x += d[i + 5 + 2 * j]; z += d[i + 6 + 2 * j]; F.pts[2 * (q + j)] = x * u + R.x0; F.pts[2 * (q + j) + 1] = z * u + R.z0; }
    q += m; i += 5 + 2 * m;
  }
  return F;
}
export function samplePoints(F) {
  const S = new Float32Array(F.n * 6);
  for (let k = 0; k < F.n; k++) {
    const a = F.start[k], b = a + F.count[k] - 1, m = (a + b) >> 1, odd = (F.count[k] & 1) === 0;
    S[6 * k] = F.pts[2 * a]; S[6 * k + 1] = F.pts[2 * a + 1];
    // the middle: a vertex, or between the two middle ones
    S[6 * k + 2] = odd ? (F.pts[2 * m] + F.pts[2 * m + 2]) / 2 : F.pts[2 * m]; S[6 * k + 3] = odd ? (F.pts[2 * m + 1] + F.pts[2 * m + 3]) / 2 : F.pts[2 * m + 1];
    S[6 * k + 4] = F.pts[2 * b]; S[6 * k + 5] = F.pts[2 * b + 1];
  }
  return S;
}
export function gridHeight({ meta, grid: g }) {
  const { x0, z0, cell, nx, nz } = meta;
  const node = (i, j) => g[(j < 0 ? 0 : j >= nz ? nz - 1 : j) * nx + (i < 0 ? 0 : i >= nx ? nx - 1 : i)];
  return (x, z) => {
    const u = (x - x0) / cell, v = (z - z0) / cell, i = Math.floor(u), j = Math.floor(v), s = u - i, t = v - j;
    return (1 - t) * ((1 - s) * node(i, j) + s * node(i + 1, j)) + t * ((1 - s) * node(i, j + 1) + s * node(i + 1, j + 1));
  };
}

// ---------------------------------------------------------------------------------------------- geometry
class Chunk {
  constructor() {
    this.cap = 1024; this.nv = 0;
    this.pos = new Float32Array(this.cap * 3); this.nrm = new Int8Array(this.cap * 3); this.uv = new Float32Array(this.cap * 2); this.col = new Uint8Array(this.cap * 3);
    this.lite = []; this.det = [];
    this.box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  }
  vert(x, y, z, nx, ny, nz, u, v, c) {
    if (this.nv === this.cap) {
      const grow = (A, k) => { const B = new A.constructor(this.cap * 2 * k); B.set(A); return B; };
      this.pos = grow(this.pos, 3); this.nrm = grow(this.nrm, 3); this.uv = grow(this.uv, 2); this.col = grow(this.col, 3); this.cap *= 2;
    }
    const i = this.nv++, b = this.box;
    this.pos[3 * i] = x; this.pos[3 * i + 1] = y; this.pos[3 * i + 2] = z;
    this.nrm[3 * i] = nx * 127; this.nrm[3 * i + 1] = ny * 127; this.nrm[3 * i + 2] = nz * 127;
    this.uv[2 * i] = u; this.uv[2 * i + 1] = v;
    this.col[3 * i] = c[0]; this.col[3 * i + 1] = c[1]; this.col[3 * i + 2] = c[2];
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z; if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
    return i;
  }
  quad(I, a, b, c, d) { I.push(a, b, c, a, c, d); }
  pack() {
    const n = this.nv, index = new Uint32Array(this.lite.length + this.det.length);
    index.set(this.lite); index.set(this.det, this.lite.length);
    return { box: this.box, position: this.pos.slice(0, n * 3), normal: this.nrm.slice(0, n * 3), uv: this.uv.slice(0, n * 2), color: this.col.slice(0, n * 3), index, lite: this.lite.length };
  }
}
const jit = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

export function buildFenceChunks(F, heightAt, dead = null, { size = 512 } = {}) {
  const t0 = Date.now(), chunks = new Map(), solids = [];
  const stats = { pieces: 0, dead: 0, verts: 0, liteTris: 0, tris: 0, posts: 0, solids: 0, km: 0, ms: 0 };
  const chunkAt = (x, z) => { const k = Math.floor(x / size) + ',' + Math.floor(z / size); return chunks.get(k) ?? chunks.set(k, new Chunk()).get(k); };
  // a square post (brick pier or steel tube): four sides sharing corner normals, a flat cap a little wider
  const post = (C, x, z, ux, uz, half, y0, y1, row, col, cap) => {
    const nx = -uz, nz = ux, v0 = vOf(row, 0), v1 = vOf(row, 0.93), w = (half * 2) / 4, ids = [];
    const cx = [-1, 1, 1, -1, -1], cz = [-1, -1, 1, 1, -1];
    for (let k = 0; k < 5; k++) {
      const px = x + (ux * cx[k] + nx * cz[k]) * half, pz = z + (uz * cx[k] + nz * cz[k]) * half;
      const dx = (ux * cx[k] + nx * cz[k]) * 0.7071, dz = (uz * cx[k] + nz * cz[k]) * 0.7071;
      ids.push(C.vert(px, y0, pz, dx, 0, dz, k * w, v0, col), C.vert(px, y1, pz, dx, 0, dz, k * w, v1, col));
    }
    for (let k = 0; k < 4; k++) C.quad(C.det, ids[2 * k], ids[2 * k + 1], ids[2 * k + 3], ids[2 * k + 2]); // outward
    const hc = half + cap, vc = vOf(row, 0.985), t = [];
    for (let k = 0; k < 4; k++) t.push(C.vert(x + (ux * cx[k] + nx * cz[k]) * hc, y1, z + (uz * cx[k] + nz * cz[k]) * hc, 0, 1, 0, k * 0.01, vc, col));
    C.quad(C.det, t[0], t[3], t[2], t[1]);
    stats.posts++;
  };
  // one face between two ground points (a strip of quads when the ground bends between them)
  const face = (C, I, ax, az, bx, bz, h, ua, ub, v0, v1, col, off = 0, lift = -SINK) => {
    const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
    const ga = heightAt(ax, az), gb = heightAt(bx, bz), gm = heightAt((ax + bx) / 2, (az + bz) / 2);
    const n = L > 20 || Math.abs(gm - (ga + gb) / 2) > 0.07 ? Math.max(2, Math.ceil(L / 8)) : 1;
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const f = k / n, x = ax + (bx - ax) * f + nx * off, z = az + (bz - az) * f + nz * off, g = k === 0 ? ga : k === n ? gb : heightAt(x, z), u = ua + (ub - ua) * f;
      const cur = [C.vert(x, g + lift, z, nx, 0, nz, u, v0, col), C.vert(x, g + h, z, nx, 0, nz, u, v1, col)];
      if (prev) C.quad(I, prev[0], cur[0], cur[1], prev[1]);
      prev = cur;
    }
    return [Math.min(ga, gb, gm), Math.max(ga, gb, gm)];
  };
  // collision: straight runs of fence, merged across the pieces of a lot. A run stays within TOL of the fence line
  // (every joint is checked against the chord to its far end) and within RISE of ground, so its flat-topped box keeps
  // near the fence's top on a slope; a long segment up a slope is halved until it does
  let run = null;
  const flush = () => { if (run) { solids.push(run.x0, run.z0, run.x1, run.z1, run.g0 - 0.5, run.g1 + run.h); run = null; } };
  const solid = (ax, az, bx, bz, h, deep = 0) => {
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) return;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, ga = heightAt(ax, az), gb = heightAt(bx, bz), gm = heightAt(mx, mz);
    const g0 = Math.min(ga, gb, gm), g1 = Math.max(ga, gb, gm);
    if (g1 - g0 > RISE && L > 2 && deep < 6) { solid(ax, az, mx, mz, h, deep + 1); solid(mx, mz, bx, bz, h, deep + 1); return; }
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    if (run && Math.hypot(ax - run.x1, az - run.z1) < 0.6 && ux * run.ux + uz * run.uz > 0.9 && run.L + L <= 48 && Math.max(run.g1, g1) - Math.min(run.g0, g0) <= RISE) {
      const cl = Math.hypot(bx - run.x0, bz - run.z0) || 1, cx = (bx - run.x0) / cl, cz = (bz - run.z0) / cl;
      const off = (x, z) => Math.abs((x - run.x0) * -cz + (z - run.z0) * cx);
      let ok = off(run.x1, run.z1) < TOL && off(ax, az) < TOL;
      for (let k = 0; k < run.mid.length && ok; k += 2) ok = off(run.mid[k], run.mid[k + 1]) < TOL;
      if (ok) {
        run.mid.push(run.x1, run.z1, ax, az);
        run.x1 = bx; run.z1 = bz; run.L += L; run.ux = cx; run.uz = cz; run.g0 = Math.min(run.g0, g0); run.g1 = Math.max(run.g1, g1); run.h = Math.max(run.h, h);
        return;
      }
    }
    flush();
    run = { x0: ax, z0: az, x1: bx, z1: bz, ux, uz, L, g0, g1, h, mid: [] };
  };

  for (let p = 0; p < F.n; p++) {
    if (dead?.[p]) { stats.dead++; continue; }
    const name = F.kinds[F.kind[p]], T = TINT[name];
    if (!T) continue;
    const a = F.start[p], m = F.count[p], h = F.h[p], seed = F.seed[p], front = F.flags[p] & 1;
    const X = (i) => F.pts[2 * (a + i)], Z = (i) => F.pts[2 * (a + i) + 1];
    const C = chunkAt(X(0), Z(0));
    const col = jit(T.tints[seed % T.tints.length], 0.9 + ((seed >> 3) % 8) * 0.025);
    stats.pieces++;
    if (T.open) { // a driveway's gate: two posts, the leaves swung into the lot (on the left)
      const ax = X(0), az = Z(0), bx = X(1), bz = Z(1), L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      const brick = seed & 1, half = brick ? 0.19 : 0.06, pc = brick ? jit(BRICKS[(seed >> 1) % BRICKS.length], 1) : STEEL, w = Math.min(2.4, L / 2 - 0.1), cs = 0.14, sn = 0.99;
      for (const [x, z, sg] of [[ax, az, 1], [bx, bz, -1]]) {
        const g = heightAt(x, z);
        post(C, x, z, ux, uz, half, g - SINK, g + h + 0.12, brick ? ROW.brick : ROW.sheet, pc, brick ? 0.04 : 0);
        const ex = x + (ux * sg * cs + nx * sn) * w, ez = z + (uz * sg * cs + nz * sn) * w;
        face(C, C.det, x, z, ex, ez, h, 0.02, 0.48, vOf(T.row, 0), vOf(T.row, 1), col);
      }
      continue;
    }
    let s = 0;
    for (let i = 1; i < m; i++) {
      const ax = X(i - 1), az = Z(i - 1), bx = X(i), bz = Z(i), L = Math.hypot(bx - ax, bz - az);
      if (L < 0.02) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      // a gate's leaves span the piece once; a fence's face repeats every 4 m
      const ua = T.leaf ? (s / Math.max(0.1, pieceLen(F, p))) * T.leaf : s / 4, ub = T.leaf ? ((s + L) / Math.max(0.1, pieceLen(F, p))) * T.leaf : (s + L) / 4;
      face(C, C.lite, ax, az, bx, bz, h, ua, ub, vOf(T.row, 0), vOf(T.row, 1), col);
      solid(ax, az, bx, bz, h);
      stats.km += L / 1000;
      if (front && (T.posts || T.plinth)) {
        const bc = T.own ? col : jit(BRICKS[(seed >> 2) % BRICKS.length], 0.95 + (seed & 3) * 0.03);
        if (T.plinth) for (const o of [0.035, -0.035]) face(C, C.det, ax, az, bx, bz, 0.38, s / 4, (s + L) / 4, vOf(ROW.brick, 0), vOf(ROW.brick, 0.3), bc, o);
        if (T.posts) {
          const k = Math.max(1, Math.round(L / 2.9));
          for (let j = i === 1 ? 0 : 1; j <= k; j++) {
            const x = ax + (bx - ax) * j / k, z = az + (bz - az) * j / k, g = heightAt(x, z);
            post(C, x, z, ux, uz, 0.19, g - SINK, g + h + 0.12, ROW.brick, bc, 0.045);
          }
        }
      }
      s += L;
    }
  }
  flush();
  const out = [];
  for (const C of chunks.values()) { if (!C.nv) continue; const c = C.pack(); out.push(c); stats.verts += C.nv; stats.liteTris += c.lite / 3; stats.tris += c.index.length / 3; }
  stats.solids = solids.length / 6; stats.km = Math.round(stats.km * 10) / 10; stats.ms = Date.now() - t0;
  return { chunks: out, solids: Float32Array.from(solids), stats };
}
function pieceLen(F, p) {
  let L = 0;
  for (let i = F.start[p] + 1, e = F.start[p] + F.count[p]; i < e; i++) L += Math.hypot(F.pts[2 * i] - F.pts[2 * i - 2], F.pts[2 * i + 1] - F.pts[2 * i - 1]);
  return L;
}

// ---------------------------------------------------------------------------------------------- the atlas
// Each row: f(u 0..511, y 0..223 bottom to top) -> grey 0..1 (or [r, g, b]) and alpha. 4 m wide, about 2.3 m tall
// (0.3 m of it in the ground).
export function makeFenceAtlas() {
  const data = new Uint8Array(AW * AH * 4);
  const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x, y, s) => { // value noise, cell s px, tiles over the row's 512 px
    const gx = x / s, gy = y / s, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, w = Math.round(AW / s);
    const q = (a, b) => hash(((a % w) + w) % w, b), sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (q(i, j) * (1 - sx) + q(i + 1, j) * sx) * (1 - sy) + (q(i, j + 1) * (1 - sx) + q(i + 1, j + 1) * sx) * sy;
  };
  const mod = (a, b) => ((a % b) + b) % b;
  const leaf = (ribs) => (u, y) => { // one gate leaf per 256 px: a frame, ribbed or flat infill, a gap under it
    const x = mod(u, 256);
    if (y < 36) return [0.6, 0];
    const fr = x < 9 || x > 247 || y < 45 || y > 215 || Math.abs(y - 130) < 4;
    if (fr) return [0.74, 1];
    if (ribs) { const t = mod(x, 12.8) / 12.8; return [(t < 0.14 ? 0.8 : t < 0.5 ? 1 : t < 0.64 ? 0.84 : 0.93) * (0.96 + 0.04 * noise(u, y, 8)), 1]; }
    const dx = Math.abs(x - 128) / 104, dy = Math.abs(y - 130) / 74, rh = Math.abs(dx + dy - 1); // the welded rhombus
    return [(rh < 0.035 ? 0.72 : 0.97) * (0.9 + 0.1 * noise(u, y, 10)) * (hash(u, y) < 0.02 ? 0.8 : 1), 1];
  };
  const rows = {
    [ROW.sheet]: (u, y) => { const t = mod(u, 25.6) / 25.6; return [(t < 0.12 ? 0.78 : t < 0.5 ? 1 : t < 0.62 ? 0.82 : 0.92) * (0.95 + 0.05 * noise(u, y, 6)) * (y > 220 ? 0.8 : 1), 1]; },
    [ROW.plank]: (u, y) => { const b = Math.floor(u / 12.8), x = mod(u, 12.8), top = 214 + hash(b, 7) * 10; return [x < 1.1 ? 0.4 : (0.78 + 0.22 * hash(b, 3)) * (0.9 + 0.1 * noise(u * 4, y, 16)) * (Math.abs(y - 70) < 1.2 || Math.abs(y - 180) < 1.2 ? 0.85 : 1), y > top ? 0 : 1]; },
    [ROW.picket]: (u, y) => { const b = Math.floor(u / 12.8), x = mod(u, 12.8) - 4.2, rail = Math.abs(y - 66) < 5 || Math.abs(y - 176) < 5, tip = y > 208 ? (224 - y) / 16 * 4.2 : 4.2; return [rail && Math.abs(x) > 4.2 ? 0.7 : (0.8 + 0.2 * hash(b, 5)) * (0.9 + 0.1 * noise(u * 4, y, 16)), (Math.abs(x) < tip && y < 222) || rail ? 1 : 0]; },
    [ROW.slate]: (u, y) => [(0.84 + 0.14 * Math.sin(u / 6.4 * Math.PI * 2)) * (0.72 + 0.28 * noise(u, y, 32)) * (mod(u, 128) < 2 ? 0.7 : 1), 1],
    [ROW.brick]: (u, y) => { if (y > 216) return [0.82 + 0.06 * noise(u, y, 8), 1]; const c = Math.floor(y / 8), x = u + (c & 1) * 16; return mod(y, 8) < 1.2 || mod(x, 32) < 1.4 ? [0.74, 1] : [(0.8 + 0.2 * hash(Math.floor(mod(x, 512) / 32), c)) * (0.94 + 0.06 * noise(u, y, 4)), 1]; },
    [ROW.euro]: (u, y) => {
      const x = mod(u, 256), k = 0.9 + 0.1 * noise(u, y, 12);
      if (x < 14) return [(Math.abs(x - 7) < 1.5 ? 0.78 : 0.96) * k, 1]; // the post, grooved
      if (y >= 200) return [0.95 * k, y > 215 || mod(x - 14, 22) < 9 || (y < 204) ? 1 : 0]; // the open top: balusters under a rail
      const py = mod(y - 16, 46), c = Math.floor(py / 15.33), bx = mod(x - 14 + (c & 1) * 20, 40.33);
      return [(py < 1.5 ? 0.7 : mod(py, 15.33) < 1.3 || bx < 1.4 ? 0.76 : mod(py, 15.33) > 13 ? 1 : 0.9) * k, 1];
    },
    [ROW.mesh]: (u, y) => { const x = mod(u, 256), post = x < 5, wire = y > 218 || Math.abs(y - 38) < 1.2 || mod(u + y, 10) < 1.7 || mod(u - y, 10) < 1.7; return [post ? 0.7 : 0.95, post || (wire && y > 30) ? 1 : 0]; },
    [ROW.slab]: (u, y) => {
      const x = mod(u, 256), k = 0.85 + 0.15 * noise(u, y, 20) - (hash(u, y) < 0.03 ? 0.08 : 0);
      if (x < 7 || x > 249 || y > 214 || y < 44) return [0.9 * k, 1];
      const cx = mod(x - 7, 60.5) / 60.5 - 0.5, cy = mod(y - 44, 56.7) / 56.7 - 0.5; // pyramids: lit from above
      return [(Math.abs(cx) > Math.abs(cy) ? (cx < 0 ? 0.88 : 0.8) : cy > 0 ? 1 : 0.7) * k, 1];
    },
    [ROW.bars]: (u, y) => { const x = mod(u, 256), post = x < 7, rail = Math.abs(y - 48) < 3 || Math.abs(y - 206) < 3, bar = mod(u, 12.8) < 2.3 && y > 34; return [post || rail ? 0.82 : 1, post || rail || bar ? 1 : 0]; },
    [ROW.hedge]: (u, y) => [0.55 + 0.3 * noise(u, y, 6) + 0.15 * noise(u, y, 2), y > 196 + 26 * noise(u, 0, 16) ? 0 : 1],
    [ROW.gate]: leaf(true),
    [ROW.forged]: (u, y) => {
      const x = mod(u, 16), rail = Math.abs(y - 52) < 2.5 || Math.abs(y - 196) < 2.5, bar = x < 2.4 && y > 34 && y < 216 + (x < 1.2 ? 8 : 0);
      const r = Math.hypot(mod(u, 32) - 17.2, y - 124), ring = Math.abs(r - 10) < 1.3, tip = y > 204 && Math.abs(x - 1.2) < (224 - y) / 5;
      return [1, rail || bar || ring || tip ? 1 : 0];
    },
    [ROW.oldgate]: leaf(false),
  };
  for (let r = 0; r < ROWS; r++) {
    const f = rows[r];
    for (let py = 0; py < RH; py++) {
      const y = Math.min(BAND - 1, Math.max(0, py - PAD)), o = (r * RH + py) * AW * 4;
      for (let u = 0; u < AW; u++) {
        const [g, al] = f ? f(u, y) : [0.5, 1], v = Math.max(0, Math.min(255, Math.round(255 * g ** (1 / 2.2) * 1.0)));
        data[o + 4 * u] = v; data[o + 4 * u + 1] = v; data[o + 4 * u + 2] = v; data[o + 4 * u + 3] = al ? 255 : 0;
      }
    }
  }
  return { data, width: AW, height: AH, mips: atlasMips(data) };
}
// The mip chain below the atlas, with each row's see-through share kept: plain averaged mips fade a sparse pattern
// (bars, mesh, forged) under the alpha test's 0.5, so the infill would vanish a few dozen metres away while its wall
// still stops the car. Colour is averaged by alpha; a level's alpha is the average scaled, per row, so that as many
// texels pass the test as at full size. Rows with no holes stay opaque. -> [{ data, width, height }] for levels 1..12
function atlasMips(data) {
  const cover = new Float32Array(AH / RH);
  for (let r = 0; r < cover.length; r++) { let n = 0; for (let i = r * RH * AW * 4 + 3, e = (r + 1) * RH * AW * 4; i < e; i += 4) if (data[i] >= 128) n++; cover[r] = n / (RH * AW); }
  const out = [];
  let w = AW, h = AH, rgb = data, al = new Float32Array(AW * AH);
  for (let i = 0; i < al.length; i++) al[i] = data[4 * i + 3] / 255;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), d = new Uint8Array(nw * nh * 4), na = new Float32Array(nw * nh), sx = w > 1 ? 2 : 1, sy = h > 1 ? 2 : 1;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, ws = 0, as = 0, pr = 0, pg = 0, pb = 0;
      for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
        const k = (y * sy + j) * w + x * sx + i, q = al[k];
        r += rgb[4 * k] * q; g += rgb[4 * k + 1] * q; b += rgb[4 * k + 2] * q; ws += q; as += q; pr += rgb[4 * k]; pg += rgb[4 * k + 1]; pb += rgb[4 * k + 2];
      }
      const o = (y * nw + x) * 4, m = sx * sy;
      if (ws > 1e-4) { d[o] = r / ws; d[o + 1] = g / ws; d[o + 2] = b / ws; } else { d[o] = pr / m; d[o + 1] = pg / m; d[o + 2] = pb / m; }
      na[y * nw + x] = as / m;
    }
    const bh = (RH * nh) / AH; // a row's height at this level
    for (let r = 0; r < cover.length; r++) {
      const y0 = Math.floor(r * bh), y1 = Math.max(y0 + 1, Math.floor((r + 1) * bh));
      if (y0 >= nh) break;
      let k = 1;
      if (cover[r] < 0.999 && bh >= 1) { // the alpha that leaves the row's share of texels over the test
        const v = na.slice(y0 * nw, Math.min(nh, y1) * nw).sort(), t = v[Math.min(v.length - 1, Math.max(0, Math.round(v.length * (1 - cover[r]))))];
        k = Math.min(25, Math.max(1, 0.5 / Math.max(t, 1e-3)));
      } else if (cover[r] >= 0.999) k = 4;
      for (let i = y0 * nw, e = Math.min(nh, y1) * nw; i < e; i++) d[4 * i + 3] = Math.min(255, Math.round(na[i] * k * 255));
    }
    out.push({ data: d, width: nw, height: nh });
    w = nw; h = nh; rgb = d; al = na;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- as a worker
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  let F = null;
  self.onmessage = async (e) => {
    try {
      if (e.data.url) {
        const t0 = performance.now();
        F = parseFences(await (await fetch(e.data.url)).json());
        const samples = samplePoints(F), atlas = makeFenceAtlas();
        self.postMessage({ samples, n: F.n, atlas, loadMs: Math.round(performance.now() - t0) }, [samples.buffer, atlas.data.buffer, ...atlas.mips.map((m) => m.data.buffer)]);
      } else if (e.data.hf) {
        const res = buildFenceChunks(F, gridHeight(e.data.hf), e.data.dead);
        const transfer = [res.solids.buffer];
        for (const c of res.chunks) transfer.push(c.position.buffer, c.normal.buffer, c.uv.buffer, c.color.buffer, c.index.buffer);
        self.postMessage(res, transfer);
        self.close();
      }
    } catch (err) { self.postMessage({ error: String(err?.stack || err) }); }
  };
}
