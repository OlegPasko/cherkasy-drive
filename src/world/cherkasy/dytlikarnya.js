// OWNER: cherkasy. Черкаська обласна дитяча лікарня, проспект Перемоги, 16 (OSM way 94981088 with its eight
// building:part wings), rebuilt after the hospital's own site photos (oblbabyklinika.ck.ua), the Ceresit reference photo
// of its facade job and the satellite view. The 150 m ward slab (7 storeys) runs south-west to north-east in three
// rendered sections, pale pink, mint and pale yellow, split by blue stair-and-lift cores with a glazed strip that rise a
// storey over the roof; along its north-west side runs the light-blue one-storey podium with a white window band, and
// from it stand the blue three-storey blocks with blade fins (the entrance block and its twin) and the grey-white
// three-storey clinic at the north-east end. Glazed doors with canopies on the podium. Windows light up at night.
//   DYTLIK_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildDytlikarnya({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Each OSM part is walled per ring edge with bldkit.js; an edge that looks into a taller part is left out, one that
// looks into a lower part only rises above that part's roof, so the inside walls cost nothing.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, inPoly, bboxOf } from './geo.js';
import { edgeFaces, pt, fbox, panel, wall, win, row, mats, finish } from './bldkit.js';
import { canvasTex } from './sculpt.js';

const OSM_ID = 94981088;
export const DYTLIK_SKIP = new Set([OSM_ID]);

const FH = 3.3, SLAB = 7, CORE = 8, POD = 4.8, BLK = 11.2; // storey; slab and core storeys; podium and block heights
const CORES = [[-3653.3, -3644.6], [-3606.9, -3597.9]];   // x ranges of the two cores (the notches of the slab)
const PAR = 0.9; // parapet over the roofs

// one whole window per repeat: a white PVC frame with a centre mullion and a top-hung light, the glass darkening down
// from the sky it catches, a soft shadow under the head and inside the left reveal; the glow mask lights the glass only
const paint = (g, w, h, glow) => {
  g.fillStyle = glow ? '#000' : '#f2f2ee'; g.fillRect(0, 0, w, h);
  const t = 7, m = w / 2;
  const glass = (x0, y0, x1, y1) => {
    if (glow) { g.fillStyle = '#fff'; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x0, y0, x1 - x0, 10); return; }
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#9fb0bb'); gr.addColorStop(0.45, '#56656f'); gr.addColorStop(1, '#3b454d');
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = 'rgba(20,25,30,0.35)'; g.fillRect(x0, y0, x1 - x0, 9); g.fillRect(x0, y0, 6, y1 - y0); // reveal shadow
  };
  glass(t, t, m - 3, h * 0.3); glass(m + 3, t, w - t, h * 0.3); // top-hung lights
  glass(t, h * 0.3 + 5, m - 3, h - t); glass(m + 3, h * 0.3 + 5, w - t, h - t);
};
const hospWin = () => canvasTex(128, 128, (g, w, h) => paint(g, w, h, false));
const hospWinEm = () => canvasTex(128, 128, (g, w, h) => paint(g, w, h, true));
// render with soft blotches and faint board joints of the insulation (6 m per repeat), so the big planes are not flat
const hospRender = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = r() * w, y = r() * h, rad = 12 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const c = r() < 0.5 ? '255,255,255' : '120,105,90'; gr.addColorStop(0, `rgba(${c},0.07)`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.fillStyle = 'rgba(90,80,70,0.05)'; for (let y = 0; y < h; y += h / 10) g.fillRect(0, y, w, 1);
  for (let i = 0; i < 2500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(70,60,50,0.05)'; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
});
const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');
const COL = { pink: '#ecc9c0', mint: '#c3e3c6', yellow: '#f2df86', core: '#3f8ed3', pod: '#8fc6ea', blue: '#3a8bd1', clinic: '#dde1e3' };

