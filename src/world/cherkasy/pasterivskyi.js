// OWNER: cherkasy. ЖК «Пастерівський», вул. Олександра Маламужа, 31 (corner of Пастерівська, Sosnivka / Зелений): a
// residential complex in project and under construction, built as the developer's renders show it (lun.ua new-builds
// catalogue: lun.ua/new/cherkasy/pasterivskyi, its general plan and three renders; the developer's site
// pasterivsky.com.ua: three more renders). Eight 10-storey sections on a 1.9 ha lot, paired end to end into the four
// bars OSM already has (DIM_RIA, 2025): three across the lot parallel to Пастерівська and one along its north-east side.
// Built per bar: a graphite ground floor (shopfronts under a dark fascia on the street sides and the ends, garage doors
// and two glazed lobbies with canopies on the yard sides); nine storeys of white render with punched windows and
// recessed loggias behind glass rails; at both ends of every long side a tower of violet standing-seam cladding with
// tall windows, floor bands and perforated "branch" screens that glow at night; a violet strip at the junction of the
// two sections on the outer sides, a graphite stair strip on the yard sides; the end walls with two stacks of projecting
// balconies; parapets, lift rooms. Round them: a one-storey garage block with black grilles on Пастерівська in front
// of the south bar, a two-storey glass pavilion with white fins by the east corner, the yard with a rubber-surfaced
// playground and a fenced sports court, car parks off Маламужа and along Пастерівська, paving, lamps and trees.
// No developer logo, no sign, no lettering anywhere. The renders show no rooftop terrace, so the roofs are plain.
//   PASTER_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildPasterivskyi({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), spots, footprints, parked } | null
// The bars are rebuilt as rectangles from the OSM outlines (geo.obb); every side is a face (bldkit.js frames: s along
// the edge, y up, o outward) cut into zones (violet ends, white field, junction strip). Everything round them is laid
// in a lot frame: u along the bars (from the north bar's west corner, toward the north-east), v across toward Пастерівська.
import * as THREE from 'three';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal as decalMat } from './sculpt.js';
import { obb, rng } from './geo.js';
import { edgeFaces, pt, quad, panel, fbox, wall, win, mats, finish, winTex, winEmTex } from './bldkit.js';
import { MB } from '../../kit/mesh.js';

const BAR_A = 1430787298, BAR_B = 1430787299, BAR_C = 1430787297, BAR_D = 1430787300; // north, middle, south (Пастерівська), east
export const PASTER_SKIP = new Set([BAR_A, BAR_B, BAR_C, BAR_D]);
const NAME = 'ЖК «Пастерівський»';

// the lot frame: origin at the north bar's west corner, u along the bars (2.55 degrees off map +x), v toward Пастерівська
const LOT_O = [-2203.4, 1482.6], LOT_A = -2.55 * Math.PI / 180;
const LU = [Math.cos(LOT_A), Math.sin(LOT_A)], LV = [-Math.sin(LOT_A), Math.cos(LOT_A)];
const L = (u, v) => [LOT_O[0] + LU[0] * u + LV[0] * v, LOT_O[1] + LU[1] * u + LV[1] * v];
const toUV = (x, z) => { const dx = x - LOT_O[0], dz = z - LOT_O[1]; return [dx * LU[0] + dz * LU[1], dx * LV[0] + dz * LV[1]]; };
const LOT = { u0: -11, u1: 117, v0: -21, v1: 141 }; // the lot (its west edge along the Маламужа sidewalk slants: see westEdge)
const westEdge = (v) => -11.6 - 0.064 * (v + 27); // the lot's west edge along the Маламужа footway (OSM), u at v

const GF = 4.2, FH = 3.0, NF = 9, PARA = 0.9;          // ground floor, typical storey, storeys over it, parapet
const PW = 10.6, PROUD = 0.15, JW = 1.7, RET = 4.0;  // ... and RET: how far the violet wraps round onto the end walls                 // the violet end towers' width and projection; half the junction strip
const WHITE = '#f1eeea', GRAPH = '#5e5755', VIOLET_D = '#3a3046', COPING = '#4a4752', REVEAL = '#dedce3';
const GARAGE = '#2a2936', ROOF = '#5b5a5f', SOFFIT = '#d9d6dd';
// per bar: the role of the side whose outward normal points along the lot frame (-v, +v, -u, +u)
// street: shopfronts below, a violet junction strip; out: garages and lobbies below, a violet strip; yard: garages and
// lobbies, a graphite stair strip; end: shopfronts below, balconies above
const ROLES = {
  [BAR_A]: { '-v': 'out', '+v': 'yard', '-u': 'end', '+u': 'end' },
  [BAR_B]: { '-v': 'yard', '+v': 'yard', '-u': 'end', '+u': 'end' },
  [BAR_C]: { '-v': 'yard', '+v': 'street', '-u': 'end', '+u': 'end' },
  [BAR_D]: { '-v': 'end', '+v': 'end', '-u': 'yard', '+u': 'out' },
};
const endStacks = (zw) => [[zw - 3.9, zw - 0.6]]; // the end walls' balcony stack: one, by a corner (s along the end wall)
const PODIUM = { s0: 0, s1: 40, d: 8, h: 3.8 };          // on bar C's street side, from its east end (s = 0 there)
const PAVILION = { u0: 82, u1: 98, v0: 96, v1: 110, h: 8.0 };
const COURT = { u0: 31, u1: 59, v0: 26.5, v1: 42.5 };
const PLAY = { u0: 28, u1: 62, v0: 79, v1: 99 };

