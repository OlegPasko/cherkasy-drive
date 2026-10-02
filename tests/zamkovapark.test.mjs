// Headless checks for the park under Zamkova hora (src/world/cherkasy/zamkovapark.js): node tests/zamkovapark.test.mjs
// On the real map: the terrain hook levels the fountain plaza, the site builds without NaN, the restored houses replace
// their OSM ids and stand as solids, the fountain's drum is solid, the stairs climb from the park to the hilltop
// plateau of zamkova.js, the trees keep off the paving, and the jets move.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { shapeZamkova, PLATEAU_Y } from '../src/world/cherkasy/zamkova.js';
import { shapeZamkovaPark, buildZamkovaPark, ZAMKPARK_SKIP, STAIRS } from '../src/world/cherkasy/zamkovapark.js';
import { createCityTextures } from '../src/kit/textures.js';
import { PLACES } from '../src/world/cherkasy/places.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const geo = FRAME_OF(map), hf = createHeightField(map, dem);
// local east / north metres from the module's origin
const O = [49.4493, 32.0650], K = 111320;
const EN = (e, n) => geo.toXZ(O[0] + n / K, O[1] + e / (K * Math.cos(O[0] * Math.PI / 180)));

shapeZamkova(hf, map, geo);
const spread = (pts) => { const h = pts.map((p) => hf.heightAt(...EN(...p))); return Math.max(...h) - Math.min(...h); };
const plaza = Array.from({ length: 12 }, (_, k) => [44 + 9 * Math.cos(k / 12 * Math.PI * 2), 12 + 9 * Math.sin(k / 12 * Math.PI * 2)]);
const before = spread(plaza);
const road = [EN(0, 58), EN(40, 47)].map((p) => hf.heightAt(...p));
const shaped = shapeZamkovaPark(hf, map, geo);
ok(shaped && shaped.pads.every((v) => Number.isFinite(v)), `terrain hook levels the fountain plaza (${shaped?.pads.map((v) => v?.toFixed(1)).join(' / ')})`);
const after = spread(plaza);
ok(after < before && after < 0.6, `the fountain plaza is flatter (${before.toFixed(2)} -> ${after.toFixed(2)} m over 18 m)`);
const road2 = [EN(0, 58), EN(40, 47)].map((p) => hf.heightAt(...p));
ok(road.every((h, i) => Math.abs(h - road2[i]) < 0.35), `Olherda barely moves (${road.map((h, i) => (road2[i] - h).toFixed(2)).join(', ')} m)`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildZamkovaPark({ root, T: createCityTextures({ size: 64 }), map, solids: cw, heightAt: hf.heightAt, geo });
ok(!!site && root.children.length === 1, 'site builds');
let nan = 0, verts = 0, meshes = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'no NaN positions');
ok(meshes <= 20 && verts < 160000, `budget: ${meshes} meshes, ${(verts / 1000).toFixed(1)}k vertices`);
ok(ZAMKPARK_SKIP.has(178369998) && ZAMKPARK_SKIP.has(178369992), 'both OSM houses are rebuilt here');
ok(site.footprints.length === 2, 'two footprints for the minimap');

// the house with griffins: a solid two storeys high
const house = EN(-29, 42), gH = hf.heightAt(...house);
const hit = cw.raycast({ x: house[0], y: gH + 40, z: house[1] }, { x: 0, y: -1, z: 0 });
ok(hit && hit.point.y - gH > 7 && hit.point.y - gH < 11, `the house stands ${(hit ? hit.point.y - gH : 0).toFixed(1)} m (eaves)`);
// the fountain drum blocks a body at the plaza level
const F = EN(44, 12), gF = hf.heightAt(...F);
ok(cw.inside(F[0], gF + 0.6, F[1]), 'the fountain drum is solid');
// the stairs: a body walking up them finds supports rising from the park to the plateau
const way = STAIRS;
let y = cw.topAt(...EN(...way[0])).y, rising = true; // the foot landing
ok(y > hf.heightAt(...EN(...way[0])) && y < hf.heightAt(...EN(...way[0])) + 1, `the foot landing sits on the ground (${y.toFixed(2)})`);
for (let k = 1; k < way.length; k++) for (let t = 0.1; t <= 1.001; t += 0.1) {
  const e = way[k - 1][0] + (way[k][0] - way[k - 1][0]) * t, n = way[k - 1][1] + (way[k][1] - way[k - 1][1]) * t, p = EN(e, n);
  const yy = cw.groundHeight(p[0], p[1], y + 0.6);
  if (yy < y - 0.35) rising = false;
  y = Math.max(y, yy);
}
ok(rising && y > PLATEAU_Y - 0.5, `the stairs climb to the plateau (${y.toFixed(1)} m, plateau ${PLATEAU_Y})`);
// trees: on lawns only
ok(site.spots.length > 30, `${site.spots.length} park trees`);
ok(!site.spots.some((s) => Math.hypot(s.x - F[0], s.z - F[1]) < 14), 'no tree on the fountain plaza');
ok(site.clear(...EN(10, 10)) && !site.clear(...EN(10, 80)), 'generated trees keep off the lot, not off the Rose Valley');
// places: the park as a sight, the house as an improved object
ok(PLACES.some((p) => p.id === 'zamkpark' && p.kind === 'sight') && PLACES.some((p) => p.id === 'kupershtein' && p.kind === 'improved'), 'both are on the maps');
// the jets animate
const jets = root.getObjectByName('zamkovapark-jets');
const o0 = jets.material.map.offset.y; site.update(0.1);
ok(jets && jets.material.map.offset.y !== o0, 'the jets flow');

log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
