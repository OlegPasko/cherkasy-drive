// OWNER: cherkasy. The nine-storey block at вулиця Байди Вишневецького, 19 (OSM relation 6286345) with its one-storey
// shop annex (OSM way 422816412), where CatCafe – the city's cat café – has its door; rebuilt on a player's idea (issue
// #20). The block is a bar with a wing bent toward the street: walls of pale sand-lime brick, windows in bays of three
// metres, stacks of glazed loggias that stand out a metre on cream-yellow fronts, a white sloped cap over the stack on
// the street end. The annex runs along the yard side under a red-granite plinth: on the wing face a strip of shops up a
// few steps – CatCafe at the rounded corner (cream piers, two big windows and a white door under a charcoal fascia
// with the white «CATCafé» lettering and the cat sitting on its C), then a green unit and a dark one – and plainer shop
// fronts on the bar face. References: the Google Maps photo of the café front (2024) and Street View (2015).
//   CATCAFE_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildCatCafe({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls are laid per ring edge in a face frame (slabkit.js): s along the edge, y up, o outward. The block's ring keeps
// the OSM order: 0 west end, 1 and 2 the yard fronts, 3 the street end, 4 and 5 behind the annex, 6 a short return.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, bboxOf } from './geo.js';
import { canvasTex } from './sculpt.js';
import { brickTex } from './civic.js';
import { ringFaces, at, rect, box, skin, hole, solid, finish, speckle, label } from './slabkit.js';

const BLOCK = 6286345, ANNEX = 422816412;
export const CATCAFE_SKIP = new Set([BLOCK, ANNEX]);

const GF = 3.6, FH = 2.8, NF = 9, PARA = 0.8;         // ground storey, upper storeys, storeys, parapet
const AH = 4.0, LIFT = 0.65, BAY = 3.0, LOG = 1.05;   // annex roof over the shop floor, shop floor over the pavement, bay, loggia reach
const BRICK = '#ece0c4', LOGF = '#e4cf9c', WHITE = '#f1f0ea', GRAN = '#7b4b40', CHAR = '#34373c', CREAM = '#efe7d2';
const GLASS = ['#56636c', '#4b5760', '#5f6b72', '#46525a'];

