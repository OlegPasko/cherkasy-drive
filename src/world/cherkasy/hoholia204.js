// OWNER: cherkasy. Новобудова на вул. Гоголя, 204 (also вул. Святотроїцька, 82; developer «Надія», OSM way 1303437479,
// tagged building=construction, 14 levels): the 104-flat fourteen-storey slab in the yard behind Гоголя, built as the
// developer's renders on lun.ua and nadiyabud.com show it (due 2027–28). Thirteen flats storeys over a tall ground floor
// of glazed premises. The long sides are drawn section by section from the renders: glazed loggia bays (white-framed
// panes over teal spandrels) projecting on canted cheeks, panels of grey render with one or two windows a floor inside a
// white frame that is crossed by a white band at varying storeys, grey or dark pilasters rising over the roof, on the
// yard (north-west) side the stair core as a canted stack of dark solid balconies between two runs of flush curtain glass,
// on the drive (south-east) side a white-piered stack of grey balconies. The north-east end is white with a grey band
// and glazed corners, the loggia of the drive side wrapping round it; the south-west end is a dark shaft with a light
// pilaster under two glazed cantilevers four storeys deep, and the underground car park's dark ramp house stands at its
// foot. Black caps crown the bays, the core rises a storey over the roof. No signs, no developer marks.
//   HOHOLIA204_SKIP: the OSM id replaced here (buildings.js skips its extrusion)
//   buildHoholia204({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, top } | null
//     top: the height of the main roof deck (tests)
// The facades are one painted atlas of storey-high tiles (loggia / curtain / render window / balcony door / shopfront /
// door / stair window), one quad per module per storey; the lit ones go to a second mesh whose emissive mask is the glass.
// Bays are open polylines in map metres laid in the ring's order, so the outward side is known (slabkit.js frames).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng, area2 } from './geo.js';
import { ringFaces, face, at, quad, box, rect, solid, finish } from './slabkit.js';

const OSM_ID = 1303437479;
export const HOHOLIA204_SKIP = new Set([OSM_ID]);

// the OSM outline in map metres: the slab runs south-west -> north-east, the yard to the north-west
const X0 = -373.8, X1 = -334.4, ZN = -482.8, ZS = -469.6;
const RING = [[X0, ZN], [X1, ZN], [X1, ZS], [X0, ZS]]; // faces: 0 yard (NW), 1 the Гоголя end (NE), 2 the drive (SE), 3 the car-park end (SW)
const GF = 4.2, FH = 3.0, NF = 13, PAR = 1.0, CANT = 4;   // ground floor, storey, flats storeys, parapet, cantilever storeys
const WHITE = '#ecebe6', GREY = '#8f8a84', TEAL = '#1d4b55', DARK = '#4a4d51', LGREY = '#c4c6c3', BLACK = '#1b1b1d', PIL = '#8b8d8e';

// atlas tiles, one storey x one module each
const T = { LOG: 0, CUR: 1, WIN: 2, BDOOR: 3, SHOP: 4, DOOR: 5, STAIR: 6, WINW: 7 }, NT = 8, TW = 128, TH = 256;

