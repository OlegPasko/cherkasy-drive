// OWNER: cherkasy. Вулиця Байди Вишневецького, 8: the regional universal research library named after Taras Shevchenko,
// rebuilt after the Wikimedia Commons photo (Обласна бібліотека (Черкаси).jpg, 2010), the cherkasy.city photo of the
// entrance and the Esri satellite view. OSM tags it two storeys; the photos show three over a tall semi-basement.
// A long white block on the slope above the street: the south front in bays of wide windows split by grey fluted
// pilasters, white spandrel bands, a high blank parapet band, a brown granite plinth with small square basement windows
// in stone frames, which grows toward the west as the ground falls away. Near the east end the entrance: a flight of
// steps with side walls up to a landing under a deep flat canopy on two round columns, its fascia lettered «ОБЛАСНА
// УНІВЕРСАЛЬНА НАУКОВА БІБЛІОТЕКА ІМЕНІ ТАРАСА ШЕВЧЕНКА» in blue, the glazed doors behind, the flag on the roof over it.
// Plain window rows on the other sides, lit windows and lettering at night.
//   OBLBIB_SKIP: the OSM ids replaced here, the block and its entrance porch (buildings.js skips them)
//   buildOblBiblioteka({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per face of the OSM ring (civic.js). The block stands at an angle to the map frame, so the front is
// found as the long wall facing the porch footprint, and the porch is built in that wall's frame.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, centroid } from './geo.js';
import { canvasTex } from './sculpt.js';
import { wallFaces, at, quad, skin, plate, fbox, fsolid, wallAround, fillOpening, rampSolid, stoneTex, pack } from './civic.js';

const MAIN = 155354151, PORCH = 1076511725;
export const OBLBIB_SKIP = new Set([MAIN, PORCH]);

const FLOORS = [4.2, 3.9, 3.9], PARA = 1.5, BAY = 4.1, PIL = 0.7;   // storey heights, blank band over the top storey
const WHITE = '#efeee9', PILC = '#c4c8cb', GRANITE = '#8a6c62', GLASS = ['#5c6970', '#66727a', '#4f5b62'], BLINDS = ['#dcdcd4', '#e6e4dc', '#cfd3d6'];

// the fascia: two lines of dark blue capitals on a white ribbed panel
const fasciaTex = () => canvasTex(2048, 256, (g, w, h) => {
  g.fillStyle = '#f1f1ee'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,125,130,0.18)'; for (let x = 0; x < w; x += 14) g.fillRect(x, 0, 3, h);
  g.fillStyle = '#23408e'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const line = (t, y, px, fit) => { g.font = `bold ${px}px Arial, Helvetica, sans-serif`; g.save(); g.translate(w / 2, y); g.scale(Math.min(1, fit / g.measureText(t).width), 1); g.fillText(t, 0, 0); g.restore(); };
  line('ОБЛАСНА  УНІВЕРСАЛЬНА  НАУКОВА', 78, 82, 1500);
  line('БІБЛІОТЕКА  ІМЕНІ  ТАРАСА  ШЕВЧЕНКА', 182, 96, 1900);
}, { repeat: false });

