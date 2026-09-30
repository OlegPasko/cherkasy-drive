// OWNER: cherkasy. «Будинок торгівлі», бульвар Шевченка, 207 (OSM way 104299486): the department store opened in 1979
// (a Hiprotorg re-use of the Riga Museum of the Revolution box), re-clad in 2020–21. Built after the photos on
// novobudovy.com / malls.rent (2021+), the 2019–20 news photos (zmi.ck.ua, procherk.info) and the 1980s postcard
// (provce.ck.ua): a closed two-storey box on a glazed ground floor. Up top, cream composite panels in 3 x 1.2 m rows
// with four LED lines along the joints (they glow lavender at night), and at the corner by KFC a surviving patch of the
// original faceted 1979 panels (hipped pyramids, now painted white) wrapping round onto the side. Under it a dark
// fascia runs the boulevard front and turns the corner: a black band with «БУДИНОК ТОРГІВЛІ» in wide white capitals
// and the square БТ badge, dark grey panels over it, a soffit with downlights. The ground floor has shop windows in
// black frames between orange piers, a granite plinth that grows toward the north end as the pavement falls away,
// three glazed entrances with granite steps (the main one recessed at the north end). The side and yard walls are
// grey render below the panels, with roller shutters and service doors; flat bitumen roof with a coped parapet, a
// stair house, a glazed lantern over the escalators, air handlers and condensers; a paved forecourt out to the
// boulevard walk. Shop windows, lantern, sign, soffit lights and LED lines light up at night.
// Also the low fast-food pavilion against the north side (OSM 400811807, a generic 4-storey block before), kept
// unbranded: a timber-clad cube on the boulevard corner over a dark one-storey glazed body, a drive-through eave.
//   TORHIVLI_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildTorhivli({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The footprint is a map-aligned rectangle: the boulevard front looks to -x (north end at small z, where KFC abuts
// the side wall), the yard to +x. Each side is laid out in a side frame: s metres to the viewer's right, y up,
// o outward from the wall line.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng, area2 } from './geo.js';

const OSM_ID = 104299486, PAV_ID = 400811807;
export const TORHIVLI_SKIP = new Set([OSM_ID, PAV_ID]);

// heights over the ground floor: soffit, top of the lettering band, top of the dark tier, roof, parapet
const H_SOF = 4.0, H_BAND = 5.3, H_TIER = 7.3, H_ROOF = 12.9, PARA = 0.45;
const RECESS = 0.35, BAND_O = 0.5, TIER_O = 0.35;   // shopfront line behind the wall line, fascia projections
const CELL = 1.4, PANEL = [12, 4.8];                // faceted 1979 panel; cream panel texture repeat (4 x 4 panels)
const CORNER = 7.4;                                 // the open bit of the north side before KFC
const BLACK = '#18191b', FRAME = '#202224', ORANGE = '#d8661c', GRANITE = '#6a6b6a', RENDER = '#a19e97';
const Y = [0, 1, 0], NY = [0, -1, 0];

// ------------------------------------------------------------------------------------------------ textures
// cream composite cassettes 3 x 1.2 m: each a hair apart in tone, dark open joints, a faint top-lit edge
const panelTex = (r) => canvasTex(512, 256, (g, w, h) => {
  const pw = w / 4, ph = h / 4;
  g.fillStyle = '#6f6d68'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const t = 236 + Math.round(r() * 10);
    g.fillStyle = `rgb(${t},${t - 4},${t - 14})`; g.fillRect(i * pw + 1.5, j * ph + 2, pw - 3, ph - 4);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(i * pw + 1.5, j * ph + 2, pw - 3, 2);
    g.fillStyle = 'rgba(90,80,60,0.05)'; g.fillRect(i * pw + 1.5, j * ph + ph * 0.6, pw - 3, ph * 0.4 - 2);
  }
});
// the fascia's dark grey cassettes, 1.6 m wide with a vertical joint and a horizontal one at mid height
const darkTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#3a3d41'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 64) { g.fillStyle = '#1d1e20'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 2, 0, 30, h); }
  g.fillStyle = '#26282b'; g.fillRect(0, h / 2 - 1, w, 2);
});
// forecourt pavers: light grey concrete blocks 0.2 x 0.4 m in running bond, 3.2 m per repeat, a darker line every 3.2 m
const paveTex = (r) => canvasTex(512, 512, (g, w) => {
  const bw = w / 8, bh = w / 16;
  g.fillStyle = '#8c8a86'; g.fillRect(0, 0, w, w);
  for (let j = 0; j < 16; j++) for (let i = -1; i < 8; i++) {
    const v = j === 0 ? 128 + r() * 8 : 150 + r() * 14, x = i * bw + (j & 1) * bw / 2;
    g.fillStyle = `rgb(${v | 0},${(v - 2) | 0},${(v - 6) | 0})`; g.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
  }
});
// sign atlas 4096 x 512. Rows 0..256: the name in spaced capitals on the band's own black, opaque, so its mips blend
// to grey instead of eroding thin strokes (the І) the way a cut-out does at a glancing angle; the quad keeps the
// row's 4096 : 224 aspect, so the glyphs are not stretched. Rows 256..512, left square: the БТ badge, cut out.
const SIGN_ROW = 224;
const signTex = () => canvasTex(4096, 512, (g) => {
  g.clearRect(0, 0, 4096, 512);
  g.fillStyle = BLACK; g.fillRect(0, 0, 4096, 256);
  g.fillStyle = '#ffffff'; g.font = 'bold 150px Arial, Helvetica, sans-serif'; g.textBaseline = 'alphabetic';
  const chars = [...'БУДИНОК ТОРГІВЛІ'], widths = chars.map((c) => (c === ' ' ? 90 : g.measureText(c).width));
  const gap = (4096 - 2 * 70 - widths.reduce((a, b) => a + b, 0)) / (chars.length - 1); // spread as on the fascia
  let x = 70;
  g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.lineJoin = 'round'; // a stroke round each glyph: heavier stems survive the mips
  chars.forEach((c, i) => { if (c !== ' ') { g.fillText(c, x, 166); g.strokeText(c, x, 166); } x += widths[i] + gap; }); // caps ~56..168 of 224
  // badge: a square frame with the Б and Т monogram locked together
  g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.strokeRect(20, 276, 216, 216);
  g.lineWidth = 18; g.beginPath();
  g.moveTo(168, 320); g.lineTo(76, 320); g.lineTo(76, 452); g.lineTo(152, 452); g.lineTo(152, 384); g.lineTo(76, 384);
  g.moveTo(116, 352); g.lineTo(200, 352); g.moveTo(184, 352); g.lineTo(184, 452);
  g.stroke();
}, { repeat: false, aniso: 16 });
// timber-look cladding of the pavilion cube: vertical boards 14 cm wide, 2.24 m per repeat, each a shade apart
const woodTex = (r) => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#4a3322'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) {
    const k = 0.85 + r() * 0.3;
    g.fillStyle = `rgb(${(168 * k) | 0},${(116 * k) | 0},${(74 * k) | 0})`; g.fillRect(i * 16 + 1, 0, 14, h);
    g.fillStyle = 'rgba(60,35,20,0.12)'; g.fillRect(i * 16 + 3 + r() * 8, 0, 1, h);
  }
});

