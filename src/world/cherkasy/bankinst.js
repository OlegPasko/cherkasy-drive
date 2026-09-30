// OWNER: cherkasy. Вул. В'ячеслава Чорновола, 164: the Cherkasy institute of banking (Черкаський інститут банківської
// справи УБС НБУ; since 2022 the Cherkasy division of Lviv university), rebuilt after the 2019 Wikimedia Commons photo of
// its front. The 4-storey teaching block looks south-east over the square towards the street: a maroon ground floor
// under a pale ledge, three storeys of pink-cream wall set back behind a colonnade of round grey columns, and a ribbed
// silver metal attic with small white windows carried on the column heads. The five-bay entrance risalit steps forward:
// glazed doors under a cantilever canopy, steps, thicker end columns and an arched metal fascia with the name in red
// letters and the medallion. Two low wings in cream square panels with pyramid studs stand at the ends, the end walls
// of the block rise over them in dark rose; flag pole and globe lamps in front. The 3-storey annex (164а) north-east of
// it is dressed in the same maroon / pink / metal family (no photo of it was found).
//   BANK_SKIP: the OSM ids replaced here (201102521 with its building:part pieces, 185404390); buildings.js skips them
//   buildBankInst({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are built per plane in a face frame: s metres to the right as seen from outside, y up, o outward. Wall skins
// are split around the openings so windows keep their reveals; everything merges into a handful of meshes.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, obb, rng, area2 } from './geo.js';
import { canvasTex } from './sculpt.js';

const MAIN_ID = 201102521, ANNEX_ID = 185404390;
export const BANK_SKIP = new Set([MAIN_ID, ANNEX_ID]);

// plan in map metres, from the OSM parts of 201102521: the teaching block, its entrance risalit, the two low wings
const BLK = { x0: -3410.3, x1: -3350.0, zb: 2326.9, zf: 2343.5 };
const RIS = { x0: -3388.6, x1: -3369.6, out: 1.2 };
const WINGS = [{ x0: -3421.9, x1: -3410.3, zb: 2326.9, zf: 2352.1 }, { x0: -3350.0, x1: -3336.1, zb: 2326.9, zf: 2353.8 }];
const H0 = 3.6, FH = 3.5, ATT = 2.9, SETBK = 0.9, LEDGE = 0.3, WING = 8.0; // storeys, attic, wall set-back, wing top
const ARC_E = 3.4, ARC_R = 1.2;                                               // fascia over the attic line: ends, rise
const BAYS = [6, 5, 5];                                                       // left part, risalit, right part
const COL = {
  maroon: '#4e3835', rose: '#86605a', pink: '#f4d8c7', column: '#c6cbd0', ledge: '#dcdcd7', frame: '#6a4b3b',
  white: '#efefeb', plinth: '#85817d', metal: '#ffffff', roof: '#4f4e4b', bronze: '#4a3b30',
};
const GLASS = ['#46525c', '#3b4650', '#b4b8b4', '#a9aeab', '#c2c3bd', '#56616a'];
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const inv = (v) => [-v[0], -v[1], -v[2]];

