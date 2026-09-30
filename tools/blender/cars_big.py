# Big traffic vehicles for the Cherkasy streets -> public/assets/vehicles/vehicles_big.glb (env OUT overrides)
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/blender/cars_big.py
#   env: PREVIEW=<dir>  also render preview stills (<dir>/<name>_*.png); NOAO=1 skips the Cycles AO bake
#
# Models (keys of VMODELS / VTYPES in src/world): van = Sprinter-style marshrutka, truck = GAZelle-style box
# truck, bus = Electron / LAZ-style 12 m low-floor city bus (also the trolleybus body: the poles are added in code, the
# roof behind x = -0.3 stays clear), tour = high-deck tourist coach, midi = Bogdan A092-style 7.6 m yellow city bus
# (grille badge, route number cards in the windscreen and a side window). Each as <name> (LOD0), <name>_l1, <name>_l2.
#
# Contract with src/world/vehicles.js loadVehicleModels(): one primitive per mesh, node name = mesh key, model frame
# +X forward / +Y up / +Z right (glTF), origin at the floor centre; TEXCOORD_0 = vehicles_atlas2.webp (2048 px, v down),
# TEXCOORD_1.x = integer part id (src/world/partmat.js PART), COLOR_0.r = baked AO (linear: AO^2.2).
import bpy, bmesh, math, os, sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.environ.get('OUT') or os.path.join(ROOT, 'public/assets/vehicles/vehicles_big.glb')
ATLAS = os.path.join(ROOT, 'public/assets/city/tex/vehicles_atlas2.webp')
PREVIEW = os.environ.get('PREVIEW')
ONLY = [s for s in os.environ.get('ONLY', '').split(',') if s]

BASE, PAINT, METAL, GLASS, LAMP, RUBBER, PLASTIC, HEAD, TAIL, SCREEN, AD = 0, 1, 2, 3, 4, 5, 6, 7, 8, 14, 15

# ---------------------------------------------------------------- atlas (px, 2048, y down)
SW = {  # flat swatch cell centres
    'white': (904, 1744), 'black': (816, 1808), 'trim': (848, 1808), 'chrome': (880, 1808), 'glass': (912, 1808),
    'tire': (944, 1808), 'rim': (976, 1808), 'head': (1008, 1808), 'tail': (784, 1840), 'amber': (816, 1840),
    'blue': (848, 1840), 'red': (880, 1840), 'yellow': (912, 1840), 'cab': (944, 1840), 'under': (976, 1840),
    'liner': (1008, 1840), 'gold': (784, 1872), 'plastic': (816, 1872), 'rubber': (848, 1872), 'seat': (880, 1872),
}
RECT = {  # image regions x0, y0, x1, y1 (the ones cherkasy/traffic.js ukrainianAtlas() repaints are marked *)
    'car_side': (0, 0, 1024, 340), 'car_front': (0, 352, 1024, 690), 'bus_int': (1024, 684, 2048, 1020),
    'head': (6, 780, 250, 1012), 'tail': (262, 772, 506, 1016), 'grille_hex': (518, 776, 762, 1016),
    'grille_bar': (774, 776, 1018, 1016), 'plate': (0, 1024, 256, 1148),  # *
    'dest': (0, 1214, 512, 1280), 'oper': (512, 1236, 1024, 1312),  # *
    'ad': (1024, 0, 1536, 170),  # ad slot 0: TAXI part re-targets it per car to one of the 8 ad tiles (*)
    'side_deliv': (1024, 1024, 2048, 1536), 'side_ad_red': (1024, 1536, 2048, 2048),  # *
    'vent': (516, 1154, 766, 1242), 'lamps3': (514, 1542, 638, 1592), 'tail_blk': (642, 1542, 766, 1592),
    'badge': (0, 1416, 256, 1480), 'route_card': (256, 1416, 512, 1576),  # * Bogdan grille badge, route number card
}


def uvpx(x, y):
    return (x / 2048.0, 1.0 - y / 2048.0)


def sw(name):
    return uvpx(*SW[name])


def rect_uv(r, flip=False, sub=None):
    """uv for BL, BR, TR, TL of an atlas rect; sub=(u0,v0,u1,v1) fractions of the rect (v0 top)."""
    x0, y0, x1, y1 = RECT[r] if isinstance(r, str) else r
    if sub:
        a, b, c, d = sub
        x0, x1, y0, y1 = x0 + (x1 - x0) * a, x0 + (x1 - x0) * c, y0 + (y1 - y0) * b, y0 + (y1 - y0) * d
    if flip:
        x0, x1 = x1, x0
    return [uvpx(x0, y1), uvpx(x1, y1), uvpx(x1, y0), uvpx(x0, y0)]


# ---------------------------------------------------------------- mesh builder (glTF frame: x fwd, y up, z right)
V3 = lambda x, y, z: Vector((x, y, z))


class MB:
    def __init__(self):
        self.V, self.F = [], []

    def vert(self, p):
        self.V.append(Vector(p))
        return len(self.V) - 1

    def face(self, idx, uvs, part, out=None):
        if not isinstance(uvs, list):
            uvs = [uvs] * len(idx)
        if out is not None:
            n = newell([self.V[i] for i in idx])
            if n.dot(out) < 0:
                idx, uvs = idx[::-1], uvs[::-1]
        self.F.append((list(idx), list(uvs), part))

    def poly(self, pts, uvs, part, out=None):
        self.face([self.vert(p) for p in pts], uvs, part, out)

    def quad(self, bl, br, tr, tl, part, uv):
        """CCW seen from outside: bottom-left, bottom-right, top-right, top-left."""
        self.poly([bl, br, tr, tl], uv if isinstance(uv, list) else uv, part)

    def tris(self):
        return sum(len(f[0]) - 2 for f in self.F)


def newell(ps):
    n = Vector((0, 0, 0))
    for i, a in enumerate(ps):
        b = ps[(i + 1) % len(ps)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


def oquad(b, c, r, u, w, h, part, uv, push=0.0):
    """quad centred at c, right / up unit vectors as seen by the viewer (normal = r x u)."""
    c, r, u = Vector(c), Vector(r).normalized(), Vector(u).normalized()
    c = c + r.cross(u).normalized() * push
    hw, hh = r * (w / 2), u * (h / 2)
    b.quad(c - hw - hh, c + hw - hh, c + hw + hh, c - hw + hh, part, uv)


def box(b, x0, y0, z0, x1, y1, z1, part, uv='white', faces='xXyYzZ', rects=None):
    """axis box; uv = swatch name, rects = {face: uv list (BL, BR, TR, TL as seen from outside)}."""
    P = {
        'X': [(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)],
        'x': [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)],
        'Z': [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
        'z': [(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)],
        'Y': [(x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0)],
        'y': [(x0, y0, z1), (x0, y0, z0), (x1, y0, z0), (x1, y0, z1)],
    }
    for f in faces:
        u = (rects or {}).get(f) or (sw(uv) if isinstance(uv, str) else uv)
        b.quad(*[V3(*p) for p in P[f]], part, u)


def ring_pts(s, seg):
    """rounded trapezoid section in the (z, y) plane: CCW from the bottom right (seen from -x)."""
    yb, yt, wb, wt = s['yb'], s['yt'], s['wb'], s['wt']
    h = yt - yb
    rb = max(0.001, min(s.get('rb', 0.08), wb / 2 * 0.95, h * 0.45))
    rt = max(0.001, min(s.get('rt', 0.12), wt / 2 * 0.95, h * 0.45))
    if seg == 0:  # LOD2: square bottom, chamfered top (6 points)
        return [(wb / 2, yb), (wt / 2, yt - rt), (wt / 2 - rt, yt), (-wt / 2 + rt, yt), (-wt / 2, yt - rt), (-wb / 2, yb)]
    cb, ct = (wb / 2 - rb, yb + rb), (wt / 2 - rt, yt - rt)
    dz, dy = ct[0] - cb[0], ct[1] - cb[1]
    L = math.hypot(dz, dy) or 1
    phi = math.atan2(-dz / L, dy / L)
    pts = []
    arcs = [((cb[0], cb[1]), rb, -math.pi / 2, phi), ((ct[0], ct[1]), rt, phi, math.pi / 2),
            ((-ct[0], ct[1]), rt, math.pi / 2, math.pi - phi), ((-cb[0], cb[1]), rb, math.pi - phi, 1.5 * math.pi)]
    for (c, r, a0, a1) in arcs:
        for k in range(seg + 1):
            a = a0 + (a1 - a0) * k / seg
            pts.append((c[0] + math.cos(a) * r, c[1] + math.sin(a) * r))
    return pts


def loft(b, secs, seg, part=PAINT, uv='white', caps=(True, True), uvf=None):
    """sections sorted by x (rear to front). uvf(center, normal) -> (part, uv) overrides per face."""
    rings = []
    for s in secs:
        rings.append([b.vert((s['x'], y, z)) for (z, y) in ring_pts(s, seg)])
    n = len(rings[0])
    for i in range(len(rings) - 1):
        for k in range(n):
            k2 = (k + 1) % n
            idx = [rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]]
            p, u = part, sw(uv)
            if uvf:
                ps = [b.V[j] for j in idx]
                c = sum(ps, Vector()) / 4
                r = uvf(c, newell(ps).normalized())
                if r:
                    p, u = r[0], (sw(r[1]) if isinstance(r[1], str) else r[1])
            b.face(idx, u, p)
    if caps[0]:
        b.face(list(rings[0]), sw(uv), part, out=V3(-1, 0, 0))
    if caps[1]:
        b.face(list(rings[-1]), sw(uv), part, out=V3(1, 0, 0))
    return rings


def lerp(a, b, t):
    return a + (b - a) * t


def pwl(pts, x):
    """piecewise-linear lookup in [(x, v)] (clamped)."""
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, v0), (x1, v1) in zip(pts, pts[1:]):
        if x <= x1:
            return lerp(v0, v1, (x - x0) / (x1 - x0) if x1 > x0 else 1)
    return pts[-1][1]


def body_secs(xs, yb, yt, wb, wt, rb, rt):
    return [dict(x=x, yb=yb(x), yt=yt(x), wb=wb(x), wt=wt(x), rb=rb(x), rt=rt(x)) for x in xs]


def arch_xs(xc, ra, n):
    return [xc + ra * math.cos(math.pi * (1 - k / n)) for k in range(n + 1)]


def arch_yb(x, arches, sill):
    y = sill
    for (xc, yc, ra) in arches:
        d = abs(x - xc)
        if d < ra - 1e-6:
            y = max(y, yc + math.sqrt(ra * ra - d * d))
    return y


def half_w(secs, x, y):
    """outer half width of a loft body at (x, y) on its flat side (linear between sections)."""
    for s0, s1 in zip(secs, secs[1:]):
        if s0['x'] <= x <= s1['x']:
            t = (x - s0['x']) / (s1['x'] - s0['x'] or 1)
            s = {k: lerp(s0[k], s1[k], t) for k in ('yb', 'yt', 'wb', 'wt')}
            break
    else:
        s = secs[0] if x < secs[0]['x'] else secs[-1]
    f = min(1, max(0, (y - s['yb']) / (s['yt'] - s['yb'])))
    return lerp(s['wb'], s['wt'], f) / 2


