// Wrecks: traffic cars knocked out of lane-following become free rigid boxes (gravity, tumbling, sliding, sleeping),
// knock other cars over ("bowling"), take dents and spit debris. Also the player's ram against traffic.
//   createWrecks({ scene, models, query, retire, heightAt }) -> W
//     models: vehicles.js models (makeMesh for dents; null = headless); query(x, z, r, out) -> live cars near a point;
//     retire(car): take a live car out of the lanes (traffic.js); heightAt(x, z): ground fallback when no solid is set
//   W.list: live wreck records { type, len, wid, h, color, mass, p, v, w (angular velocity), q, sleep, fx, fz, fl, fw, ey }
//   W.knock(car, dv?, spin?) -> wreck | null (null if the car is already dead); accepts any car-like record
//     { type, len, wid, h, color, x, y, z, ry, v, pitch? }
//   W.ram(q) -> { dv, push, hits, knocked, severity }  q: player box { x, y (bottom), z, fx, fz, hl, hw, h, v, mass }
//   W.dent(wreck, px, py, pz, dx, dy, dz, J)  world impact point, direction into the body, impulse (N s)
//   W.massOf(carOrType) -> kg;  W.setSolid({ ground(x, z, y) -> y, push(x, y, z, r, h) -> { dx, dz, nx, nz } | null })
//   W.setDebris(d) d.shards(x, y, z, vx, vy, vz, n, cols, sizeMin, sizeMax, spread, flat, life)
//   W.update(dt, camera);  W.draw(fleet, camera, frustum);  W.collide(pos, r, h, acc) (player push-out);  W.stats()
import * as THREE from 'three';
import { VTYPES, paintOf } from './vehicles.js';
import { cue } from '../audio/cue.js';

const G = 9.81 * 1.25;          // a touch of extra gravity reads better at game scale
const MAX_WRECKS = 40, MAX_DENTED = 16;
const RAM_MIN = 1.5;            // closing speed (m/s) below which a contact is only a solid push
const BOWL_DV = 2.2;            // velocity change (m/s) that turns a live car into a wreck
const SLEEP_V = 0.3, SLEEP_W = 0.35, SLEEP_AFTER = 0.8;
const GLASS = [[0.5, 0.62, 0.68], [0.7, 0.8, 0.84], [0.35, 0.45, 0.5]], DARK = [0.03, 0.03, 0.035];

const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _n = new THREE.Vector3();
const _qi = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s1 = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const _sph = new THREE.Sphere();

export function massOfDims(len, wid, h) { return Math.max(300, len * wid * h * 110); }

// 2D oriented boxes a, b (centre, unit forward, half length / width): separating-axis overlap; normal points a -> b
export function boxOverlap(ax, az, afx, afz, ahl, ahw, bx, bz, bfx, bfz, bhl, bhw, out) {
  const dx = bx - ax, dz = bz - az;
  let best = Infinity, nx = 0, nz = 0;
  for (let k = 0; k < 4; k++) {
    const ux = k === 0 ? afx : k === 1 ? -afz : k === 2 ? bfx : -bfz, uz = k === 0 ? afz : k === 1 ? afx : k === 2 ? bfz : bfx;
    const ra = ahl * Math.abs(afx * ux + afz * uz) + ahw * Math.abs(afz * ux - afx * uz);
    const rb = bhl * Math.abs(bfx * ux + bfz * uz) + bhw * Math.abs(bfz * ux - bfx * uz);
    const d = dx * ux + dz * uz, pen = ra + rb - Math.abs(d);
    if (pen <= 0) return null;
    if (pen < best) { best = pen; nx = d < 0 ? -ux : ux; nz = d < 0 ? -uz : uz; }
  }
  out.nx = nx; out.nz = nz; out.depth = best;
  return out;
}

