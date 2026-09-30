// Static collision world: solids registered once at city load, indexed in a uniform XZ grid, queried every frame.
//
// createCollisionWorld({ cell = 24, terrain, hintTol = 0.05, walkSlope = 0.6 }) -> cw
//   walkSlope: steepest top plane (rise / run, 0.6 ~ 31 deg) a body may drive up; gentler sloped prisms are judged by
//   the lowest part of their plane under the body, so a ramp is ground, not a wall.
//   terrain: fn(x, z) -> y, or { height(x, z), surface?(x, z), minY?, maxY? }; default: flat y = 0. Non-finite
//   terrain heights fall back to terrain.fallback (default 0), so ground queries never return NaN.
//   Registration (each returns a solid id >= 0, or -1 for degenerate input; kind is a free tag string):
//     box(x0, y0, z0, x1, y1, z1, kind?, flags?)                  axis-aligned box
//     obox(cx, cz, hx, hz, ang, y0, y1, kind?, flags?)             oriented box; local +x -> (cos ang, sin ang)
//     cyl(x, z, y0, y1, r0, r1 = r0, kind?, flags?)                vertical cylinder / frustum (r0 at y0, r1 at y1)
//     prism(pts, y0, a, bx = 0, bz = 0, kind?, flags?, holes?)     vertical prism over a footprint ([x,z,..] or
//         [[x,z],..], any winding, concave allowed, holes = array of rings). Top: flat y = a, or the plane
//         y = a + bx*x + bz*z when bx/bz != 0. Concave / holed footprints are split into convex pieces that share
//         one group: the returned id is the group head, and disable(id) switches the whole group.
//   Flags: OVERHANG (not a default support when a ground query has no height hint; rays / bodies still see it).
//   disable(id) / enable(id) / isEnabled(id)  runtime switch (a snapped tree trunk); takes effect immediately
//   finalize()   builds the grid; also done lazily by the first query after a registration
//   Queries (all skip disabled solids):
//     raycast(origin, dir, max = 1e4, out?, solidsOnly?) -> { distance, point{x,y,z}, normal{x,y,z}, id, kind } | null
//         dir need not be normalized (it is normalized here; distance is in metres). A zero dir -> null. A ray that
//         starts inside a solid ignores that solid (and its group); one that starts under the terrain ignores it.
//     groundHeight(x, z, yHint?)   highest support at or below yHint (+hintTol): terrain or a solid top. Without a
//                                  hint: terrain or the highest non-OVERHANG top. Always finite. cw.groundId then
//                                  holds the supporting solid (-1 = terrain); slopeOf(id, out?) its top gradient.
//     topAt(x, z, yMax = Inf, out?) -> { id, y }  highest solid top <= yMax; id -1 and y = -Infinity when none
//     surfaceAt(x, z, yHint?) -> { y, id, kind, surface }  (surface: terrain.surface(x, z) when on terrain)
//     ceilingAt(x, z, y) -> lowest solid underside at or above y (Infinity if none)
//     inside(x, y, z) -> bool;  solidAt(x, y, z) -> id | -1
//     query(x0, z0, x1, z1, cb(id)) -> count   enabled solids whose bounds touch the rectangle (do not nest calls)
//     pushCylinder(p, r, h, step, out?) -> out | null   vertical body (feet p.y, height h, radius r) moved out
//         horizontally; solids whose top is within `step` of the feet are ignored (kerbs). p is mutated.
//         out: { hit, dx, dz, nx, nz, depth, id }
//     pushSphere(p, r, out?) -> out | null   p mutated; out: { hit, dx, dy, dz, nx, ny, nz, depth, id }
//     pushBox(b, out?) -> out | null   yaw-oriented box b = { x, y (bottom), z, yaw, hl, hw, h, step, vertical }
//         (forward = (sin yaw, cos yaw), hl / hw half length / width). b.x / b.y / b.z mutated. With b.vertical
//         a shallow vertical overlap is resolved up (landing on a top) or down (under an overhang) instead.
//         out: { hit, dx, dy, dz, nx, ny, nz, depth, id }
//   Introspection: count, typeOf(id), kindOf(id), flagsOf(id), bounds(id, out?), groupOf(id), version (bumps on
//   every registration / disable), terrainHeight(x, z), setTerrain(t).
// createWorldQueries(cw, terrain?) -> { raycast, groundHeight, surfaceAt, topAt, inside, query, collision: cw }
// createCollisionDebug(parent, cw, { radius = 140, moveStep = 25, maxSolids = 6000 }) -> { update(camera | pos),
//   enabled (get / set), dispose() }: wire outlines of nearby solids, rebuilt only after the camera moved moveStep m
// convexPieces(pts, holes?) -> [{ pts: [x, z, ...] (CCW), inner: Uint8Array (1 = edge shared with another piece) }]
import * as THREE from 'three';

export const OVERHANG = 1;
const OFF = 2; // disabled
export const BOX = 0, CYL = 1, PRISM = 2;
const NONE = -1;

const CORN = [1, 1, 1, -1, -1, 1, -1, -1, 0, 0]; // box corners + centre (sign along forward, right)
const grow = (a, len) => { const b = new a.constructor(len); b.set(a); return b; };

