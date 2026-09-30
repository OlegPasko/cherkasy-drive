// OWNER: cherkasy. Палац спорту «Спартак», вул. Остафія Дашковича, 23 (OSM way 156926550), rebuilt from the ~1979
// retro.ck.ua photo of its street front and the satellite view (no recent street photo was found, so the finishes
// are the Soviet original, kept plain). A two-storey-high modernist box on Dashkovycha: the ground floor glazed and set
// back under a long, deep cantilever canopy with the «СПАРТАК» letters on its fascia; above it a row of tall narrow
// windows between flat piers. At the south-west end a taller blank block steps forward, its street face carrying the
// athletes sgraffito (a framed low-relief panel); a low service annex with a brown roof sits behind the hall. Windows light up at night.
//   SPARTAK_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildSpartak({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// The footprint is axis-aligned in map metres, so the three volumes are map rectangles; walls are laid per face in an
// edge frame (shellkit.js).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal } from './sculpt.js';
import { ringPts, rng } from './geo.js';
import { edge, at, plate, slab, skin, hole, block, base, fin, quad, gaps } from './shellkit.js';

const xz = (p) => [p[0], p[2]];

const OSM_ID = 156926550;
export const SPARTAK_SKIP = new Set([OSM_ID]);

// volumes [x0, z0, x1, z1] (street = -z side) and wall tops over the floor
const TOWER = [54.8, 219.9, 67.3, 242.1], HALL = [67.3, 223.2, 97.9, 242.0], ANNEX = [65.9, 242.0, 91.2, 251.0];
const H_T = 12.6, H_H = 10.2, H_A = 4.6, CAN = 4.1, CAN_D = 3.2; // tower, hall, annex tops; canopy underside, depth
const RENDER = '#e2ddd2', PIER = '#ecE8df', PLINTH = '#8b8a85', GLASS = '#3e4a52', FRAME = '#5a5e60';

