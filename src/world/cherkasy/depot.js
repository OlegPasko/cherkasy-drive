// OWNER: cherkasy. ТРЦ «DEPO't Center», бульвар Шевченка, 385 (OSM 398694732): the four-storey mall on the boulevard,
// after the opening-day photo (procherk.info, June 2016) and the satellite view. A long box of pale grey panels with
// two continuous blue ribbon windows on the upper floors, a shop line under a thin canopy along the boulevard and two
// darker glazed bays breaking the length. The north-west end, on the square, is the showpiece: a tall grey tower with
// the five stacked coloured cubes D-E-P-O-t (white letters on two faces, «CENTER» under them) and a blue glass strip,
// and beside it the corner block in blue glass wrapped by a rainbow of six stripes under a dark grey top band, over the
// main entrance: a deep canopy on round columns with «ТОРГОВО-РОЗВАЖАЛЬНИЙ ЦЕНТР» on its fascia. The other walls are
// plain panels with service doors. The cubes, stripes, ribbon windows and shop line light up at night.
//   DEPOT_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildDepot({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in a face frame (blockkit.js): s along the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf } from './geo.js';
import { canvasTex } from './sculpt.js';
import { ringFaces, face, at, rect, box, skin, hole, solid, finish, label } from './blockkit.js';

const OSM_ID = 398694732;
export const DEPOT_SKIP = new Set([OSM_ID]);

const TOP = 19.2, G1 = 4.8, TWR = 28.5;                 // parapet top, shop line height, tower top
const FX = -38.9, NWZ = 3370.5, SEZ = 3509.4;            // the boulevard front line (map x) and its two ends (map z)
const TOWER = [-31.1, 3362.1, -22.0, 3371.0];           // tower rect [x0, z0, x1, z1]
const CORNER = 27;                                       // the glass corner block: the first metres of the front
const PANEL = '#dadddf', DARK = '#4b5054', PLINTH = '#7d8185', RIBBON = '#3f7fc2';
const CUBES = ['#d8262b', '#2f9e4a', '#2f6fd6', '#7a3fb5', '#f1c21b'], LETTERS = ['D', 'E', 'P', 'O', 't'];
const RAINBOW = ['#d7262c', '#f07f22', '#f4c51c', '#2ea24b', '#2c6fd0', '#7c3db6'];

