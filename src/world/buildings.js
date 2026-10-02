// OSM building generator: map.buildings footprints (true polygons with courtyards, any orientation) -> facade walls,
// flat / pitched roofs, rooftop machine rooms and stair exits, building parts with domes, canopies; accumulated per
// 256 m tile into a FacadeBuilder (facade material) and a MeshBuilder (detail material, DP parts). Collision solids and
// roof-edge anchors are emitted from the same numbers in the same pass.
//
// Exports
//   buildBuildings({ map, solids, zips, heightAt, skip, dress, tile = 256, overhangFlag = 1 }) -> result
//   buildBuildingsAsync({ ...same, sliceMs = 40, onProgress(f) }) -> Promise<result>  (time-sliced, yields between slices)
//     map.buildings[]: { id, p:[x0,z0,...], holes?, k, lv, h?, mh?, rs?, rc?, bc?, tint?, mat?, f?, name?, bt?, am?, parts? }
//     heightAt(x, z) -> terrain y            skip: Set of ids replaced by hand-made landmarks (not emitted)
//     dress({ t, S, Z, b, A, outer, holes, base, H, r, pitched }) optional per-building hook (facade kit); S / Z are
//       the solids / zips arguments as given, t the building's tile
//     solids: collision sink, either
//       - an object with legacy-style methods (as Oleg's modules call them):
//           box(x0, y0, z0, x1, y1, z1, kind)                         axis-aligned box
//           prism(poly, y0, a, bx, bz, kind, flags)                   convex prism: poly flat [x0,z0,x1,z1,...] with
//             positive map area (outward edge normal (dz,-dx)); top plane y = a + bx*x + bz*z (bx = bz = 0: flat top a)
//           cyl(x, z, y0, y1, r0, r1, kind)                           upright frustum
//       - or a function receiving records:
//           { type:'box', min:[x,y,z], max:[x,y,z], kind, id }
//           { type:'prism', poly:[x0,z0,...], y0, y1, plane:{a,bx,bz}|null, kind, overhang, id }   (y1 = highest top)
//           { type:'cyl', x, z, y0, y1, r0, r1, kind, id }
//       kinds: 'wall' (building mass), 'roof' (pitched roof pieces / domes), 'bulkhead' (roof machine rooms / exits),
//       'awning' (canopy slabs, overhang: true / flags = overhangFlag), 'pole'. Rectangles aligned to the map frame
//       come as boxes, everything else as convex pieces of the footprint (holes respected).
//     zips: anchor sink, object with edge(ax, az, bx, bz, y, nx, nz, kind) or function({type:'edge', a:[x,z], b:[x,z],
//       y, n:[nx,nz], kind}); roof edges >= 3 m of buildings taller than 5 m, 12 cm inboard, at the roof top
//   result = { tiles: Map<key, {fac, det, cx, cz, i, j}>, footprints: [{poly:[[x,z]..], h, kind, name, id}],
//              boxes: [{min: Vector3, max: Vector3, id}], landmarks: [{name, x, z, h}], stats }
//     tiles: fac.build() -> facade geometry | null, det.v ? det.build({part: true}) : skip  (kit/batch.js batchTiles)
//   DP, createDetailMaterial   re-exported from ./materials.js;  TILE = 256
//   archetype(b, r) -> A        the per-building style record (exported for tests / the facade kit)
import * as THREE from 'three';
import { MeshBuilder, hexLin, orient, ringArea2, triangulateRings } from '../kit/mesh.js';
import { FacadeBuilder, STYLE, LAYER } from './facade.js';
import { DP } from './materials.js';

export { DP, createDetailMaterial } from './materials.js';
export const TILE = 256;

