// OWNER: cherkasy. Черкаська обласна філармонія ім. Олександра Кошиця, вул. Хрещатик, 196 (OSM way 157594207; the
// generic extrusion was a flat 2-storey slab over the whole 74 x 70 m block). Rebuilt after the Wikimedia Commons photos
// (Category:Cherkasy Philharmonic, 2008-2019) and the 2018 reports on the air sculpture. The street front (+x, on
// Khreshchatyk) is a symmetric two-storey classical façade in dusty pink render with cream trim, finished in 1961 and
// restored by 2015: 15 bays between two taller end pavilions. Ground floor: the dark-granite entrance loggia in the
// middle (5 arches with oak doors behind rusticated piers, a dark fascia with the gilt name, 3 steps), a 3-bay arcaded
// portico on each side (glazed arches over a meander panel, concert posters, a balustraded balcony on top) and 2 arched
// recesses with windows towards each pavilion. Upper floor: French windows with hoods between pilasters, a frieze of
// oval oculi, a stepped cornice, a panelled attic that rises over the loggia and carries four urns. Pavilions: paired
// corner pilasters, a pedimented porch between rusticated granite piers with steps, a triple arched window with a
// hood, a high attic. The back of the block (halls, rehearsal rooms, stage) is plainer render with window rows; the
// concert hall rises behind the attic under a grey metal hipped roof. Around it: cast-iron lanterns on the pavement,
// a bronze bust on a granite pedestal at the north-west end, blue spruces at both ends, and «Висока нота» (2018,
// O. Lidahovskyi): a bronze girl violinist sitting on a steel wire 7 m over the pavement, strung from the south-east
// pavilion to a steel pole. Lit windows, doors, lanterns and the gilt name at night.
//   PHIL_SKIP: the OSM id replaced here (buildings.js skips it)
//   shapePhilharmonic(hf, map) -> level | null   levels the site (hf.pad over the footprint), before ground + buildings
//   buildPhilharmonic({ root, map, solids, zips, heightAt }) -> { update(), clear(x, z), spots, footprints } | null
// The OSM footprint is square to the map grid. The block is cut into axis-aligned volumes (pavilions, the front block,
// the hall, the back wing, a service annex); a wall is drawn where a volume rises above its neighbour, and the
// street-side faces get the hand-made treatment. Faces are laid out in a frame per wall: s along the wall to the right
// of a viewer outside, o outward, y up.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE } from '../trees.js';
import { SG, canvasTex } from './sculpt.js';
import { ringPts, rng, area2, inPoly } from './geo.js';

const OSM_ID = 157594207;
export const PHIL_SKIP = new Set([OSM_ID]);

const PINK = '#d8b0ba', PINK2 = '#c9a0ab', CREAM = '#ece3cf', CREAM2 = '#d9cfb8', GRAN = '#4a4c4f', GRAN2 = '#3b3d40', FASCIA = '#262a2d';
const OAK = '#b9793f', FRAME = '#5c4029', ROOF = '#7b8790', IRON = '#1c1e20', STEP = '#8a8b88';
const GLASS = ['#35424b', '#3e4c56', '#2f3a42', '#46535c'];
const RISE = 0.45;                                   // floor over the pavement
const FX = 165.85, ZN = 277.85, ZS = 324.35;         // front block: street wall, north-west and south-east ends
const NB = 15, BAY = (ZS - ZN) / NB;                 // bays across the front
const LOGGIA = [5, 10], PORTICOS = [[2, 5], [10, 13]], PORT_O = 1.3;
// heights over the floor: front block, pavilions
const MID = { g1: 5.0, slab: 5.6, up: 9.6, fr: 10.6, cor: 11.2, att: 12.4, catt: 13.3 };
const PAV = { ent: 11.8, fr: 12.6, cor: 13.2, att: 15.0 };
const V_UP = [0, 1, 0], V_DN = [0, -1, 0];

