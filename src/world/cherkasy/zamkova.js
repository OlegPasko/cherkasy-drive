// OWNER: cherkasy. Zamkova hora (Castle Hill, GitHub issue #3): the hilltop park between Zamkovyi uzviz, vul. Baidy
// Vyshnevetskoho and uzviz Kniaziv Koriatovychiv. The DEM saw it as a shallow dip sloping down to the Dnipro (the
// viewpoint 6 m under the street); here the hilltop becomes one level plateau a little above the street, ending in a
// bluff over the Rose Valley. TERRAIN
//   shapeZamkova(hf, map, geo) -> { raised, locked, level }   call before the ground and the buildings are built:
//     lifts the height-field nodes of the plateau to PLATEAU_Y and eases a 18 m band outside it; nodes whose cells touch
//     a carriageway or another OSM building stay put, so the streets round the hill and their houses keep their levels
// SITE
//   buildZamkova({ root, map, solids, heightAt, geo }) -> { update(dt), clear(x, z) } | null
//     the rubble-stone retaining wall along the street with the steps up at the south-west entrance (Street View 2015),
//     the viewing platform at the tip (granite parapet + railing, coin telescopes, benches, lamps), Bohdan
//     Khmelnytsky square with the Ivan Pidkova monument (P. Kulyk, 1986: a 2 m bronze figure with a bulava on a granite
//     pedestal, a bronze cannon at its foot) and the Khmelnytsky memorial stone, benches from OSM, park lamps that light
//     up at dusk. The restaurant on the square is Chaika (restaurants.js): its floor follows the ground, so the raised
//     plateau now meets its terrace. clear(x, z): no generated trees on the structures or in the platform's view cone.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { SG, canvasTex } from './sculpt.js';
import { ringPts, inPoly, bboxOf, rng, centroid } from './geo.js';

const PI = Math.PI;
export const PLATEAU_Y = 23.8; // the hilltop level (m): level with the south lawns and uzviz Koriatovychiv, over the west corner
const BLEND = 18;               // m outside the plateau outline over which the lift eases out
// the plateau outline (inner edges of the sidewalks, round the houses under the north slope and the Chaika block)
const PLATEAU = [[49.447115, 32.064394], [49.447355, 32.064346], [49.448086, 32.064181], [49.448132, 32.064352], [49.4483, 32.064518],
  [49.448532, 32.064569], [49.448686, 32.06459], [49.448822, 32.06477], [49.448878, 32.064989], [49.448852, 32.065227], [49.448765, 32.065404],
  [49.448642, 32.065497], [49.448544, 32.06544], [49.448152, 32.065378], [49.448055, 32.065341], [49.447934, 32.065473], [49.447779, 32.065432],
  [49.447314, 32.064929], [49.447127, 32.064755], [49.44707, 32.064517]];
const CHAIKA = 169359452; // restaurants.js sets its floor from the ground under it, so it rides the new level
const WALKS = new Set(['footway', 'path', 'pedestrian', 'steps', 'track', 'cycleway', 'bridleway']);
const VIEW = [49.4488168, 32.0650768];    // OSM viewpoint 1805289067 at the end of the promenade
const PIDKOVA = [49.4478599, 32.0651802]; // OSM 3691978928
const KHMEL = [49.4473514, 32.0648263];   // OSM 3691978929, the stone at the top of the entrance steps
const STEPS = [49.447173, 32.064906];     // foot of the OSM steps between the sidewalk and the promenade
// the retaining wall along the park-side sidewalk of vul. Baidy Vyshnevetskoho, from the Zamkovyi uzviz corner south
const WALL = [[49.447239, 32.0644477], [49.4471766, 32.0646021], [49.4471484, 32.0651835]];
const BENCHES = [[49.448477, 32.0646366], [49.4485784, 32.0646534], [49.4488509, 32.0650977], [49.448855, 32.0650098], [49.4488504, 32.0649273],
  [49.4488358, 32.0648348], [49.4475461, 32.0649659], [49.4476298, 32.0650735], [49.447756, 32.0649994], [49.4479077, 32.0650226],
  [49.4481152, 32.0650504], [49.4481043, 32.0651379], [49.4487116, 32.0649267], [49.4486577, 32.0650309], [49.4484295, 32.0650938]]; // OSM
