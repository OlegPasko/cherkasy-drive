// OWNER: cherkasy. Cinema «Україна», вулиця Смілянська, 21 – rebuilt after the Wikimedia Commons photos («Черкаси,
// кінотеатр «Україна»», «Кінотеатр Україна в Черкасах»), the in.ck.ua photo and the satellite view. OSM splits the
// building: way 405324710 (tagged as the «Європейський» mall, which is only a tenant inside, same address) is the
// auditorium box, way 104299465 (tagged as the cinema) the two-storey foyer wing on its south-west side. The box is
// clad in narrow cream travertine strips with a notched frieze under a roof that falls from the Smilianska end
// (~18 m) to the far end (~12 m); tall fins step down the Smilianska front; blue 3D letters «кіно УКРАЇНА» over the
// forecourt side and gold vertical «КІНОТЕАТР» on the corner piers; a single-storey glazed shopfront with the blue
// fascia of the mall and a red-fascia pavilion at the base. The foyer wing is cream render between square pilasters.
//   KINO_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildKinoUkraina({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Both ways are square to the map axes; the hall's long axis runs south-east (+z), the Smilianska end is at -z.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, bboxOf, inPoly } from './geo.js';
import { edgeFace, at, quad, rect, fbox, wall, win, fsolid, ringFaces, openSpans, finish, UP } from './blockkit.js';

const HALL_ID = 405324710, FOYER_ID = 104299465;
export const KINO_SKIP = new Set([HALL_ID, FOYER_ID]);

const HN = 18, HS = 12, FOY = 8.6;          // hall wall top at the Smilianska end / far end, foyer wing height
const PLINTH = '#6f6c68', CREAM = '#ffffff', RENDER = '#e8e2d4', PIL = '#f1ece2', BLUE = '#1d3f8f', RED = '#b3272d';
const GLASS = ['#56646e', '#4f5c66', '#607079'];

// ------------------------------------------------------------------------------------------------ textures
// narrow travertine strips (1 m per repeat across, 4 m up): a joint each side, pitting and rain streaks
const panelTex = (r) => canvasTex(128, 512, (g, w, h) => {
  g.fillStyle = '#ddd5c2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#eee8da'; g.fillRect(4, 0, w - 8, h);
  for (let q = 0; q < 900; q++) { g.fillStyle = r() < 0.6 ? 'rgba(150,135,110,0.18)' : 'rgba(255,255,255,0.25)'; g.fillRect(4 + r() * (w - 8), r() * h, 1 + r() * 3, 1 + r() * 2); }
  for (let q = 0; q < 6; q++) { g.fillStyle = 'rgba(120,110,95,0.07)'; g.fillRect(6 + r() * (w - 20), 0, 4 + r() * 8, h); }
  g.fillStyle = 'rgba(120,108,90,0.2)'; g.fillRect(0, 0, w, 2); // one bed joint per 4 m
});
// the frieze strip under the roof line: each 1 m strip ends in a notch, the joints run on
const friezeTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#ece6d8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d8d0bd'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(100,90,72,0)'); gr.addColorStop(1, 'rgba(100,90,72,0.28)');
  g.fillStyle = gr; // a shallow V cut into the head of each strip, shaded from below
  g.beginPath(); g.moveTo(w * 0.12, h); g.lineTo(w * 0.5, h * 0.62); g.lineTo(w * 0.88, h); g.fill();
});
// sign atlas: «кіно УКРАЇНА» (blue, lit edge), vertical gold «КІНОТЕАТР», the mall's blue fascia
const CELL = { ukr: [0, 0, 0.78, 0.34], kin: [0.82, 0, 1, 1], euro: [0, 0.4, 0.78, 0.5] };
const signTex = () => canvasTex(1024, 1024, (g) => {
  g.clearRect(0, 0, 1024, 1024);
  Object.assign(g, { textAlign: 'center', textBaseline: 'alphabetic' });
  g.font = 'bold 200px Arial, Helvetica, sans-serif';
  const fit = (t, x, y, max, fill, edge) => { g.save(); g.translate(x, y); g.scale(Math.min(1, max / g.measureText(t).width), 1); if (edge) { g.fillStyle = edge; g.fillText(t, 6, 6); } g.fillStyle = fill; g.fillText(t, 0, 0); g.restore(); };
  fit('УКРАЇНА', 400, 330, 770, '#2f63c4', '#15306e');
  g.font = 'bold 90px Arial, Helvetica, sans-serif'; fit('кіно', 640, 110, 260, '#2f63c4', '#15306e');
  g.font = 'bold 100px Arial, Helvetica, sans-serif';
  [...'КІНОТЕАТР'].forEach((c, i) => fit(c, 922, 105 + i * 112, 170, '#d7ae4c', '#6e531c'));
  g.fillStyle = '#1f3f93'; g.fillRect(0, 410, 800, 100);
  g.font = 'bold 60px Arial, Helvetica, sans-serif'; fit('ЄВРОПЕЙСЬКИЙ', 280, 482, 420, '#ffffff');
  g.font = '40px Arial, Helvetica, sans-serif'; fit('торговельний центр', 640, 478, 260, '#ffffff');
}, { repeat: false });
// a cell of the atlas on a face at offset o, reading left to right from outside (s may run to the viewer's left)
function sign(D, f, s0, s1, y0, y1, o, cell) {
  const [u0, v0, u1, v1] = CELL[cell], [ua, ub] = f.ux * f.nz - f.uz * f.nx < 0 ? [u1, u0] : [u0, u1];
  quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[ua, 1 - v1], [ub, 1 - v1], [ub, 1 - v0], [ua, 1 - v0]]);
}

