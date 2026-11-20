// Compiles the OSM hedges (barrier=hedge ways) of the raw dump into src/world/cherkasy/hedges_data.js, the small data
// file of the shrub layer (shrubbery.js). build_map.mjs does not carry barriers, so this is its own step:
//   node tools/cherkasy/build_hedges.mjs [raw dir = tools/cherkasy/raw]
// Reads raw/poi.json (fetch_osm.mjs) and public/assets/cherkasy/map.json (the frame and the region). Deterministic.
import fs from 'fs';
import { fileURLToPath } from 'url';
import { FRAME_OF } from '../../src/world/cherkasy/frame.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const raw = process.argv[2] ?? root + 'tools/cherkasy/raw';
const map = JSON.parse(fs.readFileSync(root + 'public/assets/cherkasy/map.json'));
const F = FRAME_OF(map), R = map.region;
const els = JSON.parse(fs.readFileSync(raw + '/poi.json')).elements ?? [];
const out = [];
for (const e of els) {
  if (e.type !== 'way' || e.tags?.barrier !== 'hedge' || !e.geometry) continue;
  const p = e.geometry.flatMap(({ lat, lon }) => F.toXZ(lat, lon).map((v) => Math.round(v * 10) / 10));
  let inside = false;
  for (let i = 0; i < p.length; i += 2) if (p[i] > R.x0 && p[i] < R.x1 && p[i + 1] > R.z0 && p[i + 1] < R.z1) inside = true;
  if (!inside) continue;
  const h = parseFloat(e.tags.height);
  out.push({ id: e.id, h: Number.isFinite(h) ? Math.min(3, Math.max(0.5, h)) : 0, p });
}
out.sort((a, b) => a.id - b.id);
const body = out.map((q) => `  { id: ${q.id}, h: ${q.h}, p: [${q.p.join(', ')}] },`).join('\n');
fs.writeFileSync(root + 'src/world/cherkasy/hedges_data.js', `// OWNER: cherkasy. The OSM hedges (barrier=hedge) inside the map region, compiled by tools/cherkasy/build_hedges.mjs
// from the raw OSM dump (map data (c) OpenStreetMap contributors, ODbL). Do not edit by hand.
//   HEDGES: [{ id (OSM way), h (the tagged height in metres, 0 = none), p: flat polyline [x, z, ...] in map metres }]
export const HEDGES = [
${body}
];
`);
console.log(`hedges: ${out.length} ways, ${out.reduce((n, q) => n + q.p.length / 2, 0)} points`);
