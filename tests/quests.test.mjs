// Headless checks for the quests (src/game/quests.js) and the quest data (src/game/quests/): node tests/quests.test.mjs
// The data: every card is complete, inside the playable map and within reach of a motor road, with a real source and no
// em-dashes. The logic: a card's light stands on the road edge beside its place and inside its search circle; nothing
// counts until a quest is active; entering the circle tells the hint once; driving into the light finds the card (money,
// storage, the circle leaves the map); a fresh start reads the progress back; a high pass does not count.
import fs from 'fs';
import * as THREE from 'three';
import { createQuests, curbSpot } from '../src/game/quests.js';
import { QUESTS } from '../src/game/quests/index.js';
import { FRAME_OF } from '../src/world/cherkasy/frame.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

const map = JSON.parse(fs.readFileSync(new URL('../public/assets/cherkasy/map.json', import.meta.url)));
const f = FRAME_OF(map), R = map.region;

// ---- the data
const ids = new Set();
for (const q of QUESTS) {
  ok(q.id && q.title && q.icon && q.blurb && q.reward > 0 && q.rewardAll > 0 && q.cards.length >= 1, `quest ${q.id}: complete`);
  const bad = [];
  for (const c of q.cards) {
    const why = [];
    if (ids.has(c.id)) why.push('duplicate id'); ids.add(c.id);
    if (!c.title || !c.icon || !c.hint || !c.story) why.push('missing text');
    if (!/^https:\/\//.test(c.source?.url || '') || !c.source?.name) why.push('no source');
    if (/—/.test(`${c.title}${c.hint}${c.story}`)) why.push('em-dash');
    if (c.hint.length > 200 || c.story.length > 800) why.push('too long');
    const [x, z] = f.toXZ(...(c.at || c.ll));
    if (!(x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1)) why.push('outside the map');
    else if (!curbSpot(map, x, z, 120)) why.push('no motor road within 120 m');
    if (why.length) bad.push(`${c.id}: ${why.join(', ')}`);
  }
  ok(!bad.length, `quest ${q.id}: ${q.cards.length} cards valid${bad.length ? ` – ${bad.join('; ')}` : ''}`);
}

// ---- the logic, on the real map with a flat ground
const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const quest = QUESTS[0];
const world = { cherkasy: { map }, groundHeight: () => 0 };
const player = { position: new THREE.Vector3(0, 0.5, 0) };
const banners = [];
const hud = { mission: { banner: (t, s) => banners.push([t, s]) } };
let money = 0;
const scene = new THREE.Scene();
const make = () => createQuests({ world, player, scene, hud, reward: (n) => { money += n; }, storage, container: null });
let Q = make();
const L = Q.list.find((l) => l.quest.id === quest.id), c0 = L.cards[0];
ok(Math.hypot(c0.spot.x - c0.zone.x, c0.spot.z - c0.zone.z) < c0.zone.r * 0.7, 'the light is well inside its search circle');
ok(Math.hypot(c0.spot.x - c0.x, c0.spot.z - c0.z) < 120, `the light is beside the place (${Math.hypot(c0.spot.x - c0.x, c0.spot.z - c0.z).toFixed(0)} m)`);
const run = (s = 1) => { for (let i = 0; i < s * 60; i++) Q.update(1 / 60); };
player.position.set(c0.spot.x, 0.5, c0.spot.z); run();
ok(!c0.found && money === 0 && !Q.zones().length, 'no active quest: nothing counts, no circles');
Q.setActive(quest.id);
ok(Q.zones().length === L.cards.length, 'active: a circle per card');
ok(scene.children.filter((o) => o.name.startsWith('quest-')).length === L.cards.length, 'active: a light per card');
banners.length = 0;
player.position.set(c0.spot.x, 120, c0.spot.z); run();
ok(!c0.found, 'a high pass over the light does not count');
player.position.set(c0.zone.x, 0.5, c0.zone.z); run(); run();
ok(banners.filter((b) => b[1] === c0.hint).length === 1, 'the circle tells its hint once');
player.position.set(c0.spot.x + 5, 0.5, c0.spot.z); run();
ok(c0.found && money === quest.reward, `driving into the light finds the card (+${money} ₴)`);
player.position.set(c0.spot.x + 10, 0.5, c0.spot.z); run(0.5);
ok(Q.shown === c0, 'the story card stays while the car is by the light');
player.position.set(c0.spot.x + 60, 0.5, c0.spot.z); run(0.5);
ok(Q.shown === null, 'driving off closes it');
ok(Q.zones().length === L.cards.length - 1 && scene.children.filter((o) => o.name.startsWith('quest-')).length === L.cards.length - 1, 'its circle and light are gone');
const st = JSON.parse(mem.get('cherkasy.quests'));
ok(st.active === quest.id && st.found.includes(c0.id), 'progress stored');
Q.dispose(); Q = make();
ok(Q.active?.id === quest.id && Q.list[0].cards[0].found && Q.zones().length === L.cards.length - 1, 'a fresh start reads it back');
for (const c of Q.list[0].cards) Q.find(c.id);
ok(money === quest.reward * L.cards.length + quest.rewardAll, `finding all pays the bonus (${money} ₴)`);
Q.setActive(null);
ok(!Q.zones().length && !scene.children.some((o) => o.name.startsWith('quest-')), 'stopping the quest clears the map and the lights');

console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
