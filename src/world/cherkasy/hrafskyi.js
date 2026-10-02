// OWNER: cherkasy. ЖК «Графський», вул. Байди Вишневецького, 68 (and Добровольчих Батальйонів 201/А, 203/1–3): the
// brick residential quarter between the two streets, rebuilt after the developer's photos of the finished houses
// (grafsky.com.ua) and the lun.ua catalogue renders (lun.ua/new/cherkasy/hrafskyi). Three 15-storey sections in a row
// along Добровольчих Батальйонів, three along Байди Вишневецького with shops on the ground floor (the corner one
// stands in a one-storey shop podium, No 68), the 17-storey L of the newer sections on the north side of the yard and
// the 15-storey L in the middle. Buff facing brick over a grey brick ground storey; the dark glazed loggia stacks sit
// in taupe brick bands, the section ends are taupe; white-framed windows (some with black French railings); flat roofs
// behind a coping with lift rooms; entrances with canopies on the yard; a share of the flats lights up at night.
//   HRAFSKYI_SKIP: the OSM ids replaced here (buildings.js skips them)
//   buildHrafskyi({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints } | null
// Every outline edge becomes a facade in a face frame (blockkit.js: s along the edge, y up, o outward), minus the
// parts a neighbouring section's wall covers. A window column or a loggia stack is one recessed (or proud) pane a whole
// stack high: its texture holds eight storeys with their own lit pattern, so a stack costs a handful of quads.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { ringPts, area2, obb, rng, hash01, inPoly, convexParts } from './geo.js';
import { edgeFace, at, quad, fbox, fsolid, finish, neg, UP, DN } from './blockkit.js';

const REL = 19744972, REL_DUP = 1477355757, PODIUM = 973321831;
const ROW_W = [1193290975, 1193290976, 989035400], ROW_S = [1193288998, 989035398, 989035397];
export const HRAFSKYI_SKIP = new Set([REL, REL_DUP, PODIUM, ...ROW_W, ...ROW_S]);
const NAMES = {
  1193290975: 'Добровольчих Батальйонів 203/1', 1193290976: 'Добровольчих Батальйонів 203/2', 989035400: 'Добровольчих Батальйонів 203/3',
  1193288998: 'Байди Вишневецького 68/3', 989035398: 'Байди Вишневецького 68/2', 989035397: 'Байди Вишневецького 68/1',
  [REL]: 'Добровольчих Батальйонів 201/А', [PODIUM]: 'Байди Вишневецького 68',
};
const YARD = [-868, -185];                     // the middle of the yard the sections stand round (map metres)
const FH = 3.0, PARA = 1.0;                    // storey; parapet over the roof
const TEX_N = 8;                               // storeys painted in one window / loggia texture
const SAND = '#ecd0a6', TAUPE = '#a39383', PLINTH = '#aaa59d';         // vertex tints over the light brick texture
const SAND_E = [214, 188, 150], TAUPE_E = [148, 133, 119];             // the same colours as they come out, for the spandrels
const REV_S = '#d8bc90', REV_T = '#8f8174', DARK = '#2c2d30', FASCIA = '#47494d', COPING = '#6b655e', ROOF = '#55524e';

