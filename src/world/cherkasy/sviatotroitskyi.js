// OWNER: cherkasy. ЖК «Святотроїцький», бульвар Шевченка, 202 (OSM way 997523173, tagged construction=yes): the
// 26-storey tower of Добро-Буд on the corner of the boulevard and Святотроїцька, built as the developer's renders on
// lun.ua show it (due in 2027). An L of two sections over the whole OSM outline: one arm along the boulevard, one along
// Святотроїцька, meeting in the corner to the crossing, which is rounded the whole height as a quarter-cylinder of
// bronze curtain glazing. Under it a four-level black-framed glass podium for shops and cafés under a thick black
// cornice, the parking levels behind louvres on the yard side of the Святотроїцька arm. The flats storeys are white
// render with dark-framed windows and stacks of small dark balconies; the end towards Любава is dark brown with a white
// balcony stack in its middle; the top storeys are clad dark, reaching lower round the corner, and an open dark frame
// crowns the roof: a shoulder over the west end, its crest over the round corner, a rise again at the Любава end. On the
// roof the residents' terrace: planters, green funnel canopies, lift rooms. No shop signs, no developer marks.
//   SVIATO_SKIP: the OSM id replaced here (buildings.js skips its extrusion)
//   buildSviatotroitskyi({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, top } | null
//     top: the height of the tower's roof deck (tests)
// The facades are one painted atlas of storey-high bay tiles (white window / white door / curtain glass / dark window
// / shopfront / dark door / louvre), one quad per bay per storey; the lit ones go to a second mesh whose emissive mask
// is the glass. Balconies, fins, bands, cornice and crown are boxes in an edge frame (slabkit.js).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng } from './geo.js';
import { ringFaces, at, quad, box, solid, finish } from './slabkit.js';

const OSM_ID = 997523173;
export const SVIATO_SKIP = new Set([OSM_ID]);

// the lot in map metres (from the OSM outline): the podium fills it, the tower stands on its boulevard half
const XW = -93.4, XE = -76.3, ZS = -341.2, ZN = -289.4, XWING = -117.0, ZWING = -325.8;
const RP = 9.0, RT = 6.5, INSET = 1.2;            // podium / tower corner radius; the tower steps in from the street
const GF = 5.0, PL = 3.6, NPL = 3, FH = 3.1, NF = 22, CAP = 6; // ground floor, podium levels, flats storeys, dark top storeys
const CORN = 1.2, PARA = 1.1, BAY = 3.0;            // cornice, roof parapet, bay
const WHITE = '#ece7dc', DARK = '#2a2624', BROWN = '#3d322c', BLACK = '#18181a', RAIL = '#262628';

// atlas tiles, one storey x one bay each
const T = { WIN: 0, DOOR: 1, GLASS: 2, DWIN: 3, SHOP: 4, DDOOR: 5, LOUVRE: 6 }, NT = 7, TW = 128, TH = 256;

function atlas(mask) {
  return canvasTex(NT * TW, TH, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // fractions of the tile: x0 x1 across, y0 y1 up from the floor
    const pane = (t, x0, x1, y0, y1, frame, glassTop, glassBot, mull = true, tr = 0) => {
      const X = t * TW, a = X + x0 * TW, b = X + x1 * TW, top = TH * (1 - y1), bot = TH * (1 - y0);
      if (mask) { fill('#fff', a, top, b - a, bot - top); return; }
      const gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, glassTop); gr.addColorStop(1, glassBot);
      fill(frame, a - 4, top - 4, b - a + 8, bot - top + 8); g.fillStyle = gr; g.fillRect(a, top, b - a, bot - top);
      g.fillStyle = frame; if (mull) g.fillRect((a + b) / 2 - 2, top, 4, bot - top);
      if (tr) g.fillRect(a, TH * (1 - tr) - 2, b - a, 4);
    };
    const wall = (t, c) => { fill(mask ? '#000' : c, t * TW, 0, TW, TH); if (!mask) fill('rgba(0,0,0,0.10)', t * TW, TH - 3, TW, 3); };
    wall(T.WIN, WHITE); pane(T.WIN, 0.2, 0.8, 0.3, 0.88, '#2d2c2e', '#9aa5ac', '#4b555c');
    wall(T.DOOR, WHITE); pane(T.DOOR, 0.24, 0.76, 0.02, 0.88, '#2d2c2e', '#9aa5ac', '#4b555c', true, 0.72);
    wall(T.DWIN, BROWN); pane(T.DWIN, 0.2, 0.8, 0.3, 0.88, '#1c1a19', '#8e979c', '#3f474c');
    wall(T.DDOOR, BROWN); pane(T.DDOOR, 0.24, 0.76, 0.02, 0.88, '#1c1a19', '#8e979c', '#3f474c', true, 0.72);
    // the round corner: bronze curtain glass in a black grid, a deep spandrel at the slab
    wall(T.GLASS, BLACK); pane(T.GLASS, 0.05, 0.95, 0.12, 0.97, BLACK, '#b49c7c', '#6b5843', false, 0.8);
    // shopfront: black frame, the thin white mullion of the renders
    wall(T.SHOP, BLACK); pane(T.SHOP, 0.06, 0.94, 0.06, 0.95, BLACK, '#8f8b84', '#4f4a43', false);
    if (!mask) { fill('#e8e4da', T.SHOP * TW + TW * 0.5 - 2, TH * 0.05, 4, TH * 0.89); fill('#e8e4da', T.SHOP * TW + TW * 0.06, TH * 0.24, TW * 0.88, 3); }
    wall(T.LOUVRE, '#2c2c2e');
    if (!mask) for (let y = 14; y < TH - 10; y += 11) { fill('#4a4a4d', T.LOUVRE * TW + 6, y, TW - 12, 5); fill('#18181a', T.LOUVRE * TW + 6, y + 5, TW - 12, 2); }
  }, { repeat: false });
}

