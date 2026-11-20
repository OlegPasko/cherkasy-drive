// Procedural low-poly tree and shrub geometry for world/trees.js. Every species variant is generated once (seeded, so
// the city looks the same on every load) at two detail levels that share one layout, plus two tiny far shapes shared
// by all. (nature/treegeo_legacy.js is the generator before the greenery upgrade, kept for the ?notreeplus A/B.)
//   buildTreeGeometries() -> { variants: { [name]: { near, mid, far: 'round' | 'cone', fit: { hx, hz, top, cb },
//                              trunk: { r, h }, bark: [r, g, b] } }, far: { round, cone } }
//   buildShrubGeometries() -> { near, far }   one bush in a unit box (x, z in [-0.5, 0.5], y from -0.1, a foot in the
//     ground, to 1); the shrub
//     shader tapers it into a cone (thuja, juniper) per instance and flecks it with the instance's second tint
//     (flowers, or fresh tips), denser where aLeaf.y is high: up and out.
//   RECIPES: the species table. A crown is a set of smooth lobed puffs on limbs that fork from the trunk: big ones at
//     the limb and twig tips, small sprigs on the outline (near only) so the silhouette is leafy, not a ball.
// Vertex attributes (non-indexed triangle soup):
//   position, normal
//   color  bark: linear albedo; foliage: grey shade multiplier (the per-tree crown tints are applied in the shader)
//   aLeaf  x: 1 foliage / 0 bark, y: mix factor tint A -> tint B, z: wind sway weight (also the weight of the
//          per-tree shape warp in the shader: 0 at the trunk foot, so trunks stay on their colliders)
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
// unit icosphere corners per detail level (non-indexed), read once
const ICO = [0, 1].map((d) => { const a = new IcosahedronGeometry(1, d).attributes.position; return Array.from({ length: a.count }, (_, i) => [a.getX(i), a.getY(i), a.getZ(i)]); });

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
      const rad = rs[i] * (k % 2 ? 0.9 : 1.04);
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

// A foliage puff: an icosphere pushed out into a few smooth lobes (a function of the unit direction, so the
// duplicated corners of the triangle soup stay welded), flatter underneath, shaded as a mass: lighter on top and on
// the side that faces out of the crown, darker inside and below. ctx: { c: crown centre, y0, y1, rad: crown radius }
//   o: { lobe = 0.22, under = 0.72, tone = 1, mix = 0 (shift of the A -> B tint mix), sway = null | weight }
function puff(S, ctr, rad, detail, r, ctx, o = {}) {
  const lobe = o.lobe ?? 0.22, under = o.under ?? 0.72, tone = o.tone ?? 1;
  const a1 = norm([r() - 0.5, r() - 0.5, r() - 0.5]), a2 = norm([r() - 0.5, r() - 0.5, r() - 0.5]), p1 = r() * 6.28, p2 = r() * 6.28;
  const salt = r() * 10, mixT = r(), jit = (r() - 0.5) * 0.12;
  const span = ctx.y1 - ctx.y0 || 1, crad = ctx.rad || 1;
  const corner = (dir) => {
    const f = 1 + lobe * (0.55 * Math.sin(dot3(dir, a1) * 2.6 + p1) + 0.4 * Math.sin(dot3(dir, a2) * 4.1 + p2) + 0.5 * (hashF(dir[0] + salt, dir[1], dir[2]) - 0.5));
    return { dir, p: [ctr[0] + dir[0] * rad[0] * f, ctr[1] + dir[1] * rad[1] * f * (dir[1] < 0 ? under : 1), ctr[2] + dir[2] * rad[2] * f] };
  };
  const C = ICO[detail];
  for (let i = 0; i < C.length; i += 3) {
    const tri = [corner(C[i]), corner(C[i + 1]), corner(C[i + 2])];
    const fn = norm(cross(sub(tri[1].p, tri[0].p), sub(tri[2].p, tri[0].p)));
    for (const { dir, p } of tri) {
      const out = sub(p, ctx.c), crown = norm(out), hy = sat((p[1] - ctx.y0) / span);
      const deep = sat(Math.hypot(out[0], out[2]) / crad + 0.25 * hy);          // 0 in the heart of the crown
      const face = dot3(dir, crown);
      const shade = (0.5 + 0.3 * hy + 0.17 * face + 0.1 * dir[1] + jit) * (0.84 + 0.16 * deep) * (dir[1] < -0.45 ? 0.82 : 1) * tone;
      const mixAB = sat(0.16 + 0.42 * hy + 0.3 * (mixT - 0.5) + 0.22 * dir[1] + 0.1 * face + (o.mix ?? 0));
      S.v(p, wsum([[dir, 0.5], [crown, 0.36], [fn, 0.14]]), [shade, shade, shade], [1, mixAB, o.sway ?? 0.55 + 0.45 * hy]);
    }
  }
}

