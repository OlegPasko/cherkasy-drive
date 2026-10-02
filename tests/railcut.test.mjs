// OWNER: cherkasy. Issue #30: the actual rail route is in a continuous cutting; bridge/road grades stay intact.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { shapeRailCut, buildRailCut } from '../src/world/cherkasy/railcut.js';
import { shapeOverpass } from '../src/world/cherkasy/overpass.js';
import { cumulate, pointAt } from '../src/world/cherkasy/bridgekit.js';

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const bytes = readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url));
const dem = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const geo = FRAME_OF(map), baseline = createHeightField(map, dem), hf = createHeightField(map, dem);
const cut = shapeRailCut(hf, map, geo);
assert(cut?.carved > 100, 'the missed railway trench is carved over many lattice cells');
const route = cut.route, cum = cumulate(route);
let maxDepth = 0, worstGrade = 0;
for (let s = 100; s < cut.length - 100; s += 5) {
  const a = pointAt(route, cum, s), b = pointAt(route, cum, s + 5);
  const y = hf.heightAt(a[0], a[1]), old = baseline.heightAt(a[0], a[1]);
  assert(y <= old + 0.001, 'the cutting never raises the terrain');
  maxDepth = Math.max(maxDepth, old - y);
  worstGrade = Math.max(worstGrade, Math.abs(y - hf.heightAt(b[0], b[1])) / 5);
}
assert(maxDepth > 7 && maxDepth < 12, `a deep trench is visible (${maxDepth.toFixed(1)}m)`);
assert(worstGrade < 0.035, `no abrupt track steps (${(100 * worstGrade).toFixed(1)}% max lattice grade)`);
// Ground triangles and bilinear height sampling can disagree in a saddle-shaped lattice cell.
// Bound that error across the full ballast width below its 0.13 m toe clearance, so grass cannot poke
// through the track as alternating grey islands. Both cell diagonal choices obey this cross-term bound.
let saddleError = 0;
const { meta: { x0, z0, cell, nx }, grid } = hf.data;
for (let s = 100; s < cut.length - 150; s += 2) {
  const [x, z, dx, dz] = pointAt(route, cum, s);
  for (const side of [-2.55, 0, 2.55]) {
    const i = Math.floor((x - dz * side - x0) / cell), j = Math.floor((z + dx * side - z0) / cell), n = j * nx + i;
    saddleError = Math.max(saddleError, Math.abs(grid[n] - grid[n + 1] - grid[n + nx] + grid[n + nx + 1]) / 4);
  }
}
assert(saddleError < 0.12, `terrain cannot bury ballast between samples (${saddleError.toFixed(3)}m)`);
const p = geo.toXZ(49.455026, 32.019907);
assert(baseline.heightAt(...p) - hf.heightAt(...p) > 7, 'the school footbridge crosses a deep cutting');
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
