// OWNER: cherkasy. ЖК «Комфорт Парк», вул. В'ячеслава Чорновола, 243/1 (Яблучний; OSM way 411921795): one 87 x 19 m
// slab of three sections, a former office block rebuilt as flats over a commercial ground storey (built; references:
// the lun.ua catalogue's built photos of 2023–24 for the colours and the ground storey, its renders for the massing and
// the ends; lun.ua/new/cherkasy/comfort-park). Ground storey plus four storeys of flats, flat roof.
// The long fronts, as photographed: graphite render, the windows in recessed bays between deep pilasters a bay (3 m)
// apart, the pilasters' returns lime green so the front reads as graphite stripes edged in green; each bay one tall
// two-pane window a storey over a darker spandrel. A graphite band caps the ground storey.
// The street (north-west) front: the south-west half has a white ground storey of glazed units in graphite surrounds
// with green piers, up three steps from the paved forecourt; the north-east half has the one-storey podium of OSM's
// roof part in front – lime-green walls with shop glazing between green piers, a graphite fascia and a terrace on its
// roof behind a dark steel railing of horizontal bars. The yard (south-east) front: the same bays over a graphite ground
// storey with windows and three section doors under canopies (the yard's ground storey is a guess from the renders).
// The ends: blank graphite with green corner bands and one stack of windows in a dark recessed strip (renders); the
// north-east end has a glazed vestibule (OSM's bump). Roof: membrane, the stair heads and a set-back plant room where
// OSM has its 6-level parts. Windows and shops light up at night. No developer name or logo.
//   COMFORTPARK_SKIP: the OSM id replaced here (buildings.js skips its extrusion)
//   comfortParkLocal: { L, D, toMap(s, t), toLocal(x, z) } the site frame: s along the street front from its south-west
//     end, t from the street front toward the yard (map metres)
//   levelComfortPark(hf): levels the lot (the block, the forecourt and the yard drive) before the ground is built
//     (city.js); returns the level
//   buildComfortPark({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per side in a face frame (slabkit.js): s along the side, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng, inPoly } from './geo.js';
import { canvasTex } from './sculpt.js';
import { face, at, quad, rect, box, skin, solid, finish, speckle, UP, DN } from './slabkit.js';

const OSM_ID = 411921795;
export const COMFORTPARK_SKIP = new Set([OSM_ID]);

