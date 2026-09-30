// OWNER: cherkasy. Храм Білого лотосу (the White Lotus Buddhist temple and kung-fu school, built by hand 1988-1990),
// Зарубинецький узвіз, 4 (formerly uzviz Ivana Franka) – a walled compound cut into the north bank of the ravine the lane
// runs down to the Dnipro. Rebuilt after the Wikimedia Commons photos (2014-2021), the photo reports on secretland.info /
// telegraf.com.ua, OSM and a satellite view. TERRAIN + SITE
//   shapeLotus(hf, map, geo) -> { raised, locked }   call before the ground and the buildings are built: the 30 m DEM
//     smooths the ravine into a shallow dish, so the bank behind the compound becomes a real slope (about 1:3 up from
//     just over the terrace level, eased out 16 m further up and to the sides); lattice cells under carriageways stay
//     put, so the lane and the service road keep their levels
//   LOTUS_SKIP: the OSM ids replaced here – the hall (402035058), the west wing (402035060, same address), the gate
//     (1080095439), the hexagonal base of the black stupa (925498821) and the stone pagoda tower (925498820)
//   buildLotus({ root, map, solids, heightAt, geo }) -> { update(dt), clear(x, z), footprints } | null
//     the rubble retaining wall along the lane (red tile coping, grey stupa finials) holding the terrace 1.8-3.6 m over
//     it; the gatehouse (red arched gate, the signboard, a pink canopy, lanterns) and the dragon doors under the hall;
//     the hall in crazy-paving render with red frames and arched windows under a stepped Lao roof (gold bargeboards,
//     chofa horns, ridge spikes), the octagonal corner tower; the west wing: clock tower, the green gallery with red
//     arcades, three towers under flared pagoda roofs with spires; the lower courtyard with the dharma wheel (a sun and
//     eight rays on the grass), the stairs up to the hall and the altar wall with a golden Buddha; the black stupa on its
//     hexagonal chamber with five green prayer wheels up the bank; the white stupa on the lawn behind a chain fence, the
//     stone pagoda tower and the two Buddha niches in the retaining walls across the lane. Lit windows and lanterns at night.
// Everything is laid out in a lane frame: u along the lane (east-north-east, downhill), v up the bank (u, v in metres from
// the hall's OSM centroid); meshes are built in local x = u, z = -v (+z faces the lane) and baked to the map by one matrix.
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { OVERHANG } from '../collision.js';
import { nightK } from '../../render/daylight.js';
import { SG, canvasTex } from './sculpt.js';
import { ringPts, inPoly, rng } from './geo.js';

const HALL = 402035058, WING = 402035060, GATE = 1080095439, HEX = 925498821, PAGODA = 925498820;
export const LOTUS_SKIP = new Set([HALL, WING, GATE, HEX, PAGODA]);

const ANCHOR = [49.456181, 32.052881]; // the hall's centroid
const BEARING = 0.7715;                 // the lane's direction in map x / z (atan2(dz, dx))
export const LOTUS_Y = 18.8;           // the upper terrace: level with the service lane at the west end, 3.6 m over the lane at the hall
const COURT_Y = 17.2;                   // the lower courtyard east of the hall
const PI = Math.PI;
// the terrace edge along the lane (u, v): the OSM centre line + half its 7.8 m + 0.6 m
const FRONT = [[-37, -4.45], [-5, -5.9], [7.7, -5.6], [13.4, -4.8], [17.2, -4.0]];
const frontV = (u) => {
  if (u <= FRONT[0][0]) return FRONT[0][1];
  for (let k = 1; k < FRONT.length; k++) if (u <= FRONT[k][0]) { const [a, p] = FRONT[k - 1], [b, q] = FRONT[k]; return p + (q - p) * (u - a) / (b - a); }
  return FRONT[FRONT.length - 1][1];
};
// the upper terrace (west wing + hall) and the courtyard, following the lane and the service lane up the west side
const TERRACE = [[-36.4, frontV(-36.4)], [-5, -5.9], [8.1, frontV(8.1)], [8.1, 14.5], [-44.5, 14.5], [-43.4, 12], [-40.8, 6.4], [-36.7, -2]];
const COURT = [[8.1, frontV(8.1)], [13.4, -4.8], [17, frontV(17)], [17, 14.5], [8.1, 14.5]];
const STUPA_W = [-49.2, -1.3], STUPA_B = [11.4, 25.9], NICHES = [[-40.1, -17.7], [38.5, -19.1]], TOWER_P = [-43.8, 14.6]; // OSM points / centres

const WALLC = { hall: '#7c4a3b', tower: '#9c6a4d', wing: '#8e5c45', green: '#8b9985' };
const ROOF = '#b34a3c', GOLD = '#d9a733', FRAME = '#b3272b', TRIM = '#e0b43a', WOOD = '#8a3d2c';

// lane frame <-> map
function laneFrame(geo) {
  const [ox, oz] = geo.toXZ(...ANCHOR), c = Math.cos(BEARING), s = Math.sin(BEARING);
  return {
    ox, oz, c, s,
    map: (u, v) => [ox + u * c + v * s, oz + u * s - v * c],
    lane: (x, z) => [(x - ox) * c + (z - oz) * s, (x - ox) * s - (z - oz) * c],
  };
}

// ------------------------------------------------------------------------------------------------ terrain
export function shapeLotus(hf, map, geo) {
  const { meta: { x0, z0, cell, nx, nz }, grid } = hf.data;
  const F = laneFrame(geo), locked = new Set();
  const lock = (x, z) => {
    const i0 = Math.floor((x - x0) / cell), j0 = Math.floor((z - z0) / cell);
    for (let c = 0; c < 4; c++) { const i = i0 + (c & 1), j = j0 + (c >> 1); if (i >= 0 && j >= 0 && i < nx && j < nz) locked.add(j * nx + i); }
  };
  const inBox = (x, z) => { const [u, v] = F.lane(x, z); return u > -90 && u < 70 && v > -40 && v < 80; };
  for (const r of map.roads ?? []) {
    if (r.k !== 'm') continue; // carriageways and service lanes; footways and steps may rise with the bank
    for (let k = 2; k < r.p.length; k += 2) {
      const ax = r.p[k - 2], az = r.p[k - 1], bx = r.p[k], bz = r.p[k + 1];
      if (!inBox(ax, az) && !inBox(bx, bz)) continue;
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2)), h = (r.w ?? 6) / 2 + 1.5, ux = (bx - ax) / (L || 1), uz = (bz - az) / (L || 1);
      for (let i = 0; i <= n; i++) for (let o = -2; o <= 2; o++) lock(ax + (bx - ax) * i / n - uz * h * o / 2, az + (bz - az) * i / n + ux * h * o / 2);
    }
  }
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  let raised = 0;
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * cell;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * cell;
      if (!inBox(x, z)) continue;
      const k = j * nx + i;
      if (locked.has(k)) continue;
      const [u, v] = F.lane(x, z);
      const wu = ease(1 - Math.max(0, -48 - u, u - 22) / 16), wv = v < 12 ? 0 : ease(Math.min((v - 12) / 3, 1 - (v - 42) / 16));
      const target = Math.min(LOTUS_Y + 6, LOTUS_Y + 0.8 + 0.3 * (v - 13)), lift = target - grid[k];
      if (lift > 0 && wu * wv > 0) { grid[k] += lift * wu * wv; raised++; }
    }
  }
  return { raised, locked: locked.size };
}

