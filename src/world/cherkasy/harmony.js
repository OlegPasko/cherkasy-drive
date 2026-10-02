// OWNER: cherkasy. Клубний комплекс Harmony, просп. Перемоги, 69 (OSM way 1507392909, tagged Перемоги 73): house 1 of
// the six-house club complex, the only one finished (the lun.ua catalogue and the developer's site harmony.ck.ua; built
// from the developer's site photos of September 2026, the others are still brick shells or plans and stay out). A
// four-storey brick block, 88 x 21 m, along the avenue with a commercial ground storey.
// The avenue front, as photographed, bay by bay from the south end: a white end bay with one wide window a storey, a
// narrow recessed white slot, then six graphite-framed bays of two wide four-pane windows a storey alternating with five
// recessed white bays (a narrow window each side of a timber strip, white slab bands with downlights), the slot and the
// white end bay again. White pilasters between the bays rise past the roof under dark metal caps; the ground storey is
// graphite render with glazed shop doors; a dark standing-seam attic band caps the white bays and runs round both ends.
// The ends: blank white render with paired grooves at the slab lines, a narrow window / timber strip / narrow window
// group at the yard corner. The yard side is still bare brick (orange-red with yellow headers, grey slab lines): brick
// projections with one wide window a storey, recesses with two narrow ones, two stair bays with landing windows and the
// entrances under timber canopies. Flat roof with white flue stacks (flats have their own boilers). Windows light up at
// night. No developer name or logo anywhere.
//   HARMONY_SKIP: the OSM id replaced here (buildings.js skips its extrusion)
//   harmonyLocal: { L, D, toMap(s, t), toLocal(x, z) } the site frame: s along the avenue front from its south end, t
//     from the front toward the yard (map metres)
//   levelHarmony(hf): levels the lot (the block, the forecourt to the avenue and the yard road) before the ground is
//     built (city.js); returns the level
//   buildHarmony({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per outline edge in a face frame (slabkit.js): s along the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng, inPoly, convexParts } from './geo.js';
import { canvasTex } from './sculpt.js';
import { ringFaces, face, at, quad, rect, box, skin, solid, finish, speckle, UP, DN } from './slabkit.js';

const OSM_ID = 1507392909;
export const HARMONY_SKIP = new Set([OSM_ID]);