// A hanging foliage strand (weeping willow): a flat tapered ribbon of `sides` faces from p, on the crown's rim, down
// len metres; it bows out a little, is wider along the rim than across it (a curtain), lighter towards the tip.
function strand(S, p, len, w, sides, g, ctx, o = {}) {
  const out = norm([p[0] - ctx.c[0], 0, p[2] - ctx.c[2]]), tan = [-out[2], 0, out[0]];
  const T = [0, 0.3, 0.72, 1], RW = [0.5, 1, 0.8, 0.12], bow = (o.bow ?? 0.3) * (0.5 + g()), tone = (o.tone ?? 1) * (0.92 + 0.16 * g()), tw = g() * 6.283;
  const rings = T.map((t, i) => {
    const b = bow * Math.sin(t * 2.2), c = [p[0] + out[0] * b, p[1] - len * t, p[2] + out[2] * b], rw = w * RW[i] * (0.85 + 0.3 * g());
    return Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * 6.283 + tw, ca = Math.cos(a), sa = Math.sin(a);
      const shade = (0.66 + 0.14 * ca + 0.06 * (1 - t)) * tone;
      return {
        p: [c[0] + (out[0] * ca * 0.6 + tan[0] * sa * 1.35) * rw, c[1], c[2] + (out[2] * ca * 0.6 + tan[2] * sa * 1.35) * rw],
        n: norm([out[0] * (ca + 0.5) + tan[0] * sa * 0.7, 0.35 - 0.3 * t, out[2] * (ca + 0.5) + tan[2] * sa * 0.7]),
        c: [shade, shade, shade], l: [1, sat(0.3 + 0.45 * t + (o.mix ?? 0)), 0.7 + 0.6 * t],
      };
    });
  });
  rings.slice(1).forEach((lo, i) => {
    const hi = rings[i];
    for (let k = 0; k < sides; ++k) {
      const k1 = (k + 1) % sides;
      for (const q of [hi[k], hi[k1], lo[k1], hi[k], lo[k1], lo[k]]) S.v(q.p, q.n, q.c, q.l);
    }
  });
}

// crown envelope: radius factor (0..1) at normalised crown height t
const ENVELOPE = {
  ovoid: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.03)), 0.75),
  round: (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)),
  spread: (t) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.12))), 0.5) * (t > 0.75 ? 1 - (t - 0.75) * 1.4 : 1),
  vase: (t) => Math.min(1, 0.35 + t * 1.1) * (t > 0.8 ? 1 - (t - 0.8) * 3 : 1),
  column: (t) => (t < 0.12 ? 0.5 + t * 4 : t > 0.8 ? 1 - (t - 0.8) * 4 : 1),
  flame: (t) => (t < 0.25 ? 0.55 + t * 1.8 : Math.pow(Math.max(0, 1 - (t - 0.25) / 0.75), 0.6)),
  umbrella: (t) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.4),
  heart: (t) => (t < 0.3 ? 0.62 + t * 1.27 : Math.pow(Math.max(0, 1 - ((t - 0.3) / 0.7) ** 2), 0.6)),
  dome: (t) => Math.sqrt(Math.max(0, 1 - t * t * 0.96)) * (t < 0.1 ? 0.8 + t * 2 : 1),
};

// bark per ring i / side k: noisy, grooved; birch gets black lenticels and a dark foot, pine an orange upper trunk
const barkOf = (R, hy) => (i, k) => {
  const nz = hashF(i, k, R.seed) - 0.5, h = hy(i);
  if (R.birch && (hashF(i, k * 0.1, 7) > 0.7 || h < 0.1)) return [0.05, 0.045, 0.04];
  const base = R.upperBark && h > (R.upperAt ?? 0.45) ? R.upperBark : R.bark;
  return base.map(v => v * (1 + nz * 0.3) * (k % 2 ? 0.8 : 1));
};

