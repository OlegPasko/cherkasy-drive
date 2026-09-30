// OWNER: cherkasy. Bohdan Khmelnytsky National University (ЧНУ), main building, bulvar Shevchenka 81 – rebuilt after the
// Wikimedia Commons photos (Cherkasy_National_University1–3, National_Bohdan_Khmelnytsky_University_of_Cherkasy_01–07).
// The 8-storey slab of the 1970s–80s set back behind its paved square: cream stone cladding; on the square side
// storeys 4–7 carry the tilted concrete window boxes that give the facade its saw-tooth shadows (a wide boxed window
// and a narrow flush one per bay in the wings, a narrow box and a wide flush window in the centre), storey 3 and the
// top storey with flush windows, a grey two-storey base with pilasters under a cornice, white PVC frames, many with
// blinds. In front, the grey two-storey entrance block: pink stone piers, timber-framed ground-floor windows, a long
// cantilevered fascia with the gold lettering "Черкаський національний університет імені Богдана Хмельницького", the
// landing and steps, the gilded tryzub with its scrolls, the Khmelnytsky bust on a granite pedestal, two flagpoles and
// the juniper beds. Stair towers on the ends and the yard side, a flat roof with the lift room and masts, AC units,
// lit windows at night.
//   CHNU_SKIP: the OSM ids replaced here, the building and its canopy (buildings.js skips them)
//   buildChnu({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every wall is laid out in a face frame taken from the OSM ring (s metres to the right seen from outside, y up, o out
// of the wall). Walls are bands per storey with piers between the openings, so windows keep their reveals; the
// entrance block is the 6.4 m bump of the OSM ring on the square side, cut off the slab and built on its own.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, rng, inPoly, area2, centroid } from './geo.js';

const MAIN = 103574404, CANOPY = 1005269798; // the building and its entrance canopy, mapped as a separate roof
export const CHNU_SKIP = new Set([MAIN, CANOPY]);

const GF = 4.2, FH = 3.6, NF = 8, PARA = 0.9;   // ground storey, upper storeys, storeys, parapet
const LIFT = 0.9;                               // ground floor over the square: five steps
const MOD = 3.15, DEP = 0.22;                    // facade bay, window reveal
const BX_T = 0.14, BX_HI = 0.72, BX_LO = 0.34;   // window boxes: slab thickness, depth at the head and at the sill
const BLOCK_H = 8.2;                             // entrance block roof over the floor
const CREAM = '#dacdab', CREAM_TOP = '#cdbf9e', BASE = '#b9b3a4', PLINTH = '#8c8a83', REVEAL = '#c8bc9d';
const BLOCK = '#c2c3bf', STONE = '#c7a08c', PVC = '#eeeeea', TIMBER = '#7a4b2c', ALU = '#8d9296';
const GLASS = ['#4a555d', '#56626a', '#3f4a52', '#66706f', '#5b6770'], BLINDS = ['#d8d6cc', '#cfcbbd', '#e2e0d6'];
const UP = [0, 1, 0], DOWN = [0, -1, 0];