def side_quad(b, secs, side, x0, x1, y0, y1, part, uv, push=0.006, mirror=False, xt0=None, xt1=None):
    """decal on a loft side. uv: swatch / rect name / uv list (BL, BR, TR, TL as seen on the +z side).
    mirror=True keeps u running with +x on the -z side too (interior cards); text reads correctly otherwise.
    xt0 / xt1: x of the top corners (trapezoids)."""
    xt0 = x0 if xt0 is None else xt0
    xt1 = x1 if xt1 is None else xt1
    P = [(x0, y0), (x1, y0), (xt1, y1), (xt0, y1)]
    pts = [V3(x, y, side * (half_w(secs, x, y) + push)) for (x, y) in P]
    if isinstance(uv, str):
        uvl = rect_uv(uv) if uv in RECT else [sw(uv)] * 4
    else:
        uvl = uv
    if side > 0:
        b.quad(*pts, part, uvl)
    else:  # seen from -z: BL is the +x end
        if mirror:
            b.poly(pts, uvl, part, out=V3(0, 0, -1))
        else:
            b.quad(pts[1], pts[0], pts[3], pts[2], part, uvl)


def framed_window(b, secs, side, x0, x1, y0, y1, card, frame=0.045, mirror=True, xt0=None, xt1=None, glass_part=GLASS):
    """black rubber frame + glass pane (slightly proud) showing an interior card."""
    xt0 = x0 if xt0 is None else xt0
    xt1 = x1 if xt1 is None else xt1
    side_quad(b, secs, side, x0 - frame, x1 + frame, y0 - frame, y1 + frame, PLASTIC, 'trim', push=0.004,
              xt0=xt0 - frame, xt1=xt1 + frame)
    side_quad(b, secs, side, x0, x1, y0, y1, glass_part, card, push=0.008, mirror=mirror, xt0=xt0, xt1=xt1)


def lathe(b, c, side, prof, n, parts, inside, a0=0.0, a1=2 * math.pi, closed=True):
    """surface of revolution around the z axis through c. prof = [(radius, z offset toward `side`)].
    parts[i] = (part, uv) of the band prof[i] -> prof[i+1]; inside = (radius, offset) point inside the solid."""
    c = Vector(c)
    rings = []
    na = n if closed else n + 1
    for (r, o) in prof:
        rings.append([b.vert(c + V3(math.cos(a0 + (a1 - a0) * k / n) * r, math.sin(a0 + (a1 - a0) * k / n) * r, side * o))
                      for k in range(na)])
    for i in range(len(prof) - 1):
        p, u = parts[i] if isinstance(parts, list) else parts
        for k in range(n):
            k2 = (k + 1) % na
            idx = [rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]]
            if len(set(tuple(round(v, 6) for v in b.V[j]) for j in idx)) < 3:
                continue
            am = a0 + (a1 - a0) * (k + 0.5) / n
            pr, po = (prof[i][0] + prof[i + 1][0]) / 2, (prof[i][1] + prof[i + 1][1]) / 2
            fc = c + V3(math.cos(am) * pr, math.sin(am) * pr, side * po)
            ic = c + V3(math.cos(am) * inside[0], math.sin(am) * inside[0], side * inside[1])
            # degenerate (radius 0) rows collapse into triangles
            if prof[i][0] < 1e-6:
                idx = [rings[i][k], rings[i + 1][k], rings[i + 1][k2]]
            elif prof[i + 1][0] < 1e-6:
                idx = [rings[i][k], rings[i + 1][k], rings[i][k2]]
            b.face(idx, sw(u) if isinstance(u, str) else u, p, out=fc - ic)
    return rings


def wheel(b, x, z, r, w, q, dual=False, style='alloy', hub='rim'):
    """tyre + rim + hub; z = centre of the tyre, the outer face looks toward sign(z)."""
    side = 1 if z > 0 else -1
    c = V3(x, r, z)
    n = [20, 12, 7][q]
    sw_ = w / 2
    if q == 2:  # tread band + an outer disc
        n = 6
        lathe(b, c, side, [(r, sw_), (r, -sw_)], n, [(RUBBER, 'tire')], (0, 0), a0=math.pi / 6, a1=math.pi / 6 + 2 * math.pi)
        b.face([b.vert(c + V3(math.cos(math.pi / 6 + 2 * math.pi * k / n) * r, math.sin(math.pi / 6 + 2 * math.pi * k / n) * r, side * sw_))
                for k in range(n)], sw('tire'), RUBBER, out=V3(0, 0, side))
        return
    tyre = [(r * 0.66, -sw_ + 0.01), (r * 0.93, -sw_), (r, -sw_ + 0.05), (r, sw_ - 0.05), (r * 0.93, sw_), (r * 0.7, sw_ - 0.005)]
    lathe(b, c, side, tyre, n, [(RUBBER, 'tire')] * 5, (r * 0.8, 0))
    rr = r * 0.7
    if dual or style == 'steel':
        d = 0.09 if dual else 0.05
        prof = [(rr, sw_ - 0.005), (rr * 0.93, sw_ - 0.02), (rr * 0.86, sw_ - d), (rr * 0.42, sw_ - d), (rr * 0.3, sw_ - d + 0.03), (0, sw_ - d + 0.04)]
        lathe(b, c, side, prof, n, [(METAL, hub), (METAL, hub), (METAL, hub), (PLASTIC, 'trim'), (METAL, 'chrome')], (0, -w))
        if q == 0:  # wheel nuts
            for k in range(8 if dual else 6):
                a = 2 * math.pi * k / (8 if dual else 6)
                pc = c + V3(math.cos(a) * rr * 0.58, math.sin(a) * rr * 0.58, side * (sw_ - d))
                box(b, pc.x - 0.018, pc.y - 0.018, pc.z - 0.03, pc.x + 0.018, pc.y + 0.018, pc.z + 0.03, METAL, 'chrome',
                    faces='xXyY' + ('Z' if side > 0 else 'z'))
    else:
        prof = [(rr, sw_ - 0.005), (rr * 0.9, sw_ - 0.03), (rr * 0.8, sw_ - 0.04), (rr * 0.25, sw_ - 0.02), (0, sw_ - 0.015)]
        lathe(b, c, side, prof, n, [(METAL, hub), (METAL, 'trim'), (METAL, hub), (METAL, 'chrome')], (0, -w))


def arch_flare(b, xc, yc, ra, zin, zout, q, width=0.07, part=PLASTIC, uv='trim', a0=0.0, a1=math.pi):
    """black wheel-arch trim: a half ring around the arch opening from z=zin to z=zout (side = sign)."""
    side = 1 if zout > 0 else -1
    n = [10, 5, 3][q]
    c = V3(xc, yc, 0)
    prof = [(ra, abs(zin)), (ra, abs(zout)), (ra + width, abs(zout)), (ra + width, abs(zin) - 0.02)]
    lathe(b, c, side, prof, n, [(part, uv)] * 3, (ra + width / 2, abs(zin) - 0.3), a0=a0, a1=a1, closed=False)


def tube(b, p0, p1, r, n, part, uv='black', caps=True):
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    a = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    u = d.cross(a).normalized()
    v = d.cross(u).normalized()
    r0 = [b.vert(p0 + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r) for k in range(n)]
    r1 = [b.vert(p1 + (u * math.cos(2 * math.pi * k / n) + v * math.sin(2 * math.pi * k / n)) * r) for k in range(n)]
    for k in range(n):
        k2 = (k + 1) % n
        mid = (b.V[r0[k]] + b.V[r1[k2]]) / 2
        axis_pt = p0 + d * (mid - p0).dot(d)
        b.face([r0[k], r1[k], r1[k2], r0[k2]], sw(uv), part, out=mid - axis_pt)
    if caps:
        b.face(r0, sw(uv), part, out=-d)
        b.face(r1, sw(uv), part, out=d)


def rbox(b, x0, x1, y0, y1, w, part, uv='black', r=0.04, taper=0.06, seg=1):
    """rounded bar along x (bumpers, skirts): ends taper in y / width."""
    secs = [dict(x=x0, yb=y0 + taper * 0.5, yt=y1 - taper * 0.5, wb=w - taper * 2, wt=w - taper * 2, rb=r, rt=r),
            dict(x=x0 + taper, yb=y0, yt=y1, wb=w, wt=w, rb=r, rt=r),
            dict(x=x1 - taper, yb=y0, yt=y1, wb=w, wt=w, rb=r, rt=r),
            dict(x=x1, yb=y0 + taper * 0.5, yt=y1 - taper * 0.5, wb=w - taper * 2, wt=w - taper * 2, rb=r, rt=r)]
    loft(b, secs, seg, part, uv)


def mirror_arm(b, side, base, tip, head_c, head_w, head_h, q, bus=False):
    """side mirror: an arm (tube) + a black head."""
    tube(b, base, tip, 0.022, 5 if q == 0 else 4, PLASTIC, 'black', caps=q == 0)
    hx, hy, hz = head_c
    box(b, hx - 0.05, hy - head_h / 2, hz - head_w / 2, hx + 0.05, hy + head_h / 2, hz + head_w / 2, PLASTIC, 'black')
    if q == 0:  # mirror glass on the rear face
        box(b, hx - 0.056, hy - head_h / 2 + 0.02, hz - head_w / 2 + 0.02, hx - 0.05, hy + head_h / 2 - 0.02, hz + head_w / 2 - 0.02,
            METAL, 'chrome', faces='x')


def plate(b, x, y, z0=-0.26, z1=0.26, front=True):
    h = (z1 - z0) * 124 / 256 / 2
    if front:
        box(b, x - 0.01, y - h, z0, x + 0.01, y + h, z1, BASE, 'white', faces='X', rects={'X': rect_uv('plate')})
    else:
        box(b, x - 0.01, y - h, z0, x + 0.01, y + h, z1, BASE, 'white', faces='x', rects={'x': rect_uv('plate')})


# ---------------------------------------------------------------- vehicles
def dedup_xs(xs, eps=0.07):
    out = []
    for x in sorted(xs):
        if not out or x - out[-1] > eps:
            out.append(x)
    return out


def lod2_dress(b, secs, X0, X1, bands, ws, head, tail, wheels, card='bus_int'):
    """far LOD: one glass quad per band and side, windscreen, lamp quads, simple wheels.
    bands: [(x0, x1, y0, y1)]; ws: ('top', xa, xb) raked windscreen on the loft top | ('face', y0, y1, half width);
    head / tail: (y0, y1, z inner, z outer) on the front / rear face; wheels: [(x, |z|, r, w)]."""
    for side in (1, -1):
        for (x0, x1, y0, y1) in bands:
            side_quad(b, secs, side, x0, x1, y0, y1, GLASS, rect_uv(card, sub=(0.1, 0.1, 0.5, 0.9)), push=0.008, mirror=True)
    if ws[0] == 'top':
        s0 = next(s for s in secs if abs(s['x'] - ws[1]) < 1e-6)
        s1 = next(s for s in secs if abs(s['x'] - ws[2]) < 1e-6)
        h0, h1 = s0['wt'] / 2 - s0['rt'], s1['wt'] / 2 - s1['rt']
        b.quad(V3(ws[2], s1['yt'] + 0.02, h1), V3(ws[2], s1['yt'] + 0.02, -h1), V3(ws[1], s0['yt'] + 0.02, -h0),
               V3(ws[1], s0['yt'] + 0.02, h0), GLASS, rect_uv('car_front', flip=True))
    else:
        face_x(b, X1 + 0.01, -ws[3], ws[3], ws[1], ws[2], GLASS, rect_uv('car_front', flip=True))
    for s in (1, -1):
        z0, z1 = sorted((s * head[2], s * head[3]))
        face_x(b, X1 + 0.012, z0, z1, head[0], head[1], HEAD, 'head', flip=s < 0)
        z0, z1 = sorted((s * tail[2], s * tail[3]))
        face_x(b, X0 - 0.012, z0, z1, tail[0], tail[1], TAIL, 'tail', front=False)
    for (x, z, r, w) in wheels:
        for s in (1, -1):
            wheel(b, x, s * z, r, w, 2)


