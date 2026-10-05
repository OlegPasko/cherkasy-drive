// OWNER: cherkasy. Small kit for long walls painted from a bay atlas (the old refinery, school №15, the brewery): one
// quad per face and band carries a canvas of cols bays x rows storeys, so a hundred windows cost four vertices; the
// lit windows come from a matching emissive mask. Plus a local rectangle frame and gable / hipped / flat roofs over
// four corners. Not a site module: the site files import it.
//   frame(o, angDeg) -> P(u, v) -> [x, z]      map point of a local (u, v), u along angDeg, v 90 degrees on
//   bayAtlas({ cols, rows, cw, ch, r, lit, cell }) -> { tex, mask }   cell(g, x, y, w, h, i, j) paints one bay x storey
//                                   cell (y down) and returns its window rects [[x, y, w, h], ...] (px, in the cell);
//                                   a share `lit` of them is white in the mask
//   band(D, f, A, y0, y1, o?) -> void          a whole-face quad (s 0..L) over y0..y1 with uv on the atlas A = { bay,
//                                   fh, cols, rows, base }: bays fitted to the face (L / round(L / bay)), storeys from
//                                   y = base; read left to right from outside
//   blockBase(A, r0, nk, base) -> base'        the `base` for a kind kept in rows r0 .. r0 + nk - 1 of a shared atlas
//   gable(R, W, c4, y, rise, col, wallCol, over?) -> top   c4 = 4 corners [x, z] in order round the rectangle, the ridge
//                                   along c4[0] -> c4[1]; R gets the two slopes, W the two gable triangles; returns the ridge y
//   hip(R, c4, y, rise, over?) -> top          hipped roof over the rectangle (the ridge along the longer side)
//   flat(R, c4 | ring, y)                      a flat deck (any ring of [x, z])
//   brickTex(r) / sheetTex() -> texture        1 m repeats: pale running-bond brick, corrugated sheet; the vertex colour tints
//   brickRows(g, x, y, w, h, col, r)           paints courses of brick over a canvas rectangle (atlas cells)
import { at, quad } from './slabkit.js';
import { canvasTex } from './sculpt.js';
import { area2 } from './geo.js';

export function frame(o, angDeg) {
  const a = (angDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (u, v) => [o[0] + u * c - v * s, o[1] + u * s + v * c];
}

export function bayAtlas({ cols, rows, cw, ch, r, lit = 0, cell }) {
  const wins = [];
  const tex = canvasTex(cols * cw, rows * ch, (g) => {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const W = cell(g, i * cw, j * ch, cw, ch, i, j) || [];
      for (const [x, y, w, h] of W) wins.push([i * cw + x, j * ch + y, w, h]);
    }
  });
  const mask = canvasTex(cols * cw, rows * ch, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, cols * cw, rows * ch);
    g.fillStyle = '#fff';
    for (const [x, y, w, h] of wins) if (r() < lit) g.fillRect(x + 2, y + 2, w - 4, h - 4);
  });
  return { tex, mask };
}

// several building kinds in one atlas, each a block of nk rows from canvas row r0 (top down; the canvas is drawn top
// down and read v up): the storey origin that makes the ground storey read row r0 + nk - 1
export const blockBase = (A, r0, nk, base) => base - (A.rows - r0 - nk) * A.fh;

export function band(D, f, A, y0, y1, o = 0) {
  const n = Math.max(1, Math.round(f.L / A.bay)), U = (f.L / n) * A.cols, V = A.fh * A.rows;
  const flip = f.ux * f.nz - f.uz * f.nx < 0, u = (s) => (flip ? -s : s) / U, v = (y) => (y - A.base) / V;
  quad(D, at(f, 0, y0, o), at(f, f.L, y0, o), at(f, f.L, y1, o), at(f, 0, y1, o), f.N,
    [[u(0), v(y0)], [u(f.L), v(y0)], [u(f.L), v(y1)], [u(0), v(y1)]]);
}

const P3 = (p, y) => [p[0], y, p[1]];
// the outward-facing normal of a triangle (away from the point m)
function tri(D, a, b, c, m) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * (a[0] - m[0]) + n[1] * (a[1] - m[1]) + n[2] * (a[2] - m[2]) < 0) n = n.map((q) => -q);
  const l = Math.hypot(...n) || 1;
  D.face([a, b, c], n.map((q) => q / l));
}
const grow = (c4, over) => {
  const cx = (c4[0][0] + c4[2][0]) / 2, cz = (c4[0][1] + c4[2][1]) / 2;
  return c4.map(([x, z]) => { const d = Math.hypot(x - cx, z - cz) || 1; return [x + ((x - cx) / d) * over * 1.41, z + ((z - cz) / d) * over * 1.41]; });
};

