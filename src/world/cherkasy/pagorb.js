// OWNER: cherkasy (landmarks). Pagorb Slavy (Hill of Glory, 1977) on Zamkova hora: the burial mound (10 m, ~60 m
// across) crowned by the 10 m bronze "Vitchyzna-Maty" (Halyna Kalchenko): a tall columnar figure in a pleated floor-
// length dress and a shoulder cape, her right hand holding up the bowl of the Eternal Flame (since 2009 a red
// octagonal LED lantern), her left arm raised with the palm open. Below: the granite retaining wall (OSM way
// 999217584) curving round the ritual plaza, its middle carrying the bronze bas-relief band of war scenes, the 37 m
// black names slab on the plaza, stone-slab steps up the mound (OSM rock paths), blue spruces.
//   buildPagorb({ root, map, solids, zips, heightAt, geo }) -> { update(dt), clear(x, z): bool (no generated trees), spots: tree spots }
import * as THREE from 'three';
import { MB, M4, hexLin } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { PARK_PINE } from '../trees.js';
import { SG, canvasTex, decal } from './sculpt.js';
import { rng, area2 } from './geo.js';

const PI = Math.PI;
const STATUE = [49.4494844, 32.0627458];
// the plaza retaining wall with the bas-reliefs (OSM way 999217584), north end first
const WALL = [[49.4493745, 32.0620444], [49.4494019, 32.062112], [49.4494254, 32.062182], [49.4494407, 32.0622479], [49.4494477, 32.062313],
  [49.4494458, 32.0623686], [49.449433, 32.0624289], [49.449412, 32.0624826], [49.4493833, 32.0625272], [49.4493436, 32.0625613],
  [49.4493083, 32.0625773], [49.4492695, 32.0625808], [49.4492273, 32.0625709], [49.449186, 32.0625474], [49.4491482, 32.0625049],
  [49.4491047, 32.0624422], [49.4490506, 32.0623516], [49.4489925, 32.0622336], [49.4489398, 32.0621145], [49.4488943, 32.0619908],
  [49.448867, 32.0619015], [49.4488376, 32.0617829], [49.4488116, 32.0616639]];
// the two rock-slab paths up the mound (OSM ways 923757301, 542988199): their foot points
const PATHS = [[49.449218, 32.062587], [49.449453, 32.062366]];
const MOUND_R = 33, MOUND_H = 10, CROWN_R = 3.2;

const COL = { grass: [0.085, 0.13, 0.042], granite: 0xa29c93, graniteD: 0x857f78, black: 0x0d0d0f };

// ------------------------------------------------------------------------------------------------ textures
const masonryTex = () => canvasTex(512, 256, (g, w, h) => { // 4.8 x 2.4 m rusticated granite blocks
  const r = rng(31), rows = 4, rh = h / rows;
  paint(g, '#6f6c68', 0, 0, w, h);
  for (let j = 0; j < rows; j++) {
    let x = -r() * 60;
    while (x < w) {
      const bw = 70 + r() * 70, k = r();
      g.fillStyle = `rgb(${150 + k * 40 | 0},${146 + k * 38 | 0},${140 + k * 36 | 0})`; g.fillRect(x + 3, j * rh + 3, bw - 6, rh - 6);
      for (let q = 0; q < 60; q++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,38,36' : '230,226,220'},${0.12 + r() * 0.15})`; g.fillRect(x + 3 + r() * (bw - 8), j * rh + 3 + r() * (rh - 8), 2 + r() * 5, 2 + r() * 4); }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 3, j * rh + rh - 9, bw - 6, 6); // rock-faced lower lip
      x += bw;
    }
  }
});
const plazaTex = () => canvasTex(512, 512, (g, w, h) => { // 8 x 8 m of granite slabs (1 x 1 m, random greys), a dark band on two edges
  const r = rng(47), n = 8, c = w / n;
  g.fillStyle = '#5c5a57'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = r(); g.fillStyle = `rgb(${128 + k * 36 | 0},${126 + k * 34 | 0},${122 + k * 32 | 0})`; g.fillRect(i * c + 1.5, j * c + 1.5, c - 3, c - 3);
    for (let q = 0; q < 50; q++) { g.fillStyle = `rgba(${r() < 0.5 ? '50,48,46' : '215,212,205'},${0.1 + r() * 0.2})`; g.fillRect(i * c + r() * c, j * c + r() * c, 1 + r() * 3, 1 + r() * 3); }
    if (r() < 0.25) { g.fillStyle = 'rgba(70,90,40,0.35)'; g.fillRect(i * c, j * c + c - 3, c, 3); } // grass in the joints
  }
  g.fillStyle = '#3b3a39'; g.fillRect(0, 0, w, 10); g.fillRect(0, 0, 10, h);
});
const namesTex = () => canvasTex(1024, 128, (g, w, h) => { // engraved columns of names (illegible at play distance)
  const r = rng(5); g.fillStyle = '#0e0e10'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(205,200,190,0.75)';
  for (let col = 0; col < 16; col++) for (let row = 0; row < 9; row++) { const x = 12 + col * 63, y = 12 + row * 12.5, L = 26 + r() * 30; for (let k = 0; k < L; k += 4 + r() * 3) g.fillRect(x + k, y, 2 + r() * 2.5, 6); }
});