def van(q):
    """Sprinter-style high-roof marshrutka: raked nose, swept headlights, long glazed sides, sliding door on the right."""
    b = MB()
    L, W, H = 5.98, 2.02, 2.55
    X0, X1 = -L / 2, L / 2
    seg = [3, 1, 1][q]
    RA, AX = 0.43, (-1.62, 2.02)
    WR = 0.36
    arches = [(AX[0], WR, RA), (AX[1], WR, RA)]
    na = [6, 3, 2][q]
    yt_p = [(X0, 2.40), (X0 + 0.04, 2.51), (X0 + 0.14, H), (0.62, H), (0.92, 2.49), (1.12, 2.32), (1.30, 2.10),
            (1.98, 1.30), (2.55, 1.16), (2.8, 1.1), (2.92, 1.04), (X1, 0.96)]
    xs = sorted(set([X0, X0 + 0.04, X0 + 0.14, -0.9, 0.3, 0.62, 0.92, 1.12, 1.30, 1.98, 2.55, 2.8, 2.92, X1]
                    + arch_xs(AX[0], RA, na) + arch_xs(AX[1], RA, na)))
    if q == 2:
        xs = dedup_xs([X0, X0 + 0.14, 0.62, 1.12, 1.30, 1.98, 2.8, X1] + arch_xs(AX[0], RA, 2) + arch_xs(AX[1], RA, 2))
        seg = 0
    yb = lambda x: arch_yb(x, arches, 0.40) if X0 + 0.14 < x < 2.8 else (0.48 if x < 0 else 0.46)
    wb = lambda x: pwl([(X0, W - 0.12), (X0 + 0.04, W - 0.03), (X0 + 0.14, W), (2.55, W), (2.8, W - 0.05), (2.92, W - 0.16), (X1, W - 0.3)], x)
    wt = lambda x: pwl([(X0, W - 0.12), (X0 + 0.04, W - 0.03), (X0 + 0.14, W), (1.98, W), (2.55, W - 0.04), (2.8, W - 0.1),
                        (2.92, W - 0.22), (X1, W - 0.36)], x)
    rt = lambda x: pwl([(X0, 0.22), (X0 + 0.14, 0.28), (0.62, 0.28), (1.12, 0.3), (1.30, 0.26), (1.98, 0.16), (2.8, 0.14), (X1, 0.1)], x)
    rb = lambda x: 0.07
    secs = body_secs(xs, yb, lambda x: pwl(yt_p, x), wb, wt, rb, rt)
    loft(b, secs, seg)
    zs = lambda x, y: half_w(secs, x, y)
    if q == 2:
        lod2_dress(b, secs, X0, X1, [(-2.62, 1.02, 1.34, 2.14)], ('top', 1.30, 1.98), (0.66, 0.9, 0.4, 0.8), (0.62, 1.24, 0.78, 0.94),
                   [(AX[0], W / 2 - 0.16, WR, 0.24), (AX[1], W / 2 - 0.16, WR, 0.24)], card='car_side')
        box(b, X1 - 0.02, 0.3, -W / 2 + 0.06, X1 + 0.05, 0.6, W / 2 - 0.06, PLASTIC, 'plastic', faces='XYzZ')
        return b

    # windscreen (raked, between x 1.30 and 1.98) - frame + glass with the front interior card (driver on the left)
    def on_top(x, zf):  # point on the flat top surface at x (z as fraction of the flat half width)
        s = next(s for s in secs if abs(s['x'] - x) < 1e-6)
        return V3(x, s['yt'], zf * (s['wt'] / 2 - s['rt'] * 0.6))
    for push, part, uv, ins in ((0.006, PLASTIC, [sw('trim')] * 4, 0.0), (0.012, GLASS, rect_uv('car_front', flip=True), 0.05)):
        tl, tr = on_top(1.30, 1), on_top(1.30, -1)
        bl, br = on_top(1.98, 1), on_top(1.98, -1)
        nrm = (tr - tl).cross(bl - tl).normalized()
        if nrm.y < 0:
            nrm = -nrm
        sh = lambda p, dx: p + nrm * push + V3(dx, 0, 0)
        k = ins
        pts = [sh(bl, -k * 0.8) + V3(0, k * 0.6, -k * 0.7), sh(br, -k * 0.8) + V3(0, k * 0.6, k * 0.7),
               sh(tr, k * 0.5) + V3(0, -k * 0.4, k * 0.9), sh(tl, k * 0.5) + V3(0, -k * 0.4, -k * 0.9)]
        b.quad(*pts, part, uv)
        if part == GLASS and q < 2:  # LED route board behind the top of the windscreen
            t = 0.2
            a, c2 = pts[3].lerp(pts[0], 0.06), pts[2].lerp(pts[1], 0.06)
            a2, c3 = pts[3].lerp(pts[0], 0.06 + t), pts[2].lerp(pts[1], 0.06 + t)
            mid = lambda p, q_, f: p.lerp(q_, f)
            b.quad(mid(a2, c3, 0.12) + nrm * 0.004, mid(a2, c3, 0.88) + nrm * 0.004, mid(a, c2, 0.88) + nrm * 0.004,
                   mid(a, c2, 0.12) + nrm * 0.004, SCREEN, rect_uv('dest'))
    # side glazing: passenger windows, sliding door (right), cab doors
    yw0, yw1 = 1.34, 2.14
    wins = [(-2.62, -1.86), (-1.74, -0.98), (-0.86, -0.1)]
    for side in (1, -1):
        for i, (a, c) in enumerate(wins):
            framed_window(b, secs, side, a, c, yw0, yw1, rect_uv('car_side', sub=(0.02 + 0.1 * i, 0.1, 0.34 + 0.1 * i, 0.72)))
        if side > 0:  # sliding door with a window; its outline
            framed_window(b, secs, side, 0.08, 1.02, yw0, yw1, rect_uv('car_side', sub=(0.25, 0.08, 0.6, 0.72)))
            if q < 2:
                for (x0_, x1_, y0_, y1_) in ((-0.02, 0.0, 0.46, 2.26), (1.12, 1.14, 0.46, 2.26), (-0.02, 1.14, 2.24, 2.26)):
                    side_quad(b, secs, side, x0_, x1_, y0_, y1_, PLASTIC, 'black', push=0.004)
                side_quad(b, secs, side, 0.1, 1.0, 2.29, 2.43, SCREEN, 'dest', push=0.006)  # side route board
                box(b, 0.05, 0.9, zs(0.3, 0.95) - 0.02, 0.28, 0.93, zs(0.3, 0.95) + 0.03, PLASTIC, 'black', faces='xXyYZ')  # handle
        else:
            framed_window(b, secs, side, 0.02, 1.02, yw0, yw1, rect_uv('car_side', sub=(0.05, 0.1, 0.4, 0.72)))
        # cab door window: vertical rear edge, raked front edge along the A pillar
        card = rect_uv('car_side', sub=(0.62, 0.02, 0.98, 0.8)) if side < 0 else rect_uv('car_side', sub=(0.22, 0.02, 0.5, 0.8))
        framed_window(b, secs, side, 1.26, 1.9, 1.32, 2.02, card, xt0=1.26, xt1=1.34)
        if q < 2:
            for (x0_, x1_, y0_, y1_) in ((1.16, 1.18, 0.46, 2.22),):
                side_quad(b, secs, side, x0_, x1_, y0_, y1_, PLASTIC, 'black', push=0.004)
            box(b, 1.3, 1.16, side * zs(1.4, 1.2) - 0.03, 1.5, 1.2, side * zs(1.4, 1.2) + 0.03, PLASTIC, 'black', faces='xXyYzZ')
            # mirror on a short arm
            z0 = side * zs(1.8, 1.4)
            mirror_arm(b, side, (1.8, 1.45, z0), (1.72, 1.52, z0 + side * 0.18), (1.7, 1.55, z0 + side * 0.2), 0.14, 0.3, q)
        # rubbing strip + sill
        side_quad(b, secs, side, X0 + 0.2, AX[0] - RA - 0.04, 0.58, 0.72, PLASTIC, 'black', push=0.012)
        side_quad(b, secs, side, AX[0] + RA + 0.04, AX[1] - RA - 0.04, 0.58, 0.72, PLASTIC, 'black', push=0.012)
        side_quad(b, secs, side, AX[1] + RA + 0.04, 2.7, 0.62, 0.74, PLASTIC, 'black', push=0.012)
        # wheel arch trims
        for axx in AX:
            arch_flare(b, axx, WR, RA, side * (W / 2 - 0.08), side * (W / 2 + 0.035), q)
    # rear: two doors with windows, tall lamps in the corners, bumper with a step
    xr = X0 - 0.004
    for s in (1, -1):
        zc = s * 0.44
        box(b, xr - 0.004, 1.30, zc - 0.36, xr, 2.14, zc + 0.36, PLASTIC, 'trim', faces='x')
        box(b, xr - 0.008, 1.34, zc - 0.32, xr - 0.004, 2.10, zc + 0.32, GLASS, 'glass', faces='x',
            rects={'x': rect_uv('car_side', sub=(0.0, 0.1, 0.25, 0.7))})
        box(b, xr - 0.03, 0.62, s * 0.86 - 0.08, xr + 0.02, 1.24, s * 0.86 + 0.08, TAIL, 'tail', faces='xyYzZ',
            rects={'x': rect_uv('tail', sub=(0.1, 0.0, 0.6, 1.0))})
    box(b, xr - 0.006, 0.46, -0.005, xr - 0.003, 2.3, 0.005, PLASTIC, 'black', faces='x')  # door split
    box(b, xr - 0.02, 2.38, -0.2, xr + 0.02, 2.44, 0.2, TAIL, 'tail', faces='xyY')  # high brake light
    rbox(b, X0 - 0.1, X0 + 0.35, 0.34, 0.6, W - 0.02, PLASTIC, 'plastic', seg=seg)
    plate(b, X0 - 0.01, 0.84, -0.26, 0.26, front=False)
    # front: bumper, grille, headlights, plate, wipers
    rbox(b, 2.6, X1 + 0.05, 0.3, 0.6, W - 0.06, PLASTIC, 'plastic', seg=seg)
    box(b, X1 - 0.06, 0.34, -0.5, X1 + 0.056, 0.44, 0.5, PLASTIC, 'black', faces='X')  # lower intake
    box(b, X1 - 0.08, 0.6, -0.36, X1 + 0.012, 0.9, 0.36, PLASTIC, 'black', faces='XyYzZ', rects={'X': rect_uv('grille_bar')})
    plate(b, X1 + 0.06, 0.47, -0.26, 0.26, front=True)
    for s in (1, -1):
        # headlight unit on the nose corner, its lens wrapping onto the wing
        z0, z1 = sorted((s * 0.4, s * 0.8))
        box(b, X1 - 0.2, 0.66, z0, X1 + 0.014, 0.9, z1, HEAD, 'head', faces='X' + ('Z' if s > 0 else 'z') + 'Y',
            rects={'X': rect_uv('head', flip=s < 0), 'Z': rect_uv('head', sub=(0.0, 0, 0.3, 1)), 'z': rect_uv('head', sub=(0.0, 0, 0.3, 1))})
        zw = s * (W / 2 + 0.004)
        box(b, 2.56, 0.8, min(zw, zw - s * 0.01), 2.66, 0.86, max(zw, zw - s * 0.01), BASE, 'amber', faces='Z' if s > 0 else 'z')
        if q == 0:  # fog lamps in the bumper
            box(b, X1 - 0.02, 0.4, s * 0.72 - 0.08, X1 + 0.058, 0.48, s * 0.72 + 0.08, HEAD, 'head', faces='X')
    if q == 0:
        for s in (1, -1):
            tube(b, (1.96, 1.34, s * 0.05 - 0.02), (1.72, 1.62, s * 0.55 - 0.1), 0.012, 4, PLASTIC, 'black', caps=False)
        # roof hatch + antenna
        box(b, -0.9, H - 0.01, -0.34, -0.3, H + 0.06, 0.34, PLASTIC, 'plastic', faces='xXYzZ')
    # wheels
    for axx in AX:
        for s in (1, -1):
            wheel(b, axx, s * (W / 2 - 0.16), WR, 0.24, q, style='steel', hub='rim')
    # under-body shadow slab between the arches (hides the see-through underside)
    box(b, X0 + 0.3, 0.26, -W / 2 + 0.12, X1 - 0.5, 0.40, W / 2 - 0.12, PLASTIC, 'under', faces='yzZ')
    return b