// ------------------------------------------------------------------------------------------------ textures
function paintTex(w, h, draw) {
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(cv.getContext('2d'), w, h);
  const wrap = THREE.RepeatWrapping;
  return Object.assign(new THREE.CanvasTexture(cv), { wrapS: wrap, wrapT: wrap, anisotropy: 8, colorSpace: THREE.SRGBColorSpace });
}
const rgb = (c, k = 1) => `rgb(${c.map((v) => Math.min(255, Math.round(v * k))).join(',')})`;
// light facing brick, tinted per wall by the vertex colour: 8 stretchers x 26 courses per repeat
const BRICK_U = 2.08, BRICK_V = 1.95;
const brickTex = (r) => paintTex(512, 512, (g, w, h) => {
  g.fillStyle = '#d9d4cc'; g.fillRect(0, 0, w, h);
  const cw = w / 8, ch = h / 26;
  for (let row = 0; row < 26; row++) {
    const shift = row % 2 ? cw * 0.5 : 0;
    for (let i = -1; i < 8; i++) { g.fillStyle = rgb([236, 233, 228], 0.94 + r() * 0.08); g.fillRect(i * cw + shift + 1.5, row * ch + 1.5, cw - 3, ch - 3); }
  }
  for (let q = 0; q < 1500; q++) { g.fillStyle = r() < 0.6 ? 'rgba(90,80,70,0.06)' : 'rgba(255,255,255,0.08)'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
});
// window columns: four 64 px columns (buff, buff + French railing, taupe, taupe + railing), TEX_N storeys of 128 px
// each (v = 0 at the bottom storey's floor); the window spans 0.85–2.35 m of the 3 m storey over a brick spandrel.
// mask: the glass of the lit storeys only (about a third), drawn per column
const WIN_U = 4, SH = 128;
const stripTex = (mask, r) => paintTex(64 * WIN_U, SH * TEX_N, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let c = 0; c < WIN_U; c++) {
    const x0 = c * 64, base = c < 2 ? SAND_E : TAUPE_E, rail = c % 2 === 1;
    if (!mask) {
      g.fillStyle = rgb(base); g.fillRect(x0, 0, 64, h);
      for (let y = 0; y < h; y += 3.2) { g.fillStyle = rgb(base, 0.9); g.fillRect(x0, Math.round(y), 64, 1); } // coursing
    }
    for (let j = 0; j < TEX_N; j++) {
      const bot = h - j * SH, wb = Math.round(bot - SH * 0.283), wt = Math.round(bot - SH * 0.783), lit = r() < 0.32;
      if (mask) { if (lit) { g.fillStyle = '#fff'; g.fillRect(x0 + 8, wt + 3, 48, wb - wt - 6); } continue; }
      const gl = g.createLinearGradient(0, wt, 0, wb);
      gl.addColorStop(0, '#9fb0ba'); gl.addColorStop(1, '#52606a');
      g.fillStyle = '#f4f3ef'; g.fillRect(x0 + 5, wt, 54, wb - wt);                  // white frame
      g.fillStyle = gl; g.fillRect(x0 + 8, wt + 3, 48, wb - wt - 6);
      g.fillStyle = '#f4f3ef'; g.fillRect(x0 + 31, wt, 3, wb - wt); g.fillRect(x0 + 5, wt + 14, 54, 2); // mullion, fanlight
      g.fillStyle = '#e9e5dc'; g.fillRect(x0 + 3, wb, 58, 3);                         // sill
      if (rail) { g.fillStyle = '#1d1d1f'; g.fillRect(x0 + 6, wb - 22, 52, 2); g.fillRect(x0 + 6, wb - 4, 52, 2); for (let k = 0; k < 9; k++) g.fillRect(x0 + 6 + k * 6.3, wb - 22, 1.5, 20); }
    }
  }
});
// loggia glazing: one 1.2 m bay per 64 px, TEX_N storeys: graphite frame, the slab band at the floor, a transom at
// rail height and a fanlight; mask: the glass of the lit storeys
const bayTex = (mask, r) => paintTex(64, SH * TEX_N, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let j = 0; j < TEX_N; j++) {
    const bot = h - j * SH, top = bot - SH, lit = r() < 0.3;
    if (mask) { if (lit) { g.fillStyle = '#fff'; g.fillRect(4, top + 4, w - 8, SH - 18); } continue; }
    const gl = g.createLinearGradient(0, top, 0, bot);
    gl.addColorStop(0, '#7c8d99'); gl.addColorStop(0.55, '#3c4852'); gl.addColorStop(1, '#2b343b');
    g.fillStyle = gl; g.fillRect(0, top, w, SH);
    g.fillStyle = '#222326';
    g.fillRect(0, top, 4, SH); g.fillRect(w - 4, top, 4, SH);   // mullions
    g.fillRect(0, bot - 10, w, 10);                              // slab band
    g.fillRect(0, Math.round(bot - SH * 0.33), w, 4);            // rail-height transom
    g.fillRect(0, Math.round(top + SH * 0.12), w, 3);            // fanlight
  }
});
// shopfront: one 1.6 m bay of one storey, all glass lit after dark
const shopTex = (mask) => paintTex(64, 128, (g, w, h) => {
  if (mask) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(4, 4, w - 8, h - 8); return; }
  const gl = g.createLinearGradient(0, 0, 0, h);
  gl.addColorStop(0, '#9aa9b2'); gl.addColorStop(1, '#4c5960');
  g.fillStyle = gl; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillRect(0, 0, w, 4); g.fillRect(0, h - 6, w, 6); g.fillRect(0, 26, w, 3);
});