// ---------------------------------------------------------------------------------------------- small geometry
// ring edges as [a, b, length, index] (closing edge included)
const edgesOf = (R) => R.map((a, i) => { const b = R[i === R.length - 1 ? 0 : i + 1]; return [a, b, Math.hypot(b[0] - a[0], b[1] - a[1]), i]; });
function toPts(flat) {
  const pts = [];
  for (let k = 1; k < flat.length; k += 2) { const x = flat[k - 1], z = flat[k]; if (Number.isFinite(x + z)) pts.push([x, z]); }
  return pts;
}
const near = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) < 0.07;
function cleanRing(P) { // drop repeated points (and a closing duplicate)
  const out = P.filter((p, i) => i === 0 || !near(p, P[i - 1]));
  while (out.length > 2 && near(out[0], out[out.length - 1])) out.pop();
  return out;
}
// z-component of (b - a) x (c - a) in the map sense: > 0 turns left on a positive-area ring
const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
// b bulges inward from the chord a-c by less than 15 cm: close enough to convex for a collision piece
const bendOk = (a, b, c) => turn(a, b, c) >= -0.15 * Math.hypot(c[0] - a[0], c[1] - a[1]);
const isConvex = (R) => R.every((p, i) => bendOk(p, R[(i + 1) % R.length], R[(i + 2) % R.length]));
export function inRing(R, x, z) { // crossing count of a ray toward +x
  let odd = false, prev = R[R.length - 1];
  for (const cur of R) {
    const dz = cur[1] - prev[1];
    if ((cur[1] > z) !== (prev[1] > z) && x < prev[0] + ((z - prev[1]) / dz) * (cur[0] - prev[0])) odd = !odd;
    prev = cur;
  }
  return odd;
}
function bboxOf(R) {
  const xs = R.map((p) => p[0]), zs = R.map((p) => p[1]);
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
}
function areaCentroid(R) {
  let a2 = 0, sx = 0, sz = 0;
  for (const [p, q] of edgesOf(R)) { const w = p[0] * q[1] - q[0] * p[1]; a2 += w; sx += (p[0] + q[0]) * w; sz += (p[1] + q[1]) * w; }
  if (Math.abs(a2) > 1e-9) return [sx / (3 * a2), sz / (3 * a2)];
  const bb = bboxOf(R);
  return [(bb.x0 + bb.x1) / 2, (bb.z0 + bb.z1) / 2];
}
// stable point inside the footprint (decides the tile): area centroid, else the centre of the biggest triangle
function interiorPoint(outer, holes) {
  const c = areaCentroid(outer);
  if (inRing(outer, c[0], c[1]) && !holes.some((h) => inRing(h, c[0], c[1]))) return c;
  const T = triangulateRings(outer, holes);
  let best = c, bestA = 0;
  for (let t = 0; T && t < T.idx.length; t += 3) {
    const [p, q, w] = [T.idx[t], T.idx[t + 1], T.idx[t + 2]].map((i) => T.pts[i]), ar = Math.abs(turn(p, q, w));
    if (ar > bestA) { bestA = ar; best = [(p[0] + q[0] + w[0]) / 3, (p[1] + q[1] + w[1]) / 3]; }
  }
  return best;
}
// convex hull, positive map area (monotone chain over x-sorted points)
function hull(P) {
  const S = [...P].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  if (S.length < 3) return S;
  const chain = (list) => list.reduce((H, p) => { while (H.length >= 2 && turn(H.at(-2), H.at(-1), p) <= 0) H.pop(); H.push(p); return H; }, []);
  const lower = chain(S), upper = chain(S.reverse());
  const H = lower.slice(0, -1).concat(upper.slice(0, -1));
  return ringArea2(H) < 0 ? H.reverse() : H;
}
// minimum-area enclosing rectangle over the hull edge directions: { cx, cz, ux, uz (long axis), L, W, area }
export function minRect(P) {
  const H = hull(P);
  if (H.length < 3) return null;
  let best = null;
  for (const [p, q, len] of edgesOf(H)) {
    if (len < 1e-3) continue;
    const dx = (q[0] - p[0]) / len, dz = (q[1] - p[1]) / len;
    const along = H.map((h) => h[0] * dx + h[1] * dz), across = H.map((h) => h[1] * dx - h[0] * dz);
    const lo = [Math.min(...along), Math.min(...across)], hi = [Math.max(...along), Math.max(...across)];
    const area = (hi[0] - lo[0]) * (hi[1] - lo[1]);
    if (!best || area < best.area) best = { area, dx, dz, lo, hi };
  }
  if (!best) return null;
  const { dx, dz, lo, hi, area } = best, ma = (lo[0] + hi[0]) / 2, mc = (lo[1] + hi[1]) / 2, ea = hi[0] - lo[0], ec = hi[1] - lo[1];
  const cx = ma * dx - mc * dz, cz = ma * dz + mc * dx;
  return ea >= ec ? { cx, cz, ux: dx, uz: dz, L: ea, W: ec, area } : { cx, cz, ux: -dz, uz: dx, L: ec, W: ea, area };
}
// convex pieces of a polygon with holes: triangulate, then grow each piece across neighbouring triangles while convex
export function convexPieces(outer, holes = []) {
  const O = orient(outer, true);
  if (!holes.length && isConvex(O)) return [O];
  const T = triangulateRings(outer, holes);
  if (!T) return [];
  const P = T.pts, tris = [];
  for (let t = 0; t < T.idx.length; t += 3) {
    const [i, j, k] = [T.idx[t], T.idx[t + 1], T.idx[t + 2]], s = turn(P[i], P[j], P[k]);
    if (Math.abs(s) > 1e-8) tris.push(s > 0 ? [i, j, k] : [i, k, j]);
  }
  const owner = new Map(); // directed edge "a>b" -> triangle
  tris.forEach((tr, ti) => tr.forEach((v, e) => owner.set(v + '>' + tr[(e + 1) % 3], ti)));
  const taken = new Uint8Array(tris.length), pieces = [];
  tris.forEach((seed, si) => {
    if (taken[si]) return;
    taken[si] = 1;
    const poly = [...seed];
    const growOnce = () => {
      const m = poly.length;
      for (let e = 0; e < m; e++) {
        const a = poly[e], b = poly[(e + 1) % m], ti = owner.get(b + '>' + a);
        if (ti === undefined || taken[ti]) continue;
        const w = tris[ti].find((v) => v !== a && v !== b), before = poly[(e + m - 1) % m], after = poly[(e + 2) % m];
        if (bendOk(P[before], P[a], P[w]) && bendOk(P[a], P[w], P[b]) && bendOk(P[w], P[b], P[after])) { poly.splice(e + 1, 0, w); taken[ti] = 1; return true; }
      }
      return false;
    };
    while (poly.length < 12 && growOnce());
    pieces.push(poly.map((v) => P[v]));
  });
  return pieces;
}
// frame-aligned rectangle -> its bbox, else null
const alignedRect = (R) => (R.length === 4 && edgesOf(R).every(([a, b]) => Math.min(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) <= 0.05) ? bboxOf(R) : null);
// seeded generator (xorshift-multiply), deterministic per building id
function seeded(id) {
  let s = (Math.imul(id | 0, 0x9e3779b1) ^ Math.floor(id / 4294967296) ^ 0x5bd1e995) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const choose = (r, opts) => { let tot = 0; for (const o of opts) tot += o[0]; let x = r() * tot; for (const o of opts) { x -= o[0]; if (x <= 0) return o[1]; } return opts[opts.length - 1][1]; };

// ---------------------------------------------------------------------------------------------- typology
// wall looks: [layer, tint] – tints multiply the layer's albedo (plaster colours come mostly from the tint)
const LOOK = {
  silicate: [LAYER.WHITE, [1.0, 0.99, 0.95]], panel: [LAYER.CONCRETE, [1.18, 1.17, 1.13]], panelWarm: [LAYER.CONCRETE, [1.2, 1.13, 1.0]],
  panelBlue: [LAYER.CONCRETE, [0.95, 1.02, 1.1]], yellowBrick: [LAYER.BUFF, [1.0, 0.97, 0.9]], redBrick: [LAYER.RED2, [0.96, 0.92, 0.9]],
  cream: [LAYER.STUCCO, [1.08, 1.0, 0.82]], beige: [LAYER.STUCCO, [1.02, 0.94, 0.8]], greige: [LAYER.STUCCO, [0.95, 0.93, 0.87]],
  ochre: [LAYER.STUCCO, [1.1, 0.88, 0.58]], white: [LAYER.STUCCO, [1.08, 1.07, 1.03]], paleBlue: [LAYER.STUCCO, [0.84, 0.94, 1.06]],
  paleYellow: [LAYER.STUCCO, [1.1, 1.02, 0.72]], peach: [LAYER.STUCCO, [1.1, 0.9, 0.76]], mint: [LAYER.STUCCO, [0.86, 1.04, 0.84]],
  terra: [LAYER.TERRA, [1, 0.96, 0.92]], lime: [LAYER.LIME, [1, 0.98, 0.94]], metal: [LAYER.METAL, [1.35, 1.38, 1.42]],
  metalBlue: [LAYER.METAL, [1.0, 1.25, 1.65]], churchWhite: [LAYER.STUCCO, [1.1, 1.06, 0.95]],
};
const ROOF_TONES = [[4, '#6d2c2a'], [1.5, '#5a3b2d'], [1, '#3e5e46'], [1.2, '#3c3e42'], [0.6, '#304f78'], [3, '#8c8f8b']];

export function archetype(b, r) {
  const lv = Math.max(1, Math.min(60, b.lv | 0 || 1));
  const A = { lv, floorH: 3, bayW: 3.1, winW: 0.46, winH: 0.52, plinth: 0.6, parapet: 0.6, gH: 0, style: STYLE.PUNCHED, resid: 0, lintel: 0, glass: 0, depth: 0.15, margin: 0.7, base: LAYER.CONCRETE, roof: 'flat', machine: false, stairs: false };
  let look;
  switch (b.k) {
    case 'apt':
      A.resid = 1;
      if (lv <= 3) { // pre-war / Stalin-era low blocks, 2-storey barracks
        look = choose(r, [[3, LOOK.cream], [2, LOOK.beige], [1, LOOK.greige], [1, LOOK.ochre], [1, LOOK.redBrick], [1, LOOK.yellowBrick]]);
        Object.assign(A, { floorH: 3.3, bayW: 3.2, winW: 0.42, winH: 0.58, plinth: 0.9, lintel: 1 + (r() < 0.4 ? 1 : 0), base: LAYER.GRANITE, depth: 0.24 });
        if (r() < 0.5) Object.assign(A, { roof: 'hip', roofCol: choose(r, [[2, '#8e9296'], [1, '#6b2f2a'], [1, '#3f6147']]), pitch: 0.36, overhang: 0.35 });
      } else if (lv <= 5) { // five-storey khrushchevka
        look = choose(r, [[4, LOOK.silicate], [3, LOOK.panel], [2, LOOK.yellowBrick], [1, LOOK.panelWarm], [0.6, LOOK.cream]]);
        Object.assign(A, { floorH: 2.75, bayW: 3.2, winW: 0.45, winH: 0.53, plinth: 0.8, depth: 0.14, stairs: true });
        if ((look === LOOK.silicate || look === LOOK.yellowBrick) && r() < 0.45) Object.assign(A, { roof: 'gable', roofCol: '#8c8f8b', pitch: 0.2, overhang: 0.3 });
      } else if (lv <= 11) { // nine / ten storey slabs
        look = choose(r, [[4, LOOK.panel], [3, LOOK.silicate], [1.5, LOOK.panelWarm], [1.5, LOOK.redBrick], [0.7, LOOK.panelBlue]]);
        Object.assign(A, { floorH: 2.8, bayW: 3.3, winW: 0.46, winH: 0.53, plinth: 1.2, parapet: 0.9, depth: 0.13, machine: true });
      } else { // point towers, new residential complexes
        const modern = lv >= 17 || r() < 0.3;
        look = modern ? choose(r, [[2, LOOK.beige], [1, LOOK.terra], [1, LOOK.cream], [1, LOOK.greige]]) : choose(r, [[3, LOOK.panel], [2, LOOK.silicate], [1, LOOK.redBrick]]);
        Object.assign(A, { floorH: modern ? 3.05 : 2.85, bayW: modern ? 2.8 : 3.2, winW: modern ? 0.56 : 0.46, winH: modern ? 0.6 : 0.53, plinth: 1.2, parapet: 1.0, depth: 0.15, machine: true });
        if (modern && r() < 0.3) Object.assign(A, { style: STYLE.CURTAIN, glass: 1 });
      }
      break;
    case 'house':
      A.resid = 1;
      look = choose(r, [[3, LOOK.white], [1.5, LOOK.paleBlue], [1.5, LOOK.paleYellow], [2, LOOK.beige], [1, LOOK.peach], [2, LOOK.yellowBrick], [1, LOOK.silicate], [1, LOOK.redBrick], [0.6, LOOK.mint]]);
      Object.assign(A, { floorH: 2.9, bayW: 3.4, winW: 0.4, winH: 0.5, plinth: 0.5, parapet: 0, margin: 0.9, depth: 0.14 });
      Object.assign(A, { roof: r() < 0.6 ? 'hip' : 'gable', roofCol: choose(r, ROOF_TONES), pitch: 0.55 + r() * 0.25, overhang: 0.4 });
      break;
    case 'public': {
      const edu = /school|kindergarten|college|university/.test((b.bt ?? '') + ' ' + (b.am ?? ''));
      look = edu ? choose(r, [[1, LOOK.paleYellow], [1, LOOK.mint], [1, LOOK.peach], [1, LOOK.paleBlue]])
        : choose(r, [[3, LOOK.panel], [2, LOOK.greige], [1.5, LOOK.silicate], [1, LOOK.lime], [1, LOOK.cream], [1, LOOK.yellowBrick]]);
      Object.assign(A, { floorH: 3.5, bayW: 3.2, winW: 0.55, winH: 0.56, plinth: 0.6, parapet: 0.9, depth: 0.16, machine: lv >= 8 });
      if (!edu && r() < 0.35) Object.assign(A, { style: STYLE.RIBBON, winH: 0.45 });
      if (b.mat === 'glass') Object.assign(A, { style: STYLE.CURTAIN, glass: 1 });
      if (lv <= 2 && r() < 0.25) Object.assign(A, { roof: 'hip', roofCol: choose(r, [[2, '#8e9296'], [1, '#6b2f2a']]), pitch: 0.3, overhang: 0.4 });
      break;
    }
    case 'indus':
      look = choose(r, [[4, LOOK.panel], [2, LOOK.silicate], [1, LOOK.yellowBrick], [0.7, LOOK.metal], [0.4, LOOK.metalBlue]]);
      Object.assign(A, { floorH: 5.5, bayW: 6, winW: 0.62, winH: 0.32, plinth: 0.3, parapet: 0.6, style: r() < 0.5 ? STYLE.RIBBON : STYLE.BLANK, depth: 0.1 });
      break;
    case 'garage':
      look = choose(r, [[4, LOOK.silicate], [1, LOOK.yellowBrick], [1, LOOK.panel]]);
      Object.assign(A, { floorH: 2.5, plinth: 0, parapet: 0.15, style: STYLE.BLANK });
      break;
    case 'shed':
      look = choose(r, [[3, LOOK.white], [2, LOOK.silicate], [1, LOOK.yellowBrick], [1, [LAYER.METAL, [0.72, 0.74, 0.72]]]]);
      Object.assign(A, { floorH: 2.4, plinth: 0.2, parapet: 0, style: STYLE.BLANK });
      if (r() < 0.5 && (b.area ?? 20) > 12) Object.assign(A, { roof: 'gable', roofCol: choose(r, ROOF_TONES), pitch: 0.4, overhang: 0.2 });
      break;
    case 'church':
      look = LOOK.churchWhite;
      Object.assign(A, { floorH: 5, bayW: 4, winW: 0.3, winH: 0.55, plinth: 0.8, parapet: 0.8, lintel: 2, depth: 0.3 });
      break;
    default: // ruins, construction sites, anything unknown
      look = LOOK.panel; Object.assign(A, { floorH: 3, style: STYLE.BLANK });
  }
  A.layer = look[0];
  A.tint = look[1].map((v) => v * (0.94 + r() * 0.1));
  if (b.bc) { A.layer = LAYER.STUCCO; A.tint = hexLin(b.bc).map((v) => 0.3 + Math.pow(v, 0.45) * 0.85); }
  if (b.tint) { A.layer = LAYER.STUCCO; A.tint = b.tint; } // a measured wall colour (cherkasy/proxies.js), as is
  if (b.rc) A.roofCol = b.rc;
  if (b.rs) {
    if (/^(gabled|saltbox)$/.test(b.rs)) A.roof = 'gable';
    else if (/^(hipped|pyramidal|half-hipped|hipped-and-gabled|mansard)$/.test(b.rs)) A.roof = 'hip';
    else if (b.rs === 'flat') A.roof = 'flat';
    if (A.roof !== 'flat') { A.roofCol ??= '#8c8f8b'; A.pitch ??= 0.45; A.overhang ??= 0.3; }
  }
  return A;
}

// ---------------------------------------------------------------------------------------------- sinks
function solidSink(S, overhangFlag) {
  const out = { n: 0, id: 0 };
  const send = typeof S === 'function' ? (rec) => { out.n++; S({ ...rec, id: out.id }); } : null;
  const call = (name, ...args) => { out.n++; S?.[name]?.(...args); };
  out.box = (ax, ay, az, bx, by, bz, kind) => (send ? send({ type: 'box', min: [ax, ay, az], max: [bx, by, bz], kind }) : call('box', ax, ay, az, bx, by, bz, kind));
  // R: [[x,z]..] convex with positive area; plane: sloped top {a, bx, bz} or null for a flat top at y1
  out.prism = (R, y0, y1, plane, kind, overhang = false) => {
    const poly = R.flat(), flag = overhang ? overhangFlag : 0;
    if (send) return send({ type: 'prism', poly, y0, y1, plane, kind, overhang });
    return plane ? call('prism', poly, y0, plane.a, plane.bx, plane.bz, kind, flag) : call('prism', poly, y0, y1, 0, 0, kind, flag);
  };
  out.cyl = (x, z, y0, y1, rBot, rTop, kind) => (send ? send({ type: 'cyl', x, z, y0, y1, r0: rBot, r1: rTop, kind }) : call('cyl', x, z, y0, y1, rBot, rTop, kind));
  return out;
}
function anchorSink(Z) {
  if (typeof Z === 'function') return (a, b, y, n, kind) => Z({ type: 'edge', a, b, y, n, kind });
  return (a, b, y, n, kind) => Z?.edge?.(a[0], a[1], b[0], b[1], y, n[0], n[1], kind);
}

// ---------------------------------------------------------------------------------------------- emitters
// footprint volume: an aligned box when the ring is a frame-aligned rectangle, else convex prisms
function massSolids(E, outer, holes, y0, y1, kind) {
  const bb = holes.length ? null : alignedRect(outer);
  if (bb) E.box(bb.x0, y0, bb.z0, bb.x1, y1, bb.z1, kind);
  else convexPieces(outer, holes).forEach((piece) => E.prism(piece, y0, y1, null, kind));
}
function roofAnchors(emit, rings, y) {
  for (const R of rings) for (const [p, q, len] of edgesOf(R)) {
    if (len < 3) continue;
    const n = [(q[1] - p[1]) / len, (p[0] - q[0]) / len], inb = (v) => [v[0] - n[0] * 0.12, v[1] - n[1] * 0.12];
    emit(inb(p), inb(q), y, n, 'roofEdge');
  }
}
// oriented block on a roof (machine room, stair exit): facade walls + cap, collision piece
function roofBlock(F, E, cx, cz, ux, uz, hl, hw, y0, y1, p) {
  const corner = (sa, sb) => [cx + ux * hl * sa - uz * hw * sb, cz + uz * hl * sa + ux * hw * sb];
  const R = orient([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], true);
  for (const [a, b] of edgesOf(R)) F.wall(a[0], a[1], b[0], b[1], y0, y1, p, STYLE.BLANK, -0.01);
  F.fill(R, [], y1, { ...p, layer: LAYER.ROOF_MEMBRANE, tint: [0.55, 0.55, 0.56] });
  massSolids(E, R, [], y0, y1, 'bulkhead');
}
function planeThrough(p, q, s) { // y = a + bx x + bz z through three [x,y,z]
  const P = new THREE.Vector3(...p), n = new THREE.Vector3(...q).sub(P).cross(new THREE.Vector3(...s).sub(P));
  if (Math.abs(n.y) < 1e-9) return null;
  if (n.y < 0) n.negate();
  const bx = -n.x / n.y, bz = -n.z / n.y;
  return { a: P.y - bx * P.x - bz * P.z, bx, bz, n: n.normalize() };
}
// gable / hip roof over the footprint's minimum rectangle; returns the ridge height
function pitchedRoof(t, E, o, eave, A, wallP) {
  const D = t.det, ov = A.overhang ?? 0.3, hl = o.L / 2 + ov, hw = o.W / 2 + ov;
  const rise = Math.min(6, (o.W / 2) * (A.pitch ?? 0.5)), slope = rise / (o.W / 2);
  const yE = eave - ov * slope, yR = eave + rise;
  const { cx, cz, ux, uz } = o, vx = -uz, vz = ux;
  const W = (s, q, y) => [cx + ux * s + vx * q, y, cz + uz * s + vz * q];
  const hip = A.roof === 'hip', rl = hip ? Math.max(0, hl - hw) : hl;
  const grey = /^#8[ce]9/.test(A.roofCol ?? '#8c8f8b');
  D.setPart(grey ? DP.GALV : DP.PAINT).setColor(hexLin(A.roofCol ?? '#8c8f8b'));
  const faces = [];
  for (const sg of [-1, 1]) faces.push([W(-hl, sg * hw, yE), W(hl, sg * hw, yE), W(rl, 0, yR), W(-rl, 0, yR)]);
  if (hip) for (const sg of [-1, 1]) faces.push([W(sg * hl, -hw, yE), W(sg * hl, hw, yE), W(sg * rl, 0, yR)]);
  for (const f of faces) {
    const Q = f.filter((p, i) => i === 0 || Math.hypot(p[0] - f[i - 1][0], p[2] - f[i - 1][2]) > 1e-3);
    if (Q.length < 3) continue;
    const pl = planeThrough(Q[0], Q[1], Q[2]); if (!pl) continue;
    D.face(Q, [pl.n.x, pl.n.y, pl.n.z]);
    E.prism(orient(Q.map((p) => [p[0], p[2]]), true), yE - 0.25, yR, { a: pl.a, bx: pl.bx, bz: pl.bz }, 'roof');
  }
  // soffit under the overhang (seen from the street)
  D.setPart(DP.PAINT).setColor(hexLin('#5b5a57')).face([W(-hl, -hw, yE - 0.02), W(hl, -hw, yE - 0.02), W(hl, hw, yE - 0.02), W(-hl, hw, yE - 0.02)], [0, -1, 0]);
  if (!hip) for (const sg of [-1, 1]) { // gable ends in the wall material
    const s = sg * o.L / 2, a = W(s, -o.W / 2, eave), b = W(s, o.W / 2, eave), c = W(s, 0, yR);
    t.fac.poly([a, b, c], [ux * sg, 0, uz * sg], { ...wallP, baseY: eave, topY: yR }, STYLE.BLANK);
  }
  return yR;
}
// onion / helmet dome on a building part (+ cross), collision as a frustum
function dome(t, E, cx, cz, r, y0, h, col, onion) {
  const D = t.det;
  // onion: bulge to 1.22 r at 40 % height, then a pointed taper; helmet: quarter ellipse
  const radius = (f) => (onion ? (f < 0.4 ? 1 + 0.22 * Math.sin((f / 0.4) * Math.PI) : 1.22 * Math.pow(Math.max(0, Math.cos(((f - 0.4) / 0.6) * Math.PI / 2)), 1.25)) : Math.cos((f * Math.PI) / 2));
  const prof = Array.from({ length: 11 }, (_, i) => [Math.max(0, r * radius(i / 10)), y0 + h * (onion ? i / 10 : Math.sin((i / 20) * Math.PI))]);
  D.setPart(DP.STEEL).setColor(col).lathe(prof, 16, cx, cz);
  const k = Math.max(0.6, r / 4), top = y0 + h;
  D.setColor(hexLin('#c9a24a')).box(cx - 0.08, top, cz - 0.08, cx + 0.08, top + 2.2 * k, cz + 0.08).box(cx - 0.6 * k, top + 1.3 * k, cz - 0.07, cx + 0.6 * k, top + 1.45 * k, cz + 0.07);
  E.cyl(cx, cz, y0, top, r * (onion ? 1.1 : 1), r * 0.1, 'roof');
}

// ---------------------------------------------------------------------------------------------- main
function* generate(o) {
  const { map, solids, zips, heightAt = () => 0, skip = null, dress = null, tile = TILE, overhangFlag = 1 } = o;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const E = solidSink(solids, overhangFlag), anchor = anchorSink(zips);
  const tiles = new Map(), footprints = [], boxes = [], landmarks = [];
  const stats = { buildings: 0, skipped: 0, invalid: 0, kinds: {}, solids: 0, tiles: 0, ms: 0, dressErrors: 0 };
  const tileAt = (x, z) => {
    const i = Math.floor(x / tile), j = Math.floor(z / tile), key = i + ',' + j;
    let t = tiles.get(key);
    if (!t) tiles.set(key, (t = { key, i, j, cx: (i + 0.5) * tile, cz: (j + 0.5) * tile, fac: new FacadeBuilder(), det: new MeshBuilder() }));
    return t;
  };
  const list = map.buildings ?? [];
  for (let bi = 0; bi < list.length; bi++) {
    if (bi % 400 === 399) yield bi;
    const b = list[bi];
    if (skip && skip.has(b.id)) { stats.skipped++; continue; }
    const outer = orient(cleanRing(toPts(b.p ?? [])), true);
    if (outer.length < 3 || Math.abs(ringArea2(outer)) < 1) { stats.invalid++; continue; }
    const holes = (b.holes ?? []).map((h) => cleanRing(toPts(h))).filter((h) => h.length >= 3 && Math.abs(ringArea2(h)) > 0.5).map((h) => orient(h, false));
    E.id = b.id;
    try {
      emitBuilding(b, outer, holes);
    } catch (e) {
      stats.invalid++;
      if (stats.invalid < 5) console.warn('[buildings] skipped', b.id, e);
    }
  }
  stats.solids = E.n; stats.tiles = tiles.size;
  stats.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return { tiles, footprints, boxes, landmarks, stats };

  function emitBuilding(b, outer, holes) {
    const r = seeded(b.id);
    b.area = Math.abs(ringArea2(outer)) / 2 - holes.reduce((s, h) => s + Math.abs(ringArea2(h)) / 2, 0);
    const A = archetype(b, r);
    const [ix, iz] = interiorPoint(outer, holes);
    const t = tileAt(ix, iz), F = t.fac;
    // relief: the grid counts from the mean ground (+ kerb), walls reach below the lowest corner
    let gMin = heightAt(ix, iz), gSum = gMin;
    for (const [x, z] of outer) { const h = heightAt(x, z); gSum += h; if (h < gMin) gMin = h; }
    const g0 = gSum / (outer.length + 1) + 0.15, yB = gMin - 0.3;
    stats.buildings++; stats.kinds[b.k] = (stats.kinds[b.k] || 0) + 1;
    const seed = b.id % 251;
    const FACADE_KEYS = ['floorH', 'bayW', 'winW', 'winH', 'layer', 'base', 'resid', 'lintel', 'glass', 'depth', 'margin', 'tint', 'plinth'];
    const facadeOf = Object.fromEntries(FACADE_KEYS.map((key) => [key, A[key]]));
    const wallP = (floorLine, top, extra = {}) => Object.assign({}, facadeOf, { seed, baseY: floorLine, topY: top }, extra);
    const shopKind = (b.k === 'apt' || b.k === 'public') && A.lv >= 2;
    const walls = (rings, y0, top, p, flagsStr, noShop) => {
      const plain = -(A.plinth + A.floorH), shopH = Math.max(3.6, A.plinth + A.floorH);
      rings.forEach((R, ri) => edgesOf(R).forEach(([a, c, len, i]) => {
        if (len < 0.05) return;
        const street = ri === 0 && flagsStr ? flagsStr[i] : '0'; // '2' = main street edge (build_map.mjs)
        const style = len < 2.2 && A.style !== STYLE.CURTAIN ? STYLE.BLANK : A.style;
        F.wall(a[0], a[1], c[0], c[1], y0, top, p, style, !noShop && shopKind && street === '2' ? shopH : plain);
      }));
    };
    const summary = (top, y0 = yB) => {
      footprints.push({ poly: outer, h: top - g0, kind: b.k, name: b.name, id: b.id });
      const bb = bboxOf(outer);
      boxes.push({ min: new THREE.Vector3(bb.x0, y0, bb.z0), max: new THREE.Vector3(bb.x1, top, bb.z1), id: b.id });
      if (b.name && (A.lv >= 3 || top - g0 > 14)) landmarks.push({ name: b.name, x: ix, z: iz, h: top - g0 });
    };

    // canopy (building=roof): slab on four posts
    if (b.k === 'roof') {
      const y = g0 + 3.8, D = t.det;
      D.setPart(DP.STEEL).setColor(hexLin('#8a8c8e')).extrude(outer, holes, y, y + 0.35, { top: true, bottom: true });
      for (const piece of convexPieces(outer, holes)) E.prism(piece, y, y + 0.35, null, 'awning', true);
      const bb = bboxOf(outer);
      for (const [px, pz] of [[bb.x0 + 0.6, bb.z0 + 0.6], [bb.x1 - 0.6, bb.z0 + 0.6], [bb.x1 - 0.6, bb.z1 - 0.6], [bb.x0 + 0.6, bb.z1 - 0.6]]) {
        if (!inRing(outer, px, pz)) continue;
        D.setColor(hexLin('#6e7072')).box(px - 0.12, yB, pz - 0.12, px + 0.12, y, pz + 0.12);
        E.box(px - 0.12, yB, pz - 0.12, px + 0.12, y, pz + 0.12, 'pole');
      }
      summary(y + 0.35);
      return;
    }

    // mapped building parts (towers, drums, domes): the parent mass (if parts leave some of it uncovered) + each part
    if (b.parts?.length) {
      const parts = b.parts.map((pr) => ({ pr, R: orient(cleanRing(toPts(pr.p ?? [])), true) })).filter((q) => q.R.length >= 3);
      const cover = parts.reduce((s, q) => s + Math.abs(ringArea2(q.R)) / 2, 0) / Math.max(1, b.area);
      let parentTop = g0;
      if (cover < 0.9) {
        parentTop = g0 + (b.h ?? A.plinth + A.lv * A.floorH + A.parapet);
        walls([outer, ...holes], yB, parentTop, wallP(g0 - 0.15, parentTop), b.f, false);
        F.fill(outer, holes, parentTop, { layer: LAYER.ROOF_MEMBRANE, tint: [0.62, 0.62, 0.63] });
        massSolids(E, outer, holes, yB, parentTop, 'wall');
      }
      let top = parentTop;
      for (const { pr, R } of parts) {
        const mh = pr.mh ?? (pr.ml != null ? pr.ml * 3.6 : 0);
        const H = pr.h ?? (pr.lv != null ? pr.lv * 4.2 + 1 : 12);
        const domed = /dome|onion/.test(pr.rs ?? '');
        const bb = bboxOf(R), rad = Math.min(bb.x1 - bb.x0, bb.z1 - bb.z0) / 2;
        const wallTop = domed ? H - (pr.rh || Math.min(H - mh, rad * 1.6)) : H;
        const y0 = Math.max(mh ? g0 + mh : yB, parentTop > g0 && !mh ? parentTop - 0.05 : -Infinity);
        const pp = wallP(mh ? g0 + mh : g0 - 0.15, g0 + wallTop, pr.bc ? { layer: LAYER.STUCCO, tint: hexLin(pr.bc).map((v) => 0.3 + Math.pow(v, 0.45) * 0.85) } : {});
        if (g0 + wallTop > y0 + 0.2) {
          walls([R], y0, g0 + wallTop, pp, null, true);
          F.fill(R, [], g0 + wallTop, { layer: LAYER.ROOF_MEMBRANE, tint: [0.6, 0.6, 0.62] });
          massSolids(E, R, [], y0, g0 + wallTop, 'wall');
        }
        if (domed && H > wallTop) {
          const [dx, dz] = areaCentroid(R);
          dome(t, E, dx, dz, rad, g0 + wallTop, H - wallTop, pr.rc ? hexLin(pr.rc) : hexLin('#d9ab4f'), pr.rs === 'onion' || rad < 6);
        }
        top = Math.max(top, g0 + H);
      }
      summary(top);
      return;
    }

    // plain mass
    const mh = b.mh ?? 0;
    let Eh = b.h ?? A.plinth + A.lv * A.floorH + A.parapet;
    if (b.k === 'shed' || b.k === 'garage') Eh = A.floorH + A.plinth + A.parapet + r() * 0.3;
    Eh = Math.min(Eh, 180);
    const box = A.roof !== 'flat' && !holes.length ? minRect(outer) : null;
    const pitched = !!box && b.area / box.area > 0.72 && box.W > 3 && box.W < 26;
    const y0 = mh ? g0 + mh : yB;
    const floorY = mh ? y0 : g0 - 0.15;
    let H = g0 + mh + (pitched ? Eh - A.parapet : Eh);
    if (pitched && b.h != null) H = g0 + Math.max(A.floorH, b.h - Math.min(6, (box.W / 2) * (A.pitch ?? 0.5)));
    const p = wallP(floorY, H);
    const noShop = b.k === 'house' || b.k === 'shed' || b.k === 'garage';
    walls([outer, ...holes], y0, H, p, b.f, noShop);
    massSolids(E, outer, holes, y0, H, 'wall');
    let top = H;
    if (pitched) {
      top = pitchedRoof(t, E, box, H, A, { ...p, tint: A.tint.map((v, i) => v * [0.8, 0.78, 0.75][i]) });
    } else {
      const par = A.parapet >= 0.3 ? Math.min(A.parapet, 1.0) : 0;
      const roofY = H - par * 0.85;
      const rk = 0.5 + r() * 0.2;
      const layer = noShop ? LAYER.ROOF_MEMBRANE : choose(r, [[3, LAYER.ROOF_MEMBRANE], [2, LAYER.ROOF], [1, LAYER.ROOF_GRAVEL]]);
      F.fill(outer, holes, roofY, { layer, tint: [rk, rk, rk * 0.98] });
      if (par > 0) { // inner face of the parapet
        const ip = { ...p, tint: A.tint.map((v) => v * 0.82) };
        for (const R of [outer, ...holes]) for (const [a, c] of edgesOf(R)) F.wall(c[0], c[1], a[0], a[1], roofY, H, ip, STYLE.BLANK, -0.01); // reversed: faces the roof
      }
      if (b.k !== 'shed' && b.k !== 'garage' && H - g0 > 5) roofAnchors(anchor, [outer, ...holes], H);
      // rooftop blocks spread along the long axis: lift machine rooms on 8+ storeys, stair exits on five-storey blocks
      const lift = A.machine && A.lv >= 8, exits = !lift && A.stairs && b.k === 'apt';
      const rect = lift || exits ? minRect(outer) : null;
      if (rect && rect.W > (lift ? 9 : 8)) {
        const [pitch, hl, hw, bh, shade] = lift ? [17, 1.6, 2.9, 2.8, 0.94] : [16, 0.9, 1.1, 1.6, 0.9];
        const count = Math.min(6, Math.max(1, Math.round(rect.L / pitch)));
        const bp = { ...p, tint: A.tint.map((v) => v * shade), baseY: roofY, topY: roofY + bh };
        const at = (s, a, c) => [rect.cx + rect.ux * (s + a) - rect.uz * c, rect.cz + rect.uz * (s + a) + rect.ux * c];
        for (let k = 0; k < count; k++) {
          const s = ((k + 0.5) / count - 0.5) * rect.L;
          const fits = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, c]) => inRing(outer, ...at(s, a * (hl + 0.1), c * (hw + 0.1))));
          if (!fits) continue;
          const [mx, mz] = at(s, 0, 0);
          roofBlock(F, E, mx, mz, rect.ux, rect.uz, hl, hw, roofY, roofY + bh, bp);
          top = Math.max(top, roofY + bh);
        }
      }
    }
    if (dress) {
      try { dress({ t, S: solids, Z: zips, b, A, outer, holes, base: mh ? g0 + mh : g0, H, r, pitched }); }
      catch (e) { if (!stats.dressErrors++) console.warn('[buildings] dress hook failed', e); }
    }
    summary(top, y0);
  }
}

export function buildBuildings(opts) {
  const it = generate(opts);
  for (;;) { const s = it.next(); if (s.done) return s.value; }
}
// yield without timer clamping (setTimeout is throttled to >= 1 s in background tabs); MessageChannel is not
const yieldTask = () => new Promise((res) => {
  if (typeof MessageChannel === 'undefined') return setTimeout(res, 0);
  const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); res(); }; ch.port2.postMessage(0);
});
export async function buildBuildingsAsync(opts) {
  const it = generate(opts), slice = opts.sliceMs ?? 40, total = opts.map.buildings?.length || 1;
  let t = Date.now();
  for (;;) {
    const s = it.next();
    if (s.done) return s.value;
    if (Date.now() - t > slice) { opts.onProgress?.(s.value / total); await yieldTask(); t = Date.now(); }
  }
}