export function createCollisionWorld({ cell = 24, terrain = null, hintTol = 0.05, walkSlope = 0.6 } = {}) {
  let n = 0, cap = 256, nv = 0, vcap = 1024;
  let type = new Uint8Array(cap), flag = new Uint8Array(cap), kix = new Uint8Array(cap), grp = new Int32Array(cap);
  let bb = new Float64Array(cap * 6), par = new Float64Array(cap * 4), vref = new Int32Array(cap * 2);
  let stamp = new Uint32Array(cap), gmark = new Uint32Array(cap);
  // prism vertices (x, z) and per-edge data (edge i runs from vertex i to the next vertex of the same prism):
  // outward normal nx, nz, offset d = n.v, polygon width along n; inner = 1 on edges shared with a sibling piece
  let vx = new Float64Array(vcap * 2), ed = new Float64Array(vcap * 4), inner = new Uint8Array(vcap);
  const kinds = [], kindMap = new Map();
  let T = null, TH = null, tfb = 0, version = 0, dirty = true, tick = 1;
  // grid (CSR): cells [gx0, gx0 + nx*C) x [gz0, gz0 + nz*C)
  let C = cell, gx0 = 0, gz0 = 0, gnx = 0, gnz = 0, cstart = new Int32Array(1), items = new Int32Array(0);
  let cand = new Int32Array(256);

  function setTerrain(t) {
    T = typeof t === 'function' ? { height: t } : t || null;
    TH = T?.height || null; tfb = T?.fallback ?? 0;
  }
  setTerrain(terrain);
  const terrainHeight = (x, z) => { if (!TH) return 0; const y = TH(x, z); return Number.isFinite(y) ? y : tfb; };

  function reserve(k) {
    if (n + k <= cap) return;
    let c = cap; while (c < n + k) c *= 2;
    type = grow(type, c); flag = grow(flag, c); kix = grow(kix, c); grp = grow(grp, c);
    bb = grow(bb, c * 6); par = grow(par, c * 4); vref = grow(vref, c * 2);
    stamp = grow(stamp, c); gmark = grow(gmark, c); cap = c;
  }
  function reserveV(k) {
    if (nv + k <= vcap) return;
    let c = vcap; while (c < nv + k) c *= 2;
    vx = grow(vx, c * 2); ed = grow(ed, c * 4); inner = grow(inner, c); vcap = c;
  }
  function kindId(k) {
    k = k == null ? 'solid' : String(k);
    let i = kindMap.get(k);
    if (i === undefined) { i = kinds.length; if (i > 255) i = 255; else { kinds.push(k); kindMap.set(k, i); } }
    return i;
  }
  const fin = (...a) => { for (const v of a) if (!Number.isFinite(v)) return false; return true; };
  function alloc(t, kind, flags, x0, y0, z0, x1, y1, z1) {
    reserve(1);
    const id = n++, j = id * 6;
    type[id] = t; flag[id] = flags & OVERHANG; kix[id] = kindId(kind); grp[id] = id;
    bb[j] = x0; bb[j + 1] = y0; bb[j + 2] = z0; bb[j + 3] = x1; bb[j + 4] = y1; bb[j + 5] = z1;
    dirty = true; version++;
    return id;
  }

  // ------------------------------------------------------------------------------------------- registration
  function box(x0, y0, z0, x1, y1, z1, kind = 'wall', flags = 0) {
    if (!fin(x0, y0, z0, x1, y1, z1)) return NONE;
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return NONE;
    return alloc(BOX, kind, flags, x0, y0, z0, x1, y1, z1);
  }
  function cyl(x, z, y0, y1, r0, r1 = r0, kind = 'pole', flags = 0) {
    if (!fin(x, z, y0, y1, r0, r1) || y1 - y0 < 1e-4 || r0 < 0 || r1 < 0 || Math.max(r0, r1) < 1e-3) return NONE;
    const R = Math.max(r0, r1), id = alloc(CYL, kind, flags, x - R, y0, z - R, x + R, y1, z + R), k = id * 4;
    par[k] = x; par[k + 1] = z; par[k + 2] = r0; par[k + 3] = r1;
    return id;
  }
  function obox(cx, cz, hx, hz, ang, y0, y1, kind = 'wall', flags = 0) {
    if (!fin(cx, cz, hx, hz, ang) || hx <= 0 || hz <= 0) return NONE;
    const c = Math.cos(ang), s = Math.sin(ang), P = [];
    for (const [a, b] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) P.push(cx + a * c - b * s, cz + a * s + b * c);
    return prism(P, y0, y1, 0, 0, kind, flags);
  }
  function prism(pts, y0, a, bx = 0, bz = 0, kind = 'wall', flags = 0, holes = null) {
    bx = bx || 0; bz = bz || 0;
    if (!fin(y0, a, bx, bz)) return NONE;
    const P = cleanRing(pts);
    if (!P) return NONE;
    const H = holes?.length ? holes.map(cleanRing).filter(Boolean) : null;
    if (!H?.length && convex(P)) return piece(P, null, y0, a, bx, bz, kind, flags);
    let head = NONE;
    for (const pc of convexPieces(P, H)) {
      const id = piece(pc.pts, pc.inner, y0, a, bx, bz, kind, flags);
      if (id < 0) continue;
      if (head < 0) head = id; else grp[id] = head;
    }
    return head;
  }
  function piece(P, inn, y0, a, bx, bz, kind, flags) {
    const m = P.length >> 1;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, top = -Infinity;
    for (let i = 0; i < m; i++) {
      const x = P[2 * i], z = P[2 * i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      const t = a + bx * x + bz * z; if (t > top) top = t;
    }
    if (top - y0 < 1e-4 || area2(P) < 1e-6) return NONE;
    reserveV(m);
    const id = alloc(PRISM, kind, flags, x0, y0, z0, x1, top, z1), k = id * 4, s = nv;
    par[k] = a; par[k + 1] = bx; par[k + 2] = bz;
    vref[id * 2] = s; vref[id * 2 + 1] = m;
    for (let i = 0; i < m; i++) { vx[2 * (s + i)] = P[2 * i]; vx[2 * (s + i) + 1] = P[2 * i + 1]; inner[s + i] = inn ? inn[i] : 0; }
    for (let i = 0; i < m; i++) {
      const ax = P[2 * i], az = P[2 * i + 1], j = (i + 1) % m, ex = P[2 * j] - ax, ez = P[2 * j + 1] - az;
      const L = Math.hypot(ex, ez) || 1, nx = ez / L, nz = -ex / L, d = nx * ax + nz * az;
      let lo = Infinity; for (let q = 0; q < m; q++) lo = Math.min(lo, nx * P[2 * q] + nz * P[2 * q + 1]);
      const e = (s + i) * 4; ed[e] = nx; ed[e + 1] = nz; ed[e + 2] = d; ed[e + 3] = d - lo;
    }
    nv += m;
    return id;
  }

  function disable(id) { setOff(id, true); }
  function enable(id) { setOff(id, false); }
  function setOff(id, off) {
    if (!(id >= 0 && id < n)) return;
    const g = grp[id];
    for (let i = g; i < n && (i === g || grp[i] === g); i++) flag[i] = off ? flag[i] | OFF : flag[i] & ~OFF;
    version++;
  }

  // ------------------------------------------------------------------------------------------- grid
  function finalize() {
    dirty = false;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { const j = i * 6; x0 = Math.min(x0, bb[j]); z0 = Math.min(z0, bb[j + 2]); x1 = Math.max(x1, bb[j + 3]); z1 = Math.max(z1, bb[j + 5]); }
    if (!n) { gnx = gnz = 0; cstart = new Int32Array(1); items = new Int32Array(0); return; }
    C = cell;
    while (Math.ceil((x1 - x0) / C + 1e-9) * Math.ceil((z1 - z0) / C + 1e-9) > 4e6) C *= 2; // huge extents: coarser cells
    gx0 = x0; gz0 = z0; gnx = Math.max(1, Math.ceil((x1 - x0) / C + 1e-9)); gnz = Math.max(1, Math.ceil((z1 - z0) / C + 1e-9));
    const cnt = new Int32Array(gnx * gnz + 1);
    const span = (i, f) => {
      const j = i * 6, a0 = cx(bb[j]), a1 = cx(bb[j + 3]), b0 = cz(bb[j + 2]), b1 = cz(bb[j + 5]);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) f(b * gnx + a);
    };
    for (let i = 0; i < n; i++) span(i, (c) => cnt[c + 1]++);
    for (let c = 0; c < gnx * gnz; c++) cnt[c + 1] += cnt[c];
    items = new Int32Array(cnt[gnx * gnz]);
    const fill = cnt.slice();
    for (let i = 0; i < n; i++) span(i, (c) => { items[fill[c]++] = i; });
    cstart = cnt;
  }
  const cx = (x) => Math.min(gnx - 1, Math.max(0, Math.floor((x - gx0) / C)));
  const cz = (z) => Math.min(gnz - 1, Math.max(0, Math.floor((z - gz0) / C)));
  const cellAt = (x, z) => {
    if (dirty) finalize();
    const a = Math.floor((x - gx0) / C), b = Math.floor((z - gz0) / C);
    return a < 0 || b < 0 || a >= gnx || b >= gnz ? -1 : b * gnx + a;
  };
  // enabled solids whose xz bounds touch the rectangle -> cand[0..count)
  function gather(x0, z0, x1, z1) {
    if (dirty) finalize();
    if (!gnx || x1 < gx0 || z1 < gz0 || x0 > gx0 + gnx * C || z0 > gz0 + gnz * C) return 0;
    const a0 = cx(x0), a1 = cx(x1), b0 = cz(z0), b1 = cz(z1), t = ++tick;
    let m = 0;
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      const c = b * gnx + a;
      for (let k = cstart[c], e = cstart[c + 1]; k < e; k++) {
        const i = items[k];
        if (stamp[i] === t) continue;
        stamp[i] = t;
        if (flag[i] & OFF) continue;
        const j = i * 6;
        if (bb[j] > x1 || bb[j + 3] < x0 || bb[j + 2] > z1 || bb[j + 5] < z0) continue;
        if (m === cand.length) cand = grow(cand, m * 2);
        cand[m++] = i;
      }
    }
    return m;
  }
  function query(x0, z0, x1, z1, cb) {
    const m = gather(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1));
    const list = cand.slice(0, m); // the callback may disable solids or run other queries
    for (let k = 0; k < m; k++) cb(list[k]);
    return m;
  }

  // ------------------------------------------------------------------------------------------- column tests
  // vertical extent of solid i over the column (x, z): sets sLo / sHi, returns false when the column misses it
  let sLo = 0, sHi = 0;
  function column(i, x, z) {
    const j = i * 6;
    if (x < bb[j] || x > bb[j + 3] || z < bb[j + 2] || z > bb[j + 5]) return false;
    const y0 = bb[j + 1], y1 = bb[j + 4];
    if (type[i] === BOX) { sLo = y0; sHi = y1; return true; }
    const k = i * 4;
    if (type[i] === CYL) {
      const r0 = par[k + 2], r1 = par[k + 3], d = Math.hypot(x - par[k], z - par[k + 1]);
      if (d > Math.max(r0, r1)) return false;
      sLo = y0; sHi = y1;
      if (d > Math.min(r0, r1)) { const f = (d - Math.min(r0, r1)) / Math.abs(r1 - r0); if (r0 > r1) sHi = y1 - (y1 - y0) * f; else sLo = y0 + (y1 - y0) * f; }
      return true;
    }
    const s = vref[i * 2], m = vref[i * 2 + 1];
    for (let q = s; q < s + m; q++) { const e = q * 4; if (ed[e] * x + ed[e + 1] * z > ed[e + 2] + 1e-9) return false; }
    sLo = y0; sHi = par[k] + par[k + 1] * x + par[k + 2] * z;
    return sHi > sLo;
  }
  // highest top <= yMax at (x, z), skipping solids with any of skipF -> topY / topId
  let topY = -Infinity, topId = NONE, sup = NONE;
  function topScan(x, z, yMax, skipF) {
    topY = -Infinity; topId = NONE;
    const c = cellAt(x, z);
    if (c < 0) return;
    for (let k = cstart[c], e = cstart[c + 1]; k < e; k++) {
      const i = items[k];
      if (flag[i] & (OFF | skipF) || !column(i, x, z) || sHi > yMax) continue;
      if (sHi > topY || (sHi === topY && i < topId)) { topY = sHi; topId = i; }
    }
  }
  function topAt(x, z, yMax = Infinity, out = { id: NONE, y: -Infinity }) {
    topScan(x, z, yMax, 0); out.id = topId; out.y = topY; return out;
  }
  function groundHeight(x, z, yHint) {
    const t = terrainHeight(x, z);
    if (yHint == null || !Number.isFinite(yHint)) topScan(x, z, Infinity, OVERHANG); else topScan(x, z, yHint + hintTol, 0);
    sup = topY > t ? topId : NONE;
    return topY > t ? topY : t;
  }
  // gradient of a solid's top (rise per metre along x / z); returns its magnitude, 0 for flat tops
  function slopeOf(id, out = null) {
    const k = id * 4, gx = type[id] === PRISM ? par[k + 1] : 0, gz = type[id] === PRISM ? par[k + 2] : 0;
    if (out) { out.x = gx; out.z = gz; }
    return Math.hypot(gx, gz);
  }
  function surfaceAt(x, z, yHint) {
    const y = groundHeight(x, z, yHint), onSolid = topId >= 0 && topY >= y;
    return { y, id: onSolid ? topId : NONE, kind: onSolid ? kinds[kix[topId]] : 'ground', surface: onSolid ? 'solid' : (T?.surface ? T.surface(x, z) : 'ground') };
  }
  function ceilingAt(x, z, y) {
    const c = cellAt(x, z); let best = Infinity;
    if (c < 0) return best;
    for (let k = cstart[c], e = cstart[c + 1]; k < e; k++) { const i = items[k]; if (!(flag[i] & OFF) && column(i, x, z) && sLo >= y - 1e-9 && sLo < best) best = sLo; }
    return best;
  }
  function solidAt(x, y, z) {
    const c = cellAt(x, z);
    if (c < 0) return NONE;
    for (let k = cstart[c], e = cstart[c + 1]; k < e; k++) { const i = items[k]; if (!(flag[i] & OFF) && column(i, x, z) && y >= sLo && y <= sHi) return i; }
    return NONE;
  }

  // ------------------------------------------------------------------------------------------- rays
  // nearest entry of the ray into solid i within (0, tMax]; sets hT, hNx/hNy/hNz. false if missed or origin inside.
  let hT = 0, hNx = 0, hNy = 0, hNz = 0;
  function rayOne(i, ox, oy, oz, dx, dy, dz, tMax) {
    const j = i * 6;
    let t0 = -Infinity, t1 = Infinity, nx = 0, ny = 0, nz = 0;
    // half-space clip: n.(o + t d) <= w
    const clip = (ax, ay, az, w) => {
      const num = w - (ax * ox + ay * oy + az * oz), den = ax * dx + ay * dy + az * dz;
      if (Math.abs(den) < 1e-14) return num >= 0;
      const t = num / den;
      if (den < 0) { if (t > t0) { t0 = t; nx = ax; ny = ay; nz = az; } } else if (t < t1) t1 = t;
      return t0 <= t1;
    };
    if (type[i] === CYL) return rayCyl(i, ox, oy, oz, dx, dy, dz, tMax);
    if (!clip(0, -1, 0, -bb[j + 1])) return false;
    if (type[i] === BOX) {
      if (!clip(0, 1, 0, bb[j + 4]) || !clip(-1, 0, 0, -bb[j]) || !clip(1, 0, 0, bb[j + 3]) || !clip(0, 0, -1, -bb[j + 2]) || !clip(0, 0, 1, bb[j + 5])) return false;
    } else {
      const k = i * 4, L = Math.hypot(par[k + 1], 1, par[k + 2]);
      if (!clip(-par[k + 1] / L, 1 / L, -par[k + 2] / L, par[k] / L)) return false;
      const s = vref[i * 2], m = vref[i * 2 + 1];
      for (let q = s; q < s + m; q++) { const e = q * 4; if (!clip(ed[e], 0, ed[e + 1], ed[e + 2])) return false; }
    }
    if (t0 < 0 || t0 > tMax || t0 > t1) return false;
    hT = t0; hNx = nx; hNy = ny; hNz = nz;
    return true;
  }
  function rayCyl(i, ox, oy, oz, dx, dy, dz, tMax) {
    const j = i * 6, k = i * 4, y0 = bb[j + 1], y1 = bb[j + 4], r0 = par[k + 2], r1 = par[k + 3], sl = (r1 - r0) / (y1 - y0);
    if (column(i, ox, oz) && oy >= sLo && oy <= sHi) return false; // starts inside
    const px = ox - par[k], pz = oz - par[k + 1], q = r0 + sl * (oy - y0), dq = sl * dy;
    let best = Infinity, bx = 0, by = 0, bz = 0;
    const side = (t) => {
      if (!(t >= 0 && t < best)) return;
      const y = oy + dy * t, r = r0 + sl * (y - y0);
      if (y < y0 || y > y1 || r < 0) return;
      best = t; bx = px + dx * t; bz = pz + dz * t; by = -r * sl;
    };
    const A = dx * dx + dz * dz - dq * dq, B = 2 * (px * dx + pz * dz - q * dq), Cc = px * px + pz * pz - q * q;
    if (Math.abs(A) > 1e-12) { const D = B * B - 4 * A * Cc; if (D >= 0) { const sq = Math.sqrt(D); side((-B - sq) / (2 * A)); side((-B + sq) / (2 * A)); } }
    else if (Math.abs(B) > 1e-12) side(-Cc / B);
    if (Math.abs(dy) > 1e-12) for (const [yc, rc, s] of [[y0, r0, -1], [y1, r1, 1]]) {
      const t = (yc - oy) / dy;
      if (t >= 0 && t < best && Math.hypot(px + dx * t, pz + dz * t) <= rc) { best = t; bx = 0; by = s; bz = 0; }
    }
    if (best > tMax) return false;
    const L = Math.hypot(bx, by, bz) || 1;
    hT = best; hNx = bx / L; hNy = by / L; hNz = bz / L;
    return true;
  }
  // nearest solid hit (grid DDA in XZ) -> rT / rId / rN*
  let rT = Infinity, rId = NONE, rNx = 0, rNy = 0, rNz = 0;
  function raySolids(ox, oy, oz, dx, dy, dz, tMax) {
    rT = Infinity; rId = NONE;
    if (dirty) finalize();
    if (!gnx) return;
    const t = ++tick;
    // groups containing the origin are skipped entirely (split footprints must not report their inner seams)
    const c0 = cellAt(ox, oz);
    if (c0 >= 0) for (let k = cstart[c0], e = cstart[c0 + 1]; k < e; k++) { const i = items[k]; if (!(flag[i] & OFF) && column(i, ox, oz) && oy >= sLo && oy <= sHi) gmark[grp[i]] = t; }
    // clip the segment to the grid rectangle
    let ta = 0, tb = tMax;
    const X1 = gx0 + gnx * C, Z1 = gz0 + gnz * C;
    for (const [o, d, lo, hi] of [[ox, dx, gx0, X1], [oz, dz, gz0, Z1]]) {
      if (Math.abs(d) < 1e-14) { if (o < lo || o > hi) return; continue; }
      let u = (lo - o) / d, v = (hi - o) / d; if (u > v) [u, v] = [v, u];
      ta = Math.max(ta, u); tb = Math.min(tb, v);
    }
    if (ta > tb) return;
    let a = cx(ox + dx * ta), b = cz(oz + dz * ta);
    const sa = dx > 0 ? 1 : -1, sb = dz > 0 ? 1 : -1;
    let na = Math.abs(dx) < 1e-14 ? Infinity : ((gx0 + (a + (dx > 0 ? 1 : 0)) * C) - ox) / dx;
    let nb = Math.abs(dz) < 1e-14 ? Infinity : ((gz0 + (b + (dz > 0 ? 1 : 0)) * C) - oz) / dz;
    const da = Math.abs(C / dx), db = Math.abs(C / dz);
    for (let guard = 0; guard < gnx + gnz + 2; guard++) {
      const c = b * gnx + a;
      for (let k = cstart[c], e = cstart[c + 1]; k < e; k++) {
        const i = items[k];
        if (stamp[i] === t) continue;
        stamp[i] = t;
        if (flag[i] & OFF || gmark[grp[i]] === t) continue;
        if (rayOne(i, ox, oy, oz, dx, dy, dz, Math.min(tMax, rT)) && (hT < rT || (hT === rT && i < rId))) { rT = hT; rId = i; rNx = hNx; rNy = hNy; rNz = hNz; }
      }
      const tn = Math.min(na, nb);
      if (rT <= tn || tn > tb) return;
      if (na < nb) { a += sa; na += da; if (a < 0 || a >= gnx) return; } else { b += sb; nb += db; if (b < 0 || b >= gnz) return; }
    }
  }
  // terrain: march the segment, then bisect the first crossing
  function rayTerrain(ox, oy, oz, dx, dy, dz, tMax) {
    if (!TH) { // flat y = 0
      if (oy < 0 || dy >= -1e-12) return Infinity;
      const t = -oy / dy; return t <= tMax ? t : Infinity;
    }
    const f = (t) => oy + dy * t - terrainHeight(ox + dx * t, oz + dz * t);
    if (f(0) < 0) return Infinity; // starts under the ground: ignore it
    let ta = 0, tb = tMax;
    if (T.maxY != null && Math.abs(dy) > 1e-12) { const tu = (T.maxY - oy) / dy; if (dy > 0) tb = Math.min(tb, tu); else ta = Math.max(ta, tu); }
    if (T.minY != null && Math.abs(dy) > 1e-12) { const tl = (T.minY - oy) / dy; if (dy < 0) tb = Math.min(tb, tl + 1e-3); }
    if (ta > tb) return Infinity;
    let t = ta, fa = f(ta);
    if (fa < 0) return ta;
    while (t < tb) {
      const tn = Math.min(tb, t + Math.max(0.75, t * 0.02)), fn = f(tn);
      if (fn < 0) {
        let lo = t, hi = tn;
        for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (f(m) < 0) hi = m; else lo = m; }
        return hi;
      }
      t = tn;
    }
    return Infinity;
  }
  function raycast(o, d, max = 1e4, out = null, solidsOnly = false) {
    const L = Math.hypot(d.x, d.y, d.z);
    if (!(L > 1e-12) || !(max > 0) || !fin(o.x, o.y, o.z, L)) return null;
    const dx = d.x / L, dy = d.y / L, dz = d.z / L;
    raySolids(o.x, o.y, o.z, dx, dy, dz, max);
    let t = rT, id = rId, nx = rNx, ny = rNy, nz = rNz;
    if (!solidsOnly) {
      const tt = rayTerrain(o.x, o.y, o.z, dx, dy, dz, Math.min(max, t));
      if (tt < t) {
        t = tt; id = NONE;
        const x = o.x + dx * t, z = o.z + dz * t, e = 0.5;
        const gx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e), gz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
        const nl = Math.hypot(gx, 1, gz); nx = -gx / nl; ny = 1 / nl; nz = -gz / nl;
      }
    }
    if (!(t <= max)) return null;
    const h = out || { distance: 0, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, id: NONE, kind: '' };
    h.distance = t; h.id = id; h.kind = id >= 0 ? kinds[kix[id]] : 'ground';
    h.point.x = o.x + dx * t; h.point.y = o.y + dy * t; h.point.z = o.z + dz * t;
    h.normal.x = nx; h.normal.y = ny; h.normal.z = nz;
    return h;
  }

  // ------------------------------------------------------------------------------------------- push-out
  // horizontal escape of a circle (centre x, z, radius r, vertical slab yLo..yHi) from solid i -> pX, pZ (unit), pD
  let pX = 0, pZ = 0, pD = 0;
  function circleOut(i, x, z, r, yLo, yHi) {
    const j = i * 6, y0 = bb[j + 1];
    if (bb[j + 4] <= yLo || y0 >= yHi) return false;
    if (type[i] === BOX) {
      const qx = Math.min(Math.max(x, bb[j]), bb[j + 3]), qz = Math.min(Math.max(z, bb[j + 2]), bb[j + 5]);
      const ex = x - qx, ez = z - qz, d2 = ex * ex + ez * ez;
      if (d2 >= r * r) return false;
      if (d2 > 1e-18) { const d = Math.sqrt(d2); pX = ex / d; pZ = ez / d; pD = r - d; return true; }
      return insideRect(x, z, bb[j], bb[j + 2], bb[j + 3], bb[j + 5], r);
    }
    const k = i * 4;
    if (type[i] === CYL) {
      const R = radiusOver(i, yLo, yHi);
      const ex = x - par[k], ez = z - par[k + 1], d = Math.hypot(ex, ez);
      if (R <= 0 || d >= R + r) return false;
      if (d > 1e-9) { pX = ex / d; pZ = ez / d; } else { pX = 1; pZ = 0; }
      pD = R + r - d; return true;
    }
    const s = vref[i * 2], m = vref[i * 2 + 1];
    let sep = -Infinity, se = -1;
    for (let q = s; q < s + m; q++) {
      const e = q * 4, v = ed[e] * x + ed[e + 1] * z - ed[e + 2];
      if (v >= r) return false;
      if (!inner[q] && v > sep) { sep = v; se = q; }
    }
    let inside = true;
    for (let q = s; q < s + m; q++) { const e = q * 4; if (ed[e] * x + ed[e + 1] * z - ed[e + 2] > 0) { inside = false; break; } }
    let qx = x, qz = z;
    if (inside) {
      if (se < 0) return false;
      const e = se * 4; pX = ed[e]; pZ = ed[e + 1]; pD = r - sep; qx = x - pX * sep; qz = z - pZ * sep;
    } else {
      let bd = Infinity, bi = -1, bu = 0;
      for (let q = s; q < s + m; q++) {
        const a = q, b = q + 1 < s + m ? q + 1 : s, ax = vx[2 * a], az = vx[2 * a + 1], ex = vx[2 * b] - ax, ez = vx[2 * b + 1] - az;
        const u = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez))), fx = ax + ex * u, fz = az + ez * u;
        const d2 = (x - fx) ** 2 + (z - fz) ** 2;
        if (d2 < bd) { bd = d2; bi = q; bu = u; qx = fx; qz = fz; }
      }
      const d = Math.sqrt(bd);
      if (d >= r || (inner[bi] && bu > 1e-6 && bu < 1 - 1e-6)) return false; // a seam: the sibling piece handles it
      if (d > 1e-9) { pX = (x - qx) / d; pZ = (z - qz) / d; } else { const e = bi * 4; pX = ed[e]; pZ = ed[e + 1]; }
      pD = r - d;
    }
    let top = par[k] + par[k + 1] * qx + par[k + 2] * qz;
    const g = Math.hypot(par[k + 1], par[k + 2]);
    if (g > 0 && g <= walkSlope) top = Math.min(top, par[k] + par[k + 1] * x + par[k + 2] * z - g * r); // ramp: lowest plane point under the body
    return top > yLo; // top below the step line: ignored
  }
  function insideRect(x, z, x0, z0, x1, z1, r) {
    const a = x - x0, b = x1 - x, c = z - z0, d = z1 - z, m = Math.min(a, b, c, d);
    pX = m === a ? -1 : m === b ? 1 : 0; pZ = m === c ? -1 : m === d ? 1 : 0; if (pX && pZ) pZ = 0;
    pD = m + r; return true;
  }
  const radiusOver = (i, yLo, yHi) => {
    const j = i * 6, k = i * 4, y0 = bb[j + 1], y1 = bb[j + 4], a = Math.max(yLo, y0), b = Math.min(yHi, y1);
    if (a > b) return 0;
    const r = (y) => par[k + 2] + (par[k + 3] - par[k + 2]) * (y - y0) / (y1 - y0);
    return Math.max(r(a), r(b));
  };

  const PASSES = 4;
  function pushCylinder(p, r, h, step = 0, out = null) {
    if (!fin(p.x, p.y, p.z, r, h) || r <= 0) return null;
    let tx = 0, tz = 0, deep = 0, did = NONE, dnx = 0, dnz = 0;
    const yLo = p.y + Math.max(0, step), yHi = p.y + h;
    for (let it = 0; it < PASSES; it++) {
      const m = gather(p.x - r, p.z - r, p.x + r, p.z + r);
      let moved = false;
      for (let k = 0; k < m; k++) {
        const i = cand[k];
        if (!circleOut(i, p.x, p.z, r, yLo, yHi) || pD < 1e-7) continue;
        p.x += pX * pD; p.z += pZ * pD; tx += pX * pD; tz += pZ * pD; moved = true;
        if (pD > deep) { deep = pD; did = i; dnx = pX; dnz = pZ; }
      }
      if (!moved) break;
    }
    if (did < 0) return null;
    const o = out || {}, L = Math.hypot(tx, tz);
    o.hit = true; o.dx = tx; o.dz = tz; o.depth = L; o.id = did;
    if (L > 1e-9) { o.nx = tx / L; o.nz = tz / L; } else { o.nx = dnx; o.nz = dnz; }
    return o;
  }

  // closest surface of solid i to point (x, y, z) -> sign, cX/cY/cZ (closest point), inward: point is inside
  let cX = 0, cY = 0, cZ = 0, cIn = false;
  function closest(i, x, y, z) {
    const j = i * 6, y0 = bb[j + 1];
    if (type[i] === BOX) {
      cX = Math.min(Math.max(x, bb[j]), bb[j + 3]); cY = Math.min(Math.max(y, y0), bb[j + 4]); cZ = Math.min(Math.max(z, bb[j + 2]), bb[j + 5]);
      cIn = cX === x && cY === y && cZ === z;
      if (cIn) { // nearest face
        const f = [x - bb[j], bb[j + 3] - x, y - y0, bb[j + 4] - y, z - bb[j + 2], bb[j + 5] - z];
        let b = 0; for (let q = 1; q < 6; q++) if (f[q] < f[b]) b = q;
        if (b === 0) cX = bb[j]; else if (b === 1) cX = bb[j + 3]; else if (b === 2) cY = y0; else if (b === 3) cY = bb[j + 4]; else if (b === 4) cZ = bb[j + 2]; else cZ = bb[j + 5];
      }
      return;
    }
    const k = i * 4;
    if (type[i] === CYL) { // trapezoid in the (radial, y) half-plane
      const y1 = bb[j + 4], r0 = par[k + 2], r1 = par[k + 3], ex = x - par[k], ez = z - par[k + 1], d = Math.hypot(ex, ez);
      const ux = d > 1e-9 ? ex / d : 1, uz = d > 1e-9 ? ez / d : 0;
      const rAt = r0 + (r1 - r0) * (Math.min(Math.max(y, y0), y1) - y0) / (y1 - y0);
      cIn = y >= y0 && y <= y1 && d <= rAt;
      let bd = Infinity, br = 0, byy = 0;
      const seg = (ar, ay, br2, by2) => {
        const er = br2 - ar, ey = by2 - ay, u = Math.min(1, Math.max(0, ((d - ar) * er + (y - ay) * ey) / (er * er + ey * ey || 1)));
        const qr = ar + er * u, qy = ay + ey * u, dd = (d - qr) ** 2 + (y - qy) ** 2;
        if (dd < bd) { bd = dd; br = qr; byy = qy; }
      };
      seg(0, y0, r0, y0); seg(r0, y0, r1, y1); seg(r1, y1, 0, y1);
      cX = par[k] + ux * br; cY = byy; cZ = par[k + 1] + uz * br;
      return;
    }
    // prism: exact for flat tops, vertical approximation on slopes
    const s = vref[i * 2], m = vref[i * 2 + 1], a = par[k], sx = par[k + 1], sz = par[k + 2];
    let sep = -Infinity, se = -1, in2 = true;
    for (let q = s; q < s + m; q++) { const e = q * 4, v = ed[e] * x + ed[e + 1] * z - ed[e + 2]; if (v > 0) in2 = false; if (!inner[q] && v > sep) { sep = v; se = q; } }
    let qx = x, qz = z;
    if (!in2) {
      let bd = Infinity;
      for (let q = s; q < s + m; q++) {
        const b = q + 1 < s + m ? q + 1 : s, ax = vx[2 * q], az = vx[2 * q + 1], ex = vx[2 * b] - ax, ez = vx[2 * b + 1] - az;
        const u = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez))), fx = ax + ex * u, fz = az + ez * u, d2 = (x - fx) ** 2 + (z - fz) ** 2;
        if (d2 < bd) { bd = d2; qx = fx; qz = fz; }
      }
    }
    const top = a + sx * qx + sz * qz;
    cIn = in2 && y >= y0 && y <= top;
    cX = qx; cZ = qz; cY = Math.min(Math.max(y, y0), top);
    if (cIn) { // nearest of: side (se), bottom, top
      const dT = top - y, dB = y - y0, dS = se >= 0 ? -sep : Infinity;
      if (dS <= dT && dS <= dB) { const e = se * 4; cX = x + ed[e] * dS; cZ = z + ed[e + 1] * dS; cY = y; }
      else if (dT <= dB) cY = top; else cY = y0;
    }
  }
  function pushSphere(p, r, out = null) {
    if (!fin(p.x, p.y, p.z, r) || r <= 0) return null;
    let tx = 0, ty = 0, tz = 0, deep = 0, did = NONE;
    for (let it = 0; it < PASSES; it++) {
      const m = gather(p.x - r, p.z - r, p.x + r, p.z + r);
      let moved = false;
      for (let k = 0; k < m; k++) {
        const i = cand[k], j = i * 6;
        if (bb[j + 1] > p.y + r || bb[j + 4] < p.y - r) continue;
        closest(i, p.x, p.y, p.z);
        let ex = p.x - cX, ey = p.y - cY, ez = p.z - cZ;
        const d = Math.hypot(ex, ey, ez);
        if (!cIn && d >= r) continue;
        let depth;
        if (d < 1e-9) { ex = 0; ey = 1; ez = 0; depth = r; }
        else if (cIn) { ex = -ex / d; ey = -ey / d; ez = -ez / d; depth = d + r; }
        else { ex /= d; ey /= d; ez /= d; depth = r - d; }
        p.x += ex * depth; p.y += ey * depth; p.z += ez * depth; tx += ex * depth; ty += ey * depth; tz += ez * depth; moved = true;
        if (depth > deep) { deep = depth; did = i; }
      }
      if (!moved) break;
    }
    if (did < 0) return null;
    return pushResult(out, tx, ty, tz, did);
  }
  function pushResult(out, tx, ty, tz, id) {
    const o = out || {}, L = Math.hypot(tx, ty, tz);
    o.hit = true; o.dx = tx; o.dy = ty; o.dz = tz; o.depth = L; o.id = id;
    if (L > 1e-9) { o.nx = tx / L; o.ny = ty / L; o.nz = tz / L; } else { o.nx = 0; o.ny = 1; o.nz = 0; }
    return o;
  }

  // yaw box vs solid i (SAT in XZ + optional vertical axis) -> bX, bY, bZ (unit), bD: how to move the box out
  let bX = 0, bY = 0, bZ = 0, bD = 0;
  const RV = new Float64Array(8), RE = new Float64Array(16), RI = new Uint8Array(4);
  function boxOut(i, b, fx, fz, rx, rz) {
    const j = i * 6, y0 = bb[j + 1], yLo = b.y + Math.max(0, b.step || 0), yHi = b.y + b.h;
    if (bb[j + 4] <= yLo || y0 >= yHi) return false;
    const hl = b.hl, hw = b.hw, ox = b.x, oz = b.z;
    let best = Infinity, top = bb[j + 4];
    if (type[i] === CYL) {
      const k = i * 4, R = radiusOver(i, yLo, yHi);
      if (R <= 0) return false;
      const ex = par[k] - ox, ez = par[k + 1] - oz, lf = ex * fx + ez * fz, lr = ex * rx + ez * rz;
      const qf = Math.min(hl, Math.max(-hl, lf)), qr = Math.min(hw, Math.max(-hw, lr)), df = lf - qf, dr = lr - qr, d = Math.hypot(df, dr);
      if (d >= R) return false;
      if (d > 1e-9) { const ux = -(df * fx + dr * rx) / d, uz = -(df * fz + dr * rz) / d; bX = ux; bY = 0; bZ = uz; best = R - d; }
      else { // circle centre inside the box footprint: leave through the nearer side
        const af = hl - Math.abs(lf), ar = hw - Math.abs(lr), sf = lf > 0 ? -1 : 1, sr = lr > 0 ? -1 : 1;
        if (af < ar) { bX = fx * sf; bZ = fz * sf; best = af + R; } else { bX = rx * sr; bZ = rz * sr; best = ar + R; }
        bY = 0;
      }
    } else {
      // polygon: BOX -> 4 scratch vertices; PRISM -> stored piece
      let V = vx, E = ed, I = inner, s = 0, m = 4;
      if (type[i] === BOX) {
        RV[0] = bb[j]; RV[1] = bb[j + 2]; RV[2] = bb[j + 3]; RV[3] = bb[j + 2]; RV[4] = bb[j + 3]; RV[5] = bb[j + 5]; RV[6] = bb[j]; RV[7] = bb[j + 5];
        const w = bb[j + 3] - bb[j], dz = bb[j + 5] - bb[j + 2];
        RE[0] = 0; RE[1] = -1; RE[2] = -bb[j + 2]; RE[3] = dz; RE[4] = 1; RE[5] = 0; RE[6] = bb[j + 3]; RE[7] = w;
        RE[8] = 0; RE[9] = 1; RE[10] = bb[j + 5]; RE[11] = dz; RE[12] = -1; RE[13] = 0; RE[14] = -bb[j]; RE[15] = w;
        V = RV; E = RE; I = RI;
      } else { s = vref[i * 2]; m = vref[i * 2 + 1]; }
      const cb = (ux, uz) => ox * ux + oz * uz, ext = (ux, uz) => hl * Math.abs(fx * ux + fz * uz) + hw * Math.abs(rx * ux + rz * uz);
      for (let q = s; q < s + m; q++) { // polygon edge normals
        const e = q * 4, ux = E[e], uz = E[e + 1], c = cb(ux, uz), h = ext(ux, uz), pMax = E[e + 2], pMin = pMax - E[e + 3];
        const o1 = pMax - (c - h), o2 = c + h - pMin;
        if (o1 <= 0 || o2 <= 0) return false;
        if (I[q]) continue;
        if (o1 < best) { best = o1; bX = ux; bZ = uz; }
        if (o2 < best) { best = o2; bX = -ux; bZ = -uz; }
      }
      for (let a = 0; a < 2; a++) { // box axes
        const ux = a ? rx : fx, uz = a ? rz : fz, c = cb(ux, uz), h = a ? hw : hl;
        let lo = Infinity, hi = -Infinity;
        for (let q = s; q < s + m; q++) { const v = V[2 * q] * ux + V[2 * q + 1] * uz; if (v < lo) lo = v; if (v > hi) hi = v; }
        const o1 = hi - (c - h), o2 = c + h - lo;
        if (o1 <= 0 || o2 <= 0) return false;
        if (o1 < best) { best = o1; bX = ux; bZ = uz; }
        if (o2 < best) { best = o2; bX = -ux; bZ = -uz; }
      }
      bY = 0;
      if (type[i] === PRISM) { // sloped top over the box corners: a walkable ramp by its lowest corner, a steep one by its highest
        const k = i * 4, low = Math.hypot(par[k + 1], par[k + 2]) <= walkSlope;
        top = low ? Infinity : -Infinity;
        for (let c = 0; c < 10; c += 2) { const sf = CORN[c], sr = CORN[c + 1], y = par[k] + par[k + 1] * (ox + fx * hl * sf + rx * hw * sr) + par[k + 2] * (oz + fz * hl * sf + rz * hw * sr); top = low ? Math.min(top, y) : Math.max(top, y); }
        top = Math.min(Math.max(top, y0), bb[j + 4]);
        if (top <= yLo) return false;
      }
    }
    if (b.vertical) {
      // up only onto a top below the head, down only from an underside above the feet (never into the ground)
      const up = top - b.y, down = yHi - y0;
      if (top < yHi && up > 0 && up < best && up <= down) { best = up; bX = 0; bY = 1; bZ = 0; }
      else if (y0 > b.y && down > 0 && down < best) { best = down; bX = 0; bY = -1; bZ = 0; }
    }
    if (!(best < Infinity) || best <= 0) return false;
    bD = best;
    return true;
  }
  function pushBox(b, out = null) {
    if (!fin(b.x, b.y, b.z, b.yaw, b.hl, b.hw, b.h)) return null;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), rx = fz, rz = -fx;
    const ex = Math.abs(fx) * b.hl + Math.abs(rx) * b.hw, ez = Math.abs(fz) * b.hl + Math.abs(rz) * b.hw;
    let tx = 0, ty = 0, tz = 0, deep = 0, did = NONE;
    for (let it = 0; it < PASSES; it++) {
      const m = gather(b.x - ex, b.z - ez, b.x + ex, b.z + ez);
      let moved = false;
      for (let k = 0; k < m; k++) {
        const i = cand[k];
        if (!boxOut(i, b, fx, fz, rx, rz) || bD < 1e-7) continue;
        b.x += bX * bD; b.y += bY * bD; b.z += bZ * bD; tx += bX * bD; ty += bY * bD; tz += bZ * bD; moved = true;
        if (bD > deep) { deep = bD; did = i; }
      }
      if (!moved) break;
    }
    if (did < 0) return null;
    return pushResult(out, tx, ty, tz, did);
  }

  function bounds(id, out = {}) {
    const j = id * 6;
    out.x0 = bb[j]; out.y0 = bb[j + 1]; out.z0 = bb[j + 2]; out.x1 = bb[j + 3]; out.y1 = bb[j + 4]; out.z1 = bb[j + 5];
    return out;
  }
  // debug outline: calls seg(ax, ay, az, bx, by, bz) for the wire edges of solid i
  function outline(i, seg) {
    const j = i * 6, y0 = bb[j + 1], y1 = bb[j + 4];
    if (type[i] === BOX) {
      const X = [bb[j], bb[j + 3], bb[j + 3], bb[j]], Z = [bb[j + 2], bb[j + 2], bb[j + 5], bb[j + 5]];
      for (let a = 0; a < 4; a++) { const b = (a + 1) % 4; seg(X[a], y0, Z[a], X[b], y0, Z[b]); seg(X[a], y1, Z[a], X[b], y1, Z[b]); seg(X[a], y0, Z[a], X[a], y1, Z[a]); }
    } else if (type[i] === CYL) {
      const k = i * 4, N = 10;
      for (let a = 0; a < N; a++) {
        const u = a / N * Math.PI * 2, v = (a + 1) / N * Math.PI * 2, c = Math.cos(u), s = Math.sin(u), c2 = Math.cos(v), s2 = Math.sin(v);
        for (const [y, r] of [[y0, par[k + 2]], [y1, par[k + 3]]]) seg(par[k] + c * r, y, par[k + 1] + s * r, par[k] + c2 * r, y, par[k + 1] + s2 * r);
        if (a % 3 === 0) seg(par[k] + c * par[k + 2], y0, par[k + 1] + s * par[k + 2], par[k] + c * par[k + 3], y1, par[k + 1] + s * par[k + 3]);
      }
    } else {
      const k = i * 4, s = vref[i * 2], m = vref[i * 2 + 1], top = (x, z) => par[k] + par[k + 1] * x + par[k + 2] * z;
      for (let q = s; q < s + m; q++) {
        const b = q + 1 < s + m ? q + 1 : s, ax = vx[2 * q], az = vx[2 * q + 1], bx2 = vx[2 * b], bz2 = vx[2 * b + 1];
        const pv = q > s ? q - 1 : s + m - 1;
        seg(ax, top(ax, az), az, bx2, top(bx2, bz2), bz2);
        if (inner[q]) continue;
        seg(ax, y0, az, bx2, y0, bz2);
        if (!inner[pv]) seg(ax, y0, az, ax, top(ax, az), az);
      }
    }
  }

  return {
    box, obox, cyl, prism, disable, enable, finalize, setTerrain, terrainHeight,
    isEnabled: (id) => id >= 0 && id < n && !(flag[id] & OFF),
    raycast, groundHeight, topAt, surfaceAt, ceilingAt, solidAt,
    inside: (x, y, z) => solidAt(x, y, z) >= 0,
    query, pushCylinder, pushSphere, pushBox, bounds, outline,
    slopeOf, get groundId() { return sup; }, get walkSlope() { return walkSlope; },
    typeOf: (id) => type[id], kindOf: (id) => kinds[kix[id]], flagsOf: (id) => flag[id], groupOf: (id) => grp[id],
    get count() { return n; }, get version() { return version; }, get cellSize() { return C; },
    get terrain() { return T; },
  };
}