// map ring of a rectangle with its south-east corner (x1, z0) rounded: the corner at the boulevard crossing
function rounded(x0, x1, z0, z1, R, segs = 8, wing = null) {
  const cx = x1 - R, cz = z0 + R, P = wing ? [[wing[0], z0], [x0, z0]] : [[x0, z0]]; // the wing's corner splits the south face
  for (let i = 0; i <= segs; i++) { const a = -Math.PI / 2 + Math.PI / 2 * i / segs; P.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); }
  P.push([x1, z1], [x0, z1]);
  if (wing) P.push([x0, wing[1]], [wing[0], wing[1]]);
  return P;
}

export function buildSviatotroitskyi({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((b) => b.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const pod = rounded(XW, XE, ZS, ZN, RP, 8, [XWING, ZWING]);
  const tow = rounded(XW, XE - INSET, ZS + INSET, ZN, RT, 8, [XWING, ZWING]);
  const hs = pod.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...hs), gHi = Math.max(...hs);
  const yF = gHi + 0.15, gB = gLo - 0.6, PTOP = yF + GF + NPL * PL, CTOP = PTOP + CORN, ROOF = PTOP + NF * FH, TOP = ROOF + PARA;
  const B = { tile: new MB(), lit: new MB(), det: new MB(), roof: new MB() }, D = B.det;
  const u0 = (t) => (t * TW + 1.5) / (NT * TW), u1 = (t) => ((t + 1) * TW - 1.5) / (NT * TW);
  // one bay tile on face f over s0..s1, y0..y1, standing o off the wall
  const tile = (f, t, s0, s1, y0, y1, on, o = 0) => {
    const M = on ? B.lit : B.tile; M.setColor(on ? '#ffffff' : '#f4f4f4');
    quad(M, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[u0(t), 0], [u1(t), 0], [u1(t), 1], [u0(t), 1]]);
  };
  const cx = XE - INSET - RT, cz = ZS + INSET + RT, onArc = (f) => f.L < 2.5 && Math.hypot(f.ax - cx, f.az - cz) < RT + 0.3;
  let nTiles = 0, nBal = 0, nLit = 0;

  // ---- tower: 22 storeys from the podium roof
  // the crown and the dark top follow the street front, s metres from the wing's west end round the corner to Любава:
  // a small shoulder over the wing, the crest over the round corner, a rise again at the north end
  const sOf = (x, z) => (x < XW - 0.1 || z < cz ? x - XWING : XE - XWING + z - ZS);
  const bump = (s, c, w) => Math.exp(-(((s - c) / w) ** 2)), SC = XE - XWING;
  const crownH = (s) => 2.4 + 1.3 * bump(s, 10, 7) + 3.0 * bump(s, SC, 15) + 1.5 * bump(s, SC + ZN - ZS, 14);
  const capOf = (s) => NF - CAP - Math.round(4 * bump(s, SC, 24));
  for (const f of ringFaces(tow)) {
    const arc = onArc(f), north = Math.abs(f.nz - 1) < 0.01 && Math.abs(f.az - ZN) < 0.1;
    const n = arc ? 1 : Math.max(1, Math.round(f.L / BAY)), w = f.L / n, mid = (n - 1) / 2;
    const sAt = (s) => { const p = at(f, s, 0); return sOf(p[0], p[2]); };
    for (let k = 0; k < NF; k++) {
      const y0 = PTOP + k * FH;
      for (let i = 0; i < n; i++) {
        const cap = k >= capOf(sAt((i + 0.5) * w)), dark = cap || north;
        const s0 = i * w, s1 = s0 + w, balc = !arc && (north ? i === Math.round(mid) : i % 3 !== 0) && n > 1; // balconies in pairs: broad stacks between window columns
        const t = arc ? T.GLASS : balc ? (dark ? T.DDOOR : T.DOOR) : dark ? T.DWIN : T.WIN;
        const on = r() < (arc ? 0.4 : 0.28); nLit += on; nTiles++;
        tile(f, t, s0, s1, y0, y0 + FH, on);
        // a balcony: dark railing box (white in the stack of the north end); a pair shares one box, a broad loggia band
        const pair = !north && i % 3 === 1 && i + 1 < n;
        if (balc && !(!north && i % 3 === 2 && i > 0)) {
          const [a, b] = north ? [(s0 + s1) / 2 - Math.min(0.85, w * 0.32), (s0 + s1) / 2 + Math.min(0.85, w * 0.32)] : [s0 + 0.15, (pair ? s1 + w : s1) - 0.15];
          D.setColor(north && !cap ? WHITE : RAIL); box(D, f, a, b, y0 - 0.12, y0 + 1.05, 0, 0.5, 'flrtu');
          nBal++;
        }
      }
    }
    // the open crown frame: posts and a rail riding the wave; a solid parapet behind it
    const np = arc ? 1 : Math.max(1, Math.round(f.L / 4.5));
    D.setColor(DARK); box(D, f, 0, f.L, ROOF, TOP, -0.25, 0.05, 'fbt');
    for (let i = 0; i <= np; i++) {
      if (i === np || (arc && f.k % 2)) continue; // the next face's first post stands in the corner; every other one round the arc
      const s = f.L * i / np, h = crownH(sAt(s)), hw = arc ? 0.2 : 0.32;
      box(D, f, s - hw, s + hw, ROOF, ROOF + h, -0.05, 0.4, 'flrb');
    }
    for (let i = 0; i < np; i++) {
      const sa = f.L * i / np, sb = f.L * (i + 1) / np, ha = ROOF + crownH(sAt(sa)), hb = ROOF + crownH(sAt(sb));
      const p = (s, y, o) => at(f, s, y, o);
      quad(D, p(sa, ha - 0.55, 0.4), p(sb, hb - 0.55, 0.4), p(sb, hb, 0.4), p(sa, ha, 0.4), f.N);          // front
      quad(D, p(sa, ha - 0.55, -0.05), p(sb, hb - 0.55, -0.05), p(sb, hb, -0.05), p(sa, ha, -0.05), f.N.map((v) => -v)); // back
      quad(D, p(sa, ha, -0.05), p(sb, hb, -0.05), p(sb, hb, 0.4), p(sa, ha, 0.4), [0, 1, 0]);              // top
      quad(D, p(sa, ha - 0.55, -0.05), p(sb, hb - 0.55, -0.05), p(sb, hb - 0.55, 0.4), p(sa, ha - 0.55, 0.4), [0, -1, 0]);
    }
    if (f.L > 1) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz); }
  }
  B.roof.setColor('#77746f'); B.roof.fill(tow, [], ROOF + 0.02, true);
  S.prism(tow.flat(), CTOP - 0.5, TOP, 0, 0, 'wall');

  // ---- podium: four levels of black-framed glass, louvres over the parking wing, a thick cornice round it all
  const lv = [[yF, yF + GF], ...Array.from({ length: NPL }, (_, k) => [yF + GF + k * PL, yF + GF + (k + 1) * PL])];
  for (const f of ringFaces(pod)) {
    const wing = f.ax + f.ux * f.L / 2 < XW - 0.5 && f.nz > -0.5; // the wing's yard and end walls hide the parking
    const arc = f.L < 2.5, n = arc ? 1 : Math.max(1, Math.round(f.L / 3.2)), w = f.L / n;
    for (const [k, [y0, y1]] of lv.entries()) {
      for (let i = 0; i < n; i++) {
        const t = wing && k > 0 ? T.LOUVRE : T.SHOP, on = t === T.SHOP && r() < (k ? 0.5 : 0.8);
        tile(f, t, i * w, (i + 1) * w, y0, y1, on); nTiles++; nLit += on;
      }
      D.setColor(BLACK); box(D, f, arc ? -0.05 : 0, arc ? f.L + 0.05 : f.L, y1 - 0.25, y1 + 0.25, 0, 0.35, 'ftu'); // slab band
    }
    D.setColor(BLACK); box(D, f, 0, f.L, gB, yF, 0, 0.1, 'ft'); // plinth
    if (!arc) for (let i = 0; i <= n; i++) { const s = Math.min(f.L - 0.18, Math.max(0.18, i * w)); box(D, f, s - 0.18, s + 0.18, yF, PTOP, 0, 0.45, 'flr'); }
    const ext = arc ? 0.12 : 0.7; // the cornice's straight runs overlap into the corners
    box(D, f, -ext, f.L + ext, PTOP, CTOP, -0.2, 0.7, 'ftu');
    if (f.L > 1) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], CTOP, f.nx, f.nz); }
  }
  B.roof.setColor('#6b6964'); B.roof.fill(pod, [], CTOP - 0.05, true);
  S.prism(pod.flat(), gB, CTOP, 0, 0, 'wall');

  // the residents' door on the yard (west) side under a dark canopy
  { const f = ringFaces(pod).find((q) => q.nx < -0.99 && q.L > 20); if (f) {
    const sc = f.L * 0.55; D.setColor(DARK); box(D, f, sc - 2, sc + 2, yF + 3.4, yF + 3.7, 0, 2.2, 'ftlru');
    solid(S, f, sc - 2, sc + 2, 0, 2.2, yF + 3.4, yF + 3.7, 'awning', 1);
  } }

  // ---- the roof: lift rooms, terrace planters, three green funnel canopies
  const R = B.roof, rx = (XW + XE - INSET) / 2;
  R.setColor('#e9e7e1'); R.box(rx - 3.5, ROOF, ZN - 14, rx + 3.5, ROOF + 3.6, ZN - 6, 63);
  S.box(rx - 3.5, ROOF, ZN - 14, rx + 3.5, ROOF + 3.6, ZN - 6, 'equipment');
  R.setColor('#cfccc4'); R.box(rx - 2, ROOF, ZN - 26, rx + 2.5, ROOF + 2.2, ZN - 22, 63);
  for (const [x, z] of [[XWING + 8, ZS + 8], [rx + 3.5, ZS + 24], [rx - 3, ZS + 30]]) {
    R.setColor('#4a4744'); R.cyl(x, ROOF, z, 0.18, 0.18, 2.6, 6, false);
    R.setColor('#4f9a3c'); R.cyl(x, ROOF + 2.0, z, 0.25, 2.2, 0.9, 14, true);
  }
  for (const [x0, z0, x1, z1] of [[XW + 1.5, ZS + 12, XW + 2.5, ZS + 34], [XE - INSET - 2.6, ZS + 14, XE - INSET - 1.6, ZS + 36], [rx - 2, ZS + 37, rx + 3, ZS + 38]]) {
    R.setColor('#2e2c2b'); R.box(x0, ROOF, z0, x1, ROOF + 0.7, z1, 63);
    R.setColor('#557d3a'); R.box(x0 + 0.08, ROOF + 0.7, z0 + 0.08, x1 - 0.08, ROOF + 1.1, z1 - 0.08, 4);
  }

  const tex = atlas(false), mask = atlas(true);
  const M = {
    tile: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.55, metalness: 0.1 }),
    lit: new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.5, metalness: 0.1, emissive: 0xffc890, emissiveMap: mask, emissiveIntensity: 0 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.15 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  };
  const out = finish(root, 'sviatotroitskyi', B, M, { shade: ['tile', 'lit', 'det'] });
  console.log(`[cherkasy] ZhK Sviatotroitskyi: ${nTiles} bay tiles (${nLit} lit), ${nBal} balconies, roof ${(ROOF - yF).toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    top: ROOF,
    footprints: [{ poly: pod.map((p) => [p[0], p[1]]), h: TOP - gLo, kind: 'apt', name: 'бульвар Шевченка, 202' }],
    clear: (x, z) => x > XWING - 2 && x < XE + 2 && z > ZS - 2 && z < ZN + 1.5,
    update() { M.lit.emissiveIntensity = 0.85 * nightK.value; },
  };
}