function atlas(mask) {
  return canvasTex(NT * TW, TH, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // a pane: fractions of the tile, x0 x1 across, y0 y1 up from the floor; bars at the given x / y fractions
    const pane = (t, x0, x1, y0, y1, frame, gt, gb, vx = [], hy = [], fw = 4) => {
      const X = t * TW, a = X + x0 * TW, b = X + x1 * TW, top = TH * (1 - y1), bot = TH * (1 - y0);
      if (mask) { fill('#fff', a, top, b - a, bot - top); return; }
      fill(frame, a - fw, top - fw, b - a + 2 * fw, bot - top + 2 * fw);
      const gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, gt); gr.addColorStop(1, gb); g.fillStyle = gr; g.fillRect(a, top, b - a, bot - top);
      g.fillStyle = frame;
      for (const v of vx) g.fillRect(X + v * TW - fw / 2, top, fw, bot - top);
      for (const h of hy) g.fillRect(a, TH * (1 - h) - fw / 2, b - a, fw);
    };
    const wall = (t, c, speck = false) => {
      fill(mask ? '#000' : c, t * TW, 0, TW, TH);
      if (mask || !speck) return;
      for (let i = 0; i < 260; i++) fill(i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(40,30,20,0.10)', t * TW + ((i * 53) % TW), (i * 97) % TH, 2, 2);
    };
    // loggia: the teal spandrel band at the slab, white-framed glazing over it, a mullion and a transom
    wall(T.LOG, TEAL); pane(T.LOG, 0.02, 0.98, 0.25, 0.985, '#f2f2ee', '#c2d2de', '#7a8fa1', [0.5], [0.8], 5);
    // flush curtain glass of the yard corners: a dark band, thin frames
    wall(T.CUR, '#26333b'); pane(T.CUR, 0.0, 1.0, 0.2, 0.99, '#d9dcdc', '#b4c5d2', '#61768a', [0.5], [0.8], 3);
    // a window in grey render, white frame
    wall(T.WIN, GREY, true); pane(T.WIN, 0.2, 0.8, 0.3, 0.86, '#f2f2ee', '#a7b8c6', '#566a7b', [0.5], [0.72], 5);
    // the yard side's panels: a white band at every slab, a broad window in grey render over it
    wall(T.WINW, GREY, true); if (!mask) fill(WHITE, T.WINW * TW, TH * 0.8, TW, TH * 0.2);
    pane(T.WINW, 0.1, 0.9, 0.3, 0.86, '#f2f2ee', '#a7b8c6', '#566a7b', [0.5], [0.72], 5);
    // the balcony doors of the stair core and the balcony stack: light wall, a door and a window
    wall(T.BDOOR, LGREY); pane(T.BDOOR, 0.1, 0.42, 0.02, 0.86, '#f2f2ee', '#9fb0bd', '#4c5d6b', [], [0.7], 4); pane(T.BDOOR, 0.55, 0.9, 0.36, 0.86, '#f2f2ee', '#9fb0bd', '#4c5d6b', [], [0.7], 4);
    // shopfront of the premises: dark frames, a transom
    wall(T.SHOP, '#2a2b2d'); pane(T.SHOP, 0.05, 0.95, 0.04, 0.95, '#262729', '#8c99a3', '#3f4850', [0.5], [0.78], 5);
    // the entrance: a dark glass door with side light
    wall(T.DOOR, '#2a2b2d'); pane(T.DOOR, 0.12, 0.88, 0.0, 0.92, '#1f2022', '#7f8c96', '#353d44', [0.62], [0.7], 6);
    // the stair head over the roof: light render, two small windows
    wall(T.STAIR, LGREY); pane(T.STAIR, 0.12, 0.4, 0.35, 0.75, '#f2f2ee', '#9fb0bd', '#4c5d6b'); pane(T.STAIR, 0.6, 0.88, 0.35, 0.75, '#f2f2ee', '#9fb0bd', '#4c5d6b');
  }, { repeat: false });
}

