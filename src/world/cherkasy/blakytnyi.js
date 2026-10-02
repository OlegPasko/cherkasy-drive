// OWNER: cherkasy. Блакитний палац – the former hotel «Слов’янський» (late 19th c., after V. Horodetskyi), on the corner
// of вулиця Хрещатик and вулиця Остафія Дашковича, 20, across Khreshchatyk from ТРЦ «Хрещатик-Сіті» (OSM relation
// 2810576, «Бізнес-центр "Слов'янський"», heritage «Готель Скорини «Слов’янський»»). Painted blue in Soviet times (hence
// the name), restored to a sand-beige colour in 2022–24. Rebuilt after the uk.wikipedia photos (Блакитний палац у 2024
// році, Building of the Slovyanskyi Hotel) and the antenna.com.ua restoration report (Aug 2026): two tall storeys round
// a courtyard. Ochre render in horizontal bands over a granite plinth; plain rectangular windows below a white cornice;
// upstairs pairs of pointed lancet windows in white mouldings over white ornament panels, between white pilasters that
// rise past the crenellated parapet as round pinnacles; a white dentil frieze under the cornice. The corner is cut on
// the diagonal: two round-arched windows over a wrought-iron balcony, a stepped gable with two white roundels, four
// white turrets with dark spires, and behind them the tall octagonal slate spire. Dark metal hipped roofs. The east end
// of the relation is a later 5-storey office wing (the business centre, light render, pilaster bays): built plainly.
// No bank signage (the ground floor has had bank branches; none is shown).
//   BLAKYTNYI_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildBlakytnyi({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The OSM ring is cut at x = CUT (map frame) into the old hotel (with the courtyard hole) and the office wing; the
// hotel's street corner is chamfered (OSM draws it square). Walls come from civic.js faces, per face in its frame.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng } from './geo.js';
import { canvasTex } from './sculpt.js';
import { wallFaces, at, quad, skin, fbox, fsolid, wallAround, fillOpening, stoneTex, pack, plainOpening, facePoly, archPts, archTop, hipRoof } from './civic.js';

const OSM_ID = 2810576;
export const BLAKYTNYI_SKIP = new Set([OSM_ID]);

const CUT = 260.7, CH = 6.2;              // hotel / office wing split (map x); the corner chamfer, m along each street
const LIFT = 0.25, GF = 5.0, UF = 5.4, PAR = 1.25; // floor over the street, storey heights, parapet
const OCHRE = '#d8c39b', WHITE = '#f4f1e8', PLINTH = '#a28a5e', SLATE = '#3a3f43', ROOF = '#4f5458', IRON = '#232425';
const BC_WALL = '#ecebe6', BC_FL = [3.6, 3.3, 3.3, 3.3, 3.3];
const GLASS = ['#55626a', '#4b575e', '#5f6b72', '#6a7378'], WU = [3, 2.4];

