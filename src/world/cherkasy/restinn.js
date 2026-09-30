// OWNER: cherkasy. Hero building: REST INN. apart hotel + the Делікат supermarket (vul. Nadpilna 252/1 /
// vul. B. Khmelnytskoho 55, OSM way 129420363) – a Soviet industrial block re-clad as a 4-storey hotel: red-brick
// pylons crowned with embroidery (vyshyvanka) ornaments, recessed full-height glazing bays with gold fins, a dark
// panel ground band with ochre pilasters, the gold "REST INN." canopy over the hotel door; the north-west half is the
// supermarket (shop units with signs, "ДЕЛІКАТ" letters, the "СУПЕРМАРКЕТ" portal) as in the owner's concept render.
// The south end of the same block (past USPACE_CUT, Nadpilna 252) is the U space office tower: six lower storeys under
// a taller brick crown, dark composite panels framing recessed brick panels, a glazed lobby with steps on the car park.
//   HERO_SKIP: OSM ids replaced here (buildings.js skips them)
// The floors over the hotel next to the tower are the Everlabs offices: their logo stands as a lit sign on the roof.
//   buildRestInn({ root, map, solids, zips, heightAt, geo }) -> { update(dt), partners: { uspace, everlabs } } | null
//     partner: { door: { x, y, z, nx, nz } (the ground where its ring goes; nx / nz: outward), glow(0..1) (light-up) }
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { decal } from './sculpt.js';
import { ringPts, area2, triangulate, convexParts, rng } from './geo.js';
import { USPACE_CUT, clipRing } from './places.js';
import { logoTexture } from '../../kit/logo.js';

const ID = 129420363;
export const HERO_SKIP = new Set([ID]);
const HOTEL = [49.4310078, 32.06801]; // the hotel door (Google Maps pin)

// ---- storeys (metres above the ground-floor datum g0)
const FL = 0.9;              // ground floor level (the steps rise to it)
const BAND0 = 0.6, BAND1 = 4.6, FAS1 = 5.8; // dark ground band / fascia
const UP = [5.8, 9.2, 12.6]; // upper floor levels
const ROOF = 16.0, PYL = 17.0;
// U space tower: six office storeys from the lobby floor up, the brick crown above the top slab
const T_LV = 3.2, T_ROOF = FL + 6 * T_LV, T_CROWN = T_ROOF - 1.6, T_TOP = T_ROOF + 1.4;

