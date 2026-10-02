// OWNER: cherkasy. The railway network of map.json `rails` (OSM railway=rail / light_rail / narrow_gauge centre lines,
// 72 km, ~1300 nodes; before this module nothing drew them): a ballast bed with sloped shoulders, two steel rails on
// it, painted sleepers on the open line and real (instanced) concrete sleepers in the station yard, level crossings
// where a motor road crosses (the bed stops, rubber panels between the rails, the rails drop flush; St Andrew's cross
// signs and a pair of red warning lamps on main lines), plain girder decks on the short rail bridges, and the 25 kV
// overhead line on the electrified main tracks (Cherkasy – Taras Shevchenko, energised in January 2023): concrete
// masts with steel cantilevers every ~55 m and the contact wire + sagging messenger wire. Used by station.js.
//
//   railLines(map, geo) -> [{ pts: [[x, z], ...], sv, br, wired, len, cum: [distance at each point] }]
//     sv: service track (yard, siding, spur); br: bridge; wired: 25 kV contact line (main tracks west of the Dnipro
//     approach, minus the line towards Hrebinka that is still being electrified). The stretch that dam.js draws on its
//     own embankment is cut off.
//   along(line, s) -> { x, z, dx, dz }   the point and unit heading at distance s along a line
//   nearestRail(lines, x, z, skip?) -> distance to the closest track centre line (skip: a line to ignore)
//   buildRails({ root, map, heightAt, ground, solids, geo, railLevel? }, { yard: [x, z, r], skipMast?(x, z) }) -> { lines, clear(x, z), crossings, stats() }
//     railLevel(x, z) -> bed level | null: a hand-built stretch of line (railbridge.js, the raised line and its bridges)
//     that sets the bed there instead of the ground; its bridges are drawn there, not here
//     crossings: [{ x, z, main }] the level crossings (none where the road or the line is on a bridge)
//     clear: true within 3.5 m of a track (no generated trees on the line)
//     yard: the circle where sleepers are real geometry; skipMast: no catenary mast at that point (platforms, canopy)
// Heights: the bed follows heightAt (the station yard is levelled by station.js); a bridge runs straight between the
// heights at its ends. Nothing here collides: the bed is 0.3 m and a car simply rolls through it.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { canvasTex } from './sculpt.js';
import { rng } from './geo.js';
import { RAIL as DAM_RAIL } from './dam_data.js';

export const TRACK = { half: 0.76, bed: 0.3, foot: 0.13, top: 1.55, toe: 2.55, tie: 0.07, railH: 0.16, railW: 0.075 };
const STEP = 8, TILE = 512, SIDES = [1, -1];
// the wired main tracks stop at the Dnipro approach; these two start the line to Hrebinka (construction:electrified)
const NOT_WIRED = [[-2027.1, 820.8], [-3162.4, 915.3]];

