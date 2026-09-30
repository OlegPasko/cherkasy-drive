// OWNER: cherkasy. Готель «Дніпро», вулиця Верхня Горова, 13 (OSM 402917283): the four-star hotel of the regional
// council on the slope above the Dnipro (built in 1989 as a hostel, rebuilt in 2000), after the Wikimedia Commons photos
// HotelDnipro1 / HotelDnipro2 and the satellite view. Six storeys of white render; the long fronts are cut into bays by
// deep white fins that run from the ground to the roof and rise over the parapet as a sawtooth; every bay carries a
// balcony per floor (a white solid front over a dark drip line) in front of a glazed balcony door and window. The short
// stepped fronts carry continuous balcony bands instead. The main entrance faces the forecourt on the west, uphill: a
// box canopy in maroon granite with the gold «ГОТЕЛЬ ДНІПРО HOTEL» and four stars, glazed doors and a flight of grey
// granite steps; a stair tower rises a storey over the roof beside it. The ground falls about five metres to the east,
// where a lower storey with its own windows shows under the hotel. Windows light up at night.
//   HOTEL_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildHotelDnipro({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in a face frame (blockkit.js): s along the edge, y up, o outward.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf } from './geo.js';
import { canvasTex } from './sculpt.js';
import { ringFaces, at, rect, box, skin, hole, solid, finish, speckle, quad, label } from './blockkit.js';

const OSM_ID = 402917283;
export const HOTEL_SKIP = new Set([OSM_ID]);

const FH = 3.1, NF = 6, PARA = 0.9, TOOTH = 1.1;   // storey, storeys over the entrance level, parapet, fin heads over it
const BAY = 3.6, FIN = 0.32, FIN_O = 1.35, BAL = 1.3; // bay pitch, fin width / depth, balcony depth
const ENT = [524.1, 410.9];                          // middle of the west front's projection: the entrance
const WHITE = '#efefea', FRONT = '#f5f5f1', DRIP = '#7d8285', PLINTH = '#c9c6bd', GRANITE = '#6e3934', STEP = '#9a9a96';
const GLASS = ['#51606b', '#5b6770', '#45525c', '#6d7980', '#3f4b55'];

// gold lettering on the canopy fascia, 2048 x 256, transparent: «ГОТЕЛЬ», the stars over «ДНІПРО», «HOTEL»
const signTex = () => canvasTex(2048, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const gold = (t, x, y, font) => { g.font = font; g.lineWidth = 6; g.strokeStyle = '#5a4212'; g.strokeText(t, x, y); g.fillStyle = '#d6b35a'; g.fillText(t, x, y); };
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  gold('ГОТЕЛЬ', 330, 150, 'bold 104px Arial, Helvetica, sans-serif');
  gold('HOTEL', 1720, 150, 'bold 104px Arial, Helvetica, sans-serif');
  gold('ДНІПРО', 1024, 225, 'bold 150px Georgia, "Times New Roman", serif');
  gold('★★★★', 1060, 70, '56px Arial, sans-serif');
}, { repeat: false, aniso: 16 });

