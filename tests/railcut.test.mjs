// OWNER: cherkasy. Issue #30: the actual rail route is in a continuous cutting; bridge/road grades stay intact.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { shapeRailCut, buildRailCut } from '../src/world/cherkasy/railcut.js';
import { shapeOverpass } from '../src/world/cherkasy/overpass.js';
import { cumulate, pointAt, along } from '../src/world/cherkasy/bridgekit.js';

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const bytes = readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url));
const dem = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const geo = FRAME_OF(map), baseline = createHeightField(map, dem), hf = createHeightField(map, dem);
const cut = shapeRailCut(hf, map, geo);
assert(cut?.carved > 100, 'the missed railway trench is carved over many raster nodes');
const route = cut.route, cum = cumulate(route);
let maxDepth = 0, worstGrade = 0;
for (let s = cut.start; s < cut.length - 100; s += 5) {
  const a = pointAt(route, cum, s), b = pointAt(route, cum, s + 5);
  const y = hf.heightAt(a[0], a[1]), old = baseline.heightAt(a[0], a[1]);
  assert(y <= old + 0.001, 'the cutting never raises the terrain');
  maxDepth = Math.max(maxDepth, old - y);
  worstGrade = Math.max(worstGrade, Math.abs(y - hf.heightAt(b[0], b[1])) / 5);
}
assert(maxDepth > 7 && maxDepth < 12, `a deep trench is visible (${maxDepth.toFixed(1)}m)`);
assert(worstGrade < 0.035, `no abrupt track steps (${(100 * worstGrade).toFixed(1)}% max lattice grade)`);
// The bed is level across the full ballast width (below its 0.13 m toe clearance), so grass cannot poke through
// the track where the trench is deep.
let bedTilt = 0;
for (let s = cut.start; s < cut.length - 150; s += 2) {
  const [x, z, dx, dz] = pointAt(route, cum, s);
  if (baseline.heightAt(x, z) - hf.heightAt(x, z) < 1) continue;
  const y = hf.heightAt(x, z);
  for (const side of [-2.55, 2.55]) bedTilt = Math.max(bedTilt, Math.abs(hf.heightAt(x - dz * side, z + dx * side) - y));
}
assert(bedTilt < 0.1, `the trench bed is level under the ballast (${bedTilt.toFixed(3)}m)`);
// Issue #34: Odeska and Sumhaitska run along the top of the cutting. The terrain lattice is not carved any more, and
// no street within reach of the trench leans sideways more than it did on the natural ground.
assert.deepEqual(hf.data.grid, baseline.data.grid, 'the 16 m terrain lattice is left as it was');
let tilted = 0, streets = 0;
for (const r of map.roads) {
  if (r.k !== 'm' || r.br) continue;
  for (let i = 2; i < r.p.length; i += 2) {
    const ax = r.p[i - 2], az = r.p[i - 1], ex = r.p[i] - ax, ez = r.p[i + 1] - az, len = Math.hypot(ex, ez);
    if (len < 1) continue;
    const nx = -ez / len * r.w / 2, nz = ex / len * r.w / 2;
    for (let t = 0; t < len; t += 4) {
      const x = ax + ex * t / len, z = az + ez * t / len;
      if (along(route, x, z).d > 70) continue;
      const fall = (h) => Math.abs(h.heightAt(x + nx, z + nz) - h.heightAt(x - nx, z - nz)) / r.w;
      streets++;
      if (fall(hf) > fall(baseline) + 0.01) tilted++;
    }
  }
}
assert(streets > 1000 && tilted === 0, `no street beside the cutting leans into it (${tilted} of ${streets} samples)`);
const p = geo.toXZ(49.455026, 32.019907);
assert(baseline.heightAt(...p) - hf.heightAt(...p) > 4.5, 'the school footbridge crosses a deep cutting');
// Issue #36: the line runs at grade through the Lunacharka level crossing (OSM node 1685711953: the service road and
// its footpath) and everything before it; the cut starts only past it, short of the footbridge.
const lx = geo.toXZ(49.4534998, 32.0199931);
assert(cut.start > along(route, ...lx).s && cut.start < along(route, ...lx).s + 40, `the cut starts just past the level crossing (${cut.start.toFixed(0)} m)`);
for (let dx = -12; dx <= 12; dx += 3) for (let dz = -12; dz <= 12; dz += 3)
  assert(baseline.heightAt(lx[0] + dx, lx[1] + dz) - hf.heightAt(lx[0] + dx, lx[1] + dz) < 0.03, 'the level crossing, its road and path keep their level');
for (let s = 0; s < cut.start; s += 5) { const [x, z] = pointAt(route, cum, s); assert.equal(hf.heightAt(x, z), baseline.heightAt(x, z), 'no cut before the crossing'); }
const site = buildRailCut({ ground: null });
assert(site.clear(...p), 'generated trees stay off the railway bed');
assert(!site.clear(p[0] + 100, p[1] + 100), 'the wider neighbourhood is not cleared');
const untouched = geo.toXZ(49.455026, 32.0229);
assert.equal(hf.heightAt(...untouched), baseline.heightAt(...untouched), 'nearby streets retain their original terrain');
const alone = shapeOverpass(baseline, map, geo), combined = shapeOverpass(hf, map, geo);
assert.deepEqual(combined.deck, alone.deck, 'the road bridge span remains unchanged');
assert.deepEqual(combined.foot, alone.foot, 'the pipeline footbridge span remains unchanged');
for (const ll of [[49.4661174, 32.0219967], [49.4664309, 32.0223436], [49.4665372, 32.0220144], [49.4694278, 32.0258506]]) {
  const q = geo.toXZ(...ll);
  assert.equal(hf.heightAt(...q), baseline.heightAt(...q), 'the overpass and dam approach retain their existing grades');
}
assert.equal(shapeRailCut(hf, { ...map, rails: [] }, geo), null, 'missing route fails safely');
assert.equal(buildRailCut({ ground: null }), null, 'a failed hook cannot reuse terrain state from an earlier world');
console.log(`rail cutting: ${cut.carved} cells, ${cut.length.toFixed(0)}m, max depth ${maxDepth.toFixed(1)}m, max grade ${(100 * worstGrade).toFixed(1)}%; all checks passed`);