// the OSM outline: the front (avenue) edge F0 -> F1 runs north-north-west, Y0 is the yard corner behind F0
const F0 = [-3936.5, -2471.8], F1 = [-3934.4, -2383.6], Y0 = [-3957.6, -2471.3];
const L = Math.hypot(F1[0] - F0[0], F1[1] - F0[1]), D = Math.hypot(Y0[0] - F0[0], Y0[1] - F0[1]);
const U = [(F1[0] - F0[0]) / L, (F1[1] - F0[1]) / L], V = [(Y0[0] - F0[0]) / D, (Y0[1] - F0[1]) / D];
const toMap = (s, t) => [F0[0] + U[0] * s + V[0] * t, F0[1] + U[1] * s + V[1] * t];
const toLocal = (x, z) => { const dx = x - F0[0], dz = z - F0[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };
export const harmonyLocal = { L, D, toMap, toLocal };

// the forecourt to the avenue (parking in the plan) and the yard road behind
export const levelHarmony = (hf) => hf.pad([[-6, -14], [L + 6, -14], [L + 6, D + 8], [-6, D + 8]].map(([s, t]) => toMap(s, t)), 14);

const GF = 3.9, FH = 3.1, NF = 3, PAR = 0.6, ATTIC = 2.1;    // commercial ground storey, storey, storeys over it, parapets
const WHITE = '#eceae4', GRAPH = '#6a6d72', SEAM = '#3e4044', WOOD = '#a5693f', CONC = '#bdb9b0', FRAME = '#3a3b3e';
const TINT = ['#a9bfd6', '#9fb6cf', '#b4c8dc', '#98aec6'];

// bays, nominal widths (scaled to the real length) and their set-back from the outline (m)
const FRONT = ['E', 's', 'W', 'N', 'W', 'N', 'W', 'N', 'W', 'N', 'W', 'N', 'W', 's', 'E'];
const FW = { E: 5.8, s: 2.4, W: 8.6, N: 3.8 }, FD = { E: 0, s: 0.7, W: 0, N: 0.7 };
const YARD = ['P', 'R', 'P', 'S', 'P', 'R', 'P', 'R', 'P', 'S', 'P', 'R', 'P'];
const YW = { P: 7.6, R: 4.8, S: 3.8 }, YD = { P: 0, R: 1.2, S: 1.2 };
const lay = (seq, W) => {
  const k = L / seq.reduce((a, m) => a + W[m], 0); let s = 0;
  return seq.map((m) => { const b = { m, s0: s, s1: s + W[m] * k }; s = b.s1; return b; });
};

// ------------------------------------------------------------------------------------------------ textures
// one window column a storey's glass high (v 0 at the sill): dark frame, a transom a little above the middle
const paneTex = (mask) => canvasTex(64, 128, (g, w, h) => {
  const gl = g.createLinearGradient(0, 0, w * 0.5, h);
  gl.addColorStop(0, mask ? '#fff' : '#e1e8ec'); gl.addColorStop(0.5, mask ? '#fff' : '#a6b3ba'); gl.addColorStop(1, mask ? '#fff' : '#6a7780');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  g.fillStyle = mask ? '#000' : '#2c2d30';
  g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  g.fillRect(0, Math.round(h * 0.44), w, 4);
});
// standing-seam metal: a seam every 0.5 m (2 m per repeat), tinted dark by the vertex colour
const seamTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const x = i * 64; g.fillStyle = '#9a9a9a'; g.fillRect(x, 0, 3, h); g.fillStyle = '#ffffff'; g.fillRect(x + 3, 0, 2, h); }
});
// timber boards, 2 m x 2 m per repeat
const woodTex = (r) => canvasTex(256, 256, (g, w, h) => {
  const n = 16, bh = h / n;
  for (let i = 0; i < n; i++) {
    const k = 0.84 + r() * 0.24;
    g.fillStyle = `rgb(${[255, 232, 208].map((c) => Math.min(255, Math.round(c * k))).join(',')})`; g.fillRect(0, i * bh, w, bh);
    for (let j = 0; j < 6; j++) { g.fillStyle = `rgba(90,45,15,${0.05 + r() * 0.08})`; g.fillRect(0, i * bh + r() * bh, w, 1 + r()); }
    g.fillStyle = 'rgba(40,20,5,0.4)'; g.fillRect(0, (i + 1) * bh - 2, w, 2);
  }
});
// the facing brick: orange-red stretchers with yellow ones mixed in, 8 bricks x 26 courses per 2 m repeat
const brickTex = (r) => canvasTex(512, 512, (g, w, h) => {
  const PAL = ['#b9603d', '#c56d42', '#a9513a', '#cf8752', '#d9a66b', '#b46746', '#c47a4c', '#9e4c33'];
  g.fillStyle = '#c9bca4'; g.fillRect(0, 0, w, h);
  const ch = h / 26, cw = w / 8;
  for (let c = 0; c < 26; c++) for (let i = -1; i < 8; i++) {
    const x = i * cw + (c % 2) * cw / 2;
    g.fillStyle = PAL[(r() * (r() < 0.25 ? PAL.length : 4)) | 0];
    g.fillRect(x + 2, c * ch + 2, cw - 4, ch - 4);
  }
});

