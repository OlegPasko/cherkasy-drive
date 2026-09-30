// OWNER: cherkasy. Вулиця Байди Вишневецького, 36: the city council (Черкаська міська рада), rebuilt after the Wikimedia
// Commons photos (Черкаська міськрада.jpg, 2019; Cherkasy HDR 8.jpg) and the Esri satellite view. A seven-storey
// white slab of the 1980s facing the paved square on its south-east side: five office storeys set in a deep grid of
// bevelled frames, two windows to a frame, a top storey of small square windows, a ground floor clad in dark granite
// with a long cantilevered canopy over the glazed entrance and its steps. The north-east end rises one storey higher
// round the stair and lift tower, with the state arms (the tryzub on a blue shield) on the square front and the flag
// on its roof. Plain window rows on the yard side, blank ends, wall AC units, lit windows at night.
//   MISKRADA_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildMiskrada({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per face of the OSM ring (civic.js): s to the right seen from outside, y up, o out of the wall. The
// map frame runs along the slab (x to the north-east), so the raised tower part is everything north-east of X_TOWER.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, area2 } from './geo.js';
import { canvasTex, decal } from './sculpt.js';
import { wallFaces, at, quad, skin, fbox, fsolid, wallAround, fillOpening, stoneTex, paveTex, paveRect, pack } from './civic.js';

const OSM_ID = 108383954;
export const MISKRADA_SKIP = new Set([OSM_ID]);

const LIFT = 0.45, GF = 4.2, FH = 3.3, NO = 5, TOPF = 3.0, RAISE = 3.3, PARA = 0.6; // storeys and parapet
const FIN = 0.5, RIB = 0.32, BEV = 0.34, REC = 1.2; // grid: depth out of the wall, rib width, bevel inset; ground floor set-back
const PANEL = '#ecebe6', RIBC = '#f3f2ee', GRANITE = '#4b4744', GLASS = ['#6d7a82', '#5f6c74', '#7b868c', '#56626a'];
const BLINDS = ['#e4e2da', '#d9d6cb', '#efeee8'];

// the state arms: a blue shield with a gold border and a gold trident, cut out by alpha
const armsTex = () => canvasTex(256, 320, (g, w, h) => {
  const shield = (inset) => {
    g.beginPath(); g.moveTo(inset, inset); g.lineTo(w - inset, inset); g.lineTo(w - inset, h * 0.62);
    g.quadraticCurveTo(w - inset, h - inset * 1.3, w / 2, h - inset); g.quadraticCurveTo(inset, h - inset * 1.3, inset, h * 0.62); g.closePath();
  };
  g.fillStyle = '#d6a834'; shield(4); g.fill();
  g.fillStyle = '#1d4f9e'; shield(16); g.fill();
  Object.assign(g, { strokeStyle: '#f0c440', fillStyle: '#f0c440', lineWidth: 14, lineCap: 'butt', lineJoin: 'miter' });
  const c = w / 2, base = 248;
  const spike = (x, y) => { g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x - 11, y); g.lineTo(x + 11, y); g.closePath(); g.fill(); };
  // stem with its spear head, the base bar, the two outer prongs bending into the base
  g.beginPath(); g.moveTo(c, 92); g.lineTo(c, base); g.stroke(); spike(c, 96);
  g.fillRect(c - 36, base - 6, 72, 16);
  for (const k of [-1, 1]) {
    g.beginPath(); g.moveTo(c + k * 66, 62); g.lineTo(c + k * 66, 196); g.quadraticCurveTo(c + k * 66, base, c + k * 22, base); g.stroke(); spike(c + k * 66, 66);
    // the inner arm: from the stem's foot out and up, closing a loop, with its short blade pointing in
    g.lineWidth = 10; g.beginPath(); g.moveTo(c + k * 4, 214); g.quadraticCurveTo(c + k * 40, 212, c + k * 40, 170); g.lineTo(c + k * 40, 140); g.stroke();
    g.beginPath(); g.moveTo(c + k * 40, 138); g.lineTo(c + k * 26, 162); g.stroke(); g.lineWidth = 14;
  }
}, { repeat: false });

