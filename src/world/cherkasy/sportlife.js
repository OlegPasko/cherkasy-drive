// OWNER: cherkasy. Фітнес-клуб «Sport Life» на Митниці, вулиця Козацька, 2 (OSM 159700781: the club with the pool on the
// Dnipro bank, the only Sport Life by Mytnytsia), rebuilt on a player's request (issue #25). After the club's own photo
// of the front (sportplace.in.ua): a two-storey box of silver composite panels facing the street and its parking. To the
// left a lower wing, glazed along its upper floor; then the entrance portal, a blue frame round red panels with the
// «SPORT LIFE» box on top, a grey canopy over the glass doors and a window over it; a strip of beige stone; then the
// tall hall: a ground floor of orange and blue panels between glass, a grey louvre band, the upper floor glazed full
// width on a fine mullion grid, a silver parapet stepping up in raised panels, blue pilasters at its corners. The sides
// and the back (the pool hall, toward the river) are white panels with a ribbon of high windows. The glazing and the
// sign light up at night.
//   SPORTLIFE_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildSportLife({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in a face frame (slabkit.js): s along the edge, y up, o outward. The front is the
// footprint's longest edge (on the street, facing west-south-west); t runs along it left to right as seen from the street.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, area2, bboxOf } from './geo.js';
import { canvasTex } from './sculpt.js';
import { face, ringFaces, at, rect, box, skin, hole, label, finish } from './slabkit.js';

const OSM_ID = 159700781;
export const SPORTLIFE_SKIP = new Set([OSM_ID]);

const LIFT = 0.15, WING_T = 17, WING_H = 8.0, MAIN_H = 10.4, CREST = 1.0; // floor over the street side, the wing's end, heights
const SILVER = '#c3c8cc', WHITE = '#e8ebec', PLINTH = '#7b7f81', BLUE = '#1f45a8', RED = '#c8242b', ORANGE = '#ea7a24', STONE = '#b7a58a';

// silver / white composite cassettes 1.5 x 1.2 m with dark joints, the vertex colour tints them
const panelTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#8d9195'; g.fillRect(0, 0, 3, h); g.fillRect(0, 0, w, 3);
});
// the sign box: «SPORT LIFE» on blue
const signTex = () => canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#1d3f9e'; g.fillRect(0, 0, w, h);
  g.font = 'bold 150px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const a = g.measureText('SPORT ').width, b = g.measureText('LIFE').width, x0 = (w - a - b) / 2;
  g.fillStyle = '#ffffff'; g.fillText('SPORT', x0, h / 2 + 6);
  g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.strokeText('LIFE', x0 + a, h / 2 + 6); g.fillStyle = '#e1251b'; g.fillText('LIFE', x0 + a, h / 2 + 6);
}, { repeat: false, aniso: 16 });

// keeps the part of the ring on the side of the line through c where (p - c) . d >= 0 (Sutherland-Hodgman)
function clip(P, c, d) {
  const out = [], side = (p) => (p[0] - c[0]) * d[0] + (p[1] - c[1]) * d[1];
  let prev = P[P.length - 1], sp = side(prev);
  for (const cur of P) {
    const sc = side(cur);
    if (sp < 0 !== sc < 0) { const f = sp / (sp - sc); out.push([prev[0] + f * (cur[0] - prev[0]), prev[1] + f * (cur[1] - prev[1])]); }
    if (sc >= 0) out.push(cur);
    prev = cur; sp = sc;
  }
  return out;
}

