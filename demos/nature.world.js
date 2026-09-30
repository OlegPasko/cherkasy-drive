// Demo-only stand-ins for the Cherkasy ground (the real one is Oleg's ground.js / greenery.js, ported later):
// DEM height, 2 m land-use rasters, a coarse terrain mesh, flat-roof buildings, asphalt, embankment walls with their
// water-facing wet segments, and tree spots in the legacy greenery.js shape.
//   loadRiverbank(bounds) -> { map, heightAt, isWater, blocked, terrain, roads, buildings, walls, wetSegs, spots, lampPts }
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, ShapeUtils, Vector2 } from 'three';
import { PARK_GREENS, PARK_PINE, PAL, TREE_PALETTES, hedgeSpots } from '../src/world/trees.js';
import { WATER_Y } from '../src/world/water.js';

// edges of a flat [x, z, ...] polyline (closed: back to the first point), with length and unit direction
function* edges(F, closed = true) {
  const n = F.length >> 1, count = closed ? n : n - 1;
  for (let e = 0; e < count; e += 1) {
    const p = e * 2, q = ((e + 1) % n) * 2, ex = F[q] - F[p], ez = F[q + 1] - F[p + 1], len = Math.hypot(ex, ez);
    yield { ax: F[p], az: F[p + 1], bx: F[q], bz: F[q + 1], len, ux: len ? ex / len : 0, uz: len ? ez / len : 0 };
  }
}
const bboxOf = (F) => { const b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity }; for (let k = 0; k < F.length; k += 2) { b.x0 = Math.min(b.x0, F[k]); b.x1 = Math.max(b.x1, F[k]); b.z0 = Math.min(b.z0, F[k + 1]); b.z1 = Math.max(b.z1, F[k + 1]); } return b; };
const rng = (s) => () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 | 0) >>> 0) / 4294967296;

class Raster {
  constructor(B, c) { this.B = B; this.c = c; this.nx = Math.ceil((B.x1 - B.x0) / c); this.nz = Math.ceil((B.z1 - B.z0) / c); this.a = new Uint8Array(this.nx * this.nz); }
  get(x, z) { const i = Math.floor((x - this.B.x0) / this.c), j = Math.floor((z - this.B.z0) / this.c); return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? 0 : this.a[j * this.nx + i]; }
  fill(rings, v = 1) { // even-odd scanline over flat [x, z, ...] rings
    let z0 = Infinity, z1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (const F of rings) for (let i = 0; i < F.length; i += 2) { x0 = Math.min(x0, F[i]); x1 = Math.max(x1, F[i]); z0 = Math.min(z0, F[i + 1]); z1 = Math.max(z1, F[i + 1]); }
    if (x1 < this.B.x0 || x0 > this.B.x1 || z1 < this.B.z0 || z0 > this.B.z1) return;
    const j0 = Math.max(0, Math.floor((z0 - this.B.z0) / this.c)), j1 = Math.min(this.nz - 1, Math.ceil((z1 - this.B.z0) / this.c));
    const all = rings.flatMap(F => [...edges(F)]), col = (x) => (x - this.B.x0) / this.c - 0.5;
    for (let row = j0; row <= j1; row += 1) {
      const zc = this.B.z0 + (row + 0.5) * this.c;
      const hits = all.filter(e => (e.az > zc) !== (e.bz > zc)).map(e => e.ax + (zc - e.az) / (e.bz - e.az) * (e.bx - e.ax)).sort((p, q) => p - q);
      const clampC = (k) => Math.min(this.nx, Math.max(0, k));
      for (let h = 1; h < hits.length; h += 2) {
        const c0 = clampC(Math.ceil(col(hits[h - 1]))), c1 = clampC(Math.floor(col(hits[h])) + 1);
        if (c1 > c0) this.a.fill(v, row * this.nx + c0, row * this.nx + c1);
      }
    }
  }
}