// ------------------------------------------------------------------------------------------------ helpers
const uvq = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
// a pane in the face plane at offset o with the given uv
const pane = (D, f, s0, s1, y0, y1, o, uv) => quad(D, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, uv);
// the wall between y0 and y1 minus f.holes, each piece tinted by tint(s, y) (pieces split at f.splits and the
// storey line y1st, so a colour band never runs through a piece); brick uv in metres, continuous round the ring
function wall(D, f, y0, y1, ySplit, tint) {
  const ys = [...new Set([y0, y1, ySplit, ...f.holes.flatMap((h) => [h.y0, h.y1])])].filter((y) => y >= y0 && y <= y1).sort((a, b) => a - b);
  const piece = (a, b, ya, yb) => {
    if (b <= a + 1e-3) return;
    const ss = [a, ...f.splits.filter((s) => s > a + 1e-3 && s < b - 1e-3), b];
    for (let i = 1; i < ss.length; i++) {
      const p = ss[i - 1], q = ss[i];
      D.setColor(tint((p + q) / 2, (ya + yb) / 2));
      const ua = (p + f.su) / BRICK_U, ub = (q + f.su) / BRICK_U;
      pane(D, f, p, q, ya, yb, 0, uvq(ua, ub, ya / BRICK_V, yb / BRICK_V));
    }
  };
  for (let i = 1; i < ys.length; i++) {
    const ya = ys[i - 1], yb = ys[i];
    if (yb - ya < 1e-4) continue;
    const cuts = f.holes.filter((h) => h.y0 <= ya + 1e-4 && h.y1 >= yb - 1e-4).sort((p, q) => p.s0 - q.s0);
    const end = cuts.reduce((s, h) => { piece(s, h.s0, ya, yb); return Math.max(s, h.s1); }, 0);
    piece(end, f.L, ya, yb);
  }
}
// the four reveal faces of a recess d deep
function reveals(D, f, { s0, s1, y0, y1 }, d, color) {
  D.setColor(color);
  quad(D, at(f, s0, y0), at(f, s0, y0, -d), at(f, s0, y1, -d), at(f, s0, y1), f.U);
  quad(D, at(f, s1, y0), at(f, s1, y0, -d), at(f, s1, y1, -d), at(f, s1, y1), neg(f.U));
  quad(D, at(f, s0, y1), at(f, s1, y1), at(f, s1, y1, -d), at(f, s0, y1, -d), DN);
  quad(D, at(f, s0, y0), at(f, s1, y0), at(f, s1, y0, -d), at(f, s0, y0, -d), UP);
}
function keepOut(R, m) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of R) { b[0] = Math.min(b[0], x - m); b[1] = Math.min(b[1], z - m); b[2] = Math.max(b[2], x + m); b[3] = Math.max(b[3], z + m); }
  return { R, b, m };
}
function near({ R, b, m }, x, z) {
  if (x < b[0] || z < b[1] || x > b[2] || z > b[3]) return false;
  return inPoly(R, x, z) || R.some((p, i) => {
    const q = R[i + 1] || R[0], ex = q[0] - p[0], ez = q[1] - p[1];
    const t = Math.min(1, Math.max(0, ((x - p[0]) * ex + (z - p[1]) * ez) / Math.max(1e-9, ex * ex + ez * ez)));
    return Math.hypot(p[0] + t * ex - x, p[1] + t * ez - z) < m;
  });
}
const posRing = (b) => { const R = ringPts(b.p); return area2(R) < 0 ? R.reverse() : R; };