export function createWrecks({ scene = null, models = null, query = () => [], retire = () => {}, heightAt = () => 0 } = {}) {
  const list = [];
  let solid = null, debris = null, dentedCount = 0, time = 0;
  const cnt = { knocked: 0, dents: 0, removed: 0, rams: 0 };
  const near = [];
  const groundY = (x, z, y) => { const g = solid?.ground ? solid.ground(x, z, y) : heightAt(x, z); return Number.isFinite(g) ? g : 0; };
  const massOf = (c) => { const T = typeof c === 'string' ? VTYPES[c] : c; return T ? massOfDims(T.len || 4.4, T.wid || 1.8, T.h || 1.5) : 1400; };

  // ---- rigid body helpers (box inertia, world-space inverse inertia applied through the orientation)
  function invI(w, vec, out) { // out = I_world^-1 * vec
    _qi.copy(w.q).invert();
    out.copy(vec).applyQuaternion(_qi);
    out.x *= w.iix; out.y *= w.iiy; out.z *= w.iiz;
    return out.applyQuaternion(w.q);
  }
  function impulse(w, rx, ry, rz, jx, jy, jz) { // impulse J at offset r from the centre
    w.v.x += jx / w.mass; w.v.y += jy / w.mass; w.v.z += jz / w.mass;
    _t.set(ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx);
    invI(w, _t, _u); w.w.add(_u);
  }
  function kEff(w, rx, ry, rz, nx, ny, nz) { // 1 / effective mass along n at offset r
    _t.set(ry * nz - rz * ny, rz * nx - rx * nz, rx * ny - ry * nx);
    invI(w, _t, _u);
    const cx = _u.y * rz - _u.z * ry, cy = _u.z * rx - _u.x * rz, cz = _u.x * ry - _u.y * rx;
    return 1 / w.mass + nx * cx + ny * cy + nz * cz;
  }
  function refresh(w) { // cached footprint for queries and legacy readers
    _v.set(1, 0, 0).applyQuaternion(w.q);
    const l = Math.hypot(_v.x, _v.z);
    if (l > 0.2) { w.fx = _v.x / l; w.fz = _v.z / l; }
    _r.set(0, 1, 0).applyQuaternion(w.q);
    const up = Math.abs(_r.y);
    // vertical half extent of the tilted box (upright: h / 2; on its side: about wid / 2)
    w.ey = w.hh * up + w.hw * Math.sqrt(Math.max(0, 1 - up * up));
    w.fl = w.hl; w.fw = w.hw * up + w.hh * Math.sqrt(Math.max(0, 1 - up * up));
  }

  function knock(c, dv = null, spin = null) {
    if (!c || c.dead) return null;
    retire(c);
    c.dead = true;
    const T = VTYPES[c.type] || {}, len = c.len || T.len || 4.4, wid = c.wid || T.wid || 1.8, h = c.h || T.h || 1.5;
    const mass = massOfDims(len, wid, h), hl = len / 2, hw = wid / 2, hh = h / 2;
    const ry = c.ry || 0, fx = Math.cos(ry), fz = -Math.sin(ry), sp = c.parked ? 0 : c.v || 0;
    const w = { type: c.type || 'sedan', len, wid, h, color: paintOf(c.color), seed: c.adSeed ?? (c.id || 0) * 0.137, mass, hl, hw, hh,
      iix: 12 / (mass * (h * h + wid * wid)), iiy: 12 / (mass * (len * len + wid * wid)), iiz: 12 / (mass * (len * len + h * h)),
      p: new THREE.Vector3(c.x, (c.y || 0) + hh, c.z), v: new THREE.Vector3(fx * sp, 0, fz * sp), w: new THREE.Vector3(),
      q: new THREE.Quaternion().setFromEuler(_e.set(0, ry, c.pitch || 0, 'YZX')), sleep: false, still: 0, asleep: 0, born: time,
      fx, fz, fl: hl, fw: hw, ey: hh, mm: null, dentT: 0, src: c };
    if (dv) w.v.add(dv);
    if (spin) w.w.add(spin);
    c.wreck = w;
    list.push(w);
    cnt.knocked++;
    if (list.length > MAX_WRECKS) cull(true);
    return w;
  }

  function removeAt(i) {
    const w = list[i];
    if (w.mm) { w.mm.dispose(); w.mm = null; dentedCount--; }
    list.splice(i, 1); cnt.removed++;
  }
  function cull(force, camera) {
    // oldest sleeping first, then the oldest overall
    let pick = -1;
    for (let i = 0; i < list.length; i++) if (list[i].sleep && (pick < 0 || list[i].born < list[pick].born)) pick = i;
    if (pick < 0 && force) pick = 0;
    if (pick >= 0) removeAt(pick);
  }

  // ---- dents: own geometry copy, vertices near the hit pushed in along the impact direction
  function dent(w, px, py, pz, dx, dy, dz, J) {
    if (!w || !models?.makeMesh || !(J > 0)) return;
    const depth = Math.min(0.55, (J / w.mass) * 0.017);
    if (depth < 0.02) return;
    if (!w.mm) {
      if (dentedCount >= MAX_DENTED) { // the oldest dented wreck goes back to the shared body
        let old = null;
        for (const o of list) if (o.mm && (!old || o.dentT < old.dentT)) old = o;
        if (old) { old.mm.dispose(); old.mm = null; dentedCount--; }
      }
      w.mm = models.makeMesh(w.type, w.color, w.seed);
      if (scene) scene.add(w.mm.mesh);
      dentedCount++;
      const pos = w.mm.g.attributes.position;
      w.mm.adj = null; w.mm.count = pos.count;
    }
    w.dentT = time; cnt.dents++;
    // impact point and direction in the model frame (origin at the floor centre)
    _qi.copy(w.q).invert();
    const ox = w.p.x, oy = w.p.y, oz = w.p.z;
    _v.set(px - ox, py - oy, pz - oz).applyQuaternion(_qi); _v.y += w.hh;
    _n.set(dx, dy, dz).applyQuaternion(_qi);
    if (_n.lengthSq() < 1e-8) return;
    _n.normalize();
    const g = w.mm.g, pos = g.attributes.position, P = pos.array, rad = 0.55 + 1.7 * depth, r2 = rad * rad;
    const touched = [];
    for (let i = 0; i < pos.count; i++) {
      const ex = P[3 * i] - _v.x, ey = P[3 * i + 1] - _v.y, ez = P[3 * i + 2] - _v.z, d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= r2) continue;
      const f = (1 - Math.sqrt(d2) / rad) ** 2;
      // position-hashed crinkle: split vertices at one spot move together
      const h = Math.sin(P[3 * i] * 91.7 + P[3 * i + 1] * 47.3 + P[3 * i + 2] * 13.1) * 0.5 + 0.5;
      const k = depth * f * (0.85 + 0.3 * h);
      P[3 * i] += _n.x * k; P[3 * i + 1] += _n.y * k; P[3 * i + 2] += _n.z * k;
      touched.push(i);
    }
    if (!touched.length) return;
    pos.needsUpdate = true;
    renormal(w.mm, touched);
  }
  function renormal(mm, touched) { // recompute normals of the touched vertices from their triangles
    const g = mm.g, P = g.attributes.position.array, N = g.attributes.normal.array, idx = g.index ? g.index.array : null;
    const nTri = idx ? idx.length / 3 : g.attributes.position.count / 3, corner = (t, k) => idx ? idx[3 * t + k] : 3 * t + k;
    if (!mm.adj) { // vertex -> triangles (CSR)
      const n = g.attributes.position.count, start = new Uint32Array(n + 1);
      for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) start[corner(t, k) + 1]++;
      for (let i = 0; i < n; i++) start[i + 1] += start[i];
      const fill = start.slice(0, n), tris = new Uint32Array(nTri * 3);
      for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) tris[fill[corner(t, k)]++] = t;
      mm.adj = { start, tris };
    }
    const { start, tris } = mm.adj;
    for (const i of touched) {
      let nx = 0, ny = 0, nz = 0;
      for (let q = start[i]; q < start[i + 1]; q++) {
        const t = tris[q], a = corner(t, 0), b = corner(t, 1), c = corner(t, 2);
        const e1x = P[3 * b] - P[3 * a], e1y = P[3 * b + 1] - P[3 * a + 1], e1z = P[3 * b + 2] - P[3 * a + 2];
        const e2x = P[3 * c] - P[3 * a], e2y = P[3 * c + 1] - P[3 * a + 1], e2z = P[3 * c + 2] - P[3 * a + 2];
        nx += e1y * e2z - e1z * e2y; ny += e1z * e2x - e1x * e2z; nz += e1x * e2y - e1y * e2x;
      }
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-9) { N[3 * i] = nx / l; N[3 * i + 1] = ny / l; N[3 * i + 2] = nz / l; }
    }
    g.attributes.normal.needsUpdate = true;
  }

  function shards(x, y, z, vx, vy, vz, sev, colour) {
    if (!debris?.shards || sev < 0.08) return;
    const n = Math.min(26, Math.round(4 + sev * 22));
    try {
      debris.shards(x, y, z, vx * 0.5, vy + 1.5, vz * 0.5, Math.ceil(n * 0.6), GLASS, 0.03, 0.14, 4 + sev * 3, 0.2, 40);
      debris.shards(x, y, z, vx * 0.5, vy + 1, vz * 0.5, Math.ceil(n * 0.4), [paintOf(colour), DARK], 0.08, 0.4, 3 + sev * 2, 0.15, 70);
    } catch (e) { /* debris is optional */ }
  }

  // ---- player ram (the player's car is treated as heavy and keeps most of its speed)
  const res = { dv: new THREE.Vector3(), push: new THREE.Vector3(), hits: 0, knocked: 0, severity: 0 };
  const ov = {};
  let ramId = 0;
  function ram(q) {
    ramId++;
    res.dv.set(0, 0, 0); res.push.set(0, 0, 0); res.hits = 0; res.knocked = 0; res.severity = 0;
    if (!q) return res;
    const vx = q.v?.x || 0, vy = q.v?.y || 0, vz = q.v?.z || 0, M = q.mass || 12000, sp = Math.hypot(vx, vz);
    let lost = 0;
    const hitOne = (tx, tz, tfx, tfz, thl, thw, ovx, ovz, m) => { // -> closing speed and impulse, or null
      if (!boxOverlap(q.x, q.z, q.fx, q.fz, q.hl, q.hw, tx, tz, tfx, tfz, thl, thw, ov)) return null;
      const vc = (vx - ovx) * ov.nx + (vz - ovz) * ov.nz;
      if (vc < RAM_MIN) return null;
      const J = 1.35 * vc / (1 / M + 1 / m);
      const give = Math.min(J / M, 0.6 * vc, Math.max(0, 0.6 * sp - lost));
      lost += give;
      res.dv.x -= ov.nx * give; res.dv.z -= ov.nz * give;
      res.push.x -= ov.nx * ov.depth * 0.5; res.push.z -= ov.nz * ov.depth * 0.5;
      res.hits++;
      res.severity = Math.max(res.severity, Math.min(1, vc / 22) * Math.min(1, Math.max(0.35, m / 1500)));
      return J;
    };
    for (const c of query(q.x, q.z, q.hl + 9, near)) {
      if (c.dead || q.y > c.y + c.h - 0.05 || q.y + q.h < c.y + 0.1) continue;
      const cfx = Math.cos(c.ry), cfz = -Math.sin(c.ry), cv = c.parked ? 0 : c.v;
      const m = massOf(c), J = hitOne(c.x, c.z, cfx, cfz, c.len / 2, c.wid / 2, cfx * cv, cfz * cv, m);
      if (J === null) continue;
      const nx = ov.nx, nz = ov.nz, k = J / m;
      // side offset of the car from the push line spins it; a lift reads as the car being tipped
      const side = (c.x - q.x) * -q.fz + (c.z - q.z) * q.fx;
      const w = knock(c, _t.set(nx * k + vx * 0.08, 0.8 + k * 0.18 + Math.max(0, vy) * 0.3, nz * k + vz * 0.08),
        _u.set((Math.random() - 0.5) * k * 0.25, side * k * 0.12 + (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * k * 0.2));
      if (!w) continue;
      w.ramId = ramId; res.knocked++;
      const ext = c.len / 2 * Math.abs(cfx * nx + cfz * nz) + c.wid / 2 * Math.abs(cfz * nx - cfx * nz);
      const hx = c.x - nx * ext, hy = c.y + c.h * 0.45, hz = c.z - nz * ext;
      dent(w, hx, hy, hz, nx, 0, nz, J);
      shards(hx, hy, hz, w.v.x, w.v.y, w.v.z, Math.min(1, k / 12), c.color);
      cue('carhit', { x: hx, y: hy, z: hz, k });
    }
    for (const w of list) {
      if (w.ramId === ramId) continue;
      if (Math.abs(w.p.x - q.x) > q.hl + w.hl + 2 || Math.abs(w.p.z - q.z) > q.hl + w.hl + 2) continue;
      if (q.y > w.p.y + w.ey - 0.05 || q.y + q.h < w.p.y - w.ey + 0.05) continue;
      const J = hitOne(w.p.x, w.p.z, w.fx, w.fz, w.fl, w.fw, w.v.x, w.v.z, w.mass);
      if (J === null) continue;
      const k = J / w.mass;
      w.v.x += ov.nx * k; w.v.z += ov.nz * k; w.v.y += 0.5 + k * 0.12;
      w.w.y += (Math.random() - 0.5) * k * 0.3; w.w.x += (Math.random() - 0.5) * k * 0.15;
      w.sleep = false; w.still = 0;
      const hx = w.p.x - ov.nx * w.fw, hz = w.p.z - ov.nz * w.fw;
      if (k > 3) dent(w, hx, w.p.y, hz, ov.nx, 0, ov.nz, J);
      if (k > 1) cue('carhit', { x: hx, y: w.p.y, z: hz, k });
      shards(hx, w.p.y, hz, w.v.x, w.v.y, w.v.z, Math.min(1, k / 16), w.color);
    }
    if (res.hits) cnt.rams++;
    return res;
  }

  // ---- simulation step
  const corners = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx, sy, sz]);
  function groundContacts(w, h) {
    let deepest = 0, touching = false;
    for (const [sx, sy, sz] of corners) {
      _r.set(sx * w.hl, sy * w.hh, sz * w.hw).applyQuaternion(w.q);
      const cx = w.p.x + _r.x, cy = w.p.y + _r.y, cz = w.p.z + _r.z;
      const g = groundY(cx, cz, w.p.y + w.ey + 0.5), pen = g - cy;
      if (pen <= 0) continue;
      touching = true;
      if (pen > deepest) deepest = pen;
      // velocity of the corner
      const pvx = w.v.x + w.w.y * _r.z - w.w.z * _r.y, pvy = w.v.y + w.w.z * _r.x - w.w.x * _r.z, pvz = w.v.z + w.w.x * _r.y - w.w.y * _r.x;
      if (pvy >= 0) continue;
      const e = pvy < -2.5 ? 0.3 : 0;
      const jn = -(1 + e) * pvy / kEff(w, _r.x, _r.y, _r.z, 0, 1, 0);
      impulse(w, _r.x, _r.y, _r.z, 0, jn, 0);
      // Coulomb friction against the sliding velocity of the corner
      const tvx = pvx, tvz = pvz, ts = Math.hypot(tvx, tvz);
      if (ts > 1e-4) {
        const tx = tvx / ts, tz = tvz / ts;
        const jt = Math.min(ts / kEff(w, _r.x, _r.y, _r.z, tx, 0, tz), 0.65 * jn);
        impulse(w, _r.x, _r.y, _r.z, -tx * jt, 0, -tz * jt);
      }
    }
    if (deepest > 0) w.p.y += deepest * Math.min(1, 0.5 + h * 30);
    return touching;
  }
  function wreckPairs() {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.sleep && b.sleep) continue;
      const lim = a.hl + b.hl + 0.5;
      if (Math.abs(a.p.x - b.p.x) > lim || Math.abs(a.p.z - b.p.z) > lim || Math.abs(a.p.y - b.p.y) > a.hl + b.hl) continue;
      sphereContacts(a, b);
    }
  }
  const _ca = new THREE.Vector3(), _cb = new THREE.Vector3();
  function sphereContacts(a, b) {
    const ra = Math.min(a.hw, a.hh) * 1.05, rb = Math.min(b.hw, b.hh) * 1.05;
    const na = a.hl > ra ? 3 : 1, nb = b.hl > rb ? 3 : 1;
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
      _ca.set(na === 1 ? 0 : (i - 1) * (a.hl - ra), 0, 0).applyQuaternion(a.q);
      _cb.set(nb === 1 ? 0 : (j - 1) * (b.hl - rb), 0, 0).applyQuaternion(b.q);
      const dx = b.p.x + _cb.x - a.p.x - _ca.x, dy = b.p.y + _cb.y - a.p.y - _ca.y, dz = b.p.z + _cb.z - a.p.z - _ca.z;
      const d = Math.hypot(dx, dy, dz), pen = ra + rb - d;
      if (pen <= 0 || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      const rax = _ca.x + nx * ra, ray = _ca.y + ny * ra, raz = _ca.z + nz * ra;
      const rbx = _cb.x - nx * rb, rby = _cb.y - ny * rb, rbz = _cb.z - nz * rb;
      const vax = a.v.x + a.w.y * raz - a.w.z * ray, vay = a.v.y + a.w.z * rax - a.w.x * raz, vaz = a.v.z + a.w.x * ray - a.w.y * rax;
      const vbx = b.v.x + b.w.y * rbz - b.w.z * rby, vby = b.v.y + b.w.z * rbx - b.w.x * rbz, vbz = b.v.z + b.w.x * rby - b.w.y * rbx;
      const vn = (vbx - vax) * nx + (vby - vay) * ny + (vbz - vaz) * nz;
      const ia = a.sleep ? 0 : 1, ib = b.sleep ? 0 : 1;
      if (vn < 0) {
        const k = kEff(a, rax, ray, raz, nx, ny, nz) + kEff(b, rbx, rby, rbz, nx, ny, nz);
        const J = -1.2 * vn / k;
        if (J / b.mass > 0.6 && b.sleep) { b.sleep = false; b.still = 0; }
        if (J / a.mass > 0.6 && a.sleep) { a.sleep = false; a.still = 0; }
        if (!a.sleep) impulse(a, rax, ray, raz, -nx * J, -ny * J, -nz * J);
        if (!b.sleep) impulse(b, rbx, rby, rbz, nx * J, ny * J, nz * J);
      }
      const sa = ia && ib ? b.mass / (a.mass + b.mass) : ia, sb = ia && ib ? 1 - sa : ib;
      a.p.x -= nx * pen * sa * 0.8; a.p.y -= ny * pen * sa * 0.8; a.p.z -= nz * pen * sa * 0.8;
      b.p.x += nx * pen * sb * 0.8; b.p.y += ny * pen * sb * 0.8; b.p.z += nz * pen * sb * 0.8;
    }
  }
  function bowl(w) { // a moving wreck against live traffic
    const sp2 = w.v.x * w.v.x + w.v.z * w.v.z;
    if (sp2 < 1) return;
    for (const c of query(w.p.x, w.p.z, w.hl + 8, near)) {
      if (c.dead || w.p.y - w.ey > c.y + c.h || w.p.y + w.ey < c.y) continue;
      const cfx = Math.cos(c.ry), cfz = -Math.sin(c.ry);
      if (!boxOverlap(w.p.x, w.p.z, w.fx, w.fz, w.fl, w.fw, c.x, c.z, cfx, cfz, c.len / 2, c.wid / 2, ov)) continue;
      const cv = c.parked ? 0 : c.v, vc = (w.v.x - cfx * cv) * ov.nx + (w.v.z - cfz * cv) * ov.nz;
      const m = massOf(c);
      w.p.x -= ov.nx * ov.depth * 0.6; w.p.z -= ov.nz * ov.depth * 0.6;
      if (vc <= 0) continue;
      const J = 1.3 * vc / (1 / w.mass + 1 / m), k = J / m;
      w.v.x -= ov.nx * J / w.mass; w.v.z -= ov.nz * J / w.mass;
      if (k > BOWL_DV) {
        const o = knock(c, _t.set(ov.nx * k, 0.6 + k * 0.12, ov.nz * k), _u.set((Math.random() - 0.5) * k * 0.2, (Math.random() - 0.5) * k * 0.3, (Math.random() - 0.5) * k * 0.2));
        if (o) {
          const ext = c.len / 2 * Math.abs(cfx * ov.nx + cfz * ov.nz) + c.wid / 2 * Math.abs(cfz * ov.nx - cfx * ov.nz);
          dent(o, c.x - ov.nx * ext, c.y + c.h * 0.4, c.z - ov.nz * ext, ov.nx, 0, ov.nz, J);
          shards(c.x - ov.nx * ext, c.y + c.h * 0.5, c.z - ov.nz * ext, o.v.x, o.v.y, o.v.z, Math.min(1, k / 12), c.color);
          cue('carhit', { x: c.x, y: c.y + c.h * 0.5, z: c.z, k });
        }
      } else if (c.bump) c.bump(k); // a nudge: the live car only brakes
    }
  }
  function statics(w) { // push-out against the city's static solids
    if (!solid?.push) return;
    const r = Math.min(w.hw, w.hh) * 1.05, n = w.hl > r ? 3 : 1;
    for (let i = 0; i < n; i++) {
      _ca.set(n === 1 ? 0 : (i - 1) * (w.hl - r), 0, 0).applyQuaternion(w.q);
      let c = null;
      try { c = solid.push(w.p.x + _ca.x, w.p.y - w.ey, w.p.z + _ca.z, r, w.ey * 2); } catch (e) { c = null; }
      if (!c) continue;
      w.p.x += c.dx || 0; w.p.z += c.dz || 0;
      const nx = c.nx || 0, nz = c.nz || 0, vn = w.v.x * nx + w.v.z * nz;
      if (vn < 0) { w.v.x -= nx * vn * 1.3; w.v.z -= nz * vn * 1.3; w.w.y += (Math.random() - 0.5) * Math.min(3, -vn * 0.3); }
    }
  }

  function update(dt, camera) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1); time += dt;
    if (!list.length) return;
    const steps = Math.ceil(dt / (1 / 90)), h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const w of list) {
        if (w.sleep) continue;
        w.v.y -= G * h;
        w.p.addScaledVector(w.v, h);
        const wl = w.w.length();
        if (wl > 1e-6) { // integrate orientation
          _qi.setFromAxisAngle(_v.copy(w.w).divideScalar(wl), wl * h);
          w.q.premultiply(_qi).normalize();
        }
        const touching = groundContacts(w, h);
        const damp = touching ? 1 - Math.min(0.5, 1.6 * h) : 1 - 0.05 * h;
        w.w.multiplyScalar(damp); if (touching) { w.v.x *= 1 - 0.4 * h; w.v.z *= 1 - 0.4 * h; }
        refresh(w);
      }
      if (list.length > 1) wreckPairs();
    }
    const cp = camera?.position;
    for (let i = list.length - 1; i >= 0; i--) {
      const w = list[i];
      if (!w.sleep) {
        statics(w); bowl(w);
        if (w.v.lengthSq() < SLEEP_V * SLEEP_V && w.w.lengthSq() < SLEEP_W * SLEEP_W) { w.still += dt; if (w.still > SLEEP_AFTER) { w.sleep = true; w.asleep = 0; w.v.set(0, 0, 0); w.w.set(0, 0, 0); } }
        else w.still = 0;
        if (w.p.y < -200 || !Number.isFinite(w.p.x + w.p.y + w.p.z)) { removeAt(i); continue; }
      } else {
        w.asleep += dt;
        if (w.asleep > 25 && cp) {
          const d = Math.hypot(w.p.x - cp.x, w.p.z - cp.z);
          if (d > 150 || !w.visible) { removeAt(i); continue; }
        }
      }
    }
  }

  function draw(fleet, camera, frustum) {
    const cp = camera?.position;
    for (const w of list) {
      _v.set(0, -w.hh, 0).applyQuaternion(w.q).add(w.p);
      _m.compose(_v, w.q, _s1);
      const d = cp ? Math.hypot(w.p.x - cp.x, w.p.y - cp.y, w.p.z - cp.z) : 0;
      _sph.center.copy(w.p); _sph.radius = w.hl + 1;
      w.visible = !frustum || frustum.intersectsSphere(_sph);
      if (w.mm) {
        w.mm.mesh.instanceMatrix.array.set(_m.elements); w.mm.mesh.instanceMatrix.needsUpdate = true;
        w.mm.mesh.visible = w.visible;
      } else if (fleet && w.visible && d < 700) fleet.add(w.type, d < 45 ? 0 : d < 170 ? 1 : 2, _m.elements, w.color, 0, w.seed);
    }
  }

  // player push-out against wrecks (collideDynamic): accumulates into acc { x, z, n, top, vel }
  function collide(pos, r, h, acc) {
    for (const w of list) {
      if (Math.abs(w.p.x - pos.x) > w.hl + r + 1 || Math.abs(w.p.z - pos.z) > w.hl + r + 1) continue;
      const top = w.p.y + w.ey, bot = w.p.y - w.ey;
      if (pos.y + h < bot || pos.y > top + 0.4) continue;
      const dx = pos.x - w.p.x, dz = pos.z - w.p.z, lx = dx * w.fx + dz * w.fz, lz = -dx * w.fz + dz * w.fx;
      if (pos.y > top - 0.35) { // on (or just above) the wreck: support
        if (Math.abs(lx) < w.fl + r * 0.3 && Math.abs(lz) < w.fw + r * 0.3 && top > acc.top) { acc.top = top; acc.vel = w.v; }
        continue;
      }
      pushBox(lx, lz, w.fx, w.fz, w.fl, w.fw, r, acc);
    }
  }

  return {
    list, knock, ram, dent, massOf, update, draw, collide,
    setSolid(s) { solid = s || null; },
    setDebris(d) { debris = d || null; },
    stats: () => ({ wrecks: list.length, awake: list.filter(w => !w.sleep).length, dented: dentedCount, ...cnt }),
    clear() { while (list.length) removeAt(list.length - 1); },
  };
}

// circle (radius r at local lx, lz of a box with forward f, half sizes hl, hw) push-out, added to acc { x, z, n }
export function pushBox(lx, lz, fx, fz, hl, hw, r, acc) {
  let px, pz;
  if (Math.abs(lx) < hl && Math.abs(lz) < hw) { // centre inside: out along the nearest face
    const ex = hl - Math.abs(lx), ez = hw - Math.abs(lz);
    if (ex < ez) { px = Math.sign(lx || 1) * (ex + r); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (ez + r); }
  } else {
    const cx = Math.max(-hl, Math.min(hl, lx)), cz = Math.max(-hw, Math.min(hw, lz)), ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
    if (d >= r || d < 1e-6) return false;
    px = ex / d * (r - d); pz = ez / d * (r - d);
  }
  acc.x += px * fx - pz * fz; acc.z += px * fz + pz * fx; acc.n++;
  return true;
}
