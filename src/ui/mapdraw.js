// Shared 2D map painter for the minimap (hud.js) and the full-screen map (bigmap.js): the city features bucketed once,
// then painted into cached canvas tiles at a few fixed resolutions; place icons as cached sprites; street-name chains.
//
//   createMapPainter({ world, features?, doc }) -> painter
//     world / features: as in createHud (features override, else world.mapFeatures, world.cherkasy.map, getMapFeatures())
//   painter.index()                       the feature index ({ buckets, wide, valid }), built on first use
//   painter.tile(level, i, j) -> t        cached tile (t.c canvas, t.ready, t.m metres, t.row > 0 while half painted)
//   painter.work(budgetMs) -> ms          paints queued tiles within the budget (at least one per call)
//   painter.pending                       queued tile count
//   painter.drop('big' | 'mini')          forget that group's unpainted tiles (the big map closed: no backlog for the game)
//   painter.levelFor(pxPerM) -> level     the big-map level nearest to that device px / metre (log scale)
//   painter.frame()                       starts a draw: tiles asked for after it are not evicted until the next one
//   painter.bounds                        { x0, z0, x1, z1 } the area worth painting (map region + margin) or null
//   painter.places                        world.places ([{ id, kind, name, note, icon, x, z, rings }]) or []; kind
//                                          'improved' has no badge, only its grey footprint in the tiles
//   painter.icon(place, size, dpr) -> canvas   cached round badge (size = css px across; a partner with a url gets the
//                                          "open in a new tab" glyph instead of its emoji)
//                                          a sight with place.visited === false (the explore quest, game/explore.js) is dim
//                                          with a grey rim, one with visited === true gets a green check; no flag – plain
//   painter.streets() -> [{ name, label, rank, p: flat [x, z, ...], len, x0, z0, x1, z1 }]  named road chains
// layAlong(P, cum, a0, text, width(ch), inside(x, y)) -> [{ ch, x, y, ang }] | null   a street name's glyphs along a screen
//   polyline (flat P, arc lengths cum) from arc a0; null where the path bends too much under it or a glyph leaves the frame
// LEVELS: 'mini' 256 m @ 192 px (0.75 px/m, the minimap, its own cache) and big-map levels 0..5: 512 px tiles from 2048 m
// (0.25 px/m) halving to 64 m (8 px/m). One step per zoom octave keeps a screen at ~50 tiles; they share one LRU cache.
// Tiles are in map metres: canvas x = world x, canvas y = world z.
export const COL = {
  road: '#7d8ca3', block: '#1a273b', water: '#2b6aa0', park: '#2c5a47', bld: '#3f5575', bldEdge: '#5b7398', edge: 'rgba(255,255,255,.28)',
  rail: '#b3aa9c', tie: '#5c574f',
  sight: '#8a7a4c', sightEdge: '#f2c14e', ad: '#8c3a6c', adEdge: '#ff6fb5', imp: '#5f6570', impEdge: '#b4bac4',
};
export const LEVELS = { mini: { m: 256, px: 192 } };
for (let k = 0; k < 6; k++) LEVELS[k] = { m: 2048 / 2 ** k, px: 512 };
const CACHE_MAX = { mini: 64, big: 140 }; // big: a retina screen at the finest level needs ~90 (1 MB each)
const BUCKET = 256;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// ------------------------------------------------------------------------------------------------ map features
const pairsToFlat = (P) => (P && typeof P[0] === 'number' ? P : (P || []).flatMap((q) => [q[0], q[1]]));
export function featuresOf(world) {
  if (world?.mapFeatures) return world.mapFeatures;
  const m = world?.cherkasy?.map;
  if (m) {
    const cover = m.cover || {};
    return {
      blocks: m.land || [],
      water: m.water || [],
      parks: [...(cover.park || []), ...(cover.forest || []), ...(cover.grass || [])],
      buildings: (m.buildings || []).map((b) => b.p).filter(Boolean),
      roads: m.land?.length ? [] : (m.roads || []).map((r) => ({ p: r.p, w: r.w || 6 })),
      rails: m.rails || [],
      bridges: (m.roads || []).filter((r) => r.br && r.k === 'm' && r.p?.length >= 4).map((r) => ({ p: r.p, w: r.w || 6 })),
    };
  }
  const f = world?.getMapFeatures?.();
  if (f) {
    return {
      blocks: (f.blocks || []).map((b) => [pairsToFlat(b.poly), ...(b.holes || []).map(pairsToFlat)]),
      water: (f.water || []).map((r) => [pairsToFlat(r)]),
      parks: (f.parks || []).map((r) => [pairsToFlat(r)]),
      buildings: (f.buildings || []).map((b) => pairsToFlat(b.poly)),
      roads: [],
    };
  }
  return null;
}