// ------------------------------------------------------------------------------------------------ textures
// fine speckle for the plastered and clad walls; the hue comes from the vertex colour (3 m per repeat)
const plasterTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 3000; k++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(90,80,75,0.07)';
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
  }
  g.fillStyle = 'rgba(80,70,60,0.10)'; g.fillRect(0, h - 2, w, 2); // a panel joint per repeat
});
// trapezoid-ribbed steel sheet, 0.2 m pitch (1.6 m per repeat)
const ribTex = () => canvasTex(256, 16, (g, w, h) => {
  const p = w / 8;
  for (let i = 0; i < 8; i++) {
    const x = i * p, grd = g.createLinearGradient(x, 0, x + p, 0);
    grd.addColorStop(0, '#9aa0a8'); grd.addColorStop(0.25, '#d9dde1'); grd.addColorStop(0.55, '#c9cdd2'); grd.addColorStop(0.8, '#aab0b7'); grd.addColorStop(1, '#8f959d');
    g.fillStyle = grd; g.fillRect(x, 0, p, h);
  }
});
// the wings' cream facing: 2.2 m squares, each with a sunk frame line (2.2 m per repeat)
const panelTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#efe3d8'; g.fillRect(0, 0, w, w);
  for (let k = 0; k < 1500; k++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(120,100,90,0.06)'; g.fillRect(r() * w, r() * w, 2, 2); }
  g.strokeStyle = 'rgba(110,90,80,0.35)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, w - 3);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.strokeRect(30, 30, w - 60, w - 60);
  g.strokeStyle = 'rgba(110,90,80,0.22)'; g.strokeRect(33, 33, w - 60, w - 60);
});
// the arched fascia over the entrance, drawn to scale (fw x fh metres): steel panels, the name along the arch in red
// letters, the medallion, the university line under it
function signTex(fw, fh) {
  const W = 2048, H = Math.round(W * fh / fw), k = W / fw;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#b8bdc3'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(70,75,82,0.35)';
    for (let y = 0.62; y < fh; y += 0.62) g.fillRect(0, H - y * k, W, 2);
    for (let x = 1.9; x < fw; x += 1.9) g.fillRect(x * k, 0, 2, H);
    const R = (fw * fw / 4 + ARC_R * ARC_R) / (2 * ARC_R), cx = W / 2, cy = (fh - R) * -k + H; // arch centre, canvas px
    const letters = (text, rad, px, col, span) => { // one line of letters on an arc of radius rad (m), at most span m long
      const font = (n) => { g.font = `bold ${n}px "Arial Narrow", Arial, sans-serif`; };
      font(px); px = Math.floor(px * Math.min(1, span * k / (g.measureText(text).width * 1.06))); font(px);
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const widths = [...text].map((c) => g.measureText(c).width + px * 0.06), total = widths.reduce((a, b) => a + b, 0);
      let a = -total / 2 / (rad * k);
      [...text].forEach((c, i) => {
        const am = a + widths[i] / 2 / (rad * k);
        g.save(); g.translate(cx + Math.sin(am) * rad * k, cy - Math.cos(am) * rad * k); g.rotate(am);
        g.fillStyle = '#4a1016'; g.fillText(c, 3, 4);                 // the letters are cut from thick plate
        g.fillStyle = col; g.fillText(c, 0, 0);
        g.restore();
        a += widths[i] / (rad * k);
      });
    };
    letters('ЧЕРКАСЬКИЙ ІНСТИТУТ БАНКІВСЬКОЇ СПРАВИ', R - 1.12, Math.round(0.85 * k), '#b3203a', fw * 0.86);
    // medallion: gold ring on a cream disc, a book in it, dark scrolls either side
    const mx = W / 2, my = H - (fh - 2.05) * k, mr = 0.56 * k;
    g.fillStyle = '#3c3a3a';
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(mx + sx * mr * 1.25, my - mr * 0.25, mr * 0.55, mr * 0.3, sx * 0.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#c59a3e'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f1e6cf'; g.beginPath(); g.arc(mx, my, mr * 0.84, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9b2a2e'; g.fillRect(mx - mr * 0.45, my - mr * 0.42, mr * 0.9, mr * 0.84);
    g.fillStyle = '#e1c577'; g.fillRect(mx - mr * 0.03, my - mr * 0.42, mr * 0.06, mr * 0.84);
    g.font = `bold ${Math.round(0.4 * k)}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center';
    for (const [t, y] of [['УНІВЕРСИТЕТУ БАНКІВСЬКОЇ СПРАВИ', 1.3], ['НАЦІОНАЛЬНОГО БАНКУ УКРАЇНИ', 0.78]]) {
      g.fillStyle = '#4a1016'; g.fillText(t, mx + 2, H - y * k + 3);
      g.fillStyle = '#b3203a'; g.fillText(t, mx, H - y * k);
    }
  }, { repeat: false });
}

// ------------------------------------------------------------------------------------------------ face frame
// a wall plane from a to b as seen from outside (s runs a -> b, the outward normal is (-rz, rx))
function plane(ax, az, bx, bz) {
  const w = Math.hypot(bx - ax, bz - az), rx = (bx - ax) / w, rz = (bz - az) / w;
  return { ox: ax, oz: az, rx, rz, nx: -rz, nz: rx, w, N: [-rz, 0, rx], R: [rx, 0, rz], open: [] };
}
// the same plane cut to s0..s1 and pushed o outward (openings start empty)
const cut = (f, s0, s1, o = 0) => ({ ...f, ox: f.ox + f.rx * s0 + f.nx * o, oz: f.oz + f.rz * s0 + f.nz * o, w: s1 - s0, open: [] });
const P = (f, s, y, o = 0) => [f.ox + f.rx * s + f.nx * o, y, f.oz + f.rz * s + f.nz * o];
// the planes of a convex ring, each turned to face away from its centre
function ringPlanes(C) {
  const mx = C.reduce((s, p) => s + p[0], 0) / C.length, mz = C.reduce((s, p) => s + p[1], 0) / C.length;
  return C.map((a, i) => {
    const b = C[(i + 1) % C.length], f = plane(a[0], a[1], b[0], b[1]);
    return f.nx * ((a[0] + b[0]) / 2 - mx) + f.nz * ((a[1] + b[1]) / 2 - mz) >= 0 ? f : plane(b[0], b[1], a[0], a[1]);
  });
}

// quad a b c d whose front looks along n; uv: 8 numbers or none
function quad(D, a, b, c, d, n, uv) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const facing = n[0] * (e1[1] * e2[2] - e1[2] * e2[1]) + n[1] * (e1[2] * e2[0] - e1[0] * e2[2]) + n[2] * (e1[0] * e2[1] - e1[1] * e2[0]);
  const id = [a, b, c, d].map((p, k) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv ? uv[2 * k] : 0, uv ? uv[2 * k + 1] : 0));
  if (facing >= 0) D.quad(id[0], id[1], id[2], id[3]); else D.quad(id[0], id[3], id[2], id[1]);
}
// block in the face frame; sides: 1 front, 2 back, 4 left end (s0), 8 right end (s1), 16 top, 32 bottom
function blk(D, f, s0, s1, y0, y1, o0, o1, sides = 63) {
  const c = (s, y, o) => P(f, s, y, o);
  const list = [
    [1, f.N, [s0, y0, o1], [s1, y0, o1], [s1, y1, o1], [s0, y1, o1]],
    [2, inv(f.N), [s0, y0, o0], [s1, y0, o0], [s1, y1, o0], [s0, y1, o0]],
    [4, inv(f.R), [s0, y0, o0], [s0, y0, o1], [s0, y1, o1], [s0, y1, o0]],
    [8, f.R, [s1, y0, o0], [s1, y0, o1], [s1, y1, o1], [s1, y1, o0]],
    [16, UP, [s0, y1, o0], [s1, y1, o0], [s1, y1, o1], [s0, y1, o1]],
    [32, DOWN, [s0, y0, o0], [s1, y0, o0], [s1, y0, o1], [s0, y0, o1]],
  ];
  for (const [bit, n, ...q] of list) if (sides & bit) quad(D, ...q.map((v) => c(...v)), n);
}
function prismOf(S, pts, y0, y1, kind = 'wall', flags = 0) {
  S.prism((area2(pts) < 0 ? pts.slice().reverse() : pts).flat(), y0, y1, 0, 0, kind, flags);
}
const fprism = (S, f, s0, s1, o0, o1, y0, y1, kind, flags) =>
  prismOf(S, [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = P(f, s, 0, o); return [p[0], p[2]]; }), y0, y1, kind, flags);

// wall skin y0..y1 of a plane around its openings; tile: metres per texture repeat [s, y]
function skin(D, f, y0, y1, color, tile = [3, 3]) {
  const edges = new Set([y0, y1]);
  for (const q of f.open) for (const y of [q.y0, q.y1]) if (y > y0 && y < y1) edges.add(y);
  const ys = [...edges].sort((a, b) => a - b);
  D.setColor(color);
  for (let i = 1; i < ys.length; i++) {
    const ya = ys[i - 1], yb = ys[i];
    const holes = f.open.filter((q) => q.y0 < yb - 1e-3 && q.y1 > ya + 1e-3).sort((a, b) => a.s0 - b.s0);
    let s = 0;
    const run = (a, b) => {
      if (b - a < 1e-3) return;
      quad(D, P(f, a, ya), P(f, b, ya), P(f, b, yb), P(f, a, yb), f.N,
        [a / tile[0], ya / tile[1], b / tile[0], ya / tile[1], b / tile[0], yb / tile[1], a / tile[0], yb / tile[1]]);
    };
    for (const q of holes) { run(s, q.s0); s = Math.max(s, q.s1); }
    run(s, f.w);
  }
}

// ------------------------------------------------------------------------------------------------ openings
// q: { s0, s1, y0, y1, kind: 'win' | 'tall' | 'tiny' | 'glaz' | 'door', rev (reveal colour), glass, lit }
function opening(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, d = q.kind === 'glaz' ? 0.35 : 0.22, b = -d, t = 0.07;
  D.setColor(q.rev);
  quad(D, P(f, s0, y0), P(f, s0, y0, b), P(f, s0, y1, b), P(f, s0, y1), f.R);
  quad(D, P(f, s1, y0), P(f, s1, y0, b), P(f, s1, y1, b), P(f, s1, y1), inv(f.R));
  quad(D, P(f, s0, y1), P(f, s1, y1), P(f, s1, y1, b), P(f, s0, y1, b), DOWN);
  quad(D, P(f, s0, y0), P(f, s1, y0), P(f, s1, y0, b), P(f, s0, y0, b), UP);
  if (q.kind === 'door') {
    D.setColor(q.col ?? COL.frame); blk(D, f, s0, s1, y0, y1, b, b + 0.05, 1);
    D.setColor('#2d3237'); blk(D, f, s0 + 0.3, s1 - 0.3, y0 + 1.1, y1 - 0.25, b, b + 0.055, 1);
    return;
  }
  const fr = b + 0.06, w = s1 - s0, glazing = q.kind === 'glaz';
  D.setColor(q.kind === 'tiny' || q.kind === 'tall' ? COL.white : glazing ? COL.bronze : COL.frame);
  blk(D, f, s0, s1, y1 - t, y1, b, fr, 1 | 32);
  blk(D, f, s0, s1, y0, y0 + t, b, fr, 1 | 16);
  blk(D, f, s0, s0 + t, y0 + t, y1 - t, b, fr, 1 | 8);
  blk(D, f, s1 - t, s1, y0 + t, y1 - t, b, fr, 1 | 4);
  const bars = glazing ? Math.round(w / 1.3) : q.kind === 'tiny' ? 1 : w > 1.7 ? 3 : w > 0.9 ? 2 : 1;
  for (let i = 1; i < bars; i++) { const m = s0 + w * i / bars; blk(D, f, m - 0.04, m + 0.04, y0 + t, y1 - t, b, fr, 1 | 4 | 8); }
  if (glazing || q.kind === 'tall') { // transoms: over the doors / one per storey on the stair strip
    const step = glazing ? 2.45 : 3.5;
    for (let y = y0 + step; y < y1 - 0.4; y += step) blk(D, f, s0 + t, s1 - t, y - 0.05, y + 0.05, b, fr, 1 | 16 | 32);
  }
  if (glazing) { // the two pairs of door leaves in the middle, with push bars
    const m = (s0 + s1) / 2;
    D.setColor('#c9c6bd');
    for (const x of [m - 0.75, m - 0.1, m + 0.1, m + 0.75]) blk(D, f, x - 0.03, x + 0.03, y0 + 0.9, y0 + 1.9, fr, fr + 0.06, 1 | 4 | 8);
  }
  const G = q.lit ? B.lit : B.glass, gz = b + 0.02;
  G.setColor(q.glass);
  quad(G, P(f, s0 + t, y0 + t, gz), P(f, s1 - t, y0 + t, gz), P(f, s1 - t, y1 - t, gz), P(f, s0 + t, y1 - t, gz), f.N);
  if (q.kind === 'win') { D.setColor(COL.white); blk(D, f, s0 - 0.04, s1 + 0.04, y0 - 0.04, y0, -0.04, 0.07, 1 | 4 | 8 | 16); }
}

// white pyramid stud of the wing facing: square base 2a on the wall, apex h out; each side lit as its own plane
function stud(D, f, s, y, a, h) {
  const tip = P(f, s, y, h), mid = P(f, s, y, h / 4), c = [[-a, -a], [a, -a], [a, a], [-a, a]].map(([ds, dy]) => P(f, s + ds, y + dy));
  for (let i = 0; i < 4; i++) {
    const pa = c[i], pb = c[(i + 1) % 4], e1 = pb.map((v, k) => v - pa[k]), e2 = tip.map((v, k) => v - pa[k]);
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...n), away = (pa[0] + pb[0] + tip[0]) / 3 - mid[0], up = (pa[1] + pb[1] + tip[1]) / 3 - mid[1], aw = (pa[2] + pb[2] + tip[2]) / 3 - mid[2];
    const out = n[0] * away + n[1] * up + n[2] * aw >= 0;
    n = n.map((v) => (out ? v : -v) / len);
    const ia = D.vert(...pa, ...n), ib = D.vert(...pb, ...n), it = D.vert(...tip, ...n);
    if (out) D.tri(ia, ib, it); else D.tri(ia, it, ib);
  }
}

// landing (land metres deep) in front of a door at yTop, then treads of <= 16 cm down to the ground in front of it
function stairs(D, S, f, s0, s1, land, yTop, gBase, heightAt) {
  const foot = P(f, (s0 + s1) / 2, 0, land + 1), gFoot = heightAt(foot[0], foot[2]);
  const n = Math.max(2, Math.ceil((yTop - gFoot) / 0.16)), rise = (yTop - gFoot) / n;
  D.setColor('#9c948c');
  for (let k = 0; k < n; k++) blk(D, f, s0, s1, gBase, yTop - k * rise, k ? land + (k - 1) * 0.34 : 0, land + k * 0.34, 1 | 4 | 8 | 16);
  fprism(S, f, s0, s1, 0, land, gBase, yTop, 'wall');
}

// ------------------------------------------------------------------------------------------------ build
export function buildBankInst({ root, map, solids: S, zips: Z, heightAt }) {
  const main = map.buildings.find((q) => q.id === MAIN_ID), annex = map.buildings.find((q) => q.id === ANNEX_ID);
  if (!main) return null;
  const t0 = performance.now(), r = rng(MAIN_ID % 99991);
  const B = { plaster: new MB(), metal: new MB(), panel: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB(), globe: new MB(), flag: new MB() };
  const D = B.det;
  const glass = () => GLASS[Math.floor(r() * GLASS.length)];
  const win = (f, c, w, y0, h, kind = 'win', rev = COL.pink) => f.open.push({ s0: c - w / 2, s1: c + w / 2, y0, y1: y0 + h, kind, rev, glass: glass(), lit: r() < 0.3 });
  const zipTop = (f, y) => { const a = P(f, 0, 0, -0.12), b = P(f, f.w, 0, -0.12); Z.edge(a[0], a[2], b[0], b[2], y, f.nx, f.nz); };
  let nOpen = 0;
  const finish = (f) => { for (const q of f.open) opening(B, f, q); nOpen += f.open.length; };

  // ---- levels: the block sits on the highest corner (a plinth takes up the ~0.9 m fall of the lot)
  const lot = [[BLK.x0, BLK.zb], [BLK.x1, BLK.zb], [BLK.x1, BLK.zf], [BLK.x0, BLK.zf], [WINGS[0].x0, WINGS[0].zf], [WINGS[1].x1, WINGS[1].zf]];
  const hs = lot.map(([x, z]) => heightAt(x, z));
  const gBase = Math.min(...hs) - 0.4, yF = Math.max(...hs) + 0.35;
  const y1 = yF + H0, yU = y1 + LEDGE, y4 = y1 + 3 * FH, yT = y4 + ATT, yRoof = yT - 0.5, yW = yF + WING;
  const floorY = (k) => (k ? y1 + (k - 1) * FH : yF);

  // ---- front (south-east): left part, risalit, right part
  const front = plane(BLK.x0, BLK.zf, BLK.x1, BLK.zf);
  const sa = RIS.x0 - BLK.x0, sb = RIS.x1 - BLK.x0, fw = sb - sa;
  const colonnade = (f, bays, o, ends) => { // f: the part at the front line (o = 0 there); o: its forward shift
    const bw = (f.w - (ends ? 1.2 : 0)) / bays, s0 = ends ? 0.6 : 0;
    const wallU = cut(f, 0, f.w, o - SETBK), cols = [];
    for (let i = 0; i < bays; i++) {
      const c = s0 + bw * (i + 0.5);
      for (let k = 1; k <= 3; k++) win(wallU, c, 2.1, floorY(k) + 0.85, 1.85);
      if (i) cols.push(s0 + bw * i);
    }
    return { wallU, cols, bw, s0 };
  };

  // left and right parts: maroon ground floor, the set-back colonnade, the metal attic flush with the front line
  const parts = [[cut(front, 0, sa), BAYS[0], 'L'], [cut(front, sb, front.w), BAYS[2], 'R']];
  let nCols = 2;
  for (const [f, bays, side] of parts) {
    const { wallU, cols, bw, s0 } = colonnade(f, bays, 0, true);
    const g = cut(f, 0, f.w);
    for (let i = 0; i < bays; i++) {
      const c = s0 + bw * (i + 0.5);
      if (side === 'L' && i === 1) g.open.push({ s0: c - 0.75, s1: c + 0.75, y0: yF, y1: yF + 2.4, kind: 'door', rev: COL.maroon, col: '#3b3f44' });
      else win(g, c, 1.9, yF + 0.9, 1.7, 'win', COL.maroon);
    }
    skin(B.plaster, g, gBase, yF, COL.plinth);
    skin(B.plaster, g, yF, y1, COL.maroon);
    finish(g);
    D.setColor(COL.ledge); blk(D, f, 0, f.w, y1, yU, -SETBK, 0.14, 1 | 4 | 8 | 16 | 32);
    skin(B.plaster, wallU, yU, y4, COL.pink);
    finish(wallU);
    // corner piers at the ends of the part close the set-back
    B.plaster.setColor(COL.pink);
    if (side === 'L') blk(B.plaster, f, 0, 0.6, yU, y4, -SETBK, 0, 1 | 8);
    else blk(B.plaster, f, f.w - 0.6, f.w, yU, y4, -SETBK, 0, 1 | 4);
    // the return wall where the part meets the risalit
    const sr = side === 'L' ? f.w : 0;
    quad(B.plaster, P(f, sr, yU, -SETBK), P(f, sr, yU, RIS.out - SETBK), P(f, sr, y4, RIS.out - SETBK), P(f, sr, y4, -SETBK), side === 'L' ? inv(f.R) : f.R);
    D.setColor(COL.column);
    nCols += cols.length;
    for (const s of cols) {
      const [x, , z] = P(f, s, 0, -SETBK / 2);
      D.cyl(x, yU, z, 0.47, 0.47, 0.35, 14, false).cyl(x, yU + 0.35, z, 0.4, 0.4, y4 - yU - 0.35, 14, false);
    }
    // attic: ribbed metal from the column heads up, a pale beam at its foot, soffit over the set-back
    const at = cut(f, 0, f.w);
    for (const s of cols) at.open.push({ s0: s - 0.2, s1: s + 0.2, y0: y4 + 0.95, y1: y4 + 1.75, kind: 'tiny', rev: COL.white, glass: '#39434c', lit: r() < 0.25 });
    skin(B.metal, at, y4 + 0.35, yT, COL.metal, [1.6, 1]);
    finish(at);
    D.setColor(COL.ledge); blk(D, f, 0, f.w, y4, y4 + 0.35, -SETBK, 0.03, 1 | 32 | 4 | 8);
    zipTop(f, yT);
  }

  // risalit: ground floor pushed out, entrance glazing in the three middle bays, windows either side
  const rf = cut(front, sa, sb, RIS.out), rb = fw / BAYS[1];
  const { wallU: rU, cols: rCols } = colonnade(cut(front, sa, sb), BAYS[1], RIS.out, false);
  const eg0 = rb + 0.35, eg1 = fw - rb - 0.35;
  rf.open.push({ s0: eg0, s1: eg1, y0: yF, y1: y1 - 0.55, kind: 'glaz', rev: COL.maroon, glass: '#2f3a42', lit: true });
  win(rf, rb / 2, 1.9, yF + 0.9, 1.7, 'win', COL.maroon); win(rf, fw - rb / 2, 1.9, yF + 0.9, 1.7, 'win', COL.maroon);
  skin(B.plaster, rf, gBase, yF, COL.plinth);
  skin(B.plaster, rf, yF, y1, COL.maroon);
  finish(rf);
  B.plaster.setColor(COL.maroon);
  blk(B.plaster, rf, 0, fw, gBase, y1, -RIS.out, 0, 4 | 8);
  D.setColor(COL.ledge); blk(D, rf, -0.3, fw + 0.3, y1, yU, -SETBK, 0.16, 1 | 4 | 8 | 16 | 32);
  skin(B.plaster, rU, yU, y4, COL.pink);
  finish(rU);
  D.setColor(COL.column);
  for (const s of rCols) { const [x, , z] = P(rf, s, 0, -SETBK / 2); D.cyl(x, yU, z, 0.47, 0.47, 0.35, 14, false).cyl(x, yU + 0.35, z, 0.4, 0.4, y4 - yU - 0.35, 14, false); }
  // the arched fascia: steel panels with the sign, a white cornice along the arch, the thick end columns under its ends
  const arcR = (fw * fw / 4 + ARC_R * ARC_R) / (2 * ARC_R), top = (s) => y4 + ARC_E + ARC_R - arcR + Math.sqrt(Math.max(0, arcR * arcR - (s - fw / 2) ** 2));
  const hS = ARC_E + ARC_R, back = -RIS.out - 0.45, NSEG = 20;
  for (let i = 0; i < NSEG; i++) {
    const a = fw * i / NSEG, b = fw * (i + 1) / NSEG, ta = top(a) - 0.3, tb = top(b) - 0.3;
    quad(B.sign, P(rf, a, y4), P(rf, b, y4), P(rf, b, tb), P(rf, a, ta), rf.N, [a / fw, 0, b / fw, 0, b / fw, (tb - y4) / hS, a / fw, (ta - y4) / hS]);
    const ca = top(a), cb = top(b), sl = (cb - ca) / (b - a), L = Math.hypot(1, sl), nUp = [-sl * rf.rx / L, 1 / L, -sl * rf.rz / L];
    D.setColor(COL.white);
    quad(D, P(rf, a, ca - 0.3, 0.2), P(rf, b, cb - 0.3, 0.2), P(rf, b, cb + 0.1, 0.2), P(rf, a, ca + 0.1, 0.2), rf.N);
    quad(D, P(rf, a, ca - 0.3), P(rf, b, cb - 0.3), P(rf, b, cb - 0.3, 0.2), P(rf, a, ca - 0.3, 0.2), DOWN);
    quad(D, P(rf, a, ca + 0.1, back), P(rf, b, cb + 0.1, back), P(rf, b, cb + 0.1, 0.2), P(rf, a, ca + 0.1, 0.2), nUp);
    D.setColor('#9ea3a9');
    quad(D, P(rf, a, yRoof, back), P(rf, b, yRoof, back), P(rf, b, cb + 0.1, back), P(rf, a, ca + 0.1, back), inv(rf.N));
    if (i % 4 === 2) { D.setColor('#3a3d40'); blk(D, rf, a - 0.12, a + 0.12, ca + 0.1, ca + 0.3, 0.05, 0.45, 1 | 4 | 8 | 16); } // flood lights
  }
  D.setColor(COL.ledge); blk(D, rf, 0, fw, y4, y4 + 0.01, -SETBK - 0.01, 0, 32); // soffit
  B.metal.setColor(COL.metal);
  for (const s of [0, fw]) quad(B.metal, P(rf, s, y4), P(rf, s, y4, back), P(rf, s, top(s) + 0.1, back), P(rf, s, top(s) + 0.1), s ? rf.R : inv(rf.R));
  D.setColor(COL.column);
  for (const s of [0, fw]) {
    const [x, , z] = P(rf, s, 0, -SETBK / 2), yc = top(s) + 0.1;
    D.cyl(x, yU, z, 0.62, 0.62, 0.4, 16, false).cyl(x, yU + 0.4, z, 0.55, 0.55, yc - yU - 0.75, 16, false);
    D.setColor(COL.white); D.cyl(x, yc - 0.35, z, 0.62, 0.66, 0.3, 16, false).cyl(x, yc - 0.05, z, 0.66, 0.6, 0.3, 16, true);
    D.setColor(COL.column);
  }
  // canopy over the doors, steps and landing across the three middle bays
  const cs0 = eg0 - 0.6, cs1 = eg1 + 0.6, cOut = 2.8;
  D.setColor(COL.white); blk(D, rf, cs0, cs1, y1 - 0.5, y1 - 0.05, 0, cOut, 1 | 4 | 8 | 16 | 32);
  fprism(S, rf, cs0, cs1, -0.05, cOut, y1 - 0.5, y1 - 0.05, 'awning', 1);
  D.setColor('#a8a39c');
  for (const s of [cs0 + 0.3, cs1 - 0.3]) for (const o of [cOut - 0.25]) blk(D, rf, s - 0.08, s + 0.08, y1 - 0.5, y1 - 0.47, o - 0.08, o + 0.08, 32); // downlight rims
  stairs(D, S, rf, cs0 - 0.3, cs1 + 0.3, 3.2, yF, gBase, heightAt);

  // ---- back (north-west): plain version of the front, flush
  const bk = plane(BLK.x1, BLK.zb, BLK.x0, BLK.zb), nb = 17, bbw = bk.w / nb;
  const bG = cut(bk, 0, bk.w), bU = cut(bk, 0, bk.w), bA = cut(bk, 0, bk.w);
  for (let i = 0; i < nb; i++) {
    const c = bbw * (i + 0.5);
    if (i === 8) bG.open.push({ s0: c - 0.8, s1: c + 0.8, y0: yF - 0.2, y1: yF + 2.3, kind: 'door', rev: COL.maroon, col: '#4b4f53' });
    else win(bG, c, 1.8, yF + 0.9, 1.7, 'win', COL.maroon);
    for (let k = 1; k <= 3; k++) win(bU, c, 2.0, floorY(k) + 0.85, 1.85);
    if (i % 2) bA.open.push({ s0: c - 0.2, s1: c + 0.2, y0: y4 + 0.95, y1: y4 + 1.75, kind: 'tiny', rev: COL.white, glass: '#39434c', lit: false });
  }
  skin(B.plaster, bG, gBase, yF, COL.plinth); skin(B.plaster, bG, yF, y1, COL.maroon); finish(bG);
  skin(B.plaster, bU, y1, y4, COL.pink); finish(bU);
  skin(B.metal, bA, y4, yT, COL.metal, [1.6, 1]); finish(bA);
  D.setColor(COL.ledge); blk(D, bk, 0, bk.w, y1 - 0.2, y1, 0, 0.12, 1 | 16 | 32); blk(D, bk, 0, bk.w, y4 - 0.15, y4, 0, 0.1, 1 | 16 | 32);
  zipTop(bk, yT);

  // ---- end walls of the block over the wings: dark rose, a tall stair window near the front
  for (const f of [plane(BLK.x0, BLK.zb, BLK.x0, BLK.zf), plane(BLK.x1, BLK.zf, BLK.x1, BLK.zb)]) {
    const e = cut(f, 0, f.w), sw = f.nx < 0 ? f.w - 3.2 : 3.2;
    e.open.push({ s0: sw - 0.6, s1: sw + 0.6, y0: yW + 0.6, y1: y4 - 0.4, kind: 'tall', rev: COL.white, glass: '#46525c', lit: r() < 0.5 });
    skin(B.plaster, e, yW - 0.6, yT, COL.rose);
    finish(e);
    zipTop(f, yT);
  }

  // ---- roof of the block: bitumen inside a parapet, a few vents and the lift room
  const roofRing = [[BLK.x0 + 0.3, BLK.zb + 0.3], [BLK.x1 - 0.3, BLK.zb + 0.3], [BLK.x1 - 0.3, BLK.zf - 0.3], [BLK.x0 + 0.3, BLK.zf - 0.3]];
  D.setColor(COL.roof); D.face(roofRing.map(([x, z]) => [x, yRoof, z]), UP);
  for (const f of ringPlanes([[BLK.x0, BLK.zb], [BLK.x1, BLK.zb], [BLK.x1, BLK.zf], [BLK.x0, BLK.zf]])) {
    D.setColor('#bfc3c7'); quad(D, P(f, 0.3, yRoof, -0.3), P(f, f.w - 0.3, yRoof, -0.3), P(f, f.w - 0.3, yT, -0.3), P(f, 0.3, yT, -0.3), inv(f.N));
    D.setColor('#9aa0a6'); blk(D, f, -0.03, f.w + 0.03, yT, yT + 0.06, -0.3, 0.05, 1 | 16);
  }
  D.setColor('#a7a49e');
  const lift = plane(-3383, 2331.5, -3376, 2331.5);
  blk(D, lift, 0, 7, yRoof, yRoof + 2.6, -4.5, 0, 63 & ~32);
  fprism(S, lift, 0, 7, -4.5, 0, yRoof, yRoof + 2.6, 'bulkhead');
  D.setColor('#8e9296');
  for (const x of [-3402, -3395, -3362, -3356]) D.box(x - 0.6, yRoof, 2334.5, x + 0.6, yRoof + 0.9, 2336.2, 63 & ~8);
  prismOf(S, [[BLK.x0, BLK.zb], [BLK.x1, BLK.zb], [BLK.x1, BLK.zf], [BLK.x0, BLK.zf]], gBase, yT);
  prismOf(S, [[RIS.x0, BLK.zf], [RIS.x1, BLK.zf], [RIS.x1, BLK.zf + RIS.out], [RIS.x0, BLK.zf + RIS.out]], gBase, top(fw / 2));

  // ---- wings: two storeys in cream panels with white pyramid studs, windows on the outer and back sides
  const wingF = [];
  for (const wg of WINGS) {
    const C = [[wg.x0, wg.zb], [wg.x1, wg.zb], [wg.x1, wg.zf], [wg.x0, wg.zf]];
    for (const f of ringPlanes(C)) {
      const inner = Math.abs(f.nx) > 0.9 && Math.sign(f.nx) === Math.sign((BLK.x0 + BLK.x1) / 2 - (wg.x0 + wg.x1) / 2);
      let g = cut(f, 0, f.w);
      if (inner) { // only the stretch in front of the block shows
        const sIn = [0, f.w].map((s) => P(f, s, 0)[2]), s0 = sIn[0] > sIn[1] ? 0 : f.w - (wg.zf - BLK.zf);
        g = cut(f, s0, s0 + (wg.zf - BLK.zf));
      }
      const facing = f.nz > 0.9 || inner, n = Math.max(1, Math.round(g.w / 3.6));
      if (!facing) for (let i = 0; i < n; i++) {
        const c = g.w * (i + 0.5) / n;
        win(g, c, 1.9, yF + 0.9, 2.1, 'win', '#e4d6ca'); win(g, c, 1.9, yF + 4.6, 2.1, 'win', '#e4d6ca');
      }
      skin(B.plaster, g, gBase, yF, COL.plinth);
      skin(B.panel, g, yF, yW - 0.35, '#ffffff', [2.2, 2.2]);
      finish(g);
      if (facing) { // studs in every other column of squares, one per square
        D.setColor('#f6f2ec');
        for (let si = 1.1; si < g.w - 0.6; si += 4.4) for (let j = Math.ceil((yF - 0.8) / 2.2); j * 2.2 + 1.1 < yW - 1.0; j++) stud(D, g, si, j * 2.2 + 1.1, 0.28, 0.16);
      }
      B.plaster.setColor(COL.maroon); blk(B.plaster, g, -0.04, g.w + 0.04, yW - 0.35, yW, -0.3, 0.06, 1 | 2 | 16 | 32);
      wingF.push(f);
      if (!inner) zipTop(f, yW);
    }
    D.setColor(COL.roof); D.face(C.map(([x, z]) => [x, yW - 0.35, z]), UP);
    prismOf(S, C, gBase, yW);
  }

  // ---- flag pole and the globe lamps of the square
  const pole = P(rf, rb * 1.1, 0, 7.5), gp = heightAt(pole[0], pole[2]);
  D.setColor('#d8d9d6'); D.cyl(pole[0], gp - 0.2, pole[2], 0.08, 0.05, 10.2, 8).cyl(pole[0], gp - 0.2, pole[2], 0.3, 0.25, 0.4, 8);
  S.cyl(pole[0], pole[2], gp, gp + 10, 0.1, 0.1, 'pole');
  const flagY = gp + 8.3, fl = [0, 1.6];
  for (const [col, ya, yb] of [['#1f5fbf', flagY + 0.55, flagY + 1.1], ['#f6cf1c', flagY, flagY + 0.55]]) {
    B.flag.setColor(col);
    const q = fl.map((d) => [pole[0] + rf.rx * d, pole[2] + rf.rz * d]);
    quad(B.flag, [q[0][0], ya, q[0][1]], [q[1][0], ya - 0.15, q[1][1]], [q[1][0], yb - 0.15, q[1][1]], [q[0][0], yb, q[0][1]], rf.N);
  }
  for (const [s, o] of [[-6, 9], [2.5, 10], [fw - 2.5, 10], [fw + 6, 9]]) {
    const p = P(rf, s, 0, o), g = heightAt(p[0], p[2]);
    D.setColor('#26282a'); D.cyl(p[0], g, p[2], 0.14, 0.07, 0.6, 8).cyl(p[0], g + 0.6, p[2], 0.07, 0.05, 3.6, 8);
    const arm = (d) => [p[0] + rf.rx * d, g + 3.55, p[2] + rf.rz * d];
    D.tube([p[0], g + 3.0, p[2]], arm(-0.7), 0.03, 5).tube([p[0], g + 3.0, p[2]], arm(0.7), 0.03, 5);
    B.globe.setColor('#fbf6ea');
    for (const c of [[p[0], g + 4.2, p[2]], arm(-0.7), arm(0.7)]) B.globe.ellipsoid([c[0], c[1] + 0.2, c[2]], [0.21, 0.21, 0.21], 10, 6);
    S.cyl(p[0], p[2], g, g + 4.2, 0.1, 0.1, 'pole');
  }

  // ---- the annex (164а): three storeys, maroon ground floor, pink upper floors with grey pilaster strips, metal band
  let annexH = 0, annexBox = null;
  if (annex) {
    const ring = ringPts(annex.p), o = obb(ring.length === 8 ? ring.slice(4) : ring); // the first four points are the porch
    let ux = o.ux, uz = o.uz, hl = o.L / 2, hw = o.W / 2;
    if (hl < hw) { [ux, uz] = [-uz, ux]; [hl, hw] = [hw, hl]; }
    const vx = -uz, vz = ux, C = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => [o.cx + ux * hl * i + vx * hw * j, o.cz + uz * hl * i + vz * hw * j]);
    const ah = C.map(([x, z]) => heightAt(x, z)), aBase = Math.min(...ah) - 0.4, aF = ah.reduce((a, b) => a + b, 0) / 4 + 0.3;
    // the lot falls ~3 m to the west: the floor follows the middle, a semi-basement shows at the low end
    const a1 = aF + H0, a3 = a1 + 2 * FH, aTop = a3 + 1.0;
    annexH = aTop - Math.min(...ah); annexBox = { cx: o.cx, cz: o.cz, ux, uz, vx, vz, hl: hl + 3, hw: hw + 3 };
    for (const f of ringPlanes(C)) {
      const long = f.w > 30, n = Math.max(2, Math.round(f.w / 3.4)), bw = f.w / n, g = cut(f, 0, f.w), u = cut(f, 0, f.w);
      const entrance = long && f.nz > 0; // the long side facing the street
      for (let i = 0; i < n; i++) {
        const c = bw * (i + 0.5);
        if (entrance && Math.abs(i - (n - 1) / 2) < 1) {
          if (i === Math.floor(n / 2)) g.open.push({ s0: f.w / 2 - 1.8, s1: f.w / 2 + 1.8, y0: aF, y1: a1 - 0.6, kind: 'glaz', rev: COL.maroon, glass: '#2f3a42', lit: true });
        } else if (long || i % 2 === 0) {
          const gp = P(f, c, 0, 1), gy = heightAt(gp[0], gp[2]);
          if (gy < aF + 0.6) win(g, c, 1.8, aF + 0.9, 1.7, 'win', COL.maroon);
          if (aF - gy > 1.25) win(g, c, 1.2, gy + 0.3, Math.min(0.7, aF - gy - 0.55), 'win', COL.plinth);
        }
        if (long || i % 2 === 0) for (let k = 1; k <= 2; k++) win(u, c, 2.0, a1 + (k - 1) * FH + 0.85, 1.8);
      }
      skin(B.plaster, g, aBase, aF, COL.plinth); skin(B.plaster, g, aF, a1, COL.maroon); finish(g);
      skin(B.plaster, u, a1, a3, COL.pink); finish(u);
      const band = cut(f, 0, f.w); skin(B.metal, band, a3, aTop, COL.metal, [1.6, 1]);
      D.setColor(COL.ledge); blk(D, f, 0, f.w, a1 - 0.05, a1 + 0.2, 0, 0.14, 1 | 16 | 32);
      D.setColor(COL.column);
      if (long) for (let i = 1; i < n; i++) blk(D, f, bw * i - 0.28, bw * i + 0.28, a1 + 0.2, a3, 0, 0.18, 1 | 4 | 8);
      D.setColor('#bfc3c7'); quad(D, P(f, 0.3, aTop - 0.5, -0.3), P(f, f.w - 0.3, aTop - 0.5, -0.3), P(f, f.w - 0.3, aTop, -0.3), P(f, 0.3, aTop, -0.3), inv(f.N));
      D.setColor('#9aa0a6'); blk(D, f, -0.03, f.w + 0.03, aTop, aTop + 0.06, -0.3, 0.05, 1 | 16);
      if (entrance) {
        D.setColor(COL.white); blk(D, f, f.w / 2 - 2.6, f.w / 2 + 2.6, a1 - 0.5, a1 - 0.15, 0, 2.2, 1 | 4 | 8 | 16 | 32);
        fprism(S, f, f.w / 2 - 2.6, f.w / 2 + 2.6, -0.05, 2.2, a1 - 0.5, a1 - 0.15, 'awning', 1);
        stairs(D, S, f, f.w / 2 - 2.4, f.w / 2 + 2.4, 1.6, aF, aBase, heightAt);
      }
      zipTop(f, aTop);
    }
    D.setColor(COL.roof); D.face(C.map(([x, z]) => [x, aTop - 0.5, z]), UP);
    prismOf(S, C, aBase, aTop);
    if (ring.length === 8) { // the porch on the north-east end: one maroon storey with the side door
      const pc = ring.slice(0, 4), pm = pc.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
      const pF = Math.max(aF, heightAt(pm[0], pm[1]) + 0.15), ph = Math.max(aF + 3.2, pF + 2.9); // the stair door opens at the high end
      for (const f of ringPlanes(pc)) {
        const out = f.nx * (P(f, f.w / 2, 0)[0] - o.cx) + f.nz * (P(f, f.w / 2, 0)[2] - o.cz);
        if (f.w < 0.5 || (Math.abs(f.nx * ux + f.nz * uz) > 0.9 && out < hl - 0.1)) continue; // the side against the annex
        const g = cut(f, 0, f.w);
        if (f.w > 3) g.open.push({ s0: f.w / 2 - 0.7, s1: f.w / 2 + 0.7, y0: pF, y1: pF + 2.3, kind: 'door', rev: COL.maroon, col: '#5a3a2c' });
        skin(B.plaster, g, aBase, pF, COL.plinth); skin(B.plaster, g, pF, ph, COL.maroon); finish(g);
        D.setColor(COL.ledge); blk(D, f, -0.05, f.w + 0.05, ph, ph + 0.2, -0.1, 0.1, 1 | 16);
      }
      D.setColor(COL.roof); D.face(pc.map(([x, z]) => [x, ph + 0.01, z]), UP);
      prismOf(S, pc, aBase, ph + 0.2);
    }
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'bankinst' });
  root.add(group);
  const sign = signTex(fw, hS);
  const M = {
    plaster: new THREE.MeshStandardMaterial({ map: plasterTex(r), vertexColors: true, roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ map: ribTex(), vertexColors: true, roughness: 0.45, metalness: 0.45 }),
    panel: new THREE.MeshStandardMaterial({ map: panelTex(r), vertexColors: true, roughness: 0.8 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, roughness: 0.45, metalness: 0.3, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0 }),
    globe: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xfff0d0, emissiveIntensity: 0.05 }),
    flag: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
  };
  let nV = 0;
  for (const [k, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const glassy = k === 'glass' || k === 'lit' || k === 'globe';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), M[k]), { name: 'bankinst-' + k, castShadow: !glassy, receiveShadow: true }));
  }
  console.log(`[cherkasy] Banking institute: ${nOpen} openings, ${nCols + rCols.length} columns, ${(nV / 1000).toFixed(1)}k verts, ground ${yF.toFixed(1)} in ${(performance.now() - t0).toFixed(0)} ms`);

  const inBox = (x, z, q) => { const dx = x - q.cx, dz = z - q.cz; return Math.abs(dx * q.ux + dz * q.uz) < q.hl && Math.abs(dx * q.vx + dz * q.vz) < q.hw; };
  return {
    footprints: [
      { poly: ringPts(main.p), h: yT - gBase - 0.4, kind: 'public', name: 'Черкаський інститут банківської справи' },
      ...(annex ? [{ poly: ringPts(annex.p), h: annexH, kind: 'public', name: 'Чорновола 164а' }] : []),
    ],
    // no generated trees on the walls, the steps, the flag pole or in front of the lamps
    clear: (x, z) => (x > WINGS[0].x0 - 3 && x < WINGS[1].x1 + 3 && z > BLK.zb - 3 && z < Math.max(WINGS[0].zf, WINGS[1].zf) + 3)
      || (x > RIS.x0 - 9 && x < RIS.x1 + 9 && z < BLK.zf + 13 && z > BLK.zf) || (annexBox !== null && inBox(x, z, annexBox)),
    update() {
      const k = nightK.value;
      M.lit.emissiveIntensity = 1.25 * k; M.sign.emissiveIntensity = 0.35 * k; M.globe.emissiveIntensity = 0.05 + 2.2 * k;
    },
  };
}
