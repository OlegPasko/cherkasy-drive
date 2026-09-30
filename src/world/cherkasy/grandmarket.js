// OWNER: cherkasy. ТЦ «Гранд Маркет», вулиця Володимира Великого, 55/1 (OSM way 94984022 and the canopy ring round its
// drum, way 998351799), rebuilt after the novobudovy.com and in.ck.ua photos and the satellite view. A two-storey block
// in cream render on the corner of the street and the side street: the entrance is a glazed half-drum at the corner
// between two cream pylons with coloured banner strips, a green canopy ring round its foot carrying «МАРКЕТ» and a flat
// «Г ГРАНД» sign above it, a cream crown band on top; granite steps round it. Along the street and the side street the
// ground floor is shop glazing between cream piers under a continuous green fascia, the first floor tall windows in
// pairs; the back and the north end are plain with a few windows and service doors. Shops, windows, the drum and the
// sign light up at night.
//   GRANDMARKET_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildGrandMarket({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge with bldkit.js; the edges round the drum (within its radius) are left to the drum.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, centroid, inPoly } from './geo.js';
import { edgeFaces, pt, quad, fbox, wall, gaps, win, row, decal, mats, finish } from './bldkit.js';

const OSM_ID = 94984022, CANOPY_ID = 998351799;
export const GRANDMARKET_SKIP = new Set([OSM_ID, CANOPY_ID]);

const DRUM = [293.5, 1294.4], DR = 5.6;             // the drum's axis (map metres) and radius, fitted to the ring's arc
const G1 = 4.0, FAS = 0.9, TOP = 10.6, DTOP = 13.4;  // fascia bottom, its depth; parapet top; drum crown
const CREAM = '#e9dfc9', PIER = '#f1ebdc', GREEN = '#0f7a57', GRANITE = '#8c8378', SHOP = ['#5d6b70', '#687579', '#56646a'];

// the sign atlas: row 0 the logo square and «ГРАНД» (flat sign over the canopy), row 1 «МАРКЕТ» (on the canopy band)
const SIGN = { top: [0, 0, 1, 0.62], band: [0.1, 0.64, 0.9, 1] };
const signTex = () => canvasTex(1024, 512, (g) => {
  g.clearRect(0, 0, 1024, 512);
  // logo: a green square in a white frame with the white bracket-shaped «Г»
  g.fillStyle = '#ffffff'; g.fillRect(20, 40, 240, 240);
  g.fillStyle = '#138a60'; g.fillRect(34, 54, 212, 212);
  g.fillStyle = '#ffffff'; g.fillRect(80, 90, 120, 34); g.fillRect(80, 90, 34, 140); g.fillRect(150, 150, 34, 80); g.fillRect(114, 196, 70, 34);
  g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  g.font = 'bold 190px Georgia, "Times New Roman", serif';
  g.strokeStyle = '#0b5a3f'; g.lineWidth = 10; g.strokeText('ГРАНД', 295, 255, 680);
  g.fillStyle = '#f7f7f2'; g.fillText('ГРАНД', 295, 255, 680);
  g.textAlign = 'center'; g.font = 'bold 120px Georgia, "Times New Roman", serif';
  g.fillText('М А Р К Е Т', 512, 470, 780);
}, { repeat: false, aniso: 16 });

