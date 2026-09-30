// OWNER: cherkasy. Fitness club «3-4» («Три-Чотири», since 2005), vul. Nadpilna 252 (the yard side is Narbutivska 19):
// a two-storey Soviet factory hall with a low gable roof, 81 x 21 m, just south of the REST INN / U space block. The club
// holds the north-east end, re-faced in cream horizontal siding split into four bays by blue-grey siding pilasters under
// a blue pediment: two tall windows either side of a glazed entrance porch with its own little gable, the club's name
// sign between the floors of the right-hand bay, frosted film on the gym windows. The rest of the hall keeps its painted
// brick (cream over raw red corner piers and plinth), old brown timber windows two to a 6 m frame bay, brown downpipes,
// a loading ramp under a canopy on the north-west side (the upstairs tenants' way in), a skylight strip along the roof.
// Reference: the street photo on ratelist.top/307037, the club's pages (in.ck.ua/ua/try-chotyry), aerial imagery.
//   FIT34_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildFitness34({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Walls go up per facade in a face frame (s metres to the viewer's right, y up, o outward) as strips between the
// openings, textured in metres (siding laps, brick courses), so the windows keep their reveals up close.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, obb, rng, area2 } from './geo.js';

const OSM_ID = 410541282;
export const FIT34_SKIP = new Set([OSM_ID]);

const LIFT = 0.25, F1 = 3.9, EAVE = 7.5, RISE = 2.0; // floor over grade, upper floor, eaves and ridge rise over the floor
const REV = 0.18, BAY = 6;                          // window reveal depth, structural bay of the hall
const UP = [0, 1, 0], DN = [0, -1, 0];
const neg = (v) => [-v[0], -v[1], -v[2]];
const CREAM = '#efe6cc', PAINT = '#e7dcc1', RAW = '#a4604a', BLUE = '#7d8fa8', WHITE = '#eef0ee', TIMBER = '#5e4332', PIPE = '#6a4636';
const GLASS = ['#46525a', '#55606a', '#3e474f', '#626a70'];