def face_x(b, x, z0, z1, y0, y1, part, uv, front=True, flip=False):
    """decal on a plane x = const: front (seen from +x) or rear (seen from -x). uv: swatch / rect name / uv list."""
    if isinstance(uv, str):
        uv = rect_uv(uv, flip=flip) if uv in RECT else [sw(uv)] * 4
    if front:
        b.quad(V3(x, y0, z1), V3(x, y0, z0), V3(x, y1, z0), V3(x, y1, z1), part, uv)
    else:
        b.quad(V3(x, y0, z0), V3(x, y0, z1), V3(x, y1, z1), V3(x, y1, z0), part, uv)


def glass_door(b, secs, side, x0, x1, y0, y1, card, leaves=2, q=0):
    """bus door: black frame, glass leaves showing the interior, rubber seals between the leaves."""
    side_quad(b, secs, side, x0 - 0.05, x1 + 0.05, y0, y1 + 0.05, PLASTIC, 'trim', push=0.005)
    w = (x1 - x0) / leaves
    for i in range(leaves):
        a, c = x0 + i * w + 0.03, x0 + (i + 1) * w - 0.03
        u0 = (0.31, 0.12, 0.55, 0.78)[(i + int(x0 * 7)) % 4]
        sub = (u0, 0.02, u0 + 0.1, 1.0)
        side_quad(b, secs, side, a, c, y0 + 0.08, y1 - 0.04, GLASS, rect_uv(card, sub=sub), push=0.009, mirror=True)
        if q < 2:  # kick panel at the bottom of each leaf
            side_quad(b, secs, side, a, c, y0 + 0.02, y0 + 0.3, PLASTIC, 'black', push=0.011)


def bus(q):
    """Electron / LAZ-style 12 m low-floor city bus (and the trolleybus body): huge split windscreen under an LED
    route board, black glazing band, three double doors on the right, rabbit-ear mirrors, roof pod in front of the
    trolley pole mounts (x ~ -0.5), round lamp clusters, operator name + ad panel on the sides."""
    b = MB()
    L, W, H = 12.2, 2.55, 2.98
    X0, X1 = -L / 2, L / 2
    seg = [3, 1, 1][q]
    WR, RA, AX = 0.5, 0.6, (-2.7, 3.45)
    arches = [(AX[0], WR, RA), (AX[1], WR, RA)]
    na = [6, 3, 2][q]
    ends = [X0, X0 + 0.05, X0 + 0.18, X1 - 0.2, X1 - 0.06, X1]
    xs = sorted(set(ends + [0.0] + arch_xs(AX[0], RA, na) + arch_xs(AX[1], RA, na)))
    if q == 2:
        xs, seg = dedup_xs([X0, X0 + 0.18, X1 - 0.2, X1] + arch_xs(AX[0], RA, 2) + arch_xs(AX[1], RA, 2)), 0
    yb = lambda x: arch_yb(x, arches, 0.32) if X0 + 0.18 <= x <= X1 - 0.2 else 0.36
    yt = lambda x: pwl([(X0, H - 0.1), (X0 + 0.05, H - 0.03), (X0 + 0.18, H), (X1 - 0.2, H), (X1 - 0.06, H - 0.03), (X1, H - 0.1)], x)
    ww = lambda x: pwl([(X0, W - 0.1), (X0 + 0.05, W - 0.03), (X0 + 0.18, W), (X1 - 0.2, W), (X1 - 0.06, W - 0.04), (X1, W - 0.16)], x)
    secs = body_secs(xs, yb, yt, ww, ww, lambda x: 0.06, lambda x: 0.2)
    loft(b, secs, seg)
    zs = W / 2
    if q == 2:
        lod2_dress(b, secs, X0, X1, [(X0 + 0.35, 5.9, 1.06, 2.66)], ('face', 1.0, 2.72, 1.06), (0.62, 0.8, 0.62, 1.06), (0.72, 1.3, 0.84, 1.16),
                   [(AX[1], zs - 0.2, WR, 0.3), (AX[0], zs - 0.28, WR, 0.46)])
        return b
    # --- front: split windscreen, LED board, lamp clusters, bumper, plate
    xf = X1 + 0.004
    face_x(b, xf, -1.08, 1.08, 0.98, 2.74, PLASTIC, 'trim')
    for s in (1, -1):
        z0, z1 = (0.02, 1.02) if s > 0 else (-1.02, -0.02)
        face_x(b, xf + 0.004, z0, z1, 1.04, 2.52, GLASS,
               rect_uv('car_front', flip=True, sub=(0.5, 0.0, 1.0, 1.0) if s > 0 else (0.0, 0.0, 0.5, 1.0)))
    face_x(b, xf + 0.006, -0.9, 0.9, 2.56, 2.72, SCREEN, 'dest')
    for s in (1, -1):
        z0, z1 = sorted((s * 0.62, s * 1.06))
        face_x(b, xf + 0.004, z0, z1, 0.62, 0.8, HEAD, 'lamps3', flip=s < 0)
        face_x(b, xf + 0.004, z0 + (0.26 if s < 0 else 0), z1 - (0.26 if s > 0 else 0), 0.84, 0.9, BASE, 'amber')
    face_x(b, xf + 0.004, -0.5, 0.5, 0.62, 0.86, PLASTIC, 'vent')
    rbox(b, X1 - 0.12, X1 + 0.08, 0.3, 0.56, W - 0.08, PLASTIC, 'plastic', seg=seg)
    plate(b, X1 + 0.085, 0.44, -0.26, 0.26, front=True)
    if q < 2:  # wipers
        for s in (1, -1):
            tube(b, (xf + 0.012, 1.08, s * 0.5 - 0.35), (xf + 0.012, 1.8, s * 0.5 - 0.1), 0.012, 4, PLASTIC, 'black', caps=False)
    # rabbit-ear mirrors on arms curling forward from the top front corners
    if q < 2:
        for s in (1, -1):
            p0 = V3(X1 - 0.15, 2.62, s * (zs - 0.02))
            p1 = V3(X1 + 0.22, 2.72, s * (zs + 0.08))
            p2 = V3(X1 + 0.34, 2.45, s * (zs + 0.12))
            tube(b, p0, p1, 0.025, 5 if q == 0 else 4, PLASTIC, 'black', caps=False)
            tube(b, p1, p2, 0.025, 5 if q == 0 else 4, PLASTIC, 'black', caps=False)
            box(b, p2.x - 0.05, 1.98, p2.z - 0.13, p2.x + 0.05, 2.46, p2.z + 0.13, PLASTIC, 'black')
    # --- rear: window, ad panel on the engine lid, lamp stacks, vent, bumper, plate
    xr = X0 - 0.004
    face_x(b, xr, -1.0, 1.0, 1.72, 2.72, PLASTIC, 'trim', front=False)
    face_x(b, xr - 0.004, -0.94, 0.94, 1.78, 2.66, GLASS, rect_uv('bus_int', sub=(0.3, 0.0, 0.7, 0.9)), front=False)
    face_x(b, xr - 0.004, -0.72, 0.72, 1.18, 1.6, AD, 'ad', front=False)
    face_x(b, xr - 0.004, -0.6, 0.6, 0.62, 1.02, PLASTIC, 'vent', front=False)
    for s in (1, -1):
        z0, z1 = sorted((s * 0.84, s * 1.16))
        face_x(b, xr - 0.004, z0, z1, 0.72, 1.3, TAIL, 'tail_blk', front=False, flip=s > 0)
    rbox(b, X0 - 0.08, X0 + 0.12, 0.3, 0.54, W - 0.08, PLASTIC, 'plastic', seg=seg)
    face_x(b, xr - 0.006, -0.26, 0.26, 0.7, 0.826, BASE, 'plate', front=False)
    # --- sides
    yw0, yw1 = 1.06, 2.66
    doors = [(4.3, 5.55), (0.2, 1.5), (-2.0, -0.75)]  # right side, front to rear
    for side in (1, -1):
        # glazing band: black band, panes between pillars (doors cut in on the right)
        segs_x = [X0 + 0.35, -3.3, -2.0, -0.75, 0.2, 1.5, 2.9, 4.3, 5.9] if side > 0 else [X0 + 0.35, -3.3, -1.4, 0.5, 2.4, 4.3, 5.9]
        side_quad(b, secs, side, X0 + 0.3, X1 - 0.12, yw0 - 0.05, yw1 + 0.05, PLASTIC, 'trim', push=0.005)
        for i, (a, c) in enumerate(zip(segs_x, segs_x[1:])):
            if side > 0 and any(abs(a - d0) < 1e-6 for d0, _ in doors):
                continue
            if side < 0 and c > 5.8:  # driver's window with a sliding pane
                side_quad(b, secs, side, a + 0.04, c - 0.04, yw0 + 0.25, yw1 - 0.04, GLASS,
                          rect_uv('car_side', sub=(0.62, 0.02, 0.98, 0.9)), push=0.009, mirror=True)
                continue
            u0 = (i * 0.27) % 0.7
            side_quad(b, secs, side, a + 0.04, c - 0.04, yw0 + 0.04, yw1 - 0.04, GLASS,
                      rect_uv('bus_int', sub=(u0, 0.0, u0 + 0.3 * (c - a) / 1.6, 1.0)), push=0.009, mirror=True)
            if q == 0:  # top-hinged vents
                side_quad(b, secs, side, a + 0.04, c - 0.04, yw1 - 0.34, yw1 - 0.3, PLASTIC, 'trim', push=0.011)
        if side > 0:
            for (d0, d1) in doors:
                glass_door(b, secs, side, d0, d1, 0.36, yw1, 'bus_int', q=q)
        # side route number board (front, right) + operator name under the windows
        if side > 0:
            side_quad(b, secs, side, 2.95, 4.2, 2.3, 2.6, SCREEN, 'dest', push=0.012)
            side_quad(b, secs, side, 1.75, 2.95, 0.84, 1.018, BASE, 'oper', push=0.006)
        else:
            side_quad(b, secs, side, 0.2, 2.3, 0.72, 1.03, BASE, 'oper', push=0.006)
        # flag stripes along the skirt (blue / yellow), broken by the arches and doors
        runs = [(X0 + 0.2, AX[0] - RA - 0.06), (AX[0] + RA + 0.06, AX[1] - RA - 0.06), (AX[1] + RA + 0.06, X1 - 0.1)]
        for (a, c) in runs:
            cuts = [(d0 - 0.06, d1 + 0.06) for d0, d1 in doors] if side > 0 else []
            pieces = [(a, c)]
            for (d0, d1) in cuts:
                nxt = []
                for (p0, p1) in pieces:
                    if d1 <= p0 or d0 >= p1:
                        nxt.append((p0, p1))
                    else:
                        if d0 > p0:
                            nxt.append((p0, d0))
                        if d1 < p1:
                            nxt.append((d1, p1))
                pieces = nxt
            for (p0, p1) in pieces:
                if p1 - p0 > 0.1:
                    side_quad(b, secs, side, p0, p1, 0.5, 0.58, BASE, 'blue', push=0.006)
                    side_quad(b, secs, side, p0, p1, 0.58, 0.64, BASE, 'yellow', push=0.006)
        # ad panel (the TAXI part: one of 8 ads per bus)
        if side < 0:
            side_quad(b, secs, side, -1.95, -0.25, 0.42, 0.985, AD, 'ad', push=0.009)
        # wheel arch trims, marker lamps
        if q < 2:
            for axx in AX:
                arch_flare(b, axx, WR, RA, side * (zs - 0.06), side * (zs + 0.025), q, width=0.05)
            for x in (X0 + 0.3, -0.3, X1 - 0.3):
                side_quad(b, secs, side, x - 0.06, x + 0.06, 0.4, 0.46, LAMP, 'amber', push=0.008)
    # --- roof: equipment pod ahead of / under the trolley pole mounts, rear hatch
    rp = [dict(x=-0.95, yb=H - 0.05, yt=H + 0.06, wb=1.5, wt=1.3, rb=0.02, rt=0.05),
          dict(x=-0.8, yb=H - 0.05, yt=H + 0.12, wb=1.6, wt=1.4, rb=0.02, rt=0.08),
          dict(x=2.4, yb=H - 0.05, yt=H + 0.12, wb=1.6, wt=1.4, rb=0.02, rt=0.08),
          dict(x=2.7, yb=H - 0.05, yt=H + 0.04, wb=1.4, wt=1.2, rb=0.02, rt=0.03)]
    loft(b, rp, seg, PAINT, 'white')
    if q == 0:
        for x in (-0.6, 0.4, 1.4):
            box(b, x, H + 0.12, -0.55, x + 0.7, H + 0.125, 0.55, PLASTIC, 'trim', faces='Y')
        box(b, -4.6, H - 0.01, -0.4, -3.9, H + 0.07, 0.4, PLASTIC, 'plastic', faces='xXYzZ')
    # wheels: single front, dual rear
    for s in (1, -1):
        wheel(b, AX[1], s * (zs - 0.2), WR, 0.3, q, style='steel', hub='rim')
        wheel(b, AX[0], s * (zs - 0.28), WR, 0.46, q, dual=True, hub='rim')
    box(b, X0 + 0.4, 0.2, -zs + 0.15, X1 - 0.5, 0.33, zs - 0.15, PLASTIC, 'under', faces='yzZ')
    return b


