// Headless checks for the hand-built road / rail crossings: node tests/overpass.test.mjs
//   the Dakhnivska overpass (src/world/cherkasy/overpass.js, issues #21 / #22): the terrain hook cuts Sumhaitska and the
//   track below the deck, the deck clears both by a lorry's height, the car finds the deck with a height hint and the
//   road under it without one, the bridge lanes ride the deck, and the railway no longer has a level crossing there;
//   the prosp. Khimikiv viaduct (khimbridge.js, issue #24): it climbs off the roundabout at grade, clears the main
//   tracks, carries the car and the traffic lanes over its hump and leaves the streets under it free;
//   the raised line and its four underpasses (railbridge.js, issue #24): the tracks are laid at the line's level, the
//   decks clear the streets, the car drives under them and is stopped by the bank beside them;
//   the coat-of-arms stele on the Velyke kolo (gerb.js): it builds and the car cannot drive through it.
import { readFileSync } from 'node:fs';
import { createCollisionWorld } from '../src/world/collision.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { shapeOverpass, buildOverpass } from '../src/world/cherkasy/overpass.js';
import { buildLaneNetwork } from '../src/npc/lanes.js';
import * as THREE from 'three';

const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };

let fails = 0;
const log = console.log; console.log = () => {};
const ok = (c, msg) => { if (!c) { fails++; log('FAIL', msg); } else log('ok  ', msg); };

const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const dem = new Int16Array(readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url)).buffer.slice(0));
const geo = FRAME_OF(map), hf = createHeightField(map, dem);
const at = (la, lo) => geo.toXZ(la, lo);
const H0 = (p) => hf.heightAt(...p);
const A = at(49.4660577, 32.0223845), B = at(49.4666672, 32.0216036); // the bridge way's ends (OSM 72051305)
const meet = (p, q, a, b) => { const ex = q[0] - p[0], ez = q[1] - p[1], fx = b[0] - a[0], fz = b[1] - a[1], t = ((a[0] - p[0]) * fz - (a[1] - p[1]) * fx) / (ex * fz - ez * fx); return [p[0] + ex * t, p[1] + ez * t]; };
const ROAD = meet(A, B, at(49.4661174, 32.0219967), at(49.4664309, 32.0223436)), RAIL = meet(A, B, at(49.465839, 32.0213758), at(49.4665372, 32.0220144));
const ux = (B[0] - A[0]) / Math.hypot(B[0] - A[0], B[1] - A[1]), uz = (B[1] - A[1]) / Math.hypot(B[0] - A[0], B[1] - A[1]);
const SE = [A[0] - ux * 30, A[1] - uz * 30], NW = [B[0] + ux * 30, B[1] + uz * 30]; // on the approaches
const before = [ROAD, RAIL, SE, NW].map(H0);

const shaped = shapeOverpass(hf, map, geo);
ok(shaped && shaped.carved > 50, `terrain hook carved ${shaped?.carved} lattice nodes`);
const after = [ROAD, RAIL, SE, NW].map(H0);
ok(before[0] - after[0] > 4.5 && before[1] - after[1] > 4.5, `road and track sink into the cutting (${(before[0] - after[0]).toFixed(1)} / ${(before[1] - after[1]).toFixed(1)} m)`);
ok(after[2] >= before[2] - 0.05 && after[3] >= before[3] - 0.05, 'the Dakhnivska approaches are not cut');

const cw = createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) });
const root = new THREE.Group();
const site = buildOverpass({ root, solids: cw, heightAt: hf.heightAt, geo, ground: null, detailMat: null });
ok(!!site && root.children.length === 1, 'site builds');
const span = shaped.deck[1] - shaped.deck[0];
ok(span > 80 && span < 125, `deck spans ${span.toFixed(0)} m (OSM: 88 m)`);
let nan = 0;
root.traverse((o) => { if (o.isMesh) for (const v of o.geometry.attributes.position.array) if (!Number.isFinite(v)) nan++; });
ok(nan === 0, 'no NaN positions');