// ------------------------------------------------------------------------------------------------ textures
function canvasTex(w, h, paint, wrap = true) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  paint(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// vinyl lap siding, 2 m per repeat: ten 0.2 m boards, each with a shadow under its lip and a sunlit top edge
const sidingTex = () => canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, h);
  const p = h / 10;
  for (let i = 0; i < 10; i++) {
    const y = i * p, grd = g.createLinearGradient(0, y, 0, y + p);
    grd.addColorStop(0, '#d6d6d4'); grd.addColorStop(0.12, '#fbfbfa'); grd.addColorStop(1, '#e9e9e7');
    g.fillStyle = grd; g.fillRect(0, y, w, p);
    g.fillStyle = 'rgba(40,40,40,0.28)'; g.fillRect(0, y + p - 3, w, 3);
  }
});
// brick courses in a neutral near-white (painted brick keeps its mortar grooves); vertex colour tints paint or raw brick
const brickTex = (r) => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#b9b5ad'; g.fillRect(0, 0, w, h);
  const bw = w / 8, bh = h / 26;
  for (let j = 0; j < 26; j++) for (let i = 0; i < 8; i++) {
    const k = 222 + Math.round(r() * 26);
    g.fillStyle = `rgb(${k},${k - 3},${k - 8})`;
    const x = i * bw + (j & 1 ? bw / 2 : 0) + 2;
    for (const dx of [0, -w]) g.fillRect(x + dx, j * bh + 2, bw - 4, bh - 3);
  }
  for (let q = 0; q < 1800; q++) { g.fillStyle = r() < 0.6 ? 'rgba(90,80,70,0.10)' : 'rgba(255,255,255,0.12)'; g.fillRect(r() * w, r() * h, 2 + r() * 5, 1 + r() * 3); }
});
// trapezoid roof sheet, ribs every 0.2 m (1 m per repeat across the ribs)
const sheetTex = () => canvasTex(256, 32, (g, w, h) => {
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += w / 5) { g.fillStyle = '#ffffff'; g.fillRect(x, 0, 10, h); g.fillStyle = '#9d9d9d'; g.fillRect(x + 10, 0, 5, h); g.fillStyle = '#c4c4c4'; g.fillRect(x + 15, 0, 6, h); }
});
// the club's sign: the logo (a lifter between the red "3" and "4" tiles) over a grey panel with the name
const signTex = () => canvasTex(1024, 512, (g, w) => {
  g.clearRect(0, 0, w, 512);
  const tile = (x, t) => { g.fillStyle = '#b3242c'; g.fillRect(x, 70, 120, 120); g.strokeStyle = '#e8e8e8'; g.lineWidth = 8; g.strokeRect(x, 70, 120, 120);
    g.fillStyle = '#ffffff'; g.font = 'bold 112px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + 60, 134); };
  tile(300, '3'); tile(604, '4');
  g.fillStyle = '#2f64b4'; g.strokeStyle = '#dfe8f5'; g.lineWidth = 6; // the lifter: head, torso, arms up to the bar, legs apart
  g.beginPath(); g.arc(512, 60, 30, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(470, 100); g.lineTo(554, 100); g.lineTo(540, 190); g.lineTo(574, 250); g.lineTo(548, 256); g.lineTo(512, 200);
  g.lineTo(476, 256); g.lineTo(450, 250); g.lineTo(484, 190); g.closePath(); g.fill(); g.stroke();
  g.fillRect(430, 20, 164, 14); g.fillRect(436, 30, 26, 76); g.fillRect(562, 30, 26, 76);
  g.fillStyle = '#6c7178'; g.strokeStyle = '#e6e6e6'; g.lineWidth = 8;
  g.beginPath(); g.roundRect(40, 262, 944, 240, 30); g.fill(); g.stroke();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 58px Arial, sans-serif'; g.fillText('ФІТНЕС-КЛУБ', 512, 314);
  g.font = 'bold 150px Arial, sans-serif'; g.fillText('ТРИ-ЧОТИРИ', 512, 425, 900);
}, false);

// ------------------------------------------------------------------------------------------------ face frame
function faceAt(cx, cz, nx, nz, dist, w) {
  const rx = nz, rz = -nx, mx = cx + nx * dist, mz = cz + nz * dist;
  return { nx, nz, rx, rz, w, ox: mx - rx * w / 2, oz: mz - rz * w / 2, open: [], N: [nx, 0, nz], R: [rx, 0, rz] };
}
const at = (f, s, y, o = 0) => [f.ox + f.rx * s + f.nx * o, y, f.oz + f.rz * s + f.nz * o];
// quad facing n (winding picked from n), uv per corner optional
function quad(D, a, b, c, d, n, uv) {
  const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], g = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const side = n[0] * (e[1] * g[2] - e[2] * g[1]) + n[1] * (e[2] * g[0] - e[0] * g[2]) + n[2] * (e[0] * g[1] - e[1] * g[0]);
  const V = [a, b, c, d].map((p, k) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv ? uv[k][0] : 0, uv ? uv[k][1] : 0));
  if (side >= 0) D.quad(V[0], V[1], V[2], V[3]); else D.quad(V[0], V[3], V[2], V[1]);
}
// box in the face frame, uv in metres / m; bits: 1 front, 2 back, 4 left, 8 right, 16 top, 32 bottom
function fbox(D, f, s0, s1, y0, y1, o0, o1, bits = 63, m = 2) {
  const P = (s, y, o) => at(f, s, y, o), U = (a, b, c, d) => [[a / m, b / m], [c / m, b / m], [c / m, d / m], [a / m, d / m]];
  if (bits & 1) quad(D, P(s0, y0, o1), P(s1, y0, o1), P(s1, y1, o1), P(s0, y1, o1), f.N, U(s0, y0, s1, y1));
  if (bits & 2) quad(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y1, o0), P(s0, y1, o0), neg(f.N), U(s0, y0, s1, y1));
  if (bits & 4) quad(D, P(s0, y0, o0), P(s0, y0, o1), P(s0, y1, o1), P(s0, y1, o0), neg(f.R), U(o0, y0, o1, y1));
  if (bits & 8) quad(D, P(s1, y0, o0), P(s1, y0, o1), P(s1, y1, o1), P(s1, y1, o0), f.R, U(o0, y0, o1, y1));
  if (bits & 16) quad(D, P(s0, y1, o0), P(s1, y1, o0), P(s1, y1, o1), P(s0, y1, o1), UP, U(s0, o0, s1, o1));
  if (bits & 32) quad(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y0, o1), P(s0, y0, o1), DN, U(s0, o0, s1, o1));
}
function fprism(S, f, s0, s1, o0, o1, y0, y1, kind, flags = 0) {
  const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = at(f, s, 0, o); return [p[0], p[2]]; });
  if (area2(Q) < 0) Q.reverse();
  S.prism(Q.flat(), y0, y1, 0, 0, kind, flags);
}
// wall surface y0..y1 minus the openings: cut into horizontal slabs at every opening edge, then into free s-runs
function wallBand(D, f, y0, y1, m, color) {
  const ys = [...new Set([y0, y1, ...f.open.flatMap((q) => [q.y0, q.y1]).filter((y) => y > y0 && y < y1)])].sort((a, b) => a - b);
  D.setColor(color);
  for (let i = 1; i < ys.length; i++) {
    const ya = ys[i - 1], yb = ys[i];
    const cuts = f.open.filter((q) => q.y0 < yb - 1e-3 && q.y1 > ya + 1e-3).sort((a, b) => a.s0 - b.s0);
    let s = 0;
    for (const q of [...cuts, { s0: f.w, s1: f.w }]) {
      if (q.s0 > s + 1e-3) quad(D, at(f, s, ya), at(f, q.s0, ya), at(f, q.s0, yb), at(f, s, yb), f.N, [[s / m, ya / m], [q.s0 / m, ya / m], [q.s0 / m, yb / m], [s / m, yb / m]]);
      s = Math.max(s, q.s1);
    }
  }
}