// ------------------------------------------------------------------------------------------------ build
export function buildKinoUkraina({ root, map, solids: S, zips: Z, heightAt }) {
  const hb = map.buildings.find((q) => q.id === HALL_ID), fb = map.buildings.find((q) => q.id === FOYER_ID);
  if (!hb || !fb) return null;
  const t0 = performance.now(), r = rng(HALL_ID % 99991), n0 = S.count ?? 0;
  const bh = bboxOf(ringPts(hb.p));
  const X0 = bh.x0, X1 = bh.x1, Z0 = bh.z0, Z1 = 536.2 > bh.z0 && 536.2 < bh.z1 ? 536.2 : bh.z1; // the far end's small steps left out
  const foyer = ringPts(fb.p);
  const hs = [];
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) hs.push(heightAt(X0 + (X1 - X0) * i / 3, Z0 + (Z1 - Z0) * j / 3));
  const gLo = Math.min(...hs, ...foyer.map(([x, z]) => heightAt(x, z))) - 0.5, yF = Math.max(...hs) + 0.15;
  const yTop = (z) => yF + HN + (HS - HN) * (z - Z0) / (Z1 - Z0);
  const inHall = (x, z) => x > X0 && x < X1 && z > Z0 && z < Z1, inFoyer = (x, z) => inPoly(foyer, x, z);

  const B = { panel: new MB(), frieze: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const D = B.det, PM = [1, 4];
  B.panel.setColor(CREAM); B.frieze.setColor(CREAM); B.sign.setColor('#ffffff');
  let nOpen = 0;

  // ---- the hall: four walls, the long ones with the sloping top
  const cs = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
  const hallF = cs.map((a, i) => edgeFace(a, cs[(i + 1) % 4], inHall));
  const [fNW, fNE, fSE, fSW] = hallF; // -z (Smilianska end), +x, +z, -x (forecourt side)
  const topAt = (f, s) => yTop(at(f, s, 0)[2]);
  for (const f of hallF) {
    const L = f.L, base = yF + 4.6;
    // the base band: plinth, shopfronts and doors are cut out below `base`
    if (f === fSW) { // the mall's glazed front on the forecourt, to where the foyer wing starts
      const sA = Math.abs(at(f, 0, 0)[2] - Z0) < 1 ? 0.8 : L - 20.4, sB = sA + 19.6;
      f.holes.push({ s0: sA, s1: sB, y0: yF, y1: yF + 3.9, shop: true });
    }
    if (f === fNE) for (const [a, w] of [[4, 6], [14, 3.2], [22, 7]]) {
      const s = Math.abs(at(f, 0, 0)[2] - Z0) < 1 ? a : L - a - w;
      f.holes.push({ s0: s, s1: s + w, y0: yF, y1: yF + 3.4, shop: true });
    }
    if (f === fNW) f.holes.push({ s0: L / 2 - 3.2, s1: L / 2 + 3.2, y0: yF, y1: yF + 3.6, shop: true });
    wall(B.panel, f, yF, base, PM); // (the stretch behind the foyer wing stays hidden in it)
    D.setColor(PLINTH); fbox(D, f, 0, L, gLo, yF + 0.35, 0, 0.05, 1 | 16);
    // above the band: vertical strips up to the roof line (the long sides slope), the notched frieze under it
    const n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i < n; i++) {
      const s0 = L * i / n, s1 = L * (i + 1) / n, t0 = topAt(f, s0), t1 = topAt(f, s1);
      quad(B.panel, at(f, s0, base), at(f, s1, base), at(f, s1, t1 - 1.6), at(f, s0, t0 - 1.6), f.N, [[s0, base / 4], [s1, base / 4], [s1, (t1 - 1.6) / 4], [s0, (t0 - 1.6) / 4]]);
      quad(B.frieze, at(f, s0, t0 - 1.6), at(f, s1, t1 - 1.6), at(f, s1, t1), at(f, s0, t0), f.N, [[s0, 0], [s1, 0], [s1, 1], [s0, 1]]);
      D.setColor('#bdb5a4'); quad(D, at(f, s0, t0), at(f, s1, t1), at(f, s1, t1, -0.35), at(f, s0, t0, -0.35), UP); // coping
      quad(D, at(f, s0, t0 - 0.4, -0.35), at(f, s1, t1 - 0.4, -0.35), at(f, s1, t1, -0.35), at(f, s0, t0, -0.35), [-f.nx, 0, -f.nz]);
    }
    // shopfronts and doors in the base band
    for (const q of f.holes) {
      if (!q.shop) continue;
      nOpen++;
      win(B, f, { ...q, dep: 0.25, frame: '#3b3f44', rev: '#8e8a82', glass: '#3f4b52', lit: true, cols: Math.max(2, Math.round((q.s1 - q.s0) / 1.6)), rows: 2, rowAt: [0.78] });
    }
  }
  // the mall's fascia and canopy over the forecourt shopfront, the red pavilion at the north corner
  {
    const q = fSW.holes.find((h) => h.shop);
    D.setColor(BLUE); fbox(D, fSW, q.s0 - 0.3, q.s1 + 0.3, yF + 3.9, yF + 4.6, 0, 1.3, 1 | 4 | 8 | 16 | 32);
    sign(B.sign, fSW, q.s0 + 0.5, q.s1 - 3, yF + 3.95, yF + 4.55, 1.32, 'euro');
    fsolid(S, fSW, q.s0 - 0.3, q.s1 + 0.3, 0, 1.3, yF + 3.9, yF + 4.6, 'awning', 1);
    const sN = Math.abs(at(fNE, 0, 0)[2] - Z0) < 1 ? 0.3 : fNE.L - 3.8;
    D.setColor('#e9e6df'); fbox(D, fNE, sN, sN + 3.5, yF, yF + 3.0, 0, 3.2, 1 | 4 | 8 | 16);
    D.setColor(RED); fbox(D, fNE, sN - 0.1, sN + 3.6, yF + 3.0, yF + 3.8, 0, 3.3, 1 | 4 | 8 | 16 | 32);
    B.lit.setColor('#9fb2b8'); rect(B.lit, fNE, sN + 0.2, sN + 3.3, yF + 0.3, yF + 2.8, 3.21);
    fsolid(S, fNE, sN, sN + 3.5, 0, 3.2, gLo, yF + 3.8, 'kiosk');
  }
  // the roof: one plane falling to the far end, dark membrane
  D.setColor('#4a4a4c');
  quad(D, [X0 + 0.35, yTop(Z0 + 0.35) - 0.4, Z0 + 0.35], [X1 - 0.35, yTop(Z0 + 0.35) - 0.4, Z0 + 0.35], [X1 - 0.35, yTop(Z1 - 0.35) - 0.4, Z1 - 0.35], [X0 + 0.35, yTop(Z1 - 0.35) - 0.4, Z1 - 0.35], UP);
  // tall fins stepping down the Smilianska front, the letters
  const fl = fNW.L;
  for (const [k, s] of [[0, 3.2], [1, 7.4], [2, fl - 7.4], [3, fl - 3.2]]) {
    const h = yF + HN - (k === 0 || k === 3 ? 0 : 1.2);
    B.panel.setColor(CREAM); fbox(B.panel, fNW, s - 0.35, s + 0.35, yF + 3.8, h, 0, 1.1, 1 | 4 | 8 | 16, PM);
  }
  // «кіно УКРАЇНА» over the forecourt near the Smilianska end, «КІНОТЕАТР» down the corner piers
  const sSW = Math.abs(at(fSW, 0, 0)[2] - Z0) < 1 ? 1.5 : fSW.L - 16.5;
  sign(B.sign, fSW, sSW, sSW + 15, yF + HN - 4.9, yF + HN - 2.1, 0.12, 'ukr');
  const kinS = (f) => (Math.abs(at(f, 0, 0)[2] - Z0) < 1 ? 0.25 : f.L - 1.35);
  for (const f of [fSW, fNE]) { const s = kinS(f); sign(B.sign, f, s, s + 1.1, yF + 5.5, yF + 14.5, 0.1, 'kin'); }
  S.prism([X0, Z0, X1, Z0, X1, Z1, X0, Z1], gLo, yF + HN, 0, 0, 'wall');
  for (const f of [fNW, fSE]) { const e0 = at(f, 0, 0), e1 = at(f, f.L, 0); Z.edge(e0[0], e0[2], e1[0], e1[2], topAt(f, 0), f.nx, f.nz); }

  // ---- the foyer wing: cream render between square pilasters, two storeys of windows, flat roof
  const yFo = yF, yFT = yFo + FOY;
  for (const f of ringFaces(foyer, inFoyer)) {
    for (const [a, c] of openSpans(f, [inHall])) {
      const span = { ...f, holes: [{ s0: -1, s1: a, y0: -1e3, y1: 1e3 }] }, w = c - a;
      const n = Math.max(1, Math.round(w / 3.6)), sp = w / n;
      if (w > 2.2) for (let i = 0; i < n; i++) {
        const sc = a + sp * (i + 0.5), hw = Math.min(0.95, sp / 2 - 0.55);
        if (hw < 0.4) continue;
        for (const [y0, y1] of [[1.0, 3.3], [4.9, 7.4]]) {
          const lit = r() < 0.35;
          span.holes.push({ s0: sc - hw, s1: sc + hw, y0: yFo + y0, y1: yFo + y1, dep: 0.3, frame: '#e9e8e3', rev: '#d6d0c2', glass: GLASS[Math.floor(r() * GLASS.length)], lit, cols: 2, rows: 1 });
          nOpen++;
        }
      }
      D.setColor(RENDER); wall(D, span, yFo, yFT);
      for (const q of span.holes) if (q.frame) win(B, span, q);
      D.setColor(PIL); for (let i = 0; i <= n; i++) { const s = a + sp * i; if (w > 2.2) fbox(D, f, Math.max(a, s - 0.4), Math.min(c, s + 0.4), yFo, yFT + 0.2, 0, 0.45, 1 | 4 | 8 | 16); }
      D.setColor('#d9d3c6'); fbox(D, f, a - 0.2, c + 0.2, yFT, yFT + 0.5, -0.3, 0.3, 1 | 4 | 8 | 16 | 32);
      D.setColor(PLINTH); fbox(D, f, a, c, gLo, yFo + 0.3, 0, 0.05, 1 | 16);
    }
  }
  D.setColor('#58585a'); D.fill(foyer, [], yFT + 0.2, true);
  S.prism(foyer.flat(), gLo, yFT + 0.5, 0, 0, 'wall');

  // ---- meshes
  const sTex = signTex();
  const M = {
    panel: new THREE.MeshStandardMaterial({ map: panelTex(r), vertexColors: true, roughness: 0.85 }),
    frieze: new THREE.MeshStandardMaterial({ map: friezeTex(), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35, envMapIntensity: 1.2 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: sTex, emissiveMap: sTex, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide }),
  };
  const st = finish(root, 'kinoukraina', B, M, ['panel', 'frieze', 'det']);
  console.log(`[cherkasy] Kino Ukraina (Smilianska 21): ${nOpen} openings, floor ${yF.toFixed(1)} m, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(st.verts / 1000).toFixed(1)}k verts, ${(S.count ?? 0) - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const fbb = bboxOf(foyer);
  return {
    footprints: [{ poly: ringPts(hb.p), h: yF + HN - gLo, kind: 'public', name: 'Кінотеатр «Україна»' }, { poly: foyer, h: yFT - gLo, kind: 'public', name: 'Кінотеатр «Україна»' }],
    clear: (x, z) => (x > X0 - 4 && x < X1 + 4 && z > Z0 - 3 && z < Z1 + 3) || (x > fbb.x0 - 2 && x < fbb.x1 && z > fbb.z0 - 3 && z < fbb.z1 + 2),
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.2 * k; M.sign.emissiveIntensity = 0.7 * k; },
  };
}
