// OWNER: cherkasy. Four old buildings in the centre that the quest «Таємниці Черкас» (src/game/quests/secrets.js) sends
// the player to, each on its OSM outline, built from the uk.wikipedia / Wikimedia Commons photos:
//   Будинок Белахова (Хрещатик 219, OSM 157594220, 1880s, the town's first cinema in 1908) – two storeys next to the
//     Kobzar museum: shopfronts in cream render below, the upper floor in yellow brick with white stucco: paired windows
//     in moulded surrounds, the diamond-panel frieze, the arched middle window over a balcony, two octagonal
//     crenellated turrets flanking an attic with an oculus, and the wrought-iron railing along the roof.
//   Будинок Скловського (вул. Слави 11, OSM 157436225, the synagogue till 1923, a third storey added in the 1960s) –
//     the ground floor painted yellow with green bands, pilasters and sunrise lunettes over the windows, the two upper
//     floors in bare sand brick with corbelled window heads, balconies, a low hipped roof behind an eaves railing.
//   Жіноча гімназія Городецького (Смілянська 33, OSM 108382800, 1903–1905, now the city Centre of children's
//     creativity) – the chevron plan: square end blocks with an attic on the street, two pedimented fronts on the
//     45-degree faces (fluted pilasters, the triglyph frieze with relief panels, meander panels under the windows,
//     the door), the lower middle front with palmette finials; pale grey paint, yellow brick on the yard side; the
//     Chikovani memorial plaque by the left door.
//   Черкаська тютюнова фабрика (Зарицького; Благовісна 170 / О. Дашковича 53, OSM 157006547, 997923403, 997923404,
//     now ЦНАП, a chess club and a culture house) – the four-storey works along Дашковича: yellow brick with pilaster
//     strips over a rubble-granite ground floor on the west, pink render with the entrance canopy on the east and down
//     the wing into the yard, the emblem disc on the wing's end; on the Благовісна corner the cream two-storey hall
//     with the red roof and the red loading canopy; the black steel fence along the forecourt. The split of the parts
//     between the three OSM outlines is read off the photos and the aerial view: a guess where they do not show it.
//   QUEST_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildQuestCentre({ root, map, solids, zips, heightAt }) -> { update(), clear(x, z), footprints, parts } | null
//     parts: { belakhov, sklovsky, horodetsky, tobacco } -> { group, verts, meshes, floor, eaves } (tests)
// Each building is its own group under root (one per proxies.js stand-in); walls come from civic.js faces, the
// friezes, railings, lunettes and the emblem from one canvas atlas (alpha-tested for the ironwork).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { ringPts, rng, inPoly } from './geo.js';
import { wallFaces, at, quad, fbox, fsolid, rampSolid, wallAround, stoneTex, brickTex, pack, plainOpening, fillOpening, facePoly, archPts, roofFace } from './civic.js';

const ID = { belakhov: 157594220, sklovsky: 157436225, horodetsky: 108382800, tobW: 157006547, tobT: 997923403, tobHall: 997923404 };
export const QUEST_SKIP = new Set(Object.values(ID));

const RU = [3, 3], BU = [2.0, 1.8], GL = ['#4f5a61', '#5a656b', '#56626a', '#646c70'];

// ------------------------------------------------------------------------------------------------ the atlas
// 512 x 1024, eight rows of 128 px, each row one tile repeated along u: 0 diamond panel, 1 meander, 2 triglyph +
// relief metope, 3 ornate railing (alpha), 4 plain steel fence (alpha), 5 sunrise lunette (alpha), 6 emblem disc (alpha)
const ROWS = 8;
function atlasTex() {
  return canvasTex(512, 1024, (g) => {
    g.clearRect(0, 0, 512, 1024);
    // 0: white stucco band, a long rhombus in yellow inside a moulded panel
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#b9b2a2'; g.lineWidth = 6; g.strokeRect(14, 14, 484, 100);
    g.fillStyle = '#e2bf72'; g.beginPath(); g.moveTo(40, 64); g.lineTo(256, 24); g.lineTo(472, 64); g.lineTo(256, 104); g.closePath(); g.fill();
    g.strokeStyle = '#f8f6f0'; g.lineWidth = 8; g.beginPath(); g.moveTo(40, 64); g.lineTo(472, 64); g.moveTo(256, 24); g.lineTo(256, 104); g.stroke();
    // 1: Greek key on a pale ground
    g.fillStyle = '#e9e8e2'; g.fillRect(0, 128, 512, 128);
    g.strokeStyle = '#8f938f'; g.lineWidth = 9; g.lineJoin = 'miter';
    for (let k = 0; k < 4; k++) {
      const x = k * 128 + 8, y = 128 + 104;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, 128 + 24); g.lineTo(x + 96, 128 + 24); g.lineTo(x + 96, 128 + 84); g.lineTo(x + 32, 128 + 84);
      g.lineTo(x + 32, 128 + 50); g.lineTo(x + 66, 128 + 50); g.stroke();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 128, y); g.stroke();
    }
    // 2: triglyph (a quarter) and a metope with a pale relief figure
    g.fillStyle = '#d9dcd8'; g.fillRect(0, 256, 512, 128);
    g.fillStyle = '#c4c8c4'; g.fillRect(0, 256, 120, 128);
    g.fillStyle = '#8e9490'; for (const x of [30, 55, 80]) g.fillRect(x, 262, 10, 116);
    g.fillStyle = '#cfd2ce'; g.fillRect(150, 268, 330, 104);
    g.fillStyle = '#eef0ec'; g.beginPath(); g.ellipse(315, 300, 26, 26, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(305, 345, 70, 22, -0.25, 0, 7); g.fill(); g.fillRect(250, 340, 150, 26);
    // 3: wrought railing: rails, uprights, rings and scrolls
    g.strokeStyle = '#26221f'; g.lineWidth = 7;
    g.strokeRect(4, 384 + 8, 504, 112);
    for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x + 16, 392); g.lineTo(x + 16, 504); g.stroke(); }
    g.lineWidth = 5; for (let x = 0; x < 512; x += 64) { g.beginPath(); g.arc(x + 32, 448, 18, 0, 7); g.stroke(); g.beginPath(); g.arc(x + 48, 418, 12, Math.PI, 2 * Math.PI); g.stroke(); }
    // 4: a plain steel fence: two rails and square bars
    g.fillStyle = '#1f2224';
    // (bars thick enough to survive the mipmaps a few tens of metres off)
    g.fillRect(0, 512 + 12, 512, 14); g.fillRect(0, 512 + 100, 512, 14);
    for (let x = 0; x < 512; x += 64) g.fillRect(x + 22, 512 + 4, 16, 124);
    g.fillRect(0, 512, 16, 128);
    // 5: sunrise lunette: a green half disc with yellow rays (transparent outside)
    // (the strip it lands on is 2:1, the row 4:1, so every curve is drawn squashed to half its height)
    const half = (rx, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(256, 764, rx, rx / 2, 0, Math.PI, 2 * Math.PI); g.fill(); };
    half(240, '#5f9c72'); half(170, '#e8d982');
    g.strokeStyle = '#5f9c72'; g.lineWidth = 12;
    for (let k = 1; k < 8; k++) { const a = Math.PI + k * Math.PI / 8; g.beginPath(); g.moveTo(256 + 60 * Math.cos(a), 764 + 30 * Math.sin(a)); g.lineTo(256 + 172 * Math.cos(a), 764 + 86 * Math.sin(a)); g.stroke(); }
    half(54, '#5f9c72');
    // 6: the works' emblem: a disc with a ring and two leaves (drawn into the middle square of the row)
    // (u 0.25..0.75 of the row lands on a square: drawn twice as wide as high)
    g.fillStyle = '#c89c8a'; g.beginPath(); g.ellipse(256, 832, 124, 62, 0, 0, 7); g.fill();
    g.strokeStyle = '#e8cdbf'; g.lineWidth = 6; g.beginPath(); g.ellipse(256, 832, 106, 53, 0, 0, 7); g.stroke();
    g.fillStyle = '#e8cdbf';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(256 + s * 26, 830, 22, 34, 0, 0, 7); g.fill(); }
  });
}
// one strip of the atlas over the quad a-b (bottom) up to y1: u repeats every tileW metres (or spans [u0, u1])
function strip(D, a, b, y0, y1, n, row, tileW, u0 = 0, u1 = null) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]), U1 = u1 ?? u0 + len / tileW;
  const v0 = 1 - (row + 1) / ROWS + 0.004, v1 = 1 - row / ROWS - 0.004;
  quad(D, [a[0], y0, a[2]], [b[0], y0, b[2]], [b[0], y1, b[2]], [a[0], y1, a[2]], n, [[u0, v0], [U1, v0], [U1, v1], [u0, v1]]);
}
const band = (D, f, s0, s1, y0, y1, o, row, tileW) => strip(D, at(f, s0, 0, o), at(f, s1, 0, o), y0, y1, f.N, row, tileW);
// a railing round a balcony slab s0..s1 x 0..d in front of the face
function railing(D, f, s0, s1, d, y0, h, row = 3) {
  band(D, f, s0, s1, y0, y0 + h, d, row, 0.9);
  strip(D, at(f, s0, 0, 0), at(f, s0, 0, d), y0, y0 + h, f.L, row, 0.9);
  strip(D, at(f, s1, 0, 0), at(f, s1, 0, d), y0, y0 + h, f.R, row, 0.9);
}