// ------------------------------------------------------------------------------------------------ openings
// q: { s0, s1, y0, y1, kind: 'win' | 'door' | 'gate' | 'hole', frame, glass, lit, film, rev (reveal colour) }
function opening(B, f, q) {
  const D = B.det, { s0, s1, y0, y1 } = q, back = -REV, fr = back + 0.06, t = 0.07;
  D.setColor(q.rev);
  quad(D, at(f, s0, y0), at(f, s0, y0, back), at(f, s0, y1, back), at(f, s0, y1), f.R);
  quad(D, at(f, s1, y0), at(f, s1, y0, back), at(f, s1, y1, back), at(f, s1, y1), neg(f.R));
  quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, back), at(f, s0, y1, back), DN);
  quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, back), at(f, s0, y0, back), UP);
  if (q.kind === 'hole') { D.setColor('#1d2124'); fbox(D, f, s0, s1, y0, y1, back - 0.02, back, 1); return; }
  if (q.kind === 'gate') { // steel leaf with a pressed rib every 0.4 m and a wicket door outline
    D.setColor('#6f7a7d'); fbox(D, f, s0, s1, y0, y1, back, back + 0.05, 1);
    D.setColor('#5a6366');
    for (let y = y0 + 0.4; y < y1 - 0.2; y += 0.4) fbox(D, f, s0 + 0.05, s1 - 0.05, y, y + 0.05, back, back + 0.07, 1 | 16 | 32);
    return;
  }
  if (q.kind === 'door') { D.setColor('#4d5357'); fbox(D, f, s0, s1, y0, y1, back, back + 0.05, 1); D.setColor('#30363a'); fbox(D, f, s0 + 0.2, s1 - 0.2, y1 - 0.8, y1 - 0.3, back, back + 0.055, 1); return; }
  D.setColor(q.frame);
  fbox(D, f, s0, s1, y1 - t, y1, back, fr, 1 | 32);
  fbox(D, f, s0, s1, y0, y0 + t, back, fr, 1 | 16);
  fbox(D, f, s0, s0 + t, y0 + t, y1 - t, back, fr, 1 | 8);
  fbox(D, f, s1 - t, s1, y0 + t, y1 - t, back, fr, 1 | 4);
  const w = s1 - s0, h = y1 - y0;
  if (w > 0.9) { const m = (s0 + s1) / 2; fbox(D, f, m - 0.035, m + 0.035, y0 + t, y1 - t, back, fr, 1 | 4 | 8); }
  if (h > 1.8) { const ym = y1 - 0.6; fbox(D, f, s0 + t, s1 - t, ym - 0.035, ym + 0.035, back, fr, 1 | 16 | 32); } // top vent lights
  const G = q.lit ? B.lit : B.glass, gz = back + 0.02;
  G.setColor(q.glass);
  quad(G, at(f, s0 + t, y0 + t, gz), at(f, s1 - t, y0 + t, gz), at(f, s1 - t, y1 - t, gz), at(f, s0 + t, y1 - t, gz), f.N);
  if (q.film) { D.setColor('#dfe7ee'); fbox(D, f, s0 + t, s1 - t, y0 + t, y0 + 1.1, gz, gz + 0.01, 1); } // gym film
  D.setColor(q.sill); fbox(D, f, s0 - 0.05, s1 + 0.05, y0 - 0.05, y0, -0.04, 0.08, 1 | 4 | 8 | 16);
}

