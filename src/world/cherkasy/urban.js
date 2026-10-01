// OWNER: cherkasy. Partner: URBAN (street food, «wraps & bowls»), вул. Надпільна, 252/1А – a new one-storey brick row
// of shops (not in OSM yet) standing alone in the car park between the NE face of the Delikat / Rest Inn block (OSM way
// 129420363, by its Delikat end) and Nadpilna, placed from Oleg's satellite view: 23 x 10.2 m, its long axis square to
// the street, one short end by the Nadpilna pavement, the other a few metres short of the block's «СУПЕРМАРКЕТ» portal
// (restinn.js).
// The shop front looks north-west over the Delikat car park: URBAN at the Nadpilna end, then «МАРКЕТ ВОДИ», then an
// unsigned unit; the back (blank brick) faces the Rest Inn. Built from the owner's photos: red brick laid in bands with
// darker courses, a dark anthracite parapet cap, big dark-framed shop windows; over URBAN the white brush «URBAN» letters
// (public/assets/brand/urban.svg) above two royal blue awnings whose valances carry the logo, a glass door between them,
// orange / blue «URBAN wraps bowls drinks» films on the glass, blue barrel bins out front and a small «URBAN» lightbox
// blade on the corner toward Nadpilna; «МАРКЕТ ВОДИ» gets its own sign. A proof of concept for Oleg (not real): a steel
// stair along the blank back wall up to a summer terrace on the flat roof – a railing round the edge, thujas in planters,
// tables with chairs under blue and white umbrellas. Windows, signs and the logo light at dusk and brighten as the car
// comes near, like tors.js.
//   URBAN_SKIP: the OSM ids replaced here (none: buildings.js has nothing to skip)
//   levelUrban(hf): levels the lot under it (city.js calls it before the ground is built); returns the level
//   buildUrban({ root, solids, heightAt }) -> { update(dt), footprints, partners: { urban } } | null
//     urban: { door: { x, y, z, nx, nz } (the pavement in front of the door; nx / nz: outward), glow(0..1) (light-up) }
// Built in a local frame (SITE below): the front looks local +x, s runs to the right of a viewer facing a wall.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { logoTexture } from '../../kit/logo.js';
import { canvasTex } from './sculpt.js';
import { pt, quad, fbox, wall, decal, finish } from './bldkit.js';

export const URBAN_SKIP = new Set(); // the building is new: OSM has no footprint here yet

// where it stands: the corner where the shop front meets the Nadpilna end, on the map, and the yaw of the local frame
// (three's rotation.y; at 0 the front would look +x on the map). Everything below is built in that local frame, so
// moving the building is this one line. Here the front looks -z (north-west, over the Delikat car park), the long
// side runs back from Nadpilna (map +x) toward the block's NE face, and the blank back looks +z at the Rest Inn.
// places.js URBAN_RING repeats the footprint for the maps.
const SITE = { x: -728.5, z: 1369.5, yaw: Math.PI / 2 };
const X0 = 0, X1 = -10.2, ZN = -23, ZS = 0;  // local front, back, and the far (SW) and Nadpilna (NE) ends
const STAIR = 2.5;                          // where the flight starts on the back wall, from its SW end
const H = 5.3, CAP = 0.15, DECK = 4.9;  // parapet top, its cap, the roof deck (over the floor)
const WIN = [0.35, 3.25];               // shop glazing, bottom / top over the floor
const BLUE = '#1b2496', DARK = '#26282c', STEEL = '#3a3d42';
// the front from the Nadpilna end (s, to the right of a viewer facing it): [s0, s1, kind]; URBAN holds the first ten metres
const BAYS = [[0.6, 3.6, 'u'], [4.15, 5.85, 'ud'], [6.4, 9.4, 'u'], [10.4, 13.0, 'm'], [13.4, 15.0, 'md'], [15.4, 17.8, 'm'],
  [18.8, 20.4, 'md'], [20.8, 22.4, 'm']]; // the third, unsigned unit at the far end
const AWN = [[0.4, 3.8], [6.2, 9.6]]; // the two awnings over URBAN's windows