export function buildSportLife({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), n0 = S.count;
  const ring = ringPts(bld.p), all = ringFaces(ring);
  const F = all.reduce((a, b) => (b.L > a.L ? b : a)); // the front
  const rt = F.ux * F.nz - F.uz * F.nx >= 0, sOf = (t) => (rt ? t : F.L - t); // t: left to right from the street
  const mid = at(F, F.L / 2, 0, 2), yF = heightAt(mid[0], mid[2]) + LIFT, Y = (h) => yF + h;
  const gLo = Math.min(...ring.map((p) => heightAt(p[0], p[1]))) - 0.5;
  const B = { wall: new MB(), det: new MB(), lit: new MB(), glass: new MB(), curtain: new MB(), sign: new MB() };
  const D = B.det;
  let nOpen = 0;

  // the two masses: the wing left of the split line, the hall right of it
  const cut = at(F, sOf(WING_T), 0), dir = rt ? [F.ux, F.uz] : [-F.ux, -F.uz];
  const hallRing = clip(ring, [cut[0], cut[2]], dir), wingRing = clip(ring, [cut[0], cut[2]], [-dir[0], -dir[1]]);
  const onFront = (f) => Math.abs(f.nx * F.nx + f.nz * F.nz - 1) < 1e-3 && Math.abs((f.ax - F.ax) * F.nx + (f.az - F.az) * F.nz) < 0.05;
  const onCut = (f) => Math.abs(Math.abs(f.ux * dir[1] - f.uz * dir[0]) - 1) < 1e-3 && Math.abs((f.ax - cut[0]) * dir[0] + (f.az - cut[2]) * dir[1]) < 0.05;

  for (const [part, H] of [[wingRing, WING_H], [hallRing, MAIN_H]]) {
    if (part.length < 3) continue;
    for (const f of ringFaces(part)) {
      if (f.L < 0.3) continue;
      if (onCut(f)) { if (H === MAIN_H) skin(B.wall, f, Y(WING_H - 0.6), Y(H), SILVER, [1.5, 1.2]); continue; }
      if (onFront(f)) continue; // the front is laid below, element by element
      // sides and back: white panels over a plinth, a ribbon of high windows, a door or two on the long ones
      const g = Math.min(heightAt(...[at(f, 0, 0)[0], at(f, 0, 0)[2]]), heightAt(at(f, f.L, 0)[0], at(f, f.L, 0)[2]));
      if (f.L > 8) {
        const q = { s0: 2, s1: f.L - 2, y0: Y(H - 3.2), y1: Y(H - 1.9), glass: '#43525c', lit: true, frame: '#c4c9cc', rev: '#d7dadb', dep: 0.15, pitch: 1.5 };
        f.cuts.push(q); hole(B, f, q); nOpen++;
      }
      if (f.L > 25 && g > Y(-1.2)) {
        const q = { s0: f.L * 0.3 - 1, s1: f.L * 0.3 + 1, y0: Y(0), y1: Y(2.4), glass: '#525c63', frame: '#9aa0a4', rev: '#c2c6c8', dep: 0.12, pitch: 2, door: true };
        f.cuts.push(q); hole(B, f, q); nOpen++;
      }
      skin(B.wall, f, gLo, Y(0.5), PLINTH);
      skin(B.wall, f, Y(0.5), Y(H), WHITE, [1.5, 1.2]);
      D.setColor('#a8adb1'); box(D, f, -0.03, f.L + 0.03, Y(H), Y(H + 0.08), -0.25, 0.05, 'ft');
      D.setColor('#cdd1d4'); rect(D, f, 0, f.L, Y(H - 0.8), Y(H), -0.25, null, [-f.nx, 0, -f.nz]);
      if (f.L > 3) { const p0 = at(f, 0, 0, -0.12), p1 = at(f, f.L, 0, -0.12); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(H), f.nx, f.nz); }
    }
    D.setColor('#9fa2a1'); D.fill(part, [], Y(H - 0.8), true);
    S.prism((area2(part) < 0 ? part.slice().reverse() : part).flat(), gLo - 1, Y(H), 0, 0, 'wall');
  }

  // ---- the front, left to right: each element a face over its own t range
  const seg = (ta, tb, o = 0) => { // a face over t ta..tb, o out from the front line, s running left to right
    const a = at(F, sOf(ta), 0, o), b = at(F, sOf(tb), 0, o);
    return face([a[0], a[2]], [b[0], b[2]], F.nx, F.nz);
  };
  const plinth = (f) => skin(B.wall, f, gLo, Y(0.05), PLINTH);
  // the wing: shopfront glass under a grey band, the upper floor glazed, a silver parapet
  {
    const f = seg(0, WING_T);
    const g = { s0: 0.6, s1: f.L - 0.4, y0: Y(0.3), y1: Y(3.3), glass: '#44535d', lit: true, frame: '#c9ced2', rev: '#d3d6d8', dep: 0.15, pitch: 1.6 };
    const u = { s0: 0.6, s1: f.L - 0.4, y0: Y(4.3), y1: Y(6.6), glass: '#4d5d68', lit: true, frame: '#c9ced2', rev: '#d3d6d8', dep: 0.12, pitch: 1.5, tr: Y(5.5) };
    for (const q of [g, u]) { f.cuts.push(q); hole(B, f, q); nOpen++; }
    plinth(f); skin(B.wall, f, Y(0.05), Y(WING_H), SILVER, [1.5, 1.2]);
    D.setColor('#9ca2a7'); box(D, f, 0.3, f.L - 0.2, Y(3.5), Y(4.1), 0, 0.12, 'ftu');
    D.setColor(BLUE); box(D, f, 0, 0.6, gLo, Y(WING_H), 0, 0.2, 'fltr'); // the corner pilaster
  }
  // the portal: blue frame round red panels, the sign on top, a canopy over the doors, a window over that
  {
    const t0p = WING_T, t1p = WING_T + 7, f = seg(t0p, t1p, 0.6), PH = 9.4;
    const dr = { s0: 1.2, s1: f.L - 1.2, y0: Y(0.02), y1: Y(3.4), glass: '#3b4852', lit: true, frame: '#d0d4d7', rev: RED, dep: 0.35, pitch: 1.5, door: true };
    const win = { s0: 1.6, s1: f.L - 1.6, y0: Y(4.6), y1: Y(7.2), glass: '#46555f', lit: true, frame: '#d0d4d7', rev: RED, dep: 0.3, pitch: 1.4 };
    for (const q of [dr, win]) { f.cuts.push(q); hole(B, f, q); nOpen++; }
    plinth(f); skin(B.wall, f, Y(0.05), Y(PH), RED, [1.5, 1.2]);
    D.setColor(BLUE);
    box(D, f, 0, 0.8, gLo, Y(PH), -0.6, 0.15, 'fltr'); box(D, f, f.L - 0.8, f.L, gLo, Y(PH), -0.6, 0.15, 'frt');
    box(D, f, 0, f.L, Y(7.6), Y(PH), 0, 0.15, 'ftu');
    label(B.sign, f, 0.9, f.L - 0.9, Y(7.75), Y(9.25), 0.16, [0, 0, 1, 1]);
    D.setColor('#bfc4c8'); box(D, f, 0.4, f.L - 0.4, Y(3.6), Y(3.95), 0, 2.2, 'ftlru');
    B.lit.setColor('#fff2d8'); for (const s of [2, f.L / 2, f.L - 2]) rect(B.lit, f, s - 0.2, s + 0.2, Y(3.59), Y(3.59), 1.2, null, [0, -1, 0]);
    // the back of the portal's reach: its sides back to the hall line
    D.setColor(RED); box(D, f, 0, f.L, Y(0.05), Y(PH), -0.6, 0, 'lr');
    const P = [at(F, sOf(t0p), 0, 0), at(F, sOf(t1p), 0, 0), at(F, sOf(t1p), 0, 0.6), at(F, sOf(t0p), 0, 0.6)].map((p) => [p[0], p[2]]);
    S.prism((area2(P) < 0 ? P.reverse() : P).flat(), gLo, Y(PH), 0, 0, 'wall');
    const C = [at(F, sOf(t0p + 0.4), 0, 0.6), at(F, sOf(t1p - 0.4), 0, 0.6), at(F, sOf(t1p - 0.4), 0, 2.8), at(F, sOf(t0p + 0.4), 0, 2.8)].map((p) => [p[0], p[2]]);
    S.prism((area2(C) < 0 ? C.reverse() : C).flat(), Y(3.6), Y(3.95), 0, 0, 'awning', 1);
    // a small grey wall over the portal up to the hall's parapet
    const fw = seg(t0p, t1p);
    skin(B.wall, fw, Y(PH), Y(MAIN_H), SILVER, [1.5, 1.2]);
  }
  // beige stone between the portal and the hall's glass
  const TS = WING_T + 7, TH = TS + 3.6;
  { const f = seg(TS, TH); plinth(f); skin(B.wall, f, Y(0.05), Y(MAIN_H), STONE); D.setColor('#a8adb1'); box(D, f, 0, f.L, Y(MAIN_H), Y(MAIN_H + 0.08), -0.25, 0.05, 'ft'); }
  // the hall: panels and glass, the louvre band, the glazed upper floor, the stepped parapet, blue corner pilasters
  {
    const f = seg(TH, F.L), L = f.L, P1 = 0.9;
    plinth(f);
    // ground floor: a run of 2.4 m bays, orange / blue panels and glass, with two glazed groups
    const bays = Math.round((L - 2 * P1) / 2.4), bw = (L - 2 * P1) / bays;
    for (let i = 0; i < bays; i++) {
      const s0 = P1 + i * bw, s1 = s0 + bw, k = i % 7;
      if (k === 3 || k === 4) { const q = { s0: s0 + 0.05, s1: s1 - 0.05, y0: Y(0.2), y1: Y(3.9), glass: '#43525c', lit: true, frame: '#c9ced2', rev: '#d0d3d5', dep: 0.12, pitch: 2.4 }; f.cuts.push(q); hole(B, f, q); nOpen++; } else {
        D.setColor(k % 2 ? BLUE : ORANGE); rect(D, f, s0 + 0.05, s1 - 0.05, Y(0.2), Y(3.9), 0.04);
        D.setColor('#9ea4a8'); rect(D, f, s0, s0 + 0.05, Y(0.2), Y(3.9), 0.05); rect(D, f, s1 - 0.05, s1, Y(0.2), Y(3.9), 0.05);
      }
    }
    f.cuts.push({ s0: P1, s1: L - P1, y0: Y(0.2), y1: Y(3.9) }); // the panels sit in the skin's opening
    // the upper floor: one curtain of glass on a fine grid
    const up = { s0: P1, s1: L - P1, y0: Y(5.3), y1: Y(MAIN_H - 0.9) };
    f.cuts.push(up);
    B.curtain.setColor('#ffffff'); rect(B.curtain, f, up.s0, up.s1, up.y0, up.y1, -0.1);
    D.setColor('#d6dadd');
    for (let s = up.s0; s <= up.s1 + 1e-3; s += (up.s1 - up.s0) / Math.round((up.s1 - up.s0) / 1.5)) box(D, f, s - 0.04, s + 0.04, up.y0, up.y1, -0.1, 0.02, 'flr');
    for (const y of [up.y0, Y(6.8), up.y1]) box(D, f, up.s0, up.s1, y - 0.04, y + 0.04, -0.1, 0.02, 'ftu');
    // the louvre band under it: grey slats
    D.setColor('#4b5054'); rect(D, f, P1, L - P1, Y(3.95), Y(5.3), -0.12); // the dark backing behind the slats
    D.setColor('#8e9498');
    for (let y = Y(4.0); y < Y(5.25); y += 0.14) box(D, f, P1, L - P1, y, y + 0.06, -0.05, 0.08, 'ftu');
    f.cuts.push({ s0: P1, s1: L - P1, y0: Y(3.95), y1: Y(5.3) });
    skin(B.wall, f, Y(0.05), Y(MAIN_H), SILVER, [1.5, 1.2]);
    D.setColor(BLUE); for (const [s0, s1] of [[0, P1], [L - P1, L]]) box(D, f, s0, s1, gLo, Y(MAIN_H + 0.3), 0, 0.2, 'fltr');
    // the parapet steps up in raised panels along the top
    D.setColor(SILVER);
    for (let s = P1 + 0.2; s + 2.6 < L - P1; s += 3.2) box(D, f, s, s + 2.6, Y(MAIN_H), Y(MAIN_H + CREST), -0.3, 0.02, 'ftlrb');
    D.setColor('#a8adb1'); box(D, f, 0, L, Y(MAIN_H), Y(MAIN_H + 0.08), -0.25, 0.05, 'ft');
    const p0 = at(f, 0, 0, -0.12), p1 = at(f, L, 0, -0.12); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(MAIN_H), f.nx, f.nz);
  }

  // ---- roof kit: air handlers and a vent stack over the pool hall
  {
    const bb = bboxOf(hallRing), cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
    for (const [dx, dz, w, d, h] of [[-4, -3, 3.2, 2, 1.6], [5, 4, 2.4, 2.4, 1.3], [-2, 8, 4, 1.6, 1.1]]) {
      const x = cx + dx, z = cz + dz;
      D.setColor('#d5d7d7'); D.box(x - w / 2, Y(MAIN_H - 0.8), z - d / 2, x + w / 2, Y(MAIN_H - 0.8 + h), z + d / 2, 1 | 2 | 4 | 16 | 32);
      S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], Y(MAIN_H - 0.8), Y(MAIN_H - 0.8 + h), 0, 0, 'equipment');
    }
    D.setColor('#b9bdbf'); D.cyl(cx + 9, Y(MAIN_H - 0.8), cz - 6, 0.35, 0.35, 3, 10);
  }

  // ---- meshes
  const sign = signTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.4, metalness: 0.3 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffe6c0, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.4 }),
    curtain: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x6d8494, roughness: 0.06, metalness: 0.75, emissive: 0xfff0d8, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 }),
  };
  const out = finish(root, 'sportlife', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] Sport Life: ${nOpen} openings, floor ${yF.toFixed(1)} m (ground ${Math.min(...ring.map((p) => heightAt(p[0], p[1]))).toFixed(1)}..${Math.max(...ring.map((p) => heightAt(p[0], p[1]))).toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const bb = bboxOf(ring);
  return {
    footprints: [{ poly: ring, h: Y(MAIN_H) - gLo, kind: 'public', name: 'Sport Life' }],
    clear: (x, z) => x > bb.x0 - 3 && x < bb.x1 + 3 && z > bb.z0 - 3 && z < bb.z1 + 3,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.5 * k; M.curtain.emissiveIntensity = 0.22 * k; M.sign.emissiveIntensity = 0.08 + 0.9 * k; },
  };
}
