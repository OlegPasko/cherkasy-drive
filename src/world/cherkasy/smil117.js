// OWNER: cherkasy. вул. Смілянська, 117 and 119 (OSM ways 105315513 and 105315529, issue #40): the twin five-storey
// large-panel blocks of 1969 (a 1-464-type «хрущовка») set end to end along Смілянська between Чорновола and the
// Літак quarter, ~120 m each. OSM had no levels, so the generic extrusion stood them nine storeys. Drawn from the 2015
// Google Street View panoramas on Смілянська (the street side only; the yard side is the series' usual layout, a
// guess) and the flat listings (5 storeys, 1969). Light grey panels, one per room and storey, with dark sealed seams
// and a few weathered beige ones; a grey concrete plinth with basement vents a metre up; white PVC windows, one per
// panel; balcony stacks with the white fronts and their three blue tile diamonds, some glazed in; a flat roof behind
// a low parapet with the vent blocks over each stair. The street side (north-west) has the balconies and windows; the
// yard side (south-east) six entrances under concrete canopies with the stair windows at the half landings, kitchen
// windows, a balcony stack between each pair. No.119 has a shop in its north-east end: a porch up a flight of steps
// with a red fascia (no name). No.117's ground floor a little further on is a pink-rendered shop strip.
// The yard behind them (issue #44), after a player's three evening photos from a low balcony of No.119 and the OSM
// layout: the narrow asphalt drive along the yard fronts (the ground's own) with nose-in pull-ins of trodden earth
// among the shrubs, cars parked in most; a dense belt of old poplars, elms, maples and lindens over thick overgrown
// shrubs between the drive and the lawn, a white poplar leaning out over it; the open lawn with a trodden path along
// it to the bins; the old light-blue climbing arch with its round seat, a blue П-frame and two green washing-line posts;
// closed at the back by a patchy fence of grey FBS blocks laid dry, two or three high; the weedy wasteland behind it.
// No.117's yard is the same yard further on and gets the same treatment.
// Beyond the wasteland six OSM outlines of an old depot (no levels in OSM: the generic extrusion stood them two to
// nine storeys) are rebuilt as the one-storey brick sheds the aerial imagery and photo 3 show, one half roofless.
//   SMIL117_SKIP: the OSM ids replaced here, the blocks and the sheds (buildings.js skips their extrusion)
//   buildSmil117({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, roofs, spots, parked, yard } | null
//     roofs: { [osm id]: [the roof deck of each section, in the order the street face runs] } (tests)
//     spots: the yard's trees and shrubs (trees.js spots); parked: its parking spots for the traffic sim
//     yard: { W(s, o), SO(x, z), driveO(s), fenceO(s), nBlocks, things, ... } the yard frame along No.119's yard front (tests)
// Walls are one quad per face over a painted 8-panel x 5-storey atlas (u by the panel module, v by storey), so the
// seams and the odd tinted panel cost nothing; windows, balcony fronts and doors are quads of a second atlas, the lit
// ones in a mesh whose emissive mask is the glass.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng, area2 } from './geo.js';
import { brickTex, sheetTex } from './bayatlas.js';
import { ringFaces, face, at, quad, box, rect, solid, finish } from './slabkit.js';
import { PARK_GREENS, PAL } from '../trees.js';

const ID117 = 105315513, ID119 = 105315529;
// ---- the low brick sheds beyond the fence (issue #44): six OSM outlines with no levels, inferred two to nine storeys,
// that the aerial imagery shows as one-storey barracks of an old depot – gabled slate or sheet roofs with hardly a shadow,
// one roof dark, one long block's west half roofless – and photo 3 as red-brown brick with empty window holes. Built as
// gabled brick boxes: walls one quad per face (1 m brick repeats), dark window and door holes, a two-slope roof; the
// ruined half has ragged walls and no roof.
const SHEDS = {
  132613632: { roof: '#9a9c98', ruin: 0.45, wall: '#9c5a46' },   // the long block: its west 45 % stands roofless
  132613625: { roof: '#4a3c35', wall: '#8f5040', pitch: 0.18 },   // the dark rusty sheet roof
  132613636: { roof: '#8f918d', wall: '#a0604b' },
  132613647: { roof: '#9fa19c', wall: '#965a47' },
  132613674: { roof: '#878985', wall: '#8c5444' },
  132613685: { roof: '#959793', wall: '#a46450', ruin: 0.2 },
};
export const SMIL117_SKIP = new Set([ID117, ID119, ...Object.keys(SHEDS).map(Number)]);

const PL = 0.9, FH = 2.7, NF = 5, PAR = 0.45, MOD = 3.2;   // plinth, storey, storeys, parapet, the panel module (target)
const PANEL = '#d9d8d2', PLINTH = '#9b9893', SLAB = '#c9c7c0', ROOF_C = '#55524f';
const AC = 8, AR = NF, CW = 64, CH = 54;                   // the wall atlas: 8 panels x 5 storeys

// window atlas tiles, each stretched over its opening
const T = { WIN: 0, WINK: 1, BDOOR: 2, STAIR: 3, DOOR: 4, SHOP: 5, BALF: 6, GLZ: 7, WIN3: 8 }, NT = 9, TW = 128, TH = 128;

