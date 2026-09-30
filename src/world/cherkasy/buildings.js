// The Cherkasy building pass: every OSM footprint of map.buildings through the city generator (src/world/buildings.js:
// the Cherkasy typology, facades, pitched roofs, machine rooms, domes, exact collision prisms and roof-edge anchors),
// dressed by the facade kit (balconies, entrances, shop signs – facadekit.js dressBuilding, when present), then
// batched per 256 m tile (2 x 2 tiles per mesh) into facade + detail meshes with distance LOD for shadows and roofs.
//
//   buildBuildings({ map, solids, zips, heightAt, skip, dress? }) -> { tiles, footprints, boxes: [{ min: [x,y,z], max, id }], landmarks, stats }
//     the legacy call shape (sync); solids: collision world (box / prism / cyl), zips: anchor store (edge / add)
//   buildCityBuildings({ root, map, hf, solids, zips, skip, facadeMat, detailMat, useWorkers?, workers?, onProgress?(f) })
//     -> Promise<{ B: { footprints, boxes, landmarks, stats }, facade, detail (kit/batch.js batches), meshes, update(camPos), stats() }>
//     With useWorkers and Worker support the footprints are split into 256 m stripes over `workers` module workers
//     (each is posted only its share of the already parsed map.buildings – one JSON parse in all, no worker holds the
//     whole list –, builds it with the facade kit, and sends back packed tile geometry plus
//     recorded solids / anchors, replayed here into `solids` / `zips` in share order as the replies come in; a failed
//     worker's share is built here instead); without workers one time-sliced pass on this thread.
//     hf: ground.js height field (hf.heightAt, hf.data for the workers).
//   Distances: roof detail drawn to 2.6 km and casts within 350 m; facades cast shadows within 900 m.
import { buildBuildings as generate, buildBuildingsAsync } from '../buildings.js';
import { batchTiles, mergeGeometries } from '../../kit/batch.js';
import { heightFieldFrom } from './ground.js';
import { packGeometry, unpackGeometry, inWorker } from './geo.js';

const DETAIL_FAR = 2600, DETAIL_SHADOW = 350, FACADE_SHADOW = 900, HALF = 256;
// the facade kit is optional: resolved by Vite at build time; plain node (tests) falls back to a runtime import
const KIT = (() => {
  try { return import.meta.glob('./facadekit.js'); } catch { const p = './facadekit.js'; return { [p]: () => import(/* @vite-ignore */ p) }; }
})();
const loadDress = async () => { const f = KIT['./facadekit.js']; if (!f) return null; try { return (await f()).dressBuilding ?? null; } catch (e) { console.error('[buildings] facadekit failed to load', e); return null; } };

const plainBoxes = (list) => list.map((b) => ({ min: b.min.toArray(), max: b.max.toArray(), id: b.id }));
export function buildBuildings({ map, solids, zips, heightAt, skip = null, dress = null }) {
  const res = generate({ map, solids, zips, heightAt, skip, dress });
  return { ...res, boxes: plainBoxes(res.boxes) };
}

// ------------------------------------------------------------------------------------------------ recording sinks
// solids / anchors as flat numbers so a worker can hand them over; replay() feeds a real collision world / zip store
function recorder() {
  const num = [], kinds = [], kix = new Map();
  const k = (kind) => { const s = kind == null ? 'wall' : String(kind); let i = kix.get(s); if (i === undefined) { i = kinds.length; kinds.push(s); kix.set(s, i); } return i; };
  const flat = (P) => (Array.isArray(P[0]) ? P.flat() : Array.from(P));
  let count = 0;
  const S = {
    get count() { return count; },
    box(x0, y0, z0, x1, y1, z1, kind, flags = 0) { count++; num.push(0, k(kind), flags, x0, y0, z0, x1, y1, z1); return count - 1; },
    cyl(x, z, y0, y1, r0, r1 = r0, kind, flags = 0) { count++; num.push(1, k(kind), flags, x, z, y0, y1, r0, r1); return count - 1; },
    prism(pts, y0, a, bx = 0, bz = 0, kind, flags = 0) { count++; const P = flat(pts); num.push(2, k(kind), flags, y0, a, bx || 0, bz || 0, P.length, ...P); return count - 1; },
    obox(cx, cz, hx, hz, ang, y0, y1, kind, flags = 0) {
      const c = Math.cos(ang), s = Math.sin(ang), P = [];
      for (const [u, v] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]]) P.push(cx + u * c - v * s, cz + u * s + v * c);
      return S.prism(P, y0, y1, 0, 0, kind, flags);
    },
  };
  const Z = {
    edge(ax, az, bx, bz, y, nx, nz, kind = 'roofEdge', step = 4) { num.push(3, k(kind), 0, ax, az, bx, bz, y, nx, nz, step); },
    add(x, y, z, nx = 0, ny = 1, nz = 0, kind = 'point') { num.push(4, k(kind), 0, x, y, z, nx, ny, nz); },
  };
  return { S, Z, take: () => ({ num: Float64Array.from(num), kinds }) };
}
function replay({ num, kinds }, solids, zips) {
  for (let i = 0; i < num.length;) {
    const op = num[i], kind = kinds[num[i + 1]], fl = num[i + 2], a = i + 3;
    if (op === 0) { solids.box(num[a], num[a + 1], num[a + 2], num[a + 3], num[a + 4], num[a + 5], kind, fl); i = a + 6; }
    else if (op === 1) { solids.cyl(num[a], num[a + 1], num[a + 2], num[a + 3], num[a + 4], num[a + 5], kind, fl); i = a + 6; }
    else if (op === 2) { const n = num[a + 4]; solids.prism(num.subarray(a + 5, a + 5 + n), num[a], num[a + 1], num[a + 2], num[a + 3], kind, fl); i = a + 5 + n; }
    else if (op === 3) { zips?.edge(num[a], num[a + 1], num[a + 2], num[a + 3], num[a + 4], num[a + 5], num[a + 6], kind, num[a + 7]); i = a + 8; }
    else { zips?.add(num[a], num[a + 1], num[a + 2], num[a + 3], num[a + 4], num[a + 5], kind); i = a + 6; }
  }
}

