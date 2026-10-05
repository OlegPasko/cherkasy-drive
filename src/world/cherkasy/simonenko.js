// OWNER: cherkasy. бульвар Шевченка, 345 (OSM way 129728561): the five-storey П-shaped block of red brick where the
// poet Василь Симоненко lived in 1959–1963 (quest «Таємниці Черкас», card `simonenko`), with the bronze memorial
// plaque on its wall: his profile on a slanted plate and «У цьому будинку в 1959–1963 роках жив поет Василь
// Симоненко», a small wrought shelf for flowers under it (the Commons photo «Василю Симоненку (Сєдова).JPG»). The
// plaque photo shows the bare red brick; the rest is the usual late-1950s brick block of the city, a guess: three
// wings round a yard open to the east, five storeys over a low plinth, white-framed windows one per 3.2 m bay, a
// corbelled brick cornice and hipped roofs of grey slate, entrances from the yard under small concrete canopies,
// balconies with steel railings on the yard sides. The plaque hangs on the west wall near its north end, by the
// card's point.
//   SIMONENKO_SKIP: the OSM ids replaced here (buildings.js skips their extrusion)
//   buildSimonenko({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, levels, plaque } | null
//     levels: { floor, eaves, ridge }; plaque: [x, y, z] of its centre (tests)
// Walls are one brick-textured quad per face; windows, doors and the plaque are quads of a painted atlas just proud of
// it (the lit ones in a mesh whose emissive mask is the glass), as in smil117.js.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { rng, inPoly } from './geo.js';
import { ringFaces, at, quad, box, rect, solid, finish } from './slabkit.js';
import { hipRoof, brickTex } from './civic.js';

const OSM_ID = 129728561;
export const SIMONENKO_SKIP = new Set([OSM_ID]);
const PL = 0.7, FH = 2.9, NF = 5, MOD = 3.2;
const T = { WIN: 0, BDOOR: 1, DOOR: 2, STAIR: 3, PLAQUE: 4 }, NTILE = 5, TW = 128, TH = 128;

