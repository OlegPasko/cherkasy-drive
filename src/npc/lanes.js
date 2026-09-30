// Lane network for street traffic, derived from the motor roads of map.json (no hand-kept road data).
//   buildLaneNetwork(map, ground, opts?) -> net
//     map: map.json ({ region, roads[{ p, w, c, k, n, ow, ln, tw, br }] }); ground: { heightAt(x, z) } or a function (x, z) -> y
//     opts: { cluster = 20, clusterMax = 48 } junction clustering (m)
//   net = { nodes, links, signals, stats, linksNear(x, z, r, out) -> out, phase(t, axis) -> 2 go / 1 amber / 0 stop, CYCLE }
//     node: { id, x, z, junction, deadEnd, sig, legs, inLinks[], outLinks[], moves[] (connectors through it) }
//     link (one lane, straight, travel direction): { id, from, to, ax, az, dx, dz, len, heading, lane, nl, cls, main, tw,
//       name, bridge, dens, y0, y1, edgeR, signal, axis, stopS, out[move], alt, cars[], parked }
//       move: { link (next lane), turn 'S' | 'L' | 'R' | 'U', from (this link), node, path, cf[] (conflicting moves), pri }
//       path: { n, x[], z[], s[], len } arc-length sampled turn / bend curve from this link's end to the next link's start
//     signals: [{ x, y, z, ry, ax }] one head per signalised approach; axis objects { o: offset s, g: 0 | 1 }
// Right-hand traffic: lanes sit right of the centreline; one-way ways run forward only. Nearby junction nodes (dual
// carriageways, offset T's) form one junction; lanes stop short of the crossing carriageways and moves run through the box.
const CLASS = { primary: 5, primary_link: 4, secondary: 4, secondary_link: 3, tertiary: 3, tertiary_link: 2, residential: 1, unclassified: 1, living_street: 0.5 };
// relative traffic density per road class (busy named avenues get a bit more)
const DENSITY = { primary: 1.0, primary_link: 0.5, secondary: 0.85, secondary_link: 0.4, tertiary: 0.45, tertiary_link: 0.3, residential: 0.14, unclassified: 0.12, living_street: 0.06 };
const BUSY_NAMES = /Шевченка|Смілянськ|Хрещатик|Перемоги|Героїв Дніпра|Чорновола|Благовісн/;
const SEG_MIN = 14, PIECE_MIN = 12, DP_TOL = 0.7, CYCLE = 48;

const hyp = Math.hypot;
function segDist(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, q = ex * ex + ez * ez || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * ex + (pz - az) * ez) / q));
  return hyp(px - ax - ex * t, pz - az - ez * t);
}
function cumLen(P) { const s = [0]; for (let i = 2; i < P.length; i += 2) s.push(s[s.length - 1] + hyp(P[i] - P[i - 2], P[i + 1] - P[i - 1])); return s; }
function turnKind(ax, az, bx, bz) {
  let d = Math.atan2(bz, bx) - Math.atan2(az, ax);
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const m = Math.abs(d);
  // +angle in x/z (z to the right of x) is a clockwise turn seen from above = a right turn
  return m < 0.7 ? 'S' : m > 2.7 ? 'U' : d > 0 ? 'R' : 'L';
}

// signal phase of an axis at time t: 2 go, 1 amber, 0 stop (no axis = uncontrolled = go)
export function signalPhase(t, ax) {
  if (!ax || typeof ax !== 'object') return 2;
  const half = CYCLE / 2, c = (((t + ax.o) % CYCLE) + CYCLE) % CYCLE, u = ax.g ? (c + half) % CYCLE : c;
  return u < half - 4 ? 2 : u < half - 1 ? 1 : 0;
}