// broadleaf (and Scots pine / poplar / willow) recipe. The layout (limbs, twigs, puffs) is drawn first, from the
// seed alone, so both detail levels show the same tree; the mid level keeps the big puffs, a little fatter.
function broadleaf(R, lod) {
  const r = rng32(R.seed), S = new Soup(), near = lod === 'near';
  const H = R.H, cy0 = R.clear, cy1 = H, W = R.W / 2, env = ENVELOPE[R.shape], ch = cy1 - cy0;
  const ctx = { c: [(R.off?.[0] ?? 0), (cy0 + cy1) / 2, (R.off?.[1] ?? 0)], y0: cy0, y1: cy1, rad: W };
  const sway = (p) => Math.pow(Math.max(0, p[1]) / H, 2) * 0.5 + Math.hypot(p[0], p[2]) / W * 0.25;
  // ---- layout
  // trunk: a slight lean and S-bend, root flare, sunk 0.4 m so slopes never show a floating base
  const tTop = cy0 + ch * (R.trunkReach ?? 0.3), lean = [(r() - 0.5) * (R.lean ?? 0.08), 0, (r() - 0.5) * (R.lean ?? 0.08)], bend = R.bend ?? 0.06;
  const trunkAt = (yy) => [lean[0] * yy + Math.sin(yy / tTop * 3 + R.seed) * bend * Math.min(1, yy / 2) + (R.off?.[0] ?? 0) * sat(yy / tTop) ** 2, yy, lean[2] * yy + Math.cos(yy / tTop * 2.3 + R.seed) * bend * 0.6 * Math.min(1, yy / 2) + (R.off?.[1] ?? 0) * sat(yy / tTop) ** 2];
  const limbs = [], puffs = [];
  for (let li = 0; li < R.limbs; li += 1) {
    const az = (li / R.limbs) * Math.PI * 2 + (r() - 0.5) * 0.9 + R.seed;
    const y0 = cy0 + (tTop - cy0) * (0.15 + r() * 0.85);
    const ht = Math.min(0.92, (y0 - cy0) / ch + R.rise * (0.6 + r() * 0.6));
    const rr = W * env(ht) * (0.55 + r() * 0.3);
    const base = trunkAt(y0), tip = [ctx.c[0] + Math.cos(az) * rr, cy0 + ht * ch, ctx.c[2] + Math.sin(az) * rr];
    const mid = mixv(base, tip, 0.5); mid[1] += (tip[1] - base[1]) * 0.12 - rr * 0.05;
    const twigs = [-1, 1].map((side) => {
      const a2 = az + side * 0.7 + (r() - 0.5) * 0.4, t2 = Math.min(0.97, ht + 0.1 + r() * 0.2), r2 = W * env(t2) * (0.75 + r() * 0.2);
      return [ctx.c[0] + Math.cos(a2) * r2, cy0 + t2 * ch, ctx.c[2] + Math.sin(a2) * r2];
    });
    limbs.push({ base, mid, tip, twigs, y0 });
    puffs.push({ c: tip, k: 0.95 + r() * 0.3 });
    for (const tw of twigs) puffs.push({ c: tw, k: 0.72 + r() * 0.22, tw: true });
  }
  for (let left = R.fill; left > 0; left -= 1) { const t = 0.25 + r() * 0.7, az = r() * Math.PI * 2, rr = W * env(t) * (0.4 + r() * 0.45); puffs.push({ c: [ctx.c[0] + Math.cos(az) * rr, cy0 + t * ch, ctx.c[2] + Math.sin(az) * rr], k: 0.8 + r() * 0.3 }); }
  puffs.push({ c: [ctx.c[0] + (r() - 0.5) * W * 0.3, cy1 - ch * R.cr * 0.8, ctx.c[2] + (r() - 0.5) * W * 0.3], k: 1.0 });
  // sprigs: small tufts that sit on the big puffs, pushed out of the crown and up (drooping ones hang: birch)
  const sprigs = [], size0 = R.cr * Math.min(ch, R.W), wf0 = R.flat ?? 0.8;
  for (let i = 0; i < (R.sprigs ?? 10); i += 1) {
    const host = puffs[Math.floor(r() * puffs.length)], s = size0 * host.k;
    const d = norm([host.c[0] - ctx.c[0] + (r() - 0.5) * W, (host.c[1] - ctx.c[1]) * 0.6 + (r() - 0.2) * W * 0.7, host.c[2] - ctx.c[2] + (r() - 0.5) * W]);
    sprigs.push({ c: [host.c[0] + d[0] * s * 0.9, host.c[1] + d[1] * s * wf0 * 0.9, host.c[2] + d[2] * s * 0.9], k: 0.3 + r() * 0.16 });
  }
  // hanging strands (weeping willow): ribbons from the rim of the crown down
  const strands = [];
  for (let i = 0; i < (R.strands ?? 0); i += 1) {
    const az = (i / R.strands) * Math.PI * 2 + r() * 0.5, t = 0.3 + r() * 0.45, rr = W * env(t) * (0.82 + r() * 0.2), top = cy0 + t * ch, len = Math.min(top - (R.hang ?? 1.4), (R.strandLen ?? 4) * (0.7 + r() * 0.5));
    strands.push({ c: [ctx.c[0] + Math.cos(az) * rr, top, ctx.c[2] + Math.sin(az) * rr], len, w: (R.strandW ?? 0.55) * (0.8 + r() * 0.5) });
  }
  // dead branch stubs under the crown (pine)
  const stubs = [];
  for (let i = 0; i < (R.stubs ?? 0); i += 1) { const yy = cy0 * (0.55 + 0.4 * r()), az = r() * 6.28, L = 0.5 + r() * 0.7; stubs.push({ yy, az, L }); }

  // ---- geometry (its own random stream: the puff lobes differ per level, the layout does not)
  const g = rng32(R.seed * 7 + (near ? 1 : 2));
  const nSeg = near ? 6 : 3;
  const ys = near ? [-0.4, 0.3, tTop * 0.3, tTop * 0.55, tTop * 0.78, tTop * 0.92, tTop] : [-0.4, tTop * 0.35, tTop * 0.75, tTop];
  const tp = ys.map(trunkAt);
  const tr = ys.map((yy, i) => R.trunkR * (i === 0 ? 1.5 : near && i === 1 ? 1.12 : 1 - 0.45 * sat(yy / tTop)));
  tube(S, tp, tr, near ? 8 : 5, barkOf(R, (i) => tp[i][1] / H), sway);
  const lr = R.trunkR * (R.limbR ?? 0.52);
  limbs.forEach((L, li) => {
    if (near || li % 2 === 0) tube(S, [L.base, L.mid, L.tip], [lr, lr * 0.62, lr * 0.26], near ? 5 : 3, barkOf(R, () => L.y0 / H), sway);
    if (near) for (const tw of L.twigs) tube(S, [L.mid, mixv(L.mid, tw, 0.5), tw], [lr * 0.45, lr * 0.3, lr * 0.12], 3, barkOf(R, () => 0.5), sway);
  });
  if (near) for (const q of stubs) { const b = trunkAt(q.yy), d = [Math.cos(q.az), 0.25, Math.sin(q.az)]; tube(S, [b, b.map((v, j) => v + d[j] * q.L)], [R.trunkR * 0.2, R.trunkR * 0.06], 3, barkOf(R, () => 0.2), sway); }
  const size = R.cr * Math.min(ch, R.W), wf = R.flat ?? 0.8, lobe = R.lobe ?? 0.22;
  // mid: the twig puffs go, the rest grow to cover them
  for (const q of near ? puffs : puffs.filter(p => !p.tw)) {
    const s = size * q.k * (near ? 1 : 1.3);
    // never poke under the clear trunk height (cars drive under the crowns)
    const c = [q.c[0], Math.max(q.c[1], cy0 + s * wf * 0.6), q.c[2]];
    puff(S, c, [s, s * wf, s], near && !q.tw ? 1 : 0, g, ctx, { lobe, tone: q.tw ? 1.04 : 1 });
  }
  if (near) for (const q of sprigs) {
    const s = size * q.k, dr = R.droop ?? 0;
    puff(S, [q.c[0], Math.max(q.c[1] - dr * s * 1.5, cy0 + s * 0.5), q.c[2]], [s, s * (0.8 + dr * 1.6), s], 0, g, ctx, { lobe: 0.3, tone: 1.08, mix: 0.12 });
  }
  strands.forEach((q, i) => {
    if (!near && i % 2) return;
    strand(S, q.c, q.len, q.w * (near ? 1 : 1.5), near ? 4 : 3, g, ctx, { tone: 1.04, mix: 0.1 });
  });
  return S.geometry();
}

