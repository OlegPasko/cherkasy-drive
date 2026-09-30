// Procedural low-poly tree geometry for world/trees.js. Every species variant is generated once (seeded, so the city
// looks the same on every load) at two detail levels that share one layout, plus two tiny far shapes shared by all.
//   buildTreeGeometries() -> { variants: { [name]: { near, mid, far: 'round' | 'cone', fit: { hx, hz, top, cb },
//                              trunk: { r, h }, bark: [r, g, b] } }, far: { round, cone } }
// Vertex attributes (non-indexed triangle soup):
//   position, normal
//   color  bark: linear albedo; foliage: grey shade multiplier (the per-tree crown tints are applied in the shader)
//   aLeaf  x: 1 foliage / 0 bark, y: mix factor tint A -> tint B, z: wind sway weight
// Far shapes live in a unit box (crown half-width 1, trunk + crown heights both 0..1); the tree shader stretches the
// crown over [cb, 1] of the tree height with a per-instance cb, so one far mesh fits every broadleaf / conifer.
import { IcosahedronGeometry } from 'three';
import { meshData, rng32, hashF } from './util.js';

// vertex streams of a triangle soup, in attribute order
const STREAMS = ['position', 'normal', 'color', 'aLeaf'];
class Soup {
  constructor() { this.buf = STREAMS.map(() => []); }
  v(...vecs) { vecs.forEach((q, k) => this.buf[k].push(q[0], q[1], q[2])); }
  geometry() {
    const geo = meshData(Object.fromEntries(STREAMS.map((name, k) => [name, [this.buf[k], 3]])));
    geo.computeBoundingSphere();
    return geo;
  }
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const len = Math.hypot(...a) || 1; return a.map(v => v / len); };
const mixv = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const wsum = (pairs) => norm([0, 1, 2].map(i => pairs.reduce((acc, [vec, w]) => acc + vec[i] * w, 0)));
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// a tapered bark tube through pts (radius rs[i]); colFn(i, k) -> rgb, swayFn(p) -> weight
function tube(S, pts, rs, sides, colFn, swayFn) {
  let ref = [1, 0, 0];
  const last = pts.length - 1;
  const rings = pts.map((c, i) => {
    const axis = norm(sub(pts[Math.min(i + 1, last)], pts[Math.max(i - 1, 0)]));
    if (Math.abs(axis[0]) > 0.9) ref = [0, 0, 1];
    const u = norm(cross(axis, ref)), w = cross(axis, u);
    return Array.from({ length: sides }, (_, k) => {
      const ang = (k / sides) * Math.PI * 2, dir = mixv([0, 0, 0], u, Math.cos(ang)).map((v, j) => v + w[j] * Math.sin(ang));
      // grooves: every other vertex a touch inside -> bark does not read as a smooth pipe
      const rad = rs[i] * (k % 2 ? 0.88 : 1.04);
      return { p: c.map((v, j) => v + dir[j] * rad), n: dir, c: colFn(i, k) };
    });
  });
  rings.slice(1).forEach((top, i) => {
    const bot = rings[i];
    for (let k = 0; k < sides; ++k) {
      const k1 = (k + 1) % sides;
      for (const q of [bot[k], bot[k1], top[k1], bot[k], top[k1], top[k]]) S.v(q.p, q.n, q.c, [0, 0, swayFn(q.p)]);
    }
  });
}

// a jagged foliage cluster; ctx: { c: crown centre, y0, y1 (crown extent) }. The displacement is a hash of the unit
// direction, so the duplicated corners of the non-indexed icosahedron stay welded.
function blob(S, ctr, rad, detail, jag, r, ctx, tone = 1) {
  const ico = new IcosahedronGeometry(1, detail).attributes.position;
  const salt = r() * 10, mixT = r(), jit = (r() - 0.5) * 0.14;
  const corner = (i) => {
    const dir = [ico.getX(i), ico.getY(i), ico.getZ(i)], f = 1 + jag * (hashF(dir[0] + salt, dir[1], dir[2]) - 0.5) * 2;
    return { dir, p: dir.map((v, j) => ctr[j] + v * rad[j] * f) };
  };
  const span = ctx.y1 - ctx.y0 || 1;
  for (let i = 0; i < ico.count; i += 3) {
    const tri = [corner(i), corner(i + 1), corner(i + 2)];
    const fn = norm(cross(sub(tri[1].p, tri[0].p), sub(tri[2].p, tri[0].p)));
    for (const { dir, p } of tri) {
      const crown = norm(sub(p, ctx.c)), hy = sat((p[1] - ctx.y0) / span);
      const shade = (0.62 + 0.3 * hy + 0.14 * dot3(dir, crown) + jit) * (fn[1] < -0.35 ? 0.8 : 1) * tone;
      const mixAB = sat(0.2 + 0.45 * hy + 0.35 * (mixT - 0.5) + 0.2 * fn[1]);
      S.v(p, wsum([[crown, 0.45], [dir, 0.3], [fn, 0.25]]), [shade, shade, shade], [1, mixAB, 0.55 + 0.45 * hy]);
    }
  }
}

