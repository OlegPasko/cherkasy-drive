// Headless checks for the Cherkasy hand-made sites (src/world/cherkasy/*): node tests/landmarks.test.mjs
// Every site builds from the real map with the legacy city.js arguments, emits meshes and collision without NaNs,
// its flat-shaded triangles face where their normals point, and a few landmarks stand where they should.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';

// canvas stand-in: the sites paint their textures with a 2D context; here every call is a no-op
const ctx2d = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} })
  : k === 'measureText' ? () => ({ width: 100 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}),
set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

const S = {};
for (const m of ['frame', 'shore', 'signs', 'facadekit', 'landmarks', 'yalynka', 'restinn', 'pagorb', 'rosevalley', 'restaurants', 'beaches', 'yachtclub', 'embankment', 'prystan', 'dam', 'zhuzhoma'])
  S[m] = await import(`../src/world/cherkasy/${m}.js`);

let fails = 0;
const log = console.log; console.log = () => {}; // the sites print one summary line each
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const geo = S.frame.FRAME_OF(map);
S.rosevalley.prepareRoseValley(map, geo);
const hf = createHeightField(map, dem), heightAt = (x, z) => hf.heightAt(x, z);
const water = (map.water ?? []).map((r) => r.map((f) => { const P = []; for (let i = 0; i < f.length; i += 2) P.push([f[i], f[i + 1]]); return P; }));
const inside = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
const ground = { heightAt, isWater: (x, z) => water.some((rs) => inside(rs[0], x, z) && !rs.slice(1).some((h) => inside(h, x, z))) };
const cw = createCollisionWorld({ terrain: heightAt });
const zips = { n: 0, add() { this.n++; }, edge() { this.n++; } };

// winding: share of triangles whose face normal disagrees with the vertex normals (flat-shaded builders only)
function windingBad(g) {
  const P = g.attributes.position, N = g.attributes.normal, I = g.index?.array; if (!I || !N) return [0, 0];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  let bad = 0, all = 0;
  for (let t = 0; t < I.length; t += 3) {
    a.fromBufferAttribute(P, I[t]); b.fromBufferAttribute(P, I[t + 1]).sub(a); c.fromBufferAttribute(P, I[t + 2]).sub(a);
    const f = b.cross(c); if (f.lengthSq() < 1e-8) continue;
    n.set(0, 0, 0); for (let k = 0; k < 3; k++) n.add(m.fromBufferAttribute(N, I[t + k]));
    all++; if (f.dot(n) <= 0) bad++;
  }
  return [bad, all];
}
function audit(name, group) {
  let meshes = 0, nan = 0, bad = 0, all = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const p = o.geometry.attributes.position.array;
    for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) { nan++; break; }
    if (!o.material.side && !o.isInstancedMesh) { const [b, a] = windingBad(o.geometry); bad += b; all += a; }
  });
  ok(meshes > 0 && nan === 0, `${name}: ${meshes} meshes, no NaN positions`);
  ok(all === 0 || bad / all < 0.01, `${name}: front faces agree with normals (${bad} of ${all} flipped)`);
}

const base = { map, solids: cw, zips, heightAt, ground, geo };
const sites = {};
for (const [name, fn, extra] of [['landmarks', S.landmarks.buildLandmarks, { T: {}, facadeMat: new THREE.MeshStandardMaterial(), detailMat: new THREE.MeshStandardMaterial() }],
  ['yalynka', S.yalynka.buildYalynka], ['restinn', S.restinn.buildRestInn], ['pagorb', S.pagorb.buildPagorb], ['rosevalley', S.rosevalley.buildRoseValley],
  ['restaurants', S.restaurants.buildRestaurants], ['beaches', S.beaches.buildBeaches], ['yachtclub', S.yachtclub.buildYachtClub], ['embankment', S.embankment.buildEmbankment],
  ['prystan', S.prystan.buildPrystan], ['dam', S.dam.buildDam], ['zhuzhoma', S.zhuzhoma.buildZhuzhoma]]) {
  const root = new THREE.Group(), s0 = cw.count;
  let api = null, err = null;
  try { api = fn({ ...base, ...extra, root }); } catch (e) { err = e; }
  ok(!err && api, `${name}: builds${err ? ' – ' + err.stack : ''}`);
  if (err) continue;
  root.updateMatrixWorld(true);
  ok(cw.count > s0, `${name}: ${cw.count - s0} collision solids`);
  audit(name, root);
  try { api.update?.(1 / 60, new THREE.PerspectiveCamera()); ok(true, `${name}: update() runs`); } catch (e) { ok(false, `${name}: update() – ${e.message}`); }
  sites[name] = api;
}
ok(zips.n > 100, `zip points: ${zips.n}`);

