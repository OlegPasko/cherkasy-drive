// OWNER: cherkasy. Supermarket «АТБ», bulvar Shevchenka 239 (OSM way 408254373, a one-storey shop by the corner of vul.
// Nebesnoi Sotni, under the gable end of the four-storey block at No 35), rebuilt on a player's request (issue #12). A
// low box in cream render with its front on the boulevard: shop glazing in blue frames between cream piers, two blue
// doors and an ATM, all under a deep band of blue steel panels that carries the round red-and-blue АТБ logo in a white
// box and the «24 цілодобово» box; a cream wall with the house number at the corner end, steps with yellow nosings the
// whole length of the front and a blue rail on the ramp. At the other end a blue steel stair climbs past a cream pier to
// the flat roof, where the first floor of the next building (ТЦ «Євростандарт», over the shop) is entered; air
// conditioners stand on the roof behind a rail. The glazing and both sign boxes light up at night (the shop is 24/7).
// References: the Google Maps photo of the front (the ATM there is PrivatBank node 4359128121, "магазин АТБ"),
// Street View (2015).
//   ATB_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildAtb({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge with bldkit.js; the front is the edge facing the boulevard (-x), the other edges are
// plain render (the +z one is the party wall with the neighbour).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, area2 } from './geo.js';
import { edgeFaces, pt, panel, fbox, wall, win, decal, facing, mats, finish } from './bldkit.js';

const OSM_ID = 408254373;
export const ATB_SKIP = new Set([OSM_ID]);

const LIFT = 0.5, ROOF = 4.6, FAS0 = 3.35, FAS1 = 5.0, FASD = 1.1; // floor over the pavement, parapet, the blue band and its reach
const CREAM = '#efe2bf', PIER = '#f3ecdc', BLUE = '#1f4da6', DBLUE = '#173d86', YEL = '#d9b628', PAVE = '#8e8a84';
const LOGO = [0, 0, 0.5, 1], H24 = [0.5, 0, 1, 1];

// blue steel panels: a vertical joint every 0.9 m (1.8 m per repeat), the vertex colour gives the blue
const panelTex = () => canvasTex(256, 64, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#f4f4f4'); grd.addColorStop(1, '#d4d4d4');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  // joints off u = 0, which the untextured faces sample
  for (const x of [w / 4, 3 * w / 4]) { g.fillStyle = '#7a7a7a'; g.fillRect(x, 0, 4, h); g.fillStyle = '#ffffff'; g.fillRect(x + 4, 0, 3, h); }
});
// the two sign boxes side by side: the АТБ roundel (white ring, red letters, two blue sweeps) and the «24» box
const signTex = () => canvasTex(1024, 512, (g) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#1f50b0'; g.fillRect(22, 22, 468, 468);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(256, 256, 196, 0, 7); g.fill();
  g.strokeStyle = '#1f50b0'; g.lineWidth = 34; g.lineCap = 'round';
  g.beginPath(); g.arc(256, 256, 150, Math.PI * 0.95, Math.PI * 1.62); g.stroke();
  g.beginPath(); g.arc(256, 256, 150, Math.PI * 1.95, Math.PI * 2.62); g.stroke();
  g.fillStyle = '#e3202c'; g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.lineJoin = 'round';
  g.font = 'italic bold 132px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeText('АТБ', 256, 262, 300); g.fillText('АТБ', 256, 262, 300);
  // «24»: white box, blue frame, a red-ringed disc with the hours round it
  g.fillStyle = '#1f50b0'; g.fillRect(512, 0, 512, 512);
  g.fillStyle = '#ffffff'; g.fillRect(540, 28, 456, 456);
  g.strokeStyle = '#d9d9d9'; g.lineWidth = 8; g.beginPath(); g.arc(768, 256, 190, 0, 7); g.stroke();
  g.fillStyle = '#1f50b0'; g.font = 'bold 40px Arial, sans-serif';
  g.fillText('ПРАЦЮЄМО', 768, 128, 300); g.fillText('ЦІЛОДОБОВО', 768, 392, 320);
  g.fillStyle = '#e3202c'; g.font = 'bold 190px Arial, sans-serif'; g.fillText('24', 768, 262);
}, { repeat: false, aniso: 16 });