// curve from (x0, z0) heading (u0) to (x1, z1) heading (u1): cubic Bezier sampled into arc-length steps
export function makePath(x0, z0, ux0, uz0, x1, z1, ux1, uz1) {
  const d = hyp(x1 - x0, z1 - z0);
  const straight = ux0 * ux1 + uz0 * uz1 > 0.995 && Math.abs((x1 - x0) * uz0 - (z1 - z0) * ux0) < 0.3;
  const n = straight || d < 1 ? 2 : Math.min(16, 6 + Math.round(d / 3));
  const k = ux0 * ux1 + uz0 * uz1 < -0.9 ? Math.max(2.5, d * 0.9) : d * 0.45;
  const cx0 = x0 + ux0 * k, cz0 = z0 + uz0 * k, cx1 = x1 - ux1 * k, cz1 = z1 - uz1 * k;
  const x = new Float32Array(n), z = new Float32Array(n), s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = (1 - t) ** 3, b = 3 * t * (1 - t) ** 2, c = 3 * t * t * (1 - t), e = t ** 3;
    x[i] = a * x0 + b * cx0 + c * cx1 + e * x1; z[i] = a * z0 + b * cz0 + c * cz1 + e * z1;
    if (i) s[i] = s[i - 1] + hyp(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  return { n, x, z, s, len: Math.max(0.05, s[n - 1]) };
}

// point + unit direction on a path at arc s; hint: segment index to start the search from (returned in out.i)
export function pathAt(P, s, out, hint = 0) {
  let i = Math.min(Math.max(0, hint), P.n - 2);
  while (i > 0 && P.s[i] > s) i--;
  while (i < P.n - 2 && P.s[i + 1] < s) i++;
  const l = P.s[i + 1] - P.s[i], f = l > 1e-6 ? Math.min(1, Math.max(0, (s - P.s[i]) / l)) : 0;
  const ex = P.x[i + 1] - P.x[i], ez = P.z[i + 1] - P.z[i], el = hyp(ex, ez) || 1;
  out.x = P.x[i] + ex * f; out.z = P.z[i] + ez * f; out.dx = ex / el; out.dz = ez / el; out.i = i;
  return out;
}

export function buildLaneNetwork(map, ground, opts = {}) {
  const t0 = performance.now();
  const heightAt = typeof ground === 'function' ? ground : ground?.heightAt ? (x, z) => ground.heightAt(x, z) : () => 0;
  const cluster = opts.cluster ?? 20, clusterMax = opts.clusterMax ?? 48;
  const R = map?.region || { x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 };
  const roads = (map?.roads || []).filter(r => r.k === 'm' && CLASS[r.c] !== undefined && r.p && r.p.length >= 4);
  const empty = () => ({ nodes: [], links: [], signals: [], stats: { links: 0, nodes: 0, junctions: 0, signals: 0, ms: 0 }, linksNear: (x, z, r, out = []) => out, phase: signalPhase, CYCLE });
  if (!roads.length) return empty();

  // ---- vertices: way ends and points shared by two or more ways become graph vertices
  const vkey = (x, z) => Math.round(x * 10) * 4194304 + Math.round(z * 10); // 0.1 m grid, exact within the map range
  const uses = new Map();
  for (const r of roads) {
    const m = r.p.length / 2;
    for (let i = 0; i < m; i++) { const k = vkey(r.p[2 * i], r.p[2 * i + 1]); uses.set(k, (uses.get(k) || 0) + (i === 0 || i === m - 1 ? 2 : 1)); }
  }
  const verts = new Map();
  const vertex = (k, x, z) => { let v = verts.get(k); if (!v) verts.set(k, v = { x, z, ends: [], deg: 0 }); return v; };
  let pieces = [];
  for (const r of roads) {
    const P = r.p, m = P.length / 2, flow = r.ow ? 1 : 0;
    let cur = null;
    for (let i = 0; i < m; i++) {
      const x = P[2 * i], z = P[2 * i + 1], k = vkey(x, z);
      if (cur) {
        const n = cur.pts.length;
        if (hyp(x - cur.pts[n - 2], z - cur.pts[n - 1]) > 0.05) { cur.pts.push(x, z); cur.seg.push(r); cur.flow.push(flow); }
      }
      if (uses.get(k) >= 2) {
        const v = vertex(k, x, z);
        if (cur) { cur.b = v; if (cur.seg.length) pieces.push(cur); }
        cur = i < m - 1 ? { a: v, b: null, pts: [x, z], seg: [], flow: [] } : null;
      }
    }
  }
  for (const e of pieces) { e.a.ends.push({ e, at: 0 }); e.b.ends.push({ e, at: 1 }); }

  // ---- chains: pieces joined through plain two-way joins (a one-way pair only when it keeps flowing)
  const passThrough = (v) => {
    if (v.ends.length !== 2 || v.ends[0].e === v.ends[1].e) return false;
    const [p, q] = v.ends, fp = p.e.flow[p.at ? p.e.flow.length - 1 : 0], fq = q.e.flow[q.at ? q.e.flow.length - 1 : 0];
    if (!fp && !fq) return true;
    return !!fp && !!fq && p.at !== q.at;
  };
  const flipped = (e) => {
    const P = [];
    for (let i = e.pts.length - 2; i >= 0; i -= 2) P.push(e.pts[i], e.pts[i + 1]);
    return { a: e.b, b: e.a, pts: P, seg: e.seg.slice().reverse(), flow: e.flow.map(f => -f).reverse() };
  };
  const taken = new Set(), chains = [];
  for (const e0 of pieces) {
    if (taken.has(e0)) continue;
    taken.add(e0);
    const C = { a: e0.a, b: e0.b, pts: e0.pts.slice(), seg: e0.seg.slice(), flow: e0.flow.slice() };
    for (const atB of [true, false]) {
      for (let guard = 0; guard < 100000; guard++) {
        const v = atB ? C.b : C.a;
        if (!passThrough(v)) break;
        const nx = v.ends.find(q => !taken.has(q.e));
        if (!nx) break;
        taken.add(nx.e);
        const E = atB ? (nx.at === 0 ? nx.e : flipped(nx.e)) : (nx.at === 1 ? nx.e : flipped(nx.e));
        if (atB) { C.pts.push(...E.pts.slice(2)); C.seg.push(...E.seg); C.flow.push(...E.flow); C.b = E.b; }
        else { C.pts = E.pts.slice(0, -2).concat(C.pts); C.seg = E.seg.concat(C.seg); C.flow = E.flow.concat(C.flow); C.a = E.a; }
      }
    }
    chains.push(C);
  }
  pieces = null;
  for (const C of chains) { C.a.deg++; C.b.deg++; }

  // ---- simplify each chain; attribute changes (width, lanes, direction, wires, class band, bridge) stay as vertices
  const attrKey = (C, i) => { const r = C.seg[i]; return `${r.w}|${r.ln}|${C.flow[i]}|${r.tw ? 1 : 0}|${CLASS[r.c] >= 2 ? 1 : 0}|${r.br ? 1 : 0}`; };
  for (const C of chains) {
    const P = C.pts, m = P.length / 2, keep = new Uint8Array(m), fixed = new Uint8Array(m);
    keep[0] = keep[m - 1] = 1;
    for (let i = 1; i < m - 1; i++) if (attrKey(C, i - 1) !== attrKey(C, i)) fixed[i] = keep[i] = 1;
    const simplify = (i, j) => {
      let worst = -1, wi = -1;
      for (let k = i + 1; k < j; k++) { const d = segDist(P[2 * k], P[2 * k + 1], P[2 * i], P[2 * i + 1], P[2 * j], P[2 * j + 1]); if (d > worst) { worst = d; wi = k; } }
      if (worst > DP_TOL) { keep[wi] = 1; simplify(i, wi); simplify(wi, j); }
    };
    for (let i = 1, last = 0; i < m; i++) if (keep[i]) { simplify(last, i); last = i; }
    const idx = [];
    for (let i = 0; i < m; i++) if (keep[i]) idx.push(i);
    const len = (a, b) => hyp(P[2 * idx[b]] - P[2 * idx[a]], P[2 * idx[b] + 1] - P[2 * idx[a] + 1]);
    // drop the interior vertex beside the shortest segment while that barely changes the shape
    for (let guard = 0; guard < 2000 && idx.length > 2; guard++) {
      let si = -1, sl = SEG_MIN;
      for (let i = 0; i + 1 < idx.length; i++) { const l = len(i, i + 1); if (l < sl) { sl = l; si = i; } }
      if (si < 0) break;
      const cands = [si, si + 1].filter(i => i > 0 && i < idx.length - 1 && (!fixed[idx[i]] || sl < 3));
      if (!cands.length) { if (sl < 3) break; fixed[idx[si]] = fixed[idx[si + 1]] = 0; continue; }
      let pick = -1, dev = 4;
      for (const i of cands) { const d = segDist(P[2 * idx[i]], P[2 * idx[i] + 1], P[2 * idx[i - 1]], P[2 * idx[i - 1] + 1], P[2 * idx[i + 1]], P[2 * idx[i + 1] + 1]); if (d <= dev) { dev = d; pick = i; } }
      if (pick < 0) break;
      idx.splice(pick, 1);
    }
    const S = cumLen(P), pts = [], seg = [], flow = [];
    for (let i = 0; i < idx.length; i++) {
      pts.push(P[2 * idx[i]], P[2 * idx[i] + 1]);
      if (i + 1 < idx.length) { // the new segment takes the attributes found at its midpoint
        const mid = (S[idx[i]] + S[idx[i + 1]]) / 2;
        let k = idx[i];
        while (k < idx[i + 1] - 1 && S[k + 1] < mid) k++;
        seg.push(C.seg[k]); flow.push(C.flow[k]);
      }
    }
    C.pts = pts; C.seg = seg; C.flow = flow; C.S = cumLen(pts); C.len = C.S[C.S.length - 1];
  }

  // ---- junction clusters: short chains between two real junctions merge them (bounded box)
  const parent = new Map(), bbox = new Map();
  const root = (v) => { let r = v; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(v) !== r) { const n = parent.get(v); parent.set(v, r); v = n; } return r; };
  for (const v of verts.values()) if (v.deg > 0) { parent.set(v, v); bbox.set(v, [v.x, v.z, v.x, v.z]); }
  for (const C of chains.filter(C => C.a !== C.b && C.a.deg >= 3 && C.b.deg >= 3 && C.len < cluster).sort((p, q) => p.len - q.len)) {
    const ra = root(C.a), rb = root(C.b);
    if (ra === rb) continue;
    const A = bbox.get(ra), B = bbox.get(rb), U = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
    if (U[2] - U[0] > clusterMax || U[3] - U[1] > clusterMax) continue;
    parent.set(rb, ra); bbox.set(ra, U);
  }
  const inside = (C) => root(C.a) === root(C.b) && (C.a !== C.b || C.len < cluster) && !(C.a === C.b && C.a.deg < 3);
  const live = chains.filter(C => !inside(C) && C.len > 3 && !(C.len < 12 && (C.a.deg === 1 || C.b.deg === 1)));

  // ---- nodes
  const nodes = [], links = [], byRoot = new Map();
  const newNode = (x, z, junction) => { const n = { id: nodes.length, x, z, junction, deadEnd: false, sig: false, legs: 0, inLinks: [], outLinks: [], moves: [], occ: [] }; nodes.push(n); return n; };
  const jNode = (v) => { const r = root(v); let n = byRoot.get(r); if (!n) { n = newNode(0, 0, true); n.nv = 0; byRoot.set(r, n); } return n; };
  for (const v of verts.values()) if (v.deg > 0) { const n = jNode(v); n.x += v.x; n.z += v.z; n.nv++; }
  for (const n of nodes) { n.x /= n.nv; n.z /= n.nv; delete n.nv; }

  const width = (r) => r.w || 6;
  const endDir = (C, at) => {
    const P = C.pts, m = P.length / 2, [i, j] = at === 0 ? [0, 1] : [m - 1, m - 2];
    const ex = P[2 * j] - P[2 * i], ez = P[2 * j + 1] - P[2 * i + 1], l = hyp(ex, ez) || 1;
    return [ex / l, ez / l];
  };
  const endHalfW = (C, at) => width(C.seg[at === 0 ? 0 : C.seg.length - 1]) / 2;
  const legsOf = new Map();
  for (const C of chains) for (const at of [0, 1]) {
    const v = at === 0 ? C.a : C.b;
    if (!legsOf.has(v)) legsOf.set(v, []);
    legsOf.get(v).push({ C, at, u: endDir(C, at), hw: endHalfW(C, at) });
  }
  const atMapEdge = (x, z) => x < R.x0 + 60 || x > R.x1 - 60 || z < R.z0 + 60 || z > R.z1 - 60;
  // how far a chain end is cut back from its vertex so lanes stop before the crossing carriageways
  const cutBack = (C, at) => {
    const v = at === 0 ? C.a : C.b;
    if (v.deg === 1) return atMapEdge(v.x, v.z) ? 0 : 3;
    const u = endDir(C, at), own = endHalfW(C, at);
    let t = v.deg >= 3 ? 3 : 1.5;
    for (const o of legsOf.get(v)) {
      if (o.C === C && o.at === at) continue;
      const sin = Math.abs(u[0] * o.u[1] - u[1] * o.u[0]);
      if (sin < 0.2) continue;
      const along = v.deg >= 3 ? 0.3 * own * Math.abs(u[0] * o.u[0] + u[1] * o.u[1]) : 0;
      t = Math.max(t, o.hw / Math.max(0.35, sin) + 1.5 + along);
    }
    const B = bbox.get(root(v));
    if (B && (B[2] - B[0] > 1 || B[3] - B[1] > 1)) { // clustered junction: step out of its whole box
      for (let s = t; s < 40; s++) {
        const x = v.x + u[0] * s, z = v.z + u[1] * s;
        if (x < B[0] - 3 || x > B[2] + 3 || z < B[1] - 3 || z > B[3] + 3) { t = Math.max(t, Math.min(s, t + 12)); break; }
      }
    }
    return Math.min(t, 28);
  };
  const laneCount = (r, oneWay) => {
    const w = width(r);
    if (oneWay) return Math.max(1, Math.min(2, r.ln || (w >= 9 ? 2 : 1)));
    return Math.max(1, Math.min(2, r.ln ? Math.floor(r.ln / 2) : (w >= 13 ? 2 : 1)));
  };
  const laneOffsets = (r, oneWay, n) => { // lateral offsets to the right of travel, inner lane first
    const w = width(r), out = [];
    if (oneWay) {
      const tot = Math.max(n, r.ln || n), lw = w / tot, shift = tot > n ? lw * (tot - n) / 2 : 0;
      for (let k = 0; k < n; k++) out.push(lw * (k + 0.5) - w / 2 + shift);
    } else {
      const lw = w / (r.ln ? Math.max(2, r.ln) : 2 * n);
      for (let k = 0; k < n; k++) out.push(Math.max(1.65, lw * (k + 0.5)));
    }
    return out;
  };
  const addLink = (from, to, ax, az, dx, dz, len, r, lane, nl) => {
    const main = CLASS[r.c] >= 2;
    const L = { id: links.length, from: from.id, to: to.id, ax, az, dx, dz, len, heading: Math.atan2(dz, dx), lane, nl,
      cls: r.c, main, tw: !!r.tw, name: r.n || '', bridge: !!r.br, dens: DENSITY[r.c] * (BUSY_NAMES.test(r.n || '') ? 1.4 : 1),
      y0: 0, y1: 0, edgeR: 1.2, signal: false, axis: null, stopS: len, out: [], alt: null, cars: [], parked: null,
      cx: ax + dx * len / 2, cz: az + dz * len / 2 };
    L.y0 = heightAt(ax, az); L.y1 = heightAt(ax + dx * len, az + dz * len);
    if (!Number.isFinite(L.y0)) L.y0 = 0;
    if (!Number.isFinite(L.y1)) L.y1 = L.y0;
    links.push(L); from.outLinks.push(L); to.inLinks.push(L);
    return L;
  };
  const addMove = (I, O, turn, node) => {
    if (I.out.some(m => m.link === O)) return;
    const ex = I.ax + I.dx * I.len, ez = I.az + I.dz * I.len;
    const path = makePath(ex, ez, I.dx, I.dz, O.ax, O.az, O.dx, O.dz);
    const mv = { link: O, turn, from: I, node, path, cf: [], pri: (I.main ? 2 : 0) + (turn === 'S' || turn === 'R' ? 1 : 0) };
    I.out.push(mv); node.moves.push(mv);
  };
  const joinLanes = (I, O, turn, node) => { // inner to inner; the outermost incoming lane also feeds the extra outgoing lanes
    for (let k = 0; k < I.length; k++) {
      addMove(I[k], O[Math.min(k, O.length - 1)], turn, node);
      if (k === I.length - 1) for (let q = k + 1; q < O.length; q++) addMove(I[k], O[q], turn, node);
    }
  };

  const ends = new Map(); // junction node -> { ins, outs } lane groups meeting there
  const endsOf = (n) => { let e = ends.get(n); if (!e) ends.set(n, e = { ins: [], outs: [] }); return e; };
  for (const C of live) {
    let ta = cutBack(C, 0), tb = cutBack(C, 1);
    if (ta + tb > C.len - 5) { const k = Math.max(0.2, C.len - 5) / (ta + tb); ta *= k; tb *= k; }
    const P = C.pts, S = C.S;
    const cut = (s) => { let i = 0; while (i < S.length - 2 && S[i + 1] < s) i++; const f = (s - S[i]) / Math.max(1e-6, S[i + 1] - S[i]); return [P[2 * i] + (P[2 * i + 2] - P[2 * i]) * f, P[2 * i + 1] + (P[2 * i + 3] - P[2 * i + 1]) * f, i]; };
    const A = cut(ta), B = cut(C.len - tb);
    const pts = [A[0], A[1]], seg = [], flow = [];
    for (let i = A[2] + 1; i <= B[2]; i++) { seg.push(C.seg[i - 1]); flow.push(C.flow[i - 1]); pts.push(P[2 * i], P[2 * i + 1]); }
    seg.push(C.seg[B[2]]); flow.push(C.flow[B[2]]); pts.push(B[0], B[1]);
    for (let i = 0; i + 1 < pts.length / 2; i++) { // degenerate slivers left by the cut
      if (pts.length > 4 && hyp(pts[2 * i + 2] - pts[2 * i], pts[2 * i + 3] - pts[2 * i + 1]) < 0.3) { pts.splice(2 * i + (i === 0 ? 2 : 0), 2); seg.splice(i, 1); flow.splice(i, 1); i--; }
    }
    for (let guard = 0; guard < 50 && pts.length > 4; guard++) { // short leftovers straighten into a neighbour
      const m = pts.length / 2;
      let si = -1, sl = PIECE_MIN;
      for (let i = 0; i + 1 < m; i++) { const l = hyp(pts[2 * i + 2] - pts[2 * i], pts[2 * i + 3] - pts[2 * i + 1]); if (l < sl) { sl = l; si = i; } }
      if (si < 0) break;
      let pick = -1, dev = 3;
      for (const v of [si, si + 1]) {
        if (v <= 0 || v >= m - 1) continue;
        const d = segDist(pts[2 * v], pts[2 * v + 1], pts[2 * v - 2], pts[2 * v - 1], pts[2 * v + 2], pts[2 * v + 3]);
        if (d < dev) { dev = d; pick = v; }
      }
      if (pick < 0) break;
      pts.splice(2 * pick, 2); seg.splice(si, 1); flow.splice(si, 1);
    }
    const m = pts.length / 2, ns = m - 1;
    const na = jNode(C.a), nb = jNode(C.b);
    if (C.a.deg === 1) { na.deadEnd = atMapEdge(C.a.x, C.a.z); na.junction = false; }
    if (C.b.deg === 1) { nb.deadEnd = atMapEdge(C.b.x, C.b.z); nb.junction = false; }
    const bends = [];
    for (let i = 1; i < m - 1; i++) bends.push(newNode(pts[2 * i], pts[2 * i + 1], false));
    const sl = [], su = [];
    for (let i = 0; i < ns; i++) { const ex = pts[2 * i + 2] - pts[2 * i], ez = pts[2 * i + 3] - pts[2 * i + 1], l = hyp(ex, ez) || 1e-3; sl.push(l); su.push([ex / l, ez / l]); }
    const bendCut = [0]; // room for the inner lane at interior bends
    for (let i = 1; i < m - 1; i++) {
      const c = Math.max(-1, Math.min(1, su[i - 1][0] * su[i][0] + su[i - 1][1] * su[i][1]));
      const wmax = Math.max(width(seg[i - 1]), width(seg[i])) / 2;
      bendCut.push(Math.min(Math.max(0.4, (6 + wmax) * Math.tan(Math.acos(c) / 2)), 0.25 * Math.min(sl[i - 1], sl[i])));
    }
    bendCut.push(0);
    for (const dir of [1, -1]) {
      let prev = null;
      for (let j = 0; j < ns; j++) {
        const i = dir > 0 ? j : ns - 1 - j, r = seg[i], f = flow[i];
        if (f !== 0 && f !== dir) { prev = null; continue; }
        const one = f !== 0, nl = laneCount(r, one), offs = laneOffsets(r, one, nl);
        const ux = su[i][0] * dir, uz = su[i][1] * dir, rx = -uz, rz = ux; // right of travel: (-uz, ux)
        const va = dir > 0 ? i : i + 1, vb = dir > 0 ? i + 1 : i; // vertex indices in travel order
        const len = Math.max(0.5, sl[i] - bendCut[va] - bendCut[vb]);
        const x0 = pts[2 * va] + ux * bendCut[va], z0 = pts[2 * va + 1] + uz * bendCut[va];
        const from = va === 0 ? na : va === m - 1 ? nb : bends[va - 1], to = vb === 0 ? na : vb === m - 1 ? nb : bends[vb - 1];
        const lanes = offs.map((o, k) => addLink(from, to, x0 + rx * o, z0 + rz * o, ux, uz, len, r, k, nl));
        lanes.forEach((L, k) => { L.edgeR = Math.max(1.2, width(r) / 2 - offs[k]); });
        if (lanes.length > 1) { lanes[0].alt = lanes[1]; lanes[1].alt = lanes[0]; }
        if (prev) joinLanes(prev, lanes, turnKind(prev[0].dx, prev[0].dz, ux, uz), from);
        prev = lanes;
        if (va === 0 || va === m - 1) endsOf(from).outs.push({ lanes, C, at: va === 0 ? 0 : 1 });
        if (vb === 0 || vb === m - 1) endsOf(to).ins.push({ lanes, C, at: vb === 0 ? 0 : 1 });
      }
    }
  }

  // ---- junction moves and signals
  const sigNodes = [];
  for (const [n, E] of ends) {
    const legSet = new Set();
    for (const q of [...E.ins, ...E.outs]) legSet.add(q.C.a === q.C.b ? `${q.C.len}:${q.at}` : q.C);
    n.legs = legSet.size;
    for (const I of E.ins) {
      const opts = E.outs.map(O => ({ O, t: O.C === I.C && O.at === I.at ? 'U' : turnKind(I.lanes[0].dx, I.lanes[0].dz, O.lanes[0].dx, O.lanes[0].dz) }));
      let use = opts.filter(o => o.t !== 'U');
      if (!use.length) use = opts; // dead end: turn round
      for (const { O, t } of use) {
        if (t === 'S' || t === 'U') joinLanes(I.lanes, O.lanes, t, n);
        else if (t === 'R') addMove(I.lanes[I.lanes.length - 1], O.lanes[O.lanes.length - 1], 'R', n);
        else addMove(I.lanes[0], O.lanes[0], 'L', n);
      }
      for (const L of I.lanes) { // a lane whose turns all went to its sibling borrows the sibling's
        if (L.out.length) continue;
        const sib = I.lanes.find(q => q.out.length);
        if (sib) for (const mv of sib.out) addMove(L, mv.link, mv.turn, n);
      }
    }
    const classes = [...new Set([...E.ins, ...E.outs].map(q => q.C))].map(C => CLASS[C.seg[0].c] ?? 0);
    if (n.legs >= 3 && classes.filter(c => c >= 4).length >= 2 && classes.filter(c => c >= 3).length >= 3 && E.ins.length >= 2) {
      let ref = null, best = -1;
      for (const I of E.ins) { const c = CLASS[I.lanes[0].cls] + I.C.len * 1e-6; if (c > best) { best = c; ref = I.lanes[0]; } }
      sigNodes.push({ n, E, ref, rank: best });
    }
  }
  // signalised nodes of one complex junction share a plan (same cycle offset, axes from one reference direction)
  const grp = sigNodes.map((_, i) => i), gRoot = (i) => { while (grp[i] !== i) i = grp[i] = grp[grp[i]]; return i; };
  for (let i = 0; i < sigNodes.length; i++) for (let j = i + 1; j < sigNodes.length; j++) {
    if (hyp(sigNodes[i].n.x - sigNodes[j].n.x, sigNodes[i].n.z - sigNodes[j].n.z) < 75) { const a = gRoot(i), b = gRoot(j); if (a !== b) grp[b] = a; }
  }
  const plans = new Map(), sigIndex = new Map(sigNodes.map((q, i) => [q.n, i]));
  for (let i = 0; i < sigNodes.length; i++) { const g = gRoot(i), p = plans.get(g); if (!p || sigNodes[i].rank > p.rank) plans.set(g, { ref: sigNodes[i].ref, rank: sigNodes[i].rank, n: sigNodes[g].n }); }
  const signals = [];
  for (let i = 0; i < sigNodes.length; i++) {
    const { n, E } = sigNodes[i], plan = plans.get(gRoot(i)), ref = plan.ref;
    if (!plan.axes) { const o = ((Math.abs(Math.sin(plan.n.x * 3.917 + plan.n.z * 7.131)) * 9137.37) % 1) * CYCLE; plan.axes = [{ o, g: 0 }, { o, g: 1 }]; }
    for (const I of E.ins) {
      // an approach coming out of another node of the same plan (inside a dual carriageway box) has no second stop line
      const up = sigIndex.get(jNode(I.at === 0 ? I.C.b : I.C.a));
      if (up !== undefined && up !== i && gRoot(up) === gRoot(i) && I.C.len < 70) continue;
      const L0 = I.lanes[0], g = Math.abs(L0.dx * ref.dx + L0.dz * ref.dz) > 0.64 ? 0 : 1;
      for (const L of I.lanes) { L.signal = true; L.axis = plan.axes[g]; L.stopS = Math.max(0.5, L.len - 1.2); }
      const C = I.lanes[I.lanes.length - 1], e = C.edgeR + 0.9;
      const x = C.ax + C.dx * C.len - C.dz * e, z = C.az + C.dz * C.len + C.dx * e;
      signals.push({ x, z, y: heightAt(x, z) || 0, ry: Math.atan2(C.dz, -C.dx), ax: plan.axes[g] });
    }
    n.sig = true;
  }

  // ---- conflicts between moves through the same junction (crossing or merging paths from different lanes)
  for (const n of nodes) {
    if (!n.junction || n.moves.length < 2) continue;
    const M = n.moves;
    for (let a = 0; a < M.length; a++) for (let b = a + 1; b < M.length; b++) {
      const p = M[a], q = M[b];
      if (p.from === q.from) continue;
      if (p.link === q.link || pathsTouch(p.path, q.path)) { p.cf.push(q); q.cf.push(p); }
    }
  }

  // ---- spatial grid of links (by midpoint) for streaming and queries
  const CELL = 100, grid = new Map(), gk = (i, j) => i * 65536 + j;
  for (const L of links) { const k = gk(Math.floor(L.cx / CELL), Math.floor(L.cz / CELL)); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(L); }
  const linksNear = (x, z, r, out = []) => {
    out.length = 0;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL), r2 = r * r;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const c = grid.get(gk(i, j));
      if (c) for (const L of c) if ((L.cx - x) ** 2 + (L.cz - z) ** 2 <= r2) out.push(L);
    }
    return out;
  };
  for (const n of nodes) for (const mv of n.moves) delete mv.path._rs;
  const nJ = nodes.filter(n => n.junction && n.moves.length).length;
  return { nodes, links, signals, linksNear, phase: signalPhase, CYCLE,
    stats: { chains: chains.length, live: live.length, links: links.length, nodes: nodes.length, junctions: nJ, signals: sigNodes.length, ms: Math.round(performance.now() - t0) } };
}

// true when two paths come within about a car width of each other anywhere (both resampled every ~1.5 m)
const _pa = {};
function resample(P) {
  const k = Math.max(2, Math.ceil(P.len / 1.5) + 1), out = new Float32Array(k * 2);
  for (let i = 0; i < k; i++) { pathAt(P, P.len * i / (k - 1), _pa, 0); out[2 * i] = _pa.x; out[2 * i + 1] = _pa.z; }
  return out;
}
function pathsTouch(P, Q) {
  const A = P._rs || (P._rs = resample(P)), B = Q._rs || (Q._rs = resample(Q)), lim = 2.0 * 2.0;
  for (let i = 0; i < A.length; i += 2) for (let j = 0; j < B.length; j += 2) {
    const ex = A[i] - B[j], ez = A[i + 1] - B[j + 1];
    if (ex * ex + ez * ez < lim) return true;
  }
  return false;
}
