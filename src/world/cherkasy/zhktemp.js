// OWNER: cherkasy. ЖК «Темп», вул. Юрія Іллєнка, 4 (Припортовий; OSM way 117808102, the block, and 996032042, its
// one-storey commercial annex): the nine-storey brick block of 60 flats at the corner of Іллєнка and Нижня Горова,
// built and in use, drawn face by face from the lun.ua photos and the developer's renders. A tall ground floor in a
// brown plinth, eight flats storeys in cream render under a brown band. The street (south-east) side: blank cream end
// piers, two loggia stacks cut a metre in (full-height glazing, balconies a little proud), between them a column of French windows, one of wide
// four-pane windows and another of French windows, the three middle columns brown from the sixth floor up; the
// entrance under a dark canopy next to the annex. The yard (north-west) side: the end piers stand a metre proud, two
// balcony stacks, French windows and the stair's wide windows at half landings, the stair head a brown box over the
// roof. The ends: three French windows either side of a balcony stack. The annex in front: brown walls, shopfronts in
// dark-brown frames, a cream band under the parapet. The lot is closed: a paved forecourt and a black bar fence from the
// annex round the street corner and the yard, open where the yard road comes in. No signs, no developer marks.
//   ZHKTEMP_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildZhkTemp({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, top } | null
//     top: the height of the main roof deck (tests)
// Windows are quads of one painted atlas (one per opening), the lit ones in a second mesh whose emissive mask is the
// glass; walls are flat colour over a speckle texture (uv in metres); balcony railings, Juliet guards and the fence share one alpha-tested texture.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng } from './geo.js';
import { ringFaces, face, at, quad, box, rect, solid, finish, speckle } from './slabkit.js';

const OSM_ID = 117808102, ANNEX_ID = 996032042;
export const ZHKTEMP_SKIP = new Set([OSM_ID, ANNEX_ID]);

// the OSM outline in map metres, in ring order so every face runs left -> right as seen from outside:
// 0 the street side (SE), 1 the Нижня Горова end (NE), 2 the yard's NE pier, 3 its side, 4 the yard centre,
// 5 the SW pier's side, 6 the SW pier, 7 the SW end
const RING = [[765.9, 3267.1], [797.7, 3268.3], [798.5, 3247.6], [792.8, 3247.3], [792.7, 3248.4], [772.2, 3247.6], [772.2, 3246.6], [766.6, 3246.4]];
// the annex: 0 its street front, 1 the side toward the entrance, 2 its back (against the block for the first 10.5 m), 3 the far end
const ANNEX = [[753.9, 3276.9], [776.1, 3277.7], [776.4, 3267.5], [754.3, 3266.7]];
// the closed lot: a black bar fence from the annex round the street corner and the yard, a gate where the yard road comes in
const FENCE = [[[776.2, 3277.7], [776.3, 3282.0], [806.5, 3282.8], [807.5, 3238.6], [789.0, 3238.6]], [[782.0, 3238.6], [749.2, 3238.6], [748.8, 3266.6], [754.3, 3266.7]]];
const PAVE = [[776.2, 3267.6], [797.8, 3268.4], [806.6, 3268.8], [806.5, 3282.8], [776.3, 3282.0]]; // the paved forecourt
const GF = 3.3, FH = 3.0, NF = 8, BAND = 0.8, PAR = 1.4, AH = 5.3, STEP = 0.5; // ground floor, storey, flats storeys, band under the roof, parapet, annex, entrance steps
const CREAM = '#f1e4cd', BROWN = '#c2834f', PLINTH = '#b57a4a', FRAME = '#3e3029', SLAB = '#b97b4c';

// atlas tiles: each is stretched over its opening
const T = { WIN: 0, WINW: 1, FR: 2, PANO: 3, SHOP: 4, DOOR: 5 }, NT = 6, TW = 128, TH = 128;

