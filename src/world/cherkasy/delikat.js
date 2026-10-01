// OWNER: cherkasy. Supermarket «Делікат», vul. Blahovisna 300 at the corner of vul. Viacheslava Chornovola (OSM way
// 118327849), rebuilt on a player's request (issue #12). The old furniture house («Будинок меблів», a two-storey box
// about 40 x 64 m) was re-clad and opened as a Delikat in June 2019: dark brown standing-seam metal walls, a row of
// upper windows in beige frames, a deep beige composite crown band with a soffit round the top, a dark granite plinth.
// The shop front is the long Blahovisna side: glazing the whole length of the ground floor under a beige canopy slab on
// slim dark columns, with the white «Делікат» lettering on the wall above it near the Chornovola corner. The Chornovola
// end carries two overlapping beige triangles of diamond panels by that corner and a black steel fire stair; the back
// and the north-west end are plain, with a few service doors. The shop glazing and the lettering light up at night.
// References: the rau.ua opening report (2019) and the Google Maps photos of the store; Street View (2015) for the
// shape of the old box.
//   DELIKAT_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildDelikat({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge with bldkit.js; each edge is told by its outward normal (+x Blahovisna, +z Chornovola).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, area2 } from './geo.js';
import { edgeFaces, pt, quad, panel, fbox, wall, win, row, decal, facing, mats, finish } from './bldkit.js';

const OSM_ID = 118327849;
export const DELIKAT_SKIP = new Set([OSM_ID]);

const LIFT = 0.35, GF = 4.0, CAN0 = 4.15, CAN1 = 4.75, CAND = 3.2; // floor over grade, shop glazing top, canopy slab, its depth
const UW0 = 5.6, UW1 = 6.9, BAND0 = 8.3, TOP = 10.1, OVER = 1.0;   // upper windows, crown band bottom / top, its overhang
const BROWN = '#4b3e38', BEIGE = '#d9c9a6', BEIGE2 = '#cdbb95', GRANITE = '#4a4744', STEEL = '#26282a', FRAME = '#e0d2b2';
const SIGN = [0, 0, 1, 1];

// standing-seam cladding: a seam every 0.5 m (2 m per repeat), the vertex colour gives the brown
const seamTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const x = i * w / 4 + w / 8; // seams off the texel at u = 0, which untextured faces sample
    g.fillStyle = '#f2f2f2'; g.fillRect(x, 0, 6, h);
    g.fillStyle = '#9a9a9a'; g.fillRect(x + 6, 0, 4, h);
    g.fillStyle = '#cfcfcf'; g.fillRect(x + 10, 0, 22, h);
  }
});
// composite panels: 1.5 x 0.9 m with dark joints (3 x 1.8 m per repeat)
const panelTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7d7a74';
  for (const x of [w / 4, 3 * w / 4]) g.fillRect(x, 0, 3, h); // joints off u, v = 0 (the soffit corners sample it)
  for (const y of [h / 4, 3 * h / 4]) g.fillRect(0, y, w, 3);
});
// the diamond panels of the triangles: one lozenge per repeat, light-edged joints
const diamondTex = () => canvasTex(256, 256, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#fbf8f2'); grd.addColorStop(1, '#e4ded2');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#8a8478'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
});
// the lettering: white serif italic with a grey edge, on a clear ground
const signTex = () => canvasTex(1024, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.font = 'italic bold 190px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.strokeStyle = '#8c9094'; g.lineWidth = 12; g.strokeText('Делікат', w / 2, h / 2 + 8, w - 40);
  const f = g.createLinearGradient(0, 40, 0, 220); f.addColorStop(0, '#ffffff'); f.addColorStop(1, '#dfe3e6');
  g.fillStyle = f; g.fillText('Делікат', w / 2, h / 2 + 8, w - 40);
}, { repeat: false, aniso: 16 });