// skip sets are OSM building ids the generic extrusion leaves to the sites
for (const [m, k] of [['landmarks', 'LANDMARK_SKIP'], ['restinn', 'HERO_SKIP'], ['yalynka', 'TREE_SKIP'], ['restaurants', 'RESTAURANT_SKIP'], ['beaches', 'BEACH_SKIP'], ['yachtclub', 'YACHT_SKIP'], ['zhuzhoma', 'ZHU_SKIP']]) {
  const ids = S[m][k], known = new Set(map.buildings.map((b) => b.id));
  const hit = [...(ids ?? [])].filter((id) => known.has(id)).length; // some are building parts / POIs, not top-level buildings
  ok(ids instanceof Set && hit > 0, `${m}.${k}: ${ids?.size} ids, ${hit} of them in map.buildings`);
}

// landmarks stand where they should: the cathedral's central dome and the TV tower top are solid high up
const cat = cw.groundHeight(-921.8, 683.6);
ok(cat - heightAt(-921.8, 683.6) > 40, `cathedral crossing: support ${(cat - heightAt(-921.8, 683.6)).toFixed(1)} m above ground (drum + dome)`);
const tv = cw.raycast({ x: 307, y: 400, z: -2615 }, { x: 0, y: -1, z: 0 });
ok(tv && tv.point.y - heightAt(307, -2615) > 190, `TV tower: ray from above hits ${tv ? (tv.point.y - heightAt(307, -2615)).toFixed(0) : '-'} m up (196 m mast)`);
const [mx, mz] = sites.pagorb?.center ?? [0, 0];
ok(sites.pagorb && cw.groundHeight(mx + 20, mz) > heightAt(mx + 20, mz) + 2, 'Pagorb Slavy: the mound is walkable above the terrain');
ok(sites.pagorb?.clear?.(mx, mz) === true && sites.pagorb.spots.length > 5, `Pagorb Slavy: keeps generated trees off, plants ${sites.pagorb?.spots.length} spruces`);
ok((sites.rosevalley?.spots?.length ?? 0) > 50, `Rose Valley: ${sites.rosevalley?.spots?.length} tree spots`);

// shore strip: sandy low strip between Sosnovyi bir and Mytnytsia, off up on the terrace
const strip = S.shore.shoreStrip(map), mid = [(strip.A[0] + strip.B[0]) / 2, (strip.A[1] + strip.B[1]) / 2];
ok(strip.lowK(mid[0], 3, mid[1]) > 0.9 && strip.lowK(mid[0], 30, mid[1]) === 0, `shoreStrip.lowK: ${strip.lowK(mid[0], 3, mid[1]).toFixed(2)} low, 0 on the terrace`);
ok(typeof S.signs.ukrainianSigns === 'function', 'signs.ukrainianSigns exported');

// facade kit through the generic buildings: dresses apartment blocks, adds detail vertices and solids
{
  const { buildBuildings } = await import('../src/world/buildings.js');
  const pick = { ...map, buildings: map.buildings.filter((b) => b.k === 'apt' && b.lv >= 5).slice(0, 60) };
  const cw2 = createCollisionWorld({ terrain: heightAt });
  const plain = buildBuildings({ map: pick, solids: createCollisionWorld({ terrain: heightAt }), zips, heightAt });
  const dressed = buildBuildings({ map: pick, solids: cw2, zips, heightAt, dress: S.facadekit.dressBuilding });
  const verts = (B) => [...B.tiles.values()].reduce((s, t) => s + t.det.v, 0);
  ok(!dressed.stats.dressErrors && verts(dressed) > verts(plain) + 1000, `facadekit: ${verts(dressed) - verts(plain)} detail vertices on 60 blocks, no hook errors`);
  let bad = 0, all = 0; for (const t of dressed.tiles.values()) if (t.det.v) { const [b, a] = windingBad(t.det.build({ part: true })); bad += b; all += a; }
  ok(bad / all < 0.01, `facadekit: front faces agree with normals (${bad} of ${all} flipped)`);
}

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