const face = (ax, az, ux, uz, nx, nz, L) => ({ ax, az, ux, uz, nx, nz, L });
const brickTex = () => canvasTex(256, 320, (g, w, h) => { // 1 x 1.25 m: 16 courses, four dark ones then twelve red
  g.fillStyle = '#5d4a44'; g.fillRect(0, 0, w, h);
  let seed = 7; const r = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const dark = ['#3a302f', '#463735', '#2f2b2c', '#4f3c37'], red = ['#9a3e2b', '#ad4d36', '#8b3526', '#a5462f', '#b85a40'];
  for (let k = 0; k < 16; k++) for (let i = -1; i < 5; i++) {
    const pal = k < 4 ? dark : r() < 0.08 ? dark : red, x = i * 64 + (k % 2) * 32;
    g.fillStyle = pal[(r() * pal.length) | 0]; g.fillRect(x + 1.5, k * 20 + 1.5, 61, 17);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 1.5, k * 20 + 15, 61, 3.5);
  }
});
// the atlas: [0, 0.5) x [0, 0.5) the URBAN glazing (lit interior + the striped film), [0.5, 1) x [0, 0.5) the water
// shop's glazing, [0, 1) x [0.5, 0.62) the «МАРКЕТ ВОДИ» lettering (transparent round it)
function atlasTex() {
  return canvasTex(1024, 1024, (g) => {
    const shop = (x0, film) => {
      const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#d9c29b'); gr.addColorStop(0.45, '#8c7460'); gr.addColorStop(1, '#3c3330');
      g.fillStyle = gr; g.fillRect(x0, 0, 512, 512);
      g.fillStyle = 'rgba(255,248,225,0.9)'; for (let i = 0; i < 4; i++) g.fillRect(x0 + 40 + i * 120, 18, 70, 8); // ceiling lights
      g.fillStyle = film ? '#2c2f36' : '#2a4a5a'; g.fillRect(x0 + 30, 300, 452, 150); // counter / shelving
      g.fillStyle = film ? '#c9a274' : '#7fc4d8'; for (let i = 0; i < 9; i++) g.fillRect(x0 + 40 + i * 50, film ? 280 : 250, 30, film ? 20 : 48);
      g.fillStyle = 'rgba(150,180,200,0.18)'; g.beginPath(); g.moveTo(x0 + 340, 0); g.lineTo(x0 + 470, 0); g.lineTo(x0 + 250, 512); g.lineTo(x0 + 120, 512); g.fill(); // a sky glint
      if (!film) return;
      g.save(); g.beginPath(); g.rect(x0, 0, 512, 512); g.clip();
      for (const [y, c] of [[318, '#f26b2a'], [364, BLUE]]) { // two slanted stripes with the words, at hip height
        g.fillStyle = c; g.beginPath(); g.moveTo(x0, y + 16); g.lineTo(x0 + 512, y - 8); g.lineTo(x0 + 512, y + 34); g.lineTo(x0, y + 58); g.fill();
        g.fillStyle = '#ffffff'; g.font = 'italic bold 30px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle';
        g.save(); g.translate(x0, y + 37); g.rotate(-0.047); g.fillText('URBAN   wraps   bowls   drinks   URBAN', 14, 0); g.restore();
      }
      g.restore();
    };
    shop(0, true); shop(512, false);
    g.clearRect(0, 512, 1024, 123);
    g.fillStyle = '#e9f6f6'; g.beginPath(); g.roundRect(8, 524, 92, 70, 12); g.fill(); g.beginPath(); g.moveTo(30, 590); g.lineTo(26, 616); g.lineTo(52, 592); g.fill();
    g.fillStyle = '#2aa3b0'; g.beginPath(); g.arc(54, 556, 18, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.font = 'bold 74px Arial, Helvetica, sans-serif'; g.fillText('МАРКЕТ ВОДИ', 128, 560);
    g.fillStyle = '#d9eef0'; g.font = '30px Arial, Helvetica, sans-serif'; g.fillText('питна вода твого міста', 132, 614);
    g.fillStyle = '#f2fbfb'; g.beginPath(); g.arc(964, 572, 52, 0, 7); g.fill();
    g.fillStyle = '#2aa3b0'; g.beginPath(); g.arc(964, 572, 40, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(964, 544); g.quadraticCurveTo(988, 580, 964, 596); g.quadraticCurveTo(940, 580, 964, 544); g.fill();
  }, { repeat: false });
}

const c = Math.cos(SITE.yaw), sn = Math.sin(SITE.yaw);
const W = (x, z) => [SITE.x + x * c + z * sn, SITE.z - x * sn + z * c]; // local -> map (as the group's rotation.y)

// the lot slopes ~2 m along the building: level it (with the pavement in front and a strip round it) before the ground
// is built, so the floor sits on grade at every door
export function levelUrban(hf) { return hf.pad([[X0 + 4, ZN - 1.5], [X1 - 1.8, ZN - 1.5], [X1 - 1.8, ZS + 1.5], [X0 + 4, ZS + 1.5]].map(([x, z]) => W(x, z)), 10); }

export function buildUrban({ root: world, solids: S, heightAt }) {
  const hAt = (x, z) => heightAt(...W(x, z));
  const root = new THREE.Group(); root.name = 'partner-urban'; root.position.set(SITE.x, 0, SITE.z); root.rotation.y = SITE.yaw; world.add(root);
  // collision in map coordinates: a local axis-aligned box becomes an oriented one (obox: local +x -> (cos a, sin a))
  const sbox = (x0, y0, z0, x1, y1, z1, kind, flags = 0) => S.obox(...W((x0 + x1) / 2, (z0 + z1) / 2), Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, -SITE.yaw, y0, y1, kind, flags);
  const hs = [[X0, ZN], [X0, ZS], [X1, ZN], [X1, ZS]].map(([x, z]) => hAt(x, z));
  if (hs.some((h) => !Number.isFinite(h))) return null;
  const g0 = Math.min(...hs) + 0.12, gLo = Math.min(...hs) - 0.3, Y = (y) => g0 + y; // the floor just over the lowest corner: no door floats
  const F = face(X0, ZS, 0, -1, 1, 0, ZS - ZN), N = face(X0, ZN, -1, 0, 0, -1, X0 - X1);
  const Bk = face(X1, ZN, 0, 1, -1, 0, ZS - ZN), So = face(X1, ZS, 1, 0, 0, 1, X0 - X1);
  const B = { brick: new MB(), det: new MB(), glass: new MB(), sign: new MB() };
  const atlas = atlasTex(), logo = logoTexture('urban', { width: 1024, color: null, pad: 0 });
  const lit = []; // [material, day, night, approach]
  const litMat = (map, day, night, near, o = {}) => { const m = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: day, roughness: 0.35, ...o }); lit.push([m, day, night, near]); return m; };
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: brickTex(), roughness: 0.92 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    glass: litMat(atlas, 0.18, 0.95, 0.5, { roughness: 0.12, metalness: 0.35 }),
    sign: litMat(atlas, 0.3, 1.3, 0.6, { alphaTest: 0.5 }),
  };
  const D = B.det;

  // ---- walls: brick from below grade to the parapet, the front cut open for the glazing
  const holes = BAYS.map(([s0, s1, k]) => ({ s0, s1, y0: Y(k.endsWith('d') ? 0 : WIN[0]), y1: Y(WIN[1]) }));
  wall(B.brick, F, gLo, Y(H), holes, [1, 1.25]);
  for (const f of [N, Bk, So]) wall(B.brick, f, gLo, Y(H), [], [1, 1.25]);
  for (const f of [F, N, Bk, So]) {
    D.setColor(DARK); fbox(D, f, -0.32, f.L + 0.32, Y(H), Y(H + CAP), -0.32, 0.05, 'ftb'); // the cap over the wall head
    D.setColor('#7d3a2a'); fbox(D, f, 0.25, f.L - 0.25, Y(DECK), Y(H), -0.25, -0.25, 'b');  // the parapet's inner face
  }
  D.setColor('#8a7a6a'); D.box(X1 + 0.25, Y(DECK - 0.2), ZN + 0.25, X0 - 0.25, Y(DECK), ZS - 0.25, 4); // the terrace deck
  D.setColor('#55585c'); D.box(X1, gLo, ZN - 0.25, X0 + 0.25, Y(0.05), ZS + 0.25, 4); // a strip of paving under the eaves

  // ---- the glazing: deep dark reveals, the pane from the atlas, mullions; doors with a bar handle
  for (const [s0, s1, k] of BAYS) {
    const y0 = Y(k.endsWith('d') ? 0 : WIN[0]), y1 = Y(WIN[1]), d = -0.16, U = [F.ux, 0, F.uz];
    D.setColor(DARK);
    quad(D, pt(F, s0, y0), pt(F, s0, y0, d), pt(F, s0, y1, d), pt(F, s0, y1), U);
    quad(D, pt(F, s1, y1), pt(F, s1, y1, d), pt(F, s1, y0, d), pt(F, s1, y0), U.map((v) => -v));
    quad(D, pt(F, s1, y1), pt(F, s0, y1), pt(F, s0, y1, d), pt(F, s1, y1, d), [0, -1, 0]);
    quad(D, pt(F, s1, y0), pt(F, s0, y0), pt(F, s0, y0, d), pt(F, s1, y0, d), [0, 1, 0]);
    const u0 = k[0] === 'u' ? 0 : 0.5;
    decal(B.glass, F, s0, s1, y0, y1, d + 0.02, [u0, 0, u0 + 0.5, 0.5]);
    for (const [a, b] of [[s0, s0 + 0.07], [s1 - 0.07, s1]]) fbox(D, F, a, b, y0, y1, d, d + 0.06, 'flr');
    fbox(D, F, s0, s1, y1 - 0.07, y1, d, d + 0.06, 'fu'); fbox(D, F, s0, s1, y0, y0 + (k.endsWith('d') ? 0.1 : 0.07), d, d + 0.06, 'ft');
    if (k.endsWith('d')) { // the door leaf under a transom, a long bar handle
      fbox(D, F, s0, s1, Y(2.55), Y(2.63), d, d + 0.06, 'ftu'); fbox(D, F, s0 + 0.85, s0 + 0.9, Y(0), Y(2.55), d, d + 0.06, 'flr');
      D.setColor('#b8bcc0'); fbox(D, F, s0 + 0.68, s0 + 0.72, Y(0.7), Y(1.9), d + 0.06, d + 0.11, 'flr');
    } else for (let m = s0 + 1.5; m < s1 - 0.5; m += 1.5) fbox(D, F, m - 0.035, m + 0.035, y0, y1, d, d + 0.05, 'flr');
  }

  // ---- URBAN: the brush letters (the logo's top, without its small line) standing off the wall over the door, a
  // dark copy behind for their returns; two blue awnings with the logo on the valance; a lightbox blade at the corner
  const LH = 1.45, LW = LH / 0.84 * 543 / 256 * 0.97, sL = (4.15 + 5.85) / 2;
  const letters = (mat, o, ds, dy) => {
    const geo = new THREE.PlaneGeometry(LW, LH), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.16 + uv.getY(i) * 0.84);
    const m = new THREE.Mesh(geo, mat), [x, z] = [pt(F, sL + ds, 0, o)[0], pt(F, sL + ds, 0, o)[2]];
    m.position.set(x, Y(3.62 + LH / 2 + dy), z); m.rotation.y = Math.PI / 2; m.name = 'urban-letters';
    root.add(m); return m;
  };
  const logoMat = litMat(logo, 0.25, 1.3, 0.8, { alphaTest: 0.45, roughness: 0.4 });
  letters(logoMat, 0.14, 0, 0).castShadow = true;
  letters(new THREE.MeshStandardMaterial({ map: logo, color: 0x18181c, alphaTest: 0.45, roughness: 0.6 }), 0.05, -0.05, -0.05);
  const valance = litMat(logo, 0.3, 1.1, 0.6, { alphaTest: 0.45 }), vB = new MB();
  for (const [a0, a1] of AWN) {
    const top = Y(3.42), lo = Y(2.86), out = 1.25;
    D.setColor(BLUE); // the sloped cover, its cheeks and the valance band
    quad(D, pt(F, a0, top, 0.02), pt(F, a1, top, 0.02), pt(F, a1, lo, out), pt(F, a0, lo, out), [F.nx * 0.42, 0.91, F.nz * 0.42]);
    quad(D, pt(F, a0, lo, out), pt(F, a1, lo, out), pt(F, a1, top, 0.02), pt(F, a0, top, 0.02), [-F.nx * 0.42, -0.91, -F.nz * 0.42]);
    for (const [s, n] of [[a0, -1], [a1, 1]]) { const P = [pt(F, s, top, 0.02), pt(F, s, lo, out), pt(F, s, lo - 0.3, out)]; D.face(P, [F.ux * n, 0, F.uz * n]); D.face([...P].reverse(), [-F.ux * n, 0, -F.uz * n]); }
    fbox(D, F, a0, a1, lo - 0.3, lo, out - 0.02, out, 'fbu');
    D.setColor(STEEL); D.tube(pt(F, a0 + 0.15, Y(2.7), 0.02), pt(F, a0 + 0.15, lo, out - 0.05), 0.025, 4); D.tube(pt(F, a1 - 0.15, Y(2.7), 0.02), pt(F, a1 - 0.15, lo, out - 0.05), 0.025, 4);
    const w = 0.26 / 0.4715 * 0.9, m = (a0 + a1) / 2; // the logo on the band (white on the blue)
    decal(vB, F, m - w / 2, m + w / 2, lo - 0.28, lo - 0.02, out + 0.012, [0, 0, 1, 1]);
  }
  { const m = new THREE.Mesh(vB.build(), valance); m.name = 'urban-valance'; root.add(m); }
  { // the lightbox blade: a white box out from the front wall near the south corner, the logo dark on both faces
    const s = 0.22, y0 = Y(3.95), y1 = Y(4.5), o0 = 0.08, o1 = 1.05;
    D.setColor('#f1f1ee'); fbox(D, F, s - 0.07, s + 0.07, y0, y1, o0, o1, 'ftu');
    D.setColor(STEEL); fbox(D, F, s - 0.09, s + 0.09, y0 - 0.04, y1 + 0.04, 0, o0, 'flrtu');
    const plate = logoTexture('urban', { width: 512, color: '#16181c', plate: { bg: '#f6f6f3', edge: '#f6f6f3' } });
    const bm = litMat(plate, 0.3, 1.2, 0.7), bg = new MB();
    // south face (seen from the south the wall is on the left) and north face (on the right): uv reads left to right
    quad(bg, pt(F, s - 0.071, y0, o0), pt(F, s - 0.071, y0, o1), pt(F, s - 0.071, y1, o1), pt(F, s - 0.071, y1, o0), [-F.ux, 0, -F.uz], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    quad(bg, pt(F, s + 0.071, y0, o1), pt(F, s + 0.071, y0, o0), pt(F, s + 0.071, y1, o0), pt(F, s + 0.071, y1, o1), [F.ux, 0, F.uz], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    const m = new THREE.Mesh(bg.build(), bm); m.name = 'urban-lightbox'; root.add(m);
  }
  // «МАРКЕТ ВОДИ» over the water shop, its lettering flat on the brick
  decal(B.sign, F, 10.5, 17.7, Y(3.75), Y(3.75 + 7.2 * 123 / 1024), 0.03, [0, 0.5, 1, 0.62]);
  // blue barrel bins and a square bin by the door
  const ribs = [[0.27, 0], [0.29, 0.06], [0.27, 0.12], [0.29, 0.3], [0.27, 0.36], [0.29, 0.56], [0.27, 0.62], [0.29, 0.82], [0.27, 0.88]];
  for (const s of [1.2, 3.0, 6.9, 8.9]) {
    const [x, , z] = pt(F, s, 0, 0.55), y = hAt(x, z);
    D.setColor('#1d3aa6'); D.lathe(ribs.map(([r, h]) => [r, y + h]), 12, x, z);
    D.setColor('#9aa0a6'); D.cyl(x, y + 0.86, z, 0.29, 0.27, 0.05, 12, true);
  }
  { const [x, , z] = pt(F, 6.05, 0, 0.45), y = hAt(x, z); D.setColor('#1d3aa6'); D.box(x - 0.25, y, z - 0.3, x + 0.25, y + 1.1, z + 0.3); }

  // ---- the proof-of-concept terrace: a steel stair along the blank back wall up to a landing level with the cap, a
  // railing round the roof (open over the landing, a step down inside), thujas, tables under umbrellas
  const TOP = H + CAP, NR = 30, rise = TOP / NR, run = 0.26, sb = STAIR, sl = sb + (NR - 1) * run, se = sl + 2.0, oi = 0.15, oo = 1.2;
  const P = (s, y, o) => pt(Bk, s, y, o);
  D.setColor(STEEL);
  for (let k = 1; k < NR; k++) fbox(D, Bk, sb + (k - 1) * run - 0.02, sb + k * run, Y(k * rise) - 0.05, Y(k * rise), oi, oo, 'fblrtu');
  fbox(D, Bk, sl, se, Y(TOP) - 0.12, Y(TOP), 0, oo); // the landing
  for (const o of [oi + 0.04, oo - 0.04]) D.tube(P(sb, Y(-0.1), o), P(sl, Y(TOP - 0.1), o), 0.07, 4); // stringers
  for (const s of [sl + 0.1, se - 0.05]) D.tube(P(s, gLo, oo - 0.05), P(s, Y(TOP - 0.12), oo - 0.05), 0.06, 6);
  for (let k = 0; k <= 5; k++) { const s = sb + (sl - sb) * k / 5, y = Y(k / 5 * TOP); D.tube(P(s, y, oo - 0.03), P(s, y + 1.0, oo - 0.03), 0.025, 4); }
  D.tube(P(sb, Y(1.0), oo - 0.03), P(sl, Y(TOP + 1.0), oo - 0.03), 0.03, 5); D.tube(P(sl, Y(TOP + 1.0), oo - 0.03), P(se, Y(TOP + 1.0), oo - 0.03), 0.03, 5);
  D.tube(P(se - 0.03, Y(TOP), oo - 0.03), P(se - 0.03, Y(TOP + 1.0), oo - 0.03), 0.025, 4); D.tube(P(se - 0.03, Y(TOP + 1.0), oo - 0.03), P(se - 0.03, Y(TOP + 1.0), 0), 0.03, 5);
  // the roof railing just inside the cap on every face, with posts every ~1.6 m
  const GAP = [sl + 0.2, se - 0.2];
  const rail = (f, gap) => {
    const r = 0.12, yb = Y(TOP), yt = Y(DECK + 1.1), n = Math.max(1, Math.round((f.L - 2 * r) / 1.6));
    for (const [s0, s1] of gap ? [[r, gap[0]], [gap[1], f.L - r]] : [[r, f.L - r]]) {
      D.tube(pt(f, s0, yt, -r), pt(f, s1, yt, -r), 0.03, 5); D.tube(pt(f, s0, (yb + yt) / 2, -r), pt(f, s1, (yb + yt) / 2, -r), 0.018, 4);
      const posts = [s0, s1, ...Array.from({ length: n - 1 }, (_, k) => r + (f.L - 2 * r) * (k + 1) / n).filter((s) => s > s0 + 0.3 && s < s1 - 0.3)];
      for (const s of posts) D.tube(pt(f, s, yb, -r), pt(f, s, yt, -r), 0.025, 4);
    }
  };
  for (const f of [F, N, So]) rail(f); rail(Bk, GAP);
  D.setColor('#6d6259'); fbox(D, Bk, GAP[0], GAP[1], Y(DECK), Y(DECK + 0.27), -1.5, -0.3, 'fblrt'); // a step down off the cap
  const thuja = (x, z) => {
    D.setColor('#4a4d52'); D.box(x - 0.36, Y(DECK), z - 0.36, x + 0.36, Y(DECK + 0.55), z + 0.36);
    D.setColor('#2e4a2b'); D.lathe([[0.08, 0.45], [0.33, 0.7], [0.37, 1.1], [0.31, 1.65], [0.18, 2.15], [0.02, 2.55]].map(([q, h]) => [q, Y(DECK + h)]), 9, x, z);
  };
  for (const [x, z] of [[X0 - 0.75, ZN + 0.75], [X1 + 0.75, ZN + 0.75], [X0 - 0.75, ZS - 0.75], [X1 + 0.75, ZS - 0.75], [X0 - 0.75, (ZN + ZS) / 2], [X1 + 0.75, ZN + STAIR + 3.5]]) thuja(x, z);
  const tables = [];
  for (const x of [X0 - 2.9, X1 + 3.2]) for (let z = ZN + 3.2; z < ZS - 2.5; z += 6.2) tables.push([x, z]);
  tables.forEach(([x, z], i) => {
    const y = Y(DECK);
    D.setColor('#d9d4cc'); D.cyl(x, y + 0.72, z, 0.42, 0.42, 0.04, 14, true);
    D.setColor(DARK); D.cyl(x, y, z, 0.25, 0.25, 0.03, 10, true); D.tube([x, y, z], [x, y + 0.72, z], 0.03, 5);
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // chairs round it, backs outward
      const cx = x + ux * 0.78, cz = z + uz * 0.78;
      D.setColor(i % 2 ? '#e8e6e1' : '#2b2e34'); D.boxC(cx, y + 0.45, cz, 0.42, 0.04, 0.42);
      D.boxC(cx + ux * 0.2, y + 0.68, cz + uz * 0.2, ux ? 0.04 : 0.42, 0.46, uz ? 0.04 : 0.42); D.tube([cx, y, cz], [cx, y + 0.45, cz], 0.025, 4);
    }
    D.setColor('#cfd2d6'); D.tube([x, y + 0.72, z], [x, y + 2.35, z], 0.025, 5);
    D.setColor(i % 2 ? '#f3f3f0' : BLUE); D.cyl(x, y + 2.05, z, 1.3, 0.04, 0.38, 8, true);
  });
  finish(root, 'urban', B, M, ['brick', 'det']);

  // ---- collision: the box up to the deck, the parapet + railing as a wall round it, the awnings, the stair
  const fb = (f, s0, s1, o0, o1, y0, y1, kind, flags) => { // a face-frame box (faces are square to the local axes)
    const p = pt(f, s0, 0, o0), q = pt(f, s1, 0, o1);
    sbox(Math.min(p[0], q[0]), y0, Math.min(p[2], q[2]), Math.max(p[0], q[0]), y1, Math.max(p[2], q[2]), kind, flags);
  };
  sbox(X1, gLo, ZN, X0, Y(DECK), ZS, 'wall');
  for (const f of [F, N, So]) fb(f, 0, f.L, -0.3, 0, Y(DECK), Y(DECK + 1.1), 'parapet');
  fb(Bk, 0, GAP[0], -0.3, 0, Y(DECK), Y(DECK + 1.1), 'parapet'); fb(Bk, GAP[1], Bk.L, -0.3, 0, Y(DECK), Y(DECK + 1.1), 'parapet');
  for (const [a0, a1] of AWN) fb(F, a0, a1, 0, 1.25, Y(2.56), Y(3.42), 'awning', 1);
  // the flight as a ramp: y = Y(0) + slope * (d - sb), d the distance along the back wall's u from its corner; in map
  // terms the plane y = a + bx * x + bz * z (local = R^-1 (map - SITE))
  const slope = TOP / (sl - sb), ux = Bk.ux, uz = Bk.uz, gx = slope * (c * ux + sn * uz), gz = slope * (-sn * ux + c * uz);
  const a = Y(0) - slope * (sb + Bk.ax * ux + Bk.az * uz) - gx * SITE.x - gz * SITE.z;
  S.prism([[sb, oi], [sl, oi], [sl, oo], [sb, oo]].flatMap(([s, o]) => { const q = pt(Bk, s, 0, o); return W(q[0], q[2]); }), gLo, a, gx, gz, 'step');
  fb(Bk, sl, se, 0, oo, gLo, Y(TOP), 'step');

  const [lx, , lz] = pt(F, sL, 0, 3.6), [dx, dz] = W(lx, lz);
  const door = { x: dx, y: heightAt(dx, dz), z: dz, nx: c, nz: -sn };
  const wash = new THREE.MeshBasicMaterial({ color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 2.6), wash);
  wm.position.set(X0 + 0.04, Y(3.6 + 1.3), ZS - 5.0); wm.rotation.y = Math.PI / 2; wm.renderOrder = 2; root.add(wm);
  let near = 0;
  return {
    footprints: [{ poly: [[X0, ZN], [X1, ZN], [X1, ZS], [X0, ZS]].map(([x, z]) => W(x, z)), h: Y(H) - gLo, kind: 'retail', name: 'URBAN' }],
    partners: { urban: { door, glow(k) { near = Math.max(0, Math.min(1, k)); } } },
    update() {
      const k = nightK.value;
      for (const [m, day, night, nearK] of lit) m.emissiveIntensity = day + night * k + nearK * near;
      wash.color.setRGB(1.0, 0.45, 0.75).multiplyScalar(near * (0.35 + 0.4 * k));
    },
  };
}
