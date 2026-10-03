// OWNER: cherkasy. The shop annex of вул. Генерала Момота, 1 in Lunacharka (issue #34): АТБ-Маркет, the Прем'єр
// cosmetics shop, the Тачівка bakery and their neighbours in the one-storey strip along the nine-storey block, and the
// car park in front of it. OSM way 1041448576 (building=yes, layer=-1) is the annex; the city extrusion made it a
// second nine-storey slab glued to the block (146190236), with no shop fronts, and the lot in front was a lawn the
// OSM service lane stopped short of.
// References: OSM nodes 2065378865 (АТБ-Маркет, Генерала Момота 1), 2065398887 (Прем'єр), 11293803798 (Тачівка),
// 1041451463 («Еники Бендерики», the kiosk in front), the marketplace «Ринок Луна» (196186010); Esri World Imagery
// (capture date not given) for the layout: the strip is ~11 m deep along the block and ~17 m past its east end, flat
// roofed, with cars parked along its front and down the lane to the south service road. No street-level photo was
// found (Google Street View is not reachable here, Mapillary / KartaView / Panoramax have nothing): the storefronts,
// the fascia colours and the unit widths are guesses; АТБ wears the chain's red lettering (as atb.js / atb26.js),
// the others plain colour fascias without names.
//   LUNASHOPS_SKIP – the replaced OSM annex
//   buildLunaShops({ root, map, solids, zips, heightAt, ground }) -> { footprints, clear(x, z), parked, update() } | null
//     ground (a GROUND_SITES member): the paved apron, the car park and the lane down to the service road are laid in
//     the ground's own material (asphalt, pavers); without it (the phone peek) only the building is made.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, area2, inPoly } from './geo.js';
import { edgeFaces, pt, fbox, wall, win, decal, mats, finish } from './bldkit.js';
import { OVERHANG } from '../collision.js';
import { topMesh, groundMat } from './bridgekit.js';
import { SURF } from './ground.js';

export const LUNASHOPS_SKIP = new Set([1041448576]);
const H = 4.6;               // one tall shop storey over the floor
// the units along the front, u metres from its west end (the block's side): АТБ at its OSM node (u ~60), Прем'єр
// (u ~69) and Тачівка (u ~79) next to it, the rest of the strip in plain shops
const UNITS = [
  { u0: 1.5, u1: 21.5, fascia: '#55626b' },
  { u0: 22, u1: 64, atb: true },
  { u0: 64.5, u1: 73.6, fascia: '#8d3f68' },
  { u0: 74, u1: 81.6, fascia: '#7b5535' },
  { u0: 82.2, u1: 102, fascia: '#3c6c68' },
  { u0: 102.6, u1: 122.6, fascia: '#676b70' },
];
// the paved ground in the front frame (u along the strip, v out into the lot): the apron along the shops, the car
// park in front of the west half (bays along the apron, an aisle that joins the west lane), and the lane down the
// OSM service road to the south service road (bays along its west side)
const APRON = [-11, 103, 0, 3.6];
const LOTS = [[-11, 74, 3.6, 16.5], [62, 74, 16.5, 66]];
const BAY = { w: 2.6, d: 5 };

const signTex = () => canvasTex(1024, 192, (g, w, h) => {
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e3222b'; g.fillRect(0, h - 22, w, 22);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 900 150px Arial';
  g.fillStyle = '#e3222b'; g.fillText('АТБ', w / 2, h / 2 - 8, 640);
}, { repeat: false });

