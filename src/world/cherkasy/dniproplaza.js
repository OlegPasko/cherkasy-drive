// OWNER: cherkasy. ТРЦ «Дніпро Плаза», вулиця Припортова, 34 (OSM 94983922): the two-storey mall on the square off
// Pryportova, after the mall's own panorama (dniproplaza.com), its night photo and the satellite view. The south front
// has a full-height convex drum of blue mirror glass on a fine mullion grid in the middle, with the blue seagull and
// «ДНІПРО ПЛАЗА» over the entrance; two lower wings of pale grey composite panels either side carry big framed
// billboards (plain art here, no brands), and the chamfered corners turn to the plain side and back walls. The whole
// ground floor of the front is a glazed shop line set back under the upper floor, carried on slim round columns. A blue
// neon line draws the drum's outline at night, when the shopfronts and the drum glow. The lot and the forecourt are
// levelled (the DEM falls some 5 m across it).
//   DP_SKIP: the OSM id replaced here (buildings.js skips it)
//   shapeDniproPlaza(hf, map) -> level | null   levels the lot and the forecourt (before the ground is built)
//   buildDniproPlaza({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in a face frame (slabkit.js): s along the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, hull, centroid, bboxOf } from './geo.js';
import { canvasTex } from './sculpt.js';
import { ringFaces, at, rect, box, skin, hole, solid, finish, label, UP } from './slabkit.js';

const OSM_ID = 94983922;
export const DP_SKIP = new Set([OSM_ID]);

const FRONT = [-0.75, 0.66];                  // the south front's outward normal (map frame)
const G1 = 4.6, TOPW = 11.6, TOPD = 16.2;     // ground floor (the colonnade's soffit), wing parapet top, drum top
const SET = 2.4, DRUM_D = 26;                 // shopfront set-back under the upper floor; the drum's depth into the block
const PANEL = '#e3e6e7', FASCIA = '#9ba2a7', STEEL = '#c9cdd1', SOFFIT = '#d9dbdc', PLINTH = '#8d9194';
const SHOP = ['#47535a', '#4f5b60', '#3f4b52', '#56615f'];

// pale composite cassettes 1.5 x 1.2 m with dark open joints
const panelTex = () => canvasTex(128, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#f4f5f5'); gr.addColorStop(1, '#e6e8e9');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7b8185'; g.fillRect(0, 0, 3, h); g.fillRect(0, 0, w, 3);
});
// atlas 2048 x 1024: row 0 the name and the seagull (blue), row 1 four plain billboard arts
const ART = [[0, 0.5, 0.25, 1], [0.25, 0.5, 0.5, 1], [0.5, 0.5, 0.75, 1], [0.75, 0.5, 1, 1]];
const NAME = [0, 0.18, 0.78, 0.5], GULL = [0.8, 0, 1, 0.5];
const atlasTex = () => canvasTex(2048, 1024, (g) => {
  g.clearRect(0, 0, 2048, 1024);
  g.font = 'bold 250px Georgia, "Times New Roman", serif'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  g.lineWidth = 12; g.strokeStyle = '#e8f0ff'; g.strokeText('ДНІПРО ПЛАЗА', 800, 460, 1560); g.fillStyle = '#1d4fb8'; g.fillText('ДНІПРО ПЛАЗА', 800, 460, 1560);
  // the seagull: two swept blue wings over an orange underline
  g.fillStyle = '#2255c4'; g.beginPath(); g.moveTo(1650, 260); g.quadraticCurveTo(1740, 140, 1790, 90); g.quadraticCurveTo(1800, 200, 1720, 290);
  g.quadraticCurveTo(1860, 230, 2010, 150); g.quadraticCurveTo(1940, 300, 1760, 330); g.closePath(); g.fill();
  g.strokeStyle = '#f08a24'; g.lineWidth = 18; g.beginPath(); g.moveTo(1660, 420); g.quadraticCurveTo(1720, 330, 1840, 320); g.stroke();
  const arts = [['#1d8f8a', '#e9f4f2'], ['#e8742f', '#fbe4d2'], ['#2b4f9c', '#dfe7f7'], ['#f1cf3b', '#3a8fd1']];
  arts.forEach(([a, b], i) => {
    const x = i * 512, y = 512;
    g.fillStyle = a; g.fillRect(x + 8, y + 8, 496, 496);
    g.fillStyle = b; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(x + 150 + i * 60, y + 260, 120, 0, Math.PI * 2); g.fill();
    g.fillRect(x + 300, y + 120, 150, 26); g.fillRect(x + 300, y + 180, 110, 26); g.fillRect(x + 300, y + 330, 170, 60);
    g.globalAlpha = 1;
  });
}, { repeat: false, aniso: 16 });

