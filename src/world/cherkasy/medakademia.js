// OWNER: cherkasy. Вулиця Хрещатик, 215: the Cherkasy medical academy on the corner of Khreshchatyk and Baidy
// Vyshnevetskoho, rebuilt after the Wikimedia Commons dusk photo (71-101-0054 Cherkasy DSC_0044, 2018), the cherkasy.city
// cover photo of the corner and the academy's own banner photo, with the Esri satellite view. An L of four storeys
// round a back yard (OSM says five; every photo shows four). The corner is a quarter round: three ribbon windows between
// beige bands, a tall blank parapet over them, and on the ground floor a glazed lobby set back behind four slender white
// columns under the gold letters «МЕДИЧНА АКАДЕМІЯ». Beside it on Khreshchatyk a full-height glazed stair strip between
// white fins, then the brick wing; on Baidy Vyshnevetskoho the wing in beige bands with maroon piers between the windows
// and a brown top band. Plain windows on the yard sides, blank party walls where a neighbour abuts, lit windows and a
// warm lobby at night.
//   MEDAKAD_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildMedAkademia({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The two street walls are split into a wing part and a corner part so each can carry its own finish; the round is
// the short diagonal faces between them (civic.js keeps each OSM arc segment as its own face).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, inPoly } from './geo.js';
import { canvasTex } from './sculpt.js';
import { wallFaces, at, quad, skin, fbox, fsolid, wallAround, fillOpening, stoneTex, brickTex, pack } from './civic.js';

const OSM_ID = 155354150;
export const MEDAKAD_SKIP = new Set([OSM_ID]);

const GF = 4.2, FH = 3.5, NF = 4, PAR_W = 0.8, PAR_C = 2.6;  // storeys; parapet over the wings and over the corner
const CZK = 5, CZB = 4;                                     // corner finish on the straight walls either side of the round
const WHITE = '#eeebe2', BEIGE = '#dcc9a0', MAROON = '#7b4744', BROWN = '#80604e', PLINTH = '#a29d94', LEDGE = '#d9cdb5';
const GLASS = ['#56626a', '#4d5a61', '#65717a'], CURTAIN = ['#e7e2d4', '#dcd8cc', '#efe9dc'];

// the lettering over the lobby: sixteen gold capitals evenly spaced on transparent
const lettersTex = () => canvasTex(2048, 160, (g, w, h) => {
  const text = 'МЕДИЧНА АКАДЕМІЯ', cell = w / text.length;
  Object.assign(g, { font: 'bold 124px Georgia, "Times New Roman", serif', textAlign: 'center', textBaseline: 'middle', lineWidth: 5, strokeStyle: '#6b4e1c', fillStyle: '#d8ab4c' });
  [...text].forEach((ch, i) => { g.strokeText(ch, (i + 0.5) * cell, h / 2 + 4); g.fillText(ch, (i + 0.5) * cell, h / 2 + 4); });
}, { repeat: false });