// ------------------------------------------------------------------------------------------------ textures
// 3 m of "crazy paving" render: irregular slabs outlined by pale joints (tinted per building by the vertex colour)
const crazyTex = () => {
  const t = canvasTex(512, 512, (g, w, h) => {
    const r = rng(404), N = 7, cellW = w / N, P = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const edge = i === 0 || j === 0 || i === N || j === N; // the border points repeat across the seam
      P.push([i * cellW + (edge ? 0 : (r() - 0.5) * cellW * 0.7), j * cellW + (edge ? 0 : (r() - 0.5) * cellW * 0.7)]);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { // periodic jitter on the wrapped rows
      if (i === 0) P[j * (N + 1)][1] = P[j * (N + 1) + N][1] = j * cellW + (j && j < N ? (r() - 0.5) * cellW * 0.5 : 0);
      if (j === 0) P[i][0] = P[N * (N + 1) + i][0] = i * cellW + (i && i < N ? (r() - 0.5) * cellW * 0.5 : 0);
    }
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, w, h);
    for (let q = 0; q < 6000; q++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { // one slab per jittered cell, split on a random diagonal
      const a = P[j * (N + 1) + i], b = P[j * (N + 1) + i + 1], c = P[(j + 1) * (N + 1) + i + 1], d = P[(j + 1) * (N + 1) + i];
      const v = 185 + r() * 40; g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      const tri = (p, q, s) => { g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.lineTo(...s); g.closePath(); g.fill(); g.stroke(); };
      g.strokeStyle = '#f4f1ea'; g.lineWidth = 3.5; g.lineJoin = 'round';
      if (r() < 0.5) { tri(a, b, c); g.fillStyle = `rgb(${(v - 12) | 0},${(v - 12) | 0},${(v - 12) | 0})`; tri(a, c, d); }
      else { tri(a, b, d); g.fillStyle = `rgb(${(v + 10) | 0},${(v + 10) | 0},${(v + 10) | 0})`; tri(b, c, d); }
    }
  });
  t.repeat.set(1 / 3, 1 / 3);
  return t;
};
// 2.4 m of rubble walling: rows of irregular granite and sandstone blocks (6-8 sided, of mixed length) in dark mortar
const rubbleTex = () => {
  const t = canvasTex(512, 512, (g, w, h) => {
    const r = rng(1990), rowH = h / 6;
    g.fillStyle = '#57524b'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 6; j++) {
      let x = r() * 30;
      const x0 = x;
      while (x < x0 + w) {
        const sw = Math.min(x0 + w - x, 45 + r() * 80), cy = (j + 0.5) * rowH + (r() - 0.5) * 6, hh = rowH / 2 + 1 - r() * 4, cx = x + sw / 2, k = r();
        const v = k < 0.6 ? 125 + r() * 50 : 140 + r() * 40, tint = k < 0.6 ? [1, 0.98, 0.95] : [1.06, 0.95, 0.8];
        const n = 7 + ((r() * 4) | 0), pts = [];
        for (let q = 0; q < n; q++) { const a = (q / n) * PI * 2 + r() * 0.3; pts.push([Math.cos(a) * (sw / 2 + 1) * (0.93 + r() * 0.12), Math.sin(a) * hh * (0.92 + r() * 0.12)]); }
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          if (Math.abs(cx + ox - w / 2) > w / 2 + sw || Math.abs(cy + oy - h / 2) > h / 2 + rowH) continue;
          g.beginPath(); pts.forEach(([px, py], q) => (q ? g.lineTo(cx + ox + px, cy + oy + py) : g.moveTo(cx + ox + px, cy + oy + py))); g.closePath();
          const gr = g.createLinearGradient(0, cy + oy - hh, 0, cy + oy + hh);
          gr.addColorStop(0, `rgb(${tint.map((m) => Math.min(255, v * m + 22) | 0).join(',')})`); gr.addColorStop(1, `rgb(${tint.map((m) => (v * m - 25) | 0).join(',')})`);
          g.fillStyle = gr; g.fill();
        }
        x += sw;
      }
    }
    for (let q = 0; q < 7000; q++) { g.fillStyle = `rgba(${r() < 0.5 ? '20,18,16' : '240,236,228'},${0.05 + r() * 0.09})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  });
  t.repeat.set(1 / 2.4, 1 / 2.4);
  return t;
};
// standing-seam roof sheet: a seam every 0.5 m along the slope
const seamTex = () => {
  const t = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 4, h); g.fillStyle = '#f6f6f6'; g.fillRect(4, 0, 3, h);
  });
  t.repeat.set(2, 1);
  return t;
};
// the gate's signboard: two sky-blue panels with red lettering either side of a gold wheel on a yellow frame
const signTex = () => canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#e0b43a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b3272b'; g.fillRect(8, 8, w - 16, h - 16);
  for (const x0 of [22, w / 2 + 70]) {
    g.fillStyle = '#41b7dd'; g.fillRect(x0, 22, w / 2 - 92, h - 44);
    g.fillStyle = '#b3272b'; g.font = 'bold 44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(x0 < w / 2 ? '白蓮' : '寺院', x0 + (w / 2 - 92) / 2, h / 2 + 2);
  }
  const cx = w / 2, cy = h / 2;
  g.fillStyle = '#e0b43a'; g.beginPath(); g.arc(cx, cy, 52, 0, PI * 2); g.fill();
  g.fillStyle = '#b3272b'; g.beginPath(); g.arc(cx, cy, 42, 0, PI * 2); g.fill();
  g.strokeStyle = '#f2d36b'; g.lineWidth = 5;
  g.beginPath(); g.arc(cx, cy, 30, 0, PI * 2); g.stroke();
  for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(k * PI / 4) * 30, cy + Math.sin(k * PI / 4) * 30); g.stroke(); }
}, { repeat: false });
// the dragon doors under the hall: plank doors with two blue-and-gold dragons; the red kung-fu school door beside them
const doorTex = () => canvasTex(512, 256, (g, w, h) => {
  const r = rng(8);
  const plank = (x0, x1) => { for (let x = x0; x < x1; x += 22) { const v = 120 + r() * 30; g.fillStyle = `rgb(${v + 40 | 0},${v * 0.55 | 0},${v * 0.3 | 0})`; g.fillRect(x, 0, 21, h); } };
  plank(0, 400);
  g.fillStyle = 'rgba(60,25,10,0.8)'; g.fillRect(0, 118, 400, 10); g.fillRect(196, 0, 8, h);
  const dragon = (cx, dir) => {
    g.lineCap = 'round';
    for (const [col, lw] of [['#e8b640', 22], ['#3b6fd1', 15], ['#8ec3f0', 5]]) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(cx - 60 * dir, 95);
      g.bezierCurveTo(cx - 20 * dir, 20, cx + 10 * dir, 110, cx + 45 * dir, 45); g.stroke();
    }
    g.fillStyle = '#3b6fd1'; g.beginPath(); g.ellipse(cx + 55 * dir, 40, 22, 14, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#e8b640'; g.beginPath(); g.ellipse(cx + 70 * dir, 34, 12, 6, 0, 0, PI * 2); g.fill();
  };
  dragon(95, 1); dragon(305, -1);
  g.fillStyle = '#b3272b'; g.fillRect(400, 0, 112, h); // the red door: blue centre band, gold rim, the school emblem
  g.fillStyle = '#2d5bc4'; g.fillRect(430, 10, 52, h - 20);
  g.strokeStyle = '#e0b43a'; g.lineWidth = 4; g.strokeRect(406, 6, 100, h - 12);
  g.fillStyle = '#e0b43a'; g.beginPath(); g.arc(456, 110, 22, 0, PI * 2); g.fill();
  g.fillStyle = '#b3272b'; g.font = 'bold 26px serif'; g.textAlign = 'center';
  g.fillText('少林', 456, 50); g.fillText('拳', 456, 180); g.fillText('精華', 456, 225);
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ site
export function buildLotus({ root, map, solids: S, heightAt, geo }) {
  if (!geo) return null;
  const t0 = performance.now(), s0 = S.count ?? 0;
  const F = laneFrame(geo), XF = M4(F.ox, 0, F.oz, -BEARING);
  const W = (x, z) => F.map(x, -z);                    // local x / z -> map
  const g = (x, z) => { const h = heightAt(...W(x, z)); return Number.isFinite(h) ? h : LOTUS_Y - 3; };
  const loc = (P) => P.map(([u, v]) => [u, -v]);        // lane (u, v) -> local (x, z)
  const r = rng(1988);
  const B = { wall: new MB(), rub: new MB(), roof: new MB(), det: new MB(), gold: new MB(), glass: new MB(), lit: new MB(), glow: new MB(), sign: new MB(), door: new MB() };
  for (const b of Object.values(B)) b.setXf(XF);
  const idol = new SG(); // the golden statues (smooth)
  const keep = [];       // [x, z, r] local: generated trees stay out

  // collision in local coordinates
  const cbox = (x0, x1, z0, z1, y0, y1, kind = 'wall', flags = 0) => S.obox(...W((x0 + x1) / 2, (z0 + z1) / 2), Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, BEARING, y0, y1, kind, flags);
  const cprism = (P, y0, y1, kind = 'wall') => S.prism(P.map(([x, z]) => W(x, z)).flat(), y0, y1, 0, 0, kind);
  const ccyl = (x, z, y0, y1, r0, r1 = r0, kind = 'pole') => S.cyl(...W(x, z), y0, y1, r0, r1, kind);

  // ---------------------------------------------------------------- wall faces with real openings
  // face frame: starts at a = [x, z] (local), runs along t (unit), outward n = (-tz, tx); openings:
  //   { s0, s1, h0, h1, arch?, kind: 'win' | 'niche' | 'door' | 'dark', col? } (s along the face, h absolute y)
  const REV = 0.22;
  const face = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L; return { ax, az, tx, tz, nx: -tz, nz: tx, L }; };
  const at = (f, s, y, d) => [f.ax + f.tx * s + f.nx * d, y, f.az + f.tz * s + f.nz * d];
  const nrm = (f, a, b) => [f.tx * a + f.nx * b, 0, f.tz * a + f.nz * b];       // (a along t, b along n)
  const wq = (mb, f, pts, d, uo) => { // a polygon in the face plane at depth d, uv in metres (s + uo, y), fanned from pts[0]
    const ids = pts.map(([s, y]) => { const p = at(f, s, y, d); return mb.vert(p[0], p[1], p[2], f.nx, 0, f.nz, s + uo, y); });
    for (let k = 2; k < ids.length; k++) mb.tri(ids[0], ids[k - 1], ids[k]);
  };
  const arc = (sm, yS, rr, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * k / n; return [sm + Math.cos(a) * rr, yS + Math.sin(a) * rr]; });
  let nWin = 0, nLit = 0;
  function facade(mb, f, y0, y1, holes, uo = 0) {
    const xs = [...new Set([0, f.L, ...holes.flatMap((o) => [o.s0, o.s1])].map((v) => Math.min(f.L, Math.max(0, v))))].sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++) {
      const sa = xs[k - 1], sb = xs[k];
      if (sb - sa < 1e-3) continue;
      const cut = holes.filter((o) => o.s0 <= sa + 1e-4 && o.s1 >= sb - 1e-4).map((o) => [o.h0, o.h1]).sort((p, q) => p[0] - q[0]);
      let y = y0;
      for (const [h0, h1] of cut) { if (h0 > y + 1e-3) wq(mb, f, [[sa, y], [sb, y], [sb, h0], [sa, h0]], 0, uo); y = Math.max(y, h1); }
      if (y1 > y + 1e-3) wq(mb, f, [[sa, y], [sb, y], [sb, y1], [sa, y1]], 0, uo);
    }
    for (const o of holes) {
      const { s0, s1, h0, h1 } = o, sm = (s0 + s1) / 2, rr = (s1 - s0) / 2, yS = o.arch ? h1 - rr : h1, deep = o.kind === 'niche' ? 0.45 : o.kind === 'door' ? 0.12 : REV;
      if (o.arch) { // the spandrels close the box over the arch
        wq(mb, f, [[s0, h1], [s0, yS], ...arc(sm, yS, rr, PI, PI / 2).slice(1, -1), [sm, h1]], 0, uo);
        wq(mb, f, [[s1, h1], [sm, h1], ...arc(sm, yS, rr, PI / 2, 0).slice(1, -1), [s1, yS]], 0, uo);
      }
      // reveals (jambs, sill, head or the arch soffit)
      const rv = o.kind === 'niche' ? mb : B.det;
      if (rv === B.det) B.det.setColor(o.kind === 'win' ? FRAME : '#5a4a40');
      rv.face([at(f, s0, h0, 0), at(f, s0, h0, -deep), at(f, s0, yS, -deep), at(f, s0, yS, 0)], nrm(f, 1, 0));
      rv.face([at(f, s1, yS, 0), at(f, s1, yS, -deep), at(f, s1, h0, -deep), at(f, s1, h0, 0)], nrm(f, -1, 0));
      rv.face([at(f, s0, h0, 0), at(f, s1, h0, 0), at(f, s1, h0, -deep), at(f, s0, h0, -deep)], [0, 1, 0]);
      if (!o.arch) rv.face([at(f, s0, h1, -deep), at(f, s1, h1, -deep), at(f, s1, h1, 0), at(f, s0, h1, 0)], [0, -1, 0]);
      else {
        const A = arc(sm, yS, rr, 0, PI);
        for (let k = 1; k < A.length; k++) {
          const [p, q] = [A[k - 1], A[k]], m = (k - 0.5) / (A.length - 1) * PI;
          const nn = nrm(f, -Math.cos(m), 0); nn[1] = -Math.sin(m);
          rv.face([at(f, p[0], p[1], 0), at(f, q[0], q[1], 0), at(f, q[0], q[1], -deep), at(f, p[0], p[1], -deep)], nn);
        }
      }
      // what fills the opening
      const back = (mb2, d) => { const pts = o.arch ? [[s0, h0], [s1, h0], ...arc(sm, yS, rr, 0, PI).slice(0, -1), [s0, yS]] : [[s0, h0], [s1, h0], [s1, h1], [s0, h1]]; wq(mb2, f, pts, d, uo); };
      if (o.kind === 'win') {
        const lit = r() < 0.45; nWin++; if (lit) nLit++;
        back(lit ? B.lit : B.glass, -deep);
        B.det.setColor(FRAME); // cross mullion, then the yellow trim round the reveal
        const d = -deep + 0.04, top = o.arch ? yS + rr * 0.8 : h1, mid = h0 + (yS - h0) * 0.62;
        B.det.face([at(f, sm - 0.035, h0, d), at(f, sm + 0.035, h0, d), at(f, sm + 0.035, top, d), at(f, sm - 0.035, top, d)], nrm(f, 0, 1));
        B.det.face([at(f, s0, mid - 0.035, d), at(f, s1, mid - 0.035, d), at(f, s1, mid + 0.035, d), at(f, s0, mid + 0.035, d)], nrm(f, 0, 1));
        B.det.setColor(TRIM);
        for (const [a, b, c, e] of [[s0 - 0.1, s0, h0 - 0.1, yS], [s1, s1 + 0.1, h0 - 0.1, yS], [s0 - 0.1, s1 + 0.1, h0 - 0.12, h0]]) B.det.face([at(f, a, c, 0.02), at(f, b, c, 0.02), at(f, b, e, 0.02), at(f, a, e, 0.02)], nrm(f, 0, 1));
        if (!o.arch) B.det.face([at(f, s0 - 0.1, h1, 0.02), at(f, s1 + 0.1, h1, 0.02), at(f, s1 + 0.1, h1 + 0.1, 0.02), at(f, s0 - 0.1, h1 + 0.1, 0.02)], nrm(f, 0, 1));
      } else if (o.kind === 'niche') back(mb, -deep);
      else if (o.kind === 'door' && o.tex) { // a textured door leaf: uv from the atlas rectangle o.tex = [u0, u1]
        const pts = [[s0, h0], [s1, h0], [s1, h1], [s0, h1]], [ua, ub] = o.tex;
        const ids = pts.map(([s, y], k) => { const p = at(f, s, y, -deep); return B.door.vert(p[0], p[1], p[2], f.nx, 0, f.nz, k === 0 || k === 3 ? ua : ub, k < 2 ? 0 : 1); });
        B.door.quad(ids[0], ids[1], ids[2], ids[3]);
      } else { B.det.setColor(o.col ?? '#2a2320'); back(B.det, -deep); }
    }
  }
  // window rows over a face: [{ y, h, w, arch?, group? (windows per group) }], bay rhythm, kept clear of the corners
  function rows(f, spec, bay = 2.7, edge = 0.9) {
    const out = [];
    for (const row of spec) {
      const n = Math.max(1, Math.floor((f.L - 2 * edge) / bay + 0.3));
      if (f.L < row.w + 2 * 0.4) continue;
      const step = (f.L - 2 * edge) / n;
      for (let i = 0; i < n; i++) {
        const c = edge + step * (i + 0.5), gN = row.group ?? 1, gw = row.w * gN + 0.18 * (gN - 1);
        for (let q = 0; q < gN; q++) { const s0 = c - gw / 2 + q * (row.w + 0.18); out.push({ s0, s1: s0 + row.w, h0: row.y, h1: row.y + row.h, arch: row.arch, kind: 'win' }); }
      }
    }
    return out;
  }
  // a rectangular block in the lane frame: 4 faces (front = toward the lane), openings from spec(face index, f)
  let uoff = 0;
  function block(u0, u1, v0, v1, y0, y1, col, spec) {
    const x0 = u0, x1 = u1, z0 = -v1, z1 = -v0;
    const faces = [face(x0, z1, x1, z1), face(x1, z1, x1, z0), face(x1, z0, x0, z0), face(x0, z0, x0, z1)]; // front, east, back, west
    B.wall.setColor(col);
    faces.forEach((f, k) => { facade(B.wall, f, y0, y1, spec?.(k, f) ?? [], uoff); uoff += f.L; });
    cbox(x0, x1, z0, z1, y0 - 0.5, y1);
    return { x0, x1, z0, z1, y1 };
  }

  // ---------------------------------------------------------------- roofs
  const upFace = (mb, pts) => { // roof plane, normal forced upward
    const [a, b, c] = pts, e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], q = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e[1] * q[2] - e[2] * q[1], e[2] * q[0] - e[0] * q[2], e[0] * q[1] - e[1] * q[0]];
    const l = Math.hypot(...n) || 1; n = n.map((v) => v / l); if (n[1] < 0) n = n.map((v) => -v);
    mb.face(pts, n);
  };
  // the band between an outer rectangle at yo and an inner one at yi (inner may shrink to a ridge line or a point)
  function band(mb, [X0, X1, Z0, Z1], [x0, x1, z0, z1], yo, yi) {
    upFace(mb, [[X0, yo, Z1], [X1, yo, Z1], [x1, yi, z1], [x0, yi, z1]]);
    upFace(mb, [[X1, yo, Z1], [X1, yo, Z0], [x1, yi, z0], [x1, yi, z1]]);
    upFace(mb, [[X1, yo, Z0], [X0, yo, Z0], [x0, yi, z0], [x1, yi, z0]]);
    upFace(mb, [[X0, yo, Z0], [X0, yo, Z1], [x0, yi, z1], [x0, yi, z0]]);
  }
  const soffit = ([X0, X1, Z0, Z1], [x0, x1, z0, z1], y) => { // the painted underside of the eaves + the gold fascia
    B.det.setColor(WOOD);
    for (const P of [[[X0, Z1], [X1, Z1], [x1, z1], [x0, z1]], [[X1, Z1], [X1, Z0], [x1, z0], [x1, z1]], [[X1, Z0], [X0, Z0], [x0, z0], [x1, z0]], [[X0, Z0], [X0, Z1], [x0, z1], [x0, z0]]]) B.det.face(P.map(([x, z]) => [x, y, z]), [0, -1, 0]);
    B.det.setColor(TRIM);
    B.det.box(X0, y - 0.2, Z1 - 0.06, X1, y + 0.02, Z1).box(X0, y - 0.2, Z0, X1, y + 0.02, Z0 + 0.06).box(X0, y - 0.2, Z0, X0 + 0.06, y + 0.02, Z1).box(X1 - 0.06, y - 0.2, Z0, X1, y + 0.02, Z1);
  };
  // hip roof over a block: eaves grown by oh at yE, ridge along the longer side
  function hip(b, oh, pitch, yE = b.y1) {
    const R = [b.x0 - oh, b.x1 + oh, b.z0 - oh, b.z1 + oh], w = R[1] - R[0], d = R[3] - R[2], h = Math.min(w, d) / 2, top = yE + h * Math.tan(pitch);
    const I = w >= d ? [R[0] + h, R[1] - h, (R[2] + R[3]) / 2, (R[2] + R[3]) / 2] : [(R[0] + R[1]) / 2, (R[0] + R[1]) / 2, R[2] + h, R[3] - h];
    B.roof.setColor(ROOF); band(B.roof, R, I, yE, top);
    soffit(R, [b.x0, b.x1, b.z0, b.z1], yE);
    cbox(b.x0, b.x1, b.z0, b.z1, yE, yE + (top - yE) * 0.5, 'roof');
    return top;
  }
  const spire = (x, z, y, L) => { // steel spire with gold rings and a drop finial
    B.det.setColor('#8b8f94').cyl(x, y - 0.1, z, 0.11, 0.05, L, 8);
    for (const k of [0.25, 0.45, 0.62]) B.gold.cyl(x, y + L * k, z, 0.16 - k * 0.12, 0.05, 0.12, 8);
    B.gold.ellipsoid([x, y + L + 0.12, z], [0.09, 0.2, 0.09], 8, 5);
    ccyl(x, z, y, y + L, 0.12);
  };
  // the flared tower roofs: a shallow skirt round the eaves, a steep hip above, a spire and gold corner hooks
  function pagoda(b, oh = 1.1, spireL = 2.6) {
    const R = [b.x0 - oh, b.x1 + oh, b.z0 - oh, b.z1 + oh], I = [b.x0 - 0.2, b.x1 + 0.2, b.z0 - 0.2, b.z1 + 0.2], yK = b.y1 + (oh - 0.2) * 0.42;
    B.roof.setColor(ROOF); band(B.roof, R, I, b.y1, yK);
    const w = I[1] - I[0], d = I[3] - I[2], h = Math.min(w, d) / 2, top = yK + h * 1.7;
    const J = w >= d ? [I[0] + h, I[1] - h, (I[2] + I[3]) / 2, (I[2] + I[3]) / 2] : [(I[0] + I[1]) / 2, (I[0] + I[1]) / 2, I[2] + h, I[3] - h];
    band(B.roof, I, J, yK, top);
    soffit(R, [b.x0, b.x1, b.z0, b.z1], b.y1);
    for (const [x, z, sx, sz] of [[R[0], R[2], -1, -1], [R[1], R[2], 1, -1], [R[1], R[3], 1, 1], [R[0], R[3], -1, 1]]) {
      B.gold.tube([x, b.y1, z], [x + sx * 0.25, b.y1 + 0.3, z + sz * 0.25], 0.05, 5, true);
    }
    spire((J[0] + J[1]) / 2, (J[2] + J[3]) / 2, top - 0.05, spireL);
    cbox(b.x0, b.x1, b.z0, b.z1, b.y1, top - (top - yK) * 0.4, 'roof');
    return top;
  }
  // a Lao gable section, ridge along x over [xa, xb]; eaves at zLo / zHi and yE, ridge yR at zm; gable panels at gx
  function gable(xa, xb, zLo, zHi, yE, yR, gables, wallTop, zw0, zw1) {
    const zm = (zLo + zHi) / 2;
    B.roof.setColor(ROOF);
    upFace(B.roof, [[xa, yE, zHi], [xb, yE, zHi], [xb, yR, zm], [xa, yR, zm]]);
    upFace(B.roof, [[xb, yE, zLo], [xa, yE, zLo], [xa, yR, zm], [xb, yR, zm]]);
    B.det.setColor(WOOD); // underside
    B.det.face([[xa, yE - 0.02, zHi], [xb, yE - 0.02, zHi], [xb, yR - 0.3, zm], [xa, yR - 0.3, zm]], [0, -1, 0]);
    B.det.face([[xb, yE - 0.02, zLo], [xa, yE - 0.02, zLo], [xa, yR - 0.3, zm], [xb, yR - 0.3, zm]], [0, -1, 0]);
    B.gold.tube([xa, yR + 0.04, zm], [xb, yR + 0.04, zm], 0.09, 6);
    for (const x of [xa, xb]) for (const z of [zLo, zHi]) B.gold.tube([x, yE, z], [x, yR, zm], 0.08, 5); // gold rakes
    B.gold.tube([xa, yE, zHi], [xb, yE, zHi], 0.06, 4).tube([xa, yE, zLo], [xb, yE, zLo], 0.06, 4);
    const slope = (yR - yE) / (zm - zLo), yW = (z) => yE + (Math.min(z - zLo, zHi - z)) * slope;
    for (const [gx, out] of gables) {
      // the gable panel under the rakes, dark red with a gold sunburst of battens
      B.wall.setColor('#6d2f28');
      const y0 = Math.min(wallTop, yW(zw0));
      const tri = [[gx, y0, zw0], [gx, y0, zw1], [gx, yW(zw1) - 0.05, zw1], [gx, yR - 0.15, zm], [gx, yW(zw0) - 0.05, zw0]];
      B.wall.face(tri, [out, 0, 0]);
      for (let k = 1; k < 6; k++) { const z = zw0 + (zw1 - zw0) * k / 6; B.gold.tube([gx + out * 0.03, y0 + 0.2, (z + zm) / 2], [gx + out * 0.03, yW(z) - 0.25, z], 0.03, 4); }
      // chofa: the horn curling up and out of the apex; hooks at the eaves ends
      const ex = (xa + xb) / 2 < gx ? xb : xa;
      B.gold.tube([ex, yR, zm], [ex + out * 0.25, yR + 0.55, zm], 0.09, 6, true).tube([ex + out * 0.25, yR + 0.55, zm], [ex + out * 0.55, yR + 1.05, zm], 0.07, 6, true)
        .tube([ex + out * 0.55, yR + 1.05, zm], [ex + out * 0.38, yR + 1.35, zm], 0.05, 6, true);
      for (const z of [zLo, zHi]) B.gold.tube([ex, yE, z], [ex + out * 0.2, yE + 0.45, z], 0.06, 5, true);
    }
  }

  // ---------------------------------------------------------------- terraces and the retaining wall
  const T = loc(TERRACE), C = loc(COURT);
  const edgeMin = (P) => { let m = Infinity; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; for (let q = 0; q <= 8; q++) m = Math.min(m, g(a[0] + (b[0] - a[0]) * q / 8, a[1] + (b[1] - a[1]) * q / 8)); } return m; };
  const yb = Math.min(edgeMin(T), edgeMin(C)) - 0.8;
  B.rub.setColor('#b9b3a8').extrude(T, [], yb, LOTUS_Y, { top: false }).extrude(C, [], yb, COURT_Y, { top: false });
  B.det.setColor('#8f8a82').fill(T, [], LOTUS_Y, true);   // concrete flags on the terrace
  B.det.setColor('#5b7a3a').fill(C, [], COURT_Y, true);   // the courtyard lawn
  cprism(T, yb, LOTUS_Y, 'ledge'); cprism(C, yb, COURT_Y, 'ledge');
  const laneY = (u) => g(u, -frontV(u) + 1.2);             // the lane just in front of the wall

  // parapets with red tile coping and small grey stupa finials, in 2 m pieces along the terrace edge
  let finials = 0;
  const finial = (x, z, y) => {
    B.det.setColor('#8d8f8c').box(x - 0.2, y, z - 0.2, x + 0.2, y + 0.25, z + 0.2).cyl(x, y + 0.25, z, 0.15, 0.12, 0.2, 8);
    B.det.lathe([[0.16, y + 0.45], [0.18, y + 0.62], [0.12, y + 0.8], [0.03, y + 1.25]], 8, x, z);
    finials++;
  };
  function parapet(ua, ub, y, h = 0.85, back = 0.45, every = 6) {
    const n = Math.max(1, Math.round((ub - ua) / 2));
    for (let i = 0; i < n; i++) {
      const u0 = ua + (ub - ua) * i / n, u1 = ua + (ub - ua) * (i + 1) / n, z0 = -frontV(u0), z1 = -frontV(u1);
      const L = Math.hypot(u1 - u0, z1 - z0), yaw = Math.atan2(-(z1 - z0), u1 - u0), m = M4((u0 + u1) / 2, 0, (z0 + z1) / 2, yaw);
      B.rub.with(m, (q) => q.box(-L / 2 - 0.01, y - 0.05, -back, L / 2 + 0.01, y + h, 0, 1 | 2 | 16 | 32));
      B.det.setColor('#c0603a').with(m, (q) => q.box(-L / 2 - 0.02, y + h, -back - 0.08, L / 2 + 0.02, y + h + 0.12, 0.08));
      const [cx, cz] = W((u0 + u1) / 2 - Math.sin(yaw) * back / 2, (z0 + z1) / 2 - Math.cos(yaw) * back / 2);
      S.obox(cx, cz, L / 2, back / 2 + 0.04, BEARING - yaw, y - 0.05, y + h + 0.12);
    }
    for (let u = ua + 0.3; u <= ub - 0.2; u += (ub - ua - 0.5) / Math.max(1, Math.round((ub - ua) / every))) finial(u, -frontV(u) - 0.22, y + h + 0.12);
  }
  parapet(-36.4, -33.6, LOTUS_Y); parapet(-28.6, -20.2, LOTUS_Y); parapet(-14.8, -7.9, LOTUS_Y); parapet(9.5, 16.9, COURT_Y);
  // the courtyard's east wall toward the neighbours, and a coping along the west edge over the service lane
  B.rub.box(16.55, COURT_Y - 0.05, -14.5, 17, COURT_Y + 1.1, -frontV(17), 1 | 2 | 4 | 16 | 32); cbox(16.55, 17, -14.5, -frontV(17), COURT_Y - 0.05, COURT_Y + 1.1);

  // ---------------------------------------------------------------- the west wing (clock tower, gallery, towers)
  const FH = 3.3, Y = LOTUS_Y;
  const std = (y, arch = false, h = 1.5) => ({ y, h, w: 1.05, arch });
  const wins = (list) => (k, f) => rows(f, list);
  const W1rows = [std(Y + 0.9), std(Y + FH + 0.8, true, 1.8), std(Y + 2 * FH + 0.8, true, 1.8), std(Y + 3 * FH + 0.8)];
  const W1 = block(-40.6, -35.1, 6.0, 11.4, Y, Y + 4 * FH, WALLC.tower, (k, f) => rows(f, k === 0 || k === 3 ? W1rows.slice(0, 3) : W1rows, 3));
  pagoda(W1, 1.1, 3.2);
  for (const [cx, cz, nx, nz] of [[(W1.x0 + W1.x1) / 2, W1.z1, 0, 1], [W1.x0, (W1.z0 + W1.z1) / 2, -1, 0]]) { // the clock faces, top floor
    const y = Y + 3 * FH + 1.65, p = (d, up = 0, side = 0) => [cx + nx * d + nz * side, y + up, cz + nz * d - nx * side];
    B.det.setColor('#f1ede2').tube(p(0), p(0.07), 0.62, 20, true);
    B.det.setColor(TRIM).tube(p(0), p(0.05), 0.7, 20, true);
    B.det.setColor('#222').tube(p(0.08), p(0.08, 0.42), 0.025, 4, true).tube(p(0.08), p(0.08, 0, 0.3), 0.025, 4, true);
  }
  const W2 = block(-38.4, -29.2, 1.7, 8.2, Y, Y + 2 * FH, WALLC.green, (k, f) => rows(f, [std(Y + 0.9), std(Y + FH + 0.9)]));
  // the two-storey red arcade in front of the gallery (south and west): piers, round arches, a balustrade upstairs
  const bar = (ax, az, bx, bz, y0, y1, hw) => B.det.box(Math.min(ax, bx) - hw, y0, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, y1, Math.max(az, bz) + hw);
  for (const [ax, az, bx, bz] of [[W2.x0 - 1.5, W2.z1 + 1.5, W2.x1, W2.z1 + 1.5], [W2.x0 - 1.5, W2.z0, W2.x0 - 1.5, W2.z1 + 1.5]]) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 2.4)), tx = (bx - ax) / L, tz = (bz - az) / L;
    for (let fl = 0; fl < 2; fl++) {
      const y0 = Y + fl * FH, y1 = y0 + FH;
      B.det.setColor(FRAME);
      for (let i = 0; i <= n; i++) { const x = ax + tx * L * i / n, z = az + tz * L * i / n; bar(x, z, x, z, y0, y1, 0.16); if (!fl) ccyl(x, z, Y, Y + 2 * FH, 0.2); }
      for (let i = 0; i < n; i++) { // an arch as a chain of short tubes under the beam
        const sa = L * i / n, sb = L * (i + 1) / n, rr = (sb - sa) / 2 - 0.16, pts = [];
        for (let q = 0; q <= 8; q++) { const a = PI - PI * q / 8, t = (sa + sb) / 2 + Math.cos(a) * rr; pts.push([ax + tx * t, y1 - 0.45 - rr * 0.6 + Math.sin(a) * rr * 0.6, az + tz * t]); }
        for (let q = 1; q < pts.length; q++) B.det.tube(pts[q - 1], pts[q], 0.09, 5);
      }
      bar(ax, az, bx, bz, y1 - 0.4, y1, 0.2);
      if (fl) B.det.setColor('#caa25a').box(Math.min(ax, bx) - 0.06, y0 + 0.85, Math.min(az, bz) - 0.06, Math.max(ax, bx) + 0.06, y0 + 0.95, Math.max(az, bz) + 0.06);
    }
  }
  B.det.setColor('#6d5a4c').box(W2.x0 - 1.7, Y + FH - 0.12, W2.z1, W2.x1, Y + FH + 0.05, W2.z1 + 1.7).box(W2.x0 - 1.7, Y + FH - 0.12, W2.z0, W2.x0, Y + FH + 0.05, W2.z1); // gallery floor
  { const R = [W2.x0 - 2.2, W2.x1 + 0.7, W2.z0 - 0.7, W2.z1 + 2.2], y1 = Y + 2 * FH; B.roof.setColor(ROOF); band(B.roof, R, [W2.x0 + 1, W2.x1 - 1, W2.z0 + 1, W2.z1 - 1], y1, y1 + 2.4); soffit(R, [W2.x0 - 1.5, W2.x1, W2.z0, W2.z1 + 1.5], y1); }
  cbox(W2.x0 - 1.7, W2.x1, W2.z0, W2.z1 + 1.7, Y, Y + 2 * FH + 1.2);

  const towerRows = (n) => (k, f) => rows(f, Array.from({ length: n }, (_, i) => std(Y + i * FH + 0.8, i > 0 && i < n - 1, i > 0 && i < n - 1 ? 1.9 : 1.4)), 2.6, 0.8);
  const W3 = block(-33.4, -28.8, frontV(-33.4) + 0.05, 1.6, Y, Y + 3 * FH, WALLC.tower, towerRows(3));
  pagoda(W3, 1.0, 2.4);
  const W4 = block(-28.3, -22.3, -1.9, 5.2, Y, Y + 5 * FH, WALLC.tower, towerRows(5));
  pagoda(W4, 1.2, 3.4);
  const W5 = block(-28.0, -7.6, 8.2, 13.4, Y, Y + 3 * FH, WALLC.wing, wins([std(Y + 0.9), std(Y + FH + 0.8, true, 1.9), std(Y + 2 * FH + 0.8)]));
  hip(W5, 1.0, 0.55);
  const W6 = block(-22.3, -7.5, -0.2, 8.2, Y, Y + 2 * FH, WALLC.wing, wins([std(Y + 0.9, true, 1.8), std(Y + FH + 0.8, true, 1.8)]));
  hip(W6, 1.0, 0.5);
  const W7 = block(-12.4, -8.4, -0.5, 3.6, Y, Y + 3 * FH + 0.6, WALLC.tower, towerRows(3));
  pagoda(W7, 0.9, 2.2);

  // ---------------------------------------------------------------- the gatehouse on the lane
  {
    const u0 = -19.9, u1 = -15.1, um = (u0 + u1) / 2, vf = frontV(um) - 0.25, zf = -vf, gl = laneY(um), top = Y + 1.8;
    const fr = face(u0, zf, u1, zf);
    B.rub.setColor('#b9b3a8');
    facade(B.rub, fr, gl - 0.6, top, [{ s0: 0.9, s1: 3.9, h0: gl, h1: gl + 3.15, arch: true, kind: 'door', col: '#a8423c' }], 0);
    B.rub.box(u0, gl - 0.6, 0.2, u0 + 0.02, top, zf, 2).box(u1 - 0.02, gl - 0.6, 0.2, u1, top, zf, 1);
    cbox(u0, u1, 0.2, zf, gl - 0.6, top);
    // the gate leaves in the arch: planks with iron studs, a wicket in the right leaf
    const dz = zf - 0.12, gm = u0 + 2.4; // the leaves' meeting stile, the wicket in the right leaf, rows of iron studs
    B.det.setColor('#6b2a24').box(gm - 0.03, gl, dz, gm + 0.03, gl + 3.1, dz + 0.03).box(gm + 0.35, gl + 0.1, dz, gm + 1.05, gl + 1.95, dz + 0.02);
    B.det.setColor('#2a2522');
    for (const y of [gl + 0.5, gl + 1.3, gl + 2.1]) for (let x = u0 + 1.15; x < u0 + 3.7; x += 0.3) B.det.box(x - 0.025, y - 0.025, dz, x + 0.025, y + 0.025, dz + 0.04);
    // signboard, canopy with the gold fascia, two lanterns
    const sy = gl + 3.35, sx0 = u0 + 0.3, sx1 = u1 - 0.3;
    const ids = [[sx0, sy, 0, 0], [sx1, sy, 1, 0], [sx1, sy + 0.95, 1, 1], [sx0, sy + 0.95, 0, 1]].map(([x, y, a, b]) => B.sign.vert(x, y, zf + 0.06, 0, 0, 1, a, b));
    B.sign.quad(ids[0], ids[1], ids[2], ids[3]);
    B.det.setColor(TRIM).box(sx0 - 0.08, sy - 0.08, zf, sx1 + 0.08, sy + 1.03, zf + 0.05);
    const cy = Math.max(top, sy + 1.25);
    const cR = [u0 - 0.4, u1 + 0.4, 0.2, zf + 0.9];
    B.roof.setColor('#c2615a'); band(B.roof, cR, [u0 + 0.8, u1 - 0.8, 1.2, zf - 1.0], cy, cy + 0.9); soffit(cR, [u0, u1, 0.2, zf], cy);
    B.gold.box(cR[0], cy - 0.35, cR[3] - 0.05, cR[1], cy - 0.2, cR[3] + 0.02);
    cbox(cR[0], cR[1], 0.2, cR[3], cy - 0.2, cy + 0.5, 'awning', OVERHANG);
    B.rub.box(u0, top, 0.2, u1, cy, zf, 1 | 2 | 16);
    for (const x of [u0 + 0.35, u1 - 0.35]) { B.det.setColor('#1d1d1f').box(x - 0.05, sy - 0.5, zf, x + 0.05, sy - 0.2, zf + 0.25); B.glow.ellipsoid([x, sy - 0.62, zf + 0.25], [0.13, 0.19, 0.13], 8, 5); }
    keep.push([um, zf, 4]);
  }

  // ---------------------------------------------------------------- the hall
  const HT = Y + 10.4;
  const hallRows = [{ y: Y + 0.9, h: 1.4, w: 1.0 }, { y: Y + 4.0, h: 3.0, w: 1.2, arch: true }, { y: Y + 8.0, h: 1.3, w: 0.75, group: 3 }];
  const H = block(-7.5, 7.5, -5.4, 12.4, Y, HT, WALLC.hall, (k, f) => {
    const list = rows(f, hallRows, k % 2 ? 3.4 : 3.8, 1.2);
    if (k === 1) { // the east door onto the courtyard stairs (s = 5.4 + v on this face); drop the windows it would cut
      const door = { s0: 14.9, s1: 16.5, h0: Y, h1: Y + 2.7, arch: true, kind: 'door', col: '#8e2f27' };
      return [door, ...list.filter((o) => o.h0 > Y + 3 || o.s1 < door.s0 - 0.3 || o.s0 > door.s1 + 0.3)];
    }
    return list;
  });
  // the stepped roof: a tall central section, lower end sections past each gable
  const oh = 1.3, pitch = Math.tan(40 * PI / 180), zLo = H.z0 - oh, zHi = H.z1 + oh;
  const yE = HT - oh * pitch + 0.3, yR = yE + (zHi - zLo) / 2 * pitch;
  B.det.setColor('#5e2a24').box(H.x0 - 0.06, HT - 0.02, H.z0 - 0.06, H.x1 + 0.06, HT + 0.34, H.z1 + 0.06, 1 | 2 | 16 | 32); // frieze under the eaves
  gable(-5.2, 5.2, zLo, zHi, yE, yR, [[-5.2, -1], [5.2, 1]], HT, H.z0, H.z1);
  gable(-8.1, -5.2, zLo, zHi, yE, yR - 1.1, [[-7.5, -1]], HT, H.z0, H.z1);
  gable(5.2, 8.1, zLo, zHi, yE, yR - 1.1, [[7.5, 1]], HT, H.z0, H.z1);
  for (let x = -4.2; x <= 4.21; x += 1.4) B.gold.cyl(x, yR + 0.08, (zLo + zHi) / 2, 0.08, 0.01, x === 0 ? 1 : 0.45, 6); // ridge spikes
  spire(0, (zLo + zHi) / 2, yR + 0.1, 2.4);
  cbox(-7.5, 7.5, H.z0, H.z1, HT, yR - 2.5, 'roof');

  // the octagonal corner tower at the lane: rubble foot from the lane, rendered shaft, flared roof, spire
  {
    const [tx, tz] = [6.9, 3.4], R0 = 2.3, gl = laneY(6.9) - 0.4, top = Y + 13.8, seg = 8;
    const oct = (R) => Array.from({ length: seg }, (_, k) => { const a = (k + 0.5) / seg * 2 * PI; return [tx + Math.cos(a) * R, tz + Math.sin(a) * R]; });
    const P = oct(R0), Q = oct(R0 + 0.15);
    B.rub.setColor('#b9b3a8');
    for (let k = 0; k < seg; k++) { const a = Q[(k + 1) % seg], b = Q[k]; facade(B.rub, face(a[0], a[1], b[0], b[1]), gl, Y, [], k * 2); } // the rubble foot from the lane
    B.det.setColor('#9d978d').fill(Q, [], Y, true);
    B.wall.setColor(WALLC.tower);
    for (let k = 0; k < seg; k++) { // each side a face with one window per floor
      const a = P[(k + 1) % seg], b = P[k], f = face(a[0], a[1], b[0], b[1]);
      const holes = [0, 1, 2, 3].map((i) => ({ s0: f.L / 2 - 0.36, s1: f.L / 2 + 0.36, h0: Y + 1 + i * 3.2, h1: Y + 2.8 + i * 3.2, arch: true, kind: 'win' }));
      facade(B.wall, f, Y - 0.02, top, k % 2 ? holes : holes.slice(1), uoff); uoff += f.L;
    }
    B.det.setColor(WALLC.tower).cyl(tx, top, tz, R0, R0 + 0.3, 0.3, seg);
    B.roof.setColor(ROOF).lathe([[R0 + 1.2, top + 0.3], [R0 + 0.5, top + 0.75], [R0 * 0.6, top + 2.2], [0.3, top + 4.2], [0.02, top + 4.6]], seg, tx, tz);
    B.det.setColor(WOOD).cyl(tx, top + 0.28, tz, R0 + 0.3, R0 + 1.2, 0.02, seg, false);
    B.gold.cyl(tx, top + 0.22, tz, R0 + 1.22, R0 + 1.22, 0.1, seg, false);
    spire(tx, tz, top + 4.4, 3.2);
    ccyl(tx, tz, gl, top + 2, R0 + 0.15, R0 + 0.15, 'wall');
    keep.push([tx, tz, 4]);
  }

  // the dragon doors and the school door in the retaining wall under the hall
  {
    const ua = -3.4, ub = 3.8, f = face(ua, -frontV(ua) + 0.15, ub, -frontV(ub) + 0.15);
    const gl = laneY(0.2), s = (u) => (u - ua) * f.L / (ub - ua);
    // a log lintel over the plank doors; the openings are cut into a rubble panel laid over the wall face
    B.rub.setColor('#b9b3a8');
    facade(B.rub, f, gl - 0.3, Math.min(LOTUS_Y, gl + 3.3), [
      { s0: s(-1.2), s1: s(3.4), h0: gl, h1: gl + 2.55, kind: 'door', tex: [0, 400 / 512] },
      { s0: s(-3.0), s1: s(-2.05), h0: gl, h1: gl + 2.25, kind: 'door', tex: [400 / 512, 1] }], 0);
    for (const [x, z] of [[ua, -frontV(ua)], [ub, -frontV(ub)]]) B.rub.box(x - 0.01, gl - 0.3, z - 0.02, x + 0.01, Math.min(LOTUS_Y, gl + 3.3), z + 0.15);
    B.rub.face([at(f, 0, Math.min(LOTUS_Y, gl + 3.3), 0), at(f, f.L, Math.min(LOTUS_Y, gl + 3.3), 0), at(f, f.L, Math.min(LOTUS_Y, gl + 3.3), -0.15), at(f, 0, Math.min(LOTUS_Y, gl + 3.3), -0.15)], [0, 1, 0]);
    B.det.setColor('#6b4a33').tube(at(f, s(-1.45), gl + 2.7, 0.08), at(f, s(3.65), gl + 2.7, 0.08), 0.15, 8, true);
  }

  // ---------------------------------------------------------------- the courtyard: stairs, dharma wheel, altar wall
  {
    const zA = -9.0, zB = -11.6, x0 = 9.3, run = 3.0, n = Math.round((LOTUS_Y - COURT_Y) / 0.16), rise = (LOTUS_Y - COURT_Y) / n;
    B.det.setColor('#9d978d');
    B.det.box(8.1, COURT_Y - 0.3, zB, x0, LOTUS_Y, zA, 1 | 4 | 16 | 32); // landing at the door
    for (let i = 0; i < n; i++) B.det.box(x0 + i * run / n, COURT_Y - 0.3, zB, x0 + run + 0.02, LOTUS_Y - (i + 1) * rise + rise, zA, 1 | 4 | 16 | 32);
    for (const z of [zA + 0.1, zB - 0.1]) { B.det.setColor('#2b2b2c').tube([x0, LOTUS_Y + 0.95, z], [x0 + run, COURT_Y + 0.95, z], 0.035, 6).tube([x0, LOTUS_Y, z], [x0, LOTUS_Y + 0.95, z], 0.03, 5).tube([x0 + run, COURT_Y, z], [x0 + run, COURT_Y + 0.95, z], 0.03, 5); }
    cbox(8.1, x0, zB, zA, COURT_Y - 0.3, LOTUS_Y, 'ledge');
    // the flight as one sloped top (the car and the walkers climb it)
    const k = -(LOTUS_Y - COURT_Y) / run, [wx, wz] = W(x0, 0), o = wx * F.c + wz * F.s;
    const q4 = [[x0, zA], [x0 + run, zA], [x0 + run, zB], [x0, zB]].map(([x, z]) => W(x, z));
    S.prism(q4.flat(), COURT_Y - 0.3, LOTUS_Y - k * o, k * F.c, k * F.s, 'stairs');
    // the dharma wheel: a golden sun ringed in stone and eight stone rays on the grass
    const [wcx, wcz] = [12.8, -2.6], y = COURT_Y + 0.02;
    B.gold.cyl(wcx, y, wcz, 0.95, 0.95, 0.05, 20);
    B.det.setColor('#d9d4c8').cyl(wcx, y, wcz, 1.25, 1.25, 0.04, 24);
    for (let i = 0; i < 8; i++) B.det.with(M4(wcx, y, wcz, i * PI / 4), (q) => q.box(1.35, 0, -0.17, 3.4, 0.07, 0.17));
    // the altar wall across the back: rubble, niches with golden Buddhas, the two gates of the two paths
    const f = face(8.6, -14.25, 16.55, -14.25), gy = COURT_Y, top = COURT_Y + 2.9;
    B.rub.setColor('#b9b3a8');
    facade(B.rub, f, gy - 0.3, top, [
      { s0: 0.25, s1: 1.25, h0: gy, h1: gy + 2.15, arch: true, kind: 'dark', col: '#1e1a17' },
      { s0: 2.0, s1: 2.9, h0: gy + 0.9, h1: gy + 2.25, arch: true, kind: 'niche' },
      { s0: 3.25, s1: 4.7, h0: gy + 0.55, h1: gy + 2.55, arch: true, kind: 'niche' },
      { s0: 5.05, s1: 5.95, h0: gy + 0.9, h1: gy + 2.25, arch: true, kind: 'niche' },
      { s0: 6.7, s1: 7.7, h0: gy, h1: gy + 2.15, arch: true, kind: 'dark', col: '#1e1a17' }], uoff);
    B.rub.box(8.6, gy - 0.3, -15.0, 16.55, top, -14.25, 1 | 2 | 4 | 32);
    B.det.setColor('#c8c4bb').box(8.5, top, -15.1, 16.65, top + 0.12, -14.15);
    cbox(8.6, 16.55, -15.0, -14.25, gy - 0.3, top + 0.12);
    buddha(8.6 + 3.975, gy + 0.55, -14.25 - 0.3, 0.95);
    buddha(8.6 + 2.45, gy + 0.9, -14.25 - 0.3, 0.55);
    buddha(8.6 + 5.5, gy + 0.9, -14.25 - 0.3, 0.55);
    for (const x of [8.6 + 1.6, 8.6 + 6.3]) { B.det.setColor('#1d1d1f').box(x - 0.04, top - 0.7, -14.25, x + 0.04, top - 0.4, -14.05); B.glow.ellipsoid([x, top - 0.8, -14.03], [0.1, 0.15, 0.1], 8, 5); }
  }

  // a seated Buddha (local position, figure faces +z), gilded
  function buddha(x, y, z, k) {
    const p = (a, b, c) => [x + a * k, y + b * k, z + c * k];
    idol.ellipsoid(p(0, 0.06, 0), [0.5 * k, 0.08 * k, 0.42 * k], 14, 6);  // lotus cushion
    idol.ellipsoid(p(0, 0.2, 0.08), [0.45 * k, 0.14 * k, 0.3 * k], 14, 8); // crossed legs
    idol.ellipsoid(p(0, 0.55, -0.02), [0.26 * k, 0.32 * k, 0.18 * k], 14, 8);
    for (const sd of [-1, 1]) idol.tube([p(sd * 0.25, 0.75, -0.02), p(sd * 0.31, 0.46, 0.05), p(sd * 0.1, 0.33, 0.2)], [0.08 * k, 0.07 * k, 0.06 * k], 8);
    idol.ellipsoid(p(0, 0.33, 0.22), [0.14 * k, 0.05 * k, 0.07 * k], 10, 5); // hands
    idol.ellipsoid(p(0, 0.98, 0), [0.13 * k, 0.16 * k, 0.14 * k], 14, 8);
    idol.ellipsoid(p(0, 1.14, -0.01), [0.07 * k, 0.07 * k, 0.07 * k], 10, 6); // ushnisha
    for (const sd of [-1, 1]) idol.ellipsoid(p(sd * 0.13, 0.93, 0), [0.025 * k, 0.09 * k, 0.04 * k], 6, 4);
  }

  // a stupa: stepped plinth, drum, bell dome, harmika, ringed spire, gold finial (local x / z, ground y, scale k)
  function stupa(x, z, y, k, col, band) {
    B.det.setColor(col);
    const bx = (hw, y0, h) => B.det.box(x - hw * k, y + y0 * k, z - hw * k, x + hw * k, y + (y0 + h) * k, z + hw * k);
    bx(1.1, -0.4, 1.4); bx(0.95, 1.0, 0.16); bx(0.82, 1.16, 0.16); bx(0.7, 1.32, 0.16); bx(0.6, 1.48, 0.42);
    B.det.lathe([[0.5, 1.9], [0.58, 2.05], [0.57, 2.4], [0.45, 2.75], [0.26, 2.98], [0.05, 3.05]].map(([a, b]) => [a * k, y + b * k]), 16, x, z);
    bx(0.24, 2.95, 0.3); bx(0.3, 3.25, 0.06);
    for (let i = 0; i < 11; i++) B.det.cyl(x, y + (3.31 + i * 0.13) * k, z, (0.22 - i * 0.011) * k, (0.17 - i * 0.01) * k, 0.13 * k, 10);
    B.gold.cyl(x, y + 4.74 * k, z, 0.2 * k, 0.2 * k, 0.04 * k, 10).ellipsoid([x, y + 4.86 * k, z], [0.07 * k, 0.12 * k, 0.07 * k], 8, 5).cyl(x, y + 4.96 * k, z, 0.04 * k, 0, 0.2 * k, 6);
    if (band) { B.gold.cyl(x, y + 2.03 * k, z, 0.59 * k, 0.59 * k, 0.05 * k, 16, false).cyl(x, y + 2.13 * k, z, 0.595 * k, 0.595 * k, 0.03 * k, 16, false); }
    else B.det.setColor('#8b3a2e').cyl(x, y + 2.05 * k, z, 0.585 * k, 0.585 * k, 0.035 * k, 16, false).cyl(x, y + 2.13 * k, z, 0.59 * k, 0.59 * k, 0.02 * k, 16, false);
    cbox(x - 1.1 * k, x + 1.1 * k, z - 1.1 * k, z + 1.1 * k, y - 0.4 * k, y + 1.9 * k);
    ccyl(x, z, y + 1.9 * k, y + 4.9 * k, 0.55 * k, 0.15 * k, 'wall');
  }

  // ---------------------------------------------------------------- the white stupa on the lawn, the chain fence
  {
    const [x, z] = [STUPA_W[0], -STUPA_W[1]], ys = [[-1.6, -1.6], [1.6, 1.6], [-1.6, 1.6], [1.6, -1.6]].map(([a, b]) => g(x + a, z + b)), y = Math.max(...ys);
    stupa(x, z, y, 1, '#f1efe9', false);
    B.det.setColor('#f1efe9').box(x - 1.1, Math.min(...ys) - 0.3, z - 1.1, x + 1.1, y - 0.39, z + 1.1, 1 | 2 | 16 | 32); // the plinth runs down the slope
    B.det.setColor('#f1efe9').lathe([[0.3, y], [0.45, y + 0.1], [0.55, y + 0.5], [0.5, y + 0.52]], 14, x + 2.1, z + 0.4);
    ccyl(x + 2.1, z + 0.4, y, y + 0.52, 0.55);
    B.det.setColor('#8e8a82').box(x - 1.6, Math.min(...ys) - 0.2, z - 1.6, x + 1.6, y + 0.03, z + 1.6);
    keep.push([x, z, 6]);
    // posts every 2.2 m along the lane side of the lawn, the chain sagging between
    const vF = -5.2, posts = [];
    for (let u = -57; u <= -40.5; u += 2.2) posts.push([u, -vF, g(u, -vF)]);
    B.det.setColor('#1f2224');
    posts.forEach(([px, pz, py], i) => {
      B.det.cyl(px, py - 0.1, pz, 0.05, 0.05, 0.85, 6);
      ccyl(px, pz, py, py + 0.75, 0.06);
      if (!i) return;
      const [qx, qz, qy] = posts[i - 1], m = [(px + qx) / 2, (py + qy) / 2 + 0.45, (pz + qz) / 2];
      B.det.tube([qx, qy + 0.68, qz], m, 0.022, 4).tube(m, [px, py + 0.68, pz], 0.022, 4);
    });
  }

  // ---------------------------------------------------------------- the black stupa on its chamber, prayer wheels
  {
    const [x, z] = [STUPA_B[0], -STUPA_B[1]], R = 3.2;
    const hex = Array.from({ length: 6 }, (_, k) => [x + Math.cos(k * PI / 3 + PI / 6) * R, z + Math.sin(k * PI / 3 + PI / 6) * R]);
    const ys = hex.map(([a, b]) => g(a, b)), y0 = Math.min(...ys) - 0.4, y1 = Math.max(...ys) + 1.4;
    B.rub.setColor('#8f8a80').extrude(hex, [], y0, y1, { top: false });
    B.det.setColor('#77736b').fill(hex, [], y1, true);
    B.det.setColor('#b9b3a8');
    const hexTop = hex.map(([a, b]) => [x + (a - x) * 1.04, z + (b - z) * 1.04]);
    B.det.extrude(hexTop, [], y1, y1 + 0.12);
    // the door into the pyramid chamber, facing the courtyard
    const df = face(x - 0.55, z + R * 0.866 + 0.02, x + 0.55, z + R * 0.866 + 0.02);
    B.det.setColor('#16130f').face([at(df, 0, y1 - 1.3, 0), at(df, df.L, y1 - 1.3, 0), at(df, df.L, y1 - 0.1, 0), at(df, 0, y1 - 0.1, 0)], [0, 0, 1]);
    cprism(hex, y0, y1 + 0.12, 'ledge');
    stupa(x, z, y1 + 0.12 + 0.4 * 1.25, 1.25, '#232326', true);
    keep.push([x, z, R + 2]);
    // five green prayer wheels on a rail in front of it, under a little red roof
    const yw = g(x, z + R + 2) + 0.05, z0 = z + R + 1.6;
    for (let i = 0; i < 5; i++) {
      const wx = x - 2 + i;
      B.det.setColor('#2d8a3e').cyl(wx, yw + 0.55, z0, 0.2, 0.2, 0.6, 12);
      B.gold.cyl(wx, yw + 0.55, z0, 0.21, 0.21, 0.05, 12, false).cyl(wx, yw + 1.1, z0, 0.21, 0.21, 0.05, 12, false);
      B.det.setColor('#3a2a1e').cyl(wx, yw, z0, 0.03, 0.03, 1.4, 5);
    }
    B.det.setColor('#3a2a1e').box(x - 2.7, yw, z0 - 0.08, x - 2.55, yw + 1.8, z0 + 0.08).box(x + 2.55, yw, z0 - 0.08, x + 2.7, yw + 1.8, z0 + 0.08);
    B.roof.setColor(ROOF); band(B.roof, [x - 3.0, x + 3.0, z0 - 0.7, z0 + 0.7], [x - 2.6, x + 2.6, z0, z0], yw + 1.8, yw + 2.3);
    cbox(x - 2.7, x + 2.7, z0 - 0.3, z0 + 0.3, yw, yw + 2.2);
  }

  // ---------------------------------------------------------------- the stone pagoda tower up the west slope
  {
    const [x, z] = [TOWER_P[0], -TOWER_P[1]], h = 1.8, ys = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]) => g(x + a, z + b));
    const y0 = Math.min(...ys) - 0.5, y1 = Math.max(...ys) + 4.6;
    const tb = { x0: x - h, x1: x + h, z0: z - h, z1: z + h, y1 };
    for (const [k, f] of [face(tb.x0, tb.z1, tb.x1, tb.z1), face(tb.x1, tb.z1, tb.x1, tb.z0), face(tb.x1, tb.z0, tb.x0, tb.z0), face(tb.x0, tb.z0, tb.x0, tb.z1)].entries()) {
      B.rub.setColor('#a39c90');
      facade(B.rub, f, y0, y1, k === 0 || k === 3 ? [{ s0: 1.4, s1: 2.2, h0: y1 - 2.2, h1: y1 - 0.9, arch: true, kind: 'win' }] : [], k * 3.6);
    }
    cbox(tb.x0, tb.x1, tb.z0, tb.z1, y0, y1);
    pagoda(tb, 1.0, 1.6);
    keep.push([x, z, 3.5]);
  }

  // ---------------------------------------------------------------- Buddha niches in the walls across the lane
  for (const [u, v] of NICHES) {
    const x = u, z = -v, gy = g(x, z - 0.8), fb = face(x + 1.9, z - 0.25, x - 1.9, z - 0.25); // faces the lane (-z local)
    B.rub.setColor('#a8a095');
    facade(B.rub, fb, gy - 0.4, gy + 2.3, [{ s0: 1.4, s1: 2.4, h0: gy + 1.45, h1: gy + 2.25, arch: true, kind: 'niche' }], 0);
    B.rub.box(x - 1.9, gy - 0.4, z - 0.25, x + 1.9, gy + 2.3, z + 0.6, 1 | 2 | 4 | 16);
    B.det.setColor('#b4b2ad'); // pale granite surround: two legs, the shelf, the arch ring
    B.det.box(x - 0.85, gy - 0.1, z - 0.45, x - 0.5, gy + 1.4, z - 0.2).box(x + 0.5, gy - 0.1, z - 0.45, x + 0.85, gy + 1.4, z - 0.2).box(x - 0.95, gy + 1.4, z - 0.55, x + 0.95, gy + 1.52, z - 0.2);
    for (let q = 0; q < 8; q++) { const a0 = PI * q / 8, a1 = PI * (q + 1) / 8, R2 = 0.62; B.det.tube([x + Math.cos(a0) * R2, gy + 1.85 + Math.sin(a0) * R2, z - 0.3], [x + Math.cos(a1) * R2, gy + 1.85 + Math.sin(a1) * R2, z - 0.3], 0.1, 5); }
    buddhaFacing(x, gy + 1.52, z + 0.05, 0.5);
    cbox(x - 1.9, x + 1.9, z - 0.55, z + 0.6, gy - 0.4, gy + 2.3);
    keep.push([x, z, 2.5]);
  }
  // the same figure turned to face -z (the niches across the lane look back at the compound)
  function buddhaFacing(x, y, z, k) {
    const s = idol.v; buddha(0, 0, 0, k);
    for (let i = s * 3; i < idol.xyz.length; i += 3) { idol.xyz[i] = x - idol.xyz[i]; idol.xyz[i + 1] += y; idol.xyz[i + 2] = z - idol.xyz[i + 2]; }
  }

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'lotus' });
  root.add(group);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: crazyTex(), vertexColors: true, roughness: 0.9 }),
    rub: new THREE.MeshStandardMaterial({ map: rubbleTex(), vertexColors: true, roughness: 0.95 }),
    roof: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.55, metalness: 0.25 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd4a13a, metalness: 0.85, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2c3843, metalness: 0.4, roughness: 0.15 }),
    lit: new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.3, emissive: 0xffc47a, emissiveIntensity: 0 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf6e7c4, roughness: 0.4, emissive: 0xffc070, emissiveIntensity: 0.05 }),
    sign: new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.6, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 }),
    door: new THREE.MeshStandardMaterial({ map: doorTex(), roughness: 0.8 }),
  };
  M.sign.emissiveMap = M.sign.map;
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    const glassy = k === 'glass' || k === 'lit' || k === 'glow';
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'lotus-' + k, castShadow: !glassy, receiveShadow: true }));
  }
  group.add(Object.assign(new THREE.Mesh(idol.build(XF), M.gold), { name: 'lotus-buddha', castShadow: true, receiveShadow: true }));
  nV += idol.v;
  console.log(`[cherkasy] White Lotus: terrace ${LOTUS_Y} m, courtyard ${COURT_Y} m, ${nWin} windows (${nLit} lit), ${finials} finials, ${(nV / 1000).toFixed(1)}k verts, ${(S.count ?? 0) - s0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  // replaced footprints: the minimap draws them, trees keep off
  const names = { [HALL]: 'Храм Білого лотосу' }, heights = { [HALL]: yR - LOTUS_Y + 2, [WING]: 17, [GATE]: 5, [HEX]: 6, [PAGODA]: 7 };
  const footprints = map.buildings.filter((b) => LOTUS_SKIP.has(b.id)).map((b) => ({ poly: ringPts(b.p), h: heights[b.id], kind: b.k, name: names[b.id] }));
  const inT = (x, z) => { const [u, v] = F.lane(x, z); return inPoly(TERRACE, u, v) || inPoly(COURT, u, v); };
  const keepW = keep.map(([x, z, rr]) => [...W(x, z), rr]);
  return {
    footprints,
    clear: (x, z) => inT(x, z) || keepW.some(([kx, kz, kr]) => (x - kx) ** 2 + (z - kz) ** 2 < kr * kr),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.4 * k; M.glow.emissiveIntensity = 0.05 + 2.6 * k; M.sign.emissiveIntensity = 0.25 * k; },
  };
}