// ------------------------------------------------------------------------------------------------ textures
const stucco = (r) => canvasTex(256, 256, (g, w, h) => { // sprayed lime render, 4 m per repeat
  g.fillStyle = '#f5f3ef'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) {
    const a = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${a},${a},${a},${0.03 + r() * 0.03})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
});
const meanderTex = () => canvasTex(256, 64, (g, w, h) => { // a Greek key in pale lines on dark granite, 1.6 m per repeat
  g.fillStyle = '#3d3f42'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b9b6ae'; g.lineWidth = 5; g.lineJoin = 'miter';
  const u = w / 4, t = 10, b = h - 10;
  for (let k = 0; k < 4; k++) {
    const x = k * u + 6;
    g.beginPath();
    g.moveTo(x, b); g.lineTo(x, t); g.lineTo(x + u * 0.72, t); g.lineTo(x + u * 0.72, b - 14);
    g.lineTo(x + u * 0.3, b - 14); g.lineTo(x + u * 0.3, t + 16); g.lineTo(x + u * 0.5, t + 16);
    g.moveTo(x, b); g.lineTo(x + u, b);
    g.stroke();
  }
  g.fillStyle = '#b9b6ae'; g.fillRect(0, 2, w, 3); g.fillRect(0, h - 5, w, 3);
});
const nameTex = () => canvasTex(2048, 224, (g, w, h) => { // gilt letters on the dark fascia
  g.fillStyle = FASCIA; g.fillRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, 30, 0, 150);
  grad.addColorStop(0, '#f3dc8e'); grad.addColorStop(0.5, '#c79a3c'); grad.addColorStop(1, '#e9cb73');
  g.fillStyle = grad; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 104px "Times New Roman", Georgia, serif';
  g.fillText('ЧЕРКАСЬКА  ОБЛАСНА  ФІЛАРМОНІЯ', w / 2, 88, w - 120);
  g.font = 'italic 52px "Times New Roman", Georgia, serif';
  g.fillText('імені Олександра Кошиця', w / 2, 178, w - 120);
}, { repeat: false });
// four concert posters side by side (0.25 of u each)
const POSTERS = [
  ['#1d2f5a', '#f2d27a', 'СИМФОНІЧНИЙ', 'ОРКЕСТР', 'Вечір класики', 'неділя · 18:00'],
  ['#7a1f2b', '#f7eadb', 'УКРАЇНСЬКА', 'ПІСНЯ', 'Академічний хор', 'субота · 17:00'],
  ['#101010', '#e9b949', 'ДЖАЗ', 'У ФІЛАРМОНІЇ', 'квартет і гості', 'п’ятниця · 19:00'],
  ['#e8e1d3', '#3a2d5c', 'СКРИПКА', 'І ФОРТЕПІАНО', 'камерний концерт', 'четвер · 18:30'],
];
const posterTex = () => canvasTex(1024, 512, (g) => {
  POSTERS.forEach(([bg, fg, t1, t2, t3, t4], k) => {
    const x = k * 256;
    g.fillStyle = bg; g.fillRect(x, 0, 256, 512);
    g.fillStyle = fg; g.fillRect(x + 14, 14, 228, 4); g.fillRect(x + 14, 494, 228, 4);
    g.globalAlpha = 0.18; g.beginPath(); g.arc(x + 128, 250, 92, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 34px Arial, Helvetica, sans-serif'; g.fillText(t1, x + 128, 96, 230); g.fillText(t2, x + 128, 138, 230);
    g.font = 'italic 26px Georgia, serif'; g.fillText(t3, x + 128, 360, 230);
    g.font = 'bold 24px Arial, Helvetica, sans-serif'; g.fillText(t4, x + 128, 410, 230);
    g.font = '18px Arial, Helvetica, sans-serif'; g.fillText('Черкаська обласна філармонія', x + 128, 462, 230);
  });
}, { repeat: false });

// ------------------------------------------------------------------------------------------------ wall frames
// a wall frame: origin (x, z), unit direction r along the wall (to the right of a viewer outside); outward n = (-r.z, r.x)
const wallFrame = (x, z, rx, rz) => ({ x, z, rx, rz, nx: -rz, nz: rx });
const at = (f, s, y, o = 0) => [f.x + f.rx * s + f.nx * o, y, f.z + f.rz * s + f.nz * o];
const nOut = (f, k = 1) => [f.nx * k, 0, f.nz * k];
const rDir = (f, k = 1) => [f.rx * k, 0, f.rz * k];
const plate = (M, f, s0, s1, y0, y1, o = 0, k = 1) => M.face([at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o)], nOut(f, k));
// block in a frame; sides: 1 front (o1), 2 back (o0), 4 at s0, 8 at s1, 16 top, 32 bottom
function block(M, f, s0, s1, y0, y1, o0, o1, sides = 63) {
  if (sides & 1) plate(M, f, s0, s1, y0, y1, o1);
  if (sides & 2) plate(M, f, s0, s1, y0, y1, o0, -1);
  if (sides & 4) M.face([at(f, s0, y0, o0), at(f, s0, y0, o1), at(f, s0, y1, o1), at(f, s0, y1, o0)], rDir(f, -1));
  if (sides & 8) M.face([at(f, s1, y0, o0), at(f, s1, y0, o1), at(f, s1, y1, o1), at(f, s1, y1, o0)], rDir(f));
  if (sides & 16) M.face([at(f, s0, y1, o0), at(f, s1, y1, o0), at(f, s1, y1, o1), at(f, s0, y1, o1)], V_UP);
  if (sides & 32) M.face([at(f, s0, y0, o0), at(f, s1, y0, o0), at(f, s1, y0, o1), at(f, s0, y0, o1)], V_DN);
}
// the parts of [a, b] not covered by any span
function openParts(a, b, spans) {
  const out = [];
  let s = a;
  for (const [c, d] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (c > s + 1e-3) out.push([s, Math.min(c, b)]);
    if (d > s) s = d;
  }
  if (b > s + 1e-3) out.push([s, b]);
  return out;
}
// an opening: s range a..b, sill y0, head (or arch spring) y1, r > 0 for a round head of radius (b - a) / 2
const hole = (a, b, y0, y1, arch = false) => ({ a, b, y0, y1, r: arch ? (b - a) / 2 : 0 });
const ARC = 10;
const arcPt = (h, k) => { const t = Math.PI * (1 - k / ARC); return [(h.a + h.b) / 2 + h.r * Math.cos(t), h.y1 + h.r * Math.sin(t)]; };
// wall plane with openings cut out: horizontal bands between all the opening edges, spandrels over round heads
function wallCut(M, f, s0, s1, y0, y1, holes, o = 0) {
  const ys = [...new Set([y0, y1, ...holes.flatMap((h) => [h.y0, h.y1 + h.r])])].filter((y) => y >= y0 && y <= y1).sort((p, q) => p - q);
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i], yb = ys[i + 1];
    if (yb - ya < 1e-4) continue;
    const spans = holes.filter((h) => h.y0 <= ya + 1e-4 && h.y1 + h.r >= yb - 1e-4).map((h) => [h.a, h.b]);
    for (const [a, b] of openParts(s0, s1, spans)) plate(M, f, a, b, ya, yb, o);
  }
  for (const h of holes) if (h.r) {
    const top = h.y1 + h.r;
    for (let k = 0; k < ARC; k++) {
      const [sa, ya] = arcPt(h, k), [sb, yb] = arcPt(h, k + 1);
      M.face([at(f, sa, ya, o), at(f, sb, yb, o), at(f, sb, top, o), at(f, sa, top, o)], nOut(f));
    }
  }
}
// the reveal round an opening, depth d into the wall (from o back to o - d)
function reveal(M, f, h, d, o = 0) {
  const b = o - d;
  M.face([at(f, h.a, h.y0, b), at(f, h.a, h.y0, o), at(f, h.a, h.y1, o), at(f, h.a, h.y1, b)], rDir(f));
  M.face([at(f, h.b, h.y0, b), at(f, h.b, h.y0, o), at(f, h.b, h.y1, o), at(f, h.b, h.y1, b)], rDir(f, -1));
  M.face([at(f, h.a, h.y0, b), at(f, h.b, h.y0, b), at(f, h.b, h.y0, o), at(f, h.a, h.y0, o)], V_UP);
  if (!h.r) { M.face([at(f, h.a, h.y1, b), at(f, h.b, h.y1, b), at(f, h.b, h.y1, o), at(f, h.a, h.y1, o)], V_DN); return; }
  for (let k = 0; k < ARC; k++) {
    const [sa, ya] = arcPt(h, k), [sb, yb] = arcPt(h, k + 1), t = Math.PI * (1 - (k + 0.5) / ARC);
    const inw = [-Math.cos(t) * f.rx, -Math.sin(t), -Math.cos(t) * f.rz];
    M.face([at(f, sa, ya, o), at(f, sb, yb, o), at(f, sb, yb, b), at(f, sa, ya, b)], inw);
  }
}
// the opening's own outline as a flat pane at depth o (rect + half disc)
function pane(M, f, h, o) {
  plate(M, f, h.a, h.b, h.y0, h.y1, o);
  if (!h.r) return;
  const c = (h.a + h.b) / 2, mid = at(f, c, h.y1, o);
  for (let k = 0; k < ARC; k++) { const [sa, ya] = arcPt(h, k), [sb, yb] = arcPt(h, k + 1); M.face([mid, at(f, sa, ya, o), at(f, sb, yb, o)], nOut(f)); }
}
// a stack of granite courses with sunk joints (rustication) over the frame box
function rusticated(M, f, s0, s1, y0, y1, o0, o1, course = 0.48, sides = 1 | 4 | 8) {
  for (let y = y0; y < y1 - 1e-3; y += course) {
    const yt = Math.min(y1, y + course), j = Math.min(0.04, (yt - y) / 3);
    M.setColor(GRAN); block(M, f, s0, s1, y + j, yt, o0, o1, sides);
    M.setColor(GRAN2); block(M, f, s0 + 0.03, s1 - 0.03, y, y + j, o0, o1 - 0.03, sides & 1);
  }
}

// ------------------------------------------------------------------------------------------------ the volumes
// [ring [x, z], top over the floor, kind]; the rings follow the OSM outline (the hall is the roofed core inside it)
const VOLUMES = [
  { id: 'pavN', ring: [[141.3, 266.6], [168.9, 266.5], [168.9, ZN], [144, ZN], [144, 275.3], [141.3, 275.3]], top: PAV.att, kind: 'pav', front: 168.9, span: [266.5, ZN] },
  { id: 'pavS', ring: [[144.3, ZS], [169.3, ZS], [169.3, 336.05], [141.7, 336.15], [141.7, 328.6], [144.3, 328.6]], top: PAV.att, kind: 'pav', front: 169.3, span: [ZS, 336.1] },
  { id: 'mid', ring: [[129.9, ZN], [FX, ZN], [FX, ZS], [130.1, ZS]], top: MID.att, kind: 'mid' },
  { id: 'hall', ring: [[108, 287.1], [150, 287.1], [150, 315.6], [108, 315.6]], top: 13.6, kind: 'hall' },
  { id: 'back', ring: [[100.4, 277.75], [104.7, 277.75], [104.7, 275.5], [109.7, 275.5], [109.75, 277.7], [114.1, 277.7], [114.2, 324.9], [100.55, 325]], top: 10.6, kind: 'plain' },
  { id: 'svc', ring: [[95.45, 292], [100.45, 292], [100.5, 311.25], [95.5, 311.3]], top: 6.0, kind: 'plain' },
];
const HALL_RIDGE = 4.0; // hip roof rise over the hall eaves
const roofOf = (v) => (v.kind === 'pav' ? PAV.cor : v.kind === 'mid' ? MID.cor : v.kind === 'hall' ? v.top : v.top - 0.6);

// ------------------------------------------------------------------------------------------------ terrain hook
export function shapePhilharmonic(hf, map) {
  const b = map.buildings?.find((q) => q.id === OSM_ID);
  return b ? hf.pad(ringPts(b.p), 16) : null;
}