// ------------------------------------------------------------------------------------------------ textures
function tex(w, h, paint, repeat = true) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  paint(cv.getContext('2d'), w, h);
  const wrap = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return Object.assign(new THREE.CanvasTexture(cv), { wrapS: wrap, wrapT: wrap, anisotropy: 8, colorSpace: THREE.SRGBColorSpace });
}
// stone cladding, 1.5 x 1.2 m slabs (3 x 2 per repeat): near white, tinted per band by the vertex colour
const cladTex = (r) => tex(512, 512, (g, w, h) => {
  const half = w / 2; // slabs straddle the repeat seam, so the tones wrap
  for (let q = 0; q < 9; q++) {
    const k = 0.975 + r() * 0.03, [a, c] = [q % 3, Math.floor(q / 3)];
    g.fillStyle = `rgb(${[236, 230, 218].map((v) => Math.round(v * k)).join(',')})`;
    g.fillRect((a - 0.75) * half, (c - 0.75) * half, half, half);
  }
  for (let q = 0; q < 3000; q++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,250,0.10)' : 'rgba(90,80,60,0.07)';
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
  g.fillStyle = 'rgba(80,72,60,0.28)'; // joints, off the texel at uv 0 that the untextured boxes sample
  for (const x of [w / 4, w * 3 / 4]) g.fillRect(x, 0, 2, h);
  for (const y of [h / 4, h * 3 / 4]) g.fillRect(0, y, w, 2);
});
// the fascia: gilded letters on light grey, the institution's full name in two lines
const signTex = () => tex(2048, 256, (g, w, h) => {
  Object.assign(g, { fillStyle: '#d6d7d4', textAlign: 'center', textBaseline: 'middle' }).fillRect(0, 0, w, h);
  const line = (t, y, px, fit) => {
    g.font = `bold ${px}px Arial, Helvetica, sans-serif`;
    g.save(); g.translate(w / 2, y); g.scale(Math.min(1, fit / g.measureText(t).width), 1);
    g.fillStyle = '#6e5518'; g.fillText(t, 3, 3);
    g.fillStyle = '#d0a640'; g.fillText(t, 0, 0);
    g.restore();
  };
  line('ЧЕРКАСЬКИЙ  НАЦІОНАЛЬНИЙ  УНІВЕРСИТЕТ', 92, 110, 1880);
  line('імені Богдана Хмельницького', 196, 64, 1200);
}, false);
// the gilded tryzub over two scrolls, cut out by alpha
// path from a list: [x, y] points, [cx, cy, x, y] quadratic and [c1x, c1y, c2x, c2y, x, y] cubic segments
function trace(g, pts, fill) {
  g.beginPath();
  pts.forEach((q, i) => (i === 0 ? g.moveTo(q[0], q[1]) : q.length === 2 ? g.lineTo(...q) : q.length === 4 ? g.quadraticCurveTo(...q) : g.bezierCurveTo(...q)));
  if (fill) { g.closePath(); g.fill(); } else g.stroke();
}
const tryzubTex = () => tex(1024, 480, (g, w) => {
  Object.assign(g, { strokeStyle: '#e0b64a', fillStyle: '#e0b64a', lineCap: 'round', lineJoin: 'round' });
  const c = w / 2, X = (k, v) => c + k * v;
  for (const k of [-1, 1]) {
    g.lineWidth = 22; trace(g, [[X(k, 150), 70], [X(k, 150), 340], [X(k, 150), 400, X(k, 60), 400], [c, 400]]); // outer prong into the base bar
    trace(g, [[X(k, 150), 14], [X(k, 132), 80], [X(k, 168), 80]], true);
    g.lineWidth = 15; trace(g, [[c, 395], [X(k, 92), 380, X(k, 86), 230], [X(k, 86), 170]]); // inner arm from the foot of the stem
    trace(g, [[X(k, 86), 124], [X(k, 70), 180], [X(k, 102), 180]], true);
    g.lineWidth = 13; trace(g, [[X(k, 190), 470], [X(k, 260), 330, X(k, 380), 320, X(k, 430), 380], [X(k, 440), 430, X(k, 380), 440], [X(k, 370), 400]]); // scroll
    trace(g, [[X(k, 240), 452], [X(k, 250), 410, X(k, 290), 420], [X(k, 280), 450]]);
  }
  g.lineWidth = 24; trace(g, [[c, 150], [c, 440]]);
  trace(g, [[c, 14], [c - 36, 110], [c, 175], [c + 36, 110]], true); // the lozenge head
  g.fillRect(c - 46, 440, 92, 28);
}, false);

// ------------------------------------------------------------------------------------------------ face frame
// wall along a->b with outward normal n; s runs to the viewer's right, so a and b swap when needed
function mkFace(ax, az, bx, bz, nx, nz) {
  const flip = (bx - ax) * nz - (bz - az) * nx < 0, [x0, z0, x1, z1] = flip ? [bx, bz, ax, az] : [ax, az, bx, bz];
  const dx = x1 - x0, dz = z1 - z0, w = Math.sqrt(dx * dx + dz * dz), rx = dx / w, rz = dz / w;
  return { ax: x0, az: z0, rx, rz, nx, nz, w, N: [nx, 0, nz], R: [rx, 0, rz], L: [-rx, 0, -rz] };
}
const pt = (f, s, y, o = 0) => [f.ax + f.rx * s + f.nx * o, y, f.az + f.rz * s + f.nz * o];

