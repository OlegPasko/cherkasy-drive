// OWNER: cherkasy. The Cherkasy brewery (ВАТ «Черкаське пиво», founded 1910, вул. Благовісна 436 at the corner of
// Кобзарська in Кривалівка; today it bottles «Квіточка» water and lemonades) – its street front on Кобзарська and the
// sculpture with the plant's awards by the gate (OSM node 13034435620, quest card `brewery`). From the Wikimedia
// Commons photos (Cherkassy_Brewery.JPG, 2010: the gate from Кобзарська; Черкаське_пиво_2018.jpg: the corner from
// Благовісна) and the satellite roofs:
//   - the two-storey office left of the gate (OSM 399198135), faced in beige ceramic tile with darker tiled piers,
//     white windows, the door under a small canopy; behind it the narrow five-storey tiled tower of the brewhouse;
//   - the gate: two green steel leaves, solid below and barred above, with round gold-rimmed medallions, a red-and-white
//     barrier arm, the one-storey
//     tiled gatehouse to the right of it (OSM 1066701333);
//   - the long brown-brick production block (OSM 399198124, three storeys) along the street to Благовісна, with a
//     square brick chimney; the small whitewashed corner house with a hipped roof (OSM 1418387839);
//   - a white plastered fence with dark panels along Кобзарська west of the gatehouse.
// The sculpture: no photo of it was found, so its form is a guess – a red granite stele on a dark plinth carrying the
// plant's medals (gold, silver, bronze on ribbon bars), crowned by a bronze hop cone with two leaves.
// No lettering anywhere (a non-paying business): the medallions are plain discs.
//   BREWERY_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildBrewery({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, spots } | null
//     spots: { sculpture: [x, z], gate: [x, z] } (tests)
// Walls are bay-atlas quads (bayatlas.js) over one canvas: tile bays (rows 0-4), brick (5-7), whitewash (8-9).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf, inPoly, area2 } from './geo.js';
import { ringFaces, face, box, quad, at, finish } from './slabkit.js';
import { bayAtlas, band, blockBase, flat, hip, brickTex, sheetTex, brickRows } from './bayatlas.js';

const OFFICE = 399198135, MAIN = 399198124, GATEHOUSE = 1066701333, CORNER = 1418387839;
export const BREWERY_SKIP = new Set([OFFICE, MAIN, GATEHOUSE, CORNER]);

const FH = 3.6, ROWS = 10, A0 = { fh: FH, cols: 4, rows: ROWS };
const KIND = { tile: { r0: 0, nk: 5, bay: 3.4 }, brick: { r0: 5, nk: 3, bay: 4.2 }, white: { r0: 8, nk: 2, bay: 3.2 } };
const TOWER = [[-580, 3876.5], [-591, 3876.5], [-591, 3891], [-580, 3891]];   // the brewhouse tower inside the main block, behind the office
const STACK = [-546, 3896];                                                    // the square brick chimney
const FENCE = [[-704.4, 3853.2], [-621.4, 3854.6], [-621.4, 3859.9], [-616.8, 3859.9]];
const YARD_WALLS = [[[-572.9, 3859.9], [-556.2, 3858.9]], [[-538.2, 3856.4], [-534, 3856.4]]];
const GATE = [[-603.0, 3859.8], [-593.9, 3859.8]];                            // between the gatehouse and the office
const SCULPT = [-618.2, 3856.4];                                               // OSM node 13034435620

