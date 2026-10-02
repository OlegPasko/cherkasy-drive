// OWNER: cherkasy. ЖК «Олімп», вулиця Сумгаїтська, 15/5 (the OSM multipolygon 21402178, four building:parts): one
// L-shaped block of sections on the corner of Сумгаїтська and Квіткова, the yard behind it. Built from the lun.ua
// catalogue (lun.ua/new/cherkasy/olimp): the developer's renders and the construction photos of sections 1–4
// (2024–2026). Section 1 (the north-east end, a blank gable) and section 2 (with the drive-through to the yard) along
// Сумгаїтська are GF + 8, section 3 on the corner is GF + 9 with a curved glazed bow on the chamfer that rises past the
// parapet, section 4 runs down Квіткова at GF + 8. Every long face alternates the same bays the photos show: cream
// ventilated panels with brown-framed windows and white AC baskets, light grey bands over the 3rd and 6th floors, and
// stacks of two-wide loggias in a white frame; a dark marble ground storey of shop fronts, a grey band over it, a brown
// cornice and a light grey parapet. Flat white canopies on round columns over the yard doors. Windows light up at
// night. No signage (the «ОЛІМП» letters over the bow are left off).
//   OLIMP_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildOlimp({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in a face frame (slabkit.js): s along the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf, centroid } from './geo.js';
import { ringFaces, face, at, rect, box, skin, hole, solid, finish, speckle, quad } from './slabkit.js';
import { canvasTex } from './sculpt.js';

const ID = 21402178;
export const OLIMP_SKIP = new Set([ID]);

const GF = 4.2, FH = 3.0, PARA = 1.15;                // ground storey, upper storeys, parapet over the roof slab
const CREAM = '#ebe2c8', WHITE = '#f1f0ea', GREY = '#c9cbc9', BROWN = '#5a3a2a', MARBLE = '#4a3c34', FRAME = '#6b3f22';
const GLASS = ['#8a7570', '#6f6a68', '#9a817a', '#5f6870'], SHOP = '#3b3f42';
const TW = { w: 2.3, L: 6.6, B: 9.0 };                // fixed bay widths; any other token is a filler
// the four parts by centroid: section number, storeys, and the faces by outward normal (pattern read from `from`)
const DIAG = [0.676, 0.737], CHAMF = [-0.735, -0.678], CORNER = [-2419, -1680];
const LONG = 'b w w L w w w L w w b';
const SECT = [
  { n: 4, c: [-2418, -1632], nf: 9, faces: [
    { n: [-1, 0], pat: LONG }, { n: [1, 0], pat: LONG, canopy: true },
    { n: [0, 1], pat: 'w w g', from: [-2410, -1616] }] },
  { n: 3, c: [-2408, -1670], nf: 10, faces: [
    { n: [-1, 0], pat: 'L w L w w b', from: CORNER }, { n: [0, -1], pat: 'L w L w w w b', from: CORNER },
    { n: CHAMF, pat: 'b w B w b' }, { n: DIAG, pat: LONG, canopy: true }] },
  { n: 2, c: [-2370, -1678], nf: 9, pass: [-2361, 4.4], faces: [
    { n: [0, -1], pat: LONG }, { n: [0, 1], pat: LONG, canopy: true }] },
  { n: 1, c: [-2337, -1679], nf: 9, faces: [
    { n: [0, -1], pat: LONG }, { n: [0, 1], pat: LONG, canopy: true },
    { n: [1, 0], pat: 'w w g', from: [-2321, -1671.6] }] },
];

// drop the vertices of nearly straight runs (OSM splits the yard face of section 2 at the drive-through)
function straighten(P) {
  const out = P.filter((p, i) => {
    const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length];
    const u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]];
    return Math.abs(u[0] * v[1] - u[1] * v[0]) / (Math.hypot(...u) * Math.hypot(...v) || 1) > 0.05;
  });
  return out.length >= 3 ? out : P;
}

// cream ventilated panels, ~1.15 x 1.5 m, with fine joints: one repeat is 2 x 2 panels (uv 2.3 x 3 m)
const panelTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(90,80,60,0.28)';
  for (const x of [0, w / 2]) g.fillRect(x, 0, 2, h);
  for (const y of [0, h / 2]) g.fillRect(0, y, w, 2);
});
// dark polished stone: mottled with pale veins (tinted brown by the vertex colour)
const stoneTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,30,25' : '255,250,240'},${0.08 + r() * 0.12})`; g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 14, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.3) * 50; g.lineTo(x, y); } g.stroke(); }
});