const deckRoad = site.deckAt(...ROAD), deckRail = site.deckAt(...RAIL);
ok(deckRoad != null && deckRoad - 1.15 - after[0] > 5.0, `clearance over the road ${(deckRoad - 1.15 - after[0]).toFixed(1)} m`);
ok(deckRail != null && deckRail - 1.15 - after[1] > 5.5, `clearance over the track ${(deckRail - 1.15 - after[1]).toFixed(1)} m`);
const onDeck = cw.groundHeight(ROAD[0], ROAD[1], deckRoad + 1), below = cw.groundHeight(ROAD[0], ROAD[1]);
ok(Math.abs(onDeck - deckRoad) < 0.05, `the car with a height hint stands on the deck (${onDeck.toFixed(2)})`);
ok(Math.abs(below - after[0]) < 0.05, `without one it stays on the road under it (${below.toFixed(2)})`);
ok(cw.ceilingAt(ROAD[0], ROAD[1], after[0] + 0.5) - after[0] > 5, 'nothing hangs low over the lower road');
ok(site.deckAt(...SE) == null && site.deckAt(...NW) == null, 'the deck ends on the approaches');

// lanes: Dakhnivska's bridge lanes take the deck height, Sumhaitska's under it the road's
const net = buildLaneNetwork(map, (x, z) => hf.heightAt(x, z), { deckAt: site.deckAt });
const passes = (L, p, r) => { const f = Math.max(0, Math.min(L.len, (p[0] - L.ax) * L.dx + (p[1] - L.az) * L.dz)); return Math.hypot(L.ax + L.dx * f - p[0], L.az + L.dz * f - p[1]) < r; };
const near = net.links.filter((L) => passes(L, ROAD, 12));
const upper = near.filter((L) => L.bridge), lower = near.filter((L) => !L.bridge && /Сумгаїт/.test(L.name));
ok(upper.length >= 2 && upper.every((L) => Math.max(L.y0, L.y1) > after[0] + 5), `bridge lanes ride the deck (${upper.length})`);
ok(lower.length >= 2 && lower.every((L) => Math.max(L.y0, L.y1) < after[0] + 4), `Sumhaitska lanes stay below (${lower.length})`);

// the railway: no level crossing at the bridge any more
const { buildRails } = await import('../src/world/cherkasy/station_rails.js');
const R = buildRails({ root: new THREE.Group(), map, heightAt: hf.heightAt, ground: { onAsphalt: () => false }, solids: cw, geo }, {});
ok(R.stats().crossings > 0, `railways build (${R.stats().crossings} crossings)`);
ok(!(R.crossings ?? []).some((c) => Math.hypot(c.x - RAIL[0], c.z - RAIL[1]) < 40), 'no level crossing under the bridge');

// ------------------------------------------------------------------ the prosp. Khimikiv viaduct (issue #24)
const { buildKhimBridge } = await import('../src/world/cherkasy/khimbridge.js');
const khim = buildKhimBridge({ root: new THREE.Group(), map, solids: cw, heightAt: hf.heightAt, geo, ground: null, detailMat: null });
ok(!!khim, 'Khimikiv viaduct builds');
const KA = at(49.4143007, 32.0324087), KB = at(49.4116296, 32.0376424), kl = Math.hypot(KB[0] - KA[0], KB[1] - KA[1]);
const kAt = (t, o = 0) => [KA[0] + (KB[0] - KA[0]) * t / kl - (KB[1] - KA[1]) / kl * o, KA[1] + (KB[1] - KA[1]) * t / kl + (KB[0] - KA[0]) / kl * o];
const ks = khim.stats();
const foot = kAt(ks.tA + 0.5);
ok(Math.abs(khim.deckAt(...foot) - hf.heightAt(...foot)) < 0.25, `the ramp leaves the roundabout exit at grade (${(khim.deckAt(...foot) - hf.heightAt(...foot)).toFixed(2)} m)`);
const main = kAt(298); // the main tracks under it (OSM 296–300 m from the north-west end)
ok(khim.deckAt(...main) - 1.15 - hf.heightAt(...main) > 6.5, `clearance over the main tracks ${(khim.deckAt(...main) - 1.15 - hf.heightAt(...main)).toFixed(1)} m`);
let worst = 0;
for (let t = ks.tA + 0.1; t + 3.1 <= ks.tB; t += 3) worst = Math.max(worst, Math.abs(khim.deckAt(...kAt(t + 3)) - khim.deckAt(...kAt(t))) / 3);
ok(worst < 0.07, `its steepest grade ${(worst * 100).toFixed(1)} %`);
const kc = kAt(200), kTop = khim.deckAt(...kc);
ok(Math.abs(cw.groundHeight(kc[0], kc[1], kTop + 1) - kTop) < 0.05, 'the car with a height hint stands on the viaduct');
ok(Math.abs(cw.groundHeight(kc[0], kc[1]) - hf.heightAt(...kc)) < 0.05, 'without one it stays on the ground under it');
const ramp = kAt(ks.tA + 25);
ok(Math.abs(cw.groundHeight(ramp[0], ramp[1]) - khim.deckAt(...ramp)) < 0.05, 'the closed ramp is solid ground for the car');
// lanes over the hump follow it; the side street under it at t ~ 42 m stays on the ground
const net2 = buildLaneNetwork(map, (x, z) => hf.heightAt(x, z), { deckAt: (x, z) => site.deckAt(x, z) ?? khim.deckAt(x, z) });
const kl2 = net2.links.filter((L) => L.bridge && khim.deckAt(L.cx, L.cz) != null);
const off = Math.max(...kl2.map((L) => Math.abs((L.y0 + L.y1) / 2 - khim.deckAt(L.cx, L.cz))));
ok(kl2.length >= 20 && off < 0.35, `Khimikiv lanes ride the viaduct (${kl2.length} lanes, off by <= ${off.toFixed(2)} m)`);
const side = net2.links.filter((L) => !L.bridge && passes(L, kAt(42), 6));
ok(side.length >= 1 && side.every((L) => Math.max(L.y0, L.y1) < hf.heightAt(...kAt(42)) + 1), `the street under it stays below (${side.length} lanes)`);