// ------------------------------------------------------------------------------------------------ build
export function buildPhilharmonic({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const lot = ringPts(bld.p);
  const gy = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const hs = lot.map(([x, z]) => gy(x, z)).sort((a, b) => a - b);
  const yG = hs[hs.length >> 1], F = yG + RISE, gBase = hs[0] - 0.6;
  const Y = (h) => F + h;

  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB(), lamp: new MB(), roof: new MB(), sign: new MB(), poster: new MB(), meander: new MB() };
  const W = B.wall, D = B.det;
  const glassOf = () => GLASS[Math.floor(r() * GLASS.length)];
  const glaze = (f, h, o, litP = 0.3) => { const lit = r() < litP, G = lit ? B.lit : B.glass; G.setColor(lit ? '#6d6556' : glassOf()); pane(G, f, h, o); };
  const box = (x0, y0, z0, x1, y1, z1, kind = 'wall', fl = 0) => S.box(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), kind, fl);
  const prism = (pts, y0, y1, kind = 'wall') => S.prism((area2(pts) < 0 ? [...pts].reverse() : pts).flat(), y0, y1, 0, 0, kind);
  let nWin = 0;

  // ---- a balustrade along an axis-aligned run a -> b ([x, z]) at floor y: plinth, turned balusters, handrail
  const balustrade = (a, b, y, h = 1.0) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, hw = 0.14;
    const bx = (p, q, y0, y1, w) => D.box(Math.min(p[0], q[0]) - (uz ? w : 0), y0, Math.min(p[1], q[1]) - (ux ? w : 0), Math.max(p[0], q[0]) + (uz ? w : 0), y1, Math.max(p[1], q[1]) + (ux ? w : 0));
    D.setColor(CREAM); bx(a, b, y, y + 0.14, hw); bx(a, b, y + h - 0.12, y + h, hw + 0.03);
    const n = Math.max(1, Math.round(len / 0.3));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = a[0] + ux * len * t, z = a[1] + uz * len * t, y0 = y + 0.14, hh = h - 0.26;
      D.lathe([[0.07, y0], [0.05, y0 + hh * 0.18], [0.085, y0 + hh * 0.45], [0.04, y0 + hh * 0.82], [0.06, y0 + hh]], 5, x, z);
    }
    for (const p of [a, b]) D.box(p[0] - 0.17, y, p[1] - 0.17, p[0] + 0.17, y + h + 0.05, p[1] + 0.17);
  };
  const lantern = (x, y, z, wallN) => { // a black wall lantern on a curled bracket; wallN: the wall's outward normal
    const cx = x + wallN[0] * 0.45, cz = z + wallN[1] * 0.45;
    D.setColor(IRON); D.tube([x, y + 0.1, z], [cx, y + 0.1, cz], 0.025, 5);
    D.cyl(cx, y - 0.12, cz, 0.06, 0.13, 0.12, 6); D.cyl(cx, y + 0.42, cz, 0.16, 0.02, 0.2, 6);
    B.lamp.setColor('#fff0cf'); B.lamp.cyl(cx, y, cz, 0.12, 0.15, 0.42, 6, false);
  };

  // ---- volumes: the walls each one shows above its neighbours
  const inRing = (x, z, v) => inPoly(v.ring, x, z);
  const coverOf = (x, z, self) => { let best = null; for (const w of VOLUMES) if (w !== self && inRing(x, z, w) && (!best || w.top > best.top)) best = w; return best; };
  for (const v of VOLUMES) {
    const P = v.ring, inside = (x, z) => inRing(x, z, v);
    for (let i = 0; i < P.length; i++) {
      const a = P[i], c = P[(i + 1) % P.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 0.3) continue;
      let ux = (c[0] - a[0]) / L, uz = (c[1] - a[1]) / L, ox = -uz, oz = ux, p = a;
      if (inside((a[0] + c[0]) / 2 + ox * 0.2, (a[1] + c[1]) / 2 + oz * 0.2)) { ox = -ox; oz = -oz; }
      // frame: r = (nz, -nx) for the outward n; start at whichever end makes s run along r
      const rx = oz, rz = -ox;
      if ((c[0] - a[0]) * rx + (c[1] - a[1]) * rz < 0) p = c;
      const f = wallFrame(p[0], p[1], rx, rz);
      if ((v.kind === 'pav' && ox > 0.9 && Math.abs(p[0] - v.front) < 0.5) || (v.id === 'mid' && ox > 0.9)) continue; // street fronts: below
      // split the edge where other volumes start or stop; each piece is exposed above what covers it
      const cuts = new Set([0, L]);
      for (const w of VOLUMES) if (w !== v) for (const q of w.ring) { const s = (q[0] - f.x) * f.rx + (q[1] - f.z) * f.rz; if (s > 0.05 && s < L - 0.05) cuts.add(s); }
      const cs = [...cuts].sort((m, n) => m - n);
      for (let k = 0; k + 1 < cs.length; k++) {
        const s0 = cs[k], s1 = cs[k + 1], m = at(f, (s0 + s1) / 2, 0, 0.25);
        const cv = coverOf(m[0], m[2], v);
        if (cv && cv.top >= v.top - 1e-3) continue;
        sideWall(v, f, s0, s1, cv ? roofOf(cv) : -Infinity); // from the neighbour's roof up, or from the ground
      }
    }
    // roof and collision
    if (v.kind === 'hall') { hallRoof(v); continue; }
    D.setColor(v.kind === 'plain' ? '#5d6064' : ROOF); D.fill(v.ring, [], Y(roofOf(v)), true);
    if (v.id !== 'mid') prism(v.ring, gBase, Y(v.top));
  }

  // a wall piece of volume v over [s0, s1]; cover = the neighbour's top over the floor (-Inf: open to the ground)
  function sideWall(v, f, s0, s1, cover) {
    const open = cover === -Infinity, top = Y(v.top), w = s1 - s0;
    const roofY = Y(roofOf(v));
    const y0 = open ? gBase : Y(cover) - 0.05;
    const classic = v.kind === 'pav' || v.kind === 'mid';
    if (open) { D.setColor(GRAN); plate(D, f, s0, s1, gBase, F, 0.04); D.setColor('#6b6d6f'); block(D, f, s0, s1, F - 0.06, F, 0, 0.07, 1 | 16); }
    const wy0 = open ? F : y0;
    if (classic) {
      const H = v.kind === 'pav' ? PAV : { ent: MID.up, fr: MID.fr, cor: MID.cor, att: MID.att };
      const nb = Math.max(1, Math.round(w / 4.0)), bw = w / nb, holes = [];
      if (open && bw > 2.6 && w > 5) for (let i = 0; i < nb; i++) {
        const c = s0 + (i + 0.5) * bw;
        holes.push(hole(c - 0.7, c + 0.7, F + 1.0, F + 3.4), hole(c - 0.7, c + 0.7, F + 6.1, F + (v.kind === 'pav' ? 8.9 : 8.5)));
      }
      W.setColor(PINK); wallCut(W, f, s0, s1, wy0, Y(H.ent), holes);
      for (const h of holes) {
        W.setColor(CREAM2); reveal(W, f, h, 0.22); glaze(f, h, -0.2); nWin++;
        D.setColor(CREAM); block(D, f, h.a - 0.12, h.b + 0.12, h.y0 - 0.12, h.y0, 0, 0.14, 1 | 4 | 8 | 16);
        block(D, f, h.a - 0.2, h.b + 0.2, h.y1 + 0.15, h.y1 + 0.35, 0, 0.2, 1 | 4 | 8 | 16 | 32);
        block(D, f, h.a - 0.12, h.b + 0.12, h.y1, h.y1 + 0.15, 0, 0.06, 1);
      }
      if (open) { D.setColor(CREAM); for (let i = 0; i <= nb; i++) { const s = Math.min(s1 - 0.28, Math.max(s0 + 0.28, s0 + i * bw)); block(D, f, s - 0.28, s + 0.28, F, Y(H.ent), 0, 0.12, 1 | 4 | 8); } }
      // entablature, frieze, stepped cornice, panelled attic with posts, coping
      D.setColor(CREAM); block(D, f, s0, s1, Y(H.ent), Y(H.ent) + 0.25, 0, 0.1, 1 | 32 | 16);
      W.setColor(PINK); plate(W, f, s0, s1, Y(H.ent) + 0.25, Y(H.fr), 0);
      cornice(f, s0, s1, Y(H.fr), Y(H.cor));
      W.setColor(PINK); plate(W, f, s0, s1, Y(H.cor), top, 0);
      D.setColor(CREAM); for (let i = 0; i <= nb; i++) { const s = Math.min(s1 - 0.25, Math.max(s0 + 0.25, s0 + i * bw)); block(D, f, s - 0.25, s + 0.25, Y(H.cor), top - 0.12, 0, 0.12, 1 | 4 | 8); }
      block(D, f, s0, s1, Y(H.cor), Y(H.cor) + 0.15, 0, 0.08, 1 | 16);
    } else {
      // plain render: window rows every 3.6 m, a cream band and a coping at the top
      const holes = [];
      if (open) {
        const nb = Math.max(1, Math.round(w / 3.4)), bw = w / nb;
        for (let i = 0; i < nb; i++) for (let fl = 0; F + fl * 3.6 + 2.6 < roofY - 0.6; fl++) {
          if (v.kind === 'hall' && fl % 2) continue; // the hall walls have fewer, taller openings
          const c = s0 + (i + 0.5) * bw, yb = F + 0.9 + fl * 3.6, hh = v.kind === 'hall' ? 3.0 : 1.8;
          if (bw > 2.2) holes.push(hole(c - 0.65, c + 0.65, yb, yb + hh));
        }
      }
      W.setColor(PINK); wallCut(W, f, s0, s1, wy0, top - 0.5, holes);
      for (const h of holes) { W.setColor(CREAM2); reveal(W, f, h, 0.18); glaze(f, h, -0.16, 0.22); D.setColor(CREAM); block(D, f, h.a - 0.08, h.b + 0.08, h.y0 - 0.1, h.y0, 0, 0.1, 1 | 16); nWin++; }
      D.setColor(CREAM); block(D, f, s0, s1, top - 0.5, top, 0, 0.12, 1 | 32);
    }
    // parapet inner face and coping; roof-edge grab points
    if (v.kind !== 'hall') { W.setColor(PINK2); plate(W, f, s0 + 0.3, s1 - 0.3, roofY, top, -0.3, -1); }
    D.setColor(v.kind === 'hall' ? CREAM2 : '#cfc6b1'); block(D, f, s0, s1, top, top + 0.08, -0.32, 0.14, 1 | 16);
    const e0 = at(f, s0, 0, -0.1), e1 = at(f, s1, 0, -0.1);
    if (w > 3) Z.edge(e0[0], e0[2], e1[0], e1[2], top + 0.08, f.nx, f.nz);
  }
  // stepped cream cornice between y0 and y1, carried round the ends
  function cornice(f, s0, s1, y0, y1, ext = 0) {
    const h = (y1 - y0) / 3;
    D.setColor(CREAM);
    block(D, f, s0 - ext * 0.4, s1 + ext * 0.4, y0, y0 + h, 0, 0.25, 1 | 4 | 8 | 32);
    block(D, f, s0 - ext * 0.7, s1 + ext * 0.7, y0 + h, y0 + 2 * h, 0, 0.5, 1 | 4 | 8 | 32);
    D.setColor(CREAM2); block(D, f, s0 - ext, s1 + ext, y0 + 2 * h, y1, 0, 0.8, 1 | 4 | 8 | 16 | 32);
  }
  // the hall's metal hip roof (and its plane-topped collision facets)
  function hallRoof(v) {
    const [[x0, z0], [x1], [, z1]] = [v.ring[0], v.ring[1], v.ring[2]], ov = 0.45, ye = Y(v.top), k = HALL_RIDGE / ((z1 - z0) / 2);
    const zm = (z0 + z1) / 2, hw = (z1 - z0) / 2, ra = x0 + hw, rb = x1 - hw, yr = ye + HALL_RIDGE, yo = ye - ov * k;
    const E = [[x0 - ov, z0 - ov], [x1 + ov, z0 - ov], [x1 + ov, z1 + ov], [x0 - ov, z1 + ov]];
    const R = B.roof; R.setColor(ROOF);
    const nk = (a, b) => { const l = Math.hypot(a, 1, b); return [a / l, 1 / l, b / l]; };
    R.face([[E[0][0], yo, E[0][1]], [E[1][0], yo, E[1][1]], [rb, yr, zm], [ra, yr, zm]], nk(0, -k));
    R.face([[E[2][0], yo, E[2][1]], [E[3][0], yo, E[3][1]], [ra, yr, zm], [rb, yr, zm]], nk(0, k));
    R.face([[E[1][0], yo, E[1][1]], [E[2][0], yo, E[2][1]], [rb, yr, zm]], nk(k, 0));
    R.face([[E[3][0], yo, E[3][1]], [E[0][0], yo, E[0][1]], [ra, yr, zm]], nk(-k, 0));
    R.setColor('#69747c'); for (const e of E) R.tube([e[0], yo, e[1]], [e[0] < (x0 + x1) / 2 ? ra : rb, yr, zm], 0.07, 4); R.tube([ra, yr, zm], [rb, yr, zm], 0.09, 4);
    R.setColor('#5b6168'); R.face([[E[0][0], yo, E[0][1]], [E[1][0], yo, E[1][1]], [E[2][0], yo, E[2][1]], [E[3][0], yo, E[3][1]]], V_DN);
    for (let x = ra + 3; x < rb - 2; x += 7) { D.setColor('#9aa1a6'); D.cyl(x, yr - 0.3, zm, 0.45, 0.35, 1.1, 8); D.cyl(x, yr + 0.8, zm, 0.6, 0.05, 0.3, 8); }
    prism([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], gBase, ye);
    // facets: y = ye + k * (distance in from the eave line)
    const facet = (pts, a, bx, bz) => S.prism((area2(pts) < 0 ? [...pts].reverse() : pts).flat(), ye, a, bx, bz, 'roof');
    facet([[x0, z0], [x1, z0], [rb, zm], [ra, zm]], ye - k * z0, 0, k);
    facet([[x0, z1], [x1, z1], [rb, zm], [ra, zm]], ye + k * z1, 0, -k);
    facet([[x0, z0], [ra, zm], [x0, z1]], ye - k * x0, k, 0);
    facet([[x1, z0], [rb, zm], [x1, z1]], ye + k * x1, -k, 0);
    Z.edge(ra, zm, rb, zm, yr, 0, 0, 'roofEdge');
  }

  // ---- the street front of the middle block: s runs north-west from its south-east end
  const mf = wallFrame(FX, ZS, 0, -1), MW = ZS - ZN, bc = (j) => (j + 0.5) * BAY;
  const kindOf = (j) => (j >= LOGGIA[0] && j < LOGGIA[1] ? 'loggia' : PORTICOS.some(([a, b]) => j >= a && j < b) ? 'portico' : 'plain');
  const sL0 = LOGGIA[0] * BAY, sL1 = LOGGIA[1] * BAY, LOG_O = -1.25;
  const posterAt = (s, y0, y1, o, k) => { // one poster from the atlas, facing the street
    const Pm = B.poster, u0 = k * 0.25 + 0.004, u1 = u0 + 0.242, [a, b, c, d] = [at(mf, s - 0.72, y0, o), at(mf, s + 0.72, y0, o), at(mf, s + 0.72, y1, o), at(mf, s - 0.72, y1, o)];
    const i0 = Pm.vert(...a, 1, 0, 0, u0, 0); Pm.vert(...b, 1, 0, 0, u1, 0); Pm.vert(...c, 1, 0, 0, u1, 1); Pm.vert(...d, 1, 0, 0, u0, 1);
    Pm.quad(i0, i0 + 1, i0 + 2, i0 + 3);
  };
  let poster = 0;
  for (let j = 0; j < NB; j++) {
    const kind = kindOf(j), s0 = j * BAY, s1 = s0 + BAY, c = bc(j);
    if (kind === 'plain') {
      // arched recess with a window in it
      const arch = hole(c - 1.1, c + 1.1, F, Y(3.2), true), win = hole(c - 0.72, c + 0.72, Y(0.95), Y(3.0));
      W.setColor(PINK); wallCut(W, mf, s0, s1, F, Y(MID.g1), [arch]);
      W.setColor(PINK2); reveal(W, mf, arch, 0.35);
      W.setColor(PINK2); wallCut(W, mf, arch.a, arch.b, F, arch.y1, [win], -0.35);
      pane(W, mf, { ...arch, y0: arch.y1, y1: arch.y1 + 1e-3, r: arch.r }, -0.35);
      W.setColor(CREAM2); reveal(W, mf, win, 0.15, -0.35); glaze(mf, win, -0.5); nWin++;
      D.setColor(FRAME); block(D, mf, c - 0.04, c + 0.04, win.y0, win.y1, -0.52, -0.46, 1);
      D.setColor(CREAM); block(D, mf, win.a - 0.08, win.b + 0.08, win.y0 - 0.1, win.y0, -0.35, -0.22, 1 | 16);
      D.setColor(GRAN); plate(D, mf, s0, s1, gBase, F, 0.02);
      D.setColor(CREAM); for (const s of [s0, s1]) block(D, mf, s - 0.3, s + 0.3, F, Y(MID.g1), 0, 0.12, 1 | 4 | 8);
    } else if (kind === 'portico') {
      // glazed arch in the portico front at o = PORT_O, a meander panel under the glass, a poster on most of them
      const o = PORT_O, arch = hole(c - 1.0, c + 1.0, F, Y(3.3), true);
      W.setColor(PINK); wallCut(W, mf, s0, s1, F, Y(MID.g1), [arch], o);
      W.setColor(PINK2); reveal(W, mf, arch, 0.3, o);
      const M = B.meander, m0 = at(mf, arch.a, F, o - 0.3), m1 = at(mf, arch.b, F, o - 0.3), m2 = at(mf, arch.b, Y(0.75), o - 0.3), m3 = at(mf, arch.a, Y(0.75), o - 0.3);
      const i0 = M.vert(...m0, 1, 0, 0, 0, 0); M.vert(...m1, 1, 0, 0, 2 / 1.6, 0); M.vert(...m2, 1, 0, 0, 2 / 1.6, 1); M.vert(...m3, 1, 0, 0, 0, 1); M.quad(i0, i0 + 1, i0 + 2, i0 + 3);
      glaze(mf, { ...arch, y0: Y(0.75) }, o - 0.32, 0.5); nWin++;
      D.setColor(FRAME);
      block(D, mf, c - 0.04, c + 0.04, Y(0.75), arch.y1 + arch.r, o - 0.33, o - 0.27, 1);
      block(D, mf, arch.a, arch.b, arch.y1 - 0.04, arch.y1 + 0.04, o - 0.33, o - 0.27, 1);
      if (j !== 11) { posterAt(c, Y(1.05), Y(3.2), o - 0.1, poster % 4); poster++; }
      D.setColor(GRAN); plate(D, mf, s0, s1, gBase, F, o + 0.02);
      D.setColor(CREAM); for (const s of [s0, s1]) block(D, mf, s - 0.36, s + 0.36, F, Y(MID.g1), o, o + 0.15, 1 | 4 | 8);
    }
    // upper floor: a French window with an architrave and a hood, pilasters on the bay lines
    const win = hole(c - 0.75, c + 0.75, Y(MID.slab + 0.15), Y(8.45));
    W.setColor(PINK); wallCut(W, mf, s0, s1, Y(MID.slab), Y(MID.up), [win]);
    W.setColor(CREAM2); reveal(W, mf, win, 0.25); glaze(mf, win, -0.25, 0.35); nWin++;
    D.setColor(FRAME); block(D, mf, c - 0.035, c + 0.035, win.y0, win.y1, -0.27, -0.21, 1); block(D, mf, win.a, win.b, Y(7.55), Y(7.62), -0.27, -0.21, 1);
    D.setColor(CREAM);
    block(D, mf, win.a - 0.14, win.a, win.y0, win.y1 + 0.14, 0, 0.06, 1 | 4); block(D, mf, win.b, win.b + 0.14, win.y0, win.y1 + 0.14, 0, 0.06, 1 | 8);
    block(D, mf, win.a - 0.14, win.b + 0.14, win.y1, win.y1 + 0.14, 0, 0.06, 1);
    block(D, mf, win.a - 0.3, win.b + 0.3, Y(8.72), Y(8.92), 0, 0.22, 1 | 4 | 8 | 16 | 32);
    // oval oculus in the frieze: a cream ring round dark glass
    const oc = at(mf, c, Y(10.2), 0.04), ring = [], R0 = [0.46, 0.3], R1 = [0.34, 0.2];
    for (let k = 0; k <= 16; k++) { const t = (k / 16) * Math.PI * 2; ring.push([Math.cos(t), Math.sin(t)]); }
    for (let k = 0; k < 16; k++) {
      const [c0, n0] = ring[k], [c1, n1] = ring[k + 1];
      D.setColor(CREAM); D.face([at(mf, c + c0 * R1[0], Y(10.2) + n0 * R1[1], 0.08), at(mf, c + c1 * R1[0], Y(10.2) + n1 * R1[1], 0.08), at(mf, c + c1 * R0[0], Y(10.2) + n1 * R0[1], 0.08), at(mf, c + c0 * R0[0], Y(10.2) + n0 * R0[1], 0.08)], nOut(mf));
      B.glass.setColor('#2c353c'); B.glass.face([oc, at(mf, c + c0 * R1[0], Y(10.2) + n0 * R1[1], 0.04), at(mf, c + c1 * R1[0], Y(10.2) + n1 * R1[1], 0.04)], nOut(mf));
    }
  }
  const pil = (s, y0, y1) => { D.setColor(CREAM); block(D, mf, s - 0.25, s + 0.25, y0, y1, 0, 0.12, 1 | 4 | 8); block(D, mf, s - 0.32, s + 0.32, y1 - 0.2, y1, 0, 0.18, 1 | 4 | 8 | 16 | 32); };
  for (let j = 0; j <= NB; j++) pil(Math.min(MW - 0.32, Math.max(0.32, j * BAY)), Y(MID.slab), Y(MID.up));
  // frieze, cornice, attic
  D.setColor(CREAM); block(D, mf, 0, MW, Y(MID.up), Y(MID.up + 0.2), 0, 0.1, 1 | 32 | 16);
  W.setColor(PINK); plate(W, mf, 0, MW, Y(MID.up + 0.2), Y(MID.fr), 0);
  cornice(mf, 0, MW, Y(MID.fr), Y(MID.cor));
  W.setColor(PINK); plate(W, mf, 0, sL0, Y(MID.cor), Y(MID.att), 0); plate(W, mf, sL1, MW, Y(MID.cor), Y(MID.att), 0);
  D.setColor(CREAM);
  for (let j = 0; j <= NB; j++) { const s = Math.min(MW - 0.25, Math.max(0.25, j * BAY)); if (s < sL0 - 0.3 || s > sL1 + 0.3) block(D, mf, s - 0.25, s + 0.25, Y(MID.cor), Y(MID.att) - 0.12, 0, 0.12, 1 | 4 | 8); }
  for (const [a, b] of [[0, sL0], [sL1, MW]]) { block(D, mf, a, b, Y(MID.att), Y(MID.att) + 0.08, -0.32, 0.14, 1 | 16); W.setColor(PINK2); plate(W, mf, a, b, Y(MID.cor), Y(MID.att), -0.3, -1); D.setColor(CREAM); }
  // the raised central attic over the loggia, with four urns
  const CA = 3.5, yCA = Y(MID.catt);
  W.setColor(PINK); plate(W, mf, sL0, sL1, Y(MID.cor), yCA - 0.35, 0);
  block(W, mf, sL0, sL1, Y(MID.cor), yCA - 0.35, -CA, 0, 2 | 4 | 8);
  D.setColor(CREAM);
  for (let j = LOGGIA[0]; j <= LOGGIA[1]; j++) block(D, mf, j * BAY - 0.27, j * BAY + 0.27, Y(MID.cor), yCA - 0.35, 0, 0.14, 1 | 4 | 8);
  for (let j = LOGGIA[0]; j < LOGGIA[1]; j++) { D.setColor(CREAM2); block(D, mf, bc(j) - 0.95, bc(j) + 0.95, Y(MID.cor + 0.35), yCA - 0.7, 0, 0.05, 1); }
  D.setColor(CREAM); block(D, mf, sL0 - 0.2, sL1 + 0.2, yCA - 0.35, yCA, -CA - 0.2, 0.3, 63);
  for (let j = LOGGIA[0] + 1; j < LOGGIA[1]; j++) {
    const [x, , z] = at(mf, j * BAY, 0, 0.05);
    D.setColor(CREAM); D.box(x - 0.28, yCA, z - 0.28, x + 0.28, yCA + 0.25, z + 0.28);
    D.lathe([[0.16, yCA + 0.25], [0.1, yCA + 0.36], [0.27, yCA + 0.62], [0.2, yCA + 0.86], [0.12, yCA + 0.92], [0.17, yCA + 0.98], [0.05, yCA + 1.12], [0.0, yCA + 1.16]], 10, x, z);
    S.cyl(x, z, yCA, yCA + 1.15, 0.3, 0.3, 'statue');
  }
  S.box(FX - CA, Y(MID.att), mf.z - sL1, FX + 0.3, yCA, mf.z - sL0);

  // ground floor of the loggia: rusticated piers, the arched doors behind them, the dark fascia with the name, steps
  {
    const f = mf, yCeil = Y(4.0), yFas = Y(MID.slab), holes = [];
    for (let j = LOGGIA[0]; j < LOGGIA[1]; j++) holes.push(hole(bc(j) - 1.0, bc(j) + 1.0, F, Y(2.9), true));
    W.setColor(PINK); wallCut(W, f, sL0, sL1, F, yCeil, holes, LOG_O);
    for (const [i, h] of holes.entries()) {
      W.setColor(PINK2); reveal(W, f, h, 0.25, LOG_O);
      const c = (h.a + h.b) / 2, door = i > 0 && i < 4; // oak doors in the middle three arches
      B.lit.setColor('#8a7c62'); pane(B.lit, f, { ...h, y0: Y(2.75) }, LOG_O - 0.27);
      if (door) { D.setColor(OAK); plate(D, f, h.a, h.b, F, Y(2.75), LOG_O - 0.27); B.lit.setColor('#7c705c'); for (const d of [-0.45, 0.45]) plate(B.lit, f, c + d - 0.28, c + d + 0.28, Y(0.9), Y(2.4), LOG_O - 0.25); D.setColor('#3b2a1c'); block(D, f, c - 0.03, c + 0.03, F, Y(2.75), LOG_O - 0.27, LOG_O - 0.23, 1); }
      else glaze(f, { ...h, y1: Y(2.75), r: 0 }, LOG_O - 0.27, 1);
      D.setColor(FRAME); block(D, f, h.a, h.b, Y(2.72), Y(2.8), LOG_O - 0.28, LOG_O - 0.22, 1);
    }
    D.setColor(CREAM2); D.face([at(f, sL0, yCeil, LOG_O), at(f, sL1, yCeil, LOG_O), at(f, sL1, yCeil, 1.0), at(f, sL0, yCeil, 1.0)], V_DN);
    D.setColor('#7d7e7c'); D.face([at(f, sL0, F, LOG_O), at(f, sL1, F, LOG_O), at(f, sL1, F, 1.0), at(f, sL0, F, 1.0)], V_UP);
    for (let j = LOGGIA[0]; j <= LOGGIA[1]; j++) {
      const s = j * BAY, a = s - 0.38, b = s + 0.38;
      rusticated(D, f, a, b, gBase, yCeil, LOG_O, 1.0, 0.5, 1 | 4 | 8);
      const [x0, , z0] = at(f, a, 0, LOG_O), [x1, , z1] = at(f, b, 0, 1.0);
      box(x0, gBase, z0, x1, yCeil, z1);
      if (j > LOGGIA[0] && j < LOGGIA[1]) { const [lx, , lz] = at(f, s, 0, 1.0); lantern(lx, Y(2.7), lz, [1, 0]); }
    }
    D.setColor(FASCIA); block(D, f, sL0 - 0.38, sL1 + 0.38, yCeil, yFas, LOG_O, 1.1, 1 | 4 | 8 | 16 | 32);
    const sa = sL0 + 0.5, sb = sL1 - 0.5, E = B.sign, p = [at(f, sa, Y(4.12), 1.12), at(f, sb, Y(4.12), 1.12), at(f, sb, Y(5.48), 1.12), at(f, sa, Y(5.48), 1.12)];
    const i0 = E.vert(...p[0], 1, 0, 0, 0, 0); E.vert(...p[1], 1, 0, 0, 1, 0); E.vert(...p[2], 1, 0, 0, 1, 1); E.vert(...p[3], 1, 0, 0, 0, 1); E.quad(i0, i0 + 1, i0 + 2, i0 + 3);
    const [fx0, , fz0] = at(f, sL0 - 0.38, 0, LOG_O), [fx1, , fz1] = at(f, sL1 + 0.38, 0, 1.1);
    box(fx0, yCeil, fz0, fx1, yFas, fz1);
    // three granite steps down to the pavement
    for (let k = 0; k < 3; k++) {
      const yt = F - (RISE / 3) * k, o0 = 1.0 + 0.42 * k, o1 = o0 + 0.42;
      D.setColor(k % 2 ? STEP : '#949591'); block(D, f, sL0 - 0.8, sL1 + 0.8, gBase, yt, o0, o1, 1 | 4 | 8 | 16);
      const [x0, , z0] = at(f, sL0 - 0.8, 0, o0), [x1, , z1] = at(f, sL1 + 0.8, 0, o1);
      box(x0, gBase, z0, x1, yt, z1, 'step');
    }
  }
  // porticos and balconies: boxes, balustrades on the slabs
  for (const [ja, jb] of PORTICOS) {
    const a = ja * BAY, b = jb * BAY;
    W.setColor(PINK); block(W, mf, a - 0.36, b + 0.36, gBase, Y(MID.g1), 0, PORT_O, 4 | 8);
    const [x0, , z0] = at(mf, a - 0.36, 0, 0), [x1, , z1] = at(mf, b + 0.36, 0, PORT_O + 0.18);
    box(x0, gBase, z0, x1, Y(MID.slab), z1);
  }
  {
    const y = Y(MID.slab), line = (s, o) => { const p = at(mf, s, 0, o); return [p[0], p[2]]; };
    D.setColor(CREAM);
    for (const [ja, jb] of PORTICOS) block(D, mf, ja * BAY - 0.36, jb * BAY + 0.36, Y(MID.g1), y, 0, PORT_O + 0.18, 1 | 4 | 8 | 16 | 32);
    block(D, mf, 0, 2 * BAY - 0.36, Y(MID.g1), y, 0, 0.75, 1 | 4 | 16 | 32); block(D, mf, 13 * BAY + 0.36, MW, Y(MID.g1), y, 0, 0.75, 1 | 8 | 16 | 32);
    for (const [ja, jb] of PORTICOS) balustrade(line(ja * BAY - 0.2, PORT_O), line(jb * BAY + 0.2, PORT_O), y);
    for (const [a, b, turn] of [[0, 2 * BAY, 2 * BAY], [13 * BAY, MW, 13 * BAY]]) {
      balustrade(line(a + 0.2, 0.62), line(b, 0.62), y);
      balustrade(line(turn, 0.62), line(turn, PORT_O), y);
      const [x0, , z0] = at(mf, a, 0, 0), [x1, , z1] = at(mf, b, 0, 0.75);
      box(x0, Y(MID.g1), z0, x1, Y(MID.slab), z1);
    }
  }
  // the front block's collision: the street wall, set back behind the loggia
  {
    const zl0 = mf.z - sL1, zl1 = mf.z - sL0;
    prism([[129.9, ZN], [FX, ZN], [FX, zl0], [FX + LOG_O, zl0], [FX + LOG_O, zl1], [FX, zl1], [FX, ZS], [130.1, ZS]], gBase, Y(MID.att));
  }

  // ---- the pavilion fronts: paired corner pilasters, a pedimented porch, the triple arched window, the attic
  for (const v of VOLUMES.filter((q) => q.kind === 'pav')) {
    const [z0, z1] = v.span;
    const f = wallFrame(v.front, z1, 0, -1), w = z1 - z0, c = w / 2, top = Y(PAV.att);
    const win = hole(c - 1.3, c + 1.3, Y(6.4), Y(8.4), true), small = hole(c - 0.45, c + 0.45, Y(10.95), Y(11.5));
    D.setColor(GRAN); plate(D, f, 0, w, gBase, F, 0.04);
    W.setColor(PINK); wallCut(W, f, 0, w, F, Y(PAV.ent), [win, small]);
    W.setColor(CREAM2); reveal(W, f, win, 0.3); reveal(W, f, small, 0.2);
    glaze(f, win, -0.3, 0.6); glaze(f, small, -0.2, 0.2); nWin += 2;
    D.setColor(FRAME); for (const d of [-0.43, 0.43]) block(D, f, c + d - 0.04, c + d + 0.04, win.y0, win.y1 + Math.sqrt(1.69 - d * d), -0.32, -0.26, 1);
    block(D, f, win.a, win.b, win.y1 - 0.04, win.y1 + 0.04, -0.32, -0.26, 1);
    // architrave round the window, sill, hood with a keystone and a low pediment
    D.setColor(CREAM);
    block(D, f, win.a - 0.2, win.a, win.y0, win.y1, 0, 0.08, 1 | 4); block(D, f, win.b, win.b + 0.2, win.y0, win.y1, 0, 0.08, 1 | 8);
    for (let k = 0; k < ARC; k++) {
      const [sa, ya] = arcPt(win, k), [sb, yb] = arcPt(win, k + 1), sc = (win.r + 0.2) / win.r, cx = c;
      D.face([at(f, sa, ya, 0.08), at(f, sb, yb, 0.08), at(f, cx + (sb - cx) * sc, win.y1 + (yb - win.y1) * sc, 0.08), at(f, cx + (sa - cx) * sc, win.y1 + (ya - win.y1) * sc, 0.08)], nOut(f));
    }
    block(D, f, win.a - 0.35, win.b + 0.35, win.y0 - 0.16, win.y0, 0, 0.18, 1 | 4 | 8 | 16);
    block(D, f, c - 0.18, c + 0.18, Y(9.55), Y(10.05), 0, 0.14, 1 | 4 | 8);
    block(D, f, c - 1.85, c + 1.85, Y(10.05), Y(10.28), 0, 0.3, 1 | 4 | 8 | 16 | 32);
    const tri = [at(f, c - 1.85, Y(10.28), 0.3), at(f, c + 1.85, Y(10.28), 0.3), at(f, c, Y(10.7), 0.3)];
    D.face(tri, nOut(f));
    const slope = (ds, dy, side) => { const l = Math.hypot(ds, dy); return [f.rx * side * dy / l, ds / l, f.rz * side * dy / l]; };
    D.face([at(f, c - 1.85, Y(10.28), 0.3), at(f, c, Y(10.7), 0.3), at(f, c, Y(10.7), 0), at(f, c - 1.85, Y(10.28), 0)], slope(1.85, 0.42, -1));
    D.face([at(f, c, Y(10.7), 0.3), at(f, c + 1.85, Y(10.28), 0.3), at(f, c + 1.85, Y(10.28), 0), at(f, c, Y(10.7), 0)], slope(1.85, 0.42, 1));
    for (const [p0, p1, q0, q1] of [[small.a - 0.12, small.a, small.y0 - 0.1, small.y1 + 0.1], [small.b, small.b + 0.12, small.y0 - 0.1, small.y1 + 0.1],
      [small.a, small.b, small.y0 - 0.1, small.y0], [small.a, small.b, small.y1, small.y1 + 0.1]]) block(D, f, p0, p1, q0, q1, 0, 0.05, 1);
    // paired pilasters at both corners
    for (const [a, b, o] of [[0, 0.95, 0.2], [1.12, 1.62, 0.13], [w - 0.95, w, 0.2], [w - 1.62, w - 1.12, 0.13]]) {
      D.setColor(CREAM); block(D, f, a, b, F, Y(PAV.ent), 0, o, 1 | 4 | 8);
      block(D, f, a - 0.05, b + 0.05, F, Y(0.55), 0, o + 0.05, 1 | 4 | 8 | 16);
      block(D, f, a - 0.06, b + 0.06, Y(PAV.ent) - 0.3, Y(PAV.ent), 0, o + 0.07, 1 | 4 | 8 | 32);
    }
    // entablature, cornice, attic
    D.setColor(CREAM); block(D, f, -0.1, w + 0.1, Y(PAV.ent), Y(PAV.ent + 0.3), 0, 0.2, 1 | 4 | 8 | 32);
    W.setColor(PINK); plate(W, f, 0, w, Y(PAV.ent + 0.3), Y(PAV.fr), 0);
    cornice(f, 0, w, Y(PAV.fr), Y(PAV.cor), 0.8);
    W.setColor(PINK); plate(W, f, 0, w, Y(PAV.cor), top, 0);
    D.setColor(CREAM); for (const s of [0.45, 1.37, c, w - 1.37, w - 0.45]) block(D, f, s - 0.3, s + 0.3, Y(PAV.cor), top - 0.12, 0, 0.13, 1 | 4 | 8);
    D.setColor(CREAM2); for (const [a, b] of [[1.8, c - 0.45], [c + 0.45, w - 1.8]]) block(D, f, a, b, Y(PAV.cor + 0.4), top - 0.45, 0, 0.05, 1);
    D.setColor('#cfc6b1'); block(D, f, -0.05, w + 0.05, top, top + 0.1, -0.32, 0.16, 1 | 4 | 8 | 16);
    W.setColor(PINK2); plate(W, f, 0.3, w - 0.3, Y(PAV.cor), top, -0.3, -1);
    { const e0 = at(f, 0, 0, -0.1), e1 = at(f, w, 0, -0.1); Z.edge(e0[0], e0[2], e1[0], e1[2], top + 0.1, 1, 0); }
    // the porch: rusticated granite piers, a lintel, the oak door, entablature and pediment, steps
    const PO = 1.8, yL = Y(2.95), yE = Y(3.9), yP = Y(4.4), yT = Y(5.75);
    rusticated(D, f, c - 2.3, c - 1.5, gBase, yE, 0, PO, 0.49, 1 | 4 | 8);
    rusticated(D, f, c + 1.5, c + 2.3, gBase, yE, 0, PO, 0.49, 1 | 4 | 8);
    W.setColor(PINK); block(W, f, c - 1.5, c + 1.5, yL, yE, 0, PO, 1 | 32);
    D.setColor(CREAM); block(D, f, c - 1.05, c + 1.05, yL - 0.12, yL, PO - 0.02, PO + 0.04, 1 | 32);
    D.setColor(OAK); plate(D, f, c - 1.0, c + 1.0, F, yL, 0.03);
    B.lit.setColor('#7c705c'); for (const d of [-0.5, 0.5]) plate(B.lit, f, c + d - 0.32, c + d + 0.32, Y(0.9), Y(2.55), 0.05);
    D.setColor('#3b2a1c'); block(D, f, c - 0.03, c + 0.03, F, yL, 0.03, 0.07, 1);
    D.setColor('#7d7e7c'); D.face([at(f, c - 1.5, F, 0), at(f, c + 1.5, F, 0), at(f, c + 1.5, F, PO), at(f, c - 1.5, F, PO)], V_UP);
    D.setColor(CREAM); block(D, f, c - 2.45, c + 2.45, yE, yP, 0, PO + 0.15, 1 | 4 | 8 | 32);
    W.setColor(PINK); D.setColor(CREAM);
    W.face([at(f, c - 2.2, yP + 0.1, PO), at(f, c + 2.2, yP + 0.1, PO), at(f, c, yT - 0.2, PO)], nOut(f));
    for (const [sa, sb] of [[c - 2.45, c], [c, c + 2.45]]) {
      const ya = sa < c ? yP : yT, yb = sa < c ? yT : yP;
      D.face([at(f, sa, ya, PO + 0.15), at(f, sb, yb, PO + 0.15), at(f, sb, yb + 0.22, PO + 0.15), at(f, sa, ya + 0.22, PO + 0.15)], nOut(f));
    }
    block(D, f, c - 2.45, c + 2.45, yP, yP + 0.12, 0, PO + 0.15, 1);
    B.roof.setColor(ROOF);
    const rise = yT + 0.25 - yP - 0.12;
    B.roof.face([at(f, c - 2.6, yP + 0.12, 0), at(f, c, yT + 0.25, 0), at(f, c, yT + 0.25, PO + 0.3), at(f, c - 2.6, yP + 0.12, PO + 0.3)], slope(2.6, rise, -1));
    B.roof.face([at(f, c, yT + 0.25, 0), at(f, c + 2.6, yP + 0.12, 0), at(f, c + 2.6, yP + 0.12, PO + 0.3), at(f, c, yT + 0.25, PO + 0.3)], slope(2.6, rise, 1));
    for (const d of [-2.9, 2.9]) { const [lx, , lz] = at(f, c + d, 0, 0); lantern(lx, Y(3.3), lz, [1, 0]); }
    const [px0, , pz0] = at(f, c - 2.45, 0, 0), [px1, , pz1] = at(f, c + 2.45, 0, PO + 0.3);
    box(px0, gBase, pz0, px1, yT, pz1);
    for (let k = 0; k < 3; k++) {
      const yt = F - (RISE / 3) * k, o0 = PO + 0.4 * k, o1 = o0 + 0.4;
      D.setColor(k % 2 ? STEP : '#949591'); block(D, f, c - 2.9, c + 2.9, gBase, yt, o0, o1, 1 | 4 | 8 | 16);
      const [x0, , zz0] = at(f, c - 2.9, 0, o0), [x1, , zz1] = at(f, c + 2.9, 0, o1);
      box(x0, gBase, zz0, x1, yt, zz1, 'step');
    }
    // memorial plaques beside the porch
    D.setColor('#2e3134'); block(D, f, c + 3.3, c + 4.1, Y(1.4), Y(2.4), 0, 0.05, 1 | 4 | 8 | 16);
    D.setColor('#8a6a3a'); block(D, f, c + 3.4, c + 4.0, Y(2.15), Y(2.3), 0.05, 0.06, 1);
  }

  // ---- the pavement: cast-iron lanterns along the kerb
  const lamps = [];
  for (const z of [262, 274, 285.5, 297, 305.5, 317, 328.5, 340]) {
    const x = 174.3, y = gy(x, z);
    D.setColor(IRON);
    D.cyl(x, y, z, 0.24, 0.2, 0.55, 8); D.cyl(x, y + 0.55, z, 0.12, 0.08, 2.75, 8);
    D.cyl(x, y + 1.2, z, 0.13, 0.13, 0.12, 8); D.cyl(x, y + 3.25, z, 0.09, 0.2, 0.2, 8);
    B.lamp.setColor('#fff1d2'); B.lamp.cyl(x, y + 3.45, z, 0.17, 0.25, 0.62, 6, false);
    D.setColor(IRON); D.cyl(x, y + 4.07, z, 0.3, 0.05, 0.32, 6); D.cyl(x, y + 4.39, z, 0.05, 0.0, 0.25, 6);
    for (let k = 0; k < 6; k++) { const t = (k / 6) * Math.PI * 2 + Math.PI / 6; D.tube([x + Math.cos(t) * 0.18, y + 3.45, z + Math.sin(t) * 0.18], [x + Math.cos(t) * 0.26, y + 4.07, z + Math.sin(t) * 0.26], 0.018, 3); }
    S.cyl(x, z, y, y + 4.4, 0.16, 0.16, 'pole');
    lamps.push([x, z]);
  }

  // ---- the bust at the north-west end: a bronze head and shoulders on a granite pedestal
  const bronze = new SG();
  {
    const x = 167.6, z = 280.2, y = gy(x, z);
    D.setColor('#56585b'); D.box(x - 0.35, y, z - 0.35, x + 0.35, y + 1.35, z + 0.35); D.setColor('#6e7073'); D.box(x - 0.42, y + 1.35, z - 0.42, x + 0.42, y + 1.45, z + 0.42);
    bronze.ellipsoid([x, y + 1.62, z], [0.19, 0.17, 0.3], 14, 8); bronze.ellipsoid([x, y + 1.98, z], [0.12, 0.16, 0.13], 14, 8);
    bronze.ellipsoid([x - 0.02, y + 2.08, z], [0.13, 0.08, 0.14], 12, 6);
    S.box(x - 0.42, y, z - 0.42, x + 0.42, y + 2.15, z + 0.42, 'statue');
  }

  // ---- «Висока нота»: the steel wire from the south-east pavilion to a pole over the pavement, the violinist on it
  const A = [160, 0, 336.15], Pp = [179.8, 0, 356.5], OSM_ART = [173.1, 346.5];
  A[1] = Y(9.6); const yPole = gy(Pp[0], Pp[2]); Pp[1] = yPole + 10.2;
  const wd = [Pp[0] - A[0], Pp[2] - A[2]], wl = Math.hypot(...wd), tq = Math.max(0.2, Math.min(0.8, ((OSM_ART[0] - A[0]) * wd[0] + (OSM_ART[1] - A[2]) * wd[1]) / (wl * wl)));
  const Gx = A[0] + wd[0] * tq, Gz = A[2] + wd[1] * tq, Gy = gy(Gx, Gz) + 7.0;
  D.setColor('#2a2c2e');
  D.tube(A, [Gx, Gy - 0.02, Gz], 0.03, 5); D.tube([Gx, Gy - 0.02, Gz], Pp, 0.03, 5);
  D.box(A[0] - 0.2, A[1] - 0.25, A[2], A[0] + 0.2, A[1] + 0.25, A[2] + 0.06);
  D.setColor('#3e4246'); D.cyl(Pp[0], yPole, Pp[2], 0.45, 0.45, 0.25, 10); D.cyl(Pp[0], yPole + 0.25, Pp[2], 0.2, 0.11, 10.2, 10); D.cyl(Pp[0], Pp[1] - 0.2, Pp[2], 0.16, 0.16, 0.35, 10);
  S.cyl(Pp[0], Pp[2], yPole, Pp[1] + 0.15, 0.2, 0.12, 'pole');
  Z.add(Pp[0], Pp[1] + 0.15, Pp[2], 0, 1, 0, 'antenna');
  {
    // local frame: origin on the wire under her seat, X along the wire, Z the way she faces (towards the street), y up
    const ux = wd[0] / wl, uz = wd[1] / wl;
    let fx = uz, fz = -ux; if (fx < 0) { fx = -fx; fz = -fz; }
    const P = (x, y, z) => [Gx - ux * x + fx * z, Gy + y, Gz - uz * x + fz * z]; // (-u, up, f) is right-handed
    const G = bronze;
    const limb = (pts, rads) => G.tube(pts.map((p) => P(...p)), rads, 8);
    G.ellipsoid(P(0, 0.1, 0), [0.17, 0.12, 0.14], 12, 8);                                  // hips
    const torso = [[0.14, 0.1, 0.18], [0.12, 0.08, 0.3], [0.15, 0.1, 0.45], [0.17, 0.09, 0.58], [0.1, 0.07, 0.64]].map(([rx, rz, y]) => {
      const pts = [];
      for (let k = 0; k < 12; k++) { const t = -(k / 12) * Math.PI * 2; pts.push(P(Math.cos(t) * rx, y, Math.sin(t) * rz + 0.02 + y * 0.05)); }
      return pts;
    });
    G.loft(torso, { cap1: true });
    limb([[0, 0.63, 0.05], [0.01, 0.73, 0.06]], [0.045, 0.042]);                             // neck
    G.ellipsoid(P(0.02, 0.83, 0.07), [0.085, 0.11, 0.1], 12, 8);                             // head, tipped to the violin
    limb([[0.0, 0.88, -0.02], [0.0, 0.84, -0.1], [0.0, 0.72, -0.13], [0.0, 0.6, -0.12]], [0.045, 0.04, 0.032, 0.015]); // ponytail
    const skirt = [[0.15, 0.22, 0.12], [0.2, 0.08, 0.17], [0.24, -0.05, 0.25], [0.25, -0.12, 0.28]].map(([rx, y, rz]) => {
      const pts = [];
      for (let k = 0; k < 14; k++) { const t = -(k / 14) * Math.PI * 2; pts.push(P(Math.cos(t) * rx, y, Math.sin(t) * rz + (y < 0 ? 0.08 : 0.03))); }
      return pts;
    });
    G.loft(skirt);
    limb([[0.08, 0.02, 0.06], [0.1, 0.12, 0.36], [0.1, -0.24, 0.42], [0.11, -0.3, 0.5]], [0.085, 0.06, 0.04, 0.03]);     // left leg, knee up
    limb([[-0.08, 0.0, 0.06], [-0.08, -0.12, 0.3], [-0.07, -0.52, 0.28], [-0.07, -0.68, 0.33]], [0.085, 0.06, 0.04, 0.025]); // right leg hanging, toes down
    limb([[0.16, 0.58, 0.02], [0.23, 0.44, 0.2], [0.2, 0.62, 0.43]], [0.045, 0.036, 0.03]);  // left arm holds the neck
    limb([[-0.16, 0.58, 0.02], [-0.34, 0.52, 0.14], [-0.12, 0.63, 0.24]], [0.045, 0.036, 0.03]); // right arm draws the bow
    G.ellipsoid(P(0.08, 0.6, 0.2), [0.1, 0.035, 0.1], 10, 6);                                 // violin: lower and upper bouts
    G.ellipsoid(P(0.12, 0.61, 0.3), [0.08, 0.03, 0.08], 10, 6);
    limb([[0.13, 0.62, 0.34], [0.2, 0.62, 0.45]], [0.018, 0.016]);
    G.ellipsoid(P(0.21, 0.62, 0.47), [0.025, 0.025, 0.03], 8, 5);
    limb([[-0.22, 0.6, 0.26], [0.42, 0.7, 0.14]], [0.008, 0.006]);                           // the bow
    S.cyl(Gx, Gz, Gy - 0.7, Gy + 0.95, 0.35, 0.35, 'statue');
  }

  // ---- blue spruces at both ends (the High Note hangs over the south-east group)
  const spots = [], blue = [PARK_PINE[0].map(([rr, gg, bb]) => [0.8 * rr, 0.95 * gg, 1.25 * bb])];
  for (const [x, z, sc] of [[166, 351, 1.9], [164.5, 355, 1.6], [161.5, 359, 1.8], [158.5, 362, 1.5], [164, 366, 1.7], [160.5, 261, 1.8], [152.5, 261.3, 1.5]]) {
    spots.push({ x, z, kind: 'conifer', variant: 'spruce', sc: sc * (0.95 + 0.1 * r()), pal: blue, s3: [0.8, 1.2, 0.8] });
  }

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'philharmonic' });
  root.add(group);
  const plaster = stucco(r); plaster.repeat.set(0.25, 0.25);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: plaster, vertexColors: true, roughness: 0.88 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    lamp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xffe2b0, emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }),
    sign: new THREE.MeshStandardMaterial({ map: nameTex(), roughness: 0.35, metalness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
    poster: new THREE.MeshStandardMaterial({ map: posterTex(), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 }),
    meander: new THREE.MeshStandardMaterial({ map: meanderTex(), roughness: 0.4 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.42, metalness: 0.75 }),
  };
  M.sign.emissiveMap = M.sign.map; M.poster.emissiveMap = M.poster.map;
  let nV = 0;
  for (const [k, Bk] of Object.entries(B)) {
    if (!Bk.v) continue;
    nV += Bk.v;
    const see = k === 'glass' || k === 'lit' || k === 'lamp';
    group.add(Object.assign(new THREE.Mesh(Bk.build(), M[k]), { name: 'philharmonic-' + k, castShadow: !see, receiveShadow: true }));
  }
  nV += bronze.v;
  group.add(Object.assign(new THREE.Mesh(bronze.build(), M.bronze), { name: 'philharmonic-bronze', castShadow: true, receiveShadow: true }));
  console.log(`[cherkasy] Philharmonic: ${nWin} windows, ${lamps.length} lanterns, ${spots.length} spruces, ${(nV / 1000).toFixed(1)}k verts, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const inBox = (x, z, [x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1;
  return {
    footprints: [{ poly: lot, h: PAV.att + RISE, kind: 'public', name: 'Обласна філармонія' }],
    spots,
    // no generated trees on the block, its forecourt or under the wire (the spruces there are placed above)
    clear: (x, z) => inBox(x, z, [94, 263, 184, 339]) || inBox(x, z, [154, 339, 172, 369]),
    update() {
      const k = nightK.value;
      M.lit.emissiveIntensity = 1.25 * k; M.lamp.emissiveIntensity = 2.2 * k; M.sign.emissiveIntensity = 0.55 * k; M.poster.emissiveIntensity = 0.25 * k;
    },
  };
}