// the café lettering, 1024 x 512, transparent: a cat sitting on the C, «AT» and a script «Café» in the top half, the
// two window stickers («КАВА З СОБОЮ», «ТОВАРИ ДЛЯ ВУСАТИХ») side by side in the bottom half
const LOGO = [0, 0, 1, 0.5], STICK = [[0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
const signTex = () => canvasTex(1024, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 54px Arial, Helvetica, sans-serif';
  g.fillText('КАВА', 256, 340); g.fillText('З СОБОЮ', 256, 410);
  g.fillText('ТОВАРИ', 768, 320); g.fillText('ДЛЯ', 768, 380); g.fillText('ВУСАТИХ', 768, 440);
  g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
  // the C as the cat's curled back, ears and a tail curling out of its foot
  g.lineWidth = 26; g.beginPath(); g.arc(130, 150, 78, Math.PI * 0.32, Math.PI * 1.62); g.stroke();
  g.beginPath(); g.moveTo(92, 82); g.lineTo(104, 30); g.lineTo(128, 70); g.lineTo(156, 34); g.lineTo(160, 86); g.closePath(); g.fill();
  g.lineWidth = 12; g.beginPath(); g.moveTo(178, 214); g.quadraticCurveTo(232, 214, 222, 168); g.stroke();
  g.font = 'bold 168px Georgia, "Times New Roman", serif'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.fillText('AT', 222, 220);
  g.font = 'italic 150px Georgia, "Times New Roman", serif'; g.fillText('Café', 520, 214);
}, { repeat: false, aniso: 16 });

export function buildCatCafe({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === BLOCK), anx = map.buildings.find((q) => q.id === ANNEX);
  if (!bld) return null;
  const t0 = performance.now(), r = rng(BLOCK % 65521), n0 = S.count;
  const ring = ringPts(bld.p), faces = ringFaces(ring), aring = anx ? ringPts(anx.p) : null;
  const hs = [...ring, ...(aring ?? [])].map((p) => heightAt(p[0], p[1])), gLo = Math.min(...hs);
  // the annex faces (the edges against the block are left out) and the shop floor: LIFT over the shop strip's pavement
  const inside = (f) => faces.some((g) => Math.abs(g.nx * f.nx + g.nz * f.nz + 1) < 0.02 && Math.abs((f.ax - g.ax) * g.nx + (f.az - g.az) * g.nz) < 0.4);
  const af = aring ? ringFaces(aring).filter((f) => !inside(f)) : [], [wing, bar] = af.filter((f) => f.L > 20).sort((a, b) => b.L - a.L);
  const gAt = (f, s, o) => { const p = at(f, s, 0, o); return heightAt(p[0], p[2]); };
  const yF = (wing ? Math.max(...[0.1, 0.5, 0.9].map((t) => gAt(wing, wing.L * t, 0.5))) : Math.max(...hs)) + LIFT, Y = (h) => yF + h, ROOF = Y(GF + (NF - 1) * FH), TOP = ROOF + PARA, gB = gLo - 0.5;
  const B = { wall: new MB(), brick: new MB(), det: new MB(), lit: new MB(), glass: new MB(), sign: new MB() };
  const D = B.det, UVB = [2.0, 2.1], UVW = [2.5, 2.5];
  const fy = (k) => (k ? Y(GF + (k - 1) * FH) : Y(0));  // floor level of storey k
  const win = (f, s0, s1, y0, y1, extra) => f.cuts.push({ s0, s1, y0, y1, glass: GLASS[(r() * GLASS.length) | 0], lit: r() < 0.35, frame: WHITE, rev: '#d6d1c4', dep: 0.22, pitch: 1.0, ...extra });
  let nWin = 0, nLog = 0;

  // ---- the block: bays of windows, loggia stacks on the long fronts, the street end with its stack at the left
  const behind = new Set([4, 5]);                        // the annex hides their ground storey
  for (const f of faces) {
    const nb = Math.max(1, Math.round(f.L / BAY)), p = f.L / nb;
    f.logs = [];
    if (f.k === 3) f.logs.push([f.L - 4.6, f.L - 0.3]);   // the street end: one stack by the yard corner
    else if (f.L > 20) for (let i = 1; i < nb - 1; i += 3) f.logs.push([i * p + 0.25, (i + 1) * p - 0.25]);
    for (let i = 0; i < nb; i++) {
      const m = (i + 0.5) * p;
      if (f.logs.some(([a, b]) => m > a && m < b)) continue;
      const w = f.L < 6 ? 0.9 : 1.5;
      if (f.L < 2) continue;
      for (let k = 1; k < NF; k++) win(f, m - w / 2, m + w / 2, fy(k) + 0.85, fy(k) + 2.3, { sill: WHITE });
      const g0 = Math.max(Y(1.0), gAt(f, m, 1) + 0.4);
      if (!behind.has(f.k) && f.L > 6 && Y(GF - 0.9) - g0 > 0.8) win(f, m - w / 2, m + w / 2, g0, Y(GF - 0.9), { sill: WHITE });
    }
    // an entrance from the yard on the long yard front: a door and a canopy
    const yd = Math.max(Y(0), gAt(f, f.L / 2, 1.5) + 0.1);
    if (f.k === 1) f.cuts.push({ s0: f.L * 0.5 - 0.8, s1: f.L * 0.5 + 0.8, y0: yd, y1: yd + 2.3, glass: '#3a3f44', frame: '#6c6f72', rev: '#c9c4b8', dep: 0.25, door: true, pitch: 0.8 });
    nWin += f.cuts.length;
    skin(B.brick, f, gB, TOP, BRICK, UVB);
    for (const q of f.cuts) hole(B, f, q);
    D.setColor('#c8c2b4'); box(D, f, -0.02, f.L + 0.02, gB, Y(0.4), 0, 0.06, 'ft');           // plinth
    D.setColor('#d9d4c7'); rect(D, f, 0, f.L, ROOF, TOP, -0.3, null, [-f.nx, 0, -f.nz]);       // parapet, inner face
    D.setColor('#9a9894'); box(D, f, -0.03, f.L + 0.03, TOP, TOP + 0.06, -0.3, 0.05, 'ft');    // coping
    for (let k = 1; k < NF; k++) { D.setColor('#d2ccbd'); box(D, f, 0, f.L, fy(k) - 0.06, fy(k) + 0.06, 0, 0.03, 'f'); } // floor bands
    if (f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], TOP, f.nx, f.nz); }
    // the loggias: a slab per storey, cream-yellow solid front to sill height, white-framed glazing over it
    for (const [a, b] of f.logs) {
      const k0 = behind.has(f.k) ? 2 : 1;
      for (let k = k0; k < NF; k++) {
        const y = fy(k);
        D.setColor('#c9c4b6'); box(D, f, a, b, y - 0.18, y, 0, LOG, 'tu' + 'lr');
        B.wall.setColor(LOGF); box(B.wall, f, a, b, y, y + 1.0, LOG - 0.08, LOG, 'fblr', UVW);
        B.wall.setColor(LOGF); for (const s of [a, b - 0.08]) box(B.wall, f, s, s + 0.08, y, y + 1.0, 0, LOG - 0.08, 'flr', UVW);
        const G = r() < 0.35 ? B.lit : B.glass;
        G.setColor(GLASS[(r() * GLASS.length) | 0]); box(G, f, a + 0.05, b - 0.05, y + 1.0, y + FH - 0.25, 0, LOG - 0.04, 'flr');
        D.setColor(WHITE);
        const n = Math.max(2, Math.round((b - a) / 0.75));
        for (let i = 0; i <= n; i++) { const s = a + 0.05 + (b - a - 0.1) * i / n; box(D, f, s - 0.03, s + 0.03, y + 1.0, y + FH - 0.25, LOG - 0.05, LOG - 0.01, 'f'); }
        box(D, f, a + 0.05, b - 0.05, y + 1.0, y + 1.06, LOG - 0.05, LOG - 0.01, 'ft'); box(D, f, a + 0.05, b - 0.05, y + FH - 0.31, y + FH - 0.25, LOG - 0.05, LOG - 0.01, 'f');
        nLog++;
      }
      D.setColor('#c9c4b6'); box(D, f, a, b, ROOF - 0.18, ROOF, 0, LOG, 'tlr');
      solid(S, f, a, b, 0, LOG, fy(k0) - 0.2, ROOF, 'wall');
      if (f.k === 3) { // the white sloped cap over the street-end stack (a glazed top-floor loggia under it)
        B.wall.setColor(WHITE);
        const y0 = TOP, y1 = TOP + 1.9;
        box(B.wall, f, a, b, ROOF, y0, -0.4, LOG, 'flr', UVW);
        const P = (s, y, o) => at(f, s, y, o);
        B.wall.face([P(a - 0.15, y0, LOG + 0.25), P(b + 0.15, y0, LOG + 0.25), P(b + 0.15, y1, -2.2), P(a - 0.15, y1, -2.2)], [f.nx * 0.6, 0.8, f.nz * 0.6]);
        for (const s of [a - 0.15, b + 0.15]) B.wall.face([P(s, y0, LOG + 0.25), P(s, y1, -2.2), P(s, y0, -2.2)], (s < a ? [-f.ux, 0, -f.uz] : [f.ux, 0, f.uz]));
        solid(S, f, a, b, -2.2, LOG, ROOF, y1);
      }
    }
  }
  // the yard door's canopy
  { const f = faces.find((q) => q.k === 1); if (f) { const yc = Math.max(Y(0), gAt(f, f.L / 2, 1.5) + 0.1) + 2.55; D.setColor('#a9a6a0'); box(D, f, f.L * 0.5 - 1.3, f.L * 0.5 + 1.3, yc, yc + 0.15, 0, 1.4, 'ftlru'); solid(S, f, f.L * 0.5 - 1.3, f.L * 0.5 + 1.3, 0, 1.4, yc, yc + 0.15, 'awning', 1); } }
  D.setColor('#6a6863'); D.fill(ring, [], ROOF + 0.02, true);
  const bb = bboxOf(ring);
  for (const [x, z, w, d, h] of [[316, 36, 3.2, 3.2, 2.6], [338, 24, 2.6, 2.6, 2.2]]) { // lift and stair heads
    B.brick.setColor(BRICK); B.brick.box(x - w / 2, ROOF, z - d / 2, x + w / 2, ROOF + h, z + d / 2, 1 | 2 | 4 | 16 | 32);
    S.prism([x - w / 2, z - d / 2, x + w / 2, z - d / 2, x + w / 2, z + d / 2, x - w / 2, z + d / 2], ROOF, ROOF + h, 0, 0, 'equipment');
  }
  S.prism(ring.flat(), gB, TOP, 0, 0, 'wall');

  // ---- the annex: shop fronts on its two street faces, plain render elsewhere, a flat roof behind a low parapet
  if (aring) {
    const AT = Y(AH), ATP = AT + 0.45;
    for (const f of af) {
      if (f === wing) {                                   // from the viewer's left: CatCafe, the green unit, the dark one
        // s runs to the viewer's left on this face when facing() < 0; work in "from the left" metres
        const sl = (d) => (f.ux * f.nz - f.uz * f.nx < 0 ? f.L - d : d), span = (a, b) => [Math.min(sl(a), sl(b)), Math.max(sl(a), sl(b))];
        f.units = [[0.4, 7.6, 'cafe'], [7.9, 16.2, 'green'], [16.5, 23.4, 'dark'], [23.7, f.L - 0.4, 'plain']];
        for (const [a, b, kind] of f.units) {
          const [s0, s1] = span(a, b);
          if (kind === 'cafe') {
            for (const [j, [p, q]] of [[a + 0.6, a + 2.9], [a + 4.4, b - 0.6]].entries()) {
              const [c0, c1] = span(p, q), m = (c0 + c1) / 2;
              win(f, c0, c1, Y(0.45), Y(2.75), { lit: true, glass: '#3c4850', frame: '#2e3135', rev: CREAM, pitch: 2.4 });
              label(B.sign, f, m - 0.75, m + 0.75, Y(1.15), Y(2.05), -0.15, STICK[j]);
            }
            const [d0, d1] = span(a + 3.1, a + 4.2); f.cuts.push({ s0: d0, s1: d1, y0: Y(0), y1: Y(2.4), glass: '#dfe3e3', lit: true, frame: WHITE, rev: CREAM, dep: 0.2, door: true, pitch: 1.1, tr: Y(1.9) });
          } else win(f, s0 + 0.5, s1 - 0.5, Y(0.35), Y(2.75), { lit: true, frame: kind === 'green' ? '#e9ece6' : '#34373b', rev: kind === 'green' ? '#3f7a4a' : '#45484c', pitch: 1.6, tr: Y(2.2) });
        }
      } else if (f === bar) {
        for (const [a, b] of [[0.6, 6.4], [7.2, 13.6], [14.4, f.L - 0.6]]) {
          const g = Math.max(Y(0), gAt(f, (a + b) / 2, 1)); // this face stands uphill: its doors open at the pavement
          win(f, a + 0.4, b - 1.6, g + 0.35, Y(2.75), { lit: true, frame: '#3a3d41', rev: '#cfc8b7', pitch: 1.5 });
          f.cuts.push({ s0: b - 1.3, s1: b - 0.3, y0: g, y1: Math.max(g + 2.2, Y(2.4)), glass: '#3e4549', frame: '#3a3d41', rev: '#cfc8b7', dep: 0.2, door: true, pitch: 1 });
        }
      } else if (f.L > 4) win(f, f.L / 2 - 0.7, f.L / 2 + 0.7, Y(1.0), Y(2.4), { frame: '#cfcac0' });
      else { D.setColor('#45484d'); box(D, f, -0.02, f.L + 0.02, Y(2.95), Y(AH + 0.3), 0, 0.3, 'ft'); } // the corner unit's fascia
      nWin += f.cuts.length;
      skin(B.wall, f, gB, Y(0.35), GRAN);
      skin(B.wall, f, Y(0.35), ATP, CREAM, UVW);
      for (const q of f.cuts) hole(B, f, q);
      D.setColor('#bdb6a8'); box(D, f, -0.03, f.L + 0.03, ATP, ATP + 0.05, -0.25, 0.05, 'ft');
      D.setColor('#d9d2c1'); rect(D, f, 0, f.L, AT, ATP, -0.25, null, [-f.nx, 0, -f.nz]);
      if (f.L > 3) { const a = at(f, 0, 0, -0.1), b = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], b[0], b[2], ATP, f.nx, f.nz); }
    }
    D.setColor('#76726c'); D.fill(aring, [], AT + 0.02, true);
    S.prism(aring.flat(), gB, ATP, 0, 0, 'wall');

    // the shop strip: piers, fascias, the café sign; steps and a landing of red granite the length of the front
    if (wing) {
      const f = wing, sl = (d) => (f.ux * f.nz - f.uz * f.nx < 0 ? f.L - d : d), span = (a, b) => [Math.min(sl(a), sl(b)), Math.max(sl(a), sl(b))];
      const FA = Y(2.95), FB = Y(AH + 0.3), FO = 0.35;
      for (const [a, b, kind] of f.units) {
        const [s0, s1] = span(a, b);
        if (kind === 'cafe') {
          B.wall.setColor(WHITE); for (const p of [a, a + 2.95, a + 4.25, b - 0.55]) { const [c0, c1] = span(p, p + 0.55); box(B.wall, f, c0, c1, Y(0), FA, 0, 0.18, 'flr', UVW); }
          D.setColor(CHAR); box(D, f, s0 - 0.1, s1 + 0.1, FA, FB, 0, FO, 'ftlru');
          const [l0, l1] = span(a + 0.6, b - 0.6), hh = Math.min(FB - FA - 0.1, (l1 - l0) * 0.25);
          label(B.sign, f, l0, l1, (FA + FB) / 2 - hh / 2, (FA + FB) / 2 + hh / 2, FO + 0.02, LOGO);
          D.setColor('#2b2b2b'); const [m0, m1] = span(a + 3.45, a + 3.85); box(D, f, m0, m1, Y(2.5), Y(2.85), 0, 0.12, 'flrt'); // the house lamp
        } else {
          D.setColor(kind === 'green' ? '#3f7a4a' : kind === 'dark' ? '#3a3d41' : '#c9c2b2');
          box(D, f, s0, s1, FA, FB, 0, FO * 0.8, 'ftlru');
          if (kind === 'green') { B.wall.setColor('#3f7a4a'); for (const s of [s0, s1 - 0.5]) box(B.wall, f, s, s + 0.5, Y(0), FA, 0, 0.12, 'flr', UVW); }
        }
      }
      solid(S, f, 0, f.L, 0, FO, FA, FB, 'awning', 1);
      const pg = at(f, f.L / 2, 0, 4.5), g = Math.min(heightAt(pg[0], pg[2]), yF - 0.15), n = Math.max(1, Math.round((yF - g) / 0.16));
      D.setColor(GRAN); box(D, f, 0, f.L, gB, yF, 0, 1.6, 'ftlr');
      for (let i = 0; i < n; i++) {
        const o = 1.6 + 0.32 * (i + 1), yt = yF - (yF - g) * (i + 1) / n;
        D.setColor(i % 2 ? '#7f5044' : '#6f443a'); box(D, f, 0.2 + 0.25 * i, f.L - 0.2 - 0.25 * i, gB, yt, 0, o, 'ftlr');
      }
      solid(S, f, 0, f.L, 0, 1.6 + 0.32 * n, gB, yF, 'step');
    }
  }

  const sign = signTex();
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.85 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r, { base: [238, 234, 224], mortar: [214, 209, 199], spread: 0.08 }), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, emissive: 0xffd9a8, emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.35 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0.05, alphaTest: 0.4, roughness: 0.4 }),
  };
  const out = finish(root, 'catcafe', B, M, { shade: ['wall', 'brick', 'det'] });
  console.log(`[cherkasy] CatCafe block: ${nWin} openings, ${nLog} loggias, floor ${yF.toFixed(1)} m, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  const ab = aring ? bboxOf(aring) : bb, x0 = Math.min(bb.x0, ab.x0), x1 = Math.max(bb.x1, ab.x1), z0 = Math.min(bb.z0, ab.z0), z1 = Math.max(bb.z1, ab.z1);
  return {
    footprints: [{ poly: ring, h: TOP - gLo, kind: 'apt', name: 'Байди Вишневецького, 19' }, ...(aring ? [{ poly: aring, h: Y(AH) - gLo, kind: 'retail', name: 'CatCafe' }] : [])],
    clear: (x, z) => x > x0 - 3 && x < x1 + 3 && z > z0 - 3 && z < z1 + 5,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.1 * k; M.sign.emissiveIntensity = 0.05 + 0.9 * k; },
  };
}