// ------------------------------------------------------------------ the raised line and its underpasses (issue #24)
const RB = await import('../src/world/cherkasy/railbridge.js');
const railLevel = RB.railLevelFn(geo, hf.heightAt);
const rb = RB.buildRailBridges({ root: new THREE.Group(), map, solids: cw, heightAt: hf.heightAt, geo, ground: null, detailMat: null });
ok(!!rb && rb.bridges.length === 4, `four underpasses build (${rb?.bridges.map((b) => b.id).join(', ')})`);
for (const b of rb.bridges) {
  ok(b.span && b.clear >= 3.9, `${b.id}: deck ${b.span ? (b.span[1] - b.span[0]).toFixed(0) : '-'} m, clearance over the street ${b.clear?.toFixed(1)} m`);
  const p = b.at, y = cw.groundHeight(p[0], p[1]), lvl = railLevel(...p);
  ok(lvl != null && lvl - hf.heightAt(...p) > 4.5 && Math.abs(y - hf.heightAt(...p)) < 0.05 && cw.ceilingAt(p[0], p[1], y + 0.3) - y > 3.9,
    `${b.id}: the street passes under at grade, the bed ${(lvl - y).toFixed(1)} m over it`);
}
// beside a deck the bank is solid: a point on its top ~60 m along the line from Smilianska
{ const q = at(49.43375, 32.05245), top = cw.groundHeight(q[0], q[1]), lvl = railLevel(...q);
  ok(lvl != null && Math.abs(top - lvl) < 0.3, `the bank carries the car at the bed level (${top.toFixed(2)} / ${lvl?.toFixed(2)})`); }
const R2 = buildRails({ root: new THREE.Group(), map, heightAt: hf.heightAt, ground: { onAsphalt: () => false }, solids: createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) }), geo, railLevel }, {});
ok(!(R2.crossings ?? []).some((c) => rb.bridges.some((b) => Math.hypot(c.x - b.at[0], c.z - b.at[1]) < 60)), 'no level crossings at the underpasses');
{ // the tracks on the Smilianska deck are laid at the line's level, not on the street
  const p = rb.bridges[0].at, lvl = railLevel(...p);
  let top = -Infinity;
  const g = new THREE.Group(); buildRails({ root: g, map, heightAt: hf.heightAt, ground: { onAsphalt: () => false }, solids: createCollisionWorld({ terrain: (x, z) => hf.heightAt(x, z) }), geo, railLevel }, {});
  g.traverse((o) => { if (!o.isMesh) return; const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i] - p[0], a[i + 2] - p[1]) < 3) top = Math.max(top, a[i + 1]); });
  ok(Math.abs(top - (lvl + 0.53)) < 0.25, `the rails over Smilianska run at the line's level (${(top - lvl).toFixed(2)} m over the bed base)`);
}

// ------------------------------------------------------------------ the coat-of-arms stele (issue #24)
const { buildGerb } = await import('../src/world/cherkasy/gerb.js');
const gerb = buildGerb({ root: new THREE.Group(), geo, solids: cw, heightAt: hf.heightAt });
ok(!!gerb && gerb.spots.length > 0, 'the stele builds');
const gp = at(49.4152526, 32.0306315), gy = hf.heightAt(...gp);
ok(cw.inside(gp[0], gy + 6, gp[1]) || cw.raycast({ x: gp[0] + 20, y: gy + 5, z: gp[1] }, { x: -1, y: 0, z: 0 }, 40) != null, 'the car cannot drive through it');

log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