// a rubble-granite wall: irregular dark stones in grey mortar (near white so the vertex colour tints it)
const rubbleTex = (r) => canvasTex(512, 512, (g) => {
  g.fillStyle = '#d4d0cc'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 46) for (let x = -40; x < 512; x += 52 + r() * 30) {
    const w = 40 + r() * 34, h = 34 + r() * 12, k = 90 + r() * 110, p = r() < 0.25 ? 1.08 : 1;
    g.fillStyle = `rgb(${k * p},${k * 0.97},${k * 0.96})`;
    g.beginPath(); g.moveTo(x + r() * 8, y + r() * 8); g.lineTo(x + w - r() * 8, y + r() * 6); g.lineTo(x + w, y + h - r() * 8); g.lineTo(x + r() * 10, y + h);
    g.closePath(); g.fill();
  }
});

// ------------------------------------------------------------------------------------------------ shared helpers
// a hipped roof over the face-frame rectangle s0..s1 x o0..o1 (o negative: into the building), eaves at y
function hipF(D, f, s0, s1, o0, o1, y, rise) {
  const P = (s, yy, o) => at(f, s, yy, o), Y = y + rise;
  const A = P(s0, y, o0), B = P(s1, y, o0), C = P(s1, y, o1), E = P(s0, y, o1);
  if (s1 - s0 >= o0 - o1) {
    const h = (o0 - o1) / 2, om = (o0 + o1) / 2, R0 = P(s0 + h, Y, om), R1 = P(s1 - h, Y, om);
    for (const Q of [[A, B, R1, R0], [C, E, R0, R1], [B, C, R1], [E, A, R0]]) roofFace(D, Q);
  } else {
    const h = (s1 - s0) / 2, sm = (s0 + s1) / 2, R0 = P(sm, Y, o0 - h), R1 = P(sm, Y, o1 + h);
    for (const Q of [[B, C, R1, R0], [E, A, R0, R1], [A, B, R0], [C, E, R1]]) roofFace(D, Q);
  }
}
// a ridge running back from the face (a pediment's roof): two slopes s0..s1 over o 0..-d, the back gable
function gableBack(D, f, s0, s1, d, y, rise, col) {
  const m = (s0 + s1) / 2, Y = y + rise;
  roofFace(D, [at(f, s0, y, 0), at(f, s0, y, -d), at(f, m, Y, -d), at(f, m, Y, 0)]);
  roofFace(D, [at(f, s1, y, 0), at(f, m, Y, 0), at(f, m, Y, -d), at(f, s1, y, -d)]);
  if (col) D.setColor(col);
  facePoly(D, f, [[s0, y], [s1, y], [m, Y]], -d, null, true);
}
// bays: n centres spread evenly over s0..s1
const spread = (s0, s1, n) => Array.from({ length: n }, (_, i) => s0 + (i + 0.5) * (s1 - s0) / n);
const near = (f, nx, nz) => f.nx * nx + f.nz * nz > 0.9;

// one building's frame: ring, faces, street ground, floor and footing
function site(map, id, heightAt, lift) {
  const b = map.buildings.find((q) => q.id === id);
  if (!b) return null;
  const ring = ringPts(b.p), F = wallFaces(ring), hs = ring.map(([x, z]) => heightAt(x, z));
  const gMax = Math.max(...hs), gMin = Math.min(...hs);
  return { b, ring, F, gMax, gMin, yF: gMax + lift, gBase: gMin - 0.6 };
}
function builders() { return { render: new MB(), brick: new MB(), rubble: new MB(), det: new MB(), glass: new MB(), lit: new MB(), orn: new MB() }; }