const DECK_R = 8, DECK_BACK = 3, DECK_UP = 0.3; // viewing platform: half-disc radius, straight back, one step over the lawn
const STEP_W = 7, TREAD = 0.34;

// 2D point helpers on [x, z] pairs
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
const mix = (p, q, s) => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const unit = (u) => { const l = Math.hypot(u[0], u[1]) || 1; return [u[0] / l, u[1] / l]; };
// the point of segment a-b nearest to p, with its distance as a third entry
function foot(a, b, p) {
  const e = sub(b, a), s = Math.min(1, Math.max(0, dot(sub(p, a), e) / (dot(e, e) || 1))), q = mix(a, b, s);
  q.push(dist(p, q));
  return q;
}
// closed ring as consecutive [a, b] pairs
const edges = (R) => R.map((a, k) => [R[(k || R.length) - 1], a]);
// distance from p to the outline P (0 inside)
const outside = (P, p) => (inPoly(P, p[0], p[1]) ? 0 : Math.min(...edges(P).map(([a, b]) => foot(a, b, p)[2])));

export function shapeZamkova(hf, map, geo) {
  const { meta: { x0, z0, cell, nx, nz }, grid } = hf.data;
  const P = PLATEAU.map(([la, lo]) => geo.toXZ(la, lo)), bb = bboxOf(P);
  const X0 = bb.x0 - BLEND - cell, X1 = bb.x1 + BLEND + cell, Z0 = bb.z0 - BLEND - cell, Z1 = bb.z1 + BLEND + cell;
  const near = (x, z) => x > X0 - 40 && x < X1 + 40 && z > Z0 - 40 && z < Z1 + 40;
  // lock the four nodes of every cell a protected point falls in
  const locked = new Set();
  const lock = ([x, z]) => {
    const i0 = Math.floor((x - x0) / cell), j0 = Math.floor((z - z0) / cell);
    for (let c = 0; c < 4; c++) { const i = i0 + (c & 1), j = j0 + (c >> 1); if (i >= 0 && j >= 0 && i < nx && j < nz) locked.add(j * nx + i); }
  };
  // a strip of half-width `half` round a-b, sampled every 2 m along and across
  const band = (a, b, half) => {
    const n = Math.max(1, Math.ceil(dist(a, b) / 2)), [ux, uz] = unit(sub(b, a)), across = Math.max(1, Math.ceil(half / 0.75));
    for (let k = 0; k <= n; k++) { const m = mix(a, b, k / n); for (let o = -across; o <= across; o++) lock([m[0] - uz * half * o / across, m[1] + ux * half * o / across]); }
  };
  for (const r of map.roads ?? []) {
    if (WALKS.has(r.c)) continue;
    const p = r.p; let hit = false, into = false;
    for (let k = 0; k < p.length; k += 2) { if (near(p[k], p[k + 1])) hit = true; if (inPoly(P, p[k], p[k + 1])) into = true; }
    if (!hit || (into && r.c === 'service')) continue; // the drives into the park (to Chaika's back door) rise with it
    const line = ringPts(p);
    for (let k = 1; k < line.length; k++) band(line[k - 1], line[k], (r.w ?? 6) / 2 + 1.5);
  }
  for (const b of map.buildings ?? []) {
    if (b.id === CHAIKA) continue;
    const R = ringPts(b.p);
    if (!R.some(([x, z]) => near(x, z))) continue;
    const q = bboxOf(R);
    for (const [a, c] of edges(R)) band(a, c, 0);
    for (let x = q.x0; x <= q.x1; x += 4) for (let z = q.z0; z <= q.z1; z += 4) if (inPoly(R, x, z)) lock([x, z]);
  }
  let raised = 0;
  const ia = Math.max(0, Math.floor((X0 - x0) / cell)), ib = Math.min(nx - 1, Math.ceil((X1 - x0) / cell));
  const ja = Math.max(0, Math.floor((Z0 - z0) / cell)), jb = Math.min(nz - 1, Math.ceil((Z1 - z0) / cell));
  for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
    const k = j * nx + i, x = x0 + i * cell, z = z0 + j * cell;
    if (locked.has(k)) continue;
    const d = outside(P, [x, z]); if (d >= BLEND) continue;
    const f = 1 - d / BLEND, w = f * f * (3 - 2 * f), lift = PLATEAU_Y - grid[k];
    if (lift > 0) { grid[k] += lift * w; raised++; }
  }
  return { raised, locked: locked.size, level: PLATEAU_Y };
}