function atlas(mask) {
  return canvasTex(NTILE * TW, TH, (g) => {
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const pane = (t, vx, hy, { fw = 7, frame = '#f3f2ee', rv = 5, x0 = 0, x1 = 1, y1 = 1 } = {}) => {
      const X = t * TW + x0 * TW, W = (x1 - x0) * TW, H = y1 * TH, Y = TH - H;
      if (mask) { fill('#fff', X + rv + fw, Y + rv + fw, W - 2 * (rv + fw), H - 2 * (rv + fw)); return; }
      fill('#5c4a40', X, Y, W, H); fill(frame, X + rv, Y + rv, W - 2 * rv, H - 2 * rv);
      const gr = g.createLinearGradient(0, Y, 0, TH); gr.addColorStop(0, '#a9bac6'); gr.addColorStop(1, '#46545e');
      g.fillStyle = gr; g.fillRect(X + rv + fw, Y + rv + fw, W - 2 * (rv + fw), H - 2 * (rv + fw));
      g.fillStyle = frame; for (const v of vx) g.fillRect(X + v * W - fw / 2, Y, fw, H); for (const h of hy) g.fillRect(X, Y + H * (1 - h) - fw / 2, W, fw);
    };
    if (mask) fill('#000', 0, 0, NTILE * TW, TH);
    pane(T.WIN, [0.33, 0.66], [0.72]);
    if (!mask) fill('#a65a3f', T.BDOOR * TW, 0, TW, TH);
    pane(T.BDOOR, [], [0.78], { x0: 0, x1: 0.4 }); pane(T.BDOOR, [0.5], [0.78], { x0: 0.44, x1: 1, y1: 0.62 });
    pane(T.STAIR, [0.5], [0.5], { frame: '#ebe9e2' });
    if (!mask) {
      // the entrance: a brown timber double door with a glazed transom
      fill('#5c4a40', T.DOOR * TW, 0, TW, TH); fill('#6b4a33', T.DOOR * TW + 6, 26, TW - 12, TH - 26);
      fill('#8a6a50', T.DOOR * TW + TW / 2 - 2, 26, 4, TH - 26); fill('#c3cdd2', T.DOOR * TW + 8, 6, TW - 16, 16);
      // the plaque: a dark bronze plate, the profile in a slanted panel, five lines of raised letters
      const X = T.PLAQUE * TW;
      fill('#00000000', X, 0, TW, TH);
      g.fillStyle = '#4d4a44'; g.beginPath(); g.moveTo(X + 30, 6); g.lineTo(X + 104, 6); g.lineTo(X + 104, 124); g.lineTo(X + 40, 124); g.lineTo(X + 40, 66); g.lineTo(X + 6, 50); g.quadraticCurveTo(X + 10, 12, X + 30, 6); g.fill();
      g.fillStyle = '#5f5b54'; g.beginPath(); g.ellipse(X + 74, 36, 17, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6c675f'; g.beginPath(); g.moveTo(X + 58, 34); g.lineTo(X + 52, 42); g.lineTo(X + 60, 46); g.fill(); // the nose
      g.fillStyle = '#3c3a36'; g.fillRect(X + 60, 14, 30, 8);
      g.fillStyle = '#8b857a'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center';
      ['У ЦЬОМУ БУДИНКУ', 'В 1959–1963 РОКАХ', 'ЖИВ ПОЕТ'].forEach((t, i) => g.fillText(t, X + 72, 78 + i * 8));
      g.font = 'bold 9px sans-serif'; g.fillText('ВАСИЛЬ', X + 72, 108); g.fillText('СИМОНЕНКО', X + 72, 119);
    }
  }, { repeat: false });
}

export function buildSimonenko({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((o) => o.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = []; for (let i = 0; i < b.p.length; i += 2) ring.push([b.p[i], b.p[i + 1]]);
  const F = ringFaces(ring).filter((f) => f.L > 0.5);
  const gs = ring.map(([x, z]) => heightAt(x, z)), gLo = Math.min(...gs) - 0.5, yF = Math.max(...gs) + PL;
  const yE = yF + NF * FH, yC = yE + 0.45;
  const B = { wall: new MB(), det: new MB(), tile: new MB(), lit: new MB(), roof: new MB() }, D = B.det;
  const u0 = (t) => (t * TW + 1) / (NTILE * TW), u1 = (t) => ((t + 1) * TW - 1) / (NTILE * TW);
  const tile = (f, t, s0, s1, ya, yb, p = 0.3, o = 0.03) => {
    const M = p > 0 && r() < p ? B.lit : B.tile; M.setColor('#ffffff');
    quad(M, at(f, s0, ya, o), at(f, s1, ya, o), at(f, s1, yb, o), at(f, s0, yb, o), f.N, [[u0(t), 0], [u1(t), 0], [u1(t), 1], [u0(t), 1]]);
  };
  // the yard: inside the ring's bounding box, on the open (east, map +x) side of the west wing
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const X0 = Math.min(...xs), X1 = Math.max(...xs), Zc = (Math.min(...zs) + Math.max(...zs)) / 2;
  const yardSide = (f) => { const m = at(f, f.L / 2, 0, 3); return m[0] > X0 + 8 && m[0] < X1 && Math.abs(m[2] - Zc) < (Math.max(...zs) - Math.min(...zs)) / 2 - 6; };

  // the plaque: on the west wall (the longest face looking to map -x), at the bay nearest the north end
  const west = F.filter((f) => f.nx < -0.9).sort((p, q) => q.L - p.L)[0];
  let plaque = null;
  for (const f of F) {
    // the wall: the plinth, the brick, a corbelled cornice, the parapet edge under the eaves
    D.setColor('#7c736b'); rect(D, f, 0, f.L, gLo, yF, 0, [2, 2]);
    B.wall.setColor('#ffffff'); rect(B.wall, f, 0, f.L, yF, yC, 0, [2.0, 1.8]);
    D.setColor('#9a5640'); box(D, f, -0.08, f.L + 0.08, yE + 0.1, yE + 0.25, 0, 0.1, 'ftu'); box(D, f, -0.16, f.L + 0.16, yE + 0.25, yC, 0, 0.2, 'ftu');
    D.setColor('#b4ada3'); box(D, f, 0, f.L, yF + FH - 0.18, yF + FH - 0.06, 0, 0.04, 'ft'); // the band over the ground storey
    solid(S, f, 0, f.L, -0.4, 0, gLo, yC);
    const a = at(f, 0, 0, -0.1), c = at(f, f.L, 0, -0.1); Z.edge(a[0], a[2], c[0], c[2], yC, f.nx, f.nz);
    if (f.L < 2.5) continue;
    const N = Math.max(1, Math.round(f.L / MOD)), m = f.L / N, yard = yardSide(f);
    // on a yard face: an entrance every fourth bay (stair windows above it), a balcony stack two bays off it
    const doors = yard ? new Set([...Array(N).keys()].filter((i) => i % 4 === 2 && i < N - 1)) : new Set();
    const bals = yard ? new Set([...doors].flatMap((i) => [i - 2, i + 2]).filter((i) => i >= 0 && i < N && !doors.has(i))) : new Set();
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) * m;
      if (doors.has(i)) {
        const q = at(f, s, 0, 1), g = Math.min(heightAt(q[0], q[2]), yF - 0.3);
        tile(f, T.DOOR, s - 0.75, s + 0.75, g + 0.15, g + 2.45, 0.85);
        for (let k = 1; k < NF; k++) tile(f, T.STAIR, s - 0.6, s + 0.6, yF + k * FH - 0.4, yF + k * FH + 0.9, 0.5);
        D.setColor('#c9c5bc'); box(D, f, s - 1.2, s + 1.2, g + 2.6, g + 2.8, 0, 1.3, 'ftlru');
        D.setColor('#9d9890'); box(D, f, s - 1.0, s + 1.0, gLo, g + 0.15, 0, 1.2, 'ftlr');
        solid(S, f, s - 1.2, s + 1.2, 0, 1.3, g + 2.6, g + 2.8, 'awning', 1);
        continue;
      }
      for (let k = 0; k < NF; k++) {
        const y = yF + k * FH;
        if (bals.has(i) && k > 0) {
          tile(f, T.BDOOR, s - 1.1, s + 1.1, y + 0.05, y + 2.25);
          D.setColor('#bdb8ae'); box(D, f, s - 1.3, s + 1.3, y - 0.12, y + 0.02, 0, 1.0, 'ftlru');
          D.setColor('#3f4446'); box(D, f, s - 1.3, s + 1.3, y + 0.95, y + 1.0, 0.95, 1.0, 'ftlru');
          for (let j = 0; j <= 10; j++) { const ss = s - 1.28 + j * 0.256; box(D, f, ss, ss + 0.02, y + 0.02, y + 0.95, 0.97, 0.99, 'fl'); }
          for (const ss of [s - 1.3, s + 1.28]) box(D, f, ss, ss + 0.02, y + 0.02, y + 0.95, 0, 0.99, 'lr');
          solid(S, f, s - 1.3, s + 1.3, 0, 1.0, y - 0.12, y + 1.0, 'ledge');
        } else tile(f, T.WIN, s - 0.72, s + 0.72, y + 0.85, y + 2.35);
      }
    }
    // the plaque between the first two windows from the north end of the west wall, at the height of the ground
    // storey's top
    if (f === west) {
      const fromN = (d) => (at(f, f.L, 0)[2] < at(f, 0, 0)[2] ? f.L - d : d); // s measured from the north (map -z) end
      const s = fromN(m), y0 = yF + 1.0, y1 = y0 + 1.25;
      tile(f, T.PLAQUE, s - 0.48, s + 0.48, y0, y1, 0, 0.05);
      // the wrought shelf for flowers under it, and a few red and blue flowers
      D.setColor('#2c2c2b'); box(D, f, s - 0.3, s + 0.3, y0 - 0.55, y0 - 0.5, 0, 0.22, 'ftlru');
      for (const [ds, c] of [[-0.18, '#c8322a'], [-0.05, '#3d63b8'], [0.08, '#c8322a'], [0.2, '#e8e4dc']]) {
        const q = at(f, s + ds, 0, 0.14); D.setColor('#3e6a2c').box(q[0] - 0.006, y0 - 0.5, q[2] - 0.006, q[0] + 0.006, y0 - 0.25, q[2] + 0.006);
        D.setColor(c).ellipsoid([q[0], y0 - 0.22, q[2]], [0.045, 0.03, 0.045], 6, 4);
      }
      const q = at(f, s, (y0 + y1) / 2, 0.05);
      plaque = q;
    }
  }
  // the roofs: a hip over each wing (the wings are the ring's map-axis rectangles: the long west wing and the two end
  // wings of the П), eaves just over the cornice
  const wings = (() => {
    const wx1 = Math.min(...F.filter((f) => f.nx > 0.9 && f.L > 30).map((f) => f.ax));       // the west wing's yard face
    const zN = Math.min(...F.filter((f) => f.nz > 0.9 && f.L > 20).map((f) => f.az));        // the north wing's yard face
    const zS = Math.max(...F.filter((f) => f.nz < -0.9 && f.L > 20).map((f) => f.az));       // the south wing's yard face
    const wz0 = Math.min(...ring.filter((p) => p[0] < X0 + 1).map((p) => p[1])), wz1 = Math.max(...ring.filter((p) => p[0] < X0 + 1).map((p) => p[1]));
    return [[X0, wz0, wx1, wz1], [wx1 - 4.2, Math.min(...zs), X1, zN], [wx1 - 4.5, zS, X1, Math.max(...zs)]];
  })();
  B.roof.setColor('#6f7173');
  for (const [x0, z0, x1, z1] of wings) if (x1 > x0 + 2 && z1 > z0 + 2) hipRoof(B.roof, x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, yC, 3.2);
  S.prism(ring.flat(), yC - 0.1, yC + 0.4, 0, 0, 'wall');

  const atl = atlas(false);
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: brickTex(r, { base: [168, 92, 64], mortar: [178, 160, 140] }), vertexColors: true, roughness: 0.92 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    tile: new THREE.MeshStandardMaterial({ map: atl, vertexColors: true, roughness: 0.45, metalness: 0.05, transparent: false, alphaTest: 0.5 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
  };
  M.lit = new THREE.MeshStandardMaterial({ map: atl, vertexColors: true, roughness: 0.45, emissive: 0xffc890, emissiveMap: atlas(true), emissiveIntensity: 0 });
  const out = finish(root, 'simonenko', B, M, { shade: ['wall', 'det', 'tile', 'lit', 'roof'] });
  console.log(`[cherkasy] Shevchenka 345 (Symonenko house): ${(out.verts / 1000).toFixed(1)}k verts, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    footprints: [{ poly: ring, h: yC + 3.2 - gLo, kind: 'apt', name: 'бульвар Шевченка, 345' }],
    levels: { floor: yF, eaves: yC, ridge: yC + 3.2 },
    plaque,
    clear: (x, z) => inPoly(ring, x, z) || F.some((f) => { const s = (x - f.ax) * f.ux + (z - f.az) * f.uz, o = (x - f.ax) * f.nx + (z - f.az) * f.nz; return s > 0 && s < f.L && o > -0.5 && o < 1.5; }),
    update() { M.lit.emissiveIntensity = 0.45 * nightK.value; },
  };
}
