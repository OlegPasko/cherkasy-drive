// OWNER: cherkasy. Будинок природи, вул. Верхня Горова, 1 (OSM relation 12524139): the late-modernist house of the
// Ukrainian Society for Nature Protection on Дзеленьгора, the hilltop of the old castle above the Dnipro, at the square
// where Верхня Горова starts and Старособорний узвіз runs down. Built from the 2011 Wikimedia Commons photo (the front),
// the retro.ck.ua and zmi.ck.ua photos (a side wing and the courtyard) and the aerial view (the plan). A two-storey ring
// on the OSM outline: a glazed ground floor set back behind square columns on the front and the two long sides,
// beige render above it; the front toward the square is a blank panelled box with the big green «БУДИНОК ПРИРОДИ» and
// the society's tree badge, the other sides have rows of windows; where the hill falls away to the Dnipro the plinth
// opens into a lower storey. Inside the ring an open hexagonal courtyard (white walls, a ribbon window upstairs, glazed
// doors, grey paving with white hexagonal bands round a stepped planter) and next to it the raised hexagonal assembly
// hall over the roof. Two red-and-white antenna masts stand on the roof.
//   PRYRODY_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildPryrody({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, top, yard, hall } | null
//     top: the ring's roof deck, yard: its courtyard floor, hall: the hall's roof deck (heights, for the tests)
// Walls are strips round real openings (slabkit skin / hole), flat colour over a speckle texture with uv in metres; the
// front's panels and the sign are two more textures. Lit windows follow nightK.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng } from './geo.js';
import { ringFaces, face, at, quad, box, rect, skin, hole, solid, finish, speckle } from './slabkit.js';

const OSM_ID = 12524139;
export const PRYRODY_SKIP = new Set([OSM_ID]);

// the OSM outline (map metres); faces by index: 6 the front toward the square (south-west), 1 the south side, 11 the
// north-west side (these three stand on columns), 16–22 the wings over the slope to the Dnipro, the rest short jogs
const RING = [[614.5, 300.8], [609.6, 304.5], [594.5, 284.6], [598.4, 281.6], [597.3, 279.8], [598, 278.3], [592.4, 276], [599.9, 258.5], [604.3, 260.3], [605.2, 258], [607.8, 257.8], [607.4, 254], [632.3, 250.9], [632.6, 252.8], [636.4, 252.3], [636.9, 256.5], [638.4, 256.3], [649.8, 271.3], [645.9, 274.5], [649.3, 279], [641.6, 296.7], [636, 297.5], [636.6, 302.7], [616.5, 305.2], [615.6, 305], [614.9, 304.4], [614.5, 303.5], [614.6, 302.6], [615.1, 301.7]];
// traced from the aerial view (OSM's own inner ring is off): the courtyard and the hall, sharing the edge 1–2 / 5–4
const YARD = [[615.5, 263.3], [620.6, 268.5], [616.5, 277.8], [613.8, 280.7], [607.8, 280.1], [602, 272.9], [605.5, 265.1]];
const HALL = [[631, 266.9], [639.7, 277.4], [635, 287.2], [622.8, 287.1], [616.5, 277.8], [620.6, 268.5]];
const FRONT = 6, PILOTIS = new Set([1, 6, 11]), SHARED = 1; // SHARED: the yard face that is the hall's wall
const MASTS = [[612.5, 258.5, 6], [628, 296, 8]]; // x, z, 2 m bands (the south one is the taller)
const GF = 4.0, UF = 4.2, PAR = 0.7, HUP = 3.2, HPAR = 0.5, REC = 2.4, PIER = 0.9; // storeys, parapets, the hall over the roof, the recess behind the columns
const RENDER = '#cdc6b5', WHITE = '#e3e0d6', PLINTH = '#8c877e', COLUMN = '#d4cec0', SOFFIT = '#b9b3a4', COPING = '#a29c90', ROOFC = '#6b6965', PAVE = '#9a9791';
const UVM = [2.5, 2.5];