// ------------------------------------------------------------------------------------------------ side frames
// side with outward normal (nx, nz) through the wall line; s = 0 at its left end seen from outside
function side(X0, Z0, X1, Z1, nx, nz) {
  const rx = nz, rz = -nx;
  const ax = nx ? (nx < 0 ? X0 : X1) : rx > 0 ? X0 : X1, az = nz ? (nz < 0 ? Z0 : Z1) : rz > 0 ? Z0 : Z1;
  return { nx, nz, rx, rz, ax, az, w: nx ? Z1 - Z0 : X1 - X0, N: [nx, 0, nz] };
}
const pt = (f, s, y, o = 0) => [f.ax + f.rx * s + f.nx * o, y, f.az + f.rz * s + f.nz * o];
// world box bit for a direction in the side frame (MB.box: 1 +x, 2 -x, 4 +y, 8 -y, 16 +z, 32 -z)
const dirBit = (vx, vz) => (vx > 0.5 ? 1 : vx < -0.5 ? 2 : vz > 0.5 ? 16 : 32);
// box in a side frame; faces: 'f' front (out), 'b' back, 'l' s0 end, 'r' s1 end, 't' top, 'u' underside
function sbox(D, f, s0, s1, y0, y1, o0, o1, faces = 'fblrtu') {
  const a = pt(f, s0, y0, o0), b = pt(f, s1, y1, o1);
  let m = 0;
  for (const c of faces) {
    m |= c === 'f' ? dirBit(f.nx, f.nz) : c === 'b' ? dirBit(-f.nx, -f.nz) : c === 'l' ? dirBit(-f.rx, -f.rz)
      : c === 'r' ? dirBit(f.rx, f.rz) : c === 't' ? 4 : 8;
  }
  D.box(a[0], a[1], a[2], b[0], b[1], b[2], m);
}
// flat panel parallel to the wall at depth o, facing out; uvM = metres per texture repeat, uy0 = height of v = 0
// (corners in s, y order run counter-clockwise seen from outside, so the quad faces out)
function uvRect(D, f, s0, s1, y0, y1, o, ua, ub, va, vb) {
  const [nx, , nz] = f.N, first = D.v;
  for (const [s, y, u, v] of [[s0, y0, ua, va], [s1, y0, ub, va], [s1, y1, ub, vb], [s0, y1, ua, vb]]) {
    const q = pt(f, s, y, o); D.vert(q[0], q[1], q[2], nx, 0, nz, u, v);
  }
  D.quad(first, first + 1, first + 2, first + 3);
}
const sheet = (D, f, s0, s1, y0, y1, o, uvM, uy0 = 0) => (uvM
  ? uvRect(D, f, s0, s1, y0, y1, o, s0 / uvM[0], s1 / uvM[0], (y0 - uy0) / uvM[1], (y1 - uy0) / uvM[1])
  : uvRect(D, f, s0, s1, y0, y1, o, 0, 1, 0, 1));