// ornaments on one atlas: the roundel (top left), the "ʌʌʌ" balustrade panel (top right), wrought iron (bottom half)
const ornTex = () => canvasTex(512, 512, (g) => {
  g.clearRect(0, 0, 512, 512);
  // roundel: white disc, raised rim, a lily-like knot in grey relief lines
  g.fillStyle = '#f6f3ea'; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c9c3b5'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 7; g.lineCap = 'round';
  const line = (pts) => { g.beginPath(); g.moveTo(...pts[0]); for (let i = 1; i < pts.length; i += 3) g.bezierCurveTo(...pts[i], ...pts[i + 1], ...pts[i + 2]); g.stroke(); };
  line([[128, 210], [128, 160], [128, 110], [128, 50]]);
  line([[128, 170], [70, 160], [60, 100], [100, 80]]); line([[128, 170], [186, 160], [196, 100], [156, 80]]);
  line([[128, 120], [90, 120], [80, 160], [110, 190]]); line([[128, 120], [166, 120], [176, 160], [146, 190]]);
  g.beginPath(); g.arc(128, 128, 22, 0, Math.PI * 2); g.stroke();
  // panel: white field, a row of little pointed arches in grey
  g.fillStyle = '#f4f1e8'; g.fillRect(256, 0, 256, 256);
  g.fillStyle = '#b9b2a3';
  for (let i = 0; i < 6; i++) { const x = 266 + i * 40; g.beginPath(); g.moveTo(x, 210); g.lineTo(x, 110); g.quadraticCurveTo(x + 15, 60, x + 30, 110); g.lineTo(x + 30, 210); g.closePath(); g.fill(); }
  g.fillStyle = '#f4f1e8'; for (let i = 0; i < 6; i++) { const x = 274 + i * 40; g.beginPath(); g.moveTo(x, 205); g.lineTo(x, 118); g.quadraticCurveTo(x + 7, 92, x + 14, 118); g.lineTo(x + 14, 205); g.fill(); }
  // wrought iron: top and bottom rails, a diamond lattice, scrolls along the foot
  g.strokeStyle = '#1e1f20'; g.lineWidth = 10; g.strokeRect(6, 262, 500, 244);
  g.lineWidth = 5;
  for (let x = -240; x < 512; x += 48) { g.beginPath(); g.moveTo(x, 270); g.lineTo(x + 230, 500); g.moveTo(x + 230, 270); g.lineTo(x, 500); g.stroke(); }
  g.lineWidth = 6;
  for (let x = 30; x < 512; x += 64) { g.beginPath(); g.arc(x, 470, 18, Math.PI * 0.2, Math.PI * 1.9); g.stroke(); }
}, { repeat: false });
const UV_ROUND = [0, 0.5, 0.5, 1], UV_PANEL = [0.5, 0.5, 1, 1], UV_IRON = [0, 0, 1, 0.5]; // u0, v0, u1, v1 (v up)

// a vertical card between two world points (x, z), y0..y1, with an atlas rect
function card(D, a, b, y0, y1, uv, n) {
  const P = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]];
  quad(D, ...P, n, [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]);
}
// a face turned to look the other way (courtyard walls: wallFaces of the hole points into the building)
function flip(f) {
  const nx = -f.nx, nz = -f.nz, rx = nz, rz = -nx, b = at(f, f.w, 0);
  return { ax: b[0], az: b[2], rx, rz, nx, nz, w: f.w, N: [nx, 0, nz], R: [rx, 0, rz], L: [-rx, 0, -rz], open: [] };
}
// polygon clipped to one side of the line x = X
function clipX(P, X, keepLow) {
  const out = [];
  P.forEach((a, i) => {
    const c = P[(i + 1) % P.length], ia = (a[0] < X) === keepLow, ic = (c[0] < X) === keepLow;
    if (ia) out.push(a);
    if (ia !== ic) { const t = (X - a[0]) / (c[0] - a[0]); out.push([X, a[1] + t * (c[1] - a[1])]); }
  });
  return out;
}

