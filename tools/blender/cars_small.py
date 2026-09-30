# Procedural Ukrainian street-mix passenger cars for the Cherkasy traffic -> public/assets/city/vehicles_cars.glb
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/cars_small.py -- \
#       [--only sedan,suv] [--preview DIR] [--atlas preview_atlas.png] [--no-ao] [--no-export]
#
# Contract (same as vehicles.glb, see loadVehicleModels in src/world/vehicles.js):
#   mesh / node names <type>, <type>_l1, <type>_l2; one primitive each, no materials
#   TEXCOORD_0 -> vehicles_atlas2.webp (2048^2; the Cherkasy repaint adds the UA plate + ТАКСІ sign regions)
#   TEXCOORD_1.x = integer part id (src/world/partmat.js PART), COLOR_0.r = baked AO (linear, loader applies ^(1/2.2))
#   model frame: origin at the floor centre, +X forward, +Y up, +Z = right side, metres
# Everything is built in that game frame and converted to Blender Z-up ((x, y, z) -> (x, -z, y)) at the end.
import bpy, math, os, sys, time
from bisect import bisect_right
from math import sin, cos, pi, sqrt, radians
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'city', 'vehicles_cars.glb')
ATLAS = os.path.join(ROOT, 'public', 'assets', 'city', 'tex', 'vehicles_atlas2.webp')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else default
PREVIEW = arg('--preview')
ONLY = arg('--only')
PREVIEW_ATLAS = arg('--atlas', ATLAS)
NO_AO = '--no-ao' in argv
NO_EXPORT = '--no-export' in argv

# part ids (src/world/partmat.js)
BASE, PAINT, METAL, GLASS, LAMP, RUBBER, PLASTIC, HEAD, TAIL, TAXI = 0, 1, 2, 3, 4, 5, 6, 7, 8, 15

# ---------------------------------------------------------------- atlas (pixels of the 2048 atlas, v top-down)
A = 2048.0
def _px(x, y): return (x / A, y / A)
def _rc(x0, y0, x1, y1): return (x0 / A, y0 / A, x1 / A, y1 / A)
SW = {  # flat swatches (32 px cells)
    'white': _px(922, 1741), 'black': _px(816, 1808), 'dark': _px(848, 1808), 'lgrey': _px(880, 1808), 'grey': _px(976, 1808),
    'silver': _px(1008, 1808), 'red': _px(784, 1840), 'orange': _px(816, 1840), 'amber': _px(912, 1840), 'offwhite': _px(944, 1840),
    'dgrey': _px(976, 1840), 'grey58': _px(816, 1872),
}
RC = {
    'head': _rc(6, 776, 250, 1016), 'head_lens': _rc(34, 822, 138, 926), 'head_strip': _rc(16, 900, 246, 990),
    'tail': _rc(262, 776, 508, 1016), 'tail_red': _rc(290, 790, 480, 880), 'tail_block': _rc(266, 928, 506, 1006),
    'grille_hex': _rc(530, 784, 750, 1008), 'grille_bars': _rc(784, 788, 1008, 1004), 'louvre': _rc(520, 1160, 760, 1234),
    'checker': _rc(0, 1152, 512, 1184),
    'plate': _rc(0, 1296, 512, 1400),        # Ukrainian plate (drawn by ukrainianAtlas in src/world/cherkasy/traffic.js)
    'sign': _rc(512, 1316, 1000, 1404),      # ТАКСІ roof sign (idem)
    'ad': _rc(1024, 0, 1536, 170),           # ad slot 0: part 15 with u >= 0.5 is re-targeted to one of 8 ads per car
    'card1': _rc(40, 20, 990, 330), 'card2': _rc(60, 360, 980, 660),  # interior photo cards behind the glass
}

def planar(rect, u_of, v_of, ub, vb):
    u0, v0, u1, v1 = rect
    def fn(pts):
        out = []
        for p in pts:
            tu = (u_of(p) - ub[0]) / ((ub[1] - ub[0]) or 1); tv = (v_of(p) - vb[0]) / ((vb[1] - vb[0]) or 1)
            tu = min(1.0, max(0.0, tu)); tv = min(1.0, max(0.0, tv))
            out.append((u0 + (u1 - u0) * tu, v0 + (v1 - v0) * tv))
        return out
    return fn

def front_uv(rect, z0, z1, y0, y1):  # a face looking along local +x: viewer's right = -z, top = +y
    return planar(rect, lambda p: -p[2], lambda p: -p[1], (-z1, -z0), (-y1, -y0))

# ---------------------------------------------------------------- mesh builder
def _d2(a, b): return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

class M:
    def __init__(s): s.V = []; s.F = []
    def v(s, p): s.V.append((float(p[0]), float(p[1]), float(p[2]))); return len(s.V) - 1
    def mark(s): return (len(s.V), len(s.F))
    def f(s, ids, part, uv, lpts=None):
        # uv: swatch (u, v) | list of per-corner uvs | fn(local points) -> uvs
        if callable(uv): uv = uv(lpts if lpts is not None else [s.V[i] for i in ids])
        per = not (isinstance(uv, tuple) and len(uv) == 2 and isinstance(uv[0], float))
        keep = []
        for j, i in enumerate(ids):
            if not keep or _d2(s.V[keep[-1][0]], s.V[i]) > 1e-12: keep.append((i, j))
        while len(keep) > 1 and _d2(s.V[keep[0][0]], s.V[keep[-1][0]]) < 1e-12: keep.pop()
        if len(keep) < 3: return
        # Newell area check
        nx = ny = nz = 0.0
        for a in range(len(keep)):
            p = s.V[keep[a][0]]; q = s.V[keep[(a + 1) % len(keep)][0]]
            nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1])
        if nx * nx + ny * ny + nz * nz < 1e-14: return
        s.F.append(([i for i, _ in keep], part, [uv[j] for _, j in keep] if per else [uv] * len(keep)))
    def tris(s): return sum(len(f[0]) - 2 for f in s.F)
    def xform(s, mk, fn):
        for i in range(mk[0], len(s.V)): s.V[i] = fn(s.V[i])
    def mirror_z(s, mk):  # duplicate everything since mark with z negated (winding reversed)
        v0, f0 = mk; nv = len(s.V); off = nv - v0
        for i in range(v0, nv): x, y, z = s.V[i]; s.V.append((x, y, -z))
        for i in range(f0, len(s.F)):
            ids, part, uvs = s.F[i]
            s.F.append(([j + off for j in reversed(ids)], part, list(reversed(uvs))))

def loft(m, rings, fn, closed=True, T=None):
    """rings: equal-length point loops ordered bottom -> +z -> top -> -z, stations along +x (local).
    fn(i, k, local_quad_pts) -> (part, uv) or None. Outward normals."""
    n = len(rings[0])
    ids = [[m.v(T(p) if T else p) for p in r] for r in rings]
    K = n if closed else n - 1
    for i in range(len(rings) - 1):
        for k in range(K):
            k2 = (k + 1) % n
            lp = [rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]]
            r = fn(i, k, lp)
            if r is None: continue
            m.f([ids[i][k], ids[i + 1][k], ids[i + 1][k2], ids[i][k2]], r[0], r[1], lp)
    return ids

def cap(m, ids, lpts, part, uv, front, inset=None, part_in=None, uv_in=None):
    """n-gon cap over a loft end ring (ids + local pts in loft order). front=True: normal +x."""
    order = list(range(len(ids)))
    if front: order.reverse()
    if inset is None:
        m.f([ids[i] for i in order], part, uv, [lpts[i] for i in order]); return
    c = [sum(p[a] for p in lpts) / len(lpts) for a in range(3)]
    ins = [(p[0], c[1] + (p[1] - c[1]) * inset[1], c[2] + (p[2] - c[2]) * inset[0]) for p in lpts]
    iid = [m.v(p) for p in ins]
    for a in range(len(order)):
        i, j = order[a], order[(a + 1) % len(order)]
        m.f([ids[i], ids[j], iid[j], iid[i]], part, uv, [lpts[i], lpts[j], ins[j], ins[i]])
    m.f([iid[i] for i in order], part_in, uv_in, [ins[i] for i in order])

def offset_poly(prof, d):
    """inset a CCW (z right, y up) polygon by d"""
    n = len(prof); out = []
    for i in range(n):
        p0, p1, p2 = prof[i - 1], prof[i], prof[(i + 1) % n]
        def nrm(a, b):
            dz, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dz, dy) or 1
            return (-dy / l, dz / l)  # left normal = inward for CCW
        n1, n2 = nrm(p0, p1), nrm(p1, p2)
        bz, by = n1[0] + n2[0], n1[1] + n2[1]; bl = math.hypot(bz, by) or 1
        bz, by = bz / bl, by / bl
        c = max(0.35, bz * n1[0] + by * n1[1])
        out.append((p1[0] + bz * d / c, p1[1] + by * d / c))
    return out

def rect_prof(z0, z1, y0, y1, c=0.0):
    if c <= 0: return [(z1, y0), (z1, y1), (z0, y1), (z0, y0)]
    c = min(c, (z1 - z0) * 0.45, (y1 - y0) * 0.45)
    return [(z1, y0 + c), (z1, y1 - c), (z1 - c, y1), (z0 + c, y1), (z0, y1 - c), (z0, y0 + c), (z0 + c, y0), (z1 - c, y0)]

def circ_prof(zc, yc, rz, ry, n):
    return [(zc + rz * cos(-pi / 2 + 2 * pi * i / n), yc + ry * sin(-pi / 2 + 2 * pi * i / n)) for i in range(n)]

def slab(m, prof, d0, d1, bev, part, uv_side, uv_front=None, back=False, uv_back=None, T=None, sides=True, part_front=None):
    """extrude a CCW (z, y) profile along local x from d0 to d1, chamfer bev on the front edge (and back if back=True)"""
    rings, xs = [], []
    if back and bev > 0: rings.append(offset_poly(prof, bev)); xs.append(d0)
    rings.append(prof); xs.append(d0 + (bev if back and bev > 0 else 0))
    if bev > 0: rings.append(prof); xs.append(d1 - bev); rings.append(offset_poly(prof, bev)); xs.append(d1)
    else: rings.append(prof); xs.append(d1)
    R = [[(x, y, z) for (z, y) in r] for x, r in zip(xs, rings)]
    zs = [p[0] for p in prof]; ys = [p[1] for p in prof]
    ids = [[m.v(T(p) if T else p) for p in r] for r in R]
    if sides:
        n = len(prof)
        for i in range(len(R) - 1):
            for k in range(n):
                k2 = (k + 1) % n
                lp = [R[i][k], R[i + 1][k], R[i + 1][k2], R[i][k2]]
                m.f([ids[i][k], ids[i + 1][k], ids[i + 1][k2], ids[i][k2]], part, uv_side, lp)
    fu = uv_front if uv_front is not None else uv_side
    if isinstance(fu, tuple) and len(fu) == 4: fu = front_uv(fu, min(zs), max(zs), min(ys), max(ys))
    cap(m, ids[-1], R[-1], part if part_front is None else part_front, fu, True)
    if back:
        bu = uv_back if uv_back is not None else uv_side
        if isinstance(bu, tuple) and len(bu) == 4:
            r = bu; bu = planar(r, lambda p: p[2], lambda p: -p[1], (min(zs), max(zs)), (-max(ys), -min(ys)))
        cap(m, ids[0], R[0], part, bu, False)

