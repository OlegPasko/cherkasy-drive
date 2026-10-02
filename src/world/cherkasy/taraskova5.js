// OWNER: cherkasy. The new ten-storey block at вул. Тараскова, 5 (Перемога, Соснівський район; built and in service,
// 224 flats, monolithic frame filled with aerated block under render), as the lun.ua catalogue photos show it built
// (lun.ua/new/cherkasy/taraskova-st-5; the render there is the earlier, greener design). OSM maps it as two houses,
// вул. Тараскова 11-Б (the L: the wing along Тараскова and the long wing behind) and 11-А (the third wing), which close a
// U round the yard that opens to the service road. The facades are drawn from the photos, section by section:
//   ST – the Тараскова front: a one-storey shop podium in graphite with full-height glazing standing 4.4 m out over a
//        raised paved terrace with steps and steel rails; above it white render with canted bay windows (continuous
//        ribbon glazing, a white ledge at every floor, olive spandrels on the upper floors of some bays), single
//        window stacks, and graphite panels over the top storeys;
//   YD – the yard fronts: the same bays and stacks, the entrances under dark canopies set in a grey ground-storey
//        panel, cellar hatches beside them;
//   OUT – the outer long fronts, the same vocabulary in another order;
//   E – the gable ends: blind white, nested olive and grey Г-stripes running up and across to the corner, a graphite
//       block at the top of one corner and a graphite base at the other (the photos' gables);
//   S – short OSM steps: one window stack, or plain wall.
// The block steps with the slope: each house is cut into sections (two along the street, two on the long wing, two
// on 11-А), each on its own floor level, the higher one's wall showing over the lower one's parapet. Flat roofs with a
// lift head per section. Windows, bays and shops light up at night. No developer name, logo or shop signs.
//   TARASKOVA5_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildTaraskova5({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every section edge is a slabkit face cut into zones by its programme. A window stack is one recessed pane the nine
// upper storeys high whose texture carries the windows and their lit pattern; a bay's glazing is one texture across
// its three faces. Wall colours are vertex colours on a fine render speckle.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf, inPoly } from './geo.js';
import { canvasTex } from './sculpt.js';
import { ringFaces, face, at, quad, rect, box, skin, hole, solid, finish, speckle } from './slabkit.js';

const A_ID = 994859234, B_ID = 1318428500;
const HOUSES = [[A_ID, 'вул. Тараскова, 5 (11-Б)'], [B_ID, 'вул. Тараскова, 5 (11-А)']];
export const TARASKOVA5_SKIP = new Set(HOUSES.map(([id]) => id));
// the sections [x0, x1, z0, z1]: the OSM outlines squared up (their 1–3 m jogs are the bays, built here as bays), cut
// where the block steps; the street wing has the tall shop storey
const SECTIONS = [
  { id: A_ID, box: [-3282, -3264.5, -2361, -2342.8], street: true },
  { id: A_ID, box: [-3282, -3264.5, -2380.5, -2361], street: true },
  { id: A_ID, box: [-3264.5, -3243, -2392.6, -2375.6] },
  { id: A_ID, box: [-3243, -3222.7, -2392.6, -2375.6] },
  { id: B_ID, box: [-3225, -3209.5, -2356, -2336.6] },
  { id: B_ID, box: [-3225, -3209.5, -2375.6, -2356] },
];
export const T5_YARD = [-3263, -3226, -2375, -2336];   // the yard between the wings [x0, x1, z0, z1]
const STREET_X = -3280;                                 // faces west of this, looking -x, are the Тараскова front

const FH = 3.0, NU = 9, PARA = 0.9, GF = 3.0, GF_ST = 4.2;  // storey, upper storeys, parapet, ground storey (shops)
const PD = 4.4, PH = 4.3;                                // shop podium reach and height
const WHITE = '#f1f1ee', GRAPH = '#3b3e43', OLIVE = '#a19f55', GREY = '#9a9da1', PLINTH = '#73767a', FRAME = '#f5f5f2', ROOFC = '#55575a';
const GFROM = { W: 99, G: 4, H: 7 };                     // the storey (1..NU) a wall pattern turns graphite from

