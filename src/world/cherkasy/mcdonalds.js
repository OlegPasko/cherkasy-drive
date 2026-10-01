// OWNER: cherkasy. McDonald's, вул. Смілянська, 31 (OSM way 104299459), on the corner of Smilianska and bulvar
// Shevchenka (GitHub issue #12). A one-storey restaurant of about 34 x 19 m with its north-east corner cut on the
// diagonal towards the junction. Built in the chain's current Ukrainian look (no usable photos of this site were
// found; the restaurant closed for a modernisation on 15 Sep 2026): anthracite panel walls, a warm wood-slat fascia
// over floor-to-ceiling dining glazing on the Smilianska and boulevard sides, the entrance in the cut corner under a
// flat canopy, a taller block over it with the golden arches, a yellow blade at its edge, «McDonald's» lettering on
// the fascias. OSM gives the rest of the layout: the McDrive lane (two one-way service roads) wraps the west and
// south sides, so the menu board stands at its start and the pay / pick-up windows with little yellow canopies are on
// the south wall; the terrace (the food court way 923309968 with its three roof ways) sits between the building and
// Smilianska: a timber deck with three flat canopies over tables, two parasols and planters along the pavement. A
// tall pylon with the red «M» box stands at the drive-thru entrance off Smilianska. Glazing and signs light at night.
//   MCDONALDS_SKIP: the OSM ids replaced here (the building and the three terrace roofs; buildings.js skips them)
//   buildMcDonalds({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge with bldkit.js; the corner block is the ring clipped to its corner (x > TX, z < TZ).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, inPoly, area2 } from './geo.js';
import { edgeFaces, pt, fbox, panel, wall, gaps, win, decal, mats, finish } from './bldkit.js';

const OSM_ID = 104299459, ROOFS = [917065825, 917065826, 917065827];
export const MCDONALDS_SKIP = new Set([OSM_ID, ...ROOFS]);

const H = 4.6, T = 6.8, FAS = 3.15;  // parapet, the corner block, the fascia's lower edge (over the floor)
const TX = -110.5, TZ = 517;         // the corner block: the part of the ring north-east of these lines
const GREY = '#5b5e62', DARK = '#3a3d40', YEL = '#ffbc0d', RED = '#db0007', STEEL = '#3a3d40';
const PYLON = [-141, 486.6];          // beside the McDrive entrance off Smilianska
const MENU = [-130.9, 497.6];         // the order point at the start of the lane

// anthracite composite panels, 2.4 x 1.2 m per repeat: open joints and a faint sheen (tinted by vertex colour)
const panelTex = () => canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, w, h);
  const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, 'rgba(255,255,255,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0.06)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
});
// vertical timber slats, 1 m per repeat: ten 8 cm slats with dark gaps, each a slightly different brown
const slatTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#2a1d14'; g.fillRect(0, 0, w, h);
  const tones = ['#b27a45', '#a96f3c', '#bb8550', '#a56d3f', '#b47c48', '#ad7542', '#b98249', '#a7703f', '#b0783f', '#b6804b'];
  for (let i = 0; i < 10; i++) {
    const x = i * w / 10, grd = g.createLinearGradient(x, 0, x + w / 10, 0);
    grd.addColorStop(0, tones[i]); grd.addColorStop(0.8, tones[(i + 3) % 10]); grd.addColorStop(1, '#6e4a2c');
    g.fillStyle = grd; g.fillRect(x + 2, 0, w / 10 - 5, h);
  }
});
// dining glazing, one pane per repeat: a slim dark frame, glass catching the sky at the top; the glow mask lights the glass
const glaze = (glow) => canvasTex(64, 192, (g, w, h) => {
  g.fillStyle = glow ? '#000' : '#26292c'; g.fillRect(0, 0, w, h);
  let fill = '#fff';
  if (!glow) { fill = g.createLinearGradient(0, 0, 0, h); fill.addColorStop(0, '#9fb0ba'); fill.addColorStop(0.35, '#5d6c75'); fill.addColorStop(1, '#3a4248'); }
  g.fillStyle = fill; g.fillRect(3, 3, w - 6, h - 6);
  if (glow) { g.fillStyle = '#8a8a8a'; g.fillRect(3, h * 0.55, w - 6, h * 0.45 - 3); } // the lower half dimmer: tables and people
});

