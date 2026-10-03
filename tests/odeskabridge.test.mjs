// Issue #38: the Lunacharka interchange – Н-16 on a bridge over Одеська, the railway and Сумгаїтська, not at grade.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';
import { createHeightField } from '../src/world/cherkasy/ground.js';
import { shapeRailCut } from '../src/world/cherkasy/railcut.js';
import { shapeOdeskaBridge, buildOdeskaBridge } from '../src/world/cherkasy/odeskabridge.js';
import { createCollisionWorld } from '../src/world/collision.js';
import { crossing } from '../src/world/cherkasy/bridgekit.js';
import { buildLaneNetwork } from '../src/npc/lanes.js';

const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }) };
const map = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
map.buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
const bytes = readFileSync(new URL('../public/assets/cherkasy/dem.bin', import.meta.url));
const dem = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const geo = FRAME_OF(map), base = createHeightField(map, dem), hf = createHeightField(map, dem);
shapeRailCut(hf, map, geo);
const shaped = shapeOdeskaBridge(hf, map);
assert.ok(shaped && shaped.lowered > 10 && shaped.raised > 5, `terrain shaped (${JSON.stringify(shaped)})`);
const solids = createCollisionWorld({ terrain: hf.heightAt });
const site = buildOdeskaBridge({ root: new THREE.Group(), solids, heightAt: hf.heightAt, ground: null, detailMat: null });
assert.ok(site, 'the bridge builds');
// the streets and the track pass under it with room for a bus; the cross road rides the deck
const odeska = [-704.6, -3241.1], rail = [-694.2, -3223.1], sumh = [-681.8, -3201.6];
for (const [p, what, room] of [[odeska, 'Одеська', 4.8], [sumh, 'Сумгаїтська', 4.8], [rail, 'the railway', 6]]) {
  const deck = site.deckAt(...p);
  assert.ok(deck != null, `${what} is under the deck`);
  const y = hf.heightAt(...p), under = deck - 1.15 - y;
  assert.ok(under >= room, `${what}: ${under.toFixed(1)} m under the girders`);
  assert.ok(solids.groundHeight(p[0], p[1], y + 2) < y + 0.5, `${what}: a car under the deck stands on the street`);
  assert.ok(solids.groundHeight(p[0], p[1], deck + 1) > deck - 0.3, `${what}: a car on the deck stays on it`);
  assert.ok(base.heightAt(...p) - y < 9, 'no deep pit');
}
// the deck ends sit on the embankments, so the road joins it without a step
for (const t of [0.3, 0.7]) {
  const [x, z] = [-722.6 + (-661.2 + 722.6) * (t < 0.5 ? 0.002 : 0.998), -3271.9 + (-3164.2 + 3271.9) * (t < 0.5 ? 0.002 : 0.998)];
  assert.ok(Math.abs(site.deckAt(x, z) - hf.heightAt(x, z)) < 0.25, `deck end meets the ground (${(site.deckAt(x, z) - hf.heightAt(x, z)).toFixed(2)} m)`);
}
// lanes: the cross road's lanes ride the deck over the line, no lane runs at grade across the track here
const net = buildLaneNetwork(map, hf.heightAt, { deckAt: site.deckAt });
const RAIL = [[-750, -3175.3], [-695, -3223], [-584, -3317]];
let over = 0;
for (const l of net.links) {
  const c = crossing(RAIL, [l.ax, l.az], [l.ax + l.dx * l.len, l.az + l.dz * l.len]);
  if (!c || Math.hypot(l.ax - rail[0], l.az - rail[1]) > 120) continue;
  const d = site.deckAt(l.ax + l.dx * l.len * c.f, l.az + l.dz * l.len * c.f);
  assert.ok(d != null && l.bridge, 'a lane over the track here is a bridge lane on the deck');
  assert.ok(Math.min(l.y0, l.y1) > hf.heightAt(...rail) + 5, `the lane passes high over the track (${l.y0.toFixed(1)}, ${l.y1.toFixed(1)})`);
  over++;
}
assert.ok(over >= 2, `the cross road's lanes cross the line on the deck (${over})`);
console.log(`odeskabridge: all ok (deck ${shaped.deck.toFixed(1)} m, ${site.rows.length} pier rows, ${over} lanes over the track)`);
