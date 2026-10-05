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
//   SMIL117_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildSmil117({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, roofs } | null
//     roofs: { [osm id]: [the roof deck of each section, in the order the street face runs] } (tests)
// Walls are one quad per face over a painted 8-panel x 5-storey atlas (u by the panel module, v by storey), so the
// seams and the odd tinted panel cost nothing; windows, balcony fronts and doors are quads of a second atlas, the lit
// ones in a mesh whose emissive mask is the glass.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng } from './geo.js';
import { ringFaces, at, quad, box, rect, solid, finish } from './slabkit.js';

const ID117 = 105315513, ID119 = 105315529;
export const SMIL117_SKIP = new Set([ID117, ID119]);

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
  const B = { wall: new MB(), det: new MB(), tile: new MB(), lit: new MB(), roof: new MB() }, D = B.det, R = B.roof;
  const u0 = (t) => (t * TW + 1) / (NT * TW), u1 = (t) => ((t + 1) * TW - 1) / (NT * TW);
  const footprints = [], roofs = {};
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
      for (let i = 0; i < N; i++) { const j = secAt(f, (i + 0.5) * m); if (!ent.has(j)) ent.set(j, []); ent.get(j).push(i); }
      const doors = new Set([...ent.values()].map((is) => is[Math.floor(is.length / 2)]));
      for (const is of ent.values()) { const e = is[Math.floor(is.length / 2)], p = is.includes(e + 2) ? e + 2 : e - 2; if (is.includes(p)) balP.add(p); }
      for (let i = 0; i < N; i++) {
        const s = (i + 0.5) * m, y0 = yFat(f, s), fy = (k) => y0 + (k - 1) * FH;
        if (doors.has(i)) {
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


  const M = {
    wall: new THREE.MeshStandardMaterial({ map: wallTex(r), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    tile: new THREE.MeshStandardMaterial({ map: atlas(false), vertexColors: true, roughness: 0.45, metalness: 0.05 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
  };
  M.lit = new THREE.MeshStandardMaterial({ map: M.tile.map, vertexColors: true, roughness: 0.45, metalness: 0.05, emissive: 0xffc890, emissiveMap: atlas(true), emissiveIntensity: 0 });
  const out = finish(root, 'smil117', B, M, { shade: ['wall', 'det', 'tile', 'lit'] });
  console.log(`[cherkasy] Smilianska 117/119: ${nWin} windows (${nLit} lit), ${nBal} balconies, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  // trees keep off the blocks and a metre and a half round them
  const faces = footprints.map((p) => ringFaces(p.poly));
  const inside = (fs, x, z, pad) => fs.every((f) => (x - f.ax) * f.nx + (z - f.az) * f.nz < pad);
  return {
    roofs,
    footprints,
    clear: (x, z) => faces.some((fs) => inside(fs, x, z, 1.5)),
    update() { M.lit.emissiveIntensity = 0.45 * nightK.value; },
  };
}