def windscreen(b, secs, xa, xb, card, q, board=False, inset=0.05, flip=True, split=None):
    """frame + glass on the raked top surface of a loft between the sections at xa (top) and xb (base)."""
    def on_top(x, zf):
        s = next(s for s in secs if abs(s['x'] - x) < 1e-6)
        return V3(x, s['yt'], zf * (s['wt'] / 2 - s['rt'] * 0.6))
    tl, tr, bl, br = on_top(xa, 1), on_top(xa, -1), on_top(xb, 1), on_top(xb, -1)
    nrm = (tr - tl).cross(bl - tl).normalized()
    if nrm.y < 0:
        nrm = -nrm
    for push, part, uv, k in ((0.006, PLASTIC, [sw('trim')] * 4, 0.0), (0.012, GLASS, rect_uv(card, flip=flip), inset)):
        pts = [bl + nrm * push + V3(-k * 0.8, k * 0.6, -k * 0.7), br + nrm * push + V3(-k * 0.8, k * 0.6, k * 0.7),
               tr + nrm * push + V3(k * 0.5, -k * 0.4, k * 0.9), tl + nrm * push + V3(k * 0.5, -k * 0.4, -k * 0.9)]
        if part == GLASS and split:  # lower part shows the card, the upper part is plain tinted glass
            ml, mr = pts[0].lerp(pts[3], split), pts[1].lerp(pts[2], split)
            b.quad(pts[0], pts[1], mr, ml, part, uv)
            b.quad(ml, mr, pts[2], pts[3], part, rect_uv('bus_int', sub=(0.2, 0.0, 0.8, 0.12)))
        else:
            b.quad(*pts, part, uv)
    if board and q < 2:  # LED route board behind the top of the windscreen
        bh = board if isinstance(board, float) else 0.2
        a, c2 = pts[3].lerp(pts[0], 0.06), pts[2].lerp(pts[1], 0.06)
        a2, c3 = pts[3].lerp(pts[0], 0.06 + bh), pts[2].lerp(pts[1], 0.06 + bh)
        o = nrm * 0.004
        b.quad(a2.lerp(c3, 0.1) + o, a2.lerp(c3, 0.9) + o, a.lerp(c2, 0.9) + o, a.lerp(c2, 0.1) + o, SCREEN, rect_uv('dest'))
    return nrm


def side_strip(b, secs, side, x0, x1, f0, f1, n, part, uv, push=0.006):
    """band on a loft side between the curves y = f0(x) and y = f1(x), n segments (livery swooshes)."""
    for i in range(n):
        a, c = lerp(x0, x1, i / n), lerp(x0, x1, (i + 1) / n)
        P = [(a, f0(a)), (c, f0(c)), (c, f1(c)), (a, f1(a))]
        pts = [V3(x, y, side * (half_w(secs, x, y) + push)) for (x, y) in P]
        if side > 0:
            b.quad(*pts, part, sw(uv))
        else:
            b.quad(pts[1], pts[0], pts[3], pts[2], part, sw(uv))