export async function loadRiverbank(B) {
  const [map, bld, dem] = await Promise.all([
    ...['map.json', 'map_buildings.json'].map(f => fetch(`/assets/cherkasy/${f}`).then(res => res.json())),
    fetch('/assets/cherkasy/dem.bin').then(res => res.arrayBuffer()).then(buf => new Int16Array(buf)),
  ]);
  const D = map.dem;
  const demAt = (x, z) => {
    const fx = Math.min(D.nx - 1.001, Math.max(0, (x - D.x0) / D.cell)), fz = Math.min(D.nz - 1.001, Math.max(0, (z - D.z0) / D.cell)), i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    const g = (ii, jj) => dem[jj * D.nx + ii] * D.scale;
    return (g(i, j) * (1 - ax) + g(i + 1, j) * ax) * (1 - az) + (g(i, j + 1) * (1 - ax) + g(i + 1, j + 1) * ax) * az;
  };
  const W = new Raster(B, 2), A = new Raster(B, 2), H = new Raster(B, 2), P = new Raster(B, 4), Fo = new Raster(B, 4);
  for (const rings of map.water) W.fill(rings);
  for (const rings of map.asphalt) A.fill(rings);
  const inB = (F, m = 0) => F[0] > B.x0 - m && F[0] < B.x1 + m && F[1] > B.z0 - m && F[1] < B.z1 + m;
  const blds = bld.filter(b => b.p && inB(b.p));
  for (const b of blds) H.fill([b.p, ...(b.holes ?? [])]);
  for (const rings of map.cover.park ?? []) P.fill(rings);
  for (const rings of map.cover.forest ?? []) Fo.fill(rings);
  const isWater = (x, z) => W.get(x, z) === 1;
  const landY = (x, z) => Math.max(demAt(x, z), WATER_Y + 0.9);
  const heightAt = (x, z) => (isWater(x, z) ? WATER_Y - 3 : landY(x, z));
  // no tree on asphalt, in a building or in the water, checking the spot and four points m metres around it
  const taken = (x, z) => A.get(x, z) || H.get(x, z) || W.get(x, z);
  const blocked = (x, z, m) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].some(([ox, oz]) => taken(x + ox, z + oz));

  // ---- terrain (6 m grid, vertex colours)
  const C = 6, nx = Math.floor((B.x1 - B.x0) / C) + 1, nz = Math.floor((B.z1 - B.z0) / C) + 1;
  const nv = nx * nz, pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = [];
  for (let j = 0; j < nz; ++j) for (let i = 0; i < nx; ++i) {
    const x = B.x0 + i * C, z = B.z0 + j * C, k = (j * nx + i) * 3, w = isWater(x, z), n = Math.sin(x * 0.05) * Math.cos(z * 0.043) * 0.08;
    pos[k] = x; pos[k + 1] = heightAt(x, z); pos[k + 2] = z;
    const c = w ? [0.05, 0.045, 0.03] : Fo.get(x, z) ? [0.045, 0.06, 0.025] : P.get(x, z) ? [0.07, 0.11, 0.035] : [0.09, 0.105, 0.05];
    col[k] = c[0] * (1 + n); col[k + 1] = c[1] * (1 + n); col[k + 2] = c[2] * (1 + n);
  }
  for (let j = 0; j + 1 < nz; ++j) for (let i = 0; i + 1 < nx; ++i) { const a = j * nx + i; idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
  const tg = new BufferGeometry();
  tg.setAttribute('position', new BufferAttribute(pos, 3)); tg.setAttribute('color', new BufferAttribute(col, 3)); tg.setIndex(idx); tg.computeVertexNormals();
  const terrain = new Mesh(tg, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  terrain.receiveShadow = true; terrain.name = 'terrain';

  // ---- asphalt polygons draped on the terrain
  const rp = [], ri = [];
  for (const rings of map.asphalt) {
    if (!rings[0] || !inB(rings[0], 200)) continue;
    const toV = (F) => { const a = []; for (let i = 0; i < F.length; i += 2) a.push(new Vector2(F[i], F[i + 1])); return a; };
    const outer = toV(rings[0]), holes = rings.slice(1).map(toV), all = [...outer, ...holes.flat()], v0 = rp.length / 3;
    for (const p of all) rp.push(p.x, landY(p.x, p.y) + 0.2, p.y);
    for (const [a, b, c] of ShapeUtils.triangulateShape(outer, holes)) { const A2 = all[a], B2 = all[b], C2 = all[c], up = (B2.y - A2.y) * (C2.x - A2.x) - (B2.x - A2.x) * (C2.y - A2.y) > 0; ri.push(v0 + a, ...(up ? [v0 + b, v0 + c] : [v0 + c, v0 + b])); }
  }
  const rg = new BufferGeometry(); rg.setAttribute('position', new Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
  const asphaltMat = new MeshStandardMaterial({ roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  asphaltMat.color.setRGB(0.03, 0.032, 0.035);
  const roads = new Mesh(rg, asphaltMat);
  roads.receiveShadow = true; roads.name = 'roads';

  // ---- flat-roof buildings
  const bp = [], bc = [];
  const r0 = rng(3);
  for (const b of blds) {
    const F = b.p, n = F.length / 2; if (n < 3) continue;
    let base = Infinity; for (let i = 0; i < F.length; i += 2) base = Math.min(base, landY(F[i], F[i + 1]));
    const h = b.h || (b.lv ? b.lv * 3.1 : 6) + 0.5, top = base + h, tone = 0.25 + r0() * 0.25, c = [tone, tone * 0.95, tone * 0.88];
    let area = 0; for (let i = 0; i < n; ++i) { const j = (i + 1) % n; area += F[i * 2] * F[j * 2 + 1] - F[j * 2] * F[i * 2 + 1]; }
    const ccw = area > 0;
    for (let i = 0; i < n; ++i) {
      const j = (i + 1) % n, [ax, az, bx, bz] = ccw ? [F[j * 2], F[j * 2 + 1], F[i * 2], F[i * 2 + 1]] : [F[i * 2], F[i * 2 + 1], F[j * 2], F[j * 2 + 1]];
      for (const [x, y, z] of [[ax, base - 1, az], [bx, base - 1, bz], [bx, top, bz], [ax, base - 1, az], [bx, top, bz], [ax, top, az]]) { bp.push(x, y, z); bc.push(...c); }
    }
    const pts = Array.from({ length: n }, (_, k) => new Vector2(F[2 * k], F[2 * k + 1]));
    for (const [a, b2, c2] of ShapeUtils.triangulateShape(pts, [])) {
      const A2 = pts[a], B2 = pts[b2], C2 = pts[c2], up = (B2.y - A2.y) * (C2.x - A2.x) - (B2.x - A2.x) * (C2.y - A2.y) > 0;
      for (const p of up ? [A2, B2, C2] : [A2, C2, B2]) { bp.push(p.x, top, p.y); bc.push(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8); }
    }
  }
  const bg = new BufferGeometry(); bg.setAttribute('position', new Float32BufferAttribute(bp, 3)); bg.setAttribute('color', new Float32BufferAttribute(bc, 3)); bg.computeVertexNormals();
  const buildings = new Mesh(bg, new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  buildings.castShadow = buildings.receiveShadow = true; buildings.name = 'buildings';

  // ---- embankment walls along the water polygon + the wet segments that face the water
  const wp = [], wetSegs = [], lampPts = [];
  let acc = 0;
  for (const rings of map.water) for (const F of rings) for (const e of edges(F)) {
    if (e.len < 0.05 || e.ax <= B.x0 || e.ax >= B.x1 || e.az <= B.z0 || e.az >= B.z1) continue;
    // the side of the edge that is water (3 m out from its middle)
    const cx = (e.ax + e.bx) / 2, cz = (e.az + e.bz) / 2, side = [1, -1].find(sg => isWater(cx - e.uz * sg * 3, cz + e.ux * sg * 3));
    if (!side) continue;
    const nx = -e.uz * side, nz = e.ux * side, bot = WATER_Y - 3.2;
    const topA = landY(e.ax - nx * 3, e.az - nz * 3) + 0.1, topB = landY(e.bx - nx * 3, e.bz - nz * 3) + 0.1;
    const corners = [[e.ax, bot, e.az], [e.bx, bot, e.bz], [e.bx, topB, e.bz], [e.ax, topA, e.az]];
    for (const k of side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) wp.push(...corners[k]); // quad faces the water
    wetSegs.push({ ax: e.ax, az: e.az, bx: e.bx, bz: e.bz, nx, nz });
    for (acc += e.len; acc > 28; acc -= 28) { const f = 1 - (acc - 28) / e.len; if (f < 0 || f > 1) continue; const lx = e.ax + (e.bx - e.ax) * f - nx * 2.2, lz = e.az + (e.bz - e.az) * f - nz * 2.2; lampPts.push([lx, landY(lx, lz), lz]); }
  }
  const wg = new BufferGeometry(); wg.setAttribute('position', new Float32BufferAttribute(wp, 3)); wg.computeVertexNormals();
  const walls = new Mesh(wg, new MeshStandardMaterial({ color: new Color(0.32, 0.31, 0.29), roughness: 0.9 }));
  walls.receiveShadow = walls.castShadow = true; walls.name = 'embankment walls';

  // ---- tree spots (legacy greenery.js record shape: { x, z, y, kind, sc, pal, s3 })
  const r = rng(11), spots = [];
  const HS = 4, hash = new Map();
  const near = (x, z, d) => { const i0 = Math.floor(x / HS), j0 = Math.floor(z / HS), k = Math.ceil(d / HS); for (let i = i0 - k; i <= i0 + k; ++i) for (let j = j0 - k; j <= j0 + k; ++j) for (const [px, pz] of hash.get(i * 73856 + j) ?? []) if ((px - x) ** 2 + (pz - z) ** 2 < d * d) return true; return false; };
  const put = (x, z, kind, sc, pal, s3) => { const k = Math.floor(x / HS) * 73856 + Math.floor(z / HS); if (!hash.has(k)) hash.set(k, []); hash.get(k).push([x, z]); spots.push({ x, z, y: landY(x, z) + 0.15, kind, sc, pal, s3 }); };
  const inside = (x, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
  const green = () => (r() < 0.12 ? [PAL[Math.floor(r() * 3)]] : PARK_GREENS);
  for (const [x, z] of map.trees) if (inside(x, z) && !blocked(x, z, 0.8) && !near(x, z, 3)) put(x, z, Fo.get(x, z) && r() < 0.5 ? 'conifer' : 'street', 0.8 + r() * 0.5, Fo.get(x, z) ? PARK_PINE : green());
  for (const rd of map.roads) {
    if (rd.k !== 'm' || !/^(trunk|primary|secondary|tertiary|residential)$/.test(rd.c) || !inB(rd.p, 300)) continue;
    const main = rd.c !== 'residential', off = rd.w / 2 + (main ? 2.2 : 1.5), step = main ? 9 : 11, poplar = main && r() < 0.2;
    for (const sg of [-1, 1]) {
      if (!main && r() < 0.35) continue;
      let t = r() * step;
      for (const { ax, az, len: L, ux, uz } of edges(rd.p, false)) {
        if (L < 1) continue;
        const nx = -uz * sg, nz = ux * sg;
        for (; t < L; t += step * (0.85 + r() * 0.3)) {
          const x = ax + ux * t + nx * off, z = az + uz * t + nz * off;
          if (!inside(x, z) || blocked(x, z, 1.6) || near(x, z, 6)) continue;
          if (poplar) put(x, z, 'conifer', 1.1 + r() * 0.4, green(), [0.42, 1.9, 0.42]); else put(x, z, 'street', 1 + r() * 0.5, green());
        }
        t -= L;
      }
    }
  }
  // jittered grid over each cover polygon (rasterised once at 2 m for the inside test)
  const fillCover = (list, sp, fn) => {
    for (const rings of list ?? []) {
      if (!inB(rings[0], 800)) continue;
      const bb = bboxOf(rings[0]), mask = new Raster({ ...bb, x1: bb.x1 + 1, z1: bb.z1 + 1 }, 2);
      mask.fill(rings);
      for (let gx = Math.max(bb.x0, B.x0); gx < Math.min(bb.x1, B.x1); gx += sp) for (let gz = Math.max(bb.z0, B.z0); gz < Math.min(bb.z1, B.z1); gz += sp) {
        const px = gx + (r() - 0.5) * sp * 0.9, pz = gz + (r() - 0.5) * sp * 0.9;
        if (mask.get(px, pz)) fn(px, pz);
      }
    }
  };
  fillCover(map.cover.forest, 6.5, (x, z) => { if (blocked(x, z, 1.2) || near(x, z, 4.2)) return; const pine = r() < 0.55; put(x, z, pine ? 'conifer' : r() < 0.7 ? 'park' : 'elm', pine ? 1.1 + r() * 0.6 : 0.8 + r() * 0.5, pine ? PARK_PINE : green(), pine ? [0.85, 1.35 + r() * 0.4, 0.85] : null); });
  fillCover(map.cover.park, 9, (x, z) => { if (r() < 0.4 || blocked(x, z, 1.5) || near(x, z, 5.5)) return; const k = r(); if (k < 0.06) put(x, z, 'conifer', 0.6 + r() * 0.3, TREE_PALETTES.blueSpruce, [0.8, 1.15, 0.8]); else put(x, z, k < 0.55 ? 'park' : k < 0.8 ? 'street' : 'elm', 0.7 + r() * 0.6, green()); });
  fillCover(map.cover.grass, 16, (x, z) => { if (r() < 0.7 || blocked(x, z, 1.5) || near(x, z, 6)) return; put(x, z, r() < 0.5 ? 'small' : 'park', 0.7 + r() * 0.5, green()); });
  // courtyards between the blocks: sparse lindens, fruit trees, a few young saplings
  for (let x = B.x0; x < B.x1; x += 14) for (let z = B.z0; z < B.z1; z += 14) {
    const jx = x + r() * 14, jz = z + r() * 14; if (r() > 0.3 || blocked(jx, jz, 2.5) || near(jx, jz, 6.5)) continue;
    const k = r(); put(jx, jz, k < 0.25 ? 'small' : k < 0.6 ? 'street' : k < 0.85 ? 'park' : 'elm', k < 0.25 ? 0.45 + r() * 0.6 : 1 + r() * 0.5, k < 0.25 ? TREE_PALETTES.small : green());
  }
  // clipped hedges along the embankment promenade (a strip 7 m inland of the walls)
  let hAcc = 0;
  for (const w of wetSegs) {
    hAcc += Math.hypot(w.bx - w.ax, w.bz - w.az);
    if (hAcc < 40) continue;
    hAcc = 0;
    const [p0, p1] = [[w.ax, w.az], [w.bx, w.bz]].map(([x, z]) => [x - w.nx * 7, z - w.nz * 7]);
    if (!blocked(...p0, 0.5) && !blocked(...p1, 0.5)) spots.push(...hedgeSpots(...p0, ...p1, { y: 0.1, heightAt: landY }));
  }
  return { map, heightAt, landY, isWater, blocked, terrain, roads, buildings, walls, wetSegs, spots, lampPts };
}