// spruce: drooping tiers of boughs on a tapering trunk (each tier a skirt: apex -> shoulder ring -> jagged rim)
function spruce(R, lod) {
  const r = rng32(R.seed), S = new Soup(), near = lod === 'near';
  const H = R.H, W = R.W / 2, y0 = R.clear, n = R.tiers - (near ? 0 : 3), sides = near ? 9 : 6;
  tube(S, [[0, -0.4, 0], [0, H * 0.5, 0], [0, H * 0.97, 0]], [R.trunkR * 1.3, R.trunkR * 0.6, R.trunkR * 0.12], near ? 6 : 4, (i, k) => R.bark.map(v => v * (k % 2 ? 0.8 : 1)), () => 0);
  const span = (H - y0) / n;
  const hy = (yy) => sat((yy - y0) / (H - y0));
  const leaf = (p, n3, sh, mixAB, sw) => S.v(p, n3, [sh, sh, sh], [1, mixAB, sw]);
  for (let tier = 0; tier < n; tier += 1) {
    const f = tier / n, yb = y0 + tier * span * 0.96, rad = W * Math.pow(1 - f, 0.9) * (0.9 + r() * 0.2), top = yb + span * (1.75 - f * 0.4), turn = tier * 0.7 + r();
    // rim: branch tips and notches between them, the tips hanging lowest; shoulder: where the bough turns down
    const rim = Array.from({ length: sides }, (_, k) => {
      const ang = (k / sides) * Math.PI * 2 + turn, rk = rad * (k % 2 ? 0.7 : 1) * (0.88 + r() * 0.24);
      return [Math.cos(ang) * rk, yb - span * (k % 2 ? 0.02 : 0.2 + 0.12 * r()), Math.sin(ang) * rk];
    });
    const sh = rim.map((p) => [p[0] * 0.52, yb + span * 0.42, p[2] * 0.52]);
    const apex = [(r() - 0.5) * 0.1, top, (r() - 0.5) * 0.1], under = [0, yb + span * 0.25, 0];
    const col = (p, k) => (k === 0 ? 0.56 : k === 1 ? 0.78 : 0.98) + 0.16 * hy(p[1]);
    const nrm = (p, fn) => norm(mixv(fn, norm([p[0], Math.hypot(p[0], p[2]) * 0.7 + 0.05, p[2]]), 0.6));
    const tri = (A, B, C, ka, kb, kc) => {
      const fn = norm(cross(sub(B, A), sub(C, A)));
      [[A, ka], [B, kb], [C, kc]].forEach(([p, k]) => leaf(p, nrm(p, fn), col(p, k), Math.min(1, 0.12 + 0.5 * hy(p[1]) + (k === 2 ? 0.3 : 0)), k === 2 ? 0.35 + 0.4 * hy(p[1]) : 0.12));
    };
    for (let k = 0; k < sides; k += 1) {
      const k1 = (k + 1) % sides;
      if (near) { tri(apex, sh[k1], sh[k], 0, 1, 1); tri(sh[k], sh[k1], rim[k1], 1, 1, 2); tri(sh[k], rim[k1], rim[k], 1, 2, 2); }
      else tri(apex, rim[k1], rim[k], 0, 2, 2);
      for (const p of [rim[k], rim[k1], under]) leaf(p, norm([p[0] * 0.3, -1, p[2] * 0.3]), 0.42 + 0.1 * hy(p[1]), 0.08, 0.2);
    }
  }
  const ctx = { c: [0, (y0 + H) / 2, 0], y0, y1: H, rad: W };
  puff(S, [0, H + 0.1, 0], [0.12, 0.6, 0.12], 0, r, ctx, { lobe: 0.1, tone: 1.3, under: 1 }); // leader
  return S.geometry();
}