// the OSM outline: F0 the south-west street corner, F1 the north-east street corner, Y0 the south-west yard corner;
// the podium (OSM's 1-level roof part) runs from PS along the street front to F1, PD deep
const F0 = [-3551.9, 2525.2], F1 = [-3465.2, 2524.9], Y0 = [-3551.7, 2544.5];
const L = Math.hypot(F1[0] - F0[0], F1[1] - F0[1]), D = Math.hypot(Y0[0] - F0[0], Y0[1] - F0[1]);
const U = [(F1[0] - F0[0]) / L, (F1[1] - F0[1]) / L], V = [(Y0[0] - F0[0]) / D, (Y0[1] - F0[1]) / D];
const toMap = (s, t) => [F0[0] + U[0] * s + V[0] * t, F0[1] + U[1] * s + V[1] * t];
const toLocal = (x, z) => { const dx = x - F0[0], dz = z - F0[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };
export const comfortParkLocal = { L, D, toMap, toLocal };
const PS = toLocal(-3502.5, 2524.7)[0], PD = 2.8;               // podium start along the front, its depth
const VT0 = toLocal(-3465.1, 2532.6)[1], VT1 = toLocal(-3465.1, 2535.7)[1], VD = 2.5; // the NE vestibule

export const levelComfortPark = (hf) => hf.pad([[-4, -7], [L + 4, -7], [L + 4, D + 4], [-4, D + 4]].map(([s, t]) => toMap(s, t)), 16);

const LIFT = 0.6, GF = 4.0, FH = 3.4, NF = 4, PAR = 0.6;        // floor over the forecourt, ground storey, storey, flats storeys, parapet
const NB = 29, P = L / NB, PW = 0.8, PO = 0.28;                 // bays a long front, bay pitch, pilaster width and depth
const GRAPH = '#74777d', SPAN = '#4a4d53', GREEN = '#a9d47c', WHITE = '#eeeeea', FRAME = '#2e3034', MEMB = '#6e6f72', STEEL = '#33363b';
const TINT = ['#a9bccb', '#9fb3c4', '#b6c7d4', '#95a9ba'];

// one window column a storey's glass high (v 0 at the sill): dark frame, a transom low down
const paneTex = (mask) => canvasTex(64, 128, (g, w, h) => {
  const gl = g.createLinearGradient(0, 0, w * 0.5, h);
  gl.addColorStop(0, mask ? '#fff' : '#e3e9ed'); gl.addColorStop(0.5, mask ? '#fff' : '#a3b0b8'); gl.addColorStop(1, mask ? '#fff' : '#66737c');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  g.fillStyle = mask ? '#000' : '#2a2b2e';
  g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  g.fillRect(0, Math.round(h * 0.7), w, 4);
});

export function buildComfortPark({ root, map, solids: S, zips: Z, heightAt }) {
  if (map?.buildings && !map.buildings.some((b) => b.id === OSM_ID)) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = [[0, 0], [L, 0], [L, D], [0, D]].map(([s, t]) => toMap(s, t));
  const hs = [...ring, toMap(L / 2, -PD - 3)].map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
  const yF = gHi + LIFT, Y = (h) => yF + h, gB = gLo - 0.6;
  const fy = (k) => Y(GF + (k - 1) * FH);                       // floor of flats storey k (1..NF)
  const ROOF = Y(GF + NF * FH), TOPW = ROOF + PAR;
  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB() };
  const UVW = [2.5, 2.5], W = B.wall, Dt = B.det;
  const tint = () => TINT[(r() * TINT.length) | 0];
  let nWin = 0;

  // the four sides: s runs along +U on the long fronts, the ends run from the street corner to the yard one
  const fStreet = face(toMap(0, 0), toMap(L, 0), -V[0], -V[1]), fYard = face(toMap(0, D), toMap(L, D), V[0], V[1]);
  const fSW = face(toMap(0, 0), toMap(0, D), -U[0], -U[1]), fNE = face(toMap(L, 0), toMap(L, D), U[0], U[1]);

  // an opening: reveals, glass in `cols` framed columns (lit ones go to their own mesh), a dark sill
  function win(f, s0, s1, y0, y1, { cols = 2, rev = '#5a5e66', dep = 0.2, lit = r() < 0.3, cut = true } = {}) {
    if (cut) f.cuts.push({ s0, s1, y0, y1 });
    const d = dep;
    Dt.setColor(rev);
    quad(Dt, at(f, s0, y0), at(f, s0, y0, -d), at(f, s0, y1, -d), at(f, s0, y1), f.U);
    quad(Dt, at(f, s1, y0), at(f, s1, y0, -d), at(f, s1, y1, -d), at(f, s1, y1), f.U.map((v) => -v));
    quad(Dt, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -d), at(f, s0, y1, -d), DN);
    quad(Dt, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -d), at(f, s0, y0, -d), UP);
    const g = lit ? B.lit : B.glass, o = -d + 0.04;
    g.setColor(tint());
    quad(g, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[0, 0], [cols, 0], [cols, 1], [0, 1]]);
    Dt.setColor(FRAME); box(Dt, f, s0 - 0.03, s1 + 0.03, y0 - 0.05, y0, -0.02, 0.05, 'ft');
    nWin++;
  }
  const zip = (f, y) => { if (Z && f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], y, f.nx, f.nz); } };
  const parapet = (f) => {
    W.setColor(GRAPH); rect(W, f, 0, f.L, ROOF, TOPW, -0.3, UVW, f.N.map((v) => -v));
    Dt.setColor('#2f3136'); box(Dt, f, -0.02, f.L + 0.02, TOPW, TOPW + 0.08, -0.32, 0.06, 'ftlr');
    zip(f, TOPW);
  };

  // ---- the long fronts: the flats' bays between green-edged pilasters
  for (const f of [fStreet, fYard]) {
    for (let i = 0; i < NB; i++) {
      const c = (i + 0.5) * P;
      for (let k = 1; k <= NF; k++) {
        const y = fy(k);
        win(f, c - 0.7, c + 0.7, y + 0.9, y + 2.9, { cols: 2, dep: 0.3 });
        Dt.setColor(SPAN); rect(Dt, f, c - (P - PW) / 2, c + (P - PW) / 2, y + 0.04, y + 0.8, 0.02);  // the spandrel
      }
    }
    // pilasters: graphite fronts with a lime edge, lime-green returns; corner ones run the full height
    for (let i = 0; i <= NB; i++) {
      const s = i * P, a = Math.max(0, s - PW / 2), b = Math.min(f.L, s + PW / 2), y0 = i % NB ? Y(GF) : Y(GF - 0.6);
      W.setColor(GRAPH); box(W, f, a, b, y0, TOPW, 0, PO, 'ft', UVW);
      W.setColor(GREEN); box(W, f, a, b, y0, TOPW, 0, PO, (i ? 'l' : '') + (i < NB ? 'r' : ''), UVW);
      if (i < NB) box(W, f, b - 0.16, b, y0, TOPW, PO, PO + 0.015, 'f', UVW);   // the lime edge on the front, as photographed
    }
    W.setColor(GRAPH); box(W, f, -0.02, f.L + 0.02, Y(GF - 0.6), Y(GF), 0, PO + 0.05, 'ftu', UVW); // the band over the ground storey
    solid(S, f, 0, f.L, 0, PO, Y(GF - 0.6), TOPW);
  }

  // ---- the street front's ground storey: white units up three steps (south-west), the podium (north-east)
  {
    const f = fStreet, nW = Math.round(PS / P);
    for (let i = 0; i < nW; i++) {
      const c = (i + 0.5) * P;
      win(f, c - 0.8, c + 0.8, Y(0.05), Y(3.0), { cols: 2, rev: FRAME, dep: 0.3, lit: r() < 0.5 });
      Dt.setColor(GRAPH); for (const [a, b, y0, y1] of [[c - 1.0, c - 0.8, Y(0), Y(3.2)], [c + 0.8, c + 1.0, Y(0), Y(3.2)], [c - 0.8, c + 0.8, Y(3.0), Y(3.2)]]) box(Dt, f, a, b, y0, y1, 0, 0.04, 'ft'); // the dark surround
      if (i % 2 === 0 && i) { W.setColor(GREEN); box(W, f, i * P - 0.2, i * P + 0.2, Y(0), Y(GF - 0.6), 0, 0.08, 'flr', UVW); }
    }
    skin(W, f, gB, Y(GF - 0.6), WHITE, UVW);
    // the forecourt steps along the white half
    const nS = 4, h = LIFT / nS;
    Dt.setColor('#8d8e8f'); box(Dt, f, 0, PS, gB, Y(0), 0, 1.6, 'ftlr');
    for (let k = 1; k < nS + 1; k++) { Dt.setColor(k % 2 ? '#7f8082' : '#8d8e8f'); box(Dt, f, 0.3 * k, PS - 0.3 * k, gB, Y(-h * k), 0, 1.6 + 0.4 * k, 'ftlr'); }
    solid(S, f, 0, PS, 0, 1.6 + 0.4 * nS, gB, Y(0), 'step');

    // the podium: green walls, shop glazing between green piers, a graphite fascia and the terrace railing
    const pf = face(toMap(PS, -PD), toMap(L, -PD), -V[0], -V[1]), pw = face(toMap(PS, 0), toMap(PS, -PD), -U[0], -U[1]);
    const pe = face(toMap(L, -PD), toMap(L, 0), U[0], U[1]), top = Y(GF - 0.6);
    const nP = Math.round(pf.L / P), pp = pf.L / nP;
    for (let i = 0; i < nP; i++) {
      const c = (i + 0.5) * pp;
      win(pf, c - 1.15, c + 1.15, Y(0.05), Y(3.0), { cols: 3, rev: FRAME, dep: 0.25, lit: r() < 0.6 });
    }
    win(pe, 0.6, 2.2, Y(0), Y(2.6), { cols: 2, rev: FRAME, dep: 0.25, lit: true });               // the door at the street end
    win(pw, 0.5, 2.3, Y(0), Y(2.6), { cols: 2, rev: FRAME, dep: 0.25, lit: r() < 0.5 });          // and at the white end
    skin(W, pf, gB, top, GREEN, UVW); skin(W, pe, gB, top, GREEN, UVW); skin(W, pw, gB, top, WHITE, UVW);
    W.setColor('#a0d070'); for (let i = 1; i < nP; i++) box(W, pf, i * pp - 0.18, i * pp + 0.18, Y(0), top, 0, 0.1, 'flr', UVW);
    for (const g of [pf, pw, pe]) { Dt.setColor(GRAPH); box(Dt, g, -0.05, g.L + 0.05, top, Y(GF + 0.15), 0, 0.12, 'ftu'); }
    Dt.setColor('#7b7c7e'); Dt.fill([[PS, 0], [L, 0], [L, -PD], [PS, -PD]].map(([s, t]) => toMap(s, t)), [], Y(GF + 0.1), true); // the terrace floor
    Dt.setColor(GRAPH); box(Dt, pf, -0.05, pf.L + 0.05, Y(GF + 0.1), Y(GF + 0.15), 0.12 - PD, 0.12, 't');
    // railing: posts every bay, a top rail and three bars, along the front and round the south-west end
    Dt.setColor(STEEL);
    const ry0 = Y(GF + 0.15), ry1 = ry0 + 1.05;
    for (let i = 0; i <= nP; i++) box(Dt, pf, i * pp - 0.03, i * pp + 0.03, ry0, ry1, 0.02, 0.08, 'fblr');
    for (const y of [ry1 - 0.05, ry0 + 0.3, ry0 + 0.55, ry0 + 0.8]) box(Dt, pf, 0, pf.L, y - 0.025, y + 0.025, 0.02, 0.08, 'ftu');
    for (const y of [ry1 - 0.05, ry0 + 0.3, ry0 + 0.55, ry0 + 0.8]) box(Dt, pw, 0, pw.L, y - 0.025, y + 0.025, 0.02, 0.08, 'ftu');
    solid(S, pf, 0, pf.L, -PD, 0, gB, Y(GF + 0.15));
    solid(S, pf, 0, pf.L, 0, 0.1, Y(GF + 0.15), ry1, 'rail');
    // the street steps up to the podium units: one long low step
    Dt.setColor('#8d8e8f'); box(Dt, pf, -0.2, pf.L, gB, Y(0), 0, 1.2, 'ftlr');
    solid(S, pf, -0.2, pf.L, 0, 1.2, gB, Y(0), 'step');
  }

  // ---- the yard front's ground storey: graphite, a window a bay, three section doors under canopies
  {
    const f = fYard, doors = new Set([4, 14, 24]);
    for (let i = 0; i < NB; i++) {
      const c = (i + 0.5) * P;
      if (doors.has(i)) {
        win(f, c - 0.9, c + 0.9, Y(0), Y(2.6), { cols: 2, rev: FRAME, dep: 0.3, lit: true });
        Dt.setColor(STEEL); box(Dt, f, c - 1.6, c + 1.6, Y(2.85), Y(3.0), 0, 1.6, 'ftlru');
        solid(S, f, c - 1.6, c + 1.6, 0, 1.6, Y(2.85), Y(3.0), 'awning', 1);
        Dt.setColor('#8d8e8f'); box(Dt, f, c - 1.5, c + 1.5, gB, Y(0), 0, 1.5, 'ftlr');
        solid(S, f, c - 1.5, c + 1.5, 0, 1.5, gB, Y(0), 'step');
      } else win(f, c - 0.9, c + 0.9, Y(0.9), Y(3.1), { cols: 2, rev: '#5a5e66' });
    }
    skin(W, f, gB, Y(GF - 0.6), GRAPH, UVW);
  }
  // the long fronts' wall surface over the ground storey (the bays' backs between the pilasters)
  for (const f of [fStreet, fYard]) { skin(W, f, Y(GF - 0.6), TOPW, GRAPH, UVW); parapet(f); }

  // ---- the ends: blank graphite, green corner bands, one stack of windows in a dark recessed strip
  for (const f of [fSW, fNE]) {
    const c = f.L * 0.58;
    Dt.setColor(SPAN); // the strip between the windows
    for (let k = 0; k <= NF; k++) rect(Dt, f, c - 0.75, c + 0.75, k ? fy(k) + 2.9 : Y(GF - 0.6), k < NF ? fy(k + 1) + 0.9 : ROOF - 0.3, 0.02);
    for (let k = 1; k <= NF; k++) for (const [a, b] of [[c - 0.75, c - 0.55], [c + 0.55, c + 0.75]]) rect(Dt, f, a, b, fy(k) + 0.9, fy(k) + 2.9, 0.02);
    for (let k = 1; k <= NF; k++) win(f, c - 0.55, c + 0.55, fy(k) + 0.9, fy(k) + 2.9, { cols: 1 });
    if (f === fNE) win(f, VT0 + 0.4, VT1 - 0.4, Y(0), Y(2.6), { cols: 2, rev: FRAME, dep: 0.3, lit: true }); // behind the vestibule
    if (f === fSW) win(f, c - 0.9, c + 0.9, Y(0), Y(2.6), { cols: 2, rev: FRAME, dep: 0.3, lit: r() < 0.5 });
    skin(W, f, gB, TOPW, GRAPH, UVW);
    W.setColor(GREEN); for (const [a, b] of [[0, 0.6], [f.L - 0.6, f.L]]) box(W, f, a, b, Y(GF - 0.6), TOPW, 0, 0.04, 'f', UVW);
    parapet(f);
  }
  // the north-east vestibule: a glass box on a graphite frame
  {
    const vf = face(toMap(L + VD, VT0), toMap(L + VD, VT1), U[0], U[1]), vh = Y(3.4);
    const vs = [vf, face(toMap(L, VT0), toMap(L + VD, VT0), -V[0], -V[1]), face(toMap(L + VD, VT1), toMap(L, VT1), V[0], V[1])];
    for (const g of vs) {
      win(g, 0.1, g.L - 0.1, Y(0), vh - 0.35, { cols: Math.max(1, Math.round(g.L / 1.1)), rev: FRAME, dep: 0.08, lit: true, cut: false });
      Dt.setColor(FRAME); for (const s of [0, g.L - 0.1]) box(Dt, g, s, s + 0.1, Y(0), vh, -0.1, 0, 'flr');
    }
    Dt.setColor(GRAPH); box(Dt, vf, -0.15, vf.L + 0.15, vh - 0.35, vh, -VD, 0.15, 'ftlru');
    Dt.setColor('#8d8e8f'); box(Dt, vf, -0.4, vf.L + 0.4, gB, Y(0), 0, 1.4, 'ftlr');
    const vr = [[L, VT0], [L + VD, VT0], [L + VD, VT1], [L, VT1]].map(([s, t]) => toMap(s, t));
    S.prism(vr.flat(), gB, vh, 0, 0, 'wall');
  }

  // ---- the roof: membrane, the stair heads and the plant room (OSM's 6-level parts), set back from the fronts
  Dt.setColor(MEMB); Dt.fill(ring, [], ROOF + 0.02, true);
  const bld = map?.buildings?.find((b) => b.id === OSM_ID);
  for (const part of bld?.parts ?? []) {
    if (part.lv < 6) continue;
    const loc = []; for (let i = 0; i < part.p.length; i += 2) loc.push(toLocal(part.p[i], part.p[i + 1]));
    const ss = loc.map((q) => q[0]), ts = loc.map((q) => q[1]);
    const s0 = Math.max(1, Math.min(...ss)), s1 = Math.min(L - 1, Math.max(...ss)), t0_ = Math.max(1.5, Math.min(...ts)), t1 = Math.min(D - 1.5, Math.max(...ts));
    if (s1 - s0 < 1 || t1 - t0_ < 1) continue;
    const big = (s1 - s0) * (t1 - t0_) > 60, h = big ? 1.8 : 3.0;
    const [a0, a1] = big ? [t0_ + 1.5, t1 - 1.5] : [t0_, t1];
    const rf = face(toMap(s0, a1), toMap(s1, a1), V[0], V[1]);
    W.setColor(GRAPH); box(W, rf, 0, rf.L, ROOF, ROOF + h, -(a1 - a0), 0, 'fblrt', UVW);
    if (!big) win(rf, rf.L / 2 - 0.45, rf.L / 2 + 0.45, ROOF, ROOF + 2.1, { cols: 1, rev: FRAME, dep: 0.05, lit: false, cut: false });
    solid(S, rf, 0, rf.L, -(a1 - a0), 0, ROOF, ROOF + h, 'equipment');
  }
  S.prism(ring.flat(), gB, TOPW, 0, 0, 'wall');

  const pane = paneTex(false), mask = paneTex(true), warm = new THREE.Color('#ffd9a6');
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.88 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.1, metalness: 0.4, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: warm, emissiveMap: mask, emissiveIntensity: 0 }),
  };
  const out = finish(root, 'comfortpark', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] ZhK Comfort Park: ${nWin} windows, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const lot = [[0, 0], [PS, 0], [PS, -PD], [L, -PD], [L, VT0], [L + VD, VT0], [L + VD, VT1], [L, VT1], [L, D], [0, D]].map(([s, t]) => toMap(s, t));
  return {
    footprints: [{ poly: lot, h: TOPW - gLo, kind: 'apt', name: 'ЖК «Комфорт Парк»' }],
    clear: (x, z) => { const [s, t] = toLocal(x, z); return (s > -5 && s < L + 5 && t > -14 && t < D + 5) || inPoly(ring, x, z); },
    update() { M.lit.emissiveIntensity = 0.9 * nightK.value; },
  };
}