// World-facing facade (the old makeQueries shape): shares one collision world; optional terrain replaces its ground.
export function createWorldQueries(cw, terrain) {
  if (terrain) cw.setTerrain(terrain);
  return {
    collision: cw,
    raycast: (o, d, max) => cw.raycast(o, d, max),
    groundHeight: (x, z, yHint) => cw.groundHeight(x, z, yHint),
    surfaceAt: (x, z, yHint) => cw.surfaceAt(x, z, yHint),
    topAt: (x, z, yMax) => cw.topAt(x, z, yMax),
    inside: (x, y, z) => cw.inside(x, y, z),
    query: (x0, z0, x1, z1, cb) => cw.query(x0, z0, x1, z1, cb),
  };
}

// ------------------------------------------------------------------------------------------- debug overlay
export function createCollisionDebug(parent, cw, { radius = 140, moveStep = 25, maxSolids = 6000 } = {}) {
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: true });
  let lines = null, cx = Infinity, cz = Infinity, ver = -1, on = false;
  const COL = { [BOX]: [1, 0.85, 0.2], [CYL]: [0.3, 1, 0.4], [PRISM]: [0.2, 0.8, 1] }, OVER = [1, 0.45, 0.1];
  function rebuild(x, z) {
    const pos = [], col = [];
    let k = 0;
    cw.query(x - radius, z - radius, x + radius, z + radius, (i) => {
      if (k++ > maxSolids) return;
      const c = cw.flagsOf(i) & OVERHANG ? OVER : COL[cw.typeOf(i)];
      cw.outline(i, (ax, ay, az, bx, by, bz) => { pos.push(ax, ay, az, bx, by, bz); col.push(...c, ...c); });
    });
    clear();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lines = new THREE.LineSegments(g, mat); lines.name = 'collision-debug'; lines.frustumCulled = false;
    parent.add(lines);
    cx = x; cz = z; ver = cw.version;
  }
  function clear() { if (lines) { parent.remove(lines); lines.geometry.dispose(); lines = null; } }
  return {
    update(cam) {
      if (!on) return;
      const p = cam?.position || cam;
      if (!p) return;
      if (Math.hypot(p.x - cx, p.z - cz) > moveStep || cw.version !== ver) rebuild(p.x, p.z);
    },
    get enabled() { return on; },
    set enabled(v) { on = !!v; if (!on) { clear(); cx = cz = Infinity; } },
    get lineCount() { return lines ? lines.geometry.attributes.position.count / 2 : 0; },
    dispose() { clear(); mat.dispose(); on = false; },
  };
}