// ------------------------------------------------------------------------------------------------ textures
// window stacks: per surround pattern an unlit and a lit column of 128 px (1.7 m), NU storeys of 192 px; the window
// 1.3 m wide from 0.9 to 2.45 m over the storey floor, white PVC, a mullion
const WPAT = ['W', 'G', 'H'], WCOL = 6, SW = 1.7, WPX = 128, WSH = 192;
function winTex(mask, lit) {
  return canvasTex(WPX * WCOL, WSH * NU, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const m = (v) => (v / SW) * WPX, sy = (k, y) => h - ((k - 1) * FH + y) / FH * WSH;
    for (let c = 0; c < WCOL; c++) {
      const p = WPAT[c >> 1], x0 = c * WPX;
      for (let k = 1; k <= NU; k++) {
        const ya = sy(k, 2.45), yb = sy(k, 0.9), lt = (c & 1) && lit[c][k];
        if (mask) { if (lt) { g.fillStyle = '#fff'; g.fillRect(x0 + m(0.24), ya, m(1.22), yb - ya); } continue; }
        g.fillStyle = k >= GFROM[p] ? GRAPH : WHITE; g.fillRect(x0, sy(k, FH), WPX, sy(k, 0) - sy(k, FH) + 0.5);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0 + m(0.16), ya - 3, m(1.38), yb - ya + 6);   // the reveal's shade
        const gr = g.createLinearGradient(x0, ya, x0 + 70, yb);
        gr.addColorStop(0, '#a9bccb'); gr.addColorStop(0.5, '#6f8494'); gr.addColorStop(1, '#46576a');
        g.fillStyle = gr; g.fillRect(x0 + m(0.2), ya, m(1.3), yb - ya);
        g.fillStyle = FRAME;
        g.fillRect(x0 + m(0.2), ya, m(1.3), 5); g.fillRect(x0 + m(0.2), yb - 6, m(1.3), 6);
        g.fillRect(x0 + m(0.2), ya, 5, yb - ya); g.fillRect(x0 + m(1.5) - 5, ya, 5, yb - ya); g.fillRect(x0 + m(0.85) - 2, ya, 5, yb - ya);
        g.fillStyle = '#d6d5d0'; g.fillRect(x0 + m(0.14), yb, m(1.42), 4);              // the sill
      }
    }
  }, { repeat: false, srgb: !mask });
}
// bay glazing: three variants side by side (A white spandrels, B olive from storey 6, C olive from storey 2), each 8
// panes of 0.75 m; per storey a spandrel to 0.9 m, glass to 2.75 m with a transom, a white ledge band over it
const PW = 0.75, NPANE = 8, BPX = 96, BFROM = [99, 6, 2];
function bayTex(mask, lit) {
  return canvasTex(BPX * NPANE * 3, WSH * NU, (g, w, h) => {
    g.fillStyle = mask ? '#000' : WHITE; g.fillRect(0, 0, w, h);
    const sy = (k, y) => h - ((k - 1) * FH + y) / FH * WSH;
    for (let v = 0; v < 3; v++) for (let i = 0; i < NPANE; i++) for (let k = 1; k <= NU; k++) {
      const x0 = (v * NPANE + i) * BPX, ya = sy(k, 2.75), yb = sy(k, 0.9), yt = sy(k, 1.35);
      if (mask) { if (lit[v][i][k]) { g.fillStyle = '#fff'; g.fillRect(x0 + 4, ya + 2, BPX - 8, yb - ya - 4); } continue; }
      if (k >= BFROM[v]) { g.fillStyle = OLIVE; g.fillRect(x0, yb, BPX, sy(k, 0.12) - yb); }
      const gr = g.createLinearGradient(x0, ya, x0 + BPX, yb);
      gr.addColorStop(0, '#b4c4d0'); gr.addColorStop(1, '#5d7080');
      g.fillStyle = gr; g.fillRect(x0 + 3, ya, BPX - 6, yb - ya);
      g.fillStyle = FRAME;
      g.fillRect(x0, ya, 5, yb - ya); g.fillRect(x0 + BPX - 5, ya, 5, yb - ya); g.fillRect(x0, yt - 2, BPX, 5);
      g.fillRect(x0, ya, BPX, 5); g.fillRect(x0, yb - 5, BPX, 5);
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x0, ya + 5, BPX, 4);
    }
  }, { repeat: false, srgb: !mask });
}

