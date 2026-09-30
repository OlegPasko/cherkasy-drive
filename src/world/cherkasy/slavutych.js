// OWNER: cherkasy. ТЦ «Славутич» (the 1983 Будинок побуту «Славутич»), вул. Небесної Сотні, 105 (OSM way 161603694),
// rebuilt after the two retro.ck.ua photos of the new building, a recent street photo of its ground floor and the
// satellite view. A five-storey L-shaped slab: the long block on Nebesnoi Sotni and a deeper wing reaching back to
// Blahovisna. Every long face is a row of light concrete pilaster fins running from the first floor to the parapet,
// with terracotta panels and one window per bay between them; the short faces and the bay at each end of a face are
// blank light-grey render (the stair cores). On the street the ground floor is a run of white shopfronts under a dark
// fascia band; on the Blahovisna side stands the single-storey glazed vestibule of the old service house. The rooftop
// «Славутич» script of the photos is left out (not seen in recent photos). Windows light up at night.
//   SLAVUTYCH_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildSlavutych({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in an edge frame (shellkit.js); the footprint is axis-aligned in map metres.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng } from './geo.js';
import { ringFaces, edge, at, slab, skin, hole, block, base, fin, gaps } from './shellkit.js';

const OSM_ID = 161603694;
export const SLAVUTYCH_SKIP = new Set([OSM_ID]);

const G0 = 3.9, FH = 3.3, NF = 5, TOP = G0 + (NF - 1) * FH + 0.9, BAY = 3.2, END = 2.4; // storeys, parapet top, bays
const TERRA = '#bb8a74', GREY = '#d2cfc8', FIN = '#dedbd3', FRAME = '#e9e8e3', GL = ['#48545b', '#56616a', '#3b464e', '#6a6f70'];
const VEST = { face: 15, w: 15, d: 4.6, h: 3.7 }; // the vestibule on the Blahovisna face (ring edge index), size

// terracotta facing panels 1.6 x 1.1 m with dark joints (u 3.2 m, v 3.3 m per repeat)
const panelTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#7a5a4d'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
    const k = 0.92 + r() * 0.12;
    g.fillStyle = `rgb(${(236 * k) | 0},${(214 * k) | 0},${(200 * k) | 0})`; g.fillRect(i * w / 2 + 2, j * h / 3 + 2, w / 2 - 4, h / 3 - 4);
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(60,30,20,0.08)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});
const renderTex = (r) => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f0eee9'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(70,65,60,0.08)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
});

