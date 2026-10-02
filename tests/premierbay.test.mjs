// Headless checks for ЖК Premier Bay (src/world/cherkasy/premierbay.js): node tests/premierbay.test.mjs
//   levelPremierBay levels the lot to the driveways round it (the roads beside it meet it without a step); the site
//   builds within budget with finite geometry; a car drives in from outside through each of the four corner gaps, round
//   the yard and out without touching a collider, on level ground; the walls still stop it.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { buildPremierBay, levelPremierBay } from '../src/world/cherkasy/premierbay.js';
import { ringPts } from '../src/world/cherkasy/geo.js';

const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {}, data: new Uint8ClampedArray(4) }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const hf = createHeightField(map, dem);

// the complex's frame, as the module lays it: u along the east bar's yard edge, v across, from the yard's middle
const east = ringPts(map.buildings.find((b) => b.id === 1526030153).p), O = [1270, 2045];
const L0 = Math.hypot(east[1][0] - east[0][0], east[1][1] - east[0][1]), U = [(east[1][0] - east[0][0]) / L0, (east[1][1] - east[0][1]) / L0], V = [-U[1], U[0]];
const P = (u, v) => [O[0] + U[0] * u + V[0] * v, O[1] + U[1] * u + V[1] * v];
const uv = (x, z) => [(x - O[0]) * U[0] + (z - O[1]) * U[1], (x - O[0]) * V[0] + (z - O[1]) * V[1]];
const H = (u, v) => hf.heightAt(...P(u, v));

const before = H(0, 50) - H(0, -60);
const level = levelPremierBay(hf, map);
ok(Number.isFinite(level), `the lot is levelled (to ${level?.toFixed(2)} m; the DEM fell ${before.toFixed(1)} m across it)`);
let dev = 0;
for (let u = -60; u <= 60; u += 4) for (let v = -74; v <= 72; v += 4) dev = Math.max(dev, Math.abs(H(u, v) - level));
ok(dev < 0.1, `the lot is flat (max ${dev.toFixed(3)} m off)`);
// the motor roads and tracks within 12 m of the lot meet it without a step
let step = 0, nRoad = 0;
for (const rd of map.roads) {
  if (rd.k !== 'm' && rd.k !== 'd') continue;
  for (let i = 2; i < rd.p.length; i += 2) {
    const n = Math.ceil(Math.hypot(rd.p[i] - rd.p[i - 2], rd.p[i + 1] - rd.p[i - 1]) / 2);
    for (let k = 0; k <= n; k++) {
      const x = rd.p[i - 2] + (rd.p[i] - rd.p[i - 2]) * k / n, z = rd.p[i - 1] + (rd.p[i + 1] - rd.p[i - 1]) * k / n, [u, v] = uv(x, z);
      if (u > -74 && u < 74 && v > -88 && v < 86) { nRoad++; step = Math.max(step, Math.abs(hf.heightAt(x, z) - level)); }
    }
  }
}
ok(nRoad > 20 && step < 0.6, `the roads beside the lot are at its level (${nRoad} samples, max ${step.toFixed(2)} m off)`);

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildPremierBay({ root, map, solids: cw, zips: { edge() {} }, heightAt: hf.heightAt, facadeMat: new THREE.MeshBasicMaterial() });
ok(!!site && root.children.length === 1, 'site builds');
let verts = 0, meshes = 0, nan = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; const a = o.geometry.attributes.position.array; verts += a.length / 3; for (const v of a) if (!Number.isFinite(v)) nan++; } });
ok(nan === 0, 'all vertices finite');
ok(verts > 20000 && verts < 160000 && meshes <= 8, `${(verts / 1000).toFixed(1)}k vertices in ${meshes} meshes`);

// drive: from the service road past the east bar (v 79), along the levelled strip outside the bars' ends, in through
// each corner gap to the ring drive along the bars, once round the yard, and out again
const RING = [[37.9, 50.1], [-36.7, 50.1], [-36.7, -52.7], [37.9, -52.7], [37.9, 50.1]];
const GAPS = [[1, 34], [1, -43], [-1, -39.1], [-1, 37.5]];
const drive = (pts) => {
  let hits = 0, off = 0, grade = 0;
  for (let k = 1; k < pts.length; k++) {
    const [ua, va] = pts[k - 1], [ub, vb] = pts[k], n = Math.ceil(Math.hypot(ub - ua, vb - va) / 0.4);
    let hPrev = H(ua, va);
    for (let i = 1; i <= n; i++) {
      const u = ua + (ub - ua) * i / n, v = va + (vb - va) * i / n, [x, z] = P(u, v), h = hf.heightAt(x, z);
      grade = Math.max(grade, Math.abs(h - hPrev) / (Math.hypot(ub - ua, vb - va) / n)); hPrev = h;
      if (Math.abs(u) < 58) off = Math.max(off, Math.abs(h - level));
      const p = { x, y: h + 0.2, z };
      if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) hits++;
    }
  }
  return { hits, off, grade };
};
const ring = drive(RING);
ok(ring.hits === 0 && ring.off < 0.05, `round the yard: ${ring.hits} pushes, ${ring.off.toFixed(3)} m off level`);
for (const [s, v] of GAPS) {
  const inner = s > 0 ? 37.9 : -36.7, r = drive([[s * 66, 79], [s * 66, v], [inner, v]]);
  ok(r.hits === 0 && r.off < 0.05 && r.grade < 0.05, `in and out through the ${s > 0 ? 'north' : 'south'}-end gap at v ${v}: ${r.hits} pushes, grade ≤ ${(r.grade * 100).toFixed(0)}%`);
}
// the walls still stop it: driving at the middle of the east bar from the yard
{
  let hits = 0;
  for (let v = 40; v < 60; v += 0.4) { const [x, z] = P(0, v), p = { x, y: level + 0.2, z }; if (cw.pushCylinder(p, 1.2, 1.6, 0.3)?.hit) hits++; }
  ok(hits > 5, `the east bar's yard wall stops the car (${hits} pushes)`);
}
ok(site.clear(...P(0, 0)) && site.clear(...P(50, 34)) && !site.clear(...P(0, 120)), 'trees keep off the lot only');

console.log = log;
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