export function buildQuestCentre({ root, map, solids: S, zips: Z, heightAt }) {
  if (!map.buildings?.some((q) => QUEST_SKIP.has(q.id))) return null;
  const t0 = performance.now(), r = rng(ID.belakhov % 99991), n0 = S.count ?? 0;
  const atlas = atlasTex();
  const M = {
    render: new THREE.MeshStandardMaterial({ map: stoneTex(r, [244, 242, 236], { cols: 1, rows: 1, joint: 0, grain: 0.05 }), vertexColors: true, roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, { base: [238, 230, 210], mortar: [252, 250, 244], spread: 0.14 }), vertexColors: true, roughness: 0.9 }),
    rubble: new THREE.MeshStandardMaterial({ map: rubbleTex(r), vertexColors: true, roughness: 0.8 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xffe2b6, emissiveIntensity: 0 }),
    orn: new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
  };
  const parts = {}, footprints = [], boxes = [];
  const win = (f, s0, s1, y0, y1, extra = {}) => f.open.push({ s0, s1, y0, y1, dep: 0.22, glass: GL[Math.floor(r() * 4)], lit: r() < 0.35, ...extra });
  const finish = (key, name, B, s, eaves, top) => {
    const st = pack(root, `quest-${key}`, B, M);
    parts[key] = { group: st.group, verts: st.verts, meshes: st.meshes, floor: s.yF, eaves };
    footprints.push({ poly: s.ring, h: top - s.gMin, kind: s.b.k, name });
    const xs = s.ring.map((p) => p[0]), zs = s.ring.map((p) => p[1]);
    boxes.push([Math.min(...xs) - 2, Math.min(...zs) - 2, Math.max(...xs) + 2, Math.max(...zs) + 2]);
  };
  const edges = (F, y) => { for (const g of F) { const a = at(g, 0, 0, -0.1), c = at(g, g.w, 0, -0.1); Z.edge(a[0], a[2], c[0], c[2], y, g.nx, g.nz); } };
  const each = (label, fn) => { try { fn(); } catch (e) { console.error(`[cherkasy] quest centre: ${label} failed`, e); } };

  each('Belakhov', () => belakhov());
  each('Sklovsky', () => sklovsky());
  each('Horodetsky', () => horodetsky());
  each('tobacco works', () => tobacco());

  // ================================================================================================ Будинок Белахова
  function belakhov() {
    const s = site(map, ID.belakhov, heightAt, 0.12);
    if (!s) return;
    const { F } = s, B = builders(), D = B.det;
    const front = F.filter((f) => near(f, -1, 0)).reduce((m, f) => (f.w > m.w ? f : m));
    const party = F.filter((f) => near(f, 0, -1) && f.w > 9);   // against the Kobzar museum's yard wall
    const GF = 4.5, F2 = 4.7, yF = s.yF, y2 = yF + GF, yE = y2 + F2, yP = yE + 0.55;
    const CREAM = '#e7dcc3', YEL = '#e2b47f', WHITE = '#f1eee6', GRAN = '#7d5b50', ROOF = '#6d7377';
    const w = front.w, m = w / 2;
    // ---- the front: shopfronts and the door below; paired windows, the arched middle one above
    for (const c of [m - 7.6, m - 3.9, m + 3.9, m + 7.6]) win(front, c - 1.45, c + 1.45, yF + 0.45, yF + 3.4, { frame: '#3b3735', pane: 1.4, glass: '#4a545b', rev: '#cfc6b2', lit: r() < 0.6 });
    win(front, m - 0.85, m + 0.85, yF, yF + 3.0, { frame: '#5a3c28', glass: '#5b412c', door: true, lit: false, rev: '#cfc6b2' });
    const pairs = [m - 8.3, m - 6.9, m - 4.6, m - 3.2, m + 3.2, m + 4.6, m + 6.9, m + 8.3];
    for (const c of pairs) win(front, c - 0.58, c + 0.58, y2 + 1.0, y2 + 3.45, { frame: '#7a4b2a', pane: 0.6, rev: '#efe9dc', sill: WHITE });
    const ys = y2 + 3.05, archW = [m - 0.8, m + 0.8];
    win(front, archW[0], archW[1], y2 + 0.05, ys + 0.8, { frame: '#7a4b2a', pane: 0.55, rev: '#efe9dc', door: true });
    // the other walls: plain windows, none on the party wall
    for (const f of F) {
      if (f === front || party.includes(f) || f.w < 4) continue;
      for (const c of spread(0.4, f.w - 0.4, Math.max(1, Math.round(f.w / 3.4)))) {
        win(f, c - 0.6, c + 0.6, yF + 1.0, yF + 3.2, { rev: '#d9d2c2' });
        win(f, c - 0.6, c + 0.6, y2 + 1.0, y2 + 3.3, { rev: '#d9d2c2' });
      }
    }
    for (const f of F) {
      wallAround(B.render, f, s.gBase, y2, RU, CREAM);
      wallAround(B.brick, f, y2, yP, BU, party.includes(f) ? '#c9a46c' : YEL);
      for (const q of f.open) (f === front ? fillOpening : plainOpening)(B, f, q);
    }
    // the arch's head: brick spandrels round it, a white archivolt and keystone
    {
      const A = archPts(archW[0], archW[1], ys, 'round'), Ao = archPts(archW[0], archW[1], ys, 'round', 0.22), k = (A.length - 1) / 2, yA = ys + 0.8;
      B.brick.setColor(YEL);
      facePoly(B.brick, front, [[archW[0], yA], ...A.slice(0, k + 1)], 0, BU);
      facePoly(B.brick, front, [[archW[1], yA], ...A.slice(k).reverse()], 0, BU);
      D.setColor(WHITE);
      for (let i = 0; i < A.length - 1; i++) facePoly(D, front, [A[i], Ao[i], Ao[i + 1], A[i + 1]], 0.07);
      fbox(D, front, m - 0.16, m + 0.16, ys + 0.62, ys + 1.12, 0, 0.12, 1 | 4 | 8 | 16);
      // the arch is cut as a rectangle up to yA: glass behind the round part, wall over the corners
    }
    // stucco: plinth, the shop fascia, frieze of diamond panels, window surrounds and crowns, the cornice
    D.setColor(GRAN); fbox(D, front, 0, w, s.gBase, yF + 0.45, 0, 0.06, 1 | 16);
    D.setColor('#3d3a38'); fbox(D, front, 0, w, yF + 3.5, yF + 4.05, 0, 0.14, 1 | 16 | 32);   // the shops' fascia, left blank
    D.setColor(WHITE);
    fbox(D, front, -0.05, w + 0.05, y2 - 0.12, y2 + 0.05, 0, 0.22, 1 | 16 | 32);
    for (let k = 0; k < 4; k++) {   // a diamond panel under each window pair
      const c = (pairs[2 * k] + pairs[2 * k + 1]) / 2;
      band(B.orn, front, c - 1.3, c + 1.3, y2 + 0.15, y2 + 0.85, 0.05, 0, 2.6);
    }
    band(B.orn, front, m - 1.2, m + 1.2, yE - 0.95, yE - 0.3, 0.05, 0, 2.4);
    for (const c of pairs) {
      fbox(D, front, c - 0.72, c - 0.58, y2 + 0.95, y2 + 3.5, 0, 0.08, 1 | 4 | 8);
      fbox(D, front, c + 0.58, c + 0.72, y2 + 0.95, y2 + 3.5, 0, 0.08, 1 | 4 | 8);
      fbox(D, front, c - 0.82, c + 0.82, y2 + 3.5, y2 + 3.72, 0, 0.16, 63);            // the crown
      fbox(D, front, c - 0.5, c + 0.5, y2 + 3.72, y2 + 3.95, 0, 0.08, 1 | 16);
    }
    fbox(D, front, -0.1, w + 0.1, yE - 0.3, yE, 0, 0.45, 63);                          // cornice
    for (let x = 0.2; x < w - 0.1; x += 0.45) fbox(D, front, x, x + 0.18, yE - 0.5, yE - 0.3, 0, 0.3, 1 | 4 | 8 | 32);
    // the balcony on brackets under the arched window, its wrought railing
    D.setColor('#6f6a63'); fbox(D, front, m - 1.35, m + 1.35, y2 - 0.02, y2 + 0.06, 0.22, 1.0, 63);
    for (const c of [m - 1.05, m + 1.05]) fbox(D, front, c - 0.06, c + 0.06, y2 - 0.35, y2 - 0.02, 0.22, 0.6, 1 | 4 | 8 | 32);
    B.orn.setColor('#ffffff'); railing(B.orn, front, m - 1.35, m + 1.35, 1.0, y2 + 0.06, 1.0);
    // the turrets: brick shafts either side of the middle bay, octagonal crenellated tops; the attic with its oculus
    for (const c of [m - 1.85, m + 1.85]) {
      B.brick.setColor(YEL); fbox(B.brick, front, c - 0.36, c + 0.36, y2, yE + 1.2, 0, 0.28, 1 | 4 | 8 | 16);
      const p = at(front, c, 0, 0.1);
      D.setColor(YEL); D.cyl(p[0], yE + 1.2, p[2], 0.36, 0.36, 1.0, 8, true);
      D.setColor(WHITE); D.cyl(p[0], yE + 1.75, p[2], 0.4, 0.4, 0.12, 8, true);
      D.setColor(YEL); D.cyl(p[0], yE + 2.2, p[2], 0.36, 0.5, 0.25, 8, true);
      for (let k = 0; k < 8; k += 2) { const a = k * Math.PI / 4; D.boxC(p[0] + 0.4 * Math.cos(a), yE + 2.6, p[2] + 0.4 * Math.sin(a), 0.2, 0.3, 0.2); }
    }
    B.brick.setColor(YEL); facePoly(B.brick, front, [[m - 1.5, yE], [m + 1.5, yE], [m + 1.5, yE + 1.6], [m + 0.9, yE + 2.1], [m, yE + 2.5], [m - 0.9, yE + 2.1], [m - 1.5, yE + 1.6]], 0.12, BU);
    facePoly(B.brick, front, [[m - 1.5, yE], [m - 1.5, yE + 1.6], [m - 0.9, yE + 2.1], [m, yE + 2.5], [m + 0.9, yE + 2.1], [m + 1.5, yE + 1.6], [m + 1.5, yE]], -0.1, BU, true);
    {
      const n = 14, oc = [], ic = [];
      for (let i = 0; i <= n; i++) { const a = 2 * Math.PI * i / n; oc.push([m + 0.55 * Math.cos(a), yE + 1.3 + 0.55 * Math.sin(a)]); ic.push([m + 0.38 * Math.cos(a), yE + 1.3 + 0.38 * Math.sin(a)]); }
      D.setColor(WHITE); for (let i = 0; i < n; i++) facePoly(D, front, [ic[i], oc[i], oc[i + 1], ic[i + 1]], 0.16);
      D.setColor('#3e4448'); facePoly(D, front, ic.slice(0, n), 0.14);
    }
    // the parapet: a brick upstand with the iron railing on top, brick posts at the ends
    B.orn.setColor('#ffffff');
    band(B.orn, front, 0.1, m - 2.3, yP, yP + 0.85, 0.05, 3, 0.9); band(B.orn, front, m + 2.3, w - 0.1, yP, yP + 0.85, 0.05, 3, 0.9);
    B.brick.setColor(YEL); for (const c of [0.25, w - 0.25]) fbox(B.brick, front, c - 0.25, c + 0.25, yP, yP + 1.0, -0.3, 0.12, 63);
    // the roof: low hips behind the parapet over the main block and the back wing
    D.setColor(ROOF);
    D.fill(s.ring, [], yP - 0.05, true);
    hipF(D, front, 0.4, w - 0.4, -0.4, -10.8, yP - 0.05, 1.8);
    edges(F, yP);
    S.prism(s.ring.flat(), s.gBase, yP, 0, 0, 'wall');
    finish('belakhov', 'Будинок Белахова', B, s, yE, yE + 2.6);
  }

  // ================================================================================================ Будинок Скловського
  function sklovsky() {
    const s = site(map, ID.sklovsky, heightAt, 0.3);
    if (!s) return;
    const { F } = s, B = builders(), D = B.det;
    const front = F.filter((f) => near(f, 0, -1)).reduce((m, f) => (f.w > m.w ? f : m));
    const side = F.filter((f) => near(f, 1, 0)).reduce((m, f) => (f.w > m.w ? f : m));
    const GF = 4.0, FL = 3.8, yF = s.yF, y2 = yF + GF, y3 = y2 + FL, yE = y3 + FL;
    const YEL = '#efe3a2', GREEN = '#86b08f', SAND = '#faf3e2', SAND2 = '#e3d3b2', ROOF = '#6a5f58', WHITE = '#efefe8';
    const bays = (f, n) => spread(0.9, f.w - 0.9, n);
    const fb = bays(front, 8), sb = bays(side, 5);
    const balc = new Set([2, 5]);
    for (const [f, cs] of [[front, fb], [side, sb]]) cs.forEach((c, i) => {
      const door = f === front && (i === 2 || i === 4);
      win(f, c - 0.55, c + 0.55, door ? yF : yF + 0.9, yF + 3.0, door ? { door: true, glass: '#4b5a52', lit: false, rev: '#d8cf98' } : { glass: '#e6e3da', lit: false, rev: '#d8cf98' });
      const b2 = f === front && balc.has(i);
      win(f, c - 0.62, c + 0.62, b2 ? y2 + 0.1 : y2 + 0.75, y2 + 3.05, { frame: '#f4f2ec', door: b2 });
      win(f, c - 0.62, c + 0.62, b2 ? y3 + 0.1 : y3 + 0.75, y3 + 3.0, { frame: '#f4f2ec', door: b2 });
    });
    for (const f of F) {
      if (f === front || f === side || f.w < 4) continue;
      for (const c of bays(f, Math.max(1, Math.round(f.w / 3.2)))) for (const y of [yF + 0.9, y2 + 0.85, y3 + 0.85]) win(f, c - 0.55, c + 0.55, y, y + 1.9, { rev: '#d9d2c2' });
    }
    for (const f of F) {
      wallAround(B.render, f, s.gBase, y2, RU, YEL);
      wallAround(B.brick, f, y2, yE, BU, SAND);
      for (const q of f.open) (f === front || f === side ? fillOpening : plainOpening)(B, f, q);
      // green bands round the ground floor, a red-brown plinth, the brick string courses and dentil cornice
      D.setColor('#8c5a4c'); fbox(D, f, -0.04, f.w + 0.04, s.gBase, yF + 0.35, 0, 0.06, 1 | 16);
      D.setColor(GREEN);
      for (let y = yF + 0.8; y < y2 - 0.3; y += 0.62) {
        let from = 0;
        for (const q of [...f.open].filter((q) => q.y0 < y && q.y1 > y).sort((u, v) => u.s0 - v.s0)) { fbox(D, f, from, q.s0, y, y + 0.06, 0, 0.02, 1); from = q.s1; }
        fbox(D, f, from, f.w, y, y + 0.06, 0, 0.02, 1);
      }
      D.setColor(SAND2);
      fbox(D, f, -0.06, f.w + 0.06, y2 - 0.05, y2 + 0.3, 0, 0.14, 1 | 16 | 32);
      fbox(D, f, -0.04, f.w + 0.04, y3 - 0.05, y3 + 0.18, 0, 0.1, 1 | 16 | 32);
      fbox(D, f, -0.15, f.w + 0.15, yE - 0.3, yE, 0, 0.42, 63);
      for (let x = 0.1; x < f.w - 0.1; x += 0.38) fbox(D, f, x, x + 0.16, yE - 0.55, yE - 0.3, 0, 0.2, 1 | 4 | 8 | 32);
      fbox(D, f, -0.04, 0.55, y2, yE - 0.3, 0, 0.1, 1 | 4 | 8); fbox(D, f, f.w - 0.55, f.w + 0.04, y2, yE - 0.3, 0, 0.1, 1 | 4 | 8);
    }
    // the street fronts: green pilasters and sunrise lunettes on the ground floor, corbelled heads over the windows
    for (const [f, cs] of [[front, fb], [side, sb]]) {
      const pitch = cs.length > 1 ? cs[1] - cs[0] : 2;
      D.setColor(GREEN);
      for (let i = 0; i <= cs.length; i++) { const c = (i === 0 ? cs[0] - pitch / 2 : cs[i - 1] + pitch / 2); fbox(D, f, c - 0.2, c + 0.2, yF + 0.35, y2 - 0.05, 0, 0.08, 1 | 4 | 8); }
      B.orn.setColor('#ffffff');
      for (const c of cs) band(B.orn, f, c - 0.75, c + 0.75, yF + 3.1, yF + 3.85, 0.04, 5, 1.5);
      D.setColor(SAND2);
      for (const c of cs) for (const y of [y2 + 3.05, y3 + 3.0]) {
        fbox(D, f, c - 0.8, c + 0.8, y, y + 0.22, 0, 0.12, 1 | 4 | 8 | 16 | 32);
        for (const d of [-0.6, 0, 0.6]) fbox(D, f, c + d - 0.14, c + d + 0.14, y + 0.22, y + 0.42, 0, 0.1, 1 | 4 | 8 | 16);
        fbox(D, f, c - 0.75, c + 0.75, y - 2.3, y - 2.18, 0, 0.1, 1 | 16);
      }
    }
    // balconies on the front, the green door leaves, the memorial board by the entrance
    for (const i of balc) for (const y of [y2, y3]) {
      const c = fb[i];
      D.setColor('#9a958d'); fbox(D, front, c - 1.0, c + 1.0, y - 0.15, y + 0.05, 0, 0.95, 63);
      B.orn.setColor('#ffffff'); railing(B.orn, front, c - 1.0, c + 1.0, 0.95, y + 0.05, 1.0, 4);
      // the bay is a recess: brick cheeks either side and a lintel over it, as deep as the balcony
      B.brick.setColor(SAND); fbox(B.brick, front, c - 1.3, c - 1.0, y + 0.05, y + FL - 0.2, 0, 0.95, 1 | 4 | 8);
      fbox(B.brick, front, c + 1.0, c + 1.3, y + 0.05, y + FL - 0.2, 0, 0.95, 1 | 4 | 8);
      fbox(B.brick, front, c - 1.3, c + 1.3, y + FL - 0.45, y + FL - 0.2, 0, 0.95, 1 | 32);
    }
    D.setColor('#5e4a36'); fbox(D, front, fb[3] - 0.45, fb[3] + 0.45, yF + 1.0, yF + 2.2, 0, 0.06, 63);
    D.setColor('#3d6a9a'); fbox(D, front, fb[2] - 0.85, fb[2] + 0.85, yF + 3.1, yF + 3.18, 0, 0.9, 63); // a small canopy
    fsolid(S, front, fb[2] - 0.85, fb[2] + 0.85, 0, 0.9, yF + 3.1, yF + 3.18, 'awning', 1);
    // the roof: a low hip over the block with a steeper gabled middle, chimneys, the railing along the front eaves
    D.setColor(ROOF);
    D.fill(s.ring, [], yE - 0.02, true);
    hipF(D, front, 0.2, front.w - 0.2, 0, -side.w + 0.2, yE, 2.4);
    {   // the attic: a steep gable over the middle facing the square, its end glazed
      const f2 = { ...front, ax: front.ax - front.nx * 2.2, az: front.az - front.nz * 2.2 }, s0 = front.w * 0.34, s1 = front.w * 0.66;
      gableBack(D, f2, s0, s1, side.w - 6, yE + 0.6, 3.4, ROOF);
      D.setColor('#8a7563'); facePoly(D, f2, [[s0, yE + 0.6], [s1, yE + 0.6], [(s0 + s1) / 2, yE + 4.0]], 0);
      D.setColor('#4d5a62'); facePoly(D, f2, [[s0 + 1.6, yE + 1.0], [s1 - 1.6, yE + 1.0], [(s0 + s1) / 2, yE + 3.2]], 0.03);
      D.setColor(ROOF); fbox(D, f2, s0, s1, yE, yE + 0.6, -(side.w - 6), 0, 1 | 4 | 8 | 16);
    }
    D.setColor('#a9876a');
    for (const [sx, o] of [[front.w * 0.3, -4], [front.w * 0.55, -3], [front.w * 0.72, -8]]) fbox(D, front, sx, sx + 0.7, yE, yE + 3.3, o - 0.7, o, 63);
    B.orn.setColor('#ffffff'); band(B.orn, front, 0.2, front.w - 0.2, yE, yE + 0.7, 0.3, 4, 1.0);
    band(B.orn, side, 0.2, side.w - 0.2, yE, yE + 0.7, 0.3, 4, 1.0);
    edges(F, yE);
    S.prism(s.ring.flat(), s.gBase, yE, 0, 0, 'wall');
    finish('sklovsky', 'Будинок Скловського', B, s, yE, yE + 3.6);
  }

  // ================================================================================================ гімназія Городецького
  function horodetsky() {
    const s = site(map, ID.horodetsky, heightAt, 0.75);
    if (!s) return;
    const { F } = s, B = builders(), D = B.det;
    const zFront = Math.min(...s.ring.map((p) => p[1])), xs = s.ring.map((p) => p[0]), xMid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const mid = (f) => at(f, f.w / 2, 0);
    const ped = F.filter((f) => f.nz < -0.6 && Math.abs(f.nx) > 0.6 && mid(f)[2] < zFront + 14 && f.w > 8);     // the 45-degree pedimented fronts
    const ends = F.filter((f) => near(f, 0, -1) && mid(f)[2] < zFront + 2 && f.w > 8);                               // the end blocks' fronts
    const centre = F.filter((f) => near(f, 0, -1) && Math.abs(mid(f)[0] - xMid) < 6 && f.w > 12);
    const street = new Set([...ped, ...ends, ...centre]);
    const GF = 5.0, F2 = 5.2, yF = s.yF, y2 = yF + GF, yC = y2 + F2, yE = yC + 1.5, yPk = yE + 3.2;
    const PAINT = '#dddbd2', WHITE = '#efece2', BRICK = '#ddd0b0', GREY = '#a7aca8', ROOF = '#7b8287';
    // windows: three bays between the pilasters on the pedimented fronts, two on the end blocks, five in the middle
    const pil = (f) => [0.45, f.w * 0.31, f.w * 0.69, f.w - 0.45];
    const doorBay = (f) => (mid(f)[0] < xMid ? 0 : 2);   // the bay next to the middle front (s runs toward it on the right)
    for (const f of ped) {
      const P = pil(f);
      for (let i = 0; i < 3; i++) {
        const c = (P[i] + P[i + 1]) / 2;
        if (i === doorBay(f)) win(f, c - 0.9, c + 0.9, yF, yF + 3.3, { door: true, frame: '#6a4a33', glass: '#4b3a2c', lit: false, rev: '#d0d0c8' });
        else win(f, c - 0.85, c + 0.85, yF + 0.9, yF + 3.3, { frame: '#efefe9', pane: 0.6, rev: '#d0d0c8' });
        win(f, c - 0.95, c + 0.95, y2 + 0.8, y2 + 4.2, { frame: '#efefe9', pane: 0.65, rev: '#d0d0c8' });
      }
    }
    for (const f of ends) for (const c of [f.w * 0.3, f.w * 0.7]) {
      win(f, c - 0.85, c + 0.85, yF + 0.9, yF + 3.4, { frame: '#efefe9', pane: 0.6, rev: '#d0d0c8' });
      win(f, c - 0.9, c + 0.9, y2 + 0.8, y2 + 4.1, { frame: '#efefe9', pane: 0.6, rev: '#d0d0c8' });
    }
    for (const f of centre) for (const c of spread(1.2, f.w - 1.2, 5)) {
      win(f, c - 0.8, c + 0.8, yF + 0.9, yF + 3.4, { frame: '#efefe9', pane: 0.6, rev: '#d0d0c8' });
      win(f, c - 0.85, c + 0.85, y2 + 0.8, y2 + 4.0, { frame: '#efefe9', pane: 0.6, rev: '#d0d0c8' });
    }
    for (const f of F) {
      if (street.has(f) || f.w < 4.5) continue;
      for (const c of spread(0.6, f.w - 0.6, Math.max(1, Math.round(f.w / 3.6)))) {
        win(f, c - 0.75, c + 0.75, yF + 1.0, yF + 3.4, { rev: '#d9d2c2' });
        win(f, c - 0.75, c + 0.75, y2 + 0.9, y2 + 3.9, { rev: '#d9d2c2' });
      }
    }
    for (const f of F) {
      const st = street.has(f) || (mid(f)[2] < zFront + 14 && f.nz < 0.5);   // and the returns seen from the street
      if (ped.includes(f)) wallAround(B.render, f, s.gBase, yE, RU, PAINT);
      else if (st) { wallAround(B.render, f, s.gBase, yF + 0.6, RU, GREY); wallAround(B.brick, f, yF + 0.6, yE, BU, '#e2d5b6'); }
      else { wallAround(B.render, f, s.gBase, yF + 0.6, RU, GREY); wallAround(B.brick, f, yF + 0.6, yE, BU, BRICK); }
      for (const q of f.open) (st ? fillOpening : plainOpening)(B, f, q);
      // plinth, the string course between the floors, the cornice; the yard side keeps a plainer brick cornice
      D.setColor(GREY); fbox(D, f, -0.05, f.w + 0.05, s.gBase, yF + 0.6, 0, 0.1, 1 | 16);
      D.setColor(st ? WHITE : '#c9ab74');
      fbox(D, f, -0.05, f.w + 0.05, y2 - 0.15, y2 + 0.15, 0, 0.16, 1 | 16 | 32);
      fbox(D, f, -0.15, f.w + 0.15, yE - 0.4, yE, 0, st ? 0.6 : 0.35, 63);
      if (st && !ped.includes(f)) fbox(D, f, -0.05, f.w + 0.05, yC, yC + 0.25, 0, 0.18, 1 | 16 | 32);
    }
    // the pedimented fronts: fluted pilasters with capitals, meander panels, the triglyph frieze, the pediment
    for (const f of ped) {
      const P = pil(f), m = f.w / 2;
      for (const c of P) {
        D.setColor(WHITE); fbox(D, f, c - 0.42, c + 0.42, yF + 0.6, yC, 0, 0.3, 1 | 4 | 8);
        D.setColor('#c3c6c1'); for (const d of [-0.22, 0, 0.22]) fbox(D, f, c + d - 0.04, c + d + 0.04, yF + 1.0, yC - 0.6, 0.3, 0.31, 1);
        D.setColor(WHITE); fbox(D, f, c - 0.55, c + 0.55, yC - 0.45, yC, 0, 0.45, 63);
      }
      for (let i = 0; i < 3; i++) {
        const c = (P[i] + P[i + 1]) / 2;
        B.orn.setColor('#ffffff'); band(B.orn, f, c - 0.95, c + 0.95, yF + 3.55, yF + 4.4, 0.04, 1, 0.95);
        if (i === doorBay(f)) { D.setColor(WHITE); fbox(D, f, c - 1.2, c + 1.2, yF + 3.3, yF + 3.55, 0, 0.4, 63); }
      }
      B.orn.setColor('#ffffff'); band(B.orn, f, 0, f.w, yC, yE - 0.4, 0.05, 2, 1.55);
      D.setColor(WHITE);
      facePoly(D, f, [[-0.2, yE], [f.w + 0.2, yE], [m, yPk]], 0.2);
      facePoly(D, f, [[m - 0.9, yE + 0.6], [m + 0.9, yE + 0.6], [m + 0.6, yE + 1.7], [m - 0.6, yE + 1.7]], 0.3);   // the cartouche
      for (const [a, c] of [[[-0.5, yE], [m, yPk + 0.2]], [[m, yPk + 0.2], [f.w + 0.5, yE]]]) {
        const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, th = 0.42, nU = [-uy, ux];
        const Q = (t, k, o) => at(f, a[0] + ux * t + nU[0] * k, a[1] + uy * t + nU[1] * k, o);
        quad(D, Q(0, 0, 0.75), Q(l, 0, 0.75), Q(l, th, 0.75), Q(0, th, 0.75), f.N);
        quad(D, Q(0, th, 0.75), Q(l, th, 0.75), Q(l, th, 0), Q(0, th, 0), [f.rx * nU[0], nU[1], f.rz * nU[0]]);
        quad(D, Q(0, 0, 0.75), Q(l, 0, 0.75), Q(l, 0, 0.2), Q(0, 0, 0.2), [-f.rx * nU[0], -nU[1], -f.rz * nU[0]]);
      }
      D.setColor(ROOF); gableBack(D, f, -0.2, f.w + 0.2, 9, yE, yPk - yE, WHITE);
      // steps up to the door
      const c = (P[doorBay(f)] + P[doorBay(f) + 1]) / 2;
      D.setColor('#b5b2aa'); fbox(D, f, c - 1.6, c + 1.6, s.gBase, yF - 0.35, 0, 1.6, 1 | 4 | 8 | 16); fbox(D, f, c - 1.3, c + 1.3, s.gBase, yF, 0, 0.8, 1 | 4 | 8 | 16);
      rampSolid(S, f, c - 1.6, c + 1.6, 0, 1.6, yF, yF - 0.7, s.gBase);
    }
    // the memorial plaque to Vakhtang Chikovani: dark granite by the left pedimented front's door
    {
      const f = ped.reduce((a, b) => (mid(a)[0] < mid(b)[0] ? a : b)), c = pil(f)[1];   // on the pilaster beside the door
      D.setColor('#3a3b3d'); fbox(D, f, c - 0.34, c + 0.34, yF + 1.5, yF + 2.5, 0.3, 0.36, 63);
      D.setColor('#9c8f6c'); fbox(D, f, c - 0.2, c + 0.2, yF + 2.15, yF + 2.4, 0.36, 0.38, 1);
    }
    // the end blocks: an attic over the cornice and brackets under it; the middle front's palmette finials
    for (const f of ends) {
      B.brick.setColor('#e2d5b6'); fbox(B.brick, f, 0, f.w, yE, yE + 1.6, -1.0, 0, 1 | 4 | 8 | 16);
      D.setColor(WHITE); fbox(D, f, -0.1, f.w + 0.1, yE + 1.6, yE + 1.85, -1.0, 0.15, 63);
      for (const c of [0.6, f.w * 0.3, f.w * 0.7, f.w - 0.6]) fbox(D, f, c - 0.25, c + 0.25, yC - 0.2, yE - 0.4, 0, 0.45, 1 | 4 | 8 | 32);
      for (const c of [0.5, f.w - 0.5]) fbox(D, f, c - 0.5, c + 0.5, yF + 0.6, yE - 0.4, 0, 0.2, 1 | 4 | 8);
    }
    for (const f of centre) {
      D.setColor(WHITE);
      for (const c of spread(0.5, f.w - 0.5, 6)) {
        const p = at(f, c, 0, 0.1);
        D.cyl(p[0], yE, p[2], 0.3, 0.3, 0.2, 8, true);
        D.lathe([[0.01, yE + 0.2], [0.26, yE + 0.32], [0.3, yE + 0.6], [0.18, yE + 0.85], [0.01, yE + 1.0]], 8, p[0], p[2]);
      }
    }
    D.setColor(ROOF); D.fill(s.ring, [], yE - 0.02, true);
    edges(F, yE);
    S.prism(s.ring.flat(), s.gBase, yE, 0, 0, 'wall');
    finish('horodetsky', 'Жіноча гімназія Городецького', B, s, yE, yPk);
  }

  // ================================================================================================ тютюнова фабрика
  function tobacco() {
    const W = site(map, ID.tobW, heightAt, 0.3), T = site(map, ID.tobT, heightAt, 0.3), H = site(map, ID.tobHall, heightAt, 0.3);
    if (!W && !T && !H) return;
    const B = builders(), D = B.det, all = [W, T, H].filter(Boolean);
    // walls where two of the parts meet are inside: no windows there
    const inner = (q, f, s) => { const p = at(f, s, 0, 0.5); return all.some((o) => o !== q && inPoly(o.ring, p[0], p[2])); };
    const winT = (q, f, s0, s1, y0, y1, extra) => { if (!inner(q, f, (s0 + s1) / 2)) win(f, s0, s1, y0, y1, extra); };
    const yF = Math.max(...all.map((q) => q.gMax)) + 0.3, gBase = Math.min(...all.map((q) => q.gMin)) - 0.6;
    const FENCE = 9.5;   // the fence's line off the front: by the pavement on Дашковича
    const FL = 3.9, yE = yF + 4 * FL, yP = yE + 0.7, fl = (k) => yF + k * FL;
    const BRICK = '#e3d4a8', PINK = '#e6b8a2', PINK2 = '#d9a68f', RUB = '#a19c98', CREAM = '#ece2c6', RED = '#a8402f', ROOF = '#55595c';
    const dash = (q) => q.F.filter((f) => near(f, 0, -1) && f.w > 20);
    // the yellow brick works (west): pilaster strips, one window per bay and storey, rubble granite to the ground-floor heads
    if (W) {
      for (const f of W.F) {
        if (f.w < 4) continue;
        const front = dash(W).includes(f), n = Math.max(1, Math.round(f.w / 3.6));
        for (const c of spread(0, f.w, n)) {
          winT(W, f, c - 0.95, c + 0.95, yF + 0.5, yF + 3.0, { frame: '#f2f2ee', mull: '#f2f2ee', rev: '#bcb6ae' });
          for (let k = 1; k < 4; k++) winT(W, f, c - 0.9, c + 0.9, fl(k) + 0.7, fl(k) + 3.1, { frame: '#f2f2ee', mull: '#f2f2ee', rev: '#c7bfa9' });
        }
        wallAround(B.rubble, f, gBase, yF + 3.15, [3, 3], RUB);
        wallAround(B.brick, f, yF + 3.15, yP, BU, BRICK);
        for (const q of f.open) (front ? fillOpening : plainOpening)(B, f, q);
        B.brick.setColor(BRICK);
        for (let i = 0; i <= n; i++) { const c = i * f.w / n; fbox(B.brick, f, c - 0.3, c + 0.3, yF + 3.15, yE - 0.35, 0, 0.12, 1 | 4 | 8 | 32); fbox(B.brick, f, c - 0.18, c + 0.18, yF + 3.15, yE - 0.35, 0.12, 0.2, 1 | 4 | 8 | 32); }
        D.setColor('#bba370'); fbox(D, f, -0.05, f.w + 0.05, yE - 0.35, yE, 0, 0.3, 63);
        D.setColor('#9c9690'); fbox(D, f, -0.05, f.w + 0.05, yP - 0.08, yP, -0.3, 0.05, 63);
      }
      D.setColor(ROOF); D.fill(W.ring, [], yP - 0.6, true);
      edges(W.F, yP);
      S.prism(W.ring.flat(), gBase, yP, 0, 0, 'wall');
      footprints.push({ poly: W.ring, h: yP - W.gMin, kind: W.b.k, name: 'Тютюнова фабрика Зарицького' });
    }
    // the pink part: the front's east half and the wing into the yard; each bay between flat pilasters a broad window
    // and a narrow one, as on the photos
    let entrance = null;
    if (T) {
      const fronts = dash(T), stemEnd = T.F.filter((f) => near(f, 0, 1)).reduce((m, f) => (at(f, 0, 0)[2] > at(m, 0, 0)[2] ? f : m));
      for (const f of T.F) {
        if (f.w < 3) continue;
        const n = Math.max(1, Math.round(f.w / 3.4)), cs = spread(0, f.w, n), front = fronts.includes(f);
        if (f === stemEnd) {   // the end toward the yard: a tall stair window and the emblem
          const m = f.w * 0.62;
          for (let k = 0; k < 4; k++) win(f, m - 0.75, m + 0.75, fl(k) + 0.9, fl(k) + 3.3, { frame: '#e9e4de', lit: r() < 0.5 });
          win(f, f.w * 0.2 - 1.2, f.w * 0.2 + 1.2, yF, yF + 3.2, { door: true, glass: '#9aa2a6', lit: false, rev: '#b5aaa2' });
        } else cs.forEach((c, i) => {
          const door = front && i === Math.floor(n * 0.62);
          if (door) { win(f, c - 1.0, c + 1.0, yF, yF + 3.0, { door: true, frame: '#2e3235', glass: '#4a545b', lit: r() < 0.7 }); entrance = [f, c]; }
          else winT(T, f, c - 1.15, c + 0.25, yF + 0.6, yF + 3.0, { frame: '#e9e4de', rev: '#b5aaa2' });
          for (let k = 1; k < 4; k++) {
            winT(T, f, c - 1.15, c + 0.25, fl(k) + 0.7, fl(k) + 3.1, { frame: '#e9e4de', rev: '#c4ab9f' });
            winT(T, f, c + 0.65, c + 1.25, fl(k) + 0.7, fl(k) + 3.1, { frame: '#e9e4de', rev: '#c4ab9f', pane: 0.7 });
          }
        });
        wallAround(B.rubble, f, gBase, yF + 3.1, [3, 3], RUB);
        wallAround(B.render, f, yF + 3.1, yP, RU, PINK);
        for (const q of f.open) (front || f === stemEnd ? fillOpening : plainOpening)(B, f, q);
        D.setColor(PINK2);
        if (f !== stemEnd) for (let i = 0; i <= n; i++) { const c = i * f.w / n; fbox(D, f, c - 0.3, c + 0.3, yF + 3.1, yE - 0.3, 0, 0.1, 1 | 4 | 8 | 32); }
        fbox(D, f, -0.05, f.w + 0.05, yE - 0.3, yE, 0, 0.25, 63);
        if (f === stemEnd) {
          const p = f.w * 0.25;
          B.orn.setColor('#ffffff'); strip(B.orn, at(f, p - 1.3, 0, 0.06), at(f, p + 1.3, 0, 0.06), yE - 3.4, yE - 0.8, f.N, 6, 1, 0.25, 0.75);
          D.setColor('#d7d2cc'); fbox(D, f, f.w * 0.62 - 0.12, f.w * 0.62 + 0.12, yP, yP + 1.6, -1.2, -0.95, 63);   // the old chimney stub
        }
      }
      if (entrance) {   // the ЦНАП canopy over the door (left without lettering)
        const [f, c] = entrance;
        D.setColor('#2c3033'); fbox(D, f, c - 2.8, c + 2.8, yF + 3.2, yF + 3.85, 0, 3.2, 63);
        fsolid(S, f, c - 2.8, c + 2.8, 0, 3.2, yF + 3.2, yF + 3.85, 'awning', 1);
        for (const d of [-2.5, 2.5]) { const p = at(f, c + d, 0, 2.95); D.cyl(p[0], gBase, p[2], 0.09, 0.09, yF + 3.2 - gBase, 8, false); S.cyl(p[0], p[2], gBase, yF + 3.2, 0.12); }
        D.setColor('#f2efe6'); for (const d of [-1.6, 1.6]) { const p = at(f, c + d, 0, 0.5); D.cyl(p[0], yF + 2.4, p[2], 0.04, 0.04, 0.5, 6, false); D.ellipsoid([p[0], yF + 3.0, p[2]], [0.2, 0.2, 0.2], 8, 6); }
        D.setColor('#a39d96'); fbox(D, f, c - 2.2, c + 2.2, gBase, yF, 0, 2.6, 1 | 4 | 8 | 16);
        rampSolid(S, f, c - 2.2, c + 2.2, 0, 2.6, yF, yF - 0.35, gBase);
      }
      D.setColor(ROOF); D.fill(T.ring, [], yP - 0.6, true);
      edges(T.F, yP);
      S.prism(T.ring.flat(), gBase, yP, 0, 0, 'wall');
      footprints.push({ poly: T.ring, h: yP - T.gMin, kind: T.b.k, name: 'Тютюнова фабрика Зарицького' });
    }
    // the hall on the corner: cream walls, a row of windows high up, the red roof, the red canopy along Благовісна
    if (H) {
      const yH = yF + 8.6, bl = H.F.filter((f) => near(f, 1, 0)).reduce((m, f) => (f.w > m.w ? f : m));
      for (const f of H.F) {
        if (f.w < 4) continue;
        for (const c of spread(0.8, f.w - 0.8, Math.max(1, Math.round(f.w / 3.4)))) {
          winT(H, f, c - 0.75, c + 0.75, yF + 5.6, yF + 7.4, { frame: '#f4f2ea', rev: '#d8d0bc' });
          if (f !== bl) winT(H, f, c - 0.75, c + 0.75, yF + 1.0, yF + 2.9, { rev: '#d8d0bc', lit: r() < 0.2 });
        }
        if (f === bl) for (const c of spread(4, f.w - 4, 4)) win(f, c - 1.6, c + 1.6, yF, yF + 3.6, { door: true, glass: '#7e8488', lit: false, rev: '#cfc8b6' });
        wallAround(B.render, f, gBase, yH, RU, CREAM);
        for (const q of f.open) (f === bl ? fillOpening : plainOpening)(B, f, q);
        D.setColor('#d5c8a6'); fbox(D, f, -0.05, f.w + 0.05, gBase, yF + 0.5, 0, 0.06, 1 | 16);
        fbox(D, f, -0.1, f.w + 0.1, yH - 0.35, yH, 0, 0.3, 63);
        for (let i = 0; i <= Math.round(f.w / 6); i++) { const c = i * f.w / Math.round(f.w / 6); fbox(D, f, c - 0.35, c + 0.35, yF + 0.5, yH - 0.35, 0, 0.15, 1 | 4 | 8); }
      }
      // the canopy: a red sheet-metal roof on red posts with braces, sloping down from the wall
      {
        const f = bl, s0 = 1.0, s1 = f.w * 0.62, d = 6.5, yHi = yF + 5.0, yLo = yF + 4.1;
        D.setColor(RED);
        quad(D, at(f, s0, yHi, 0), at(f, s1, yHi, 0), at(f, s1, yLo, d), at(f, s0, yLo, d), [f.nx * 0.14, 0.99, f.nz * 0.14]);
        quad(D, at(f, s0, yHi - 0.12, 0), at(f, s1, yHi - 0.12, 0), at(f, s1, yLo - 0.12, d), at(f, s0, yLo - 0.12, d), [-f.nx * 0.14, -0.99, -f.nz * 0.14]);
        fbox(D, f, s0, s1, yLo - 0.7, yLo, d - 0.1, d, 1 | 16 | 32);
        for (const c of spread(s0, s1, 5).concat([s0 + 0.15, s1 - 0.15])) {
          const p = at(f, c, 0, d - 0.15);
          D.box(p[0] - 0.1, gBase, p[2] - 0.1, p[0] + 0.1, yLo, p[2] + 0.1);
          D.tube(at(f, c, yF + 0.4, d - 0.15), at(f, c, yLo - 0.7, d - 2.4), 0.06);
          S.cyl(p[0], p[2], gBase, yLo, 0.14);
        }
        fsolid(S, f, s0, s1, 0, d, yLo - 0.7, yHi, 'awning', 1);
      }
      D.setColor(RED);
      const front = H.F.filter((f) => near(f, 0, -1)).reduce((m, f) => (f.w > m.w ? f : m));
      // a low hip over each arm of the L, both from the front face's frame
      const side = H.F.filter((f) => near(f, 1, 0)).reduce((m, f) => (f.w > m.w ? f : m));
      hipF(D, front, -0.2, front.w + 0.2, 0.2, -side.w * 0.57, yH, 2.2);
      hipF(D, side, 0.0, side.w * 0.5, 0.2, -front.w * 0.56, yH, 2.0);
      D.setColor('#8a8478'); D.fill(H.ring, [], yH - 0.02, true);
      edges(H.F, yH);
      S.prism(H.ring.flat(), gBase, yH, 0, 0, 'wall');
      footprints.push({ poly: H.ring, h: yH + 2.2 - H.gMin, kind: H.b.k, name: 'Тютюнова фабрика Зарицького' });
    }
    // the black steel fence along the forecourt on Дашковича, with gates at the entrance and the yard drive
    const fronts = [...(W ? dash(W) : []), ...(T ? dash(T) : [])];
    B.orn.setColor('#ffffff');
    for (const f of fronts) {
      const gaps = [];
      if (entrance && entrance[0] === f) gaps.push([entrance[1] - 2.6, entrance[1] + 2.6]);
      let from = 0;
      for (const [g0, g1] of [...gaps, [f.w + 0.1, f.w + 0.1]]) {
        // in panels of ~2.5 m, each standing on the ground at its lower end
        const n = Math.ceil((g0 - from) / 2.5);
        for (let i = 0; i < n && g0 - from > 0.5; i++) {
          const a = at(f, from + (g0 - from) * i / n, 0, FENCE), b = at(f, from + (g0 - from) * (i + 1) / n, 0, FENCE);
          const y0 = Math.min(heightAt(a[0], a[2]), heightAt(b[0], b[2])) - 0.05;
          strip(B.orn, a, b, y0, y0 + 1.2, f.N, 4, 1.0, i * (g0 - from) / n);
          S.prism([a[0] - f.nx * 0.05, a[2] - f.nz * 0.05, b[0] - f.nx * 0.05, b[2] - f.nz * 0.05, b[0] + f.nx * 0.05, b[2] + f.nz * 0.05, a[0] + f.nx * 0.05, a[2] + f.nz * 0.05], y0 - 0.5, y0 + 1.2, 0, 0, 'fence');
        }
        from = g1;
      }
    }
    const st = pack(root, 'quest-tobacco', B, M);
    parts.tobacco = { group: st.group, verts: st.verts, meshes: st.meshes, floor: yF, eaves: yE };
    for (const q of all) {
      const xs = q.ring.map((p) => p[0]), zs = q.ring.map((p) => p[1]);
      boxes.push([Math.min(...xs) - 2, Math.min(...zs) - 8, Math.max(...xs) + 2, Math.max(...zs) + 2]);
    }
  }

  const stats = Object.entries(parts).map(([k, p]) => `${k} ${(p.verts / 1000).toFixed(1)}k/${p.meshes}`).join(', ');
  console.log(`[cherkasy] quest centre: ${stats}, ${(S.count ?? 0) - n0} solids, in ${(performance.now() - t0).toFixed(0)} ms`);
  if (!footprints.length) return null;
  return {
    footprints, parts,
    // no generated trees on the lots and the forecourts
    clear: (x, z) => boxes.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1),
    update() { M.lit.emissiveIntensity = 1.1 * nightK.value; },
  };
}