// ------------------------------------------------------------------------------------------------ textures
// violet standing-seam cladding: 0.5 m trays, each seam a light rib with a shadow, a faint vertical streak
const seamTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#76657f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    const x = i * w / 4;
    const tray = g.createLinearGradient(x, 0, x + w / 4, 0);
    tray.addColorStop(0, '#806e8a'); tray.addColorStop(0.5, '#76657f'); tray.addColorStop(1, '#695872');
    g.fillStyle = tray; g.fillRect(x, 0, w / 4, h);
    g.fillStyle = '#8e7aa0'; g.fillRect(x, 0, 2, h);
    g.fillStyle = '#3d3047'; g.fillRect(x + 2, 0, 2, h);
  }
});
// perforated screen: a silver-violet sheet with the branches cut out (dark holes that glow at night); mask = the holes
const perfTex = (mask) => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = mask ? '#000' : '#6f6782'; g.fillRect(0, 0, w, h);
  const r = rng(77);
  g.strokeStyle = mask ? '#ffffff' : '#a59fb3'; g.lineCap = 'round';
  const branch = (x, y, a, len, wd, depth) => {
    if (depth > 5 || len < 6) return;
    const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len;
    g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * 14, (y + y2) / 2, x2, y2); g.stroke();
    branch(x2, y2, a + 0.3 + r() * 0.4, len * 0.72, wd * 0.7, depth + 1);
    branch(x2, y2, a - 0.3 - r() * 0.4, len * 0.68, wd * 0.7, depth + 1);
  };
  for (const [x0, a] of [[w * 0.3, 1.45], [w * 0.75, 1.7], [w * 0.5, 1.55]]) branch(x0, h + 4, a, 70, 9, 0);
  if (!mask) { // the perforation dots over the sheet
    g.fillStyle = 'rgba(30,26,40,0.4)';
    for (let y = 3; y < h; y += 6) for (let x = (y % 12) ? 3 : 6; x < w; x += 6) g.fillRect(x, y, 1.5, 1.5);
  }
});
// concrete paving tiles 0.5 m (the walks) – the asphalt and the surfaces reuse it, tinted by vertex colour
const paveTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#d8d6d2'; g.fillRect(0, 0, w, h);
  const r = rng(5);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const k = 205 + Math.round(r() * 30);
    g.fillStyle = `rgb(${k},${k - 2},${k - 6})`; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
});
// ------------------------------------------------------------------------------------------------ build
export function buildPasterivskyi({ root, map, solids: S, zips: Z, heightAt }) {
  const recs = [BAR_A, BAR_B, BAR_C, BAR_D].map((id) => map.buildings.find((b) => b.id === id)).filter(Boolean);
  if (!recs.length) return null;
  const t0 = performance.now(), n0 = S.count ?? 0;
  const B = { wall: new MB(), pur: new MB(), det: new MB(), glass: new MB(), lit: new MB(), shop: new MB(), perf: new MB(),
    rail: new MB(), gnd: new MB(), paint: new MB(), lamp: new MB() };
  const r = rng(31);
  const footprints = [], blocked = []; // blocked: lot-frame rectangles trees keep off
  let nWin = 0;
  const sub = (f, s0, s1, o = 0) => ({ ...f, ax: f.ax + f.ux * s0 + f.nx * o, az: f.az + f.uz * s0 + f.nz * o, L: s1 - s0 });
  const lit = (p = 0.3) => r() < p;
  const SOLID = { det: B.det, glass: B.det, lit: B.det }; // win() with an untextured leaf in place of glass (doors, grilles)
  const parts = []; // bar data for the lot work: { id, F: faces, yF, gLo }

  for (const rec of recs) {
    const id = rec.id, P = [];
    for (let i = 0; i < rec.p.length; i += 2) P.push([rec.p[i], rec.p[i + 1]]);
    const ob = obb(P);
    const wx = -ob.uz, wz = ob.ux, hl = ob.L / 2, hw = ob.W / 2;
    const ring = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([a, b]) => [ob.cx + ob.ux * a + wx * b, ob.cz + ob.uz * a + wz * b]);
    const hs = ring.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
    const yF = gHi + 0.15, y1st = yF + GF, yR = y1st + NF * FH, yTop = yR + PARA, gBase = gLo - 0.6;
    const faces = edgeFaces(ring);
    parts.push({ id, faces, yF, gLo, ring });
    const roleOf = (f) => {
      const nu = f.nx * LU[0] + f.nz * LU[1], nv = f.nx * LV[0] + f.nz * LV[1];
      return ROLES[id][Math.abs(nv) > Math.abs(nu) ? (nv < 0 ? '-v' : '+v') : (nu < 0 ? '-u' : '+u')];
    };

    for (const f of faces) {
      const role = roleOf(f), W = f.L, long = W > 30;
      const podium = id === BAR_C && role === 'street' ? PODIUM : null;
      // the podium stands against this side from its east end: s runs from there when the face's s grows westward
      const eastAtS0 = (f.ux * LU[0] + f.uz * LU[1]) < 0;
      const podS = podium ? (eastAtS0 ? [podium.s0, podium.s1] : [W - podium.s1, W - podium.s0]) : null;
      f.role = role; f.podS = podS;

      // ---- ground floor: graphite, shopfronts or garages + lobbies
      const gh = []; // holes
      const shops = role === 'street' || role === 'end';
      if (shops) {
        const n = Math.max(1, Math.round((W - 1.2) / 3.4)), p = (W - 1.2) / n;
        for (let j = 0; j < n; j++) {
          const s0 = 0.6 + j * p + 0.25, s1 = 0.6 + (j + 1) * p - 0.25;
          if (podS && s1 > podS[0] - 0.3 && s0 < podS[1] + 0.3) continue;
          gh.push({ s0, s1, y0: yF + 0.1, y1: yF + 3.3, dep: 0.25, lit: true, cols: 3, rows: 1, glass: '#a9b4bd', shop: true });
        }
      } else {
        const lob = long ? [W * 0.25, W * 0.75] : [W / 2];
        for (const c of lob) gh.push({ s0: c - 1.3, s1: c + 1.3, y0: yF, y1: yF + 3.0, dep: 0.35, lit: true, cols: 2, rows: 1, glass: '#e8e4d8', lobby: true });
        for (let s = 1.2; s + 2.7 < W - 1.0; s += 3.25) {
          if (lob.some((c) => s + 2.6 > c - 2.2 && s < c + 2.2)) continue;
          gh.push({ s0: s, s1: s + 2.6, y0: yF, y1: yF + 2.5, dep: 0.12, garage: true });
        }
      }
      for (const q of gh) { // the openings come down to the ground under them (the floor is level with the bar's high end)
        const c = pt(f, (q.s0 + q.s1) / 2, 0, 0.6), gl = Math.min(yF, heightAt(c[0], c[2]) + 0.08), h = q.y1 - q.y0;
        q.y0 = gl; q.y1 = q.shop ? Math.max(q.y1, gl + 2.6) : Math.min(y1st - 0.4, gl + h);
      }
      B.det.setColor(GRAPH); wall(B.det, f, gBase, y1st, gh);
      for (const q of gh) {
        nWin++;
        if (q.garage) { win(SOLID, f, { ...q, rev: GRAPH, glass: GARAGE }); B.det.setColor('#1f1e28'); for (let y = q.y0 + 0.42; y < q.y1 - 0.1; y += 0.42) fbox(B.det, f, q.s0, q.s1, y - 0.02, y + 0.02, -0.08, -0.06, 'ft'); continue; }
        win(q.shop ? { det: B.det, glass: B.shop, lit: B.shop } : B, f, { ...q, rev: GRAPH });
        if (q.lobby) { // a flat canopy on the lobby, a step to the door
          B.det.setColor(GRAPH); fbox(B.det, f, q.s0 - 0.8, q.s1 + 0.8, q.y1 + 0.1, q.y1 + 0.35, 0, 1.6, 'fblrtu');
          const a = pt(f, q.s0 - 0.8, 0, 0), b = pt(f, q.s1 + 0.8, 0, 1.6), c = pt(f, q.s1 + 0.8, 0, 0), d = pt(f, q.s0 - 0.8, 0, 1.6);
          S.prism([a[0], a[2], c[0], c[2], b[0], b[2], d[0], d[2]], q.y1 + 0.1, q.y1 + 0.35, 0, 0, 'awning', 1);
          B.det.setColor('#8d8a86'); fbox(B.det, f, q.s0 - 0.5, q.s1 + 0.5, q.y0 - 0.5, q.y0, 0, 1.4, 'flrt');
        }
      }
      if (shops) { // the dark fascia over the shopfronts
        B.det.setColor('#24232b');
        for (const [a, b] of podS ? [[0, podS[0]], [podS[1], W]] : [[0, W]]) if (b - a > 0.5) fbox(B.det, f, a, b, yF + 3.45, yF + 4.0, 0, 0.3, 'ftu');
      }

      // ---- upper floors: zones along the face
      const zones = [];
      if (long) {
        zones.push({ k: 'tower', s0: 0, s1: PW, corner: 0 }, { k: 'tower', s0: W - PW, s1: W, corner: W });
        const jk = role === 'yard' ? 'stair' : 'strip';
        zones.push({ k: jk, s0: W / 2 - JW, s1: W / 2 + JW });
        zones.push({ k: 'field', s0: PW, s1: W / 2 - JW }, { k: 'field', s0: W / 2 + JW, s1: W - PW });
      } else {
        zones.push({ k: 'ret', s0: 0, s1: RET }, { k: 'ret', s0: W - RET, s1: W }, { k: 'endf', s0: RET, s1: W - RET });
      }
      for (const z of zones) {
        const zw = z.s1 - z.s0;
        if (z.k === 'tower' || z.k === 'ret' || z.k === 'strip') {
          // violet: a box PROUD out of the wall plane, its own face frame on the front
          const g = sub(f, z.s0, z.s1, PROUD), holes = [];
          const TW = [[1.7, 3.25], [4.3, 5.85], [6.9, 8.45]]; // the tower's windows, metres from its outer corner
          const wins = z.k === 'tower' ? TW.map(([a, b]) => (z.corner === 0 ? [a, b] : [zw - b, zw - a]))
            : [[zw / 2 - 0.75, zw / 2 + 0.75]];
          for (let k = 0; k < NF; k++) for (const [a, b] of wins) holes.push({ s0: a, s1: b, y0: y1st + k * FH + 0.3, y1: y1st + k * FH + 2.65 });
          B.pur.setColor('#ffffff'); wall(B.pur, g, y1st, yTop + 0.25, holes, [2, 2]);
          fbox(B.pur, f, z.s0, z.s1, y1st, yTop + 0.25, 0, PROUD, 'lru');
          for (const q of holes) { nWin++; win(B, g, { ...q, dep: 0.25, lit: lit(0.32), cols: 2, rows: 1, rev: VIOLET_D, glass: '#cdc6da' }); }
          B.det.setColor(VIOLET_D); fbox(B.det, f, z.s0 - 0.02, z.s1 + 0.02, yTop + 0.25, yTop + 0.33, -0.3, PROUD + 0.03, 'ftlr');
          if (z.k === 'tower') { // floor bands and the perforated screens
            const perf = [[0.3, 1.5], [9.0, 10.3]].map(([a, b]) => (z.corner === 0 ? [a, b] : [zw - b, zw - a]));
            for (let k = 0; k < NF; k++) {
              const fy = y1st + k * FH;
              B.pur.setColor('#c9c0da'); fbox(B.pur, g, 0, zw, fy - 0.1, fy + 0.1, 0, 0.1, 'ftu');
              B.perf.setColor('#ffffff');
              for (const [a, b] of perf) panel(B.perf, g, a, b, fy + 0.3, fy + 2.65, 0.06, [b - a, 2.35 * 2]);
            }
          }
        } else if (z.k === 'stair') {
          const g = sub(f, z.s0, z.s1, 0), holes = [];
          for (let k = 0; k < NF; k++) holes.push({ s0: zw / 2 - 0.6, s1: zw / 2 + 0.6, y0: y1st + k * FH + 1.3, y1: y1st + k * FH + 2.5 });
          B.det.setColor('#3d3b46'); wall(B.det, g, y1st, yTop, holes);
          for (const q of holes) { nWin++; win(B, g, { ...q, dep: 0.15, lit: lit(0.5), cols: 1, rows: 1, rev: '#2c2b33', glass: '#bfc4c8' }); }
        } else {
          // white: punched windows and loggias (fields), or windows and balcony stacks (end walls)
          const g = sub(f, z.s0, z.s1, 0), holes = [], loggias = [], balc = [];
          if (z.k === 'field') {
            const n = Math.max(1, Math.round(zw / 3.2)), p = zw / n, every = role === 'yard' ? 3 : 4;
            for (let j = 0; j < n; j++) {
              const c = p * (j + 0.5), lg = (j % every) === 1;
              for (let k = 0; k < NF; k++) {
                const fy = y1st + k * FH;
                if (lg) loggias.push({ s0: c - (p - 0.75) / 2, s1: c + (p - 0.75) / 2, y0: fy, y1: fy + FH - 0.32 });
                else holes.push({ s0: c - 0.72, s1: c + 0.72, y0: fy + 0.85, y1: fy + 2.55 });
              }
            }
          } else {
            const bs = endStacks(zw), free = zw - 4.5, nw = Math.max(1, Math.round(free / 3.2));
            for (let k = 0; k < NF; k++) {
              const fy = y1st + k * FH;
              for (const [a, b] of bs) balc.push({ s0: a + 0.3, s1: b - 0.3, y0: fy, y1: fy + 2.4, a, b, fy });
              for (let j = 0; j < nw; j++) { const c = (j + 0.5) * free / nw; holes.push({ s0: c - 0.7, s1: c + 0.7, y0: fy + 0.85, y1: fy + 2.55 }); }
            }
          }
          B.wall.setColor(WHITE); wall(B.wall, g, y1st, yTop, [...holes, ...loggias, ...balc], [2.5, 2.5]);
          for (const q of holes) { nWin++; win(B, g, { ...q, dep: 0.2, lit: lit(0.3), cols: 2, rows: 1, rev: REVEAL }); }
          for (const q of loggias) {
            nWin++;
            win(B, g, { ...q, dep: 1.3, lit: lit(0.3), cols: 3, rows: 1, rev: SOFFIT, glass: '#dcdfe4' });
            B.rail.setColor('#cfd8de'); panel(B.rail, g, q.s0, q.s1, q.y0, q.y0 + 1.05, -0.05);
            B.det.setColor('#2d2c33'); fbox(B.det, g, q.s0, q.s1, q.y0 + 1.03, q.y0 + 1.08, -0.08, -0.02, 'ft');
          }
          for (const q of balc) { // a projecting slab, glass rails on three sides, the door and window behind
            nWin++;
            win(B, g, { ...q, dep: 0.2, lit: lit(0.3), cols: 3, rows: 1, rev: REVEAL, glass: '#dcdfe4' });
            const D = 1.5;
            B.det.setColor('#4c4552'); fbox(B.det, g, q.a, q.b, q.fy - 0.2, q.fy, 0, D, 'flrt');
            B.det.setColor(SOFFIT); fbox(B.det, g, q.a, q.b, q.fy - 0.2, q.fy, 0, D, 'u');
            B.rail.setColor('#6e6878');
            panel(B.rail, g, q.a, q.b, q.fy, q.fy + 1.05, D);
            B.det.setColor('#2d2c33'); fbox(B.det, g, q.a, q.b, q.fy + 1.03, q.fy + 1.08, D - 0.04, D, 'ftl');
          }
          if (z.k === 'endf') for (const [a, b] of endStacks(zw)) {
            // the side rails of the stack (two quads a storey) and its collision prism
            for (let k = 0; k < NF; k++) {
              const fy = y1st + k * FH;
              B.rail.setColor('#6e6878');
              for (const s of [a, b]) quad(B.rail, pt(g, s, fy, 0), pt(g, s, fy, 1.5), pt(g, s, fy + 1.05, 1.5), pt(g, s, fy + 1.05, 0), [g.ux, 0, g.uz]);
            }
            const c = [pt(g, a, 0, 0), pt(g, b, 0, 0), pt(g, b, 0, 1.5), pt(g, a, 0, 1.5)];
            S.prism(c.flatMap((p) => [p[0], p[2]]), y1st - 0.2, yR, 0, 0, 'wall');
          }
        }
      }
      // parapet: the inner face and a coping over the white and graphite parts
      B.det.setColor('#cfccd4'); panel(B.det, f, 0, W, yR, yTop, -0.3, null, [-f.nx, 0, -f.nz]);
      B.det.setColor(COPING); fbox(B.det, f, 0, W, yTop, yTop + 0.08, -0.32, 0.04, 'ftu');
      if (W > 3) { const a0 = pt(f, 0, 0, -0.15), a1 = pt(f, W, 0, -0.15); Z.edge(a0[0], a0[2], a1[0], a1[2], yTop, f.nx, f.nz); }
    }

    // roof, lift rooms over each section, a couple of vents
    B.det.setColor(ROOF); B.det.fill(ring, [], yR, true);
    for (const t of [-0.25, 0.25]) {
      const cx = ob.cx + ob.ux * ob.L * t, cz = ob.cz + ob.uz * ob.L * t;
      const lr = [[-2.6, -1.8], [2.6, -1.8], [2.6, 1.8], [-2.6, 1.8]].map(([a, b]) => [cx + ob.ux * a + wx * b, cz + ob.uz * a + wz * b]);
      for (const g of edgeFaces(lr)) { B.wall.setColor(WHITE); panel(B.wall, g, 0, g.L, yR, yR + 3.2, 0, [2.5, 2.5]); B.det.setColor(COPING); fbox(B.det, g, -0.05, g.L + 0.05, yR + 3.2, yR + 3.3, -0.1, 0.05, 'ft'); }
      B.det.setColor(ROOF); B.det.fill(lr, [], yR + 3.3, true);
      S.prism(lr.flat(), yR, yR + 3.3, 0, 0, 'bulkhead');
      for (const sg of [-1, 1]) { B.det.setColor('#8f8d94'); B.det.cyl(cx + ob.ux * 6 * sg + wx * 3 * sg, yR, cz + ob.uz * 6 * sg + wz * 3 * sg, 0.25, 0.25, 1.4, 6, true); }
    }
    S.prism(ring.flat(), gBase, yTop, 0, 0, 'wall');
    footprints.push({ poly: ring.map((p) => [p[0], p[1]]), h: yTop - gLo, kind: 'apt', name: NAME });
  }

  // ------------------------------------------------------------------------------------------------ the lot
  const up = [0, 1, 0], H = (x, z) => heightAt(x, z) + 0.17; // the land is drawn 0.15 over heightAt, its cover 0.165
  const P = (u, v, lift = 0) => { const [x, z] = L(u, v); return [x, H(x, z) + lift, z]; };
  // a surface rectangle in the lot frame draped over the ground in cells of at most 3 m; uv in metres / rep
  const surf = (D, u0, u1, v0, v1, col, lift = 0, rep = 1) => {
    D.setColor(col);
    const nu = Math.max(1, Math.ceil((u1 - u0) / 3)), nv = Math.max(1, Math.ceil((v1 - v0) / 3));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = u0 + (u1 - u0) * i / nu, b = u0 + (u1 - u0) * (i + 1) / nu, c = v0 + (v1 - v0) * j / nv, d = v0 + (v1 - v0) * (j + 1) / nv;
      quad(D, P(a, c, lift), P(b, c, lift), P(b, d, lift), P(a, d, lift), up, [[a / rep, c / rep], [b / rep, c / rep], [b / rep, d / rep], [a / rep, d / rep]]);
    }
  };
  const strip = (u0, v0, u1, v1, w = 0.12, col = '#ecebe6') => { // a painted line a little over the surface
    const du = u1 - u0, dv = v1 - v0, l = Math.hypot(du, dv), nu = -dv / l * w / 2, nv = du / l * w / 2, n = Math.max(1, Math.ceil(l / 3));
    B.paint.setColor(col);
    for (let i = 0; i < n; i++) {
      const a = [u0 + du * i / n, v0 + dv * i / n], b = [u0 + du * (i + 1) / n, v0 + dv * (i + 1) / n];
      quad(B.paint, P(a[0] - nu, a[1] - nv, 0.02), P(b[0] - nu, b[1] - nv, 0.02), P(b[0] + nu, b[1] + nv, 0.02), P(a[0] + nu, a[1] + nv, 0.02), up);
    }
  };
  const block = (u0, u1, v0, v1) => blocked.push([u0, u1, v0, v1]);
  const PAVE = '#a19e98', ASPH = '#56575b';

  // bar outlines in the lot frame (for the walks round them)
  const barUV = parts.map(({ ring }) => { const q = ring.map(([x, z]) => toUV(x, z)); return [Math.min(...q.map((p) => p[0])), Math.max(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[1]))]; });
  for (const [u0, u1, v0, v1] of barUV) { // a 3 m paved walk round every bar
    surf(B.gnd, u0 - 3, u1 + 3, v0 - 3, v0, PAVE, 0, 2); surf(B.gnd, u0 - 3, u1 + 3, v1, v1 + 3, PAVE, 0, 2);
    surf(B.gnd, u0 - 3, u0, v0, v1, PAVE, 0, 2); surf(B.gnd, u1, u1 + 3, v0, v1, PAVE, 0, 2);
    block(u0 - 3.5, u1 + 3.5, v0 - 3.5, v1 + 3.5);
  }
  // the yard's spine walk (between the cross bars and the east bar) and two cross walks to the parks
  surf(B.gnd, 79, 82.5, 17, 106, PAVE, 0, 2); block(78.5, 83, 17, 106);
  for (const v of [47.5, 101.5]) { surf(B.gnd, 2, 79, v - 1.25, v + 1.25, PAVE, 0, 2); block(2, 79, v - 1.6, v + 1.6); }

  // car parks off Маламужа between the bars (two rows facing an aisle) and along Пастерівська (one row by the walk)
  const parked = [];
  const BW = 2.5, BL = 5.0;
  const park = (u0, u1, rows) => {
    const vmin = Math.min(...rows.map((q) => Math.min(q[0], q[1]))), vmax = Math.max(...rows.map((q) => Math.max(q[0], q[1])));
    surf(B.gnd, u0, u1, vmin, vmax, ASPH, 0.005, 3); block(u0 - 0.5, u1 + 0.5, vmin, vmax);
    for (const [va, vb, dir] of rows) {
      if (!dir) continue; // the aisle
      const n = Math.floor((u1 - u0 - 1) / BW);
      for (let i = 0; i <= n; i++) strip(u0 + 0.5 + i * BW, va, u0 + 0.5 + i * BW, vb);
      for (let i = 0; i < n; i++) {
        if (hashBay(u0, va, i) > 0.55) continue;
        const [x, z] = L(u0 + 0.5 + (i + 0.5) * BW, (va + vb) / 2), fv = dir > 0 ? LV : [-LV[0], -LV[1]];
        parked.push([x, z, -Math.atan2(fv[1], fv[0])]);
      }
    }
  };
  const hashBay = (a, b, i) => { const s = Math.sin(a * 12.9898 + b * 78.233 + i * 37.719) * 43758.5453; return s - Math.floor(s); };
  const wU = (v) => westEdge(v) + 0.6; // car parks start a little inside the lot's west edge
  park(wU(28), 24, [[25, 30, -1], [30, 36.5, 0], [36.5, 41.5, 1]]);
  park(wU(88), 24, [[80.5, 85.5, -1], [85.5, 92, 0], [92, 97, 1]]);
  park(wU(135), 32, [[129.5, 133, 0], [133, 138, 1]]); // the drive from the corner, then the bays by the walk
  // the front walk along Маламужа (in front of the shop ends) and the ends of the cross walks
  for (const [v0, v1] of [[-6, 22], [44, 78], [100, 128]]) { const u = westEdge(v1) + 0.6; surf(B.gnd, u, -3, v0, v1, PAVE, 0, 2); block(u, -3, v0, v1); }

  // ---- the sports court: a green surface with white lines, a mesh fence on posts, two goals
  {
    const { u0, u1, v0, v1 } = COURT;
    surf(B.gnd, u0, u1, v0, v1, '#4f8a5e', 0.005, 3);
    surf(B.gnd, u0 + 1.5, u1 - 1.5, v0 + 1.5, v1 - 1.5, '#b85b46', 0.01, 3);
    for (const [a, b, c, d] of [[u0 + 1.5, v0 + 1.5, u1 - 1.5, v0 + 1.5], [u0 + 1.5, v1 - 1.5, u1 - 1.5, v1 - 1.5], [u0 + 1.5, v0 + 1.5, u0 + 1.5, v1 - 1.5], [u1 - 1.5, v0 + 1.5, u1 - 1.5, v1 - 1.5], [(u0 + u1) / 2, v0 + 1.5, (u0 + u1) / 2, v1 - 1.5]]) strip(a, b, c, d, 0.1);
    const ring = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    ring.forEach(([a, b], i) => {
      const [c, d] = ring[(i + 1) % 4], len = Math.hypot(c - a, d - b), n = Math.ceil(len / 3);
      for (let k = 0; k < n; k++) {
        const pa = P(a + (c - a) * k / n, b + (d - b) * k / n), pb = P(a + (c - a) * (k + 1) / n, b + (d - b) * (k + 1) / n);
        B.det.setColor('#2f3a33'); B.det.cyl(pa[0], pa[1] - 0.2, pa[2], 0.05, 0.05, 3.2, 5, false);
        const pl = Math.max(1e-6, Math.hypot(pb[0] - pa[0], pb[2] - pa[2])), nx = -(pb[2] - pa[2]) / pl * 0.06, nz = (pb[0] - pa[0]) / pl * 0.06;
        B.rail.setColor('#28302b'); quad(B.rail, [pa[0], pa[1], pa[2]], [pb[0], pb[1], pb[2]], [pb[0], pb[1] + 3, pb[2]], [pa[0], pa[1] + 3, pa[2]], [nx / 0.06, 0, nz / 0.06]);
        // a thin collider per panel, following the ground like the panel does
        S.prism([pa[0] - nx, pa[2] - nz, pb[0] - nx, pb[2] - nz, pb[0] + nx, pb[2] + nz, pa[0] + nx, pa[2] + nz], Math.min(pa[1], pb[1]) - 0.4, (pa[1] + pb[1]) / 2 + 3, 0, 0, 'fence');
      }
    });
    for (const u of [u0 + 2.2, u1 - 2.2]) { // goal frames
      const c = (u0 + u1) / 2 > u ? 1 : -1, vm = (v0 + v1) / 2;
      const p1 = P(u, vm - 1.5), p2 = P(u, vm + 1.5), q1 = P(u + c * 1, vm - 1.5), q2 = P(u + c * 1, vm + 1.5);
      B.det.setColor('#f0f0f0');
      B.det.tube(p1, [p1[0], p1[1] + 2, p1[2]], 0.05, 5); B.det.tube(p2, [p2[0], p2[1] + 2, p2[2]], 0.05, 5);
      B.det.tube([p1[0], p1[1] + 2, p1[2]], [p2[0], p2[1] + 2, p2[2]], 0.05, 5);
      B.det.tube([p1[0], p1[1] + 2, p1[2]], q1, 0.03, 4); B.det.tube([p2[0], p2[1] + 2, p2[2]], q2, 0.03, 4);
    }
    block(u0 - 1, u1 + 1, v0 - 1, v1 + 1);
  }

  // ---- the playground: blue rubber with a sand-coloured patch, a play tower with a slide, swings, benches
  {
    const { u0, u1, v0, v1 } = PLAY;
    surf(B.gnd, u0, u1, v0, v1, '#3c7fbf', 0.005, 3);
    surf(B.gnd, u0 + 3, u0 + 15, v0 + 3, v1 - 3, '#d8c08e', 0.01, 3);
    surf(B.gnd, u1 - 12, u1 - 3, v0 + 3, v0 + 9, '#7fb4dc', 0.01, 3);
    const y0 = (u, v) => P(u, v)[1];
    // the tower: four posts, a deck, a pitched roof, a slide off one side, a climbing net as a dark rail panel
    const tu = u0 + 9, tv = (v0 + v1) / 2, D = B.det;
    const T = (a, b) => L(tu + a, tv + b), g = y0(tu, tv);
    D.setColor('#e7e2d8');
    for (const [a, b] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]]) { const [x, z] = T(a, b); D.cyl(x, g, z, 0.08, 0.08, 3.6, 6, false); }
    const deck = [[-1.35, -1.35], [1.35, -1.35], [1.35, 1.35], [-1.35, 1.35]].map(([a, b]) => T(a, b));
    D.setColor('#8a6a4c'); D.extrude(deck, [], g + 1.5, g + 1.65, { top: true, bottom: true });
    D.setColor('#e0563f');
    const ridge0 = [...T(-1.5, 0)], ridge1 = [...T(1.5, 0)];
    for (const sb of [-1, 1]) {
      const e0 = T(-1.5, 1.6 * sb), e1 = T(1.5, 1.6 * sb), n = [LV[0] * sb * 0.6, 1, LV[1] * sb * 0.6];
      quad(D, [e0[0], g + 3.3, e0[1]], [e1[0], g + 3.3, e1[1]], [ridge1[0], g + 4.2, ridge1[1]], [ridge0[0], g + 4.2, ridge0[1]], n);
      quad(D, [e0[0], g + 3.3, e0[1]], [e1[0], g + 3.3, e1[1]], [ridge1[0], g + 4.2, ridge1[1]], [ridge0[0], g + 4.2, ridge0[1]], n.map((q) => -q)); // underside
    }
    { // the slide: a yellow chute from the deck down toward +u
      const a0 = T(1.35, -0.45), a1 = T(1.35, 0.45), b0 = T(4.6, -0.45), b1 = T(4.6, 0.45);
      D.setColor('#f1c232');
      quad(D, [a0[0], g + 1.62, a0[1]], [a1[0], g + 1.62, a1[1]], [b1[0], g + 0.3, b1[1]], [b0[0], g + 0.3, b0[1]], [0.37, 0.93, 0]);
      for (const [p, q] of [[a0, b0], [a1, b1]]) quad(D, [p[0], g + 1.62, p[1]], [q[0], g + 0.3, q[1]], [q[0], g + 0.6, q[1]], [p[0], g + 1.92, p[1]], [LV[0], 0, LV[1]]);
    }
    S.prism(deck.flat(), g, g + 4.2, 0, 0, 'wall');
    // swings: an A-frame each end and a beam, two seats on chains
    const su = u1 - 8, sv = v1 - 5;
    const sw = (a, b, h = 0) => { const [x, z] = L(su + a, sv + b); return [x, y0(su, sv) + h, z]; };
    D.setColor('#4d6f8c');
    for (const a of [-2.2, 2.2]) { D.tube(sw(a, -1.1), sw(a, 0, 2.4), 0.06, 5); D.tube(sw(a, 1.1), sw(a, 0, 2.4), 0.06, 5); }
    D.tube(sw(-2.3, 0, 2.4), sw(2.3, 0, 2.4), 0.07, 6);
    for (const a of [-1, 1]) {
      D.setColor('#9aa0a6'); D.tube(sw(a - 0.25, 0, 2.4), sw(a - 0.25, 0, 0.5), 0.015, 3); D.tube(sw(a + 0.25, 0, 2.4), sw(a + 0.25, 0, 0.5), 0.015, 3);
      D.setColor('#d64532'); const s0 = sw(a, 0, 0.5); D.box(s0[0] - 0.3, s0[1] - 0.04, s0[2] - 0.12, s0[0] + 0.3, s0[1] + 0.04, s0[2] + 0.12);
    }
    { const c = [sw(-2.4, -1.2), sw(2.4, -1.2), sw(2.4, 1.2), sw(-2.4, 1.2)]; S.prism(c.flatMap((p) => [p[0], p[2]]), c[0][1] - 0.3, c[0][1] + 2.5, 0, 0, 'fence'); }
    // benches along the long edges
    for (const [a, b] of [[u0 + 18, v0 - 0.8], [u0 + 24, v0 - 0.8], [u0 + 18, v1 + 0.8], [u0 + 24, v1 + 0.8], [u1 + 0.8, v0 + 6], [u1 + 0.8, v1 - 6]]) {
      const along = Math.abs(b - v0) < 2 || Math.abs(b - v1) < 2;
      const e = along ? [1, 0] : [0, 1];
      const c0 = P(a - e[0] * 0.9, b - e[1] * 0.9), c1 = P(a + e[0] * 0.9, b + e[1] * 0.9);
      D.setColor('#9b7653'); D.tube([c0[0], c0[1] + 0.45, c0[2]], [c1[0], c1[1] + 0.45, c1[2]], 0.22, 4, true);
      D.setColor('#3d3d42'); D.tube(c0, [c0[0], c0[1] + 0.45, c0[2]], 0.05, 4); D.tube(c1, [c1[0], c1[1] + 0.45, c1[2]], 0.05, 4);
    }
    block(u0 - 1.5, u1 + 1.5, v0 - 1.5, v1 + 1.5);
  }

  // ---- the garage block on Пастерівська: warm grey stone, black grille bays, a gate at its west end, a flat roof
  {
    const pc = parts.find((q) => q.id === BAR_C), f = pc?.faces.find((q) => q.podS);
    if (f) {
      const [s0, s1] = f.podS, { d, h } = PODIUM, yb = pc.gLo - 0.5, y0 = pc.yF, yt = y0 + h;
      const front = sub(f, s0, s1, d), W = s1 - s0, holes = [];
      for (let s = 2.2; s + 4.4 <= W - 2; s += 6.2) holes.push({ s0: s, s1: s + 4.4, y0: y0 + 0.5, y1: yt - 0.5 });
      B.wall.setColor('#9a928b'); wall(B.wall, front, yb, yt, holes, [1.5, 1.5]);
      for (const q of holes) {
        win(SOLID, front, { ...q, dep: 0.25, rev: '#5c5753', glass: '#141418' });
        B.det.setColor('#1d1d22'); for (let s = q.s0 + 0.2; s < q.s1 - 0.1; s += 0.3) fbox(B.det, front, s - 0.03, s + 0.03, q.y0, q.y1, -0.2, -0.05, 'flr');
      }
      // the two ends: a solid stone end and a gate on the west
      // the two ends (sgn: toward the block's inside along s); the car gate is on the west end
      const westS = (f.ux * LU[0] + f.uz * LU[1]) < 0 ? s1 : s0;
      for (const [s, sgn] of [[s0, 1], [s1, -1]]) {
        const a = pt(f, s, 0, 0), b = pt(f, s, 0, d), E = edgeFaces([[a[0], a[2]], [b[0], b[2]], [b[0] + f.ux * sgn, b[2] + f.uz * sgn], [a[0] + f.ux * sgn, a[2] + f.uz * sgn]])[0];
        const gate = s === westS ? [{ s0: d / 2 - 1.8, s1: d / 2 + 1.8, y0, y1: y0 + 2.6 }] : [];
        B.wall.setColor('#9a928b'); wall(B.wall, E, yb, yt, gate, [1.5, 1.5]);
        for (const q of gate) win(SOLID, E, { ...q, dep: 0.2, rev: '#5c5753', glass: '#24242a' });
      }
      B.det.setColor('#4d4a47'); fbox(B.det, f, s0 - 0.05, s1 + 0.05, yt, yt + 0.12, 0, d + 0.06, 'ftlr');
      const roof = [pt(f, s0, 0, 0), pt(f, s1, 0, 0), pt(f, s1, 0, d), pt(f, s0, 0, d)].map((p) => [p[0], p[2]]);
      B.det.setColor('#77746f'); B.det.fill(roof, [], yt + 0.02, true);
      S.prism(roof.flat(), yb, yt + 0.12, 0, 0, 'wall');
      footprints.push({ poly: roof, h: yt - pc.gLo, kind: 'garages', name: NAME });
      const q = roof.map(([x, z]) => toUV(x, z)); block(Math.min(...q.map((p) => p[0])) - 1, Math.max(...q.map((p) => p[0])) + 1, Math.min(...q.map((p) => p[1])) - 1, Math.max(...q.map((p) => p[1])) + 2);
    }
  }

  // ---- the glass pavilion by the east corner: two storeys of glazing behind white fins, dark slab bands
  {
    const { u0, u1, v0, v1, h } = PAVILION;
    const ring = [L(u0, v0), L(u1, v0), L(u1, v1), L(u0, v1)];
    const hs = ring.map(([x, z]) => heightAt(x, z)), gl = Math.min(...hs), y0 = Math.max(...hs) + 0.15;
    for (const f of edgeFaces(ring)) {
      const n = Math.max(1, Math.round(f.L / 1.6)), p = f.L / n;
      B.det.setColor('#2c2c31'); fbox(B.det, f, 0, f.L, gl - 0.4, y0, -0.05, 0.02, 'f');
      for (let k = 0; k < 2; k++) for (let j = 0; j < n; j++) {
        const G = lit(0.75) ? B.shop : B.glass;
        G.setColor(k ? '#dfe6ea' : '#e8ece4'); panel(G, f, j * p, (j + 1) * p, y0 + k * 3.9, y0 + (k + 1) * 3.9 - 0.4, -0.25, [p, 3.5]);
      }
      B.det.setColor('#f2f2f4');
      for (let j = 0; j <= n; j++) fbox(B.det, f, j * p - 0.06, j * p + 0.06, y0, y0 + h - 0.6, -0.25, 0.4, 'flr');
      B.det.setColor('#2b2a30');
      fbox(B.det, f, -0.3, f.L + 0.3, y0 + 3.5, y0 + 3.9, -0.25, 0.45, 'ftu');
      fbox(B.det, f, -0.3, f.L + 0.3, y0 + h - 0.6, y0 + h, -0.25, 0.45, 'ftu');
    }
    B.det.setColor('#4a494e'); B.det.fill(ring, [], y0 + h - 0.05, true);
    B.det.setColor('#2b2a30'); B.det.fill(ring, [], y0 + h, true);
    S.prism(ring.flat(), gl - 0.4, y0 + h, 0, 0, 'wall');
    footprints.push({ poly: ring, h: y0 + h - gl, kind: 'commercial', name: NAME });
    surf(B.gnd, u0 - 3, u1 + 3, v0 - 3, v1 + 3, PAVE, 0, 2);
    block(u0 - 3.5, u1 + 3.5, v0 - 3.5, v1 + 3.5);
  }

  // ---- lamps along the walks; their heads glow at night
  const lamps = [[-6, 10], [-6, 60], [-6, 112], [12, 49.2], [40, 49.2], [66, 49.2], [12, 103.2], [40, 103.2], [66, 103.2], [83.2, 25], [83.2, 60], [83.2, 88]];
  for (const [u, v] of lamps) {
    const [x, z] = L(u, v), g = heightAt(x, z);
    B.det.setColor('#2f2f35'); B.det.cyl(x, g - 0.3, z, 0.07, 0.05, 4.8, 6, true);
    B.lamp.setColor('#ffffff'); B.lamp.cyl(x, g + 4.5, z, 0.12, 0.12, 0.35, 8, true);
    S.cyl(x, z, g - 0.3, g + 4.8, 0.1, 0.1, 'pole');
  }

  // ---- trees in the yard: along the cross walks, round the court and the playground, a few by the shop ends
  const spots = [];
  const tree = (u, v, kind = 'park', sc = 0.85) => { const [x, z] = L(u, v); spots.push({ x, z, kind, sc: sc * (0.9 + 0.2 * r()) }); };
  for (let u = 8; u <= 72; u += 9) tree(u, 44.6);
  for (const u of [6, 14, 22, 66, 74]) tree(u, 97.5);
  for (let v = 22; v <= 92; v += 10) tree(86, v, 'street', 0.8);
  for (const [u, v] of [[26, 23], [62, 23], [26, 46], [64, 76], [24, 76], [66, 95], [88, 120], [104, 120], [-8, 48], [-8, 100], [-9, 75]]) tree(u, v, 'small', 0.9);

  // ---- meshes
  const perfT = perfTex(false), perfM = perfTex(true);
  const M = mats({
    pur: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.45, metalness: 0.35 }),
    perf: new THREE.MeshStandardMaterial({ map: perfT, emissiveMap: perfM, emissive: 0xffc37a, emissiveIntensity: 0, vertexColors: true, roughness: 0.4, metalness: 0.5 }),
    shop: new THREE.MeshStandardMaterial({ map: winTex(), emissiveMap: winEmTex(), emissive: 0xffe2b8, emissiveIntensity: 0, vertexColors: true, roughness: 0.12, metalness: 0.3 }),
    rail: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.38, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    gnd: decalMat(new THREE.MeshStandardMaterial({ map: paveTex(), vertexColors: true, roughness: 0.92 }), 1),
    paint: decalMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 2),
    lamp: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xfff0d2, emissiveIntensity: 0 }),
  });
  M.gnd.map.wrapS = M.gnd.map.wrapT = THREE.RepeatWrapping;
  const out = finish(root, 'pasterivskyi', B, M, ['wall', 'pur', 'det']);
  console.log(`[cherkasy] Pasterivskyi: ${recs.length} bars, ${nWin} openings, ${parked.length} parked, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${(S.count ?? 0) - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const inBlocked = (u, v) => blocked.some(([a, b, c, d]) => u > a && u < b && v > c && v < d);
  return {
    footprints,
    spots,
    parked,
    // generated trees keep off the buildings, the walks, the car parks, the court and the playground
    clear: (x, z) => { const [u, v] = toUV(x, z); return u > LOT.u0 - 15 && u < LOT.u1 && v > LOT.v0 && v < LOT.v1 && inBlocked(u, v); },
    update() {
      const k = nightK.value;
      M.lit.emissiveIntensity = 1.4 * k; M.shop.emissiveIntensity = 1.6 * k; M.perf.emissiveIntensity = 1.8 * k; M.lamp.emissiveIntensity = 2.5 * k;
    },
  };
}