// ------------------------------------------------------------------------------------------------ the statue
// local frame: x = forward (towards the plaza), y up from the plinth top, z = her right (the bowl side)
function statue(s) {
  const n = 64;
  const th = (k) => -k / n * PI * 2; // ring angle: 0 = front, -PI/2 = her left (z < 0)
  // dress + bodice + neck: [y, half-depth, half-width]
  const ST = [[0, 0.8, 1.1], [0.22, 0.77, 1.08], [1.5, 0.73, 1.04], [3.0, 0.68, 0.98], [4.3, 0.62, 0.93], [5.0, 0.55, 0.85], [5.45, 0.57, 0.85],
    [5.9, 0.6, 0.88], [6.3, 0.57, 0.92], [6.62, 0.5, 0.95], [6.84, 0.4, 0.72], [7.0, 0.27, 0.3], [7.3, 0.23, 0.22], [7.5, 0.22, 0.2]];
  const body = ST.map(([y, ra, rb]) => {
    return ringOf(n, th, (t, c, sn) => {
      const pleatA = y < 4.95 ? 0.055 * Math.min(1, (4.95 - y) / 0.6 + 0.35) : 0;
      const pl = pleatA * (0.65 * Math.sin(18 * t + 0.4) + 0.35 * Math.sin(7 * t + 1.3)) * (0.55 + 0.45 * Math.abs(sn) + 0.3 * Math.max(0, c));
      const bust = 0.1 * Math.exp(-(((y - 5.85) / 0.33) ** 2)) * Math.max(0, c) ** 2;
      const back = c < 0 ? 0.92 : 1; // flatter back
      return [(ra * back * (1 + pl) + bust) * c, y, rb * (1 + pl) * sn];
    });
  });
  s.loft(body, { cap0: true });
  // head: skull, face, chin, nose, the hair gathered in a bun, a band round the head
  s.ellipsoid([0.04, 7.8, 0], [0.33, 0.45, 0.28], 20, 12);
  s.ellipsoid([0.25, 7.47, 0], [0.13, 0.12, 0.15], 10, 6);
  s.ellipsoid([0.35, 7.76, 0], [0.07, 0.12, 0.05], 8, 6);
  s.ellipsoid([-0.05, 7.88, 0], [0.34, 0.43, 0.31], 18, 10); // hair (shifted back: the face stays free)
  s.ellipsoid([-0.36, 7.72, 0], [0.19, 0.22, 0.24], 12, 8);
  const band = Array.from({ length: 25 }, (_, k) => { const c = Math.cos(k * PI / 12), sn = Math.sin(k * PI / 12); return [0.02 + 0.37 * c, 8.02 - 0.12 * c, 0.33 * sn]; });
  s.tube(band, band.map(() => 0.04), 6, { caps: false });
  // cape over the shoulders: collar -> shoulder overhang -> folds flaring down to the hem (front short, sides long)
  const hem = (t) => 5.85 - 1.25 * (1 - Math.max(0, Math.cos(t)) ** 0.8) - (Math.sin(t) < 0 ? 0.15 * -Math.sin(t) : 0);
  const cape = [];
  const CR = [[7.02, 0.34, 0.42], [6.84, 0.56, 0.98], [6.58, 0.66, 1.13]];
  for (const [y, ra, rb] of CR) cape.push(ringOf(n, th, (t, c, sn) => [ra * c, y, rb * sn]));
  for (let j = 1; j <= 6; j++) {
    const u = j / 6;
    cape.push(ringOf(n, th, (t, c, sn) => {
      const y = 6.58 + u * (hem(t) - 6.58) + 0.1 * u * u * Math.sin(5 * t);
      const f = 1 + u * (0.07 * Math.sin(11 * t + 0.7) + 0.04 * Math.sin(4 * t));
      return [(0.66 + 0.16 * u) * f * c * (c < 0 ? 0.95 : 1), y, (1.13 + 0.13 * u) * f * sn];
    }));
  }
  s.loft(cape);
  // right arm (bowl): upper arm out to the side, forearm up, the bowl above the hand
  s.tube([[0, 6.66, 0.78], [0.14, 6.7, 1.22], [0.24, 6.76, 1.52], [0.29, 7.15, 1.61], [0.33, 7.7, 1.62], [0.35, 7.96, 1.6]], [0.24, 0.21, 0.18, 0.15, 0.13, 0.11], 12);
  s.ellipsoid([0.37, 8.04, 1.6], [0.12, 0.1, 0.15], 10, 6);
  const bowl = [0.4, 1.62];
  s.lathe(bowl[0], bowl[1], [[0.07, 8.08], [0.3, 8.13], [0.55, 8.24], [0.71, 8.38], [0.74, 8.42], [0.69, 8.41], [0.5, 8.29], [0.27, 8.2], [0.02, 8.18]], 32);
  // left arm raised, palm open, fingers spread
  s.tube([[0, 6.7, -0.78], [0.06, 7.3, -1.0], [0.12, 7.95, -1.18], [0.18, 8.6, -1.34], [0.25, 9.25, -1.5], [0.29, 9.55, -1.58]], [0.24, 0.21, 0.18, 0.15, 0.13, 0.11], 12);
  s.ellipsoid([0.31, 9.76, -1.64], [0.07, 0.2, 0.14], 10, 6);
  for (const o of [-0.1, -0.034, 0.034, 0.1]) s.tube([[0.31, 9.9, -1.64 + o], [0.32, 10.08, -1.64 + o * 1.35], [0.31, 10.22 - Math.abs(o) * 0.5, -1.64 + o * 1.7]], [0.034, 0.03, 0.026], 5);
  s.tube([[0.33, 9.7, -1.52], [0.37, 9.84, -1.44], [0.39, 9.96, -1.41]], [0.04, 0.034, 0.028], 5);
  // drapes hanging from the arms (the cape caught up by them)
  const drape = (A0, A1, B0, B1, out, rows = 7, cols = 7) => {
    const mix = (a, b, t) => a.map((v, q) => v + t * (b[q] - v));
    const R = Array.from({ length: rows + 1 }, (_, j) => Array.from({ length: cols + 1 }, (_, i) => {
      const t = j / rows, u = i / cols, p = mix(mix(A0, A1, u), mix(B0, B1, u), t);
      const bulge = 0.13 * Math.sin(PI * t) + 0.05 * t * Math.sin(3 * PI * u);
      return [p[0] + 0.06 * t * Math.cos(4 * PI * u), p[1], p[2] + out * bulge];
    }));
    s.loft(R, { closed: false });
  };
  drape([0.05, 6.72, -0.92], [0.12, 7.75, -1.2], [0.02, 5.05, -1.02], [0.16, 5.35, -1.24], -1);
  drape([0.02, 6.62, 0.94], [0.22, 6.72, 1.5], [0.0, 5.3, 1.02], [0.22, 5.85, 1.44], 1);
  return { bowl, bowlY: 8.42, handTop: 10.2, headTop: 8.32 };
}

