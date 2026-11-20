// The city's fences, walls, hedges and gates: the private sector's street fronts (profiled sheet between brick or
// steel posts, old plank, picket and slate, concrete panels, forged bars; a gate and a wicket per lot), the fences
// between lots, and the concrete, steel-bar and mesh fences of plants, schools and pitches. The lines come from
// public/assets/cherkasy/map_fences.json (tools/cherkasy/build_fences.mjs: OSM barriers plus generated street fronts
// where OSM has none); a worker (fencework.js) fetches them and builds the geometry while the city loads, so the
// start does not wait for it.
//
//   startFences({ url, root, params? }) -> job | null      call once `root` exists and before the sites build
//     (its group must be among root's children by then, so it is not taken for a hand-built site); ?nofences -> null
//   job.lines: Promise<F | null>   the pieces' lines (fencework.js parseFences: n, kinds, kind, start, count, pts) as
//     soon as the file is read, for the shrub layout (shrubbery.js obstacleSteps); null if it failed
//   job.place({ hf, collision, sites, skip, map }) -> fences      once the sites are built: fences on a hand-built
//     site's lot are dropped (a site's clear(x, z), its footprints, the OSM buildings it replaces + 4 m, the railway
//     cutting's overlay), the rest is built and lands when the worker answers – normally still during the load
//   fences = { root, ready: Promise, update(camPos), setQuality('low' | 'medium' | 'high'), stats() }
// One mesh per 512 m chunk, one material (the atlas of fencework.js, alpha-tested, double-sided, tinted by vertex
// colour). A chunk beyond `far` is not drawn, beyond `near` it draws only its panels (the first `lite` indices: 2
// triangles a run), and only within `shadow` it casts, its panels alone (QUALITY below); re-checked after the camera moved 8 m. The
// river mirror leaves the fences out (city.js: water.reflectSkip).
// Collision: every fence is a 'wall' solid, 0.18 m thick, one per straight run (about 43 k in all), added in one go.
import * as THREE from 'three';
import { ringPts, bboxOf, inPoly } from './geo.js';
import { parseFences, samplePoints, buildFenceChunks, makeFenceAtlas, gridHeight } from './fencework.js';

// draw distances per graphics level (m, camera to the chunk's box): far = drawn at all, near = with posts, plinths and
// open gates, shadow = casts
const QUALITY = { high: { far: 700, near: 130, shadow: 60 }, medium: { far: 450, near: 100, shadow: 35 }, low: { far: 260, near: 70, shadow: 0 } };
const THICK = 0.09, STEP = 8;

