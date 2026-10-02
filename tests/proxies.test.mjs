// Headless checks for the far stand-ins of the hand-built buildings (src/world/cherkasy/proxies.js): node tests/proxies.test.mjs
// A site gets a box per footprint of its place at the model's height and wall colour; nothing is built at 'high'; past
// `near` the site hides and its cell's merged box shows, close by the site draws itself again (with hysteresis), a
// neighbour in the same cell then shows its own box; a KEEP landmark, a site with no place and an OSM ring the site does
// not replace are left alone.
import * as THREE from 'three';
import { createSiteProxies } from '../src/world/cherkasy/proxies.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

const parent = new THREE.Group();
const block = (name, x, z, h, color) => {
  const g = new THREE.Group(); g.name = name;
  const m = new THREE.Mesh(new THREE.BoxGeometry(20, h, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.position.set(x, h / 2, z); g.add(m);
  // a 30 m crane mast on the roof: a few vertices only, so it must not lift the box
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.4, 30, 0.4), m.material); mast.position.set(x + 5, h + 15, z + 5); g.add(mast);
  parent.add(g); return g;
};
const sq = (x, z, r = 10) => [x - r, z - r, x + r, z - r, x + r, z + r, x - r, z + r];
const a = block('blocka', 0, 0, 30, '#d9c9a0'), b = block('blockb', 60, 0, 15, '#404448');
const tower = block('landmark-tower', 0, 120, 60, '#ffffff'), lone = block('nolist', 200, 200, 20, '#ffffff');
const places = [
  { id: 'a', kind: 'improved', rings: [sq(0, 0)], ringIds: [null] },
  { id: 'b', kind: 'improved', rings: [sq(60, 0), sq(60, 40)], ringIds: [101, 102] }, // 102 is an OSM building the site keeps
  { id: 't', kind: 'sight', rings: [sq(0, 120)], ringIds: [null] },
];
const mat = new THREE.MeshBasicMaterial();
const P = createSiteProxies({ parent, roots: [a, b, tower, lone], places, map: { buildings: [{ id: 101, p: sq(60, 0), k: 'apt', lv: 5 }] },
  skip: new Set([101]), heightAt: () => 0, facadeMat: mat, detailMat: mat });

P.set(Infinity);
ok(P.stats().sites === 0 && P.stats().meshes === 0, "'high' builds nothing");
P.set(45);
P.flush();
const st = P.stats();
ok(st.sites === 2 && st.boxes === 2, `two sites, one box each (sites ${st.sites}, boxes ${st.boxes})`);
ok(P.names().join() === 'blocka,blockb', 'the landmark and the site without a place are left alone');
const proxyMeshes = parent.children.filter((o) => o.name.startsWith('proxy-'));
const own = proxyMeshes.filter((o) => o.name.startsWith('proxy-blocka')), cell = proxyMeshes.filter((o) => o.name.startsWith('proxy-cell'));
ok(own.length >= 1 && cell.length >= 1, 'per-site and per-cell meshes');
own[0].geometry.computeBoundingBox();
const top = own[0].geometry.boundingBox.max.y;
ok(top > 27 && top < 33, `box height from the model, not the crane (${top.toFixed(1)} m)`);
const tint = own[0].geometry.attributes.ftint;
ok(tint && tint.getX(0) > tint.getZ(0), 'box tinted with the warm wall colour');

const far = new THREE.Vector3(30, 50, 600), nearA = new THREE.Vector3(0, 2, 25);
P.update(far);
ok(!a.visible && !b.visible, 'far: the sites hide');
ok(cell.every((m) => m.visible) && own.every((m) => !m.visible), 'far: the merged cell box shows');
ok(tower.visible && lone.visible, 'far: the left-alone roots stay');
P.update(nearA);
const ownB = proxyMeshes.filter((o) => o.name.startsWith('proxy-blockb'));
ok(a.visible && cell.every((m) => !m.visible), 'near: the site draws itself, the cell box goes');
ok(!b.visible && ownB.every((m) => m.visible), 'near: the neighbour in the cell shows its own box');
P.update(new THREE.Vector3(0, 2, 58)); // 48 m from a's box: past near (45) but inside x 1.15, a stays real
ok(a.visible, 'hysteresis keeps a site real just past near');
P.update(new THREE.Vector3(0, 2, 70));
ok(!a.visible, 'well past near it swaps back');
P.set(Infinity); P.update(far);
ok(a.visible && b.visible && proxyMeshes.every((m) => !m.visible), "back to 'high': everything real");

console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
