// Headless checks for the photo mode (src/ui/photomode.js): node tests/photomode.test.mjs
// The file name format, the watermark's scale, and the state machine without a DOM: P opens it only when allowed and
// sets ctx.frozen, the free camera starts at the car camera's pose and moves on W, stays inside the map region and
// above the ground / the river and out of a solid, T jumps the time at once, P / Esc close it (ctx.frozen off, the
// field of view back), and a capture without a renderer is a no-op.
import * as THREE from 'three';
import { createInput } from '../src/core/input.js';
import { createCollisionWorld } from '../src/world/collision.js';
import { createPhotoMode, photoName, watermarkBox } from '../src/ui/photomode.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

// ---- the file name: local time, zero padded
ok(photoName(new Date(2026, 9, 22, 9, 5, 7)) === 'cherkasy-drive-20261022-090507.png', `photoName -> ${photoName(new Date(2026, 9, 22, 9, 5, 7))}`);
ok(/^cherkasy-drive-\d{8}-\d{6}\.png$/.test(photoName()), 'photoName() now matches the pattern');

// ---- the watermark scales with the shot and stays small
const b1 = watermarkBox(1920, 1080), b4 = watermarkBox(3840, 2160), bs = watermarkBox(640, 360), bt = watermarkBox(1080, 1920);
ok(Math.abs(b1.s - 1) < 1e-9 && Math.abs(b4.s - 2) < 1e-9, `scale 1 at 1080p, 2 at 4K (${b1.s}, ${b4.s})`);
ok(bs.s >= 0.45 && bs.big >= 13, `a small shot keeps a readable mark (s ${bs.s}, ${bs.big} px)`);
ok(bt.s < 0.6, `a portrait shot scales by its width (s ${bt.s.toFixed(2)})`);
ok(b1.icon + b1.pad < 1080 * 0.12, 'the mark takes under 12 % of the height');

// ---- the state machine (no document: no UI, no capture)
const col = createCollisionWorld({ terrain: () => 10 });
col.box(40, 0, -10, 60, 30, 10, 'building');
col.box(-80, 0, -60.1, -20, 20, -59.9, 'fence');
const world = {
  collision: col, groundHeight: (x, z) => col.groundHeight(x, z), water: { y: -1 },
  cherkasy: { map: { region: { x0: -100, x1: 100, z0: -100, z1: 100 } } },
  views: 0, view() { this.views++; },
};
const input = createInput({ target: null });
input.bind('timeOfDay', ['KeyT']); // createCore's binding
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 5000);
camera.position.set(0, 14, 50); camera.lookAt(0, 12, 0); camera.updateMatrixWorld();
let presets = 0, allowed = false;
const ctx = { frozen: false, cycleTime(sec) { presets++; this.lastBlend = sec; } };
const photo = createPhotoMode({ ctx, world, camera, input, container: null, canOpen: () => allowed });
const frame = (keys = [], n = 1) => {
  for (const k of keys) input.inject.down(k);
  for (let i = 0; i < n; i++) { input.update(1 / 60); photo.update(1 / 60); if (i === 0) for (const k of keys) input.inject.up(k); }
};
const holdW = (sec) => { input.inject.down('KeyW'); for (let t = 0; t < sec; t += 1 / 60) { input.update(1 / 60); photo.update(1 / 60); } input.inject.up('KeyW'); input.update(1 / 60); };

frame(['KeyP']);
ok(!photo.isOpen && !ctx.frozen, 'P does nothing while canOpen() is false (the map / the book is open)');
allowed = true;
const start = camera.position.clone(), dir0 = camera.getWorldDirection(new THREE.Vector3());
frame(['KeyP']);
ok(photo.isOpen && photo.state === 'fly' && ctx.frozen, 'P opens it and freezes the world');
ok(input.dragLook, 'the mouse looks by dragging while it is open');
ok(camera.position.distanceTo(start) < 1e-6 && camera.getWorldDirection(new THREE.Vector3()).angleTo(dir0) < 1e-3, 'the free camera starts at the car camera pose');
holdW(1);
ok(camera.position.z < start.z - 5 && world.views > 30, `W flies forward (z ${start.z} -> ${camera.position.z.toFixed(1)}), the world draws for the camera (${world.views} views)`);
frame(['KeyT']);
ok(presets === 1 && ctx.lastBlend === 0, 'T jumps the time of day at once');

// the bounds: the map region, the ground (+ clearance), a solid
photo.fly.setPose(new THREE.Vector3(95, 20, 0), -Math.PI / 2, 0); // looking +x, toward the region's edge
holdW(3);
ok(camera.position.x <= 100 + 1e-6, `held inside the map region (x ${camera.position.x.toFixed(1)})`);
photo.fly.setPose(new THREE.Vector3(0, 12, 0), 0, -1.4); // nose down into the ground
holdW(2);
ok(camera.position.y >= 10.5 - 1e-6, `held over the ground (y ${camera.position.y.toFixed(2)})`);
photo.fly.setPose(new THREE.Vector3(30, 15, 0), -Math.PI / 2, 0); // at the wall of the box at x = 40
holdW(3);
ok(camera.position.x < 40, `kept out of the building (x ${camera.position.x.toFixed(2)})`);

// a fast frame across a thin wall (0.2 m at z = -60) is swept, not skipped
photo.fly.setPose(new THREE.Vector3(-50, 13, -55), 0, 0); // looking -z, toward the wall
photo.fly.speed = 480; frame(['KeyW']); photo.fly.speed = 12;
ok(camera.position.z > -60, `an 8 m step does not cross a 0.2 m wall (z ${camera.position.z.toFixed(2)})`);

camera.fov = 35; camera.updateProjectionMatrix();
const shot = await photo.capture();
ok(shot === null && photo.state === 'fly', 'capture without a renderer / UI is a no-op');
frame(['Escape']);
ok(!photo.isOpen && !ctx.frozen && !input.dragLook, 'Esc closes it: the world runs again, the pointer captures again');
ok(camera.fov === 62, `the field of view is back (${camera.fov})`);
frame(['KeyP']); frame(['KeyP']);
ok(!photo.isOpen && !ctx.frozen, 'P opens and P closes again');

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