// pale grey cassettes 1.5 x 1.5 m with dark joints
const panelTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f3f4f4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8a8f93'; g.fillRect(0, 0, 2, h); g.fillRect(0, 0, w, 2);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(2, 2, w - 2, 2);
});
// atlas 2048 x 1024: row 0 the five letter faces (256 px cells) and the rainbow cell; row 1 the entrance fascia text;
// row 2 «CENTER»
const cell = (i) => [i * 0.125, 0, (i + 1) * 0.125, 0.25];
const RAIN = [0.625, 0, 0.75, 0.25], FASC = [0, 0.3, 1, 0.42], CENTER = [0, 0.45, 0.5, 0.53];
const atlasTex = () => canvasTex(2048, 1024, (g) => {
  g.clearRect(0, 0, 2048, 1024);
  CUBES.forEach((c, i) => {
    g.fillStyle = c; g.fillRect(i * 256, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(i * 256, 0, 256, 18); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(i * 256, 238, 256, 18);
    g.font = 'bold 200px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.fillText(LETTERS[i], i * 256 + 128, 138);
  });
  RAINBOW.forEach((c, i) => { g.fillStyle = c; g.fillRect(1280, i * 256 / 6, 256, 256 / 6 - 6); });
  g.fillStyle = '#3b3f43'; g.fillRect(0, 307, 2048, 123);
  g.font = 'bold 84px Arial, Helvetica, sans-serif'; g.fillStyle = '#e9ecee'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ТОРГОВО-РОЗВАЖАЛЬНИЙ ЦЕНТР', 1024, 370, 1900);
  g.font = 'bold 70px Arial, Helvetica, sans-serif'; g.fillStyle = '#6d7479'; g.fillText('C E N T E R', 512, 505, 1000);
}, { repeat: false, aniso: 16 });

export function buildDepot({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), faces = ringFaces(ring);
  const hs = ring.map((p) => heightAt(p[0], p[1])), gLo = Math.min(...hs) - 0.5;
  const yF = heightAt(FX - 6, NWZ + 40) + 0.15, Y = (h) => yF + h;
  const B = { wall: new MB(), det: new MB(), lit: new MB(), glass: new MB(), curtain: new MB(), sign: new MB() };
  const D = B.det, PUV = [1.5, 1.5];
  let nOpen = 0;

  // the boulevard front as its own frame: s from the north-west corner (0) to the south-east end, o out to the street
  const FF = face([FX, NWZ], [FX, SEZ], -1, 0);
  const isFront = (f) => f.nx < -0.9 && f.L > 100;
  const bays = [[58, 64], [98, 104]]; // the darker glazed bays along the front
  for (const f of faces) {
    if (f.L < 0.3) continue;
    if (isFront(f)) continue; // laid below in FF
    // plain walls: plinth, panels, service doors where the ground allows, a dark band at the top
    const nd = f.L > 60 ? 3 : f.L > 20 ? 1 : 0;
    for (let i = 0; i < nd; i++) {
      const s = f.L * (i + 0.5) / nd, dp = at(f, s, 0, 1.5), gd = heightAt(dp[0], dp[2]);
      if (gd > Y(0.5) || gd < Y(-2)) continue;
      f.cuts.push({ s0: s - 1.8, s1: s + 1.8, y0: gd + 0.05, y1: gd + 3.6, glass: '#50565a', frame: '#5d6367', rev: '#9ea3a6', dep: 0.15, pitch: 1.8, door: true });
    }
    skin(B.wall, f, gLo, Y(0.5), PLINTH);
    skin(B.wall, f, Y(0.5), Y(TOP), PANEL, PUV);
    for (const q of f.cuts) { hole(B, f, q); nOpen++; }
    D.setColor(DARK); box(D, f, -0.02, f.L + 0.02, Y(TOP - 1.4), Y(TOP), 0, 0.08, 'ft');
    parapet(f, Y(TOP));
  }
  function parapet(f, top) {
    D.setColor('#c5c8ca'); rect(D, f, 0, f.L, top - 1.0, top, -0.3, null, [-f.nx, 0, -f.nz]);
    D.setColor('#9ea3a6'); box(D, f, -0.03, f.L + 0.03, top, top + 0.06, -0.3, 0.05, 'ft');
    if (f.L > 3) { const p0 = at(f, 0, 0, -0.12), p1 = at(f, f.L, 0, -0.12); Z.edge(p0[0], p0[2], p1[0], p1[2], top, f.nx, f.nz); }
  }

  // ---- the boulevard front
  const F = FF, L = F.L;
  // shop line: glazing under a thin canopy, the whole length past the corner block
  for (let s = CORNER + 0.5; s < L - 1; s += 9) {
    const s1 = Math.min(L - 0.6, s + 8.4), dp = at(F, (s + s1) / 2, 0, 1.5), gd = heightAt(dp[0], dp[2]);
    F.cuts.push({ s0: s, s1, y0: Math.max(Y(0.02), gd + 0.05), y1: Y(G1 - 0.5), glass: ['#46535b', '#4d585c', '#3f4a52'][(r() * 3) | 0], lit: r() < 0.8, frame: '#a3a9ad', rev: '#b7bbbd', dep: 0.18, pitch: 1.4, tr: Y(3.2), door: r() < 0.25 });
  }
  // ribbon windows on the upper floors, broken by the dark bays
  const runs = [[CORNER + 1, bays[0][0]], [bays[0][1], bays[1][0]], [bays[1][1], L - 1.5]];
  for (const [a, b] of runs) for (const y of [7.6, 12.1]) F.cuts.push({ s0: a + 0.8, s1: b - 0.8, y0: Y(y), y1: Y(y + 2.0), glass: RIBBON, lit: r() < 0.6, frame: '#eef0f1', rev: '#c9cdd0', dep: 0.16, pitch: 1.5 });
  for (const [a, b] of bays) F.cuts.push({ s0: a + 0.3, s1: b - 0.3, y0: Y(G1 + 0.6), y1: Y(TOP - 2.2), glass: '#2f5f93', lit: true, frame: '#3a3f43', rev: DARK, dep: 0.2, pitch: 1.5, tr: Y(10.4) });
  // the glass corner block over the main entrance
  F.cuts.push({ s0: 0.4, s1: CORNER - 0.4, y0: Y(G1 + 0.9), y1: Y(TOP - 4.2), glass: '#2f6aa8', lit: true, frame: '#c5cacd', rev: DARK, dep: 0.12, pitch: 1.6, tr: Y(9.8) });
  F.cuts.push({ s0: 1.2, s1: CORNER - 1.2, y0: Y(0.02), y1: Y(G1 - 0.2), glass: '#3a4a52', lit: true, frame: '#8c9398', rev: '#8c9398', dep: 1.2, pitch: 1.6, tr: Y(3.4), door: true });
  F.cuts.push({ s0: 1.0, s1: CORNER - 1.0, y0: Y(TOP - 3.1), y1: Y(TOP - 1.9), glass: RIBBON, lit: true, frame: '#eef0f1', rev: DARK, dep: 0.12, pitch: 1.5 });
  nOpen += F.cuts.length;
  skin(B.wall, F, gLo, Y(0.5), PLINTH);
  F.cuts.push({ s0: 0, s1: CORNER, y0: Y(G1), y1: Y(TOP), skin: 'dark' }, ...bays.map(([a, b]) => ({ s0: a, s1: b, y0: Y(G1), y1: Y(TOP), skin: 'dark' })));
  skin(B.wall, F, Y(0.5), Y(TOP), PANEL, PUV);
  const plain = F.cuts.filter((q) => q.skin);
  F.cuts = F.cuts.filter((q) => !q.skin);
  for (const q of F.cuts) hole(B, F, q);
  // the dark skins of the corner block and the bays, round their own glazing
  for (const [a, b] of plain.map((q) => [q.s0, q.s1])) {
    const sub = { ...F, ax: at(F, a, 0)[0], az: at(F, a, 0)[2], L: b - a, cuts: F.cuts.filter((q) => q.s0 >= a && q.s1 <= b && q.y0 >= Y(G1)).map((q) => ({ ...q, s0: q.s0 - a, s1: q.s1 - a })) };
    skin(B.wall, sub, Y(G1), Y(TOP), DARK, PUV);
    D.setColor('#33373a'); box(D, sub, -0.05, sub.L + 0.05, Y(TOP - 0.4), Y(TOP), 0, 0.25, 'ftlr');
  }
  D.setColor('#9ea3a6'); box(D, F, CORNER, L, Y(15.2), Y(15.9), 0, 0.12, 'ftu'); // the grey band under the top
  parapet(F, Y(TOP));
  // the rainbow: six stripes across the glass of the corner block, and round onto its north-west return
  const rainY = [Y(9.3), Y(11.5)];
  label(B.sign, F, 0.2, CORNER - 0.2, rainY[0], rainY[1], 0.32, RAIN);
  D.setColor('#d7262c'); box(D, F, 0.2, CORNER - 0.2, rainY[0], rainY[1], 0, 0.3, 'tu');
  // thin canopy along the shop line, a deep one on round columns over the main entrance with the fascia text
  D.setColor('#b9bdc0'); box(D, F, CORNER, L - 0.3, Y(G1 - 0.25), Y(G1), 0, 2.2, 'ftlru');
  solid(S, F, CORNER, L - 0.3, 0, 2.2, Y(G1 - 0.25), Y(G1), 'awning', 1);
  D.setColor(DARK); box(D, F, -3.5, CORNER + 0.4, Y(G1), Y(G1 + 1.3), 0, 4.6, 'ftlru');
  label(B.sign, F, 1.2, CORNER - 1.2, Y(G1 + 0.2), Y(G1 + 1.1), 4.62, FASC);
  solid(S, F, -3.5, CORNER + 0.4, 0, 4.6, Y(G1), Y(G1 + 1.3), 'awning', 1);
  B.lit.setColor('#fff2dc');
  for (let s = 2; s < CORNER; s += 3) rect(B.lit, F, s - 0.25, s + 0.25, Y(G1) - 0.01, Y(G1) - 0.01, 2.4, null, [0, -1, 0]);
  for (const s of [1.5, 9.5, 17.5, CORNER - 1]) {
    const p = at(F, s, 0, 4.0);
    D.setColor('#c9cdd1'); D.cyl(p[0], Y(-0.2), p[2], 0.34, 0.34, G1 + 0.2, 14, false);
    S.cyl(p[0], p[2], Y(-0.3), Y(G1), 0.34, 0.34, 'pole');
  }
  D.setColor('#8e9194'); box(D, F, -3.5, CORNER + 0.4, Y(-0.25), Y(0.02), 0, 4.6, 'ft'); // the entrance landing

  // ---- the tower: grey shaft over the roof, blue glass strip, the cube stack on the square side
  const [x0, z0, x1, z1] = TOWER;
  const tf = { nw: face([x1, z0], [x0, z0], 0, -1), sw: face([x0, z0], [x0, z1], -1, 0), ne: face([x1, z1], [x1, z0], 1, 0), se: face([x0, z1], [x1, z1], 0, 1) };
  for (const [k, f] of Object.entries(tf)) {
    const base = k === 'se' ? Y(TOP - 1) : gLo;
    if (k === 'nw') f.cuts.push({ s0: 0.5, s1: 1.6, y0: Y(G1), y1: Y(TWR - 1.5), glass: RIBBON, lit: true, frame: '#e4e7e9', rev: PANEL, dep: 0.12, pitch: 2, tr: 0 });
    if (k === 'sw') f.cuts.push({ s0: 1.0, s1: 2.1, y0: Y(TOP + 0.5), y1: Y(TWR - 1.5), glass: RIBBON, lit: true, frame: '#e4e7e9', rev: PANEL, dep: 0.12, pitch: 2 });
    skin(B.wall, f, base, Y(TWR), PANEL, PUV);
    for (const q of f.cuts) { hole(B, f, q); nOpen++; }
    parapet(f, Y(TWR));
  }
  D.setColor('#8f9396'); D.fill([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], [], Y(TWR - 0.9), true);
  S.prism([x0, z0, x1, z0, x1, z1, x0, z1], gLo, Y(TWR), 0, 0, 'wall');
  { // five 4.3 m cubes stacked at the tower's west corner, 3 m proud of its square face and a metre past its street
    // side; the letter on the square face and on the side turned to the boulevard
    const f = tf.nw, CU = 4.3, DEP = 3.0, sR = f.L + 1.0, sL = sR - CU, yTop = Y(TWR - 1.4);
    for (let i = 0; i < 5; i++) {
      const y1 = yTop - i * (CU + 0.12), y0 = y1 - CU;
      label(B.sign, f, sL, sR, y0, y1, DEP, cell(i));
      label(B.sign, face(at(f, sR, 0, DEP), at(f, sR, 0, 0), f.ux, f.uz), 0, DEP, y0, y1, 0, [cell(i)[0] + 0.012, 0, cell(i)[2] - 0.012, 0.25]);
      D.setColor(CUBES[i]); box(D, f, sL, sR, y0, y1, 0, DEP, 'ltu');
    }
    const yb = yTop - 5 * (CU + 0.12);
    label(B.sign, f, sL - 1.6, sR - 0.4, yb - 0.9, yb - 0.1, 0.05, CENTER);
    solid(S, f, sL, sR, 0, DEP, yb, yTop);
  }

  // ---- roof: membrane, two white hatches (seen from the air), air handlers
  D.setColor('#9fa1a1'); D.fill(ring, [], Y(TOP - 1.0), true);
  const bb = bboxOf(ring);
  for (const [x, z, w, d, h, col] of [[-24, 3395, 5, 7, 1.0, '#eeeeec'], [-22, 3440, 5, 7, 1.0, '#eeeeec'], [-5, 3420, 3.5, 2.5, 1.8, '#cfd1d1'], [0, 3470, 3, 3, 1.6, '#cfd1d1'], [-10, 3490, 4, 2.4, 1.8, '#cfd1d1'], [-2, 3380, 2.4, 2.4, 1.4, '#cfd1d1']]) {
    D.setColor(col); D.box(x - w / 2, Y(TOP - 1), z - d / 2, x + w / 2, Y(TOP - 1 + h), z + d / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], Y(TOP - 1), Y(TOP - 1 + h), 0, 0, 'equipment');
  }
  S.prism(ring.flat(), gLo - 1, Y(TOP), 0, 0, 'wall');

  const atlas = atlasTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.5, metalness: 0.2 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.4, emissive: 0xffe4bf, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.4 }),
    curtain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.7 }),
    sign: new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.3, roughness: 0.4 }),
  };
  const out = finish(root, 'depot', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] DEPO't Center: ${nOpen} openings, floor ${yF.toFixed(1)} m (ground ${Math.min(...hs).toFixed(1)}..${Math.max(...hs).toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    footprints: [{ poly: ring, h: Y(TOP) - gLo, kind: 'retail', name: "DEPO't Center" }, { poly: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h: Y(TWR) - gLo, kind: 'retail', name: "DEPO't Center" }],
    clear: (x, z) => x > bb.x0 - 6 && x < bb.x1 + 3 && z > bb.z0 - 4 && z < bb.z1 + 3,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.45 * k; M.sign.emissiveIntensity = 0.75 * k; },
  };
}