// layers: 0 blocks, 1 parks, 2 water, 3 buildings, 4 road strokes, railway lines (item.rail: 1 main, 2 siding) and,
// over them, road bridges (item.bridge: the deck with a dark edge each side, so what runs under it shows as passing under),
// 5 sight footprints, 6 partner footprints, 7 improved-object footprints (grey).
// Every drawable goes into the 256 m buckets its bounds touch; features spanning many buckets go to a shared "wide" list.
function indexFeatures(F, places) {
  const buckets = new Map(), wide = [];
  let valid = 0, seq = 0;
  const put = (layer, rings, pad = 0, rail = 0, bridge = 0) => {
    const outer = rings[0];
    if (!outer || outer.length < 4) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < outer.length; i += 2) {
      const x = outer[i], z = outer[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const item = { layer, rings, rail, bridge, seq: seq++, w: pad * 2, x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
    const i0 = Math.floor(item.x0 / BUCKET), i1 = Math.floor(item.x1 / BUCKET), j0 = Math.floor(item.z0 / BUCKET), j1 = Math.floor(item.z1 / BUCKET);
    valid++;
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 16) { wide.push(item); return; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = `${i},${j}`;
      let b = buckets.get(k); if (!b) buckets.set(k, (b = []));
      b.push(item);
    }
  };
  const asRings = (e) => (Array.isArray(e?.[0]) ? e : [e]);
  for (const e of F.blocks || []) put(0, asRings(e));
  for (const e of F.parks || []) put(1, asRings(e));
  for (const e of F.water || []) put(2, asRings(e));
  for (const e of F.buildings || []) put(3, asRings(e));
  for (const r of F.roads || []) if (r?.p?.length >= 4) put(4, [r.p], (r.w || 6) / 2);
  for (const r of F.rails || []) if (r?.p?.length >= 4) put(4, [r.p], 2, r.sv ? 2 : 1);
  for (const r of F.bridges || []) put(4, [r.p], r.w / 2 + 2, 0, 1);
  for (const q of places) for (const ring of q.rings || []) put(q.kind === 'ad' ? 6 : q.kind === 'improved' ? 7 : 5, [ring]);
  const order = (a, b) => a.layer - b.layer || a.seq - b.seq;
  for (const b of buckets.values()) b.sort(order);
  wide.sort(order);
  return { buckets, wide, valid };
}

// ------------------------------------------------------------------------------------------------ street chains
const RANK = { motorway: 0, trunk: 0, primary: 0, secondary: 0, primary_link: 1, secondary_link: 1, tertiary: 1, tertiary_link: 2,
  residential: 2, unclassified: 2, living_street: 2, pedestrian: 2, service: 3, footway: 3, steps: 4, path: 4, track: 4, cycleway: 4 };
const SHORT = [[/^вулиця\s+/i, 'вул. '], [/\s+вулиця$/i, ' вул.'], [/^бульвар\s+/i, 'бул. '], [/\s+бульвар$/i, ' бул.'],
  [/^проспект\s+/i, 'просп. '], [/\s+проспект$/i, ' просп.'], [/^провулок\s+/i, 'пров. '], [/\s+провулок$/i, ' пров.'],
  [/^площа\s+/i, 'пл. '], [/\s+площа$/i, ' пл.'], [/^узвіз\s+/i, 'узв. '], [/\s+узвіз$/i, ' узв.'], [/^набережна\s+/i, 'наб. ']];
export const shortStreet = (n) => SHORT.reduce((s, [re, to]) => s.replace(re, to), n).trim();

export function layAlong(P, cum, a0, text, width, inside) {
  const out = [];
  let seg = 0, a = a0, prevAng = null, turn = 0;
  for (const ch of text) {
    const w = width(ch), mid = a + w / 2;
    while (seg < cum.length - 2 && cum[seg + 1] < mid) seg++;
    const L = cum[seg + 1] - cum[seg] || 1, f = (mid - cum[seg]) / L;
    const x0 = P[seg * 2], y0 = P[seg * 2 + 1], x1 = P[seg * 2 + 2], y1 = P[seg * 2 + 3];
    const ang = Math.atan2(y1 - y0, x1 - x0);
    if (prevAng != null) { let d = ang - prevAng; d = Math.atan2(Math.sin(d), Math.cos(d)); turn += Math.abs(d); if (Math.abs(d) > 0.5 || turn > 0.9) return null; }
    prevAng = ang;
    const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
    if (!inside(x, y)) return null;
    out.push({ ch, x, y, ang });
    a += w;
  }
  return out;
}

// join same-named OSM ways end to end into long polylines (a label needs room to run along the street)
function streetChains(roads) {
  const byName = new Map();
  for (const r of roads || []) {
    if (!r?.n || !(r.p?.length >= 4)) continue;
    const rank = RANK[r.c] ?? 3;
    if (rank > 3) continue;
    let L = byName.get(r.n); if (!L) byName.set(r.n, (L = []));
    L.push({ p: Array.from(r.p), rank });
  }
  const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const out = [];
  for (const [name, segs] of byName) {
    const ends = new Map(); // endpoint -> segments touching it
    const addEnd = (k, s) => { let a = ends.get(k); if (!a) ends.set(k, (a = [])); a.push(s); };
    for (const s of segs) { addEnd(key(s.p[0], s.p[1]), s); addEnd(key(s.p[s.p.length - 2], s.p[s.p.length - 1]), s); }
    const used = new Set();
    const grow = (P, rank, atEnd) => { // extend P at its tail with unused segments meeting there
      for (;;) {
        const k = key(P[P.length - 2], P[P.length - 1]);
        const s = (ends.get(k) || []).find((q) => !used.has(q));
        if (!s) return rank;
        used.add(s); rank = Math.min(rank, s.rank);
        const q = s.p, fwd = key(q[0], q[1]) === k;
        for (let i = 2; i < q.length; i += 2) { const t = fwd ? i : q.length - 2 - i; P.push(q[t], q[t + 1]); }
        if (!atEnd) return rank;
      }
    };
    const label = shortStreet(name);
    for (const s of segs) {
      if (used.has(s)) continue;
      used.add(s);
      let P = s.p.slice(), rank = s.rank;
      rank = grow(P, rank, true);
      const R = []; for (let i = P.length - 2; i >= 0; i -= 2) R.push(P[i], P[i + 1]); // grow the other end too
      rank = grow(R, rank, true); P = R;
      let len = 0, x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < P.length; i += 2) {
        if (i) len += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
        x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 1]); z1 = Math.max(z1, P[i + 1]);
      }
      if (len > 40) out.push({ name, label, rank, p: P, len, x0, z0, x1, z1 });
    }
  }
  out.sort((a, b) => a.rank - b.rank || b.len - a.len);
  return out;
}