// ------------------------------------------------------------------------------------------------ build
export function buildHrafskyi({ root, map, solids: S, zips: Z, heightAt }) {
  // the sections: the two rows, and the relation's pieces (one of them doubles as way 201/А: kept once)
  const secs = [], seen = new Set();
  for (const b of map.buildings) {
    if (b.id !== REL && b.id !== REL_DUP && !ROW_W.includes(b.id) && !ROW_S.includes(b.id)) continue;
    const key = b.p.slice(0, 4).map((v) => Math.round(v)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const R = posRing(b), cz = R.reduce((s, p) => s + p[1], 0) / R.length;
    const chain = ROW_W.includes(b.id) ? 'w' : ROW_S.includes(b.id) ? 's' : cz < -215 ? 'n' : 'm';
    secs.push({ id: b.id === REL_DUP ? REL : b.id, R, chain, f: b.f || '' });
  }
  if (!secs.length) return null;
  const t0 = performance.now(), n0 = S.count ?? 0;
  const pod = map.buildings.find((b) => b.id === PODIUM), PR = pod ? posRing(pod) : null;
  const B = { brick: new MB(), det: new MB(), strip: new MB(), bay: new MB(), shop: new MB() };

  // one floor level per section, over its highest ground: the sections step down the slope, so where a taller one
  // stands against a lower neighbour its wall shows above the neighbour's parapet
  const CH = { w: { nf: 15, gf: 3.3 }, s: { nf: 15, gf: 3.6, shops: true }, n: { nf: 17, gf: 3.3 }, m: { nf: 15, gf: 3.3 } };
  for (const sec of secs) {
    const c = sec.c = { ...CH[sec.chain] }, hs = sec.R.map(([x, z]) => heightAt(x, z));
    c.lo = Math.min(...hs); c.yF = Math.max(...hs) + 0.15;
    c.y1 = c.yF + c.gf; c.yR = c.y1 + (c.nf - 1) * FH; c.yTop = c.yR + PARA;
  }
  // stretches of edge a -> b that another section's wall covers (collinear, within 40 cm): [s0, s1, its parapet top]
  const covered = (sec, F) => {
    const out = [];
    for (const o of secs) {
      if (o === sec) continue;
      o.R.forEach((p, k) => {
        const q = o.R[k + 1] || o.R[0];
        const ta = (p[0] - F.ax) * F.ux + (p[1] - F.az) * F.uz, tb = (q[0] - F.ax) * F.ux + (q[1] - F.az) * F.uz;
        const da = (p[0] - F.ax) * F.nx + (p[1] - F.az) * F.nz, db = (q[0] - F.ax) * F.nx + (q[1] - F.az) * F.nz;
        if (Math.abs(da) > 0.4 || Math.abs(db) > 0.4) return;
        const lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(F.L, Math.max(ta, tb));
        if (hi - lo > 0.2) out.push([lo, hi, o.c.yTop]);
      });
    }
    return out.sort((x, y) => x[0] - y[0]);
  };

  const footprints = [], keep = [];
  let nStack = 0, nLog = 0, nBalc = 0, nShop = 0, nDoor = 0;
  for (const sec of secs) {
    const { c, R } = sec, r = rng((sec.id + Math.round(R[0][0] * 7)) % 99991);
    const inside = (x, z) => inPoly(R, x, z), ob = obb(R);
    const gBase = Math.min(...R.map(([x, z]) => heightAt(x, z))) - 0.5;

    // ---- faces: every edge minus what a neighbour covers
    const faces = [];
    let su = 0;
    R.forEach((a, i) => {
      const b = R[(i + 1) % R.length], Fe = edgeFace(a, b, inside);
      let s = 0;
      const parts = [];
      for (const [c0, c1, top] of covered(sec, Fe)) {
        if (c0 - s > 0.25) parts.push([s, c0]);
        if (top < c.yTop - 0.05 && c1 - Math.max(s, c0) > 0.25) parts.push([Math.max(s, c0), c1, top]); // shows above the neighbour
        s = Math.max(s, c1);
      }
      if (Fe.L - s > 0.25) parts.push([s, Fe.L]);
      for (const [p0, p1, over] of parts) {
        const pa = at(Fe, p0, 0), pb = at(Fe, p1, 0), f = edgeFace([pa[0], pa[2]], [pb[0], pb[2]], inside);
        const mx = (pa[0] + pb[0]) / 2, mz = (pa[2] + pb[2]) / 2, ty = [YARD[0] - mx, YARD[1] - mz], td = Math.hypot(...ty);
        f.yard = (ty[0] * f.nx + ty[1] * f.nz) > 0.4 * td;
        f.end = f.L < 20 && Math.abs(f.nx * ob.ux + f.nz * ob.uz) > 0.8 && ob.L > ob.W * 1.3; // a short end of the section
        const po = at(f, f.L / 2, 0, 1.2);
        f.inPod = !!PR && inPoly(PR, po[0], po[2]);
        f.su = su + p0; f.splits = []; f.bands = []; f.over = over;
        faces.push(f);
      }
      su += Fe.L;
    });

    // ---- openings on the upper storeys: window columns and loggia stacks, ~3.3 m modules
    const yTopWin = c.yR;
    for (const f of faces) {
      const W = f.L;
      if (W < 2.2 || f.over) continue;
      const m = 0.7, U = W - 2 * m, mods = Math.max(1, Math.round(U / 3.3)), mw = U / mods, phase = (hash01(sec.id + Math.round(f.su * 10)) * 4) | 0;
      for (let j = 0; j < mods; j++) {
        const cx = m + mw * (j + 0.5);
        const loggia = mw > 2.4 && (f.end ? (mods % 2 === 1 && j === (mods - 1) / 2 && mods > 1) : (j + phase) % 4 === 1);
        const balc = !loggia && !f.end && mw > 2.6 && (j + phase) % 4 === 3;
        if (balc) { // a stack of recessed balconies behind brick parapets
          const hw = Math.min(1.2, mw / 2 - 0.4);
          f.holes.push({ kind: 'balc', s0: cx - hw, s1: cx + hw, y0: c.y1, y1: c.yR });
        } else if (loggia) {
          const hw = Math.min(1.35, mw / 2 - 0.35);
          f.holes.push({ kind: 'loggia', s0: cx - hw, s1: cx + hw, y0: c.y1, y1: c.yTop });
          f.bands.push([cx - hw - 0.7, cx + hw + 0.7]);
        } else {
          const hw = Math.min(r() < 0.3 ? 0.95 : 0.72, mw / 2 - 0.3); // a share of broad three-light windows
          if (hw < 0.35) continue;
          const rail = r() < 0.35;
          f.holes.push({ kind: 'win', s0: cx - hw, s1: cx + hw, y0: c.y1, y1: yTopWin, rail });
        }
      }
      for (const [a, b] of f.bands) f.splits.push(Math.max(0, a), Math.min(W, b));
    }
    // ---- ground storey: shops on the street sides of the Байди row, the entrance on the longest yard face,
    // windows under the window columns elsewhere; nothing inside the podium
    const entry = faces.filter((f) => f.yard && !f.inPod && f.L >= 4).sort((p, q) => q.L - p.L)[0];
    for (const f of faces) {
      const W = f.L;
      if (W < 2.4 || f.inPod || f.over) continue;
      if (c.shops && !f.yard) {
        f.shop = true;
        const k = Math.max(1, Math.round((W - 1) / 3.4)), w = (W - 1 - (k - 1) * 0.5) / k;
        if (w >= 1) for (let j = 0; j < k; j++) f.holes.push({ kind: 'shop', s0: 0.5 + j * (w + 0.5), s1: 0.5 + j * (w + 0.5) + w, y0: c.yF + 0.05, y1: c.y1 - 0.85 });
        continue;
      }
      const door = f === entry ? [W / 2 - 1, W / 2 + 1] : null;
      if (door) f.holes.push({ kind: 'door', s0: door[0], s1: door[1], y0: c.yF, y1: c.yF + 2.5 });
      for (const h of f.holes.filter((q) => q.kind === 'win')) {
        if (door && h.s1 > door[0] - 0.4 && h.s0 < door[1] + 0.4) continue;
        f.holes.push({ kind: 'gwin', s0: h.s0, s1: h.s1, y0: c.yF + 0.95, y1: c.yF + 2.45 });
      }
    }

    // ---- walls and openings
    for (const f of faces) {
      const W = f.L, inBand = (s) => f.bands.some(([a, b]) => s > a && s < b);
      const tint = (s, y) => (y < c.y1 && !f.over ? PLINTH : f.end || f.over || inBand(s) ? TAUPE : SAND);
      const y0 = f.over ?? (f.inPod ? c.y1 : c.yF);
      wall(B.brick, f, y0, c.yTop, c.y1, tint);
      if (!f.inPod && !f.over) { B.det.setColor('#7d7a75'); fbox(B.det, f, 0, W, gBase, c.yF, -0.05, 0.03, 1); }
      for (const q of f.holes) {
        const w = q.s1 - q.s0, mid = (q.s0 + q.s1) / 2;
        if (q.kind === 'win' || q.kind === 'gwin') {
          const taupe = f.end || inBand(mid), col = (taupe ? 2 : 0) + (q.rail && q.kind === 'win' ? 1 : 0);
          reveals(B.det, f, q, 0.16, taupe ? REV_T : REV_S);
          const u0 = (col + 0.02) / WIN_U, u1 = (col + 0.98) / WIN_U;
          if (q.kind === 'win') {
            const k0 = (r() * TEX_N) | 0, n = (q.y1 - q.y0) / FH;
            pane(B.strip, f, q.s0, q.s1, q.y0, q.y1, -0.15, uvq(u0, u1, k0 / TEX_N, (k0 + n) / TEX_N));
            nStack++;
          } else { // one storey: the window part of a texture storey, stretched over the opening
            const k0 = (r() * TEX_N) | 0;
            pane(B.strip, f, q.s0, q.s1, q.y0, q.y1, -0.15, uvq(u0, u1, (k0 + 0.283) / TEX_N, (k0 + 0.783) / TEX_N));
          }
        } else if (q.kind === 'loggia') {
          // dark glazing standing a little proud of the brick, framed by graphite fins and capped at the parapet
          const k0 = (r() * TEX_N) | 0, n = (c.yR - q.y0) / FH, bays = Math.max(1, Math.round(w / 1.2));
          pane(B.bay, f, q.s0, q.s1, q.y0, c.yR, 0.06, uvq(0, bays, k0 / TEX_N, (k0 + n) / TEX_N));
          B.det.setColor(DARK);
          fbox(B.det, f, q.s0, q.s1, c.yR, q.y1, -0.05, 0.08, 1 | 16);
          for (const s of [q.s0, q.s1]) fbox(B.det, f, s - 0.06, s + 0.06, q.y0, q.y1, -0.05, 0.12, 1 | 4 | 8);
          fbox(B.det, f, q.s0 - 0.06, q.s1 + 0.06, q.y1, q.y1 + 0.1, -0.3, 0.12, 1 | 16 | 32);
          B.det.setColor('#8a8580'); fbox(B.det, f, q.s0, q.s1, q.y0 - 0.15, q.y0, -0.05, 0.14, 1 | 4 | 8 | 16);
          nLog++;
        } else if (q.kind === 'balc') {
          // 1.2 m deep: buff side walls, the taupe back wall with a balcony door and window per storey, a brick
          // parapet and the slab edge at every floor
          const D = 1.2, k0 = (r() * TEX_N) | 0, n = (q.y1 - q.y0) / FH;
          reveals(B.det, f, q, D, REV_S);
          pane(B.strip, f, q.s0, q.s1, q.y0, q.y1, -D, uvq(2.02 / WIN_U, 2.98 / WIN_U, k0 / TEX_N, (k0 + n) / TEX_N));
          for (let k = 0; k < c.nf - 1; k++) {
            const y = q.y0 + k * FH;
            B.brick.setColor(SAND); fbox(B.brick, f, q.s0, q.s1, y, y + 1.05, -0.14, 0, 1 | 16, [BRICK_U, BRICK_V]);
            if (k) { B.det.setColor('#8a8580'); fbox(B.det, f, q.s0, q.s1, y - 0.18, y, -D, 0, 32); }
          }
          nBalc++;
        } else if (q.kind === 'shop') {
          reveals(B.det, f, q, 0.2, FASCIA);
          pane(B.shop, f, q.s0, q.s1, q.y0, q.y1, -0.18, uvq(0, Math.max(1, Math.round(w / 1.6)), 0, 1));
          nShop++;
        } else if (q.kind === 'door') {
          reveals(B.det, f, q, 0.3, '#8e8a84');
          pane(B.shop, f, q.s0, q.s1, q.y0, q.y1, -0.28, uvq(0, 2, 0, 1));
          // canopy on the wall, a step to the ground
          B.det.setColor(DARK); fbox(B.det, f, q.s0 - 0.8, q.s1 + 0.8, q.y1 + 0.3, q.y1 + 0.48, 0, 1.6, 1 | 4 | 8 | 16 | 32);
          fsolid(S, f, q.s0 - 0.8, q.s1 + 0.8, 0, 1.6, q.y1 + 0.3, q.y1 + 0.48, 'awning', 1);
          const p = at(f, mid, 0, 1.2), gd = heightAt(p[0], p[2]);
          B.det.setColor('#9d978d'); fbox(B.det, f, q.s0 - 0.5, q.s1 + 0.5, Math.min(gd, c.yF) - 0.4, c.yF, 0, 1.5, 1 | 4 | 8 | 16);
          nDoor++;
        }
      }
      if (f.shop) { // dark fascia over the shopfronts
        B.det.setColor(FASCIA); fbox(B.det, f, 0, W, c.y1 - 0.85, c.y1 - 0.05, 0, 0.25, 1 | 4 | 8 | 16 | 32);
      }
      // parapet inner face and coping; the roof edge anchor
      B.det.setColor('#b9ad9c'); quad(B.det, at(f, 0, c.yR, -0.3), at(f, W, c.yR, -0.3), at(f, W, c.yTop, -0.3), at(f, 0, c.yTop, -0.3), neg(f.N));
      B.det.setColor(COPING); fbox(B.det, f, -0.02, W + 0.02, c.yTop, c.yTop + 0.08, -0.32, 0.05, 1 | 16 | 32);
      if (W >= 3) { const a0 = at(f, 0, 0, -0.12), a1 = at(f, W, 0, -0.12); Z?.edge?.(a0[0], a0[2], a1[0], a1[2], c.yTop, f.nx, f.nz); }
    }

    // ---- roof: lift room and stair exit, a mast
    B.det.setColor(ROOF); B.det.fill(R, [], c.yR, true);
    for (const [du, w, d, h] of [[-0.18, 3.4, 5, 3.2], [0.2, 2.6, 3, 2.6]]) {
      const x = ob.cx + ob.ux * du * ob.L, z = ob.cz + ob.uz * du * ob.L;
      if (!inPoly(R, x, z)) continue;
      const f = edgeFace([x - ob.ux * w / 2 - ob.uz * d / 2, z - ob.uz * w / 2 + ob.ux * d / 2], [x + ob.ux * w / 2 - ob.uz * d / 2, z + ob.uz * w / 2 + ob.ux * d / 2], () => false);
      // the frame's o runs to whichever side; the box spans o in [-d, 0] or [0, d] by the side x, z lies on
      const sgn = (x - f.ax) * f.nx + (z - f.az) * f.nz > 0 ? 1 : -1, o0 = sgn > 0 ? 0 : -d, o1 = sgn > 0 ? d : 0;
      B.brick.setColor(TAUPE); fbox(B.brick, f, 0, w, c.yR, c.yR + h, o0, o1, 1 | 2 | 4 | 8, [BRICK_U, BRICK_V]);
      B.det.setColor(COPING); fbox(B.det, f, -0.05, w + 0.05, c.yR + h, c.yR + h + 0.1, o0 - 0.05, o1 + 0.05, 63);
      fsolid(S, f, 0, w, o0, o1, c.yR, c.yR + h + 0.1, 'bulkhead');
    }
    B.det.setColor('#6d7174'); B.det.cyl(ob.cx + ob.uz * 3, c.yR, ob.cz - ob.ux * 3, 0.04, 0.03, 3, 5);

    // ---- collision and footprint
    for (const P of convexParts(R)) S.prism(P.flat(), gBase, c.yTop, 0, 0, 'wall');
    footprints.push({ poly: R.map((p) => [p[0], p[1]]), h: c.yTop - c.lo, kind: 'apt', name: 'ЖК «Графський», ' + NAMES[sec.id] });
    keep.push(keepOut(R, 3));
  }

  // ---- the one-storey shop podium round the corner section (No 68): glass under a dark fascia, a flat roof
  if (PR) {
    const corner = secs.find((s) => s.id === ROW_S[0]), c = corner ? corner.c : secs[0].c, yP = c.y1, inside = (x, z) => inPoly(PR, x, z);
    const tower = corner ? (x, z) => inPoly(corner.R, x, z) : () => false;
    const gL = Math.min(...PR.map(([x, z]) => heightAt(x, z))) - 0.5;
    let su = 0;
    PR.forEach((a, i) => {
      const b = PR[(i + 1) % PR.length], Fe = edgeFace(a, b, inside);
      // the stretches the tower does not stand on
      const n = Math.max(1, Math.round(Fe.L / 0.25)), spans = [];
      let st = null;
      for (let k = 0; k <= n; k++) {
        const s = Fe.L * k / n, p = at(Fe, Math.min(Fe.L - 0.05, Math.max(0.05, s)), 0, -0.3), free = !tower(p[0], p[2]);
        if (free && st === null) st = s;
        if ((!free || k === n) && st !== null) { if (s - st > 0.3) spans.push([st, s]); st = null; }
      }
      for (const [p0, p1] of spans) {
        const pa = at(Fe, p0, 0), pb = at(Fe, p1, 0), f = edgeFace([pa[0], pa[2]], [pb[0], pb[2]], inside), W = f.L;
        f.holes = []; f.splits = []; f.su = su + p0;
        const k = Math.max(1, Math.round((W - 0.8) / 3.2)), w = (W - 0.8 - (k - 1) * 0.4) / k;
        if (W > 2 && w > 0.8) for (let j = 0; j < k; j++) f.holes.push({ s0: 0.4 + j * (w + 0.4), s1: 0.4 + j * (w + 0.4) + w, y0: c.yF + 0.05, y1: yP - 1.1 });
        wall(B.brick, f, c.yF, yP + 0.5, yP + 10, () => PLINTH);
        B.det.setColor('#7d7a75'); fbox(B.det, f, 0, W, gL, c.yF, -0.05, 0.03, 1);
        for (const q of f.holes) {
          reveals(B.det, f, q, 0.2, FASCIA);
          pane(B.shop, f, q.s0, q.s1, q.y0, q.y1, -0.18, uvq(0, Math.max(1, Math.round((q.s1 - q.s0) / 1.6)), 0, 1));
          nShop++;
        }
        B.det.setColor(FASCIA); fbox(B.det, f, 0, W, yP - 1.1, yP + 0.7, 0, 0.45, 1 | 4 | 8 | 16 | 32);
        B.det.setColor('#9a958d'); quad(B.det, at(f, 0, yP, -0.25), at(f, W, yP, -0.25), at(f, W, yP + 0.5, -0.25), at(f, 0, yP + 0.5, -0.25), neg(f.N));
      }
      su += Fe.L;
    });
    B.det.setColor(ROOF); B.det.fill(PR, [], yP, true);
    for (const P of convexParts(PR)) S.prism(P.flat(), gL, yP + 0.5, 0, 0, 'wall');
    footprints.push({ poly: PR.map((p) => [p[0], p[1]]), h: yP + 0.5 - c.lo, kind: 'shop', name: 'ЖК «Графський», ' + NAMES[PODIUM] });
    keep.push(keepOut(PR, 2));
  }

  // ---- meshes
  const tr = rng(6833), warm = 0xffd49a;
  const strip = stripTex(false, rng(71)), stripM = stripTex(true, rng(71)), bay = bayTex(false, rng(29)), bayM = bayTex(true, rng(29));
  const glass = (map, emissiveMap, extra = {}) => new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: warm, emissiveIntensity: 0, roughness: 0.2, metalness: 0.25, envMapIntensity: 1.2, ...extra });
  const M = {
    brick: new THREE.MeshStandardMaterial({ map: brickTex(tr), vertexColors: true, roughness: 0.9 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    strip: glass(strip, stripM, { roughness: 0.6, metalness: 0, envMapIntensity: 0.8 }), // the spandrels must read as the brick round them
    bay: glass(bay, bayM, { roughness: 0.1, metalness: 0.4, envMapIntensity: 1.4 }),
    shop: glass(shopTex(false), shopTex(true), { roughness: 0.12, metalness: 0.3 }),
  };
  const st = finish(root, 'hrafskyi', B, M, ['brick', 'det', 'strip', 'bay']);
  console.log(`[cherkasy] ZhK Hrafskyi: ${secs.length} sections + podium, ${nStack} window columns, ${nLog} loggia stacks, ${nBalc} balcony stacks, ${nShop} shopfronts, ${nDoor} entrances, ${(st.verts / 1000).toFixed(1)}k verts in ${st.meshes} meshes, ${(S.count ?? 0) - n0} solids, ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    footprints,
    clear: (x, z) => keep.some((k) => near(k, x, z)),
    update() { const k = nightK.value; M.strip.emissiveIntensity = 1.4 * k; M.bay.emissiveIntensity = 1.2 * k; M.shop.emissiveIntensity = 1.6 * k; },
  };
}