// cream render with a faint aggregate speckle, 2 m per repeat
const renderTex = (r) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(80,70,60,0.07)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
// atlas 1024 x 1280: the top 256 px the fascia letters (transparent round them, cut by alphaTest), below them the
// square sgraffito panel in the manner of the 1970s sports reliefs: two athletes (a runner and a javelin thrower)
// as solid terracotta silhouettes cut through a warm plaster skin, each with a dark undercut and a
// light edge so they read as low relief, over an ochre sun disc and layered ground bands, inside a scored border
const ART_V = 1024 / 1280; // v of the line between the panel (below) and the letters (above)
const artTex = () => canvasTex(1024, 1280, (g) => {
  g.clearRect(0, 0, 1024, 256);
  g.font = 'bold 190px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1f3f7a'; g.fillText('СПАРТАК', 512, 132, 980);
  const r = rng(1979);
  g.save(); g.translate(0, 256);
  g.fillStyle = '#cfc4b0'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,250,240,0.18)' : 'rgba(90,70,50,0.08)'; g.fillRect(r() * 1024, r() * 1024, 2 + r() * 3, 2 + r() * 3); }
  // sun disc with rays, ground layers
  g.fillStyle = '#bfa073'; g.beginPath(); g.arc(560, 330, 250, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#bfa073'; g.lineWidth = 10;
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; g.beginPath(); g.moveTo(560 + Math.cos(a) * 270, 330 + Math.sin(a) * 270); g.lineTo(560 + Math.cos(a) * 330, 330 + Math.sin(a) * 330); g.stroke(); }
  for (const [y, h, c] of [[800, 60, '#b9ab93'], [860, 42, '#8f7a64'], [902, 70, '#b9ab93']]) { g.fillStyle = c; g.fillRect(70, y, 884, h); }
  g.strokeStyle = 'rgba(60,40,30,0.35)'; g.lineWidth = 3;
  for (let x = 90; x < 950; x += 26) { g.beginPath(); g.moveTo(x, 905); g.lineTo(x + 30, 968); g.stroke(); } // scored hatching
  // a figure is a skeleton of named joints; limbs are tapered bands with rounded ends, the torso a polygon from the
  // shoulders to the hips; it is drawn three times (undercut, body, lit edge) so it reads as low relief
  const band = (a, b, w0, w1) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    g.beginPath(); g.moveTo(a[0] + nx * w0 / 2, a[1] + ny * w0 / 2); g.lineTo(b[0] + nx * w1 / 2, b[1] + ny * w1 / 2);
    g.lineTo(b[0] - nx * w1 / 2, b[1] - ny * w1 / 2); g.lineTo(a[0] - nx * w0 / 2, a[1] - ny * w0 / 2); g.fill();
    for (const [p, w] of [[a, w0], [b, w1]]) { g.beginPath(); g.arc(p[0], p[1], w / 2, 0, Math.PI * 2); g.fill(); }
  };
  const body = (J, col, dx, dy, k) => {
    const o = (p) => [p[0] + dx, p[1] + dy];
    g.fillStyle = col;
    g.beginPath(); [J.sl, J.sr, J.hr, J.hl].map(o).forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.fill();
    if (k === 1) { band(o(J.nk), o(J.hd), 30, 30); g.beginPath(); g.ellipse(...o(J.hd), 32, 38, J.tilt || 0, 0, Math.PI * 2); g.fill(); } // no lit edge on the head
    for (const [s, e, h] of [['sl', 'el', 'hl2'], ['sr', 'er', 'hr2']]) { band(o(J[s]), o(J[e]), 36 * k, 26 * k); band(o(J[e]), o(J[h]), 26 * k, 17 * k); }
    for (const [h, kn, f] of [['hl', 'kl', 'fl'], ['hr', 'kr', 'fr']]) { band(o(J[h]), o(J[kn]), 56 * k, 36 * k); band(o(J[kn]), o(J[f]), 36 * k, 20 * k); }
  };
  const relief = (J) => { body(J, '#4f2e24', 8, 8, 1); body(J, '#8e5a45', 0, 0, 1); body(J, '#b88a70', -5, -5, 0.28); };
  // runner in full stride, leaning into it
  relief({ hd: [362, 208], nk: [350, 255], sl: [300, 280], sr: [398, 288], hl: [298, 478], hr: [352, 478], tilt: 0.3,
    el: [248, 372], hl2: [214, 452], er: [438, 368], hr2: [494, 312], kl: [242, 606], fl: [134, 648], kr: [458, 548], fr: [436, 700] });
  // javelin thrower drawn back for the throw
  g.strokeStyle = '#4f2e24'; g.lineWidth = 9; g.beginPath(); g.moveTo(975, 108); g.lineTo(560, 430); g.stroke();
  relief({ hd: [702, 226], nk: [700, 270], sl: [648, 292], sr: [752, 290], hl: [664, 486], hr: [726, 486], tilt: -0.15,
    el: [592, 336], hl2: [540, 300], er: [818, 236], hr2: [866, 184], kl: [616, 628], fl: [584, 792], kr: [770, 626], fr: [812, 792] });
  g.strokeStyle = '#b88a70'; g.lineWidth = 3; g.beginPath(); g.moveTo(970, 106); g.lineTo(565, 424); g.stroke();
  // scored double border
  g.strokeStyle = '#6b4a3a'; g.lineWidth = 16; g.strokeRect(22, 22, 980, 980);
  g.strokeStyle = 'rgba(107,74,58,0.7)'; g.lineWidth = 5; g.strokeRect(52, 52, 920, 920);
  g.restore();
}, { repeat: false, aniso: 16 });