export function buildOlimp({ root, map, solids: S, zips: Z, heightAt }) {
  const raw = map.buildings.filter((q) => q.id === ID);
  if (!raw.length) return null;
  const t0 = performance.now(), r = rng(ID % 65521), n0 = S.count;
  const parts = SECT.map((sp) => {
    const q = raw.reduce((best, b) => { const c = centroid(ringPts(b.p)), d = Math.hypot(c[0] - sp.c[0], c[1] - sp.c[1]); return d < best.d ? { b, d } : best; }, { b: null, d: 12 }).b;
    return q && { ...sp, ring: straighten(ringPts(q.p)) };
  }).filter(Boolean);
  if (!parts.length) return null;
  const all = parts.flatMap((p) => p.ring), hs = all.map((p) => heightAt(p[0], p[1]));
  const gLo = Math.min(...hs), gHi = Math.max(...hs), yF = gHi + 0.15, Y = (h) => yF + h, gB = gLo - 0.6;
  const B = { panel: new MB(), wall: new MB(), stone: new MB(), det: new MB(), lit: new MB(), glass: new MB() };
  const P = B.panel, W = B.wall, ST = B.stone, D = B.det;
  const UVP = [2.3, 3.0], UVW = [2.5, 2.5], UVS = [2.0, 2.0];
  let nWin = 0, nLog = 0, nAc = 0;
  for (const p of parts) {
    p.fy = (k) => Y(GF + (k - 1) * FH);
    p.roof = p.fy(p.nf); p.top = p.roof + PARA;
    p.faces = ringFaces(p.ring).filter((f) => f.L > 0.3);
  }
  // a face standing against another part: the lower of the two stays hidden, the taller shows above the other's roof
  const against = (f, self) => {
    const m = at(f, f.L / 2, 0);
    for (const q of parts) {
      if (q === self) continue;
      for (const g of q.faces) {
        if (g.nx * f.nx + g.nz * f.nz > -0.95) continue;
        const dx = m[0] - g.ax, dz = m[2] - g.az, s = dx * g.ux + dz * g.uz, o = dx * g.nx + dz * g.nz;
        if (Math.abs(o) < 0.8 && s > -0.5 && s < g.L + 0.5) return q;
      }
    }
    return null;
  };
  const glass = () => GLASS[(r() * GLASS.length) | 0];

  for (const p of parts) {
    const { fy, roof, top, nf } = p;
    for (const f of p.faces) {
      const nb = against(f, p);
      if (nb) { // the step of the cascade: plain panels, cornice and parapet over the neighbour's roof
        if (nb.top >= top - 0.1) continue;
        skin(P, f, nb.roof, roof, CREAM, UVP);
        cornice(f, roof, top);
        continue;
      }
      const spec = SECT.find((s) => s.n === p.n).faces.find((s) => s.n[0] * f.nx + s.n[1] * f.nz > 0.9);
      // bays from the pattern, laid from the `from` end (else from s = 0)
      const tk = (spec?.pat ?? 'b').split(' '), fixed = tk.reduce((a, t) => a + (TW[t] ?? 0), 0), nfill = tk.filter((t) => !(t in TW)).length;
      let fill = nfill ? (f.L - fixed) / nfill : 0, sc = 1;
      if (fill < 0.3) { sc = f.L / (fixed + nfill * 0.3); fill = 0.3 * sc; }
      const flip = spec?.from && Math.hypot(at(f, f.L, 0)[0] - spec.from[0], at(f, f.L, 0)[2] - spec.from[1]) < Math.hypot(f.ax - spec.from[0], f.az - spec.from[1]);
      let v = nfill ? 0 : (f.L - fixed * sc) / 2;
      const bays = tk.map((t) => { const w = t in TW ? TW[t] * sc : fill, a = flip ? f.L - v - w : v; v += w; return { t, s0: a, s1: a + w, c: a + w / 2 }; });
      // the drive-through under section 2
      let pass = null;
      if (p.pass) { const s = (p.pass[0] - f.ax) * f.ux + (-1678 - f.az) * f.uz; if (Math.abs(f.nz) > 0.9) pass = [s - p.pass[1] / 2, s + p.pass[1] / 2]; }
      const free = (s0, s1) => s0 > 0.2 && s1 < f.L - 0.2 && !(pass && s1 > pass[0] - 0.4 && s0 < pass[1] + 0.4);
      // ground storey: shop fronts in dark stone; a wide glazed lobby under the bow
      const gf = [];
      for (const b of bays) {
        const shop = (s0, s1, extra) => free(s0, s1) && gf.push({ s0, s1, y0: Y(0.15), y1: Y(3.55), tr: Y(2.75), glass: SHOP, lit: r() < 0.55, frame: FRAME, rev: MARBLE, dep: 0.25, pitch: 1.1, ...extra });
        if (b.t === 'w') shop(b.c - 0.95, b.c + 0.95);
        else if (b.t === 'L') { shop(b.s0 + 0.55, b.s0 + 3.1); shop(b.s1 - 3.1, b.s1 - 0.55); }
        else if (b.t === 'B') shop(b.c - 2.8, b.c + 2.8, { lit: true, pitch: 1.4 });
      }
      if (spec?.canopy && gf.length) { const mid = gf.reduce((a, q) => (Math.abs((q.s0 + q.s1) / 2 - f.L / 2) < Math.abs((a.s0 + a.s1) / 2 - f.L / 2) ? q : a)); Object.assign(mid, { door: true, glass: '#3a3634', lit: true }); }
      f.cuts = [...gf];
      if (pass) f.cuts.push({ s0: pass[0], s1: pass[1], y0: gB, y1: Y(3.9), pass: true });
      // upper floors
      for (let k = 1; k < nf; k++) {
        const y = fy(k);
        for (const b of bays) {
          if (b.t === 'w') { f.cuts.push({ s0: b.c - 0.72, s1: b.c + 0.72, y0: y + 0.8, y1: y + 2.55, glass: glass(), lit: r() < 0.3, frame: FRAME, rev: '#e9e4d6', dep: 0.22, pitch: 0.75, tr: y + 2.05 }); nWin++; }
          if (b.t === 'L') for (const [a, c] of [[b.s0 + 0.45, b.s0 + 3.05], [b.s1 - 3.05, b.s1 - 0.45]]) { f.cuts.push({ s0: a, s1: c, y0: y + 0.02, y1: y + FH - 0.3, glass: glass(), lit: r() < 0.3, frame: FRAME, rev: WHITE, dep: 0.35, pitch: 0.87, tr: y + 1.95 }); nLog++; }
        }
      }
      skin(ST, f, gB, Y(GF), MARBLE, UVS);
      skin(P, f, Y(GF), roof, CREAM, UVP);
      for (const q of f.cuts) if (!q.pass) hole(B, f, q);
      // the blank part of a gable: white render, the top two storeys in panels
      for (const b of bays) if (b.t === 'g') { W.setColor(WHITE); rect(W, f, b.s0, b.s1, Y(GF), fy(nf - 2), 0.015, UVW); }
      // grey band over the shops; light grey bands over the 3rd and 6th floors on the panel bays
      D.setColor(GREY); box(D, f, -0.02, f.L + 0.02, Y(GF) - 0.3, Y(GF) + 0.1, 0, 0.14, 'ftu');
      for (const b of bays) if (b.t !== 'L' && b.t !== 'B' && b.t !== 'g') for (const k of [4, 7]) if (k < nf) { D.setColor('#d6d8d6'); box(D, f, b.s0, b.s1, fy(k) - 0.18, fy(k) + 0.08, 0, 0.04, 'ft'); }
      // AC baskets beside the windows, alternating sides per bay
      bays.filter((b) => b.t === 'w').forEach((b, i) => {
        const sd = i % 2 ? -1 : 1, c = b.c + sd * 0.72;
        for (let k = 1; k < nf; k++) { D.setColor('#f6f6f3'); box(D, f, c - 0.42, c + 0.42, fy(k) + 0.35, fy(k) + 0.9, 0, 0.42, 'ftlr'); nAc++; }
      });
      // loggia stacks: a white frame of pilasters standing proud, a white slab band per floor
      for (const b of bays) {
        if (b.t !== 'L') continue;
        W.setColor(WHITE);
        for (const [a, c] of [[b.s0, b.s0 + 0.45], [b.c - 0.25, b.c + 0.25], [b.s1 - 0.45, b.s1]]) box(W, f, a, c, Y(GF) + 0.1, top + 0.3, 0, 0.22, 'flrt', UVW);
        for (let k = 1; k <= nf; k++) { const y = k < nf ? fy(k) + FH - 0.3 : roof; box(W, f, b.s0 + 0.45, b.s1 - 0.45, y, k < nf ? y + 0.3 : top + 0.35, 0, 0.16, 'ftu', UVW); }
        D.setColor(BROWN); box(D, f, b.s0 - 0.03, b.s1 + 0.03, top + 0.3, top + 0.43, -0.05, 0.27, 'ftlr');
        solid(S, f, b.s0, b.s1, 0, 0.22, Y(GF), top + 0.4);
      }
      cornice(f, roof, top);
      if (spec?.canopy) canopy(f, f.L / 2);
      for (const b of bays) if (b.t === 'B') bow(f, b, p);
      if (pass) passage(f, pass, p);
    }
    // roof: membrane, a lift and stair head
    D.setColor('#4d4c4a'); D.fill(p.ring, [], roof + 0.03, true);
    const [cx, cz] = centroid(p.ring);
    P.setColor(CREAM); P.box(cx - 2.2, roof, cz - 1.8, cx + 2.2, roof + 3.0, cz + 1.8, 1 | 2 | 4 | 8 | 16);
    D.setColor(GREY); D.box(cx - 2.25, roof + 2.2, cz - 1.85, cx + 2.25, roof + 3.15, cz + 1.85, 63);
    S.prism([cx - 2.2, cz - 1.8, cx + 2.2, cz - 1.8, cx + 2.2, cz + 1.8, cx - 2.2, cz + 1.8], roof, roof + 3.15, 0, 0, 'equipment');
    // collision: the whole part, but section 2 leaves its drive-through open under a lintel
    if (!p.pass) S.prism(p.ring.flat(), gB, top, 0, 0, 'wall');
    else {
      const f = p.faces.find((g) => g.nz < -0.9), depth = Math.max(...p.ring.map(([x, z]) => -((x - f.ax) * f.nx + (z - f.az) * f.nz)));
      const s = (p.pass[0] - f.ax) * f.ux + (-1678 - f.az) * f.uz, h = p.pass[1] / 2;
      solid(S, f, -0.1, s - h, -depth, 0, gB, top); solid(S, f, s + h, f.L + 0.1, -depth, 0, gB, top);
      solid(S, f, s - h, s + h, -depth, 0, Y(3.9), top);
    }
  }

  // brown cornice band, light grey parapet with its coping
  function cornice(f, roof, top) {
    D.setColor(BROWN); box(D, f, -0.04, f.L + 0.04, roof - 0.1, roof + 0.45, 0, 0.12, 'ftlru');
    D.setColor('#b7bbbe'); box(D, f, 0, f.L, roof + 0.45, top, -0.22, 0, 'fbt');
    D.setColor('#9fa3a6'); box(D, f, -0.02, f.L + 0.02, top, top + 0.06, -0.26, 0.04, 'ftlr');
    if (f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], top, f.nx, f.nz); }
  }

  // a flat white canopy on four round columns over a yard door
  function canopy(f, c) {
    const w = 7.4, d = 2.5, y0 = Y(GF) - 0.65, y1 = Y(GF) - 0.3;
    D.setColor(WHITE); box(D, f, c - w / 2, c + w / 2, y0, y1, 0, d, 'ftlru');
    for (let i = 0; i < 4; i++) {
      const s = c - w / 2 + 0.4 + (w - 0.8) * i / 3, q = at(f, s, 0, d - 0.35);
      D.cyl(q[0], Y(0) - 0.2, q[2], 0.17, 0.17, y0 - Y(0) + 0.2, 10, false);
      S.cyl(q[0], q[2], Y(0) - 0.2, y0, 0.17, 0.17, 'pole');
    }
    solid(S, f, c - w / 2, c + w / 2, 0, d, y0, y1, 'awning', 1);
  }

  // the corner bow: a shallow glazed arc from the first floor to the roof, a slab band per floor, its own parapet
  // two metres over the roof (where the developer's letters stand), on two white columns over the lobby
  function bow(f, b, p) {
    const c = b.s1 - b.s0, h = 1.8, R = (c * c / 4 + h * h) / (2 * h), oc = h - R, th = Math.asin(c / 2 / R), n = 6;
    const pt = (a, o = 0) => at(f, b.c + (R + o) * Math.sin(a), 0, oc + (R + o) * Math.cos(a));
    const segs = [];
    for (let i = 0; i < n; i++) {
      const a0 = -th + 2 * th * i / n, a1 = -th + 2 * th * (i + 1) / n, am = (a0 + a1) / 2;
      const p0 = pt(a0), p1 = pt(a1), nx = f.ux * Math.sin(am) + f.nx * Math.cos(am), nz = f.uz * Math.sin(am) + f.nz * Math.cos(am);
      segs.push(face([p0[0], p0[2]], [p1[0], p1[2]], nx, nz));
    }
    const yb = Y(GF) - 0.3, yt = p.roof + 2.0;
    for (const g of segs) {
      for (let k = 1; k < p.nf; k++) {
        const y = p.fy(k), G = r() < 0.35 ? B.lit : B.glass;
        G.setColor(glass()); rect(G, g, 0, g.L, y + 0.25, y + FH - 0.05, -0.06);
        D.setColor(FRAME); rect(D, g, 0, 0.07, y + 0.25, y + FH - 0.05, -0.02); rect(D, g, 0, g.L, y + 1.95, y + 2.02, -0.02);
        D.setColor(WHITE); box(D, g, -0.02, g.L + 0.02, y - 0.05, y + 0.25, -0.05, 0.1, 'ftu');
      }
      P.setColor(CREAM); rect(P, g, 0, g.L, p.roof - 0.05, yt - 0.5, 0, UVP);
      D.setColor(BROWN); box(D, g, -0.01, g.L + 0.01, yt - 0.5, yt, 0, 0.1, 'ft');
      D.setColor(WHITE); box(D, g, -0.01, g.L + 0.01, yt, yt + 0.08, -0.15, 0.14, 'ft');
      D.setColor(WHITE); box(D, g, -0.01, g.L + 0.01, yb, Y(GF) - 0.05, 0, 0.1, 'ft');
    }
    // under- and top sides of the arc, closed against the wall
    const arc = [];
    for (let i = 0; i <= n; i++) { const q = pt(-th + 2 * th * i / n); arc.push([q[0], q[2]]); }
    D.setColor(WHITE); D.fill(arc, [], yb, false);
    D.setColor('#4d4c4a'); D.fill(arc, [], yt, true);
    D.setColor(WHITE);
    for (const s of [-0.62, 0.62]) { const q = pt(s * th, -0.35); D.cyl(q[0], Y(0) - 0.2, q[2], 0.16, 0.16, yb - Y(0) + 0.2, 10, false); S.cyl(q[0], q[2], Y(0) - 0.2, yb, 0.16, 0.16, 'pole'); }
    // the white pier up the middle of the bow, splitting it into two glazed halves as built
    { const q = pt(0, 0.04), g = face([q[0] - f.ux * 0.3, q[2] - f.uz * 0.3], [q[0] + f.ux * 0.3, q[2] + f.uz * 0.3], f.nx, f.nz);
      W.setColor(WHITE); box(W, g, 0, g.L, Y(GF) - 0.3, p.roof, -0.2, 0.08, 'flr', UVW); }
    S.prism(arc.flat(), yb, yt + 0.1, 0, 0, 'wall', 1);
  }

  // the drive-through: stone sides and a white soffit, across the depth of section 2
  function passage(f, [s0, s1], p) {
    if (f.nz > -0.9) return; // built once, from the street face
    const depth = Math.max(...p.ring.map(([x, z]) => -((x - f.ax) * f.nx + (z - f.az) * f.nz))), yt = Y(3.9);
    ST.setColor(MARBLE);
    quad(ST, at(f, s0, gB, 0), at(f, s0, gB, -depth), at(f, s0, yt, -depth), at(f, s0, yt, 0), f.U);
    quad(ST, at(f, s1, gB, 0), at(f, s1, gB, -depth), at(f, s1, yt, -depth), at(f, s1, yt, 0), [-f.ux, 0, -f.uz]);
    D.setColor('#e4e2dc'); quad(D, at(f, s0, yt, 0), at(f, s1, yt, 0), at(f, s1, yt, -depth), at(f, s0, yt, -depth), [0, -1, 0]);
    D.setColor(GREY); box(D, f, s0 - 0.25, s1 + 0.25, yt, yt + 0.3, 0, 0.1, 'ftu');
  }

  const M = {
    panel: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.75 }),
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneTex(r), vertexColors: true, roughness: 0.35, metalness: 0.05 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35 }),
  };
  const out = finish(root, 'olimp', B, M, { shade: ['panel', 'wall', 'stone', 'det'] });
  console.log(`[cherkasy] ZhK Olimp: ${parts.length} sections, ${nWin} windows, ${nLog} loggias, ${nAc} AC baskets, floor ${yF.toFixed(1)} m (ground ${gLo.toFixed(1)}–${gHi.toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const boxes = parts.map((p) => bboxOf(p.ring));
  return {
    footprints: parts.map((p) => ({ poly: p.ring, h: p.top - gLo, kind: 'apt', name: 'ЖК «Олімп»' })),
    clear: (x, z) => boxes.some((b) => x > b.x0 - 3 && x < b.x1 + 3 && z > b.z0 - 3 && z < b.z1 + 3),
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