export function buildMiskrada({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count ?? 0;
  const ring = ringPts(b.p), faces = wallFaces(ring);
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const X0 = Math.min(...xs), X1 = Math.max(...xs);
  // the square front is the longest wall facing +z; the tower starts two grid cells in from its north-east end
  const front = faces.filter((f) => f.nz > 0.9).reduce((m, f) => (f.w > m.w ? f : m));
  const NC = Math.max(6, Math.round(front.w / 6.1)), CW = front.w / NC;
  const fx = (f, s) => f.ax + f.rx * s;                         // world x of a point on a face
  const xEnd = Math.max(front.ax, front.ax + front.rx * front.w);
  const X_TOWER = xEnd - 2 * CW;
  const hs = ring.map(([x, z]) => heightAt(x, z)), gFront = heightAt(...[at(front, front.w / 2, 0, 4)].map((p) => [p[0], p[2]])[0]);
  const yF = Math.max(gFront + LIFT, Math.max(...hs) + 0.15), gBase = Math.min(...hs) - 0.5;
  const fl = (k) => yF + (k ? GF + (k - 1) * FH : 0);           // floor k: 0 ground, 1..5 offices, 6 top
  const yRoof = fl(NO + 1) + TOPF, yTop = yRoof + PARA, yRoofT = yRoof + RAISE, yTopT = yRoofT + PARA + 0.3;

  const B = { panel: new MB(), granite: new MB(), det: new MB(), glass: new MB(), lit: new MB(), arms: new MB(), cloth: new MB(), pave: new MB() };
  const glazing = (litP = 0.3, blindP = 0.4) => ({ glass: r() < blindP ? BLINDS[Math.floor(r() * 3)] : GLASS[Math.floor(r() * GLASS.length)], lit: r() < litP });
  const acs = [];
  let nWin = 0;
  const win = (f, s0, s1, y0, y1, extra = {}) => { f.open.push({ s0, s1, y0, y1, dep: 0.18, frame: '#f4f4f0', pane: 0.75, rev: '#dcdad3', ...glazing(), ...extra }); nWin++; };

  // ---- the square front: ground floor, the framed grid, the top storey
  const f = front, gy0 = fl(1), gy1 = fl(NO + 1);
  // the ground floor stands back under the office storeys: its own face REC behind the front
  const fG = { ...f, ax: f.ax - f.nx * REC, az: f.az - f.nz * REC, open: [] };
  for (let c = 0; c < NC; c++) {
    const s0 = c * CW, m = s0 + CW / 2, tower = fx(f, m) > X_TOWER;
    // ground floor: tall glazing in pairs, the glazed hall and its doors under the canopy's middle
    const door = c === NC - 4 || c === NC - 5;
    if (door) win(fG, s0 + 0.35, s0 + CW - 0.35, yF, yF + 3.6, { frame: '#8e9294', pane: 1.2, glass: '#3a4248', lit: true, door: true, dep: 0.3 });
    else { win(fG, s0 + 0.5, m - 0.25, yF + 0.5, yF + 3.5, { frame: '#8e9294', pane: 1.3, dep: 0.25 }); win(fG, m + 0.25, s0 + CW - 0.5, yF + 0.5, yF + 3.5, { frame: '#8e9294', pane: 1.3, dep: 0.25 }); }
    // office storeys: two windows per frame
    for (let k = 1; k <= NO; k++) {
      const y0 = fl(k) + 0.85, y1 = y0 + 1.65;
      if (tower && c === NC - 2 && k === NO) continue; // under the arms: a blank panel
      win(f, s0 + BEV + 0.35, m - 0.3, y0, y1); win(f, m + 0.3, s0 + CW - BEV - 0.35, y0, y1);
      if (r() < 0.32) acs.push([f, (r() < 0.5 ? m - 0.3 - 0.1 : s0 + CW - BEV - 0.2), y0 + 0.1 + r() * 0.5]);
    }
    // top storey: small square windows, two per bay; the tower's extra storey likewise, but not where the arms hang
    const ky = fl(NO + 1) + 1.0;
    win(f, m - 2.0, m - 0.8, ky, ky + 1.05); win(f, m + 0.8, m + 2.0, ky, ky + 1.05);
    if (tower && c === NC - 1) { const ty = yRoof + 1.0; win(f, m - 2.0, m - 0.8, ty, ty + 1.05); win(f, m + 0.8, m + 2.0, ty, ty + 1.05); }
  }
  // walls: granite ground floor, white panels above; the tower part runs up to its own roof
  const sT = (X_TOWER - f.ax) / f.rx;
  const sa = Math.min(sT, f.w), [p0, p1] = f.rx > 0 ? [0, sa] : [sa, f.w];
  wallAround(B.granite, fG, gBase, fl(1), [1.2, 0.6], GRANITE);
  for (const q of fG.open) fillOpening(B, fG, q);
  fbox(B.granite, f, -0.3, 0, gBase, fl(1), -REC, 0, 8); fbox(B.granite, f, f.w, f.w + 0.3, gBase, fl(1), -REC, 0, 4); // returns
  B.panel.setColor('#dddcd6'); fbox(B.panel, f, 0, f.w, fl(1) - 0.02, fl(1), -REC, 0, 32);                     // soffit
  wallAround(B.panel, f, fl(1), yTop, [3.05, 1.65], PANEL);
  // the tower part of the front rises over the main parapet: its own strip of wall on top
  f.open.push({ s0: p0, s1: p1, y0: yTop - 0.01, y1: yTopT + 1 });
  wallAround(B.panel, f, yTop, yTopT, [3.05, 1.65], PANEL);
  f.open.pop();

  // the grid: rib and slab fronts at FIN, bevels back to the wall round every frame
  const D = B.panel;
  D.setColor(RIBC);
  for (let k = 1; k <= NO + 1; k++) { const y = fl(k); skin(D, f, 0, f.w, y - RIB / 2, y + RIB / 2, FIN, [3.05, 1.65]); }
  for (let c = 0; c <= NC; c++) { const s = c * CW; skin(D, f, Math.max(0, s - RIB / 2), Math.min(f.w, s + RIB / 2), gy0 + RIB / 2, gy1 - RIB / 2, FIN, [3.05, 1.65]); }
  fbox(D, f, -0.01, f.w + 0.01, gy0 - RIB / 2, gy1 + RIB / 2, 0, FIN, 4 | 8);
  fbox(D, f, 0, f.w, gy1 - RIB / 2, gy1 + RIB / 2, 0, FIN, 16); fbox(D, f, 0, f.w, gy0 - RIB / 2, gy0 + RIB / 2, 0, FIN, 32);
  D.setColor('#e2e1dc');
  for (let c = 0; c < NC; c++) for (let k = 1; k <= NO; k++) {
    const a = c * CW + (c ? RIB / 2 : 0), e = (c + 1) * CW - (c < NC - 1 ? RIB / 2 : 0), y0 = fl(k) + RIB / 2, y1 = fl(k + 1) - RIB / 2;
    const A = at(f, a, y0, FIN), Bv = at(f, e, y0, FIN), C = at(f, e, y1, FIN), Dv = at(f, a, y1, FIN);
    const a2 = at(f, a + BEV, y0 + BEV, 0), b2 = at(f, e - BEV, y0 + BEV, 0), c2 = at(f, e - BEV, y1 - BEV, 0), d2 = at(f, a + BEV, y1 - BEV, 0);
    const L = Math.hypot(FIN, BEV);
    quad(D, A, Bv, b2, a2, [f.nx * BEV / L, FIN / L, f.nz * BEV / L]);                 // sill bevel, up
    quad(D, Dv, C, c2, d2, [f.nx * BEV / L, -FIN / L, f.nz * BEV / L]);                // head, down
    quad(D, A, Dv, d2, a2, [f.nx * BEV / L + f.rx * FIN / L, 0, f.nz * BEV / L + f.rz * FIN / L]);
    quad(D, Bv, C, c2, b2, [f.nx * BEV / L - f.rx * FIN / L, 0, f.nz * BEV / L - f.rz * FIN / L]);
    // the flat wall inside the bevels is laid by wallAround already (the openings sit inside it)
  }
  fsolid(S, f, 0, f.w, -0.1, FIN, gy0 - 0.2, gy1 + 0.2, 'wall');

  // arms on the blank panel of the tower's top office storey and the top floor over it
  {
    const m = (NC - 1.5) * CW, ah = 3.9, aw = ah * 256 / 320, y0 = fl(NO) + 0.9;
    quad(B.arms, at(f, m - aw / 2, y0, 0.08), at(f, m + aw / 2, y0, 0.08), at(f, m + aw / 2, y0 + ah, 0.08), at(f, m - aw / 2, y0 + ah, 0.08), f.N, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  // ---- canopy over the entrance: a white slab on two tapered granite piers, steps along it
  {
    const c0 = (NC - 6.6) * CW, c1 = f.w + 1.6, dep = 4.2, yc = fl(1) - 0.9;
    B.det.setColor('#f1f0ec'); fbox(B.det, f, c0, c1, yc, yc + 0.75, -REC, dep, 1 | 4 | 8 | 16 | 32);
    B.det.setColor('#dcdbd6'); fbox(B.det, f, c0 + 0.2, c1 - 0.2, yc - 0.02, yc, 0.2, dep - 0.2, 32);
    fsolid(S, f, c0, c1, -0.05, dep, yc, yc + 0.75, 'awning', 1);
    B.granite.setColor('#3f3c3a');
    for (const s of [c0 + 0.6, c1 - 0.8]) {
      const P = (ds, y, o) => at(f, s + ds, y, o), w0 = 0.55, w1 = 0.3;
      fbox(B.granite, f, s - w0 / 2, s + w0 / 2, yF - 0.1, yF + 0.4, dep - 1.1, dep - 0.2, 1 | 2 | 4 | 8 | 16);
      quad(B.granite, P(-w0 / 2, yF + 0.4, dep - 0.2), P(w0 / 2, yF + 0.4, dep - 0.2), P(w1 / 2, yc, dep - 0.4), P(-w1 / 2, yc, dep - 0.4), f.N);
      quad(B.granite, P(-w0 / 2, yF + 0.4, dep - 1.1), P(w0 / 2, yF + 0.4, dep - 1.1), P(w1 / 2, yc, dep - 0.9), P(-w1 / 2, yc, dep - 0.9), [-f.nx, 0, -f.nz]);
      quad(B.granite, P(-w0 / 2, yF + 0.4, dep - 1.1), P(-w0 / 2, yF + 0.4, dep - 0.2), P(-w1 / 2, yc, dep - 0.4), P(-w1 / 2, yc, dep - 0.9), f.L);
      quad(B.granite, P(w0 / 2, yF + 0.4, dep - 1.1), P(w0 / 2, yF + 0.4, dep - 0.2), P(w1 / 2, yc, dep - 0.4), P(w1 / 2, yc, dep - 0.9), f.R);
      fsolid(S, f, s - w0 / 2, s + w0 / 2, dep - 1.1, dep - 0.2, gBase, yc, 'pillar');
    }
    // landing and steps down to the square
    B.det.setColor('#a9a6a0'); fbox(B.det, f, c0, c1 - 1.6, gBase, yF, -REC, dep - 1.3, 1 | 4 | 8 | 16);
    const nS = 3, rise = (yF - gFront) / nS;
    B.det.setColor('#b3b0aa');
    for (let i = 1; i < nS; i++) fbox(B.det, f, c0 + 0.8, c1 - 2.4, gBase, yF - i * rise, dep - 1.3 + (i - 1) * 0.35, dep - 1.3 + i * 0.35, 1 | 4 | 8 | 16);
    // the car: a flat landing, then one ramp down the steps (its plane meets the floor at the landing's edge)
    const o0 = dep - 1.3, sl = (yF - gFront) / (nS * 0.35);
    const Q = [[c0 + 0.8, o0], [c1 - 2.4, o0], [c1 - 2.4, o0 + nS * 0.35], [c0 + 0.8, o0 + nS * 0.35]].map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; });
    const [ox, , oz] = at(f, 0, 0, o0), base = yF + sl * (ox * f.nx + oz * f.nz);
    S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), gBase, base, -sl * f.nx, -sl * f.nz, 'steps');
    fsolid(S, f, c0, c1 - 1.6, -REC, o0, gBase, yF, 'steps');
  }

  // ---- the other walls
  for (const w of faces) {
    if (w === f) continue;
    const back = w.nz < -0.9 && w.w > 30, end = Math.abs(w.nx) > 0.9;
    const tower = (s) => fx(w, s) > X_TOWER - 0.01;
    if (back) { // yard side: two windows per bay on every storey, a service door or two
      const nc = Math.round(w.w / 6.1), cw = w.w / nc;
      for (let c = 0; c < nc; c++) {
        const s0 = c * cw, m = s0 + cw / 2;
        if (c === 2 || c === nc - 3) win(w, m - 0.8, m + 0.8, gFront - 0.15 + 0.3, yF + 2.3, { frame: '#6b6e70', pane: 0.8, glass: '#3a4046', lit: false, door: true, dep: 0.15 });
        else { win(w, s0 + 0.6, m - 0.3, yF + 0.9, yF + 2.8); win(w, m + 0.3, s0 + cw - 0.6, yF + 0.9, yF + 2.8); }
        for (let k = 1; k <= NO; k++) { const y0 = fl(k) + 0.85; win(w, s0 + 0.6, m - 0.3, y0, y0 + 1.6); win(w, m + 0.3, s0 + cw - 0.6, y0, y0 + 1.6); }
        const ky = fl(NO + 1) + 1.0; win(w, m - 2.0, m - 0.8, ky, ky + 1.05); win(w, m + 0.8, m + 2.0, ky, ky + 1.05);
      }
    } else if (w.w > 4 && !end) { // the tower's yard side and the notch: one or two windows a storey
      const n = Math.max(1, Math.floor(w.w / 4.5)), cw = w.w / n;
      for (let i = 0; i < n; i++) for (let k = 1; k <= NO + 1; k++) { const m = (i + 0.5) * cw, y0 = fl(k) + (k > NO ? 1.0 : 0.85); win(w, m - 0.8, m + 0.8, y0, y0 + (k > NO ? 1.05 : 1.6)); }
    } else if (end && tower(w.w / 2) && w.w > 8) { // the tower's north-east end: stair windows on the half-landings
      const m = w.w / 2;
      for (let k = 1; k <= NO + 1; k++) { const y0 = fl(k) - 1.1; win(w, m - 0.7, m + 0.7, y0, y0 + 1.4, { lit: r() < 0.6 }); }
    }
    wallAround(B.granite, w, gBase, yF + 0.5, [1.2, 0.6], GRANITE);
    // walls clear of the tower top at the main parapet; the tower's walls go on to its own
    const tw = tower(0.01) && tower(w.w - 0.01);
    wallAround(B.panel, w, yF + 0.5, tw ? yTopT : yTop, [3.05, 1.65], PANEL);
    if (!tw && (tower(0.01) || tower(w.w - 0.01))) { // a long wall that the tower part tops: lay the extra strip
      const sx = (X_TOWER - w.ax) / w.rx, [q0, q1] = tower(0.01) ? [0, sx] : [sx, w.w];
      skin(B.panel, w, q0, q1, yTop, yTopT, 0, [3.05, 1.65]);
    }
  }
  for (const w of faces) for (const q of w.open) fillOpening(B, w, q);

  // ---- parapets, copings, roofs: the main roof, then the tower's
  const parapet = (w, s0, s1, y0, y1) => {
    B.det.setColor('#d8d6cf'); skin(B.det, { ...w, N: [-w.nx, 0, -w.nz] }, s0, s1, y0 + 0.02, y1, -0.3);
    B.det.setColor('#9c9e9d'); fbox(B.det, w, s0 - 0.02, s1 + 0.02, y1, y1 + 0.05, -0.32, 0.04, 1 | 16);
    const a = at(w, s0, 0, -0.1), c = at(w, s1, 0, -0.1);
    Z.edge(a[0], a[2], c[0], c[2], y1, w.nx, w.nz);
  };
  for (const w of faces) {
    const ta = fx(w, 0) > X_TOWER - 0.01, tb = fx(w, w.w) > X_TOWER - 0.01;
    if (ta && tb) parapet(w, 0, w.w, yRoofT, yTopT);
    else if (!ta && !tb) parapet(w, 0, w.w, yRoof, yTop);
    else { const sx = (X_TOWER - w.ax) / w.rx; if (ta) { parapet(w, 0, sx, yRoofT, yTopT); parapet(w, sx, w.w, yRoof, yTop); } else { parapet(w, 0, sx, yRoof, yTop); parapet(w, sx, w.w, yRoofT, yTopT); } }
  }
  const clip = (keepTower) => { // the ring cut at x = X_TOWER (a vertical line in the map frame)
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length], ia = (a[0] > X_TOWER) === keepTower, ic = (c[0] > X_TOWER) === keepTower;
      if (ia) out.push(a);
      if (ia !== ic) { const t = (X_TOWER - a[0]) / (c[0] - a[0]); out.push([X_TOWER, a[1] + t * (c[1] - a[1])]); }
    }
    return out;
  };
  const low = clip(false), high = clip(true);
  B.det.setColor('#5d5c57'); B.det.fill(low, [], yRoof + 0.02, true); B.det.fill(high, [], yRoofT + 0.02, true);
  // the tower's riser wall facing the main roof, over the x = X_TOWER line
  {
    const zc = high.filter((p) => Math.abs(p[0] - X_TOWER) < 1e-6).map((p) => p[1]).sort((a, c) => a - c);
    if (zc.length >= 2) {
      B.panel.setColor(PANEL);
      const [za, zb] = [zc[0], zc.at(-1)];
      quad(B.panel, [X_TOWER, yRoof, za], [X_TOWER, yRoof, zb], [X_TOWER, yTopT, zb], [X_TOWER, yTopT, za], [-1, 0, 0], [[za / 3.05, yRoof / 1.65], [zb / 3.05, yRoof / 1.65], [zb / 3.05, yTopT / 1.65], [za / 3.05, yTopT / 1.65]]);
    }
  }
  // roof kit: vents, the lift room over the tower, a mast; the flag on the tower's square edge
  B.det.setColor('#9d9b95');
  for (let i = 0; i < 6; i++) { const x = X0 + 6 + r() * (X_TOWER - X0 - 12), z = f.az + (f.nz > 0 ? -1 : 1) * (3 + r() * 6); B.det.box(x - 0.5, yRoof, z - 0.5, x + 0.5, yRoof + 0.9, z + 0.5, 55); }
  const hx = (X_TOWER + X1) / 2 + 1, hz = (Math.min(...high.map((p) => p[1])) + Math.max(...high.map((p) => p[1]))) / 2 - 1;
  B.panel.setColor('#e3e2dc'); B.panel.box(hx - 2.2, yRoofT, hz - 2.5, hx + 2.2, yRoofT + 2.6, hz + 2.5, 55);
  S.box(hx - 2.2, yRoofT, hz - 2.5, hx + 2.2, yRoofT + 2.6, hz + 2.5, 'equipment');
  B.det.setColor('#77797b'); B.det.cyl(X0 + 30, yRoof, (Math.min(...zs) + Math.max(...zs)) / 2, 0.05, 0.04, 5.5, 5, false);
  B.det.box(X0 + 29, yRoof + 4.2, (Math.min(...zs) + Math.max(...zs)) / 2 - 0.03, X0 + 31, yRoof + 4.26, (Math.min(...zs) + Math.max(...zs)) / 2 + 0.03);
  {
    const [px, , pz] = at(f, (NC - 1.5) * CW, 0, -1.2), top = yTopT + 7;
    B.det.setColor('#c8cacc'); B.det.cyl(px, yTopT, pz, 0.06, 0.045, top - yTopT, 6);
    const fl2 = (y0, y1, col) => { B.cloth.setColor(col); quad(B.cloth, [px, y0, pz], [px - f.rx * 2.4, y0, pz - f.rz * 2.4], [px - f.rx * 2.4, y1, pz - f.rz * 2.4], [px, y1, pz], f.N); };
    fl2(top - 0.8, top, '#1f5bb8'); fl2(top - 1.6, top - 0.8, '#f3c623');
  }
  // the paved square in front, out past the canopy's end; kept clear of trees
  const PS0 = f.w * 0.3, PS1 = f.w + 8, PO1 = 26;
  paveRect(B.pave, f, PS0, PS1, -REC + 0.05, PO1, heightAt);
  // AC units on the grid frames
  B.det.setColor('#e6e6e2');
  for (const [w, s, y] of acs) fbox(B.det, w, s - 0.4, s + 0.4, y, y + 0.55, 0, 0.3, 1 | 4 | 8 | 16 | 32);
  // walls: the storeys over the full ring; the ground floor with its front pulled back to the glazing
  const fl0 = f.ax * f.nx + f.az * f.nz, inner = ring.map(([x, z]) => (Math.abs(x * f.nx + z * f.nz - fl0) < 0.3 ? [x - f.nx * REC, z - f.nz * REC] : [x, z]));
  S.prism((area2(ring) < 0 ? ring.slice().reverse() : ring).flat(), fl(1) - 0.2, yTop, 0, 0, 'wall');
  S.prism((area2(inner) < 0 ? inner.reverse() : inner).flat(), gBase, fl(1) - 0.2, 0, 0, 'wall');
  S.prism((area2(high) < 0 ? high.slice().reverse() : high).flat(), yTop - 0.5, yTopT, 0, 0, 'wall');

  // ---- meshes
  const M = {
    panel: new THREE.MeshStandardMaterial({ map: stoneTex(r, [246, 245, 241], { cols: 1, rows: 1, joint: 0.22, grain: 0.05 }), vertexColors: true, roughness: 0.82 }),
    granite: new THREE.MeshStandardMaterial({ map: stoneTex(r, [150, 142, 136], { cols: 2, rows: 1, joint: 0.35, grain: 0.14 }), vertexColors: true, roughness: 0.45, metalness: 0.05 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffecc8, emissiveIntensity: 0 }),
    arms: new THREE.MeshStandardMaterial({ map: armsTex(), alphaTest: 0.5, roughness: 0.4, metalness: 0.3 }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }),
    pave: decal(new THREE.MeshStandardMaterial({ map: paveTex(r, [196, 160, 150], [170, 150, 142]), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 })),
  };
  const st = pack(root, 'miskrada', B, M, ['glass', 'lit', 'cloth', 'arms', 'pave']);
  console.log(`[cherkasy] Miskrada: ${nWin} windows, ${NC} bays, ${(st.verts / 1000).toFixed(1)}k verts, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(S.count ?? 0) - n0} solids, floor ${yF.toFixed(1)} m, in ${(performance.now() - t0).toFixed(0)} ms`);

  const cxm = (X0 + X1) / 2, czm = (Math.min(...zs) + Math.max(...zs)) / 2, hl = (X1 - X0) / 2 + 3, hw = (Math.max(...zs) - Math.min(...zs)) / 2 + 3;
  return {
    footprints: [{ poly: ring, h: yTopT - gFront, kind: b.k, name: 'Черкаська міська рада' }],
    // trees keep off the walls and the paved square in front
    clear: (x, z) => {
      if (Math.abs(x - cxm) < hl && Math.abs(z - czm) < hw) return true;
      const dx = x - f.ax, dz = z - f.az, s = dx * f.rx + dz * f.rz, o = dx * f.nx + dz * f.nz;
      return s > PS0 && s < PS1 && o > 0 && o < PO1;
    },
    update() { M.lit.emissiveIntensity = 1.2 * nightK.value; },
  };
}
