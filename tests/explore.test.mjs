// The standing sights quest (src/game/explore.js) on the real places: reach, visiting, storage, new sights for a
// returning player. Run: node tests/explore.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createExplore, reachOf } from '../src/game/explore.js';
import { resolvePlaces } from '../src/world/cherkasy/places.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../public/assets/cherkasy/${f}`, import.meta.url)));
const map = read('map.json');
map.buildings = read('map_buildings.json');
const geo = FRAME_OF(map);
const fresh = () => ({ places: resolvePlaces(map, geo), groundHeight: () => 0 });
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
const player = { position: { x: 1e6, y: 0, z: 1e6 } };
const banners = [], counts = [], hud = { setExplore: (n, t) => counts.push([n, t]), mission: { banner: (t) => banners.push(t) } };

let world = fresh();
const sights = world.places.filter((q) => q.kind === 'sight');
assert.ok(sights.length >= 15, `sights resolved: ${sights.length}`);
for (const q of sights) { const r = reachOf(q); assert.ok(r >= 60 && r < 250, `${q.id} reach ${r.toFixed(0)}`); }

const S = store();
let money = 0;
let ex = createExplore({ world, player, hud, storage: S, reward: (n) => { money += n; } });
assert.equal(ex.visited, 0); assert.equal(ex.total, sights.length);
assert.ok(world.places.filter((q) => q.kind === 'ad').every((q) => q.visited === undefined), 'partners are not part of it');
const t = ex.list[0];
Object.assign(player.position, { x: t.x + 30, z: t.z });
ex.update(0.3);
assert.equal(ex.visited, 1); assert.equal(t.visited, true); assert.equal(money, 50);
ex.update(0.3); assert.equal(money, 50, 'once only');
Object.assign(player.position, { x: t.x + 30, y: 500, z: t.z }); // high above another sight: no count
const u = ex.list[1]; Object.assign(player.position, { x: u.x, z: u.z }); ex.update(0.3);
assert.equal(ex.visited, 1, 'a high pass does not count');

// a returning player: the visited one is remembered; a sight added since then is announced
const saved = JSON.parse(S.m.get('cherkasy.explore'));
S.setItem('cherkasy.explore', JSON.stringify({ visited: [...saved.visited, 'gone'], known: saved.known.filter((id) => id !== u.id) }));
world = fresh(); banners.length = 0;
ex = createExplore({ world, player: { position: { x: 1e6, y: 0, z: 1e6 } }, hud, storage: S });
assert.equal(ex.visited, 1, 'unknown stored ids do not count');
assert.equal(ex.list.find((q) => q.id === t.id).visited, true);
ex.update(5);
assert.ok(banners.some((b) => b.includes('Нові пам’ятки: 1')), banners.join(' | '));
for (const q of ex.list) ex.visit(q.id);
assert.equal(ex.visited, ex.total); assert.ok(banners.at(-1).includes('Усі'));
assert.deepEqual(counts.at(-1), [ex.total, ex.total]);
console.log('explore: ok');