export function gable(R, W, c4, y, rise, col, wallCol, over = 0.4) {
  const [a, b, c, d] = c4, m = [(a[0] + c[0]) / 2, y - 5, (a[1] + c[1]) / 2];
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  // ridge from the middle of d-a to the middle of b-c (c4[0] -> c4[1] runs along it)
  const r0 = mid(d, a), r1 = mid(b, c), top = y + rise;
  W.setColor(wallCol);
  tri(W, P3(a, y), P3(d, y), P3(r0, top), m);
  tri(W, P3(b, y), P3(c, y), P3(r1, top), m);
  // the slopes overhang the walls by `over` all round; the eaves drop with the pitch
  const [A, B, C, Dd] = grow(c4, over), q0 = mid(Dd, A), q1 = mid(B, C);
  const half = Math.hypot(a[0] - d[0], a[1] - d[1]) / 2, ye = y - over * (rise / Math.max(0.5, half));
  const k = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), hs = Math.hypot(half + over, rise);
  R.setColor(col);
  quadUp(R, P3(A, ye), P3(B, ye), [q1[0], top, q1[1]], [q0[0], top, q0[1]], [[0, 0], [k, 0], [k, hs], [0, hs]]);
  quadUp(R, P3(C, ye), P3(Dd, ye), [q0[0], top, q0[1]], [q1[0], top, q1[1]], [[0, 0], [k, 0], [k, hs], [0, hs]]);
  return top;
}
// a roof quad with its normal pointing up
function quadUp(D, a, b, c, d, uv) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[1] < 0) n = n.map((q) => -q);
  const l = Math.hypot(...n) || 1;
  quad(D, a, b, c, d, n.map((q) => q / l), uv);
}

export function hip(R, c4, y, rise, over = 0.4) {
  const g = grow(c4, over), [a, b, c, d] = g;
  const lab = Math.hypot(b[0] - a[0], b[1] - a[1]), lbc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const [p0, p1, p2, p3] = lab >= lbc ? [a, b, c, d] : [b, c, d, a];
  const L = Math.max(lab, lbc), Wd = Math.min(lab, lbc), inset = Math.min(Wd / 2, L / 2);
  const ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L, cx = (a[0] + c[0]) / 2, cz = (a[1] + c[1]) / 2;
  const top = y + rise, r0 = [cx - ux * (L / 2 - inset), top, cz - uz * (L / 2 - inset)], r1 = [cx + ux * (L / 2 - inset), top, cz + uz * (L / 2 - inset)];
  const m = [cx, y - 5, cz], ye = y - 0.15;
  tri(R, P3(p0, ye), P3(p1, ye), r1, m); tri(R, P3(p0, ye), r1, r0, m);
  tri(R, P3(p2, ye), P3(p3, ye), r0, m); tri(R, P3(p2, ye), r0, r1, m);
  tri(R, P3(p1, ye), P3(p2, ye), r1, m); tri(R, P3(p3, ye), P3(p0, ye), r0, m);
  return top;
}

export function flat(R, ring, y) {
  R.fill(area2(ring) < 0 ? [...ring].reverse() : ring, [], y, true);
}

export const brickTex = (r) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, w, h);
  const bw = w / 4, bh = h / 13;
  for (let j = 0; j < 13; j++) for (let i = 0; i < 5; i++) {
    const v = 222 + r() * 33, x = i * bw - (j & 1 ? bw / 2 : 0);
    g.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 10) | 0})`; g.fillRect(x + 1.5, j * bh + 1.5, bw - 3, bh - 3);
  }
});
export const sheetTex = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5; i++) {
    const gr = g.createLinearGradient(i * 12.8, 0, (i + 1) * 12.8, 0);
    gr.addColorStop(0, '#f6f6f6'); gr.addColorStop(0.5, '#c4c4c4'); gr.addColorStop(1, '#f2f2f2');
    g.fillStyle = gr; g.fillRect(i * 12.8, 0, 12.8, h);
  }
});
export function brickRows(g, x, y, w, h, col, r) {
  g.fillStyle = col; g.fillRect(x, y, w, h);
  for (let yy = y; yy < y + h; yy += 3) { g.fillStyle = `rgba(40,20,10,${0.05 + r() * 0.06})`; g.fillRect(x, yy, w, 1); }
  for (let k = 0; k < (w * h) / 60; k++) { g.fillStyle = r() < 0.5 ? 'rgba(255,230,210,0.10)' : 'rgba(30,15,10,0.10)'; g.fillRect(x + r() * w, y + r() * h, 2 + r() * 3, 1 + r()); }
}
