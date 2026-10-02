// Headless checks for the Dakhnivska overpass (src/world/cherkasy/overpass.js, issues #21 / #22): node tests/overpass.test.mjs
// On the real map: the terrain hook cuts Sumhaitska and the track below the deck, the deck clears both by a lorry's
// height, the car finds the deck with a height hint and the road under it without one, the bridge lanes ride the deck,
// and the railway no longer has a level crossing there.
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

log(fails ? `${fails} failed` : 'all ok');
process.exit(fails ? 1 : 0);
