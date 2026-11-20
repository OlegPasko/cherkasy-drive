// Headless checks for cottage quarters and townhouse rows (issue #45, вул. Руставі): node tests/townhouses.test.mjs
// The map build no longer lends nine storeys to untagged outlines among houses, rows get the townhouse archetype, and
// the facade kit gives a row its doors, canopies (awnings) and party-wall ribs.
import { readFileSync } from 'node:fs';
import { buildBuildings, archetype } from '../src/world/buildings.js';
import { dressBuilding } from '../src/world/cherkasy/facadekit.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
globalThis.performance ??= { now: () => Date.now() };

const B = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const byId = new Map(B.map((b) => [b.id, b]));
// the townhouse rows south of вул. Руставі (residential landuse of terraces and houses; Таунхауси Olivia)
for (const id of [712686287, 712686288, 986740265]) {
  const b = byId.get(id);
  ok(b && b.k === 'house' && b.lv === 2 && b.row === 1, `Руставі townhouse row ${id} is a two-storey row (${b?.k} ${b?.lv})`);
}
ok(byId.get(712686290)?.lv <= 3, 'the untagged block beside Olivia gets at most three storeys');
// the real nine-storey blocks on the north side keep their tagged levels
for (const id of [110881706, 121823959, 139386232]) ok(byId.get(id)?.k === 'apt' && byId.get(id)?.lv === 9, `Руставі ${id} stays a nine-storey block`);
const rows = B.filter((b) => b.row).length;
ok(rows > 5 && rows < 300, `a modest number of inferred rows city-wide (${rows})`);

// archetype: rows are townhouses with a gable, other houses keep their old draw
const seq = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const A = archetype({ k: 'house', bt: 'terrace', lv: 2 }, seq(7));
ok(A.row === 1 && A.roof === 'gable' && A.lv === 2, 'a terrace is a gabled two-storey townhouse row');
const H1 = archetype({ k: 'house', lv: 1 }, seq(7)), H2 = archetype({ k: 'house', lv: 1 }, seq(7));
ok(!H1.row && JSON.stringify(H1) === JSON.stringify(H2), 'an ordinary house is not a row (and stays deterministic)');

// a 48 x 10 m row through the generator with the facade kit: doors under awnings, one per unit on the front side
const solids = [];
const S = { prism: (poly, y0, a, bx, bz, kind, flags) => solids.push({ kind, flags }), box: () => {}, cyl: () => {}, get count() { return solids.length; } };
const row = { id: 990001, k: 'house', lv: 2, row: 1, p: [0, 0, 48, 0, 48, 10, 0, 10], f: '1000' };
const res = buildBuildings({ map: { buildings: [row] }, solids: S, heightAt: () => 0, dress: dressBuilding });
const awn = solids.filter((s) => s.kind === 'awning').length;
ok(awn >= 6 && awn <= 9, `door canopies on the front side (${awn})`);
const fp = res.footprints[0];
ok(fp && fp.h > 6 && fp.h < 12, `two storeys under a gable (top ${fp?.h.toFixed(1)} m)`);

// every row of the real map: a door stands in the pier between its unit's two windows, where the facade shader draws
// them (facade.js quad: round(L / bayW) bays over the whole wall, a window winW of its bay wide in each) - the kit
// used to count margin-inset bays and put most doors half across a window
{
  const real = B.filter((b) => b.k === 'house' && (b.row || b.bt === 'terrace'));
  let doors = 0, onWindow = 0, offUnit = 0, offWall = 0, withDoors = 0, canopies = 0;
  const S2 = { prism: (poly, y0, a, bx, bz, kind) => { if (kind === 'awning') canopies++; }, box: () => {}, cyl: () => {}, count: 0 };
  buildBuildings({ map: { buildings: real }, solids: S2, heightAt: () => 0, dress: (c) => {
    const n0 = c.doors.length; dressBuilding(c);
    if (c.doors.length > n0) withDoors++;
    for (let i = n0; i < c.doors.length; i += 6) {
      const x = c.doors[i], z = c.doors[i + 1], hw = c.doors[i + 4]; let edge = null;
      for (let k = 0; k < c.outer.length && !edge; k++) {
        const p = c.outer[k], q = c.outer[(k + 1) % c.outer.length], dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1, t = ((x - p[0]) * dx + (z - p[1]) * dz) / (L * L);
        if (t >= 0 && t <= 1 && Math.hypot(p[0] + dx * t - x, p[1] + dz * t - z) < 0.02) edge = { L, s: t * L };
      }
      doors++;
      if (!edge) { offWall++; continue; }
      const nb = Math.round(edge.L / c.A.bayW), bw = edge.L / nb, k = (edge.L - edge.s) / bw;
      for (let j = 0; j < nb; j++) if (Math.abs(edge.s - (j + 0.5) * bw) < hw + c.A.winW * bw / 2 + 0.1) onWindow++; // 0.1: the window's frame
      if (Math.abs(k - Math.round(k)) > 0.01 || !(Math.round(k) & 1) || hw < 0.45 || hw > 0.56) offUnit++;
    }
  } });
  ok(real.length > 50 && withDoors > 0.8 * real.length && doors > 300, `the map's ${real.length} rows: ${withDoors} with doors, ${doors} doors`);
  ok(offWall === 0 && onWindow === 0, `no door across a window (${onWindow} of ${doors})`);
  ok(offUnit === 0 && canopies === doors, `each in the middle pier of a two-bay unit, 0.9-1.1 m wide, under its canopy (${offUnit} are not; ${canopies} canopies)`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