export function buildMedAkademia({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991), n0 = S.count ?? 0;
  const ring = ringPts(b.p), faces = wallFaces(ring);
  const widest = (ok) => faces.filter(ok).reduce((m, f) => (!m || f.w > m.w ? f : m), null);
  const kh = widest((f) => f.nx < -0.9), bd = widest((f) => f.nz > 0.9);          // Khreshchatyk, Baidy Vyshnevetskoho
  const arc = faces.filter((f) => f.w < 4 && f.nx < -0.1 && f.nz > 0.1).sort((p, q) => Math.atan2(q.nz, q.nx) - Math.atan2(p.nz, p.nx));
  if (!kh || !bd || arc.length < 2) return null;
  // a part of a face: same frame, shifted to s0, with its own openings
  const part = (f, s0, s1) => ({ ...f, ax: f.ax + f.rx * s0, az: f.az + f.rz * s0, w: s1 - s0, open: [] });
  const khW = part(kh, 0, kh.w - CZK), khC = part(kh, kh.w - CZK, kh.w), bdC = part(bd, 0, CZB), bdW = part(bd, CZB, bd.w);
  const corner = [khC, ...arc, bdC], rest = faces.filter((f) => f !== kh && f !== bd && !arc.includes(f));

  // walls that a neighbour stands against stay blank
  const [x0, z0] = ring[0], near = map.buildings.filter((q) => q.id !== OSM_ID && Math.abs(q.p[0] - x0) < 90 && Math.abs(q.p[1] - z0) < 90).map((q) => ringPts(q.p));
  const party = (f) => { const [x, , z] = at(f, f.w / 2, 0, 0.9); return near.some((P) => inPoly(P, x, z)); };

  const out = (f, o = 3) => { const [x, , z] = at(f, f.w / 2, 0, o); return heightAt(x, z); };
  const yF = Math.max(out(arc[1]), out(khC), out(bdC)) + 0.25, gBase = Math.min(...ring.map(([x, z]) => heightAt(x, z))) - 0.6;
  const fl = (k) => yF + (k ? GF + (k - 1) * FH : 0), yRoof = fl(NF), yTopW = yRoof + PAR_W, yTopC = yRoof + PAR_C;
  const LOB = fl(1) - 1.0;                                           // top of the lobby glazing, bottom of the letter band

  const B = { wall: new MB(), brick: new MB(), det: new MB(), glass: new MB(), lit: new MB(), gold: new MB() };
  let nWin = 0;
  const win = (f, s0, s1, y0, y1, extra = {}) => {
    const curtain = r() < 0.35;
    f.open.push({ s0, s1, y0, y1, dep: 0.18, frame: '#f4f4f1', rev: '#d6d2c8', pane: 0.85, sill: '#c9c5bb', glass: curtain ? CURTAIN[Math.floor(r() * 3)] : GLASS[Math.floor(r() * 3)], lit: r() < 0.35, ...extra });
    nWin++;
  };
  const bays = (s0, s1, step) => { const n = Math.max(1, Math.round((s1 - s0) / step)), d = (s1 - s0) / n; return Array.from({ length: n }, (_, i) => s0 + (i + 0.5) * d); };
  // horizontal bands of finish, each laid round the openings: [y0, y1, colour, builder, uv metres]
  const bands = (f, list) => { for (const [y0, y1, col, D = B.wall, uv = [3, 3]] of list) if (y1 > y0) wallAround(D, f, y0, y1, uv, col); };

  // ---- the corner: ribbon windows round the arc and a little way along both streets, the lobby under them
  const RB = (k) => [fl(k) + 0.9, fl(k) + 2.9];
  for (const f of corner) {
    const [s0, s1] = f === khC ? [f.w - 3.2, f.w] : f === bdC ? [0, 3.0] : [0, f.w];
    for (let k = 1; k < NF; k++) win(f, s0, s1, ...RB(k), { dep: 0.15, sill: null, pane: 0.9 });
  }
  arc.forEach((f, i) => win(f, 0, f.w, yF, LOB, { dep: 1.6, glass: '#3d474c', lit: true, frame: '#e9e9e5', rev: '#ecebe6', pane: 1.2, sill: null, door: i === 1 || i === 2 }));

  // ---- the wings
  const winY = (k) => (k ? [fl(k) + 0.9, fl(k) + 2.75] : [yF + 1.0, fl(1) - 0.8]);
  const khStair = [khW.w - 2.9, khW.w - 0.4];
  for (const c of bays(0.4, khStair[0] - 0.5, 3.2)) for (let k = 0; k < NF; k++) win(khW, c - 0.85, c + 0.85, ...winY(k));
  for (const c of bays(0.3, bdW.w - 0.3, 3.0)) for (let k = 0; k < NF; k++) win(bdW, c - 0.95, c + 0.95, ...winY(k));
  const blank = new Set(rest.filter(party));
  for (const f of rest) {
    if (blank.has(f) || f.w < 2.5) continue;
    for (const c of bays(0.6, f.w - 0.6, 3.2)) for (let k = 0; k < NF; k++) if (k || r() < 0.85) win(f, c - 0.75, c + 0.75, ...winY(k));
  }

  // ---- finishes, band by band
  const plinth = [gBase, yF + 0.3, PLINTH];
  for (const f of corner) {
    const L = [plinth, [yF + 0.3, LOB, WHITE], [LOB, fl(1) + 0.9, BEIGE]];
    for (let k = 1; k < NF; k++) L.push([...RB(k), WHITE], [RB(k)[1], k < NF - 1 ? RB(k + 1)[0] : yRoof + 0.6, BEIGE]);
    L.push([yRoof + 0.6, yTopC, WHITE]);
    bands(f, L);
  }
  const W = [plinth];
  for (let k = 0; k < NF; k++) { const [a, c] = winY(k), prev = W.at(-1)[1]; W.push([prev, a, BEIGE], [a, c, MAROON]); }
  W.push([W.at(-1)[1], W.at(-1)[1] + 0.25, BEIGE], [W.at(-1)[1] + 0.25, yTopW, BROWN]);
  bands(bdW, W);
  bands(khW, [plinth, [yF + 0.3, yTopW, '#ffffff', B.brick, [2.0, 1.8]]]);
  for (const f of rest) bands(f, [plinth, [yF + 0.3, yTopW, BEIGE]]);
  B.det.setColor(LEDGE);
  for (let k = 1; k <= NF; k++) fbox(B.det, khW, 0, khStair[0] - 0.3, fl(k) - 0.1, fl(k) + 0.15, 0, 0.07, 1 | 16 | 32); // floor ledges on the brick
  for (const f of [khW, bdW, ...corner, ...rest]) for (const q of f.open) fillOpening(B, f, q);

  // ---- the lobby: columns under the overhang, the letters over it, a low step in front
  const arcLen = arc.reduce((a, f) => a + f.w, 0);
  let run = 0;
  for (const f of arc) {
    const [x, , z] = at(f, f.w / 2, 0, -0.42), g = heightAt(x, z);
    B.det.setColor('#f6f6f3'); B.det.cyl(x, g - 0.3, z, 0.3, 0.3, LOB - g + 0.3, 14, false);
    S.cyl(x, z, g - 0.3, LOB, 0.32);
    const u0 = run / arcLen, u1 = (run + f.w) / arcLen, y0 = fl(1) - 0.62, y1 = fl(1) + 0.18;
    quad(B.gold, at(f, 0, y0, 0.08), at(f, f.w, y0, 0.08), at(f, f.w, y1, 0.08), at(f, 0, y1, 0.08), f.N, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    run += f.w;
    B.det.setColor('#b3aea5'); fbox(B.det, f, 0, f.w, gBase, yF - 0.02, 0, 1.4, 1);
  }
  // the step's top as one piece round the arc, so the joints leave no wedges
  const step = [...arc.flatMap((f) => [at(f, 0, 0), at(f, f.w, 0)]), ...arc.toReversed().flatMap((f) => [at(f, f.w, 0, 1.4), at(f, 0, 0, 1.4)])]
    .map(([x, , z]) => [x, z]).filter((p, i, A) => !i || Math.hypot(p[0] - A[i - 1][0], p[1] - A[i - 1][1]) > 1e-3);
  B.det.fill(step, [], yF - 0.02, true);

  // ---- the stair strip on Khreshchatyk: glazing standing out between white fins, up to the corner's parapet
  {
    const f = khW, [s0, s1] = khStair, o1 = 0.6, gy = yTopC - 0.5;
    B.det.setColor('#f4f3ef');
    for (const [a, c] of [[s0 - 0.3, s0], [s1, s1 + 0.3]]) fbox(B.det, f, a, c, gBase, yTopC, -0.3, o1, 1 | 4 | 8 | 16);
    fbox(B.det, f, s0, s1, yTopC - 0.5, yTopC, 0, o1, 1 | 16 | 32);
    fbox(B.det, f, s0 - 0.3, s1 + 0.3, yTopW, yTopC, -2.5, -0.3, 2 | 4 | 8 | 16); // the stair head over the wing roof
    B.glass.setColor('#8d9aa1'); quad(B.glass, at(f, s0, yF, o1 - 0.1), at(f, s1, yF, o1 - 0.1), at(f, s1, gy, o1 - 0.1), at(f, s0, gy, o1 - 0.1), f.N);
    B.det.setColor('#f4f3ef');
    fbox(B.det, f, (s0 + s1) / 2 - 0.04, (s0 + s1) / 2 + 0.04, yF, gy, o1 - 0.1, o1 - 0.02, 1 | 4 | 8);
    for (let y = yF + 1.5; y < gy; y += 1.75) fbox(B.det, f, s0, s1, y - 0.05, y + 0.05, o1 - 0.1, o1 - 0.02, 1 | 16 | 32);
    fsolid(S, f, s0 - 0.3, s1 + 0.3, -0.05, o1, gBase, yTopC, 'wall');
  }

  // ---- parapets, copings, roof edges; the tall corner parapet closed at both ends
  for (const f of [khW, bdW, ...corner, ...rest]) {
    const yT = corner.includes(f) ? yTopC : yTopW;
    B.det.setColor('#d8d4ca'); skin(B.det, { ...f, N: [-f.nx, 0, -f.nz] }, 0, f.w, yRoof, yT, -0.3);
    B.det.setColor('#8f9190'); fbox(B.det, f, -0.03, f.w + 0.03, yT, yT + 0.05, -0.32, 0.05, 1 | 16);
    const a = at(f, 0, 0, -0.1), c = at(f, f.w, 0, -0.1);
    Z.edge(a[0], a[2], c[0], c[2], yT, f.nx, f.nz);
  }
  B.det.setColor(WHITE);
  fbox(B.det, khC, 0, 0.02, yTopW, yTopC, -0.3, 0, 4);
  fbox(B.det, bdC, bdC.w - 0.02, bdC.w, yTopW, yTopC, -0.3, 0, 8);
  B.det.setColor('#8b8a84'); B.det.fill(ring, [], yRoof + 0.02, true);
  B.det.setColor('#a2a09a');
  for (let i = 0; i < 4; i++) { const [x, , z] = at(bdW, bdW.w * (0.2 + 0.2 * i), 0, -5 - r() * 7); B.det.box(x - 0.6, yRoof, z - 0.6, x + 0.6, yRoof + 0.9, z + 0.6, 55); }
  S.prism(ring.flat(), gBase, yTopC, 0, 0, 'wall');

  // ---- meshes
  const gold = lettersTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: stoneTex(r, [247, 246, 242], { cols: 1, rows: 1, joint: 0, grain: 0.05 }), vertexColors: true, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, { base: [184, 118, 82], mortar: [206, 190, 168] }), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffe4b8, emissiveIntensity: 0 }),
    gold: new THREE.MeshStandardMaterial({ map: gold, alphaTest: 0.5, metalness: 0.75, roughness: 0.35, emissive: 0xffd08a, emissiveMap: gold, emissiveIntensity: 0 }),
  };
  const st = pack(root, 'medakademia', B, M, ['glass', 'lit', 'gold']);
  console.log(`[cherkasy] Medakademia: ${nWin} windows, ${arc.length} arc faces, ${blank.size} party walls, ${(st.verts / 1000).toFixed(1)}k verts, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(S.count ?? 0) - n0} solids, floor ${yF.toFixed(1)} m, in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: yTopC - yF, kind: b.k, name: 'Медична академія' }],
    // trees keep off the walls, the stair strip and the forecourt round the corner
    clear: (x, z) => inPoly(ring, x, z) || faces.some((f) => {
      const dx = x - f.ax, dz = z - f.az, s = dx * f.rx + dz * f.rz, o = dx * f.nx + dz * f.nz;
      return s > -2 && s < f.w + 2 && o > -0.5 && o < (arc.includes(f) ? 8 : 2.5);
    }),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.2 * k; M.gold.emissiveIntensity = 0.45 * k; },
  };
}