// ------------------------------------------------------------------------------------------------ painter
export function createMapPainter({ world, features = null, doc = globalThis.document }) {
  let index = null, chains = null;
  const places = (() => { try { return (world?.places || []).filter((q) => Number.isFinite(q?.x) && Number.isFinite(q?.z)); } catch { return []; } })();
  const region = world?.cherkasy?.map?.region, M = 7000; // far enough that the zoomed-out view never shows the edge
  const bounds = region ? { x0: region.x0 - M, z0: region.z0 - M, x1: region.x1 + M, z1: region.z1 + M } : null;
  const caches = new Map(); // 'mini' | 'big' -> Map(key -> tile)
  let stamp = 0;
  const queue = [];
  let paintErr = false;

  function ensureIndex() {
    if (index) return index;
    let F = null;
    try { F = features || featuresOf(world); } catch (e) { console.error('[map] features', e); }
    index = F ? indexFeatures(F, places) : { buckets: new Map(), wide: [], valid: 0 };
    return index;
  }

  const FILL = [COL.block, COL.park, COL.water, COL.bld, null, COL.sight, COL.ad, COL.imp], EDGE = { 5: COL.sightEdge, 6: COL.adEdge, 7: COL.impEdge };
  function paintTile(t) {
    const g = t.c.getContext('2d'), I = ensureIndex();
    const { m, px } = LEVELS[t.level], s = px / m, x0 = t.i * m, z0 = t.j * m, x1 = x0 + m, z1 = z0 + m;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = I.valid ? COL.road : COL.block; g.fillRect(0, 0, px, px);
    // features from every bucket under the tile (a tile can be bigger than a bucket: dedupe)
    let list;
    if (m <= BUCKET) list = (I.buckets.get(`${Math.floor(x0 / BUCKET)},${Math.floor(z0 / BUCKET)}`) || []).filter((f) => f.x1 >= x0 && f.x0 <= x1 && f.z1 >= z0 && f.z0 <= z1);
    else {
      const seen = new Set();
      for (let i = x0 / BUCKET; i < x1 / BUCKET; i++) for (let j = z0 / BUCKET; j < z1 / BUCKET; j++) for (const f of I.buckets.get(`${i},${j}`) || []) seen.add(f);
      list = [...seen];
    }
    for (const f of I.wide) if (f.x1 >= x0 && f.x0 <= x1 && f.z1 >= z0 && f.z0 <= z1) list.push(f);
    list.sort((a, b) => a.layer - b.layer || a.seq - b.seq);
    g.setTransform(s, 0, 0, s, -x0 * s, -z0 * s); // world metres straight onto the tile
    if (region && I.valid && (x0 < region.x0 || z0 < region.z0 || x1 > region.x1 || z1 > region.z1)) {
      // outside the mapped region only the land polygons reach: what they leave uncovered is the reservoir
      g.beginPath(); g.rect(x0 - 1, z0 - 1, m + 2, m + 2); g.rect(region.x0, region.z0, region.x1 - region.x0, region.z1 - region.z0);
      g.fillStyle = COL.water; g.fill('evenodd');
    }
    const edge = 0.6 / s, fine = s >= 0.7;
    for (const f of list) {
      if (f.rail) { // railway: sleepers as a dashed wide stroke once they are ~1 px, then the line itself
        const r = f.rings[0], main = f.rail === 1;
        g.beginPath(); g.moveTo(r[0], r[1]);
        for (let k = 2; k < r.length; k += 2) g.lineTo(r[k], r[k + 1]);
        g.lineCap = 'butt';
        if (s >= 1.5) { g.strokeStyle = COL.tie; g.lineWidth = 3.4; g.setLineDash([0.6, 1.8]); g.stroke(); g.setLineDash([]); }
        g.strokeStyle = COL.rail; g.lineWidth = Math.max((main ? 1.3 : 0.9) / s, s >= 1.5 ? 1.5 : 0); g.stroke();
        continue;
      }
      if (f.bridge) { // a road bridge over whatever the tile drew before: dark edges, then the deck
        const r = f.rings[0];
        g.beginPath(); g.moveTo(r[0], r[1]);
        for (let k = 2; k < r.length; k += 2) g.lineTo(r[k], r[k + 1]);
        g.lineCap = 'butt';
        g.strokeStyle = COL.block; g.lineWidth = f.w; g.stroke();
        g.strokeStyle = COL.road; g.lineWidth = Math.max(1 / s, f.w - Math.max(3, 2.4 / s)); g.stroke();
        continue;
      }
      if (f.layer === 4) { // road stroke (maps without carriageway holes)
        const r = f.rings[0];
        g.strokeStyle = COL.road; g.lineWidth = Math.max(1.5 / s, f.w); g.lineCap = 'butt';
        g.beginPath(); g.moveTo(r[0], r[1]);
        for (let k = 2; k < r.length; k += 2) g.lineTo(r[k], r[k + 1]);
        g.stroke(); continue;
      }
      g.beginPath();
      for (const ring of f.rings) {
        if (!(ring?.length >= 6)) continue;
        g.moveTo(ring[0], ring[1]);
        for (let k = 2; k < ring.length; k += 2) g.lineTo(ring[k], ring[k + 1]);
        g.closePath();
      }
      g.fillStyle = FILL[f.layer]; g.fill('evenodd');
      if (f.layer === 3 && fine) { g.strokeStyle = COL.bldEdge; g.lineWidth = edge; g.stroke(); }
      else if (f.layer >= 5) { g.strokeStyle = EDGE[f.layer]; g.lineWidth = Math.max(1, 1.3 * Math.min(2, s)) / s; g.stroke(); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    t.ready = true;
  }
  // fallback (no map data): sample the world a few rows per call; building tops light, water blue, rest field
  function paintFallbackRows(t, rows) {
    const { m, px } = LEVELS[t.level], g = t.c.getContext('2d'), N = Math.round(px / 3), step = m / N, cp = px / N;
    const cw = world?.collision, gr = world?.cherkasy?.ground;
    for (let r = 0; r < rows && t.row < N; r++, t.row++) {
      const z = t.j * m + (t.row + 0.5) * step;
      for (let k = 0; k < N; k++) {
        const x = t.i * m + (k + 0.5) * step;
        let c = COL.block;
        try {
          if (gr?.isWater?.(x, z)) c = COL.water;
          else if (cw?.topAt && cw.topAt(x, z).id >= 0) c = COL.bld;
          else if (gr?.onAsphalt?.(x, z) || world?.streetsAt?.(x, z)?.type === 'street') c = COL.road;
        } catch { /* keep the field colour */ }
        g.fillStyle = c; g.fillRect(k * cp, t.row * cp, cp + 0.5, cp + 0.5);
      }
    }
    if (t.row >= N) t.ready = true;
  }

  function tile(level, i, j) {
    const group = level === 'mini' ? 'mini' : 'big';
    let C = caches.get(group); if (!C) caches.set(group, (C = new Map()));
    const k = level + ':' + i + ',' + j;
    let t = C.get(k);
    if (!t) {
      if (C.size >= CACHE_MAX[group]) { // evict the least recently used, never one the current draw is using
        let old = null; for (const [kk, tt] of C) if (tt.stamp !== stamp && (!old || tt.used < old[1].used)) old = [kk, tt];
        if (old) { C.delete(old[0]); old[1].dead = true; }
      }
      const c = doc.createElement('canvas'); c.width = c.height = LEVELS[level].px;
      t = { c, ready: false, used: 0, level, i, j, row: 0, m: LEVELS[level].m, dead: false };
      C.set(k, t); queue.push(t);
    }
    t.used = performance.now(); t.stamp = stamp;
    return t;
  }
  // newest requests first: whatever is on screen right now paints before tiles that scrolled away
  function work(budget = 3) {
    const t0 = performance.now();
    let n = 0;
    while (queue.length && (n === 0 || performance.now() - t0 < budget)) {
      const t = queue[queue.length - 1];
      if (t.dead || t.ready) { queue.pop(); continue; }
      try {
        if (ensureIndex().valid) { paintTile(t); queue.pop(); n++; }
        else { paintFallbackRows(t, 4); if (t.ready) queue.pop(); break; }
      } catch (e) { // a bad feature must not freeze the map: keep what was painted and move on
        if (!paintErr) { paintErr = true; console.error('[map] tile', e); }
        t.ready = true; queue.pop();
      }
    }
    return performance.now() - t0;
  }
  // re-prioritise: a tile asked for again moves to the front of the queue
  function want(t) { if (!t.ready && queue[queue.length - 1] !== t) { const k = queue.indexOf(t); if (k >= 0) { queue.splice(k, 1); queue.push(t); } } }

  const levelFor = (pxPerM) => Math.max(0, Math.min(5, Math.round(Math.log2(Math.max(pxPerM, 1e-3) / 0.25))));

  const icons = new Map();
  function icon(q, size, dpr) {
    const ad = q.kind === 'ad', link = ad && !!q.url, seen = ad ? null : q.visited ?? null;
    const key = `${q.kind}|${link ? 'link' : q.icon}|${size}|${dpr}|${seen}`;
    let c = icons.get(key);
    if (c) return c;
    const pad = seen ? Math.max(3, size * 0.16) : 3, D = Math.ceil((size + pad * 2) * dpr);
    c = doc.createElement('canvas'); c.width = c.height = D;
    const g = c.getContext('2d'), r = size / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.translate(r + pad, r + pad);
    g.shadowColor = ad ? 'rgba(255,80,160,.55)' : 'rgba(0,0,0,.5)'; g.shadowBlur = ad ? 5 : 3;
    g.beginPath(); g.arc(0, 0, r - 0.5, 0, Math.PI * 2);
    g.fillStyle = ad ? '#d63d86' : 'rgba(17,22,33,.92)'; g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = ad ? 1.6 : 1.3; g.strokeStyle = ad ? '#ffffff' : seen === false ? 'rgba(160,170,190,.7)' : '#f2c14e'; g.stroke();
    if (seen === false) g.globalAlpha = 0.5; // not visited yet: the emoji fades
    if (link) { // a partner with a site: the "open in a new tab" glyph (a box, its corner broken by an arrow)
      const b = size * 0.2, a = size * 0.24, o = size * 0.04;
      g.lineWidth = Math.max(1.4, size * 0.085); g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#fff';
      g.beginPath(); g.moveTo(o - b * 0.15, -b); g.lineTo(-b, -b); g.lineTo(-b, b); g.lineTo(b, b); g.lineTo(b, b * 0.15 - o); g.stroke();
      g.beginPath(); g.moveTo(-o, o); g.lineTo(a, -a); g.moveTo(a * 0.2, -a); g.lineTo(a, -a); g.lineTo(a, -a * 0.2); g.stroke();
    } else {
      g.font = `${Math.round(size * 0.58)}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.fillText(q.icon || '•', 0, size * 0.04);
    }
    g.globalAlpha = 1;
    if (seen) { // visited: a small green check on the lower right of the rim
      const k = size * 0.23, x = r * 0.72, y = r * 0.72;
      g.beginPath(); g.arc(x, y, k, 0, Math.PI * 2); g.fillStyle = '#3cb86a'; g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(10,14,22,.9)'; g.stroke();
      g.beginPath(); g.moveTo(x - k * 0.5, y); g.lineTo(x - k * 0.1, y + k * 0.4); g.lineTo(x + k * 0.5, y - k * 0.4);
      g.lineWidth = Math.max(1.2, k * 0.35); g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.stroke();
    }
    icons.set(key, c);
    return c;
  }

  return {
    index: ensureIndex, tile, want, work, levelFor, icon, places, bounds, frame() { stamp++; }, caches,
    drop(group) { // unpainted tiles of the group leave the cache; work() pops them as dead
      const C = caches.get(group); if (!C) return;
      for (const [k, t] of C) if (!t.ready) { t.dead = true; C.delete(k); }
    },
    stats: () => Object.fromEntries([...caches].map(([L, C]) => [L, `${[...C.values()].filter((t) => t.ready).length}/${C.size}`])),
    get pending() { while (queue.length && (queue[queue.length - 1].dead || queue[queue.length - 1].ready)) queue.pop(); return queue.length; },
    streets() {
      if (chains) return chains;
      try { chains = streetChains(world?.cherkasy?.map?.roads); } catch (e) { console.error('[map] streets', e); chains = []; }
      return chains;
    },
  };
}
