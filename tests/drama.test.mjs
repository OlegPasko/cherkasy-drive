// Headless checks for the drama theatre, the Shevchenko monument and the square (src/world/cherkasy/drama.js):
// node tests/drama.test.mjs
//   the OSM way is there and the site frame sits on its front edge; the lot is levelled; the site builds in budget with
//   finite geometry; no two surfaces of the site lie in one plane over each other (the old landmarks.js model capped its
//   stage house with a slab in the plane of its roof, which flickered from the air); the front stops the car, the steps
//   are drivable, the canopy is an awning, the roof and the fly tower hold; the monument stands on the OSM node and is
//   solid; places.js has both sights, landmarks.js no longer skips the building; trees keep off the lot and the square.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildDrama, levelDrama, dramaLocal, DRAMA_SKIP } from '../src/world/cherkasy/drama.js';
import { LANDMARK_SKIP } from '../src/world/cherkasy/landmarks.js';
import { PLACES } from '../src/world/cherkasy/places.js';
import { inPoly } from '../src/world/cherkasy/geo.js';

const ctx2d = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} })
  : k === 'measureText' ? () => ({ width: 100 }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);
const [id] = DRAMA_SKIP, { W, toMap, toLocal, MONUMENT } = dramaLocal;
const osm = map.buildings.find((b) => b.id === id);
ok(!!osm, `OSM way ${id} is in map_buildings.json`);
const loc = []; for (let i = 0; i < (osm?.p.length ?? 0); i += 2) loc.push(toLocal(osm.p[i], osm.p[i + 1]));
ok(Math.hypot(...loc[0]) < 0.05 && Math.abs(loc[1][0] - W) < 0.05 && Math.abs(loc[1][1]) < 0.05, 'the frame sits on the front edge of the outline');
ok(Math.max(...loc.map(([, t]) => t)) > 72 && Math.min(...loc.map(([s]) => s)) < -3.4, 'the outline reaches the annex and the wider service block');

const level = levelDrama(hf);
const hs = [[0, 0], [W, 0], [W, 35], [0, 35], [-3, 67], [34, 67], [15, -9], [15, 72]].map(([s, t]) => hf.heightAt(...toMap(s, t)));
ok(Math.max(...hs) - Math.min(...hs) < 0.25, `the lot is level (${hs.map((h) => h.toFixed(2)).join(' ')}, level ${level?.toFixed?.(2)})`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const zips = []; const Z = { edge: (...a) => zips.push(a) };
const site = buildDrama({ root, map, solids: cw, zips: Z, heightAt: hf.heightAt });
ok(!!site && root.children.length === 2 && site.footprints.length === 1, 'site builds: the theatre and the square, one footprint');
let verts = 0, meshes = 0, nan = 0;
const tris = [];
root.updateMatrixWorld(true);
root.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  const P = o.geometry.attributes.position, I = o.geometry.index;
  verts += P.count;
  for (let i = 0; i < P.array.length; i++) if (!Number.isFinite(P.array[i])) nan++;
  const v = (k) => new THREE.Vector3().fromBufferAttribute(P, k);
  const n = I ? I.count : P.count;
  for (let k = 0; k < n; k += 3) {
    const a = v(I ? I.getX(k) : k), b = v(I ? I.getX(k + 1) : k + 1), c = v(I ? I.getX(k + 2) : k + 2);
    const nn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const area = nn.length() / 2;
    if (area < 1e-4) continue;
    nn.normalize();
    tris.push({ mesh: o.name, a, b, c, n: nn, d: nn.dot(a), area });
  }
});
ok(nan === 0, 'all vertices finite');
ok(verts > 15000 && verts < 60000 && meshes <= 18, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);