// ------------------------------------------------------------------------------------------------ textures
function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const brickTex = () => canvasTex(512, 512, (g, w, h) => { // 2 x 2 m, running bond 250 x 65 mm
  const r = rng(11), rows = 26, rh = h / rows, bw = w / 8;
  g.fillStyle = '#8a4a36'; g.fillRect(0, 0, w, h);
  for (let j = 0; j < rows; j++) for (let i = -1; i < 9; i++) {
    const x = i * bw + (j % 2 ? bw / 2 : 0), k = r();
    g.fillStyle = `rgb(${178 + k * 26 | 0},${92 + k * 18 | 0},${64 + k * 12 | 0})`;
    g.fillRect(x + 1.5, j * rh + 1.5, bw - 3, rh - 3);
  }
  const d = g.getImageData(0, 0, w, h); for (let k = 0; k < d.data.length; k += 4) { const n = (r() - 0.5) * 14; d.data[k] += n; d.data[k + 1] += n; d.data[k + 2] += n; } g.putImageData(d, 0, 0);
}, { repeat: true });
const panelTex = () => canvasTex(256, 256, (g, w, h) => { // 3 x 3 m composite panels, 1.5 m modules
  g.fillStyle = '#44474b'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2b2d30'; for (let k = 0; k <= 2; k++) { g.fillRect(k * w / 2 - 1, 0, 2, h); g.fillRect(0, k * h / 2 - 1, w, 2); }
  const r = rng(5); for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(255,255,255,${r() * 0.03})`; g.fillRect(r() * w, r() * h, 2, 2); }
}, { repeat: true });
// embroidery band on the pylon heads: rhombus "berehynia" motifs joined by a zig-zag, crosses and hooks
const ornamentTex = () => canvasTex(1024, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = '#3a2622'; g.fillStyle = '#3a2622'; g.lineWidth = 7; g.lineCap = 'square';
  const n = 4, cy = h / 2;
  const cross = (x, y, s) => { g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke(); };
  for (let k = 0; k < n; k++) {
    const cx = (k + 0.5) * w / n, R = 44;
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx + R, cy); g.lineTo(cx, cy + R); g.lineTo(cx - R, cy); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, 18); g.moveTo(cx, cy + R); g.lineTo(cx, h - 18); g.stroke();
    cross(cx, 22, 16); cross(cx, h - 22, 16); g.fillRect(cx - 9, cy - 9, 18, 18);
    for (const s of [-1, 1]) { // arms with hooks
      g.beginPath(); g.moveTo(cx + s * R, cy); g.lineTo(cx + s * (R + 30), cy - 30); g.lineTo(cx + s * (R + 44), cy - 16); g.moveTo(cx + s * R, cy); g.lineTo(cx + s * (R + 30), cy + 30); g.lineTo(cx + s * (R + 44), cy + 16); g.stroke();
    }
    if (k < n - 1) { const x0 = cx + R + 50, x1 = cx + w / n - R - 50; g.beginPath(); g.moveTo(x0, cy); g.lineTo((x0 + x1) / 2, cy - 22); g.lineTo(x1, cy); g.stroke(); cross((x0 + x1) / 2, cy + 20, 10); }
  }
}, { srgb: true });
// reflective glazing: a soft sky / tree-line gradient over each pane (the env map adds the live sky on top)
const skyTex = () => canvasTex(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#9fb4c6'); gr.addColorStop(0.55, '#6f879b'); gr.addColorStop(0.8, '#4d5d52'); gr.addColorStop(1, '#3b4640'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
// wall-washer light cone (vertical streak, brightest just under the fixture)
const washTex = () => canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) { const t = y / h, v = Math.exp(-Math.abs(t - 0.45) * 4.5) * Math.min(1, t * 8, (1 - t) * 8); for (let x = 0; x < w; x++) { const e = ((x + 0.5) / w - 0.5) / (0.1 + 0.3 * Math.abs(t - 0.45)), q = Math.exp(-e * e) * v; g.fillStyle = `rgb(${255 * q | 0},${190 * q | 0},${120 * q | 0})`; g.fillRect(x, y, 1, 1); } }
});
// lit hotel room seen through the glass: warm ceiling light falling off downward, curtains at the sides
const roomTex = () => canvasTex(64, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd9a0'); gr.addColorStop(0.45, '#c98a4c'); gr.addColorStop(1, '#5a3418'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(40,22,10,0.55)'; g.fillRect(0, 0, w * 0.16, h); g.fillRect(w * 0.84, 0, w * 0.16, h);
  g.fillStyle = 'rgba(30,16,8,0.5)'; g.fillRect(w * 0.3, h * 0.72, w * 0.4, h * 0.28); // furniture silhouette
});
const shopTex = (seed) => canvasTex(256, 256, (g, w, h) => { // warm lit shop interior with stocked shelves
  const r = rng(seed), gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#f6dcae'); gr.addColorStop(0.35, '#c9965e'); gr.addColorStop(1, '#5a3a22'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,250,230,0.9)'; g.beginPath(); g.arc(20 + k * 44, 10, 5, 0, Math.PI * 2); g.fill(); }
  const P = ['#e0822a', '#c23b22', '#7fa83a', '#e8c14a', '#a0522d', '#d9d2b0', '#5c8a2e'];
  for (let s = 0; s < 4; s++) {
    const y = 70 + s * 42; g.fillStyle = '#3b2616'; g.fillRect(0, y + 26, w, 5);
    for (let x = 4; x < w - 8; x += 7 + r() * 6) { g.fillStyle = P[(r() * P.length) | 0]; const hh = 10 + r() * 14; g.fillRect(x, y + 26 - hh, 5 + r() * 4, hh); }
  }
  g.fillStyle = 'rgba(40,24,12,0.55)'; for (let k = 0; k < 3; k++) g.fillRect(40 + k * 80 + r() * 20, 150 + r() * 30, 10, 60); // shoppers
});
function textTex(text, { w = 1024, h = 160, bg = '#1d1e20', fg = '#f4f1ea', font = 'bold 96px Arial, sans-serif', logo = false } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
    g.font = font; g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(text).width, x = w / 2 + (logo ? h * 0.22 : 0);
    g.fillText(text, x, h / 2 + 4);
    if (logo) { const x0 = x - tw / 2 - h * 0.5; for (let k = 0; k < 4; k++) { const bh = h * (0.34 + k * 0.1); g.fillRect(x0 + k * h * 0.09, h / 2 + h * 0.3 - bh, h * 0.05, bh); } }
  });
}

// ------------------------------------------------------------------------------------------------ geometry
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const neg = (a) => [-a[0], -a[1], -a[2]];
function quad(D, V, n, UV) {
  const ids = V.map((p, i) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], UV[i][0], UV[i][1]));
  if (dot(crs(sub(V[1], V[0]), sub(V[2], V[0])), n) < 0) D.tri(ids[0], ids[2], ids[1]).tri(ids[0], ids[3], ids[2]);
  else D.tri(ids[0], ids[1], ids[2]).tri(ids[0], ids[2], ids[3]);
}
// frame of a footprint edge A -> B: a along the edge, d outward (ccw ring: normal (dz, -dx)), y up from base
class EF {
  constructor(A, B, y) { this.A = A; const dx = B[0] - A[0], dz = B[1] - A[1]; this.L = Math.hypot(dx, dz); this.ux = dx / this.L; this.uz = dz / this.L; this.nx = this.uz; this.nz = -this.ux; this.y = y; this.n = [this.nx, 0, this.nz]; this.u = [this.ux, 0, this.uz]; }
  p(a, y, d) { return [this.A[0] + this.ux * a + this.nx * d, this.y + y, this.A[1] + this.uz * a + this.nz * d]; }
  xz(a, d) { return [this.A[0] + this.ux * a + this.nx * d, this.A[1] + this.uz * a + this.nz * d]; }
}
// box in an edge frame, metric UVs (s = 1 / texture size in m); faces: 1 front(+d) 2 back 4 left(-a) 8 right(+a) 16 top 32 bottom
function ebox(D, E, a0, a1, y0, y1, d0, d1, s = 1, faces = 29) {
  const P = (a, y, d) => E.p(a, y, d), n = E.n, u = E.u;
  if (faces & 1) quad(D, [P(a0, y0, d1), P(a1, y0, d1), P(a1, y1, d1), P(a0, y1, d1)], n, [[-a0 * s, y0 * s], [-a1 * s, y0 * s], [-a1 * s, y1 * s], [-a0 * s, y1 * s]]);
  if (faces & 2) quad(D, [P(a1, y0, d0), P(a0, y0, d0), P(a0, y1, d0), P(a1, y1, d0)], neg(n), [[a1 * s, y0 * s], [a0 * s, y0 * s], [a0 * s, y1 * s], [a1 * s, y1 * s]]);
  if (faces & 4) quad(D, [P(a0, y0, d0), P(a0, y0, d1), P(a0, y1, d1), P(a0, y1, d0)], neg(u), [[-d0 * s, y0 * s], [-d1 * s, y0 * s], [-d1 * s, y1 * s], [-d0 * s, y1 * s]]);
  if (faces & 8) quad(D, [P(a1, y0, d1), P(a1, y0, d0), P(a1, y1, d0), P(a1, y1, d1)], u, [[d1 * s, y0 * s], [d0 * s, y0 * s], [d0 * s, y1 * s], [d1 * s, y1 * s]]);
  if (faces & 16) quad(D, [P(a0, y1, d0), P(a1, y1, d0), P(a1, y1, d1), P(a0, y1, d1)], [0, 1, 0], [[a0 * s, d0 * s], [a1 * s, d0 * s], [a1 * s, d1 * s], [a0 * s, d1 * s]]);
  if (faces & 32) quad(D, [P(a0, y0, d0), P(a1, y0, d0), P(a1, y0, d1), P(a0, y0, d1)], [0, -1, 0], [[a0 * s, d0 * s], [a1 * s, d0 * s], [a1 * s, d1 * s], [a0 * s, d1 * s]]);
}
// outward-facing decal / pane: UV 0..1, u runs left -> right as seen from outside (= decreasing a)
const plane = (D, E, a0, a1, y0, y1, d) => quad(D, [E.p(a0, y0, d), E.p(a1, y0, d), E.p(a1, y1, d), E.p(a0, y1, d)], E.n, [[1, 0], [0, 0], [0, 1], [1, 1]]);

// ------------------------------------------------------------------------------------------------ build
export function buildRestInn({ root, map, solids: S, zips: Z, heightAt, geo }) {
  const t0 = performance.now();
  const b = map.buildings.find(q => q.id === ID); if (!b) return null;
  const ccwPts = (F) => { const Q = ringPts(F); return area2(Q) < 0 ? Q.reverse() : Q; };
  const flip = { p: USPACE_CUT.p, n: USPACE_CUT.n.map((v) => -v) };
  const P = ccwPts(clipRing(b.p, flip)), TQ = ccwPts(clipRing(b.p, USPACE_CUT));
  const onCut = (A, B) => [A, B].every(([x, z]) => Math.abs((x - USPACE_CUT.p[0]) * USPACE_CUT.n[0] + (z - USPACE_CUT.p[1]) * USPACE_CUT.n[1]) < 0.05);
  const hs = ccwPts(b.p).map(([x, z]) => heightAt(x, z)), g0 = hs.reduce((a, h) => a + h, 0) / hs.length + 0.15, gLo = Math.min(...hs) - 0.6;
  const R = rng(ID % 100000);

  const T = { brick: brickTex(), panel: panelTex(), orn: ornamentTex() };
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: T.brick, roughness: 0.92 }),
    dark: new THREE.MeshStandardMaterial({ map: T.panel, roughness: 0.5, metalness: 0.35 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xbf8f45, roughness: 0.5, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ map: skyTex(), color: 0xffffff, roughness: 0.06, metalness: 0.55, envMapIntensity: 1.6 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.45, metalness: 0.5 }),
    granite: new THREE.MeshStandardMaterial({ color: 0x5a5b5f, roughness: 0.62 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x5d5f62, roughness: 0.95 }),
    orn: decal(new THREE.MeshStandardMaterial({ map: T.orn, transparent: true, alphaTest: 0.4, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })),
    grass: new THREE.MeshStandardMaterial({ color: 0x4f5a2e, roughness: 1 }),
    lit: new THREE.MeshBasicMaterial({ map: roomTex(), color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 1.1) }),
    wash: new THREE.MeshBasicMaterial({ map: washTex(), color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
  };
  const glow = []; // emissive materials: [material, day intensity, night gain]
  const emissiveMat = (tex, day, night, o = {}) => { const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: day, roughness: 0.3, ...o }); glow.push([m, day, night]); return m; };
  const D = {}; const mb = (k) => (D[k] ??= new MB());
  const extra = []; // [MB, material, name] for per-texture meshes
  const own = (mat, name) => { const d = new MB(); extra.push([d, mat, name]); return d; };

  // the façade edge facing Nadpilna (the long +x side) carries the shops and the hotel door
  const edges = P.map((A, i) => new EF(A, P[(i + 1) % P.length], g0));
  const main = edges.reduce((m, e) => (e.L * Math.max(0, e.nx) > m.L * Math.max(0, m.nx) ? e : m));
  const [hx, hz] = geo.toXZ(...HOTEL);
  const aHotel = Math.min(main.L - 6, Math.max(6, (hx - main.A[0]) * main.ux + (hz - main.A[1]) * main.uz));
  const shopEnd = Math.min(aHotel - 18, 64); // Делікат: a in [0, shopEnd]
  // the short north-west end (on vul. B. Khmelnytskoho): the supermarket's street front
  const nwEnd = edges.find(e => e !== main && e.L > 25 && e.nz < -0.9);

  // ---- upper storeys on every edge: brick pylons alternating with recessed glazing bays
  const upper = (E) => {
    const L = E.L, sB = 0.5;
    if (L < 7) { ebox(mb('brick'), E, -0.3, L + 0.3, BAND0, PYL, -0.3, 0.3, sB); return; }
    const n = Math.max(1, Math.round((L - 8.3) / 15.1)), pw = L / (n + 1 + n * 0.82), Bw = pw * 0.82; // n bays, n + 1 pylons
    for (let k = 0; k <= n; k++) {
      const a0 = k * (pw + Bw), a1 = a0 + pw;
      ebox(mb('brick'), E, k ? a0 : -0.3, k === n ? L + 0.3 : a1, BAND1, PYL, -0.3, 0.3, sB);
      S.prism([E.xz(a0, -0.3), E.xz(a1, -0.3), E.xz(a1, 0.3), E.xz(a0, 0.3)].flat(), gLo, g0 + PYL, 0, 0, 'parapet');
      const [cx, cz] = E.xz((a0 + a1) / 2, 0); Z.add(cx, g0 + PYL, cz, E.nx, 0, E.nz, 'roofCorner');
      if (pw > 3.2) { // embroidery head + a pair of small windows on the second floor
        plane(own(M.orn, 'ornament'), E, a0 + 0.5, a1 - 0.5, 13.9, 16.5, 0.305);
        const c = (a0 + a1) / 2;
        for (const s of [-1, 1]) { const w0 = c + (s < 0 ? -1.1 : 0.15), w1 = w0 + 0.95; win(E, w0, w1, 6.6, 8.7, 0.3); }
      }
    }
    for (let k = 0; k < n; k++) {
      const a0 = pw + k * (pw + Bw), a1 = a0 + Bw;
      ebox(mb('dark'), E, a0, a1, 15.2, ROOF + 0.4, -0.35, 0.08, 1 / 3, 1 | 16); // head frame
      plane(mb('glass'), E, a0, a1, FAS1, 15.2, -0.3);
      const nf = Math.max(2, Math.round(Bw / 1.6)), fs = Bw / nf;
      for (let f = 1; f < nf; f++) ebox(mb('gold'), E, a0 + f * fs - 0.07, a0 + f * fs + 0.07, FAS1, ROOF + 0.2, -0.3, 0.1, 1, 1 | 4 | 8);
      for (let f = 0; f < nf; f++) {
        const m = a0 + (f + 0.5) * fs; ebox(mb('frame'), E, m - 0.03, m + 0.03, FAS1, 15.2, -0.3, -0.25, 1, 1 | 4 | 8);
        for (const y of UP) { // slab bands + transom lights; random lit rooms at night
          ebox(mb('frame'), E, a0 + f * fs, a0 + (f + 1) * fs, y - 0.12, y + 0.12, -0.3, -0.24, 1, 1 | 16);
          ebox(mb('frame'), E, a0 + f * fs, a0 + (f + 1) * fs, y + 2.55, y + 2.62, -0.3, -0.26, 1, 1);
          if (R() < 0.38) plane(mb('lit'), E, a0 + f * fs + 0.08, a0 + (f + 1) * fs - 0.08, y + 0.15, y + 2.5, -0.29);
        }
      }
    }
  };
  // punched window (frame box + glass + transom); lit at night now and then
  const win = (E, a0, a1, y0, y1, d) => {
    ebox(mb('frame'), E, a0, a1, y0, y1, d - 0.05, d + 0.04, 1, 1 | 4 | 8 | 16);
    plane(mb('glass'), E, a0 + 0.07, a1 - 0.07, y0 + 0.07, y1 - 0.07, d + 0.045);
    const yt = y0 + (y1 - y0) * 0.72; ebox(mb('frame'), E, a0, a1, yt - 0.03, yt + 0.03, d, d + 0.07, 1, 1 | 16);
    if (a1 - a0 > 1.6) ebox(mb('frame'), E, (a0 + a1) / 2 - 0.03, (a0 + a1) / 2 + 0.03, y0, y1, d, d + 0.07, 1, 1 | 4 | 8);
    if (R() < 0.3) plane(mb('lit'), E, a0 + 0.08, a1 - 0.08, y0 + 0.08, y1 - 0.08, d + 0.05);
  };
  const signs = new Map(); const signMat = (text, o) => { if (!signs.has(text)) signs.set(text, emissiveMat(textTex(text, o), 0.35, 1.6)); return signs.get(text); };
  const shopMats = [0, 1, 2].map(k => emissiveMat(shopTex(21 + k), 0.55, 0.9, { roughness: 0.18 }));

  // ---- ground band: pilaster bays holding hotel windows or shop units
  const SHOPS = ['АПТЕКА', 'КАВА', 'ПЕКАРНЯ', "М'ЯСО", 'СИРИ', 'ОВОЧІ', 'ОВОЧІ & ФРУКТИ'];
  const ground = (E) => {
    const L = E.L;
    ebox(mb('granite'), E, -0.45, L + 0.45, gLo - g0, BAND0, -0.2, 0.42, 1, 1 | 4 | 8 | 16); // plinth
    ebox(mb('dark'), E, -0.45, L + 0.45, BAND1, FAS1, -0.2, 0.48, 1 / 3, 29 | 32); // fascia
    Z.edge(...E.xz(0, 0.48), ...E.xz(L, 0.48), g0 + FAS1, E.nx, E.nz, 'ledge', 6);
    if (L < 7) { ebox(mb('dark'), E, -0.3, L + 0.3, BAND0, BAND1, -0.2, 0.22, 1 / 3); return; }
    const isMain = E === main, isNW = E === nwEnd;
    // openings: [a0, a1, kind]
    const ops = [];
    if (isMain) {
      const ents = [[shopEnd - 26, shopEnd - 14, 'market'], [aHotel - 3.3, aHotel + 3.3, 'hotel']];
      let a = 0.6, si = 0;
      const bayTo = (lim, kind, bw) => { const n = Math.max(1, Math.round((lim - a) / bw)), w = (lim - a) / n; for (let k = 0; k < n; k++) { ops.push([a, a + w, kind, si++]); a += w; } };
      bayTo(ents[0][0], 'shopR', 4.6); ops.push(ents[0]); a = ents[0][1];
      bayTo(shopEnd, 'shopL', 5.2);
      bayTo(ents[1][0], 'win', 3.9); ops.push(ents[1]); a = ents[1][1];
      bayTo(L - 0.6, 'win', 3.9);
    } else {
      const n = Math.max(1, Math.round((L - 1.2) / 3.9)), w = (L - 1.2) / n;
      for (let k = 0; k < n; k++) ops.push([0.6 + k * w, 0.6 + (k + 1) * w, isNW ? 'shopN' : 'win', k]);
    }
    { // dark band wall, cut open at the entrances
      let a = -0.3; for (const [a0, a1, kind] of ops) if (kind === 'hotel' || kind === 'market') { ebox(mb('dark'), E, a, a0, BAND0, BAND1, -0.2, 0.2, 1 / 3, 1 | 4 | 8); a = a1; }
      ebox(mb('dark'), E, a, L + 0.3, BAND0, BAND1, -0.2, 0.2, 1 / 3, 1 | 4 | 8);
    }
    const pil = (a) => ebox(mb('gold'), E, a - 0.2, a + 0.2, BAND0, BAND1, 0.2, 0.42, 1, 1 | 4 | 8);
    const nShopR = ops.filter(o => o[2] === 'shopR').length;
    for (const [a0, a1, kind, idx] of ops) {
      if (kind === 'win') { pil(a0); win(E, a0 + 0.55, a1 - 0.55, 1.5, 3.9, 0.2); continue; }
      if (kind === 'hotel') { hotelDoor(E, a0, a1); continue; }
      if (kind === 'market') { marketPortal(E, a0, a1); continue; }
      // shop unit: full-height glazing, black sign panel, lit interior, wall washers
      pil(a0); plane(mb('wash'), E, a0 - 0.4, a0 + 0.4, 0.9, 4.5, 0.43);
      const g = own(shopMats[idx % 3], 'shop'); plane(g, E, a0 + 0.35, a1 - 0.35, FL, 3.75, 0.21);
      ebox(mb('frame'), E, a0 + 0.3, a1 - 0.3, FL - 0.05, 3.8, 0.2, 0.26, 1, 16);
      for (const m of [a0 + 0.3, (a0 + a1) / 2, a1 - 0.35]) ebox(mb('frame'), E, m, m + 0.07, FL, 3.8, 0.2, 0.27, 1, 1 | 4 | 8);
      ebox(mb('frame'), E, a0 + 0.3, a1 - 0.3, 3.8, 4.45, 0.2, 0.3, 1, 1 | 16);
      const txt = kind === 'shopR' ? SHOPS[(nShopR - 1 - idx) % SHOPS.length] : kind === 'shopL' ? ['КВІТИ', 'ЕКОТОВАРИ', 'КАВА'][Math.max(0, idx - nShopR) % 3] : ['ДЕЛІКАТ', 'АПТЕКА', 'КАВА', 'ПЕКАРНЯ'][idx % 4];
      const tw = Math.min(a1 - a0 - 0.9, 0.28 * txt.length + 0.8), c = (a0 + a1) / 2;
      plane(own(signMat(txt), 'sign'), E, c - tw / 2, c + tw / 2, 3.88, 4.38, 0.305);
      ebox(mb('frame'), E, a0 - 0.12, a0 + 0.12, 2.6, 3.0, 0.42, 0.58); // wall washer
      mb('lampF'); plane(D.lampF, E, a0 - 0.08, a0 + 0.08, 2.5, 2.62, 0.59);
      if (isNW && idx % 4 === 0 && a1 - a0 > 3) plane(own(signMat('ДЕЛІКАТ', { bg: null, fg: '#eceae4', font: 'bold 120px Arial, sans-serif' }), 'letters'), E, c - 3.2, c + 3.2, FAS1 - 1.05, FAS1 - 0.1, 0.485);
    }
    if (isMain) { // big "ДЕЛІКАТ" letters on the fascia over the shop row
      const shopRs = ops.filter(o => o[2] === 'shopR'), c = shopRs.length ? (shopRs[0][0] + shopRs[shopRs.length - 1][1]) / 2 : shopEnd / 2;
      plane(own(signMat('ДЕЛІКАТ', { bg: null, fg: '#eceae4', font: 'bold 120px Arial, sans-serif' }), 'letters'), E, c - 4.5, c + 4.5, BAND1 + 0.1, FAS1 - 0.1, 0.485);
    }
    // grass beds with ornamental grasses + bollard lights along the hotel front
    if (isMain) for (let a = shopEnd + 1.5; a < main.L - 1.5; a += 5) {
      if (Math.abs(a - aHotel) < 5.5) continue;
      ebox(mb('grass'), E, a - 2, a + 2, gLo - g0, 0.12, 0.6, 2.4, 1, 1 | 4 | 8 | 16);
      ebox(mb('frame'), E, a - 0.07, a + 0.07, 0, 0.85, 3.0, 3.14, 1, 29); plane(mb('lampF'), E, a - 0.06, a + 0.06, 0.7, 0.8, 3.145);
    }
  };
  // stairs from the pavement up to FL: n steps outward from d0, width a0..a1; railings on both sides
  const stairs = (E, a0, a1, d0, n = 6, rails = true) => {
    const run = 0.32, rise = FL / n;
    for (let k = 0; k < n; k++) ebox(mb('granite'), E, a0, a1, gLo - g0, FL - k * rise, d0, d0 + (k + 1) * run, 1, 1 | 4 | 8 | 16);
    const d1 = d0 + n * run;
    const lo = E.xz(a0, d1), hi = E.xz(a1, d1), l0 = E.xz(a0, d0), h0 = E.xz(a1, d0);
    const q = [[...lo, g0], [...hi, g0], [...h0, g0 + FL]]; const pl = planeOf3(q.map(([x, z, y]) => [x, y, z]));
    if (pl) S.prism(ccw([l0, lo, hi, h0]).flat(), gLo, pl.a, pl.bx, pl.bz, 'wall');
    if (rails) for (const a of [a0 + 0.1, a1 - 0.1]) {
      for (const d of [d0 + 0.1, d1 - 0.15]) ebox(mb('steel'), E, a - 0.025, a + 0.025, d > d0 + 0.5 ? 0.1 : FL, (d > d0 + 0.5 ? 0.1 : FL) + 1.0, d - 0.025, d + 0.025, 1, 29);
      const D2 = mb('steel'); D2.tube(E.p(a, FL + 1.0, d0 + 0.1), E.p(a, 1.1, d1 - 0.15), 0.025, 5);
    }
  };
  const hotelDoor = (E, a0, a1) => {
    const c = (a0 + a1) / 2;
    ebox(mb('dark'), E, a0, a1, BAND0, 4.4, -0.45, -0.2, 1 / 3, 1); // back of the opening
    ebox(mb('brick'), E, a0, c - 0.1, FL, 4.3, -0.2, 0.05, 0.5, 1); // brick recess (left of the door as seen from inside)
    plane(mb('glass'), E, c - 0.1, a1 - 0.3, FL, 4.1, 0.0);
    ebox(mb('frame'), E, c - 0.15, a1 - 0.25, FL, 4.3, -0.12, -0.02, 1, 1);
    for (const m of [c - 0.1, (c + a1) / 2, a1 - 0.35]) ebox(mb('frame'), E, m, m + 0.07, FL, 4.1, 0, 0.06, 1, 1 | 4 | 8);
    ebox(mb('frame'), E, c - 0.1, a1 - 0.3, 3.1, 3.17, 0, 0.06, 1, 1);
    plane(mb('lit'), E, c, a1 - 0.4, FL + 0.1, 3.0, 0.02);
    for (const a of [a0, a1]) { ebox(mb('gold'), E, a - 0.22, a + 0.22, FL, 4.3, 0.2, 0.45, 1, 1 | 4 | 8); plane(mb('wash'), E, a - 0.6, a + 0.6, FL, 4.3, 0.46); }
    plane(mb('wash'), E, a0 + 0.3, c - 0.3, FL, 4.3, 0.06);
    ebox(mb('dark'), E, a0 - 0.3, a1 + 0.3, 4.3, 6.1, 0.2, 2.3, 1 / 3, 63); // canopy box
    S.prism(ccw([E.xz(a0 - 0.3, 0), E.xz(a1 + 0.3, 0), E.xz(a1 + 0.3, 2.3), E.xz(a0 - 0.3, 2.3)]).flat(), g0 + 4.3, g0 + 6.1, 0, 0, 'awning');
    Z.edge(...E.xz(a0 - 0.3, 2.3), ...E.xz(a1 + 0.3, 2.3), g0 + 6.1, E.nx, E.nz, 'ledge', 3);
    plane(own(emissiveMat(textTex('REST INN.', { bg: null, fg: '#e3b54c', font: 'bold 118px Georgia, "Times New Roman", serif', logo: true }), 0.25, 1.8, { transparent: true, alphaTest: 0.35, metalness: 0.6, roughness: 0.35 }), 'logo'), E, a0 + 0.2, a1 - 0.2, 4.6, 5.85, 2.31);
    for (const a of [a0 - 0.1, a1 + 0.1]) ebox(mb('steel'), E, a - 0.05, a + 0.05, FL, 4.3, 2.05, 2.15, 1, 29); // slim columns
    for (let k = 0; k < 3; k++) plane(mb('lampF'), E, a0 + 1 + k * (a1 - a0 - 2) / 2 - 0.1, a0 + 1 + k * (a1 - a0 - 2) / 2 + 0.1, 4.29, 4.29, 1.2); // downlights (flat)
    ebox(mb('granite'), E, a0 - 0.3, a0 + 1.2, gLo - g0, FL + 0.05, 0.42, 2.4, 1, 1 | 4 | 8 | 16); // cheek block
    stairs(E, a0 + 1.2, a1 + 0.3, 0.42, 5);
  };
  const marketPortal = (E, a0, a1) => {
    const c = (a0 + a1) / 2;
    ebox(mb('dark'), E, a0, a1, BAND0, 4.5, -0.45, -0.2, 1 / 3, 1); // back of the opening
    const g = own(shopMats[0], 'shop'); plane(g, E, a0 + 0.3, a1 - 0.3, FL, 4.3, 0.1);
    for (let k = 0; k <= 4; k++) { const m = a0 + 0.3 + k * (a1 - a0 - 0.6) / 4; ebox(mb('frame'), E, m - 0.04, m + 0.04, FL, 4.3, 0.1, 0.18, 1, 1 | 4 | 8); }
    ebox(mb('frame'), E, a0 + 0.3, a1 - 0.3, 3.2, 3.28, 0.1, 0.18, 1, 1 | 16);
    ebox(mb('dark'), E, a0 - 0.6, a1 + 0.6, 4.4, 8.4, 0.3, 4.2, 1 / 3, 63); // portal box
    S.prism(ccw([E.xz(a0 - 0.6, 0.3), E.xz(a1 + 0.6, 0.3), E.xz(a1 + 0.6, 4.2), E.xz(a0 - 0.6, 4.2)]).flat(), g0 + 4.4, g0 + 8.4, 0, 0, 'awning');
    Z.edge(...E.xz(a0 - 0.6, 4.2), ...E.xz(a1 + 0.6, 4.2), g0 + 8.4, E.nx, E.nz, 'roofEdge', 3);
    plane(own(signMat('СУПЕРМАРКЕТ', { bg: '#232427', fg: '#f4f1ea', font: 'bold 100px Arial, sans-serif' }), 'sign'), E, c - 4.6, c + 4.6, 6.0, 7.4, 4.205);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const a = a0 + 1.2 + i * (a1 - a0 - 2.4) / 3, d = 1.4 + j * 1.8; quad(mb('lampF'), [E.p(a - 0.12, 4.395, d - 0.12), E.p(a + 0.12, 4.395, d - 0.12), E.p(a + 0.12, 4.395, d + 0.12), E.p(a - 0.12, 4.395, d + 0.12)], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    for (const a of [a0 - 0.4, a1 + 0.4]) ebox(mb('dark'), E, a - 0.25, a + 0.25, FL, 4.4, 3.7, 4.2, 1 / 3, 29);
    for (const a of [a0 + 0.9, a1 - 0.9]) { ebox(mb('granite'), E, a - 0.35, a + 0.35, FL, FL + 0.8, 1.0, 1.7, 1, 29); const [x, z] = E.xz(a, 1.35); cone(mb('tree'), x, g0 + FL + 0.8, z); } // potted thujas
    stairs(E, a0 - 0.6, a1 + 0.6, 4.2, 6);
    ebox(mb('granite'), E, a0 - 0.6, a1 + 0.6, gLo - g0, FL, 0.3, 4.2, 1, 1 | 4 | 8 | 16); // landing
    S.prism(ccw([E.xz(a0 - 0.6, 0.3), E.xz(a1 + 0.6, 0.3), E.xz(a1 + 0.6, 4.2), E.xz(a0 - 0.6, 4.2)]).flat(), gLo, g0 + FL, 0, 0, 'wall');
  };
  const cone = (Dm, x, y, z) => { Dm.cyl(x, y, z, 0.42, 0.05, 1.9, 8, true); };
  M.steel = new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.45, metalness: 0.7 });
  M.tree = new THREE.MeshStandardMaterial({ color: 0x2f4a24, roughness: 0.95 });
  M.lampF = M.lamp;

  for (const E of edges) { if (E.L < 0.5 || onCut([E.A[0], E.A[1]], E.xz(E.L, 0))) continue; upper(E); ground(E); } // the cut wall is inside the tower

  // flat roof + core collision + roof-edge zips, a few condensers
  { const { pts, tris } = triangulate(P, []), Dr = mb('roof');
    for (const [a, c, d] of tris) { const V = [pts[a], pts[c], pts[d]].map(([x, z]) => [x, g0 + ROOF, z]); const ids = V.map(v => Dr.vert(v[0], v[1], v[2], 0, 1, 0, v[0] / 4, v[2] / 4)); if (dot(crs(sub(V[1], V[0]), sub(V[2], V[0])), [0, 1, 0]) < 0) Dr.tri(ids[0], ids[2], ids[1]); else Dr.tri(ids[0], ids[1], ids[2]); } }
  for (const part of convexParts(P)) S.prism(part.flat(), gLo, g0 + ROOF, 0, 0, 'roof');
  for (const E of edges) if (E.L > 3 && !onCut([E.A[0], E.A[1]], E.xz(E.L, 0))) Z.edge(...E.xz(0, 0.3), ...E.xz(E.L, 0.3), g0 + ROOF + 0.4, E.nx, E.nz, 'roofEdge', 8);
  { const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cz = P.reduce((s, p) => s + p[1], 0) / P.length;
    for (let k = 0; k < 6; k++) { const x = cx + (R() - 0.5) * 12, z = cz + (k - 2.5) * 14; mb('frame').box(x - 1.1, g0 + ROOF, z - 0.6, x + 1.1, g0 + ROOF + 1.3, z + 0.6); S.box(x - 1.1, g0 + ROOF, z - 0.6, x + 1.1, g0 + ROOF + 1.3, z + 0.6, 'equipment'); } }

  // ---- U space tower. Each outer wall is cut into ~7 m brick-crowned piers split by narrow glazed stair slots; a pier is a
  // dark panel frame around a recessed brick panel, with one tall office window per storey beside the brick.
  const crownGlow = new THREE.MeshBasicMaterial({ color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  const usSign = emissiveMat(textTex('U space', { bg: null, fg: '#f4f1ea', font: 'bold 112px Arial, sans-serif' }), 0.3, 1.4, { transparent: true, alphaTest: 0.3 });
  let door = null;
  if (TQ.length >= 3) {
    const TE = TQ.map((A, i) => new EF(A, TQ[(i + 1) % TQ.length], g0));
    const lobby = TE.reduce((m, e) => (e.nx * e.L > m.nx * m.L ? e : m)); // the car-park face (east, like the hotel front)
    const floors = [];
    for (let k = 1; k < 6; k++) floors.push(FL + k * T_LV);
    const officeWin = (E, a0, a1) => {
      for (const y of floors) {
        ebox(mb('frame'), E, a0, a1, y + 0.5, y + 2.6, 0.3, 0.34, 1, 1 | 4 | 8 | 16 | 32); // frame plate
        plane(mb('glass'), E, a0 + 0.08, a1 - 0.08, y + 0.58, y + 2.52, 0.345);
        if (R() < 0.35) plane(mb('lit'), E, a0 + 0.12, a1 - 0.12, y + 0.62, y + 2.48, 0.35);
      }
    };
    for (const E of TE) {
      const L = E.L;
      if (L < 0.5) continue;
      if (onCut([E.A[0], E.A[1]], E.xz(L, 0))) { ebox(mb('dark'), E, -0.3, L + 0.3, ROOF - 0.5, T_TOP, -0.3, 0.3, 1 / 3, 1); continue; } // above the hotel roof
      ebox(mb('granite'), E, -0.4, L + 0.4, gLo - g0, BAND0, -0.2, 0.4, 1, 1 | 4 | 8 | 16); // plinth
      if (L < 4) { ebox(mb('dark'), E, -0.3, L + 0.3, BAND0, T_TOP, -0.3, 0.3, 1 / 3); continue; }
      // ground floor: a glazed band under a dark fascia (the lobby face gets the door and the steps)
      ebox(mb('dark'), E, -0.3, L + 0.3, 3.7, FL + T_LV + 0.4, -0.2, 0.4, 1 / 3, 1 | 4 | 8 | 32);
      const nG = Math.max(1, Math.round(L / 2.4)), gw = L / nG;
      ebox(mb('dark'), E, -0.3, L + 0.3, BAND0, FL, -0.2, 0.1, 1 / 3, 1);
      plane(mb('glass'), E, 0, L, FL, 4.3, 0.05);
      for (let k = 0; k <= nG; k++) ebox(mb('frame'), E, k * gw - 0.05, k * gw + 0.05, FL, 4.3, 0.05, 0.14, 1, 1 | 4 | 8);
      ebox(mb('frame'), E, 0, L, 3.4, 3.47, 0.05, 0.13, 1, 1 | 16);
      for (let k = 0; k < nG; k++) if (R() < 0.5) plane(mb('lit'), E, k * gw + 0.1, (k + 1) * gw - 0.1, FL + 0.1, 3.35, 0.055);
      // piers and slots above
      const n = Math.max(1, Math.round((L + 0.9) / 7.6)), SL = n > 1 ? 0.9 : 0, pw = (L - (n - 1) * SL) / n, y0 = FL + T_LV + 0.4;
      for (let k = 0; k < n; k++) {
        const a0 = k * (pw + SL), a1 = a0 + pw, c = (a0 + a1) / 2;
        const bw = Math.min(pw - 2.6, pw * 0.5), side = k % 2 ? -1 : 1; // brick panel off-centre, alternating
        const b0 = c - bw / 2 + side * 0.55, b1 = b0 + bw, by0 = FL + 2 * T_LV + 0.2, by1 = T_CROWN - 0.9;
        const o0 = k ? a0 : -0.3, o1 = k === n - 1 ? L + 0.3 : a1;
        // dark frame around the brick recess
        ebox(mb('dark'), E, o0, b0, y0, T_CROWN, -0.3, 0.3, 1 / 3, 1 | 4 | 8);
        ebox(mb('dark'), E, b1, o1, y0, T_CROWN, -0.3, 0.3, 1 / 3, 1 | 4 | 8);
        ebox(mb('dark'), E, b0, b1, y0, by0, -0.3, 0.3, 1 / 3, 1 | 16);
        ebox(mb('dark'), E, b0, b1, by1, T_CROWN, -0.3, 0.3, 1 / 3, 1 | 32);
        ebox(mb('brick'), E, b0, b1, by0, by1, -0.3, 0.1, 0.5, 1);
        for (const y of floors.slice(1, -1)) { const m = (b0 + b1) / 2; ebox(mb('frame'), E, m - 0.3, m + 0.3, y + 1.1, y + 1.7, 0.1, 0.16, 1, 1 | 4 | 8 | 16); } // small vents
        // one office window per storey in the wider dark strip
        const wa = side > 0 ? [o0 + 0.6, b0 - 0.6] : [b1 + 0.6, o1 - 0.6];
        if (wa[1] - wa[0] > 0.8) officeWin(E, wa[0] + (wa[1] - wa[0] - Math.min(1.6, wa[1] - wa[0])) / 2, wa[0] + (wa[1] - wa[0] + Math.min(1.6, wa[1] - wa[0])) / 2);
        // brick crown, a touch proud of the wall, and the light line under it
        ebox(mb('brick'), E, o0 - 0.1, o1 + 0.1, T_CROWN, T_TOP, -0.3, 0.42, 0.5, 61);
        plane(own(crownGlow, 'crownGlow'), E, o0, o1, T_CROWN - 0.12, T_CROWN - 0.02, 0.305);
        const [cx, cz] = E.xz(c, 0); Z.add(cx, g0 + T_TOP, cz, E.nx, 0, E.nz, 'roofCorner');
      }
      for (let k = 1; k < n; k++) { // glazed stair slots between the piers
        const a0 = k * (pw + SL) - SL, a1 = a0 + SL;
        plane(mb('glass'), E, a0, a1, y0, T_TOP - 0.3, -0.1);
        for (const y of floors) ebox(mb('frame'), E, a0, a1, y - 0.1, y + 0.1, -0.1, -0.02, 1, 1);
        ebox(mb('dark'), E, a0, a1, T_TOP - 0.3, T_TOP, -0.3, 0.1, 1 / 3, 1 | 16);
      }
      Z.edge(...E.xz(0, 0.42), ...E.xz(L, 0.42), g0 + T_TOP, E.nx, E.nz, 'roofEdge', 8);
      if (E === lobby) { // the entrance under the southern pier: steps up to the glass door, the name on the crown
        const a0 = Math.max(0.5, L * 0.68 - 1.6), a1 = Math.min(L - 0.5, a0 + 3.2), c = (a0 + a1) / 2;
        ebox(mb('frame'), E, a0 - 0.1, a1 + 0.1, FL, 3.3, 0.05, 0.2, 1, 1 | 4 | 8 | 16);
        plane(mb('glass'), E, a0, a1, FL, 3.2, 0.205);
        ebox(mb('frame'), E, c - 0.04, c + 0.04, FL, 3.2, 0.2, 0.26, 1, 1 | 4 | 8);
        stairs(E, a0 - 0.6, a1 + 0.6, 0.4, 5);
        plane(own(usSign, 'sign'), E, c - 2.4, c + 2.4, 3.8, 4.4, 0.405); // on the fascia over the door
        const pc = n > 1 ? (L - pw / 2) : L / 2; // the crown name on the southern pier
        plane(own(usSign, 'sign'), E, pc - 2.6, pc + 2.6, T_CROWN + 0.3, T_TOP - 0.3, 0.44);
        const [dx, dz] = E.xz(c, 7.5);
        door = { x: dx, y: heightAt(dx, dz), z: dz, nx: E.nx, nz: E.nz };
      }
    }
    { const { pts, tris } = triangulate(TQ, []), Dr = mb('roof');
      for (const [a, c, d] of tris) { const V = [pts[a], pts[c], pts[d]].map(([x, z]) => [x, g0 + T_ROOF, z]); const ids = V.map(v => Dr.vert(v[0], v[1], v[2], 0, 1, 0, v[0] / 4, v[2] / 4)); if (dot(crs(sub(V[1], V[0]), sub(V[2], V[0])), [0, 1, 0]) < 0) Dr.tri(ids[0], ids[2], ids[1]); else Dr.tri(ids[0], ids[1], ids[2]); } }
    for (const part of convexParts(TQ)) S.prism(part.flat(), gLo, g0 + T_ROOF, 0, 0, 'roof');
  }

  // ---- Everlabs: the logo on a steel frame on the roof over its floors (facing Nadpilna), its ring by the hotel front
  const elTex = logoTexture('everlabs', { width: 2048, color: '#ff4f8b' });
  const elMat = emissiveMat(elTex, 0.4, 1.6, { transparent: true, alphaTest: 0.2, roughness: 0.4 });
  let elDoor = null;
  {
    const E = main, sw = 14, sh = sw * elTex.userData.aspect, a1 = E.L - 4, a0 = a1 - sw, y0 = ROOF + 1.3, d = -1.2;
    plane(own(elMat, 'logo'), E, a0, a1, y0, y0 + sh, d);
    for (const a of [a0 + 1, (a0 + a1) / 2, a1 - 1]) ebox(mb('steel'), E, a - 0.06, a + 0.06, ROOF, y0 + sh * 0.8, d - 0.35, d - 0.2, 1, 29);
    ebox(mb('steel'), E, a0 + 0.5, a1 - 0.5, y0 + 0.25, y0 + 0.35, d - 0.35, d - 0.2, 1, 29);
    const ae = Math.min(E.L - 6, Math.max(aHotel + 9, (aHotel + E.L) / 2 + 2));
    const [x, z] = E.xz(ae, 7.5); elDoor = { x, y: heightAt(x, z), z, nx: E.nx, nz: E.nz };
  }

  // ---- meshes
  const group = new THREE.Group(); group.name = 'hero-restinn'; root.add(group);
  let nV = 0;
  const add = (d, mat, name, shadow = true) => { if (!d.v) return null; const m = new THREE.Mesh(d.build(), mat); m.name = 'restinn-' + name; m.castShadow = shadow; m.receiveShadow = true; group.add(m); nV += d.v; return m; };
  for (const [k, d] of Object.entries(D)) add(d, M[k], k, !['lit', 'lampF', 'glass', 'wash'].includes(k));
  for (const [d, mat, name] of extra) add(d, mat, name, false);
  const litMesh = group.getObjectByName('restinn-lit'), washMesh = group.getObjectByName('restinn-wash');
  console.log(`[cherkasy] Rest Inn: ${nV} vertices, main façade ${main.L.toFixed(0)} m, hotel door at ${aHotel.toFixed(0)} m, shops to ${shopEnd.toFixed(0)} m in ${(performance.now() - t0).toFixed(0)} ms`);

  let glowK = 0, elK = 0;
  const k01 = (k) => Math.max(0, Math.min(1, k));
  return {
    partners: {
      ...(door ? { uspace: { door, glow(k) { glowK = k01(k); } } } : {}),
      ...(elDoor ? { everlabs: { door: elDoor, glow(k) { elK = k01(k); } } } : {}),
    },
    update() {
      const k = nightK.value;
      for (const [m, day, night] of glow) m.emissiveIntensity = day + night * k;
      M.lit.color.setScalar(0.85 * k); if (litMesh) litMesh.visible = k > 0.02;
      M.wash.color.setScalar(0.4 * k); if (washMesh) washMesh.visible = k > 0.02;
      M.lamp.color.setScalar(0.9 + 1.2 * k);
      crownGlow.color.setRGB(1.0, 0.45, 0.75).multiplyScalar(glowK * (0.9 + 0.5 * k)); // the partner light-up (pink, like its map badge)
      usSign.emissiveIntensity = 0.3 + 1.4 * k + 1.2 * glowK;
      elMat.emissiveIntensity = 0.4 + 1.6 * k + 1.4 * elK;
    },
  };
}

function ccw(Q) { return area2(Q) < 0 ? Q.slice().reverse() : Q; }
function planeOf3([p0, p1, p2]) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (Math.abs(ny) < 1e-9) return null;
  const bx = -nx / ny, bz = -nz / ny;
  return { a: p0[1] - bx * p0[0] - bz * p0[2], bx, bz };
}
