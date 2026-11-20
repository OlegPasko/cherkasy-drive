// Compiles the hedges of the shrub layer (src/world/cherkasy/shrubbery.js hedgeRows) into
// src/world/cherkasy/hedges_data.js. The lines are the fences' own hedge pieces (public/assets/cherkasy/map_fences.json,
// tools/cherkasy/build_fences.mjs: OSM barrier=hedge, simplified and cut at streets, driveways and footways), so a
// hedge block stands exactly on the thin hedge face and the wall solid fences.js builds there. Each line is then cut
// where a block would touch another fence, stand in a gate's mouth or touch a street prop (street.js on
// map_street.json: a lamp, a pole, a bench...). Run it again after build_fences.mjs or build_street.mjs:
//   node tools/cherkasy/build_hedges.mjs
// Deterministic; about 5 s (it builds the ground rasters and the street furniture to know where the props stand).
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { ringPts } from '../../src/world/cherkasy/geo.js';
import { createHeightField, buildGroundData } from '../../src/world/cherkasy/ground.js';
import { footprintRaster } from '../../src/world/cherkasy/greenery.js';
import { obstacleIndex } from '../../src/world/cherkasy/shrubbery.js';
import { parseFences } from '../../src/world/cherkasy/fencework.js';
import { buildStreet } from '../../src/world/cherkasy/street.js';
import { createCollisionWorld } from '../../src/world/collision.js';

const root = fileURLToPath(new URL('../../', import.meta.url)), dir = root + 'public/assets/cherkasy/';
const json = (name) => JSON.parse(fs.readFileSync(dir + name));
const map = json('map.json'), F = parseFences(json('map_fences.json'));
map.buildings = json('map_buildings.json');
const buf = fs.readFileSync(dir + 'dem.bin'), hf = createHeightField(map, new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2)), whole = buildGroundData({ map, hf });
const ground = { heightAt: hf.heightAt, onAsphalt: (x, z) => whole.asph.get(x, z) === 1, isWater: (x, z) => { const w = whole.wat.get(x, z); return w >= 0 ? w === 1 : whole.land.get(x, z) === 0; } };
const occ = footprintRaster(map.buildings.map((b) => ({ poly: ringPts(b.p), kind: b.k })), map.region);
const log = console.log; console.log = () => {}; // the builders' own chatter
const street = buildStreet({ scene: new THREE.Group(), data: json('map_street.json'), map, heightAt: hf.heightAt, ground, solids: createCollisionWorld({ terrain: hf.heightAt }), occ, spots: [], clear: [], detailMat: new THREE.MeshStandardMaterial() });
console.log = log;
const obs = obstacleIndex({ fences: F, props: street.props(), skipKinds: ['hedge'] });

const HW = 0.6, STEP = 0.25, MIN = 1.2; // a block's half depth and a gap; the walk's step; the shortest run worth a block
const HEDGE = F.kinds.indexOf('hedge'), out = [], cut = { m: 0, kept: 0 };
for (let k = 0; k < F.n; k++) {
  if (F.kind[k] !== HEDGE) continue;
  for (let i = F.start[k] + 1, e = F.start[k] + F.count[k]; i < e; i++) { // straight by straight: runs of free ground
    const ax = F.pts[2 * i - 2], az = F.pts[2 * i - 1], bx = F.pts[2 * i], bz = F.pts[2 * i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / STEP));
    let from = -1;
    for (let q = 0; q <= n + 1; q++) {
      const t = q / n, free = q <= n && !obs.hit(ax + (bx - ax) * t, az + (bz - az) * t, HW);
      if (free && from < 0) from = q;
      if (!free && from >= 0) {
        const t0 = from / n, t1 = (q - 1) / n;
        if ((t1 - t0) * L >= MIN) { out.push({ h: Math.round(F.h[k] * 10) / 10, p: [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1].map((v) => Math.round(v * 10) / 10) }); cut.kept += (t1 - t0) * L; }
        from = -1;
      }
    }
    cut.m += L;
  }
}
const body = out.map((q) => `  { h: ${q.h}, p: [${q.p.join(', ')}] },`).join('\n');
fs.writeFileSync(root + 'src/world/cherkasy/hedges_data.js', `// OWNER: cherkasy. The hedges inside the map region: the fences' hedge pieces (map_fences.json; map data (c)
// OpenStreetMap contributors, ODbL), cut where a hedge block would touch another fence, a gate's mouth or a street
// prop. Compiled by tools/cherkasy/build_hedges.mjs; do not edit by hand.
//   HEDGES: [{ h (the fence face's height, m), p: one straight run [x0, z0, x1, z1] in map metres }]
export const HEDGES = [
${body}
];
`);
console.log(`hedges: ${out.length} runs, ${cut.kept.toFixed(0)} m of ${cut.m.toFixed(0)} m kept`);