function cell(r) {
  return (g, x, y, w, h, i, j) => {
    if (j < 5) {
      // beige glazed tile 20 cm square, a darker tiled pier at the bay edge, a white PVC window
      g.fillStyle = '#cdb79a'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(90,70,50,0.25)';
      for (let k = 0; k < w; k += 7) g.fillRect(x + k, y, 1, h);
      for (let k = 0; k < h; k += 7) g.fillRect(x, y + k, w, 1);
      g.fillStyle = '#bea886'; g.fillRect(x, y, 8, h);
      const ww = w * 0.46, wh = h * 0.44, wx = x + (w - ww) / 2 + 3, wy = y + h * 0.26;
      g.fillStyle = '#f1f0eb'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      g.fillStyle = j === 0 && i % 2 ? '#7a6a8c' : j === 0 ? '#8a7b4e' : '#46525a'; g.fillRect(wx, wy, ww, wh);   // the top floor's coloured panes
      g.fillStyle = '#f1f0eb'; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
      g.fillStyle = '#e8e4da'; g.fillRect(wx - 5, wy + wh + 3, ww + 10, 3);
      return [[wx, wy, ww, wh]];
    }
    if (j < 8) {
      // brown brick with a rectangular window under a lintel, a course at the floor
      brickRows(g, x, y, w, h, r() < 0.5 ? '#8a5a40' : '#94634a', r);
      g.fillStyle = 'rgba(200,150,110,0.5)'; g.fillRect(x, y + h - 5, w, 4);
      const ww = w * 0.42, wh = h * 0.45, wx = x + (w - ww) / 2, wy = y + h * 0.24;
      g.fillStyle = '#6d4632'; g.fillRect(wx - 4, wy - 7, ww + 8, 6);
      g.fillStyle = '#d7d2c6'; g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      g.fillStyle = r() < 0.2 ? '#2a2c2c' : '#4b565c'; g.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      g.fillStyle = '#d7d2c6'; g.fillRect(wx + ww / 2 - 1, wy, 2, wh); g.fillRect(wx, wy + wh * 0.35, ww, 2);
      return [[wx, wy, ww, wh]];
    }
    // whitewashed old brick, a small window with brown-red frames and a brown plinth band
    g.fillStyle = '#ece9e1'; g.fillRect(x, y, w, h);
    for (let k = 0; k < 60; k++) { g.fillStyle = 'rgba(120,110,95,0.07)'; g.fillRect(x + r() * w, y + r() * h, 3, 2); }
    if (j === 9) { g.fillStyle = '#6f4a3b'; g.fillRect(x, y + h - 14, w, 14); }
    const ww = w * 0.32, wh = h * 0.42, wx = x + (w - ww) / 2, wy = y + h * 0.25;
    g.fillStyle = '#7b2f28'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    g.fillStyle = '#3d4549'; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#7b2f28'; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); g.fillRect(wx, wy + wh * 0.3, ww, 3);
    return [[wx, wy, ww, wh]];
  };
}