export function buildLunaShops({ root, map, solids: S, zips: Z, heightAt, ground }) {
  const b = map.buildings?.find((q) => LUNASHOPS_SKIP.has(q.id));
  if (!b) return null;
  const ring = ringPts(b.p), faces = edgeFaces(ring), front = faces.reduce((a, f) => (f.L > a.L ? f : a));
  if (front.L < 100) return null;
  // the front frame: u from the west end along the strip, v outward into the lot
  const U = [-front.ux, -front.uz], N = [front.nx, front.nz], O = [front.ax + front.ux * front.L, front.az + front.uz * front.L];
  const at = (u, v) => [O[0] + U[0] * u + N[0] * v, O[1] + U[1] * u + N[1] * v];
  const sOf = (u) => front.L - u;
  let floor = -Infinity, base = Infinity;
  for (let u = 0; u <= front.L; u += 4) floor = Math.max(floor, heightAt(...at(u, 1)));
  for (const [x, z] of ring) base = Math.min(base, heightAt(x, z));
  floor += 0.15; base -= 0.4;
  const top = floor + H, Y = (h) => floor + h;
  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() }, D = B.det;

  for (const f of faces) {
    const holes = [];
    if (f === front) {
      for (const q of UNITS) {
        const s0 = sOf(q.u1) + 0.35, s1 = sOf(q.u0) - 0.35, w = s1 - s0;
        holes.push({ s0, s1, y0: Y(0.02), y1: Y(3.0), cols: Math.max(2, Math.round(w / 1.6)), rows: 1, dep: 0.22, rev: '#3a3e42', glass: '#9fb2b8', lit: true });
      }
    } else if (f.L > 9 && f.nx * N[0] + f.nz * N[1] < -0.5) {
      // the yard side, where it shows past the block: a service door and small high windows
      holes.push({ s0: f.L / 2 - 0.7, s1: f.L / 2 + 0.7, y0: Y(0.01), y1: Y(2.3), cols: 1, rev: '#6e6f6a', glass: '#5d6668' });
      for (let s = 3; s < f.L - 2; s += 7) if (Math.abs(s - f.L / 2) > 2.5) holes.push({ s0: s - 0.9, s1: s + 0.9, y0: Y(2.2), y1: Y(3.1), cols: 2, rev: '#8b8a84', glass: '#6f7a7e' });
    }
    B.wall.setColor('#e4ddcf'); wall(B.wall, f, Y(0), top, holes, [2.5, 2.5]);
    D.setColor('#6d6b66'); wall(D, f, base, Y(0), []);
    for (const q of holes) win(B, f, q);
    D.setColor('#bdb7aa'); fbox(D, f, -0.05, f.L + 0.05, top, top + 0.5, -0.25, 0.04, 'fbt'); // parapet
    const a = pt(f, 0, 0), e = pt(f, f.L, 0); Z?.edge?.(a[0], a[2], e[0], e[2], top + 0.5, f.nx, f.nz);
  }
  D.setColor('#8e9196'); D.fill(ring, [], top - 0.05, true);
  for (let u = 12; u < front.L - 8; u += 23) { const [x, z] = at(u, -6); D.setColor('#a9adb0'); D.box(x - 0.8, top, z - 0.6, x + 0.8, top + 1.1, z + 0.6); }

  // the shop fronts: fascias over the glazing, the АТБ sign, a continuous canopy on slim posts
  const f = front;
  for (const q of UNITS) {
    const s0 = sOf(q.u1), s1 = sOf(q.u0);
    D.setColor(q.atb ? '#f2f0ec' : q.fascia); fbox(D, f, s0 + 0.05, s1 - 0.05, Y(3.35), Y(q.atb ? 5.0 : 4.45), 0, 0.32, 'flrtu');
    if (q.atb) {
      const m = (s0 + s1) / 2;
      decal(B.sign, f, m - 3.95, m + 3.95, Y(3.48), Y(4.96), 0.34, [0, 0, 1, 1]); // the texture's 1024 x 192 aspect
      D.setColor('#e3222b'); fbox(D, f, s0 + 0.05, s1 - 0.05, Y(3.3), Y(3.38), 0, 0.33, 'flrtu');
    }
    D.setColor('#2f3236'); fbox(D, f, s0 - 0.06, s0 + 0.06, Y(0), Y(3.35), 0, 0.1, 'flr'); // the pier between units
  }
  D.setColor('#4a4e53'); fbox(D, f, 0, f.L, Y(3.08), Y(3.24), 0, 2.2, 'flrtu');
  {
    const p = [[0, 0], [f.L, 0], [f.L, 2.2], [0, 2.2]].map(([s, o]) => { const q = pt(f, s, 0, o); return [q[0], q[2]]; });
    S.prism((area2(p) < 0 ? p.reverse() : p).flat(), Y(3.08), Y(3.24), 0, 0, 'awning', OVERHANG);
  }
  D.setColor('#55595e');
  for (let s = 3; s < f.L - 1; s += 6.2) {
    const [x, , z] = pt(f, s, 0, 2.0); D.cyl(x, floor - 0.1, z, 0.07, 0.07, 3.2, 6);
    S.cyl(x, z, floor - 0.1, Y(3.1), 0.07, 0.07, 'pole');
  }
  const solid = area2(ring) < 0 ? ring.slice().reverse() : ring;
  S.prism(solid.flat(), base, top + 0.5, 0, 0, 'wall');

  // the paved ground and the bays, in the ground's own material
  const T = topMesh(), paint = new MB(), parked = [];
  const drape = ([u0, u1, v0, v1], surf, lift) => {
    const nu = Math.ceil((u1 - u0) / 2), nv = Math.ceil((v1 - v0) / 2);
    const P = (i, j) => { const u = u0 + (u1 - u0) * i / nu, v = v0 + (v1 - v0) * j / nv, [x, z] = at(u, v); return [x, heightAt(x, z) + lift, z]; };
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) T.quad([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], [0, 1, 0], surf);
  };
  const stripe = (u0, v0, u1, v1, w = 0.12) => { // a painted line from (u0, v0) to (u1, v1), lifted over the asphalt
    const L = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / L, dv = (v1 - v0) / L, n = Math.ceil(L / 2);
    for (let k = 0; k < n; k++) {
      const c = [k / n, (k + 1) / n].flatMap((t) => [[u0 + (u1 - u0) * t - dv * w / 2, v0 + (v1 - v0) * t + du * w / 2], [u0 + (u1 - u0) * t + dv * w / 2, v0 + (v1 - v0) * t - du * w / 2]]);
      const q = [c[0], c[2], c[3], c[1]].map(([u, v]) => { const [x, z] = at(u, v); return [x, heightAt(x, z) + 0.235, z]; });
      const id = q.map((p) => paint.vert(p[0], p[1], p[2], 0, 1, 0));
      paint.quad(id[0], id[1], id[2], id[3]);
    }
  };
  const car = (u, v, du, dv) => { const [x, z] = at(u, v), dx = U[0] * du + N[0] * dv, dz = U[1] * du + N[1] * dv; parked.push([x, z, -Math.atan2(dz, dx)]); };
  if (groundMat(ground)) {
    drape(APRON, SURF.PAVERS, 0.235); // over the ground's land (+0.15), cover and walk (+0.19) layers
    for (const r of LOTS) drape(r, SURF.ASPHALT, 0.215);
    paint.setColor('#e9e7df');
    // bays nose-in along the apron, west of the АТБ doors (the stretch before them stays a drop-off)
    const nA = Math.floor((54 - 2) / BAY.w);
    for (let i = 0; i <= nA; i++) stripe(2 + i * BAY.w, APRON[3] + 0.1, 2 + i * BAY.w, APRON[3] + BAY.d);
    for (let i = 0; i < nA; i++) if ((i * 7 + 3) % 5 < 2) car(2 + (i + 0.5) * BAY.w, APRON[3] + BAY.d / 2, 0, -1);
    // bays along the lane's west side, noses to the trees
    const [l0, l1, w0, w1] = LOTS[1], nB = Math.floor((w1 - 2 - (w0 + 1)) / BAY.w);
    for (let i = 0; i <= nB; i++) stripe(l0, w0 + 1 + i * BAY.w, l0 + BAY.d, w0 + 1 + i * BAY.w);
    for (let i = 0; i < nB; i++) if ((i * 3 + 1) % 5 < 2) car(l0 + BAY.d / 2, w0 + 1 + (i + 0.5) * BAY.w, -1, 0);
    // a zebra from the lane's bays across the aisle to the shops
    for (let k = 0; k < 6; k++) { const u = 56 + k * 0.9; stripe(u, APRON[3] + 0.2, u, APRON[3] + 5.6, 0.45); }
    void l1;
  }
  const lotMesh = T.mesh(groundMat(ground), 'lunashops-lot');
  const sign = signTex(), M = mats({
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.45 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
  });
  B.paint = paint;
  const st = finish(root, 'lunashops', B, M, ['wall', 'det']);
  if (lotMesh) st.group.add(lotMesh);
  console.log(`[cherkasy] Lunacharka shops (Momota 1): ${st.verts} verts, ${st.meshes} meshes, ${parked.length} parked`);

  const inUV = (x, z, [u0, u1, v0, v1]) => {
    const dx = x - O[0], dz = z - O[1], u = dx * U[0] + dz * U[1], v = dx * N[0] + dz * N[1];
    return u >= u0 - 1 && u <= u1 + 1 && v >= v0 - 1 && v <= v1 + 1;
  };
  return {
    footprints: [{ poly: ring, h: top + 0.5 - base, kind: 'retail', name: 'АТБ' }],
    clear: (x, z) => inPoly(ring, x, z) || inUV(x, z, APRON) || LOTS.some((r) => inUV(x, z, r)),
    parked,
    update() { M.lit.emissiveIntensity = 0.75 * nightK.value; M.sign.emissiveIntensity = 0.1 + 0.85 * nightK.value; },
  };
}