// the front's sign: «БУДИНОК» over «ПРИРОДИ» in green on transparent ground (v 0.5..1), the badge – a white shield with
// a green tree – in the lower left quarter (u 0..0.25, v 0..0.5)
const signTex = () => canvasTex(1024, 512, (g) => {
  g.clearRect(0, 0, 1024, 512);
  g.fillStyle = '#16a58c'; g.strokeStyle = '#e8f3ee'; g.lineWidth = 7; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 100px Arial, Helvetica, sans-serif'; g.strokeText('БУДИНОК', 512, 62); g.fillText('БУДИНОК', 512, 62);
  g.font = 'bold 128px Arial, Helvetica, sans-serif'; g.strokeText('ПРИРОДИ', 512, 184); g.fillText('ПРИРОДИ', 512, 184);
  // the badge
  g.fillStyle = '#f4f2ec'; g.strokeStyle = '#17955f'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(28, 280); g.lineTo(228, 280); g.lineTo(228, 400); g.quadraticCurveTo(228, 470, 128, 500); g.quadraticCurveTo(28, 470, 28, 400); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#17955f';
  g.fillRect(120, 380, 16, 80);
  for (const [x, y, r] of [[128, 345, 44], [92, 372, 30], [164, 372, 30], [128, 312, 30]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
}, { repeat: false });
// vertical panel joints, one panel per u: the front box's render
const panelTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(70,60,50,0.07)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = 'rgba(60,55,45,0.35)'; g.fillRect(0, 0, 3, h);
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(3, 0, 2, h);
});