// ------------------------------------------------------------------------------------------------ programmes
// a zone: [width m, wall pattern, content]; content 'n' a window stack, 'bA' / 'bB' / 'bC' a canted bay in that
// glazing variant, 'e' an entrance with a stair window stack over it, '' blank. A programme repeats along a front,
// every other repeat mirrored, scaled to fit.
const PROG = {
  ST: [[0.4, 'W', ''], [2.9, 'G', 'n'], [3.4, 'W', 'bC'], [1.8, 'W', 'n'], [3.8, 'W', 'bA'], [1.8, 'W', 'n'], [3.4, 'W', 'bB'], [0.7, 'W', '']],
  YD: [[0.6, 'W', ''], [3.4, 'W', 'bB'], [1.8, 'W', 'n'], [3.4, 'W', 'e'], [2.9, 'G', 'n'], [3.8, 'W', 'bA'], [1.7, 'W', 'n']],
  OUT: [[0.6, 'W', ''], [3.4, 'W', 'bC'], [2.9, 'H', 'n'], [1.8, 'W', 'n'], [3.8, 'W', 'bB'], [1.8, 'W', 'n'], [2.9, 'G', 'n'], [0.6, 'W', '']],
};
const unitW = (u) => u.reduce((s, z) => s + z[0], 0);
function zonesFor(prog, L) {
  if (prog === 'S') return L >= 4.5 ? [[(L - 1.7) / 2, 'W', ''], [1.7, 'W', 'n'], [(L - 1.7) / 2, 'W', '']] : [[L, 'W', '']];
  if (prog === 'E') return [[L, 'W', 'E']];
  const u = PROG[prog], W = unitW(u), n = Math.max(1, Math.round(L / W)), k = L / (n * W), out = [];
  for (let i = 0; i < n; i++) for (const z of (i % 2 ? [...u].reverse() : u)) out.push([z[0] * k, z[1], z[2]]);
  return out;
}

// ------------------------------------------------------------------------------------------------ geometry helpers
const segDist = (a, b, x, z) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
};
const ringDist = (ring, x, z) => Math.min(...ring.map((a, i) => segDist(a, ring[(i + 1) % ring.length], x, z)));
// put the other house's corners that lie on an edge into it, so a partly shared edge splits where the sharing ends
function splitAt(ring, pts) {
  const out = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push(a);
    const on = pts.filter((p) => segDist(a, b, p[0], p[1]) < 0.15 && Math.hypot(p[0] - a[0], p[1] - a[1]) > 0.3 && Math.hypot(p[0] - b[0], p[1] - b[1]) > 0.3)
      .map((p) => [((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L), p]).sort((p, q) => p[0] - q[0]);
    for (const [t] of on) out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  });
  return out;
}

