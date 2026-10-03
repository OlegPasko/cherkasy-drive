// OWNER: cherkasy. The ЧНУ (Bohdan Khmelnytsky National University) dormitories №3 and №4, вул. Хрещатик 64 and 62
// (OSM ways 103587765 and 104380675; issue #35: "детальніші тротуари та вхід у гуртожиток"). Two twin five-storey
// corridor blocks of light sand-lime brick, end-on to Хрещатик, their entrances facing each other across one shared
// yard, as the university's photos show them (cdu.edu.ua, 2015 and 2021): a white-rendered plinth, rows of white
// two-leaf windows one per bay, a band of small attic vents under a plain concrete cornice, a flat roof with vent
// stacks. №4 (north-west) has the enclosed peach vestibule under a dark-brown canopy on one steel post, a flight of
// steps and a ramp with black rails along the wall, a blank blue plaque by the door, the flag over it, and two stacks
// of recessed loggias with yellow-orange fronts. №3 (south-east) has the wide canopy three bays long between dark-red
// side walls over a low platform and the peach-rendered wall, steps with yellow nosings, a ramp with blue-green rails
// and the yellow gas pipe along the wall over the ground floor. The yard: the asphalt
// drive in from the west, asphalt forecourts at both doors, block-paver walks along both blocks, the diagonal path
// across and the two pavements along Хрещатик (kerbed against the carriageway), kerbed flower beds along the walls,
// thujas, benches, bins and yard lamps. Kerbs are found by rasterising the surfaces (0.1 m cells) and edging every
// paved cell that meets lawn or bare ground. No names or signs on the walls.
//   CHNUDORMS_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildChnuDorms({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, dorms, surf(x, z) } | null
//     dorms: [{ id, floor, roof, door: [x, z] }] (tests);  surf(x, z): the yard raster code there (0 untouched ground,
//     1 flower bed, 2 asphalt, 3 pavers, 4 the diagonal path, 9 building / porch) (tests)
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { rng, inPoly } from './geo.js';
import { brickTex } from './civic.js';
import { ringFaces, face, at, quad, box, rect, solid, finish, speckle } from './slabkit.js';

const ID3 = 103587765, ID4 = 104380675;
export const CHNUDORMS_SKIP = new Set([ID3, ID4]);

// the OSM outlines (№4's needless mid-vertex on its yard side dropped); x runs north-east toward Хрещатик
const RING4 = [[85.1, -1619.8], [154.1, -1619.5], [154.1, -1604.8], [85.0, -1605.1]];
const RING3 = [[99.9, -1575.2], [153.3, -1575.6], [153.4, -1560.3], [100.0, -1559.9]];
// the entrances on the yard sides, where the OSM drive and paths meet the walls (map x)
const DOOR4_X = 124, DOOR3_X = 122;
const FH = 2.9, NF = 5, ATTIC = 1.15, PITCH = 3.3;                  // storey, storeys, the vent band over the top floor, bay
const BRICK = '#e9e4d8', PLINTH = '#e9e7e1', CORNICE = '#cfccc4', ROOFC = '#55575a';
const PEACH = '#e6b896', CANOPY = '#4a3127', MAROON = '#6b3a31', YELLOW = '#f0a72e';
const LIFT = { bed: 0.2, asph: 0.22, pave: 0.21 };                   // over heightAt; the ground's own layers lie ~0.15-0.19 up