export function buildAtb({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), n0 = S.count;
  const ring = ringPts(bld.p);
  let gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const faces = edgeFaces(ring), front = faces.find((f) => f.nx < -0.9 && f.L > 10);
  const fy = front ? Math.max(...[0.1, 0.5, 0.9].map((t) => { const p = pt(front, front.L * t, 0, 3); return heightAt(p[0], p[2]); })) : gHi;
  const yF = Math.max(gHi, fy) + LIFT, gB = gLo - 0.6, Y = (h) => yF + h;
  const B = { wall: new MB(), panel: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const D = B.det;
  let nWin = 0;
  const sl = (f, d) => (facing(f) > 0 ? d : f.L - d);                   // from the viewer's left end of a face to its s
  const span = (f, a, b) => { const p = sl(f, a), q = sl(f, b); return [Math.min(p, q), Math.max(p, q)]; };
  const box = (Db, f, a, b, y0, y1, o0, o1, sides) => { const [s0, s1] = span(f, a, b); fbox(Db, f, s0, s1, y0, y1, o0, o1, sides); };
  const P = (f, a, y, o) => pt(f, sl(f, a), y, o);
  const solid = (f, a, b, o0, o1, y0, y1, kind = 'wall', flags = 0, k = 0, ya = 0) => {
    const [s0, s1] = span(f, a, b), Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    // k: a sloped top rising k per metre to the viewer's right from ya at a (a stair flight)
    const g = k * (facing(f) > 0 ? 1 : -1), c = k ? ya - g * (sl(f, a) + f.ax * f.ux + f.az * f.uz) : y1;
    S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), y0, c, g * f.ux, g * f.uz, kind, flags);
  };

  for (const f of faces) {
    const holes = [];
    if (f === front) { // left to right: corner wall, window, door bay, door + ATM bay, window behind the stair
      const L = f.L, bay = (a, b, extra) => { const [s0, s1] = span(f, a, b); holes.push({ s0, s1, rev: PIER, glass: '#4f7fd0', lit: true, dep: 0.16, ...extra }); };
      bay(2.3, 6.5, { y0: Y(0.3), y1: Y(FAS0 - 0.15), cols: 3, rows: 2 });
      bay(7.1, 10.9, { y0: Y(0.02), y1: Y(FAS0 - 0.15), cols: 3, rows: 2 });
      bay(11.5, 14.1, { y0: Y(0.02), y1: Y(FAS0 - 0.15), cols: 2, rows: 2 });
      bay(14.7, L - 0.4, { y0: Y(0.3), y1: Y(FAS0 - 0.15), cols: 3, rows: 2 });
    } else if (f.L > 12 && f.nx > 0.7) { // back: a service door and two barred windows
      const m = f.L / 2;
      holes.push({ s0: m - 0.8, s1: m + 0.8, y0: Math.max(gB + 0.1, Y(-0.4)), y1: Y(2.2), cols: 1, rows: 2, rev: CREAM, glass: '#53585c', dep: 0.1 });
      for (const s of [f.L * 0.2, f.L * 0.8]) holes.push({ s0: s - 0.7, s1: s + 0.7, y0: Y(1.4), y1: Y(2.5), cols: 2, rev: CREAM, glass: '#5c666c', sill: PIER });
    }
    B.wall.setColor(CREAM); wall(B.wall, f, gB, Y(ROOF), holes, [2.5, 2.5]);
    for (const q of holes) { win(B, f, q); nWin++; }
    D.setColor('#b8ae98'); // a render plinth, broken by the openings that come down to the floor
    let s = 0;
    for (const q of [...holes.filter((h) => h.y0 < Y(0.35)).sort((a, b) => a.s0 - b.s0), { s0: f.L, s1: f.L }]) {
      if (q.s0 > s + 1e-3) fbox(D, f, s, q.s0, gB, Y(0.3), 0, 0.04, 'ftlr');
      s = Math.max(s, q.s1);
    }
    D.setColor('#d8d0be'); fbox(D, f, -0.04, f.L + 0.04, Y(ROOF - 0.04), Y(ROOF + 0.08), -0.35, 0.06, 'ftu'); // coping
    const p0 = pt(f, 0, 0), p1 = pt(f, f.L, 0); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(ROOF), f.nx, f.nz);
  }
  D.setColor('#7f8285'); D.fill(ring, [], Y(ROOF - 0.3), true); // roof deck

  if (front) {
    const f = front, L = f.L;
    // piers between the bays stand proud of the wall
    B.wall.setColor(PIER);
    for (const [a, b] of [[6.5, 7.1], [10.9, 11.5], [14.1, 14.7]]) box(B.wall, f, a, b, Y(0), Y(FAS0), 0, 0.12, 'flr');
    // the corner wall at the left end: a cream block stepping out, the house number plate on it
    box(B.wall, f, 0, 2.3, gB, Y(FAS1 + 0.3), 0, 0.6, 'flrt');
    D.setColor('#f2f2f0'); box(D, f, 0.6, 1.7, Y(1.9), Y(2.35), 0.6, 0.63, 'f');
    D.setColor('#1d1d1d'); box(D, f, 0.75, 1.55, Y(1.95), Y(2.2), 0.63, 0.635, 'f');
    // the blue band over the front, with its soffit and the two sign boxes
    B.panel.setColor(BLUE);
    { const [s0, s1] = span(f, 2.3, L + 0.05); panel(B.panel, f, s0, s1, Y(FAS0), Y(FAS1), FASD, [1.8, 1.65]); fbox(B.panel, f, s0, s1, Y(FAS0), Y(FAS1), FASD - 0.06, FASD, 'lr'); }
    D.setColor(BLUE); box(D, f, 2.3, L + 0.05, Y(FAS1 - 0.02), Y(FAS1), 0, FASD, 't');
    D.setColor('#e8e6e0'); box(D, f, 2.3, L + 0.05, Y(FAS0), Y(FAS0 + 0.02), 0, FASD, 'u');
    D.setColor(DBLUE); box(D, f, 2.3, L + 0.05, Y(FAS0 - 0.08), Y(FAS0), FASD - 0.08, FASD, 'flru');
    solid(f, 2.3, L, 0, FASD, Y(FAS0), Y(FAS1), 'awning', 1);
    for (const [cell, a, w, y0, y1] of [[LOGO, 8.2, 2.0, FAS0 - 0.15, FAS1 + 0.2], [H24, 2.8, 1.55, FAS0 + 0.1, FAS1 - 0.05]]) {
      D.setColor('#f4f4f4'); box(D, f, a, a + w, Y(y0), Y(y1), FASD, FASD + 0.22, 'flrtu');
      const [s0, s1] = span(f, a, a + w); decal(B.sign, f, s0, s1, Y(y0), Y(y1), FASD + 0.225, cell);
    }
    // the ATM in the door bay, a small green bank plate over it
    D.setColor('#d6d8d6'); box(D, f, 12.9, 13.9, Y(0.02), Y(1.9), -0.14, -0.02, 'flrt');
    D.setColor('#2b2f33'); box(D, f, 13.1, 13.7, Y(1.0), Y(1.5), -0.02, 0, 'f');
    D.setColor('#2f7a3c'); box(D, f, 12.8, 14.0, Y(2.2), Y(2.5), -0.1, 0.0, 'f');
    // steps with yellow nosings the length of the front, the paved landing under the band
    const pg = P(f, L / 2, 0, 3.5), g = Math.min(heightAt(pg[0], pg[2]), Y(-0.15)), n = Math.max(1, Math.ceil((yF - g) / 0.17));
    D.setColor(PAVE); box(D, f, 2.3, L, gB, yF, 0, 1.4, 'ftr');
    for (let k = 1; k <= n; k++) {
      const yt = yF - (yF - g) * k / n, o = 1.4 + 0.33 * k;
      D.setColor(PAVE); box(D, f, 1.6 - 0.2 * k, 15.2 - 0.1 * k, gB, yt, 0, o, 'flrt');
      D.setColor(YEL); box(D, f, 1.6 - 0.2 * k, 15.2 - 0.1 * k, yt - 0.01, yt + 0.005, o - 0.09, o, 't'); box(D, f, 1.6 - 0.2 * k, 15.2 - 0.1 * k, yt - 0.06, yt, o - 0.01, o + 0.005, 'f');
    }
    solid(f, 1.2, L, 0, 1.4 + 0.33 * n, gB, yF, 'step');
    // the ramp rail at the corner end
    D.setColor(BLUE);
    const ra = P(f, -0.2, g + 0.9, 1.6), rb = P(f, 2.2, Y(0.9), 1.6);
    D.tube(ra, rb, 0.03, 5); D.tube(P(f, -0.2, g + 0.5, 1.6), P(f, 2.2, Y(0.5), 1.6), 0.02, 4);
    for (const a of [-0.2, 1.0, 2.2]) { const p = P(f, a, gB, 1.6); D.tube(p, [p[0], (a < 1 ? g : a < 2 ? (g + yF) / 2 : yF) + 0.9, p[2]], 0.03, 4); }

    // ---- the blue stair at the right end: a flight up to the left onto a landing on the cream pier, then back to the right
    // up to the roof (the way into the next building's first floor)
    const yM = Y(2.5), yT = Y(ROOF), oa = FASD + 0.35, ob = oa + 1.1, oc = ob + 0.1, od = oc + 1.1, P0 = L + 1.2, P1 = 14.3;
    B.wall.setColor('#f2efe8'); box(B.wall, f, P1 - 0.4, P1 + 0.6, gB, yM - 0.1, oa, od, 'flrt'); // the pier under the landing
    S.prism((() => { const [s0, s1] = span(f, P1 - 0.4, P1 + 0.6), Q = [[s0, oa], [s1, oa], [s1, od], [s0, od]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }); return (area2(Q) < 0 ? Q.reverse() : Q).flat(); })(), gB, yM, 0, 0, 'wall');
    D.setColor(BLUE);
    const flight = (a, b, ya, yb, o0, o1) => {
      const k = Math.ceil(Math.abs(yb - ya) / 0.18);
      for (let i = 0; i < k; i++) {
        const s0 = a + (b - a) * i / k, s1 = a + (b - a) * (i + 1) / k, y = ya + (yb - ya) * (i + 1) / k;
        D.setColor('#2c3a52'); box(D, f, Math.min(s0, s1), Math.max(s0, s1), y - 0.04, y, o0 + 0.05, o1 - 0.05, 'ftu');
      }
      D.setColor(BLUE);
      for (const o of [o0, o1]) { D.tube(P(f, a, ya - 0.15, o), P(f, b, yb - 0.15, o), 0.06, 4); D.tube(P(f, a, ya + 1.0, o), P(f, b, yb + 1.0, o), 0.03, 4); }
      for (let t = 0.25; t < 1; t += 0.25) for (const o of [o0, o1]) { const p = P(f, a + (b - a) * t, ya + (yb - ya) * t, o); D.tube(p, [p[0], p[1] + 1.0, p[2]], 0.02, 3); }
      solid(f, Math.min(a, b), Math.max(a, b), o0, o1, gB, 0, 'step', 0, (yb - ya) / (b - a), ya);
    };
    flight(P0, P1 + 0.6, g, yM, oc, od);                          // first flight rises to the left
    D.setColor(BLUE); box(D, f, P1 - 0.6, P1 + 0.6, yM - 0.1, yM, oa, od, 'ftlru'); // landing
    D.tube(P(f, P1 - 0.6, yM + 1.0, oa), P(f, P1 - 0.6, yM + 1.0, od), 0.03, 4); D.tube(P(f, P1 - 0.6, yM + 1.0, od), P(f, P1 + 0.6, yM + 1.0, od), 0.03, 4);
    flight(P1 + 0.6, L + 0.3, yM, yT, oa, ob);                     // second flight back to the right, up to the roof
    D.setColor(BLUE); box(D, f, L - 1.0, L + 0.3, yT - 0.1, yT, 0, ob, 'ftlru');   // top landing over the band, onto the roof
    for (const [a, o] of [[P0 - 0.3, od], [P0 - 0.3, oc], [L + 0.2, ob]]) { const p = P(f, a, gB, o); D.tube(p, [p[0], (a > L ? yT : g + 0.2), p[2]], 0.06, 4); }
    solid(f, P1 - 0.6, P1 + 0.6, oa, od, yM - 0.12, yM, 'awning', 1);
    solid(f, L - 1.0, L + 0.3, 0, ob, yT - 0.12, yT, 'awning', 1);
  }

  // ---- roof: air conditioners behind a steel rail by the stair head (the first-floor tenants' terrace)
  {
    const f = faces.find((q) => q.nx > 0.7 && q.L > 12) ?? faces[0], back = front ?? f;
    D.setColor('#e6e7e5');
    for (let i = 0; i < 5; i++) {
      const [x, , z] = P(back, back.L - 1.5 - i * 1.6, 0, -4.5 - (i % 2) * 1.5);
      D.box(x - 0.45, Y(ROOF - 0.3), z - 0.35, x + 0.45, Y(ROOF + 0.55), z + 0.35, 1 | 2 | 4 | 16 | 32);
    }
    D.setColor('#9ba1a6');
    const r0 = back.L - 9, r1 = back.L - 0.3;
    for (const o of [-3.5, -7.5]) D.tube(P(back, r0, Y(ROOF + 1.1), o), P(back, r1, Y(ROOF + 1.1), o), 0.03, 4);
    D.tube(P(back, r0, Y(ROOF + 1.1), -3.5), P(back, r0, Y(ROOF + 1.1), -7.5), 0.03, 4);
    for (let a = r0; a <= r1 + 1e-3; a += (r1 - r0) / 6) for (const o of [-3.5, -7.5]) { const p = P(back, a, Y(ROOF - 0.3), o); D.tube(p, [p[0], Y(ROOF + 1.1), p[2]], 0.025, 3); }
  }

  // ---- collision: the box to the parapet
  S.prism((area2(ring) < 0 ? ring.slice().reverse() : ring).flat(), gB, Y(ROOF), 0, 0, 'wall');

  // ---- meshes
  const sign = signTex();
  const M = mats({
    panel: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.45, metalness: 0.3 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.35 }),
  });
  const out = finish(root, 'atb', B, M, ['wall', 'panel', 'det']);
  console.log(`[cherkasy] ATB: ${nWin} openings, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return {
    footprints: [{ poly: ring, h: Y(ROOF) - gLo, kind: bld.k, name: 'АТБ' }],
    clear: (x, z) => x > x0 - 5 && x < x1 + 1 && z > z0 - 2 && z < z1 + 1,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.8 * k; M.sign.emissiveIntensity = 0.08 + 0.9 * k; },
  };
}