function wallTex(r) {
  return canvasTex(AC * CW, AR * CH, (g) => {
    for (let j = 0; j < AR; j++) for (let i = 0; i < AC; i++) {
      const x = i * CW, y = j * CH, q = r();
      // most panels light grey, a few weathered warmer or patched darker
      g.fillStyle = q < 0.14 ? '#e3d8c3' : q < 0.22 ? '#cfccc4' : q < 0.34 ? '#ece9e1' : '#dcdbd5';
      g.fillRect(x, y, CW, CH);
      for (let k = 0; k < 90; k++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(70,65,55,0.07)'; g.fillRect(x + r() * CW, y + r() * CH, 1 + r() * 2, 1 + r() * 2); }
      const st = g.createLinearGradient(0, y, 0, y + CH); st.addColorStop(0, 'rgba(60,55,50,0)'); st.addColorStop(1, `rgba(60,55,50,${0.04 + r() * 0.06})`);
      g.fillStyle = st; g.fillRect(x, y, CW, CH);
      // the sealed seams: dark mastic along the bottom (the floor line) and the left edge of every panel
      g.fillStyle = '#6f6b66'; g.fillRect(x, y + CH - 1, CW, 1); g.fillRect(x, y, 1, CH);
    }
  });
}

function atlas(mask) {
  return canvasTex(NT * TW, TH, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const glassGrad = () => { const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#b4c4d0'); gr.addColorStop(1, '#4a5a68'); return gr; };
    // a frame with glass between bars; vx / hy fractions of the tile (y up), rv: a dark reveal round it
    const pane = (t, vx, hy, { fw = 7, frame = '#f1f1ee', rv = 5, x0 = 0, x1 = 1, y1 = 1 } = {}) => {
      const X = t * TW + x0 * TW, W = (x1 - x0) * TW, H = y1 * TH, Y = TH - H;
      if (mask) { fill('#fff', X + rv + fw, Y + rv + fw, W - 2 * (rv + fw), H - 2 * (rv + fw)); return; }
      fill('#6d6964', X, Y, W, H);
      fill(frame, X + rv, Y + rv, W - 2 * rv, H - 2 * rv);
      g.fillStyle = glassGrad(); g.fillRect(X + rv + fw, Y + rv + fw, W - 2 * (rv + fw), H - 2 * (rv + fw));
      g.fillStyle = frame;
      for (const v of vx) g.fillRect(X + v * W - fw / 2, Y, fw, H);
      for (const h of hy) g.fillRect(X, Y + H * (1 - h) - fw / 2, W, fw);
    };
    if (mask) fill('#000', 0, 0, NT * TW, TH);
    pane(T.WIN, [0.6], [0.78]);
    pane(T.WINK, [0.5], [0.78]);
    pane(T.WIN3, [0.33, 0.66], [0.78]);
    // a balcony door (left, full height) beside a window (right, over a sill panel)
    if (!mask) fill('#dcdbd5', T.BDOOR * TW, 0, TW, TH);
    pane(T.BDOOR, [], [0.8], { x0: 0, x1: 0.42 });
    pane(T.BDOOR, [0.5], [0.8], { x0: 0.45, x1: 1, y1: 0.62 });
    if (!mask) fill('#dcdbd5', T.BDOOR * TW + 0.45 * TW, TH * 0.62, 0.55 * TW, TH * 0.38);
    pane(T.STAIR, [0.33, 0.66], [], { frame: '#e8e6df' });
    // the entrance: a brown steel door with a small window, a light over it
    if (!mask) {
      fill('#6d6964', T.DOOR * TW, 0, TW, TH); fill('#5a3d2b', T.DOOR * TW + 6, 6, TW - 12, TH - 6);
      fill('#8a6a50', T.DOOR * TW + TW / 2 - 2, 10, 4, TH - 10); fill('#c9c7bd', T.DOOR * TW + 22, 16, 22, 30);
    } else fill('#555', T.DOOR * TW + 22, 16, 22, 30);
    pane(T.SHOP, [0.5], [0.85], { fw: 6, frame: '#e9e9e6', rv: 3 });
    // the balcony front: a white slab with three blue tile diamonds
    if (!mask) {
      fill('#ecebe6', T.BALF * TW, 0, TW, TH);
      for (const cx of [0.2, 0.5, 0.8]) {
        const X = T.BALF * TW + cx * TW, Y = TH / 2, R = TW * 0.13;
        g.fillStyle = '#6f97c2'; g.beginPath(); g.moveTo(X, Y - R * 2.2); g.lineTo(X + R, Y); g.lineTo(X, Y + R * 2.2); g.lineTo(X - R, Y); g.closePath(); g.fill();
        g.fillStyle = '#e9eef3'; g.beginPath(); g.moveTo(X, Y - R * 1.1); g.lineTo(X + R * 0.5, Y); g.lineTo(X, Y + R * 1.1); g.lineTo(X - R * 0.5, Y); g.closePath(); g.fill();
      }
      fill('#b9b7b0', T.BALF * TW, 0, TW, 6);
    }
    // the glazing over a closed-in balcony: old timber frames
    pane(T.GLZ, [0.2, 0.4, 0.6, 0.8], [0.7], { fw: 6, frame: '#b99872', rv: 2 });
  }, { repeat: false });
}

export function buildSmil117({ root, map, solids: S, zips: Z, heightAt }) {
  const bs = [ID117, ID119].map((id) => map.buildings.find((b) => b.id === id));
  if (!bs[0] && !bs[1]) return null;
  const t0 = performance.now(), r = rng(ID117 % 65521), n0 = S.count;
  const B = { wall: new MB(), det: new MB(), tile: new MB(), lit: new MB(), roof: new MB(), fbs: new MB(), dirt: new MB() }, D = B.det, R = B.roof;
  const u0 = (t) => (t * TW + 1) / (NT * TW), u1 = (t) => ((t + 1) * TW - 1) / (NT * TW);
  const footprints = [], roofs = {}, yards = {};   // yards: { [osm id]: { f: the yard face, doors: [[x, z]] } }
  let nWin = 0, nLit = 0, nBal = 0;

  // one opening: an atlas quad just proud of the wall, lit at random by the share p (never for a balcony front)
  const tile = (f, t, s0, s1, ya, yb, p = 0.3, o = 0.03) => {
    const on = p > 0 && r() < p, M = on ? B.lit : B.tile; if (p > 0) { nWin++; nLit += on; }
    M.setColor('#ffffff');
    quad(M, at(f, s0, ya, o), at(f, s1, ya, o), at(f, s1, yb, o), at(f, s0, yb, o), f.N, [[u0(t), 0], [u1(t), 0], [u1(t), 1], [u0(t), 1]]);
  };

  for (const b of bs) {
    if (!b) continue;
    const ring = []; for (let i = 0; i < b.p.length; i += 2) ring.push([b.p[i], b.p[i + 1]]);
    const gLo = Math.min(...ring.map(([x, z]) => heightAt(x, z))), gB = gLo - 0.6;
    const F = ringFaces(ring), longF = [...F].sort((p, q) => q.L - p.L).slice(0, 2);
    const street = longF.find((f) => f.nz < 0) ?? longF[0], yard = longF.find((f) => f !== street);
    const fS = street, NS = Math.round(fS.L / MOD), mS = fS.L / NS;
    const dep = -((yard.ax - fS.ax) * fS.nx + (yard.az - fS.az) * fS.nz);  // the block's depth behind the street wall
    // the sections, one per stair, each on its own level over the slope: cut at panel joints, a step of under 0.4 m merged
    const NSEC = Math.max(2, Math.round(fS.L / 20)), cut = [...Array(NSEC + 1).keys()].map((j) => Math.round(j * NS / NSEC) * mS);
    const lv = [];
    for (let j = 0; j < NSEC; j++) {
      let g = -1e9;
      for (const s of [cut[j], (cut[j] + cut[j + 1]) / 2, cut[j + 1]]) for (const o of [0, dep / 2, dep]) { const p = at(fS, s, 0, -o); g = Math.max(g, heightAt(p[0], p[2])); }
      lv.push(g + PL);
    }
    for (let j = 1; j < NSEC; j++) if (Math.abs(lv[j] - lv[j - 1]) < 0.4) lv[j] = lv[j - 1] = Math.max(lv[j], lv[j - 1]);
    for (let j = NSEC - 2; j >= 0; j--) if (Math.abs(lv[j] - lv[j + 1]) < 0.4) lv[j] = lv[j + 1] = Math.max(lv[j], lv[j + 1]);
    const sOf = (p) => (p[0] - fS.ax) * fS.ux + (p[2] - fS.az) * fS.uz;
    const secAt = (f, s) => { const q = sOf(at(f, s, 0)); let j = 0; while (j < NSEC - 1 && q > cut[j + 1]) j++; return j; };
    const yFat = (f, s) => lv[secAt(f, s)];
    // s measured from the north-east end (map +x)
    const fromNE = (f, d) => (at(f, f.L, 0)[0] > at(f, 0, 0)[0] ? f.L - d : d);
    const top = (y) => y + NF * FH + PAR;
    // the sections were sealed and patched apart over the years: some read a touch warmer than the others
    const TINT = lv.map(() => ['#ffffff', '#fdf8ef', '#fffcf7', '#faf2e4'][Math.floor(r() * 4)]);

    // ---- walls, per face and per section: the plinth, the panel atlas, the parapet's coping
    for (const f of F) {
      const N = Math.max(1, Math.round(f.L / MOD)), m = f.L / N, off = (f.k * 3) % AC, us = (s) => (s / m + off) / AC;
      // the section joints on this face, as its own s
      const ks = cut.slice(1, -1).map((c) => { const p = at(fS, c, 0); return (p[0] - f.ax) * f.ux + (p[2] - f.az) * f.uz; }).filter((s) => s > 0.05 && s < f.L - 0.05);
      const br = [0, ...ks.sort((p, q) => p - q), f.L];
      for (let j = 1; j < br.length; j++) {
        const [sa, sb] = [br[j - 1], br[j]], yF = yFat(f, (sa + sb) / 2), TOP = top(yF), sec = secAt(f, (sa + sb) / 2);
        D.setColor(PLINTH); rect(D, f, sa, sb, gB, yF, 0, [2.5, 2.5]);
        D.setColor('#5a5753'); box(D, f, sa, sb, yF - 0.06, yF, 0, 0.03, 'ft');
        B.wall.setColor(TINT[sec]);
        quad(B.wall, at(f, sa, yF), at(f, sb, yF), at(f, sb, TOP), at(f, sa, TOP), f.N,
          [[us(sa), 0], [us(sb), 0], [us(sb), (TOP - yF) / (NF * FH)], [us(sa), (TOP - yF) / (NF * FH)]]);
        D.setColor('#8e8b86'); box(D, f, sa - 0.04, sb + 0.04, TOP, TOP + 0.07, -0.3, 0.05, 'ftlr');
        R.setColor('#cfcdc6'); rect(R, f, sa, sb, yF + NF * FH, TOP, -0.3, null, f.N.map((v) => -v));
        solid(S, f, sa, sb, -0.3, 0, yF + NF * FH, TOP);
        const a = at(f, sa, 0, -0.1), c = at(f, sb, 0, -0.1); Z.edge(a[0], a[2], c[0], c[2], TOP, f.nx, f.nz);
      }
      // the basement vents, every other panel a hand over the ground
      if (f === street || f === yard) for (let i = 0; i < N; i += 2) {
        const s = (i + 0.5) * m, p = at(f, s, 0), g = heightAt(p[0], p[2]);
        if (g + 0.55 < yFat(f, s) - 0.1) { D.setColor('#3b3936'); rect(D, f, s - 0.2, s + 0.2, g + 0.25, g + 0.5, 0.02); }
      }
    }
    // the sections: roof decks, colliders, and where a roof steps up, the cross wall and parapet showing over the lower one
    for (let j = 0; j < NSEC; j++) {
      const P = [at(fS, cut[j], 0), at(fS, cut[j + 1], 0), at(fS, cut[j + 1], 0, -dep), at(fS, cut[j], 0, -dep)].map((p) => [p[0], p[2]]);
      const ROOF = lv[j] + NF * FH;
      R.setColor(ROOF_C); R.fill(P, [], ROOF + 0.02, true);
      S.prism(P.flat(), gB, ROOF, 0, 0, 'wall');
      if (j === 0) continue;
      const [lo, hi] = [lv[j - 1], lv[j]].map(top), s = cut[j];
      if (Math.abs(hi - lo) < 0.01) continue;
      const dir = hi > lo ? -1 : 1, yB = Math.min(lo, hi) - PAR, yT = Math.max(lo, hi), n = [fS.ux * dir, 0, fS.uz * dir];
      const p = (o, y) => at(fS, s, y, -o);
      B.wall.setColor(TINT[hi > lo ? j : j - 1]);
      quad(B.wall, p(0, yB), p(dep, yB), p(dep, yT), p(0, yT), n, [[0, 0], [dep / mS / AC, 0], [dep / mS / AC, (yT - yB) / (NF * FH)], [0, (yT - yB) / (NF * FH)]]);
      D.setColor('#8e8b86'); quad(D, p(0, yT + 0.07), p(dep, yT + 0.07), p(dep, yT), p(0, yT), n);
    }
    const tops = lv.map((y) => y + NF * FH);
    footprints.push({ poly: ring, h: Math.max(...lv) + NF * FH + PAR - gLo, kind: 'apt', name: `вул. Смілянська, ${b.id === ID117 ? 117 : 119}` });
    roofs[b.id] = tops;

    // a balcony at storey k over the floor level y0: a slab, the diamond front, side cheeks; glazed: timber frames up to the slab above
    const balcony = (f, s0, s1, y, glazed) => {
      const d = 1.0;
      D.setColor(SLAB); box(D, f, s0, s1, y - 0.14, y, 0, d, 'ftlru');
      D.setColor('#e4e3dd'); box(D, f, s0 + 0.04, s1 - 0.04, y, y + 1.0, d - 0.08, d - 0.02, 'blrt');
      tile(f, T.BALF, s0 + 0.04, s1 - 0.04, y, y + 1.0, 0, d - 0.01);
      if (glazed) tile(f, T.GLZ, s0 + 0.05, s1 - 0.05, y + 1.0, y + FH - 0.16, 0.25, d - 0.05);
      nBal++;
    };
    const stack = (f, s, w = 2.7) => {
      const y0 = yFat(f, s);
      for (let k = 2; k <= NF; k++) balcony(f, s - w / 2, s + w / 2, y0 + (k - 1) * FH, r() < 0.45);
      solid(S, f, s - w / 2, s + w / 2, 0, 1.0, y0 + FH - 0.14, y0 + NF * FH);
    };

    // ---- the street side: a window per panel (ordinary, wide or kitchen in turn), balcony stacks three and four panels apart
    {
      const f = street, N = NS, m = mS;
      const shop = b.id === ID119 ? [fromNE(f, 15.6), fromNE(f, 19.6)].sort((p, q) => p - q) : null;  // the porch
      const pink = b.id === ID117 ? [fromNE(f, 19.5), fromNE(f, 33.5)].sort((p, q) => p - q) : null; // the shop strip
      for (let i = 0; i < N; i++) {
        const s = (i + 0.5) * m, bal = i % 7 === 1 || i % 7 === 4, y0 = yFat(f, s), fy = (k) => y0 + (k - 1) * FH;
        for (let k = 1; k <= NF; k++) {
          if (k === 1 && shop && s > shop[0] - 2 && s < shop[1] + 2) continue;
          if (k === 1 && pink && s > pink[0] && s < pink[1]) continue;
          if (bal && k > 1) tile(f, T.BDOOR, s - 1.25, s + 1.25, fy(k) + 0.05, fy(k) + 2.25);
          else { const [t, w] = [[T.WIN, 0.75], [T.WIN3, 0.9], [T.WINK, 0.6]][i % 3]; tile(f, t, s - w, s + w, fy(k) + 0.85, fy(k) + 2.3); }
        }
        if (bal) stack(f, s);
      }
      if (shop) {
        // the shop's porch: a white box up a flight of steps, a red fascia over the door and the two shop windows
        const [a, c] = shop, yF = yFat(f, (a + c) / 2), q = at(f, a, 0, 1), g = heightAt(q[0], q[2]), yT = yF + 2.6;
        D.setColor('#e8e6e0'); box(D, f, a, c, gB, yT, 0, 1.3, 'ftlr', [2.5, 2.5]);
        D.setColor('#c4262b'); box(D, f, a - 1.0, c + 1.0, yT, yT + 0.4, 0, 1.45, 'ftlru');
        D.setColor('#d2cfc8'); box(D, f, a - 1.0, c + 1.0, yT + 0.4, yT + 0.47, 0, 1.5, 'ftlr');
        tile(f, T.DOOR, a + 1.2, c - 1.2, yF, yF + 2.3, 0.9, 1.32);
        D.setColor('#c4262b'); box(D, f, a + 1.1, a + 1.2, yF, yF + 2.35, 1.3, 1.35, 'flr'); box(D, f, c - 1.2, c - 1.1, yF, yF + 2.35, 1.3, 1.35, 'flr');
        for (const s of [a - 1.7, c + 1.7]) tile(f, T.SHOP, s - 1.3, s + 1.3, yF + 0.4, yF + 2.4, 0.8);
        // the steps run down along the wall to the south-west
        const n = Math.max(3, Math.round((yF - g) / 0.16)), run = 0.3, rise = (yF - g) / n;
        D.setColor('#a29f99');
        for (let j = 0; j < n; j++) { const s0 = a - (j + 1) * run; box(D, f, s0, s0 + run, gB, yF - j * rise, 0, 1.6, 'ftlr'); }
        solid(S, f, a, c, 0, 1.3, gB, yT + 0.47);
      }
      if (pink) {
        // the pink-rendered ground floor of the shops, wide windows and a door between them, a grey cornice
        const [a, c] = pink, yF = yFat(f, (a + c) / 2), q = at(f, (a + c) / 2, 0, 1), g = heightAt(q[0], q[2]);
        D.setColor('#d39a8e'); box(D, f, a, c, gB, yF + FH - 0.05, 0, 0.12, 'ftlr', [2.5, 2.5]);
        D.setColor('#a8a49d'); box(D, f, a - 0.05, c + 0.05, yF + FH - 0.05, yF + FH + 0.08, 0, 0.25, 'ftlru');
        const n = Math.round((c - a) / 3.5), w = (c - a) / n;
        for (let j = 0; j < n; j++) tile(f, j === 1 ? T.DOOR : T.SHOP, a + j * w + 0.5, a + (j + 1) * w - 0.5, j === 1 ? g + 0.3 : yF + 0.3, yF + 2.4, 0.8, 0.15);
        D.setColor('#a29f99'); box(D, f, a + w + 0.2, a + 2 * w - 0.2, gB, g + 0.3, 0.12, 1.4, 'ftlr');
      }
    }

    // ---- the yard: an entrance in every section under a canopy, the stair windows at the half landings, kitchen
    // windows, a balcony stack two panels off each entrance
    {
      const f = yard, N = Math.round(f.L / MOD), m = f.L / N, ent = new Map(), balP = new Set();
      yards[b.id] = { f, doors: [] };
      for (let i = 0; i < N; i++) { const j = secAt(f, (i + 0.5) * m); if (!ent.has(j)) ent.set(j, []); ent.get(j).push(i); }
      const doors = new Set([...ent.values()].map((is) => is[Math.floor(is.length / 2)]));
      for (const is of ent.values()) { const e = is[Math.floor(is.length / 2)], p = is.includes(e + 2) ? e + 2 : e - 2; if (is.includes(p)) balP.add(p); }
      for (let i = 0; i < N; i++) {
        const s = (i + 0.5) * m, y0 = yFat(f, s), fy = (k) => y0 + (k - 1) * FH;
        if (doors.has(i)) {
          { const d = at(f, s, 0); yards[b.id].doors.push([d[0], d[2]]); }
          const q = at(f, s, 0, 1), g = Math.min(heightAt(q[0], q[2]), y0 - 0.4);
          tile(f, T.DOOR, s - 0.7, s + 0.7, g + 0.15, g + 2.3, 0.85);
          // the half landings sit between the floors, so their windows straddle the floor seams
          for (let k = 1; k < NF; k++) tile(f, T.STAIR, s - 0.85, s + 0.85, fy(k) + FH / 2 + 0.85, fy(k) + FH / 2 + 2.05, 0.6);
          // the canopy: a concrete slab on the door, a step and a light
          D.setColor(SLAB); box(D, f, s - 1.3, s + 1.3, g + 2.45, g + 2.7, 0, 1.5, 'ftlru');
          D.setColor('#9d9a94'); box(D, f, s - 1.0, s + 1.0, gB, g + 0.15, 0, 1.3, 'ftlr');
          D.setColor('#fff4d8'); box(D, f, s - 0.12, s + 0.12, g + 2.32, g + 2.42, 0.02, 0.14, 'fu');
          solid(S, f, s - 1.3, s + 1.3, 0, 1.5, g + 2.45, g + 2.7, 'awning', 1);
          // the vent block over the roof by the stair
          const R0 = y0 + NF * FH, T0 = top(y0);
          D.setColor('#a39a8f'); box(D, f, s - 0.9, s + 0.9, R0, T0 + 0.9, -6.2, -5.0, 'fblrt');
          D.setColor('#6a6560'); box(D, f, s - 1.0, s + 1.0, T0 + 0.9, T0 + 1.0, -6.3, -4.9, 'fblrt');
          continue;
        }
        const bal = balP.has(i);
        for (let k = 1; k <= NF; k++) {
          if (bal && k > 1) tile(f, T.BDOOR, s - 1.25, s + 1.25, fy(k) + 0.05, fy(k) + 2.25);
          else if (i % 2) tile(f, T.WINK, s - 0.6, s + 0.6, fy(k) + 0.85, fy(k) + 2.3);
          else tile(f, T.WIN, s - 0.75, s + 0.75, fy(k) + 0.85, fy(k) + 2.3);
        }
        if (bal) stack(f, s);
      }
    }
  }

  const Y = buildYard({ yards, heightAt, S, B, r: rng(ID119 % 65521 + 44) });

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: wallTex(r), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    tile: new THREE.MeshStandardMaterial({ map: atlas(false), vertexColors: true, roughness: 0.45, metalness: 0.05 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    fbs: new THREE.MeshStandardMaterial({ map: concreteTex(rng(ID117 % 65521 + 5)), vertexColors: true, roughness: 0.95 }),
    dirt: new THREE.MeshStandardMaterial({ map: dirtTex(rng(ID117 % 65521 + 6)), vertexColors: true, roughness: 1 }),
  };
  M.lit = new THREE.MeshStandardMaterial({ map: M.tile.map, vertexColors: true, roughness: 0.45, metalness: 0.05, emissive: 0xffc890, emissiveMap: atlas(true), emissiveIntensity: 0 });
  const out = finish(root, 'smil117', B, M, { shade: ['wall', 'det', 'tile', 'lit', 'fbs'] });
  // the sheds beyond the fence: their own root, so the far stand-ins of the blocks (proxies.js) leave them be
  const SH = buildSheds({ root, map, S, heightAt, r: rng(ID119 % 65521 + 91) });
  const shOut = finish(root, 'smil117-sheds', { brick: SH.W, roof: SH.R, det: SH.D }, {
    brick: new THREE.MeshStandardMaterial({ map: brickTex(rng(91)), vertexColors: true, roughness: 0.92 }),
    roof: new THREE.MeshStandardMaterial({ map: sheetTex(), vertexColors: true, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }),
    det: M.det,
  }, { shade: ['brick', 'roof'] });
  footprints.push(...SH.footprints);
  console.log(`[cherkasy] Smilianska 117/119: ${nWin} windows (${nLit} lit), ${nBal} balconies, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes (+ ${SH.footprints.length} sheds: ${(shOut.verts / 1000).toFixed(1)}k verts, ${shOut.meshes} meshes), ${S.count - n0} solids, yard: ${Y ? `${Y.spots.length} plants, ${Y.parked.length} parked, ${Y.nBlocks} fence blocks` : 'none'} in ${(performance.now() - t0).toFixed(0)} ms`);
  // trees keep off the blocks and a metre and a half round them
  const faces = footprints.map((p) => ringFaces(p.poly));
  const inside = (fs, x, z, pad) => fs.every((f) => (x - f.ax) * f.nx + (z - f.az) * f.nz < pad);
  return {
    roofs,
    footprints,
    // the yard plants its own trees and shrubs: the generated ones go from it
    clear: (x, z) => faces.some((fs) => inside(fs, x, z, 1.5)) || !!Y?.clear(x, z),
    spots: (Y?.spots ?? []).filter((p) => !faces.some((fs) => inside(fs, p.x, p.z, 1.5))), // none in a shed
    parked: Y?.parked ?? [],
    yard: Y,
    update() { M.lit.emissiveIntensity = 0.45 * nightK.value; },
  };
}

// ---- the yard behind the blocks (issue #44), after a player's three evening photos from a low balcony of No.119 and
// the OSM layout. Map points from OSM: the drive along the yard fronts (way 157588384), the fence line (the edge between
// the yards' landuse=residential 974803700 and the wasteland's landuse=grass 177533856, moved 5 m in toward the blocks:
// the photos put it ~30 m off No.119; the short return toward the kindergarten path is a guess) and the waste point (node
// 1694191528). The trodden path across the lawn is not in OSM: it runs from the kindergarten corner (way 1422416612's
// end) along the yard to the bins, ~17 m out from the wall as the photos show it.
const DRIVE = [[-2885, 552], [-2766, 539], [-2760, 549], [-2749, 550], [-2625, 535]];
const FENCE = [[-2875.6, 588.3], [-2865.6, 571], [-2622.6, 560.6]];
const BINS = [-2763, 557], PATH = [[0.5, 21.5], [8, 17.5], [121, 19.5], [126.5, 24.5]]; // the path in the yard frame (s, o)
// along the yard from No.119's south-west end (s, metres): the pull-ins off the drive, nose-in among the shrubs (n cars)
const POCKETS = [[15, 1], [27, 2], [44, 1], [57, 2], [74, 1], [92, 2], [109, 1], [152, 2], [176, 1], [198, 2], [224, 1], [247, 2]];
const BAY = 2.9, POCKET_D = 5.8;

function concreteTex(r) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e4e2dc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(60,55,50,0.09)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    // rain streaks down from the top, a few dark patches of damp and lichen
    for (let i = 0; i < 40; i++) {
      const x = r() * w, l = 20 + r() * 120, gr = g.createLinearGradient(0, 0, 0, l);
      gr.addColorStop(0, 'rgba(70,66,58,0.22)'); gr.addColorStop(1, 'rgba(70,66,58,0)');
      g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 6, l);
    }
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '70,78,52' : '60,58,54'},${0.1 + r() * 0.12})`; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 26, 5 + r() * 16, r() * 3, 0, 7); g.fill(); }
  });
}
function dirtTex(r) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d8d2c6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4200; i++) {
      const q = r();
      g.fillStyle = q < 0.45 ? 'rgba(95,82,64,0.16)' : q < 0.8 ? 'rgba(255,250,240,0.2)' : 'rgba(70,90,40,0.14)';
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  });
}

// the yard in a frame along No.119's yard front: s from its south-west corner toward No.117, o out into the yard.
// Lays the FBS-block fence, the pull-ins, the path, the play things and the bins into B, and returns the plants, the
// parking spots and the tree clearing: { spots, parked, clear(x, z), W(s, o), SO(x, z), driveO(s), fenceO(s), nBlocks, things }
function buildYard({ yards, heightAt, S, B, r }) {
  const y9 = yards[ID119];
  if (!y9) return null;
  const f9 = y9.f, A = at(f9, 0, 0), C = at(f9, f9.L, 0), [p0, p1] = A[0] < C[0] ? [A, C] : [C, A];
  const L9 = f9.L, ux = (p1[0] - p0[0]) / L9, uz = (p1[2] - p0[2]) / L9, nx = f9.nx, nz = f9.nz;
  const W = (s, o) => [p0[0] + ux * s + nx * o, p0[2] + uz * s + nz * o];
  const SO = (x, z) => { const dx = x - p0[0], dz = z - p0[2]; return [dx * ux + dz * uz, dx * nx + dz * nz]; };
  const lerpO = (pts) => {
    const q = pts.map(([x, z]) => SO(x, z));
    return (s) => {
      if (s <= q[0][0]) return q[0][1];
      for (let i = 1; i < q.length; i++) if (s <= q[i][0]) return q[i - 1][1] + (s - q[i - 1][0]) / (q[i][0] - q[i - 1][0]) * (q[i][1] - q[i - 1][1]);
      return q[q.length - 1][1];
    };
  };
  const driveO = lerpO(DRIVE), fenceO = lerpO(FENCE.slice(1));
  // No.117's yard front stands ~15 m further out than No.119's
  const y7 = yards[ID117], ends7 = y7 ? [at(y7.f, 0, 0), at(y7.f, y7.f.L, 0)].map((p) => [p[0], p[2]]).sort((a, b) => SO(...a)[0] - SO(...b)[0]) : null;
  const wall7 = ends7 ? lerpO(ends7) : null, s7 = ends7 ? ends7.map((p) => SO(...p)[0]) : [1e9, 1e9];
  const wallO = (s) => (s >= s7[0] - 1 && s <= s7[1] + 1 ? wall7(s) : s >= -1 && s <= L9 + 1 ? 0 : null);
  const doors = [...(y9.doors ?? []), ...(y7?.doors ?? [])].map(([x, z]) => SO(x, z)[0]);
  const gY = (x, z) => heightAt(x, z);
  const D = B.det, F = B.fbs, G = B.dirt, LIFT = 0.18; // over heightAt: the ground's own land layer lies ~0.15 up

  // a quad of map points p00 p10 p11 p01 draped on the ground in cells of <= 2 m, uv in metres
  const drape = (P, col) => {
    const [a, b, c, d] = P, id = [];
    const ns = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)), no = Math.max(1, Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / 2));
    G.setColor(col);
    for (let j = 0; j <= no; j++) for (let i = 0; i <= ns; i++) {
      const u = i / ns, t = j / no;
      const x = (a[0] * (1 - u) + b[0] * u) * (1 - t) + (d[0] * (1 - u) + c[0] * u) * t, z = (a[1] * (1 - u) + b[1] * u) * (1 - t) + (d[1] * (1 - u) + c[1] * u) * t;
      id.push(G.vert(x, gY(x, z) + LIFT, z, 0, 1, 0, x / 3, z / 3));
    }
    const up = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]) < 0;
    for (let j = 0; j < no; j++) for (let i = 0; i < ns; i++) {
      const q0 = j * (ns + 1) + i, q1 = q0 + 1, q2 = q0 + ns + 2, q3 = q0 + ns + 1;
      if (up) G.quad(id[q0], id[q1], id[q2], id[q3]); else G.quad(id[q0], id[q3], id[q2], id[q1]);
    }
  };
  const rectSO = (s0, s1, o0, o1) => [W(s0, o0), W(s1, o0), W(s1, o1), W(s0, o1)];

  // ---- the pull-ins: bare trodden earth off the drive's yard edge, a car in most bays
  const parked = [], pockets = POCKETS.map(([s, n]) => ({ s0: s - n * BAY / 2, s1: s + n * BAY / 2, n, o0: driveO(s) + 1.9 }));
  const ryOut = -Math.atan2(nz, nx); // nose out into the yard (traffic.js: forward = (cos ry, -sin ry))
  for (const q of pockets) {
    drape(rectSO(q.s0 - 0.3, q.s1 + 0.3, q.o0, q.o0 + POCKET_D + 0.4), '#6f6658');
    for (let k = 0; k < q.n; k++) if (r() < 0.75) { const [x, z] = W(q.s0 + (k + 0.5) * BAY, q.o0 + 2.9); parked.push([x, z, ryOut + (r() - 0.5) * 0.12]); }
  }
  const inPocket = (s, o, pad) => pockets.some((q) => s > q.s0 - pad && s < q.s1 + pad && o > q.o0 - pad && o < q.o0 + POCKET_D + pad);

  // ---- the path across the lawn, trodden grey earth, and the bins' pad at its end
  const segs = PATH.slice(1).map((b, i) => [PATH[i], b]);
  for (const [[sa, oa], [sb, ob]] of segs) {
    const l = Math.hypot(sb - sa, ob - oa), ds = -(ob - oa) / l * 0.42, dd = (sb - sa) / l * 0.42, ex = 0.3 / l; // overlap the joints a little
    const [a0, a1] = [[sa - (sb - sa) * ex, oa - (ob - oa) * ex], [sb + (sb - sa) * ex, ob + (ob - oa) * ex]];
    drape([W(a0[0] - ds, a0[1] - dd), W(a1[0] - ds, a1[1] - dd), W(a1[0] + ds, a1[1] + dd), W(a0[0] + ds, a0[1] + dd)], '#aaa49a');
  }
  const pathO = lerpO(PATH.map(([s, o]) => W(s, o)));
  const nearPath = (s, o, pad) => s > PATH[0][0] - pad && s < PATH[PATH.length - 1][0] + pad && Math.abs(o - pathO(s)) < 0.45 + pad;
  const [bs, bo] = SO(...BINS);
  {
    const fb = face(W(bs - 3.4, bo), W(bs + 3.4, bo), nx, nz);
    const g0 = Math.min(...[[-3.4, -1.3], [3.4, -1.3], [3.4, 1.3], [-3.4, 1.3]].map(([s, o]) => gY(...W(bs + s, bo + o))));
    D.setColor('#a19e97'); box(D, fb, 0, 6.8, g0 - 0.1, g0 + 0.3, -1.3, 1.3, 'fblrt');
    const y = g0 + 0.3;
    for (const [k, col] of [[0, '#3f5a44'], [1, '#6f7377'], [2, '#3f5a44']]) {
      const s0 = 0.5 + k * 2.0;
      D.setColor(col); box(D, fb, s0, s0 + 1.4, y + 0.15, y + 1.2, -0.55, 0.55, 'fblr');
      D.setColor('#2c2f30'); box(D, fb, s0 - 0.03, s0 + 1.43, y + 1.2, y + 1.3, -0.6, 0.62, 'fblrtu');
      for (const ds of [0.15, 1.25]) for (const dd of [-0.4, 0.4]) { const p = at(fb, s0 + ds, 0, dd); D.cyl(p[0], y, p[2], 0.07, 0.07, 0.15, 6, false); }
    }
    solid(S, fb, 0.4, 6.4, -0.6, 0.62, g0 - 0.1, y + 1.3);
  }

  // ---- the fence of grey FBS blocks (2.4 x 0.6 x 0.5 m) laid dry, two or three high, a lone one or a gap here and there
  let nBlocks = 0;
  for (let i = 1; i < FENCE.length; i++) {
    const a = FENCE[i - 1], b = FENCE[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), ff = face(a, b, -(b[1] - a[1]) / l, (b[0] - a[0]) / l);
    for (let s0 = 0; s0 + 2.38 <= l + 0.01; s0 += 2.4) {
      const q = r(), rows = q < 0.05 ? 0 : q < 0.13 ? 1 : q < 0.72 ? 2 : 3;
      if (!rows) continue;
      const gs = [0, 1.19, 2.38].map((d) => { const p = at(ff, s0 + d, 0); return gY(p[0], p[2]); }), g = Math.min(...gs) - 0.06;
      for (let k = 0; k < rows; k++) {
        const js = k ? (r() - 0.5) * 0.3 : 0, jo = (r() - 0.5) * 0.1, y0 = g + k * 0.6;
        F.setColor(['#c9c7c0', '#bcbab3', '#b0aea7', '#a9ab9c', '#c4bfb3'][Math.floor(r() * 5)]);
        box(F, ff, s0 + js, s0 + js + 2.38, y0, y0 + 0.58, jo - 0.25, jo + 0.25, 'fblrt', [2.5, 2.5]);
        nBlocks++;
      }
      // a lone block on a slope can stand under the car's 0.5 m kerb step: its collider keeps a bumper's height
      solid(S, ff, s0, s0 + 2.38, -0.28, 0.28, g, Math.max(g + rows * 0.6, Math.max(...gs) + 0.85));
    }
  }

  // ---- the play things on the lawn, all in chipped light-blue paint: the old climbing arch with its round seat, the
  // П-frame by the fence; and two green washing-line posts
  const tube = (P, Q, rad = 0.03, seg = 6) => D.tube(P, Q, rad, seg);
  const pole = (x, z, y0, y1, rad = 0.05) => S.cyl(x, z, y0, y1, rad, rad, 'pole');
  const things = [];
  {
    // the climbing arch: two ladder rails curving up from the lawn to the seat, rungs between, a straight back leg
    const sC = 67, oC = fenceO(sC) - 5.5, [cx, cz] = W(sC, oC), g = gY(cx, cz), R = 1.35;
    const P = (d, y, l) => [cx + nx * d + ux * l, g + y, cz + nz * d + uz * l];
    D.setColor('#3fb4d4');
    for (const l of [-0.28, 0.28]) {
      for (let k = 0; k < 6; k++) { const t0 = k / 6 * Math.PI / 2, t1 = (k + 1) / 6 * Math.PI / 2; tube(P(-R * Math.cos(t0), R * Math.sin(t0), l), P(-R * Math.cos(t1), R * Math.sin(t1), l)); }
      tube(P(0.3, -0.1, l * 0.6), P(0.05, R, l * 0.6), 0.035);
    }
    for (const t of [0.25, 0.55, 0.85, 1.15]) tube(P(-R * Math.cos(t), R * Math.sin(t), -0.28), P(-R * Math.cos(t), R * Math.sin(t), 0.28), 0.022);
    D.setColor('#5cc4e2'); D.cyl(cx, g + R, cz, 0.4, 0.56, 0.22, 14);
    D.setColor('#7a4a2e'); tube(P(0.2, -0.1, 0), P(0.2, R, 0), 0.04); // the rusty back post
    pole(cx, cz, g, g + R + 0.16, 0.45);
    things.push([sC, oC, 2.4]);
  }
  {
    // the П-frame: two posts and a bar, 3 m wide, 2.1 m high
    const sP = 58, oP = fenceO(sP) - 1.6, top = [];
    D.setColor('#3f86c9');
    for (const l of [-1.5, 1.5]) { const [x, z] = W(sP + l, oP), g = gY(x, z); tube([x, g - 0.2, z], [x, g + 2.1, z], 0.045); pole(x, z, g - 0.2, g + 2.1, 0.06); top.push([x, g + 2.1, z]); }
    const yt = Math.max(top[0][1], top[1][1]);
    tube([top[0][0], yt, top[0][2]], [top[1][0], yt, top[1][2]], 0.04);
    for (const l of [-1.5, 1.5]) things.push([sP + l, oP, 1.3]);
  }
  for (const [sq, dq] of [[79, 1.1], [71, 1.8]]) {
    // the washing-line posts: green pipes with a short cross-bar
    const oq = fenceO(sq) - dq, [x, z] = W(sq, oq), g = gY(x, z);
    D.setColor('#3e7f4c'); tube([x, g - 0.2, z], [x, g + 1.9, z], 0.04);
    tube([x - nx * 0.45, g + 1.85, z - nz * 0.45], [x + nx * 0.45, g + 1.85, z + nz * 0.45], 0.025);
    pole(x, z, g - 0.2, g + 1.9);
    things.push([sq, oq, 1.2]);
  }
  things.push([bs, bo, 4.4]);
  const nearThing = (s, o) => things.some(([a, b, d]) => Math.hypot(s - a, o - b) < d);

  // ---- the plants: dense and overgrown, as in the photos
  const spots = [];
  const plant = (s, o, sp) => { const [x, z] = W(s, o); spots.push({ x, z, ...sp }); };
  const free = (s, o, pad = 1) => !inPocket(s, o, pad) && !nearPath(s, o, pad * 0.8) && !nearThing(s, o);
  const big = () => {
    const q = r();
    if (q < 0.26) return { kind: 'conifer', variant: 'poplar', pal: PARK_GREENS, sc: 1.6 + r() * 0.5, s3: [1.5, 1.2 + r() * 0.25, 1.5] }; // old black poplars
    if (q < 0.5) return { kind: 'elm', variant: 'elm', sc: 1.05 + r() * 0.35 };
    if (q < 0.72) return { kind: 'park', variant: 'maple', sc: 1.0 + r() * 0.35 };
    if (q < 0.88) return { kind: 'street', variant: 'linden', sc: 1.1 + r() * 0.3 };
    return { kind: 'park', variant: 'oak', sc: 0.9 + r() * 0.25 };
  };
  const shrub = (tall = 1) => (r() < 0.72
    ? { kind: 'hedge', variant: 'hedge', pal: PARK_GREENS, s3: [0.9 + r() * 1.0, (0.85 + r() * 0.9) * tall, 0.8 + r() * 0.7], ry: r() * Math.PI }
    : { kind: 'small', variant: r() < 0.5 ? 'fruit' : 'sapling', sc: 0.4 + r() * 0.25 });
  const SPAN = [3, 262], GAP = [118, 146]; // the drive's bend between the blocks stays open
  // the belt between the drive and the lawn: big trees over thick shrubs, two rows deep
  for (let s = SPAN[0] + r() * 4; s < SPAN[1]; s += 8.5 + r() * 5) {
    if (s > GAP[0] && s < GAP[1]) continue;
    const o = driveO(s) + 4.2 + r() * 4.2;
    if (free(s, o, 2.2)) plant(s, o, big());
  }
  for (let s = SPAN[0]; s < SPAN[1]; s += 1.2 + r() * 0.8) {
    if (s > GAP[0] && s < GAP[1]) continue;
    for (const [lo, hi] of [[2.9, 4.3], [4.6, 6.6], [6.9, 8.9]]) {
      const o = driveO(s) + lo + r() * (hi - lo);
      if (r() < 0.8 && free(s, o, 0.5)) plant(s, o, shrub());
    }
  }
  // the white poplar leaning out over the yard by the middle of No.119
  { const s = 86, o = driveO(s) + 3.4; plant(s, o, { kind: 'park', variant: 'birch', sc: 1.75, s3: [1.25, 1.15, 1.25], ry: Math.atan2(nx * 0.8 - ux * 0.6, nz * 0.8 - uz * 0.6), rx: 0.2 }); }
  // the strip between the walls and the drive: a few bushes and young trees between the entrances
  for (let s = SPAN[0] + 2; s < SPAN[1]; s += 4.5 + r() * 3) {
    const w = wallO(s);
    if (w == null) continue;
    const lo = w + 2.0, hi = driveO(s) - 2.7;
    if (hi < lo || doors.some((d) => Math.abs(d - s) < 3.2) || r() < 0.35) continue;
    const o = lo + r() * (hi - lo);
    plant(s, o, r() < 0.25 && hi - lo > 0.8 ? { kind: 'street', variant: 'linden', sc: 0.75 + r() * 0.2 } : shrub(0.8));
  }
  // the lawn: open, a lone tree or two; trees and shrub clumps along the fence, the wasteland's weeds behind it
  for (let s = 20 + r() * 6; s < SPAN[1]; s += 12 + r() * 9) {
    const fo = fenceO(s), o = r() < 0.4 ? fo - 1.6 - r() * 2 : fo + 1.8 + r() * 5;
    if (free(s, o, 1.5)) plant(s, o, big());
  }
  for (let s = 24; s < SPAN[1]; s += 2.6 + r() * 2.4) {
    const fo = fenceO(s);
    if (r() < 0.45) { const o = fo - 0.9 - r() * 0.8; if (free(s, o, 0.6)) plant(s, o, shrub(0.9)); }
    if (r() < 0.3) { const o = fo + 2 + r() * 14; plant(s, o, { kind: 'small', variant: r() < 0.6 ? 'sapling' : 'fruit', sc: 0.6 + r() * 0.5 }); } // self-sown scrub
    for (let k = 0; k < 4; k++) {
      const o = fo + 1.0 + r() * 16;
      if (r() < 0.7) plant(s + r() * 2, o, { kind: 'hedge', variant: 'hedge', pal: [PAL[2], PAL[0], PARK_GREENS[2]], s3: [1.4 + r() * 2.2, 0.55 + r() * 0.75, 1.1 + r() * 1.5], ry: r() * Math.PI });
    }
  }
  for (const [s, d] of [[34, 4], [101, 6], [190, 5], [232, 9]]) { const o = driveO(s) + 9 + d; if (free(s, o, 2)) plant(s, o, big()); }

  // the generated trees give way inside the fence and a little past it, where the yard's own plants stand
  const clear = (x, z) => { const [s, o] = SO(x, z); return s > -4 && s < 268 && o > -1.5 && o < fenceO(s) + 17; };
  return { spots, parked, clear, W, SO, driveO, fenceO, nBlocks, things };
}
function buildSheds({ root, map, S, heightAt, r }) {
  const W = new MB(), R = new MB(), D = new MB(), footprints = [];
  for (const [id, q] of Object.entries(SHEDS)) {
    const b = map.buildings.find((o) => o.id === +id);
    if (!b) continue;
    const ring = []; for (let i = 0; i < b.p.length; i += 2) ring.push([b.p[i], b.p[i + 1]]);
    const F = ringFaces(ring), fL = [...F].sort((a, c) => c.L - a.L)[0], fO = F[(fL.k + 2) % F.length];
    const gs = ring.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...gs) - 0.3, H = Math.max(...gs) + 2.9 + r() * 0.5;
    const dep = -((fO.ax - fL.ax) * fL.nx + (fO.az - fL.az) * fL.nz), rise = dep / 2 * (q.pitch ?? 0.36);
    // s along the long face from its start; the ruined stretch at the west (smaller x) end
    const west = at(fL, 0, 0)[0] < at(fL, fL.L, 0)[0] ? 0 : 1, sR = (q.ruin ?? 0) * fL.L;
    const ruined = (s) => (west === 0 ? s < sR : s > fL.L - sR);
    const P = (s, o, y) => at(fL, s, y, -o); // o inward from the long face, 0..dep
    for (const f of F) {
      const long = f === fL || f === fO;
      W.setColor(q.wall);
      if (!long) {
        // a gable end: the wall, the triangle over it (none on a ruin) and a dark door
        rect(W, f, 0, f.L, gLo, H, 0, [1, 1]);
        const mid = at(f, f.L / 2, H + rise), isRuin = ruined((at(f, f.L / 2, 0)[0] - fL.ax) * fL.ux + (at(f, f.L / 2, 0)[2] - fL.az) * fL.uz);
        if (!isRuin) W.face([at(f, 0, H), at(f, f.L, H), mid], f.N);
        D.setColor('#2b2522'); rect(D, f, f.L / 2 - 0.9, f.L / 2 + 0.9, gLo + 0.3, gLo + 2.6, 0.03);
        continue;
      }
      // a long wall in 1.6 m pieces: whole, or ragged and broken down over the ruin
      const n = Math.max(1, Math.round(f.L / 1.6)), m = f.L / n;
      for (let i = 0; i < n; i++) {
        const sa = i * m, sb = sa + m, sMid = (at(f, (sa + sb) / 2, 0)[0] - fL.ax) * fL.ux + (at(f, (sa + sb) / 2, 0)[2] - fL.az) * fL.uz;
        const top = ruined(sMid) ? gLo + 1.2 + r() * (H - gLo - 1.0) : H;
        W.setColor(q.wall); rect(W, f, sa, sb, gLo, top, 0, [1, 1]);
        if (ruined(sMid)) { W.setColor('#7a4a3b'); quad(W, at(f, sa, top), at(f, sb, top), at(f, sb, top, -0.38), at(f, sa, top, -0.38), [0, 1, 0]); rect(W, f, sa, sb, gLo, top, -0.38, [1, 1], f.N.map((v) => -v)); }
        // a window hole every other piece, empty and dark
        if (i % 2 === 1 && top > gLo + 2.4) { D.setColor('#2a2421'); rect(D, f, sa + 0.25, sb - 0.25, gLo + 1.2, gLo + 2.45, 0.03); }
      }
    }
    // the two roof slopes over the standing stretch, 0.4 m eaves all round
    const [s0, s1] = q.ruin ? (west === 0 ? [sR, fL.L] : [0, fL.L - sR]) : [0, fL.L];
    const e = 0.4, ya = H - e * (q.pitch ?? 0.36), yr = H + rise;
    R.setColor(q.roof);
    for (const [oa, ob] of [[-e, dep / 2], [dep + e, dep / 2]]) {
      const a0 = P(s0 - (s0 > 0 ? 0 : e), oa, ya), a1 = P(s1 + (s1 < fL.L ? 0 : e), oa, ya), b1 = P(s1 + (s1 < fL.L ? 0 : e), ob, yr), b0 = P(s0 - (s0 > 0 ? 0 : e), ob, yr);
      const nrm = [b0[0] - a0[0], 0, b0[2] - a0[2]], len = Math.hypot(nrm[0], nrm[2]), sl = (yr - ya) / len;
      quad(R, a0, a1, b1, b0, [-nrm[0] / len * sl, 1, -nrm[2] / len * sl].map((v, k, A) => v / Math.hypot(...A)), [[0, 0], [fL.L / 1.2, 0], [fL.L / 1.2, len / 1.2], [0, len / 1.2]]);
    }
    if (q.ruin) {
      // the cross wall where the roof stops, its gable over it
      const sB = west === 0 ? sR : fL.L - sR, nU = west === 0 ? fL.U.map((v) => -v) : fL.U;
      W.setColor(q.wall); quad(W, P(sB, 0, gLo), P(sB, dep, gLo), P(sB, dep, H), P(sB, 0, H), nU, [[0, 0], [dep, 0], [dep, H - gLo], [0, H - gLo]]);
      W.face([P(sB, 0, H), P(sB, dep, H), P(sB, dep / 2, yr)], nU);
    }
    const flat = area2(ring) < 0 ? [...ring].reverse() : ring;
    S.prism(flat.flat(), gLo, H, 0, 0, 'wall');
    footprints.push({ poly: ring, h: H + rise - gLo, kind: 'shed', name: '' });
  }
  return { W, R, D, footprints };
}