// ------------------------------------------------------------------------------------------------ the build
export function buildTaraskova5({ root, map, solids: S, zips: Z, heightAt }) {
  const blds = new Map(HOUSES.map(([id]) => [id, map.buildings?.find((q) => q.id === id)]));
  if (![...blds.values()].every(Boolean)) return null;
  const t0 = performance.now(), r = rng(5), n0 = S.count;
  const B = { wall: new MB(), det: new MB(), win: new MB(), bay: new MB(), glass: new MB(), lit: new MB() };
  const wlit = Array.from({ length: WCOL }, () => Array.from({ length: NU + 1 }, () => r() < 0.4));
  const blit = Array.from({ length: 3 }, () => Array.from({ length: NPANE }, () => Array.from({ length: NU + 1 }, () => r() < 0.45)));
  const UVW = [2.5, 2.5], xz = (p) => [p[0], p[2]];
  const rings = new Map([...blds].map(([id, b]) => [id, ringPts(b.p)]));
  let nStack = 0, nBay = 0;

  // the sections and their floor levels: each on the highest ground under it. An edge splits where a neighbour's
  // corner lies on it, so a partly shared wall is party only where it is shared.
  const boxRing = ([x0, x1, z0, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const secs = SECTIONS.map((d, i) => {
    const ring = splitAt(boxRing(d.box), SECTIONS.filter((_, j) => j !== i).flatMap((o) => boxRing(o.box)));
    const bb = bboxOf(ring), hs = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const x = bb.x0 + (bb.x1 - bb.x0) * i / 4, z = bb.z0 + (bb.z1 - bb.z0) * j / 4;
      if (inPoly(ring, x, z) || ringDist(ring, x, z) < 0.5) hs.push(heightAt(x, z));
    }
    const gf = d.street ? GF_ST : GF, yF = Math.max(...hs) + 0.1;
    return { ...d, ring, gf, yF, gLo: Math.min(...hs), top: yF + gf + NU * FH + PARA };
  });
  const near = (ring, p) => ringDist(ring, p[0], p[1]) < 0.6;

  for (const sec of secs) {
    const { ring, yF, gLo, gf } = sec, faces = ringFaces(ring), Y = (v) => yF + v, gB = gLo - 0.6;
    const fy = (k) => Y(gf + (k - 1) * FH), ROOF = Y(gf + NU * FH), TOP = ROOF + PARA;
    const gAt = (f, s, o) => { const p = at(f, s, 0, o); return heightAt(p[0], p[2]); };

    // a window stack 1.7 m wide the upper storeys high, recessed a little; reveals in the wall's colours
    const winStack = (f, m, p) => {
      const s0 = m - SW / 2, s1 = m + SW / 2, y0 = fy(1), y1 = ROOF, dep = 0.1, c = WPAT.indexOf(p) * 2 + (r() < 0.6 ? 1 : 0);
      f.cuts.push({ s0, s1, y0, y1 });
      const yg = GFROM[p] <= NU ? fy(GFROM[p]) : y1;
      for (const [a, b, col] of [[y0, yg, WHITE], [yg, y1, GRAPH]]) {
        if (b - a < 0.01) continue;
        B.det.setColor(col);
        quad(B.det, at(f, s0, a), at(f, s0, a, -dep), at(f, s0, b, -dep), at(f, s0, b), f.U);
        quad(B.det, at(f, s1, a), at(f, s1, a, -dep), at(f, s1, b, -dep), at(f, s1, b), f.U.map((v) => -v));
      }
      B.det.setColor(p === 'W' ? WHITE : GRAPH); quad(B.det, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -dep), at(f, s0, y1, -dep), [0, -1, 0]);
      B.det.setColor(WHITE); quad(B.det, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -dep), at(f, s0, y0, -dep), [0, 1, 0]);
      const u0 = c / WCOL + 0.001, u1 = (c + 1) / WCOL - 0.001;
      B.win.setColor('#ffffff');
      quad(B.win, at(f, s0, y0, -dep), at(f, s1, y0, -dep), at(f, s1, y1, -dep), at(f, s0, y1, -dep), f.N, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      // air-conditioner boxes beside some windows (the photos have plenty)
      if (p === 'W') for (let k = 1; k <= NU; k++) if (r() < 0.22) {
        const sa = r() < 0.5 ? s1 + 0.1 : s0 - 0.85;
        if (sa < 0.1 || sa + 0.75 > f.L - 0.1) continue;
        B.det.setColor('#e4e4e1'); box(B.det, f, sa, sa + 0.75, fy(k) + 0.5, fy(k) + 1.05, 0, 0.3, 'ftlru');
      }
      nStack++;
    };
    // a canted bay: wall line s0..s1, front s0 + C..s1 - C at D out; ribbon glazing over the upper storeys, a ledge
    // at every floor, the parapet band and a cap
    const bay = (f, s0, s1, v) => {
      const C = 0.55, D = 0.75, y0 = fy(1) - 0.05, y1 = ROOF;
      if (s1 - s0 < 2 * C + 0.8) return;
      f.cuts.push({ s0, s1, y0, y1: TOP });
      const P = [at(f, s0, 0), at(f, s0 + C, 0, D), at(f, s1 - C, 0, D), at(f, s1, 0)].map(xz);
      const cx = P.reduce((q, p) => q + p[0] / 4, 0), cz = P.reduce((q, p) => q + p[1] / 4, 0);
      const sides = [[P[0], P[1]], [P[1], P[2]], [P[2], P[3]]].map(([a, b]) => {   // normals away from the bay's middle
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), nx = dz / L, nz = -dx / L;
        const sg = ((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cz) * nz > 0 ? 1 : -1;
        return face(a, b, nx * sg, nz * sg);
      });
      const base = (v * NPANE) / (NPANE * 3);
      for (const g of sides) {
        const np = Math.max(1, Math.min(NPANE, Math.round(g.L / PW))), off = Math.floor(r() * (NPANE - np + 1));
        const ua = base + off / (NPANE * 3) + 0.0005, ub = base + (off + np) / (NPANE * 3) - 0.0005;
        B.bay.setColor('#ffffff');
        quad(B.bay, at(g, 0, y0), at(g, g.L, y0), at(g, g.L, y1), at(g, 0, y1), g.N, [[ua, 0], [ub, 0], [ub, 1], [ua, 1]]);
        B.det.setColor(WHITE); rect(B.det, g, 0, g.L, y1, TOP, 0, UVW);
      }
      const ledge = P.map(([x, z]) => [x, z]);
      B.det.setColor(WHITE);
      for (let k = 2; k <= NU; k++) B.det.extrude(ledge, [], fy(k) - 0.07, fy(k) + 0.09, { top: true, bottom: true, sides: true });
      B.det.fill(ledge, [], TOP + 0.04, true);
      B.det.setColor('#e2e1dc'); B.det.fill(ledge, [], y0, false);
      solid(S, f, s0, s1, 0, D, y0, TOP, 'wall');
      nBay++;
    };
    // ground storey: a window, or an entrance under a dark canopy in a grey panel, a cellar hatch beside it
    const gwin = (f, s0, s1) => {
      const y0 = Math.max(Y(0.9), gAt(f, (s0 + s1) / 2, 1) + 0.45), y1 = Y(Math.min(gf - 0.55, 2.45));
      if (y1 - y0 < 0.7 || s0 < 0.2 || s1 > f.L - 0.2) return;
      f.cuts.push({ s0, s1, y0, y1 });
      hole(B, f, { s0, s1, y0, y1, dep: 0.2, lit: r() < 0.5, glass: '#55687a', pitch: 0.75, sill: '#d6d5d0' });
    };
    const entry = (f, s0, s1) => {
      const m = s0 + (s1 - s0) * 0.62, d0 = m - 0.75, d1 = m + 0.75, yD = Y(2.3);
      B.det.setColor(GREY); // the grey panel round the door, the ground storey high
      for (const [a, b, c, d] of [[s0 + 0.15, d0, gB, Y(gf)], [d1, s1 - 0.15, gB, Y(gf)], [d0, d1, yD, Y(gf)]]) if (b > a) rect(B.det, f, a, b, c, d, 0.03);
      f.cuts.push({ s0: d0, s1: d1, y0: Y(0), y1: yD });
      hole(B, f, { s0: d0, s1: d1, y0: Y(0), y1: yD, dep: 0.3, door: true, lit: true, glass: '#3a3f45', frame: '#2c2e31', pitch: 0.75 });
      const cy = Y(2.65), w0 = m - 1.5, w1 = m + 1.5;
      B.det.setColor(GRAPH); box(B.det, f, w0, w1, cy, cy + 0.2, 0, 1.5, 'ftlru');
      solid(S, f, w0, w1, 0, 1.5, cy, cy + 0.2, 'awning', 1);
      const g = Math.min(gAt(f, m, 2), yF - 0.05), n = Math.max(1, Math.round((yF - g) / 0.16));
      for (let i = 0; i < n; i++) { B.det.setColor(i % 2 ? '#a7a7a3' : '#b2b2ad'); box(B.det, f, m - 1.3, m + 1.3, gB, yF - (yF - g) * i / n, 0, 1.4 + 0.3 * i, 'ftlr'); }
      solid(S, f, m - 1.3, m + 1.3, 0, 1.4 + 0.3 * n, gB, yF, 'step');
      // the cellar hatch: a dark sloped lid on a grey kerb
      const h0 = s0 + 0.2, h1 = Math.min(h0 + 1.1, w0 - 0.1), hg = gAt(f, (h0 + h1) / 2, 1.2);
      if (h1 - h0 > 0.7) {
        B.det.setColor(PLINTH); box(B.det, f, h0, h1, gB, hg + 0.25, 0, 2.2, 'ftlr');
        B.det.setColor('#2a2c2f');
        quad(B.det, at(f, h0, Math.max(hg + 0.3, Y(1.3)), 0), at(f, h1, Math.max(hg + 0.3, Y(1.3)), 0), at(f, h1, hg + 0.3, 2.2), at(f, h0, hg + 0.3, 2.2), [f.nx * 0.5, 0.87, f.nz * 0.5]);
        solid(S, f, h0, h1, 0, 2.2, gB, hg + 0.6, 'step');
      }
    };
    // the gable: nested olive and grey Г-stripes up and across to one corner, graphite blocks at the other corners
    const gable = (f) => {
      const L = f.L, top = ROOF - 0.6, gy = Y(gf);
      let s = L * 0.18, t = top;
      for (const [w, col] of [[0.7, OLIVE], [0.45, null], [0.7, OLIVE], [0.45, null], [1.2, GREY]]) {
        if (col) { B.det.setColor(col); rect(B.det, f, s, s + w, gy, t, 0.03); rect(B.det, f, s, L - 0.02, t - w, t, 0.03); }
        s += w; t -= w;
      }
      B.det.setColor(GRAPH);
      rect(B.det, f, 0.02, Math.min(3.2, L * 0.2), ROOF - 2.2 * FH, TOP - 0.05, 0.04);
      rect(B.det, f, L - Math.min(4.2, L * 0.3), L - 0.02, gB, Y(gf + 1.2), 0.04);
    };

    for (const f of faces) {
      const mid = xz(at(f, f.L / 2, 0)), a = xz(at(f, 0, 0)), b = xz(at(f, f.L, 0));
      const other = secs.find((o) => o !== sec && near(o.ring, a) && near(o.ring, b) && near(o.ring, mid));
      if (other) { // party wall: only what stands over the neighbour's parapet shows
        if (TOP > other.top + 0.05) skin(B.wall, { ...f, cuts: [] }, other.top - 0.05, TOP, WHITE, UVW);
        B.det.setColor(WHITE); box(B.det, f, 0, f.L, ROOF, TOP + 0.1, -0.25, 0.02, 'fbt');
        continue;
      }
      const yardP = [mid[0] + f.nx * 4, mid[1] + f.nz * 4], [YX0, YX1, YZ0, YZ1] = T5_YARD;
      const yard = yardP[0] > YX0 && yardP[0] < YX1 && yardP[1] > YZ0 && yardP[1] < YZ1;
      const street = sec.street && f.nx < -0.9 && mid[0] < STREET_X;
      const gableE = f.L >= 9 && f.L < 20 && ((f.nz > 0.9 && mid[1] > -2346) || (f.nx > 0.9 && mid[0] > -3224 && mid[1] < -2376) || (f.nz < -0.9 && mid[0] > -3223 && Math.abs(mid[1] + 2375) < 1));
      const prog = f.L < 9 ? 'S' : street ? 'ST' : gableE ? 'E' : yard ? 'YD' : 'OUT';
      f.prog = prog;
      let s = 0;
      for (const [w, p, what] of zonesFor(prog, f.L)) {
        const zf = face(xz(at(f, s, 0)), xz(at(f, s + w, 0)), f.nx, f.nz), m = w / 2;
        s += w;
        if (what === 'n') { winStack(zf, m, p); if (!street) gwin(zf, m - 0.65, m + 0.65); }
        else if (what[0] === 'b') { bay(zf, 0.15, w - 0.15, 'ABC'.indexOf(what[1])); if (!street) gwin(zf, 0.7, w - 0.7); }
        else if (what === 'e') { winStack(zf, w * 0.62, p); entry(zf, 0, w); }
        else if (what === 'E') gable(zf);
        // the wall: white, graphite over the pattern's storey; behind the podium nothing shows
        const y0 = street ? Y(PH - 0.2) : gB, yg = GFROM[p] <= NU ? fy(GFROM[p]) : TOP;
        if (yg > y0) skin(B.wall, zf, y0, yg, WHITE, UVW);
        if (yg < TOP) skin(B.wall, zf, Math.max(y0, yg), TOP, GRAPH, UVW);
      }
      // the parapet's inside and cap, the plinth
      B.det.setColor(WHITE); rect(B.det, f, 0, f.L, ROOF, TOP, -0.3, null, f.N.map((v) => -v));
      B.det.setColor('#d9d9d5'); box(B.det, f, -0.02, f.L + 0.02, TOP, TOP + 0.08, -0.32, 0.05, 'ftlr');
      if (!street) { B.det.setColor(PLINTH); box(B.det, f, 0, f.L, gB, Y(0.35), 0, 0.05, 'ft'); }
      if (Z && f.L > 3) { const p0 = at(f, 0, 0, -0.1), p1 = at(f, f.L, 0, -0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], TOP, f.nx, f.nz); }

      // the shop podium on the Тараскова front: glazing between graphite piers under a deep fascia, on a raised
      // paved terrace with steps down to the pavement and a steel rail
      if (street) {
        const L = f.L, yl = Math.min(...[0, 0.5, 1].map((t) => gAt(f, L * t, PD + 3)));
        B.det.setColor(GRAPH); box(B.det, f, 0, L, Y(3.2), Y(PH), 0, PD, 'ftlr');
        box(B.det, f, 0, L, gB, Y(3.2), 0, PD, 'lr');
        B.det.setColor('#4a4c50'); box(B.det, f, 0, L, Y(PH), Y(PH) + 0.25, -0.01, PD + 0.05, 'ftlr');
        B.det.setColor(ROOFC); B.det.fill([0, L, L, 0].map((s, i) => xz(at(f, s, 0, i < 2 ? 0 : PD + 0.05))), [], Y(PH) + 0.25, true);
        const pf = face(xz(at(f, 0, 0, PD)), xz(at(f, L, 0, PD)), f.nx, f.nz), np = Math.max(2, Math.round(L / 1.6));
        B.lit.setColor('#3e4a55'); rect(B.lit, pf, 0.2, L - 0.2, Y(0.1), Y(3.2), -0.08);
        B.det.setColor('#2b2d30');
        for (let i = 0; i <= np; i++) { const q = 0.2 + (L - 0.4) * i / np; box(B.det, pf, q - (i % 4 ? 0.04 : 0.18), q + (i % 4 ? 0.04 : 0.18), Y(0.1), Y(3.2), -0.08, 0, 'flr'); }
        box(B.det, pf, 0.2, L - 0.2, Y(2.45), Y(2.53), -0.08, -0.02, 'ft');
        B.det.setColor(PLINTH); box(B.det, pf, 0, L, gB, Y(0.1), -0.05, 0, 'f');
        solid(S, f, 0, L, 0, PD, gB, Y(PH) + 0.25, 'wall');
        // the terrace, its steps and rail
        const T1 = PD + 2.0, n = Math.max(1, Math.round((yF - yl) / 0.16));
        B.det.setColor('#b9b6ae'); box(B.det, f, 0, L, yl - 0.3, yF, PD, T1, 'ftlr');
        for (let i = 1; i <= n; i++) { const yy = yF - (yF - yl) * i / (n + 1); B.det.setColor(i % 2 ? '#a9a69f' : '#b4b1a9'); box(B.det, f, 0.3, L - 0.3, yl - 0.3, yy, T1, T1 + 0.3 * i, 'ftlr'); }
        solid(S, f, 0, L, PD, T1 + 0.3 * n, yl - 0.3, yF, 'step');
        B.det.setColor('#b8bcc0');
        const rail = [[0.2, 0.2 + L * 0.3], [0.2 + L * 0.55, L - 0.2]];
        for (const [ra, rb] of rail) {
          B.det.tube(at(f, ra, yF + 1.0, T1 - 0.1), at(f, rb, yF + 1.0, T1 - 0.1), 0.03, 4);
          for (let q = ra; q <= rb + 0.01; q += (rb - ra) / Math.max(1, Math.round((rb - ra) / 1.8))) B.det.tube(at(f, q, yF, T1 - 0.1), at(f, q, yF + 1.0, T1 - 0.1), 0.025, 4);
        }
      }
    }

    // the roof and its lift head
    B.det.setColor(ROOFC); B.det.fill(ring, [], ROOF + 0.02, true);
    const bb = bboxOf(ring), cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2, a = 2.4, d = 2.2, H = 3.3;
    const hr = [[cx - a, cz - d], [cx + a, cz - d], [cx + a, cz + d], [cx - a, cz + d]];
    if (hr.every(([x, z]) => inPoly(ring, x, z))) {
      for (const g of ringFaces(hr)) { B.det.setColor(WHITE); rect(B.det, g, 0, g.L, ROOF, ROOF + H); B.det.setColor('#cfcfca'); box(B.det, g, -0.05, g.L + 0.05, ROOF + H, ROOF + H + 0.15, -0.1, 0.06, 'ft'); }
      B.det.setColor('#68696b'); B.det.fill(hr, [], ROOF + H + 0.12, true);
      S.prism(hr.flat(), ROOF, ROOF + H + 0.15, 0, 0, 'equipment');
    }
    S.prism(ring.flat(), gB, TOP, 0, 0, 'wall');
  }

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.92 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    win: new THREE.MeshStandardMaterial({ map: winTex(false, wlit), vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: new THREE.Color('#ffd5a0'), emissiveMap: winTex(true, wlit), emissiveIntensity: 0 }),
    bay: new THREE.MeshStandardMaterial({ map: bayTex(false, blit), vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: new THREE.Color('#ffd5a0'), emissiveMap: bayTex(true, blit), emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: new THREE.Color('#ffe2b8'), emissiveIntensity: 0 }),
  };
  const out = finish(root, 'taraskova5', B, M, { shade: ['wall', 'det', 'bay'] });
  console.log(`[cherkasy] Тараскова 5: ${secs.length} sections, ${nStack} stacks, ${nBay} bays, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const footprints = HOUSES.map(([id, name]) => {
    const own = secs.filter((q) => q.id === id);
    return { poly: rings.get(id), h: Math.max(...own.map((q) => q.top)) - Math.min(...own.map((q) => q.gLo)), kind: 'apt', name };
  });
  const all = [...rings.values()], boxes = all.map(bboxOf);
  const podium = [-3282 - PD - 3, -3282, -2343, -2378.3];   // the shop podium and its terrace on the street front
  return {
    footprints,
    // generated trees keep 3 m off the houses and off the podium terrace
    clear: (x, z) => (x > podium[0] && x < podium[1] && z < podium[2] && z > podium[3])
      || all.some((q, i) => x > boxes[i].x0 - 3 && x < boxes[i].x1 + 3 && z > boxes[i].z0 - 3 && z < boxes[i].z1 + 3 && (inPoly(q, x, z) || ringDist(q, x, z) < 3)),
    update() { const k = nightK.value; M.win.emissiveIntensity = 1.0 * k; M.bay.emissiveIntensity = 0.9 * k; M.lit.emissiveIntensity = 0.8 * k; },
  };
}