// the pad: the footprint plus the forecourt out to the square
const padRing = (ring) => hull([...ring, ...ring.map((p) => [p[0] + FRONT[0] * 18, p[1] + FRONT[1] * 18])]);
export function shapeDniproPlaza(hf, map) {
  const b = map.buildings?.find((q) => q.id === OSM_ID);
  return b ? hf.pad(padRing(ringPts(b.p)), 22) : null;
}

export function buildDniproPlaza({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), faces = ringFaces(ring), C = centroid(ring);
  const hs = ring.map((p) => heightAt(p[0], p[1])), gLo = Math.min(...hs) - 0.5;
  const frontOf = (f) => f.nx * FRONT[0] + f.nz * FRONT[1] > 0.5;
  const bow = faces.filter((f) => frontOf(f) && f.L < 7);
  const mid = at(bow[bow.length >> 1], 0, 0);
  const yF = heightAt(mid[0], mid[2]) + 0.15, Y = (h) => yF + h;
  const B = { wall: new MB(), det: new MB(), lit: new MB(), glass: new MB(), curtain: new MB(), neon: new MB(), sign: new MB() };
  const D = B.det, PUV = [1.5, 1.2];
  let nOpen = 0;

  // ---- the drum's outline: the bow and its two ends carried DRUM_D back into the block
  const bowPts = bow.map((f) => [f.ax, f.az]).concat([[at(bow[bow.length - 1], bow[bow.length - 1].L, 0)[0], at(bow[bow.length - 1], bow[bow.length - 1].L, 0)[2]]]);
  const pA = bowPts[0], pB = bowPts[bowPts.length - 1], back = (p) => [p[0] - FRONT[0] * DRUM_D, p[1] - FRONT[1] * DRUM_D];
  const drumRing = [...bowPts, back(pB), back(pA)];

  for (const f of faces) {
    if (f.L < 0.3) continue;
    const front = frontOf(f), isBow = bow.includes(f), top = Y(isBow ? TOPD : TOPW);
    if (front) {
      // colonnade: the shop line set back under the upper floor, its soffit, columns at the face line
      const sf = { ...f, ax: f.ax - f.nx * SET, az: f.az - f.nz * SET, cuts: [] };
      const gq = { s0: 0, s1: f.L, y0: Y(0.02), y1: Y(G1 - 0.05), glass: SHOP[(r() * 4) | 0], lit: true, frame: '#8c9398', rev: SOFFIT, dep: 0.1, pitch: 1.7, tr: Y(3.2), door: true };
      sf.cuts.push(gq); hole(B, sf, gq); nOpen++;
      D.setColor(SOFFIT); box(D, f, 0, f.L, Y(G1), Y(G1 + 0.02), -SET, 0, 'u');
      D.setColor('#8b8f91'); box(D, f, 0, f.L, Y(-0.2), Y(0.02), -SET, 0.4, 't'); // the paved strip under it
      B.lit.setColor('#fff4dc');
      for (let s = 1.5; s < f.L - 1; s += 3) rect(B.lit, f, s - 0.2, s + 0.2, Y(G1) - 0.01, Y(G1) - 0.01, -SET * 0.5, null, [0, -1, 0]);
      if (!isBow) {
        for (let s = f.L / Math.max(1, Math.round(f.L / 6)); s < f.L - 0.5; s += f.L / Math.max(1, Math.round(f.L / 6))) column(f, s);
      }
      if (!isBow) skin(B.wall, f, Y(G1), top, PANEL, PUV);
      if (!isBow) { D.setColor(FASCIA); box(D, f, -0.02, f.L + 0.02, Y(G1), Y(G1 + 0.7), 0, 0.12, 'ftu'); }
    } else {
      // side and back walls: panels over a dark plinth, a blue-grey band at the first floor, a few doors
      const nd = f.L > 40 ? 3 : f.L > 12 ? 1 : 0;
      for (let i = 0; i < nd; i++) {
        const s = f.L * (i + 0.5) / nd, dp = at(f, s, 0, 1.5), gd = heightAt(dp[0], dp[2]);
        if (gd > Y(0.4) || gd < Y(-1.5)) continue;
        f.cuts.push({ s0: s - 1.6, s1: s + 1.6, y0: Math.max(gd + 0.05, Y(-0.4)), y1: Y(3.0), glass: '#3d474d', lit: i % 2 === 0, frame: '#6d7479', rev: '#b9bcbe', dep: 0.2, pitch: 1.6, door: true });
      }
      f.cuts = f.cuts.filter((q) => q.y1 - q.y0 > 1.5);
      skin(B.wall, f, gLo, Y(0.6), PLINTH);
      skin(B.wall, f, Y(0.6), Y(TOPW), PANEL, PUV);
      for (const q of f.cuts) { hole(B, f, q); nOpen++; D.setColor('#9aa0a4'); box(D, f, q.s0 - 0.5, q.s1 + 0.5, Y(3.3), Y(3.55), 0, 1.4, 'ftlru'); }
      D.setColor('#6f8394'); box(D, f, 0, f.L, Y(4.3), Y(4.9), 0, 0.06, 'ft');
    }
    // parapet: inner face and coping; the drum's bow is capped at its own height
    D.setColor('#cfd2d3'); rect(D, f, 0, f.L, top - 0.9, top, -0.3, null, [-f.nx, 0, -f.nz]);
    D.setColor('#aeb3b6'); box(D, f, -0.03, f.L + 0.03, top, top + 0.06, -0.3, 0.05, 'ft');
    if (f.L > 3) { const p0 = at(f, 0, 0, -0.12), p1 = at(f, f.L, 0, -0.12); Z.edge(p0[0], p0[2], p1[0], p1[2], top, f.nx, f.nz); }
  }
  function column(f, s) {
    const p = at(f, s, 0, -0.45);
    D.setColor(STEEL); D.cyl(p[0], Y(-0.1), p[2], 0.28, 0.28, G1 + 0.1, 14, false);
    D.setColor('#8f9396'); D.cyl(p[0], Y(-0.1), p[2], 0.36, 0.36, 0.25, 14);
    S.cyl(p[0], p[2], Y(-0.2), Y(G1), 0.28, 0.28, 'pole');
  }

  // ---- the drum: mirror glass on a mullion grid from the soffit to the top, the bow's columns, the neon outline
  for (const f of bow) {
    B.curtain.setColor('#ffffff'); rect(B.curtain, f, 0, f.L, Y(G1 + 0.7), Y(TOPD - 0.4), -0.05);
    D.setColor('#aeb4b8');
    for (const s of [0, f.L / 2]) box(D, f, s - 0.05, s + 0.05, Y(G1 + 0.7), Y(TOPD - 0.4), -0.05, 0.1, 'flr');
    for (let y = Y(G1 + 0.7); y < Y(TOPD - 0.3); y += 1.6) box(D, f, 0, f.L, y - 0.05, y + 0.05, -0.05, 0.1, 'ftu');
    D.setColor(FASCIA); box(D, f, 0, f.L, Y(G1), Y(G1 + 0.7), 0, 0.15, 'ftu');
    B.neon.setColor('#ffffff'); box(B.neon, f, 0, f.L, Y(TOPD - 0.4), Y(TOPD - 0.28), 0.05, 0.14, 'ftu'); box(B.neon, f, 0, f.L, Y(G1 + 0.72), Y(G1 + 0.84), 0.12, 0.2, 'ft');
    column(f, 0);
  }
  column(bow[bow.length - 1], bow[bow.length - 1].L);
  const dr = ringFaces(drumRing).filter((f) => !bow.some((b) => Math.hypot(b.ax - f.ax, b.az - f.az) < 0.01 && Math.abs(b.L - f.L) < 0.01));
  for (const f of dr) { // the drum's sides and back over the wing roof
    B.wall.setColor(PANEL); rect(B.wall, f, 0, f.L, Y(TOPW - 0.9), Y(TOPD), 0, PUV);
    D.setColor('#aeb3b6'); box(D, f, -0.03, f.L + 0.03, Y(TOPD), Y(TOPD + 0.06), -0.3, 0.05, 'ft');
  }
  for (const p of [pA, pB]) { B.neon.setColor('#ffffff'); B.neon.box(p[0] - 0.07, Y(G1 + 0.7), p[1] - 0.07, p[0] + 0.07, Y(TOPD - 0.3), p[1] + 0.07); }
  D.setColor('#6d6f70'); D.fill(drumRing, [], Y(TOPD - 0.5), true);
  S.prism(drumRing.flat(), Y(TOPW - 1), Y(TOPD), 0, 0, 'wall');

  // the name on the drum glass over the entrance, bent round the bow segment by segment, the seagull over its middle
  {
    const arc = bow.reduce((t, f) => t + f.L, 0), w = Math.min(arc * 0.8, 17), h = w * (0.32 * 1024) / (0.78 * 2048), t0 = (arc - w) / 2;
    const flip = bow[0].ux * bow[0].nz - bow[0].uz * bow[0].nx < 0, U = (t) => NAME[0] + (t - t0) / w * (NAME[2] - NAME[0]);
    let c = 0;
    for (const f of bow) {
      const ta = Math.max(t0, c), tb = Math.min(t0 + w, c + f.L);
      if (tb > ta) {
        const [u0, u1] = flip ? [U(arc - tb), U(arc - ta)] : [U(ta), U(tb)];
        label(B.sign, f, ta - c, tb - c, Y(G1 + 1.0), Y(G1 + 1.0) + h, 0.25, [u0, NAME[1], u1, NAME[3]]);
      }
      if (c <= arc / 2 && c + f.L > arc / 2) { const m = arc / 2 - c; label(B.sign, f, m - 1.5, m + 1.5, Y(G1 + 1.3) + h, Y(G1 + 1.3) + h + 2.7, 0.3, GULL); }
      c += f.L;
    }
  }

  // ---- billboards on the wings' upper floor: framed boxes standing proud of the panels
  let art = 0;
  for (const f of faces) {
    if (!frontOf(f) || bow.includes(f) || f.L < 8) continue;
    const w = Math.min(f.L - 2.4, 11), s0 = (f.L - w) / 2, y0 = Y(G1 + 1.3), y1 = Y(TOPW - 1.4);
    D.setColor('#5d6368'); box(D, f, s0 - 0.2, s0 + w + 0.2, y0 - 0.2, y1 + 0.2, 0, 0.25, 'ftlru');
    label(B.sign, f, s0, s0 + w, y0, y1, 0.26, ART[art++ % 4]);
    B.lit.setColor('#fff7e0');
    for (let s = s0 + 1; s < s0 + w; s += 2.4) { const p = at(f, s, y1 + 0.35, 0.6); B.lit.box(p[0] - 0.15, p[1] - 0.05, p[2] - 0.15, p[0] + 0.15, p[1] + 0.05, p[2] + 0.15); }
  }

  // ---- roof: membrane, the round skylight, air handlers
  D.setColor('#bdbdb8'); D.fill(ring, [], Y(TOPW - 0.9), true);
  const sk = [C[0] + FRONT[0] * 6, C[1] + FRONT[1] * 6];
  D.setColor('#9aa0a4'); D.cyl(sk[0], Y(TOPW - 0.9), sk[1], 2.9, 2.9, 0.6, 20);
  B.curtain.setColor('#dfe8f0'); B.curtain.ellipsoid([sk[0], Y(TOPW - 0.3), sk[1]], [2.6, 1.3, 2.6], 18, 6);
  for (const [dx, dz, w, dd, hh] of [[14, -20, 4, 2.6, 2.0], [-10, -26, 3, 3, 1.6], [22, 5, 2.4, 2.4, 1.4], [-18, 2, 3.4, 2.2, 1.8], [2, -38, 5, 3, 2.2]]) {
    const x = C[0] + dx, z = C[1] + dz;
    D.setColor('#d4d6d6'); D.box(x - w / 2, Y(TOPW - 0.9), z - dd / 2, x + w / 2, Y(TOPW - 0.9 + hh), z + dd / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - dd / 2, x + w / 2, z - dd / 2, x + w / 2, z + dd / 2, x - w / 2, z + dd / 2], Y(TOPW - 0.9), Y(TOPW - 0.9 + hh), 0, 0, 'equipment');
  }

  // ---- collision: the shop line (the ring with the front pulled back by the set-back), the upper floor over the
  // colonnade as an overhang the car drives under
  const inner = ring.map((p, i) => (faces[i].L > 0 && (frontOf(faces[i]) || frontOf(faces[(i + ring.length - 1) % ring.length])) ? [p[0] - FRONT[0] * SET, p[1] - FRONT[1] * SET] : p));
  S.prism(inner.flat(), gLo - 1, Y(TOPW), 0, 0, 'wall');
  S.prism(ring.flat(), Y(G1), Y(TOPW), 0, 0, 'awning', 1);

  const atlas = atlasTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.45, metalness: 0.25 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffe2b8, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.4 }),
    curtain: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x3a6fb4, roughness: 0.06, metalness: 0.8, emissive: 0x9fc4ff, emissiveIntensity: 0 }),
    neon: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x6f8fd8, roughness: 0.4, emissive: 0x2d5bff, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.35, roughness: 0.5 }),
  };
  const out = finish(root, 'dniproplaza', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] Dnipro Plaza: ${nOpen} openings, drum of ${bow.length} segments, floor ${yF.toFixed(1)} m (ground ${Math.min(...hs).toFixed(1)}..${Math.max(...hs).toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const bb = bboxOf(ring);
  return {
    footprints: [{ poly: ring, h: Y(TOPW) - gLo, kind: 'retail', name: 'Дніпро Плаза' }, { poly: drumRing, h: Y(TOPD) - gLo, kind: 'retail', name: 'Дніпро Плаза' }],
    clear: (x, z) => x > bb.x0 - 3 && x < bb.x1 + 3 && z > bb.z0 - 3 && z < bb.z1 + 3,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.35 * k; M.curtain.emissiveIntensity = 0.12 * k; M.neon.emissiveIntensity = 2.2 * k; M.sign.emissiveIntensity = 0.9 * k; },
  };
}