// ------------------------------------------------------------------------------------------- polygon helpers
function area2(P) { let a = 0; const m = P.length >> 1; for (let i = 0; i < m; i++) { const j = (i + 1) % m; a += P[2 * i] * P[2 * j + 1] - P[2 * j] * P[2 * i + 1]; } return a; }
const crs = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
// flat or nested ring -> flat CCW ring without duplicate / collinear / spike vertices (null if degenerate)
function cleanRing(pts) {
  if (!pts || !pts.length) return null;
  let P = Array.isArray(pts[0]) ? pts.flat() : Array.from(pts);
  if (P.length % 2 || P.some(v => !Number.isFinite(v))) return null;
  if (area2(P) < 0) { const R = []; for (let i = P.length - 2; i >= 0; i -= 2) R.push(P[i], P[i + 1]); P = R; }
  for (let changed = true; changed && P.length >= 6;) {
    changed = false;
    const m = P.length >> 1;
    for (let i = 0; i < m; i++) {
      const a = (i + m - 1) % m, b = (i + 1) % m, ax = P[2 * a], az = P[2 * a + 1], x = P[2 * i], z = P[2 * i + 1], bx = P[2 * b], bz = P[2 * b + 1];
      const l1 = Math.hypot(x - ax, z - az), l2 = Math.hypot(bx - x, bz - z);
      if (l1 < 1e-4 || Math.abs(crs(ax, az, x, z, bx, bz)) <= 1e-9 * Math.max(1, l1 * l2)) { P.splice(2 * i, 2); changed = true; break; }
    }
  }
  return P.length >= 6 && area2(P) > 1e-6 ? P : null;
}
function convex(P) {
  const m = P.length >> 1;
  for (let i = 0; i < m; i++) {
    const a = (i + m - 1) % m, b = (i + 1) % m;
    if (crs(P[2 * a], P[2 * a + 1], P[2 * i], P[2 * i + 1], P[2 * b], P[2 * b + 1]) < -1e-9) return false;
  }
  return true;
}