export function buildPryrody({ root, map, solids: S, zips: Z, heightAt }) {
  if (!map.buildings.some((b) => b.id === OSM_ID)) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const F = ringFaces(RING);
  const hs = RING.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs);
  // the floor: the front's ground (the square side is the high one), the hill falls ~6 m to the east behind it
  const fr = F[FRONT], fronts = [0.1, 0.5, 0.9].map((t) => { const p = at(fr, fr.L * t, 0, 1.5); return heightAt(p[0], p[2]); });
  const yF = Math.max(...fronts, ...hs.slice(5, 12)) + 0.12, gB = gLo - 0.6;
  const y1 = yF + GF, ROOF = y1 + UF, TOP = ROOF + PAR, HROOF = ROOF + HUP, HTOP = HROOF + HPAR;
  const B = { det: new MB(), pan: new MB(), glass: new MB(), lit: new MB(), sign: new MB(), roof: new MB() }, D = B.det, R = B.roof;
  let nWin = 0, nLit = 0;
  const wall = (f, s0, s1, ya, yb, col, o = 0) => { D.setColor(col); rect(D, f, s0, s1, ya, yb, o, UVM); };
  const neg = (v) => v.map((q) => -q);
  // an opening cut into f and filled: reveals, frame, mullions, glass (lit at random by p)
  const open = (f, s0, s1, ya, yb, p = 0.3, extra = {}) => {
    const lit = r() < p; nWin++; nLit += lit;
    const q = { s0, s1, y0: ya, y1: yb, dep: 0.2, rev: '#c9c3b5', frame: '#ddd9d0', glass: '#43525c', lit, pitch: 1.1, sill: '#b5afa3', ...extra };
    f.cuts.push(q); hole(B, f, q);
  };
  // a row of n windows w wide centred along s0..s1, sill ya, head yb
  const centres = (s0, s1, w, pitch) => {
    const n = Math.max(0, Math.floor((s1 - s0 - 0.6 + (pitch - w)) / pitch)), c0 = (s0 + s1) / 2 - (n - 1) * pitch / 2;
    return Array.from({ length: n }, (_, k) => c0 + k * pitch);
  };
  const row = (f, s0, s1, w, pitch, ya, yb, p, extra) => { for (const c of centres(s0, s1, w, pitch)) open(f, c - w / 2, c + w / 2, ya, yb, p, extra); };

  // ---- the outer ring, face by face
  const notch = [];                                          // the ground-floor collider, the column recesses cut in
  for (const [i, f] of F.entries()) {
    const L = f.L, piloti = PILOTIS.has(i) && L > 10;
    notch.push(RING[i]);
    // the plinth (and on the slope the lower storey's windows), the coping, the roof edge for the zip store
    if (!piloti) {
      for (const c of L > 4 ? centres(0.4, L - 0.4, 2.2, 3.4) : []) { const p = at(f, c, 0, 1.2); if (heightAt(p[0], p[2]) < yF - 3.4) open(f, c - 1.0, c + 1.0, yF - 3.2, yF - 1.4, 0.25); }
    }
    skin(D, f, gB, yF, PLINTH, UVM);
    f.cuts.length = 0;
    D.setColor(COPING); box(D, f, -0.05, L + 0.05, TOP, TOP + 0.1, -0.4, 0.06, 'ftlr');
    { const a = at(f, 0, 0, -0.1), b = at(f, L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP + 0.1, f.nx, f.nz); }

    // the upper storey: the front a blank panelled box with the sign, the jogs blank, the rest windows
    if (i === FRONT) {
      B.pan.setColor(RENDER); rect(B.pan, f, 0, L, y1, TOP, 0, [1.55, 4.9]);
      D.setColor(SOFFIT); box(D, f, 0, L, y1 - 0.25, y1, 0, 0.08, 'fu');           // the slab edge over the columns
      const sc = L / 2, sw = 12.4;
      // read left to right from outside: when s runs to the viewer's left the u range is flipped
      const flip = f.ux * f.nz - f.uz * f.nx < 0, sign = (s0, s1, ya, yb, u0, v0, u1, v1) => {
        const [ua, ub] = flip ? [u1, u0] : [u0, u1];
        quad(B.sign, at(f, s0, ya, 0.05), at(f, s1, ya, 0.05), at(f, s1, yb, 0.05), at(f, s0, yb, 0.05), f.N, [[ua, v0], [ub, v0], [ub, v1], [ua, v1]]);
      };
      B.sign.setColor('#ffffff');
      sign(sc - sw / 2, sc + sw / 2, y1 + 0.3, y1 + 3.3, 0, 0.5, 1, 1);
      sign(sc - 0.7, sc + 0.7, y1 + 3.35, y1 + 4.75, 0.02, 0, 0.23, 0.46);
    } else {
      const col = i >= 16 && i <= 22 ? WHITE : RENDER;
      if (L > 4) row(f, 0.4, L - 0.4, 2.2, 3.4, y1 + 0.95, y1 + 2.95, 0.3);
      else if (L > 2.3) open(f, L / 2 - 0.7, L / 2 + 0.7, y1 + 0.95, y1 + 2.95, 0.3);
      skin(D, f, y1, TOP, col, UVM);
      f.cuts.length = 0;
    }

    // the ground floor: on columns (glazing set back REC behind them) or a wall with windows / shop fronts
    if (piloti) {
      const s0 = PIER, s1 = L - PIER, P = (s, o) => { const q = at(f, s, 0, o); return [q[0], q[2]]; };
      notch.push(P(s0, 0), P(s0, -REC), P(s1, -REC), P(s1, 0));
      wall(f, 0, s0, yF, y1, COLUMN); wall(f, s1, L, yF, y1, COLUMN);
      const g = face(P(s0, -REC), P(s1, -REC), f.nx, f.nz);
      const shop = { frame: '#5b4434', rev: '#5b4434', glass: '#3c4950', pitch: 1.5, tr: yF + 2.7, sill: null, dep: 0.1 };
      const doorAt = i === FRONT ? g.L / 2 : g.L * 0.3, n = Math.max(1, Math.round(g.L / 4.2)), w = g.L / n;
      for (let k = 0; k < n; k++) {
        const a = k * w + 0.25, b = (k + 1) * w - 0.25, door = doorAt > a && doorAt < b;
        open(g, a, b, door ? yF : yF + 0.35, yF + 3.3, 0.65, door ? { ...shop, door: true } : shop);
      }
      skin(D, g, yF, y1, COLUMN, UVM);
      D.setColor(SOFFIT); quad(D, at(f, s0, y1, -REC), at(f, s1, y1, -REC), at(f, s1, y1, 0), at(f, s0, y1, 0), [0, -1, 0]);
      D.setColor(COLUMN);
      quad(D, at(f, s0, yF, -REC), at(f, s0, yF, 0), at(f, s0, y1, 0), at(f, s0, y1, -REC), [f.ux, 0, f.uz]);
      quad(D, at(f, s1, yF, -REC), at(f, s1, yF, 0), at(f, s1, y1, 0), at(f, s1, y1, -REC), [-f.ux, 0, -f.uz]);
      D.setColor(PAVE); box(D, f, s0, s1, gB, yF, -REC, 0.4, 't', UVM);               // the porch floor under the columns
      D.setColor(PLINTH); box(D, f, s0, s1, gB, yF, -REC, 0.4, 'f', UVM);
      const nc = Math.max(2, Math.round((s1 - s0) / 5.2)), cw = 0.3;
      for (let k = 1; k < nc; k++) {
        const c = s0 + (s1 - s0) * k / nc;
        D.setColor(COLUMN); box(D, f, c - cw, c + cw, yF, y1, -0.75, -0.2, 'fblr', UVM);
        solid(S, f, c - cw, c + cw, -0.75, -0.2, yF, y1);
      }
    } else if (L > 4) {
      const shopRow = i >= 2 && i <= 10;                       // round the front corners: shop windows near the square
      row(f, 0.4, L - 0.4, shopRow ? 2.6 : 2.2, shopRow ? 3.2 : 3.4, yF + (shopRow ? 0.4 : 0.9), yF + 3.1, shopRow ? 0.6 : 0.35,
        shopRow ? { frame: '#5b4434', rev: '#5b4434', glass: '#3c4950', pitch: 1.3, sill: null } : {});
      skin(D, f, yF, y1, i >= 16 && i <= 22 ? WHITE : RENDER, UVM);
      f.cuts.length = 0;
    } else wall(f, 0, L, yF, y1, RENDER);
  }

  // ---- the courtyard: white walls (the one shared with the hall rises to the hall's parapet), glazed doors and
  // windows on the ground floor, a ribbon window upstairs; paving with white hexagonal bands round a stepped planter
  const cx = YARD.reduce((s, p) => s + p[0], 0) / YARD.length, cz = YARD.reduce((s, p) => s + p[1], 0) / YARD.length;
  const FY = ringFaces(YARD).map((f) => Object.assign(f, { nx: -f.nx, nz: -f.nz, N: neg(f.N) })); // facing into the yard
  for (const [k, f] of FY.entries()) {
    const L = f.L, top = k === SHARED ? HTOP : TOP;
    if (L > 3) {
      const nd = Math.max(1, Math.round(L / 3.2)), w = L / nd;
      for (let j = 0; j < nd; j++) {
        const door = (j === Math.floor(nd / 2)) && k !== SHARED;
        open(f, j * w + 0.35, (j + 1) * w - 0.35, door ? yF : yF + 0.8, yF + 3.0, 0.5, door ? { door: true, frame: '#5b4434', rev: '#5b4434', tr: yF + 2.4 } : { frame: '#5b4434', rev: '#5b4434' });
      }
      if (k !== SHARED) open(f, 0.8, L - 0.8, y1 + 1.3, y1 + 2.5, 0.35, { pitch: 1.4 });
    }
    skin(D, f, yF, top, WHITE, UVM);
    f.cuts.length = 0;
    D.setColor(COPING); box(D, f, -0.05, L + 0.05, top, top + 0.1, -0.4, 0.06, 'ftlr');
    if (k === SHARED) continue;                                // above the roof it is the hall's wall
    R.setColor(WHITE); rect(R, f, 0, L, ROOF, top, -0.35, null, neg(f.N));        // the parapet's roof side
    solid(S, f, 0, L, -0.35, 0, ROOF, top + 0.1);
  }
  { const ring = (k) => YARD.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
    R.setColor(PAVE); R.fill(YARD, [], yF + 0.02, true);
    // white bands: between the rings scaled by a and b about the centre
    for (const [a, b] of [[0.78, 0.72], [0.48, 0.43]]) {
      const A = ring(a), Bq = ring(b); R.setColor('#e9e7e1');
      for (let j = 0; j < A.length; j++) {
        const n = (j + 1) % A.length;
        quad(R, [A[j][0], yF + 0.04, A[j][1]], [A[n][0], yF + 0.04, A[n][1]], [Bq[n][0], yF + 0.04, Bq[n][1]], [Bq[j][0], yF + 0.04, Bq[j][1]], [0, 1, 0]);
      }
    }
    // the stepped planter: two hexagonal tiers of white stone, earth and shrubs on top
    const hex = (rad) => Array.from({ length: 6 }, (_, j) => [cx + rad * Math.cos(j * Math.PI / 3 + 0.3), cz + rad * Math.sin(j * Math.PI / 3 + 0.3)]);
    D.setColor('#e6e3dc'); D.extrude(hex(2.0), [], yF, yF + 0.45, { top: true }); D.extrude(hex(1.3), [], yF + 0.45, yF + 0.85, { top: false });
    D.setColor('#4c6a35'); D.fill(hex(1.25), [], yF + 0.8, true);
    S.prism(hex(2.0).flat(), yF, yF + 0.45, 0, 0, 'wall'); S.prism(hex(1.3).flat(), yF, yF + 0.85, 0, 0, 'wall');
  }

  // ---- the hall: a blank hexagonal drum over the roof, its own deck and parapet
  { const FH = ringFaces(HALL);
    for (const [k, f] of FH.entries()) {
      if (k === 4) continue;                                   // its yard face is the courtyard's shared wall
      wall(f, 0, f.L, ROOF - 0.1, HTOP, RENDER);
      D.setColor(COPING); box(D, f, -0.05, f.L + 0.05, HTOP, HTOP + 0.1, -0.4, 0.06, 'ftlr');
    }
    for (const f of FH) { R.setColor(RENDER); rect(R, f, 0, f.L, HROOF, HTOP, -0.35, null, neg(f.N)); solid(S, f, 0, f.L, -0.35, 0, HROOF, HTOP + 0.1); }
    R.setColor(ROOFC); R.fill(HALL, [], HROOF + 0.02, true);
    S.prism(HALL.flat(), ROOF, HROOF, 0, 0, 'wall');
  }

  // ---- the roof deck round the yard and the hall, the outer parapet, the masts
  R.setColor(ROOFC); R.fill(RING, [YARD, HALL], ROOF + 0.02, true);
  for (const f of F) { R.setColor(RENDER); rect(R, f, 0, f.L, ROOF, TOP, -0.35, null, neg(f.N)); solid(S, f, 0, f.L, -0.35, 0, ROOF, TOP + 0.1); }
  for (const [x, z, nb] of MASTS) {
    D.setColor('#8a8780'); D.box(x - 0.9, ROOF, z - 0.7, x + 0.9, ROOF + 1.6, z + 0.7);   // the equipment cabinet
    for (let k = 0; k < nb; k++) { D.setColor(k % 2 ? '#f1efe9' : '#c8322b'); D.box(x - 0.18, ROOF + k * 2, z - 0.18, x + 0.18, ROOF + (k + 1) * 2, z + 0.18); }
    S.box(x - 0.9, ROOF, z - 0.7, x + 0.9, ROOF + 1.6, z + 0.7, 'wall'); S.cyl(x, z, ROOF, ROOF + nb * 2, 0.3, 0.3, 'wall');
  }

  // ---- colliders: the ground floor with the column recesses cut in, the upper storey on the full outline, both
  // round the courtyard; the courtyard's floor
  S.prism(notch.flat(), gB, y1, 0, 0, 'wall', 0, [YARD]);
  S.prism(RING.flat(), y1, ROOF, 0, 0, 'wall', 0, [YARD]);
  S.prism(YARD.flat(), gB, yF, 0, 0, 'wall');

  const sp = speckle(r, '#f4f2ee');
  const M = {
    det: new THREE.MeshStandardMaterial({ map: sp, vertexColors: true, roughness: 0.88 }),
    pan: new THREE.MeshStandardMaterial({ map: panelTex(), vertexColors: true, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.5 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.5, emissive: 0xffd2a0, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: signTex(), vertexColors: true, roughness: 0.5, alphaTest: 0.5, transparent: false }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
  };
  const out = finish(root, 'pryrody', B, M, { shade: ['det', 'pan', 'roof'] });
  console.log(`[cherkasy] Budynok pryrody: ${nWin} openings (${nLit} lit), roof ${(ROOF - yF).toFixed(1)} m, hall ${(HROOF - yF).toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const xs = RING.map((p) => p[0]), zs = RING.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs) - 2, Math.max(...xs) + 2, Math.min(...zs) - 2, Math.max(...zs) + 2];
  return {
    top: ROOF, yard: yF, hall: HROOF,
    footprints: [{ poly: RING.map((p) => [p[0], p[1]]), h: HTOP - gLo, kind: 'public', name: 'Будинок природи' }],
    clear: (x, z) => x > x0 && x < x1 && z > z0 && z < z1,
    update() { M.lit.emissiveIntensity = 0.55 * nightK.value; },
  };
}