function atlas(mask) {
  return canvasTex(NT * TW, TH, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // the glass with its frame and bars; fractions of the tile, y up from the sill
    const pane = (t, vx, hy, fw = 6) => {
      const X = t * TW;
      if (mask) { fill('#000', X, 0, TW, TH); fill('#fff', X + fw, fw, TW - 2 * fw, TH - 2 * fw); return; }
      fill(FRAME, X, 0, TW, TH);
      const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#b9c8d4'); gr.addColorStop(1, '#4f6170');
      g.fillStyle = gr; g.fillRect(X + fw, fw, TW - 2 * fw, TH - 2 * fw);
      g.fillStyle = FRAME;
      for (const v of vx) g.fillRect(X + v * TW - fw / 2, 0, fw, TH);
      for (const h of hy) g.fillRect(X, TH * (1 - h) - fw / 2, TW, fw);
    };
    pane(T.WIN, [0.5], [0.72]);
    pane(T.WINW, [0.25, 0.5, 0.75], [0.72], 5);
    pane(T.FR, [0.5], [0.8]);
    pane(T.PANO, [0.33, 0.66], [0.85], 4);
    pane(T.SHOP, [0.5], [0.8], 4);
    pane(T.DOOR, [0.5], [0.75], 7);
  }, { repeat: false });
}
// on transparent ground, u in metres / 1.5: v 0.5..1 a balcony railing (handrail, horizontal bars, posts),
// v 0..0.5 the lot's fence of black vertical bars between two rails
const railTex = () => canvasTex(128, 128, (g, w) => {
  g.clearRect(0, 0, w, 128); g.fillStyle = '#2f3032';
  g.fillRect(0, 1, w, 6); g.fillRect(0, 58, w, 5);
  for (let i = 1; i < 5; i++) g.fillRect(0, i * 64 / 5.4, w, 2);
  g.fillRect(0, 0, 4, 64); g.fillRect(w - 4, 0, 4, 64);
  g.fillStyle = '#1d1e20';
  g.fillRect(0, 72, w, 4); g.fillRect(0, 118, w, 4);
  for (let i = 0; i < 12; i++) g.fillRect(i * w / 12 + 3, 66, 4, 61);
});