// bas-relief band: figures of soldiers, partisans and mourners, rifles and banners (depth in metres) at (s along the
// wall, v up the band); capsules merged by max
function reliefField(len, H) {
  const r = rng(77), caps = [];
  const cap = (s0, v0, s1, v1, rad, d) => caps.push([s0, v0, s1, v1, rad, d]);
  for (let s = 0.6; s < len - 0.6; s += 0.75 + r() * 0.7) {
    const k = r(), sc = H / 1.55 * (0.85 + r() * 0.25), lean = (r() - 0.5) * 0.5 + (s / len - 0.5) * 0.6;
    if (k < 0.12) { // banner: pole + a big waving cloth
      cap(s, 0.05, s + 0.5 * sc, 1.45 * sc, 0.03, 0.05);
      for (let q = 0; q < 5; q++) cap(s + 0.5 * sc + q * 0.12, 1.4 * sc - q * 0.04, s + 0.5 * sc + 0.8 + q * 0.12, 1.25 * sc - q * 0.1 + 0.08 * Math.sin(q), 0.09, 0.06);
      continue;
    }
    const hx = s + lean * 0.4 * sc, hy = 1.3 * sc;
    cap(hx, hy, hx, hy + 0.02, 0.1 * sc, 0.14); // head
    cap(hx, hy - 0.15 * sc, s + lean * 0.15 * sc, 0.6 * sc, 0.13 * sc, 0.12); // torso
    cap(s + lean * 0.15 * sc, 0.6 * sc, s - 0.15 * sc, 0.05, 0.07 * sc, 0.1); // legs (striding)
    cap(s + lean * 0.15 * sc, 0.6 * sc, s + 0.2 * sc + lean * 0.2, 0.05, 0.07 * sc, 0.1);
    if (k < 0.55) { cap(hx - 0.05, hy - 0.2 * sc, hx + 0.45 * sc, hy + 0.1 * sc, 0.035, 0.12); cap(hx + 0.2 * sc, hy - 0.15 * sc, hx + 0.7 * sc, hy + 0.12 * sc, 0.022, 0.09); } // rifle
    else if (k < 0.8) cap(hx, hy - 0.2 * sc, hx + (r() - 0.3) * 0.5 * sc, hy + 0.35 * sc, 0.045 * sc, 0.1); // raised arm
    else cap(hx, hy - 0.2 * sc, hx - 0.25 * sc, hy - 0.55 * sc, 0.05 * sc, 0.09); // mourner
  }
  // flames / smoke swirls along the top as a frieze ground
  for (let s = 0; s < len; s += 0.9) cap(s, H * 0.92, s + 0.6, H * (0.95 + 0.04 * Math.sin(s)), 0.08, 0.035);
  // 1 m buckets along s -> the capsules touching them
  const buckets = [];
  caps.forEach((c, i) => {
    const lo = Math.floor(Math.min(c[0], c[2]) - c[4]), hi = Math.floor(Math.max(c[0], c[2]) + c[4]);
    for (let q = lo; q <= hi; q++) (buckets[q] ||= []).push(c);
  });
  return (s, v) => (buckets[Math.floor(s)] || []).reduce((d, [s0, v0, s1, v1, rad, dep]) => {
    const es = s1 - s0, ev = v1 - v0, t = Math.min(1, Math.max(0, ((s - s0) * es + (v - v0) * ev) / (es * es + ev * ev || 1e-9)));
    const q = Math.hypot(s - (s0 + es * t), v - (v0 + ev * t)) / rad;
    return q < 1 ? Math.max(d, dep * Math.sqrt(1 - q * q)) : d;
  }, 0.012);
}