// ------------------------------------------------------------------------------------------------ build
export function buildFitness34({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === OSM_ID);
  if (!b) return null;
  const t0 = performance.now(), r = rng(OSM_ID % 99991);
  const o = obb(ringPts(b.p));
  let ux = o.ux, uz = o.uz, hl = o.L / 2, hw = o.W / 2;
  if (hl < hw) { [ux, uz] = [-uz, ux]; [hl, hw] = [hw, hl]; }
  if (ux < 0) { ux = -ux; uz = -uz; }          // +u: the north-east (club) end
  const vx = -uz, vz = ux, cx = o.cx, cz = o.cz; // +v: south-east, the Narbutivska side
  const P = (a, c, y) => [cx + ux * a + vx * c, y, cz + uz * a + vz * c];
  const corners = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([a, c]) => [cx + ux * a + vx * c, cz + uz * a + vz * c]);
  const hs = [...corners, [cx, cz]].map(([x, z]) => heightAt(x, z));
  const yG = hs.reduce((s, h) => s + h, 0) / hs.length;
  const yF = yG + LIFT, gBase = Math.min(...hs) - 0.4, yE = yF + EAVE, yR = yE + RISE, y1 = yF + F1;

  const fNE = faceAt(cx, cz, ux, uz, hl, 2 * hw), fSW = faceAt(cx, cz, -ux, -uz, hl, 2 * hw);
  const fNW = faceAt(cx, cz, -vx, -vz, hw, 2 * hl), fSE = faceAt(cx, cz, vx, vz, hw, 2 * hl);
  const B = { siding: new MB(), brick: new MB(), roof: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB() };
  const W = fNE.w, L = fNW.w;
  const win = (f, c, w, ya, yb, extra) => f.open.push({ s0: c - w / 2, s1: c + w / 2, y0: ya, y1: yb, kind: 'win', frame: TIMBER,
    glass: GLASS[Math.floor(r() * GLASS.length)], lit: r() < 0.12, rev: '#cfc4a8', sill: '#8d8b86', ...extra });

  // ---- club end: four siding bays between five pilasters (left = SE corner as seen from the car park)
  const pil = [0, 1, 2, 3, 4].map((i) => 0.45 + i * (W - 0.9) / 4), bayC = [1, 2, 3, 4].map((i) => (pil[i - 1] + pil[i]) / 2);
  const club = { frame: WHITE, rev: '#e4e2da', sill: '#d9dbd8', lit: true };
  for (const i of [1, 2, 3]) for (const d of [-1, 1]) win(fNE, bayC[i] + d * 1.0, i === 3 ? 1.5 : 1.35, y1 + 1.0, y1 + (i === 3 ? 2.6 : 2.45), { ...club, glass: '#56606a', lit: r() < 0.7 });
  for (const i of [1, 3]) for (const d of [-1, 1]) win(fNE, bayC[i] + d * 0.95, 1.45, yF + 0.45, yF + 2.95, { ...club, glass: '#4a545c', film: i === 3 });
  const vc = bayC[2], vh = 1.8, vd = 1.6, vt = yF + 3.0; // entrance porch: glass box with a little gable
  fNE.open.push({ s0: vc - vh, s1: vc + vh, y0: yF, y1: vt, kind: 'hole', rev: '#dcdad2' });

  // ---- long sides: painted brick, a pier every 6 m frame bay, two windows per bay and floor
  const nb = Math.round(L / BAY), bw = L / nb, ramp = { s: bw * 4.5, w: 7 };
  for (const f of [fNW, fSE]) {
    for (let i = 0; i < nb; i++) {
      const c = (i + 0.5) * bw, clubEnd = f === fNW ? c < 36 : c > L - 36;
      for (const d of [-1.35, 1.35]) {
        const s = c + d, st = clubEnd ? { lit: r() < 0.55, frame: r() < 0.5 ? WHITE : TIMBER } : {};
        if (f === fNW && Math.abs(s - ramp.s) < 2.4) continue; // the ramp door
        if (r() < 0.06) continue;                                 // bricked-up
        win(f, s, 1.5, yF + 0.9, yF + 3.0, st);
        win(f, s, 1.5, y1 + 0.75, y1 + 2.85, st);
      }
    }
  }
  fNW.open.push({ s0: ramp.s - 1.3, s1: ramp.s + 1.3, y0: yF + 1.1, y1: yF + 3.6, kind: 'gate', rev: '#cfc4a8' });
  fSE.open.push({ s0: L * 0.3 - 0.55, s1: L * 0.3 + 0.55, y0: yF, y1: yF + 2.2, kind: 'door', rev: '#cfc4a8' });
  // ---- far (south-west) end: a goods gate and a window column either side
  fSW.open.push({ s0: W / 2 - 1.8, s1: W / 2 + 1.8, y0: yF, y1: yF + 3.6, kind: 'gate', rev: '#cfc4a8' });
  for (const s of [W * 0.2, W * 0.8]) { win(fSW, s, 1.5, yF + 0.9, yF + 3.0); win(fSW, s, 1.5, y1 + 0.75, y1 + 2.85); }

  // steps from the floor down to the local ground in front of a door (the lot falls ~1 m to the club end)
  const flight = (f, s0, s1, o0) => {
    const p = at(f, (s0 + s1) / 2, 0, o0 + 1.2), g = heightAt(p[0], p[2]), n = Math.ceil((yF - g - 0.04) / 0.17);
    B.det.setColor('#8a8a86');
    for (let k = 0; k < n; k++) fbox(B.det, f, s0, s1, gBase, yF - k * (yF - g) / n, o0, o0 + 0.32 * (k + 1), 1 | 4 | 8 | 16);
    if (n > 2) fprism(S, f, s0, s1, o0, o0 + 0.32 * n, gBase, yF - 0.3, 'wall');
  };
  flight(fSE, L * 0.3 - 0.85, L * 0.3 + 0.85, 0);

  // ---- walls
  const faces = [fNE, fNW, fSW, fSE];
  for (const f of faces) {
    B.det.setColor('#8f8d88');
    fbox(B.det, f, -0.02, f.w + 0.02, gBase, yF, -0.1, 0.06, 1 | 16); // plinth
    if (f === fNE) wallBand(B.siding, f, yF, yE, 2, CREAM);
    else {
      wallBand(B.brick, f, yF, yF + 0.55, 2, RAW);                     // raw brick base course under the paint
      wallBand(B.brick, f, yF + 0.55, yE, 2, PAINT);
    }
    for (const q of f.open) opening(B, f, q);
  }
  // pediments: blue siding on the club end, painted brick at the far end
  for (const [f, D, col] of [[fNE, B.siding, BLUE], [fSW, B.brick, PAINT]]) {
    D.setColor(col);
    const a = D.vert(...at(f, 0, yE), ...f.N, 0, yE / 2), c = D.vert(...at(f, W, yE), ...f.N, W / 2, yE / 2), m = D.vert(...at(f, W / 2, yR), ...f.N, W / 4, yR / 2);
    D.tri(a, c, m);
  }
  // club end: siding pilasters, the eaves trim, the porch, the sign
  B.siding.setColor(BLUE);
  for (const p of pil) fbox(B.siding, fNE, p - 0.45, p + 0.45, yF - 0.05, yE, 0, 0.12, 1 | 4 | 8);
  B.det.setColor(WHITE); fbox(B.det, fNE, -0.1, W + 0.1, yE - 0.12, yE + 0.04, 0, 0.16, 1 | 16 | 32);
  {
    const D = B.det, G = B.lit;
    D.setColor('#8a8a86'); fbox(D, fNE, vc - vh, vc + vh, gBase, yF, 0, vd, 1 | 4 | 8 | 16); flight(fNE, vc - vh - 0.3, vc + vh + 0.3, vd);
    G.setColor('#8fa4b0');
    quad(G, at(fNE, vc - vh, yF, vd), at(fNE, vc + vh, yF, vd), at(fNE, vc + vh, vt, vd), at(fNE, vc - vh, vt, vd), fNE.N);
    for (const s of [vc - vh, vc + vh]) quad(G, at(fNE, s, yF, 0), at(fNE, s, yF, vd), at(fNE, s, vt, vd), at(fNE, s, vt, 0), s < vc ? neg(fNE.R) : fNE.R);
    D.setColor(WHITE); // aluminium frame: posts, transom, the door pair in the middle
    for (const s of [vc - vh, vc - 0.9, vc, vc + 0.9, vc + vh]) fbox(D, fNE, s - 0.05, s + 0.05, yF, vt, vd - 0.05, vd + 0.03, 1 | 4 | 8);
    for (const y of [yF + 0.02, yF + 2.3, vt - 0.08]) fbox(D, fNE, vc - vh, vc + vh, y, y + 0.08, vd - 0.05, vd + 0.03, 1 | 16 | 32);
    for (const s of [vc - vh, vc + vh]) fbox(D, fNE, s - 0.05, s + 0.05, yF, vt, 0.75, 0.85, 4 | 8);
    for (const s of [vc - vh, vc + vh]) fbox(D, fNE, s - 0.05, s + 0.05, yF + 2.3, yF + 2.38, 0, vd, 16 | 32 | (s < vc ? 4 : 8));
    fbox(D, fNE, vc - 0.05, vc + 0.05, yF + 0.9, yF + 1.2, vd + 0.03, vd + 0.09, 1 | 4 | 8);               // door pulls
    // gable roof over it: two blue slopes rising to a ridge that runs out from the wall, a blue triangle in front
    const e0 = vt, er = vt + 0.85, ov = 0.25;
    D.setColor(BLUE);
    for (const sg of [-1, 1]) {
      const sE = vc + sg * (vh + ov), n = [fNE.R[0] * sg * 0.85 / 1.28, 1, fNE.R[2] * sg * 0.85 / 1.28];
      const l = Math.hypot(...n), nn = n.map((q) => q / l);
      const Q = [at(fNE, sE, e0, 0), at(fNE, sE, e0, vd + ov), at(fNE, vc, er, vd + ov), at(fNE, vc, er, 0)];
      quad(D, ...Q, nn); quad(D, ...Q, neg(nn));
    }
    const a = D.vert(...at(fNE, vc - vh, e0, vd + 0.01), ...fNE.N), c = D.vert(...at(fNE, vc + vh, e0, vd + 0.01), ...fNE.N), m = D.vert(...at(fNE, vc, er, vd + 0.01), ...fNE.N);
    D.tri(a, c, m); D.tri(a, m, c);
    fprism(S, fNE, vc - vh, vc + vh, -0.1, vd, gBase, er, 'wall');
    // the sign between the floors of the right-hand bay
    const sc = bayC[3], Sg = B.sign;
    Sg.setColor('#ffffff');
    quad(Sg, at(fNE, sc - 1.9, yF + 3.05, 0.2), at(fNE, sc + 1.9, yF + 3.05, 0.2), at(fNE, sc + 1.9, yF + 4.95, 0.2), at(fNE, sc - 1.9, yF + 4.95, 0.2), fNE.N,
      [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  // long sides: brick piers (raw at the corners, painted between), brown downpipes, a few AC units
  for (const f of [fNW, fSE, fSW]) {
    B.brick.setColor(RAW);
    fbox(B.brick, f, 0, 0.8, yF, yE, 0, 0.1, 1 | 8); fbox(B.brick, f, f.w - 0.8, f.w, yF, yE, 0, 0.1, 1 | 4);
    if (f === fSW) continue;
    B.brick.setColor(PAINT);
    for (let i = 1; i < nb; i++) fbox(B.brick, f, i * bw - 0.3, i * bw + 0.3, yF + 0.55, yE - 0.3, 0, 0.08, 1 | 4 | 8 | 16);
    B.det.setColor(PIPE);
    for (let i = 1; i < nb; i += 3) {
      const s = i * bw + 0.45;
      fbox(B.det, f, s - 0.06, s + 0.06, yF - 0.1, yE - 0.1, 0.1, 0.22, 1 | 4 | 8);
      fbox(B.det, f, s - 0.12, s + 0.12, yE - 0.35, yE - 0.1, 0.08, 0.3, 1 | 4 | 8 | 32);
    }
    for (const q of f.open) if (q.kind === 'win' && q.y0 > y1 && r() < 0.07) {
      const s = q.s1 + 0.55;
      B.det.setColor('#dededa'); fbox(B.det, f, s - 0.4, s + 0.4, q.y0 + 0.3, q.y0 + 0.85, 0, 0.3, 1 | 4 | 8 | 16 | 32);
      B.det.setColor('#8b8e8e'); fbox(B.det, f, s - 0.3, s + 0.2, q.y0 + 0.38, q.y0 + 0.78, 0.3, 0.31, 1);
    }
  }
  // loading ramp on the north-west side: a concrete dock with steps at its end, a canopy over it
  {
    const D = B.det, a = ramp.s - ramp.w / 2, c = ramp.s + ramp.w / 2, dh = yF + 1.1;
    D.setColor('#9a9790'); fbox(D, fNW, a, c, gBase, dh, 0, 2.6, 1 | 4 | 8 | 16);
    for (let k = 0; k < 5; k++) fbox(D, fNW, c, c + 0.3 * (5 - k), gBase, yF + 0.22 * k + 0.22, 0, 1.4, 1 | 8 | 16);
    D.setColor('#5d6062'); fbox(D, fNW, a, c, dh - 0.12, dh, 2.6, 2.7, 1 | 4 | 8); // steel edge angle
    fprism(S, fNW, a, c, -0.1, 2.6, gBase, dh, 'wall');
    const ch = yF + 4.2;
    D.setColor('#7c8387'); fbox(D, fNW, a - 0.3, c + 0.3, ch, ch + 0.12, 0, 3.0, 1 | 4 | 8 | 16 | 32);
    D.setColor('#4d5254'); for (const s of [a, ramp.s, c]) D.tube(at(fNW, s, ch - 1.2, 0), at(fNW, s, ch, 2.4), 0.04, 5); // diagonal struts
    fprism(S, fNW, a - 0.3, c + 0.3, -0.05, 3.0, ch, ch + 0.12, 'awning', 1);
  }

  // ---- roof: two trapezoid-sheet slopes from the eaves (0.35 m overhang) to the ridge, fascia, soffit, verge boards
  const ov = 0.35, sl = RISE / hw, yO = yE - ov * sl, eL = hl + 0.25, rl = Math.hypot(hw + ov, RISE + ov * sl);
  for (const sg of [-1, 1]) {
    const e0 = P(-eL, sg * (hw + ov), yO), e1 = P(eL, sg * (hw + ov), yO), r1 = P(eL, 0, yR), r0 = P(-eL, 0, yR);
    const n = [vx * sg * sl, 1, vz * sg * sl], nl = Math.hypot(...n), N = n.map((q) => q / nl);
    B.roof.setColor(sg > 0 ? '#80878d' : '#767d83');
    quad(B.roof, e0, e1, r1, r0, N, [[-eL, rl], [eL, rl], [eL, 0], [-eL, 0]]);
    B.det.setColor('#9ca0a2');
    quad(B.det, e0, e1, P(eL, sg * hw, yE), P(-eL, sg * hw, yE), DN);                  // soffit
    quad(B.det, e0, e1, P(eL, sg * (hw + ov), yO - 0.22), P(-eL, sg * (hw + ov), yO - 0.22), [vx * sg, 0, vz * sg]); // fascia
    for (const ue of [-1, 1]) { // verge boards along the gable slopes
      const fe = ue > 0 ? fNE : fSW, q = [P(ue * eL, sg * (hw + ov), yO), P(ue * eL, 0, yR), P(ue * eL, 0, yR - 0.25), P(ue * eL, sg * (hw + ov), yO - 0.25)];
      B.det.setColor(ue > 0 ? WHITE : '#9ca0a2'); quad(B.det, ...q, fe.N);
      B.det.setColor('#8d9194'); quad(B.det, P(ue * hl, sg * (hw + ov), yO), P(ue * eL, sg * (hw + ov), yO), P(ue * eL, 0, yR), P(ue * hl, 0, yR), DN);
    }
    // collision: the slope as a sloped prism top (gentle enough to drive on)
    const half = [[hl, 0], [hl, sg * hw], [-hl, sg * hw], [-hl, 0]].map(([a, c]) => [cx + ux * a + vx * c, cz + uz * a + vz * c]);
    const k = RISE / hw, dot = cx * vx + cz * vz;
    S.prism((area2(half) < 0 ? half.reverse() : half).flat(), yE, yR + sg * k * dot, -sg * k * vx, -sg * k * vz, 'roof');
    const ea = P(-hl, sg * hw, 0), eb = P(hl, sg * hw, 0);
    Z.edge(ea[0], ea[2], eb[0], eb[2], yE, vx * sg, vz * sg);
  }
  // skylight strip down the north-west slope (the pale band on the aerial photos), ridge cap
  {
    const up = (c) => yR - Math.abs(c) * sl + 0.07, n = [-vx * sl, 1, -vz * sl];
    B.glass.setColor('#9fb3c2');
    quad(B.glass, P(-hl + 4, -0.6, up(0.6)), P(hl - 4, -0.6, up(0.6)), P(hl - 4, -3.6, up(3.6)), P(-hl + 4, -3.6, up(3.6)), n);
    B.det.setColor('#80868b');
    for (const sg of [-1, 1]) quad(B.det, P(-eL, 0, yR + 0.08), P(eL, 0, yR + 0.08), P(eL, sg * 0.3, yR - 0.3 * sl), P(-eL, sg * 0.3, yR - 0.3 * sl), [vx * sg * 0.3, 1, vz * sg * 0.3]);
  }
  S.prism((area2(corners) < 0 ? corners.slice().reverse() : corners).flat(), gBase, yE, 0, 0, 'wall');

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'fitness34' });
  root.add(group);
  const sTex = signTex();
  const M = {
    siding: new THREE.MeshStandardMaterial({ map: sidingTex(), vertexColors: true, roughness: 0.6 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex(r), vertexColors: true, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ map: sheetTex(), vertexColors: true, roughness: 0.5, metalness: 0.35 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.1, emissive: 0xfff1d8, emissiveIntensity: 0 }),
    sign: new THREE.MeshStandardMaterial({ map: sTex, emissiveMap: sTex, emissive: 0xffffff, emissiveIntensity: 0.05, transparent: true, alphaTest: 0.35, roughness: 0.4 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    const see = k === 'glass' || k === 'lit' || k === 'sign';
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'fit34-' + k, castShadow: !see, receiveShadow: true }));
  }
  console.log(`[cherkasy] Fitness club 3-4: ${faces.reduce((n, f) => n + f.open.length, 0)} openings, ${(nV / 1000).toFixed(1)}k verts, floor y ${yF.toFixed(1)} in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints: [{ poly: ringPts(b.p), h: yR - yG, kind: b.k, name: 'Фітнес-клуб «3-4»' }],
    clear: (x, z) => { const dx = x - cx, dz = z - cz; return Math.abs(dx * ux + dz * uz) < hl + 3 && Math.abs(dx * vx + dz * vz) < hw + 4; },
    update() { const k = nightK.value; M.lit.emissiveIntensity = 1.2 * k; M.sign.emissiveIntensity = 0.05 + 1.1 * k; },
  };
}