// hedge block: unit box x [-0.5, 0.5], y [0, 1], z [-0.5, 0.5] of lumpy clusters (the item scale3 is its size)
function hedge(R, lod) {
  const r = rng32(R.seed), S = new Soup(), n = lod === 'near' ? 4 : 2;
  const box = { c: [0, 0.35, 0], y0: 0, y1: 1, rad: 0.6 };
  Array.from({ length: n }, (_, i) => (i + 0.5) / n - 0.5).forEach(cx => puff(S, [cx, 0.5, 0], [0.62 / n + 0.08, 0.55, 0.56], lod === 'near' ? 1 : 0, r, box, { lobe: 0.2, under: 1, tone: 1.12 }));
  return S.geometry();
}

// far shapes (see header): round crown + stick trunk, and a two-tier cone
function farRound() {
  const S = new Soup();
  tube(S, [[0, -0.02, 0], [0, 1, 0]], [0.07, 0.05], 3, () => [0.08, 0.06, 0.045], () => 0);
  const corner = (d) => { const f = 1 + (hashF(...d) - 0.5) * 0.25; return { d, p: [d[0] * f, 0.5 + d[1] * 0.5 * f, d[2] * f] }; };
  for (let i = 0; i < ICO[0].length; i += 3) {
    const tri = [corner(ICO[0][i]), corner(ICO[0][i + 1]), corner(ICO[0][i + 2])], fn = norm(cross(sub(tri[1].p, tri[0].p), sub(tri[2].p, tri[0].p)));
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

// species recipes (sizes in metres at scale 1; the caller's scale / scale3 multiply them). The second shapes
// (linden2, chestnut2, pine2) are for rows and stands of one species: the same tree repeated reads as a stamp.
const BARK = [0.145, 0.113, 0.087];
export const RECIPES = {
  linden:   { kind: 'broad', seed: 11, H: 9.5, W: 6.4, clear: 2.8, trunkR: 0.23, shape: 'heart', limbs: 5, fill: 5, cr: 0.3, rise: 0.35, lobe: 0.2, sprigs: 12, bark: BARK },
  linden2:  { kind: 'broad', seed: 13, H: 10.2, W: 5.8, clear: 3.1, trunkR: 0.21, shape: 'ovoid', limbs: 4, fill: 6, cr: 0.31, rise: 0.45, lobe: 0.24, sprigs: 12, lean: 0.16, off: [0.35, -0.2], bark: [0.133, 0.109, 0.087] },
  chestnut: { kind: 'broad', seed: 23, H: 9, W: 7.4, clear: 2.6, trunkR: 0.27, shape: 'round', limbs: 5, fill: 6, cr: 0.32, rise: 0.3, lobe: 0.18, flat: 0.75, sprigs: 10, bark: [0.123, 0.096, 0.078] },
  chestnut2: { kind: 'broad', seed: 29, H: 8.4, W: 8.2, clear: 2.5, trunkR: 0.29, shape: 'dome', limbs: 6, fill: 5, cr: 0.31, rise: 0.38, lobe: 0.2, flat: 0.72, sprigs: 10, trunkReach: 0.18, lean: 0.12, off: [-0.3, 0.3], bark: [0.116, 0.093, 0.075] },
  maple:    { kind: 'broad', seed: 37, H: 10.5, W: 8, clear: 3, trunkR: 0.3, shape: 'round', limbs: 6, fill: 5, cr: 0.3, rise: 0.3, lobe: 0.26, sprigs: 12, bark: [0.138, 0.12, 0.102] },
  oak:      { kind: 'broad', seed: 41, H: 11, W: 10, clear: 3, trunkR: 0.38, shape: 'spread', limbs: 6, fill: 7, cr: 0.27, rise: 0.2, lobe: 0.3, flat: 0.72, sprigs: 12, limbR: 0.6, bark: [0.102, 0.081, 0.065] },
  birch:    { kind: 'broad', seed: 53, H: 11.5, W: 5, clear: 3.2, trunkR: 0.17, shape: 'ovoid', limbs: 4, fill: 4, cr: 0.27, rise: 0.45, lobe: 0.3, sprigs: 16, droop: 0.9, birch: true, bark: [0.62, 0.61, 0.57] },
  elm:      { kind: 'broad', seed: 67, H: 12.5, W: 9.5, clear: 3.4, trunkR: 0.36, shape: 'vase', limbs: 6, fill: 5, cr: 0.28, rise: 0.55, lobe: 0.24, sprigs: 12, trunkReach: 0.15, bark: [0.113, 0.096, 0.081] },
  sapling:  { kind: 'broad', seed: 71, H: 5, W: 2.6, clear: 1.8, trunkR: 0.08, shape: 'ovoid', limbs: 3, fill: 2, cr: 0.36, rise: 0.4, lobe: 0.24, sprigs: 6, bark: [0.16, 0.131, 0.104] },
  fruit:    { kind: 'broad', seed: 83, H: 4.6, W: 4.6, clear: 1.3, trunkR: 0.14, shape: 'spread', limbs: 4, fill: 4, cr: 0.34, rise: 0.25, lobe: 0.26, flat: 0.75, sprigs: 8, bark: [0.123, 0.104, 0.087] },
  pine:     { kind: 'broad', seed: 97, H: 9, W: 4.2, clear: 5, trunkR: 0.2, shape: 'umbrella', limbs: 4, fill: 2, cr: 0.31, rise: 0.25, lobe: 0.3, flat: 0.55, sprigs: 5, stubs: 4, trunkReach: 0.55, limbR: 0.45, bend: 0.03, bark: [0.123, 0.087, 0.07], upperBark: [0.299, 0.132, 0.057] },
  pine2:    { kind: 'broad', seed: 103, H: 9.4, W: 3.6, clear: 4.4, trunkR: 0.19, shape: 'ovoid', limbs: 4, fill: 2, cr: 0.3, rise: 0.3, lobe: 0.3, flat: 0.6, sprigs: 5, stubs: 5, trunkReach: 0.7, limbR: 0.42, bend: 0.12, lean: 0.14, bark: [0.116, 0.084, 0.067], upperBark: [0.287, 0.127, 0.057], upperAt: 0.38 },
  poplar:   { kind: 'broad', seed: 101, H: 8.5, W: 3.6, clear: 1.2, trunkR: 0.3, shape: 'flame', limbs: 5, fill: 8, cr: 0.3, rise: 0.55, lobe: 0.22, flat: 1.25, sprigs: 12, trunkReach: 0.5, bark: [0.16, 0.152, 0.131] },
  willow:   { kind: 'broad', seed: 131, H: 9.5, W: 10, clear: 2.6, trunkR: 0.36, shape: 'dome', limbs: 5, fill: 3, cr: 0.27, rise: 0.4, lobe: 0.24, flat: 0.7, sprigs: 0, strands: 32, strandLen: 5.6, strandW: 0.42, hang: 1.4, trunkReach: 0.3, limbR: 0.6, lean: 0.2, bark: [0.123, 0.107, 0.087] },
  spruce:   { kind: 'cone', seed: 113, H: 8.5, W: 4.2, clear: 0.5, trunkR: 0.22, tiers: 9, bark: [0.102, 0.075, 0.058] },
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

// one bush for the shrub layer (see header): a lobed body and side lumps
export function buildShrubGeometries() {
  const make = (near) => {
    const r = rng32(near ? 211 : 223), S = new Soup(), ctx = { c: [0, 0.3, 0], y0: 0, y1: 1, rad: 0.5 };
    puff(S, [0, 0.52, 0], [0.36, 0.47, 0.36], near ? 1 : 0, r, ctx, { lobe: 0.2, under: 1, sway: 0.5 });
    const lumps = near ? 7 : 1;
    for (let i = 0; i < lumps; i += 1) {
      const az = (i / lumps) * 6.283 + 0.4, rr = 0.24 + 0.06 * r(), s = 0.19 + 0.07 * r();
      puff(S, [Math.cos(az) * rr, 0.22 + 0.3 * r(), Math.sin(az) * rr], [s, s * 1.25, s], 0, r, ctx, { lobe: 0.25, under: 1, sway: 0.4 });
    }
    // The bush stands in the ground: the round undersides of the puffs end 0.05-0.15 above y = 0, which under a 3 m
    // lilac is a bush floating half a metre over its shadow. The lower third is drawn out downward, so the mesh
    // crosses y = 0 at its full girth and ends a little under it (the top is brought to 1).
    const pos = S.buf[0]; let top = 0;
    for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]);
    for (let i = 1; i < pos.length; i += 3) { const y = pos[i] / top; pos[i] = y < 0.34 ? Math.max(-0.1, 0.34 - (0.34 - y) * 2.1) : y; }
    return S.geometry();
  };
  return { near: make(true), far: make(false) };
}