// ------------------------------------------------------------------------------------------------ textures
// 2.4 m of rubble masonry: irregular dark field stones bedded in pale lime mortar (the Street View wall)
const rubbleTex = () => {
  const t = canvasTex(512, 512, (c, w, h) => {
    const r = rng(77);
    c.fillStyle = '#a39d91'; c.fillRect(0, 0, w, h);
    const tone = (base, span, k) => `rgb(${base.map((v, i) => Math.round(v + span[i] * k)).join(',')})`;
    // one stone = a lumpy ellipse; the ones near an edge are drawn again one tile over so the texture wraps
    const stone = (x, y, rx, ry, turn, fill) => {
      for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) {
        if ((ox && Math.abs(x + ox - w / 2) > w / 2 + rx) || (oy && Math.abs(y + oy - h / 2) > h / 2 + rx)) continue;
        c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, turn, 0, PI * 2);
        c.fillStyle = fill; c.fill(); c.strokeStyle = 'rgba(40,36,32,0.45)'; c.lineWidth = 3; c.stroke();
      }
    };
    for (let n = 0; n < 72; n++) {
      const col = n % 8, row = (n / 8) | 0, k = r();
      const fill = r() < 0.4 ? tone([104, 94, 80], [40, 34, 30], k) : tone([88, 88, 86], [44, 42, 40], k);
      stone((col + 0.5 + (r() - 0.5) * 0.35) * w / 8, (row + 0.5 + (r() - 0.5) * 0.3) * h / 9, 26 + r() * 10, 19 + r() * 7, (r() - 0.5) * 0.8, fill);
    }
    for (let q = 0; q < 2600; q++) { c.fillStyle = `rgba(${r() < 0.5 ? '30,28,26' : '220,214,204'},${0.08 + r() * 0.12})`; c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  });
  t.repeat.set(1 / 2.4, 1 / 2.4);
  return t;
};
// 1.5 m of flamed grey granite in 0.75 m slabs (paving, pedestal blocks, parapet)
const graniteTex = () => {
  const t = canvasTex(256, 256, (c, w, h) => {
    const r = rng(12);
    [0, 1, 2, 3].forEach((q) => { const v = 128 + r() * 24; c.fillStyle = `rgb(${v + 10 | 0},${v + 6 | 0},${v | 0})`; c.fillRect((q & 1) * w / 2, (q >> 1) * h / 2, w / 2, h / 2); });
    for (let q = 0; q < 5000; q++) { c.fillStyle = r() < 0.55 ? `rgba(40,38,36,${0.2 + r() * 0.3})` : `rgba(235,230,222,${0.2 + r() * 0.3})`; c.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
    c.fillStyle = 'rgba(50,48,45,0.7)'; c.fillRect(0, 0, w, 2); c.fillRect(0, h / 2 - 1, w, 2); c.fillRect(0, 0, 2, h); c.fillRect(w / 2 - 1, 0, 2, h);
  });
  t.repeat.set(1 / 1.5, 1 / 1.5);
  return t;
};

// ------------------------------------------------------------------------------------------------ site
export function buildZamkova({ root, map, solids: S, heightAt, geo }) {
  if (!geo) return null;
  const t0 = performance.now();
  const XZ = ([la, lo]) => geo.toXZ(la, lo);
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : PLATEAU_Y; };
  const r = rng(1586);
  const B = { rub: new MB(), gran: new MB(), det: new MB(), glow: new MB() };
  const bronze = new SG(), boulder = new SG();
  const keep = []; // [x, z, r]: generated trees stay out
  const P = PLATEAU.map(XZ), bb = bboxOf(P);
  // local frame: +z along the facing (fx, fz), +x to its right (fz, -fx), y up from y
  const frame = (x, y, z, fx, fz, s = 1) => M4(x, y, z, Math.atan2(fx, fz), s);
  const obox = (x, z, fx, fz, hx, hz, y0, y1, kind = 'wall') => S.obox(x, z, hx, hz, Math.atan2(-fx, fz), y0, y1, kind);
  const toW = (m) => { const v = new THREE.Vector3(); return (p) => v.set(p[0], p[1], p[2]).applyMatrix4(m).toArray(); };
  const box2 = { x0: bb.x0 - 30, x1: bb.x1 + 30, z0: bb.z0 - 30, z1: bb.z1 + 30 };

  // walk centre lines round the hill ({ a, b, kind, w }): benches face them, lamps follow the promenade
  const walks = [];
  for (const rd of map.roads ?? []) {
    if (!WALKS.has(rd.c)) continue;
    const line = ringPts(rd.p);
    line.slice(1).forEach((b, k) => {
      const m = mix(line[k], b, 0.5);
      if (m[0] > box2.x0 && m[0] < box2.x1 && m[1] > box2.z0 && m[1] < box2.z1) walks.push({ a: line[k], b, kind: rd.c, w: rd.w ?? 2 });
    });
  }
  const nearestWalk = (p, kind = null) => walks.filter((s) => !kind || s.kind === kind).map((s) => foot(s.a, s.b, p)).reduce((m, q) => (!m || q[2] < m[2] ? q : m), null);

  // ---------------------------------------------------------------- lamps and benches
  let lamps = 0, benches = 0;
  const lamp = (x, z, y = g(x, z)) => {
    B.det.setColor('#1c1e20');
    B.det.cyl(x, y, z, 0.17, 0.13, 0.45, 8).cyl(x, y + 0.45, z, 0.065, 0.05, 3.25, 6).cyl(x, y + 3.7, z, 0.07, 0.14, 0.14, 8);
    B.glow.ellipsoid([x, y + 4.06, z], [0.23, 0.25, 0.23], 10, 6);
    S.cyl(x, z, y, y + 3.9, 0.13, 0.1, 'pole');
    lamps++;
  };
  const bench = (x, z, fx, fz, y = g(x, z), L = 1.8) => {
    const m = frame(x, y, z, fx, fz);
    B.det.setColor('#262829').with(m, (q) => { for (const s of [-L / 2 + 0.18, L / 2 - 0.18]) q.box(s - 0.04, 0, -0.26, s + 0.04, 0.42, 0.22).box(s - 0.04, 0.42, -0.3, s + 0.04, 0.88, -0.22); });
    B.det.setColor('#86582f').with(m, (q) => {
      [-0.24, -0.125, -0.01, 0.105].forEach((d) => q.box(-L / 2, 0.42, d, L / 2, 0.46, d + 0.09)); // seat slats
      [0.54, 0.66, 0.78].forEach((y) => q.box(-L / 2, y, -0.3, L / 2, y + 0.09, -0.26));          // back slats
    });
    obox(x, z, fx, fz, L / 2, 0.3, y, y + 0.5, 'bench');
    keep.push([x, z, 1.4]); benches++;
  };

  // ---------------------------------------------------------------- viewing platform at the tip
  const tip = XZ(VIEW);
  const [fx, fz] = unit(sub(tip, centroid(P))), sx = fz, sz = -fx;  // outward over the valley, and its right
  const [vx, vz] = tip;
  const cx = vx - fx, cz = vz - fz, D0 = PLATEAU_Y + DECK_UP;
  const at = (a, d) => [cx + sx * a + fx * d, cz + sz * a + fz * d];
  const deck = [at(-DECK_R, -DECK_BACK), at(DECK_R, -DECK_BACK)], arc = [];
  for (let k = 0; k <= 18; k++) { const t = k / 18 * PI; arc.push(at(DECK_R * Math.cos(t), DECK_R * Math.sin(t))); }
  deck.push(...arc);
  const yb = Math.min(...deck.map(([x, z]) => g(x, z))) - 0.8;
  B.rub.extrude(deck, [], yb, D0 - 0.14, { top: false });
  B.gran.extrude(deck, [], D0 - 0.14, D0, { top: false }).fill(deck, [], D0, true);
  S.prism(deck.flat(), yb, D0, 0, 0, 'ledge');
  const onDeck = (x, z) => inPoly(deck, x, z);
  // granite parapet with a black steel railing round the drop (the straight sides too, the back stays open)
  const rim = [at(-DECK_R, -DECK_BACK + 0.6), ...arc.slice().reverse(), at(DECK_R, -DECK_BACK + 0.6)];
  const posts = [];
  rim.slice(1).forEach((b, k) => {
    const a = rim[k], L = dist(a, b), m = mix(a, b, 0.5), t = unit(sub(b, a));
    const out = dot([t[1], -t[0]], sub(m, [cx, cz])) > 0 ? [t[1], -t[0]] : [-t[1], t[0]]; // away from the deck centre
    const inset = (p) => [p[0] - out[0] * 0.22, p[1] - out[1] * 0.22], [px, pz] = inset(m);
    B.gran.with(frame(px, D0, pz, ...out), (q) => q.box(-L / 2 - 0.12, 0, -0.22, L / 2 + 0.12, 0.55, 0.22));
    obox(px, pz, ...out, L / 2 + 0.1, 0.24, D0 - 0.2, D0 + 1.12);
    posts.push(inset(a));
    if (k === rim.length - 2) posts.push(inset(b));
  });
  B.det.setColor('#17191b');
  posts.forEach(([x, z], k) => {
    B.det.cyl(x, D0 + 0.55, z, 0.03, 0.03, 0.57, 6);
    if (k) { const [px, pz] = posts[k - 1]; for (const y of [D0 + 0.84, D0 + 1.12]) B.det.tube([px, y, pz], [x, y, z], y > D0 + 1 ? 0.028 : 0.016, 6); }
  });
  // two coin telescopes on the rail, lamps at the corners, benches along the back facing the view
  for (const t of [0.3, 0.7]) {
    const a = Math.cos(t * PI) * (DECK_R - 1.1), d = Math.sin(t * PI) * (DECK_R - 1.1), [x, z] = at(a, d);
    const o = unit(sub([x, z], [cx, cz])), on = (k, y) => [x + o[0] * k, D0 + y, z + o[1] * k]; // k metres toward the view
    B.det.setColor('#2f5f86').cyl(x, D0, z, 0.16, 0.1, 1.05, 8).tube(on(-0.25, 1.12), on(0.3, 1.32), 0.13, 8, true);
    B.det.setColor('#1b1d1f').tube(on(0.3, 1.32), on(0.36, 1.34), 0.1, 8, true);
    S.cyl(x, z, D0, D0 + 1.4, 0.2, 0.2, 'pole');
  }
  for (const [a, d] of [[-DECK_R + 0.6, -DECK_BACK + 0.6], [DECK_R - 0.6, -DECK_BACK + 0.6], [-5.6, 5.2], [5.6, 5.2]]) lamp(...at(a, d), D0);
  keep.push([cx, cz, DECK_R + 2.5]);
  // the view off the platform: trees in front whose crowns would rise over the parapet go; the lower slope keeps its own
  const inView = (x, z) => { const d = (x - cx) * fx + (z - cz) * fz, e = Math.abs((x - cx) * sx + (z - cz) * sz); return d > 0 && d < 40 && e < DECK_R + 2 + d && g(x, z) > D0 - 12; };

  // ---------------------------------------------------------------- rubble wall along the street, steps up at the entrance
  const W = WALL.map(XZ), stepFoot = XZ(STEPS);
  // each wall run with its direction u and the normal n into the park
  const runs = W.slice(1).map((b, k) => {
    const a = W[k], u = unit(sub(b, a)), mid = mix(a, b, 0.5);
    const n = inPoly(P, mid[0] + u[1] * 6, mid[1] - u[0] * 6) ? [u[1], -u[0]] : [-u[1], u[0]];
    return { a, b, u, n };
  });
  // the steps: where the OSM steps meet the wall line
  const hitRun = runs.map((q) => ({ q, f: foot(q.a, q.b, stepFoot) })).reduce((m, o) => (!m || o.f[2] < m.f[2] ? o : m), null);
  const gapAt = hitRun && { x: hitRun.f[0], z: hitRun.f[1], ux: hitRun.q.u[0], uz: hitRun.q.u[1], nx: hitRun.q.n[0], nz: hitRun.q.n[1] };
  let wallM = 0;
  for (const { a, b, n: [nx, nz] } of runs) {
    const L = dist(a, b), n = Math.max(1, Math.round(L / 1.6)), hl = L / n / 2;
    for (let i = 0; i < n; i++) {
      const [x, z] = mix(a, b, (i + 0.5) / n);
      if (gapAt && Math.abs((x - gapAt.x) * gapAt.ux + (z - gapAt.z) * gapAt.uz) < STEP_W / 2 + hl - 0.2 && Math.hypot(x - gapAt.x, z - gapAt.z) < STEP_W) continue;
      const out = g(x - nx * 1.1, z - nz * 1.1), inn = g(x + nx * 1.3, z + nz * 1.3);
      const top = Math.max(inn + 0.3, out + 0.85), base = Math.min(out, inn) - 0.4;
      B.rub.with(frame(x, 0, z, -nx, -nz), (q) => q.box(-hl - 0.01, base, -0.3, hl + 0.01, top, 0.3, 1 | 2 | 16 | 32));
      B.det.setColor('#aeaba4').with(frame(x, 0, z, -nx, -nz), (q) => q.box(-hl - 0.02, top, -0.36, hl + 0.02, top + 0.09, 0.36));
      obox(x, z, nx, nz, hl, 0.34, base, top + 0.09);
      keep.push([x, z, 1.5]); wallM += 2 * hl;
    }
  }
  let risers = 0;
  if (gapAt) {
    const { x, z, ux, uz, nx, nz } = gapAt, d0 = -1.2;
    const yF = g(x + nx * d0, z + nz * d0), yT = Math.max(g(x + nx * 3.6, z + nz * 3.6), yF + 0.45);
    risers = Math.max(3, Math.round((yT - yF) / 0.15));
    const rise = (yT - yF) / risers, run = risers * TREAD, m = frame(x, 0, z, nx, nz), hw = STEP_W / 2;
    B.gran.with(m, (q) => {
      for (let i = 0; i < risers; i++) q.box(-hw, yF - 0.3, d0 + i * TREAD, hw, yF + (i + 1) * rise, d0 + run + 0.02, 1 | 2 | 4 | 32);
      q.box(-hw, Math.min(yT, g(x + nx * 4, z + nz * 4)) - 0.3, d0 + run, hw, yT, d0 + run + 1.4, 1 | 2 | 4 | 16 | 32); // landing
    });
    B.gran.with(m, (q) => { for (const s of [-1, 1]) q.box(s * (hw + 0.4) - 0.4, yF - 0.3, d0 - 0.2, s * (hw + 0.4) + 0.4, Math.max(yT, yF + 0.9) + 0.25, d0 + 0.6); }); // piers
    // ramp-shaped collision: the stair flight as one sloped top the car and the walkers climb
    const s = (yT - yF) / run, o = x * nx + z * nz;
    const q4 = [[-hw, d0], [hw, d0], [hw, d0 + run], [-hw, d0 + run]].map(([a, d]) => [x + ux * a + nx * d, z + uz * a + nz * d]);
    S.prism(q4.flat(), yF - 0.3, yF - s * (o + d0), s * nx, s * nz, 'stairs');
    const l4 = [[-hw, d0 + run], [hw, d0 + run], [hw, d0 + run + 1.4], [-hw, d0 + run + 1.4]].map(([a, d]) => [x + ux * a + nx * d, z + uz * a + nz * d]);
    S.prism(l4.flat(), yT - 0.3, yT, 0, 0, 'ledge');
    for (const sgn of [-1, 1]) { const qx = x + ux * sgn * (hw + 0.4) + nx * (d0 + 0.2), qz = z + uz * sgn * (hw + 0.4) + nz * (d0 + 0.2); obox(qx, qz, nx, nz, 0.4, 0.4, yF - 0.3, Math.max(yT, yF + 0.9) + 0.25); }
    keep.push([x + nx * 1.5, z + nz * 1.5, 5]);
    for (const sgn of [-1, 1]) lamp(x + ux * sgn * (hw + 1.4) + nx * 1.2, z + uz * sgn * (hw + 1.4) + nz * 1.2);
  }

  // ---------------------------------------------------------------- the Pidkova monument
  {
    const [px, pz] = XZ(PIDKOVA), w = nearestWalk([px, pz], 'pedestrian');
    const [fx2, fz2] = w ? unit(sub(w, [px, pz])) : [fx, fz];
    const y0 = Math.max(...[[-2, -2], [2, -2], [2, 2], [-2, 2]].map(([a, b]) => g(px + a, pz + b))) + 0.02;
    const m = frame(px, y0, pz, fx2, fz2), W2 = toW(m);
    B.gran.with(m, (q) => {
      q.box(-2.1, -0.7, -2.1, 2.1, 0.18, 2.1).box(-1.65, 0.18, -1.65, 1.65, 0.36, 1.65);
      q.box(-0.95, 0.36, -0.95, 0.95, 0.72, 0.95).box(-0.74, 0.72, -0.74, 0.74, 3.05, 0.74).box(-0.9, 3.05, -0.9, 0.9, 3.3, 0.9);
    });
    B.det.setColor('#5d4a2d').with(m, (q) => q.box(-0.42, 1.55, 0.74, 0.42, 2.25, 0.78)); // bronze plaque
    // the cannon on its carriage on the upper step, across the front
    B.det.setColor('#3b2a1c').with(m, (q) => { q.box(-0.55, 0.36, 1.13, 0.45, 0.56, 1.37); for (const ax of [-0.35, 0.3]) for (const zz of [1.02, 1.48]) q.tube([ax, 0.56, zz - 0.04], [ax, 0.56, zz + 0.04], 0.2, 10, true); });
    bronze.tube([[-0.85, 0.66, 1.25], [0, 0.64, 1.25], [0.8, 0.62, 1.25]].map(W2), [0.15, 0.12, 0.085], 12);
    bronze.ellipsoid(W2([-0.9, 0.66, 1.25]), [0.13, 0.13, 0.13], 10, 6);
    // the figure: long zhupan, a cloak off the shoulders, the bulava held up in the right hand, the left on the sabre
    const F = toW(frame(px, y0 + 3.3, pz, fx2, fz2, 1.15));
    const ell = (y, rx, rz, dz = 0, n = 16) => Array.from({ length: n }, (_, k) => { const a = -k / n * PI * 2; return F([Math.cos(a) * rx, y, dz + Math.sin(a) * rz]); });
    for (const s of [-1, 1]) { bronze.tube([[s * 0.12, 0.02, 0.02], [s * 0.12, 0.6, 0]].map(F), [0.075, 0.09], 8); bronze.ellipsoid(F([s * 0.12, 0.06, 0.07]), [0.08, 0.065, 0.16].map((v) => v * 1.15), 8, 5); }
    bronze.loft([ell(0.42, 0.31, 0.25, 0.01), ell(0.8, 0.27, 0.21), ell(1.12, 0.22, 0.16), ell(1.26, 0.215, 0.155), ell(1.5, 0.245, 0.17), ell(1.66, 0.27, 0.16), ell(1.75, 0.16, 0.11)], { cap0: true, cap1: true });
    bronze.loft([ell(1.18, 0.235, 0.17), ell(1.24, 0.235, 0.17)], { cap0: false, cap1: false }); // sash
    const cloak = [];
    for (const [y, wd, back] of [[1.72, 0.3, 0.1], [1.45, 0.36, 0.2], [1.0, 0.4, 0.27], [0.5, 0.44, 0.34], [0.25, 0.46, 0.38]]) {
      cloak.push(Array.from({ length: 9 }, (_, k) => { const a = PI * (0.05 + 0.9 * k / 8); return F([Math.cos(a) * wd, y, -Math.sin(a) * back - 0.02]); }));
    }
    bronze.loft(cloak, { closed: false });
    bronze.tube([[0, 1.72, 0], [0, 1.84, 0.01]].map(F), [0.06, 0.055], 8);
    bronze.ellipsoid(F([0, 1.94, 0.02]), [0.105, 0.125, 0.115].map((v) => v * 1.15), 12, 8);
    bronze.loft([ell(1.99, 0.12, 0.125, 0.0, 12), ell(2.06, 0.13, 0.135, 0, 12), ell(2.13, 0.1, 0.105, -0.01, 12)], { cap1: true }); // fur kalpak
    bronze.tube([[0.25, 1.66, 0], [0.36, 1.42, 0.12], [0.3, 1.5, 0.36]].map(F), [0.075, 0.065, 0.055], 8);
    bronze.tube([[0.3, 1.4, 0.39], [0.32, 1.95, 0.46]].map(F), [0.022, 0.02], 6);
    bronze.ellipsoid(F([0.32, 1.99, 0.465]), [0.07, 0.08, 0.07].map((v) => v * 1.15), 10, 6);
    bronze.tube([[-0.25, 1.66, 0], [-0.37, 1.4, -0.02], [-0.25, 1.2, 0.1]].map(F), [0.075, 0.065, 0.055], 8);
    bronze.tube([[-0.27, 1.22, 0.12], [-0.31, 0.9, -0.08], [-0.3, 0.52, -0.3]].map(F), [0.03, 0.03, 0.025], 6);
    obox(px, pz, fx2, fz2, 2.1, 2.1, y0 - 0.7, y0 + 0.36, 'ledge');
    obox(px, pz, fx2, fz2, 0.95, 0.95, y0, y0 + 3.3 + 2.5);
    keep.push([px, pz, 4]);
  }

  // ---------------------------------------------------------------- the Khmelnytsky memorial stone
  {
    const [kx, kz] = XZ(KHMEL), [ex, ez] = gapAt ? unit([gapAt.x - kx, gapAt.z - kz]) : [-fx, -fz];
    const y0 = Math.max(g(kx - 1.4, kz - 1.4), g(kx + 1.4, kz + 1.4), g(kx - 1.4, kz + 1.4), g(kx + 1.4, kz - 1.4)) + 0.02;
    const m = frame(kx, y0, kz, ex, ez), W2 = toW(m);
    B.gran.with(m, (q) => q.box(-1.6, -0.5, -1.2, 1.6, 0.2, 1.2));
    const rings = [];
    for (let j = 0; j <= 6; j++) {
      const t = j / 6, rx = 1.2 * (1 - 0.55 * t * t) + 0.05, rz = 0.72 * (1 - 0.5 * t * t);
      rings.push(Array.from({ length: 14 }, (_, k) => { const a = -k / 14 * PI * 2, n = 1 + (r() - 0.5) * 0.16; return W2([Math.cos(a) * rx * n, 0.15 + t * 1.85 + (r() - 0.5) * 0.08, Math.sin(a) * rz * n]); }));
    }
    boulder.loft(rings, { cap0: true, cap1: true });
    B.det.setColor('#5d4a2d').with(m, (q) => q.box(-0.4, 0.85, 0.62, 0.4, 1.35, 0.68));
    obox(kx, kz, ex, ez, 1.6, 1.2, y0 - 0.5, y0 + 0.2, 'ledge');
    obox(kx, kz, ex, ez, 1.15, 0.7, y0, y0 + 2.0);
    keep.push([kx, kz, 3]);
  }

  // ---------------------------------------------------------------- OSM benches, lamps along the promenade
  for (const b of BENCHES.map(XZ)) {
    if (outside(P, b) > 8) continue;
    const w = onDeck(...b) ? null : nearestWalk(b), face = w && w[2] > 0.3 ? unit(sub(w, b)) : [fx, fz];
    bench(b[0], b[1], ...face, onDeck(...b) ? D0 : undefined);
  }
  // promenade lamps every 22 m, sides alternating, kept off everything already placed
  for (const { a, b, kind, w } of walks) {
    if (kind !== 'pedestrian') continue;
    const L = dist(a, b), t = unit(sub(b, a)), off = w / 2 + 0.8;
    for (let d = 6; d < L - 3; d += 22) {
      const side = lamps & 1 ? off : -off, m = mix(a, b, d / L), q = [m[0] + t[1] * side, m[1] - t[0] * side];
      if (outside(P, q) > 2 || onDeck(...q) || keep.some(([kx, kz, kr]) => dist(q, [kx, kz]) < kr + 0.5)) continue;
      lamp(...q);
    }
  }

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'zamkova' });
  root.add(group);
  const M = {
    rub: new THREE.MeshStandardMaterial({ map: rubbleTex(), roughness: 0.95 }),
    gran: new THREE.MeshStandardMaterial({ map: graniteTex(), roughness: 0.82 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf5f0e2, roughness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0.05 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'zamkova-' + k, castShadow: k !== 'glow', receiveShadow: true }));
  }
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x55462f, metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide });
  group.add(Object.assign(new THREE.Mesh(bronze.build(), bronzeMat), { name: 'zamkova-pidkova', castShadow: true, receiveShadow: true }));
  group.add(Object.assign(new THREE.Mesh(boulder.build(), new THREE.MeshStandardMaterial({ color: 0x8e8b86, roughness: 0.92 })), { name: 'zamkova-stone', castShadow: true, receiveShadow: true }));
  nV += bronze.v + boulder.v;
  console.log(`[cherkasy] Zamkova hora: deck ${DECK_R} m at ${D0.toFixed(1)} m, wall ${wallM.toFixed(0)} m, ${risers} risers, ${lamps} lamps, ${benches} benches, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    clear: (x, z) => keep.some(([kx, kz, kr]) => (x - kx) ** 2 + (z - kz) ** 2 < kr * kr) || inView(x, z),
    update() { const k = nightK.value; M.glow.emissiveIntensity = 0.05 + 2.4 * k; },
  };
}