// Concave / holed footprint -> convex pieces: holes are bridged into the outer ring, the ring is ear-clipped, then
// triangles are greedily re-merged across their diagonals while the union stays convex (Hertel-Mehlhorn).
export function convexPieces(pts, holes = null) {
  const O = cleanRing(pts);
  if (!O) return [];
  const X = [], Z = [];
  const push = (x, z) => { X.push(x); Z.push(z); return X.length - 1; };
  let ring = [];
  for (let i = 0; i < O.length; i += 2) ring.push(push(O[i], O[i + 1]));
  const H = (holes || []).map(cleanRing).filter(Boolean);
  // holes, rightmost first: reverse to CW, bridge from their rightmost vertex to a visible ring vertex
  const hs = H.map(h => { const idx = []; for (let i = h.length - 2; i >= 0; i -= 2) idx.push(push(h[i], h[i + 1])); return idx; });
  hs.sort((a, b) => Math.max(...b.map(i => X[i])) - Math.max(...a.map(i => X[i])));
  for (const h of hs) {
    let mi = 0; for (let k = 1; k < h.length; k++) if (X[h[k]] > X[h[mi]]) mi = k;
    const M = h[mi];
    const edges = [];
    const addEdges = (r) => { for (let k = 0; k < r.length; k++) edges.push([r[k], r[(k + 1) % r.length]]); };
    addEdges(ring); for (const o of hs) addEdges(o);
    const order = ring.map((v, k) => k).sort((a, b) => Math.hypot(X[ring[a]] - X[M], Z[ring[a]] - Z[M]) - Math.hypot(X[ring[b]] - X[M], Z[ring[b]] - Z[M]));
    let pick = order[0];
    for (const k of order) {
      const P = ring[k];
      let ok = true;
      for (const [a, b] of edges) {
        if (a === P || b === P || a === M || b === M) continue;
        if (segCross(X[M], Z[M], X[P], Z[P], X[a], Z[a], X[b], Z[b])) { ok = false; break; }
      }
      if (ok) { pick = k; break; }
    }
    const P = ring[pick], loop = [];
    for (let k = 0; k <= h.length; k++) loop.push(k === h.length ? push(X[M], Z[M]) : h[(mi + k) % h.length]);
    ring = [...ring.slice(0, pick + 1), ...loop, push(X[P], Z[P]), ...ring.slice(pick + 1)];
  }
  // ear clipping
  const tris = [], V = ring.slice();
  const cr = (a, b, c) => crs(X[a], Z[a], X[b], Z[b], X[c], Z[c]);
  const same = (a, b) => X[a] === X[b] && Z[a] === Z[b];
  while (V.length > 3) {
    let ear = -1, bestC = -Infinity, bestI = 0;
    for (let k = 0; k < V.length; k++) {
      const a = V[(k + V.length - 1) % V.length], b = V[k], c = V[(k + 1) % V.length], w = cr(a, b, c);
      if (w > bestC) { bestC = w; bestI = k; }
      if (w <= 1e-12) continue;
      let clear = true;
      for (const p of V) {
        if (p === a || p === b || p === c || same(p, a) || same(p, b) || same(p, c)) continue;
        if (cr(a, b, p) > 0 && cr(b, c, p) > 0 && cr(c, a, p) > 0) { clear = false; break; }
      }
      if (clear) { ear = k; break; }
    }
    if (ear < 0) ear = bestI; // numerically stuck: clip the most convex corner
    tris.push([V[(ear + V.length - 1) % V.length], V[ear], V[(ear + 1) % V.length]]);
    V.splice(ear, 1);
  }
  tris.push(V.slice());
  // merge across shared diagonals while convex
  const polys = tris.filter(t => Math.abs(cr(t[0], t[1], t[2])) > 1e-9);
  const convexIdx = (p) => { for (let k = 0; k < p.length; k++) if (cr(p[(k + p.length - 1) % p.length], p[k], p[(k + 1) % p.length]) < -1e-9) return false; return true; };
  for (let merged = true; merged;) {
    merged = false;
    const owner = new Map();
    polys.forEach((p, pi) => { if (p) for (let k = 0; k < p.length; k++) owner.set(p[k] + ',' + p[(k + 1) % p.length], pi); });
    for (let pi = 0; pi < polys.length && !merged; pi++) {
      const p = polys[pi]; if (!p) continue;
      for (let k = 0; k < p.length; k++) {
        const a = p[k], b = p[(k + 1) % p.length], qi = owner.get(b + ',' + a);
        if (qi === undefined || qi === pi || !polys[qi]) continue;
        const q = polys[qi], ia = q.indexOf(a);
        const u = []; // p from b round to a, then q strictly between a and b
        for (let t = 0; t < p.length; t++) u.push(p[(k + 1 + t) % p.length]);
        for (let t = 1; t < q.length - 1; t++) u.push(q[(ia + t) % q.length]);
        if (!convexIdx(u)) continue;
        polys[pi] = u; polys[qi] = null; merged = true; break;
      }
    }
  }
  // pieces + seam flags (an edge whose reverse belongs to another piece, by coordinates)
  const key = (a, b) => `${Math.round(X[a] * 1e4)},${Math.round(Z[a] * 1e4)},${Math.round(X[b] * 1e4)},${Math.round(Z[b] * 1e4)}`;
  const all = new Set(), out = [];
  const live = polys.filter(Boolean);
  for (const p of live) for (let k = 0; k < p.length; k++) all.add(key(p[k], p[(k + 1) % p.length]));
  for (const p of live) {
    const q = p.filter((v, k) => !same(v, p[(k + 1) % p.length]));
    if (q.length < 3) continue;
    const flat = [], inn = new Uint8Array(q.length);
    q.forEach((v, k) => { flat.push(X[v], Z[v]); inn[k] = all.has(key(q[(k + 1) % q.length], v)) ? 1 : 0; });
    if (area2(flat) > 1e-6) out.push({ pts: flat, inner: inn });
  }
  return out;
}
function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = crs(cx, cz, dx, dz, ax, az), d2 = crs(cx, cz, dx, dz, bx, bz), d3 = crs(ax, az, bx, bz, cx, cz), d4 = crs(ax, az, bx, bz, dx, dz);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