export function buildBrewery({ root, map, solids: S, heightAt }) {
  const get = (id) => map.buildings.find((q) => q.id === id);
  if (!get(MAIN) && !get(OFFICE)) return null;
  const t0 = performance.now(), r = rng(MAIN % 65521), n0 = S.count;
  const B = { wall: new MB(), plain: new MB(), det: new MB(), roof: new MB(), glass: new MB() }, D = B.det;
  const footprints = [], rings = [];
  const gMin = (ring) => Math.min(...ring.map(([x, z]) => heightAt(x, z)));

  // a block: every face clad from the atlas kind k over n storeys; faces under 1.5 m in the kind's plain colour
  function block(ring, k, n, plainCol, gLo = gMin(ring)) {
    const K = KIND[k], base = gLo + 0.3, eave = base + n * FH, A = { ...A0, bay: K.bay, base: blockBase(A0, K.r0, K.nk, base) };
    for (const f of ringFaces(ring)) {
      B.plain.setColor(k === 'white' ? '#6f4a3b' : '#7a6656');
      quad(B.plain, at(f, 0, gLo - 2), at(f, f.L, gLo - 2), at(f, f.L, base), at(f, 0, base), f.N, [[0, 0], [f.L, 0], [f.L, base - gLo + 2], [0, base - gLo + 2]]);
      if (f.L >= 1.5) { B.wall.setColor('#ffffff'); band(B.wall, f, A, base, eave); }
      else { B.plain.setColor(plainCol); quad(B.plain, at(f, 0, base), at(f, f.L, base), at(f, f.L, eave), at(f, 0, eave), f.N, [[0, base], [f.L, base], [f.L, eave], [0, eave]]); }
    }
    return { base, eave, gLo };
  }
  // a flat roof behind a low parapet
  function flatTop(ring, eave, col, par = 0.6) {
    flat(B.roof.setColor('#6c6f72'), ring, eave + 0.05);
    for (const f of ringFaces(ring)) { B.plain.setColor(col); box(B.plain, f, -0.05, f.L + 0.05, eave, eave + par, -0.25, 0.05, 'ftb', [1, 1]); }
    return eave + par;
  }

  // ---- the production block (three storeys of brown brick) and the brewhouse tower rising out of it
  const main = get(MAIN);
  if (main) {
    const ring = ringPts(main.p), m = block(ring, 'brick', 3, '#8a5a40'), top = flatTop(ring, m.eave, '#7d5038');
    S.prism(ring.flat(), m.gLo - 1, top, 0, 0, 'wall');
    rings.push(ring); footprints.push({ poly: ring, h: top - m.gLo, kind: 'industrial', name: 'Пивзавод' });
    const t = block(TOWER, 'tile', 5, '#cdb79a', m.gLo), tt = flatTop(TOWER, t.eave, '#b9a283', 0.8);
    S.prism(TOWER.flat(), t.gLo - 1, tt, 0, 0, 'wall');
    // the stair shaft on the tower's street face: a narrow tiled strip standing proud, its windows a vertical slot
    const sf = ringFaces(TOWER).find((f) => f.nz < -0.9);
    if (sf) {
      B.plain.setColor('#bfa889'); box(B.plain, sf, sf.L * 0.62, sf.L * 0.62 + 3.2, t.base, tt + 0.6, 0, 1.2, 'flrt', [1, 1]);
      B.glass.setColor('#3c4850'); box(B.glass, sf, sf.L * 0.62 + 1.1, sf.L * 0.62 + 2.1, t.base + 1.2, tt - 0.8, 1.2, 1.25, 'f');
    }
    // the square chimney
    const g = heightAt(...STACK);
    D.setColor('#8a5440'); D.boxC(STACK[0], g + 11, STACK[1], 1.9, 22, 1.9);
    D.setColor('#5e3c2e'); D.boxC(STACK[0], g + 22.2, STACK[1], 2.2, 0.5, 2.2);
    S.box(STACK[0] - 1, g - 1, STACK[1] - 1, STACK[0] + 1, g + 22.5, STACK[1] + 1, 'wall');
  }

  // ---- the office: two tiled storeys, the entrance under a canopy on the street face
  const off = get(OFFICE);
  if (off) {
    const ring = ringPts(off.p), m = block(ring, 'tile', 2, '#cdb79a'), top = flatTop(ring, m.eave, '#b9a283');
    S.prism(ring.flat(), m.gLo - 1, top, 0, 0, 'wall');
    rings.push(ring); footprints.push({ poly: ring, h: top - m.gLo, kind: 'office', name: 'Пивзавод' });
    const sf = ringFaces(ring).filter((f) => f.nz < -0.9).sort((a, b) => b.L - a.L)[0];
    if (sf) {
      const s0 = sf.L * 0.55, s1 = s0 + 1.8;
      B.glass.setColor('#e9e7e0'); box(B.glass, sf, s0 - 0.12, s1 + 0.12, m.base, m.base + 2.45, 0, 0.05, 'f');
      B.glass.setColor('#5c6b72'); box(B.glass, sf, s0, s1, m.base, m.base + 2.3, 0, 0.07, 'f');
      D.setColor('#9c3a2c'); box(D, sf, s0 - 0.8, s1 + 0.8, m.base + 2.7, m.base + 2.9, 0, 1.4, 'ftulr');
      D.setColor('#8e8a84'); box(D, sf, s0 - 1.2, s1 + 1.2, m.gLo - 0.3, m.base, 0, 1.8, 'ftlr');   // the steps
      S.prism([at(sf, s0 - 0.8, 0, 0), at(sf, s1 + 0.8, 0, 0), at(sf, s1 + 0.8, 0, 1.4), at(sf, s0 - 0.8, 0, 1.4)].map((p) => [p[0], p[2]]).flat(), m.base + 2.7, m.base + 2.9, 0, 0, 'awning', 1);
    }
  }

  // ---- the gatehouse: one tiled storey under a flat slab that overhangs its door
  const gh = get(GATEHOUSE);
  if (gh) {
    const ring = ringPts(gh.p), m = block(ring, 'tile', 1, '#cdb79a'), top = flatTop(ring, m.eave + 0.4, '#b9a283', 0.4);
    S.prism(ring.flat(), m.gLo - 1, top, 0, 0, 'wall');
    rings.push(ring); footprints.push({ poly: ring, h: top - m.gLo, kind: 'office', name: 'Прохідна' });
    B.plain.setColor('#cdb79a');
    for (const f of ringFaces(ring)) if (f.L >= 1.5) box(B.plain, f, 0, f.L, m.eave, m.eave + 0.4, -0.2, 0, 'f', [1, 1]);
    const ef = ringFaces(ring).find((f) => f.nx > 0.9);   // the side toward the gate: a steel door under the slab
    if (ef) {
      B.glass.setColor('#2f6b45'); box(B.glass, ef, ef.L * 0.3, ef.L * 0.3 + 1.0, m.base, m.base + 2.15, 0, 0.06, 'f');
      D.setColor('#d9d4c8'); box(D, ef, ef.L * 0.1, ef.L * 0.9, m.eave - 0.05, m.eave + 0.2, 0, 1.3, 'ftulr');
    }
  }

  // ---- the whitewashed corner house with its hipped sheet roof
  const ch = get(CORNER);
  if (ch) {
    const ring = ringPts(ch.p), m = block(ring, 'white', 1, '#ece9e1');
    let top = m.eave;
    if (ring.length === 4) top = hip(B.roof.setColor('#7d5a45'), ring, m.eave, 2.0, 0.5); else top = flatTop(ring, m.eave, '#ece9e1');
    S.prism(ring.flat(), m.gLo - 1, m.eave + (top - m.eave) * 0.5, 0, 0, 'wall');
    rings.push(ring); footprints.push({ poly: ring, h: top - m.gLo, kind: 'house', name: 'Пивзавод' });
  }

  // ---- the fence: white plaster between square piers, a dark sunk panel in each span
  const wall = (a, b, h = 2.2) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.3) return;
    const f = face(a, b, (b[1] - a[1]) / L, -(b[0] - a[0]) / L), g = Math.min(heightAt(...a), heightAt(...b)) - 0.3;
    const n = Math.max(1, Math.round(L / 3)), p = L / n;
    D.setColor('#ebe8e1'); box(D, f, 0, L, g, g + h, -0.12, 0.12, 'fbt');
    for (let i = 0; i < n; i++) {
      D.setColor('#dedad1'); box(D, f, i * p - 0.22, i * p + 0.22, g, g + h + 0.25, -0.2, 0.2, 'fblrt');
      if (p > 1.4) for (const o of [0.125, -0.125]) {
        D.setColor('#4c4f52'); const s0 = i * p + 0.5, s1 = (i + 1) * p - 0.5;
        quad(D, at(f, s0, g + 0.9, o * 1.02), at(f, s1, g + 0.9, o * 1.02), at(f, s1, g + 1.6, o * 1.02), at(f, s0, g + 1.6, o * 1.02), o > 0 ? f.N : f.N.map((v) => -v));
      }
    }
    if (n) { D.setColor('#dedad1'); box(D, f, L - 0.22, L + 0.22, g, g + h + 0.25, -0.2, 0.2, 'fblrt'); }
    const P = [at(f, 0, 0, -0.15), at(f, L, 0, -0.15), at(f, L, 0, 0.15), at(f, 0, 0, 0.15)].map((q) => [q[0], q[2]]);
    S.prism((area2(P) < 0 ? P.reverse() : P).flat(), g - 0.5, g + h, 0, 0, 'wall');
  };
  for (let i = 0; i + 1 < FENCE.length; i++) wall(FENCE[i], FENCE[i + 1]);
  for (const [a, b] of YARD_WALLS) wall(a, b);

  // ---- the gate: two green steel leaves of bars with a round medallion each, the barrier arm raised beside them
  {
    const [a, b] = GATE, L = Math.hypot(b[0] - a[0], b[1] - a[1]), f = face(a, b, 0, -1), g = Math.min(heightAt(...a), heightAt(...b)) - 0.1;
    D.setColor('#2f6b45');
    box(D, f, 0, L, g + 0.1, g + 0.22, -0.04, 0.04, 'fbt'); box(D, f, 0, L, g + 2.0, g + 2.12, -0.04, 0.04, 'fbtu');
    for (let s = 0.15; s < L; s += 0.22) box(D, f, s - 0.02, s + 0.02, g + 0.1, g + 2.12, -0.02, 0.02, 'fblr');
    for (const s of [0, L / 2, L]) box(D, f, s - 0.08, s + 0.08, g, g + 2.3, -0.08, 0.08, 'fblrt');
    box(D, f, 0.08, L - 0.08, g + 0.22, g + 1.55, -0.03, 0.03, 'fb');                      // the solid lower panels
    for (const s of [L * 0.25, L * 0.75]) {
      const c = at(f, s, g + 1.15, 0.05), xf = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(c[0], c[1], c[2]);
      D.setColor('#c9a447'); D.with(xf, (m) => m.cyl(0, 0, 0, 0.42, 0.42, 0.12, 18));
      D.setColor('#1f3a2c'); D.with(xf, (m) => m.cyl(0, 0.01, 0, 0.33, 0.33, 0.13, 18));
    }
    // the barrier arm, up, on a post just inside the gatehouse
    const p = at(f, 0.6, 0, -1.0);
    D.setColor('#d9d4c8'); D.boxC(p[0], g + 0.55, p[2], 0.3, 1.1, 0.3);
    const arm = new THREE.Matrix4().makeRotationZ(Math.PI * 0.42).setPosition(p[0], g + 1.1, p[2]);
    for (let k = 0; k < 8; k++) { D.setColor(k % 2 ? '#f1f0eb' : '#c8322a'); D.with(arm, (m) => m.box(k * 0.5, -0.05, -0.05, (k + 1) * 0.5, 0.05, 0.05)); }
    const P = [at(f, 0, 0, -0.1), at(f, L, 0, -0.1), at(f, L, 0, 0.1), at(f, 0, 0, 0.1)].map((q) => [q[0], q[2]]);
    S.prism((area2(P) < 0 ? P.reverse() : P).flat(), g - 0.5, g + 2.3, 0, 0, 'wall');
  }

  // ---- the sculpture with the plant's awards: plinth, stele, medals on ribbon bars, the bronze hop cone on top
  {
    const [x, z] = SCULPT, g = heightAt(x, z) - 0.05, f = face([x + 0.6, z], [x - 0.6, z], 0, -1);   // facing the street (-z)
    D.setColor('#3b3a3c'); D.boxC(x, g + 0.25, z, 1.8, 0.5, 1.1);
    D.setColor('#2d2c2e'); D.boxC(x, g + 0.56, z, 1.5, 0.12, 0.85);
    D.setColor('#8c3a32'); D.boxC(x, g + 0.62 + 1.35, z, 1.15, 2.7, 0.36);
    const medal = (s, y, col, rib) => {
      D.setColor(rib); box(D, f, s - 0.12, s + 0.12, y + 0.26, y + 0.4, 0.18, 0.21, 'ftlr');
      const c = at(f, s, y, 0.18), xf = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(c[0], c[1], c[2]);
      D.setColor(col); D.with(xf, (m) => m.cyl(0, 0, 0, 0.19, 0.19, 0.05, 16));
      D.setColor(col === '#c9cacc' ? '#e6e7e9' : '#efd27a'); D.with(xf, (m) => m.cyl(0, 0.01, 0, 0.12, 0.12, 0.055, 12, true));
    };
    const GOLD = '#d4a64a', SILVER = '#c9cacc', BRONZE = '#b07a45';
    [[0.3, g + 2.8, GOLD, '#2d4f9c'], [0.9, g + 2.8, GOLD, '#b8322a'], [0.3, g + 2.2, SILVER, '#2d4f9c'], [0.9, g + 2.2, GOLD, '#2f7d4c'], [0.3, g + 1.6, BRONZE, '#b8322a'], [0.9, g + 1.6, SILVER, '#2d4f9c']]
      .forEach(([s, y, c, rb]) => medal(s, y, c, rb));
    // the hop cone: stacked bronze rings narrowing up, two leaves
    const ty = g + 0.62 + 2.7;
    D.setColor('#9a7a3e');
    for (let k = 0; k < 6; k++) { const rr = 0.32 * Math.sin(((k + 0.6) / 6.5) * Math.PI); D.cyl(x, ty + k * 0.14, z, rr, rr * 0.8, 0.16, 10); }
    D.setColor('#7e6a34');
    for (const sx of [-1, 1]) D.with(new THREE.Matrix4().makeRotationZ(sx * 0.9).setPosition(x + sx * 0.25, ty + 0.3, z), (m) => m.box(-0.06, 0, -0.18, 0.06, 0.5, 0.18));
    S.box(x - 0.9, g - 0.5, z - 0.55, x + 0.9, ty + 0.9, z + 0.55, 'wall');
  }

  const AT = bayAtlas({ cols: 4, rows: ROWS, cw: 128, ch: 104, r, lit: 0.3, cell: cell(r) });
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: AT.tex, emissiveMap: AT.mask, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.8, vertexColors: true }),
    plain: new THREE.MeshStandardMaterial({ map: brickTex(r), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }),
    roof: new THREE.MeshStandardMaterial({ map: sheetTex(), vertexColors: true, roughness: 0.7, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.3 }),
  };
  const out = finish(root, 'brewery', B, M, { shade: ['wall', 'plain', 'det', 'roof'] });
  console.log(`[cherkasy] Brewery: ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const bbs = rings.map(bboxOf);
  return {
    footprints,
    spots: { sculpture: SCULPT, gate: [(GATE[0][0] + GATE[1][0]) / 2, GATE[0][1]] },
    clear: (x, z) => rings.some((ring, i) => x > bbs[i].x0 - 2 && x < bbs[i].x1 + 2 && z > bbs[i].z0 - 2 && z < bbs[i].z1 + 2 && inPoly(ring, x, z)) || Math.hypot(x - SCULPT[0], z - SCULPT[1]) < 3,
    update() { M.wall.emissiveIntensity = 1.2 * nightK.value; },
  };
}
