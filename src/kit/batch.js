// Static geometry batching by spatial tile: one mesh per tile (or per group of tiles) so frustum culling works and
// the draw-call count follows the tile count, not the object count.
//
// Exports
//   batchTiles(geoms, material, name, opts = {}, centers = []) -> batch
//     geoms[i]: BufferGeometry | null (missing tiles are fine), centers[i]: [x, z] tile centre
//     opts: { castShadow = true, receiveShadow = true, group = 1 (merge group x group neighbouring tiles into one mesh),
//             tileSize = 256, release = true (drop CPU arrays after the GPU upload), renderOrder }
//     batch: { meshes: Mesh[], meshOf: Int32Array (tile -> mesh index, -1 = none),
//              setVisible(i, on), setShadow(i, on)  (per tile; a merged mesh is on when any of its tiles is on),
//              stats() -> { meshes, visible, triangles, vertices }, dispose() }
//   mergeGeometries(list) -> BufferGeometry  same attribute layout required (e.g. all from one builder class)
//   splitTiles(geometry, tileSize = 256) -> [{ geometry, cx, cz }]  cut one big geometry into tiles (triangle centroid)
import * as THREE from 'three';

export function mergeGeometries(list) {
  list = list.filter(Boolean);
  if (list.length === 1) return list[0];
  const out = new THREE.BufferGeometry(), first = list[0];
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  for (const key of Object.keys(first.attributes)) {
    const a0 = first.attributes[key], arr = new a0.array.constructor(nv * a0.itemSize);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[key];
      if (!a || a.itemSize !== a0.itemSize) throw new Error(`mergeGeometries: attribute ${key} layout differs`);
      arr.set(a.array, o); o += a.array.length;
    }
    out.setAttribute(key, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
  }
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let o = 0, base = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[o + i] = I[i] + base; o += I.length; }
    else { for (let i = 0; i < n; i++) idx[o + i] = base + i; o += n; }
    base += n;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

export function batchTiles(geoms, material, name = 'tiles', opts = {}, centers = []) {
  const { castShadow = true, receiveShadow = true, group = 1, tileSize = 256, release = true, renderOrder = 0 } = opts;
  const nT = geoms.length, meshOf = new Int32Array(nT).fill(-1);
  const buckets = new Map();
  for (let i = 0; i < nT; i++) {
    if (!geoms[i] || !geoms[i].attributes.position?.count) continue;
    const c = centers[i] ?? [0, 0], G = tileSize * Math.max(1, group);
    const key = group > 1 ? Math.floor(c[0] / G) + ',' + Math.floor(c[1] / G) : 't' + i;
    let b = buckets.get(key); if (!b) buckets.set(key, (b = []));
    b.push(i);
  }
  const meshes = [], members = [];
  for (const tiles of buckets.values()) {
    const geo = tiles.length === 1 ? geoms[tiles[0]] : mergeGeometries(tiles.map((i) => geoms[i]));
    if (tiles.length > 1) for (const i of tiles) geoms[i].dispose();
    if (release) for (const a of Object.values(geo.attributes)) a.onUpload(dropArray);
    if (release && geo.index) geo.index.onUpload(dropArray);
    const m = new THREE.Mesh(geo, material);
    m.name = `${name}-${meshes.length}`;
    m.castShadow = castShadow; m.receiveShadow = receiveShadow; m.renderOrder = renderOrder;
    m.matrixAutoUpdate = false; m.updateMatrix();
    for (const i of tiles) meshOf[i] = meshes.length;
    meshes.push(m); members.push(tiles);
  }
  const vis = new Uint8Array(nT).fill(1), shd = new Uint8Array(nT).fill(castShadow ? 1 : 0);
  const refresh = (mi, flags, prop) => { meshes[mi][prop] = members[mi].some((i) => flags[i]); };
  return {
    meshes, meshOf,
    setVisible(i, on) { const mi = meshOf[i]; if (mi < 0 || vis[i] === +on) return; vis[i] = +on; refresh(mi, vis, 'visible'); },
    setShadow(i, on) { const mi = meshOf[i]; if (mi < 0 || shd[i] === +on) return; shd[i] = +on; refresh(mi, shd, 'castShadow'); },
    stats() {
      let visible = 0, triangles = 0, vertices = 0;
      for (const m of meshes) {
        const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        triangles += t; vertices += m.geometry.attributes.position.count; if (m.visible) visible++;
      }
      return { meshes: meshes.length, visible, triangles, vertices };
    },
    dispose() { for (const m of meshes) m.geometry.dispose(); },
  };
}
function dropArray() { this.array = new this.array.constructor(0); }

export function splitTiles(geometry, tileSize = 256) {
  const pos = geometry.attributes.position, I = geometry.index ? geometry.index.array : null;
  const nTri = (I ? I.length : pos.count) / 3, at = (k) => (I ? I[k] : k);
  const tiles = new Map();
  for (let t = 0; t < nTri; t++) {
    const a = at(t * 3), b = at(t * 3 + 1), c = at(t * 3 + 2);
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const i = Math.floor(cx / tileSize), j = Math.floor(cz / tileSize), key = i + ',' + j;
    let T = tiles.get(key); if (!T) tiles.set(key, (T = { i, j, tris: [] }));
    T.tris.push(a, b, c);
  }
  const out = [];
  for (const T of tiles.values()) {
    const remap = new Map(), order = [];
    const idx = T.tris.map((v) => { let r = remap.get(v); if (r === undefined) { r = order.length; remap.set(v, r); order.push(v); } return r; });
    const g = new THREE.BufferGeometry();
    for (const [key, a] of Object.entries(geometry.attributes)) {
      const arr = new a.array.constructor(order.length * a.itemSize);
      for (let k = 0; k < order.length; k++) for (let c = 0; c < a.itemSize; c++) arr[k * a.itemSize + c] = a.array[order[k] * a.itemSize + c];
      g.setAttribute(key, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    }
    g.setIndex(new THREE.BufferAttribute(order.length > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    out.push({ geometry: g, cx: (T.i + 0.5) * tileSize, cz: (T.j + 0.5) * tileSize });
  }
  return out;
}