// quad a b c d facing n (winding picked from n), uv as a flat [u0, v0, .. u3, v3]
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const triple = (n, u, v) => n[0] * (u[1] * v[2] - u[2] * v[1]) + n[1] * (u[2] * v[0] - u[0] * v[2]) + n[2] * (u[0] * v[1] - u[1] * v[0]);
const UNIT = [0, 0, 1, 0, 1, 1, 0, 1], NOUV = [0, 0, 0, 0, 0, 0, 0, 0];
function q4(D, a, b, c, d, n, uv = NOUV) {
  const id = [a, b, c, d].map((p, k) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[2 * k], uv[2 * k + 1]));
  if (triple(n, sub(b, a), sub(d, a)) < 0) id.reverse(); // wound the other way round: flip so it faces n
  D.quad(...id);
}
// flat wall patch in the face plane (o), uv in metres of cladding (3 x 2.4 m per repeat)
function patch(D, f, s0, s1, y0, y1, o = 0) {
  if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
  q4(D, pt(f, s0, y0, o), pt(f, s1, y0, o), pt(f, s1, y1, o), pt(f, s0, y1, o), f.N,
    [s0 / 3, y0 / 2.4, s1 / 3, y0 / 2.4, s1 / 3, y1 / 2.4, s0 / 3, y1 / 2.4]);
}
// box in the face frame; m: 1 front (o1), 2 back (o0), 4 left (s0), 8 right (s1), 16 top, 32 bottom
function fb(D, f, s0, s1, y0, y1, o0, o1, m = 63) {
  const P = (s, y, o) => pt(f, s, y, o);
  if (m & 1) q4(D, P(s0, y0, o1), P(s1, y0, o1), P(s1, y1, o1), P(s0, y1, o1), f.N);
  if (m & 2) q4(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y1, o0), P(s0, y1, o0), [-f.nx, 0, -f.nz]);
  if (m & 4) q4(D, P(s0, y0, o0), P(s0, y0, o1), P(s0, y1, o1), P(s0, y1, o0), f.L);
  if (m & 8) q4(D, P(s1, y0, o0), P(s1, y0, o1), P(s1, y1, o1), P(s1, y1, o0), f.R);
  if (m & 16) q4(D, P(s0, y1, o0), P(s1, y1, o0), P(s1, y1, o1), P(s0, y1, o1), UP);
  if (m & 32) q4(D, P(s0, y0, o0), P(s1, y0, o0), P(s1, y0, o1), P(s0, y0, o1), DOWN);
}
// collision prism over an s / o rectangle of a face
function fsolid(S, f, s0, s1, o0, o1, y0, y1, kind, flags = 0) {
  const Q = [[s0, o0], [s1, o0], [s1, o1], [s0, o1]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
  return S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), y0, y1, 0, 0, kind, flags);
}

// one storey band of wall: full-width strips under and over the window line, piers between the openings
function band(D, f, y0, y1, wy0, wy1, spans, col) {
  D.setColor(col);
  if (!spans.length) return patch(D, f, 0, f.w, y0, y1);
  patch(D, f, 0, f.w, y0, wy0); patch(D, f, 0, f.w, wy1, y1);
  let s = 0;
  for (const [a, b] of spans) { patch(D, f, s, a, wy0, wy1); s = Math.max(s, b); }
  patch(D, f, s, f.w, wy0, wy1);
}
// an opening: reveals, glass (lit or not), frame bars; st: { glass, lit, frame, pane, low, lowCol, rev }
function opening(B, f, s0, s1, y0, y1, st) {
  const D = B.det, bk = -DEP, fo = bk + 0.03, t = 0.065;
  D.setColor(st.rev ?? REVEAL);
  q4(D, pt(f, s0, y0), pt(f, s0, y0, bk), pt(f, s0, y1, bk), pt(f, s0, y1), f.R);
  q4(D, pt(f, s1, y0), pt(f, s1, y0, bk), pt(f, s1, y1, bk), pt(f, s1, y1), f.L);
  q4(D, pt(f, s0, y1), pt(f, s1, y1), pt(f, s1, y1, bk), pt(f, s0, y1, bk), DOWN);
  q4(D, pt(f, s0, y0), pt(f, s1, y0), pt(f, s1, y0, bk), pt(f, s0, y0, bk), UP);
  let g0 = y0;
  if (st.low) { D.setColor(st.lowCol); patch(D, f, s0, s1, y0, y0 + st.low, bk + 0.01); g0 += st.low; }
  const G = st.lit ? B.lit : B.glass;
  G.setColor(st.glass);
  q4(G, pt(f, s0, g0, bk), pt(f, s1, g0, bk), pt(f, s1, y1, bk), pt(f, s0, y1, bk), f.N);
  D.setColor(st.frame);
  const panes = Math.max(1, Math.round((s1 - s0) / (st.pane ?? 0.8))), step = (s1 - s0 - t) / panes;
  Array.from({ length: panes + 1 }, (_, i) => s0 + i * step).forEach((m) => patch(D, f, m, m + t, g0, y1, fo)); // jambs, mullions
  patch(D, f, s0, s1, y1 - t, y1, fo); patch(D, f, s0, s1, g0, g0 + t, fo);
  if (y1 - g0 > 2) patch(D, f, s0, s1, y1 - 0.62, y1 - 0.56, fo); // transom of the tall ground-floor lights
}
// the tilted concrete box round a window: head and sill slabs and two cheeks leaning out toward the head
function windowBox(D, f, s0, s1, y0, y1) {
  const a = s0 - BX_T, b = s1 + BX_T, hy = y1 - y0, hd = BX_HI - BX_LO, L = Math.hypot(hy, hd);
  const nF = [f.nx * hy / L, -hd / L, f.nz * hy / L];
  fb(D, f, a, b, y1, y1 + BX_T, 0, BX_HI, 1 | 4 | 8 | 16 | 32);
  fb(D, f, a, b, y0 - BX_T, y0, 0, BX_LO, 1 | 4 | 8 | 16 | 32);
  for (const [p, q] of [[a, s0], [s1, b]]) {
    q4(D, pt(f, p, y0), pt(f, p, y0, BX_LO), pt(f, p, y1, BX_HI), pt(f, p, y1), f.L);
    q4(D, pt(f, q, y0), pt(f, q, y0, BX_LO), pt(f, q, y1, BX_HI), pt(f, q, y1), f.R);
    q4(D, pt(f, p, y0, BX_LO), pt(f, q, y0, BX_LO), pt(f, q, y1, BX_HI), pt(f, p, y1, BX_HI), nF);
  }
}

