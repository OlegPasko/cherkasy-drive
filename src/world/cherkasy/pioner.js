// OWNER: cherkasy. ТРЦ «Pioneer», вул. Митницька, 13 / бульв. Шевченка, 274 (OSM way 411245074), rebuilt after the
// malls.rent photos of the finished mall (2020), the novobudovy.com renders and the satellite view. A five-storey
// shopping block along Mytnytska with a seven-storey corner tower at the Shevchenka boulevard crossing. The tower is
// white render over a salmon-pink base, with a pink recessed bay of paired windows on its Mytnytska face, a dark
// cornice, and on top a glazed lantern under a grey pyramid roof; the black «P» logo panel with its orange cubes hangs
// on the boulevard face over the entrance. The long wing is painted as a patchwork of squares running from pink by the
// tower through coral and orange to yellow at the far end, rows of plain windows, a dark shopfront band over the
// glazed ground floor, and the white «PIONEER» letters on a steel frame on its roof. The yard and end walls are
// plain render. The one-storey red-roofed house in the boulevard corner (OSM 411245077) is a separate building and is
// left to the generic extrusion. Windows, lantern and letters light up at night.
//   PIONER_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildPioner({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The footprint is axis-aligned in map metres: the tower is the rectangle in its north corner, the wing the rest of
// the ring; walls are laid per ring edge in an edge frame (shellkit.js).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, inPoly } from './geo.js';
import { edge, ringFaces, at, plate, slab, skin, hole, block, base, fin, quad, gaps } from './shellkit.js';

const OSM_ID = 411245074;
export const PIONER_SKIP = new Set([OSM_ID]);

const TW = [-89.2, 1054.3, -76.9, 1068.6];           // the corner tower [x0, z0, x1, z1]
const G0 = 4.6, FH = 3.2, NW_ = 5, NT = 7;           // ground floor, upper storey, storeys of the wing / tower
const TOP_W = G0 + (NW_ - 1) * FH, TOP_T = G0 + (NT - 1) * FH; // wall tops over the floor
const WHITE = '#f0ede6', PINK = '#e27684', DARK = '#36383b', FRAME = '#4d5154', GL = ['#3d4a53', '#46545c', '#34414a'];

const renderTex = (r) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(90,80,70,0.06)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
// the wing's painted patchwork over the whole Mytnytska face (u 0..1 from the tower end, v 0..1 over the upper
// floors): 2 m squares drawn a shade apart from a pink -> coral -> orange -> yellow gradient, a few jumping ahead
const patchTex = (r) => canvasTex(1024, 256, (g, w, h) => {
  const ramp = [[226, 118, 132], [236, 112, 100], [242, 136, 70], [245, 176, 60], [246, 204, 72]];
  const col = (t) => { const k = Math.min(ramp.length - 1.001, Math.max(0, t * (ramp.length - 1))), i = Math.floor(k), f = k - i; return ramp[i].map((c, j) => c + (ramp[i + 1][j] - c) * f); };
  const nx = 22, ny = 6, cw = w / nx, ch = h / ny;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const c = col(Math.min(1, Math.max(0, (i + (r() - 0.5) * 3.2) / nx))), k = 0.93 + r() * 0.12;
    g.fillStyle = `rgb(${c.map((v) => Math.min(255, v * k) | 0).join(',')})`; g.fillRect(i * cw, j * ch, cw + 1, ch + 1);
  }
}, { repeat: false });
// atlas 1024 x 1024: rows 0-255 the roof letters, 256-511 the fascia text, 512-1023 left half the «P» logo panel
const SIGN = { roof: [0, 0, 1, 0.25], fascia: [0, 0.25, 1, 0.5], logo: [0, 0.5, 0.5, 1] };
const signTex = (r) => canvasTex(1024, 1024, (g) => {
  g.clearRect(0, 0, 1024, 1024);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 200px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#ffffff'; g.fillText('PIONEER', 512, 132, 1000);
  g.fillStyle = DARK; g.fillRect(0, 256, 1024, 256);
  g.font = 'bold 96px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#f2f2f2'; g.fillText('ТОРГОВЕЛЬНИЙ ЦЕНТР', 512, 384, 980);
  g.fillStyle = '#1b1c1e'; g.fillRect(0, 512, 512, 512);
  for (let i = 0; i < 26; i++) { // the tumbling cubes over the top right corner
    const a = r() * Math.PI / 2, d = 60 + r() * 150, x = 360 + Math.cos(a) * d * 0.9, y = 620 - Math.sin(a) * d * 0.5 + r() * 120, s = 22 + r() * 30;
    g.fillStyle = ['#f15a24', '#f7931e', '#fbb03b', '#e8322b', '#ffcc33'][(r() * 5) | 0];
    g.save(); g.translate(x, y); g.rotate(r()); g.fillRect(-s / 2, -s / 2, s, s); g.restore();
  }
  g.strokeStyle = '#ffffff'; g.lineWidth = 34; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(130, 900); g.lineTo(130, 690); g.lineTo(330, 690); g.quadraticCurveTo(390, 690, 390, 760); g.quadraticCurveTo(390, 830, 330, 830); g.lineTo(200, 830); g.stroke();
  g.font = 'bold 84px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#ffffff'; g.fillText('PIONEER', 256, 975, 440);
}, { repeat: false, aniso: 16 });