// ---- textures
const T = { WIN: 0, WIN2: 1, DOOR: 2, VEST: 3, LOGD: 4, VENT: 5 }, NT = 6, TW = 128;
function atlas(mask) {
  return canvasTex(NT * TW, TW, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // a white frame round glass split by mullions (fractions of the tile) and a transom; curtain: a pale band
    const pane = (t, vx, ty, { fw = 7, frame = '#f3f2ee', glass = ['#9db0bf', '#3e4c58'], curtain = null, half = false } = {}) => {
      const X = t * TW;
      if (mask) { fill('#000', X, 0, TW, TW); fill('#fff', X + fw, fw, TW - 2 * fw, TW - 2 * fw); return; }
      fill('#6f6a62', X, 0, TW, TW);                                  // the reveal's shadow round the frame
      fill(frame, X + 3, 3, TW - 6, TW - 6);
      const gr = g.createLinearGradient(0, 0, 0, TW); gr.addColorStop(0, glass[0]); gr.addColorStop(1, glass[1]);
      g.fillStyle = gr; g.fillRect(X + fw, fw, TW - 2 * fw, TW - 2 * fw);
      if (curtain) { fill(curtain, X + fw, fw, (TW - 2 * fw) * 0.22, TW - 2 * fw); fill(curtain, X + TW - fw - (TW - 2 * fw) * 0.22, fw, (TW - 2 * fw) * 0.22, TW - 2 * fw); }
      g.fillStyle = frame;
      for (const v of vx) g.fillRect(X + v * TW - fw / 2, 0, fw, TW);
      if (ty) g.fillRect(X, ty * TW - fw / 2, TW * (half ? 0.5 : 1), fw);
      fill('rgba(0,0,0,0.25)', X + 3, 3, TW - 6, 4);                  // the lintel's shadow
    };
    pane(T.WIN, [0.5], 0, { curtain: 'rgba(236,226,206,0.85)' });               // two sashes
    pane(T.WIN2, [0.5], 0.3, { glass: ['#8fa3b3', '#34414c'], half: true });      // two sashes, a top light in one
    // the wooden double door with glazed upper panels
    { const X = T.DOOR * TW;
      if (mask) { fill('#000', X, 0, TW, TW); fill('#fff', X + 18, 14, 40, 50); fill('#fff', X + 70, 14, 40, 50); }
      else {
        fill('#5b3a26', X, 0, TW, TW); fill('#7a5236', X + 6, 6, TW - 12, TW - 6);
        fill('#3a2a20', X + TW / 2 - 2, 0, 4, TW);
        for (const x0 of [18, 70]) { fill('#2c3a44', X + x0, 14, 40, 50); fill('#6a4630', X + x0, 74, 40, 46); }
      } }
    pane(T.VEST, [0.33, 0.66], 0.28, { fw: 6 });
    // a loggia's back wall: a balcony door beside a window
    { const X = T.LOGD * TW;
      if (mask) { fill('#000', X, 0, TW, TW); fill('#fff', X + 10, 10, 38, 112); fill('#fff', X + 62, 10, 56, 60); }
      else {
        fill(PEACH, X, 0, TW, TW);
        fill('#f3f2ee', X + 4, 4, 48, 124); fill('#3f4d58', X + 10, 10, 36, 112);
        fill('#f3f2ee', X + 56, 4, 68, 72); fill('#4a5964', X + 62, 10, 56, 60); fill('#f3f2ee', X + 88, 4, 5, 72);
      } }
    { const X = T.VENT * TW; fill(mask ? '#000' : '#2a2724', X, 0, TW, TW); }
  }, { repeat: false });
}
// rectangular concrete pavers in running bond, 0.2 x 0.1 m: a 1.6 m repeat of 8 x 16
const paverTex = (r) => canvasTex(512, 512, (g, w) => {
  g.fillStyle = '#77736d'; g.fillRect(0, 0, w, w);
  for (let j = 0; j < 16; j++) for (let i = -1; i < 8; i++) {
    const k = 0.9 + r() * 0.14, x = i * 64 + (j & 1) * 32, warm = r() < 0.12;
    g.fillStyle = warm ? `rgb(${168 * k | 0},${150 * k | 0},${138 * k | 0})` : `rgb(${172 * k | 0},${170 * k | 0},${164 * k | 0})`;
    g.fillRect(x + 2, j * 32 + 2, 60, 28);
  }
  for (let q = 0; q < 2500; q++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'; g.fillRect(r() * w, r() * w, 2, 2); }
});
const asphaltTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#58595b'; g.fillRect(0, 0, w, w);
  for (let q = 0; q < 9000; q++) { const v = 60 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v},${v + 2},0.5)`; g.fillRect(r() * w, r() * w, 1 + r() * 1.5, 1 + r() * 1.5); }
  for (let q = 0; q < 14; q++) { g.fillStyle = 'rgba(30,30,32,0.08)'; g.beginPath(); g.ellipse(r() * w, r() * w, 10 + r() * 30, 6 + r() * 16, r() * 3, 0, 7); g.fill(); } // old patches
});
const bedTex = (r) => canvasTex(256, 256, (g, w) => {
  g.fillStyle = '#4f7a34'; g.fillRect(0, 0, w, w);
  for (let q = 0; q < 6000; q++) { g.fillStyle = r() < 0.5 ? 'rgba(20,50,10,0.25)' : 'rgba(170,200,110,0.18)'; g.fillRect(r() * w, r() * w, 1 + r() * 3, 1 + r() * 3); }
  const fl = ['#e8d13a', '#d9473b', '#f2f0ea', '#c860b4', '#f08a2c'];
  for (let q = 0; q < 70; q++) { const cx = r() * w, cy = r() * w, c = fl[r() * fl.length | 0]; for (let k = 0; k < 7; k++) { g.fillStyle = c; g.fillRect(cx + (r() - 0.5) * 14, cy + (r() - 0.5) * 14, 3, 3); } }
  for (let q = 0; q < 300; q++) { g.fillStyle = 'rgba(80,55,35,0.35)'; g.fillRect(r() * w, r() * w, 2 + r() * 4, 2); } // soil between the plants
});

// ---- the yard raster: 0.1 m cells over the site, the surface code per cell
const RX0 = 79, RX1 = 169.6, RZ0 = -1630, RZ1 = -1550, RES = 0.1, NXR = Math.round((RX1 - RX0) / RES), NZR = Math.round((RZ1 - RZ0) / RES);
const C = { GROUND: 0, BED: 1, ASPH: 2, PAVE: 3, PATH: 4, HARD: 9 };

export function buildChnuDorms({ root, map, solids: S, zips: Z, heightAt }) {
  if (!map.buildings.some((b) => b.id === ID3 || b.id === ID4)) return null;
  const t0 = performance.now(), r = rng(ID4 % 65521), n0 = S.count;
  const B = { brick: new MB(), det: new MB(), tile: new MB(), lit: new MB(), glow: new MB(), roof: new MB(), asph: new MB(), pave: new MB(), bed: new MB() };
  const D = B.det;
  const u0 = (t) => (t * TW + 1) / (NT * TW), u1 = (t) => ((t + 1) * TW - 1) / (NT * TW);
  const neg = (v) => v.map((q) => -q);
  const sAt = (f, x, z) => (x - f.ax) * f.ux + (z - f.az) * f.uz;
  let nWin = 0, nLit = 0;
  const win = (f, t, s0, s1, ya, yb, p = 0.3, o = 0.03) => {
    const on = t !== T.VENT && r() < p, M = on ? B.lit : B.tile; nWin++; nLit += on;
    M.setColor('#ffffff');
    quad(M, at(f, s0, ya, o), at(f, s1, ya, o), at(f, s1, yb, o), at(f, s0, yb, o), f.N, [[u0(t), 0], [u1(t), 0], [u1(t), 1], [u0(t), 1]]);
  };

  // ---- the raster
  const grid = new Uint8Array(NXR * NZR);
  const ci = (x) => Math.floor((x - RX0) / RES), cj = (z) => Math.floor((z - RZ0) / RES);
  const surf = (x, z) => { const i = ci(x), j = cj(z); return i < 0 || j < 0 || i >= NXR || j >= NZR ? 0 : grid[j * NXR + i]; };
  const paintPoly = (P, code) => {
    const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
    for (let j = Math.max(0, cj(Math.min(...zs))); j <= Math.min(NZR - 1, cj(Math.max(...zs))); j++) {
      const z = RZ0 + (j + 0.5) * RES;
      for (let i = Math.max(0, ci(Math.min(...xs))); i <= Math.min(NXR - 1, ci(Math.max(...xs))); i++) if (inPoly(P, RX0 + (i + 0.5) * RES, z)) grid[j * NXR + i] = code;
    }
  };
  const R4 = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

  // ---- the surfaces: drawn draped, painted into the raster in the same order (later wins)
  // a quad p00 p10 p11 p01 draped on the ground in cells of <= 2 m; uv in metres / rep along (ua) and across it
  // the drive's mouth at the raster's west edge sinks to the street's own asphalt (laid at the terrain) over 3 m
  const drape = (Dm, P, lift0, rep, ua = [1, 0]) => {
    const lift = (x) => (Dm === B.asph ? Math.min(lift0, 0.02 + Math.max(0, x - RX0) * 0.07) : lift0);
    const [p00, p10, p11, p01] = P, L0 = Math.hypot(p10[0] - p00[0], p10[1] - p00[1]), L1 = Math.hypot(p01[0] - p00[0], p01[1] - p00[1]);
    const ns = Math.max(1, Math.ceil(L0 / 2)), no = Math.max(1, Math.ceil(L1 / 2)), id = [];
    Dm.setColor('#ffffff');
    for (let j = 0; j <= no; j++) for (let i = 0; i <= ns; i++) {
      const s = i / ns, t = j / no;
      const x = (p00[0] * (1 - s) + p10[0] * s) * (1 - t) + (p01[0] * (1 - s) + p11[0] * s) * t;
      const z = (p00[1] * (1 - s) + p10[1] * s) * (1 - t) + (p01[1] * (1 - s) + p11[1] * s) * t;
      id.push(Dm.vert(x, heightAt(x, z) + lift(x), z, 0, 1, 0, (x * ua[0] + z * ua[1]) / rep, (-x * ua[1] + z * ua[0]) / rep));
    }
    // face up whatever the corner order
    const up = (p10[0] - p00[0]) * (p01[1] - p00[1]) - (p10[1] - p00[1]) * (p01[0] - p00[0]) < 0;
    for (let j = 0; j < no; j++) for (let i = 0; i < ns; i++) {
      const a = j * (ns + 1) + i, b = a + 1, c = a + ns + 2, d = a + ns + 1;
      if (up) Dm.quad(id[a], id[b], id[c], id[d]); else Dm.quad(id[a], id[d], id[c], id[b]);
    }
  };
  const area = (code, P, ua) => {
    paintPoly(P, code);
    if (code === C.BED) drape(B.bed, P, LIFT.bed, 3.0, ua);
    else if (code === C.ASPH) drape(B.asph, P, LIFT.asph, 5.0, ua);
    else if (code === C.PAVE || code === C.PATH) drape(B.pave, P, LIFT.pave, 1.6, ua);
  };
  // Хрещатик's carriageway edge on the dorms' side: the OSM centreline (175, -1469) -> (169, -1699), 7.8 m wide
  const pathEdges = [];
  const kerbX = (z) => 175 + (z + 1469) * (6 / 230) - 3.9;

  // flower beds along both yard walls (the porches, ramps and walks cut into them below)
  area(C.BED, R4(85.6, -1605.4, 153.6, -1599.2));
  area(C.BED, R4(100.4, -1578.2, 152.9, -1575.0));
  // asphalt: the drive in from the west, its arm north to №3, the two forecourts
  area(C.ASPH, R4(RX0, -1595.9, 123.2, -1591.4));
  area(C.ASPH, R4(118.7, -1591.4, 123.2, -1584));
  area(C.ASPH, R4(110, -1587, 137, -1578.2));                         // №3's forecourt, up to its steps
  area(C.ASPH, R4(114, -1600.2, 134, -1595.9));                       // №4's forecourt
  // block-paver walks: along №3 (OSM), along №4 east of its forecourt (OSM), the two Хрещатик pavements and the
  // links across the verge between them, the apron at the foot of each ramp
  area(C.PAVE, R4(RX0, -1580.4, 110, -1578.2)); area(C.PAVE, R4(137, -1580.4, 161, -1578.2));
  area(C.PAVE, R4(134, -1599.2, 161, -1597.0));
  area(C.PAVE, R4(158.6, RZ0, 161, RZ1), [0, 1]);
  area(C.PAVE, [[kerbX(RZ0) - 4.4, RZ0], [kerbX(RZ0), RZ0], [kerbX(RZ1), RZ1], [kerbX(RZ1) - 4.4, RZ1]], [0, 1]);
  for (const z of [-1580.4, -1599.2]) area(C.PAVE, R4(161, z, kerbX(z + 1.1) - 4.3, z + 2.2));
  // the diagonal path across the yard (OSM), from №3's forecourt to the walk along №4, its ends cut square to them
  { const a = [134.34, -1587], b = [150, -1597.0], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, hw = 1.0 / Math.abs(dz);
    const P = [[a[0] - hw, a[1]], [a[0] + hw, a[1]], [b[0] + hw, b[1]], [b[0] - hw, b[1]]];
    area(C.PATH, P, [dx, dz]);
    pathEdges.push([P[0], P[3]], [P[1], P[2]]);                         // its two long edges, kerbed by hand below
  }

  // ---- the blocks
  const dorms = [], footprints = [];
  const tex = { brick: [2.08, 1.85] };
  const block = (id, ring, doorX, name, porch, loggiaX) => {
    const hs = ring.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
    const yF = gHi + porch.rise, gB = gLo - 0.6, ROOF = yF + NF * FH + ATTIC - 0.35, TOP = yF + NF * FH + ATTIC;
    const F = ringFaces(ring), fy = (k) => yF + (k - 1) * FH;            // floor of storey k (1..5)
    const yard = F.find((f) => Math.abs(f.nz) > 0.9 && (porch.yardSign > 0 ? f.nz > 0 : f.nz < 0));
    const nb = (f) => Math.max(1, Math.round(f.L / PITCH)), bc = (f, i) => (i + 0.5) * f.L / nb(f);
    // the door bay: the bay centre nearest doorX on the yard side; the loggia bays likewise
    const nY = nb(yard), bayOf = (x) => Math.max(0, Math.min(nY - 1, Math.floor(sAt(yard, x, yard.az) / (yard.L / nY))));
    const sE = bc(yard, bayOf(doorX)), logBays = new Set(loggiaX.map(bayOf));
    const rs = Math.sign(yard.nz * yard.ux - yard.nx * yard.uz) || 1;  // +s is the viewer's right (facing the wall) when 1
    const sa = (a) => sE + a * rs, span = (a0, a1) => [Math.min(sa(a0), sa(a1)), Math.max(sa(a0), sa(a1))];
    const LW = 2.75, REC = 1.2, yL0 = fy(2) - 0.1, yL1 = fy(NF) + FH;  // loggia width, depth, the stack's span
    const lspans = [...logBays].sort((p, q) => p - q).map((i) => [bc(yard, i) - LW / 2, bc(yard, i) + LW / 2]);

    for (const f of F) {
      // walls: plinth, brick (cut round the loggias), the cornice; the attic vents in every bay of the long sides
      D.setColor(PLINTH); box(D, f, -0.04, f.L + 0.04, gB, yF + 0.05, -0.1, 0.04, 'ft', [2.5, 2.5]);
      B.brick.setColor(BRICK);
      if (f === yard && lspans.length) {
        let s0 = 0;
        for (const [a, b] of lspans) { rect(B.brick, f, s0, a, yF + 0.05, TOP - 0.3, 0, tex.brick); rect(B.brick, f, a, b, yF + 0.05, yL0, 0, tex.brick); rect(B.brick, f, a, b, yL1, TOP - 0.3, 0, tex.brick); s0 = b; }
        rect(B.brick, f, s0, f.L, yF + 0.05, TOP - 0.3, 0, tex.brick);
      } else rect(B.brick, f, 0, f.L, yF + 0.05, TOP - 0.3, 0, tex.brick);
      D.setColor(CORNICE); box(D, f, -0.12, f.L + 0.12, TOP - 0.3, TOP, -0.3, 0.14, 'ftu', [2.5, 2.5]);
      const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz);
      const long = f.L > 30, n = long ? nb(f) : 1;
      for (let i = 0; i < n; i++) {
        const sc = long ? bc(f, i) : f.L / 2, isY = f === yard;
        for (let k = 1; k <= NF; k++) {
          if (isY && logBays.has(i) && k >= 2) continue;
          if (isY && k === 1 && Math.abs(sc - sE) < porch.clear) continue;
          win(f, r() < 0.55 ? T.WIN : T.WIN2, sc - 0.95, sc + 0.95, fy(k) + 0.95, fy(k) + 2.3, k === 1 ? 0.35 : 0.3);
        }
        if (long) win(f, T.VENT, sc - 0.16, sc + 0.16, fy(NF) + FH + 0.25, fy(NF) + FH + 0.5, 0, 0.02);
      }
    }
    // the loggia stacks: peach recess, slabs, yellow-orange fronts, the balcony door and window at the back
    for (const [a, b] of lspans) {
      const f = yard;
      D.setColor(PEACH);
      rect(D, f, a, b, yL0, yL1, -REC);
      quad(D, at(f, a, yL0, -REC), at(f, a, yL0, 0), at(f, a, yL1, 0), at(f, a, yL1, -REC), f.U);
      quad(D, at(f, b, yL0, -REC), at(f, b, yL0, 0), at(f, b, yL1, 0), at(f, b, yL1, -REC), neg(f.U));
      box(D, f, a, b, yL1, yL1, -REC, 0, 'u');
      for (let k = 2; k <= NF; k++) {
        D.setColor('#d8d4cc'); box(D, f, a, b, fy(k) - 0.16, fy(k), -REC, 0.02, 'ftu');
        D.setColor(YELLOW); box(D, f, a + 0.02, b - 0.02, fy(k), fy(k) + 1.0, -0.08, 0.0, 'ft');
        win(f, T.LOGD, a + 0.15, b - 0.15, fy(k) + 0.02, fy(k) + 2.5, 0.3, 0.02 - REC);
      }
    }
    // the roof: the deck inside the parapet, vent stacks along the middle, two lift / stair heads
    B.roof.setColor(ROOFC); B.roof.fill(ring, [], ROOF, true);
    for (const f of F) { D.setColor(CORNICE); rect(D, f, 0, f.L, ROOF, TOP - 0.3, -0.3, null, neg(f.N)); }
    { const f = F.find((q) => q.L > 30), nV = Math.round(f.L / 9);
      for (let i = 0; i < nV; i++) {
        const c = at(f, (i + 0.5) * f.L / nV, 0, -7.4);
        D.setColor('#b9b4aa'); D.box(c[0] - 0.55, ROOF, c[2] - 0.55, c[0] + 0.55, ROOF + 1.1, c[2] + 0.55, 63 - 8);
        D.setColor('#6d6a66'); D.box(c[0] - 0.65, ROOF + 1.1, c[2] - 0.65, c[0] + 0.65, ROOF + 1.18, c[2] + 0.65, 63 - 8);
      }
      for (const s of [f.L * 0.2, f.L * 0.8]) {
        const p = (ds, o) => { const q = at(f, s + ds, 0, o); return [q[0], q[2]]; }, hd = [p(-2, -5.5), p(2, -5.5), p(2, -9.5), p(-2, -9.5)];
        B.brick.setColor(BRICK); B.brick.extrude(hd, [], ROOF, ROOF + 2.4, { top: false });
        B.roof.setColor('#4c4e51'); B.roof.fill(hd, [], ROOF + 2.4, true);
        S.prism(hd.flat(), ROOF, ROOF + 2.4, 0, 0, 'wall');
      }
    }
    S.prism(ring.flat(), gB, ROOF, 0, 0, 'wall');
    for (const f of F) solid(S, f, 0, f.L, -0.3, 0, ROOF, TOP);

    // the flag over the door on a short pole out of the wall
    { const f = yard, s = sa(porch.flagA), p0 = at(f, s, fy(2) + 1.2, 0), p1 = at(f, s, fy(2) + 2.0, 1.1);
      D.setColor('#5b5b5b'); D.tube(p0, p1, 0.025, 4);
      const A = (t, y) => at(f, s, fy(2) + 1.2 + 0.8 * t + y, 1.1 * t);  // t along the pole, y below it
      const fl = (y0, y1, c) => { D.setColor(c); for (const n of [f.U, neg(f.U)]) quad(D, A(0.3, -y1), A(1, -y1), A(1, -y0), A(0.3, -y0), n); };
      fl(0.02, 0.3, '#2a5fb0'); fl(0.3, 0.58, '#f2c62a');
    }
    porch.build({ f: yard, sE, sa, span, yF, rs, fy });
    dorms.push({ id, floor: yF, roof: ROOF, door: [at(yard, sE, 0, 0)[0], at(yard, sE, 0, 0)[2]] });
    footprints.push({ poly: ring.map((p) => [p[0], p[1]]), h: TOP - gLo, kind: 'apt', name });
    paintPoly(ring, C.HARD);
  };

  // a flight of n steps of the full s span [s0, s1], from the landing at o0 (yTop) out to o1 (the ground)
  const steps = (f, s0, s1, o0, o1, yTop, nosing = null) => {
    const g = Math.min(heightAt(...xz(at(f, s0, 0, o1))), heightAt(...xz(at(f, s1, 0, o1)))) + LIFT.pave;
    const n = Math.max(2, Math.round((yTop - g) / 0.16)), rise = (yTop - g) / n, run = (o1 - o0) / (n - 1);
    for (let k = 1; k < n; k++) {
      const y = yTop - k * rise, oa = o0 + (k - 1) * run;
      D.setColor('#a9a59e'); box(D, f, s0, s1, g - 0.4, y, oa, oa + run, 'ftlr');
      if (nosing) { D.setColor(nosing); box(D, f, s0, s1, y, y + 0.006, oa + run - 0.08, oa + run, 't'); }
    }
    // one sloped support from the landing's edge down to the foot (and a metre on under the ground), so the car climbs
    // the flight instead of meeting a ledge
    const k = (yTop - g) / (o1 - o0), P = [[s0, o0], [s1, o0], [s1, o1 + 1], [s0, o1 + 1]].flatMap(([s, o]) => xz(at(f, s, 0, o)));
    S.prism(P, g - 0.4, yTop + k * (o0 + f.ax * f.nx + f.az * f.nz), -k * f.nx, -k * f.nz, 'steps');
  };
  const xz = (p) => [p[0], p[2]];
  // a ramp along the wall from the landing (sHi at yTop) down to the ground at sLo, o0..o1 out from the wall; rails
  const ramp = (f, sHi, sLo, o0, o1, yTop, railCol) => {
    const g = heightAt(...xz(at(f, sLo, 0, (o0 + o1) / 2))) + LIFT.pave, P = (s, o, y) => at(f, s, y, o);
    D.setColor('#9d9a94');
    const up = [0, 1, 0];
    quad(D, P(sHi, o0, yTop), P(sLo, o0, g), P(sLo, o1, g), P(sHi, o1, yTop), up);
    for (const o of [o0, o1]) quad(D, P(sHi, o, yTop), P(sLo, o, g), P(sLo, o, g - 0.3), P(sHi, o, g - 0.3), o === o0 ? neg(f.N) : f.N);
    const lo = Math.min(sHi, sLo), hi = Math.max(sHi, sLo), n = Math.ceil((hi - lo) / 1.5);
    { // the slab's support: a sloped prism along s, run on a metre past the foot under the ground
      const m = (g - yTop) / (sLo - sHi), sx = sLo + Math.sign(sLo - sHi);
      S.prism([[sHi, o0], [sx, o0], [sx, o1], [sHi, o1]].flatMap(([q, o]) => xz(at(f, q, 0, o))), g - 0.4, yTop - m * sHi - m * (f.ax * f.ux + f.az * f.uz), m * f.ux, m * f.uz, 'steps');
    }
    D.setColor(railCol);
    for (const o of [o0 + 0.05, o1 - 0.05]) {
      const yAt = (s) => yTop + (g - yTop) * (s - sHi) / (sLo - sHi);
      for (const h of [0.9, 0.5]) D.tube(P(sHi, o, yTop + h), P(sLo, o, g + h), 0.024, 5);
      for (let i = 0; i <= n; i++) { const s = lo + (hi - lo) * i / n; D.tube(P(s, o, yAt(s) - 0.02), P(s, o, yAt(s) + 0.92), 0.022, 4); }
      solid(S, f, lo, hi, o - 0.05, o + 0.05, g - 0.3, yTop + 0.95, 'wall');
    }
  };
  const lamp = (f, s, y, o) => { B.glow.setColor('#fff4dc'); const p = at(f, s, y, o); B.glow.box(p[0] - 0.14, p[1] - 0.06, p[2] - 0.14, p[0] + 0.14, p[1], p[2] + 0.14, 8); D.setColor('#d8d6d0'); D.box(p[0] - 0.16, p[1], p[2] - 0.16, p[0] + 0.16, p[1] + 0.05, p[2] + 0.16, 63 - 8); };
  const plaque = (f, s0, s1, y0, y1) => { D.setColor('#2557a6'); box(D, f, s0, s1, y0, y1, 0, 0.03, 'ftlru'); D.setColor('#e7c64a'); box(D, f, s0 + 0.03, s1 - 0.03, y0 + 0.03, y0 + 0.05, 0.03, 0.035, 'f'); };

  // №4: the peach vestibule under the dark canopy, the big window on the left, the door on the right, five steps,
  // the ramp off to the right along the wall (cdu.edu.ua 2021 photo)
  block(ID4, RING4, DOOR4_X, 'Гуртожиток №4 ЧНУ', {
    rise: 0.75, yardSign: 1, clear: 3.6, flagA: -1.4, build: ({ f, sa, span, yF }) => {
      const yC = yF + 2.85, [v0, v1] = span(-2.8, 2.8), [c0, c1] = span(-2.95, 4.4), VD = 2.2;
      D.setColor(PEACH);
      box(D, f, v0, v1, yF - 0.05, yC, 0, VD, 'flr', [2.5, 2.5]);
      solid(S, f, v0, v1, 0, VD, yF - 0.3, yC);
      const [w0, w1] = span(-2.3, -0.5), [d0, d1] = span(0.25, 2.05);
      win(f, T.VEST, w0, w1, yF + 0.75, yF + 2.4, 0.7, VD + 0.03);
      win(f, T.DOOR, d0, d1, yF, yF + 2.2, 0.6, VD + 0.03);
      plaque(f, ...span(-0.15, 0.25), yF + 1.45, yF + 1.95);
      D.setColor(CANOPY); box(D, f, c0, c1, yC, yC + 0.35, 0, 2.95, 'ftlru');
      solid(S, f, c0, c1, 0, 2.95, yC, yC + 0.35, 'awning', 1);
      const post = at(f, sa(4.25), 0, 2.8); D.setColor('#3b3b3d'); D.tube([post[0], yF - 0.1, post[2]], [post[0], yC, post[2]], 0.05, 6);
      S.prism([post[0] - 0.08, post[2] - 0.08, post[0] + 0.08, post[2] - 0.08, post[0] + 0.08, post[2] + 0.08, post[0] - 0.08, post[2] + 0.08], yF - 0.5, yC, 0, 0, 'pole');
      lamp(f, sa(1.25), yC, 2.6);
      // the landing in front of the vestibule and beside it under the canopy, then the steps down to the forecourt
      D.setColor('#a9a59e'); const [l0, l1] = span(-2.95, 4.4), gl = Math.min(heightAt(...xz(at(f, l0, 0, 3.2))), heightAt(...xz(at(f, l1, 0, 3.2))));
      box(D, f, l0, l1, gl - 0.2, yF, VD, 3.2, 'ftlr'); const [m0, m1] = span(2.8, 4.4); box(D, f, m0, m1, gl - 0.2, yF, 0.04, VD, 'tlr');
      solid(S, f, l0, l1, VD, 3.2, gl - 0.2, yF - 0.1); solid(S, f, m0, m1, 0, VD, gl - 0.2, yF - 0.1);
      steps(f, ...span(-2.95, 2.6), 3.2, 4.85, yF);
      const [hi, lo] = [sa(4.4), sa(11.0)];
      ramp(f, hi, lo, 1.0, 2.2, yF, '#2b2b2d');
      paintPoly([xz(at(f, sa(-2.95), 0, -0.2)), xz(at(f, sa(4.4), 0, -0.2)), xz(at(f, sa(4.4), 0, 4.85)), xz(at(f, sa(-2.95), 0, 4.85))], C.HARD);
      paintPoly([xz(at(f, hi, 0, 0.9)), xz(at(f, lo, 0, 0.9)), xz(at(f, lo, 0, 2.3)), xz(at(f, hi, 0, 2.3))], C.HARD);
      // the paved apron off the ramp's foot to the walk
      const ap = [xz(at(f, lo, 0, 0.6)), xz(at(f, sa(13.2), 0, 0.6)), xz(at(f, sa(13.2), 0, 5.9)), xz(at(f, lo, 0, 5.9))];
      area(C.PAVE, ap);
    },
  }, [104, 134]);

  // №3: the wide canopy three bays long between dark-red side walls, the platform, three steps with yellow nosings
  // and the ramp off to the left with blue rails (cdu.edu.ua 2021 photo)
  block(ID3, RING3, DOOR3_X, 'Гуртожиток №3 ЧНУ', {
    rise: 0.3, yardSign: -1, clear: 0.9, flagA: 1.6, build: ({ f, sa, span, yF, rs }) => {
      const yC = yF + 3.0, [c0, c1] = span(-4.95, 4.95), DEP = 2.0;
      D.setColor(CANOPY); box(D, f, c0, c1, yC, yC + 0.35, 0, DEP + 0.2, 'ftlru');
      solid(S, f, c0, c1, 0, DEP + 0.2, yC, yC + 0.35, 'awning', 1);
      for (const a of [-4.95, 4.65]) { const [w0, w1] = span(a, a + 0.3); D.setColor(MAROON); box(D, f, w0, w1, yF - 0.05, yC, 0, DEP, 'ftlr', [2.5, 2.5]); solid(S, f, w0, w1, 0, DEP, yF - 0.3, yC); }
      D.setColor(PEACH); rect(D, f, ...span(-4.6, 4.6), yF, yC, 0.012, [2.5, 2.5]);  // the rendered wall under the canopy
      D.setColor('#8f9aa4'); box(D, f, c0 - 0.03, c1 + 0.03, yC + 0.35, yC + 0.42, -0.02, DEP + 0.25, 'ftlr');  // its sheet-metal top
      const [d0, d1] = span(-0.95, 0.95);
      win(f, T.DOOR, d0, d1, yF, yF + 2.4, 0.6, 0.04);
      plaque(f, ...span(1.2, 1.75), yF + 1.3, yF + 1.75);
      lamp(f, sa(0), yC, 1.2);
      // the platform under the canopy and a little beyond it, then the steps
      const [p0, p1] = span(-4.95, 4.95), gp = Math.min(heightAt(...xz(at(f, p0, 0, 2.4))), heightAt(...xz(at(f, p1, 0, 2.4))));
      D.setColor('#aaa59c'); box(D, f, p0, p1, gp - 0.2, yF, 0.04, 2.4, 'ftlr');
      solid(S, f, p0, p1, 0, 2.4, gp - 0.2, yF - 0.08);
      steps(f, p0, p1, 2.4, 4.6, yF, '#e2c22c');
      const [hi, lo] = [sa(-4.95), sa(-11.2)];
      ramp(f, hi, lo, 0.4, 1.65, yF, '#2e7a8a');
      // the yellow gas pipe along the wall over the ground floor, from the canopy to the building's end, on brackets
      { const yP = yF + 2.75, sEnd = rs > 0 ? f.L - 0.3 : 0.3, s0 = sa(4.95); D.setColor('#e3b51c'); D.tube(at(f, s0, yP, 0.18), at(f, sEnd, yP, 0.18), 0.05, 6);
        const e = at(f, sEnd, 0, 0.18); D.tube(at(f, sEnd, yP, 0.18), [e[0], heightAt(e[0], e[2]) + 0.25, e[2]], 0.05, 6);
        D.setColor('#6a6a6a'); for (let q = Math.min(s0, sEnd) + 1; q < Math.max(s0, sEnd); q += 3) box(D, f, q - 0.03, q + 0.03, yP - 0.07, yP - 0.03, 0, 0.2, 'ftlr'); }
      paintPoly([xz(at(f, p0, 0, -0.2)), xz(at(f, p1, 0, -0.2)), xz(at(f, p1, 0, 4.6)), xz(at(f, p0, 0, 4.6))], C.HARD);
      paintPoly([xz(at(f, hi, 0, 0.3)), xz(at(f, lo, 0, 0.3)), xz(at(f, lo, 0, 1.75)), xz(at(f, hi, 0, 1.75))], C.HARD);
      area(C.PAVE, [xz(at(f, lo, 0, 0.3)), xz(at(f, sa(-13.0), 0, 0.3)), xz(at(f, sa(-13.0), 0, 2.9)), xz(at(f, lo, 0, 2.9))]);
    },
  }, []);

  // ---- kerbs: every raster edge between a paved cell (asphalt, pavers) and a bed or bare ground, plus the edges
  // of the diagonal path and the beds' outer edges; light concrete, 0.12 m proud of the paving, in draped pieces
  let nKerb = 0;
  const KW = 0.12, kerbCol = '#c3bfb6';
  const kerbRun = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.15) return;
    const n = Math.ceil(L / 2), f = face([x0, z0], [x1, z1], (z1 - z0) / L, -(x1 - x0) / L);
    D.setColor(kerbCol);
    for (let k = 0; k < n; k++) {
      const s0 = L * k / n, s1 = L * (k + 1) / n, m = at(f, (s0 + s1) / 2, 0, 0), g = heightAt(m[0], m[2]);
      box(D, f, s0, s1, g + 0.05, g + LIFT.pave + 0.12, -KW / 2, KW / 2, 'ftb');
      nKerb++;
    }
  };
  const kerbAt = (a, b) => ((a === C.ASPH || a === C.PAVE) && (b === C.GROUND || b === C.BED)) || ((b === C.ASPH || b === C.PAVE) && (a === C.GROUND || a === C.BED)) || (a === C.BED && b === C.GROUND) || (b === C.BED && a === C.GROUND);
  // runs along z = const (between rows j and j + 1) and x = const (between columns i and i + 1)
  for (let j = 0; j < NZR - 1; j++) {
    let i0 = -1;
    for (let i = 0; i <= NXR; i++) {
      const on = i < NXR && kerbAt(grid[j * NXR + i], grid[(j + 1) * NXR + i]);
      if (on && i0 < 0) i0 = i;
      if (!on && i0 >= 0) { const z = RZ0 + (j + 1) * RES; kerbRun(RX0 + i0 * RES, z, RX0 + i * RES, z); i0 = -1; }
    }
  }
  for (let i = 0; i < NXR - 1; i++) {
    let j0 = -1;
    for (let j = 0; j <= NZR; j++) {
      const on = j < NZR && kerbAt(grid[j * NXR + i], grid[j * NXR + i + 1]);
      if (on && j0 < 0) j0 = j;
      if (!on && j0 >= 0) { const x = RX0 + (i + 1) * RES; kerbRun(x, RZ0 + j0 * RES, x, RZ0 + j * RES); j0 = -1; }
    }
  }
  for (const [a, b] of pathEdges) kerbRun(a[0], a[1], b[0], b[1]);

  // ---- the yard's furniture: benches, bins, thujas in the beds, lamp posts
  const bench = (x, z, yaw) => {
    const g = heightAt(x, z) + LIFT.pave, c = Math.cos(yaw), s = Math.sin(yaw), P = (u, v, y) => [x + u * c - v * s, g + y, z + u * s + v * c];
    D.setColor('#7b5536');
    for (const v of [-0.2, 0, 0.2]) D.face([P(-0.9, v - 0.08, 0.45), P(0.9, v - 0.08, 0.45), P(0.9, v + 0.08, 0.45), P(-0.9, v + 0.08, 0.45)], [0, 1, 0]);
    for (const y of [0.62, 0.8]) D.face([P(-0.9, -0.3, y), P(0.9, -0.3, y), P(0.9, -0.3, y + 0.12), P(-0.9, -0.3, y + 0.12)], [-s, 0, c]);
    D.setColor('#3b3b3d');
    for (const u of [-0.75, 0.75]) { D.tube(P(u, -0.25, 0), P(u, -0.25, 0.92), 0.03, 4); D.tube(P(u, 0.25, 0), P(u, 0.2, 0.45), 0.03, 4); D.tube(P(u, -0.28, 0.45), P(u, 0.28, 0.45), 0.025, 4); }
    S.prism([P(-0.95, -0.35, 0), P(0.95, -0.35, 0), P(0.95, 0.35, 0), P(-0.95, 0.35, 0)].map((p) => [p[0], p[2]]).flat(), g - 0.3, g + 0.9, 0, 0, 'wall');
  };
  const bin = (x, z) => { const g = heightAt(x, z) + LIFT.pave; D.setColor('#3e4d3a'); D.cyl(x, g, z, 0.24, 0.27, 0.75, 8); D.setColor('#26292a'); D.cyl(x, g + 0.75, z, 0.28, 0.28, 0.05, 8); };
  const thuja = (x, z, h) => { const g = heightAt(x, z) + LIFT.bed; D.setColor('#2f4a26'); D.cyl(x, g, z, 0.45, 0.05, h, 8, false); D.setColor('#3a5a2c'); D.cyl(x, g + h * 0.15, z, 0.5, 0.18, h * 0.6, 8, false); };
  const yardLamp = (x, z, yaw) => {
    const g = heightAt(x, z) + 0.15, c = Math.cos(yaw), s = Math.sin(yaw);
    D.setColor('#5d6064'); D.cyl(x, g, z, 0.09, 0.06, 5.2, 6, false); D.tube([x, g + 5.1, z], [x + c * 0.9, g + 5.25, z + s * 0.9], 0.04, 4);
    D.setColor('#3d3f42'); D.box(x + c * 0.9 - 0.25, g + 5.15, z + s * 0.9 - 0.25, x + c * 0.9 + 0.25, g + 5.3, z + s * 0.9 + 0.25, 63 - 8);
    B.glow.setColor('#fff2d6'); B.glow.box(x + c * 0.9 - 0.2, g + 5.12, z + s * 0.9 - 0.2, x + c * 0.9 + 0.2, g + 5.15, z + s * 0.9 + 0.2, 8);
    S.prism([x - 0.12, z - 0.12, x + 0.12, z - 0.12, x + 0.12, z + 0.12, x - 0.12, z + 0.12], g - 0.3, g + 5.2, 0, 0, 'pole');
  };
  bench(116.6, -1600.75, 0); bench(131.6, -1600.75, 0);                 // №4: on the bed's edge facing the forecourt
  bin(120.4, -1600.4); bin(127.6, -1600.4);
  bench(113.6, -1577.45, Math.PI); bench(136.0, -1577.45, Math.PI);     // №3: backs to the wall, facing the yard
  bin(116.4, -1579.0); bin(134.7, -1579.0);
  for (const [x, z, h] of [[115.6, -1576.6, 3.4], [138.2, -1576.6, 3.0], [101.5, -1576.6, 2.6], [151.6, -1576.7, 2.8], [119.1, -1603.9, 3.2], [139.8, -1603.7, 2.8], [88, -1603.6, 2.5], [152.2, -1603.8, 3.0]]) thuja(x, z, h);
  yardLamp(109.0, -1590.6, -Math.PI / 2); yardLamp(96.0, -1596.7, Math.PI / 2); yardLamp(138.4, -1595.2, Math.PI / 2); yardLamp(146.0, -1581.2, -Math.PI / 2);

  // ---- materials and meshes
  const at4 = atlas(false), mask = atlas(true);
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, { base: [226, 221, 210], mortar: [206, 202, 194], spread: 0.06 }), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ map: speckle(r, '#f4f2ee'), vertexColors: true, roughness: 0.85 }),
    tile: new THREE.MeshStandardMaterial({ map: at4, vertexColors: true, roughness: 0.4, metalness: 0.1 }),
    lit: new THREE.MeshStandardMaterial({ map: at4, vertexColors: true, roughness: 0.4, metalness: 0.1, emissive: 0xffc890, emissiveMap: mask, emissiveIntensity: 0 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xfff0d0, emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    bed: decal(new THREE.MeshStandardMaterial({ map: bedTex(r), vertexColors: true, roughness: 0.95 }), 1),
    asph: decal(new THREE.MeshStandardMaterial({ map: asphaltTex(r), vertexColors: true, roughness: 0.92 }), 2),
    pave: decal(new THREE.MeshStandardMaterial({ map: paverTex(r), vertexColors: true, roughness: 0.85 }), 3),
  };
  M.det.side = THREE.DoubleSide;                                       // the flag and the thin rails seen from either side
  const out = finish(root, 'chnudorms', B, M, { shade: ['brick', 'det', 'tile', 'lit'] });
  console.log(`[cherkasy] ChNU dorms 3 & 4: ${nWin} windows (${nLit} lit), ${nKerb} kerb pieces, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints, dorms, surf,
    // no generated trees on the paving, the beds, the porches or within 2.5 m of the walls; the yard's lawns keep theirs
    clear: (x, z) => surf(x, z) !== C.GROUND || [RING3, RING4].some((q) => x > q[0][0] - 2.5 && x < q[1][0] + 2.5 && z > Math.min(q[0][1], q[2][1]) - 2.5 && z < Math.max(q[0][1], q[2][1]) + 2.5),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.45 * k; M.glow.emissiveIntensity = 1.6 * k; },
  };
}