export function buildHotelDnipro({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), faces = ringFaces(ring);
  const hs = ring.map((p) => heightAt(p[0], p[1])), gLo = Math.min(...hs);
  const yF = heightAt(ENT[0], ENT[1]) + 0.5, Y = (h) => yF + h, ROOF = Y(NF * FH), TOP = ROOF + PARA;
  const B = { wall: new MB(), det: new MB(), lit: new MB(), glass: new MB(), sign: new MB() };
  const D = B.det, UVW = [2.5, 2.5];
  const ent = faces.reduce((b, f) => { const m = at(f, f.L / 2, 0); const d = Math.hypot(m[0] - ENT[0], m[2] - ENT[1]); return d < b.d ? { f, d } : b; }, { f: null, d: Infinity }).f;
  const win = (f, s0, s1, y0, y1, extra) => f.cuts.push({ s0, s1, y0, y1, glass: GLASS[(r() * GLASS.length) | 0], lit: r() < 0.4, frame: '#f1f1ee', rev: '#e2e1dc', dep: 0.2, ...extra });
  let nWin = 0, nBal = 0;
  // the stair tower stands at the start of the long west front next to the entrance projection
  const tf = faces.reduce((b, f) => (f.L > 20 && Math.hypot(f.ax - ENT[0], f.az - ENT[1]) < b.d ? { f, d: Math.hypot(f.ax - ENT[0], f.az - ENT[1]) } : b), { f: null, d: Infinity }).f;
  const TW = 4.6;

  for (const f of faces) {
    if (f.L < 0.4) continue;
    const g = (s) => { const p = at(f, s, 0, 1.2); return heightAt(p[0], p[2]); };
    f.base = Math.min(g(0.1), g(f.L / 2), g(f.L - 0.1), heightAt(f.ax, f.az)) - 0.4;
    const low = (s) => g(s) < Y(-2.7); // the lower storey shows here (the downhill side)
    f.kind = f.L >= 12 ? 'bays' : f.L >= 4 ? 'band' : 'plain';
    if (f.kind === 'bays') {
      const sA = f === tf ? TW : 0, nb = Math.max(2, Math.round((f.L - sA) / BAY)), p = (f.L - sA) / nb;
      f.fins = Array.from({ length: nb + 1 }, (_, i) => sA + i * p);
      for (let i = 0; i < nb; i++) {
        const b0 = sA + i * p + FIN / 2, b1 = sA + (i + 1) * p - FIN / 2, m = (b0 + b1) / 2;
        if (g(m) < Y(0.6)) win(f, b0 + 0.45, b1 - 0.45, Y(0.9), Y(2.5), { sill: WHITE });
        for (let k = 1; k < NF; k++) win(f, b0 + 0.3, b1 - 0.3, Y(k * FH + 0.05), Y(k * FH + 2.45), { pitch: 0.95, tr: Y(k * FH + 0.95) });
        if (low(m)) win(f, b0 + 0.45, b1 - 0.45, Y(-2.3), Y(-0.9), { sill: WHITE });
      }
    } else if (f.kind === 'band') {
      const a = 0.35, b = f.L - 0.35;
      for (let k = f === ent ? 1 : 0; k < NF; k++) win(f, a, b, Y(k * FH + (k ? 0.05 : 0.9)), Y(k * FH + 2.45), { pitch: 1.1, tr: k ? Y(k * FH + 0.95) : 0, sill: k ? null : WHITE });
      if (low(f.L / 2)) win(f, a + 0.2, b - 0.2, Y(-2.3), Y(-0.9), { pitch: 1.2 });
    } else if (f.L >= 1.6) for (let k = 0; k < NF; k++) win(f, f.L / 2 - 0.4, f.L / 2 + 0.4, Y(k * FH + 0.9), Y(k * FH + 2.4), { pitch: 1 });
    if (f === ent) f.cuts.push({ s0: 0.6, s1: f.L - 0.6, y0: Y(0.02), y1: Y(2.8), glass: '#3d4a4f', lit: true, frame: '#8a6a3a', rev: GRANITE, dep: 0.3, pitch: 1.5, tr: Y(2.3), door: true });
    f.cuts = f.cuts.filter((q) => q.s1 - q.s0 > 0.3);
    nWin += f.cuts.length;

    skin(B.wall, f, f.base, Y(0), PLINTH, UVW);
    skin(B.wall, f, Y(0), TOP, WHITE, UVW);
    for (const q of f.cuts) hole(B, f, q);
    D.setColor('#d8d7d1'); rect(D, f, 0, f.L, ROOF, TOP, -0.3, null, [-f.nx, 0, -f.nz]);   // parapet, inner face
    D.setColor('#9fa2a2'); box(D, f, -0.02, f.L + 0.02, TOP, TOP + 0.05, -0.3, 0.04, 'ft');  // coping
    if (f.L > 3) { const p0 = at(f, 0, 0, -0.12), p1 = at(f, f.L, 0, -0.12); Z.edge(p0[0], p0[2], p1[0], p1[2], TOP, f.nx, f.nz); }

    if (f.kind === 'bays') { // fins from the ground to the sawtooth, balconies between them
      B.wall.setColor(WHITE);
      for (const s of f.fins) { box(B.wall, f, s - FIN / 2, s + FIN / 2, f.base, TOP + TOOTH, 0, FIN_O, 'flrt', UVW); solid(S, f, s - FIN / 2, s + FIN / 2, 0, FIN_O, f.base, TOP + TOOTH); }
      for (let i = 0; i + 1 < f.fins.length; i++) {
        const b0 = f.fins[i] + FIN / 2, b1 = f.fins[i + 1] - FIN / 2;
        for (let k = 1; k < NF; k++) balcony(f, b0, b1, Y(k * FH), BAL);
        solid(S, f, b0, b1, 0, BAL, Y(FH - 0.2), ROOF, 'wall');
      }
    } else if (f.kind === 'band' && f.L > 5) {
      for (let k = 1; k < NF; k++) balcony(f, 0.05, f.L - 0.05, Y(k * FH), 1.0, true);
      solid(S, f, 0.05, f.L - 0.05, 0, 1.0, Y(FH - 0.2), ROOF, 'wall');
    }
  }
  // balcony: slab with a dark drip edge, the solid white front, a thin rail over it; open ends get their side panels
  function balcony(f, s0, s1, y, d, ends = false) {
    D.setColor('#cfcdc6'); box(D, f, s0, s1, y - 0.16, y, 0, d, 'tu' + (ends ? 'lr' : ''));
    D.setColor(DRIP); rect(D, f, s0, s1, y - 0.16, y - 0.04, d);
    B.wall.setColor(FRONT); box(B.wall, f, s0, s1, y - 0.04, y + 1.0, d - 0.1, d, 'ftb' + (ends ? 'lr' : ''), [2.5, 2.5]);
    D.setColor('#8e9496'); box(D, f, s0, s1, y + 1.0, y + 1.04, d - 0.1, d, 't');
    nBal++;
  }

  // roof: bitumen deck, lift / vent housings
  D.setColor('#5b5a57'); D.fill(ring, [], ROOF + 0.02, true);
  const bb = bboxOf(ring), cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2;
  // the stair tower on the west front beside the entrance: a storey over the roof, a hooked head
  if (tf) {
    const s0 = 0.1, s1 = TW - 0.1, tt = ROOF + FH + 0.8, TO = 1.9;
    B.wall.setColor(WHITE);
    box(B.wall, tf, s0, s1, tf.base, tt, -3.2, TO, 'flrt', [2.5, 2.5]);
    box(B.wall, tf, s1, s1 + 1.2, tt - 3.4, tt - 0.4, -1.0, TO + 0.9, 'fblrtu', [2.5, 2.5]);  // the hooked head
    box(B.wall, tf, s0 + 0.6, s1 - 0.6, tt - 2.6, tt - 1.2, TO, TO + 0.9, 'flrtu', [2.5, 2.5]);
    for (let k = 0; k < NF; k++) { // stair-landing lights, flush in the tower's face
      const G = r() < 0.6 ? B.lit : B.glass;
      D.setColor('#e9e8e3'); rect(D, tf, 1.6, 3.0, Y(k * FH + 1.5), Y(k * FH + 2.7), TO + 0.01);
      G.setColor('#4a565e'); rect(G, tf, 1.7, 2.9, Y(k * FH + 1.6), Y(k * FH + 2.6), TO + 0.02);
    }
    solid(S, tf, s0, s1, -3.2, TO, tf.base, tt);
  }
  for (const [dx, dz, w, dd, h] of [[-3, 6, 3.5, 2.5, 2.4], [4, -8, 2.2, 2.2, 1.6], [-6, -14, 2.4, 1.6, 1.2]]) {
    const x = cx + dx, z = cz + dz;
    D.setColor('#d4d3cd'); D.box(x - w / 2, ROOF, z - dd / 2, x + w / 2, ROOF + h, z + dd / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - dd / 2, x + w / 2, z - dd / 2, x + w / 2, z + dd / 2, x - w / 2, z + dd / 2], ROOF, ROOF + h, 0, 0, 'equipment');
  }

  // the entrance: granite box canopy on granite side walls, gold lettering, steps down to the forecourt
  if (ent) {
    const f = ent, o1 = 3.4, s0 = -0.8, s1 = f.L + 0.8, yc = Y(2.95), yt = Y(4.2);
    D.setColor(GRANITE);
    box(D, f, s0, s1, yc, yt, 0, o1, 'flrtu');
    for (const s of [s0, s1 - 0.55]) box(D, f, s, s + 0.55, f.base, yc, 0, o1 - 0.2, 'flr');
    D.setColor('#b9b3a6'); rect(D, f, s0 + 0.55, s1 - 0.55, yc - 0.01, yc - 0.01, 0, null, [0, -1, 0]);
    B.lit.setColor('#fff1d6');
    for (const s of [f.L * 0.25, f.L * 0.5, f.L * 0.75]) quad(B.lit, at(f, s - 0.25, yc - 0.02, 1.6), at(f, s + 0.25, yc - 0.02, 1.6), at(f, s + 0.25, yc - 0.02, 2.1), at(f, s - 0.25, yc - 0.02, 2.1), [0, -1, 0]);
    const w = s1 - s0, hh = Math.min(1.1, w * 256 / 2048);
    label(B.sign, f, s0 + 0.2, s1 - 0.2, (yc + yt) / 2 - hh / 2, (yc + yt) / 2 + hh / 2, o1 + 0.02, [0, 0, 1, 1]);
    solid(S, f, s0, s1, 0, o1, yc, yt, 'awning', 1);
    for (const s of [s0, s1 - 0.55]) solid(S, f, s, s + 0.55, 0, o1 - 0.2, f.base, yc);
    const pg = at(f, f.L / 2, 0, o1 + 2.5), gd = heightAt(pg[0], pg[2]);
    const nSt = Math.max(1, Math.round((yF - gd) / 0.16)), rise = (yF - gd) / nSt;
    D.setColor(STEP);
    box(D, f, s0, s1, f.base, yF, 0, o1, 'flrt');  // the landing under the canopy
    for (let i = 0; i < nSt && rise > 0.02; i++) {
      const oa = o1 + i * 0.32, top = yF - rise * (i + 1);
      box(D, f, s0 - 0.6, s1 + 0.6, gd - 0.3, top, oa, oa + 0.32, 'ftlr');
      solid(S, f, s0 - 0.6, s1 + 0.6, oa, oa + 0.32, gd - 0.5, top, 'step');
    }
    solid(S, f, s0, s1, 0, o1, f.base, yF, 'step');
  }

  S.prism(ring.flat(), gLo - 1, TOP, 0, 0, 'wall');

  const sign = signTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.35, metalness: 0.6 }),
  };
  const out = finish(root, 'hoteldnipro', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] Hotel Dnipro: tower ${tf ? tf.k + "@" + tf.ax.toFixed(0) + "," + tf.az.toFixed(0) : "none"}, ${nWin} openings, ${nBal} balconies, floor ${yF.toFixed(1)} m (ground ${gLo.toFixed(1)}..${Math.max(...hs).toFixed(1)}), ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    footprints: [{ poly: ring, h: TOP - gLo, kind: 'hotel', name: 'Готель «Дніпро»' }],
    clear: (x, z) => x > bb.x0 - 3 && x < bb.x1 + 3 && z > bb.z0 - 3 && z < bb.z1 + 3,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.1 * k; M.sign.emissiveIntensity = 0.7 * k; },
  };
}