export function buildGrandMarket({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), C = centroid(ring);
  let gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const yF = heightAt(DRUM[0], DRUM[1]) + 0.6, gB = gLo - 0.6, Y = (h) => yF + h;
  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const D = B.det;
  let nWin = 0;
  const nearDrum = (x, z, pad = 0.6) => Math.hypot(x - DRUM[0], z - DRUM[1]) < DR + pad;
  // the drum faces out of the corner: the direction from the block's centre through the axis
  const dl = Math.hypot(DRUM[0] - C[0], DRUM[1] - C[1]), dfx = (DRUM[0] - C[0]) / dl, dfz = (DRUM[1] - C[1]) / dl;
  const fronts = [], pylons = []; // street-side faces (for steps); [face, s0, s1] of the pylons next to the drum

  // ---- walls per ring edge
  for (const f of edgeFaces(ring)) {
    const a = pt(f, 0, 0), b = pt(f, f.L, 0);
    if (nearDrum(a[0], a[2]) && nearDrum(b[0], b[2])) continue; // the arc: the drum covers it
    // street fronts face south-west (the street) or south-east (the side street); the rest is the back
    const street = (f.nx < -0.8 || f.nz > 0.8) && f.L > 5;
    const holes = [];
    if (street) {
      const s0 = nearDrum(a[0], a[2], 4) ? 4.5 : 0.6, s1 = nearDrum(b[0], b[2], 4) ? f.L - 4.5 : f.L - 0.6; // pylons next to the drum
      if (s0 > 1) pylons.push([f, 0.2, 3.8]);
      if (s1 < f.L - 1) pylons.push([f, f.L - 3.8, f.L - 0.2]);
      const nb = Math.max(1, Math.round((s1 - s0) / 6.2)), pitch = (s1 - s0) / nb;
      for (let i = 0; i < nb; i++) {
        const m = s0 + (i + 0.5) * pitch, w = pitch - 1.0;
        const door = (i % 4 === 1);
        holes.push({ s0: m - w / 2, s1: m + w / 2, y0: Y(door ? 0.02 : 0.45), y1: Y(3.6), cols: Math.round(w / 1.4), rows: 2, rev: PIER, glass: SHOP[i % 3], lit: true, dep: 0.14 });
        for (const q of row(f, m - w / 2, m + w / 2, w / 2, w / 2 - 0.5, Y(5.4), Y(9.3), { cols: 2, rows: 3, rev: PIER, lit: r() < 0.45, sill: PIER })) holes.push(q);
      }
      fronts.push(f);
    } else if (f.L > 8) { // back: a row of upper windows, a service door here and there
      for (const q of row(f, 2, f.L - 2, 4.5, 1.6, Y(6.0), Y(8.4), { cols: 2, rev: PIER, lit: r() < 0.4, sill: PIER })) holes.push(q);
      const dp = pt(f, f.L / 2, 0, 1);
      if (f.L > 20) holes.push({ s0: f.L / 2 - 1.5, s1: f.L / 2 + 1.5, y0: Math.max(gB + 0.1, heightAt(dp[0], dp[2]) + 0.05), y1: Y(3.2), cols: 2, rows: 3, rev: GRANITE, glass: '#8e9aa0', dep: 0.1 });
    }
    B.wall.setColor(CREAM); wall(B.wall, f, gB, Y(TOP), holes, [2.5, 2.5]);
    for (const q of holes) { win(B, f, q); nWin++; }
    D.setColor(GRANITE); for (const [p, q] of gaps(f, holes, Y(0.3), Y(0.45))) fbox(D, f, p, q, gB, Y(0.45), 0, 0.06, 'ftlr'); // granite plinth, broken by the doors
    if (street) {
      D.setColor(GREEN); fbox(D, f, -0.05, f.L + 0.05, Y(G1), Y(G1 + FAS), 0, 0.45, 'ftu'); // the green fascia band
      D.setColor(PIER); fbox(D, f, -0.05, f.L + 0.05, Y(TOP - 0.5), Y(TOP), 0, 0.12, 'ftu');  // cornice
      for (const q of holes) if (q.y0 > Y(5)) { fbox(D, f, q.s0 - 0.35, q.s0 - 0.05, Y(5.0), Y(TOP - 0.5), 0, 0.12, 'flr'); fbox(D, f, q.s1 + 0.05, q.s1 + 0.35, Y(5.0), Y(TOP - 0.5), 0, 0.12, 'flr'); }
    }
    D.setColor('#cfc8b8'); fbox(D, f, 0, f.L, Y(TOP - 0.05), Y(TOP + 0.08), -0.3, 0.05, 'ft'); // coping
    const p0 = pt(f, 0, 0, -0.1), p1 = pt(f, f.L, 0, -0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP), f.nx, f.nz);
  }
  D.setColor('#8f9294'); D.fill(ring, [], Y(TOP - 0.3), true); // roof deck
  for (const [dx, dz, w, d, h] of [[-8, -30, 4, 2.5, 1.8], [6, -10, 3, 2, 1.3], [-6, 18, 2.4, 2.4, 1.2], [10, 30, 2.4, 1.6, 1.2]]) { // air handlers
    const x = C[0] + dx, z = C[1] + dz;
    if (!inPoly(ring, x, z)) continue;
    D.setColor('#c9cac6'); D.box(x - w / 2, Y(TOP - 0.3), z - d / 2, x + w / 2, Y(TOP - 0.3 + h), z + d / 2, 1 | 2 | 4 | 16 | 32);
  }

  // ---- the drum: glazed ground floor behind the canopy, a curved curtain wall above, the cream crown band
  const N = 28, a0 = Math.atan2(dfz, dfx), span = Math.PI * 0.62; // the exposed half, a little more
  const R2 = DR + 2.7, TXT = 3 * 2 * span / N; // canopy radius; the lettering's half angle (three segments either side)
  B.sign.setColor('#ffffff');
  const at = (ang, rad, y) => [DRUM[0] + Math.cos(ang) * rad, y, DRUM[1] + Math.sin(ang) * rad];
  for (let i = 0; i < N; i++) {
    const aa = a0 - span + 2 * span * i / N, ab = a0 - span + 2 * span * (i + 1) / N, am = (aa + ab) / 2, n = [Math.cos(am), 0, Math.sin(am)];
    const ua = i, ub = i + 1;
    B.lit.setColor(SHOP[1]);
    quad(B.lit, at(aa, DR - 0.25, Y(0.05)), at(ab, DR - 0.25, Y(0.05)), at(ab, DR - 0.25, Y(3.9)), at(aa, DR - 0.25, Y(3.9)), n, [[ua * 0.6, 0], [ub * 0.6, 0], [ub * 0.6, 2], [ua * 0.6, 2]]);
    B.lit.setColor('#dfe7ea');
    quad(B.lit, at(aa, DR, Y(5.0)), at(ab, DR, Y(5.0)), at(ab, DR, Y(11.4)), at(aa, DR, Y(11.4)), n, [[ua * 0.5, 0], [ub * 0.5, 0], [ub * 0.5, 4], [ua * 0.5, 4]]);
    B.wall.setColor(PIER); // crown band and the strip between canopy and glass
    quad(B.wall, at(aa, DR + 0.15, Y(11.4)), at(ab, DR + 0.15, Y(11.4)), at(ab, DR + 0.15, Y(DTOP)), at(aa, DR + 0.15, Y(DTOP)), n, [[aa * DR / 2.5, 0], [ab * DR / 2.5, 0], [ab * DR / 2.5, 0.8], [aa * DR / 2.5, 0.8]]);
    quad(B.wall, at(aa, DR, Y(3.9)), at(ab, DR, Y(3.9)), at(ab, DR, Y(5.0)), at(aa, DR, Y(5.0)), n);
    D.setColor(PIER); quad(D, at(aa, DR + 0.15, Y(DTOP)), at(ab, DR + 0.15, Y(DTOP)), at(ab, 0.3, Y(DTOP)), at(aa, 0.3, Y(DTOP)), [0, 1, 0]);
    // the green canopy ring: fascia, top and soffit
    D.setColor(GREEN); quad(D, at(aa, R2, Y(G1)), at(ab, R2, Y(G1)), at(ab, R2, Y(G1 + 1.0)), at(aa, R2, Y(G1 + 1.0)), n);
    const ta = (aa - a0 + TXT) / (2 * TXT), tb = (ab - a0 + TXT) / (2 * TXT); // «МАРКЕТ» along the fascia (angle grows to the viewer's left)
    if (ta >= -1e-6 && tb <= 1 + 1e-6) {
      const [u0, v0, u1, v1] = SIGN.band, ua2 = u1 - (u1 - u0) * ta, ub2 = u1 - (u1 - u0) * tb;
      quad(B.sign, at(aa, R2 + 0.03, Y(G1 + 0.12)), at(ab, R2 + 0.03, Y(G1 + 0.12)), at(ab, R2 + 0.03, Y(G1 + 0.88)), at(aa, R2 + 0.03, Y(G1 + 0.88)), n, [[ua2, 1 - v1], [ub2, 1 - v1], [ub2, 1 - v0], [ua2, 1 - v0]]);
    }
    D.setColor('#1c6b50'); quad(D, at(aa, DR, Y(G1 + 1.0)), at(ab, DR, Y(G1 + 1.0)), at(ab, R2, Y(G1 + 1.0)), at(aa, R2, Y(G1 + 1.0)), [0, 1, 0]);
    D.setColor('#e8e4da'); quad(D, at(aa, DR, Y(G1)), at(ab, DR, Y(G1)), at(ab, R2, Y(G1)), at(aa, R2, Y(G1)), [0, -1, 0]);
    // granite steps round the foot, three risers down to the pavement
    for (let k = 0; k < 3; k++) {
      const rr = R2 + 0.4 + k * 0.4, yt = Y(-k * 0.2);
      D.setColor(k & 1 ? '#9a9187' : GRANITE);
      quad(D, at(aa, rr - 0.4, yt), at(ab, rr - 0.4, yt), at(ab, rr, yt), at(aa, rr, yt), [0, 1, 0]);
      quad(D, at(aa, rr, gB), at(ab, rr, gB), at(ab, rr, yt), at(aa, rr, yt), n);
    }
    D.setColor(GRANITE); quad(D, at(aa, DR, Y(0)), at(ab, DR, Y(0)), at(ab, R2 + 0.4, Y(0)), at(aa, R2 + 0.4, Y(0)), [0, 1, 0]);
  }
  for (const i of [5, 9.5, 14, 18.5, 23]) { const ang = a0 - span + 2 * span * i / N, [x, , z] = at(ang, R2 - 0.4, 0); D.setColor(PIER); D.cyl(x, Y(0), z, 0.18, 0.18, G1, 10, false); S.cyl(x, z, Y(-0.5), Y(G1), 0.18, 0.18, 'pole'); }
  // mullions of the curtain wall every other segment, transoms
  D.setColor('#d7d9d6');
  for (let i = 0; i <= N; i += 2) { const ang = a0 - span + 2 * span * i / N, [x, , z] = at(ang, DR + 0.08, 0); D.box(x - 0.09, Y(5.0), z - 0.09, x + 0.09, Y(11.4), z + 0.09); }
  // the flat sign over the canopy: «Г ГРАНД», standing on the canopy in front of the glass; «МАРКЕТ» on the fascia
  const sf = { ax: DRUM[0] + dfx * (DR + 0.9) + dfz * 5.2, az: DRUM[1] + dfz * (DR + 0.9) - dfx * 5.2, ux: -dfz, uz: dfx, nx: dfx, nz: dfz, L: 10.4 };
  decal(B.sign, sf, 0, 10.4, Y(G1 + 1.05), Y(G1 + 1.05 + 10.4 * 0.62 / 2), 0, SIGN.top);
  // ---- pylons either side of the drum on the street fronts, with the coloured banner strips
  pylons.forEach(([f, s0, s1], k) => {
    B.wall.setColor(PIER); fbox(B.wall, f, s0, s1, gB, Y(DTOP - 0.4), -0.5, 0.6, 'flrt');
    const m = (s0 + s1) / 2;
    D.setColor(k ? '#e0622a' : '#2f8f4e'); fbox(D, f, m - 0.7, m + 0.7, Y(5.6), Y(11.8), 0.6, 0.66, 'flr');
    D.setColor('#f4f1ea'); fbox(D, f, m - 0.45, m + 0.45, Y(6.2), Y(11.2), 0.66, 0.68, 'f');
    const Q = [[s0, -0.5], [s1, -0.5], [s1, 0.6], [s0, 0.6]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    S.prism(Q.flat(), gB, Y(DTOP - 0.4), 0, 0, 'wall');
  });

  // ---- steps along the street fronts
  for (const f of fronts) {
    const s0 = 0.5, s1 = f.L - 0.5;
    const pg = pt(f, f.L / 2, 0, 2.5), g = Math.min(heightAt(pg[0], pg[2]), Y(-0.1));
    const n = Math.max(1, Math.ceil((yF - g) / 0.17));
    for (let k = 0; k < n; k++) {
      const yt = yF - k * (yF - g) / n;
      D.setColor(k & 1 ? '#9a9187' : GRANITE); fbox(D, f, s0, s1, gB, yt, 0, 1.2 + k * 0.35, 'ftlr');
    }
    const Q = [[s0, 0], [s1, 0], [s1, 1.2], [s0, 1.2]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    S.prism(Q.flat(), gB, yF, 0, 0, 'step');
  }

  // ---- collision: the block, the drum and its step ring
  S.prism(ring.flat(), gB, Y(TOP), 0, 0, 'wall');
  S.cyl(DRUM[0], DRUM[1], gB, Y(DTOP), DR + 0.1, DR + 0.1, 'wall');
  S.cyl(DRUM[0], DRUM[1], gB, Y(0), DR + 3.1, DR + 3.1, 'step');
  S.cyl(DRUM[0], DRUM[1], Y(G1), Y(G1 + 1.0), DR + 2.7, DR + 2.7, 'awning', 1);

  // ---- meshes
  const sign = signTex();
  const M = mats({ sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.4 }) });
  const out = finish(root, 'grandmarket', B, M, ['wall', 'det']);
  console.log(`[cherkasy] Grand Market: ${nWin} openings, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const canopy = map.buildings.find((q) => q.id === CANOPY_ID);
  return {
    footprints: [{ poly: ring, h: Y(TOP) - gLo, kind: bld.k, name: 'Гранд Маркет' }, ...(canopy ? [{ poly: ringPts(canopy.p), h: Y(DTOP) - gLo, kind: bld.k, name: 'Гранд Маркет' }] : [])],
    clear: (x, z) => x > x0 - 4 && x < x1 + 3 && z > z0 - 3 && z < z1 + 4,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.6 * k; M.sign.emissiveIntensity = 0.7 * k; },
  };
}