// ------------------------------------------------------------------------------------------------ build
export function buildPagorb({ root, map, solids: S, zips: Z, heightAt, geo }) {
  const t0 = performance.now(), s0 = S.count;
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const poi = map.pois.find(p => p.id === 'n1668723397');
  const [mx, mz] = poi ? [poi.x, poi.z] : geo.toXZ(...STATUE);
  // the plaza wall, resampled every metre; the plaza = the circle fitted through it (the wall is concave to it)
  const W0 = WALL.map(([lat, lon]) => geo.toXZ(lat, lon));
  const W = W0.slice(1).flatMap((b, i) => {
    const a = W0[i], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    return Array.from({ length: n }, (_, k) => [a[0] + (k / n) * (b[0] - a[0]), a[1] + (k / n) * (b[1] - a[1])]);
  });
  W.push(W0[W0.length - 1]);
  const [cx, cz, rP] = fitCircle(W);
  const dC = (x, z) => Math.hypot(x - cx, z - cz);
  let fx = cx - mx, fz = cz - mz; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl; // statue faces the plaza
  const top = g(mx, mz) + 0.15 + MOUND_H;
  // mound profile 1 (crown) .. 0 (foot): a blend of a concave power curve and a cosine shoulder
  const prof = (r) => {
    const t = Math.min(1, Math.max(0, (r - CROWN_R) / (MOUND_R - CROWN_R)));
    return 0.55 * Math.pow(1 - t, 1.25) + 0.225 * (1 + Math.cos(PI * t));
  };
  // behind the tall middle of the wall the mound is banked up to a 2.3 m terrace (the wall's ends taper off)
  const angC = (x, z) => Math.atan2(z - cz, x - cx), wa0 = angC(...W[0]), wa1 = angC(...W.at(-1)), wMid = angC(...W[W.length >> 1]);
  const rel = (a) => { let d = a - wMid; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return d; };
  const half = Math.min(Math.abs(rel(wa0)), Math.abs(rel(wa1)));
  const taper = (x, z) => { const e = half - Math.abs(rel(angC(x, z))); return e <= 0 ? 0 : Math.min(1, e / 0.35) ** 2 * (3 - 2 * Math.min(1, e / 0.35)); };
  const hMound = (x, z) => {
    const gg = g(x, z) + 0.15, h = gg + (top - gg) * prof(Math.hypot(x - mx, z - mz)), d = dC(x, z) - rP;
    if (d < 0 || d > 12) return h;
    const tp = taper(x, z); return tp > 0 ? Math.max(h, gg + 2.2 * tp - Math.max(0, d - 4) * 0.12) : h;
  };
  // inside the plaza circle the mound is cut back to the wall (points moved onto the wall's back face)
  const onMound = (x, z) => { const d = dC(x, z); if (d >= rP + 0.35) return [x, z]; const k = (rP + 0.35) / Math.max(d, 1e-3); return [cx + (x - cx) * k, cz + (z - cz) * k]; };

  const group = Object.assign(new THREE.Group(), { name: 'pagorb' });
  root.add(group);
  let nV = 0;
  // mesh from a builder (skipped when empty) or a ready geometry
  const add = (src, mat, name, shadow = true) => {
    if (src instanceof MB && !src.v) return null;
    const geom = src instanceof MB ? src.build() : src;
    const m = Object.assign(new THREE.Mesh(geom, mat), { name: `pagorb-${name}`, castShadow: shadow, receiveShadow: true });
    nV += geom.attributes.position.count;
    group.add(m);
    return m;
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    grass: std({ roughness: 0.96, vertexColors: true }),
    wall: std({ roughness: 0.85, map: masonryTex() }),
    granite: std({ roughness: 0.75, vertexColors: true }),
    bronze: std({ color: 0x5a4d41, side: THREE.DoubleSide, envMapIntensity: 1.6, roughness: 0.4, metalness: 0.7 }),
    relief: std({ color: 0x4d443a, roughness: 0.5, metalness: 0.65 }),
    plaza: decal(std({ roughness: 0.8, map: plazaTex(), polygonOffset: true, polygonOffsetUnits: -4, polygonOffsetFactor: -2 })),
    names: std({ roughness: 0.22, metalness: 0.1, map: namesTex() }),
    lantern: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.16, 0.1) }),
  };
  M.names.map.wrapS = THREE.RepeatWrapping;

  // ---- mound: polar grid, grass, collision prism per triangle
  const NS = 64, radii = [];
  for (let r = CROWN_R; r < MOUND_R - 0.01; r += 1.9) radii.push(r);
  radii.push(MOUND_R);
  const D = new MB().setPart(0), polar = (k, r) => [mx + r * Math.cos(2 * PI * k / NS), mz + r * Math.sin(2 * PI * k / NS)];
  const V = radii.map((r) => Array.from({ length: NS }, (_, k) => { const [x, z] = onMound(...polar(k, r)); return [x, hMound(x, z), z]; }));
  const R0 = rng(3);
  const ids = V.map(row => row.map(([x, y, z]) => {
    const e = 0.7, nx = hMound(x - e, z) - hMound(x + e, z), nz = hMound(x, z - e) - hMound(x, z + e), nl = Math.hypot(nx, 2 * e, nz), h = R0();
    D.setColor(COL.grass.map((c, i) => c * (0.8 + 0.35 * h) * (i === 1 ? 1 + 0.15 * Math.sin(x * 0.3) : 1)));
    return D.vert(x, y, z, nx / nl, 2 * e / nl, nz / nl);
  }));
  const yLo = Math.min(...V[V.length - 1].map((p) => p[1])) - 2;
  V.slice(1).forEach((outer, jj) => {
    const inner = V[jj];
    for (let k = 0; k < NS; k++) {
      const k1 = (k + 1) % NS;
      D.quad(ids[jj][k], ids[jj][k1], ids[jj + 1][k1], ids[jj + 1][k]); // faces up (the angle grows toward +z)
      prismUnder(S, [inner[k], inner[k1], outer[k1]], yLo, 'park');
      prismUnder(S, [inner[k], outer[k1], outer[k]], yLo, 'park');
    }
  });
  // crown: flat disc
  const hub = D.vert(mx, top + 0.02, mz, 0, 1, 0);
  const rim = Array.from({ length: NS }, (_, k) => { const [x, z] = polar(k, CROWN_R); return D.vert(x, top + 0.02, z, 0, 1, 0); });
  rim.forEach((id, k) => D.tri(hub, rim[(k + 1) % NS], id));
  S.prism(ngonFlat(24, CROWN_R + 0.3, mx, mz), yLo, top + 0.02, 0, 0, 'park');
  add(D, M.grass, 'mound');

  // ---- granite pieces (crown slabs, plinth, steps, coping) in one vertex-coloured mesh
  const Gm = new MB(), R1 = rng(9);
  const slabAt = (x, z, ang, L, Wd, yTop, th = 0.3, col = COL.granite, solid = true) => {
    const k = R1(); Gm.setColor(hexLin(col).map(v => v * (0.82 + 0.3 * k)));
    Gm.with(M4(x, 0, z, ang), d => d.box(-L / 2, yTop - th, -Wd / 2, L / 2, yTop, Wd / 2));
    if (solid) S.prism(rectFlat(x, z, ang, L / 2, Wd / 2), yTop - th - 1.5, yTop, 0, 0, 'ledge');
  };
  for (let q = 0; q < 16; q++) { // loose slabs round the crown (random draws in a fixed order: angle, radius, yaw, L, W, height)
    const a = 2 * PI * q / 16 + 0.3 * R1(), r = 2.2 + 1.3 * R1(), yaw = PI * R1(), sl = 0.7 + 0.6 * R1(), sw = 0.5 + 0.4 * R1();
    slabAt(mx + r * Math.cos(a), mz + r * Math.sin(a), yaw, sl, sw, top + 0.07 + 0.06 * R1(), 0.3, COL.graniteD, false);
  }
  const ry = Math.atan2(-fz, fx); // local x -> forward
  const plinthTop = top + 0.55;
  Gm.setColor(0x151517).with(M4(mx, 0, mz, ry), (d) => d.box(-1.25, top - 0.2, -1.4, 1.25, plinthTop, 1.4));
  S.prism(rectFlat(mx, mz, ry, 1.25, 1.4), top - 1, plinthTop, 0, 0, 'ledge');
  // rock-slab steps: from the crown edge straight down to the paths' feet at the wall
  for (const foot of PATHS) {
    const [ex, ez] = geo.toXZ(foot[0], foot[1]), L = Math.hypot(ex - mx, ez - mz), dx = (ex - mx) / L, dz = (ez - mz) / L;
    const ray = (r) => [mx + r * dx, mz + r * dz], ang = Math.atan2(-dz, dx);
    let rEnd = L; // where the path meets the wall
    for (let r = CROWN_R; r < L; r += 0.25) if (dC(...ray(r)) < rP + 0.8) { rEnd = r; break; }
    for (let r = CROWN_R + 0.3; r < rEnd - 0.2; r += 0.72) {
      const [x, z] = ray(r), side = 0.25 * (R1() - 0.5), yaw = ang + 0.25 * (R1() - 0.5);
      slabAt(x - dz * side, z + dx * side, yaw, 0.62, 1.3 + 0.4 * R1(), hMound(x, z) + 0.1, 0.4);
    }
    // stairs down the wall face onto the plaza
    const [wx, wz] = ray(rEnd), yT = hMound(wx, wz) + 0.1, yB = g(wx + 3 * dx, wz + 3 * dz) + 0.19;
    const n = Math.max(1, Math.ceil((yT - yB) / 0.3)), rise = (yT - yB) / n;
    for (let k = 0; k < n; k++) slabAt(...ray(rEnd + 0.35 + 0.38 * k), ang, 0.4, 2.0, yT + 0.02 - rise * (k + 1), 1.2, COL.graniteD);
  }
  add(Gm, M.granite, 'granite');

  // ---- the retaining wall: rock-faced granite, height to the mound behind it, coping on top
  const Wm = new MB().setColor(0xffffff), Cp = new MB().setColor(0xffffff);
  let sAcc = 0;
  const wallPts = W.map(([x, z], i) => {
    const prev = W[Math.max(0, i - 1)], next = W[Math.min(W.length - 1, i + 1)], tl = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
    let nx = (prev[1] - next[1]) / tl, nz = (next[0] - prev[0]) / tl;
    if (nx * (cx - x) + nz * (cz - z) < 0) { nx = -nx; nz = -nz; } // toward the plaza
    if (i) sAcc += Math.hypot(x - W[i - 1][0], z - W[i - 1][1]);
    const yB = g(x, z) + 0.05;
    return { x, z, nx, nz, yB, yT: Math.max(yB + 0.55, hMound(x - 0.6 * nx, z - 0.6 * nz) + 0.2), s: sAcc };
  });
  wallPts.slice(1).forEach((b, k) => {
    const a = wallPts[k], lo = (p) => [p.x, p.yB - 0.5, p.z], hi = (p) => [p.x, p.yT, p.z], uv = (p, y) => [p.s / 4.8, y / 2.4];
    quadN(Wm, lo(a), lo(b), hi(b), hi(a), [a.nx, 0, a.nz], [uv(a, a.yB - 0.5), uv(b, b.yB - 0.5), uv(b, b.yT), uv(a, a.yT)]);
    // coping: 0.55 wide slab on top, lip over the face
    const ex = b.x - a.x, ez = b.z - a.z, yc = 0.14 + Math.max(a.yT, b.yT), half = (Math.hypot(ex, ez) + 0.03) / 2;
    const mxw = (a.x + b.x) / 2, mzw = (a.z + b.z) / 2;
    Cp.with(M4(mxw - 0.12 * a.nx, 0, mzw - 0.12 * a.nz, Math.atan2(-ez, ex)), (d) => d.box(-half, yc - 0.2, -0.36, half, yc, 0.36, 0b110111));
    const edge = (p, k2) => [p.x + k2 * p.nx, p.z + k2 * p.nz];
    S.prism(ccwFlat([edge(a, 0.25), edge(b, 0.25), edge(b, -0.5), edge(a, -0.5)]), Math.min(a.yB, b.yB) - 0.5, yc, 0, 0, 'coping');
    if (k % 5 === 2) Z.add(mxw + 0.3 * a.nx, yc, mzw + 0.3 * a.nz, a.nx, 0, a.nz, 'ledge');
  });
  add(Wm, M.wall, 'wall');
  add(Cp, std({ color: 0xc9c4bb, roughness: 0.7 }), 'coping');

  // ---- bronze bas-relief band on the tall middle of the wall
  const tall = wallPts.filter(p => p.yT - p.yB > 2.05);
  if (tall.length > 8) {
    const sA = tall[0].s + 0.6, sB = tall.at(-1).s - 0.6, len = sB - sA, H = 1.5, disp = reliefField(len, H);
    const at = (s) => { // wall frame interpolated at arc length s
      let i = 1;
      while (i < wallPts.length - 1 && wallPts[i].s < s) i++;
      const a = wallPts[i - 1], b = wallPts[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s), f = (k) => a[k] + t * (b[k] - a[k]);
      return { x: f('x'), z: f('z'), nx: f('nx'), nz: f('nz'), yB: f('yB') };
    };
    const Rs = new SG(), rows = [], dv = 0.07, ds = 0.07;
    // loft columns (one "ring" per column, open, bottom -> top) with a flat frame border
    for (let s = 0; s <= len + 1e-6; s += ds) {
      const q = at(sA + s), col = [];
      for (let v = -0.08; v <= H + 0.08 + 1e-6; v += dv) {
        const edge = v < 0 || v > H || s < 0.08 || s > len - 0.08, dd = edge ? 0.03 : disp(s, v);
        col.push([q.x + q.nx * (0.02 + dd), q.yB + 0.35 + Math.max(-0.08, Math.min(H + 0.08, v)), q.z + q.nz * (0.02 + dd)]);
      }
      rows.push(col);
    }
    Rs.loft(rows, { closed: false });
    const rg = Rs.build(), mid = at(sA + len / 2);
    const idxA = rg.index.array, nA = rg.attributes.normal.array;
    if (idxA.length && nA[0] * mid.nx + nA[2] * mid.nz < 0) { // winding: make it face the plaza
      for (let i = 2; i < idxA.length; i += 3) [idxA[i - 1], idxA[i]] = [idxA[i], idxA[i - 1]];
      nA.forEach((v, i) => { nA[i] = -v; });
    }
    add(rg, M.relief, 'relief');
    // the 37 m black names slab on the plaza in front of the relief (right half), top sloping toward the plaza
    const Nm = new MB().setColor(0xffffff), Nb = new MB().setColor(COL.black);
    const sN0 = sA + len * 0.45;
    const sEnd = wallPts[wallPts.length - 1].s;
    for (let s = 0; s < 37; s++) { // one metre of slab per step, 6.5 .. 7.9 m out from the wall
      const a = at(Math.min(sN0 + s, sEnd)), b = at(Math.min(sN0 + s + 1, sEnd));
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.2) break;
      const out = (p, d) => [p.x + d * p.nx, p.z + d * p.nz], P = [out(a, 6.5), out(b, 6.5), out(b, 7.9), out(a, 7.9)];
      const y0 = g(P[0][0], P[0][1]) + 0.19;
      const Q = P.map(([x, z], q) => [x, y0 + (q < 2 ? 0.55 : 0.3), z]);
      let up = norm(cross(sub3(Q[1], Q[0]), sub3(Q[3], Q[0])));
      if (up[1] < 0) up = up.map((v) => -v);
      const u0 = s / 37, u1 = (s + 1) / 37;
      quadN(Nm, Q[0], Q[1], Q[2], Q[3], up, [[u0, 1], [u1, 1], [u1, 0], [u0, 0]]);
      const cxs = (P[0][0] + P[2][0]) / 2, czs = (P[0][1] + P[2][1]) / 2;
      Q.forEach((p0, q) => { // black sides, facing away from the slab centre
        const p1 = Q[(q + 1) % 4], L = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
        if (L < 1e-3) return;
        const sgn = ((p0[0] - cxs) * (p1[2] - p0[2]) - (p0[2] - czs) * (p1[0] - p0[0])) < 0 ? -1 : 1;
        quadN(Nb, [p0[0], y0 - 0.3, p0[2]], [p1[0], y0 - 0.3, p1[2]], p1, p0, [sgn * (p1[2] - p0[2]) / L, 0, -sgn * (p1[0] - p0[0]) / L]);
      });
      S.prism(ccwFlat(P), y0 - 0.3, y0 + 0.55, 0, 0, 'ledge');
    }
    add(Nm, M.names, 'names');
    add(Nb, std({ roughness: 0.25, vertexColors: true }), 'names-slab');
  }

  // ---- ritual plaza: granite slabs inside the wall circle (UVs along the plaza axis)
  {
    // centre vertex 0, then nR rings of nA vertices every 2 m (the last just inside the wall)
    const nR = Math.ceil(rP / 2), nA = 120, pos = [], uvs = [], idx = [];
    const vid = (i, k) => (i ? 1 + (i - 1) * nA + (k % nA) : 0);
    const put = (x, z) => {
      const dx = x - cx, dz = z - cz;
      pos.push(x, g(x, z) + 0.215, z);
      uvs.push(-(dx * fx + dz * fz) / 8, (dx * fz - dz * fx) / 8); // slab grid along the plaza axis
    };
    put(cx, cz);
    for (let i = 1; i <= nR; i++) {
      const r = Math.min(rP - 0.3, 2 * i);
      for (let k = 0; k < nA; k++) put(cx + r * Math.cos(2 * PI * k / nA), cz + r * Math.sin(2 * PI * k / nA));
    }
    for (let k = 0; k < nA; k++) {
      idx.push(0, vid(1, k + 1), vid(1, k));
      for (let i = 1; i < nR; i++) idx.push(vid(i, k), vid(i, k + 1), vid(i + 1, k + 1), vid(i, k), vid(i + 1, k + 1), vid(i + 1, k));
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    pg.setIndex(idx);
    pg.computeVertexNormals();
    add(pg, M.plaza, 'plaza', false);
  }

  // ---- the statue + the LED lantern in her bowl
  const sg = new SG(), st = statue(sg);
  const XF = M4(mx, plinthTop, mz, ry);
  add(sg.build(XF), M.bronze, 'vitchyzna-maty');
  const L = new MB();
  L.with(M4(st.bowl[0], 0, st.bowl[1]), d => d.cyl(0, st.bowlY - 0.2, 0, 0.3, 0.3, 0.85, 8, true));
  const lantern = Object.assign(new THREE.Mesh(L.build(), M.lantern), { name: 'pagorb-lantern' });
  lantern.applyMatrix4(XF);
  group.add(lantern);
  const Lf = new MB().setColor(0x111111); // black frame posts + rod
  Lf.with(M4(st.bowl[0], 0, st.bowl[1]), (d) => {
    const yb = st.bowlY;
    for (let k = 0; k < 8; k++) { const a = PI * (2 * k + 1) / 8; d.boxC(0.29 * Math.cos(a), yb + 0.22, 0.29 * Math.sin(a), 0.04, 0.86, 0.04); }
    d.boxC(0, yb + 0.7, 0, 0.66, 0.06, 0.66).cyl(0, yb + 0.72, 0, 0.012, 0.012, 0.9, 4, false);
  });
  add(Lf.build().applyMatrix4(XF), std({ metalness: 0.5, roughness: 0.5, vertexColors: true }), 'lantern-frame');
  // statue collision (body, shoulders, head; the bowl arm) + zip points on head, bowl and raised hand, in the plinth frame
  const cr = Math.cos(ry), sr = Math.sin(ry), w = (a, b) => [mx + cr * a + sr * b, mz - sr * a + cr * b];
  const hero = (a, b, cyls, zipY) => {
    const [x, z] = w(a, b);
    for (const [y0, y1, r0, r1] of cyls) S.cyl(x, z, plinthTop + y0, plinthTop + y1, r0, r1, 'hero');
    Z.add(x, plinthTop + zipY, z, 0, 1, 0, 'antenna');
  };
  hero(0, 0, [[0, 5, 1.02, 0.88], [5, 6.9, 0.9, 0.75], [6.9, st.headTop, 0.4, 0.36]], st.headTop);
  hero(st.bowl[0], st.bowl[1], [[8.05, st.bowlY, 0.2, 0.74], [st.bowlY, st.bowlY + 0.7, 0.32, 0.32]], st.bowlY + 0.75);
  hero(0.31, -1.64, [], st.handTop);

  // ---- blue spruces round the plaza (not on the mound side), trees kept off the mound and the plaza
  const spots = [], R2 = rng(12), blue = [PARK_PINE[0].map(([r, gg, b]) => [0.8 * r, 0.95 * gg, 1.25 * b])];
  for (let k = 0; k < 26; k++) {
    const a = 2 * PI * k / 26 + 0.1 * R2(), r = rP + 3 + 4 * R2(), x = cx + r * Math.cos(a), z = cz + r * Math.sin(a);
    if (Math.hypot(x - mx, z - mz) < MOUND_R + 4 || R2() < 0.35) continue; // (short-circuit keeps the draw order)
    spots.push({ x, z, y: g(x, z) + 0.15, kind: 'conifer', sc: 0.55 + 0.3 * R2(), pal: blue, s3: [0.8, 1.15, 0.8] });
  }
  const clear = (x, z) => Math.hypot(x - mx, z - mz) < MOUND_R + 3 || dC(x, z) < rP + 2;

  console.log(`[cherkasy] Pagorb Slavy: ${nV} vertices, ${S.count - s0} solids, plaza r ${rP.toFixed(1)} m, wall ${sAcc.toFixed(0)} m in ${(performance.now() - t0).toFixed(0)} ms`);
  let time = 0;
  return {
    spots, clear, center: [mx, mz], plaza: [cx, cz, rP],
    update(dt) { time += dt; const k = 1 + 0.08 * Math.sin(time * 2.1) + 0.6 * nightK.value; M.lantern.color.setRGB(2.4 * k, 0.16 * k, 0.1 * k); },
  };
}