// the ring offset outward by d (mitred), for the overhanging caps
function grow(P, d) {
  const sg = Math.sign(area2(P)) || 1, n = P.length;
  return P.map((p, i) => {
    const a = P[(i + n - 1) % n], b = P[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [sg * e1[1] / l1, -sg * e1[0] / l1], n2 = [sg * e2[1] / l2, -sg * e2[0] / l2];
    const m = [n1[0] + n2[0], n1[1] + n2[1]], k = Math.max(0.5, (m[0] * n1[0] + m[1] * n1[1]));
    return [p[0] + m[0] * d / k, p[1] + m[1] * d / k];
  });
}

export function buildHoholia204({ root, map, solids: S, zips: Z, heightAt }) {
  if (!map.buildings.some((b) => b.id === OSM_ID)) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const hs = RING.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
  const yF = gHi + 0.15, gB = gLo - 0.6, y1 = yF + GF, ROOF = y1 + NF * FH, TOP = ROOF + PAR, yC = ROOF - CANT * FH;
  const B = { tile: new MB(), lit: new MB(), det: new MB(), roof: new MB() }, D = B.det, R = B.roof;
  const F = ringFaces(RING), sg = Math.sign(area2(RING)) || 1;
  const u0 = (t) => (t * TW + 1.5) / (NT * TW), u1 = (t) => ((t + 1) * TW - 1.5) / (NT * TW);
  let nTiles = 0, nLit = 0, nBal = 0;

  // one tile on face f over s0..s1, y0..y1, o off the wall; lit at random by the share p
  const tile = (f, t, s0, s1, y0, y1, p = 0, o = 0) => {
    const on = r() < p, M = on ? B.lit : B.tile; nTiles++; nLit += on;
    M.setColor('#ffffff');
    quad(M, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[u0(t), 0], [u1(t), 0], [u1(t), 1], [u0(t), 1]]);
  };
  // a run of tiles about mod metres wide, one per storey from ya to yb
  const rows = (f, t, s0, s1, ya, yb, mod, p, o = 0, h = FH) => {
    const n = Math.max(1, Math.round((s1 - s0) / mod)), w = (s1 - s0) / n;
    for (let y = ya; y < yb - 0.01; y += h) for (let i = 0; i < n; i++) tile(f, t, s0 + i * w, s0 + (i + 1) * w, y, Math.min(yb, y + h), p, o);
  };
  // an open polyline of map points in the ring's order -> one frame per segment, outward on the right
  const segs = (pts) => pts.slice(1).map((b, i) => {
    const a = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return face(a, b, sg * dz / l, -sg * dx / l);
  }).filter((f) => f.L > 0.05);
  const P = (f, s, o) => { const p = at(f, s, 0, o); return [p[0], p[2]]; };
  // a glazed bay: tiles on every segment, the underside, the black cap, the collider. close: the wall points behind it
  const bay = (pts, close, ya, yb, { t = T.LOG, p = 0.22, cap = true } = {}) => {
    for (const f of segs(pts)) rows(f, t, 0, f.L, ya, yb, 1.5, p);
    const poly = [...pts, ...close];
    D.setColor(TEAL); D.fill(poly, [], ya, false);
    if (cap) { D.setColor(BLACK); D.extrude(grow(poly, 0.25), [], yb, yb + 0.6, { bottom: true }); }
    else { R.setColor('#77746f'); R.fill(poly, [], yb, true); }
    S.prism(poly.flat(), ya, yb + (cap ? 0.6 : 0), 0, 0, 'wall');
  };

  // ---- the sections, read off the renders face by face (s runs along the ring: SW->NE, NW->SE, NE->SW, SE->NW)
  // log: loggia bay (p projection, cl / cr the canted cheeks); win: grey panel with n windows a floor in a white
  // frame (bands: storeys crossed by a white band); pil: pilaster over the roof; cur: flush curtain glass; core: the
  // stair's canted stack of dark balconies; balc: white piers with grey balconies; flat walls: white, joint, band, dark
  const LAY = [
    [{ k: 'log', w: 6.4, cl: 0, cr: 0.6 }, { k: 'pil', w: 0.6 }, { k: 'win', w: 4.2, n: 2, t: T.WINW }, { k: 'pil', w: 0.6 },
      { k: 'log', w: 4.8 }, { k: 'pil', w: 0.6 }, { k: 'win', w: 4.2, n: 2, t: T.WINW }, { k: 'pil', w: 0.6 }, { k: 'log', w: 4.8 },
      { k: 'cur', w: 3.4 }, { k: 'core', w: 5.2 }, { k: 'cur', w: 4.0 }],
    [{ k: 'cur', w: 3.0 }, { k: 'white', w: 2.4 }, { k: 'band', w: 1.2 }, { k: 'white', w: 3.6 }, { k: 'wrap', w: 3.0 }],
    [{ k: 'wrapped', w: 6.0 }, { k: 'joint', w: 0.9 }, { k: 'win', w: 3.4, n: 1, bands: [5, 10] }, { k: 'log', w: 4.4 },
      { k: 'win', w: 3.2, n: 1, bands: [3, 8] }, { k: 'log', w: 4.6 }, { k: 'pil', w: 0.6, col: DARK }, { k: 'win', w: 4.4, n: 2, bands: [6] },
      { k: 'balc', w: 3.2 }, { k: 'win', w: 4.4, n: 2, bands: [4, 9] }, { k: 'log', w: 4.3, cl: 0.6, cr: 0 }],
    [{ k: 'lpil', w: 2.2, cant: 1 }, { k: 'dark', w: 1.8, cant: 1 }, { k: 'dark', w: 6.6 }, { k: 'lpil', w: 1.0, cant: 1 }, { k: 'dark', w: 1.6, cant: 1 }],
  ];
  for (const [fi, list] of LAY.entries()) {
    const f = F[fi]; let s = 0;
    for (const q of list) {
      const s0 = s, s1 = s + q.w; s += q.w;
      const top = q.cant ? yC : ROOF; // under a cantilever the wall stops at its floor
      if (q.k === 'log') {
        const pr = q.p ?? 1.0, cl = q.cl ?? 0.6, cr = q.cr ?? 0.6;
        bay([P(f, s0, 0), P(f, s0 + cl, pr), P(f, s1 - cr, pr), P(f, s1, 0)], [], y1, ROOF);
      } else if (q.k === 'wrap') {
        // the drive side's corner loggia turns round the Гоголя end: one polyline over both faces
        const g = F[2], pr = 1.0;
        bay([P(f, s0, 0), P(f, s0 + 0.6, pr), P(f, f.L + pr, pr), P(g, 6.0 - 0.6, pr), P(g, 6.0, 0)], [[X1, ZS]], y1, ROOF);
      } else if (q.k === 'win') {
        const fw = 0.45; D.setColor(GREY); rect(D, f, s0, s1, y1, top);
        rows(f, q.t ?? T.WIN, s0 + fw, s1 - fw, y1, top, (s1 - s0 - 2 * fw) / q.n, 0.28, 0.01);
        D.setColor(WHITE);
        box(D, f, s0, s0 + fw, y1, top + PAR, 0, 0.2, 'flrt'); box(D, f, s1 - fw, s1, y1, top + PAR, 0, 0.2, 'flrt');
        for (const k of q.bands ?? []) box(D, f, s0 + fw, s1 - fw, y1 + k * FH - 0.2, y1 + k * FH + 0.25, 0, 0.16, 'ftu');
        box(D, f, s0 + fw, s1 - fw, top - 0.1, top + PAR, 0, 0.16, 'ftu');
      } else if (q.k === 'pil') {
        D.setColor(q.col ?? PIL); box(D, f, s0, s1, y1 - 0.3, top + 1.6, 0, 0.4, 'flrt');
      } else if (q.k === 'lpil') {
        D.setColor(LGREY); box(D, f, s0, s1, yF, top, 0, 0.3, 'flrt');
      } else if (q.k === 'cur') {
        rows(f, T.CUR, s0, s1, y1, top, 1.4, 0.3, 0.01);
      } else if (q.k === 'core') {
        // the stair core: a canted stack, light walls with balcony doors, a dark solid balcony front at every floor,
        // one storey over the roof with two small windows under a light cap
        const pr = 1.6, c = 0.8, pts = [P(f, s0, 0), P(f, s0 + c, pr), P(f, s1 - c, pr), P(f, s1, 0)];
        for (const g of segs(pts)) {
          rows(g, T.BDOOR, 0, g.L, y1, ROOF, 1.6, 0.25);
          rows(g, T.STAIR, 0, g.L, ROOF, ROOF + 2.6, 4, 0.5);
          D.setColor('#4a4d50');
          for (let k = 0; k < NF; k++) { const y = y1 + k * FH; box(D, g, -0.12, g.L + 0.12, y - 0.15, y + 1.35, 0, 0.35, 'ftu'); nBal++; }
        }
        D.setColor(TEAL); D.fill(pts, [], y1, false);
        D.setColor(LGREY); D.extrude(grow(pts, 0.2), [], ROOF + 2.6, ROOF + 3.1, { bottom: true });
        S.prism(pts.flat(), y1, ROOF + 3.1, 0, 0, 'wall');
        // the residents' door under it, with a canopy
        tile(f, T.DOOR, s0 + 1.0, s1 - 1.0, yF, yF + 3.0, 0.9, 0.02);
        D.setColor(BLACK); box(D, f, s0 + 0.4, s1 - 0.4, yF + 3.1, yF + 3.35, 0, 1.4, 'ftlru');
      } else if (q.k === 'balc') {
        // white piers proud of a light recess, grey balconies hung between them at every floor
        const pw = 0.5, a = s0 + pw, b = s1 - pw;
        rows(f, T.BDOOR, a, b, y1, top, b - a, 0.25);
        D.setColor(WHITE); box(D, f, s0, a, y1 - 0.3, top + 1.6, 0, 1.3, 'flrt'); box(D, f, b, s1, y1 - 0.3, top + 1.6, 0, 1.3, 'flrt');
        box(D, f, s0, s1, top + 1.2, top + 1.6, 0, 1.3, 'ftu');
        D.setColor('#6e6f70');
        for (let k = 0; k < NF; k++) { const y = y1 + k * FH; box(D, f, a, b, y - 0.2, y + 1.0, 0, 1.2, 'ftu'); nBal++; }
        solid(S, f, s0, s1, 0, 1.3, y1, top + 1.6);
      } else if (q.k !== 'wrapped') {
        D.setColor({ white: WHITE, joint: '#4a4c4f', band: PIL, dark: DARK }[q.k]); rect(D, f, s0, s1, fi === 3 ? yF : y1, top);
      }
    }
    // the ground floor: shopfronts behind dark granite piers on three sides, dark stone on the car-park end
    if (fi === 3) { D.setColor(DARK); rect(D, f, 0, f.L, yF, y1); }
    else {
      const n = Math.max(1, Math.round(f.L / 3.1)), w = f.L / n, core = fi === 0 ? LAY[0].slice(0, 10).reduce((a, q) => a + q.w, 0) : -9;
      for (let i = 0; i < n; i++) {
        const a = i * w, b = a + w;
        if (b > core - 0.2 && a < core + LAY[0][10].w + 0.2) { D.setColor('#2a2b2d'); rect(D, f, a, b, yF, y1); } // the stair's door goes here
        else tile(f, fi === 2 && i % 4 === 1 ? T.DOOR : T.SHOP, a, b, yF, y1, fi === 2 ? 0.75 : 0.4);
      }
      D.setColor('#2b2b2d');
      for (let i = 0; i <= n; i++) { const s = Math.min(f.L - 0.2, Math.max(0.2, i * w)); box(D, f, s - 0.2, s + 0.2, yF, y1, 0, 0.18, 'flr'); }
    }
    D.setColor('#55575a'); box(D, f, -0.3, f.L + 0.3, y1 - 0.35, y1 + 0.05, 0, 0.3, 'ftu'); // the first floor's slab edge
    D.setColor('#2e2f31'); box(D, f, 0, f.L, gB, yF, 0, 0.12, 'ft');                        // plinth
    D.setColor(fi === 3 ? DARK : WHITE); box(D, f, 0, f.L, ROOF, TOP, -0.3, 0.02, 'fbt');     // parapet
    { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz); }
  }

  // ---- the south-west end: two glazed cantilevers over the dark shaft, wrapping the loggias of both long sides
  { const f = F[3];
    for (const [a, b] of [[-1.0, 4.0], [f.L - 2.6, f.L + 1.0]]) {
      const pr = 1.4; bay([P(f, a, 0), P(f, a, pr), P(f, b, pr), P(f, b, 0)], [], yC, ROOF, { p: 0.35 });
    }
  }

  // ---- the car park's ramp house at the south-west end: dark tiles, the ramp door, a P sign
  { const f = F[3], d = 6.4, s0 = 0.3, s1 = 11.4, h = 3.6;
    D.setColor('#38393b'); box(D, f, s0, s1, gB, yF + h, 0, d, 'flrt', [1.2, 1.2]);
    D.setColor('#1f2022'); box(D, f, s0 + 0.6, s0 + 3.6, yF, yF + 2.6, d, d + 0.05, 'f');          // the ramp door (south end)
    D.setColor('#2f62b0'); box(D, f, s0 + 3.9, s0 + 4.5, yF + 2.6, yF + 3.2, d, d + 0.06, 'f');     // the P sign
    D.setColor('#ffffff'); box(D, f, s0 + 4.08, s0 + 4.32, yF + 2.72, yF + 3.08, d + 0.06, d + 0.07, 'f');
    solid(S, f, s0, s1, 0, d, gB, yF + h);
  }

  // ---- roof: the deck, a lift room
  R.setColor('#77746f'); R.fill(RING, [], ROOF + 0.02, true);
  R.setColor('#d8d8d4'); R.box(X1 - 14, ROOF, ZN + 4, X1 - 9, ROOF + 2.8, ZN + 9, 63);
  S.box(X1 - 14, ROOF, ZN + 4, X1 - 9, ROOF + 2.8, ZN + 9, 'equipment');
  S.prism(RING.flat(), gB, ROOF, 0, 0, 'wall');
  for (const f of F) solid(S, f, 0, f.L, -0.3, 0, ROOF, TOP); // the parapet, so a car can land on the deck inside it

  const tex = atlas(false), mask = atlas(true);
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.55, metalness: 0.1 }),
    lit: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.5, metalness: 0.1, emissive: 0xffc890, emissiveMap: mask, emissiveIntensity: 0 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  };
  const out = finish(root, 'hoholia204', B, M, { shade: ['tile', 'lit', 'det'] });
  console.log(`[cherkasy] Hoholia 204: ${nTiles} tiles (${nLit} lit), ${nBal} balconies, roof ${(ROOF - yF).toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    top: ROOF,
    footprints: [{ poly: RING.map((p) => [p[0], p[1]]), h: TOP - gLo, kind: 'apt', name: 'вул. Гоголя, 204' }],
    clear: (x, z) => x > X0 - 8 && x < X1 + 2 && z > ZN - 2.5 && z < ZS + 2.5,
    update() { M.lit.emissiveIntensity = 0.45 * nightK.value; },
  };
}