// textured quad with an atlas rectangle [u0, v0, u1, v1] given in canvas fractions (v runs down the canvas)
const decalQuad = (D, f, s0, s1, y0, y1, o, [u0, v0, u1, v1]) => uvRect(D, f, s0, s1, y0, y1, o, u0, u1, 1 - v1, 1 - v0);
// one hipped facet unit of the 1979 cladding: a horizontal ridge standing proud of the wall, four sloping faces
function facetUnit(D, f, s0, y0, depth) {
  const s1 = s0 + CELL, y1 = y0 + CELL, ym = y0 + CELL / 2, r0 = s0 + CELL * 0.3, r1 = s1 - CELL * 0.3;
  const A = pt(f, s0, y0), B = pt(f, s1, y0), C = pt(f, s1, y1), E = pt(f, s0, y1), R0 = pt(f, r0, ym, depth), R1 = pt(f, r1, ym, depth);
  for (const poly of [[E, C, R1, R0], [A, B, R1, R0], [A, E, R0], [B, C, R1]]) {
    const [p, q, t] = poly, u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [t[0] - p[0], t[1] - p[1], t[2] - p[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1, sg = n[0] * f.nx + n[2] * f.nz < 0 ? -1 : 1;
    n = n.map((c) => (c * sg) / len);
    D.face(poly, n);
  }
}
// collision prism over an s / o rectangle of a side
function sprism(S, f, s0, s1, o0, o1, y0, y1, kind, flags = 0) {
  const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
  if (area2(Q) < 0) Q.reverse();
  S.prism(Q.flat(), y0, y1, 0, 0, kind, flags);
}

// ------------------------------------------------------------------------------------------------ build
export function buildTorhivli({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521);
  const ring = ringPts(b.p);
  const X0 = Math.min(...ring.map((p) => p[0])), X1 = Math.max(...ring.map((p) => p[0]));
  const Z0 = Math.min(...ring.map((p) => p[1])), Z1 = Math.max(...ring.map((p) => p[1]));
  const fW = side(X0, Z0, X1, Z1, -1, 0), fN = side(X0, Z0, X1, Z1, 0, -1), fE = side(X0, Z0, X1, Z1, 1, 0), fS = side(X0, Z0, X1, Z1, 0, 1);
  const sides = [fW, fN, fE, fS];

  // the ground floor sits just over the highest point of the boulevard pavement; the north end then stands on steps
  let gHi = -Infinity, gLo = Infinity;
  for (let s = 0; s <= fW.w; s += 3) { const p = pt(fW, s, 0, 3); gHi = Math.max(gHi, heightAt(p[0], p[2])); }
  for (const f of sides) for (let s = 0; s <= f.w; s += 6) { const p = pt(f, s, 0, 1); gLo = Math.min(gLo, heightAt(p[0], p[2])); }
  const yF = gHi + 0.22, gBase = gLo - 0.5, yRoof = yF + H_ROOF, yTop = yRoof + PARA;
  const yC = yF + H_TIER; // bottom of the cream box on the fascia sides (v = 0 of the panel texture everywhere)
  const groundAt = (f, s, o) => { const p = pt(f, s, 0, o); return heightAt(p[0], p[2]); };

  const B = { pave: new MB(), panel: new MB(), dark: new MB(), wood: new MB(), det: new MB(), lit: new MB(), led: new MB(), sign: new MB(), badge: new MB() };
  const D = B.det;
  let doors = 0, bays = 0;

  // ---- ground floor of the boulevard front and the open corner of the north side: shop windows, piers, entrances
  // shopfront: glass in black frames, a transom at 3 m, mullions ~1.5 m apart
  const glaze = (f, s0, s1, yb, yt, o, yTr, pitch = 1.5) => {
    B.lit.setColor('#3e4848'); sheet(B.lit, f, s0, s1, yb, yt, o - 0.03);
    D.setColor(FRAME);
    sbox(D, f, s0, s1, yb - 0.02, yb + 0.08, o - 0.06, o + 0.04, 'ftlr');
    if (yTr) sbox(D, f, s0, s1, yTr, yTr + 0.09, o - 0.06, o + 0.04, 'ftu');
    sbox(D, f, s0, s1, yt - 0.1, yt, o - 0.06, o + 0.04, 'fu');
    const n = Math.max(1, Math.round((s1 - s0) / pitch));
    for (let i = 0; i <= n; i++) { const m = s0 + (s1 - s0) * i / n; sbox(D, f, m - 0.045, m + 0.045, yb + 0.08, yt - 0.1, o - 0.06, o + 0.04, 'flr'); }
  };
  const shop = (f, s0, s1, o, yb) => { glaze(f, s0, s1, yb, yF + H_SOF, o, yF + 3.0); bays++; };
  // entrance: glass doors set back in a dark reveal, a landing and granite steps down to the pavement
  const entrance = (f, s0, s1, depth) => {
    const o = -RECESS - depth, yt = yF + H_SOF;
    D.setColor('#2b2d30');
    sbox(D, f, s0, s0 + 0.12, yF, yt, o, -RECESS, 'fr'); sbox(D, f, s1 - 0.12, s1, yF, yt, o, -RECESS, 'fl');
    if (depth > 0.3) { D.setColor('#26282a'); D.face([pt(f, s0, yt - 0.01, o), pt(f, s1, yt - 0.01, o), pt(f, s1, yt - 0.01, -RECESS), pt(f, s0, yt - 0.01, -RECESS)], NY); }
    shop(f, s0 + 0.12, s1 - 0.12, o, yF + 0.02);
    D.setColor('#9ea3a6'); // door leaves: steel stiles and push bars
    const n = Math.max(2, Math.round((s1 - s0) / 1.9) * 2);
    for (let i = 1; i < n; i++) { const m = s0 + (s1 - s0) * i / n; sbox(D, f, m - 0.03, m + 0.03, yF + 1.0, yF + 1.06, o, o + 0.1, 'ftu'); }
    // landing from the doors to the wall line, then steps to the pavement in front
    const gFoot = Math.min(groundAt(f, (s0 + s1) / 2, 2), groundAt(f, s0, 2), groundAt(f, s1, 2));
    const nStep = Math.max(1, Math.ceil((yF - gFoot) / 0.16)), rise = (yF - gFoot) / nStep, run = 0.34;
    D.setColor(GRANITE); sbox(D, f, s0 - 0.4, s1 + 0.4, gBase, yF, o, 0.6, 'flrt');
    S.prism(rectPts(f, s0 - 0.4, s1 + 0.4, o, 0.6), gBase, yF, 0, 0, 'step');
    for (let k = 1; k <= nStep; k++) {
      const top = yF - rise * k, oa = 0.6 + run * (k - 1), ob = oa + run;
      D.setColor(k & 1 ? '#727372' : '#6b6c6b'); sbox(D, f, s0 - 0.4 + 0.02 * k, s1 + 0.4 - 0.02 * k, gBase, top, oa, ob, 'flrt');
      if (top > gFoot + 0.02) S.prism(rectPts(f, s0 - 0.4, s1 + 0.4, oa, ob), gBase, top, 0, 0, 'step');
    }
    doors++;
  };
  const rectPts = (f, s0, s1, o0, o1) => {
    const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    return (area2(Q) < 0 ? Q.reverse() : Q).flat();
  };
  // pier between windows, orange (the 2021 cladding) or dark at the corner, standing on the granite plinth
  const pier = (f, s0, s1, col, oOut = -RECESS + 0.12) => {
    D.setColor(col); sbox(D, f, s0, s1, yF + 0.12, yF + H_SOF, -RECESS - 0.1, oOut, 'flr');
  };
  const plinth = (f, s0, s1) => { D.setColor(GRANITE); sbox(D, f, s0, s1, gBase, yF + 0.12, -RECESS - 0.1, -RECESS + 0.18, 'ft'); };

  // boulevard front: the corner column, the main entrance, then 7.2 m bays (orange pier + window), entrances in bay 4
  // and at the south end
  const c0 = RECESS + 0.9;
  D.setColor('#2e3033'); D.box(X0 + RECESS - 0.15, gBase, Z0 + RECESS - 0.15, X0 + c0, yF + H_SOF, Z0 + c0, 2 | 32);
  { let s = c0; pier(fW, s, s + 0.4, '#2e3033'); plinth(fW, s, s + 0.4); s += 0.4;
    entrance(fW, s, s + 6.4, 1.3); s += 6.4;
    for (let i = 0; i < 9; i++) {
      pier(fW, s, s + 2.6, ORANGE); plinth(fW, s, s + 2.6); s += 2.6;
      if (i === 4 || i === 8) entrance(fW, s, s + 4.6, 0.6); else { shop(fW, s, s + 4.6, -RECESS, yF + 0.12); plinth(fW, s, s + 4.6); }
      s += 4.6;
    }
    pier(fW, s, fW.w, ORANGE, 0); plinth(fW, s, fW.w);
  }
  // the open corner of the north side: one window and an orange pier closing against KFC
  { const s1 = fN.w - c0, s0 = fN.w - CORNER;
    pier(fN, s0, s0 + 1.0, ORANGE, 0); plinth(fN, s0, s0 + 1.0);
    shop(fN, s0 + 1.0, s1 - 0.4, -RECESS, yF + 0.12); plinth(fN, s0 + 1.0, s1 - 0.4);
    pier(fN, s1 - 0.4, s1, '#2e3033'); plinth(fN, s1 - 0.4, s1);
  }

  // ---- fascia: black lettering band over dark grey cassettes, wrapping the north-west corner; soffit with downlights
  const fascia = [[fW, 0, fW.w, 'frt'], [fN, fN.w - CORNER, fN.w + BAND_O, 'flrt']];
  for (const [f, s0, s1, faces] of fascia) {
    D.setColor(BLACK); sbox(D, f, s0, s1, yF + H_SOF, yF + H_BAND, 0, BAND_O, faces);
    const t1 = f === fN ? fN.w + TIER_O : s1;
    B.dark.setColor('#ffffff'); sheet(B.dark, f, s0, t1, yF + H_BAND, yC, TIER_O, [6.4, 2.0], yF + H_BAND);
    D.setColor('#34373a'); sbox(D, f, s0, t1, yF + H_BAND, yC, 0, TIER_O, f === fN ? 'lrt' : 'rt');
    D.setColor('#bdbfbf'); sbox(D, f, s0, t1, yC - 0.05, yC, TIER_O, TIER_O + 0.04, 'ftu'); // metal drip at the top
    // soffit, from the shopfront to the band's face
    const so = s1, sa = f === fN ? s0 : RECESS;
    D.setColor('#2a2b2d'); D.face([pt(f, sa, yF + H_SOF, -RECESS), pt(f, so, yF + H_SOF, -RECESS), pt(f, so, yF + H_SOF, BAND_O), pt(f, sa, yF + H_SOF, BAND_O)], NY);
    B.lit.setColor('#d8d4c8');
    for (let s = sa + 1.8; s < so - 1; s += 3.6) sbox(B.lit, f, s - 0.18, s + 0.18, yF + H_SOF - 0.03, yF + H_SOF, 0.0, 0.3, 'u');
    sprism(S, f, s0, s1, -RECESS, BAND_O, yF + H_SOF, yC, 'wall', 1);
  }
  // the name on the band and the БТ badge on the tier by the corner
  { const hS = H_BAND - H_SOF - 0.16, wS = hS * 4096 / SIGN_ROW, s0 = 9.8; // the row's own aspect: no stretch
    decalQuad(B.sign, fW, s0, s0 + wS, yF + H_SOF + 0.08, yF + H_SOF + 0.08 + hS, BAND_O + 0.012, [0, 0, 1, SIGN_ROW / 512]); }
  decalQuad(B.badge, fW, 1.4, 3.1, yF + H_BAND + 0.15, yF + H_BAND + 1.85, TIER_O + 0.012, [0, 256 / 512, 256 / 4096, 1]);

  // ---- the cream box: panels, the faceted 1979 patch at the north-west corner, LED lines
  const pc = '#ffffff';
  const panels = (f, s0, s1, y0, y1) => { if (s1 > s0 + 1e-3 && y1 > y0 + 1e-3) { B.panel.setColor(pc); sheet(B.panel, f, s0, s1, y0, y1, 0, PANEL, yC); } };
  const facetTop = yC + 4 * CELL;
  // boulevard: 6 columns of facets from the corner; north: 5 columns up to the corner
  panels(fW, 6 * CELL, fW.w, yC, yTop); panels(fW, 0, 6 * CELL, facetTop, yTop);
  panels(fN, 0, fN.w - CORNER, yF + H_SOF, yTop); panels(fN, fN.w - CORNER, fN.w - 5 * CELL, yC, yTop); panels(fN, fN.w - 5 * CELL, fN.w, facetTop, yTop);
  for (const f of [fE, fS]) panels(f, 0, f.w, yF + H_SOF, yTop);
  D.setColor('#eeebe4');
  for (let k = 0; k < 44; k++) { // 4 rows: 6 units on the boulevard from the corner, 5 on the north side up to it
    const row = Math.floor(k / 11), c = k % 11, y = yC + row * CELL;
    if (c < 6) facetUnit(D, fW, c * CELL, y, 0.32); else facetUnit(D, fN, fN.w - (c - 5) * CELL, y, 0.32);
  }
  D.setColor('#d6d3cc'); // a cap strip over the facets, where the new cassettes start
  sbox(D, fW, 0, 6 * CELL, facetTop, facetTop + 0.08, 0, 0.1, 'ftr'); sbox(D, fN, fN.w - 5 * CELL, fN.w, facetTop, facetTop + 0.08, 0, 0.1, 'ftl');
  const ledRun = [[fW, 6 * CELL + 0.3, fW.w - 0.3], [fN, 0.3, fN.w - CORNER], [fS, 0.3, fS.w - 0.3]];
  B.led.setColor('#d9dbe2');
  for (const [f, s0, s1] of ledRun) for (let k = 1; k <= 4; k++) sbox(B.led, f, s0, s1, yC + 1.2 * k - 0.03, yC + 1.2 * k + 0.03, 0, 0.05, 'ftu');

  // ---- the other sides below the panels: grey render over a darker plinth, a drip ledge, shutters and doors
  const lower = (f, s0, s1) => {
    D.setColor(RENDER); sheet(D, f, s0, s1, yF + 0.3, yF + H_SOF, 0);
    D.setColor('#7d7b77'); sheet(D, f, s0, s1, gBase, yF + 0.3, 0);
    D.setColor('#c9c7c1'); sbox(D, f, s0, s1, yF + H_SOF - 0.06, yF + H_SOF, 0, 0.08, 'ftu');
  };
  lower(fN, 0, fN.w - CORNER); lower(fE, 0, fE.w); lower(fS, 0, fS.w);
  const shutter = (f, c, w) => {
    const g = groundAt(f, c, 1.5), yb = Math.min(yF, g + 0.05);
    D.setColor('#a8aaa9'); sbox(D, f, c - w / 2, c + w / 2, yb, yb + 3.2, 0, 0.04, 'f');
    D.setColor('#8a8c8c'); for (let y = yb + 0.25; y < yb + 3.1; y += 0.25) sbox(D, f, c - w / 2, c + w / 2, y - 0.02, y, 0.04, 0.06, 'fu');
    D.setColor('#6c6e6f'); sbox(D, f, c - w / 2 - 0.15, c + w / 2 + 0.15, yb + 3.2, yb + 3.65, 0, 0.35, 'fltru'); // roller box
    D.setColor('#9b9a95'); sbox(D, f, c - w / 2 - 0.6, c + w / 2 + 0.6, yb + 3.9, yb + 4.02, 0, 1.6, 'fltru'); // canopy
    sprism(S, f, c - w / 2 - 0.6, c + w / 2 + 0.6, 0, 1.6, yb + 3.9, yb + 4.02, 'awning', 1);
  };
  const serviceDoor = (f, c) => {
    const g = groundAt(f, c, 1.2), yb = Math.min(yF, g + 0.05);
    D.setColor('#55595c'); sbox(D, f, c - 0.5, c + 0.5, yb, yb + 2.1, 0, 0.04, 'f');
    D.setColor('#393c3e'); sbox(D, f, c - 0.6, c + 0.6, yb + 2.1, yb + 2.2, 0, 0.06, 'ftu');
    if (yb > g + 0.2) { D.setColor('#80817f'); sbox(D, f, c - 0.8, c + 0.8, gBase, yb, 0, 1.2, 'flrt'); S.prism(rectPts(f, c - 0.8, c + 0.8, 0, 1.2), gBase, yb, 0, 0, 'step'); }
  };
  // yard: the free stretches either side of the one-storey annex (s 27..66 is behind it)
  shutter(fE, 6.5, 3.6); shutter(fE, 14, 3.6); serviceDoor(fE, 21); serviceDoor(fE, 69.5);
  // south: the lean-to shops cover the first 47 m; a shutter and a door beyond them
  shutter(fS, 52, 3.4); serviceDoor(fS, 57.4);

  // ---- roof: bitumen deck, parapet with a galvanised coping, stair house, air handlers, condensers
  D.setColor('#565552'); D.face([[X0 + 0.3, yRoof, Z0 + 0.3], [X1 - 0.3, yRoof, Z0 + 0.3], [X1 - 0.3, yRoof, Z1 - 0.3], [X0 + 0.3, yRoof, Z1 - 0.3]], Y);
  for (const f of sides) {
    D.setColor('#cfccc4'); // parapet, inner face
    const a = pt(f, f.w - 0.3, 0, -0.3), c = pt(f, 0.3, 0, -0.3);
    D.face([[a[0], yRoof, a[2]], [c[0], yRoof, c[2]], [c[0], yTop, c[2]], [a[0], yTop, a[2]]], [-f.nx, 0, -f.nz]);
    D.setColor('#a9aca9'); sbox(D, f, -0.05, f.w + 0.05, yTop, yTop + 0.05, -0.32, 0.06, 'ftu');
    const e0 = pt(f, 0, 0, -0.15), e1 = pt(f, f.w, 0, -0.15);
    Z.edge(e0[0], e0[2], e1[0], e1[2], yTop, f.nx, f.nz);
    sprism(S, f, 0, f.w, -0.3, 0.05, yRoof, yTop + 0.05, 'wall');
  }
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  const roofBox = (x0, z0, x1, z1, h, col, kind) => { D.setColor(col); D.box(x0, yRoof, z0, x1, yRoof + h, z1, 1 | 2 | 4 | 16 | 32); S.prism([x0, z0, x1, z0, x1, z1, x0, z1], yRoof, yRoof + h, 0, 0, kind); };
  roofBox(cx - 9, cz - 4, cx - 3, cz + 1, 2.8, '#c3c0b8', 'roof');          // stair and lift house
  roofBox(cx + 6, cz - 12, cx + 10.5, cz - 10, 1.9, '#9ea2a3', 'equipment'); // air handlers
  roofBox(cx + 6, cz + 10, cx + 10.5, cz + 12, 1.9, '#9ea2a3', 'equipment');
  D.setColor('#6d7174'); D.box(cx + 6.4, yRoof + 1.9, cz - 11.7, cx + 7.4, yRoof + 2.3, cz - 10.3); D.box(cx + 6.4, yRoof + 1.9, cz + 10.3, cx + 7.4, yRoof + 2.3, cz + 11.7);
  // a glazed lantern over the escalator well, a duct run from the air handlers, vent stacks
  B.lit.setColor('#4d5a60'); D.setColor('#8d9091');
  D.box(cx - 1.5, yRoof, cz + 3, cx + 5.5, yRoof + 0.5, cz + 8, 1 | 2 | 16 | 32);
  for (const [n, a, c] of [[[1, 0, 0], [cx + 2, yRoof + 1.3, cz + 3], [cx + 5.5, yRoof + 0.5, cz + 3]], [[-1, 0, 0], [cx + 2, yRoof + 1.3, cz + 3], [cx - 1.5, yRoof + 0.5, cz + 3]]]) {
    const up = [n[0] * 0.8 / 3.6, 3.5 / 3.6, 0]; // a gable roof of glass either side of the ridge
    B.lit.face([[a[0], a[1], cz + 3], [a[0], a[1], cz + 8], [c[0], c[1], cz + 8], [c[0], c[1], cz + 3]], up);
  }
  B.lit.face([[cx - 1.5, yRoof + 0.5, cz + 3], [cx + 5.5, yRoof + 0.5, cz + 3], [cx + 2, yRoof + 1.3, cz + 3]], [0, 0, -1]);
  B.lit.face([[cx - 1.5, yRoof + 0.5, cz + 8], [cx + 5.5, yRoof + 0.5, cz + 8], [cx + 2, yRoof + 1.3, cz + 8]], [0, 0, 1]);
  S.prism([cx - 1.5, cz + 3, cx + 5.5, cz + 3, cx + 5.5, cz + 8, cx - 1.5, cz + 8], yRoof, yRoof + 1.0, 0, 0, 'roof');
  D.setColor('#9a9d9e'); D.box(cx + 7.8, yRoof + 0.3, cz - 10, cx + 8.6, yRoof + 1.1, cz + 10, 1 | 2 | 4);
  for (const [x, z] of [[X0 + 12, Z0 + 20], [X0 + 12, Z1 - 18], [X1 - 14, cz]]) { D.setColor('#7b7e80'); D.cyl(x, yRoof, z, 0.3, 0.3, 1.6, 8); D.setColor('#5d6062'); D.cyl(x, yRoof + 1.6, z, 0.45, 0.2, 0.35, 8); }
  for (let i = 0; i < 8; i++) {
    const x = X1 - 3 - (i % 2) * 1.6, z = Z0 + 12 + Math.floor(i / 2) * 7 + r() * 1.5;
    D.setColor('#dcdbd6'); D.box(x - 0.45, yRoof, z - 0.4, x + 0.45, yRoof + 0.8, z + 0.4, 1 | 2 | 4 | 16 | 32);
    D.setColor('#555859'); D.box(x - 0.46, yRoof + 0.15, z - 0.28, x - 0.45, yRoof + 0.65, z + 0.28, 2);
  }
  // ---- the forecourt: pavers from the boulevard walk to the shopfronts, in front of the KFC corner and the south end
  const paveRect = (px0, pz0, px1, pz1, cell = 2.4) => {
    const P = B.pave.setColor('#ffffff'), nx = Math.ceil((px1 - px0) / cell), nz = Math.ceil((pz1 - pz0) / cell), base = P.v;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = px0 + (px1 - px0) * i / nx, z = pz0 + (pz1 - pz0) * j / nz;
      P.vert(x, heightAt(x, z) + 0.24, z, 0, 1, 0, x / 3.2, z / 3.2);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = base + j * (nx + 1) + i, c = a + nx + 1; P.quad(a, c, c + 1, a + 1); }
  };
  paveRect(X0 - 15.4, Z0 - 9.7, X0 + 0.1, Z1 + 3.7);

  // ---- the fast-food pavilion against the north side, unbranded (after the 2021 photos: a timber cube on the
  // boulevard corner, a dark one-storey body with glass doors behind it, a drive-through lane along the car-park side)
  const pav = map.buildings.find((q) => q.id === PAV_ID);
  let pavFoot = null;
  if (pav) {
    const kr = ringPts(pav.p), kxs = kr.map((p) => p[0]), kzs = kr.map((p) => p[1]);
    // the ring's 1 m jog on the car-park side is the drive-through counter: it stays under the eave
    const KX0 = Math.min(...kxs), KX1 = Math.max(...kxs), KZ1 = Math.max(...kzs), KZ0 = Math.min(...kzs) + 1.0;
    let kHi = -Infinity, kLo = Infinity;
    for (const [x, z] of [[KX0 - 1, KZ0 - 1], [KX1, KZ0 - 1], [KX0 - 1, KZ1], [(KX0 + KX1) / 2, KZ0 - 1]]) { const h = heightAt(x, z); kHi = Math.max(kHi, h); kLo = Math.min(kLo, h); }
    const kF = kHi + 0.15, kB = kLo - 0.4, H_LOW = 4.3, H_CUBE = 7.2, CX = KX0 + 9.7, CZ = KZ0 + 8.6; // cube extent
    const body = (x0, z0, x1, z1) => ({ W: side(x0, z0, x1, z1, -1, 0), N: side(x0, z0, x1, z1, 0, -1), E: side(x0, z0, x1, z1, 1, 0), S: side(x0, z0, x1, z1, 0, 1) });
    const cube = body(KX0, KZ0, CX, CZ), low = body(KX0, KZ0, KX1, KZ1);
    // cube: boards all round above the low roof, down to the ground on the boulevard and car-park faces
    B.wood.setColor('#ffffff');
    for (const f of [cube.W, cube.N]) sheet(B.wood, f, 0, f.w, kB, kF + H_CUBE, 0, [2.24, 1]);
    for (const f of [cube.E, cube.S]) sheet(B.wood, f, 0, f.w, kF + H_LOW, kF + H_CUBE, 0, [2.24, 1]);
    D.setColor('#2c2e30');
    for (const f of [cube.W, cube.N, cube.E, cube.S]) sbox(D, f, -0.04, f.w + 0.04, kF + H_CUBE, kF + H_CUBE + 0.12, -0.25, 0.04, 'ftu');
    D.setColor('#4e4d4a'); D.face([[KX0, kF + H_CUBE, KZ0], [CX, kF + H_CUBE, KZ0], [CX, kF + H_CUBE, CZ], [KX0, kF + H_CUBE, CZ]], Y);
    // a dining window cut into the cube on each open face, set in a dark frame
    for (const [f, a, c] of [[cube.W, 1.4, cube.W.w - 1.2], [cube.N, 1.0, cube.N.w - 1.4]]) {
      D.setColor('#2c2e30'); sbox(D, f, a - 0.12, c + 0.12, kF + 0.1, kF + 3.1, 0, 0.1, 'flrtu');
      glaze(f, a, c, kF + 0.25, kF + 2.95, 0.11, 0, 1.3);
    }
    // the low body: dark panels, glass doors on the boulevard, a glazed hall and the drive-through window on the car park
    const lw = low.W, ln = low.N, dark = '#393c3f';
    D.setColor(dark);
    sheet(D, lw, CZ - KZ0, lw.w, kB, kF + H_LOW, 0); sheet(D, ln, 0, ln.w - (CX - KX0), kB, kF + H_LOW, 0);
    sheet(D, low.E, 0, low.E.w, kB, kF + H_LOW, 0);
    glaze(lw, CZ - KZ0 + 0.8, lw.w - 0.9, kF + 0.02, kF + 2.9, 0.06, kF + 2.3, 1.2);
    glaze(ln, ln.w - (CX - KX0) - 12, ln.w - (CX - KX0) - 0.8, kF + 0.4, kF + 3.0, 0.06, 0, 1.8);
    glaze(ln, 5, 7.2, kF + 0.95, kF + 2.3, 0.06, 0, 2.2);
    D.setColor('#5b5e60'); sbox(D, lw, CZ - KZ0 + 0.4, lw.w - 0.5, kF + 3.2, kF + 3.4, 0, 1.4, 'flrtu');
    sprism(S, lw, CZ - KZ0 + 0.4, lw.w - 0.5, 0, 1.4, kF + 3.2, kF + 3.4, 'awning', 1);
    D.setColor('#6d6c69'); sbox(D, lw, CZ - KZ0 + 0.4, lw.w - 0.5, kB, kF, 0, 1.4, 'flrt'); // entrance landing
    S.prism(rectPts(lw, CZ - KZ0 + 0.4, lw.w - 0.5, 0, 1.4), kB, kF, 0, 0, 'step');
    D.setColor('#5b5e60'); sbox(D, ln, 3, 12, kF + 3.3, kF + 3.5, 0, 1.6, 'flrtu'); // drive-through eave
    sprism(S, ln, 3, 12, 0, 1.6, kF + 3.3, kF + 3.5, 'awning', 1);
    D.setColor('#2c2e30');
    for (const [f, a, c] of [[lw, CZ - KZ0, lw.w], [ln, 0, ln.w - (CX - KX0)], [low.E, 0, low.E.w]]) sbox(D, f, a, c, kF + H_LOW - 0.7, kF + H_LOW + 0.1, 0, 0.06, 'ftu');
    D.setColor('#4e4d4a');
    D.face([[CX, kF + H_LOW, KZ0], [KX1, kF + H_LOW, KZ0], [KX1, kF + H_LOW, KZ1], [CX, kF + H_LOW, KZ1]], Y);
    D.face([[KX0, kF + H_LOW, CZ], [CX, kF + H_LOW, CZ], [CX, kF + H_LOW, KZ1], [KX0, kF + H_LOW, KZ1]], Y);
    D.setColor('#dcdbd6'); for (const z of [KZ0 + 3, KZ0 + 6]) D.box(KX1 - 6, kF + H_LOW, z, KX1 - 5, kF + H_LOW + 0.8, z + 0.8, 1 | 2 | 4 | 16 | 32);
    S.prism([KX0, KZ0, CX, KZ0, CX, CZ, KX0, CZ], kB, kF + H_CUBE + 0.12, 0, 0, 'wall');
    S.prism([KX0, KZ0, KX1, KZ0, KX1, KZ1, KX0, KZ1], kB, kF + H_LOW + 0.1, 0, 0, 'wall');
    paveRect(X0 + 0.1, Z0 - 15.2, KX0, Z0 + 0.1); // the corner forecourt between the two
    pavFoot = { poly: kr, h: kF + H_CUBE - kLo, kind: pav.k, name: pav.name };
  }

  // ---- collision: the ground floor behind the shopfront line, the box above, the roof deck
  const xg = X0 + RECESS - 0.15, zg = Z0 + RECESS - 0.15; // the plinth line under the shopfronts
  S.prism([xg, zg, X1, zg, X1, Z1, xg, Z1], gBase, yF + H_SOF, 0, 0, 'wall');
  S.prism([X0 + CORNER, Z0, X1, Z0, X1, zg, X0 + CORNER, zg], gBase, yF + H_SOF, 0, 0, 'wall');
  S.prism([X0, Z0, X1, Z0, X1, Z1, X0, Z1], yF + H_SOF, yRoof, 0, 0, 'wall');

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'torhivli' });
  root.add(group);
  const sign = signTex();
  const M = {
    pave: decal(new THREE.MeshStandardMaterial({ map: paveTex(r), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 })),
    panel: new THREE.MeshStandardMaterial({ map: panelTex(r), vertexColors: true, roughness: 0.55, metalness: 0.05 }),
    dark: new THREE.MeshStandardMaterial({ map: darkTex(), vertexColors: true, roughness: 0.45, metalness: 0.25 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.35, emissive: 0xfff1dc, emissiveIntensity: 0 }),
    led: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4, emissive: 0xb3b8ff, emissiveIntensity: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(r), vertexColors: true, roughness: 0.7 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.75 }),
    badge: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.5 }),
  };
  let nV = 0;
  for (const [k, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const flat = k === 'lit' || k === 'sign' || k === 'badge' || k === 'led' || k === 'pave';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), M[k]), { name: 'torhivli-' + k, castShadow: !flat, receiveShadow: true }));
  }
  console.log(`[cherkasy] Budynok torhivli: ${bays} glazed bays, ${doors} entrances, ${pavFoot ? 'pavilion, ' : ''}floor ${yF.toFixed(1)} m, ${(nV / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: yTop - gLo, kind: b.k, name: 'Будинок торгівлі' }, ...(pavFoot ? [pavFoot] : [])],
    // generated trees keep off the lot, the paved forecourt and the yard doors
    clear: (x, z) => x > X0 - 15 && x < X1 + 3 && z > Z0 - (x < X0 + 8 ? 16 : 10) && z < Z1 + 4,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.1 * k; M.led.emissiveIntensity = 2.4 * k; M.sign.emissiveIntensity = M.badge.emissiveIntensity = 0.9 * k; },
  };
}