export function buildSlavutych({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p), g = base(ring, heightAt), yF = g.hi + 0.15, gB = g.lo - 0.6, Y = (h) => yF + h;
  const B = { terra: new MB(), wall: new MB(), det: new MB(), glass: new MB(), lit: new MB(), roof: new MB() };
  const D = B.det, RND = [2, 2, 0], PAN = [BAY, FH, Y(G0)];
  const faces = ringFaces(ring);
  if (faces.length !== 22 || Math.abs(faces[VEST.face].nx + 1) > 0.01) throw new Error('Slavutych: the footprint is not the one this was built for');
  let nOpen = 0;
  const lvl = (k) => Y(G0 + (k - 1) * FH);
  const win = (f, s0, s1, y0, y1, extra) => { f.cuts.push({ s0, s1, y0, y1, glass: GL[(r() * 4) | 0], frame: r() < 0.8 ? FRAME : '#6b4a32', pitch: 0.8, dark: r() < 0.45, dep: 0.22, ...extra }); nOpen++; };

  for (const f of faces) {
    const street = f.nz < -0.9, long = f.L >= 12, vest = f.k === VEST.face;
    f.bays = [];
    if (long) { // bays between the pilasters, a blank light end strip at each end
      const nb = Math.max(1, Math.round((f.L - 2 * END) / BAY)), p = (f.L - 2 * END) / nb;
      for (let i = 0; i <= nb; i++) f.bays.push(END + i * p);
      for (let i = 0; i < nb; i++) {
        const m = END + (i + 0.5) * p;
        for (let k = 1; k < NF; k++) win(f, m - 0.8, m + 0.8, lvl(k) + 0.85, lvl(k) + 2.4);
        if (street) { f.cuts.push({ s0: m - p / 2 + 0.2, s1: m + p / 2 - 0.2, y0: Y(0.1), y1: Y(G0 - 1.0), glass: '#55656c', frame: FRAME, pitch: 1.0, tr: Y(2.3), door: i % 3 === 1, dark: false, dep: 0.12 }); nOpen++; }
        else if (!(vest && Math.abs(m - f.L / 2) < VEST.w / 2 + 0.5)) win(f, m - 0.8, m + 0.8, Y(1.1), Y(2.9), { grille: true });
      }
    } else if (f.L > 5) for (let k = 1; k < NF; k++) win(f, f.L / 2 - 0.5, f.L / 2 + 0.5, lvl(k) + 0.85 + FH / 2, lvl(k) + 2.1 + FH / 2, { dark: true }); // stair windows on the landings
    // skins: terracotta between the ends above the ground floor, light render elsewhere
    if (long) {
      const e0 = f.bays[0], e1 = f.bays[f.bays.length - 1];
      const mid = { ...f, cuts: f.cuts.concat([{ s0: -1, s1: e0, y0: -1e3, y1: 1e3, cover: true }, { s0: e1, s1: f.L + 1, y0: -1e3, y1: 1e3, cover: true }]) };
      const ends = { ...f, cuts: f.cuts.concat([{ s0: e0, s1: e1, y0: Y(G0), y1: Y(TOP), cover: true }]) };
      skin(B.terra, mid, Y(G0), Y(TOP - 0.9), '#ffffff', PAN);
      skin(B.wall, ends, gB, Y(TOP), GREY, RND);
      B.wall.setColor(GREY); for (const [s0, s1] of gaps(mid, Y(TOP - 0.9), Y(TOP))) slab(B.wall, f, s0, s1, Y(TOP - 0.9), Y(TOP), -0.01, 0, 'f', RND);
    } else skin(B.wall, f, gB, Y(TOP), GREY, RND);
    for (const q of f.cuts) if (!q.cover) hole(B, f, q);
    // grilles on the ground-floor windows off the street
    D.setColor('#6d6f70');
    for (const q of f.cuts) if (q.grille) for (let s = q.s0 + 0.15; s < q.s1; s += 0.16) slab(D, f, s - 0.012, s + 0.012, q.y0, q.y1, -0.06, -0.03, 'flr');
    // pilaster fins from the first floor to the parapet, standing proud
    D.setColor(FIN);
    for (const s of f.bays) slab(D, f, s - 0.28, s + 0.28, Y(G0 - 0.2), Y(TOP + 0.1), 0, 0.32, 'flrt');
    // street: the dark fascia band over the shopfronts; elsewhere a plinth course
    if (street && long) { D.setColor('#2f3133'); slab(D, f, 0.3, f.L - 0.3, Y(G0 - 1.0), Y(G0 - 0.1), 0, 0.9, 'ftulr'); block(S, f, 0.3, f.L - 0.3, -0.05, 0.9, Y(G0 - 1.0), Y(G0 - 0.1), 'awning', 1); }
    D.setColor('#8f8d88'); for (const [s0, s1] of gaps(f, gB, yF, (c) => c.door)) slab(D, f, s0, s1, gB, yF, -0.02, 0.06, 'ft');
    D.setColor('#a8a6a0'); slab(D, f, -0.05, f.L + 0.05, Y(TOP), Y(TOP + 0.1), -0.35, 0.05, 'ftu');
    const p0 = at(f, 0, 0, -0.1), p1 = at(f, f.L, 0, -0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(TOP + 0.1), f.nx, f.nz);
    // steps where the street drops below the shop floor
    if (street && long) { const pm = at(f, f.L / 2, 0, 1.4), hs = heightAt(pm[0], pm[2]); if (yF - hs > 0.12) { D.setColor('#9d9a93'); slab(D, f, 0.3, f.L - 0.3, gB, yF - 0.02, 0.9, 1.7, 'ftlr'); } }
  }

  // ---- the vestibule: a glazed box on the Blahovisna face with a deep flat roof
  const vf = faces[VEST.face], vs0 = vf.L / 2 - VEST.w / 2, vs1 = vf.L / 2 + VEST.w / 2, vy1 = Y(VEST.h);
  const xz = (s, o) => { const p = at(vf, s, 0, o); return [p[0], p[2]]; };
  const vfront = edge(xz(vs0, VEST.d), xz(vs1, VEST.d), vf.nx, vf.nz);
  const vl = edge(xz(vs0, 0), xz(vs0, VEST.d), -vf.ux, -vf.uz), vr = edge(xz(vs1, VEST.d), xz(vs1, 0), vf.ux, vf.uz);
  const door = { s0: vfront.L / 2 - 1.6, s1: vfront.L / 2 + 1.6, y0: Y(0.05), y1: Y(2.4) };
  vfront.cuts.push({ s0: 0.3, s1: vfront.L - 0.3, y0: Y(0.05), y1: vy1 - 0.25, glass: '#5b6b70', frame: '#8b8e8f', pitch: 1.5, tr: Y(2.4), dark: false, dep: 0.1 });
  for (const f of [vl, vr]) f.cuts.push({ s0: 0.4, s1: f.L - 0.3, y0: Y(0.05), y1: vy1 - 0.25, glass: '#5b6b70', frame: '#8b8e8f', pitch: 1.5, tr: Y(2.4), dark: false, dep: 0.1 });
  for (const f of [vfront, vl, vr]) { skin(B.wall, f, gB, vy1, GREY, RND); for (const q of f.cuts) hole(B, f, q); nOpen += f.cuts.length; }
  D.setColor('#6f7274'); // the door leaves drawn over the glazing, a shade proud
  for (let i = 0; i <= 4; i++) { const s = door.s0 + (door.s1 - door.s0) * i / 4; slab(D, vfront, s - 0.04, s + 0.04, door.y0, door.y1, -0.06, 0, 'flr'); }
  slab(D, vfront, door.s0, door.s1, door.y1 - 0.06, door.y1, -0.06, 0, 'fu');
  D.setColor('#cfcdc6'); slab(D, vf, vs0 - 0.6, vs1 + 0.6, vy1, vy1 + 0.55, 0, VEST.d + 0.8, 'ftulr');
  const pv = at(vf, vf.L / 2, 0, VEST.d + 1.5), hv = heightAt(pv[0], pv[2]);
  if (yF - hv > 0.1) { D.setColor('#9d9a93'); slab(D, vf, vs0 + 2, vs1 - 2, gB, yF - 0.02, VEST.d, VEST.d + 1.8, 'ftlr'); }
  block(S, vf, vs0, vs1, -0.1, VEST.d, gB, vy1 + 0.55, 'wall');
  block(S, vf, vs0 - 0.6, vs1 + 0.6, VEST.d, VEST.d + 0.8, vy1, vy1 + 0.55, 'awning', 1);

  // ---- roof: bitumen, lift rooms over the stair cores
  B.roof.setColor('#5e5d5a'); B.roof.fill(ring, [], Y(TOP - 0.5), true);
  D.setColor('#cfccc4');
  for (const [x, z, w, d] of [[-436, 780, 5, 4], [-400, 781, 4.5, 4], [-441, 838, 5, 4]]) {
    D.box(x - w / 2, Y(TOP - 0.5), z - d / 2, x + w / 2, Y(TOP + 2.2), z + d / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], Y(TOP - 0.5), Y(TOP + 2.2), 0, 0, 'equipment');
  }
  S.prism(ring.flat(), gB, Y(TOP + 0.1), 0, 0, 'wall');

  // ---- meshes
  const M = {
    terra: new THREE.MeshStandardMaterial({ map: panelTex(r), vertexColors: true, color: TERRA, roughness: 0.85 }),
    wall: new THREE.MeshStandardMaterial({ map: renderTex(r), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffdcaa, emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
  };
  const st = fin(root, 'slavutych', B, M, ['glass', 'lit', 'roof']);
  console.log(`[cherkasy] Slavutych: ${nOpen} openings, ${(st.tris / 1000).toFixed(1)}k tris, ${st.meshes} meshes, ${(st.verts / 1000).toFixed(1)}k verts, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const bx = ring.reduce((q, p) => [Math.min(q[0], p[0]), Math.min(q[1], p[1]), Math.max(q[2], p[0]), Math.max(q[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  return {
    footprints: [{ poly: ring, h: Y(TOP) - g.lo, kind: bld.k, name: 'Славутич' }],
    clear: (x, z) => x > bx[0] - VEST.d - 3 && x < bx[2] + 2 && z > bx[1] - 3 && z < bx[3] + 2,
    update() { M.lit.emissiveIntensity = 0.85 * nightK.value; },
  };
}