// ------------------------------------------------------------------------------------------------ helpers
const sub3 = (a, b) => a.map((v, i) => v - b[i]);
const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const paint = (g, style, x, y, w, h) => { g.fillStyle = style; g.fillRect(x, y, w, h); };
// n points of a ring: fn(t, cos t, sin t) with t = th(k)
const ringOf = (n, th, fn) => Array.from({ length: n }, (_, k) => { const t = th(k); return fn(t, Math.cos(t), Math.sin(t)); });
// quad p0..p3 (a loop) facing n (winding chosen to match), flat normal n, optional uv per corner
export function quadN(D, p0, p1, p2, p3, n, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  const P = [p0, p1, p2, p3], id = P.map((p, i) => D.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[i][0], uv[i][1]));
  const f = cross(sub3(p1, p0), sub3(p2, p0)), facing = f[0] * n[0] + f[1] * n[1] + f[2] * n[2];
  facing < 0 ? D.quad(id[0], id[3], id[2], id[1]) : D.quad(id[0], id[1], id[2], id[3]);
}
function fitCircle(P) { // algebraic (Kasa) least squares
  let sx = 0, sz = 0; for (const [x, z] of P) { sx += x; sz += z; } sx /= P.length; sz /= P.length;
  let Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (const [x, z] of P) { const u = x - sx, v = z - sz; Suu += u * u; Svv += v * v; Suv += u * v; Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u; }
  const a = (Suuu + Suvv) / 2, b = (Svvv + Svuu) / 2, det = Suu * Svv - Suv * Suv;
  const uc = (a * Svv - b * Suv) / det, vc = (b * Suu - a * Suv) / det;
  return [sx + uc, sz + vc, Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / P.length)];
}
const ccwFlat = (P) => (area2(P) < 0 ? P.slice().reverse() : P).flat();
const ngonFlat = (n, r, cx, cz) => ccwFlat(Array.from({ length: n }, (_, k) => [cx + r * Math.cos(2 * PI * k / n), cz + r * Math.sin(2 * PI * k / n)]));
// rectangle of half sizes (ha, hb) centred at (x, z), local +a -> world (cos ang, -sin ang)
const rectFlat = (x, z, ang, ha, hb) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return ccwFlat([[-ha, -hb], [ha, -hb], [ha, hb], [-ha, hb]].map(([a, b]) => [x + c * a + s * b, z - s * a + c * b]));
};
// collision prism under a 3D triangle (top = the triangle's plane y = a + bx x + bz z)
function prismUnder(S, T, y0, kind) {
  const [p0, p1, p2] = T, n = cross(sub3(p1, p0), sub3(p2, p0));
  if (Math.abs(n[1]) < 1e-6) return;
  const bx = -n[0] / n[1], bz = -n[2] / n[1];
  S.prism(ccwFlat(T.map((p) => [p[0], p[2]])), y0, p0[1] - bx * p0[0] - bz * p0[2], bx, bz, kind);
}