export function startFences({ url, root, params = new URLSearchParams(globalThis.location?.search ?? '') }) {
  if (params.has('nofences')) return null;
  const t0 = performance.now();
  const group = Object.assign(new THREE.Group(), { name: 'fences' });
  root.add(group);
  // the material exists from the start (with a 1 px map), so the shader warm-up before the first frame compiles it
  const tex = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
  Object.assign(tex, { colorSpace: THREE.SRGBColorSpace, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, anisotropy: 4, needsUpdate: true });
  const material = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
  let warm = null;
  { // (a point-sized triangle under the map keeps the material in the scene until the chunks arrive)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -500, 0, 0.01, -500, 0, 0, -500, 0.01]), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array([0, 127, 0, 0, 127, 0, 0, 127, 0]), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(9).fill(255), 3, true));
    group.add(warm = Object.assign(new THREE.Mesh(g, material), { name: 'fences-warmup', frustumCulled: false, castShadow: true, receiveShadow: true }));
  }
  const stats = { state: 'loading', pieces: 0, dead: 0, chunks: 0, verts: 0, tris: 0, liteTris: 0, solids: 0, km: 0, ms: {} };
  const chunks = [];
  let D = QUALITY.high, dirty = true;
  const last = new THREE.Vector3(Infinity, 0, 0);

  // ---- the worker (or, without workers, the same steps here)
  const useWorker = typeof Worker !== 'undefined' && !params.has('noworkers');
  let worker = null, F = null;
  const loaded = new Promise((res, rej) => {
    if (useWorker) {
      worker = new Worker(new URL('./fencework.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => (e.data.error ? rej(new Error(e.data.error)) : res(e.data));
      worker.onerror = (e) => rej(e.error || new Error(e.message || 'fence worker failed'));
      worker.postMessage({ url: new URL(url, globalThis.location?.href).href });
    } else {
      fetch(url).then((r) => r.json()).then((json) => { F = parseFences(json); res({ samples: samplePoints(F), n: F.n, atlas: makeFenceAtlas(), lines: F }); }).catch(rej);
    }
  });
  loaded.catch(() => {}); // reported in place()

  function setAtlas(a) {
    const top = { data: a.data, width: a.width, height: a.height };
    tex.dispose(); // the 1 px stand-in's storage
    // the atlas brings its own mips: they keep bars and mesh over the alpha test far away (fencework.js atlasMips)
    tex.image = top; tex.mipmaps = a.mips?.length ? [top, ...a.mips] : []; tex.generateMipmaps = !a.mips?.length;
    tex.needsUpdate = true;
  }
  function absorb(res, collision) {
    const t = performance.now();
    for (const c of res.chunks) {
      const g = new THREE.BufferGeometry(), b = c.box;
      const attr = (name, array, size, norm) => { const a = new THREE.BufferAttribute(array, size, norm); a.onUpload(function () { this.array = null; }); g.setAttribute(name, a); }; // the copy on the CPU goes once the GPU has it
      attr('position', c.position, 3, false); attr('normal', c.normal, 3, true); attr('uv', c.uv, 2, false); attr('color', c.color, 3, true);
      g.setIndex(new THREE.BufferAttribute(c.index, 1));
      g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh = Object.assign(new THREE.Mesh(g, material), { name: 'fence-chunk', receiveShadow: true, castShadow: false, matrixAutoUpdate: false, visible: false });
      group.add(mesh);
      const ch = { mesh, g, b, lite: c.lite, full: c.index.length, mode: -1 };
      // the shadow passes draw the panels only: a casting chunk goes into both cascades whole, and a post or a plinth
      // adds nothing to a panel's shadow
      mesh.onBeforeShadow = () => { if (ch.mode === 2) g.setDrawRange(0, ch.lite); };
      mesh.onAfterShadow = () => { if (ch.mode === 2) g.setDrawRange(0, ch.full); };
      chunks.push(ch);
    }
    group.remove(warm);
    const S = res.solids;
    for (let i = 0; i < S.length; i += 6) {
      const x0 = S[i], z0 = S[i + 1], x1 = S[i + 2], z1 = S[i + 3], y0 = S[i + 4], y1 = S[i + 5];
      if (Math.abs(x1 - x0) < 0.03) collision.box(x0 - THICK, y0, Math.min(z0, z1), x0 + THICK, y1, Math.max(z0, z1), 'wall');
      else if (Math.abs(z1 - z0) < 0.03) collision.box(Math.min(x0, x1), y0, z0 - THICK, Math.max(x0, x1), y1, z0 + THICK, 'wall');
      else collision.obox((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2, THICK, Math.atan2(z1 - z0, x1 - x0), y0, y1, 'wall');
    }
    Object.assign(stats, { state: 'ready', pieces: res.stats.pieces, dead: res.stats.dead, chunks: chunks.length, verts: res.stats.verts, tris: res.stats.tris, liteTris: res.stats.liteTris, solids: res.stats.solids, km: res.stats.km });
    stats.ms.build = res.stats.ms; stats.ms.absorb = Math.round(performance.now() - t); stats.ms.total = Math.round(performance.now() - t0);
    dirty = true;
    console.log(`[cherkasy] fences: ${stats.km} km in ${stats.pieces} pieces (${stats.dead} on site lots left out), ${chunks.length} chunks, ${(stats.verts / 1e3).toFixed(0)}k verts, ${(stats.liteTris / 1e3).toFixed(0)}k / ${(stats.tris / 1e3).toFixed(0)}k tris (far / near), ${stats.solids} solids; worker ${stats.ms.load ?? 0} + ${stats.ms.build} ms, here ${stats.ms.sites ?? 0} + ${stats.ms.absorb} ms, ready ${stats.ms.total} ms after the start`);
  }

  // which pieces stand on a hand-built site's lot: S = [x, z] x 3 per piece
  function deadPieces(S, n, { hf, sites, skip, map }) {
    const dead = new Uint8Array(n);
    // rings a fence keeps 4 m away from: the OSM buildings the sites replace, the sites' own footprints and lots
    const rings = [];
    for (const b of map.buildings ?? []) if (skip?.has(b.id)) rings.push(ringPts(b.p));
    const list = (v) => (Array.isArray(v) ? v : []); // (a site's fields are its own business: anything not a list is skipped)
    for (const s of sites) { for (const f of list(s?.footprints)) if (f.poly?.length >= 3) rings.push(f.poly); if (s?.lot?.ring?.length >= 3) rings.push(s.lot.ring); }
    const G = 32, M = 4, cells = new Map(), key = (i, j) => i * 65536 + j;
    for (const P of rings) {
      const bb = bboxOf(P), e = { P, x0: bb.x0 - M, z0: bb.z0 - M, x1: bb.x1 + M, z1: bb.z1 + M };
      for (let i = Math.floor(e.x0 / G); i <= Math.floor(e.x1 / G); i++) for (let j = Math.floor(e.z0 / G); j <= Math.floor(e.z1 / G); j++) (cells.get(key(i, j)) ?? cells.set(key(i, j), []).get(key(i, j))).push(e);
    }
    const nearRing = (x, z) => {
      const l = cells.get(key(Math.floor(x / G), Math.floor(z / G))); if (!l) return false;
      for (const e of l) {
        if (x < e.x0 || x > e.x1 || z < e.z0 || z > e.z1) continue;
        if (inPoly(e.P, x, z)) return true;
        for (let a = e.P.length - 1, b = 0; b < e.P.length; a = b++) { // within M of an edge
          const ax = e.P[a][0], az = e.P[a][1], dx = e.P[b][0] - ax, dz = e.P[b][1] - az, L2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
          if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 < M * M) return true;
        }
      }
      return false;
    };
    // a site's clear(x, z) is asked only around the site: within 80 m of what it returned (footprints, lot, its own
    // trees and parked cars). A site that returned none of those (a park, a beach, a bridge: some cost 0.5 us a call)
    // is first asked at every fourth piece, then around the pieces it cleared (+ 200 m): a lot crossed by a few
    // fences is found, and a quarter of a million points are not asked seventeen times each
    const local = new Map(), everywhere = [];
    const ask = (f, x, z) => { try { return !!f(x, z); } catch { return false; } }; // a site's test must not stop the fences
    const around = (f, bb, m) => {
      const e = { f, x0: bb.x0 - m, z0: bb.z0 - m, x1: bb.x1 + m, z1: bb.z1 + m };
      for (let i = Math.floor(e.x0 / 64); i <= Math.floor(e.x1 / 64); i++) for (let j = Math.floor(e.z0 / 64); j <= Math.floor(e.z1 / 64); j++) (local.get(key(i, j)) ?? local.set(key(i, j), []).get(key(i, j))).push(e);
    };
    for (const s of sites) {
      if (!s?.clear) continue;
      const bb = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
      const add = (x, z) => { if (Number.isFinite(x + z)) { bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); } };
      for (const f of list(s.footprints)) for (const p of list(f.poly)) add(p[0], p[1]);
      for (const p of list(s.lot?.ring)) add(p[0], p[1]);
      for (const p of list(s.spots)) add(p.x, p.z);
      for (const p of list(s.parked)) add(p.x, p.z);
      if (bb.x0 > bb.x1) everywhere.push(s.clear); else around(s.clear, bb, 80);
    }
    for (const f of everywhere) {
      const bb = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
      for (let p = 0; p < n; p += 4) {
        const x = S[6 * p + 2], z = S[6 * p + 3];
        if (ask(f, x, z)) { bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); }
      }
      if (bb.x0 <= bb.x1) around(f, bb, 200);
    }
    const cleared = (x, z) => {
      const l = local.get(key(Math.floor(x / 64), Math.floor(z / 64)));
      if (l) for (const e of l) if (x > e.x0 && x < e.x1 && z > e.z0 && z < e.z1 && ask(e.f, x, z)) return true;
      return false;
    };
    stats.clears = [new Set([...local.values()].flat()).size, everywhere.length];
    const lattice = hf.latticeAt, over = hf.overlays; // the railway cutting leaves the lattice the worker builds on
    for (let p = 0; p < n; p++) {
      for (let q = 0; q < 3 && !dead[p]; q++) {
        const x = S[6 * p + 2 * q], z = S[6 * p + 2 * q + 1];
        if (nearRing(x, z) || cleared(x, z)) dead[p] = 1;
        else if (lattice && over?.some((b) => x > b[0] && x < b[2] && z > b[1] && z < b[3]) && Math.abs(hf.heightAt(x, z) - lattice(x, z)) > 0.25) dead[p] = 1;
      }
    }
    return dead;
  }

  const api = {
    root: group, ready: null,
    update(cam) {
      if (!chunks.length || !cam || (!dirty && cam.distanceToSquared(last) < STEP * STEP)) return;
      dirty = false; last.copy(cam);
      for (const c of chunks) {
        const b = c.b, dx = Math.max(b[0] - cam.x, 0, cam.x - b[3]), dy = Math.max(b[1] - cam.y, 0, cam.y - b[4]), dz = Math.max(b[2] - cam.z, 0, cam.z - b[5]);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // 0 hidden, 1 panels only, 2 everything; a chunk on the line keeps its state (no flicker)
        const mode = d > D.far * (c.mode > 0 ? 1.05 : 1) ? 0 : d > D.near * (c.mode === 2 ? 1.1 : 1) ? 1 : 2;
        if (mode !== c.mode) { c.mode = mode; c.mesh.visible = mode > 0; if (mode) c.g.setDrawRange(0, mode === 2 ? c.full : c.lite); }
        c.mesh.castShadow = mode > 0 && d < D.shadow;
      }
    },
    setQuality(q) { D = QUALITY[q] || QUALITY.high; dirty = true; },
    stats: () => ({ ...stats, drawn: chunks.filter((c) => c.mode > 0).length, near: chunks.filter((c) => c.mode === 2).length, casting: chunks.filter((c) => c.mesh.castShadow).length }),
  };

  function place({ hf, collision, sites = [], skip = null, map }) {
    api.ready = loaded.then((first) => {
      setAtlas(first.atlas);
      stats.ms.load = first.loadMs ?? 0;
      const t = performance.now();
      const dead = deadPieces(first.samples, first.n, { hf, sites, skip, map });
      stats.ms.sites = Math.round(performance.now() - t);
      if (!worker) return buildFenceChunks(F, gridHeight(hf.data), dead);
      return new Promise((res, rej) => {
        worker.onmessage = (e) => (e.data.error ? rej(new Error(e.data.error)) : res(e.data));
        worker.onerror = (e) => rej(e.error || new Error(e.message || 'fence worker failed'));
        worker.postMessage({ hf: hf.data, dead });
      });
    }).then((res) => { absorb(res, collision); return api; }).catch((e) => { stats.state = 'failed'; console.error('[cherkasy] fences failed', e); worker?.terminate(); group.remove(warm); return api; });
    return api;
  }
  return { place, lines: loaded.then((first) => first.lines ?? null, () => null) };
}