export function buildPioner({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), g = base(ring, heightAt), yF = g.hi + 0.1, gB = g.lo - 0.6, Y = (h) => yF + h;
  const B = { wall: new MB(), patch: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB(), roof: new MB() };
  const D = B.det, RND = [2, 2, 0];
  const onTW = (x, z) => x > TW[0] - 0.05 && x < TW[2] + 0.05 && z > TW[1] - 0.05 && z < TW[3] + 0.05;
  const inTW = (x, z) => x > TW[0] + 0.05 && x < TW[2] - 0.05 && z > TW[1] + 0.05 && z < TW[3] - 0.05;
  let nOpen = 0;
  const win = (f, s0, s1, y0, y1, extra) => { f.cuts.push({ s0, s1, y0, y1, glass: GL[(r() * 3) | 0], frame: FRAME, pitch: 1.0, dark: r() < 0.4, sill: true, ...extra }); nOpen++; };

  // ---- the wing: every ring edge except the tower's own; the stretch of an edge along the tower is a cover cut
  const span = (f) => {
    let a = null, b = null;
    for (let s = 0; s <= f.L + 0.049; s += 0.05) { const t = Math.min(s, f.L), p = at(f, t, 0); if (onTW(p[0], p[2])) { a ??= t; b = t; } }
    return a === null || b - a < 0.2 ? null : [a, b];
  };
  const wing = [];
  for (const f of ringFaces(ring)) {
    const sp = span(f);
    if (sp && sp[1] - sp[0] > f.L - 0.2) continue; // a tower wall
    if (sp) f.cuts.push({ s0: sp[0], s1: sp[1], y0: gB - 1, y1: Y(TOP_W + 1), cover: true });
    f.front = Math.abs(f.nz + 1) < 0.01 && f.L > 20; // the Mytnytska face looks north-west (-z)
    wing.push(f);
  }
  const front = wing.find((f) => f.front);
  if (!front) throw new Error('Pioneer: the Mytnytska front is not where it was');
  const fs0 = gaps(front, Y(1), Y(2), (c) => c.cover)[0]; // the wing's own stretch of the front
  const flen = fs0[1] - fs0[0], towardTower = front.ux > 0; // s grows towards the tower when the edge runs +x

  for (const f of wing) {
    const free = gaps(f, Y(1), Y(2), (c) => c.cover);
    for (const [a, b] of free) {
      const L = b - a;
      if (f.front) { // shopfront units below, four rows of windows above, paired narrow ones every third bay
        const nb = Math.max(1, Math.round(L / 3.3)), p = L / nb;
        for (let i = 0; i < nb; i++) {
          const m = a + (i + 0.5) * p;
          f.cuts.push({ s0: m - p / 2 + 0.25, s1: m + p / 2 - 0.25, y0: Y(0.05), y1: Y(3.3), glass: '#4e5d63', frame: FRAME, pitch: 1.3, tr: Y(2.5), door: i % 4 === 1, dark: false }); nOpen++;
          for (let k = 1; k < NW_; k++) {
            const y0 = Y(G0 + (k - 1) * FH + 0.9);
            if (i % 3 === 2) { win(f, m - 0.95, m - 0.2, y0, y0 + 1.75); win(f, m + 0.2, m + 0.95, y0, y0 + 1.75); } else win(f, m - 0.7, m + 0.7, y0, y0 + 1.75);
          }
        }
      } else if (L > 4) { // yard and end walls: plain windows on the upper floors, a service door or two below
        const nb = Math.max(1, Math.round(L / 3.6)), p = L / nb;
        for (let i = 0; i < nb; i++) {
          const m = a + (i + 0.5) * p;
          for (let k = 1; k < NW_; k++) { const y0 = Y(G0 + (k - 1) * FH + 0.9); if (r() < 0.85) win(f, m - 0.65, m + 0.65, y0, y0 + 1.6); }
          if (i % 3 === 1) { const pd = at(f, m, 0, 1), yd = Math.max(yF, heightAt(pd[0], pd[2]) + 0.1); win(f, m - 0.6, m + 0.6, yd, yd + 2.2, { door: true, sill: false, pitch: 1.2, dark: false }); }
        }
      }
    }
    // skins: on the front the patchwork over the upper floors, the dark shopfront band, a pink base; plain elsewhere
    if (f.front) {
      const [a] = fs0;
      // u runs from the tower end (0) to the far end (1) whichever way the edge goes
      const skinP = (y0, y1) => { const ys = [y0, y1]; for (const c of f.cuts) for (const y of [c.y0, c.y1]) if (y > y0 && y < y1) ys.push(y); ys.sort((p, q) => p - q);
        B.patch.setColor('#ffffff');
        for (let i = 0; i + 1 < ys.length; i++) for (const [s0, s1] of gaps(f, ys[i], ys[i + 1])) {
          const u = (s) => (towardTower ? (fs0[1] - s) : (s - a)) / flen, v = (y) => (y - Y(G0)) / (TOP_W - G0);
          quad(B.patch, at(f, s0, ys[i]), at(f, s1, ys[i]), at(f, s1, ys[i + 1]), at(f, s0, ys[i + 1]), [f.nx, 0, f.nz], [[u(s0), v(ys[i])], [u(s1), v(ys[i])], [u(s1), v(ys[i + 1])], [u(s0), v(ys[i + 1])]]);
        } };
      skinP(Y(G0), Y(TOP_W));
      skin(B.wall, f, gB, Y(G0), PINK, RND);
      D.setColor(DARK); for (const [s0, s1] of gaps(f, Y(G0 - 1), Y(G0), (c) => c.cover)) slab(D, f, s0, s1, Y(G0 - 1.15), Y(G0 - 0.05), 0, 0.35, 'ftu');
    } else skin(B.wall, f, gB, Y(TOP_W), '#e9e3da', RND);
    for (const q of f.cuts) if (!q.cover) hole(B, f, q);
    for (const [s0, s1] of gaps(f, Y(TOP_W), Y(TOP_W + 1), (c) => c.cover)) {
      D.setColor('#9fa1a2'); slab(D, f, s0 - 0.05, s1 + 0.05, Y(TOP_W), Y(TOP_W + 0.35), -0.3, 0.08, 'ftu');
      const p0 = at(f, s0, 0, -0.1), p1 = at(f, s1, 0, -0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP_W + 0.35), f.nx, f.nz);
    }
    D.setColor('#6f6f6c'); for (const [s0, s1] of gaps(f, gB, yF, (c) => c.cover || c.door)) slab(D, f, s0, s1, gB, yF, -0.02, 0.06, 'ft');
  }

  // ---- the tower: faces of its rectangle (north-west and north-east are the street fronts)
  const [x0, z0, x1, z1] = TW;
  const T = { n: edge([x1, z0], [x0, z0], 0, -1), e: edge([x1, z1], [x1, z0], 1, 0), s: edge([x0, z1], [x1, z1], 0, 1), w: edge([x0, z0], [x0, z1], -1, 0) };
  T.w.cuts.push({ s0: 0, s1: T.w.L, y0: gB - 1, y1: Y(TOP_W), cover: true });
  const lvl = (k) => Y(G0 + (k - 1) * FH);
  // Mytnytska face: the pink bay at the boulevard corner (paired big windows), two window columns beyond it
  const BAY = [0.7, 5.6];
  const bay = [];
  for (let k = 2; k < NT; k++) for (const [a, b] of [[BAY[0] + 0.5, BAY[0] + 2.3], [BAY[1] - 2.3, BAY[1] - 0.5]]) {
    bay.push({ s0: a, s1: b, y0: lvl(k) + 0.6, y1: lvl(k) + 2.6, tr: lvl(k) + 1.9, pitch: 0.9, rev: '#d86d7b', glass: GL[(r() * 3) | 0], frame: FRAME, dark: r() < 0.4, sill: true }); nOpen++;
  }
  for (const c of [7.6, 10.4]) for (let k = 1; k < NT; k++) win(T.n, c - 0.6, c + 0.6, lvl(k) + 0.8, lvl(k) + 2.5);
  T.n.cuts.push({ s0: 1.2, s1: 5.2, y0: Y(0.05), y1: Y(3.3), glass: '#4e5d63', frame: FRAME, pitch: 1.3, tr: Y(2.5) }); nOpen++;
  T.n.cuts.push({ s0: 7.0, s1: 11.2, y0: Y(0.05), y1: Y(3.3), glass: '#4e5d63', frame: FRAME, pitch: 1.4, tr: Y(2.5), door: true }); nOpen++;
  // boulevard face: the entrance under the fascia, the logo panel over floors 1-2, two window columns
  T.e.cuts.push({ s0: 2.0, s1: 7.4, y0: Y(0.05), y1: Y(3.3), glass: '#4e5d63', frame: FRAME, pitch: 1.1, tr: Y(2.6), door: true }); nOpen++;
  for (const c of [2.2, 4.6]) for (let k = 1; k < NT; k++) if (k > 2 || c < 3) win(T.e, c - 0.55, c + 0.55, lvl(k) + 0.8, lvl(k) + 2.5);
  for (let k = 3; k < NT; k++) win(T.e, 10.4, 11.6, lvl(k) + 0.8, lvl(k) + 2.5);
  // yard face above the wing: windows
  for (const c of [3, 6, 9]) for (let k = NW_; k < NT; k++) win(T.s, c - 0.6, c + 0.6, lvl(k) + 0.8, lvl(k) + 2.5);
  for (const k of ['n', 'e', 's', 'w']) {
    const f = T[k];
    const lo = k === 'w' ? Y(TOP_W) : gB;
    if (k === 'n') { // the bay is set back 0.4 m: its own wall plane with the paired windows, reveals round it
      const yb0 = lvl(2) - 0.2, yb1 = Y(TOP_T - 0.6), p0 = at(f, 0, 0, -0.4), p1 = at(f, f.L, 0, -0.4);
      const bf = edge([p0[0], p0[2]], [p1[0], p1[2]], f.nx, f.nz);
      bf.cuts = bay.concat([{ s0: -1, s1: BAY[0], y0: -1e3, y1: 1e3, cover: true }, { s0: BAY[1], s1: bf.L + 1, y0: -1e3, y1: 1e3, cover: true }]);
      f.cuts.push({ s0: BAY[0], s1: BAY[1], y0: yb0, y1: yb1, cover: true });
      skin(B.wall, bf, yb0, yb1, PINK, RND);
      for (const q of bay) hole(B, bf, q);
      B.wall.setColor(WHITE);
      slab(B.wall, f, BAY[0] - 0.01, BAY[0], yb0, yb1, -0.4, 0, 'r'); slab(B.wall, f, BAY[1], BAY[1] + 0.01, yb0, yb1, -0.4, 0, 'l');
      slab(B.wall, f, BAY[0], BAY[1], yb0 - 0.01, yb0, -0.4, 0, 't'); slab(B.wall, f, BAY[0], BAY[1], yb1, yb1 + 0.01, -0.4, 0, 'u');
    }
    skin(B.wall, f, lo, Math.min(lvl(2) - 0.2, Y(TOP_T)), PINK, RND);
    skin(B.wall, f, Math.max(lo, lvl(2) - 0.2), Y(TOP_T), WHITE, RND);
    for (const q of f.cuts) if (!q.cover) hole(B, f, q);
    D.setColor(DARK); slab(D, f, -0.1, f.L + 0.1, Y(TOP_T), Y(TOP_T + 0.45), -0.3, 0.25, 'ftu'); // the dark cornice
    const p0 = at(f, 0, 0, 0.1), p1 = at(f, f.L, 0, 0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP_T + 0.45), f.nx, f.nz);
    if (k === 'n' || k === 'e') { // the dark shopfront band over the ground floor, with the name on the boulevard side
      D.setColor(DARK); slab(D, f, -0.1, f.L + 0.1, Y(G0 - 1.15), Y(G0 - 0.05), 0, 0.35, 'ftulr');
      D.setColor('#6f6f6c'); for (const [s0, s1] of gaps(f, gB, yF, (c) => c.door)) slab(D, f, s0, s1, gB, yF, -0.02, 0.06, 'ft');
    }
  }
  const sq = (f, s0, s1, y0, y1, o, [u0, v0, u1, v1]) => {
    const fl = f.ux * f.nz - f.uz * f.nx < 0, [a, b] = fl ? [u1, u0] : [u0, u1];
    quad(B.sign, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), [f.nx, 0, f.nz], [[a, 1 - v1], [b, 1 - v1], [b, 1 - v0], [a, 1 - v0]]);
  };
  sq(T.e, 0.6, 9.0, Y(G0 - 1.1), Y(G0 - 0.1), 0.37, SIGN.fascia);
  sq(T.e, 7.6, 13.4, Y(G0 + 0.2), Y(G0 + 6.0), 0.06, SIGN.logo);
  // the lantern: a glazed box on the roof under a grey pyramid
  const lc = [(x0 + x1) / 2, (z0 + z1) / 2], lh = 3.6, yl = Y(TOP_T + 0.45), LH = 2.6;
  const LF = { n: edge([lc[0] + lh, lc[1] - lh], [lc[0] - lh, lc[1] - lh], 0, -1), e: edge([lc[0] + lh, lc[1] + lh], [lc[0] + lh, lc[1] - lh], 1, 0), s: edge([lc[0] - lh, lc[1] + lh], [lc[0] + lh, lc[1] + lh], 0, 1), w: edge([lc[0] - lh, lc[1] - lh], [lc[0] - lh, lc[1] + lh], -1, 0) };
  for (const f of Object.values(LF)) {
    B.lit.setColor('#8ea3ad'); plate(B.lit, f, 0, f.L, yl + 0.4, yl + LH, 0);
    D.setColor('#e8e8e4'); slab(D, f, 0, f.L, yl, yl + 0.4, 0, 0.05, 'ft');
    for (let s = 0; s <= f.L + 0.01; s += f.L / 5) slab(D, f, s - 0.05, s + 0.05, yl + 0.4, yl + LH, 0, 0.06, 'flr');
    slab(D, f, -0.1, f.L + 0.1, yl + LH, yl + LH + 0.2, -0.1, 0.3, 'ftu');
  }
  const apex = [lc[0], yl + LH + 2.4, lc[1]], E = [[lc[0] - lh - 0.3, lc[1] - lh - 0.3], [lc[0] + lh + 0.3, lc[1] - lh - 0.3], [lc[0] + lh + 0.3, lc[1] + lh + 0.3], [lc[0] - lh - 0.3, lc[1] + lh + 0.3]].map(([x, z]) => [x, yl + LH + 0.2, z]);
  B.roof.setColor('#8c9194');
  E.forEach((a, i) => { const b = E[(i + 1) % 4], mx = (a[0] + b[0]) / 2 - lc[0], mz = (a[2] + b[2]) / 2 - lc[1], l = Math.hypot(mx, mz, 2.4 * 0.8); B.roof.face([a, b, apex], [mx / l, (lh + 0.3) / l, mz / l]); });
  S.prism([lc[0] - lh, lc[1] - lh, lc[0] + lh, lc[1] - lh, lc[0] + lh, lc[1] + lh, lc[0] - lh, lc[1] + lh], yl, yl + LH + 0.2, 0, 0, 'wall');
  S.cyl(lc[0], lc[1], yl + LH + 0.2, apex[1], lh + 0.4, 0.2, 'roof');

  // ---- roofs, rooftop plant and the «PIONEER» letters over the wing
  const wingRing = ring.filter(([x, z]) => !inTW(x, z));
  B.roof.setColor('#8a8b89'); B.roof.fill(ring, [], Y(TOP_W), true);
  B.roof.setColor('#77797a'); B.roof.fill([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [], Y(TOP_T), true);
  for (const [x, z, w, d, h] of [[-120, 1076, 3, 2, 1.6], [-108, 1080, 2, 2, 1.2], [-126, 1062, 1.6, 1.6, 1.1]]) {
    if (!inPoly(ring, x, z)) continue;
    D.setColor('#cfcfca'); D.box(x - w / 2, Y(TOP_W), z - d / 2, x + w / 2, Y(TOP_W + h), z + d / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], Y(TOP_W), Y(TOP_W + h), 0, 0, 'equipment');
  }
  const sm = towardTower ? fs0[1] - flen * 0.3 : fs0[0] + flen * 0.3, sw = 17, sh = sw * 0.25 * 1024 / 1024 * 0.9;
  sq(front, sm - sw / 2, sm + sw / 2, Y(TOP_W + 0.9), Y(TOP_W + 0.9 + sh), -2.2, SIGN.roof);
  D.setColor('#5d6063');
  for (let s = sm - sw / 2 + 0.5; s <= sm + sw / 2; s += 2.6) { const p = at(front, s, 0, -2.35); D.box(p[0] - 0.06, Y(TOP_W), p[2] - 0.06, p[0] + 0.06, Y(TOP_W + 0.9 + sh), p[2] + 0.06, 1 | 2 | 4 | 8 | 16); }
  slab(D, front, sm - sw / 2, sm + sw / 2, Y(TOP_W + 0.8), Y(TOP_W + 0.9), -2.4, -2.25, 'ftub');

  // ---- collision
  S.prism(wingRing.flat(), gB, Y(TOP_W + 0.35), 0, 0, 'wall');
  S.prism([x0, z0, x1, z0, x1, z1, x0, z1], gB, Y(TOP_T + 0.45), 0, 0, 'wall');

  // ---- meshes
  const sign = signTex(r);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: renderTex(r), vertexColors: true, roughness: 0.9 }),
    patch: new THREE.MeshStandardMaterial({ map: patchTex(r), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: 0xffdcae, emissiveIntensity: 0 }),
    sign: decal(new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.35, roughness: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  };
  const st = fin(root, 'pioner', B, M, ['glass', 'lit', 'sign', 'roof']);
  console.log(`[cherkasy] Pioneer: ${nOpen} openings, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(st.verts / 1000).toFixed(1)}k verts, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const bx = ring.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  return {
    footprints: [{ poly: ring, h: Y(TOP_W) - g.lo, kind: bld.k, name: 'Pioneer' }, { poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h: apex[1] - g.lo, kind: bld.k, name: 'Pioneer' }],
    clear: (x, z) => x > bx[0] - 2 && x < bx[2] + 2 && z > bx[1] - 2 && z < bx[3] + 2,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.85 * k; M.sign.emissiveIntensity = 0.9 * k; },
  };
}