// one worker's share: buildings whose first vertex falls in stripes part, part + parts, ... (256 m wide)
const shareOf = (b, parts) => (((Math.floor((b.p?.[0] ?? 0) / 256) % parts) + parts) % parts);
const inShare = (b, part, parts) => shareOf(b, parts) === part;

if (inWorker()) {
  self.onmessage = async (e) => {
    try {
      const { buildings, hf, skip } = e.data;
      const tf = performance.now();
      const dress = await loadDress(); // fetchMs is now just this import: the share arrives with the message
      const R = recorder(), H = heightFieldFrom(hf), tb = performance.now();
      const res = generate({ map: { buildings }, solids: R.S, zips: R.Z, heightAt: H.heightAt, skip: new Set(skip), dress });
      const transfer = [], tiles = [];
      for (const t of res.tiles.values()) tiles.push({ key: t.key, cx: t.cx, cz: t.cz, fac: packGeometry(t.fac.build(), transfer), det: t.det.v ? packGeometry(t.det.build({ part: true }), transfer) : null });
      const rec = R.take();
      res.stats.fetchMs = Math.round(tb - tf); res.stats.buildMs = Math.round(performance.now() - tb); res.stats.startMs = Math.round(tf);
      transfer.push(rec.num.buffer);
      const boxes = plainBoxes(res.boxes);
      self.postMessage({ tiles, rec, footprints: res.footprints, boxes, landmarks: res.landmarks, stats: res.stats }, [...new Set(transfer)]);
    } catch (err) { self.postMessage({ error: String(err?.stack || err) }); }
  };
}