// coplanar overlaps: triangles facing the same way, one lying in the other's plane (1.2 cm), whose interiors overlap
// seen along the normal -> z-fighting. Candidates: the same rough normal and overlapping bounds (a sweep along x).
{
  const [cx0, cz0] = toMap(15, 20), O = new THREE.Vector3(cx0, 30, cz0); // local origin: plane offsets stay small
  for (const t of tris) { for (const p of [t.a, t.b, t.c]) p.sub(O); t.d = t.n.dot(t.a); t.box = new THREE.Box3().setFromPoints([t.a, t.b, t.c]).expandByScalar(0.02); }
  const proj = (n, p) => { const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z); return ax >= ay && ax >= az ? [p.y, p.z] : ay >= az ? [p.x, p.z] : [p.x, p.y]; };
  const inside = (q, A, B, C) => {
    const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    const d1 = s(q, A, B), d2 = s(q, B, C), d3 = s(q, C, A), e = 1e-5;
    return (d1 > e && d2 > e && d3 > e) || (d1 < -e && d2 < -e && d3 < -e);
  };
  const W3 = [[0.34, 0.33, 0.33], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
  const pts = (t) => W3.map((w) => t.a.clone().multiplyScalar(w[0]).addScaledVector(t.b, w[1]).addScaledVector(t.c, w[2]));
  const tri2 = (u) => [u.a, u.b, u.c].map((p) => proj(u.n, p));
  const flat = (u, P) => P.every((p) => Math.abs(u.n.dot(p) - u.d) < 0.012);
  const overlap = (i, j) => { const Pi = pts(i), Pj = pts(j); return (flat(i, Pj) && Pj.some((p) => inside(proj(i.n, p), ...tri2(i)))) || (flat(j, Pi) && Pi.some((p) => inside(proj(j.n, p), ...tri2(j)))); };
  const groups = new Map();
  for (const t of tris) {
    if (/-(bronze|rock)$/.test(t.mesh)) continue; // the smooth sculpture skins
    const k = `${Math.round(t.n.x * 10)},${Math.round(t.n.y * 10)},${Math.round(t.n.z * 10)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(t);
  }
  let bad = 0; const where = [];
  for (const list of groups.values()) {
    list.sort((p, q) => p.box.min.x - q.box.min.x);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length && list[j].box.min.x <= list[i].box.max.x; j++) {
      const A = list[i], Bt = list[j];
      if (A.n.dot(Bt.n) < 0.9995 || !A.box.intersectsBox(Bt.box) || !overlap(A, Bt)) continue;
      bad++;
      if (where.length < 12) where.push(`${A.mesh}/${Bt.mesh} @${A.a.clone().add(O).toArray().map((v) => v.toFixed(2)).join(',')} n${A.n.toArray().map((v) => v.toFixed(2)).join(',')}`);
    }
  }
  ok(bad === 0, `no coplanar overlapping surfaces (${bad}${where.length ? ': ' + where.join('; ') : ''})`);
}

// the walls and the roofs
const g0 = hf.heightAt(...toMap(15, -10));
const [ox, oz] = toMap(5, -6), [tx, tz] = toMap(5, 4);
const hit = cw.raycast({ x: ox, y: g0 + 6, z: oz }, { x: tx - ox, y: 0, z: tz - oz }, 30);
ok(hit && toLocal(hit.point.x, hit.point.z)[1] > -0.2 && toLocal(hit.point.x, hit.point.z)[1] < 1.4, `a ray from the square stops at the colonnade (t = ${hit && toLocal(hit.point.x, hit.point.z)[1].toFixed(2)})`);
const [sx, sz] = toMap(-12, 20), [ux, uz] = toMap(-2, 20);
const hs2 = cw.raycast({ x: sx, y: g0 + 4, z: sz }, { x: ux - sx, y: 0, z: uz - sz }, 30);
ok(hs2 && Math.abs(toLocal(hs2.point.x, hs2.point.z)[0]) < 0.3, `a ray from the north stops at the side wall (s = ${hs2 && toLocal(hs2.point.x, hs2.point.z)[0].toFixed(2)})`);
const stepY = cw.groundHeight(...toMap(15, -6.3), g0 + 3), terY = cw.groundHeight(...toMap(15, -2), g0 + 3);
ok(stepY > g0 + 0.3 && stepY < terY - 0.2 && terY > g0 + 1.0 && terY < g0 + 1.5, `the steps climb to the terrace (${(stepY - g0).toFixed(2)} -> ${(terY - g0).toFixed(2)} m)`);
const canopy = cw.raycast({ ...Object.fromEntries([['x', toMap(15, -1)[0]], ['z', toMap(15, -1)[1]]]), y: g0 + 10 }, { x: 0, y: -1, z: 0 }, 20);
ok(canopy && cw.kindOf(canopy.id) === 'awning' && canopy.point.y - g0 > 4.5, `the canopy is an awning over the door (${canopy && (canopy.point.y - g0).toFixed(1)} m)`);
const roofY = cw.groundHeight(...toMap(W / 2, 18), g0 + 60);
ok(roofY - g0 > 16 && roofY - g0 < 19, `the hipped roof holds (ridge ${(roofY - g0).toFixed(1)} m)`);
const towerY = cw.groundHeight(...toMap(15, 50), g0 + 60);
ok(towerY - g0 > 22 && towerY - g0 < 25, `the fly tower holds (${(towerY - g0).toFixed(1)} m)`);
const wingY = cw.groundHeight(...toMap(-2, 50), g0 + 60);
ok(wingY - g0 > 11.5 && wingY - g0 < 14, `the service block holds (${(wingY - g0).toFixed(1)} m)`);
ok(zips.length >= 2, 'zip points on the parapets');

// the monument on the OSM node, solid, the statue on top
const node = map.pois.find((p) => p.id === 'n1668556520');
const mp = toMap(...MONUMENT);
ok(node && Math.hypot(node.x - mp[0], node.z - mp[1]) < 1, `the monument stands on the OSM node (${node && Math.hypot(node.x - mp[0], node.z - mp[1]).toFixed(2)} m off)`);
const top = cw.groundHeight(mp[0], mp[1], g0 + 30) - hf.heightAt(...mp);
ok(top > 7 && top < 8.5, `pedestal and figure: ${top.toFixed(1)} m`);
const [ax, az] = toMap(MONUMENT[0], MONUMENT[1] - 10), [bx, bz] = toMap(...MONUMENT);
const mh = cw.raycast({ x: ax, y: hf.heightAt(ax, az) + 1.5, z: az }, { x: bx - ax, y: 0, z: bz - az }, 20);
ok(mh && Math.hypot(mh.point.x - bx, mh.point.z - bz) < 3.5, 'the car runs into the monument from the boulevard');

// places, skips, trees
const drama = PLACES.find((q) => q.id === 'drama'), shev = PLACES.find((q) => q.id === 'shevchenko');
ok(drama?.kind === 'sight' && drama.bld?.includes(id) && shev?.kind === 'sight' && shev.xz, 'places.js: the theatre and the monument are sights');
ok(!LANDMARK_SKIP.has(id), 'landmarks.js no longer models the theatre');
const fp = site.footprints[0];
ok(inPoly(fp.poly, ...toMap(15, 30)) && fp.h > 20, `the footprint is the OSM outline, ${fp.h.toFixed(1)} m high`);
const others = map.buildings.filter((b) => b.id !== id && (() => { for (let i = 0; i < b.p.length; i += 2) if (inPoly(fp.poly, b.p[i], b.p[i + 1])) return true; return false; })());
ok(others.length === 0, `no other OSM building inside (${others.map((b) => b.id).join(', ') || 'none'})`);
ok(site.clear(...toMap(15, 30)) && site.clear(...toMap(10, -30)) && site.clear(...toMap(15, -10)) && !site.clear(...toMap(-15, 40)), 'trees keep off the lot and the square, not the yards beside it');
ok(site.spots.length === 2 && !site.spots.some((s) => inPoly(fp.poly, s.x, s.z)), 'two planted trees, outside the building');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'drama: all ok');
process.exit(fails ? 1 : 0);