export function buildDelikat({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p);
  let gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const yF = gHi + LIFT, gB = gLo - 0.6, Y = (h) => yF + h;
  const B = { wall: new MB(), band: new MB(), dia: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const D = B.det;
  let nWin = 0;
  // from the viewer's left end of a face to its s
  const sl = (f, d) => (facing(f) > 0 ? d : f.L - d);
  const span = (f, a, b) => { const p = sl(f, a), q = sl(f, b); return [Math.min(p, q), Math.max(p, q)]; };
  const box = (f, a, b, y0, y1, o0, o1, faces) => { const [s0, s1] = span(f, a, b); fbox(D, f, s0, s1, y0, y1, o0, o1, faces); };
  const solid = (f, a, b, o0, o1, y0, y1, kind = 'wall', flags = 0) => {
    const [s0, s1] = span(f, a, b), Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), y0, y1, 0, 0, kind, flags);
  };

  const faces = edgeFaces(ring);
  const front = faces.filter((f) => f.nx > 0.7 && f.L > 3), south = faces.filter((f) => f.nz > 0.7 && f.L > 3);
  const main = south.reduce((a, f) => (f.L > (a?.L ?? 0) ? f : a), null);     // the long stretch of the Chornovola end
  const signF = front.reduce((a, f) => (f.L > (a?.L ?? 0) ? f : a), null);    // the long stretch of the shop front
  const STAIR = 0.6, DIA = [[0.8, 15.8, 7.6], [9.4, 18.6, 4.6]];               // stair from the left end; triangles [a, b, apex] from the right end

  for (const f of faces) {
    const holes = [];
    const isFront = front.includes(f), isMain = f === main, bands = f.L > 3;
    // upper windows: a beige-framed row all round, kept clear of the lettering, the triangles and the stair head
    if (bands) for (const q of row(f, 0.8, f.L - 0.8, 3.1, 1.9, Y(UW0), Y(UW1), { cols: 2, rev: BEIGE2, glass: FRAME, lit: r() < 0.35, sill: BEIGE })) {
      const m = (q.s0 + q.s1) / 2, d = facing(f) > 0 ? m : f.L - m; // from the left end
      if (f === signF && d < 15) continue;
      if (isMain && (f.L - d < DIA[0][1] + 0.4 || Math.abs(d - STAIR - 1.2) < 1.4)) continue;
      holes.push(q);
    }
    if (isFront) { // the shop glazing, the whole length bar the corners; two door bays
      const n = Math.max(1, Math.round((f.L - 1.2) / 6)), p = (f.L - 1.2) / n;
      for (let i = 0; i < n; i++) {
        const a = 0.6 + i * p + 0.25, b = 0.6 + (i + 1) * p - 0.25, door = f === signF && (i === n - 2 || i === 1);
        holes.push({ s0: a, s1: b, y0: Y(door ? 0.02 : 0.35), y1: Y(GF - 0.2), cols: Math.round((b - a) / 1.5), rows: 2, rev: GRANITE, glass: '#7d6a58', lit: true, dep: 0.25 });
      }
    } else if (bands && f.L > 20) { // service doors and a few small ground windows
      const ds = isMain ? f.L * 0.35 : f.L * 0.5;
      holes.push({ s0: ds - 0.8, s1: ds + 0.8, y0: Y(0.02), y1: Y(2.3), cols: 1, rows: 2, rev: GRANITE, glass: '#3d3a38', dep: 0.12 });
      if (isMain) holes.push({ ...holes.at(-1), s0: sl(f, STAIR + 0.6) - 0.5, s1: sl(f, STAIR + 0.6) + 0.5, y0: Y(UW0 - 0.6), y1: Y(UW0 + 1.6) }); // the stair's upper door
      for (const s of [f.L * 0.15, f.L * 0.7]) if (Math.abs(s - ds) > 4) holes.push({ s0: s - 0.6, s1: s + 0.6, y0: Y(1.6), y1: Y(2.6), cols: 1, rev: BEIGE2, glass: FRAME, sill: BEIGE });
    }
    B.wall.setColor(BROWN); wall(B.wall, f, Y(0.6), Y(BAND0), holes.filter((q) => q.y1 > Y(0.6)), [2, 2]);
    for (const q of holes) { win(B, f, q); nWin++; }
    // granite plinth, broken by the openings that reach the floor
    D.setColor(GRANITE);
    let s = 0;
    for (const q of [...holes.filter((h) => h.y0 < Y(0.6)).sort((a, b) => a.s0 - b.s0), { s0: f.L, s1: f.L }]) {
      if (q.s0 > s + 1e-3) fbox(D, f, s, q.s0, gB, Y(0.6), 0, 0.05, 'ftlr');
      s = Math.max(s, q.s1);
    }
    for (const q of holes) if (q.y0 < Y(0.6)) { B.wall.setColor(BROWN); fbox(B.wall, f, q.s0, q.s1, gB, q.y0, 0, 0.02, 'f'); }
    // crown band: outer face, soffit, top, the wall behind it
    const e = f.L > 3 ? OVER : 0.02;
    B.band.setColor(BEIGE);
    panel(B.band, f, -e, f.L + e, Y(BAND0), Y(TOP), e, [3, 1.8]);
    B.wall.setColor(BROWN); fbox(B.wall, f, 0, f.L, Y(BAND0), Y(TOP), -0.02, 0, 'f');
    D.setColor('#bfae8c'); fbox(D, f, -e, f.L + e, Y(BAND0), Y(BAND0 + 0.05), 0, e, 'u');
    D.setColor('#c9b893'); fbox(D, f, -e, f.L + e, Y(TOP), Y(TOP + 0.06), -0.3, e, 't');
    const p0 = pt(f, 0, 0, e), p1 = pt(f, f.L, 0, e); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP), f.nx, f.nz);
  }
  // corners of the band: fill the wedge between neighbouring overhangs with the roof cap
  D.setColor('#8d8f90'); D.fill(ring, [], Y(TOP - 0.25), true);
  B.band.setColor(BEIGE);
  for (const [k, f] of faces.entries()) {
    const g = faces[(k + 1) % faces.length];
    if (f.L <= 3 || g.L <= 3) continue;
    const c = pt(f, f.L, 0), a = pt(f, f.L, 0, OVER), b = pt(g, 0, 0, OVER), m = [a[0] + b[0] - c[0], 0, a[2] + b[2] - c[2]];
    const n = [(f.nx + g.nx) / 2, 0, (f.nz + g.nz) / 2];
    for (const [p, q] of [[a, m], [m, b]]) quad(B.band, [p[0], Y(BAND0), p[2]], [q[0], Y(BAND0), q[2]], [q[0], Y(TOP), q[2]], [p[0], Y(TOP), p[2]], n);
    D.setColor('#c9b893'); quad(D, [c[0], Y(TOP), c[2]], [a[0], Y(TOP), a[2]], [m[0], Y(TOP), m[2]], [b[0], Y(TOP), b[2]], [0, 1, 0]);
    D.setColor('#bfae8c'); quad(D, [c[0], Y(BAND0), c[2]], [a[0], Y(BAND0), a[2]], [m[0], Y(BAND0), m[2]], [b[0], Y(BAND0), b[2]], [0, -1, 0]);
  }
  // roof kit: a telecom mast by the back corner, a few air handlers
  {
    const f = faces.find((q) => q.nz < -0.7 && q.L > 20), [cx, , cz] = pt(f, f.L * 0.2, 0, -4);
    D.setColor('#9a9c9c'); D.box(cx - 1.2, Y(TOP - 0.25), cz - 1.2, cx + 1.2, Y(TOP + 1.2), cz + 1.2, 1 | 2 | 4 | 16 | 32);
    D.setColor('#6f7375'); D.tube([cx, Y(TOP), cz], [cx, Y(TOP + 11), cz], 0.18, 6);
    for (const y of [TOP + 8.5, TOP + 10.3]) for (const [dx, dz] of [[0.35, 0], [-0.35, 0], [0, 0.35]]) D.box(cx + dx - 0.12, Y(y), cz + dz - 0.12, cx + dx + 0.12, Y(y + 1.3), cz + dz + 0.12);
    for (const [ds, dd] of [[0.45, 10], [0.6, 18], [0.75, 12]]) {
      const [x, , z] = pt(f, f.L * ds, 0, -dd);
      D.setColor('#c4c6c3'); D.box(x - 1.4, Y(TOP - 0.25), z - 0.9, x + 1.4, Y(TOP + 1.1), z + 0.9, 1 | 2 | 4 | 16 | 32);
    }
  }

  // ---- shop front: the canopy slab on slim columns, the lettering above it, steps and a ramp rail
  for (const f of front) {
    B.band.setColor(BEIGE); fbox(B.band, f, -0.2, f.L + 0.2, Y(CAN0), Y(CAN1), 0, CAND, 'flrt');
    D.setColor('#ece6d8'); fbox(D, f, -0.2, f.L + 0.2, Y(CAN0), Y(CAN0 + 0.01), 0, CAND, 'u');
    S.prism((() => { const Q = [[-0.2, 0], [f.L + 0.2, 0], [f.L + 0.2, CAND], [-0.2, CAND]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }); return (area2(Q) < 0 ? Q.reverse() : Q).flat(); })(), Y(CAN0), Y(CAN1), 0, 0, 'awning', 1);
    const n = Math.max(1, Math.round(f.L / 7.5));
    for (let i = 0; i <= n; i++) {
      const s = Math.min(f.L - 0.3, Math.max(0.3, i * f.L / n)), [x, , z] = pt(f, s, 0, CAND - 0.45);
      D.setColor(STEEL); D.cyl(x, gB, z, 0.11, 0.11, Y(CAN0) - gB, 8, false);
      S.cyl(x, z, gB, Y(CAN0), 0.12, 0.12, 'pole');
    }
    // the paved terrace under the canopy, a step down at its edge
    const pg = pt(f, f.L / 2, 0, CAND + 1), g = Math.min(heightAt(pg[0], pg[2]), Y(-0.1));
    D.setColor('#8b8580'); fbox(D, f, 0, f.L, gB, yF, 0, CAND, 'ftlr');
    D.setColor('#a29b92'); fbox(D, f, 0, f.L, gB, (yF + g) / 2, CAND, CAND + 0.4, 'ftlr');
    const Q = [[0, 0], [f.L, 0], [f.L, CAND], [0, CAND]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), gB, yF, 0, 0, 'step');
    D.setColor(STEEL); // the terrace rail along the canopy edge
    for (const [a, b] of [[0.4, f.L * 0.45], [f.L * 0.55, f.L - 0.4]]) {
      const pa = pt(f, a, Y(0.95), CAND - 0.1), pb = pt(f, b, Y(0.95), CAND - 0.1);
      D.tube(pa, pb, 0.03, 5);
      for (let s = a; s <= b + 1e-3; s += (b - a) / Math.max(1, Math.round((b - a) / 1.5))) { const p = pt(f, s, yF, CAND - 0.1); D.tube(p, [p[0], Y(0.95), p[2]], 0.02, 4); }
    }
  }
  if (signF) {
    const [s0, s1] = span(signF, 1.5, 13.5); // the Chornovola end is the left one, seen from Blahovisna
    decal(B.sign, signF, s0, s1, Y(CAN1 + 0.35), Y(CAN1 + 0.35 + 12 * 0.25), 0.12, SIGN);
  }

  // ---- the Chornovola end: diamond-panel triangles by the Blahovisna corner, the fire stair
  if (main) {
    const f = main, N = [f.nx, 0, f.nz];
    for (const [k, [a, b, h]] of DIA.entries()) {
      const o = 0.12 + k * 0.1, A = f.L - a, Bq = f.L - b, M = (A + Bq) / 2; // from the right end (the corner)
      const sa = sl(f, A), sb = sl(f, Bq), sm = sl(f, M), y0 = Y(0.6), y1 = Y(h);
      const U = (s, y) => [s / 2.2, (y - yF) / 2.6];
      B.dia.setColor(k ? '#e6d8bb' : '#ecdfc4');
      const p = [pt(f, sa, y0, o), pt(f, sb, y0, o), pt(f, sm, y1, o)], uv = [U(sa, y0), U(sb, y0), U(sm, y1)];
      const id = p.map((q, j) => B.dia.vert(...q, ...N, uv[j][0], uv[j][1]));
      const e = p[1].map((v, j) => v - p[0][j]), g = p[2].map((v, j) => v - p[0][j]);
      const cr = [e[1] * g[2] - e[2] * g[1], e[2] * g[0] - e[0] * g[2], e[0] * g[1] - e[1] * g[0]];
      if (cr[0] * N[0] + cr[2] * N[2] >= 0) B.dia.tri(id[0], id[1], id[2]); else B.dia.tri(id[0], id[2], id[1]);
      // the sloped edges: thin returns back to the wall, so the skin reads as raised panels
      D.setColor('#bdb4a2');
      for (const [P0, P1] of [[p[0], p[2]], [p[1], p[2]]]) {
        const d = P1.map((v, j) => v - P0[j]), l = Math.hypot(...d), n = [d[1] * N[2] / l, -(d[0] * N[2] - d[2] * N[0]) / l, -d[1] * N[0] / l];
        const out = (P0[0] + P1[0]) / 2 - (pt(f, sm, 0)[0]), side = out * n[0] + ((P0[2] + P1[2]) / 2 - pt(f, sm, 0)[2]) * n[2] >= 0 ? 1 : -1;
        quad(D, P0, P1, [P1[0] - f.nx * o, P1[1], P1[2] - f.nz * o], [P0[0] - f.nx * o, P0[1], P0[2] - f.nz * o], n.map((v) => v * side));
      }
    }
    // fire stair: two flights up to a landing at the upper door, a cage ladder on to the roof
    const st = STAIR, yL = Y(UW0 - 0.6), yM = (yF + yL) / 2, W = 1.1, o0 = 0.15, o1 = o0 + W, o2 = o1 + 0.1, o3 = o2 + W;
    const flight = (a, b, ya, yb, oa, ob) => { // from-left a -> b, rising ya -> yb
      const n = Math.ceil(Math.abs(yb - ya) / 0.18);
      for (let i = 0; i < n; i++) {
        const t0s = a + (b - a) * i / n, t1s = a + (b - a) * (i + 1) / n, y = ya + (yb - ya) * (i + 1) / n;
        box(f, Math.min(t0s, t1s), Math.max(t0s, t1s), y - 0.04, y, oa, ob, 'ftu');
      }
      for (const o of [oa, ob]) D.tube(pt(f, sl(f, a), ya, o), pt(f, sl(f, b), yb, o), 0.05, 4);           // stringers
      for (const o of [oa, ob]) D.tube(pt(f, sl(f, a), ya + 1.0, o), pt(f, sl(f, b), yb + 1.0, o), 0.025, 4); // handrails
    };
    D.setColor(STEEL);
    flight(st + 7.5, st + 1.2, yF, yM, o2, o3);                     // first flight rises to the left
    box(f, st - 0.2, st + 1.2, yM - 0.08, yM, o0, o3, 'ftlru');      // half landing
    flight(st + 1.2, st + 7.5, yM, yL, o0, o1);                     // second flight back to the right, against the wall
    box(f, st + 7.5, st + 9.0, yL - 0.08, yL, o0, o3, 'ftlru');      // the landing at the door
    box(f, st - 0.2, st + 9.0, yL - 0.08, yL, o0, o1, 'ftu');
    for (const [a, yy] of [[st - 0.2, yM], [st + 1.2, yM], [st + 7.5, yL], [st + 9.0, yL]]) for (const o of [o0 + 0.05, o3 - 0.05]) { const p = pt(f, sl(f, a), gB, o); D.tube(p, [p[0], yy, p[2]], 0.05, 4); }
    for (const [a, yy] of [[st - 0.2, yM], [st + 9.0, yL]]) D.tube(pt(f, sl(f, a), yy + 1.0, o0), pt(f, sl(f, a), yy + 1.0, o3), 0.025, 4);
    const lad = st + 8.6; // cage ladder up the wall through the band
    for (const dd of [-0.25, 0.25]) D.tube(pt(f, sl(f, lad + dd), yL, 0.25), pt(f, sl(f, lad + dd), Y(TOP + 1.0), 0.25), 0.03, 4);
    for (let y = yL + 0.3; y < Y(TOP + 0.9); y += 0.3) D.tube(pt(f, sl(f, lad - 0.25), y, 0.25), pt(f, sl(f, lad + 0.25), y, 0.25), 0.015, 3);
    for (let y = yL + 2.2; y < Y(TOP); y += 0.9) { const c = pt(f, sl(f, lad), y, 0.25); D.tube(pt(f, sl(f, lad - 0.4), y, 0.15), [c[0] + f.nx * 0.55, y, c[2] + f.nz * 0.55], 0.02, 3); D.tube([c[0] + f.nx * 0.55, y, c[2] + f.nz * 0.55], pt(f, sl(f, lad + 0.4), y, 0.15), 0.02, 3); }
    solid(f, st - 0.2, st + 9.0, o0, o3, yL - 0.1, yL, 'awning', 1);
    solid(f, st - 0.2, st + 1.2, o0, o3, yM - 0.1, yM, 'awning', 1);
    for (const a of [st - 0.2, st + 1.2, st + 7.5, st + 9.0]) { const p = pt(f, sl(f, a), 0, (o0 + o3) / 2); S.cyl(p[0], p[2], gB, yL, 0.08, 0.08, 'pole'); }
  }

  // ---- collision: the box to the top of the band
  S.prism((area2(ring) < 0 ? ring.slice().reverse() : ring).flat(), gB, Y(TOP), 0, 0, 'wall');

  // ---- meshes
  const sign = signTex();
  const M = mats({
    wall: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.55, metalness: 0.35 }),
    band: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.45, metalness: 0.2 }),
    dia: new THREE.MeshStandardMaterial({ map: diamondTex(), vertexColors: true, roughness: 0.4, metalness: 0.25, side: THREE.DoubleSide }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.35, metalness: 0.3 }),
  });
  const out = finish(root, 'delikat', B, M, ['wall', 'band', 'det']);
  console.log(`[cherkasy] Delikat: ${nWin} openings, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return {
    footprints: [{ poly: ring, h: Y(TOP) - gLo, kind: bld.k, name: 'Делікат' }],
    clear: (x, z) => x > x0 - 2 && x < x1 + CAND + 2 && z > z0 - 2 && z < z1 + 5,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.75 * k; M.sign.emissiveIntensity = 0.06 + 0.9 * k; },
  };
}