def wbox(m, x0, x1, y0, y1, z0, z1, part, uv, bev=0.0, uv_front=None, uv_back=None):
    slab(m, rect_prof(z0, z1, y0, y1, bev * 0.7), x0, x1, bev, part, uv, uv_front, True, uv_back)

def lathe(m, prof, segs, c, style, zsign=1):
    """revolve (r, dz) profile around an axis parallel to z through c; style(band, seg) -> (part, uv)"""
    ring = []
    for (r, dz) in prof:
        if r < 1e-6: vid = m.v((c[0], c[1], c[2] + dz)); ring.append([vid] * segs)
        else: ring.append([m.v((c[0] + r * cos(2 * pi * a / segs), c[1] + r * sin(2 * pi * a / segs), c[2] + dz)) for a in range(segs)])
    for j in range(len(prof) - 1):
        for a in range(segs):
            a2 = (a + 1) % segs
            r = style(j, a)
            if r is None: continue
            m.f([ring[j][a], ring[j][a2], ring[j + 1][a2], ring[j + 1][a]], r[0], r[1])

def pchip(xs, ys):
    n = len(xs)
    if n == 1: return lambda x: ys[0]
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    mm = [0.0] * n
    mm[0], mm[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0: mm[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            mm[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    if n > 2:  # no end overshoot
        if mm[0] * d[0] < 0: mm[0] = 0
        if mm[-1] * d[-1] < 0: mm[-1] = 0
    def f(x):
        if x <= xs[0]: return ys[0]
        if x >= xs[-1]: return ys[-1]
        i = min(max(bisect_right(xs, x) - 1, 0), n - 2)
        t = (x - xs[i]) / h[i]; t2 = t * t; t3 = t2 * t
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * mm[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * mm[i + 1]
    return f

def dedupe(xs, eps=0.012):
    out = []
    for x in sorted(xs):
        if not out or x - out[-1] > eps: out.append(x)
    return out

# ---------------------------------------------------------------- LOD settings
LODS = {
    0: dict(sp=0.2, arch=10, seg=3, csp=0.22, cseg=2, trim=0.03, wseg=15, det=2),
    1: dict(sp=0.62, arch=4, seg=1, csp=0.7, cseg=1, trim=0.0, wseg=8, det=1),
    2: dict(sp=99, arch=2, seg=0, csp=99, cseg=0, trim=0.0, wseg=6, det=0),
}

# ---------------------------------------------------------------- car builder
class Car:
    def __init__(s, S, lod):
        s.S, s.lod, s.L = S, lod, LODS[lod]
        s.W2 = S['W'] / 2
        kf = sorted(S['body'], key=lambda k: k[0])
        d = S.get('shorten', 0.0)  # pull the overhang keyframes in (bolt-on bumpers stick out past the body)
        if d:
            fa, ra = max(S['axles']), min(S['axles']); ar = S['tire'][0] + S.get('gap', 0.05) + 0.05
            kf = [((k[0] - d if k[0] > fa + ar else k[0] + d if k[0] < ra - ar else k[0]),) + tuple(k[1:]) for k in kf]
        if lod == 2: kf = [kf[0], kf[1], kf[-2], kf[-1]]
        s.kf = kf
        xs = [k[0] for k in kf]
        s.xr, s.xf = xs[0], xs[-1]
        s.f_yb = pchip(xs, [k[1] for k in kf]); s.f_yt = pchip(xs, [k[2] for k in kf])
        s.f_hw = pchip(xs, [k[3] * s.W2 for k in kf]); s.f_rk = pchip(xs, [(k[4] if len(k) > 4 else 0.0) for k in kf])
        s.R, s.tw = S['tire']
        s.Ra = s.R + S.get('gap', 0.05)
        s.axles = S['axles']
        s.wz = s.W2 - S.get('tin', 0.04) - s.tw / 2
        s.m = M()

    # ---- body section
    def sec(s, x):
        yb, yt, hw = s.f_yb(x), s.f_yt(x), s.f_hw(x)
        ybk = yb
        for wx in s.axles:
            dx = x - wx
            if abs(dx) <= s.Ra + 1e-6: yb = max(yb, s.R + sqrt(max(0.0, s.Ra * s.Ra - dx * dx)))
        return yb, yt, hw, ybk

    def half(s, x):
        S, L = s.S, s.L
        yb, yt, hw, ybk = s.sec(x)
        h = max(yt - yb, 0.02)
        rt = min(S['rt'], h * 0.4, hw * 0.4); tb = min(S['tb'], h * 0.25); ts = S['ts']
        ym = ybk + (yt - ybk) * S.get('ymf', 0.55)
        ym = min(max(ym, yb + tb + 0.01), yt - rt - 0.01)
        cr = S.get('crown', 0.0)
        if L['seg'] == 0:
            return [(0, yb), (hw, yb), (hw - ts, yt), (0, yt + cr)], ['under', 'lower', 'top']
        pts = [(0, yb), (hw - tb, yb), (hw, yb + tb), (hw, ym), (hw - ts, yt - rt)]
        lab = ['under', 'chamfer', 'lower', 'upper']
        cx, cy = hw - ts - rt, yt - rt
        for k in range(1, L['seg'] + 1):
            a = k / L['seg'] * pi / 2
            pts.append((cx + rt * cos(a), cy + rt * sin(a))); lab.append('shoulder')
        pts.append((0, yt + cr)); lab.append('top')
        return pts, lab

    def ring(s, x, pts):
        yb, yt = pts[0][1], pts[-1][1]
        rk = s.f_rk(x); h = max(yt - yb, 1e-3)
        full = pts + [(-z, y) for (z, y) in reversed(pts[1:-1])]
        return [(x - rk * (y - yb) / h, y, z) for (z, y) in full]

    def body_z(s, x, y):
        pts, lab = s.half(x)
        y = min(max(y, pts[0][1] + 1e-4), pts[-2][1] - 1e-4)
        best = None
        for (p, q), l in zip(zip(pts, pts[1:]), lab):
            if l in ('under', 'top'): continue
            lo, hi = min(p[1], q[1]), max(p[1], q[1])
            if lo - 1e-6 <= y <= hi + 1e-6 and max(p[0], q[0]) > 0.3 * s.W2:
                t = 0.5 if hi - lo < 1e-6 else (y - p[1]) / (q[1] - p[1])
                z = p[0] + (q[0] - p[0]) * t
                best = z if best is None else max(best, z)
        return best if best is not None else s.f_hw(x)

    def plane_x(s, y, front=True):
        x = s.xf if front else s.xr
        yb, yt = s.sec(x)[:2]
        return x - s.f_rk(x) * (y - yb) / max(yt - yb, 1e-3)

    def stations(s):
        L = s.L
        xs = [k[0] for k in s.kf]
        out = []
        for a, b in zip(xs, xs[1:]):
            n = max(1, math.ceil((b - a) / L['sp'] - 0.3))
            out += [a + (b - a) * i / n for i in range(n)]
        out.append(xs[-1])
        arch = set()
        for wx in s.axles:
            na = L['arch']
            for i in range(na + 1): arch.add(wx + s.Ra * cos(pi * i / na))
            if s.lod < 2: arch.update([wx - s.Ra - 0.02, wx + s.Ra + 0.02])
        # drop fill stations crowding the arches
        out = [x for x in out if x in xs or all(abs(x - a) > L['sp'] * 0.35 for a in arch)]
        return dedupe(out + [a for a in arch if s.xr < a < s.xf])

    # ---- lower body
    def build_body(s):
        S, m = s.S, s.m
        xs = s.stations()
        halves = [s.half(x) for x in xs]
        labels = halves[0][1]
        full_lab = labels + list(reversed(labels))
        rings = [s.ring(x, h[0]) for x, h in zip(xs, halves)]
        clad = S.get('clad', 0.0); bed = S.get('bed')
        pw = (PAINT, SW['white'])
        def fn(i, k, q):
            lab = full_lab[k]
            xm = sum(p[0] for p in q) / 4; ym = sum(p[1] for p in q) / 4
            if lab == 'under': return (PLASTIC, SW['black'])
            if clad and lab in ('chamfer', 'lower') and ym < clad: return (PLASTIC, SW['dark'])
            if bed and lab == 'top' and bed[0] < xm < bed[1]: return (PLASTIC, SW['dark'])
            return pw
        ids = loft(m, rings, fn)
        cap(m, ids[-1], rings[-1], PAINT, SW['white'], True)
        cap(m, ids[0], rings[0], PAINT, SW['white'], False)
        # wheel-well liners (stop the see-through above the tyres)
        if s.lod < 2:
            for wx in s.axles:
                mk = m.mark()
                z = s.wz - s.tw / 2 - 0.03; ytop = s.R + s.Ra; y0 = s.S['sill'] + 0.03
                a = [m.v((wx - s.Ra, y0, z)), m.v((wx + s.Ra, y0, z)), m.v((wx + s.Ra, ytop, z)), m.v((wx - s.Ra, ytop, z))]
                m.f([a[0], a[1], a[2], a[3]], PLASTIC, SW['black'])
                m.mirror_z(mk)

    # ---- greenhouse
    def build_cabin(s):
        S, L, m = s.S, s.L, s.m
        C = S['cab']
        kf = sorted(C['k'], key=lambda k: k[0])
        cx0, cx1 = kf[0][0], kf[-1][0]
        ytop_v = [(k[1] if k[1] is not None else s.sec(k[0])[1]) for k in kf]
        f_top = pchip([k[0] for k in kf], ytop_v)
        f_hwt = pchip([k[0] for k in kf], [k[2] * s.W2 for k in kf])
        t = L['trim']
        wins = C.get('win', []); ws = C.get('ws'); rw = C.get('rw')
        xs = [k[0] for k in kf]
        if s.lod == 2: xs = [cx0, cx1] + [k[0] for k in kf[1:-1] if k[1] is not None and abs(k[1] - max(ytop_v)) < 0.03][:1] + [kf[1][0], kf[-2][0]]
        edges = []
        for (a, b) in wins + ([ws] if ws else []) + ([rw] if rw else []):
            edges += [a, b] + ([a + t, b - t] if t else [])
        if s.lod < 2: xs += [e for e in edges if cx0 < e < cx1]
        xs = dedupe(xs, 0.008)
        fill = []
        for a, b in zip(xs, xs[1:]):
            n = max(1, math.ceil((b - a) / L['csp'] - 0.3))
            fill += [a + (b - a) * i / n for i in range(n)]
        xs = dedupe(fill + [xs[-1]], 0.008)
        cr = S.get('ccrown', 0.02)

        def chalf(x):
            bh, _ = s.half(x)
            yb = bh[-1][1] - S.get('crown', 0.0) - 0.004
            hwb = bh[-2][0] + 0.004
            ytop = max(f_top(x), yb); h = ytop - yb
            hwt = min(f_hwt(x), hwb)
            if h < 1e-3: hwt = hwb
            rr = min(C.get('rr', 0.07), h * 0.35, hwt * 0.4) if L['cseg'] else 0.0
            tb = min(0.03, h * 0.12) if t else 0.0
            def side(u): return (hwb + (hwt - hwb) * u, yb + (ytop - rr - yb) * u)
            span = max(ytop - rr - yb, 1e-6)
            if t:
                pts = [side(0), side(min(tb / span, 0.4)), side(max(1 - tb / span, 0.6)), side(1)]; lab = ['beltband', 'side', 'topband']
            else:
                pts = [side(0), side(1)]; lab = ['side']
            ccx, ccy = hwt - rr, ytop - rr
            for k in range(1, L['cseg'] + 1):
                a = k / L['cseg'] * pi / 2
                pts.append((ccx + rr * cos(a), ccy + rr * sin(a))); lab.append('corner')
            pts.append((0, ytop + (cr if h > 0.05 else 0))); lab.append('roof')
            return pts, lab, yb, ytop
        H = [chalf(x) for x in xs]
        lab = H[0][1]
        full_lab = lab + list(reversed(lab))
        rings = []
        for x, (pts, _, yb, ytop) in zip(xs, H):
            full = pts + [(-z, y) for (z, y) in reversed(pts[:-1])]
            rings.append([(x, y, z) for (z, y) in full])
        belt = min(h[2] for h in H); top = max(h[3] for h in H)
        trim = (METAL, SW['lgrey']) if C.get('trim') == 'chrome' else (PLASTIC, SW['black'])
        pillar_b = (PLASTIC, SW['black']) if C.get('bpillar', 'black') == 'black' else (PAINT, SW['white'])
        apil = (PLASTIC, SW['black']) if C.get('apillar') == 'black' else (PAINT, SW['white'])
        roofp = (PLASTIC, SW['black']) if C.get('roof') == 'black' else (PAINT, SW['white'])
        side_uv = planar(RC['card1'], lambda p: p[0], lambda p: -p[1], (cx0, cx1), (-top, -belt))
        ws_uv = planar(RC['card2'], lambda p: -p[2], lambda p: -p[1], (-s.W2 * 0.8, s.W2 * 0.8), (-top, -belt))
        rw_uv = planar(RC['card2'], lambda p: p[2], lambda p: -p[1], (-s.W2 * 0.8, s.W2 * 0.8), (-top, -belt))
        glass_side = (GLASS, side_uv)

        def where(xm, rng, tt):
            if not rng: return None
            a, b = rng
            if not (a < xm < b): return None
            ea = tt if a > cx0 + 0.01 else 0; eb = tt if b < cx1 - 0.01 else 0
            return 'trim' if (xm < a + ea or xm > b - eb) else 'in'
        def fn(i, k, q):
            lb = full_lab[k]
            xm = sum(p[0] for p in q) / 4
            w = None
            for r in wins:
                w = where(xm, r, t)
                if w: break
            if lb == 'side':
                if w == 'in': return glass_side
                if w == 'trim': return trim
                for (a, b) in [(wins[j][1], wins[j + 1][0]) for j in range(len(wins) - 1)]:
                    if a <= xm <= b and b - a < 0.25: return pillar_b
                return (PAINT, SW['white'])
            if lb in ('beltband', 'topband'):
                return trim if w else (PAINT, SW['white'])
            wsw = where(xm, ws, t + 0.01); rww = where(xm, rw, t + 0.01)
            if lb == 'corner':
                return apil if (wsw or rww) else roofp
            if wsw == 'in': return (GLASS, ws_uv)
            if rww == 'in': return (GLASS, rw_uv)
            if wsw or rww: return trim
            return roofp
        ids = loft(m, rings, fn, closed=False)
        # rear end with height: tailgate glass cap
        if H[0][3] - H[0][2] > 0.05:
            ri = C.get('rinset', (0.8, 0.72))
            cap(m, ids[0], rings[0], PAINT, SW['white'], False, inset=ri if s.lod < 2 else None, part_in=GLASS, uv_in=rw_uv)
            if s.lod == 2: s.m.F[-1] = (s.m.F[-1][0], GLASS, [SW['black']] * len(s.m.F[-1][0]))
        if H[-1][3] - H[-1][2] > 0.05:
            cap(m, ids[-1], rings[-1], GLASS, ws_uv, True)
        s.cab = dict(x0=cx0, x1=cx1, top=f_top, hwt=f_hwt, belt=belt, ytop=top, ws=ws)

    # ---- wheels
    def build_wheels(s):
        S, L, m = s.S, s.L, s.m
        R, tw = s.R, s.tw; Ri = R * S.get('rimk', 0.64); segs = L['wseg']
        style = S.get('wheel', 'alloy')
        rub = (RUBBER, SW['dark']); blk = (PLASTIC, SW['black'])
        rim = {'alloy': (METAL, SW['lgrey']), 'steel': (METAL, SW['grey']), 'hubcap': (PLASTIC, SW['silver']),
               'black': (PLASTIC, SW['grey58']), 'chromecap': (PLASTIC, SW['grey58'])}[style]
        hub = (METAL, SW['lgrey']) if style in ('alloy', 'chromecap', 'steel') else rim
        w2 = tw / 2
        if L['wseg'] >= 12:
            prof = [(Ri, -w2), (R - 0.03, -w2), (R, -w2 + 0.035), (R, w2 - 0.035), (R - 0.03, w2), (Ri, w2),
                    (Ri * 0.96, w2 - 0.012), (Ri * 0.88, w2 - 0.03), (Ri * 0.34, w2 - 0.035), (Ri * 0.22, w2 - 0.02), (0, w2 - 0.012)]
            def st(j, a):
                if j <= 4: return rub
                if j in (5, 6): return rim if style != 'chromecap' else rim
                if j == 7:
                    if style == 'alloy': return blk if a % 3 else rim
                    if style == 'hubcap': return blk if a % 3 == 1 else rim
                    if style == 'steel': return (PLASTIC, SW['dgrey']) if a % 5 == 2 else rim
                    return rim
                return hub
        elif L['wseg'] >= 8:
            prof = [(Ri, -w2), (R, -w2), (R, w2), (Ri, w2), (Ri * 0.3, w2 - 0.03), (0, w2 - 0.015)]
            def st(j, a):
                if j <= 2: return rub
                if j == 3: return (blk if (style == 'alloy' and a % 2) else rim)
                return hub
        else:
            prof = [(R, -w2), (R, w2), (0, w2)]
            def st(j, a): return rub if j == 0 else rim
        for wx in s.axles:
            mk = m.mark()
            c = (wx, R, s.wz)
            lathe(m, prof, segs, c, st)
            if L['wseg'] >= 8: lathe(m, [(0, -w2 + 0.02), (Ri, -w2)], segs, c, lambda j, a: blk)
            m.mirror_z(mk)

    # ---- details
    def fdecal(s, prof, depth, part, uv_front, uv_side=None, bev=0.0, mirror=True, rear=False, embed=0.03, sides=None, dx=0.0):
        m = s.m; mk = m.mark()
        if rear: T = lambda p: (s.plane_x(p[1], False) - p[0] - dx, p[1], -p[2])
        else: T = lambda p: (s.plane_x(p[1], True) + p[0] + dx, p[1], p[2])
        if s.L['det'] == 0: bev = 0.0; embed = 0.0
        slab(m, prof, -embed, depth, bev, part, uv_side if uv_side is not None else SW['black'], uv_front, T=T,
             sides=(s.L['det'] > 0) if sides is None else sides)
        if mirror: m.mirror_z(mk)

    def plate(s, y, rear=False, dx=0.0):
        if s.L['det'] == 0: return
        s.fdecal(rect_prof(-0.26, 0.26, y - 0.056, y + 0.056, 0.012), 0.012, BASE, RC['plate'], SW['black'], 0.004, mirror=False, rear=rear, dx=dx)

    def strip(s, x0, x1, y0, y1, out, part, uv, raised=0.0):
        """a band on the body side following its curvature (+z side, mirrored), clipped at the wheel arches"""
        ok = lambda x: s.sec(x)[0] < y0 - 0.01
        st = [x0] + [x for x in s.stations() if x0 < x < x1] + [x1]
        run = []
        for a, b in zip(st, st[1:]):
            oa, ob = ok(a), ok(b)
            if oa != ob:  # bisect the arch edge
                lo, hi = a, b
                for _ in range(20):
                    mid = (lo + hi) / 2
                    if ok(mid) == oa: lo = mid
                    else: hi = mid
                e = lo if oa else hi
                if oa: run.append(e); s._strip(run, y0, y1, out, part, uv, raised); run = []
                else: run = [e]
            elif oa:
                if not run: run = [a]
            if ob and (not run or run[-1] != b): run.append(b)
        if len(run) > 1: s._strip(run, y0, y1, out, part, uv, raised)

    def _strip(s, xs, y0, y1, out, part, uv, raised):
        if len(xs) < 2 or xs[-1] - xs[0] < 0.05: return
        m = s.m; mk = m.mark()
        if raised:
            rings = []
            for x in xs:
                za, zb = s.body_z(x, y0), s.body_z(x, y1)
                rings.append([(x, y0, za - 0.004), (x, y0, za + raised), (x, y1, zb + raised), (x, y1, zb - 0.004)])
            loft(m, rings, lambda i, k, q: (part, uv), closed=False)
            for r, fr in ((rings[0], False), (rings[-1], True)):
                ids = [m.v(p) for p in r]
                cap(m, ids, r, part, uv if not callable(uv) else SW['black'], fr)
        else:
            ids = [(m.v((x, y0, s.body_z(x, y0) + out)), m.v((x, y1, s.body_z(x, y1) + out))) for x in xs]
            for i in range(len(xs) - 1):
                q = [ids[i][0], ids[i + 1][0], ids[i + 1][1], ids[i][1]]
                m.f(q, part, uv)
        m.mirror_z(mk)

    def gap_line(s, x, y0, y1, w=0.006):
        """door shut line: thin dark band on the side at x"""
        m = s.m; mk = m.mark()
        ys = [y0, (y0 + y1) / 2, y1]
        ids = [(m.v((x - w, y, s.body_z(x - w, y) + 0.0025)), m.v((x + w, y, s.body_z(x + w, y) + 0.0025))) for y in ys]
        for i in range(len(ys) - 1):
            m.f([ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]], PLASTIC, SW['black'])
        m.mirror_z(mk)

    def mirrors(s, x, y, part=PAINT, uv=None):
        if s.L['det'] == 0: return
        m = s.m; mk = m.mark()
        uv = uv or SW['white']
        z = s.body_z(x, min(y, s.sec(x)[1] - s.S['rt'])) - 0.02
        bev = 0.025 if s.L['det'] > 1 else 0
        wbox(m, x - 0.05, x + 0.03, y + 0.02, y + 0.06, z, z + 0.06, PLASTIC, SW['black'], 0)  # stalk
        wbox(m, x - 0.07, x + 0.06, y + 0.02, y + 0.15, z + 0.05, z + 0.21, part, uv, bev, uv_back=SW['black'])
        m.mirror_z(mk)

    def handles(s, xs, y, part=PLASTIC, uv=None):
        if s.L['det'] < 2: return
        m = s.m; mk = m.mark()
        for x in xs:
            z = s.body_z(x, y)
            wbox(m, x - 0.1, x + 0.1, y - 0.018, y + 0.018, z - 0.01, z + 0.018, part, uv or SW['black'], 0.008)
        m.mirror_z(mk)

    def roof_y(s, x): return s.cab['top'](x) + s.S.get('ccrown', 0.02) * 0.6

    def rails(s, x0, x1, inset=0.1, part=PLASTIC, uv=None, h=0.06):
        if s.L['det'] == 0: return
        m = s.m; mk = m.mark(); uv = uv or SW['black']
        z = s.cab['hwt']((x0 + x1) / 2) - inset
        y = max(s.roof_y(x0), s.roof_y(x1), s.roof_y((x0 + x1) / 2)) + 0.005
        b = 0.012 if s.L['det'] > 1 else 0
        wbox(m, x0, x1, y + h - 0.03, y + h, z - 0.02, z + 0.02, part, uv, b)
        for xx in (x0 + 0.03, x1 - 0.06, (x0 + x1) / 2 - 0.015):
            if s.L['det'] < 2 and xx == (x0 + x1) / 2 - 0.015: continue
            wbox(m, xx, xx + 0.05, s.roof_y(xx + 0.02) - 0.02, y + h - 0.02, z - 0.018, z + 0.018, part, uv, 0)
        m.mirror_z(mk)

    def rack(s, x0, x1, inset=0.08):
        """old-school roof rack: rails + cross bars"""
        s.rails(x0, x1, inset, h=0.09)
        if s.L['det'] == 0: return
        m = s.m
        z = s.cab['hwt']((x0 + x1) / 2) - inset
        y = max(s.roof_y(x0), s.roof_y(x1), s.roof_y((x0 + x1) / 2)) + 0.005 + 0.09
        n = 4 if s.L['det'] > 1 else 2
        for i in range(n):
            xx = x0 + 0.08 + (x1 - x0 - 0.2) * i / (n - 1)
            wbox(m, xx, xx + 0.035, y - 0.03, y - 0.005, -z - 0.02, z + 0.02, PLASTIC, SW['black'], 0)

    def sign(s, x, kind='taxi'):
        m = s.m
        y = s.roof_y(x) - 0.01
        if kind == 'taxi':
            hw, hh, d = 0.26, 0.15, 0.085
            uvf = front_uv(RC['sign'], -hw, hw, y, y + hh)
        else:
            hw, hh, d = 0.36, 0.2, 0.11
            uvf = front_uv(RC['ad'], -hw, hw, y, y + hh)
        uvb = planar(RC['sign'] if kind == 'taxi' else RC['ad'], lambda p: p[2], lambda p: -p[1], (-hw, hw), (-(y + hh), -y))
        bev = 0.02 if s.L['det'] > 1 else 0
        slab(m, rect_prof(-hw, hw, y, y + hh, bev * 0.8), x - d, x + d, bev, TAXI, SW['amber'], uvf, True, uvb)

    def flares(s, part=PLASTIC, uv=None, w=0.075, out=0.03):
        if s.L['det'] == 0: return
        m = s.m; uv = uv or SW['dark']
        n = 12 if s.L['det'] > 1 else 5
        for wx in s.axles:
            mk = m.mark()
            rings = []
            th0 = 0.18
            for i in range(n + 1):
                th = pi - th0 - (pi - 2 * th0) * i / n  # rear -> front
                cx, cy = cos(th), sin(th)
                x = wx + s.Ra * cx; y = s.R + s.Ra * cy
                zb = s.body_z(x, max(y, s.sec(x)[0] + 0.01))
                pr = [(0.0, -0.006), (0.0, out), (w * 0.8, out * 0.9), (w, -0.006)]
                rings.append([(wx + (s.Ra + dr) * cx, s.R + (s.Ra + dr) * cy, zb + dz) for (dr, dz) in pr])
            loft(m, rings, lambda i, k, q: (part, uv), closed=False)
            m.mirror_z(mk)

    def run(s):
        s.build_body(); s.build_cabin(); s.build_wheels()
        s.S['details'](s)
        return s.m

# ---------------------------------------------------------------- detail recipes
def lamp_pair(c, z0, z1, y0, y1, rect, bev=0.02, depth=0.02, rear=False, part=None, ch=0.02, surround=None):
    part = part if part is not None else (TAIL if rear else HEAD)
    if surround:
        c.fdecal(rect_prof(z0 - 0.015, z1 + 0.015, y0 - 0.015, y1 + 0.015, ch + 0.01), depth * 0.6, surround[0], surround[1], surround[1], bev * 0.5, rear=rear)
    c.fdecal(rect_prof(z0, z1, y0, y1, ch), depth, part, rect, SW['black'], bev, rear=rear)

def round_lamp(c, zc, yc, r, rect=None, depth=0.03, rim=(METAL, SW['lgrey']), rear=False, part=HEAD):
    n = 14 if c.L['det'] > 1 else 7
    if c.L['det'] > 0:
        c.fdecal(circ_prof(zc, yc, r + 0.018, r + 0.018, n), depth * 0.6, rim[0], rim[1], rim[1], 0.008, rear=rear)
    rr = rect or RC['head_lens']
    c.fdecal(circ_prof(zc, yc, r, r, n), depth, part, front_uv(rr, zc - r, zc + r, yc - r, yc + r), SW['black'], 0.01, rear=rear)

def grille(c, hz, y0, y1, rect, part=PLASTIC, surround=None, depth=0.025, ch=0.02, bev=0.01):
    if surround:
        c.fdecal(rect_prof(-hz - 0.02, hz + 0.02, y0 - 0.02, y1 + 0.02, ch + 0.01), depth * 0.7, surround[0], surround[1], surround[1], bev, mirror=False)
    c.fdecal(rect_prof(-hz, hz, y0, y1, ch), depth, part, rect, SW['black'], bev, mirror=False)

def modern_front(c, hz_lamp, y_lamp, grille_hz, y_grille, grille_rect, intake=None, plate_y=None, lip=True, g_surround=None, lamp_rect='head'):
    lamp_pair(c, hz_lamp[0], hz_lamp[1], y_lamp[0], y_lamp[1], RC[lamp_rect], bev=0.015, depth=0.02, ch=0.03)
    grille(c, grille_hz, y_grille[0], y_grille[1], RC[grille_rect], surround=g_surround)
    if intake and c.L['det'] > 0:
        grille(c, intake[0], intake[1], intake[2], RC['louvre'], depth=0.015)
    if plate_y is not None: c.plate(plate_y, dx=0.02 if intake else 0.0)

def bumper_bar(c, y0, y1, depth=0.08, rear=False, part=METAL, uv=None, rubber=True, wrap=0.25):
    """old-school bolt-on bumper bar across the full width + wrap-around ends"""
    if c.L['det'] == 0: return
    m = c.m; uv = uv or SW['lgrey']
    x = c.xf if not rear else c.xr
    hw = c.f_hw(x - 0.05 if not rear else x + 0.05) + 0.03
    xp = c.plane_x((y0 + y1) / 2, not rear)
    b = 0.02 if c.L['det'] > 1 else 0
    if not rear:
        wbox(m, xp - 0.03, xp + depth, y0, y1, -hw + 0.05, hw - 0.05, part, uv, b)
        for sg in (1, -1):
            z0, z1 = (hw - 0.07, hw) if sg > 0 else (-hw, -hw + 0.07)
            wbox(m, xp - wrap, xp + depth - 0.03, y0, y1, z0, z1, part, uv, b)
        if rubber and c.L['det'] > 1:
            wbox(m, xp + depth - 0.01, xp + depth + 0.012, y0 + (y1 - y0) * 0.35, y0 + (y1 - y0) * 0.7, -hw + 0.07, hw - 0.07, PLASTIC, SW['black'], 0.004)
    else:
        wbox(m, xp - depth, xp + 0.03, y0, y1, -hw + 0.05, hw - 0.05, part, uv, b)
        for sg in (1, -1):
            z0, z1 = (hw - 0.07, hw) if sg > 0 else (-hw, -hw + 0.07)
            wbox(m, xp - depth + 0.03, xp + wrap, y0, y1, z0, z1, part, uv, b)
        if rubber and c.L['det'] > 1:
            wbox(m, xp - depth - 0.012, xp - depth + 0.01, y0 + (y1 - y0) * 0.35, y0 + (y1 - y0) * 0.7, -hw + 0.07, hw - 0.07, PLASTIC, SW['black'], 0.004)

def lip(c, y0, y1, hz, rear=False, uv=None, depth=0.03, part=PLASTIC):
    c.fdecal(rect_prof(-hz, hz, y0, y1, 0.02), depth, part, uv or SW['dark'], uv or SW['dark'], 0.01, mirror=False, rear=rear)

def side_step(c, x0, x1, y, part=METAL, uv=None):
    if c.L['det'] == 0: return
    m = c.m; mk = m.mark()
    z = c.body_z((x0 + x1) / 2, y + 0.1)
    wbox(m, x0, x1, y - 0.03, y + 0.02, z - 0.1, z + 0.08, part, uv or SW['grey'], 0.015 if c.L['det'] > 1 else 0)
    m.mirror_z(mk)

def std_side(c, doors, y_handle, gaps=True, handle_part=PLASTIC, handle_uv=None):
    c.handles(doors, y_handle, handle_part, handle_uv)
    if gaps and c.L['det'] > 1:
        belt = c.cab['belt']
        for x in c.S.get('gaps', []):
            c.gap_line(x, c.S['sill'] + 0.06, belt - 0.03)

# ---------------------------------------------------------------- the cars
def d_sedan2(c):  # VAZ-2107 "Zhiguli": chrome everything
    grille(c, 0.3, 0.5, 0.75, RC['grille_bars'], part=METAL, surround=(METAL, SW['lgrey']), depth=0.06, ch=0.01)
    # square twin-lens headlamp units in chrome frames
    if c.L['det'] > 0:
        c.fdecal(rect_prof(0.33, 0.76, 0.52, 0.74, 0.015), 0.025, METAL, SW['lgrey'], SW['lgrey'], 0.008)
        c.fdecal(rect_prof(0.345, 0.745, 0.535, 0.725, 0.012), 0.03, PLASTIC, SW['black'], SW['black'], 0.0)
    round_lamp(c, 0.45, 0.63, 0.075, depth=0.045, rim=(METAL, SW['lgrey']))
    round_lamp(c, 0.64, 0.63, 0.075, depth=0.045, rim=(METAL, SW['lgrey']))
    c.fdecal(rect_prof(0.62, 0.76, 0.40, 0.48, 0.01), 0.02, BASE, SW['orange'], SW['black'], 0.005) if c.L['det'] > 1 else None
    bumper_bar(c, 0.36, 0.48, 0.09)
    bumper_bar(c, 0.36, 0.48, 0.09, rear=True)
    c.plate(0.42, dx=0.1)
    # big tail-lamp blocks
    lamp_pair(c, 0.34, 0.77, 0.60, 0.80, RC['tail'], bev=0.01, depth=0.02, rear=True, ch=0.01, surround=(METAL, SW['lgrey']))
    c.plate(0.54, rear=True)
    c.strip(-1.95, 1.95, 0.605, 0.625, 0, METAL, SW['lgrey'], raised=0.008)  # chrome side moulding
    c.mirrors(0.62, c.cab['belt'] + 0.02, METAL, SW['lgrey'])
    std_side(c, [0.2, -0.75], c.cab['belt'] - 0.09, handle_part=METAL, handle_uv=SW['lgrey'])
    lip(c, 0.3, 0.36, 0.7) if c.L['det'] > 1 else None

def d_sedan(c):  # modern liftback (Octavia-ish)
    modern_front(c, (0.40, 0.72), (0.53, 0.65), 0.3, (0.44, 0.61), 'grille_bars', intake=(0.5, 0.26, 0.37), plate_y=0.32, g_surround=(METAL, SW['lgrey']))
    lamp_pair(c, 0.42, 0.74, 0.70, 0.84, RC['tail'], bev=0.012, depth=0.02, rear=True, ch=0.025)
    lip(c, 0.3, 0.37, 0.72, rear=True)
    c.plate(0.56, rear=True)
    c.mirrors(0.72, c.cab['belt'] + 0.02)
    std_side(c, [0.25, -0.85], c.cab['belt'] - 0.1, handle_part=PAINT, handle_uv=SW['white'])
    c.strip(-1.6, 1.6, 0.30, 0.33, 0, PLASTIC, SW['black'], raised=0.006) if c.L['det'] > 1 else None

def d_hatch(c):  # Golf-ish
    modern_front(c, (0.40, 0.71), (0.56, 0.67), 0.42, (0.57, 0.645), 'louvre', intake=(0.55, 0.26, 0.41), plate_y=0.335, g_surround=None)
    if c.L['det'] > 1: c.fdecal(rect_prof(-0.42, 0.42, 0.645, 0.655, 0.0), 0.028, METAL, SW['lgrey'], SW['lgrey'], 0.0, mirror=False)
    lamp_pair(c, 0.44, 0.74, 0.74, 0.88, RC['tail'], bev=0.012, depth=0.02, rear=True, ch=0.02)
    lip(c, 0.3, 0.38, 0.72, rear=True)
    c.plate(0.6, rear=True)
    c.mirrors(0.62, c.cab['belt'] + 0.02)
    std_side(c, [0.15, -0.9], c.cab['belt'] - 0.1, handle_part=PAINT, handle_uv=SW['white'])

def d_cross(c):  # Duster-ish
    grille(c, 0.38, 0.66, 0.84, RC['grille_bars'], part=METAL, surround=(METAL, SW['lgrey']), depth=0.03)
    lamp_pair(c, 0.44, 0.74, 0.71, 0.855, RC['head'], bev=0.015, depth=0.025, ch=0.03)
    lip(c, 0.42, 0.62, 0.8, depth=0.05)
    if c.L['det'] > 0:
        c.fdecal(rect_prof(-0.36, 0.36, 0.43, 0.5, 0.02), 0.07, METAL, SW['silver'], SW['silver'], 0.01, mirror=False)  # skid plate
        round_lamp(c, 0.62, 0.53, 0.045, depth=0.06, rim=(PLASTIC, SW['black']))
    c.plate(0.58, dx=0.03)
    lamp_pair(c, 0.52, 0.8, 0.78, 0.98, RC['tail'], bev=0.012, depth=0.02, rear=True, ch=0.02)
    lip(c, 0.44, 0.62, 0.84, rear=True, depth=0.05)
    if c.L['det'] > 0: c.fdecal(rect_prof(-0.34, 0.34, 0.45, 0.5, 0.02), 0.07, METAL, SW['silver'], SW['silver'], 0.01, mirror=False, rear=True)
    c.plate(0.72, rear=True)
    c.flares()
    c.rails(-1.85, -0.05, 0.12, METAL, SW['silver'])
    c.mirrors(0.6, c.cab['belt'] + 0.02, PLASTIC, SW['black'])
    std_side(c, [0.1, -0.95], c.cab['belt'] - 0.1)

def d_suv(c):  # Lada Niva
    # full-width black grille panel with round lamps
    if c.L['det'] > 0:
        c.fdecal(rect_prof(-0.76, 0.76, 0.61, 0.8, 0.02), 0.02, PLASTIC, RC['louvre'], SW['black'], 0.008, mirror=False)
    else:
        c.fdecal(rect_prof(-0.76, 0.76, 0.61, 0.8, 0.0), 0.02, PLASTIC, SW['black'], SW['black'], 0.0, mirror=False)
    round_lamp(c, 0.58, 0.705, 0.085, depth=0.04, rim=(METAL, SW['lgrey']))
    if c.L['det'] > 1: c.fdecal(rect_prof(0.69, 0.78, 0.52, 0.57, 0.01), 0.02, BASE, SW['orange'], SW['black'], 0.004)
    bumper_bar(c, 0.40, 0.53, 0.1, part=METAL, uv=SW['grey'], rubber=True, wrap=0.2)
    bumper_bar(c, 0.40, 0.53, 0.1, rear=True, part=METAL, uv=SW['grey'], rubber=True, wrap=0.2)
    c.plate(0.465, dx=0.1)
    lamp_pair(c, 0.62, 0.8, 0.64, 0.84, RC['tail'], bev=0.01, depth=0.02, rear=True, ch=0.01)
    c.plate(0.62, rear=True)
    c.mirrors(0.45, c.cab['belt'] + 0.02, PLASTIC, SW['black'])
    std_side(c, [-0.45], c.cab['belt'] - 0.1, handle_part=METAL, handle_uv=SW['lgrey'])
    c.rack(-1.6, -0.05)
    c.strip(-1.85, 1.85, 0.555, 0.575, 0, PLASTIC, SW['black'], raised=0.006) if c.L['det'] > 1 else None

def d_suv2(c):  # Land Cruiser-ish
    grille(c, 0.48, 0.74, 1.02, RC['grille_bars'], part=METAL, surround=(METAL, SW['lgrey']), depth=0.035)
    lamp_pair(c, 0.53, 0.81, 0.86, 1.02, RC['head'], bev=0.015, depth=0.025, ch=0.035)
    lip(c, 0.5, 0.72, 0.82, depth=0.06, uv=SW['dgrey'])
    if c.L['det'] > 0:
        c.fdecal(rect_prof(-0.8, 0.8, 0.705, 0.725, 0.005), 0.07, METAL, SW['lgrey'], SW['lgrey'], 0.004, mirror=False)
        round_lamp(c, 0.66, 0.6, 0.05, depth=0.07, rim=(METAL, SW['lgrey']))
    c.plate(0.62, dx=0.04)
    lamp_pair(c, 0.58, 0.84, 0.9, 1.12, RC['tail'], bev=0.012, depth=0.02, rear=True, ch=0.02)
    lip(c, 0.52, 0.72, 0.86, rear=True, depth=0.06, uv=SW['dgrey'])
    if c.L['det'] > 1: c.fdecal(rect_prof(-0.5, 0.5, 1.02, 1.07, 0.01), 0.02, METAL, SW['lgrey'], SW['lgrey'], 0.005, mirror=False, rear=True)
    c.plate(0.86, rear=True)
    c.flares(PAINT, SW['white'], w=0.07, out=0.035)
    c.rails(-2.3, 0.0, 0.14, METAL, SW['silver'])
    side_step(c, c.axles[1] + c.Ra + 0.08, c.axles[0] - c.Ra - 0.08, 0.42)
    c.mirrors(0.7, c.cab['belt'] + 0.02)
    std_side(c, [0.3, -0.9], c.cab['belt'] - 0.1, handle_part=METAL, handle_uv=SW['lgrey'])

def d_pickup(c):  # Hilux-ish double cab
    m = c.m
    grille(c, 0.44, 0.72, 0.97, RC['grille_bars'], part=METAL, surround=(METAL, SW['lgrey']), depth=0.035)
    lamp_pair(c, 0.49, 0.77, 0.83, 0.97, RC['head'], bev=0.015, depth=0.025, ch=0.03)
    lip(c, 0.48, 0.69, 0.8, depth=0.07)
    if c.L['det'] > 0:
        c.fdecal(rect_prof(-0.4, 0.4, 0.49, 0.56, 0.02), 0.09, METAL, SW['silver'], SW['silver'], 0.01, mirror=False)
    c.plate(0.6, dx=0.05)
    # bed walls + tailgate
    bx0, bx1 = c.S['bed']
    yt = 1.16; yf = c.f_yt((bx0 + bx1) / 2)
    if c.L['det'] >= 0:
        mk = m.mark()
        hw = c.f_hw((bx0 + bx1) / 2)
        b = 0.015 if c.L['det'] > 1 else 0
        wbox(m, bx0 - 0.005, bx1 + 0.03, yf - 0.1, yt, hw - 0.07, hw + 0.003, PAINT, SW['white'], b)
        m.mirror_z(mk)
        hw2 = c.f_hw(c.xr + 0.05)
        wbox(m, c.xr - 0.005, bx0 + 0.05, 0.62, yt, -hw2 + 0.003, hw2 - 0.003, PAINT, SW['white'], b)  # tailgate
        wbox(m, bx1 - 0.06, bx1 + 0.02, yf - 0.05, yt - 0.02, -hw + 0.05, hw - 0.05, PAINT, SW['white'], 0)  # bed front wall
    # tail lamps on the bed corners
    if c.L['det'] > 0:
        mk = m.mark()
        hw2 = c.f_hw(c.xr + 0.05)
        slab(m, rect_prof(hw2 - 0.12, hw2 - 0.005, 0.78, 1.1, 0.015), c.xr - 0.02, c.xr + 0.02, 0.008, TAIL, SW['black'],
             front_uv(RC['tail'], hw2 - 0.12, hw2, 0.78, 1.1), T=lambda p: (2 * c.xr - p[0], p[1], -p[2]))
        m.mirror_z(mk)
    else:
        mk = m.mark(); hw2 = c.f_hw(c.xr + 0.05)
        slab(m, rect_prof(hw2 - 0.12, hw2, 0.78, 1.1, 0.0), c.xr - 0.02, c.xr - 0.01, 0, TAIL, SW['red'], None, T=lambda p: (2 * c.xr - p[0], p[1], -p[2]), sides=False)
        m.mirror_z(mk)
    if c.L['det'] > 0:
        bumper_bar(c, 0.5, 0.62, 0.1, rear=True, part=METAL, uv=SW['grey'], rubber=False, wrap=0.15)
        c.plate(0.72, rear=True, dx=0.005)
    c.flares(w=0.08, out=0.04)
    side_step(c, c.axles[1] + c.Ra + 0.08, c.axles[0] - c.Ra - 0.08, 0.4, PLASTIC, SW['dark'])
    c.mirrors(0.85, c.cab['belt'] + 0.02, METAL, SW['lgrey'])
    std_side(c, [0.4, -0.55], c.cab['belt'] - 0.1, handle_part=METAL, handle_uv=SW['lgrey'])

def d_taxi(c):  # Daewoo Lanos taxi
    lamp_pair(c, 0.34, 0.64, 0.52, 0.645, RC['head'], bev=0.015, depth=0.02, ch=0.045)
    grille(c, 0.22, 0.5, 0.6, RC['louvre'], surround=(METAL, SW['lgrey']), ch=0.035)
    lip(c, 0.3, 0.36, 0.7)
    c.plate(0.33, dx=0.04)
    lamp_pair(c, 0.4, 0.68, 0.66, 0.8, RC['tail'], bev=0.012, depth=0.02, rear=True, ch=0.03)
    c.plate(0.5, rear=True)
    lip(c, 0.3, 0.37, 0.7, rear=True)
    c.sign(-0.25, 'taxi')
    if c.L['det'] > 0: c.strip(-1.05, 0.72, 0.5, 0.58, 0.003, BASE, planar(RC['checker'], lambda p: p[0], lambda p: -p[1], (-1.05, 0.72), (-0.58, -0.5)))
    c.strip(-1.6, 1.6, 0.44, 0.47, 0, PLASTIC, SW['black'], raised=0.008) if c.L['det'] > 1 else None
    c.mirrors(0.58, c.cab['belt'] + 0.02, PLASTIC, SW['black'])
    std_side(c, [0.15, -0.75], c.cab['belt'] - 0.1)

def d_taxi_hy(c):  # Prius-ish hybrid (Uklon-style roof ad sign)
    modern_front(c, (0.38, 0.7), (0.49, 0.59), 0.28, (0.47, 0.52), 'louvre', intake=(0.45, 0.25, 0.38), plate_y=0.32)
    lamp_pair(c, 0.38, 0.72, 0.8, 0.92, RC['tail'], bev=0.01, depth=0.02, rear=True, ch=0.02)
    lip(c, 0.32, 0.4, 0.72, rear=True)
    c.plate(0.62, rear=True)
    c.sign(-0.45, 'ad')
    c.mirrors(0.9, c.cab['belt'] + 0.02)
    std_side(c, [0.3, -0.75], c.cab['belt'] - 0.1, handle_part=PAINT, handle_uv=SW['white'])

def d_taxi_mv(c):  # compact MPV cab
    modern_front(c, (0.42, 0.76), (0.6, 0.72), 0.36, (0.58, 0.7), 'grille_hex', intake=(0.55, 0.28, 0.43), plate_y=0.355, g_surround=(METAL, SW['lgrey']))
    lamp_pair(c, 0.52, 0.78, 0.72, 0.94, RC['tail'], bev=0.012, depth=0.02, rear=True, ch=0.02)
    lip(c, 0.32, 0.42, 0.8, rear=True)
    c.plate(0.68, rear=True)
    c.sign(-0.35, 'ad')
    c.rails(-2.1, 0.0, 0.12, PLASTIC, SW['black'])
    c.mirrors(1.28, c.cab['belt'] + 0.02)
    std_side(c, [0.3, -0.6], c.cab['belt'] - 0.1, handle_part=PAINT, handle_uv=SW['white'])
    if c.L['det'] > 1: c.strip(-1.45, -0.45, c.cab['belt'] - 0.03, c.cab['belt'] - 0.01, 0, METAL, SW['grey'], raised=0.01)  # sliding-door rail

def d_taxi_gr(c):  # ZAZ Tavria, private cab with a ТАКСІ sign
    if c.L['det'] > 0:
        c.fdecal(rect_prof(-0.66, 0.66, 0.47, 0.6, 0.01), 0.015, PLASTIC, RC['louvre'], SW['black'], 0.005, mirror=False)
    lamp_pair(c, 0.38, 0.62, 0.49, 0.59, RC['head_strip'], bev=0.01, depth=0.03, ch=0.01, surround=(METAL, SW['lgrey']) if c.L['det'] > 1 else None)
    bumper_bar(c, 0.30, 0.44, 0.08, part=PLASTIC, uv=SW['dark'], rubber=False, wrap=0.15)
    bumper_bar(c, 0.30, 0.44, 0.08, rear=True, part=PLASTIC, uv=SW['dark'], rubber=False, wrap=0.15)
    c.plate(0.38, dx=0.08)
    lamp_pair(c, 0.42, 0.7, 0.60, 0.74, RC['tail_block'], bev=0.01, depth=0.02, rear=True, ch=0.01)
    c.plate(0.53, rear=True)
    c.sign(-0.5, 'taxi')
    c.mirrors(0.42, c.cab['belt'] + 0.02, PLASTIC, SW['black'])
    std_side(c, [-0.2], c.cab['belt'] - 0.1)

# specs: body keyframes (x, yb, yt, half-width fraction, rake); cab keyframes (x, roof y | None = belt, roof half-width fraction)
CARS = {
    'sedan2': dict(  # VAZ-2107 "Zhiguli": 4.13 x 1.62 x 1.44
        L=4.13, W=1.62, H=1.44, tire=(0.288, 0.175), axles=(1.345, -1.079), tin=0.04, sill=0.27, shorten=0.1, wheel='chromecap', rimk=0.6,
        rt=0.04, tb=0.03, ts=0.02, ymf=0.62, crown=0.0,
        body=[(-2.065, 0.37, 0.84, 0.965), (-2.035, 0.30, 0.88, 0.99), (-1.9, 0.28, 0.89, 1.0), (-1.3, 0.27, 0.885, 1.0), (0.75, 0.27, 0.87, 1.0),
              (0.9, 0.27, 0.86, 1.0), (1.9, 0.27, 0.82, 1.0), (2.035, 0.29, 0.8, 0.99), (2.065, 0.36, 0.77, 0.97)],
        cab=dict(k=[(-1.38, None, 0.9), (-1.2, 1.2, 0.86), (-0.95, 1.42, 0.83), (-0.4, 1.44, 0.83), (0.18, 1.43, 0.83), (0.45, 1.19, 0.86), (0.74, None, 0.9)],
                 ws=(0.2, 0.74), rw=(-1.38, -0.93), win=[(-0.9, -0.1), (-0.03, 0.74)], trim='chrome', bpillar='black', rr=0.04),
        gaps=[0.8, -0.06, -0.95], details=d_sedan2),
    'sedan': dict(  # modern liftback (Octavia-ish): 4.67 x 1.81 x 1.46
        L=4.67, W=1.81, H=1.46, tire=(0.316, 0.205), axles=(1.435, -1.245), tin=0.035, sill=0.25, wheel='alloy',
        rt=0.1, tb=0.05, ts=0.04, ymf=0.55, crown=0.01,
        body=[(-2.335, 0.38, 0.93, 0.86, -0.05), (-2.24, 0.29, 0.99, 0.94), (-2.0, 0.25, 1.0, 0.985), (-1.4, 0.24, 0.98, 1.0), (0.0, 0.24, 0.93, 1.0),
              (0.85, 0.24, 0.88, 1.0), (1.5, 0.23, 0.83, 1.0), (2.1, 0.22, 0.785, 0.985), (2.22, 0.25, 0.75, 0.94), (2.335, 0.3, 0.70, 0.84, 0.07)],
        cab=dict(k=[(-1.9, None, 0.83), (-1.55, 1.2, 0.75), (-1.1, 1.42, 0.72), (-0.5, 1.46, 0.72), (0.05, 1.44, 0.73), (0.45, 1.22, 0.77), (0.86, None, 0.85)],
                 ws=(0.08, 0.86), rw=(-1.9, -1.05), win=[(-1.3, -0.15), (-0.07, 0.86)], trim='chrome', bpillar='black', rr=0.08),
        gaps=[0.95, -0.1, -1.2], details=d_sedan),
    'hatch': dict(  # Golf-ish 5-door: 4.26 x 1.79 x 1.46
        L=4.26, W=1.79, H=1.46, tire=(0.316, 0.205), axles=(1.26, -1.37), tin=0.035, sill=0.25, wheel='alloy',
        rt=0.1, tb=0.05, ts=0.05, ymf=0.55, crown=0.01,
        body=[(-2.13, 0.40, 0.94, 0.88), (-2.08, 0.32, 0.96, 0.94), (-1.95, 0.27, 0.97, 0.98), (-1.2, 0.25, 0.96, 1.0), (0.75, 0.24, 0.9, 1.0),
              (1.35, 0.23, 0.84, 1.0), (1.9, 0.22, 0.79, 0.985), (2.02, 0.25, 0.76, 0.93), (2.13, 0.32, 0.71, 0.83, 0.07)],
        cab=dict(k=[(-2.1, None, 0.87), (-2.0, 1.2, 0.8), (-1.78, 1.40, 0.75), (-1.45, 1.455, 0.74), (-0.6, 1.46, 0.74), (0.0, 1.44, 0.75), (0.4, 1.2, 0.8), (0.76, None, 0.86)],
                 ws=(0.02, 0.76), rw=(-2.1, -1.62), win=[(-1.4, -0.3), (-0.22, 0.76)], trim='black', bpillar='black', rr=0.08),
        gaps=[0.85, -0.25, -1.25], details=d_hatch),
    'cross': dict(  # Duster-ish crossover: 4.34 x 1.82 x 1.69 (rails)
        L=4.34, W=1.82, H=1.69, tire=(0.343, 0.215), axles=(1.35, -1.32), tin=0.04, sill=0.36, wheel='alloy', gap=0.07, clad=0.52,
        rt=0.08, tb=0.06, ts=0.05, ymf=0.5, crown=0.01,
        body=[(-2.17, 0.46, 1.04, 0.9), (-2.12, 0.40, 1.06, 0.94), (-2.0, 0.37, 1.08, 0.98), (-1.4, 0.36, 1.07, 1.0), (0.7, 0.35, 1.02, 1.0),
              (1.3, 0.34, 0.99, 1.0), (1.95, 0.33, 0.95, 0.985), (2.06, 0.36, 0.92, 0.94), (2.17, 0.42, 0.88, 0.86, 0.06)],
        cab=dict(k=[(-2.14, 1.5, 0.8), (-2.07, 1.61, 0.77), (-1.9, 1.63, 0.76), (0.0, 1.63, 0.76), (0.4, 1.36, 0.8), (0.72, None, 0.86)],
                 ws=(0.05, 0.72), win=[(-1.95, -1.42), (-1.34, -0.25), (-0.17, 0.72)], trim='black', bpillar='black', rr=0.08, rinset=(0.82, 0.7)),
        gaps=[0.8, -0.2, -1.38], details=d_cross),
    'suv': dict(  # Lada Niva 3-door: 3.74 x 1.68 x 1.64 (+rack)
        L=3.74, W=1.68, H=1.64, tire=(0.343, 0.175), axles=(1.16, -1.04), tin=0.05, sill=0.37, shorten=0.1, wheel='steel', gap=0.06, rimk=0.58,
        rt=0.035, tb=0.03, ts=0.015, ymf=0.6, crown=0.0,
        body=[(-1.87, 0.42, 0.93, 0.975), (-1.84, 0.38, 0.95, 0.995), (-1.7, 0.37, 0.95, 1.0), (0.55, 0.36, 0.93, 1.0), (0.7, 0.36, 0.9, 1.0),
              (1.7, 0.35, 0.86, 1.0), (1.835, 0.36, 0.84, 0.995), (1.87, 0.40, 0.81, 0.975, 0.02)],
        cab=dict(k=[(-1.765, 1.56, 0.92), (-1.71, 1.64, 0.9), (0.0, 1.64, 0.9), (0.3, 1.41, 0.92), (0.56, None, 0.95)],
                 ws=(0.02, 0.56), win=[(-1.63, -0.72), (-0.62, 0.56)], trim='black', bpillar='paint', rr=0.04, rinset=(0.84, 0.72)),
        gaps=[0.62, -0.68], details=d_suv),
    'suv2': dict(  # Land Cruiser-ish: 4.98 x 1.98 x 1.9
        L=4.98, W=1.98, H=1.9, tire=(0.39, 0.265), axles=(1.54, -1.31), tin=0.05, sill=0.48, wheel='alloy', gap=0.07,
        rt=0.12, tb=0.07, ts=0.06, ymf=0.5, crown=0.015, clad=0.0,
        body=[(-2.49, 0.58, 1.2, 0.9), (-2.43, 0.52, 1.23, 0.94), (-2.3, 0.5, 1.25, 0.98), (-1.5, 0.48, 1.24, 1.0), (0.85, 0.47, 1.2, 1.0),
              (1.5, 0.46, 1.17, 1.0), (2.2, 0.44, 1.14, 0.985), (2.36, 0.48, 1.11, 0.93), (2.49, 0.54, 1.06, 0.86, 0.06)],
        cab=dict(k=[(-2.46, 1.79, 0.82), (-2.38, 1.87, 0.8), (-2.2, 1.89, 0.79), (0.1, 1.89, 0.79), (0.45, 1.6, 0.84), (0.86, None, 0.88)],
                 ws=(0.13, 0.86), win=[(-2.2, -1.5), (-1.4, -0.35), (-0.25, 0.86)], trim='black', bpillar='black', rr=0.1),
        gaps=[0.95, -0.3, -1.45], details=d_suv2),
    'pickup': dict(  # Hilux-ish double cab: 5.33 x 1.86 x 1.82
        L=5.33, W=1.86, H=1.82, tire=(0.388, 0.265), axles=(1.735, -1.345), tin=0.05, sill=0.46, wheel='alloy', gap=0.07, bed=(-2.64, -0.93),
        rt=0.07, tb=0.06, ts=0.04, ymf=0.5, crown=0.01, clad=0.0,
        body=[(-2.665, 0.56, 0.84, 0.97), (-2.63, 0.5, 0.86, 0.995), (-2.3, 0.48, 0.86, 1.0), (-0.95, 0.48, 0.86, 1.0), (-0.9, 0.48, 1.17, 1.0),
              (1.0, 0.47, 1.15, 1.0), (1.6, 0.46, 1.13, 1.0), (2.4, 0.44, 1.1, 0.985), (2.53, 0.47, 1.07, 0.93), (2.665, 0.52, 1.02, 0.86, 0.06)],
        cab=dict(k=[(-0.89, 1.76, 0.84), (-0.83, 1.82, 0.8), (0.25, 1.82, 0.8), (0.62, 1.55, 0.84), (1.0, None, 0.88)],
                 ws=(0.28, 1.0), win=[(-0.82, -0.2), (-0.12, 1.0)], trim='black', bpillar='black', rr=0.08, rinset=(0.7, 0.5)),
        gaps=[1.08, -0.16, -0.9], details=d_pickup),
    'taxi': dict(  # Daewoo Lanos: 4.24 x 1.68 x 1.43 (+sign)
        L=4.24, W=1.68, H=1.43, tire=(0.29, 0.185), axles=(1.29, -1.23), tin=0.04, sill=0.26, wheel='hubcap',
        rt=0.12, tb=0.05, ts=0.05, ymf=0.55, crown=0.012,
        body=[(-2.12, 0.38, 0.88, 0.86, -0.05), (-2.03, 0.3, 0.93, 0.94), (-1.85, 0.27, 0.94, 0.98), (-1.3, 0.26, 0.92, 1.0), (0.72, 0.25, 0.87, 1.0),
              (1.3, 0.24, 0.83, 1.0), (1.9, 0.23, 0.78, 0.98), (2.02, 0.26, 0.745, 0.92), (2.12, 0.32, 0.69, 0.81, 0.07)],
        cab=dict(k=[(-1.5, None, 0.84), (-1.25, 1.2, 0.77), (-0.85, 1.4, 0.74), (-0.4, 1.43, 0.74), (0.2, 1.41, 0.75), (0.5, 1.18, 0.8), (0.73, None, 0.86)],
                 ws=(0.22, 0.73), rw=(-1.5, -0.88), win=[(-0.95, -0.12), (-0.05, 0.73)], trim='black', bpillar='black', rr=0.09),
        gaps=[0.82, -0.08, -1.0], details=d_taxi),
    'taxi_hy': dict(  # Prius-ish hybrid: 4.54 x 1.76 x 1.49 (+sign)
        L=4.54, W=1.76, H=1.49, tire=(0.317, 0.195), axles=(1.34, -1.36), tin=0.035, sill=0.25, wheel='alloy',
        rt=0.12, tb=0.05, ts=0.06, ymf=0.55, crown=0.012,
        body=[(-2.27, 0.40, 0.98, 0.88), (-2.2, 0.31, 1.0, 0.94), (-2.05, 0.27, 1.02, 0.98), (-1.6, 0.25, 0.99, 1.0), (0.75, 0.24, 0.9, 1.0),
              (1.3, 0.23, 0.82, 1.0), (2.0, 0.22, 0.74, 0.98), (2.14, 0.25, 0.69, 0.92), (2.27, 0.31, 0.62, 0.8, 0.08)],
        cab=dict(k=[(-2.2, 1.1, 0.84), (-1.8, 1.26, 0.78), (-1.1, 1.44, 0.74), (-0.35, 1.49, 0.73), (0.2, 1.42, 0.74), (0.65, 1.14, 0.8), (1.05, None, 0.87)],
                 ws=(0.0, 1.05), rw=(-2.2, -0.95), win=[(-1.75, -1.3), (-1.24, -0.2), (-0.12, 1.05)], trim='black', bpillar='black', rr=0.09, rinset=(0.85, 0.5)),
        gaps=[1.05, -0.15, -1.25], details=d_taxi_hy),
    'taxi_mv': dict(  # compact MPV (Touran / Sharan-ish): 4.85 x 1.9 x 1.72 (+sign)
        L=4.85, W=1.9, H=1.72, tire=(0.33, 0.215), axles=(1.495, -1.425), tin=0.04, sill=0.26, wheel='alloy',
        rt=0.1, tb=0.05, ts=0.06, ymf=0.55, crown=0.012,
        body=[(-2.425, 0.4, 0.97, 0.9), (-2.36, 0.33, 0.99, 0.94), (-2.25, 0.29, 1.0, 0.98), (-2.0, 0.27, 1.0, 1.0), (1.45, 0.25, 0.96, 1.0),
              (1.8, 0.24, 0.9, 1.0), (2.15, 0.23, 0.84, 0.985), (2.3, 0.26, 0.8, 0.93), (2.425, 0.32, 0.74, 0.84, 0.08)],
        cab=dict(k=[(-2.41, 1.62, 0.84), (-2.32, 1.7, 0.8), (-2.0, 1.72, 0.78), (0.05, 1.71, 0.78), (0.8, 1.4, 0.81), (1.47, None, 0.88)],
                 ws=(0.08, 1.47), win=[(-2.2, -1.55), (-1.47, -0.45), (-0.37, 1.47)], trim='black', bpillar='black', rr=0.09),
        gaps=[1.25, -0.36, -1.5], details=d_taxi_mv),
    'taxi_gr': dict(  # ZAZ Tavria: 3.71 x 1.55 x 1.41 (+sign)
        L=3.71, W=1.55, H=1.41, tire=(0.274, 0.155), axles=(1.195, -1.125), tin=0.04, sill=0.26, shorten=0.08, wheel='black', rimk=0.6,
        rt=0.05, tb=0.04, ts=0.03, ymf=0.6, crown=0.0,
        body=[(-1.855, 0.33, 0.88, 0.96), (-1.82, 0.29, 0.9, 0.99), (-1.4, 0.27, 0.9, 1.0), (0.55, 0.25, 0.85, 1.0), (1.0, 0.25, 0.8, 1.0),
              (1.6, 0.25, 0.72, 1.0), (1.78, 0.27, 0.68, 0.975), (1.855, 0.32, 0.62, 0.9, 0.05)],
        cab=dict(k=[(-1.765, None, 0.88), (-1.64, 1.2, 0.83), (-1.42, 1.39, 0.8), (-0.9, 1.41, 0.8), (-0.1, 1.4, 0.8), (0.2, 1.2, 0.84), (0.56, None, 0.9)],
                 ws=(-0.08, 0.56), rw=(-1.765, -1.45), win=[(-1.35, -0.7), (-0.6, 0.56)], trim='black', bpillar='paint', rr=0.05),
        gaps=[0.62, -0.66], details=d_taxi_gr),
}
PAINTS = {'sedan2': (0.35, 0.02, 0.03), 'sedan': (0.55, 0.57, 0.6), 'hatch': (0.05, 0.12, 0.35), 'cross': (0.5, 0.22, 0.05), 'suv': (0.14, 0.2, 0.1),
          'suv2': (0.02, 0.02, 0.022), 'pickup': (0.7, 0.7, 0.68), 'taxi': (0.8, 0.5, 0.02), 'taxi_hy': (0.75, 0.75, 0.73), 'taxi_mv': (0.02, 0.02, 0.022),
          'taxi_gr': (0.8, 0.8, 0.78)}

# ---------------------------------------------------------------- Blender side
def fib_dirs(n):
    out = []
    ga = pi * (3 - sqrt(5))
    for i in range(n):
        z = sqrt(1 - (i + 0.5) / n)  # cosine-weighted hemisphere
        r = sqrt(1 - z * z); a = ga * i
        out.append((r * cos(a), r * sin(a), z))
    return out

def bake_ao(me, K=28, dist=0.9):
    verts = [v.co.copy() for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons]
    g = len(verts); verts += [Vector((-30, -30, 0)), Vector((30, -30, 0)), Vector((30, 30, 0)), Vector((-30, 30, 0))]
    polys.append([g, g + 1, g + 2, g + 3])
    bvh = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    D = fib_dirs(K)
    cols = [1.0] * (len(me.loops) * 4)
    cache = {}
    for p in me.polygons:
        n = p.normal.copy()
        t = n.orthogonal().normalized(); b = n.cross(t)
        dirs = [(t * d[0] + b * d[1] + n * d[2]) for d in D]
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            key = (vi, round(n.x, 1), round(n.y, 1), round(n.z, 1))
            ao = cache.get(key)
            if ao is None:
                o = me.vertices[vi].co + n * 0.006 + (p.center - me.vertices[vi].co) * 0.02
                occ = 0.0
                for d in dirs:
                    hit = bvh.ray_cast(o, d, dist)
                    if hit[0] is not None: occ += 1.0 - 0.6 * (hit[3] / dist)
                ao = max(0.12, 1.0 - occ / K)
                cache[key] = ao
            c = ao ** 2.2
            cols[li * 4:li * 4 + 3] = [c, c, c]
    vals = list(cache.values())
    print('[cars]   ao: %d samples, min %.2f mean %.2f' % (len(vals), min(vals), sum(vals) / len(vals)))
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    col.data.foreach_set('color', cols)
    me.color_attributes.active_color = col

def to_blender(name, m, ao=True):
    verts = [(x, -z, y) for (x, y, z) in m.V]
    faces = [f[0] for f in m.F]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uv0 = me.uv_layers.new(name='UVMap'); uv1 = me.uv_layers.new(name='part')
    a0, a1 = [], []
    for ids, part, uvs in m.F:
        for (u, v) in uvs: a0 += [u, 1.0 - v]; a1 += [float(part), 0.0]
    uv0.data.foreach_set('uv', a0); uv1.data.foreach_set('uv', a1)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.set_sharp_from_angle(angle=radians(40))
    me.update()
    if ao and not NO_AO: bake_ao(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob

def build_all():
    names = [n for n in CARS if not ONLY or n in ONLY.split(',')]
    objs = {}
    for n in names:
        for lod in (0, 1, 2):
            t0 = time.time()
            c = Car(CARS[n], lod)
            m = c.run()
            nm = n + ('' if lod == 0 else '_l%d' % lod)
            objs[nm] = to_blender(nm, m)
            xs = [v[0] for v in m.V]; ys = [v[1] for v in m.V]; zs = [v[2] for v in m.V]
            print('[cars] %-10s tris %5d  L %.2f W %.2f H %.2f  (%.1fs)' % (nm, m.tris(), max(xs) - min(xs), max(zs) - min(zs), max(ys), time.time() - t0))
    return objs

def export(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs.values(): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_materials='NONE',
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_yup=True, export_apply=False,
                              export_texcoords=True, export_normals=True, export_tangents=False, export_extras=False)
    print('[cars] wrote', OUT, os.path.getsize(OUT), 'bytes')

# ---------------------------------------------------------------- preview renders
def part_materials(paint):
    img = bpy.data.images.load(PREVIEW_ATLAS)
    mats = []
    for pid in range(23):
        mt = bpy.data.materials.new('p%d' % pid); mt.use_nodes = True
        mt.use_backface_culling = True
        nt = mt.node_tree; bs = nt.nodes['Principled BSDF']
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Linear'
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'; nt.links.new(uvn.outputs[0], tex.inputs[0])
        at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'Col'
        pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 1 / 2.2; nt.links.new(at.outputs[0], pw.inputs[0])
        mx = nt.nodes.new('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'; mx.inputs[1].default_value = 0.6; mx.inputs[2].default_value = 0.4
        nt.links.new(pw.outputs[0], mx.inputs[0])
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0
        nt.links.new(tex.outputs[0], mul.inputs[6])
        tint = (1, 1, 1, 1)
        if pid == PAINT: tint = (*paint, 1)
        mul.inputs[7].default_value = tint
        ao = nt.nodes.new('ShaderNodeMix'); ao.data_type = 'RGBA'; ao.blend_type = 'MULTIPLY'; ao.inputs[0].default_value = 1.0
        nt.links.new(mul.outputs[2], ao.inputs[6]); nt.links.new(mx.outputs[0], ao.inputs[7])
        nt.links.new(ao.outputs[2], bs.inputs['Base Color'])
        rough, metal = {PAINT: (0.25, 0), METAL: (0.2, 1), GLASS: (0.04, 0), RUBBER: (0.9, 0), PLASTIC: (0.55, 0), HEAD: (0.1, 0.5), TAIL: (0.2, 0), TAXI: (0.3, 0)}.get(pid, (0.6, 0))
        bs.inputs['Roughness'].default_value = rough; bs.inputs['Metallic'].default_value = metal
        if pid == GLASS:
            dk = nt.nodes.new('ShaderNodeMix'); dk.data_type = 'RGBA'; dk.blend_type = 'MULTIPLY'; dk.inputs[0].default_value = 1.0
            nt.links.new(ao.outputs[2], dk.inputs[6]); dk.inputs[7].default_value = (0.25, 0.27, 0.3, 1)
            nt.links.new(dk.outputs[2], bs.inputs['Base Color'])
            bs.inputs['Coat Weight'].default_value = 1.0
        if pid in (PAINT,):
            bs.inputs['Coat Weight'].default_value = 1.0; bs.inputs['Coat Roughness'].default_value = 0.05
        if pid in (HEAD, TAIL, TAXI):
            nt.links.new(tex.outputs[0], bs.inputs['Emission Color'])
            bs.inputs['Emission Strength'].default_value = {HEAD: 0.4, TAIL: 0.5, TAXI: 0.3}[pid]
        mats.append(mt)
    return mats

def preview(objs):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 960, 560
    sc.view_settings.view_transform = 'Standard'
    try: sc.eevee.taa_render_samples = 32
    except Exception: pass
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.55, 0.62, 0.72, 1); bg.inputs[1].default_value = 0.9
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = radians(8)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (radians(50), radians(10), radians(35))
    gm = bpy.data.meshes.new('ground'); gm.from_pydata([(-40, -40, 0), (40, -40, 0), (40, 40, 0), (-40, 40, 0)], [], [(0, 1, 2, 3)])
    go = bpy.data.objects.new('ground', gm); sc.collection.objects.link(go)
    gmat = bpy.data.materials.new('g'); gmat.use_nodes = True; gmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.3, 0.3, 0.3, 1)
    gm.materials.append(gmat)
    cam = bpy.data.cameras.new('cam'); cam.lens = 55
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    os.makedirs(PREVIEW, exist_ok=True)
    names = [n for n in CARS if n in objs]
    for n in names:
        mats = part_materials(PAINTS.get(n, (0.6, 0.6, 0.6)))
        for suf in ('', '_l1', '_l2'):
            me = objs[n + suf].data
            for mt in mats: me.materials.append(mt)
            parts = [0.0] * (len(me.loops) * 2); me.uv_layers['part'].data.foreach_get('uv', parts)
            me.polygons.foreach_set('material_index', [int(round(parts[p.loop_start * 2])) for p in me.polygons])
    Lmax = max(CARS[n]['L'] for n in names)
    for n in names:
        S = CARS[n]
        for o in bpy.data.objects:
            if o.type == 'MESH' and o.name != 'ground': o.hide_render = True
        o0, o1, o2 = objs[n], objs[n + '_l1'], objs[n + '_l2']
        o0.hide_render = False
        views = [('fr', (1, -1, 0.42), 1.0), ('rl', (-1, 1, 0.5), 1.0), ('side', (0.0, -1, 0.12), 1.0), ('top', (0.25, -0.35, 1.2), 1.0)]
        d = S['L'] * 2.1
        for tag, (vx, vy, vz), k in views:
            v = Vector((vx, vy, vz)).normalized()
            co.location = Vector((0, 0, S['H'] * 0.45)) + v * d
            co.rotation_euler = (-v).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = os.path.join(PREVIEW, '%s_%s.png' % (n, tag))
            bpy.ops.render.render(write_still=True)
        # LODs side by side
        o0.hide_render = True
        for o, dy in ((o0, 0), (o1, 1), (o2, 2)):
            o.hide_render = False; o.location = (0, dy * (S['W'] + 0.6) - (S['W'] + 0.6), 0)
        v = Vector((1, -0.6, 0.35)).normalized()
        co.location = Vector((0, 0, S['H'] * 0.45)) + v * d * 1.5
        co.rotation_euler = (-v).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(PREVIEW, '%s_lods.png' % n)
        bpy.ops.render.render(write_still=True)
        for o in (o0, o1, o2): o.location = (0, 0, 0); o.hide_render = True

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = build_all()
    if not NO_EXPORT and not ONLY: export(objs)
    elif not NO_EXPORT and ONLY: print('[cars] --only: not exporting')
    if PREVIEW: preview(objs)

main()