// crown envelope: radius factor (0..1) at normalised crown height t
const ENVELOPE = {
  ovoid: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.03)), 0.75),
  round: (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)),
  spread: (t) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.12))), 0.5) * (t > 0.75 ? 1 - (t - 0.75) * 1.4 : 1),
  vase: (t) => Math.min(1, 0.35 + t * 1.1) * (t > 0.8 ? 1 - (t - 0.8) * 3 : 1),
  column: (t) => (t < 0.12 ? 0.5 + t * 4 : t > 0.8 ? 1 - (t - 0.8) * 4 : 1),
  umbrella: (t) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.4),
};

// broadleaf (and Scots pine / poplar) recipe
function broadleaf(R, lod) {
  const r = rng32(R.seed), S = new Soup(), near = lod === 'near';
  const H = R.H, cy0 = R.clear, cy1 = H, W = R.W / 2, env = ENVELOPE[R.shape];
  const ctx = { c: [0, (cy0 + cy1) / 2, 0], y0: cy0, y1: cy1 };
  // bark per ring i / side k: noisy, grooved; birch gets black lenticels and a dark foot, pine an orange upper trunk
  const barkCol = (hy) => (i, k) => {
    const nz = hashF(i, k, R.seed) - 0.5, h = hy(i);
    if (R.birch && (hashF(i, k * 0.1, 7) > 0.7 || h < 0.12)) return [0.05, 0.045, 0.04];
    const base = R.upperBark && h > 0.45 ? R.upperBark : R.bark;
    return base.map(v => v * (1 + nz * 0.3) * (k % 2 ? 0.8 : 1));
  };
  const sway = (p) => Math.pow(Math.max(0, p[1]) / H, 2) * 0.5 + Math.hypot(p[0], p[2]) / W * 0.25;
  // trunk: slight bend, root flare, sunk 0.4 m so slopes never show a floating base
  const tTop = cy0 + (cy1 - cy0) * (R.trunkReach ?? 0.3), lean = [(r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08];
  const nSeg = near ? 5 : 3, fr = Array.from({ length: nSeg + 1 }, (_, i) => i / nSeg);
  const tp = fr.map(f => { const yy = -0.4 + (tTop + 0.4) * f; return [lean[0] * yy + Math.sin(f * 3 + R.seed) * 0.06, yy, lean[2] * yy]; });
  const tr = fr.map((f, i) => R.trunkR * (i ? 1 - 0.45 * f : 1.35));
  tube(S, tp, tr, near ? 7 : 5, barkCol((i) => tp[i][1] / H), sway);
  // limbs from the trunk top region out toward the crown envelope; their tips seed the foliage clusters
  const tips = [], twig = new Set();
  const nL = R.limbs;
  for (let li = 0; li < nL; li += 1) {
    const az = (li / nL) * Math.PI * 2 + (r() - 0.5) * 0.9;
    const y0 = cy0 + (tTop - cy0) * (0.15 + r() * 0.85);
    const ht = Math.min(0.92, (y0 - cy0) / (cy1 - cy0) + R.rise * (0.6 + r() * 0.6));
    const rr = W * env(ht) * (0.55 + r() * 0.3);
    const base = [tp[nSeg][0] * y0 / tTop, y0, tp[nSeg][2] * y0 / tTop], tip = [Math.cos(az) * rr, cy0 + ht * (cy1 - cy0), Math.sin(az) * rr];
    const mid = mixv(base, tip, 0.5); mid[1] += (tip[1] - base[1]) * 0.12 - rr * 0.05;
    const lr = R.trunkR * 0.5;
    if (near || li % 2 === 0) tube(S, [base, mid, tip], [lr, lr * 0.6, lr * 0.25], near ? 5 : 3, barkCol(() => y0 / H), sway);
    tips.push(tip);
    if (near) for (const side of [-1, 1]) { // twigs
      const a2 = az + side * 0.7 + (r() - 0.5) * 0.4, t2 = Math.min(0.97, ht + 0.1 + r() * 0.2), r2 = W * env(t2) * (0.75 + r() * 0.2);
      const tw = [Math.cos(a2) * r2, cy0 + t2 * (cy1 - cy0), Math.sin(a2) * r2];
      tube(S, [mid, mixv(mid, tw, 0.5), tw], [lr * 0.45, lr * 0.3, lr * 0.12], 3, barkCol(() => 0.5), sway);
      tips.push(tw); twig.add(tw);
    }
  }
  // clusters: limb/twig tips + fillers on the envelope + one on top; mid LOD keeps the bigger ones, a little fatter
  const cl = [];
  for (const t of tips) cl.push({ c: t, k: 0.9 + r() * 0.3, tw: twig.has(t) });
  for (let left = R.fill; left > 0; left -= 1) { const t = 0.25 + r() * 0.7, az = r() * Math.PI * 2, rr = W * env(t) * (0.4 + r() * 0.45); cl.push({ c: [Math.cos(az) * rr, cy0 + t * (cy1 - cy0), Math.sin(az) * rr], k: 0.8 + r() * 0.3 }); }
  cl.push({ c: [(r() - 0.5) * W * 0.3, cy1 - (cy1 - cy0) * R.cr * 0.8, (r() - 0.5) * W * 0.3], k: 1.0 });
  const base = R.cr * Math.min(cy1 - cy0, R.W);
  const keep = near ? cl : cl.filter(q => !q.tw); // mid: the twig clusters go, the rest grow to cover them
  for (const q of keep) {
    const s = base * q.k * (near ? 1 : 1.28), wf = R.flat ?? 0.8;
    // never poke under the clear trunk height (cars drive under the crowns)
    const c = [q.c[0], Math.max(q.c[1], cy0 + s * wf * 0.7), q.c[2]];
    blob(S, c, [s, s * wf, s], near ? 1 : 0, R.jag, r, ctx, 1);
  }
  return S.geometry();
}

// spruce: stacked jagged cone tiers on a tapering trunk, with a leader on top
function spruce(R, lod) {
  const r = rng32(R.seed), S = new Soup(), near = lod === 'near';
  const H = R.H, W = R.W / 2, y0 = R.clear, n = R.tiers - (near ? 0 : 2), sides = near ? 11 : 7;
  const ctx = { c: [0, (y0 + H) / 2, 0], y0, y1: H };
  tube(S, [[0, -0.4, 0], [0, H * 0.5, 0], [0, H * 0.97, 0]], [R.trunkR * 1.3, R.trunkR * 0.6, R.trunkR * 0.12], near ? 6 : 4, (i, k) => R.bark.map(v => v * (k % 2 ? 0.8 : 1)), () => 0);
  const span = (H - y0) / n;
  const hy = (yy) => sat((yy - y0) / (H - y0));
  for (let tier = 0; tier < n; tier += 1) {
    const f = tier / n, yb = y0 + tier * span * 0.95, rad = W * Math.pow(1 - f, 0.85) * (0.9 + r() * 0.2), top = yb + span * (1.7 - f * 0.4);
    // star-shaped rim: alternate branch tips and notches, drooping a little
    const rim = Array.from({ length: sides }, (_, k) => {
      const ang = (k / sides) * Math.PI * 2 + tier * 0.7, rk = rad * (k % 2 ? 0.72 : 1) * (0.88 + r() * 0.24);
      return [Math.cos(ang) * rk, yb - span * 0.18 * (k % 2 ? 0.3 : 1) * r(), Math.sin(ang) * rk];
    });
    const apex = [(r() - 0.5) * 0.1, top, (r() - 0.5) * 0.1], under = [0, yb + span * 0.3, 0];
    rim.forEach((a, k) => {
      const b = rim[(k + 1) % sides];
      const fn = norm(cross(sub(b, apex), sub(a, apex)));
      for (const [p, rimV] of [[apex, 0], [b, 1], [a, 1]]) {
        const out = norm([p[0], 0.55, p[2]]), nn = norm(mixv(fn, out, 0.55)), sh = (rimV ? 0.95 : 0.62) + 0.18 * hy(p[1]);
        S.v(p, nn, [sh, sh, sh], [1, Math.min(1, 0.2 + 0.6 * hy(p[1]) + (rimV ? 0.2 : 0)), rimV ? 0.35 + 0.4 * hy(p[1]) : 0.1]);
      }
      for (const p of [a, b, under]) { const sh = 0.45 + 0.1 * hy(p[1]); S.v(p, norm([p[0] * 0.3, -1, p[2] * 0.3]), [sh, sh, sh], [1, 0.1, 0.2]); }
    });
  }
  blob(S, [0, H + 0.1, 0], [0.12, 0.6, 0.12], 0, 0.1, r, ctx, 1.05); // leader
  return S.geometry();
}

// hedge block: unit box x [-0.5, 0.5], y [0, 1], z [-0.5, 0.5] of lumpy clusters (the item scale3 is its size)
function hedge(R, lod) {
  const r = rng32(R.seed), S = new Soup(), n = lod === 'near' ? 4 : 2;
  const box = { c: [0, 0.4, 0], y0: 0, y1: 1 };
  Array.from({ length: n }, (_, i) => (i + 0.5) / n - 0.5).forEach(cx => blob(S, [cx, 0.5, 0], [0.62 / n + 0.08, 0.55, 0.56], lod === 'near' ? 1 : 0, 0.25, r, box));
  return S.geometry();
}

// far shapes (see header): round crown + stick trunk, and a two-tier cone
function farRound() {
  const S = new Soup();
  tube(S, [[0, -0.02, 0], [0, 1, 0]], [0.07, 0.05], 3, () => [0.08, 0.06, 0.045], () => 0);
  const ico = new IcosahedronGeometry(1, 0).attributes.position;
  const corner = (i) => { const d = [ico.getX(i), ico.getY(i), ico.getZ(i)], f = 1 + (hashF(...d) - 0.5) * 0.25; return { d, p: [d[0] * f, 0.5 + d[1] * 0.5 * f, d[2] * f] }; };
  for (let i = 0; i < ico.count; i += 3) {
    const tri = [corner(i), corner(i + 1), corner(i + 2)], fn = norm(cross(sub(tri[1].p, tri[0].p), sub(tri[2].p, tri[0].p)));
    for (const { d, p } of tri) { const sh = 0.7 + 0.25 * p[1]; S.v(p, wsum([[d, 0.7], [fn, 0.3]]), [sh, sh, sh], [1, 0.25 + 0.4 * p[1], 0]); }
  }
  return S.geometry();
}
function farCone() {
  const S = new Soup(), sides = 6;
  tube(S, [[0, -0.02, 0], [0, 1, 0]], [0.1, 0.06], 3, () => [0.08, 0.06, 0.045], () => 0);
  const onRim = (k, rad, yb) => { const ang = (k % sides) / sides * Math.PI * 2; return [Math.cos(ang) * rad, yb, Math.sin(ang) * rad]; };
  for (const [yb, yt, rad] of [[0, 0.62, 1], [0.4, 1.02, 0.66]]) for (let k = 0; k < sides; k += 1) {
    const A = onRim(k, rad, yb), B = onRim(k + 1, rad, yb), T = [0, yt, 0], U = [0, yb + 0.08, 0];
    const fn = norm(cross(sub(B, T), sub(A, T)));
    for (const p of [T, B, A]) { const sh = p === T ? 0.75 : 0.95; S.v(p, norm(mixv(fn, norm([p[0], 0.5, p[2]]), 0.5)), [sh, sh, sh], [1, 0.2 + 0.5 * p[1], 0]); }
    for (const p of [A, B, U]) S.v(p, [0, -1, 0], [0.5, 0.5, 0.5], [1, 0.1, 0]);
  }
  return S.geometry();
}

// species recipes (sizes in metres at scale 1; the caller's scale / scale3 multiply them)
const BARK = [0.075, 0.056, 0.042];
export const RECIPES = {
  linden:   { kind: 'broad', seed: 11, H: 9.5, W: 6.4, clear: 2.8, trunkR: 0.22, shape: 'ovoid', limbs: 5, fill: 5, cr: 0.3, rise: 0.35, jag: 0.35, bark: BARK },
  chestnut: { kind: 'broad', seed: 23, H: 9, W: 7.4, clear: 2.6, trunkR: 0.26, shape: 'round', limbs: 5, fill: 6, cr: 0.32, rise: 0.3, jag: 0.28, flat: 0.75, bark: [0.07, 0.055, 0.045] },
  maple:    { kind: 'broad', seed: 37, H: 10.5, W: 8, clear: 3, trunkR: 0.3, shape: 'round', limbs: 6, fill: 5, cr: 0.3, rise: 0.3, jag: 0.4, bark: [0.08, 0.07, 0.058] },
  oak:      { kind: 'broad', seed: 41, H: 11, W: 10, clear: 3, trunkR: 0.38, shape: 'spread', limbs: 6, fill: 7, cr: 0.27, rise: 0.2, jag: 0.45, flat: 0.72, bark: [0.06, 0.048, 0.038] },
  birch:    { kind: 'broad', seed: 53, H: 11.5, W: 5, clear: 3.2, trunkR: 0.17, shape: 'ovoid', limbs: 4, fill: 4, cr: 0.28, rise: 0.45, jag: 0.5, birch: true, bark: [0.55, 0.54, 0.5] },
  elm:      { kind: 'broad', seed: 67, H: 12.5, W: 9.5, clear: 3.4, trunkR: 0.36, shape: 'vase', limbs: 6, fill: 5, cr: 0.28, rise: 0.55, jag: 0.35, trunkReach: 0.15, bark: [0.065, 0.055, 0.047] },
  sapling:  { kind: 'broad', seed: 71, H: 5, W: 2.6, clear: 1.8, trunkR: 0.08, shape: 'ovoid', limbs: 3, fill: 2, cr: 0.36, rise: 0.4, jag: 0.35, bark: [0.09, 0.075, 0.06] },
  fruit:    { kind: 'broad', seed: 83, H: 4.6, W: 4.6, clear: 1.3, trunkR: 0.14, shape: 'spread', limbs: 4, fill: 4, cr: 0.34, rise: 0.25, jag: 0.4, flat: 0.75, bark: [0.07, 0.06, 0.05] },
  pine:     { kind: 'broad', seed: 97, H: 9, W: 4.2, clear: 5, trunkR: 0.2, shape: 'umbrella', limbs: 5, fill: 3, cr: 0.3, rise: 0.25, jag: 0.4, flat: 0.55, trunkReach: 0.55, bark: [0.07, 0.05, 0.04], upperBark: [0.22, 0.1, 0.045] },
  poplar:   { kind: 'broad', seed: 101, H: 8.5, W: 3.6, clear: 1.2, trunkR: 0.3, shape: 'column', limbs: 5, fill: 8, cr: 0.3, rise: 0.55, jag: 0.35, flat: 1.2, trunkReach: 0.5, bark: [0.08, 0.075, 0.065] },
  spruce:   { kind: 'cone', seed: 113, H: 8.5, W: 4.2, clear: 0.5, trunkR: 0.22, tiers: 8, bark: [0.06, 0.045, 0.035] },
  hedge:    { kind: 'hedge', seed: 127, H: 1, W: 1, clear: 0, trunkR: 0, bark: BARK },
};

export function buildTreeGeometries() {
  const variants = {};
  for (const [name, R] of Object.entries(RECIPES)) {
    const make = R.kind === 'cone' ? spruce : R.kind === 'hedge' ? hedge : broadleaf;
    const near = make(R, 'near'), mid = make(R, 'mid');
    // crown extent from the near foliage -> far fit
    const pos = near.attributes.position.array, leaf = near.attributes.aLeaf.array;
    let hx = 0, hz = 0, y0 = Infinity, y1 = 0;
    for (let o = 0; o < pos.length; o += 3) {
      if (leaf[o] < 0.5) continue;
      hx = Math.max(hx, Math.abs(pos[o])); hz = Math.max(hz, Math.abs(pos[o + 2]));
      y0 = Math.min(y0, pos[o + 1]); y1 = Math.max(y1, pos[o + 1]);
    }
    variants[name] = {
      near, mid, far: R.kind === 'cone' ? 'cone' : R.kind === 'hedge' ? null : 'round',
      fit: { hx: hx * 0.92, hz: hz * 0.92, top: y1, cb: Math.max(0.02, y0 / y1) },
      trunk: { r: R.trunkR, h: Math.max(2.2, Math.min(R.clear + 0.8, 4.5)) }, bark: R.bark,
    };
  }
  return { variants, far: { round: farRound(), cone: farCone() } };
}