export function buildBlakytnyi({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count ?? 0;
  const ring = ringPts(b.p);
  // the courtyard: the relation's inner way (map_buildings keeps the outer ring only)
  const hole = [[224.2, 144.1], [224.4, 166.2], [258.7, 165.9], [258.6, 143.9]];

  // ---- the hotel: the ring west of CUT with the street corner (lowest x, highest z) chamfered
  const hot0 = clipX(ring, CUT, true);
  const ci = hot0.reduce((m, p, i) => (p[1] - p[0] > hot0[m][1] - hot0[m][0] ? i : m), 0), C = hot0[ci];
  const toward = (q) => { const d = Math.hypot(q[0] - C[0], q[1] - C[1]); return [C[0] + (q[0] - C[0]) * CH / d, C[1] + (q[1] - C[1]) * CH / d]; };
  const hotel = [...hot0.slice(0, ci), toward(hot0[(ci + hot0.length - 1) % hot0.length]), toward(hot0[(ci + 1) % hot0.length]), ...hot0.slice(ci + 1)];
  const office = clipX(ring, CUT, false);
  const hF = wallFaces(hotel).filter((f) => !(f.nx > 0.99 && Math.abs(f.ax - CUT) < 0.05)); // the cut wall is inside the office wing
  const cF = wallFaces(hole).map(flip);
  const oF = wallFaces(office);

  // ---- heights: the floor sits a step over the higher street end
  const streetPts = [[C[0] - 3, C[1] + 3], [C[0] - 3, 115], [255, C[1] + 3]];
  // Khreshchatyk climbs ~1.3 m to the north, Dashkovycha falls ~2.5 m to the east: the floor sits a step over the corner
  // and splits the difference to the north end; the plinth grows down the slope and gets basement windows there
  const gS = Math.max(...streetPts.map(([x, z]) => heightAt(x, z))), gC = heightAt(C[0] - 3, C[1] + 3);
  const gBase = Math.min(...ring.map(([x, z]) => heightAt(x, z))) - 0.6;
  const yF = Math.max(gC + LIFT, (gC + gS) / 2 + 0.15), y2 = yF + GF, yE = y2 + UF, yP = yE + PAR;
  const groundAt = (f, s) => { const p = at(f, s, 0, 1.5); return heightAt(p[0], p[2]); };
  const doorY = (f, s) => Math.min(yF - 0.1, Math.max(groundAt(f, s) + 0.05, yF - 1.4));

  const B = { wall: new MB(), plinth: new MB(), det: new MB(), glass: new MB(), lit: new MB(), orn: new MB() };
  const D = B.det, O = B.orn;
  let nWin = 0;
  const glaze = (litP = 0.3) => ({ glass: GLASS[Math.floor(r() * GLASS.length)], lit: r() < litP });
  const arches = [];  // [f, s0, s1, ys, yA, kind] heads to finish once the walls are laid
  const win = (f, s0, s1, y0, y1, extra = {}) => { f.open.push({ s0, s1, y0, y1, dep: 0.28, frame: '#f2efe6', rev: '#efe9da', pane: 0.65, ...glaze(), ...extra }); nWin++; };
  const plainWin = (f, s0, s1, y0, y1, extra = {}) => { f.open.push({ s0, s1, y0, y1, plain: true, ...glaze(0.35), ...extra }); nWin++; };

  // ---- the street fronts: bays of paired lancets between pilasters that end in pinnacles
  const isCorner = (f) => f.nx < -0.5 && f.nz > 0.5 && f.w < CH * 2;
  const isStreet = (f) => !isCorner(f) && (f.nx < -0.9 || f.nz > 0.9) && f.w > 12;
  const cornerF = hF.find(isCorner);
  const pinn = [];   // [f, s] pinnacles on the pilasters
  const turrets = []; // [x, z, yTop] turrets with spires round the corner
  for (const f of hF.filter(isStreet)) {
    const n = Math.max(1, Math.round(f.w / 5.4)), st = f.w / n;
    // which end meets the chamfer (the flanking turret pilaster sits next to it)
    const e0 = at(f, 0, 0), e1 = at(f, f.w, 0), dC = (p) => Math.hypot(p[0] - C[0], p[2] - C[1]);
    const cornerEnd = dC(e0) < CH + 1 ? 0 : dC(e1) < CH + 1 ? n : -1;
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) * st;
      for (const [a0, a1] of [[c - 1.75, c - 0.5], [c + 0.5, c + 1.75]]) {
        const door = i % 4 === 2 && a0 < c;
        if (door) win(f, a0 - 0.25, a1, doorY(f, c - 1.1), yF + 3.3, { door: true, glass: '#2f383d', lit: true, pane: 0.8, frame: '#6b4a32', rev: '#d9c48a' });
        else win(f, a0, a1, yF + 0.95, yF + 3.65, { sill: '#efe9da' });
        if (!door && groundAt(f, (a0 + a1) / 2) < yF - 1.3) plainWin(f, a0 + 0.1, a1 - 0.1, groundAt(f, (a0 + a1) / 2) + 0.25, yF - 0.35, { rev: '#8a7a5c', lit: false, glass: '#3d4448' }); // basement
        const ys = y2 + 3.25, yA = ys + archTop(a1 - a0, 'pointed');
        win(f, a0, a1, y2 + 1.0, yA, { lancet: true });
        arches.push([f, a0, a1, ys, yA, 'pointed']);
        // the ornament panel under the lancet and the white jambs
        quad(O, at(f, a0, y2 + 0.2, 0.05), at(f, a1, y2 + 0.2, 0.05), at(f, a1, y2 + 0.85, 0.05), at(f, a0, y2 + 0.85, 0.05), f.N, [[UV_PANEL[0], UV_PANEL[1]], [UV_PANEL[2], UV_PANEL[1]], [UV_PANEL[2], UV_PANEL[3]], [UV_PANEL[0], UV_PANEL[3]]]);
        D.setColor(WHITE);
        fbox(D, f, a0 - 0.16, a0, y2 + 0.95, ys, 0, 0.06, 1 | 4); fbox(D, f, a1, a1 + 0.16, y2 + 0.95, ys, 0, 0.06, 1 | 8);
        fbox(D, f, a0 - 0.2, a1 + 0.2, y2 + 0.88, y2 + 1.0, 0, 0.1, 1 | 16 | 4 | 8); // sill
      }
    }
    // pilasters (white, upstairs) at every bay line, a pinnacle on each; ground-floor strips in a paler ochre
    for (let i = 0; i <= n; i++) {
      const s = Math.min(Math.max(i * st, 0.45), f.w - 0.45);
      D.setColor(WHITE); fbox(D, f, s - 0.45, s + 0.45, y2 + 0.2, yP, 0, 0.2, 1 | 4 | 8 | 16);
      D.setColor('#e0cfab'); fbox(D, f, s - 0.4, s + 0.4, yF + 0.5, y2 - 0.3, 0, 0.08, 1 | 4 | 8);
      if (i === cornerEnd) continue; // the chamfer's own turret stands there
      if (cornerEnd >= 0 && Math.abs(i - cornerEnd) === 1) { const p = at(f, s, 0, 0.25); turrets.push([p[0], p[2], yP + 3.2, 0.5]); continue; }
      pinn.push([f, s]);
    }
    // two small balconies on wrought-iron railings per front
    for (const k of [Math.floor(n * 0.3), Math.floor(n * 0.75)]) {
      if (k === 0 || k === n - 1) continue; // never in an end bay (the corner's turrets, the far end)
      const c = (k + 0.5) * st, s0 = c - 2.1, s1 = c + 2.1;
      D.setColor('#d9d4c8'); fbox(D, f, s0, s1, y2 - 0.05, y2 + 0.2, 0, 0.9, 63);
      card(O, ...[at(f, s0, 0, 0.88), at(f, s1, 0, 0.88)].map((p) => [p[0], p[2]]), y2 + 0.2, y2 + 1.15, UV_IRON, f.N);
      for (const s of [s0, s1]) { const p = at(f, s, 0, 0.88), q = at(f, s, 0, 0.02); card(O, [q[0], q[2]], [p[0], p[2]], y2 + 0.2, y2 + 1.15, [0, 0, 0.2, 0.5], s === s0 ? f.L : f.R); }
      fsolid(S, f, s0, s1, 0, 0.9, y2 - 0.05, y2 + 1.15, 'awning', 1);
    }
    // white string course over the ground floor, the dentil frieze and the cornice under the parapet
    D.setColor(WHITE);
    fbox(D, f, -0.05, f.w + 0.05, y2 - 0.3, y2 + 0.2, 0, 0.28, 1 | 16 | 32);
    fbox(D, f, -0.05, f.w + 0.05, yE - 0.95, yE - 0.8, 0, 0.12, 1 | 16 | 32);
    for (let s = 0.3; s < f.w - 0.3; s += 0.55) fbox(D, f, s, s + 0.28, yE - 0.8, yE - 0.45, 0, 0.12, 1 | 32);
    fbox(D, f, -0.05, f.w + 0.05, yE - 0.45, yE, 0, 0.42, 1 | 16 | 32);
    // crenellated parapet: white merlons on the coping
    for (let s = 0.9; s < f.w - 1.2; s += 1.35) fbox(D, f, s, s + 0.65, yP, yP + 0.45, -0.15, 0.08, 1 | 4 | 8 | 16);
  }

  // ---- the corner: two round-arched windows over the balcony, the stepped gable, roundels, turrets, the spire
  let spire = null;
  if (cornerF) {
    const f = cornerF, w = f.w, m = w / 2;
    win(f, m - 1.6, m + 1.6, doorY(f, m), yF + 3.4, { door: true, glass: '#2f383d', lit: true, pane: 0.8, frame: '#6b4a32', rev: '#d9c48a' });
    for (const [a0, a1] of [[m - 3.1, m - 1.4], [m + 1.4, m + 3.1]]) win(f, a0, a1, yF + 0.95, yF + 3.65, { sill: '#efe9da' });
    for (const [a0, a1] of [[m - 2.55, m - 0.55], [m + 0.55, m + 2.55]]) {
      const ys = y2 + 3.4, yA = ys + archTop(a1 - a0, 'round');
      win(f, a0, a1, y2 + 0.25, yA, { pane: 0.5 });
      arches.push([f, a0, a1, ys, yA, 'round']);
      D.setColor(WHITE); fbox(D, f, a0 - 0.18, a0, y2 + 0.2, ys, 0, 0.08, 1 | 4); fbox(D, f, a1, a1 + 0.18, y2 + 0.2, ys, 0, 0.08, 1 | 8);
    }
    D.setColor(WHITE);
    fbox(D, f, -0.05, w + 0.05, y2 - 0.3, y2 + 0.2, 0, 0.28, 1 | 16 | 32);
    fbox(D, f, -0.05, w + 0.05, yE - 0.45, yE, 0, 0.42, 1 | 16 | 32);
    // the balcony round the corner: a slab on the string course and the iron railing on three sides
    const bo = 1.45, s0 = -0.9, s1 = w + 0.9;
    D.setColor('#d9d4c8'); fbox(D, f, s0, s1, y2 - 0.12, y2 + 0.12, 0, bo, 63);
    fsolid(S, f, s0, s1, 0, bo, y2 - 0.12, y2 + 1.15, 'awning', 1);
    const segs = Math.round((s1 - s0) / 1.6);
    for (let i = 0; i < segs; i++) {
      const a = at(f, s0 + (s1 - s0) * i / segs, 0, bo - 0.03), c = at(f, s0 + (s1 - s0) * (i + 1) / segs, 0, bo - 0.03);
      card(O, [a[0], a[2]], [c[0], c[2]], y2 + 0.12, y2 + 1.15, UV_IRON, f.N);
    }
    for (const s of [s0, s1]) { const p = at(f, s, 0, bo - 0.03), q = at(f, s, 0, 0); card(O, [q[0], q[2]], [p[0], p[2]], y2 + 0.12, y2 + 1.15, [0, 0, 0.3, 0.5], s === s0 ? f.L : f.R); }
    // the stepped gable over the cornice, white trim on its rakes, the two roundels
    const yB = yE, G = [[-0.3, yB], [w + 0.3, yB], [w + 0.3, yB + 1.7], [w - 0.9, yB + 1.7], [w - 0.9, yB + 2.4], [m, yB + 5.0], [0.9, yB + 2.4], [0.9, yB + 1.7], [-0.3, yB + 1.7]];
    D.setColor(OCHRE);
    facePoly(D, f, G, 0.12);
    facePoly(D, f, G, -0.35, null, true);
    for (let i = 0; i < G.length; i++) { // the gable's edges
      const [sa, ya] = G[i], [sb, yb] = G[(i + 1) % G.length];
      if (ya === yB && yb === yB) continue;
      const dx = sb - sa, dy = yb - ya, l = Math.hypot(dx, dy), n2 = [dy / l, -dx / l];
      const N = [f.rx * n2[0], n2[1], f.rz * n2[0]];
      quad(D, at(f, sa, ya, 0.12), at(f, sb, yb, 0.12), at(f, sb, yb, -0.35), at(f, sa, ya, -0.35), N);
    }
    D.setColor(WHITE);
    const rake = [[0.9, yB + 2.4], [m, yB + 5.0], [w - 0.9, yB + 2.4]];
    for (const k of [0, 1]) { const p = at(f, ...rake[k], 0.2), q = at(f, ...rake[k + 1], 0.2); D.tube(p, q, 0.11, 5, true); }
    const inner = [[1.8, yB + 1.9], [m, yB + 4.0], [w - 1.8, yB + 1.9]];
    for (const k of [0, 1]) { const p = at(f, ...inner[k], 0.16), q = at(f, ...inner[k + 1], 0.16); D.tube(p, q, 0.07, 4, true); }
    for (const sc of [m - 1.55, m + 1.55]) {
      const R = 0.62, yc = yB + 1.05;
      quad(O, at(f, sc - R, yc - R, 0.17), at(f, sc + R, yc - R, 0.17), at(f, sc + R, yc + R, 0.17), at(f, sc - R, yc + R, 0.17), f.N, [[UV_ROUND[0], UV_ROUND[1]], [UV_ROUND[2], UV_ROUND[1]], [UV_ROUND[2], UV_ROUND[3]], [UV_ROUND[0], UV_ROUND[3]]]);
    }
    // two turrets at the chamfer's edges (taller), the flanking pair was queued with the pilasters
    for (const s of [0, w]) { const p = at(f, s, 0, 0.3); turrets.push([p[0], p[2], yB + 4.3, 0.58]); }
    // the spire stands behind the chamfer, on the axis of the corner
    const p = at(f, m, 0, -6.2);
    spire = [p[0], p[2]];
    S.box(p[0] - 2.6, yE, p[2] - 2.6, p[0] + 2.6, yE + 6, p[2] + 2.6, 'wall');
  }
  for (const [x, z, yT, R] of turrets) {
    D.setColor(WHITE);
    D.cyl(x, y2 + 0.2, z, R, R, yT - y2 - 0.2, 10, false);
    D.cyl(x, yT - 1.0, z, R + 0.08, R + 0.08, 0.2, 10, false);
    D.setColor('#e7c56c'); D.cyl(x, yT - 0.8, z, R + 0.1, R + 0.1, 0.8, 10, false);
    D.setColor(WHITE); D.cyl(x, yT, z, R + 0.16, R + 0.16, 0.18, 10, true);
    D.setColor(SLATE); D.cyl(x, yT + 0.18, z, R + 0.08, 0.03, 3.6, 8, false);
    S.cyl(x, z, y2, yT + 0.2, R + 0.1);
  }
  if (spire) {
    const [x, z] = spire, y0 = yE - 0.2, yd = yE + 5.6;
    D.setColor(SLATE);
    D.lathe([[2.55, y0], [2.55, yd], [2.95, yd + 0.25], [2.3, yd + 1.3], [1.4, yd + 5.0], [0.55, yd + 8.6], [0.04, yd + 10.6]], 8, x, z);
    D.setColor(OCHRE); D.cyl(x, yd - 0.9, z, 2.62, 2.62, 0.7, 8, false); // a band of render at the drum's top
    D.setColor(IRON); D.tube([x, yd + 10.4, z], [x, yd + 12.0, z], 0.035, 4);
  }

  // ---- other outer walls of the hotel (north end, the cut toward the office wing): plain two-storey windows
  for (const f of hF) {
    if (isStreet(f) || f === cornerF || f.w < 2.6) continue;
    const n = Math.max(1, Math.round((f.w - 1.2) / 3.4));
    for (let i = 0; i < n; i++) {
      const c = 0.6 + (i + 0.5) * (f.w - 1.2) / n;
      if (r() < 0.85) plainWin(f, c - 0.65, c + 0.65, yF + 1.0, yF + 3.4);
      plainWin(f, c - 0.65, c + 0.65, y2 + 1.1, y2 + 3.7);
    }
  }
  for (const f of cF) {
    const n = Math.max(1, Math.round((f.w - 1.2) / 3.6));
    for (let i = 0; i < n; i++) {
      const c = 0.6 + (i + 0.5) * (f.w - 1.2) / n;
      plainWin(f, c - 0.6, c + 0.6, yF + 1.0, yF + 3.3, { lit: r() < 0.2 });
      plainWin(f, c - 0.6, c + 0.6, y2 + 1.1, y2 + 3.6, { lit: r() < 0.2 });
    }
  }

  // ---- the office wing: five storeys, windows between pilaster strips, a flat roof
  const yO = BC_FL.reduce((a, h) => a + h, yF), yOP = yO + 0.7;
  for (const f of oF) {
    const blank = f.nx < -0.99 && Math.abs(f.ax - CUT) < 0.05; // the wall against the hotel
    if (blank || f.w < 2.3) continue;
    const n = Math.max(1, Math.round((f.w - 0.8) / 3.2));
    for (let i = 0; i < n; i++) {
      const c = 0.4 + (i + 0.5) * (f.w - 0.8) / n;
      let y = yF;
      BC_FL.forEach((h, k) => { plainWin(f, c - 0.85, c + 0.85, y + (k ? 0.9 : 0.6), y + h - 0.45, { rev: '#c9cdcf', glass: GLASS[k % 4] }); y += h; });
    }
  }

  // ---- walls: plinth, ochre render (hotel), light render (office wing)
  for (const f of [...hF, ...cF]) {
    const top = cF.includes(f) ? yE + 0.6 : yP;
    wallAround(B.plinth, f, gBase, yF + 0.45, [1.2, 0.8], PLINTH);
    wallAround(B.wall, f, yF + 0.45, top, WU, OCHRE);
    for (const q of f.open) if (q.plain) plainOpening(B, f, q); else if (q.frame) fillOpening(B, f, q);
    if (!cF.includes(f)) { // coping, the parapet's inner face, roof edge anchors
      D.setColor(WHITE); fbox(D, f, -0.03, f.w + 0.03, yP, yP + 0.08, -0.3, 0.06, 1 | 16);
      D.setColor('#cbb57a'); skin(D, { ...f, N: [-f.nx, 0, -f.nz] }, 0, f.w, yE + 0.3, yP, -0.3);
      const a = at(f, 0, 0, -0.1), c = at(f, f.w, 0, -0.1);
      Z.edge(a[0], a[2], c[0], c[2], yP, f.nx, f.nz);
    } else { D.setColor(WHITE); fbox(D, f, -0.03, f.w + 0.03, yE + 0.5, yE + 0.6, 0, 0.12, 1 | 16 | 32); }
  }
  for (const f of oF) {
    wallAround(B.plinth, f, gBase, yF + 0.4, [1.2, 0.8], '#9a9690');
    wallAround(B.wall, f, yF + 0.4, yOP, WU, BC_WALL);
    for (const q of f.open) plainOpening(B, f, q);
    D.setColor('#9fa3a5'); fbox(D, f, -0.03, f.w + 0.03, yOP, yOP + 0.08, -0.3, 0.06, 1 | 16);
    D.setColor('#d6d4cf'); skin(D, { ...f, N: [-f.nx, 0, -f.nz] }, 0, f.w, yO, yOP, -0.3);
    if (f.w > 2.3 && !(f.nx < -0.99 && Math.abs(f.ax - CUT) < 0.05)) { // white pilaster strips at the window bays' edges
      D.setColor('#f7f6f2'); fbox(D, f, -0.02, 0.35, yF + 0.4, yOP, 0, 0.12, 1 | 4 | 8);
    }
    const a = at(f, 0, 0, -0.1), c = at(f, f.w, 0, -0.1);
    Z.edge(a[0], a[2], c[0], c[2], yOP, f.nx, f.nz);
  }

  // ---- lancet and arch heads: wall spandrels over the opening's top corners, white mouldings round the curve
  for (const [f, s0, s1, ys, yA, kind] of arches) {
    const A = archPts(s0, s1, ys, kind), Ao = archPts(s0, s1, ys, kind, 0.16), k = (A.length - 1) / 2;
    B.wall.setColor(OCHRE);
    facePoly(B.wall, f, [[s0, yA], ...A.slice(0, k + 1)], 0, WU);
    facePoly(B.wall, f, [[s1, yA], ...A.slice(k).reverse()], 0, WU);
    D.setColor(WHITE);
    for (let i = 0; i < A.length - 1; i++) facePoly(D, f, [A[i], Ao[i], Ao[i + 1], A[i + 1]], 0.05);
    // a little white drip over the apex
    const t = at(f, (s0 + s1) / 2, yA + 0.12, 0.08);
    D.box(t[0] - 0.08, t[1], t[2] - 0.08, t[0] + 0.08, t[1] + 0.35, t[2] + 0.08);
  }
  // pinnacles on the pilasters past the parapet
  for (const [f, s] of pinn) {
    const p = at(f, s, 0, 0.12);
    D.setColor(WHITE);
    D.cyl(p[0], yP, p[2], 0.36, 0.36, 1.45, 8, false);
    D.cyl(p[0], yP + 1.45, p[2], 0.45, 0.45, 0.2, 8, true);
    D.cyl(p[0], yP + 1.65, p[2], 0.3, 0.05, 0.45, 6, false);
  }

  // ---- roofs: dark hipped slopes over the three wings, flat behind the parapets, the office wing flat
  D.setColor(ROOF);
  D.fill(hotel, [hole], yE + 0.3, true);
  hipRoof(D, 206.0, 112.6, 217.8, 172.5, yE + 0.3, 2.6);
  hipRoof(D, 217.8, 166.6, 258.4, 177.1, yE + 0.3, 2.3);
  hipRoof(D, 217.8, 127.9, 258.4, 143.7, yE + 0.3, 3.0);
  D.setColor('#8e8c86'); D.fill(office, [], yO + 0.02, true);
  D.setColor('#a8a69f');
  for (let i = 0; i < 4; i++) { const x = CUT + 3 + r() * 8, z = 132 + r() * 38; D.box(x - 0.6, yO, z - 0.6, x + 0.6, yO + 1.0, z + 0.6, 55); }

  // ---- collision: the hotel's wings round the courtyard, the office wing
  S.prism(hotel.flat(), gBase, yP, 0, 0, 'wall', 0, [hole]);
  S.prism(office.flat(), gBase, yOP, 0, 0, 'wall');

  // ---- meshes
  const orn = ornTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: stoneTex(r, [244, 240, 232], { cols: 1, rows: 4, joint: 0.16, grain: 0.05 }), vertexColors: true, roughness: 0.88 }),
    plinth: new THREE.MeshStandardMaterial({ map: stoneTex(r, [236, 232, 226], { cols: 2, rows: 2, joint: 0.3, grain: 0.1 }), vertexColors: true, roughness: 0.6 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffe2b0, emissiveIntensity: 0 }),
    orn: new THREE.MeshStandardMaterial({ map: orn, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 }),
  };
  const st = pack(root, 'blakytnyi', B, M, ['glass', 'lit', 'orn']);
  console.log(`[cherkasy] Blakytnyi palats: ${nWin} windows, ${arches.length} arch heads, ${pinn.length} pinnacles, ${(st.verts / 1000).toFixed(1)}k verts, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(S.count ?? 0) - n0} solids, floor ${yF.toFixed(1)} m (corner ground ${gC.toFixed(1)}), in ${(performance.now() - t0).toFixed(0)} ms`);

  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const X0 = Math.min(...xs), X1 = Math.max(...xs), Z0 = Math.min(...zs), Z1 = Math.max(...zs);
  return {
    footprints: [{ poly: hotel, h: yP - gS, kind: b.k, name: 'Блакитний палац' }, { poly: office, h: yOP - gS, kind: b.k, name: 'Блакитний палац' }],
    // no generated trees on the lot or in the courtyard
    clear: (x, z) => x > X0 - 2.5 && x < X1 + 2 && z > Z0 - 2 && z < Z1 + 2.5,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.1 * k; },
  };
}