// ------------------------------------------------------------------------------------------------ build
export function buildChnu({ root, map, solids: S, zips: Z, heightAt }) {
  const b = map.buildings.find((q) => q.id === MAIN);
  if (!b) return null;
  const t0 = performance.now(), r = rng(MAIN % 99991);
  const ring = ringPts(b.p);
  // the entrance block is the only part of the ring that stands forward of the slab's square-side line
  const minX = Math.min(...ring.map((p) => p[0]));
  const fwd = ring.map((p, i) => (p[0] < minX + 3 ? i : -1)).filter((i) => i >= 0);
  if (fwd.length !== 2) return null;
  const [i0, i1] = fwd, nr = ring.length;
  const slab = ring.filter((_, i) => i !== i0 && i !== i1);
  const blockRing = [ring[(Math.min(i0, i1) - 1 + nr) % nr], ring[Math.min(i0, i1)], ring[Math.max(i0, i1)], ring[(Math.max(i0, i1) + 1) % nr]];

  // walls of a ring: consecutive collinear edges merged, outward normals by an inside test
  const facesOf = (P) => {
    const E = [];
    P.forEach((a, i) => {
      const c = P[(i + 1) % P.length], ex = c[0] - a[0], ez = c[1] - a[1], len = Math.hypot(ex, ez);
      if (len < 0.05) return;
      const inside = inPoly(P, (a[0] + c[0]) / 2 + ez / len * 0.2, (a[1] + c[1]) / 2 - ex / len * 0.2), sg = inside ? -1 : 1;
      const nx = sg * ez / len, nz = -sg * ex / len, last = E.at(-1);
      if (last && last.nx * nx + last.nz * nz > 0.999) last.b = c; else E.push({ a, b: c, nx, nz });
    });
    if (E.length > 1 && E[0].nx * E[E.length - 1].nx + E[0].nz * E[E.length - 1].nz > 0.999) E[0].a = E.pop().a;
    return E.map((e) => mkFace(e.a[0], e.a[1], e.b[0], e.b[1], e.nx, e.nz));
  };
  const walls = facesOf(slab);
  const [mx, mz] = centroid(blockRing.slice(1, 3)), [kx, kz] = centroid(slab), dl = Math.hypot(mx - kx, mz - kz);
  const front = walls.filter((f) => (f.nx * (mx - kx) + f.nz * (mz - kz)) / dl > 0.9).reduce((m, f) => (f.w > m.w ? f : m));
  const blockWalls = facesOf(blockRing).filter((f) => f.nx * front.nx + f.nz * front.nz > -0.9); // the side on the slab stays open
  const bFront = blockWalls.reduce((m, f) => (f.w > m.w ? f : m));

  // levels: the floor sits five steps over the square at the doors, and never under the ground of the lot
  const pe = pt(bFront, bFront.w / 2, 0, 5), gE = heightAt(pe[0], pe[2]);
  const hs = ring.map(([x, z]) => heightAt(x, z));
  const yF = Math.max(gE + LIFT, Math.max(...hs) + 0.3), gBase = Math.min(...hs, gE) - 0.5;
  const floorY = (k) => yF + (k ? GF + (k - 1) * FH : 0);
  const yRoof = floorY(NF), yTop = yRoof + PARA, yBR = yF + BLOCK_H, yBT = yBR + 0.4;

  const B = { clad: new MB(), det: new MB(), glass: new MB(), lit: new MB(), metal: new MB(), sign: new MB(), gold: new MB(), cloth: new MB() };
  let nWin = 0, nBox = 0, nSolid = 0;
  const solid = (...a) => { nSolid++; return fsolid(S, ...a); };
  const glassOf = (litP) => {
    const blind = r() < 0.35;
    return { glass: blind ? BLINDS[Math.floor(r() * 3)] : GLASS[Math.floor(r() * GLASS.length)], lit: r() < litP, frame: PVC, pane: 0.8 };
  };
  const acs = [];
  // storey k of wall f: openings [[s0, s1, style?]] at sill .. sill + h over the floor, the wall colour, the lit share
  const storey = (f, k, spans, sill, h, col, litP = 0.3) => {
    const y0 = floorY(k), y1 = floorY(k + 1), wy0 = y0 + sill, wy1 = wy0 + h;
    spans.sort((p, q) => p[0] - q[0]);
    band(B.clad, f, y0, y1, wy0, wy1, spans, col);
    for (const [s0, s1, st] of spans) {
      opening(B, f, s0, s1, wy0, wy1, st ?? glassOf(litP)); nWin++;
      if (k > 0 && s1 - s0 > 1 && r() < 0.07) acs.push([f, s1 + 0.55, wy0 + 0.3]);
    }
  };

  // ---- the square side: bays of 3.15 m; flush end bays, boxed wings, the centre over the entrance with narrow boxes
  const sc = (() => { const [x, , z] = pt(bFront, bFront.w / 2, 0); return (x - front.ax) * front.rx + (z - front.az) * front.rz; })();
  const sb0 = sc - bFront.w / 2, sb1 = sc + bFront.w / 2;
  const bayCentres = (w, margin) => { const n = Math.floor((w - margin) / MOD), o = (w - n * MOD) / 2; return Array.from({ length: n }, (_, i) => o + (i + 0.5) * MOD); };
  const cs = bayCentres(front.w, 1.2), nM = cs.length, m0 = cs[0] - MOD / 2;
  const bays = cs.map((c, i) => ({ c, t: i === 0 || i === nM - 1 ? 'end' : Math.abs(c - sc) < 22 ? 'B' : 'A', hid: c > sb0 - 0.8 && c < sb1 + 0.8 }));
  for (let k = 0; k < NF; k++) {
    const sp = [];
    for (const { c, t, hid } of bays) {
      if (k < 2) { if (!hid) sp.push([c - 1.2, c + 1.2]); }
      else if (k === 2 || k === NF - 1 || t === 'end') sp.push([c - 1.15, c + 1.15]);
      else if (t === 'A') sp.push([c - 1.2, c + 0.2], [c + 0.55, c + 1.2]);
      else sp.push([c - 1.3, c - 0.4], [c - 0.05, c + 1.35]);
    }
    if (k === 0) storey(front, 0, sp, 0.8, 2.75, BASE, 0.35);
    else if (k === 1) storey(front, 1, sp, 0.9, 1.75, BASE, 0.35);
    else storey(front, k, sp, 0.95, 1.7, k === NF - 1 ? CREAM_TOP : CREAM);
  }
  B.clad.setColor(CREAM);
  for (let k = 3; k < NF - 1; k++) {
    const wy0 = floorY(k) + 0.95, wy1 = wy0 + 1.7;
    for (const { c, t } of bays) {
      if (t === 'end') continue;
      if (t === 'A') windowBox(B.clad, front, c - 1.2, c + 0.2, wy0, wy1); else windowBox(B.clad, front, c - 1.3, c - 0.4, wy0, wy1);
      nBox++;
    }
  }
  solid(front, m0 + MOD, front.w - m0 - MOD, -0.1, BX_HI, floorY(3) + 0.7, floorY(NF - 1), 'wall');
  // base: pilasters on the bay lines, a cornice over the second storey (both hidden behind the entrance block)
  B.clad.setColor('#aca698');
  for (let i = 0; i <= nM; i++) {
    const s = m0 + i * MOD;
    if (s > sb0 - 0.5 && s < sb1 + 0.5) continue;
    fb(B.clad, front, s - 0.22, s + 0.22, gBase, floorY(2) - 0.3, 0, 0.18, 1 | 4 | 8);
  }
  B.clad.setColor('#a8a59c');
  for (const [a, c] of [[0, sb0], [sb1, front.w]]) fb(B.clad, front, a, c, floorY(2) - 0.3, floorY(2) - 0.02, 0, 0.4, 1 | 4 | 8 | 16 | 32);

  // ---- the other walls: yard side in plain bays, stair towers with windows on the half-landings, the ends blank
  // but for the corridor windows
  for (const f of walls) {
    if (f === front) continue;
    const back = f.nx * front.nx + f.nz * front.nz < -0.9;
    for (let k = 0; k < NF; k++) {
      const col = k < 2 ? BASE : k === NF - 1 ? CREAM_TOP : CREAM;
      if (back && f.w >= 7) {
        storey(f, k, bayCentres(f.w, 0.8).map((c) => [c - 1.1, c + 1.1]), k ? 0.9 : 1.0, k ? 1.7 : 2.3, col);
      } else if (f.w >= 3 && (back || f.w >= 5)) {
        const c = f.w / 2, hw = back ? 0.6 : 0.8;
        if (back || f.w >= 6.2) storey(f, k, [[c - hw, c + hw, { ...glassOf(0.5), pane: 0.7 }]], k ? 1.9 : 2.3, 1.3, col, 0.5); // half-landing
        else storey(f, k, [[c - hw, c + hw]], 0.9, 1.7, col);
      } else band(B.clad, f, floorY(k), floorY(k + 1), 0, 0, [], col);
    }
  }
  // plinth, parapet, coping, roof-edge anchors for every slab wall
  for (const f of walls) {
    B.clad.setColor(PLINTH); patch(B.clad, f, 0, f.w, gBase, yF);
    B.clad.setColor(CREAM_TOP); patch(B.clad, f, 0, f.w, yRoof, yTop);
    B.det.setColor('#b8ad92'); patch(B.det, { ...f, N: [-f.nx, 0, -f.nz] }, 0, f.w, yRoof, yTop, -0.3);
    B.det.setColor('#8e918f'); fb(B.det, f, -0.03, f.w + 0.03, yTop, yTop + 0.05, -0.32, 0.05, 1 | 16);
    const a = pt(f, 0, 0, -0.1), c = pt(f, f.w, 0, -0.1);
    Z.edge(a[0], a[2], c[0], c[2], yTop, f.nx, f.nz);
  }
  // roof: bitumen, the lift room, vents and masts
  B.det.setColor('#56554f'); B.det.fill(slab, [], yRoof + 0.02, true);
  const bx = slab.map((p) => p[0]), bz = slab.map((p) => p[1]);
  const cx = (Math.min(...bx) + Math.max(...bx)) / 2, cz = (Math.min(...bz) + Math.max(...bz)) / 2;
  B.clad.setColor(CREAM_TOP); B.clad.box(cx - 3, yRoof, cz - 5, cx + 4, yRoof + 3.2, cz + 5, 55);
  B.det.setColor('#6d6c67'); B.det.box(cx - 3.2, yRoof + 3.2, cz - 5.2, cx + 4.2, yRoof + 3.35, cz + 5.2);
  S.box(cx - 3, yRoof, cz - 5, cx + 4, yRoof + 3.35, cz + 5, 'equipment'); nSolid++;
  for (const [i, x, z] of [...Array(9)].map((_, i) => [i, cx - 7 + r() * 14, cz - 45 + r() * 90])) {
    if (!inPoly(slab, x, z)) continue;
    if (i < 4) { B.det.setColor('#9a9890'); B.det.box(x - 0.6, yRoof, z - 0.6, x + 0.6, yRoof + 1.1, z + 0.6, 55); }
    else { const h = 3 + r() * 4; B.metal.setColor('#707477'); B.metal.cyl(x, yRoof, z, 0.04, 0.03, h, 5, false); }
  }

  // ---- entrance block: grey panels, pink stone piers, timber-framed ground floor, ribbon windows over the fascia
  const W0 = 36.6, bw = bFront.w, sx = (s) => s * bw / W0; // measured on the 36.6 m front of the photos
  const shop = (s0, s1) => [sx(s0), sx(s1), { glass: '#2b3136', lit: r() < 0.6, frame: TIMBER, pane: 1.35, low: 0.55, lowCol: '#8f8e89', rev: '#b0afa9' }];
  const door = [sx(15.3), sx(21.4), { glass: '#394148', lit: true, frame: ALU, pane: 1.0, rev: '#b0afa9' }];
  {
    const f = bFront, y0 = yF, sp = [shop(0.5, 5.8), shop(7.4, 13.5), door, shop(23.1, 29.2), shop(30.9, 36.1)];
    band(B.clad, f, y0, yF + GF, y0, yF + 3.35, sp, BLOCK);
    for (const [s0, s1, st] of sp) { opening(B, f, s0, s1, y0, yF + 3.35, st); nWin++; }
    const rib = [[0.5, 5.8], [7.0, 29.8], [30.9, 36.1]].map(([a, c]) => [sx(a), sx(c), { ...glassOf(0.4), pane: 1.1 }]);
    band(B.clad, f, yF + GF, yBT, yF + 5.5, yF + 7.1, rib, BLOCK);
    for (const [s0, s1, st] of rib) { opening(B, f, s0, s1, yF + 5.5, yF + 7.1, st); nWin++; }
    B.clad.setColor('#7d7b75'); patch(B.clad, f, 0, f.w, gBase, yF);
  }
  for (const f of blockWalls) {
    if (f === bFront) continue;
    for (const [y0, y1, wy] of [[yF, yF + GF, yF + 0.9], [yF + GF, yBT, yF + 5.5]]) {
      const sp = [[f.w / 2 - 1, f.w / 2 + 1]];
      band(B.clad, f, y0, y1, wy, wy + 1.6, sp, BLOCK);
      opening(B, f, sp[0][0], sp[0][1], wy, wy + 1.6, glassOf(0.3)); nWin++;
    }
    B.clad.setColor('#7d7b75'); patch(B.clad, f, 0, f.w, gBase, yF);
  }
  for (const f of blockWalls) {
    B.det.setColor('#b3b3ae'); patch(B.det, { ...f, N: [-f.nx, 0, -f.nz] }, 0, f.w, yBR, yBT, -0.25);
    B.det.setColor('#8e918f'); fb(B.det, f, -0.03, f.w + 0.03, yBT, yBT + 0.05, -0.27, 0.05, 1 | 16);
    const a = pt(f, 0, 0, -0.1), c = pt(f, f.w, 0, -0.1);
    Z.edge(a[0], a[2], c[0], c[2], yBT, f.nx, f.nz);
  }
  B.det.setColor('#5a5953'); B.det.fill(blockRing, [], yBR, true);
  S.prism(blockRing.flat(), gBase, yBT, 0, 0, 'wall'); S.prism(slab.flat(), gBase, yTop, 0, 0, 'wall'); nSolid += 2;

  // the canopy over the landing (OSM maps it as its own roof), the lettered fascia on its front edge carried by two
  // pink stone piers, two more flanking the doors; five steps down to the square
  const f = bFront, dc = sx(18.35), ys0 = yF + 3.55, ys1 = yF + 6.45, sa = dc - 10, sb = dc + 10, CAN = 5.2, LAND = 5.6;
  B.det.setColor('#cfd0cd'); fb(B.det, f, sa, sb, ys0, ys1, CAN - 1.4, CAN, 4 | 8 | 16 | 32);
  q4(B.sign, pt(f, sa, ys0, CAN), pt(f, sb, ys0, CAN), pt(f, sb, ys1, CAN), pt(f, sa, ys1, CAN), f.N, UNIT);
  B.det.setColor('#b9bab6'); fb(B.det, f, sa + 0.1, sb - 0.1, ys0 + 0.1, ys0 + 0.55, 0, CAN - 1.4, 4 | 8 | 16 | 32);
  solid(f, sa, sb, -0.05, CAN, ys0, ys1, 'awning', 1);
  B.det.setColor(STONE);
  for (const [a, c, o0, o1] of [[sa, sa + 1.1, CAN - 1.3, CAN - 0.1], [sb - 1.1, sb, CAN - 1.3, CAN - 0.1], [sx(13.8), sx(15.0), 0, 0.6], [sx(21.6), sx(22.8), 0, 0.6]]) {
    fb(B.det, f, a, c, yF, ys0, o0, o1, 1 | 2 | 4 | 8);
    solid(f, a, c, o0, o1, yF, ys0, 'wall');
  }
  B.det.setColor('#9d9b95'); fb(B.det, f, sa - 1, sb + 1, gBase, yF, 0, LAND, 1 | 4 | 8 | 16);
  solid(f, sa - 1, sb + 1, 0, LAND, gBase, yF, 'wall');
  B.det.setColor('#a3a19b');
  const st0 = dc - 7, st1 = dc + 7, rise = (yF - gE) / 5;
  for (let i = 1; i <= 4; i++) fb(B.det, f, st0, st1, gBase, yF - i * rise, LAND + (i - 1) * 0.34, LAND + i * 0.34, 1 | 4 | 8 | 16);
  { // the steps as one ramp for the car
    const sl = (yF - gE) / (5 * 0.34), [ox, , oz] = pt(f, 0, 0, LAND), o0 = ox * f.nx + oz * f.nz;
    const Q = [[st0, LAND], [st1, LAND], [st1, LAND + 1.7], [st0, LAND + 1.7]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    S.prism((area2(Q) < 0 ? Q.reverse() : Q).flat(), gBase, yF + sl * o0, -sl * f.nx, -sl * f.nz, 'steps'); nSolid++;
  }
  // gilded tryzub under the canopy before the doors, the bust in front of the steps, flagpoles, juniper beds
  const gh = 3.4, gw = gh * 1024 / 480;
  q4(B.gold, pt(f, dc - gw / 2, yF, 2.4), pt(f, dc + gw / 2, yF, 2.4), pt(f, dc + gw / 2, yF + gh, 2.4), pt(f, dc - gw / 2, yF + gh, 2.4), f.N, UNIT);
  const bo = LAND + 3.6, [px, , pz] = pt(f, dc, 0, bo), gP = heightAt(px, pz);
  B.det.setColor('#4f5450'); B.det.box(px - 0.8, gP - 0.3, pz - 0.8, px + 0.8, gP + 0.35, pz + 0.8, 55);
  B.det.setColor('#5c615d'); B.det.box(px - 0.48, gP + 0.35, pz - 0.48, px + 0.48, gP + 2.55, pz + 0.48, 55);
  B.det.setColor('#555a56'); B.det.box(px - 0.58, gP + 2.55, pz - 0.58, px + 0.58, gP + 2.7, pz + 0.58, 55);
  S.box(px - 0.8, gP - 0.3, pz - 0.8, px + 0.8, gP + 3.9, pz + 0.8, 'monument'); nSolid++;
  const wide = (a, c) => [Math.abs(f.nx) * a + Math.abs(f.nz) * c, 0, Math.abs(f.nz) * a + Math.abs(f.nx) * c];
  const [ax, , az] = wide(0.3, 0.52), [hx, , hz] = wide(0.17, 0.15);
  B.metal.setColor('#5b4631');
  B.metal.ellipsoid([px, gP + 2.95, pz], [ax, 0.4, az], 10, 6);
  B.metal.cyl(px, gP + 3.2, pz, 0.09, 0.1, 0.18, 6, false); // neck
  B.metal.ellipsoid([px, gP + 3.5, pz], [hx, 0.22, hz], 8, 6);
  B.metal.cyl(px, gP + 3.62, pz, 0.2, 0.17, 0.2, 8);
  B.metal.cyl(px - f.nx * 0.05, gP + 3.78, pz - f.nz * 0.05, 0.05, 0.02, 0.3, 5, false); // the kalpak's plume
  for (const [s, k] of [[dc - 2.3, 0], [dc + 2.3, 1]]) {
    const [x, , z] = pt(f, s, 0, bo - 1.2), g = heightAt(x, z), top = g + 15;
    B.metal.setColor('#c9ccce'); B.metal.cyl(x, g, z, 0.07, 0.05, 15.3, 6);
    S.cyl(x, z, g, top, 0.1); nSolid++;
    const fl = (d, y0, y1, c) => { B.cloth.setColor(c); q4(B.cloth, [x, y0, z], [x + f.rx * d, y0, z + f.rz * d], [x + f.rx * d, y1, z + f.rz * d], [x, y1, z], f.N); };
    if (k) fl(2.1, top - 1.4, top, '#2e5da8');
    else { fl(-2.1, top - 0.7, top, '#1f5bb8'); fl(-2.1, top - 1.4, top - 0.7, '#f3c623'); }
  }
  for (const [a, c] of [[dc - 9, dc - 1.4], [dc + 1.4, dc + 9]]) { // clipped junipers, a bush every 1.3 m
    const n = Math.round((c - a) / 1.3);
    for (let i = 0; i < n; i++) for (const o of [bo - 0.8, bo + 0.8]) {
      const [x, , z] = pt(f, a + (i + 0.5) * (c - a) / n, 0, o + (r() - 0.5) * 0.3), g = heightAt(x, z);
      B.det.setColor(['#3b5836', '#44603a', '#36502f'][Math.floor(r() * 3)]);
      B.det.ellipsoid([x, g + 0.15, z], [0.85, 0.55 + r() * 0.15, 0.85], 7, 4);
    }
  }

  // AC units on the facades
  B.det.setColor('#e0e0dc');
  for (const [w, s, y] of acs) if (s + 0.4 < w.w) fb(B.det, w, s - 0.4, s + 0.4, y, y + 0.55, 0, 0.3, 1 | 4 | 8 | 16 | 32);

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'chnu' });
  root.add(group);
  const M = {
    clad: new THREE.MeshStandardMaterial({ map: cladTex(r), vertexColors: true, roughness: 0.85 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.3, envMapIntensity: 1.3 }),
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, emissive: 0xfff0d2, emissiveIntensity: 0 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 }),
    sign: new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.5, metalness: 0.1 }),
    gold: new THREE.MeshStandardMaterial({ map: tryzubTex(), color: 0xffffff, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.3, metalness: 0.75 }),
    cloth: new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, vertexColors: true, roughness: 0.9 }),
  };
  let nV = 0;
  for (const [k, D] of Object.entries(B)) {
    if (!D.v) continue;
    nV += D.v;
    const see = k === 'glass' || k === 'lit' || k === 'cloth';
    group.add(Object.assign(new THREE.Mesh(D.build(), M[k]), { name: 'chnu-' + k, castShadow: !see, receiveShadow: true }));
  }
  console.log(`[cherkasy] ChNU: ${nWin} windows, ${nBox} window boxes, ${nSolid} solids, ${(nV / 1000).toFixed(1)}k verts, floor ${yF.toFixed(1)} m, in ${(performance.now() - t0).toFixed(0)} ms`);

  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const X0 = Math.min(...xs) - 3, X1 = Math.max(...xs) + 3, Z0 = Math.min(...zs) - 3, Z1 = Math.max(...zs) + 3;
  return {
    footprints: [{ poly: ring, h: yTop - gE, kind: b.k, name: 'ЧНУ, корпус №1' }, ...map.buildings.filter((q) => q.id === CANOPY).map((q) => ({ poly: ringPts(q.p), h: ys1 - gE, kind: q.k }))],
    // trees keep off the walls, and off the paved forecourt with the bust, flagpoles and beds (the square's axis)
    clear: (x, z) => {
      if (x > X0 && x < X1 && z > Z0 && z < Z1) return true;
      const dx = x - f.ax, dz = z - f.az, s = dx * f.rx + dz * f.rz, o = dx * f.nx + dz * f.nz;
      return s > -6 && s < f.w + 6 && o > 0 && o < bo + 16;
    },
    update() { M.lit.emissiveIntensity = 1.2 * nightK.value; },
  };
}