export function buildZhkTemp({ root, map, solids: S, zips: Z, heightAt }) {
  if (!map.buildings.some((b) => b.id === OSM_ID)) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const hs = [...RING, ...ANNEX].map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
  const yF = gHi + STEP, gB = gLo - 0.6, y1 = yF + GF, ROOF = y1 + NF * FH, TOP = ROOF + PAR, yA = gHi + AH;
  const B = { det: new MB(), tile: new MB(), lit: new MB(), rail: new MB(), roof: new MB() }, D = B.det, R = B.roof;
  const F = ringFaces(RING), FA = ringFaces(ANNEX);
  const u0 = (t) => (t * TW + 1) / (NT * TW), u1 = (t) => ((t + 1) * TW - 1) / (NT * TW);
  const UVM = [2.5, 2.5];
  let nWin = 0, nLit = 0, nBal = 0;

  // one opening: a tile quad just proud of the wall, lit at random by the share p
  const win = (f, t, s0, s1, ya, yb, p = 0.28, o = 0.03) => {
    const on = r() < p, M = on ? B.lit : B.tile; nWin++; nLit += on;
    M.setColor('#ffffff');
    quad(M, at(f, s0, ya, o), at(f, s1, ya, o), at(f, s1, yb, o), at(f, s0, yb, o), f.N, [[u0(t), 0], [u1(t), 0], [u1(t), 1], [u0(t), 1]]);
  };
  const wall = (f, s0, s1, ya, yb, col, o = 0) => { D.setColor(col); rect(D, f, s0, s1, ya, yb, o, UVM); };
  const fy = (k) => y1 + (k - 2) * FH;                      // floor level of storey k (2..9)
  const yB = ROOF - BAND, y6 = fy(6);
  // a strip of the rail texture standing on a -> b, h high; v0..v1 picks the balcony rail or the fence
  const railQ = (a, b, h, n, v0 = 0.5, v1 = 1) => {
    const u = Math.hypot(b[0] - a[0], b[2] - a[2]) / 1.5;
    B.rail.setColor('#ffffff');
    quad(B.rail, a, b, [b[0], b[1] + h, b[2]], [a[0], a[1] + h, a[2]], n, [[0, v0], [u, v0], [u, v1], [0, v1]]);
  };
  const neg = (v) => v.map((q) => -q);
  // a balcony at storey k: brown slab on the floor line from o0 (behind the wall in a loggia) to d, railing round
  // the part that stands proud
  const balcony = (f, s0, s1, k, d, o0 = 0) => {
    const y = fy(k);
    D.setColor(SLAB); box(D, f, s0, s1, y - 0.18, y, o0, d, 'ftlru');
    railQ(at(f, s0 + 0.02, y, d - 0.04), at(f, s1 - 0.02, y, d - 0.04), 1.05, f.N);
    railQ(at(f, s0 + 0.02, y, 0), at(f, s0 + 0.02, y, d - 0.04), 1.05, neg(f.U));
    railQ(at(f, s1 - 0.02, y, 0), at(f, s1 - 0.02, y, d - 0.04), 1.05, f.U);
    nBal++;
  };
  // a balcony stack over storeys ka..9: glazed doors on the wall, a balcony at every floor, one collider. rec > 0: a
  // loggia cut rec deep into the wall up to the band, its back and cheeks cream below the sixth floor, brown above
  const stack = (f, s0, s1, d, ka = 2, rec = 0) => {
    const ya = fy(ka) - 0.25, h = rec ? yB - fy(9) : 2.45;
    for (let k = ka; k <= 9; k++) { win(f, T.PANO, s0 + 0.4, s1 - 0.4, fy(k) + 0.05, fy(k) + h, 0.3, 0.03 - rec); balcony(f, s0, s1, k, d, -rec); }
    solid(S, f, s0, s1, 0, d, ya, ROOF);
    if (!rec) return;
    for (const [y0, y1c, c] of [[ya, y6, CREAM], [y6, yB, BROWN]]) {
      wall(f, s0, s1, y0, y1c, c, -rec);
      D.setColor(c);
      quad(D, at(f, s0, y0, -rec), at(f, s0, y0, 0), at(f, s0, y1c, 0), at(f, s0, y1c, -rec), f.U);
      quad(D, at(f, s1, y0, -rec), at(f, s1, y0, 0), at(f, s1, y1c, 0), at(f, s1, y1c, -rec), neg(f.U));
    }
    D.setColor(BROWN); box(D, f, s0, s1, yB, yB, -rec, 0, 'u');
  };
  // French windows with their Juliet guards standing a hand proud of the wall
  const french = (f, sc, w = 1.3, k0 = 2, k1 = 9, top = 2.45) => {
    for (let k = k0; k <= k1; k++) {
      const y = fy(k), a = sc - w / 2 - 0.1, b = sc + w / 2 + 0.1;
      win(f, T.FR, sc - w / 2, sc + w / 2, y + 0.1, y + top);
      railQ(at(f, a, y + 0.1, 0.25), at(f, b, y + 0.1, 0.25), 0.95, f.N);
      railQ(at(f, a, y + 0.1, 0), at(f, a, y + 0.1, 0.25), 0.95, neg(f.U)); railQ(at(f, b, y + 0.1, 0), at(f, b, y + 0.1, 0.25), 0.95, f.U);
      D.setColor(SLAB); box(D, f, a, b, y + 0.02, y + 0.1, 0, 0.27, 'ftlr');
    }
  };
  const plain = (f, sc, w, t = T.WIN, k0 = 2, k1 = 9, sill = 0.9, top = 2.45) => { for (let k = k0; k <= k1; k++) win(f, t, sc - w / 2, sc + w / 2, fy(k) + sill, fy(k) + top); };

  // ---- every face: the brown plinth over the ground floor, cream above, the brown band and parapet on top
  for (const f of F) {
    wall(f, 0, f.L, gB, y1, PLINTH);
    wall(f, 0, f.L, yB, TOP, BROWN);
    D.setColor('#5d4636'); box(D, f, -0.05, f.L + 0.05, TOP, TOP + 0.08, -0.35, 0.06, 'ftlr'); // coping
    const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz);
  }

  // ---- the street side: pier, balcony stack, French / wide / French columns (brown from the sixth floor), stack, pier
  { const f = F[0], L = f.L, cols = [5.7, 4.2, 3.4, 5.2, 3.6, 4.0], e = []; let s = 0; for (const w of cols) e.push(s += w);
    const aE = 10.5, REC = 1.0;                                       // the annex covers the first 10.5 m up to its roof
    wall(f, 0, e[0], y1, yB, CREAM); wall(f, e[5], L, y1, yB, CREAM);
    wall(f, e[1], e[4], y1, y6, CREAM); wall(f, e[1], e[4], y6, yB, BROWN);
    wall(f, e[0], e[1], y1, fy(3) - 0.25, CREAM); wall(f, e[4], e[5], y1, fy(2) - 0.25, CREAM);
    // the two loggia stacks, cut a metre into the wall, their balconies a little proud of it; the left one starts over the annex roof
    stack(f, e[0], e[1], 0.35, 3, REC); stack(f, e[4], e[5], 0.35, 2, REC);
    french(f, (e[1] + e[2]) / 2); plain(f, (e[2] + e[3]) / 2, 2.6, T.WINW, 2, 9, 0.75); french(f, (e[3] + e[4]) / 2);
    // the colliders: solid up to the first balconies, then with the loggias cut out up to the band
    const P = (s, o) => { const q = at(f, s, 0, o); return [q[0], q[1 + 1]]; }, yL = fy(2) - 0.25;
    S.prism(RING.flat(), gB, yL, 0, 0, 'wall');
    S.prism([RING[0], P(e[0], 0), P(e[0], -REC), P(e[1], -REC), P(e[1], 0), P(e[4], 0), P(e[4], -REC), P(e[5], -REC), P(e[5], 0), ...RING.slice(1)].flat(), yL, ROOF, 0, 0, 'wall');
    solid(S, f, e[0], e[1], -REC, 0, yL, fy(3) - 0.25); solid(S, f, e[0], e[1], -REC, 0, yB, ROOF); solid(S, f, e[4], e[5], -REC, 0, yB, ROOF);
    // the ground floor: the lobby under a dark canopy beside the annex, windows under the right stack
    win(f, T.DOOR, aE + 1.2, aE + 3.2, yF, yF + 2.6, 0.9); win(f, T.SHOP, aE + 3.5, aE + 7.5, yF + 0.2, yF + 2.6, 0.7);
    win(f, T.WIN, e[3] + 0.6, e[3] + 2.0, yF + 0.9, yF + 2.6, 0.4); win(f, T.WIN, e[4] + 0.6, e[5] - 0.6, yF + 0.9, yF + 2.6, 0.4);
    D.setColor('#2c2a29'); box(D, f, aE, aE + 9.5, yF + 2.95, yF + 3.2, 0, 2.2, 'ftlru');
    solid(S, f, aE, aE + 9.5, 0, 2.2, yF + 2.95, yF + 3.2, 'awning', 1);
    D.setColor('#8d8a85'); box(D, f, aE, aE + 9.5, gB, yF, 0, 2.6, 'ftlr', UVM);                 // the steps' landing
  }

  // ---- the ends: three French windows, a balcony stack, three more; windows in the plinth under them
  for (const fi of [1, 7]) {
    const f = F[fi], L = f.L, pos = [2.2, 4.8, 7.4, 13.3, 15.9, 18.5].map((s) => s * L / 20.7), b0 = 8.85 * L / 20.7, b1 = 11.85 * L / 20.7;
    wall(f, 0, L, y1, yB, CREAM);
    for (const s of pos) { french(f, s, 1.2); win(f, T.WIN, s - 0.6, s + 0.6, yF + 0.9, yF + 2.6, 0.35); }
    stack(f, b0, b1, 1.2);
  }

  // ---- the yard: the end piers a metre proud, balcony stacks, French windows, the stair's windows at half landings
  for (const fi of [2, 3, 5, 6]) wall(F[fi], 0, F[fi].L, y1, yB, CREAM);
  { const f = F[4], L = f.L, cols = [4.5, 2.65, 6.5, 2.3, 4.5].map((w) => w * L / 20.45), e = []; let s = 0; for (const w of cols) e.push(s += w);
    wall(f, 0, L, y1, yB, CREAM);
    stack(f, 0, e[0], 1.4); french(f, (e[0] + e[1]) / 2, 1.0);
    const sc = (e[1] + e[2]) / 2;
    for (let k = 2; k <= 9; k++) win(f, T.WINW, sc - 1.7, sc + 1.7, fy(k) - FH / 2 + 0.9, fy(k) - FH / 2 + 2.2, 0.5);
    french(f, (e[2] + e[3]) / 2, 1.0); stack(f, e[3], L, 1.4);
    // the ground floor: the residents' doors at the stair, windows under the stacks
    win(f, T.DOOR, sc - 2.6, sc - 1.0, yF, yF + 2.5, 0.9); win(f, T.DOOR, sc + 1.0, sc + 2.6, yF, yF + 2.5, 0.9);
    win(f, T.WIN, 1.0, e[0] - 1.0, yF + 0.9, yF + 2.6, 0.35); win(f, T.WIN, e[3] + 1.0, L - 1.0, yF + 0.9, yF + 2.6, 0.35);
    // the stair head: a brown box over the roof flush with the yard wall
    const p = (s, o) => { const q = at(f, s, 0, o); return [q[0], q[2]]; }, head = [p(sc - 2.75, 0), p(sc + 2.75, 0), p(sc + 2.75, -5), p(sc - 2.75, -5)];
    D.setColor(BROWN); D.extrude(head, [], ROOF, TOP + 2.0, { top: true });
    D.setColor('#5d4636'); D.extrude(head, [], TOP + 2.0, TOP + 2.1, { top: true });
    S.prism(head.flat(), ROOF, TOP + 2.1, 0, 0, 'wall');
  }

  // ---- the annex: brown walls, a cream band under the parapet, shopfronts in dark-brown frames
  { const ya = gB, yb = yA, band0 = gHi + 3.6, band1 = gHi + 4.3, g0 = gHi;
    for (const [fi, f] of FA.entries()) {
      const s0 = fi === 2 ? 10.5 : 0;                                // its back is against the block for the first 10.5 m
      wall(f, s0, f.L, ya, band0, BROWN); wall(f, s0, f.L, band0, band1, CREAM); wall(f, s0, f.L, band1, yb, BROWN);
      D.setColor('#5d4636'); box(D, f, s0 - 0.05, f.L + 0.05, yb, yb + 0.08, -0.3, 0.06, 'ftlr');
      D.setColor('#6e6a64'); box(D, f, s0, f.L, ya, g0 + 0.3, 0, 0.05, 'ft');
    }
    const f0 = FA[0];
    win(f0, T.DOOR, 1.6, 3.4, g0 + 0.3, g0 + 2.9, 0.9);
    for (const a of [4.0, 8.4, 12.8, 17.2]) win(f0, T.SHOP, a, a + 3.8, g0 + 0.5, g0 + 3.2, 0.7);
    for (const a of [1.0, 5.4]) win(FA[1], T.SHOP, a, a + 3.6, g0 + 0.5, g0 + 3.2, 0.7);
    R.setColor('#6f6c68'); R.fill(ANNEX, [], yb - 0.02, true);
    S.prism(ANNEX.flat(), gB, yb, 0, 0, 'wall');
  }

  // ---- the lot: paving in front, the fence (u in metres along each run, so the bars keep their pitch)
  R.setColor('#6f6d6a'); R.fill(PAVE, [], Math.max(...PAVE.map(([x, z]) => heightAt(x, z))) + 0.25, true); // the drawn ground stands ~0.15 m over heightAt
  for (const run of FENCE) for (let i = 1; i < run.length; i++) {
    const [a, b] = [run[i - 1], run[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 6);
    const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
    for (let k = 0; k < n; k++) {
      const p = (t) => { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; return [x, heightAt(x, z) - 0.05, z]; };
      railQ(p(k / n), p((k + 1) / n), 2.0, [nx, 0, nz], 0, 0.5);
    }
    const g = Math.min(heightAt(...a), heightAt(...b));
    solid(S, face(a, b, nx, nz), 0, L, -0.06, 0.06, g - 0.3, g + 2.0);
  }

  // ---- roof: the deck inside the parapet, a lift room by the stair head
  R.setColor('#77746f'); R.fill(RING, [], ROOF + 0.02, true);
  for (const f of F) { R.setColor(BROWN); rect(R, f, 0, f.L, ROOF, TOP, -0.35, null, f.N.map((v) => -v)); }
  for (const f of F) solid(S, f, 0, f.L, -0.35, 0, ROOF, TOP); // the parapet, so a car can land on the deck inside it

  const tex = atlas(false), mask = atlas(true), sp = speckle(r, '#f4f2ee');
  const M = {
    det: new THREE.MeshStandardMaterial({ map: sp, vertexColors: true, roughness: 0.85 }),
    tile: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.4, metalness: 0.1 }),
    lit: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.4, metalness: 0.1, emissive: 0xffc890, emissiveMap: mask, emissiveIntensity: 0 }),
    rail: new THREE.MeshStandardMaterial({ map: railTex(), vertexColors: true, roughness: 0.5, metalness: 0.4, alphaTest: 0.5, side: THREE.DoubleSide }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  };
  const out = finish(root, 'zhktemp', B, M, { shade: ['det', 'tile', 'lit'] });
  console.log(`[cherkasy] ZhK Temp: ${nWin} windows (${nLit} lit), ${nBal} balconies, roof ${(ROOF - yF).toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    top: ROOF,
    footprints: [
      { poly: RING.map((p) => [p[0], p[1]]), h: TOP - gLo, kind: 'apt', name: 'ЖК «Темп»' },
      { poly: ANNEX.map((p) => [p[0], p[1]]), h: yA - gLo, kind: 'public', name: 'ЖК «Темп»' },
    ],
    clear: (x, z) => x > 747 && x < 810 && z > 3236 && z < 3285,
    update() { M.lit.emissiveIntensity = 0.45 * nightK.value; },
  };
}
