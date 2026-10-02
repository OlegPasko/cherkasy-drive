// Headless checks for what the graphics levels change in the world: trees.setDetail (world/trees.js) and the sites'
// draw-distance cull (world/farcull.js). Run: node tests/detail.test.mjs
import * as THREE from 'three';
import { buildTrees } from '../src/world/trees.js';
import { createFarCull } from '../src/world/farcull.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// ---- trees: shorter bands draw less, the defaults come back exactly, the trunks never change
{
  const spots = [];
  for (let i = 0; i < 1400; i++) spots.push({ x: 5 + i, z: (i % 7) - 3, y: 0, kind: ['street', 'park', 'elm', 'small', 'conifer'][i % 5], sc: 1 });
  const t = buildTrees({ scene: new THREE.Group(), spots, maxScale: 3 });
  const at = new THREE.Vector3(0, 1.7, 0), solids = () => { let n = 0; t.addSolids(() => n++); return n; };
  t.update(1 / 60, at); const a = t.stats(), n0 = solids();
  t.setDetail({ nearOut: [40, 50], midOut: [150, 175], farOut: [900, 1050], shadow: 60 }); t.update(1 / 60, at); const b = t.stats();
  ok(b.near < a.near && b.mid < a.mid && b.far < a.far && b.casters < a.casters,
    `low bands draw less: near ${a.near}->${b.near} mid ${a.mid}->${b.mid} far ${a.far}->${b.far} casters ${a.casters}->${b.casters}`);
  ok(t.detail.farOut[1] === 1050 && t.detail.shadow === 60, 'detail reads the live bands');
  t.setDetail(); t.update(1 / 60, at); const c = t.stats();
  ok(c.near === a.near && c.mid === a.mid && c.far === a.far && c.casters === a.casters, 'setDetail() restores the default picture');
  ok(t.detail.nearOut.join() === '70,85' && t.detail.farOut.join() === '1350,1500', 'default bands back');
  ok(solids() === n0 && t.items.length === 1400, 'trunks / items unchanged');
}

// ---- farcull: small far meshes leave layer 0, big ones stay, far ones stop casting, 'high' gives everything back
{
  const root = new THREE.Group(), box = new THREE.BoxGeometry(2, 2, 2), big = new THREE.BoxGeometry(80, 80, 80), mat = new THREE.MeshBasicMaterial();
  const near = new THREE.Mesh(box, mat), far = new THREE.Mesh(box, mat), huge = new THREE.Mesh(big, mat), always = new THREE.Mesh(box, mat), quiet = new THREE.Mesh(box, mat);
  near.position.set(30, 0, 0); far.position.set(600, 0, 0); huge.position.set(2000, 0, 0); always.position.set(900, 0, 0); quiet.position.set(400, 0, 0);
  always.frustumCulled = false;
  for (const m of [near, far, huge, always, quiet]) { m.castShadow = m !== quiet; root.add(m); }
  root.updateMatrixWorld(true);
  const fc = createFarCull([root]), cam = new THREE.Vector3(0, 2, 0), on = (m) => m.layers.test(new THREE.Layers());
  fc.update(cam);
  ok([near, far, huge, always].every(on) && fc.stats().hidden === 0, 'default: everything drawn');
  fc.set({ ratio: 1 / 60, shadow: 200 }); fc.update(cam);
  ok(on(near) && !on(far) && on(huge) && on(always), 'ratio 1/60: the 1.7 m box at 600 m hidden, the 40 m one at 2 km and frustumCulled-off kept');
  ok(near.castShadow && !far.castShadow && !huge.castShadow && !quiet.castShadow, 'no shadows beyond 200 m');
  quiet.castShadow = false;
  fc.set(); fc.update(cam);
  ok([near, far, huge].every(on) && far.castShadow && huge.castShadow && !quiet.castShadow, 'set() gives back layers and the sites\' own castShadow');
  ok(fc.stats().meshes === 4, 'frustumCulled-off meshes are not managed');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