// sign atlas 1024 x 1024 (cells in canvas fractions, top-left origin, as bldkit's decal reads them)
const SIGN = { m: [0, 0, 0.5, 0.4375], box: [0.5, 0, 1, 0.5], word: [0, 0.5, 1, 0.656], drive: [0, 0.672, 0.5, 0.781], menu: [0.5, 0.672, 1, 1] };
function arches(g, x, y, w, h, lw) { // the golden arches: two parabolic arches on straight legs, meeting low in the middle
  const X = (u) => x + u * w, Y = (v) => y + v * h;
  g.lineWidth = lw; g.lineCap = 'butt'; g.lineJoin = 'round'; g.strokeStyle = YEL;
  g.beginPath(); g.moveTo(X(0.06), Y(1));
  g.bezierCurveTo(X(0.06), Y(0.3), X(0.17), Y(0.02), X(0.29), Y(0.02));
  g.bezierCurveTo(X(0.41), Y(0.02), X(0.49), Y(0.32), X(0.5), Y(0.62));
  g.bezierCurveTo(X(0.51), Y(0.32), X(0.59), Y(0.02), X(0.71), Y(0.02));
  g.bezierCurveTo(X(0.83), Y(0.02), X(0.94), Y(0.3), X(0.94), Y(1));
  g.stroke();
}
const signTex = () => canvasTex(1024, 1024, (g) => {
  g.clearRect(0, 0, 1024, 1024);
  arches(g, 16, 40, 480, 400, 58);
  g.fillStyle = RED; g.beginPath(); g.roundRect(522, 10, 492, 492, 40); g.fill();
  arches(g, 572, 90, 392, 330, 50);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 132px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.fillText('McDonald’s', 512, 592, 1000);
  g.fillStyle = YEL; g.font = 'bold 92px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.fillText('McDrive', 256, 745, 490);
  // the menu board: a dark panel, three lit picture panels of burgers, fries and drinks over price rows
  g.fillStyle = '#1d1f21'; g.fillRect(512, 688, 512, 336);
  const pics = [['#c8873a', '#7a3d1d'], ['#f2c14e', '#db0007'], ['#5a2f1a', '#e6e6e6']];
  pics.forEach(([a, b], i) => {
    const x = 530 + i * 166;
    g.fillStyle = '#f4efe6'; g.fillRect(x, 706, 150, 150);
    g.fillStyle = a; g.beginPath(); g.ellipse(x + 75, 770, 55, 30, 0, 0, 7); g.fill();
    g.fillStyle = b; g.fillRect(x + 22, 790, 106, 22);
    for (let k = 0; k < 4; k++) { g.fillStyle = '#e8e8e8'; g.fillRect(x + 6, 876 + k * 34, 100, 12); g.fillStyle = YEL; g.fillRect(x + 116, 876 + k * 34, 30, 12); }
  });
}, { repeat: false, aniso: 16 });

// clip a ring by the half-planes x > TX and z < TZ (Sutherland-Hodgman, one plane at a time)
function clipCorner(ring) {
  const cut = (P, inside, hit) => P.flatMap((p, i) => {
    const q = P[(i + 1) % P.length], a = inside(p), b = inside(q);
    return a ? (b ? [p] : [p, hit(p, q)]) : (b ? [hit(p, q)] : []);
  });
  const atX = (p, q) => [TX, p[1] + (q[1] - p[1]) * (TX - p[0]) / (q[0] - p[0])];
  const atZ = (p, q) => [p[0] + (q[0] - p[0]) * (TZ - p[1]) / (q[1] - p[1]), TZ];
  return cut(cut(ring, (p) => p[0] > TX, atX), (p) => p[1] < TZ, atZ);
}
// the stretch of a face's edge that lies in the corner block, or null
function cornerSpan(f) {
  let s0 = 0, s1 = f.L;
  for (const [o, d, lim, sg] of [[f.ax, f.ux, TX, 1], [f.az, f.uz, TZ, -1]]) { // need sg * (o + d s - lim) > 0
    if (Math.abs(d) < 1e-6) { if (sg * (o - lim) <= 0) return null; continue; }
    const s = (lim - o) / d;
    if (sg * d > 0) s0 = Math.max(s0, s); else s1 = Math.min(s1, s);
  }
  return s1 - s0 > 0.05 ? [s0, s1] : null;
}