// ------------------------------------------------------------------------------------------------ the build
export function buildHarmony({ root, map, solids: S, zips: Z, heightAt }) {
  if (map?.buildings && !map.buildings.some((b) => b.id === OSM_ID)) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const front = lay(FRONT, FW), yard = lay(YARD, YW);

  // the outline: the front bays south to north, the north end, the yard bays north to south, the south end
  const ring = [], role = [];
  const put = (s, t, q) => { ring.push(toMap(s, t)); role.push(q); };
  front.forEach((b, i) => {
    put(b.s0, FD[b.m], { side: 'front', b });
    const n = front[i + 1];
    if (n && FD[n.m] !== FD[b.m]) put(b.s1, FD[b.m], { side: 'fstep' });
  });
  put(L, 0, { side: 'end' });
  for (let i = yard.length - 1; i >= 0; i--) {
    const b = yard[i], t = D - YD[b.m];
    put(b.s1, t, { side: 'yard', b });
    const n = yard[i - 1];
    if (n && YD[n.m] !== YD[b.m]) put(b.s0, t, { side: 'ystep' });
  }
  put(0, D, { side: 'end' });

  const hs = ring.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
  const yF = gHi + 0.15, Y = (h) => yF + h, gB = gLo - 0.6;
  const fy = (k) => Y(GF + (k - 1) * FH);                      // floor of upper storey k (1..NF)
  const ROOF = Y(GF + NF * FH), TOPW = ROOF + PAR, ATT = ROOF + ATTIC;
  const B = { wall: new MB(), brick: new MB(), seam: new MB(), wood: new MB(), det: new MB(), glass: new MB(), lit: new MB() };
  const UVW = [2.5, 2.5], UVB = [2, 2], UVS = [2, 2], UVT = [2, 2];
  const tint = () => TINT[(r() * TINT.length) | 0];
  let nWin = 0;

  // an opening through the face: reveals, a dark sill, glass in `cols` framed columns (lit ones go to their own mesh)
  function win(f, s0, s1, y0, y1, { cols = 2, rev = '#e2e0da', dep = 0.22, lit = r() < 0.3 } = {}) {
    f.cuts.push({ s0, s1, y0, y1 });
    const D_ = B.det, d = dep;
    D_.setColor(rev);
    quad(D_, at(f, s0, y0), at(f, s0, y0, -d), at(f, s0, y1, -d), at(f, s0, y1), f.U);
    quad(D_, at(f, s1, y0), at(f, s1, y0, -d), at(f, s1, y1, -d), at(f, s1, y1), f.U.map((v) => -v));
    quad(D_, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -d), at(f, s0, y1, -d), DN);
    quad(D_, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -d), at(f, s0, y0, -d), UP);
    const g = lit ? B.lit : B.glass, o = -d + 0.04;
    g.setColor(tint());
    quad(g, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[0, 0], [cols, 0], [cols, 1], [0, 1]]);
    D_.setColor(FRAME); box(D_, f, s0 - 0.03, s1 + 0.03, y0 - 0.05, y0, -0.02, 0.05, 'ft');
    nWin++;
  }
  const storeys = (fn) => { for (let k = 1; k <= NF; k++) fn(fy(k), k); };
  const band = (f, y, col = WHITE, out = 0.28) => { B.wall.setColor(col); box(B.wall, f, 0, f.L, y - 0.12, y + 0.12, 0, out, 'ftu', UVW); };
  const attic = (f, s0 = 0, s1 = f.L) => { B.seam.setColor(SEAM); box(B.seam, f, s0, s1, ROOF, ATT, -0.25, 0, 'ftb', UVS); };
  const plinth = (f, col = '#6b6e72') => { B.det.setColor(col); box(B.det, f, 0, f.L, gB, Y(0.1), 0, 0.04, 'ft'); };
  const zip = (f, y) => { if (Z && f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], y, f.nx, f.nz); } };
  const shop = (f, s0, s1, lit = r() < 0.5) => win(f, s0, s1, Y(0.05), Y(GF - 0.55), { cols: Math.max(2, Math.round((s1 - s0) / 0.85)), rev: '#4b4e52', dep: 0.3, lit });

  const faces = ringFaces(ring);
  faces.forEach((f, i) => {
    const q = role[i], Lf = f.L, c = Lf / 2;
    if (q.side === 'front') {
      const m = q.b.m;
      if (m === 'W') { // graphite frame, two wide windows a storey, two glazed shop doors under them
        const ww = (Lf - 2 * 0.75 - 0.45) / 2;
        storeys((y) => { win(f, 0.75, 0.75 + ww, y + 0.25, y + 2.85, { cols: 4, rev: '#4b4e52' }); win(f, Lf - 0.75 - ww, Lf - 0.75, y + 0.25, y + 2.85, { cols: 4, rev: '#4b4e52' }); });
        shop(f, 0.75, c - 0.25); shop(f, c + 0.25, Lf - 0.75);
        skin(B.wall, f, gB, TOPW, GRAPH, UVW);
        B.wall.setColor(GRAPH); rect(B.wall, f, 0, Lf, ROOF, TOPW, -0.3, UVW, f.N.map((v) => -v));
        B.seam.setColor(SEAM); box(B.seam, f, -0.02, Lf + 0.02, TOPW, TOPW + 0.14, -0.32, 0.06, 'ftlr', UVS);
        zip(f, TOPW);
      } else { // white: the end bay's wide window, or the recessed bays' narrow windows
        if (m === 'E') { storeys((y) => win(f, c - 1.5, c + 1.5, y + 0.25, y + 2.85, { cols: 4 })); shop(f, c - 1.7, c + 1.7); }
        else if (m === 's') { storeys((y) => win(f, c - 0.4, c + 0.4, y + 0.4, y + 2.7, { cols: 1 })); win(f, c - 0.45, c + 0.45, Y(0.6), Y(GF - 0.6), { cols: 1, rev: '#4b4e52' }); }
        else { // N: a narrow window each side of a timber strip; a door and a window in the ground storey
          storeys((y) => { win(f, 0.55, 1.2, y + 0.3, y + 2.75, { cols: 1 }); win(f, Lf - 1.2, Lf - 0.55, y + 0.3, y + 2.75, { cols: 1 }); });
          B.wood.setColor(WOOD); box(B.wood, f, 1.3, Lf - 1.3, Y(GF), ROOF, 0, 0.05, 'flr', UVT);
          win(f, 0.55, 1.55, Y(0), Y(2.7), { cols: 1, rev: '#4b4e52', dep: 0.3, lit: r() < 0.5 }); // the door
          win(f, Lf - 1.55, Lf - 0.55, Y(0.7), Y(GF - 0.6), { cols: 1, rev: '#4b4e52' });
        }
        skin(B.wall, f, gB, Y(GF), GRAPH, UVW); skin(B.wall, f, Y(GF), ROOF, WHITE, UVW);
        if (m !== 'E') for (const y of [Y(GF), fy(2), fy(3)]) band(f, y);
        attic(f); zip(f, ATT);
      }
      plinth(f);
    } else if (q.side === 'fstep') { // hidden behind the pilasters
      skin(B.wall, f, gB, Y(GF), GRAPH, UVW); skin(B.wall, f, Y(GF), ATT, WHITE, UVW);
    } else if (q.side === 'end') { // white render, grooves at the slab lines, a window group at the yard corner
      const [, ta] = toLocal(f.ax, f.az), fromYard = ta > D / 2, P = (a, b) => (fromYard ? [a, b] : [Lf - b, Lf - a]);
      storeys((y) => {
        win(f, ...P(1.0, 1.85), y + 0.3, y + 2.7, { cols: 1 }); win(f, ...P(3.35, 4.2), y + 0.3, y + 2.7, { cols: 1 });
        win(f, ...P(5.6, 6.45), y + 0.3, y + 2.7, { cols: 1 });
      });
      B.wood.setColor(WOOD); box(B.wood, f, ...P(2.0, 3.2), Y(GF), ROOF, 0, 0.05, 'flr', UVT);
      for (const [a, b] of [[1.0, 3.6], [8.5, 12.0], [14.6, 18.1]]) shop(f, ...P(a, b));
      skin(B.wall, f, gB, Y(GF), GRAPH, UVW); skin(B.wall, f, Y(GF), ROOF, WHITE, UVW);
      B.det.setColor('#a9a7a1');
      for (const y of [fy(2), fy(3)]) for (const dy of [-0.16, 0.16]) box(B.det, f, ...P(7.2, Lf), y + dy - 0.02, y + dy + 0.02, 0, 0.012, 'f');
      attic(f); zip(f, ATT); plinth(f);
    } else if (q.side === 'yard') { // bare brick
      const m = q.b.m;
      if (m === 'P') {
        storeys((y) => win(f, c - 1.6, c + 1.6, y + 0.4, y + 2.7, { cols: 4, rev: '#a4573b' }));
        win(f, c - 1.6, c + 1.6, Y(0.05), Y(GF - 0.6), { cols: 4, rev: '#a4573b', dep: 0.3, lit: r() < 0.5 });
      } else if (m === 'R') {
        for (const [a, b] of [[1.0, 1.95], [Lf - 1.95, Lf - 1.0]]) {
          storeys((y) => win(f, a, b, y + 0.5, y + 2.6, { cols: 1, rev: '#a4573b' }));
          win(f, a, b, Y(0.9), Y(GF - 0.7), { cols: 1, rev: '#a4573b' });
        }
      } else { // S: the stair, a window at each landing, the entrance under a timber canopy
        for (const y of [Y(GF / 2), fy(1) + FH / 2, fy(2) + FH / 2]) win(f, c - 0.55, c + 0.55, y + 0.6, y + 1.95, { cols: 2, rev: '#a4573b', lit: r() < 0.6 });
        win(f, c - 0.8, c + 0.8, Y(0), Y(2.4), { cols: 2, rev: '#a4573b', dep: 0.3, lit: true });
        B.wood.setColor(WOOD); box(B.wood, f, c - 1.6, c + 1.6, Y(2.75), Y(2.95), 0, 1.7, 'ftlru', UVT);
        solid(S, f, c - 1.6, c + 1.6, 0, 1.7, Y(2.75), Y(2.95), 'awning', 1);
        B.det.setColor(CONC); box(B.det, f, c - 1.4, c + 1.4, gB, Y(0), 0, 1.5, 'ftlr');
      }
      skin(B.brick, f, gB, TOPW, '#ffffff', UVB);
      B.brick.setColor('#ffffff'); rect(B.brick, f, 0, Lf, ROOF, TOPW, -0.3, UVB, f.N.map((v) => -v));
      B.det.setColor(CONC); for (const y of [Y(GF), fy(2), fy(3)]) box(B.det, f, 0, Lf, y - 0.11, y + 0.11, 0, 0.015, 'f');
      B.det.setColor('#8d8c88'); box(B.det, f, -0.02, Lf + 0.02, TOPW, TOPW + 0.08, -0.32, 0.05, 'ftlr');
      zip(f, TOPW);
    } else { // ystep
      skin(B.brick, f, gB, TOPW, '#ffffff', UVB);
      B.det.setColor('#8d8c88'); box(B.det, f, -0.02, Lf + 0.02, TOPW, TOPW + 0.08, -0.32, 0.05, 'ftlr');
    }
  });

  // the pilasters between the front bays: graphite in the ground storey, white above, a dark metal cap over the roof
  const fF = face(toMap(0, 0), toMap(L, 0), -V[0], -V[1]);
  for (const b of front.slice(1)) {
    const s = b.s0;
    B.wall.setColor(GRAPH); box(B.wall, fF, s - 0.45, s + 0.45, gB, Y(GF), -0.75, 0.3, 'flr', UVW);
    B.wall.setColor(WHITE); box(B.wall, fF, s - 0.45, s + 0.45, Y(GF), TOPW + 0.1, -0.75, 0.3, 'flrt', UVW);
    B.seam.setColor(SEAM); box(B.seam, fF, s - 0.3, s + 0.3, TOPW + 0.1, ATT + 0.35, -0.6, 0.2, 'flrtb', UVS);
    solid(S, fF, s - 0.45, s + 0.45, -0.75, 0.3, gB, ATT + 0.35);
  }

  // the roof: membrane, white flue stacks along the yard side
  B.det.setColor('#77787a'); B.det.fill(ring, [], ROOF + 0.02, true);
  for (const b of yard) if (b.m === 'P') for (const k of [-1, 1]) {
    const s = (b.s0 + b.s1) / 2 + k * 1.2, t = D - 3.2;
    B.wall.setColor('#f2f1ee'); box(B.wall, fF, s - 0.35, s + 0.35, ROOF, ROOF + 1.5, -t - 0.35, -t + 0.35, 'fblr', UVW);
    B.det.setColor('#4a4b4e'); box(B.det, fF, s - 0.45, s + 0.45, ROOF + 1.5, ROOF + 1.62, -t - 0.45, -t + 0.45, 'fblrtu');
  }
  for (const R of convexParts(ring)) S.prism(R.flat(), gB, TOPW, 0, 0, 'wall');

  const pane = paneTex(false), mask = paneTex(true), warm = new THREE.Color('#ffd7a0');
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.88 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r), vertexColors: true, roughness: 0.9 }),
    seam: new THREE.MeshStandardMaterial({ map: seamTex(), vertexColors: true, roughness: 0.45, metalness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex(r), vertexColors: true, roughness: 0.75 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.1, metalness: 0.4, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ map: pane, vertexColors: true, roughness: 0.12, metalness: 0.3, emissive: warm, emissiveMap: mask, emissiveIntensity: 0 }),
  };
  const out = finish(root, 'harmony', B, M, { shade: ['wall', 'brick', 'seam'] });
  console.log(`[cherkasy] Harmony house 1: ${nWin} windows, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  // generated trees keep off the block, the forecourt to the avenue and the yard road
  return {
    footprints: [{ poly: ring, h: ATT - gLo, kind: 'apt', name: 'Клубний комплекс Harmony' }],
    clear: (x, z) => { const [s, t] = toLocal(x, z); return (s > -5 && s < L + 5 && t > -15 && t < D + 9) || inPoly(ring, x, z); },
    update() { M.lit.emissiveIntensity = 0.9 * nightK.value; },
  };
}