def truck(q):
    """GAZelle-style box truck: short-nosed cab with a big trapezoid grille, roof wind deflector, white box body
    with the ad livery, dual rear wheels on a black chassis."""
    b = MB()
    L, W, WC = 7.3, 2.3, 2.08
    X0, X1 = -L / 2, L / 2
    seg = [3, 1, 1][q]
    WR, RA, AXF, AXR = 0.37, 0.45, 2.72, -1.45
    na = [6, 3, 2][q]
    CX = 1.45  # cab back
    yt_p = [(CX, 2.26), (CX + 0.06, 2.3), (2.3, 2.3), (2.42, 2.22), (3.02, 1.36), (3.42, 1.22), (3.58, 1.12), (X1, 0.98)]
    xs = sorted(set([CX, CX + 0.06, 2.3, 2.42, 3.02, 3.42, 3.58, X1] + arch_xs(AXF, RA, na)))
    if q == 2:
        xs, seg = dedup_xs([CX, 2.42, 3.02, 3.42, X1] + arch_xs(AXF, RA, 2)), 0
    yb = lambda x: arch_yb(x, [(AXF, WR, RA)], 0.56) if x < 3.45 else 0.5
    wb = lambda x: pwl([(CX, WC - 0.06), (CX + 0.06, WC), (3.3, WC), (3.42, WC - 0.04), (3.58, WC - 0.14), (X1, WC - 0.3)], x)
    wt = lambda x: pwl([(CX, WC - 0.06), (CX + 0.06, WC), (3.02, WC), (3.42, WC - 0.08), (3.58, WC - 0.2), (X1, WC - 0.38)], x)
    rt = lambda x: pwl([(CX, 0.14), (2.3, 0.2), (2.42, 0.2), (3.02, 0.12), (X1, 0.1)], x)
    secs = body_secs(xs, yb, lambda x: pwl(yt_p, x), wb, wt, lambda x: 0.06, rt)
    loft(b, secs, seg)
    if q == 2:
        lod2_dress(b, secs, X0, X1, [(1.95, 2.9, 1.42, 2.06)], ('top', 2.42, 3.02), (0.74, 0.98, 0.47, 0.86), (0.56, 0.68, 0.72, 1.02),
                   [(AXF, WC / 2 - 0.17, WR, 0.24), (AXR, W / 2 - 0.3, WR, 0.4)], card='car_side')
        loft(b, [dict(x=CX + 0.1, yb=2.24, yt=3.3, wb=WC - 0.12, wt=WC - 0.24, rb=0.02, rt=0.1),
                 dict(x=2.22, yb=2.24, yt=2.32, wb=WC - 0.3, wt=WC - 0.4, rb=0.02, rt=0.03)], 0)
        bs = [dict(x=X0, yb=0.98, yt=3.5, wb=W, wt=W, rb=0.03, rt=0.06), dict(x=CX - 0.1, yb=0.98, yt=3.5, wb=W, wt=W, rb=0.03, rt=0.06)]
        loft(b, bs, 0, BASE, 'cab')
        for side in (1, -1):
            side_quad(b, bs, side, X0 + 0.1, CX - 0.2, 1.06, 3.42, BASE, 'side_ad_red', push=0.004)
        box(b, X0 + 0.2, 0.5, -0.9, CX, 0.98, 0.9, PLASTIC, 'under', faces='xyzZ')
        return b
    windscreen(b, secs, 2.42, 3.02, 'car_front', q)
    for side in (1, -1):
        card = rect_uv('car_side', sub=(0.6, 0.02, 0.98, 0.85)) if side < 0 else rect_uv('car_side', sub=(0.2, 0.02, 0.55, 0.85))
        framed_window(b, secs, side, 1.95, 2.98, 1.42, 2.08, card, xt0=1.95, xt1=2.52, frame=0.04)
        if q < 2:
            side_quad(b, secs, side, 1.86, 1.88, 0.62, 2.2, PLASTIC, 'black', push=0.004)  # door gap
            box(b, 2.0, 1.3, side * WC / 2 - 0.03, 2.18, 1.34, side * WC / 2 + 0.03, PLASTIC, 'black', faces='xXyYzZ')
            z0 = side * (WC / 2)
            mirror_arm(b, side, (2.9, 1.6, z0), (2.85, 1.75, z0 + side * 0.22), (2.84, 1.72, z0 + side * 0.26), 0.14, 0.34, q)
            arch_flare(b, AXF, WR, RA, side * (WC / 2 - 0.06), side * (WC / 2 + 0.03), q)
            side_quad(b, secs, side, 3.2, 3.32, 0.86, 0.92, BASE, 'amber', push=0.006)
        side_quad(b, secs, side, CX + 0.1, 3.25, 0.62, 0.72, PLASTIC, 'black', push=0.008)
    # front face: bumper, trapezoid grille, big headlights, plate
    xf = X1 + 0.004
    rbox(b, X1 - 0.3, X1 + 0.08, 0.36, 0.7, WC - 0.02, PLASTIC, 'plastic', seg=seg)
    box(b, X1 - 0.1, 0.72, -0.44, xf + 0.008, 0.98, 0.44, PLASTIC, 'black', faces='XyYzZ', rects={'X': rect_uv('grille_hex')})
    for s in (1, -1):
        z0, z1 = sorted((s * 0.47, s * 0.86))
        box(b, X1 - 0.24, 0.74, z0, xf + 0.012, 0.98, z1, HEAD, 'head', faces='XY' + ('Z' if s > 0 else 'z'),
            rects={'X': rect_uv('head', flip=s < 0), 'Z': rect_uv('head', sub=(0, 0, 0.3, 1)), 'z': rect_uv('head', sub=(0, 0, 0.3, 1))})
        if q == 0:
            box(b, X1 + 0.02, 0.44, s * 0.74 - 0.07, X1 + 0.085, 0.52, s * 0.74 + 0.07, HEAD, 'head', faces='X')
    plate(b, X1 + 0.09, 0.53, -0.26, 0.26, front=True)
    if q == 0:
        for s in (1, -1):
            tube(b, (3.0, 1.4, s * 0.05 - 0.02), (2.78, 1.72, s * 0.5 - 0.1), 0.012, 4, PLASTIC, 'black', caps=False)
    # roof wind deflector (cab colour)
    dfl = [dict(x=CX + 0.1, yb=2.24, yt=3.3, wb=WC - 0.12, wt=WC - 0.24, rb=0.02, rt=0.1),
           dict(x=2.1, yb=2.24, yt=2.42, wb=WC - 0.2, wt=WC - 0.3, rb=0.02, rt=0.06),
           dict(x=2.22, yb=2.24, yt=2.32, wb=WC - 0.3, wt=WC - 0.4, rb=0.02, rt=0.03)]
    loft(b, dfl, seg)
    # box body (white) with the ad livery on both sides
    BX0, BX1, BY0, BY1 = X0, CX - 0.1, 0.98, 3.5
    bsecs = [dict(x=BX0, yb=BY0, yt=BY1, wb=W - 0.08, wt=W - 0.08, rb=0.03, rt=0.06),
             dict(x=BX0 + 0.04, yb=BY0, yt=BY1, wb=W, wt=W, rb=0.03, rt=0.06),
             dict(x=BX1 - 0.04, yb=BY0, yt=BY1, wb=W, wt=W, rb=0.03, rt=0.06),
             dict(x=BX1, yb=BY0, yt=BY1, wb=W - 0.08, wt=W - 0.08, rb=0.03, rt=0.06)]
    loft(b, bsecs, seg, BASE, 'cab')
    for side in (1, -1):
        side_quad(b, bsecs, side, BX0 + 0.1, BX1 - 0.1, BY0 + 0.08, BY1 - 0.08, BASE, 'side_ad_red', push=0.004)
        if q < 2:  # corner posts / rails
            for (a, c) in ((BX0 + 0.02, BX0 + 0.08), (BX1 - 0.08, BX1 - 0.02)):
                side_quad(b, bsecs, side, a, c, BY0, BY1, METAL, 'rim', push=0.006)
            side_quad(b, bsecs, side, BX0, BX1, BY0, BY0 + 0.06, METAL, 'rim', push=0.006)
            side_quad(b, bsecs, side, BX0, BX1, BY1 - 0.05, BY1, METAL, 'rim', push=0.006)
    xr = BX0 - 0.004
    face_x(b, xr, -1.1, 1.1, BY0 + 0.05, BY1 - 0.05, BASE, 'cab', front=False)
    face_x(b, xr - 0.002, -0.006, 0.006, BY0 + 0.05, BY1 - 0.05, PLASTIC, 'black', front=False)
    if q < 2:
        for zc in (-0.55, 0.55):  # lock bars + hinges
            tube(b, (xr - 0.03, BY0 + 0.1, zc), (xr - 0.03, BY1 - 0.1, zc), 0.018, 4, METAL, 'chrome')
        for zc in (-1.08, 1.08):
            for y in (1.3, 2.25, 3.2):
                box(b, xr - 0.03, y - 0.06, zc - 0.05, xr, y + 0.06, zc + 0.05, METAL, 'rim', faces='xyYzZ')
    # chassis: rails, rear bar with the lamps, side guards, mudflaps, fuel tank
    box(b, X0 + 0.2, 0.58, -0.5, CX, 0.98, 0.5, PLASTIC, 'under', faces='yzZ')
    box(b, X0 - 0.06, 0.52, -1.06, X0 + 0.14, 0.72, 1.06, PLASTIC, 'plastic', faces='xXyYzZ')
    for s in (1, -1):
        z0, z1 = sorted((s * 0.72, s * 1.02))
        face_x(b, X0 - 0.064, z0, z1, 0.56, 0.68, TAIL, 'tail_blk', front=False, flip=s > 0)
        if q < 2:
            box(b, AXR + 0.6, 0.62, s * (W / 2 - 0.1) - 0.025, 1.0, 0.7, s * (W / 2 - 0.1) + 0.025, PLASTIC, 'black')  # side guard
            box(b, AXR - 0.6, 0.18, s * 0.9 - 0.2, AXR - 0.56, 0.92, s * 0.9 + 0.2, RUBBER, 'rubber', faces='xXzZ')  # mudflap
    face_x(b, X0 - 0.064, -0.26, 0.26, 0.58, 0.706, BASE, 'plate', front=False)
    box(b, 0.1, 0.5, -1.02, 0.9, 0.85, -0.62, METAL, 'rim')  # fuel tank / tool box
    # wheels
    for s in (1, -1):
        wheel(b, AXF, s * (WC / 2 - 0.17), WR, 0.24, q, style='steel', hub='rim')
        wheel(b, AXR, s * (W / 2 - 0.3), WR, 0.4, q, dual=True, hub='rim')
    box(b, CX, 0.4, -WC / 2 + 0.12, 3.2, 0.56, WC / 2 - 0.12, PLASTIC, 'under', faces='yzZ')
    return b


def tour(q):
    """High-deck tourist coach: raked panoramic windscreen with the route board, tall tinted side glazing, luggage bays,
    a gold / red / blue livery swoosh over the tinted body, rabbit-ear mirrors, roof AC pod."""
    b = MB()
    L, W, H = 11.0, 2.55, 3.95
    X0, X1 = -L / 2, L / 2
    seg = [3, 1, 1][q]
    WR, RA, AX = 0.52, 0.62, (-2.75, 3.3)
    na = [6, 3, 2][q]
    arches = [(AX[0], WR, RA), (AX[1], WR, RA)]
    fx = [4.8, 4.94, 5.06, 5.42, X1]
    yt_p = [(X0, H - 0.14), (X0 + 0.06, H - 0.04), (X0 + 0.2, H), (4.8, H), (4.94, H - 0.08), (5.06, H - 0.3), (5.42, 1.4), (X1, 1.2)]
    xs = sorted(set([X0, X0 + 0.06, X0 + 0.2, 0.0] + fx + arch_xs(AX[0], RA, na) + arch_xs(AX[1], RA, na)))
    if q == 2:
        xs, seg = dedup_xs([X0, X0 + 0.2, 4.8, 5.06, 5.42, X1] + arch_xs(AX[0], RA, 2) + arch_xs(AX[1], RA, 2)), 0
    yb = lambda x: arch_yb(x, arches, 0.46) if X0 + 0.2 <= x <= 5.3 else 0.5
    wb = lambda x: pwl([(X0, W - 0.12), (X0 + 0.06, W - 0.03), (X0 + 0.2, W), (5.06, W), (5.42, W - 0.06), (X1, W - 0.18)], x)
    wt = lambda x: pwl([(X0, W - 0.12), (X0 + 0.06, W - 0.03), (X0 + 0.2, W), (4.8, W), (4.94, W - 0.04), (5.06, W - 0.1),
                        (5.42, W - 0.08), (X1, W - 0.2)], x)
    rt = lambda x: pwl([(X0, 0.24), (X0 + 0.2, 0.3), (4.8, 0.3), (4.94, 0.26), (5.06, 0.22), (5.42, 0.14), (X1, 0.1)], x)
    secs = body_secs(xs, yb, lambda x: pwl(yt_p, x), wb, wt, lambda x: 0.07, rt)
    loft(b, secs, seg)
    zs = W / 2
    if q == 2:
        lod2_dress(b, secs, X0, X1, [(X0 + 0.35, 4.72, 2.02, 3.62)], ('top', 5.06, 5.42), (0.8, 1.06, 0.68, 1.1), (0.8, 1.9, 0.9, 1.18),
                   [(AX[1], zs - 0.2, WR, 0.3), (AX[0], zs - 0.28, WR, 0.46)])
        for side in (1, -1):
            side_quad(b, secs, side, X0 + 0.25, 3.95, 1.3, 1.6, BASE, 'gold', push=0.007)
        return b
    windscreen(b, secs, 5.06, 5.42, 'car_front', q, board=0.1, inset=0.06, split=0.62)
    # --- sides: glazing band, doors, luggage bays, swoosh
    yw0, yw1 = 2.02, 3.62
    for side in (1, -1):
        side_quad(b, secs, side, X0 + 0.35, 4.72, yw0 - 0.06, yw1 + 0.06, PLASTIC, 'trim', push=0.005)
        xs_w = [X0 + 0.4, -3.7, -2.0, -0.3, 1.4, 3.1, 4.68]
        for i, (a, c) in enumerate(zip(xs_w, xs_w[1:])):
            if side > 0 and a > -0.4 and c < 0.1:
                continue
            u0 = (0.02 + i * 0.13) % 0.3  # coach seats (car rear-seat card), the heads of a few passengers
            card = rect_uv('car_side', sub=(u0, 0.0, u0 + 0.28, 0.75)) if i % 3 else rect_uv('bus_int', sub=(0.62, 0.1, 0.9, 1.0))
            side_quad(b, secs, side, a + 0.035, c - 0.035, yw0, yw1, GLASS, card,
                      push=0.009, mirror=True)
        if side > 0:  # front door (ahead of the front axle) + middle door
            glass_door(b, secs, side, 4.0, 4.72, 0.52, 3.55, 'bus_int', leaves=1, q=q)
            side_quad(b, secs, side, 4.05, 4.68, 2.02, 2.12, PLASTIC, 'trim', push=0.012)
        else:  # driver's window, low in front
            framed_window(b, secs, side, 4.0, 4.72, 1.3, 3.55, rect_uv('car_side', sub=(0.62, 0.0, 0.98, 1.0)), frame=0.05)
        # luggage bays between the axles
        bays = [(-2.0, -0.6), (-0.52, 0.88), (0.96, 2.52)]
        if q < 2:
            for (a, c) in bays:
                for (x0_, x1_, y0_, y1_) in ((a, c, 0.56, 0.58), (a, c, 1.74, 1.76), (a, a + 0.02, 0.56, 1.76), (c - 0.02, c, 0.56, 1.76)):
                    side_quad(b, secs, side, x0_, x1_, y0_, y1_, PLASTIC, 'black', push=0.005)
                side_quad(b, secs, side, (a + c) / 2 - 0.15, (a + c) / 2 + 0.15, 0.66, 0.7, METAL, 'chrome', push=0.008)
        # black skirt
        side_quad(b, secs, side, X0 + 0.2, AX[0] - RA - 0.05, 0.46, 0.56, PLASTIC, 'black', push=0.005)
        side_quad(b, secs, side, AX[0] + RA + 0.05, AX[1] - RA - 0.05, 0.46, 0.56, PLASTIC, 'black', push=0.005)
        side_quad(b, secs, side, AX[1] + RA + 0.05, 5.3, 0.5, 0.56, PLASTIC, 'black', push=0.005)
        # livery swoosh: three bands sweeping up toward the rear
        k = lambda x: ((4.9 - x) / (4.9 - X0 - 0.3)) ** 1.7
        sw_y = lambda x, o: 1.2 + o * (1 + 0.3 * k(x)) + 0.2 * k(x)
        n = [16, 6, 3][q]
        for (o0, o1, col) in ((0.0, 0.2, 'gold'), (0.24, 0.34, 'red'), (0.38, 0.43, 'blue')):
            side_strip(b, secs, side, X0 + 0.25, 3.95, lambda x, o=o0: sw_y(x, o),
                       lambda x, o=o1: sw_y(x, o), n, BASE, col, push=0.007)
        if q < 2:
            for axx in AX:
                arch_flare(b, axx, WR, RA, side * (zs - 0.06), side * (zs + 0.025), q, width=0.05)
            for x in (X0 + 0.3, -2.0, 0.5, 3.0):
                side_quad(b, secs, side, x - 0.05, x + 0.05, 3.8, 3.84, LAMP, 'amber', push=0.006)
            # rabbit-ear mirrors
            p0 = V3(4.92, 3.5, side * (zs - 0.08))
            p1 = V3(5.35, 3.62, side * (zs + 0.06))
            p2 = V3(5.62, 3.3, side * (zs + 0.1))
            tube(b, p0, p1, 0.026, 5 if q == 0 else 4, PLASTIC, 'black', caps=False)
            tube(b, p1, p2, 0.026, 5 if q == 0 else 4, PLASTIC, 'black', caps=False)
            box(b, p2.x - 0.05, 2.8, p2.z - 0.14, p2.x + 0.05, 3.32, p2.z + 0.14, PLASTIC, 'black')
    # --- front face: lamps, grille, bumper, plate
    xf = X1 + 0.004
    rbox(b, X1 - 0.14, X1 + 0.08, 0.42, 0.72, W - 0.1, PLASTIC, 'plastic', seg=seg)
    face_x(b, xf, -0.62, 0.62, 0.76, 1.1, PLASTIC, 'grille_bar')
    for s in (1, -1):
        z0, z1 = sorted((s * 0.68, s * 1.1))
        face_x(b, xf + 0.002, z0, z1, 0.8, 1.06, HEAD, 'head', flip=s < 0)
    plate(b, X1 + 0.085, 0.5, -0.26, 0.26, front=True)
    if q == 0:
        for s in (1, -1):
            tube(b, (5.43, 1.46, s * 0.55 - 0.3), (5.3, 2.2, s * 0.55 - 0.05), 0.013, 4, PLASTIC, 'black', caps=False)
        for z in (-0.5, 0.0, 0.5):  # marker lamps on the front roof edge
            box(b, 4.9, H - 0.04, z - 0.06, 4.98, H + 0.01, z + 0.06, LAMP, 'amber', faces='XYzZ')
    # --- rear: window, engine grille, lamp columns, plate
    xr = X0 - 0.004
    face_x(b, xr, -0.98, 0.98, 2.5, 3.6, PLASTIC, 'trim', front=False)
    face_x(b, xr - 0.004, -0.92, 0.92, 2.56, 3.54, GLASS, rect_uv('bus_int', sub=(0.35, 0.0, 0.75, 0.9)), front=False)
    face_x(b, xr - 0.004, -0.8, 0.8, 0.9, 1.9, PLASTIC, 'vent', front=False)
    for s in (1, -1):
        z0, z1 = sorted((s * 0.9, s * 1.18))
        face_x(b, xr - 0.004, z0, z1, 0.8, 1.9, TAIL, 'tail_blk', front=False, flip=s > 0)
    face_x(b, xr - 0.006, -0.26, 0.26, 0.64, 0.766, BASE, 'plate', front=False)
    rbox(b, X0 - 0.08, X0 + 0.12, 0.44, 0.62, W - 0.1, PLASTIC, 'plastic', seg=seg)
    # --- roof AC pod
    rp = [dict(x=-1.2, yb=H - 0.05, yt=H + 0.05, wb=1.7, wt=1.5, rb=0.02, rt=0.04),
          dict(x=-1.0, yb=H - 0.05, yt=H + 0.15, wb=1.8, wt=1.6, rb=0.02, rt=0.1),
          dict(x=2.2, yb=H - 0.05, yt=H + 0.15, wb=1.8, wt=1.6, rb=0.02, rt=0.1),
          dict(x=2.6, yb=H - 0.05, yt=H + 0.04, wb=1.6, wt=1.4, rb=0.02, rt=0.03)]
    loft(b, rp, seg, PAINT, 'white')
    if q == 0:
        for x in (-0.7, 0.4, 1.5):
            box(b, x, H + 0.15, -0.6, x + 0.6, H + 0.155, 0.6, PLASTIC, 'trim', faces='Y')
    for s in (1, -1):
        wheel(b, AX[1], s * (zs - 0.2), WR, 0.3, q, style='steel', hub='chrome')
        wheel(b, AX[0], s * (zs - 0.28), WR, 0.46, q, dual=True, hub='chrome')
    box(b, X0 + 0.4, 0.3, -zs + 0.15, X1 - 0.5, 0.47, zs - 0.15, PLASTIC, 'under', faces='yzZ')
    return b