// one module worker per share; take(part, reply) runs as each reply arrives. Resolves to the parts that failed (their
// buildings are then built here), so a lost worker never drops a share and never doubles one. Each worker is posted its
// share (structured clone, in list order) and a copy of the height grid: nothing is transferred, this thread keeps both.
function inWorkers({ list, hf, skip, workers, take }) {
  const shares = Array.from({ length: workers }, () => []);
  for (const b of list) shares[shareOf(b, workers)].push(b); // one pass, not one filter per worker
  return Promise.all(shares.map((share, part) => new Promise((res) => {
    let w = null;
    const fail = (err) => { w?.terminate(); console.warn(`[buildings] worker ${part} failed, its share builds on the main thread`, err); res(part); };
    try {
      w = new Worker(new URL('./buildings.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { if (e.data.error) return fail(e.data.error); w.terminate(); take(part, e.data); res(-1); };
      w.onerror = (e) => fail(e.error || e.message);
      w.postMessage({ buildings: share, hf: hf.data, skip: [...(skip ?? [])] });
    } catch (e) { fail(e); }
  }))).then((r) => r.filter((p) => p >= 0));
}

export async function buildCityBuildings({ root, map, hf, solids, zips, skip = null, facadeMat, detailMat, useWorkers = false,
  workers = Math.max(2, Math.min(6, (globalThis.navigator?.hardwareConcurrency ?? 4) - 2)), onProgress = null }) {
  const t0 = performance.now();
  let B = null, parts = null;
  const tiles = new Map();
  const addTile = (key, cx, cz, fac, det) => {
    const q = tiles.get(key) ?? tiles.set(key, { cx, cz, fac: [], det: [] }).get(key);
    if (fac) q.fac.push(fac);
    if (det) q.det.push(det);
  };
  if (useWorkers && typeof Worker !== 'undefined' && hf.data) {
    // replies are taken in as they come (geometry unpacked; solids, anchors and tiles added in share order, as before),
    // so the main thread does it in the gaps while the ground and the hand-built sites build, not after the last worker
    const stats = { buildings: 0, skipped: 0, invalid: 0, solids: 0, kinds: {}, workers, perWorker: [] };
    const ready = [];
    let next = 0, done = 0;
    B = { footprints: [], boxes: [], landmarks: [], stats };
    const absorb = (o) => {
      if (o.rec) replay(o.rec, solids, zips);
      for (const t of o.tiles) addTile(t.key, t.cx, t.cz, t.fac, t.det);
      for (const f of o.footprints) B.footprints.push(f);
      for (const b of o.boxes) B.boxes.push(b);
      for (const l of o.landmarks) B.landmarks.push(l);
      for (const key of ['buildings', 'skipped', 'invalid', 'solids']) stats[key] += o.stats[key] || 0;
      for (const [k, n] of Object.entries(o.stats.kinds ?? {})) stats.kinds[k] = (stats.kinds[k] || 0) + n;
    };
    const failed = await inWorkers({ list: map.buildings, hf, skip, workers, take: (part, o) => {
      for (const t of o.tiles) { t.fac &&= unpackGeometry(t.fac); t.det &&= unpackGeometry(t.det); }
      stats.perWorker[part] = { start: o.stats.startMs, fetch: o.stats.fetchMs, build: o.stats.buildMs, n: o.stats.buildings };
      ready[part] = o;
      while (ready[next]) absorb(ready[next++]);
      onProgress?.(++done / workers);
    } });
    if (failed.length === workers) B = null; // no workers at all: the time-sliced pass below
    else if (failed.length) { // the lost shares, here, then the shares after them (same generator, same numbers)
      const res = generate({ map: { buildings: map.buildings.filter((b) => failed.some((p) => inShare(b, p, workers))) }, solids, zips, heightAt: hf.heightAt, skip, dress: await loadDress() });
      absorb({ tiles: [...res.tiles.values()].map((t) => ({ ...t, fac: t.fac.build(), det: t.det.v ? t.det.build({ part: true }) : null })),
        footprints: res.footprints, boxes: plainBoxes(res.boxes), landmarks: res.landmarks, stats: res.stats });
      for (; next < workers; next++) if (ready[next]) absorb(ready[next]);
      stats.failed = failed;
    }
  }
  if (B) parts = [...tiles.values()].map((q) => ({ cx: q.cx, cz: q.cz, fac: q.fac.length ? mergeGeometries(q.fac) : null, det: q.det.length ? mergeGeometries(q.det) : null }));
  else {
    const res = await buildBuildingsAsync({ map, solids, zips, heightAt: hf.heightAt, skip, dress: await loadDress(), sliceMs: 30, onProgress });
    parts = [...res.tiles.values()].map((t) => ({ cx: t.cx, cz: t.cz, fac: t.fac.build(), det: t.det.v ? t.det.build({ part: true }) : null }));
    B = { footprints: res.footprints, boxes: plainBoxes(res.boxes), landmarks: res.landmarks, stats: res.stats };
  }
  const t1 = performance.now();
  const centres = parts.map((t) => [t.cx, t.cz]);
  const info = parts.map((t, i) => ({ i, cx: t.cx, cz: t.cz, fac: !!t.fac, det: !!t.det }));
  const opts = { castShadow: true, receiveShadow: true, group: 2 };
  const facade = batchTiles(parts.map((t) => t.fac), facadeMat, 'facade', opts, centres);
  const detail = batchTiles(parts.map((t) => t.det), detailMat, 'roofs', opts, centres);
  const meshes = [...facade.meshes, ...detail.meshes];
  for (const m of meshes) root.add(m);
  const ms = { build: Math.round(t1 - t0), meshes: Math.round(performance.now() - t1) };

  // per-tile LOD (the merged 512 m mesh follows its nearest tile), re-evaluated after the camera moved 20 m
  let lx = Infinity, lz = Infinity;
  function update(p) {
    if (!p || (p.x - lx) ** 2 + (p.z - lz) ** 2 < 400) return;
    lx = p.x; lz = p.z;
    for (const t of info) {
      const gap = Math.hypot(Math.max(0, Math.abs(p.x - t.cx) - HALF), Math.max(0, Math.abs(p.z - t.cz) - HALF));
      if (t.det) { detail.setVisible(t.i, gap < DETAIL_FAR); detail.setShadow(t.i, gap < DETAIL_SHADOW); }
      if (t.fac) facade.setShadow(t.i, gap < FACADE_SHADOW);
    }
  }
  return { B, facade, detail, meshes, update, stats: () => ({ ...B.stats, tiles: info.length, ms, facade: facade.stats(), detail: detail.stats() }) };
}