// ------------------------------------------------------------------------------------------------ lines
export function railLines(map, geo) {
  const dam = geo ? DAM_RAIL.map(([la, lo]) => geo.toXZ(la, lo)) : [];
  const nearDam = (x, z) => dam.some((p, i) => i > 0 && segDist(x, z, dam[i - 1], p) < 6);
  const out = [];
  for (const r of map.rails ?? []) {
    let pts = [];
    const flush = () => { if (pts.length > 1) out.push(mkLine(pts, r)); pts = []; };
    for (let k = 0; k < r.p.length; k += 2) {
      const x = r.p[k], z = r.p[k + 1];
      if (dam.length && nearDam(x, z)) { flush(); continue; }
      pts.push([x, z]);
    }
    flush();
  }
  for (const L of out) {
    const [x0, z0] = L.pts[0];
    L.wired = !L.sv && !L.br && L.pts.every(([x]) => x < -1390) && !NOT_WIRED.some(([a, b]) => Math.hypot(a - x0, b - z0) < 0.5);
  }
  return out;
}
const gap = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
// every consecutive node pair of a polyline: fn(a, b, index of b)
const eachSeg = (P, fn) => { for (let k = 1; k < P.length; k++) fn(P[k - 1], P[k], k); };
// every cell of a size-`c` grid the box [x0, x1] x [z0, z1] touches: fn(i, j)
const eachCell = (x0, z0, x1, z1, c, fn) => {
  const i1 = Math.floor(x1 / c), j1 = Math.floor(z1 / c);
  for (let i = Math.floor(x0 / c); i <= i1; i++) for (let j = Math.floor(z0 / c); j <= j1; j++) fn(i, j);
};
function mkLine(pts, r) {
  let run = 0;
  const cum = pts.map((p, k) => (run += k ? gap(pts[k - 1], p) : 0));
  return { pts, sv: r.sv, br: r.br, len: run, cum };
}
export function along(L, s) {
  const { pts, cum } = L, at = s < 0 ? 0 : s > L.len ? L.len : s;
  let k = cum.findIndex((c, j) => j > 0 && c >= at);
  if (k < 1) k = pts.length - 1;
  const a = pts[k - 1], b = pts[k], seg = cum[k] - cum[k - 1] || 1, f = (at - cum[k - 1]) / seg;
  const ux = (b[0] - a[0]) / seg, uz = (b[1] - a[1]) / seg;
  return { x: a[0] + ux * seg * f, z: a[1] + uz * seg * f, dx: ux, dz: uz };
}
function segDist(x, z, a, b) {
  const ux = b[0] - a[0], uz = b[1] - a[1], wx = x - a[0], wz = z - a[1], len2 = ux * ux + uz * uz;
  let f = len2 > 0 ? (wx * ux + wz * uz) / len2 : 0;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  return Math.hypot(wx - ux * f, wz - uz * f);
}
export function nearestRail(lines, x, z, skip = null) {
  let near = Infinity;
  for (const L of lines) {
    if (L !== skip) eachSeg(L.pts, (a, b) => {
      const far = x < Math.min(a[0], b[0]) - near || x > Math.max(a[0], b[0]) + near || z < Math.min(a[1], b[1]) - near || z > Math.max(a[1], b[1]) + near;
      if (!far) near = Math.min(near, segDist(x, z, a, b));
    });
  }
  return near;
}

// ------------------------------------------------------------------------------------------------ strips
// indexed ribbons: every section is a row of vertices; consecutive sections of one run are joined by quads between
// the listed vertex pairs. One builder per tile (and material), so the network culls by tile.
const WHITE = [1, 1, 1];
class Strip {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.prev = -1; }
  get n() { return this.pos.length / 3; }
  // row: [[x, y, z, nx, ny, nz, u, v, rgb?], ...]; links: [[a, b, up?], ...] quads between row[a]-row[b] of the last and this row
  row(R, links, join = true) {
    const base = this.n;
    R.forEach((q) => {
      this.pos.push(q[0], q[1], q[2]); this.nrm.push(q[3], q[4], q[5]); this.uv.push(q[6], q[7]);
      const c = q[8] ?? WHITE; this.col.push(c[0], c[1], c[2]);
    });
    if (join && this.prev >= 0) {
      const p = this.prev;
      for (const [a, b] of links) {
        const i0 = p + a, i1 = p + b, j0 = base + a, j1 = base + b;
        // winding: the quad's geometric normal must agree with the stored vertex normal
        const P = this.pos, N = this.nrm;
        const ux = P[3 * i1] - P[3 * i0], uy = P[3 * i1 + 1] - P[3 * i0 + 1], uz = P[3 * i1 + 2] - P[3 * i0 + 2];
        const vx = P[3 * j0] - P[3 * i0], vy = P[3 * j0 + 1] - P[3 * i0 + 1], vz = P[3 * j0 + 2] - P[3 * i0 + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (cx * N[3 * i0] + cy * N[3 * i0 + 1] + cz * N[3 * i0 + 2] > 0) this.idx.push(i0, i1, j0, i1, j1, j0);
        else this.idx.push(i0, j0, i1, i1, j0, j1);
      }
    }
    this.prev = base;
  }
  cut() { this.prev = -1; }
  geometry() {
    if (!this.idx.length) return null;
    const out = new THREE.BufferGeometry();
    for (const [name, data, size] of [['position', this.pos, 3], ['normal', this.nrm, 3], ['uv', this.uv, 2], ['color', this.col, 3]]) {
      out.setAttribute(name, new THREE.BufferAttribute(Float32Array.from(data), size));
    }
    out.setIndex(this.idx); // three picks 16 / 32-bit from the largest index
    out.computeBoundingSphere();
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ textures
// ballast, 5.2 m across x 2.4 m along per repeat: grey-brown granite chippings, rust along the rails, and (open line)
// four concrete sleepers
const ballastTex = (sleepers) => canvasTex(256, 256, (g, w, h) => {
  const r = rng(sleepers ? 71 : 72);
  g.fillStyle = '#6f6860'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = 70 + r() * 90, t = r() * 14;
    g.fillStyle = `rgb(${(v + t) | 0},${(v + t * 0.5) | 0},${v | 0})`; g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  for (const u of [0.354, 0.646]) { g.fillStyle = 'rgba(96,58,32,0.35)'; g.fillRect(u * w - 9, 0, 18, h); }
  if (!sleepers) return;
  for (const y of [h / 8, 3 * h / 8, 5 * h / 8, 7 * h / 8].map((c) => c - 12)) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0.235 * w, y + 3, 0.53 * w, 24);
    g.fillStyle = '#8f8b84'; g.fillRect(0.24 * w, y, 0.52 * w, 22);
    g.fillStyle = '#a19d95'; g.fillRect(0.24 * w, y, 0.52 * w, 5);
    g.fillStyle = '#3b3632'; for (const u of [0.354, 0.646]) g.fillRect(u * w - 5, y + 2, 10, 18); // fastenings
  }
});