export function buildSpartak({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), g = base(ring, heightAt), yF = g.hi + 0.12, gB = g.lo - 0.6, Y = (h) => yF + h;
  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB(), art: new MB(), roof: new MB() };
  const D = B.det, RND = [2, 2, 0];

  // the four faces of a map rectangle, s running left to right as seen from outside
  const box4 = ([x0, z0, x1, z1]) => ({
    n: edge([x1, z0], [x0, z0], 0, -1), s: edge([x0, z1], [x1, z1], 0, 1), w: edge([x0, z0], [x0, z1], -1, 0), e: edge([x1, z1], [x1, z0], 1, 0),
  });
  const T = box4(TOWER), H = box4(HALL), A = box4(ANNEX);
  let nOpen = 0;
  const win = (f, s0, s1, y0, y1, extra) => { f.cuts.push({ s0, s1, y0, y1, glass: GLASS, frame: FRAME, pitch: 1.2, dark: r() < 0.35, sill: true, ...extra }); nOpen++; };

  // ---- hall street front: recessed glazing under the canopy, 13 tall windows between piers above it
  const hf = H.n, lf = hf.L; // s = 0 at the north-east end
  const bays = 13, bw = (lf - 1.2) / bays;
  for (let i = 0; i < bays; i++) { const m = 0.6 + (i + 0.5) * bw; win(hf, m - 0.55, m + 0.55, Y(CAN + 1.3), Y(H_H - 0.9), { tr: Y(CAN + 3.4), pitch: 2 }); }
  hf.cuts.push({ s0: 0.4, s1: lf - 0.2, y0: gB - 1, y1: Y(CAN), recess: true }); // the ground floor is set back 1.6 m
  // hall north-east side: a stair window stack and a door, the rest blank; the yard side: a band of high windows
  win(H.e, 3, 4.2, Y(CAN + 1.3), Y(H_H - 0.9), { tr: Y(CAN + 3.4) });
  win(H.e, 9, 10.2, Y(CAN + 1.3), Y(H_H - 0.9), { tr: Y(CAN + 3.4) });
  win(H.e, 13.5, 15.2, Y(0), Y(2.4), { door: true, pitch: 0.85, sill: false, dark: false });
  for (let s = 1; s + 2.2 < H.s.L; s += 4.2) win(H.s, s, s + 2.2, Y(H_A + 1.6), Y(H_H - 1.2)); // high, over the annex roof
  // tower: a tall glazed slot next to the hall, the rest of the street face blank (the sgraffito); a slot on its back
  win(T.n, 0.9, 2.7, Y(CAN + 0.6), Y(H_T - 1.6), { tr: Y(CAN + 4.2), pitch: 0.9, dark: true });
  win(T.s, 4, 5.2, Y(2), Y(H_T - 1.5), { tr: Y(6.5) });
  // annex: small service windows and a back door
  for (let s = 2; s + 1.4 < A.s.L - 1; s += 3.6) win(A.s, s, s + 1.4, Y(1.1), Y(2.6));
  win(A.e, 3, 4.1, Y(0), Y(2.2), { door: true, pitch: 1, sill: false });

  // ---- skins, plinths, copings; `cover` cuts are where a neighbouring volume hides the wall
  T.e.cuts.push({ s0: 0, s1: T.e.L - (HALL[1] - TOWER[1]), y0: gB - 1, y1: Y(H_H), cover: true });
  H.s.cuts.push({ s0: 0, s1: ANNEX[2] - HALL[0], y0: gB - 1, y1: Y(H_A), cover: true });
  const faces = [[T, H_T, ['n', 's', 'w', 'e']], [H, H_H, ['n', 's', 'e']], [A, H_A, ['s', 'w', 'e']]];
  for (const [F, top, keys] of faces) for (const k of keys) {
    const f = F[k];
    skin(B.wall, f, gB, Y(top), RENDER, RND);
    for (const q of f.cuts) if (!q.recess && !q.cover) hole(B, f, q);
    D.setColor(PLINTH);
    for (const [a, b] of gaps(f, gB, yF, (c) => c.cover || c.recess || c.door)) slab(D, f, a, b, gB, yF + 0.05, -0.02, 0.05, 'ft');
    D.setColor('#b9b6ae'); slab(D, f, -0.05, f.L + 0.05, Y(top), Y(top + 0.12), -0.35, 0.06, 'ftu');
    const p0 = at(f, 0, 0, -0.1), p1 = at(f, f.L, 0, -0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(top + 0.12), f.nx, f.nz);
  }
  // piers between the tall windows (they stand proud of the render)
  D.setColor(PIER);
  for (let i = 0; i <= bays; i++) { const m = 0.6 + i * bw; slab(D, hf, m - 0.4, m + 0.4, Y(CAN + 0.9), Y(H_H - 0.2), 0, 0.14, 'flrt'); }
  // the recessed ground floor: back wall of shop glazing and doors, soffit, a pier line at the front
  const REC = 1.6;
  const rf = edge(xz(at(hf, 0.4, 0, -REC)), xz(at(hf, lf - 0.2, 0, -REC)), hf.nx, hf.nz);
  for (let s = 0.3; s + 2.6 < rf.L; s += 3.0) { const door = Math.abs(s + 1.3 - rf.L / 2) < 2.2; rf.cuts.push({ s0: s, s1: s + 2.6, y0: Y(door ? 0 : 0.5), y1: Y(CAN - 0.5), glass: '#4a5a60', frame: FRAME, pitch: door ? 0.9 : 1.3, tr: Y(2.6), door, dep: 0.1 }); nOpen++; }
  skin(B.wall, rf, gB, Y(CAN), RENDER, RND); for (const q of rf.cuts) hole(B, rf, q);
  D.setColor('#d7d4cc'); plate(D, hf, 0.4, lf - 0.2, Y(CAN), Y(CAN), -REC, [0, -1, 0]);
  for (const [s, dir] of [[0.4, 1], [lf - 0.2, -1]]) { const e = edge(xz(at(hf, s, 0, -REC)), xz(at(hf, s, 0)), hf.ux * dir, hf.uz * dir); skin(B.wall, e, gB, Y(CAN), RENDER, RND); }
  D.setColor('#c0bdb5'); slab(D, hf, 0.4, lf - 0.2, gB, Y(0), -REC, 0, 't'); // the floor of the arcade
  // canopy: a deep slab from the tower to the far end, fascia with the letters, downlights
  const c0 = -0.1, c1 = lf + 0.3;
  D.setColor('#d9d6ce'); slab(D, hf, c0, c1, Y(CAN), Y(CAN + 0.85), 0, CAN_D, 'ftur');
  D.setColor('#b5b2aa'); slab(D, hf, c0, c1, Y(CAN + 0.85), Y(CAN + 0.95), 0, CAN_D + 0.05, 'ft');
  block(S, hf, c0, c1, -0.05, CAN_D, Y(CAN), Y(CAN + 0.95), 'awning', 1);
  B.lit.setColor('#fff2d8');
  for (let s = 1.5; s < lf - 0.5; s += 3) quad(B.lit, at(hf, s - 0.25, Y(CAN) - 0.02, 1.4), at(hf, s + 0.25, Y(CAN) - 0.02, 1.4), at(hf, s + 0.25, Y(CAN) - 0.02, 1.9), at(hf, s - 0.25, Y(CAN) - 0.02, 1.9), [0, -1, 0]);
  const lw = 15, lm = lf * 0.55; // letters centred a little towards the tower, as in the photo
  const lt = [at(hf, lm - lw / 2, Y(CAN + 0.05), CAN_D + 0.02), at(hf, lm + lw / 2, Y(CAN + 0.05), CAN_D + 0.02), at(hf, lm + lw / 2, Y(CAN + 0.8), CAN_D + 0.02), at(hf, lm - lw / 2, Y(CAN + 0.8), CAN_D + 0.02)];
  const flip = hf.ux * hf.nz - hf.uz * hf.nx < 0, [ua, ub] = flip ? [1, 0] : [0, 1];
  quad(B.art, ...lt, [hf.nx, 0, hf.nz], [[ua, ART_V], [ub, ART_V], [ub, 1], [ua, 1]]);
  // sgraffito on the tower's street face, over the lower two thirds
  const tf = T.n, fl = tf.ux * tf.nz - tf.uz * tf.nx < 0, [pa, pb] = fl ? [1, 0] : [0, 1];
  const m0 = 3.6, m1 = tf.L - 1.0, my0 = Y(1.9), my1 = my0 + (m1 - m0); // a square panel
  quad(B.art, at(tf, m0, my0, 0.06), at(tf, m1, my0, 0.06), at(tf, m1, my1, 0.06), at(tf, m0, my1, 0.06), [tf.nx, 0, tf.nz],
    [[pa, 0], [pb, 0], [pb, ART_V], [pa, ART_V]]);
  D.setColor('#cbbfa9'); // the raised stone frame round it
  slab(D, tf, m0 - 0.3, m1 + 0.3, my0 - 0.3, my0, 0, 0.14, 'ftulr'); slab(D, tf, m0 - 0.3, m1 + 0.3, my1, my1 + 0.3, 0, 0.14, 'ftulr');
  slab(D, tf, m0 - 0.3, m0, my0, my1, 0, 0.14, 'flr'); slab(D, tf, m1, m1 + 0.3, my0, my1, 0, 0.14, 'flr');
  // steps up to the arcade along the street
  const ps = at(hf, lf / 2, 0, CAN_D * 0.5), yS = heightAt(ps[0], ps[2]);
  if (yF - yS > 0.1) { D.setColor('#9d9a93'); for (let i = 1, n = Math.ceil((yF - yS) / 0.16); i < n; i++) slab(D, hf, 0.4, lf - 0.2, gB, yS + (yF - yS) * i / n, 0, 0.32 * (n - i), 'ft'); }

  // ---- roofs: grey hall and tower, brown annex; a few vents
  const flat = (R, y, col, M = B.roof) => { M.setColor(col); M.fill([[R[0], R[1]], [R[2], R[1]], [R[2], R[3]], [R[0], R[3]]], [], y, true); };
  flat(TOWER, Y(H_T), '#8d8f8e'); flat(HALL, Y(H_H), '#9b9d9b'); flat(ANNEX, Y(H_A), '#6b4a3a');
  for (const [x, z] of [[76, 232], [86, 236], [92, 228]]) { D.setColor('#c9c9c4'); D.box(x - 0.6, Y(H_H), z - 0.6, x + 0.6, Y(H_H + 1), z + 0.6, 1 | 2 | 4 | 16 | 32); }

  // ---- collision: the three volumes
  const box = (R, y0, y1) => S.prism([R[0], R[1], R[2], R[1], R[2], R[3], R[0], R[3]], y0, y1, 0, 0, 'wall');
  box(TOWER, gB, Y(H_T)); box(ANNEX, gB, Y(H_A));
  box([HALL[0], HALL[1] + REC, HALL[2], HALL[3]], gB, Y(CAN)); box(HALL, Y(CAN), Y(H_H)); // the arcade stays open under the canopy

  // ---- meshes
  const art = artTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: renderTex(r), vertexColors: true, roughness: 0.92 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    art: decal(new THREE.MeshStandardMaterial({ map: art, alphaTest: 0.4, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 })),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
  };
  const st = fin(root, 'spartak', B, M, ['glass', 'lit', 'art', 'roof']);
  console.log(`[cherkasy] Spartak: ${nOpen} openings, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(st.verts / 1000).toFixed(1)}k verts, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ring, h: Y(H_T) - g.lo, kind: bld.k, name: 'Спартак' }],
    clear: (x, z) => x > TOWER[0] - 2 && x < HALL[2] + 2 && z > TOWER[1] - CAN_D - 1 && z < ANNEX[3] + 2,
    update() { M.lit.emissiveIntensity = 0.9 * nightK.value; },
  };
}