export function buildMcDonalds({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), n0 = S.count;
  const ring = ringPts(bld.p);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const probe = (x, z) => { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); };
  for (const [x, z] of ring) probe(x, z);
  for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) { const x = x0 + (x1 - x0) * i / 6, z = z0 + (z1 - z0) * j / 6; if (inPoly(ring, x, z)) probe(x, z); }
  const yF = gHi + 0.12, gB = gLo - 0.5, Y = (h) => yF + h;
  const corner = clipCorner(ring);

  const B = { wall: new MB(), wood: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const D = B.det, PUV = [2.4, 1.2];
  let nOpen = 0;
  const dine = (s0, s1, y0 = Y(0.3), y1 = Y(2.95)) => ({ s0, s1, y0, y1, cols: Math.max(1, Math.round((s1 - s0) / 1.5)), rows: 1, lit: true, glass: '#ffffff', rev: DARK, dep: 0.14 });
  const faces = edgeFaces(ring);
  const kind = (f) => (f.nz < -0.9 && f.L > 10 ? 'north' : f.nz > 0.9 && f.L > 10 ? 'south' : f.nx < -0.9 ? 'west'
    : f.nx > 0.5 && f.nz < -0.5 ? 'diag' : f.nx > 0.9 && f.L > 6 ? 'east' : 'stub');

  for (const f of faces) {
    const k = kind(f), span = cornerSpan(f), L = f.L, holes = [], doors = [];
    if (k === 'north') { holes.push(dine(1.2, (span ? span[0] : L) - 0.9)); if (span) holes.push(dine(span[0] + 0.5, L - 0.35)); }
    else if (k === 'stub') holes.push(dine(0.3, L - 0.3));
    else if (k === 'diag') holes.push({ ...dine(0.55, L - 0.55, Y(0), Y(3.2)), rows: 1, cols: 6, door: true });
    else if (k === 'east') holes.push(dine(0.45, L - 0.6));
    else if (k === 'south') { // drive-thru: pay window to the west, pick-up window east of it (the lane runs east); a back door
      for (const s of [L - 8, L - 16.5]) holes.push({ s0: s - 0.8, s1: s + 0.8, y0: Y(0.95), y1: Y(2.25), cols: 2, rows: 1, lit: true, glass: '#ffffff', rev: '#d8d8d8', dep: 0.12, dt: s });
      doors.push(L - 2.6);
    } else if (k === 'west') { doors.push(4.5); for (const s of [9, 12.5]) holes.push({ s0: s - 0.9, s1: s + 0.9, y0: Y(1.95), y1: Y(2.6), cols: 2, rows: 1, glass: '#9aa0a4', rev: DARK, dep: 0.1 }); }
    for (const s of doors) holes.push({ s0: s - 0.55, s1: s + 0.55, y0: yF, y1: Y(2.2), door: 'steel' });

    // plinth, walls round the openings, the fascia, the corner block over the parapet, copings
    D.setColor('#5a5d60'); fbox(D, f, 0, L, gB, yF, -0.05, 0.04, 'f');
    const dining = k === 'north' || k === 'east' || k === 'stub' || k === 'diag';
    B.wall.setColor(GREY); wall(B.wall, f, yF, Y(H), dining ? holes.map((h) => ({ ...h, y1: Math.max(h.y1, Y(FAS)) })) : holes, PUV);
    for (const q of holes) {
      nOpen++;
      if (q.door === 'steel') { D.setColor('#56595c'); fbox(D, f, q.s0, q.s1, q.y0, q.y1, -0.12, -0.08, 'f'); D.setColor('#c9c9c9'); fbox(D, f, q.s1 - 0.25, q.s1 - 0.1, Y(1.0), Y(1.06), -0.08, 0.0, 'ftu'); continue; }
      if (dining && q.y1 < Y(FAS)) { B.wall.setColor(DARK); panel(B.wall, f, q.s0, q.s1, q.y1, Y(FAS), 0, PUV); } // spandrel under the fascia
      win(B, f, q);
    }
    // the fascia: wood slats on the dining sides (not on the corner block), a strip at the drive-thru's east end
    const woodRuns = dining && k !== 'diag' && k !== 'stub' ? (span ? [[0, span[0]], [span[1], L]] : [[0, L]]).filter(([a, b]) => b - a > 0.3)
      : k === 'south' ? [[0, 9]] : [];
    for (const [a, b] of woodRuns) {
      B.wood.setColor('#ffffff'); panel(B.wood, f, a, b, Y(FAS), Y(H) - 0.15, 0.08, [1, 1]);
      D.setColor(DARK); fbox(D, f, a, b, Y(FAS) - 0.06, Y(FAS), 0, 0.12, 'ftu'); fbox(D, f, a, b, Y(H) - 0.15, Y(H) - 0.1, 0, 0.12, 'ftu');
    }
    if (span) { B.wall.setColor(DARK); panel(B.wall, f, span[0], span[1], Y(H), Y(T), 0, PUV); }
    D.setColor('#25282a');
    for (const [a, b] of span ? [[0, span[0]], [span[1], L]].filter(([a, b]) => b - a > 0.05) : [[0, L]]) fbox(D, f, a, b, Y(H), Y(H) + 0.1, -0.25, 0.1, 'ftu');
    if (span) fbox(D, f, span[0], span[1], Y(T), Y(T) + 0.12, -0.25, 0.1, 'ftu');
    const top = span && span[1] - span[0] > L - 0.1 ? Y(T) : Y(H), p0 = pt(f, 0, 0), p1 = pt(f, L, 0);
    Z.edge(p0[0], p0[2], p1[0], p1[2], top + 0.1, f.nx, f.nz, 'roofEdge', 4);

    // signs and the bits that make it a McDonald's
    if (k === 'north') { // «M McDonald's» on a dark panel in the middle of the wood fascia
      const c = (span ? span[0] : L) / 2, w = 9.4, h0 = Y(FAS) + 0.12, h1 = Y(H) - 0.27;
      D.setColor(DARK); fbox(D, f, c - w / 2, c + w / 2, Y(FAS) + 0.02, Y(H) - 0.18, 0.08, 0.16, 'flrtu');
      decal(B.sign, f, c - w / 2 + 0.2, c - w / 2 + 0.2 + (h1 - h0) * 1.2, h0, h1, 0.17, SIGN.m);
      const wl = c - w / 2 + 0.4 + (h1 - h0) * 1.2, wh = (c + w / 2 - 0.2 - wl) / 6.4;
      decal(B.sign, f, wl, c + w / 2 - 0.2, (h0 + h1) / 2 - wh / 2, (h0 + h1) / 2 + wh / 2, 0.17, SIGN.word);
    }
    if (k === 'diag') { // the entrance: door frames, a flat canopy, the golden arches over it, the yellow blade at the north end
      for (const s of [L / 2 - 1.2, L / 2, L / 2 + 1.2]) { D.setColor('#1f2224'); fbox(D, f, s - 0.04, s + 0.04, yF, Y(2.4), -0.1, -0.02, 'flr'); }
      D.setColor('#1f2224'); fbox(D, f, L / 2 - 1.2, L / 2 + 1.2, Y(2.36), Y(2.44), -0.1, -0.02, 'ftu');
      D.setColor('#c9c9c9'); for (const s of [L / 2 - 0.15, L / 2 + 0.11]) fbox(D, f, s, s + 0.04, Y(0.8), Y(1.7), -0.02, 0.06, 'flr');
      D.setColor(DARK); fbox(D, f, 0.2, L - 0.2, Y(3.3), Y(3.55), 0, 1.8, 'ftulr');
      D.setColor('#f2efe6'); fbox(D, f, 0.3, L - 0.3, Y(3.29), Y(3.3), 0.05, 1.7, 'u'); // lit soffit strip
      const Q = [[0.2, 0], [L - 0.2, 0], [L - 0.2, 1.8], [0.2, 1.8]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
      S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), Y(3.3), Y(3.55), 0, 0, 'awning', 1);
      D.setColor('#8a8c8c'); fbox(D, f, -0.5, L + 0.5, gB, yF, 0, 2.6, 'ftlr');    // the step out to the pavement
      decal(B.sign, f, L / 2 - 1.75, L / 2 + 1.75, Y(3.75), Y(3.75) + 2.9, 0.06, SIGN.m);
      D.setColor(YEL); fbox(D, f, -0.15, 0.4, gB + 0.3, Y(T) + 0.7, 0, 0.55, 'fblrt');
    }
    if (k === 'east' && span) { // a smaller «M» on the corner block towards the boulevard, the name on the fascia
      decal(B.sign, f, (span[0] + span[1]) / 2 - 1.1, (span[0] + span[1]) / 2 + 1.1, Y(H) + 0.15, Y(H) + 1.95, 0.04, SIGN.m);
      const wl = span[1] + 0.4, wr = L - 0.4, wh = Math.min((wr - wl) / 6.4, 0.9);
      D.setColor(DARK); fbox(D, f, wl - 0.2, wr + 0.2, Y(FAS) + 0.05, Y(H) - 0.2, 0.08, 0.16, 'flrtu');
      decal(B.sign, f, wl, wr, (Y(FAS) + Y(H)) / 2 - wh / 2, (Y(FAS) + Y(H)) / 2 + wh / 2, 0.17, SIGN.word);
    }
    if (k === 'south') { // yellow canopies over the windows, «McDrive» between them, the «M» box at the east end
      for (const q of holes) if (q.dt) {
        D.setColor(YEL); fbox(D, f, q.dt - 1.3, q.dt + 1.3, Y(2.55), Y(2.85), 0, 0.95, 'ftulr');
        D.setColor('#cfcfcf'); fbox(D, f, q.s0 - 0.05, q.s1 + 0.05, Y(0.9), Y(0.95), 0, 0.35, 'ftlr'); // the hand-over sill
      }
      const m = L - 12.25;
      decal(B.sign, f, m - 1.6, m + 1.6, Y(2.95), Y(2.95) + 0.7, 0.04, SIGN.drive);
      decal(B.sign, f, 2.5, 5.0, Y(FAS) + 0.05, Y(H) - 0.05, 0.12, SIGN.box);
    }
  }
  // the corner block's own walls over the main roof (the cut lines through the ring)
  for (const f of edgeFaces(corner)) {
    const m = pt(f, f.L / 2, 0);
    if (Math.abs(m[0] - TX) > 0.05 && Math.abs(m[2] - TZ) > 0.05) continue;
    B.wall.setColor(DARK); panel(B.wall, f, 0, f.L, Y(H) - 0.3, Y(T), 0, PUV);
    D.setColor('#25282a'); fbox(D, f, 0, f.L, Y(T), Y(T) + 0.12, -0.25, 0.1, 'ftu');
  }
  // roofs: the membrane with a few air handlers and a vent stack, the corner block's cap
  D.setColor('#6c6f72'); D.fill(ring, [], Y(H) - 0.3, true);
  D.setColor('#5f6265'); D.fill(corner, [], Y(T) - 0.2, true);
  for (const [x, z, w, d] of [[-124, 512, 3.2, 2], [-118, 518, 2.4, 1.6], [-120, 508, 1.6, 1.6]]) {
    D.setColor('#cfd1d1'); D.box(x - w / 2, Y(H) - 0.3, z - d / 2, x + w / 2, Y(H) + 1.1, z + d / 2, 1 | 2 | 4 | 16 | 32);
    D.setColor('#8a8d8f'); D.cyl(x, Y(H) + 1.1, z, 0.45, 0.45, 0.12, 10, true);
  }
  D.setColor('#9a9c9d'); D.cyl(-126.5, Y(H) - 0.3, 519.5, 0.25, 0.25, 2.2, 8, true);
  S.prism((area2(ring) < 0 ? ring.slice().reverse() : ring).flat(), gB, Y(H), 0, 0, 'wall');
  S.prism((area2(corner) < 0 ? corner.slice().reverse() : corner).flat(), Y(H), Y(T), 0, 0, 'wall');

  // ---- the terrace between the building and Smilianska: deck, three canopies over tables, parasols, planters
  const roofs = ROOFS.map((id) => map.buildings.find((q) => q.id === id)).filter(Boolean).map((q) => ringPts(q.p));
  const tx0 = -129.3, tx1 = -115.2, tz0 = 490.6, tz1 = 501.0, ty = heightAt((tx0 + tx1) / 2, (tz0 + tz1) / 2);
  let deckY = -Infinity; for (const [x, z] of [[tx0, tz0], [tx1, tz0], [tx1, tz1], [tx0, tz1]]) deckY = Math.max(deckY, heightAt(x, z));
  deckY += 0.15;
  B.wood.setColor('#9a8f86'); B.wood.fill([[tx0, tz0], [tx1, tz0], [tx1, tz1], [tx0, tz1]], [], deckY, true);
  D.setColor('#6b6e70'); D.box(tx0, ty - 0.6, tz0, tx1, deckY - 0.01, tz1, 1 | 2 | 16 | 32);
  S.box(tx0, ty - 0.6, tz0, tx1, deckY, tz1, 'step');
  const table = (x, z, seats) => {
    D.setColor('#2b2d2f'); D.cyl(x, deckY, z, 0.06, 0.06, 0.72, 6, false);
    D.setColor('#d9d3c8'); D.box(x - 0.4, deckY + 0.72, z - 0.4, x + 0.4, deckY + 0.76, z + 0.4);
    for (const [dx, dz] of seats) { D.setColor('#3c3f42'); D.box(x + dx - 0.2, deckY, z + dz - 0.2, x + dx + 0.2, deckY + 0.45, z + dz + 0.2, 1 | 2 | 4 | 16 | 32); }
  };
  for (const r of roofs) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const [x, z] of r) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); }
    const ry = deckY + 2.75;
    D.setColor(DARK); D.box(a - 0.15, ry, c - 0.15, b + 0.15, ry + 0.22, d + 0.15);
    D.setColor('#f1ece0'); D.box(a + 0.3, ry - 0.01, c + 0.3, b - 0.3, ry, d - 0.3, 8);            // lit soffit
    for (const [x, z] of [[a + 0.1, c + 0.1], [b - 0.1, c + 0.1], [a + 0.1, d - 0.1], [b - 0.1, d - 0.1]]) {
      D.setColor(STEEL); D.box(x - 0.06, deckY, z - 0.06, x + 0.06, ry, z + 0.06, 1 | 2 | 16 | 32);
      S.cyl(x, z, deckY - 0.3, ry, 0.08, 0.08, 'pole');
    }
    S.prism([a - 0.15, c - 0.15, b + 0.15, c - 0.15, b + 0.15, d + 0.15, a - 0.15, d + 0.15], ry, ry + 0.22, 0, 0, 'awning', 1);
    const mx = (a + b) / 2;
    table(mx, c + 1.3, [[-0.65, 0], [0.65, 0]]); table(mx, d - 1.3, [[-0.65, 0], [0.65, 0]]);
  }
  for (const x of [-125.5, -119]) { // parasols over the open front of the deck
    table(x, 493.4, [[-0.65, 0], [0.65, 0], [0, -0.65]]);
    D.setColor('#d6d6d2'); D.cyl(x, deckY + 0.76, 493.4, 0.03, 0.03, 1.6, 6, false);
    D.setColor('#3a3c3f'); D.cyl(x, deckY + 2.1, 493.4, 1.5, 0.06, 0.45, 12, false);
  }
  for (let x = tx0 + 0.6; x < tx1 - 0.5; x += 2.4) { // planters along the pavement edge, box hedges in them
    D.setColor('#3c3f42'); D.box(x - 1.0, deckY, tz0 + 0.1, x + 1.0, deckY + 0.42, tz0 + 0.5, 1 | 2 | 4 | 16 | 32);
    D.setColor('#4f7d3c'); D.box(x - 0.9, deckY + 0.42, tz0 + 0.15, x + 0.9, deckY + 0.7, tz0 + 0.45, 1 | 2 | 4 | 16 | 32);
  }
  S.box(tx0, deckY, tz0 + 0.1, tx1, deckY + 0.7, tz0 + 0.5, 'wall');

  // ---- the pylon at the McDrive entrance and the menu board at the start of the lane
  {
    const [px, pz] = PYLON, g = heightAt(px, pz), top = g + 11.5, sh = 2.6;
    D.setColor(STEEL); D.box(px - 0.22, g - 0.3, pz - 0.22, px + 0.22, top - sh, pz + 0.22, 1 | 2 | 4 | 16 | 32);
    D.setColor('#6a6d70'); D.box(px - 0.6, g - 0.3, pz - 0.6, px + 0.6, g + 0.3, pz + 0.6, 1 | 2 | 4 | 16 | 32);
    for (const sg of [1, -1]) { // a red box, read along Smilianska both ways
      const f = { ax: px, az: pz - sg * sh / 2, ux: 0, uz: sg, nx: sg, nz: 0, L: sh };
      if (sg > 0) { D.setColor(RED); fbox(D, f, 0, sh, top - sh, top, -0.25, 0.25, 'lrtu'); }
      D.setColor(RED); fbox(D, f, 0, sh, top - sh, top, 0.24, 0.25, 'f');
      decal(B.sign, f, 0, sh, top - sh, top, 0.27, SIGN.box);
    }
    S.cyl(px, pz, g - 0.3, top - sh, 0.3, 0.3, 'pole');
    S.box(px - 0.3, top - sh, pz - sh / 2, px + 0.3, top, pz + sh / 2, 'wall');
  }
  {
    const [mx, mz] = MENU, g = heightAt(mx, mz), f = { ax: mx, az: mz + 1.1, ux: 0, uz: -1, nx: -1, nz: 0, L: 2.2 };
    D.setColor(STEEL); fbox(D, f, 0, 2.2, g, g + 2.3, -0.2, 0.05, 'fblrt');
    decal(B.sign, f, 0.05, 2.15, g + 0.75, g + 2.2, 0.06, SIGN.menu);
    D.setColor(DARK); fbox(D, f, -0.2, 2.4, g + 2.3, g + 2.45, -0.3, 0.3, 'fblrtu');
    D.setColor(STEEL); fbox(D, f, 2.9, 3.15, g, g + 1.3, -0.12, 0.12, 'fblrt');   // the speaker post before it
    D.setColor('#c8c8c8'); fbox(D, f, 2.92, 3.13, g + 1.0, g + 1.25, 0.12, 0.13, 'f');
    S.box(mx - 0.3, g - 0.3, mz - 1.2, mx + 0.2, g + 2.45, mz + 1.2, 'wall');
  }

  // ---- meshes
  const sign = signTex();
  const M = mats({
    wall: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.55, metalness: 0.2 }),
    wood: new THREE.MeshStandardMaterial({ map: slatTex(), vertexColors: true, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ map: glaze(false), vertexColors: true, roughness: 0.1, metalness: 0.35 }),
    lit: new THREE.MeshStandardMaterial({ map: glaze(false), emissiveMap: glaze(true), vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: 0xffe2b8, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0.05, alphaTest: 0.4, roughness: 0.4, side: THREE.DoubleSide }),
  });
  const out = finish(root, 'mcdonalds', B, M, ['wall', 'wood', 'det']);
  console.log(`[cherkasy] McDonald's: ${nOpen} openings, floor ${yF.toFixed(1)} m (ground ${gLo.toFixed(1)}..${gHi.toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: Y(T) - gLo, kind: bld.k, name: 'McDonald’s' }, ...roofs.map((poly) => ({ poly, h: 3, kind: 'roof' }))],
    clear: (x, z) => x > x0 - 8 && x < x1 + 3 && z > tz0 - 2 && z < z1 + 6,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.85 * k; M.sign.emissiveIntensity = 0.05 + 1.0 * k; },
  };
}
