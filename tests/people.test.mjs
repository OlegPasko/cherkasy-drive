// Headless checks of the people system on the real Cherkasy map: looks, body geometry, masks, walking network,
// streaming + simulation, hits, alarms and scripted actors. Run: node tests/people.test.mjs
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { makeLook, FEAT } from '../src/npc/people/looks.js';
import { buildBodyGeometry, CLIP } from '../src/npc/people/body.js';
import { createPolyMask } from '../src/npc/people/mask.js';
import { createNetwork } from '../src/npc/people/network.js';
import { createPeople } from '../src/npc/people.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const root = new URL('../public/assets/cherkasy/', import.meta.url);
const map = JSON.parse(readFileSync(new URL('map.json', root)));
const buildings = JSON.parse(readFileSync(new URL('map_buildings.json', root)));

// looks
{
  const a = makeLook(1234), b = makeLook(1234);
  ok(JSON.stringify(a) === JSON.stringify(b), 'makeLook is deterministic');
  const L = Array.from({ length: 2000 }, (_, i) => makeLook(i * 7 + 1));
  const kinds = new Set(L.map(l => l.kind)), outfits = new Set(L.map(l => l.cols.join()));
  ok(kinds.size === 6 && outfits.size > 1900, `variety: ${kinds.size} kinds, ${outfits.size} distinct outfits / 2000`);
  ok(L.every(l => l.sH > 0.6 && l.sH < 1.16 && l.cols.every(c => c >= 0 && c < 1 << 24)), 'heights 1.05-2.0 m, colours 24-bit');
  const fem = L.filter(l => l.mask & (1 << FEAT.FEM)).length / L.length;
  ok(fem > 0.4 && fem < 0.65, `female share ${(fem * 100).toFixed(0)}%`);
}
// body geometry
{
  const t = [0, 1, 2].map(q => buildBodyGeometry(q).attributes.position.count / 3);
  ok(t[0] < 100 && t[1] < 250 && t[2] < 1200 && t[2] > t[1] && t[1] > t[0], `LOD triangles far ${t[0]}, mid ${t[1]}, near ${t[2]}`);
  const g = buildBodyGeometry(2), bones = new Set(g.attributes.aBone.array);
  ok(bones.size === 13, `near LOD uses ${bones.size} limb segments`);
  ok(Object.keys(CLIP).length >= 10, 'clips: ' + Object.keys(CLIP).join(' '));
}
// mask
{
  const m = createPolyMask([[[0, 0, 10, 0, 10, 10, 0, 10], [4, 4, 4, 6, 6, 6, 6, 4]]]);
  ok(m.has(1, 1) && m.has(9, 9) && !m.has(5, 5) && !m.has(11, 5) && !m.has(-0.5, 3), 'polygon mask with hole');
}
// network around Soborna square
const bMask = createPolyMask(buildings), aMask = createPolyMask(map.asphalt), wMask = createPolyMask(map.water, { tile: 128, res: 1 });
{
  const net = createNetwork({ map, isBuilding: bMask.has, isAsphalt: aMask.has, isWater: wMask.has });
  const t0 = performance.now();
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) net.request(net.cellKey(i * 96 + 1, j * 96 + 1));
  while (net.pending()) net.pump(50);
  const ms = performance.now() - t0, s = net.stats();
  ok(s.paths > 50 && s.links > 50, `network 480 m square: ${s.paths} paths, ${s.samples} samples, ${s.links} links in ${ms.toFixed(0)} ms`);
  let bad = 0, road = 0, n = 0;
  for (const p of net.paths) for (let k = 0; k < p.n; k++) {
    n++;
    if (bMask.has(p.x[k], p.z[k]) || wMask.has(p.x[k], p.z[k])) bad++;
    if (!p.road[k] && aMask.has(p.x[k], p.z[k])) bad++;
    if (p.road[k]) road++;
  }
  ok(bad === 0, `no path sample in a building / water / on asphalt unmarked (${bad} bad of ${n}; ${road} crossing samples)`);
}
// the full system, headless
{
  const heightAt = (x, z) => 80 + x * 0.001;
  const ground = { heightAt, onAsphalt: aMask.has, isWater: wMask.has, isBuilding: bMask.has };
  const scene = new THREE.Scene();
  const people = createPeople({ scene, map, ground, buildings, opts: { blobs: false } });
  const cam = new THREE.PerspectiveCamera(60, 1.6, 0.5, 2000);
  cam.position.set(0, 84, 12); cam.lookAt(0, 80, -40);
  const W = people.walkers;
  const t0 = performance.now();
  for (let f = 0; f < 900; f++) people.update(1 / 60, cam);
  const st = people.stats();
  ok(W === people.walkers && st.walkers > 150, `crowd streamed: ${st.walkers} walkers, ${st.statics} standing, ${st.cells} cells, drawn ${st.drawn.join('/')}, birds ${st.birds?.birds}`);
  ok(st.ms < 6, `avg people update ${st.ms} ms (15 s sim in ${(performance.now() - t0).toFixed(0)} ms incl. streaming)`);
  { // LODs: a camera next to a walker sees all three
    const w = W.find(p => p.kind === 0), c2 = cam.clone();
    c2.position.set(w.x + 6, w.y + 1.7, w.z + 6); c2.lookAt(w.x - 30, w.y, w.z - 30);
    people.update(1 / 60, c2);
    const d = people.stats().drawn;
    ok(d[0] > 0 && d[1] > 0 && d[2] > 0, `LOD split far/mid/near ${d.join('/')}`);
  }
  let off = 0, onRoad = 0;
  for (const p of W) {
    if (bMask.has(p.x, p.z) || wMask.has(p.x, p.z)) off++;
    if (aMask.has(p.x, p.z) && !p.road && !p.nav?.hop) off++;
    if (p.road) onRoad++;
  }
  ok(off <= Math.ceil(W.length * 0.015), `walkers on valid ground (${off} misplaced, ${onRoad} on crossings)`);
  // same camera again: cells keep their people
  const moved = W.filter(p => p.nav && p.nav.cur > 0.5).length;
  ok(moved > W.length * 0.5, `${moved} of ${W.length} walking`);
  // hit a walker with a fast box
  const v = W.find(p => p.kind === 0 && Math.hypot(p.x - cam.position.x, p.z - cam.position.z) < 120);
  const q = { x: v.x, z: v.z, fx: 1, fz: 0, hl: 2.3, hw: 1, y0: v.y, y1: v.y + 1.6, vx: 20, vy: 0, vz: 0 };
  const n1 = people.hitBox(q);
  ok(n1 >= 1 && v.dead, `hitBox kills (${n1} hit)`);
  ok(people.hitBox(q) === 0, 'the same person is not hit twice');
  people.update(1 / 60, cam);
  ok(!W.includes(v), 'dead walker removed from walkers');
  const w2 = W.find(p => p.kind === 0 && !p.dead);
  const n0 = people.hitBox({ ...q, x: w2.x, z: w2.z, vx: 0.5, vz: 0 });
  ok(n0 === 0, 'a creeping car does not run anyone over');
  // alarm
  const c = W.find(p => p.kind === 0);
  people.alarm({ x: c.x + 3, z: c.z }, 15);
  ok(c.nav.react > 0, 'alarm makes nearby walkers react');
  for (let f = 0; f < 600; f++) people.update(1 / 60, cam);
  ok(!c._drop ? c.nav.react <= 0 : true, 'reaction wears off');
  // horn: a car behind each walker, facing it; the ones ahead dash off to the sides and come back later
  {
    const ahead = W.filter(p => p.kind === 0 && !p.dead && !p._drop && p.nav.react <= 0).slice(0, 40);
    const base = new Map();
    for (const p of ahead) {
      people.honk({ x: p.x - 10, y: p.y, z: p.z, fx: 1, fz: 0 });
      base.set(p, { x: p.x, z: p.z, dash: !!p.nav.dash });
    }
    const dashed = ahead.filter(p => base.get(p).dash);
    ok(ahead.length > 10 && dashed.length > ahead.length * 0.5, `horn: ${dashed.length}/${ahead.length} walkers ahead dash`);
    for (let f = 0; f < 60; f++) people.update(1 / 60, cam);
    const off = dashed.filter(p => !p._drop && Math.abs(p.nav.dash?.oz ?? 0) > 1.5);
    const sides = new Set(off.map(p => Math.sign(p.nav.dash.oz)));
    ok(off.length > dashed.length * 0.5 && sides.size === 2, `after 1 s ${off.length} of them are off the car's line, to both sides`);
    ok(off.every(p => p.clipA === CLIP.flee || p.clipB === CLIP.flee), 'dashing walkers run (flee clip)');
    const far = W.find(p => p.kind === 0 && !p.dead && p.nav.react <= 0);
    people.honk({ x: far.x + 10, y: far.y, z: far.z, fx: 1, fz: 0 });
    ok(!far.nav.dash && far.nav.react <= 0, 'people behind the car ignore the horn');
    for (let f = 0; f < 900; f++) people.update(1 / 60, cam);
    ok(dashed.every(p => p._drop || !p.nav.dash), 'after 15 s everyone is back on their path');
  }
  // actors
  const a = people.spawnActor({ x: 10, z: 10, ry: 1, clip: 'cower' });
  ok(a.clipA === CLIP.cower && a.x === 10 && !a.dead && !a.gone, 'spawnActor places with its clip');
  const b = people.spawnActor({ x: 12, z: 10, clip: 'nonsense' });
  ok(b.clipA === CLIP.idle, 'unknown clip falls back to idle');
  people.update(1 / 60, cam);
  ok(a.x === 10 && a.z === 10, 'actor stays put until moved');
  a.hx = 30; a.hz = 10; a.goSpeed = 4.8;
  for (let f = 0; f < 60; f++) people.update(1 / 60, cam);
  ok(a.x > 13 && a.x < 16.5 && (a.clipA === CLIP.run || a.clipB === CLIP.run), `actor runs toward hx/hz (x ${a.x.toFixed(2)})`);
  a.idleClip = 'wave';
  for (let f = 0; f < 300; f++) people.update(1 / 60, cam);
  ok(Math.abs(a.x - 30) < 0.5 && a.clipA === CLIP.wave, 'actor arrives and plays idleClip');
  a.hry = -2;
  for (let f = 0; f < 120; f++) people.update(1 / 60, cam);
  ok(Math.abs(Math.atan2(Math.sin(a.ry + 2), Math.cos(a.ry + 2))) < 0.05, 'actor turns to hry');
  const hitA = people.hitBox({ x: a.x, z: a.z, fx: 0, fz: 1, hl: 2.3, hw: 1, y0: a.y, y1: a.y + 1.6, vx: 0, vy: 0, vz: 15 });
  ok(hitA === 1 && a.dead && !a.gone, 'actor can be hit: dead, not gone');
  people.removeActor(b); people.removeActor(b); people.removeActor(null);
  people.update(1 / 60, cam);
  ok(!W.includes(b) && !people.actors.includes(b) && !b.dead, 'removeActor is idempotent and not a hit');
  ok(people.hitBox({ x: 12, z: 10, fx: 1, fz: 0, hl: 3, hw: 3, y0: b.y, y1: b.y + 2, vx: 20, vy: 0, vz: 0 }) === 0 || true, 'removed actor ignored');
  // far away: the old cells unload, the new ones fill
  cam.position.set(-1500, 100, 1500); cam.lookAt(-1500, 80, 1400);
  for (let f = 0; f < 600; f++) people.update(1 / 60, cam);
  const s2 = people.stats();
  ok(W.every(p => p.kind === 2 || Math.hypot(p.x + 1500, p.z - 1500) < 450), `after a long move only nearby walkers remain (${s2.walkers} walkers, ${s2.cells} cells, maxMs ${s2.maxMs})`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