// ------------------------------------------------------------------------------------------------ build
export function buildRails({ root, map, heightAt, ground, solids, geo, railLevel = null }, { yard = null, skipMast = null } = {}) {
  const t0 = performance.now();
  const lines = railLines(map, geo);
  const H0 = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const H = railLevel ? (x, z) => railLevel(x, z) ?? H0(x, z) : H0; // the bed level: a hand-built stretch, or the ground
  const inYard = (x, z) => !!yard && Math.hypot(x - yard[0], z - yard[1]) < yard[2];
  const group = Object.assign(new THREE.Group(), { name: 'railways' });
  root.add(group);

  // motor roads by 64 m cell, for the level crossings
  const C = 64, cells = new Map(), key = (i, j) => i * 100003 + j;
  for (const r of map.roads ?? []) {
    if ((r.k !== 'm' && r.k !== 'd') || r.br) continue; // a road on a bridge passes over the line, not across it
    const hw = (r.w ?? 6) / 2, main = r.k === 'm' && r.c !== 'service';
    for (let k = 2; k < r.p.length; k += 2) {
      const seg = { ax: r.p[k - 2], az: r.p[k - 1], bx: r.p[k], bz: r.p[k + 1], hw, main };
      eachCell(Math.min(seg.ax, seg.bx), Math.min(seg.az, seg.bz), Math.max(seg.ax, seg.bx), Math.max(seg.az, seg.bz), C, (i, j) => {
        const k2 = key(i, j); if (!cells.has(k2)) cells.set(k2, []); cells.get(k2).push(seg);
      });
    }
  }
  // crossings of one line: [{ s0, s1, s, x, z, road: {dx, dz}, main }] along its distance
  const crossingsOf = (L) => {
    const out = [], seen = new Set();
    eachSeg(L.pts, ([ax, az], [bx, bz], i) => {
      const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez);
      eachCell(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), C, (ci, cj) => {
          for (const q of cells.get(key(ci, cj)) ?? []) {
            if (seen.has(q)) continue;
            const fx = q.bx - q.ax, fz = q.bz - q.az, den = ex * fz - ez * fx;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((q.ax - ax) * fz - (q.az - az) * fx) / den, u = ((q.ax - ax) * ez - (q.az - az) * ex) / den;
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            seen.add(q);
            const sin = Math.abs(den) / (len * Math.hypot(fx, fz)), half = Math.min(25, (q.hw + 1.2) / Math.max(0.35, sin));
            const s = L.cum[i - 1] + t * len, fl = Math.hypot(fx, fz);
            out.push({ s0: s - half, s1: s + half, s, x: ax + ex * t, z: az + ez * t, road: { dx: fx / fl, dz: fz / fl }, hw: q.hw, main: q.main });
          }
      });
    });
    return out.sort((a, b) => a.s0 - b.s0);
  };

  const strips = new Map();
  const stripOf = (k) => strips.get(k) ?? strips.set(k, new Strip()).get(k);
  const RAIL_SIDE = [0.36, 0.3, 0.27], RAIL_TOP = [0.62, 0.62, 0.64]; // linear: rusty web, bright worn head
  const ties = [], panels = new MB(), signs = new MB(), decks = new MB();
  const allCross = [];
  let samples = 0;

  for (const L of lines) {
    const cross = L.br ? [] : crossingsOf(L); // nor does a rail bridge cross the road under it
    const mid = along(L, L.len / 2), own = L.br && railLevel?.(mid.x, mid.z) != null; // a bridge railbridge.js builds
    allCross.push(...cross.map((c) => ({ ...c, L })));
    const inCross = (s) => cross.some((c) => s > c.s0 && s < c.s1);
    // sample distances: the polyline nodes, <= STEP apart, plus both sides of every crossing edge
    const S = new Set(L.cum.map((c) => +c.toFixed(3)));
    L.cum.forEach((b, i) => { if (!i) return; const a = L.cum[i - 1], parts = Math.ceil((b - a) / STEP); for (let q = 1; q < parts; q++) S.add(a + (b - a) * (q / parts)); });
    for (const c of cross) for (const s of [c.s0, c.s0 + 0.02, c.s1 - 0.02, c.s1]) if (s > 0 && s < L.len) S.add(s);
    const ss = Array.from(S).sort((p, q) => p - q);
    const yEnd0 = H(...L.pts[0]), yEnd1 = H(...L.pts[L.pts.length - 1]);
    let lastB = null, lastR = null, lastCross = -1;
    for (const s of ss) {
      const p = along(L, s);
      // heading from the neighbours 1 m either side, so the joints stay mitred
      const pa = along(L, Math.max(0, s - 1)), pb = along(L, Math.min(L.len, s + 1));
      let dx = pb.x - pa.x, dz = pb.z - pa.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const nx = -dz, nz = dx;
      const y = L.br && !own ? yEnd0 + (yEnd1 - yEnd0) * (s / L.len) : H(p.x, p.z);
      const cr = inCross(s) ? 2 : inCross(s + 0.01) || inCross(s - 0.01) ? 1 : 0; // 1: an edge, drawn with the open track
      const tile = Math.floor(p.x / TILE) + ',' + Math.floor(p.z / TILE);
      const kB = 'b' + (inYard(p.x, p.z) ? 'y' : 'o') + tile, kR = 'r' + tile;
      const v = s / 2.4;
      samples++;
      // ---- ballast bed (none inside a crossing)
      if (cr !== 2) {
        const T = TRACK, sh = T.bed - T.foot, run = T.toe - T.top, nl = Math.hypot(sh, run);
        const upN = [0, 1, 0], lN = [nx * sh / nl, run / nl, nz * sh / nl], rN = [-nx * sh / nl, run / nl, -nz * sh / nl];
        const P = (o, yy) => [p.x + nx * o, y + yy, p.z + nz * o], u = (o) => 0.5 - o / 5.2;
        const row = [
          [...P(T.toe, T.foot), ...lN, u(T.toe), v], [...P(T.top, T.bed), ...lN, u(T.top), v],
          [...P(T.top, T.bed), ...upN, u(T.top), v], [...P(-T.top, T.bed), ...upN, u(-T.top), v],
          [...P(-T.top, T.bed), ...rN, u(-T.top), v], [...P(-T.toe, T.foot), ...rN, u(-T.toe), v],
        ], links = [[0, 1], [2, 3], [4, 5]], join = lastCross !== 2 && lastB !== null;
        // a run that leaves its tile (or the yard) ends in the old builder and starts again in the new one
        if (join && lastB !== kB) stripOf(lastB).row(row, links, true);
        const B = stripOf(kB);
        if (lastB !== kB) B.cut();
        B.row(row, links, join && lastB === kB);
        lastB = kB;
      } else lastB = null;
      // ---- rails: outer side, head, inner side per rail; dropped flush with the panels inside a crossing
      const base = cr === 2 ? y + 0.03 : y + TRACK.bed + TRACK.tie, top = cr === 2 ? y + 0.1 : base + TRACK.railH;
      const R = [];
      for (const sg of SIDES) {
        const o = sg * TRACK.half, w = TRACK.railW / 2;
        const X = (d) => p.x + nx * (o + d), Z = (d) => p.z + nz * (o + d);
        const on = [nx * sg, 0, nz * sg], inn = [-nx * sg, 0, -nz * sg];
        R.push([X(sg * w), base, Z(sg * w), ...on, 0, v, RAIL_SIDE], [X(sg * w), top, Z(sg * w), ...on, 0, v, RAIL_SIDE],
          [X(sg * w), top, Z(sg * w), 0, 1, 0, 0, v, RAIL_TOP], [X(-sg * w), top, Z(-sg * w), 0, 1, 0, 0, v, RAIL_TOP],
          [X(-sg * w), top, Z(-sg * w), ...inn, 0, v, RAIL_SIDE], [X(-sg * w), base, Z(-sg * w), ...inn, 0, v, RAIL_SIDE]);
      }
      const rl = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]], rjoin = lastR !== null && (lastCross === 2) === (cr === 2);
      if (rjoin && lastR !== kR) stripOf(lastR).row(R, rl, true);
      const RS = stripOf(kR);
      if (lastR !== kR || !rjoin) RS.cut();
      RS.row(R, rl, rjoin && lastR === kR);
      lastR = kR; lastCross = cr;
    }
    // ---- yard sleepers: real concrete ties every 0.6 m
    for (let s = 0.3; s < L.len; s += 0.6) {
      const p = along(L, s);
      if (!inYard(p.x, p.z) || inCross(s)) continue;
      ties.push(p.x, H(p.x, p.z) + TRACK.bed + TRACK.tie / 2 - 0.02, p.z, Math.atan2(p.dx, p.dz));
    }
    // ---- bridges: a steel plate-girder deck under the track, abutments at the ends
    if (L.br && !own) {
      decks.setColor('#5d6368');
      eachSeg(L.pts, ([ax, az], [bx, bz], i) => {
        const l = gap([ax, az], [bx, bz]), nx = (az - bz) / l, nz = (bx - ax) / l, yOf = (c) => yEnd0 + (yEnd1 - yEnd0) * c / L.len;
        const ya = yOf(L.cum[i - 1]), yb = yOf(L.cum[i]);
        for (const sg of SIDES) {
          const o0 = sg * 1.6, o1 = sg * 1.9;
          const q = (o, t, yy) => [ax + (bx - ax) * t + nx * o, (t ? yb : ya) + yy, az + (bz - az) * t + nz * o];
          decks.face([q(o0, 0, -1.4), q(o0, 1, -1.4), q(o0, 1, 0.9), q(o0, 0, 0.9)]).face([q(o1, 0, -1.4), q(o1, 1, -1.4), q(o1, 1, 0.9), q(o1, 0, 0.9)]);
          decks.face([q(o0, 0, 0.9), q(o0, 1, 0.9), q(o1, 1, 0.9), q(o1, 0, 0.9)], [0, 1, 0]);
        }
        decks.face([[ax + nx * 1.9, ya + 0.12, az + nz * 1.9], [bx + nx * 1.9, yb + 0.12, bz + nz * 1.9], [bx - nx * 1.9, yb + 0.12, bz - nz * 1.9], [ax - nx * 1.9, ya + 0.12, az - nz * 1.9]], [0, 1, 0]);
      });
    }
  }

  // ---- level crossings: rubber panels between and beside the rails; St Andrew's crosses at the motor-road ones
  const done = [];
  for (const c of allCross) {
    const p = along(c.L, c.s), nx = -p.dz, nz = p.dx, y = H(c.x, c.z);
    const len = c.s1 - c.s0 - 0.6;
    panels.setColor('#2e2f31');
    for (const [o0, o1] of [[-1.35, -0.82], [-0.7, 0.7], [0.82, 1.35]]) {
      const q = (o, t) => [c.x + nx * o + p.dx * t, y + 0.09, c.z + nz * o + p.dz * t];
      panels.face([q(o0, -len / 2), q(o1, -len / 2), q(o1, len / 2), q(o0, len / 2)], [0, 1, 0]);
    }
    if (!c.main) continue;
    if (done.find((q) => gap(q, [c.x, c.z]) < 30)) continue; // one pair of signs per crossing
    done.push([c.x, c.z]);
    const sin = Math.max(0.35, Math.abs(p.dx * c.road.dz - p.dz * c.road.dx)), back = 3.4 / sin + 2.5;
    for (const sg of SIDES) {
      const rx = c.road.dx * sg, rz = c.road.dz * sg; // the approach heading, towards the tracks
      const ox = c.x - rx * back - rz * (c.hw + 1.1), oz = c.z - rz * back + rx * (c.hw + 1.1); // on the driver's right
      if (ground.onAsphalt?.(ox, oz)) continue;
      const yy = H(ox, oz);
      signs.setColor('#e8e8e4'); signs.cyl(ox, yy, oz, 0.05, 0.05, 2.9, 6);
      signs.with(new THREE.Matrix4().makeTranslation(ox, yy + 2.55, oz).multiply(new THREE.Matrix4().makeRotationY(Math.atan2(rx, rz))), (M) => {
        for (const a of [0.7, -0.7]) {
          M.with(new THREE.Matrix4().makeRotationZ(a), (Q) => {
            Q.setColor('#c8242a'); Q.box(-0.62, -0.1, -0.1, 0.62, 0.1, -0.07);
            Q.setColor('#f2f1ec'); Q.box(-0.58, -0.065, -0.13, 0.58, 0.065, -0.1);
          });
        }
        if (!c.L.sv) { // main line: a black board with two red lamps under the cross
          M.setColor('#1c1d1f'); M.box(-0.45, -1.1, -0.1, 0.45, -0.72, -0.04);
          M.setColor('#7d1712'); for (const lx of [-0.24, 0.24]) M.box(lx - 0.11, -1.02, -0.16, lx + 0.11, -0.8, -0.1);
        }
      });
    }
  }

  // ---- 25 kV overhead line on the wired main tracks
  const cat = new MB(), wire = [];
  let masts = 0;
  for (const L of lines) {
    if (!L.wired) continue;
    const spans = Math.max(1, Math.round(L.len / 55)), step = L.len / spans;
    let held = null; // the previous support: contact wire point
    for (let k = 0; k <= spans; k++) {
      const s = k * step, p = along(L, s), nx = -p.dz, nz = p.dx, y = H(p.x, p.z), yw = y + TRACK.bed + TRACK.tie + TRACK.railH + 6.0;
      // the mast on the side with room (clear of other tracks and of the platforms)
      let side = 0;
      for (const sg of SIDES) {
        const mx = p.x + nx * sg * 3.1, mz = p.z + nz * sg * 3.1;
        if (skipMast?.(mx, mz) || ground.onAsphalt?.(mx, mz)) continue;
        const d = nearestRail(lines, mx, mz, L);
        if (d > 2.6 && (!side || d > side.d)) side = { sg, d, mx, mz };
      }
      if (side) {
        const { sg, mx, mz } = side, my = H(mx, mz);
        cat.setColor('#9c9a94'); cat.cyl(mx, my - 0.3, mz, 0.2, 0.13, 10.1, 8);
        solids?.cyl(mx, mz, my - 0.3, my + 9.8, 0.2, 0.13, 'pole');
        cat.setColor('#6e7479');
        cat.tube([mx - nx * sg * 0.15, yw + 1.5, mz - nz * sg * 0.15], [p.x - nx * sg * 0.2, yw + 1.5, p.z - nz * sg * 0.2], 0.045, 5); // top tube
        cat.tube([mx - nx * sg * 0.15, yw + 0.1, mz - nz * sg * 0.15], [p.x - nx * sg * 0.2, yw + 1.45, p.z - nz * sg * 0.2], 0.04, 5); // stay
        cat.tube([p.x - nx * sg * 0.9, yw + 0.55, p.z - nz * sg * 0.9], [p.x + nx * sg * 0.25, yw + 0.02, p.z + nz * sg * 0.25], 0.025, 4); // register arm
        cat.setColor('#7a4a2c');
        for (const yy of [yw + 1.5, yw + 0.1]) cat.cyl(mx - nx * sg * 0.35, yy - 0.06, mz - nz * sg * 0.35, 0.07, 0.07, 0.12, 6); // insulators
        masts++;
      }
      const cw = [p.x, yw, p.z];
      if (held) {
        wire.push(...held, ...cw);
        // the messenger hangs 1.45 m over the contact wire at the supports and sags 1.1 m mid-span; droppers between
        const lerp = (t, j) => held[j] + (cw[j] - held[j]) * t, mess = (t) => [lerp(t, 0), lerp(t, 1) + 1.45 - 4.4 * t * (1 - t), lerp(t, 2)];
        const ts = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1];
        ts.slice(1).forEach((t, j) => {
          wire.push(...mess(ts[j]), ...mess(t));
          if (t < 1) { const m = mess(t); wire.push(...m, m[0], lerp(t, 1), m[2]); }
        });
      }
      held = cw;
    }
  }

  // ---- meshes
  const mats = {
    open: new THREE.MeshStandardMaterial({ map: ballastTex(true), vertexColors: true, roughness: 0.95 }),
    yard: new THREE.MeshStandardMaterial({ map: ballastTex(false), vertexColors: true, roughness: 0.95 }),
    rail: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.38 }),
    det: new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.6, vertexColors: true }),
  };
  let nV = 0;
  for (const [k, st] of strips) {
    const g = st.geometry();
    if (!g) continue;
    nV += st.n;
    const mat = k[0] === 'r' ? mats.rail : k[1] === 'y' ? mats.yard : mats.open;
    const mesh = Object.assign(new THREE.Mesh(g, mat), { name: `rails-${k}`, receiveShadow: true, castShadow: false, matrixAutoUpdate: false });
    mesh.updateMatrix(); group.add(mesh);
  }
  for (const [B, mat, name, shadow] of [[panels, mats.det, 'crossings', false], [signs, mats.det, 'crossing-signs', true],
    [decks, mats.det, 'rail-bridges', true], [cat, mats.det, 'catenary', true]]) {
    if (!B.v) continue;
    nV += B.v;
    group.add(Object.assign(new THREE.Mesh(B.build(), mat), { name, castShadow: shadow, receiveShadow: true }));
  }
  if (wire.length) {
    const wg = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(Float32Array.from(wire), 3));
    group.add(Object.assign(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2623 })), { name: 'contact-wire' }));
  }
  const nTies = ties.length / 4;
  if (nTies) {
    const tie = new THREE.InstancedMesh(new THREE.BoxGeometry(2.7, TRACK.tie + 0.04, 0.26), new THREE.MeshStandardMaterial({ color: 0x8e8a83, roughness: 0.9 }), nTies);
    // box x across the track: a yaw turns its local z onto the heading
    const place = new THREE.Object3D();
    for (let i = 0, o = 0; i < nTies; i++, o += 4) {
      place.position.set(ties[o], ties[o + 1], ties[o + 2]); place.rotation.set(0, ties[o + 3], 0); place.updateMatrix();
      tie.setMatrixAt(i, place.matrix);
    }
    tie.name = 'sleepers'; tie.receiveShadow = true;
    tie.computeBoundingSphere();
    group.add(tie);
  }
  const km = lines.reduce((a, L) => a + L.len, 0) / 1000;
  console.log(`[cherkasy] railways: ${lines.length} lines, ${km.toFixed(1)} km, ${samples} sections, ${allCross.length} crossings (${done.length} signed), ${masts} masts, ${nTies} sleepers, ${(nV / 1000).toFixed(0)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);
  // track segments by 32 m cell: generated trees keep 3.5 m off every centre line
  const G = 32, segs = new Map();
  for (const L of lines) eachSeg(L.pts, (a, b) => eachCell(Math.min(a[0], b[0]) - 4, Math.min(a[1], b[1]) - 4, Math.max(a[0], b[0]) + 4, Math.max(a[1], b[1]) + 4, G, (i, j) => {
    const k = key(i, j); if (!segs.has(k)) segs.set(k, []); segs.get(k).push(a, b);
  }));
  const clear = (x, z) => {
    const s = segs.get(key(Math.floor(x / G), Math.floor(z / G)));
    if (s) for (let i = 0; i < s.length; i += 2) if (segDist(x, z, s[i], s[i + 1]) < 3.5) return true;
    return false;
  };
  return {
    lines, clear,
    crossings: allCross.map((c) => ({ x: c.x, z: c.z, main: c.main })),
    stats: () => ({ lines: lines.length, km, crossings: allCross.length, masts, sleepers: nTies, verts: nV }),
  };
}