def midi(q):
    """Bogdan-style 7.6 m midibus (the classic yellow Cherkasy marshrutka-bus): truck-nosed engine snout under a tall
    split windscreen, route board on top, front door behind the snout, tall side glazing, rear door behind the axle."""
    b = MB()
    L, W, H = 7.6, 2.4, 2.9
    X0, X1 = -L / 2, L / 2
    seg = [3, 1, 1][q]
    WR, RA, AX = 0.42, 0.5, (-1.6, 1.88)
    na = [6, 3, 2][q]
    arches = [(AX[0], WR, RA), (AX[1], WR, RA)]
    XS = 3.3  # windscreen base / snout start
    yt_p = [(X0, H - 0.12), (X0 + 0.05, H - 0.03), (X0 + 0.18, H), (3.0, H), (3.12, H - 0.06), (3.2, H - 0.22), (XS, 1.42),
            (3.46, 1.3), (3.66, 1.22), (X1, 1.08)]
    xs = sorted(set([X0, X0 + 0.05, X0 + 0.18, 0.0, 3.0, 3.12, 3.2, XS, 3.46, 3.66, X1] + arch_xs(AX[0], RA, na) + arch_xs(AX[1], RA, na)))
    if q == 2:
        xs, seg = dedup_xs([X0, X0 + 0.18, 3.0, 3.2, XS, 3.66, X1] + arch_xs(AX[0], RA, 2) + arch_xs(AX[1], RA, 2)), 0
    yb = lambda x: arch_yb(x, arches, 0.5) if X0 + 0.18 <= x <= 3.6 else 0.52
    wb = lambda x: pwl([(X0, W - 0.1), (X0 + 0.05, W - 0.03), (X0 + 0.18, W), (XS, W), (3.46, W - 0.28), (3.66, W - 0.36), (X1, W - 0.5)], x)
    wt = lambda x: pwl([(X0, W - 0.1), (X0 + 0.05, W - 0.03), (X0 + 0.18, W), (3.12, W), (3.2, W - 0.06), (XS, W - 0.04),
                        (3.46, W - 0.4), (3.66, W - 0.5), (X1, W - 0.66)], x)
    rt = lambda x: pwl([(X0, 0.2), (X0 + 0.18, 0.26), (3.0, 0.26), (3.2, 0.2), (XS, 0.14), (3.46, 0.16), (X1, 0.12)], x)
    secs = body_secs(xs, yb, lambda x: pwl(yt_p, x), wb, wt, lambda x: 0.07, rt)
    loft(b, secs, seg)
    zs = W / 2
    if q == 2:
        lod2_dress(b, secs, X0, X1, [(X0 + 0.3, 3.0, 1.3, 2.46)], ('top', 3.2, XS), (0.9, 1.08, 0.36, 0.72), (0.7, 1.3, 0.9, 1.12),
                   [(AX[1], zs - 0.18, WR, 0.26), (AX[0], zs - 0.26, WR, 0.4)])
        return b
    # windscreen: split in two by a centre pillar, LED board above
    nrm = windscreen(b, secs, 3.2, XS, 'car_front', q, board=0.14, inset=0.05)
    if q < 2:
        s0 = next(s for s in secs if abs(s['x'] - 3.2) < 1e-6)
        s1 = next(s for s in secs if abs(s['x'] - XS) < 1e-6)
        pa, pb = V3(3.2, s0['yt'], 0) + nrm * 0.016, V3(XS, s1['yt'], 0) + nrm * 0.016
        b.quad(pb + V3(0, 0, 0.025), pb - V3(0, 0, 0.025), pa - V3(0, 0, 0.025), pa + V3(0, 0, 0.025), PLASTIC, sw('black'))
    # the cardboard route number propped in the kerb-side bottom corner of the windscreen
    if q < 2:
        base, top = V3(XS, 1.42, 0), V3(3.2, H - 0.22, 0)
        up, o = (top - base).normalized(), nrm * 0.02
        c0, c1 = base + up * 0.1 + o, base + up * 0.5 + o
        b.quad(c0 + V3(0, 0, 0.92), c0 + V3(0, 0, 0.3), c1 + V3(0, 0, 0.3), c1 + V3(0, 0, 0.92), BASE, rect_uv('route_card'))
    # sides
    yw0, yw1 = 1.3, 2.46
    for side in (1, -1):
        side_quad(b, secs, side, X0 + 0.28, 3.02, yw0 - 0.05, yw1 + 0.05, PLASTIC, 'trim', push=0.005)
        wx = [X0 + 0.32, -2.3, -0.8, 0.6, 1.9, 2.98] if side < 0 else [X0 + 0.32, -2.3, -0.8, 0.6, 2.36]
        for i, (a, c) in enumerate(zip(wx, wx[1:])):
            if side > 0 and i == 0:
                continue  # rear door
            u0 = (0.05 + i * 0.23) % 0.6
            side_quad(b, secs, side, a + 0.035, c - 0.035, yw0, yw1, GLASS, rect_uv('bus_int', sub=(u0, 0.0, u0 + 0.3, 1.0)),
                      push=0.009, mirror=True)
            if q == 0:
                side_quad(b, secs, side, a + 0.035, c - 0.035, yw1 - 0.3, yw1 - 0.27, PLASTIC, 'trim', push=0.011)
        if side > 0:
            glass_door(b, secs, side, 2.44, 3.18, 0.56, yw1, 'bus_int', q=q)
            glass_door(b, secs, side, X0 + 0.34, -2.34, 0.56, yw1, 'bus_int', leaves=2, q=q)
            side_quad(b, secs, side, 1.0, 2.2, 2.56, 2.76, SCREEN, 'dest', push=0.01)
        if q < 2:  # the same card in a side window by the front door (left: behind the driver)
            x0 = 0.75 if side > 0 else 2.2
            side_quad(b, secs, side, x0, x0 + 0.5, yw0 + 0.06, yw0 + 0.37, BASE, 'route_card', push=0.012)
        # black belt rail + marker lamps
        if side < 0:
            side_quad(b, secs, side, X0 + 0.2, AX[0] - RA - 0.05, 0.9, 1.0, PLASTIC, 'black', push=0.008)
        side_quad(b, secs, side, AX[0] + RA + 0.05, AX[1] - RA - 0.05, 0.9, 1.0, PLASTIC, 'black', push=0.008)
        if q < 2:
            for axx in AX:
                arch_flare(b, axx, WR, RA, side * (zs - 0.06), side * (zs + 0.025), q, width=0.05)
            for x in (X0 + 0.25, 0.0, 2.9):
                side_quad(b, secs, side, x - 0.05, x + 0.05, 2.74, 2.78, LAMP, 'amber', push=0.006)
            p0, p1, p2 = V3(3.05, 2.5, side * (zs - 0.02)), V3(3.4, 2.56, side * (zs + 0.06)), V3(3.5, 2.26, side * (zs + 0.1))
            tube(b, p0, p1, 0.024, 5 if q == 0 else 4, PLASTIC, 'black', caps=False)
            tube(b, p1, p2, 0.024, 5 if q == 0 else 4, PLASTIC, 'black', caps=False)
            box(b, p2.x - 0.05, 1.86, p2.z - 0.12, p2.x + 0.05, 2.28, p2.z + 0.12, PLASTIC, 'black')
    # snout: grille, headlights on the wings of the snout, bumper, plate; body front below the windscreen
    xf = X1 + 0.004
    face_x(b, xf, -0.42, 0.42, 0.64, 0.9, PLASTIC, 'grille_bar')
    face_x(b, xf + 0.004, -0.3, 0.3, 0.92, 1.0, BASE, 'badge')
    for s in (1, -1):
        z0, z1 = sorted((s * 0.46, s * 0.8))
        face_x(b, xf + 0.002, z0, z1, 0.8, 0.98, HEAD, 'head', flip=s < 0)
        if q == 0:
            box(b, XS + 0.02, 1.2, s * 1.08 - 0.08, XS + 0.14, 1.28, s * 1.08 + 0.08, BASE, 'amber', faces='XY')
    rbox(b, X1 - 0.16, X1 + 0.08, 0.4, 0.68, W - 0.36, PLASTIC, 'plastic', seg=seg)
    plate(b, X1 + 0.085, 0.54, -0.26, 0.26, front=True)
    if q == 0:
        for s in (1, -1):
            tube(b, (XS + 0.02, 1.46, s * 0.55 - 0.3), (3.24, 2.1, s * 0.55 - 0.05), 0.012, 4, PLASTIC, 'black', caps=False)
    # rear: window, ad panel, lamps, bumper, plate
    xr = X0 - 0.004
    face_x(b, xr, -0.95, 0.95, 1.5, 2.55, PLASTIC, 'trim', front=False)
    face_x(b, xr - 0.004, -0.9, 0.9, 1.55, 2.5, GLASS, rect_uv('bus_int', sub=(0.3, 0.0, 0.7, 0.9)), front=False)
    face_x(b, xr - 0.004, -0.62, 0.62, 1.0, 1.4, AD, 'ad', front=False)
    for s in (1, -1):
        z0, z1 = sorted((s * 0.86, s * 1.12))
        face_x(b, xr - 0.004, z0, z1, 0.72, 1.36, TAIL, 'tail_blk', front=False, flip=s > 0)
    face_x(b, xr - 0.006, -0.26, 0.26, 0.74, 0.866, BASE, 'plate', front=False)
    rbox(b, X0 - 0.08, X0 + 0.12, 0.44, 0.66, W - 0.08, PLASTIC, 'plastic', seg=seg)
    if q == 0:
        box(b, -1.2, H - 0.01, -0.36, -0.5, H + 0.07, 0.36, PLASTIC, 'plastic', faces='xXYzZ')
        box(b, 1.0, H - 0.01, -0.36, 1.7, H + 0.07, 0.36, PLASTIC, 'plastic', faces='xXYzZ')
    for s in (1, -1):
        wheel(b, AX[1], s * (zs - 0.18), WR, 0.26, q, style='steel', hub='rim')
        wheel(b, AX[0], s * (zs - 0.26), WR, 0.4, q, dual=True, hub='rim')
    box(b, X0 + 0.3, 0.34, -zs + 0.15, 3.3, 0.5, zs - 0.15, PLASTIC, 'under', faces='yzZ')
    return b