export function buildDytlikarnya({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld?.parts?.length) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 65521), n0 = S.count;
  const ring = ringPts(bld.p);
  let gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of ring) { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const yF = gHi + 0.3, gB = gLo - 0.6, Y = (h) => yF + h;

  // the parts: the slab has 6 levels in OSM, the photos show 7; the blocks 3; the podium pieces 1
  const parts = bld.parts.map((p) => {
    const R = ringPts(p.p), lv = p.lv ?? 3;
    const cx = R.reduce((s, q) => s + q[0], 0) / R.length;
    const kind = lv >= 6 ? 'slab' : lv <= 1 ? 'pod' : cx > -3575 && R.length < 12 ? 'clinic' : 'block';
    return { R, lv, kind, top: kind === 'slab' ? SLAB * FH : kind === 'pod' ? POD : BLK };
  });
  const within = (x, z, self) => parts.filter((p) => p !== self && inPoly(p.R, x, z)).reduce((m, p) => Math.max(m, p.top), -1);

  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB() };
  const D = B.det;
  let nWin = 0;
  const isCore = (x) => CORES.some(([a, b]) => x > a - 0.2 && x < b + 0.2);
  const tone = (x) => (x < -3653 ? COL.pink : x < -3606 ? COL.mint : COL.yellow);

  for (const P of parts) {
    for (const f of edgeFaces(P.R)) {
      const m = pt(f, f.L / 2, 0, 0.6), nb = within(m[0], m[2], P);
      if (nb >= P.top - 0.05) continue;         // an inside wall
      const y0 = nb > 0 ? Y(nb) : gB, top = Y(P.top), mx = pt(f, f.L / 2, 0)[0];
      const holes = [];
      let col = COL.clinic, rev = '#e8ecee';
      if (P.kind === 'slab') {
        const core = isCore(mx) && f.L < 12;
        col = core ? COL.core : tone(mx); rev = core ? '#cfe3f3' : shade(col, 0.8);
        if (core) { // the glazed strip up the stair
          holes.push({ s0: f.L / 2 - 1.2, s1: f.L / 2 + 1.2, y0: Math.max(y0 + 0.4, Y(0.6)), y1: top - 0.6, cols: 1, rows: SLAB, rev, lit: r() < 0.6, glass: '#dbe6ee', dep: 0.12 });
        } else for (let k = 0; k < SLAB; k++) {
          const yb = Y(k * FH + 0.9);
          if (yb < y0 + 0.3) continue;
          for (const q of row(f, 0.8, f.L - 0.8, 3.0, 1.6, yb, yb + 1.65, { cols: 1, rows: 1, rev, lit: r() < 0.35, sill: '#e9e9e4', dep: 0.24 })) holes.push(q);
        }
        B.wall.setColor(shade(col, 0.97 + r() * 0.05)); wall(B.wall, f, y0, top + PAR, holes, [6, 6]);
        if (!core) { D.setColor(shade(col, 1.06)); for (let k = 1; k < SLAB; k++) if (Y(k * FH) > y0 + 0.3) fbox(D, f, 0, f.L, Y(k * FH) - 0.12, Y(k * FH) + 0.05, 0, 0.05, 'ftu'); } // floor bands
      } else if (P.kind === 'pod') {
        col = COL.pod; rev = '#ffffff';
        for (const q of row(f, 0.6, f.L - 0.6, 2.3, 2.0, Y(1.3), Y(3.2), { cols: 2, rows: 1, rev, lit: r() < 0.3, glass: '#d4e2ea', dep: 0.1 })) holes.push(q);
        if (f.L > 25 && f.nz < -0.5) { const c = f.L * 0.5; holes.splice(0, holes.length, ...holes.filter((q) => q.s1 < c - 2.6 || q.s0 > c + 2.6)); holes.push({ s0: c - 2, s1: c + 2, y0: Y(0.02), y1: Y(3.0), cols: 3, rows: 2, rev: '#cfd8dc', lit: true, glass: '#d7e3e8', dep: 0.12, door: c }); }
        B.wall.setColor(col); wall(B.wall, f, y0, top + PAR, holes, [6, 6]);
        D.setColor('#ffffff'); for (const q of holes) if (!q.door) fbox(D, f, q.s0 - 0.15, q.s1 + 0.15, Y(1.15), Y(1.3), 0, 0.06, 'ft'); // the white band's sill
        D.setColor('#f2f4f5'); fbox(D, f, -0.05, f.L + 0.05, top - 0.5, top, 0, 0.1, 'ftu');
        for (const q of holes) if (q.door) { D.setColor('#eef1f2'); fbox(D, f, q.door - 3, q.door + 3, Y(3.4), Y(3.65), 0, 2.4, 'ftlru'); const Q = [[q.door - 3, 0], [q.door + 3, 0], [q.door + 3, 2.4], [q.door - 3, 2.4]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }); S.prism(Q.flat(), Y(3.4), Y(3.65), 0, 0, 'awning', 1); }
      } else {
        const blue = P.kind === 'block';
        col = blue ? COL.blue : COL.clinic; rev = blue ? '#d3e6f5' : '#f6f6f4';
        for (let k = 0; k < 3; k++) {
          const yb = Y(k * 3.6 + 1.0);
          if (yb < y0 + 0.3) continue;
          for (const q of row(f, 0.8, f.L - 0.8, blue ? 3.6 : 3.0, blue ? 2.0 : 1.5, yb, yb + (blue ? 2.2 : 1.6), { cols: blue ? 2 : 1, rows: 1, rev: shade(col, 0.8), lit: r() < 0.35, dep: 0.22, sill: '#e9e9e4' })) holes.push(q);
        }
        B.wall.setColor(col); wall(B.wall, f, y0, top + PAR, holes, [6, 6]);
        if (blue && f.L > 6) { D.setColor('#4c9be0'); for (let s = 1.8; s < f.L - 1; s += 3.6) if (!holes.some((q) => s > q.s0 - 0.2 && s < q.s1 + 0.2)) fbox(D, f, s - 0.15, s + 0.15, Math.max(y0, Y(0.3)), top + 0.3, 0, 0.7, 'flrt'); } // blade fins
      }
      for (const q of holes) { win(B, f, q); nWin++; }
      if (y0 < Y(0)) { D.setColor(shade(col, 0.62)); fbox(D, f, 0, f.L, y0, Y(0.8), 0, 0.07, 'ftlr'); } // plinth band
      D.setColor(shade(col, 1.08)); fbox(D, f, -0.1, f.L + 0.1, top - 0.35, top, 0, 0.22, 'ftu'); // cornice at the roof line
      D.setColor(shade(col, 0.9)); fbox(D, f, 0, f.L, top, top + PAR, -0.3, 0, 'b');               // parapet, inside face
      D.setColor('#c9cbc8'); fbox(D, f, -0.05, f.L + 0.05, top + PAR, top + PAR + 0.1, -0.35, 0.06, 'ftu'); // coping
      const p0 = pt(f, 0, 0, -0.1), p1 = pt(f, f.L, 0, -0.1); Z.edge(p0[0], p0[2], p1[0], p1[2], top + PAR, f.nx, f.nz);
    }
    D.setColor(P.kind === 'pod' ? '#9aa0a3' : '#7e8386'); D.fill(P.R, [], Y(P.top) + 0.1, true);
    S.prism(P.R.flat(), gB, Y(P.top) + PAR, 0, 0, 'wall');
  }
  // the cores' heads: a storey over the slab roof, on the solid part of the slab across each core
  const slab = parts.find((p) => p.kind === 'slab');
  if (slab) for (const [a, b] of CORES) {
    let z0 = Infinity, z1 = -Infinity;
    for (let z = -60; z < 0; z += 0.5) if (inPoly(slab.R, (a + b) / 2, z)) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if (!(z1 - z0 > 6)) continue;
    const zc0 = (z0 + z1) / 2 - 3.5, zc1 = (z0 + z1) / 2 + 3.5;
    B.wall.setColor(COL.core); D.setColor('#6f7477');
    for (const [x, nx] of [[a, -1], [b, 1]]) panel(B.wall, { ax: x, az: zc0, ux: 0, uz: 1, nx, nz: 0, L: zc1 - zc0 }, 0, zc1 - zc0, Y(SLAB * FH) - 0.3, Y(CORE * FH), 0, [2.5, 2.5]);
    for (const [z, nz] of [[zc0, -1], [zc1, 1]]) panel(B.wall, { ax: a, az: z, ux: 1, uz: 0, nx: 0, nz, L: b - a }, 0, b - a, Y(SLAB * FH) - 0.3, Y(CORE * FH), 0, [2.5, 2.5]);
    D.box(a, Y(CORE * FH) - 0.2, zc0, b, Y(CORE * FH) + 0.3, zc1, 4);
    S.prism([a, zc0, b, zc0, b, zc1, a, zc1], Y(SLAB * FH), Y(CORE * FH), 0, 0, 'wall');
  }
  // rooftop plant on the slab
  if (slab) for (let k = 0; k < 8; k++) {
    const ux = -3690 + k * 17 + r() * 6, uz = -30 + r() * 6, yr = Y(SLAB * FH);
    if (inPoly(slab.R, ux, uz) && !CORES.some(([a, b]) => ux > a - 3 && ux < b + 3)) { D.setColor('#cfd1cf'); D.boxC(ux, yr + 0.775, uz, 2.4, 1.35, 1.6); }
  }

  const win2 = hospWin(), em2 = hospWinEm();
  const M = mats({
    wall: new THREE.MeshStandardMaterial({ map: hospRender(r), vertexColors: true, roughness: 0.92 }),
    glass: new THREE.MeshStandardMaterial({ map: win2, vertexColors: true, roughness: 0.15, metalness: 0.3 }),
    lit: new THREE.MeshStandardMaterial({ map: win2, emissiveMap: em2, vertexColors: true, roughness: 0.2, metalness: 0.2, emissive: 0xffd9a8, emissiveIntensity: 0 }),
  });
  const out = finish(root, 'dytlikarnya', B, M, ['wall', 'det']);
  console.log(`[cherkasy] Children's hospital: ${parts.length} parts, ${nWin} openings, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const bb = bboxOf(ring), near = (x, z) => x > bb.x0 - 3 && x < bb.x1 + 3 && z > bb.z0 - 3 && z < bb.z1 + 3;
  return {
    footprints: parts.map((p) => ({ poly: p.R, h: Y(p.top) - gLo, kind: bld.k, name: 'Обласна дитяча лікарня' })),
    clear: (x, z) => near(x, z) && (inPoly(ring, x, z) || parts.some((p) => inPoly(p.R, x + 3, z) || inPoly(p.R, x - 3, z) || inPoly(p.R, x, z + 3) || inPoly(p.R, x, z - 3))),
    update() { M.lit.emissiveIntensity = 0.6 * nightK.value; },
  };
}
