// Headless run of the nature demo's riverbank loader + a full tree / water build on it: node tests/nature.demo.test.mjs
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadRiverbank } from '../demos/nature.world.js';
import { buildTrees } from '../src/world/trees.js';
import { buildWetBands } from '../src/world/water.js';

globalThis.fetch = async (u) => { const b = readFileSync(new URL('../public' + u, import.meta.url)); return { json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; };
let t0 = performance.now();
const W = await loadRiverbank({ x0: -300, x1: 2400, z0: -1100, z1: 1900 });
const tLoad = performance.now() - t0;
const kinds = {}; for (const s of W.spots) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
t0 = performance.now();
const trees = buildTrees({ scene: new THREE.Group(), spots: W.spots, maxScale: 3 });
const tTrees = performance.now() - t0;
const bands = buildWetBands({ scene: new THREE.Group(), segs: W.wetSegs, isWater: W.isWater });
trees.update(0.016, new THREE.Vector3(930, 6, 420));
const st = trees.stats();
console.log(`riverbank: load ${tLoad.toFixed(0)} ms, ${W.spots.length} spots ${JSON.stringify(kinds)}, trees ${tTrees.toFixed(0)} ms`);
console.log(`at the embankment: near ${st.near} mid ${st.mid} far ${st.far}, ${st.drawCalls} tree draw calls; wet segs ${W.wetSegs.length} -> ${bands.segments} used`);
const vc = {}; for (const it of trees.items) vc[it.variant] = (vc[it.variant] || 0) + 1; console.log('variants', JSON.stringify(vc));
const ok = W.spots.length > 1000 && st.near > 0 && st.far > 0 && bands.segments > 50;
console.log(ok ? 'ok' : 'FAIL'); process.exit(ok ? 0 : 1);