MODELS = {'van': van, 'truck': truck, 'bus': bus, 'tour': tour, 'midi': midi}


# ---------------------------------------------------------------- blender plumbing
def to_blender(name, mb):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((p.x, -p.z, p.y)) for p in mb.V]  # glTF (x, y up, z right) -> Blender (x, -z, y)
    uv0 = bm.loops.layers.uv.new('UVMap')
    uv1 = bm.loops.layers.uv.new('UVPart')
    for (idx, uvs, part) in mb.F:
        try:
            f = bm.faces.new([verts[i] for i in idx])
        except ValueError:
            continue
        f.material_index = part
        for lp, uv in zip(f.loops, uvs):
            lp[uv0].uv = uv
            lp[uv1].uv = (part + 0.0, 0.0)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='BEAUTY')
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) != 2:
            e.smooth = False
            continue
        f0, f1 = e.link_faces
        same = f0.material_index == f1.material_index
        e.smooth = same and e.calc_face_angle(math.pi) < math.radians(38)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_all():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obs = []
    for name, fn in MODELS.items():
        if ONLY and name not in ONLY:
            continue
        for q, suf in ((0, ''), (1, '_l1'), (2, '_l2')):
            mb = fn(q)
            ob = to_blender(name + suf, mb)
            obs.append(ob)
            print(f'[cars_big] {name + suf}: {sum(len(p.vertices) - 2 for p in ob.data.polygons)} tris')
    return obs


def bake_ao(obs):
    import addon_utils
    addon_utils.enable('cycles', default_set=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 64
    sc.cycles.device = 'CPU'
    w = bpy.data.worlds.new('ao')
    w.light_settings.distance = 1.0  # local contact AO (wells, gaps, under-body), not the ground half-space
    sc.world = w
    gp = bpy.data.meshes.new('ground')
    gp.from_pydata([(-40, -40, 0), (40, -40, 0), (40, 40, 0), (-40, 40, 0)], [], [(0, 1, 2, 3)])
    gob = bpy.data.objects.new('ground', gp)
    sc.collection.objects.link(gob)
    mat = bpy.data.materials.new('bake')
    for ob in obs:
        others = [o for o in obs if o is not ob]
        for o in others:
            o.hide_render = True
        ob.data.materials.clear()
        ob.data.materials.append(mat)
        attr = ob.data.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
        ob.data.color_attributes.active_color = attr
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
        for d in attr.data:
            a = max(0.0, min(1.0, d.color[0]))
            a = 0.25 + 0.75 * a
            v = a ** 2.2
            d.color = (v, v, v, 1.0)
        ob.data.materials.clear()
        for o in others:
            o.hide_render = False
    bpy.data.objects.remove(gob)


def export(obs):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.data.materials.clear()
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_texcoords=True,
                              export_normals=True, export_materials='NONE', export_vertex_color='ACTIVE',
                              export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
                              export_yup=True, export_apply=False)
    print('[cars_big] wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')


# ---------------------------------------------------------------- previews
TINT = {'van': (0.94, 0.72, 0.05), 'truck': (0.85, 0.85, 0.83), 'bus': (0.18, 0.42, 0.72), 'tour': (0.08, 0.1, 0.14), 'midi': (0.95, 0.74, 0.05)}


def preview_mats(img, tint):
    mats = {}

    def mk(part):
        m = bpy.data.materials.new(f'p{part}')
        m.use_nodes = True
        m.use_backface_culling = True
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.interpolation = 'Linear'
        col = tex.outputs['Color']
        at = nt.nodes.new('ShaderNodeVertexColor')
        at.layer_name = 'AO'
        gm = nt.nodes.new('ShaderNodeGamma')
        gm.inputs['Gamma'].default_value = 1 / 2.2
        nt.links.new(at.outputs['Color'], gm.inputs['Color'])
        ao = nt.nodes.new('ShaderNodeMix')
        ao.data_type = 'RGBA'
        ao.blend_type = 'MULTIPLY'
        ao.inputs[0].default_value = 0.55 if part not in (METAL, RUBBER) else 0.2
        nt.links.new(col, ao.inputs[6])
        nt.links.new(gm.outputs['Color'], ao.inputs[7])
        col = ao.outputs[2]
        if part == PAINT:
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1
            nt.links.new(col, mix.inputs[6])
            mix.inputs[7].default_value = (*tint, 1)
            col = mix.outputs[2]
            bsdf.inputs['Roughness'].default_value = 0.28
            bsdf.inputs['Coat Weight'].default_value = 1.0
        elif part == GLASS:
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1
            nt.links.new(col, mix.inputs[6])
            mix.inputs[7].default_value = (0.3, 0.31, 0.33, 1)
            col = mix.outputs[2]
            bsdf.inputs['Roughness'].default_value = 0.05
        elif part == METAL:
            bsdf.inputs['Metallic'].default_value = 0.9
            bsdf.inputs['Roughness'].default_value = 0.3
        elif part in (HEAD, TAIL, SCREEN, LAMP):
            nt.links.new(col, bsdf.inputs['Emission Color'])
            bsdf.inputs['Emission Strength'].default_value = {HEAD: 0.4, TAIL: 0.6, SCREEN: 2.5, LAMP: 0.5}[part]
            bsdf.inputs['Roughness'].default_value = 0.15
        else:
            bsdf.inputs['Roughness'].default_value = {RUBBER: 0.9, PLASTIC: 0.55}.get(part, 0.6)
        nt.links.new(col, bsdf.inputs['Base Color'])
        return m
    for p in range(16):
        mats[p] = mk(p)
    return mats


def render_previews(obs):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 960, 600
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    img = bpy.data.images.load(os.environ.get('PREVIEW_ATLAS', ATLAS))
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs['Strength'].default_value = 0.9
    sun_d = bpy.data.lights.new('sun', 'SUN')
    sun_d.energy = 3.5
    sun = bpy.data.objects.new('sun', sun_d)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    sc.collection.objects.link(sun)
    gp = bpy.data.meshes.new('ground')
    gp.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
    gob = bpy.data.objects.new('ground', gp)
    gm = bpy.data.materials.new('g')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.2, 0.21, 1)
    gp.materials.append(gm)
    sc.collection.objects.link(gob)
    cam_d = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    groups = {}
    for ob in obs:
        base = ob.name.split('_l')[0]
        groups.setdefault(base, []).append(ob)
    for base, lst in groups.items():
        mats = preview_mats(img, TINT.get(base, (1, 1, 1)))
        for ob in lst:
            me = ob.data
            me.materials.clear()
            for p in range(16):
                me.materials.append(mats[p])
            up = me.uv_layers['UVPart'].data
            for poly in me.polygons:
                poly.material_index = int(round(up[poly.loop_start].uv[0]))
    for ob in obs:
        for o in obs:
            o.hide_render = o is not ob
        # Blender frame: x fwd, y left (= -z glTF), z up
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        L = max(v.x for v in bb) - min(v.x for v in bb)
        Hh = max(v.z for v in bb)
        views = {'fr': (1, -1, 0.35), 'rl': (-1, 1, 0.3), 'side': (0.0, -1, 0.12), 'front': (1, 0.0, 0.15)}
        if '_l' in ob.name:
            views = {'fr': (1, -1, 0.35)}
        for vn, (dx, dy, dz) in views.items():
            d = Vector((dx, dy, dz)).normalized()
            dist = max(L, 5) * 1.35 + 2
            tgt = Vector((0, 0, Hh * 0.45))
            cam.location = tgt + d * dist
            cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
            cam_d.lens = 50
            sc.render.filepath = os.path.join(PREVIEW, f'{ob.name}_{vn}.png')
            bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    obs = build_all()
    if not os.environ.get('NOAO'):
        bake_ao(obs)
    export(obs)
    if PREVIEW:
        os.makedirs(PREVIEW, exist_ok=True)
        render_previews(obs)