export function buildOblBiblioteka({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === MAIN);
  if (!b) return null;
  const t0 = performance.now(), r = rng(MAIN % 99991), n0 = S.count ?? 0;
  const ring = ringPts(b.p), faces = wallFaces(ring), porchB = map.buildings.find((q) => q.id === PORCH);
  const [cx, cz] = centroid(ring);
  // the front: the long wall whose outward normal points at the porch (or, without it, the one on the lower z side)
  const [px, pz] = porchB ? centroid(ringPts(porchB.p)) : [cx, cz + 10];
  const longs = faces.filter((f) => f.w > 30);
  const front = longs.reduce((m, f) => ((px - cx) * f.nx + (pz - cz) * f.nz > (px - cx) * m.nx + (pz - cz) * m.nz ? f : m));
  const f = front, sOf = (x, z) => (x - f.ax) * f.rx + (z - f.az) * f.rz;
  // the porch in the front's frame: its span along the wall and how far it stands out
  let e0 = f.w * 0.64, e1 = f.w * 0.86, eo = 6.5;
  if (porchB) {
    const P = ringPts(porchB.p), ss = P.map(([x, z]) => sOf(x, z)), oo = P.map(([x, z]) => (x - f.ax) * f.nx + (z - f.az) * f.nz);
    e0 = Math.max(0.5, Math.min(...ss)); e1 = Math.min(f.w - 0.5, Math.max(...ss)); eo = Math.max(3, Math.max(...oo));
  }
  const ec = (e0 + e1) / 2;
  const [gx, , gz] = at(f, ec, 0, Math.min(eo, 6.5)), gE = heightAt(gx, gz); // the ground at the foot of the steps
  const hs = ring.map(([x, z]) => heightAt(x, z));
  const yF = gE + 1.4, gBase = Math.min(...hs) - 0.6;
  const fl = (k) => yF + FLOORS.slice(0, k).reduce((a, v) => a + v, 0);
  const yRoof = fl(3), yTop = yRoof + PARA;

  const B = { wall: new MB(), granite: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  let nWin = 0;
  const glazing = (litP = 0.35) => ({ glass: r() < 0.45 ? BLINDS[Math.floor(r() * 3)] : GLASS[Math.floor(r() * 3)], lit: r() < litP });
  const win = (w, s0, s1, y0, y1, extra = {}) => { w.open.push({ s0, s1, y0, y1, dep: 0.22, frame: '#f6f6f3', rev: '#dddcd6', pane: 0.9, ...glazing(), ...extra }); nWin++; };
  const bays = (w) => { const n = Math.max(1, Math.round(w / BAY)), step = w / n; return Array.from({ length: n }, (_, i) => [(i + 0.5) * step, step]); };

  for (const w of faces) {
    const isFront = w === f, isLong = w.w > 30;
    for (const [c, step] of bays(w.w)) {
      const under = isFront && c > e0 - 0.5 && c < e1 + 0.5;
      const hw = isLong ? (step - PIL) / 2 - 0.3 : 0.9;
      if (!isLong && Math.abs(c - w.w / 2) > w.w * 0.3) continue; // the ends: a column of windows in the middle
      for (let k = 0; k < 3; k++) {
        if (under && k === 0) continue;
        const y0 = fl(k) + (k ? 0.85 : 0.75), y1 = fl(k + 1) - (k ? 0.75 : 0.8);
        win(w, c - hw, c + hw, y0, y1, { pane: 1.0 });
      }
      // basement windows: small squares in stone frames, where the plinth is tall enough for them
      const [bx, , bz] = at(w, c, 0, 0.5), g = heightAt(bx, bz);
      if (!under && yF - g > 0.9) { const y1 = yF - 0.2, y0 = Math.max(g + 0.15, y1 - 0.75); if (y1 - y0 > 0.4) win(w, c - 0.4, c + 0.4, y0, y1, { glass: '#2e3336', lit: false, frame: '#3a3d3f', pane: 0.12, rev: '#c9c3b8', dep: 0.12 }); }
    }
  }
  // the doors behind the porch, a dark glazed vestibule wall
  win(f, e0 + 1.0, e1 - 1.0, yF, yF + 3.2, { glass: '#343d43', lit: true, frame: '#8d9294', pane: 1.4, door: true, dep: 0.4 });

  // ---- walls: granite plinth, white render; pilasters and stone frames on the long walls
  for (const w of faces) {
    wallAround(B.granite, w, gBase, yF, [1.5, 0.75], GRANITE);
    wallAround(B.wall, w, yF, yTop, [3, 3], WHITE);
    for (const q of w.open) {
      fillOpening(B, w, q);
      if (q.y1 <= yF + 0.01) { // a stone frame round a basement window
        const m = 0.14, D = B.det.setColor('#d4cfc5');
        fbox(D, w, q.s0 - m, q.s1 + m, q.y1, q.y1 + m, 0, 0.06, 1 | 4 | 8 | 16 | 32); fbox(D, w, q.s0 - m, q.s1 + m, q.y0 - m, q.y0, 0, 0.06, 1 | 4 | 8 | 16 | 32);
        fbox(D, w, q.s0 - m, q.s0, q.y0, q.y1, 0, 0.06, 1 | 4 | 8); fbox(D, w, q.s1, q.s1 + m, q.y0, q.y1, 0, 0.06, 1 | 4 | 8);
      }
    }
    B.det.setColor('#b7b2a6'); fbox(B.det, w, -0.02, w.w + 0.02, yF - 0.08, yF + 0.04, 0, 0.1, 1 | 16 | 32); // plinth ledge
    if (w.w > 30) {
      for (const [c, step] of bays(w.w)) for (const s of [c - step / 2, c + step / 2]) {
        if (s < 0.2 || s > w.w - 0.2 || (w === f && s > e0 - 0.5 && s < e1 + 0.5)) continue;
        B.det.setColor(PILC); fbox(B.det, w, s - PIL / 2, s + PIL / 2, yF + 0.1, yRoof + 0.3, 0, 0.22, 1 | 4 | 8 | 16);
        B.det.setColor('#a7abae'); for (const d of [-0.2, 0, 0.2]) fbox(B.det, w, s + d - 0.04, s + d + 0.04, yF + 0.1, yRoof + 0.3, 0.22, 0.24, 1 | 4 | 8);
      }
    }
    // parapet: inner face, coping, roof edge
    B.det.setColor('#d5d4cf'); skin(B.det, { ...w, N: [-w.nx, 0, -w.nz] }, 0, w.w, yRoof, yTop, -0.3);
    B.det.setColor('#9b9e9f'); fbox(B.det, w, -0.04, w.w + 0.04, yTop, yTop + 0.06, -0.32, 0.08, 1 | 16 | 32);
    const a = at(w, 0, 0, -0.1), c = at(w, w.w, 0, -0.1);
    Z.edge(a[0], a[2], c[0], c[2], yTop, w.nx, w.nz);
  }
  B.det.setColor('#8c8c86'); B.det.fill(ring, [], yRoof + 0.02, true);
  B.det.setColor('#9d9b95');
  for (let i = 0; i < 4; i++) { const [x, , z] = at(f, f.w * (0.15 + 0.2 * i), 0, -4 - r() * 8); B.det.box(x - 0.6, yRoof, z - 0.6, x + 0.6, yRoof + 1.0, z + 0.6, 55); }
  S.prism(ring.flat(), gBase, yTop, 0, 0, 'wall');

  // ---- the porch: landing, steps with side walls, the canopy on two columns, the lettered fascia
  {
    const yc = yF + 3.9, cd = eo, land = Math.min(3.2, cd - 1.5), nS = Math.max(3, Math.round((yF - gE) / 0.15)), run = 0.36;
    B.det.setColor('#b9b6ae'); fbox(B.det, f, e0, e1, gBase, yF, 0, land, 1 | 4 | 8 | 16);
    fsolid(S, f, e0, e1, 0, land, gBase, yF, 'steps');
    B.det.setColor('#c3c0b8');
    for (let i = 1; i < nS; i++) fbox(B.det, f, e0 + 0.35, e1 - 0.35, gBase, yF - i * (yF - gE) / nS, land + (i - 1) * run, land + i * run, 1 | 4 | 8 | 16);
    rampSolid(S, f, e0 + 0.35, e1 - 0.35, land, land + nS * run, yF, gE, gBase); // one ramp over the steps for the car
    // the side walls of the flight, sloping with it
    B.det.setColor('#dedcd6');
    for (const [a, c] of [[e0, e0 + 0.35], [e1 - 0.35, e1]]) {
      fbox(B.det, f, a, c, gBase, yF + 0.9, 0, land, 1 | 4 | 8 | 16);
      const o1 = land + nS * run, P = (s, y, o) => at(f, s, y, o);
      quad(B.det, P(a, yF + 0.9, land), P(a, gE + 0.6, o1), P(a, gBase, o1), P(a, gBase, land), f.L);
      quad(B.det, P(c, yF + 0.9, land), P(c, gE + 0.6, o1), P(c, gBase, o1), P(c, gBase, land), f.R);
      const L = Math.hypot(nS * run, yF + 0.3 - gE);
      quad(B.det, P(a, yF + 0.9, land), P(c, yF + 0.9, land), P(c, gE + 0.6, o1), P(a, gE + 0.6, o1), [f.nx * (yF + 0.3 - gE) / L, nS * run / L, f.nz * (yF + 0.3 - gE) / L]);
      fsolid(S, f, a, c, 0, o1, gBase, yF + 0.9, 'wall');
    }
    // the canopy: slab, soffit, fascia with the lettering on the front and plain ends
    const fh = 1.25;
    B.det.setColor('#e9e9e5'); fbox(B.det, f, e0 - 0.3, e1 + 0.3, yc, yc + fh, 0, cd, 4 | 8 | 16 | 32);
    plate(B.sign, f, e0 - 0.3, e1 + 0.3, yc, yc + fh, cd);
    fsolid(S, f, e0 - 0.3, e1 + 0.3, -0.05, cd, yc, yc + fh, 'awning', 1);
    B.lit.setColor('#fff3da');
    for (let s = e0 + 1.5; s < e1 - 1; s += 2.5) for (const o of [1.5, cd - 1.5]) fbox(B.lit, f, s - 0.15, s + 0.15, yc - 0.02, yc, o - 0.15, o + 0.15, 32);
    B.det.setColor('#f3f3f0');
    for (const s of [e0 + 0.9, e1 - 0.9]) {
      const [x, , z] = at(f, s, 0, cd - 1.0), g = heightAt(x, z);
      const y0 = Math.min(g, yF) - 0.2;
      B.det.cyl(x, y0, z, 0.3, 0.3, yc - y0, 12, false);
      S.cyl(x, z, y0, yc, 0.32);
    }
    // the flag on the roof over the porch
    const [fx, , fz] = at(f, ec + 2, 0, -1.2), top = yTop + 6;
    B.det.setColor('#c8cacc'); B.det.cyl(fx, yRoof, fz, 0.05, 0.04, top - yRoof, 6);
    const cloth = (y0, y1, col) => { B.det.setColor(col); quad(B.det, [fx, y0, fz], [fx + f.rx * 1.8, y0, fz + f.rz * 1.8], [fx + f.rx * 1.8, y1, fz + f.rz * 1.8], [fx, y1, fz], f.N); quad(B.det, [fx, y0, fz], [fx + f.rx * 1.8, y0, fz + f.rz * 1.8], [fx + f.rx * 1.8, y1, fz + f.rz * 1.8], [fx, y1, fz], [-f.nx, 0, -f.nz]); };
    cloth(top - 0.6, top, '#1f5bb8'); cloth(top - 1.2, top - 0.6, '#f3c623');
  }

  // ---- meshes
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: stoneTex(r, [246, 246, 243], { cols: 1, rows: 1, joint: 0, grain: 0.05 }), vertexColors: true, roughness: 0.9 }),
    granite: new THREE.MeshStandardMaterial({ map: stoneTex(r, [228, 214, 208], { cols: 2, rows: 1, joint: 0.3, grain: 0.14 }), vertexColors: true, roughness: 0.5 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffeccc, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: fasciaTex(), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }),
  };
  M.sign.emissiveMap = M.sign.map;
  const st = pack(root, 'oblbiblioteka', B, M, ['glass', 'lit', 'sign']);
  console.log(`[cherkasy] Library: ${nWin} windows, ${(st.verts / 1000).toFixed(1)}k verts, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(S.count ?? 0) - n0} solids, floor ${yF.toFixed(1)} m (ground ${gE.toFixed(1)}..${Math.min(...hs).toFixed(1)}), in ${(performance.now() - t0).toFixed(0)} ms`);

  const foot = [{ poly: ring, h: yTop - gE, kind: b.k, name: 'Обласна бібліотека' }];
  if (porchB) foot.push({ poly: ringPts(porchB.p), h: yF + 5.2 - gE, kind: porchB.k });
  return {
    footprints: foot,
    // trees keep off the walls and the porch with its steps
    clear: (x, z) => {
      const dx = x - f.ax, dz = z - f.az, s = dx * f.rx + dz * f.rz, o = dx * f.nx + dz * f.nz;
      const depth = Math.max(...faces.map((w) => w.w).filter((v) => v < 30), 0) + 3;
      return s > -3 && s < f.w + 3 && o > -depth && o < (s > e0 - 2 && s < e1 + 2 ? eo + 6 : 3);
    },
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.2 * k; M.sign.emissiveIntensity = 0.7 * k; },
  };
}
