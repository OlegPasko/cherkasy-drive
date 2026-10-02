// OWNER: cherkasy. Multimarket «Аврора», vul. Smilianska 144/2 (OSM way 415321196, the old wholesale produce market's
// hall by Hotel «Нива»), rebuilt on a player's request (issue #26). The big-format store opened there in June 2025 (720 m²
// of sales floor). Built: the front wing on Smilianska as the store – light grey sandwich panels over a dark plinth, a
// glazed shop band, a yellow composite portal rising over the parapet round the glazed entrance with the store's own
// «Аврора / мультимаркет» sign, a steel-and-glass canopy, a thin yellow band along the top of the front and a second
// sign on the end facing the access road; behind it the lower old market wing with three loading docks on its west
// side, and the open service yard in the rest of the OSM rectangle behind a fence and a gate. Out front, between the
// shop and the street, a paved car park with marked bays (cars from the traffic sim stand in some), lamp posts and
// a walkway to the doors. The glazing, the sign and the lamps light up at night.
// References: the rau.ua and ua-retail opening reports (June 2025: interior only – a steel-deck hall on heavy columns),
// avrora.ua's store page (144/2, store 2929), the Esri satellite view (the front wing with roof panels, the west wing
// with docks, the yard, the apron toward the street); provce.ck.ua (2020) has the wholesale market at 144/2. The
// exterior, the storey heights and the sign layout are guesses after the chain's other big-format stores.
//   AVRORA_SKIP: the OSM id replaced here (buildings.js skips it)
//   buildAvrora({ root, map, solids, zips, heightAt }) -> { update(dt), clear(x, z), footprints, parked } | null
// Everything is laid in a lot frame from the OSM rectangle: u along the street front from its west corner, v inward
// (toward the back); the volumes are rectangles in it and their walls go through bldkit.js per edge.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex, decal as decalMat } from './sculpt.js';
import { ringPts, area2 } from './geo.js';
import { edgeFaces, pt, quad, panel, fbox, wall, win, decal, mats, finish } from './bldkit.js';

const OSM_ID = 415321196;
export const AVRORA_SKIP = new Set([OSM_ID]);

const WEST = 14, BACK = 6;                                         // the hardstanding west of and behind the hall
const LIFT = 0.3, DF = 24, H1 = 8.2, WW = 20, H2 = 7.0;           // floor over grade; the shop wing's depth, parapet; the old wing's width, parapet
const P0 = 34, P1 = 50, PO = 0.7, PH = H1 + 1.6;                   // the yellow portal: from u, to u, how far it stands out, its top
const CAN = 3.9, CAND = 2.6;                                       // the entrance canopy: height, reach
const GREY = '#c8cbcf', DGREY = '#4b4f54', PLINTH = '#55575a', YEL = '#ffcc00', STEEL = '#3a3d41', CONC = '#a9a6a0', APRON = '#5d5f62';
const SIGN = [0, 0, 1, 1];

// sandwich panels laid horizontally: a joint every 1 m, two light ribs between (2 m per repeat)
const ribTex = () => canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i++) {
    const y = i * h / 2 + 6; // off v = 0, which the untextured faces sample
    g.fillStyle = '#8c8c8c'; g.fillRect(0, y, w, 3); g.fillStyle = '#ffffff'; g.fillRect(0, y + 3, w, 2);
    for (const r of [0.33, 0.66]) { g.fillStyle = '#d2d2d2'; g.fillRect(0, y + r * h / 2, w, 2); g.fillStyle = '#f4f4f4'; g.fillRect(0, y + r * h / 2 + 2, w, 2); }
  }
});
// composite cassettes on the portal: 1.5 x 1 m with dark joints (3 x 2 m per repeat)
const cassetteTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#9c9c9c';
  for (const x of [w / 4, 3 * w / 4]) g.fillRect(x, 0, 3, h);
  for (const y of [h / 4, 3 * h / 4]) g.fillRect(0, y, w, 3);
});
// the store's sign: the white disc with the red «А», the red «ВРОРА», the white pill with «МУЛЬТИМАРКЕТ», on a clear ground
const signTex = () => canvasTex(1024, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(250, 215, 175, 0, 7); g.fill();
  g.fillStyle = '#e30613'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  g.font = '900 300px "Arial Black", Arial, Helvetica, sans-serif'; g.fillText('А', 250, 320);
  g.textAlign = 'left'; g.font = '900 200px "Arial Black", Arial, Helvetica, sans-serif'; g.fillText('ВРОРА', 400, 300, 600);
  const x0 = 300, x1 = 1000, y0 = 345, y1 = 445, r = (y1 - y0) / 2;
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.arc(x1 - r, y0 + r, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x0 + r, y1); g.arc(x0 + r, y0 + r, r, Math.PI / 2, Math.PI * 1.5); g.fill();
  g.fillStyle = '#3d3d3d'; g.textAlign = 'center'; g.font = 'bold 74px Arial, Helvetica, sans-serif'; g.fillText('МУЛЬТИМАРКЕТ', (x0 + x1) / 2, y1 - 24, x1 - x0 - 50);
}, { repeat: false, aniso: 16 });

export function buildAvrora({ root, map, solids: S, zips: Z, heightAt }) {
  const bld = map.buildings.find((q) => q.id === OSM_ID);
  if (!bld) return null;
  const t0 = performance.now(), n0 = S.count;
  // ---- the lot frame: the front edge is the one facing Smilianska (+z), u runs from its west (-x) corner
  const osm = ringPts(bld.p), faces0 = edgeFaces(osm);
  const fe = faces0.reduce((a, f) => (f.nz > (a?.nz ?? -2) ? f : a), null);
  const A = fe.ux > 0 ? [fe.ax, fe.az] : [fe.ax + fe.ux * fe.L, fe.az + fe.uz * fe.L], U = fe.ux > 0 ? [fe.ux, fe.uz] : [-fe.ux, -fe.uz];
  const V = [-fe.nx, -fe.nz], WF = fe.L;
  const depth = Math.max(...osm.map(([x, z]) => (x - A[0]) * V[0] + (z - A[1]) * V[1]));
  const L = (u, v) => [A[0] + U[0] * u + V[0] * v, A[1] + U[1] * u + V[1] * v];
  const rect = (u0, u1, v0, v1) => [L(u0, v0), L(u1, v0), L(u1, v1), L(u0, v1)];
  const prism = (Q, y0, y1, kind = 'wall', flags = 0) => S.prism((area2(Q) < 0 ? Q.slice().reverse() : Q).flat(), y0, y1, 0, 0, kind, flags);
  const frontR = rect(0, WF, 0, DF), westR = rect(0, WW, DF, depth);

  let gLo = Infinity, gHi = -Infinity;
  for (const [x, z] of [...frontR, ...westR, L(P0, -CAND), L(P1, -CAND)]) { const h = heightAt(x, z); gLo = Math.min(gLo, h); gHi = Math.max(gHi, h); }
  const yF = gHi + LIFT, gB = gLo - 0.6, Y = (h) => yF + h;
  const B = { wall: new MB(), yel: new MB(), det: new MB(), glass: new MB(), lit: new MB(), sign: new MB(), apron: new MB(), paint: new MB(), lamp: new MB() };
  const D = B.det;
  let nWin = 0;
  // where a lot point (u, v) falls along a face: its s
  const sOf = (f, u, v) => { const [x, z] = L(u, v); return (x - f.ax) * f.ux + (z - f.az) * f.uz; };
  const spanU = (f, u0, u1, v) => { const a = sOf(f, u0, v), b = sOf(f, u1, v); return [Math.min(a, b), Math.max(a, b)]; };
  const spanV = (f, v0, v1, u) => { const a = sOf(f, u, v0), b = sOf(f, u, v1); return [Math.min(a, b), Math.max(a, b)]; };
  const gAt = (f, s) => { const p = pt(f, s, 0, 0.5); return heightAt(p[0], p[2]); };
  const door = (f, s0, s1, h, extra) => { const g = gAt(f, (s0 + s1) / 2) + 0.05; return { s0, s1, y0: g, y1: g + h, rev: DGREY, dep: 0.1, ...extra }; };
  const isFront = (f) => f.nx * V[0] + f.nz * V[1] < -0.7, isBack = (f) => f.nx * V[0] + f.nz * V[1] > 0.7;
  const isEast = (f) => f.nx * U[0] + f.nz * U[1] > 0.7, isWest = (f) => f.nx * U[0] + f.nz * U[1] < -0.7;

  // ---- a box volume: walls with their holes, plinth, coping, roof deck, the zip edge at the parapet
  const volume = (ring, top, holesOf, skip = () => false) => {
    const faces = edgeFaces(ring);
    for (const f of faces) {
      if (skip(f)) continue;
      const holes = holesOf(f);
      B.wall.setColor(GREY); wall(B.wall, f, gB, Y(top), holes, [2, 2]);
      for (const q of holes) { win(B, f, q); nWin++; }
      // the plinth follows the ground (the lot falls ~3.5 m from the street to the back), broken by the doors
      D.setColor(PLINTH);
      const n = Math.max(1, Math.ceil(f.L / 3));
      for (let i = 0; i < n; i++) {
        const a = f.L * i / n, b = f.L * (i + 1) / n;
        for (const [c, d] of [[a, b]].flatMap(([c, d]) => { let segs = [[c, d]]; for (const q of holes) if (q.y0 < gAt(f, (q.s0 + q.s1) / 2) + 0.7) segs = segs.flatMap(([x, y]) => (q.s1 <= x || q.s0 >= y ? [[x, y]] : [[x, Math.max(x, q.s0)], [Math.min(y, q.s1), y]].filter(([m, k]) => k - m > 1e-3))); return segs; })) {
          quad(D, pt(f, c, gB, 0.04), pt(f, d, gB, 0.04), pt(f, d, gAt(f, d) + 0.6, 0.04), pt(f, c, gAt(f, c) + 0.6, 0.04), [f.nx, 0, f.nz]);
        }
      }
      D.setColor('#9a9da1'); fbox(D, f, -0.05, f.L + 0.05, Y(top), Y(top + 0.12), -0.3, 0.05, 'ftu'); // coping
      const p0 = pt(f, 0, 0), p1 = pt(f, f.L, 0); Z.edge(p0[0], p0[2], p1[0], p1[2], Y(top + 0.12), f.nx, f.nz);
    }
    D.setColor('#6c6f72'); D.fill(ring, [], Y(top - 0.25), true);
    prism(ring, gB, Y(top));
    return faces;
  };

  // ---- the store wing: shop band and portal on the front, a sign and an exit on the east end
  const front = volume(frontR, H1, (f) => {
    const H = [];
    if (isFront(f)) {
      for (const [a, b] of [[2.5, 32.6]]) { // the shop band: 1.5 m mullions
        const [s0, s1] = spanU(f, a, b, 0);
        H.push({ s0, s1, y0: Y(0.5), y1: Y(3.4), cols: Math.round((b - a) / 1.5), rows: 1, rev: DGREY, glass: '#c7d3dc', lit: true, dep: 0.14 });
      }
    } else if (isEast(f)) {
      H.push(door(f, ...spanV(f, 17.5, 18.7, WF), 2.25, { cols: 1, rows: 2, glass: '#5b6066' }));
      const [w0, w1] = spanV(f, 2.5, 15.5, WF); H.push({ s0: w0, s1: w1, y0: Y(0.5), y1: Y(3.4), cols: 8, rev: DGREY, glass: '#c7d3dc', lit: true, dep: 0.14 });
    } else if (isWest(f)) {
      H.push(door(f, ...spanV(f, 4, 6, 0), 2.35, { cols: 2, rows: 2, glass: '#5b6066' }));
    } else if (isBack(f)) { // into the yard: a goods door and a personnel door
      H.push(door(f, ...spanU(f, 27, 31, DF), 4, { cols: 1, rows: 8, glass: '#8a8e93', dep: 0.12 }));
      H.push(door(f, ...spanU(f, 40, 41.1, DF), 2.25, { cols: 1, rows: 2, glass: '#5b6066' }));
    }
    return H;
  });
  // ---- the old market wing behind it: loading docks on the west side, a door to the yard
  volume(westR, H2, (f) => {
    const H = [];
    if (isEast(f)) H.push(door(f, ...spanV(f, 40, 41.1, WW), 2.25, { cols: 1, rows: 2, glass: '#5b6066' }));
    return H;
  }, (f) => isFront(f)); // its front face is inside the store wing

  // ---- the yellow portal round the entrance: the cladding, the opening, the sign, the canopy
  {
    const f = front.find(isFront), [s0, s1] = spanU(f, P0, P1, 0), [e0, e1] = spanU(f, P0 + 3, P1 - 3, 0);
    const T = { s0: e0, s1: e1, y0: Y(0.02), y1: Y(3.7), cols: 6, rows: 2, rev: STEEL, glass: '#d5dde3', lit: true, dep: 0.25 };
    B.yel.setColor(YEL);
    const fp = { ...f, ax: f.ax + f.nx * PO, az: f.az + f.nz * PO }; // the portal's face plane, PO out
    const off = (a, b) => ({ s0: a, s1: b, y0: Y(-1), y1: Y(PH + 1) }); // the rest of the face is not the portal's
    wall(B.yel, fp, Y(0), Y(PH), [T, off(-1, s0), off(s1, f.L + 1)], [3, 2]);
    win(B, fp, T); nWin++;
    fbox(B.yel, f, s0, s1, Y(0), Y(PH), 0, PO, 'lrt');
    fbox(B.yel, f, s0, s1, Y(H1 + 0.12), Y(PH), -0.4, 0, 'b'); // its back over the parapet
    D.setColor('#d9a900'); fbox(D, f, s0 - 0.03, s1 + 0.03, Y(PH), Y(PH + 0.08), -0.43, PO + 0.03, 'ftlru');
    D.setColor(PLINTH); fbox(D, f, s0, s1, gB, Y(0.02), PO - 0.02, PO + 0.02, 'f');
    decal(B.sign, fp, s0 + 0.9, s1 - 0.9, Y(4.4), Y(4.4 + (s1 - s0 - 1.8) / 2), 0.03, SIGN);
    D.setColor(STEEL); // the sliding doors' frames inside the opening
    for (const s of [e0 + (e1 - e0) / 3, e0 + 2 * (e1 - e0) / 3]) fbox(D, fp, s - 0.06, s + 0.06, Y(0), Y(3.7), -0.22, -0.18, 'flr');
    // the canopy: a dark steel slab on two raking ties, glazed underside
    const [c0, c1] = spanU(f, P0 + 1.5, P1 - 1.5, 0);
    D.setColor(STEEL); fbox(D, f, c0, c1, Y(CAN), Y(CAN + 0.3), PO, PO + CAND, 'flrtu');
    for (const s of [c0 + 0.6, c1 - 0.6]) D.tube(pt(f, s, Y(CAN + 0.3), PO + CAND - 0.2), pt(f, s, Y(CAN + 2.6), PO + 0.02), 0.05, 5);
    const q = [[c0, PO], [c1, PO], [c1, PO + CAND], [c0, PO + CAND]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; });
    prism(q, Y(CAN), Y(CAN + 0.3), 'awning', 1);
    prism([[s0, 0], [s1, 0], [s1, PO], [s0, PO]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }), gB, Y(PH));
    // the entrance landing: a low paved step the width of the portal, a ramp at its east end
    D.setColor(CONC); fbox(D, f, s0, s1, gB, yF, PO, PO + CAND + 0.4, 'ftlr');
    prism([[s0, PO], [s1, PO], [s1, PO + CAND + 0.4], [s0, PO + CAND + 0.4]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }), gB, yF, 'step');
  }
  // the yellow band along the top of the front and round the east corner, the second sign on the east end
  {
    const f = front.find(isFront), g = front.find(isEast);
    B.yel.setColor(YEL);
    for (const [a, b] of [[0, P0], [P1, WF]]) { const [s0, s1] = spanU(f, a, b, 0); panel(B.yel, f, s0, s1, Y(H1 - 0.9), Y(H1), 0.06, [3, 2]); fbox(B.yel, f, s0, s1, Y(H1 - 0.9), Y(H1), 0, 0.06, 'lru'); }
    const [t0, t1] = spanV(g, 0, DF, WF); panel(B.yel, g, t0, t1, Y(H1 - 0.9), Y(H1), 0.06, [3, 2]); fbox(B.yel, g, t0, t1, Y(H1 - 0.9), Y(H1), 0, 0.06, 'lru');
    const [k0, k1] = spanV(g, 4, 15, WF);
    B.yel.setColor(YEL); fbox(B.yel, g, k0, k1, Y(3.9), Y(3.9 + 6.1), 0, 0.25, 'flrtu');
    decal(B.sign, g, k0 + 0.5, k1 - 0.5, Y(4.4), Y(4.4 + (k1 - k0 - 1) / 2), 0.26, SIGN);
  }
  // ---- roof kit: rows of panels along the store wing's street side (the satellite's dark strips), air handlers on both wings
  {
    D.setColor('#23324a');
    for (let i = 0; i < 8; i++) { // short bays across the street-side band at the east end, tilted toward the street
      const u = 26 + i * 3.1, [a, b, c, d] = rect(u, u + 2.0, 1.5, 11.5), y0 = Y(H1 - 0.1), y1 = y0 + 0.5;
      // a, b on the front edge (low), c, d at the back (high): the panel faces up and toward the street
      quad(D, [a[0], y0, a[1]], [b[0], y0, b[1]], [c[0], y1, c[1]], [d[0], y1, d[1]], [-V[0] * 0.05, 1, -V[1] * 0.05]);
    }
    D.setColor('#c9cbc8');
    for (const [u, v, w, h] of [[10, 16, 3, 2], [22, 18, 3.4, 2.2], [8, 40, 2.6, 1.8], [12, 55, 2.6, 1.8]]) {
      const top = v < DF ? H1 : H2, R = rect(u, u + w, v, v + h);
      D.extrude(R, [], Y(top - 0.25), Y(top + 1.2), { top: true, sides: true });
    }
  }
  // ---- the loading docks on the old wing's west side: roller shutters, bumpers, a dock canopy
  {
    const f = edgeFaces(westR).find(isWest), [c0, c1] = spanV(f, 28.5, 50.7, 0);
    const yD = gAt(f, (c0 + c1) / 2) + 1.2; // the dock floor, a truck bed over the hardstanding
    for (const v of [30, 38, 46]) {
      const [s0, s1] = spanV(f, v, v + 3.2, 0);
      D.setColor('#6f757b'); panel(D, f, s0, s1, yD, yD + 3.4, 0.03);
      D.setColor('#5d6369'); for (let y = 0.3; y < 3.4; y += 0.3) fbox(D, f, s0, s1, yD + y, yD + y + 0.04, 0.03, 0.05, 'ft');
      D.setColor('#1e1f21'); for (const s of [s0 - 0.2, s1 + 0.2]) fbox(D, f, s - 0.15, s + 0.15, yD - 0.45, yD - 0.05, 2.5, 2.65, 'ftlr');
    }
    D.setColor(DGREY); fbox(D, f, c0, c1, yD + 4.0, yD + 4.2, 0, 3.5, 'flrtu');
    prism([[c0, 0], [c1, 0], [c1, 3.5], [c0, 3.5]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }), yD + 4.0, yD + 4.2, 'awning', 1);
    D.setColor(CONC); fbox(D, f, c0, c1, gB, yD, 0, 2.5, 'ftlr'); // the dock platform
    prism([[c0, 0], [c1, 0], [c1, 2.5], [c0, 2.5]].map(([s, o]) => { const p = pt(f, s, 0, o); return [p[0], p[2]]; }), gB, yD);
  }
  // ---- the yard (its concrete is paved with the car park below): a fence on the east and back with a sliding gate toward the access road
  {
    const fence = (u0, v0, u1, v1, gate) => {
      const a = L(u0, v0), b = L(u1, v1), len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(len / 2.5);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, g = heightAt(x, z);
        if (gate && t > gate[0] + 0.02 && t < gate[1] - 0.02) continue;
        D.setColor('#4e5458'); D.cyl(x, g - 0.3, z, 0.05, 0.05, 2.3, 6, true);
      }
      for (const [t0, t1] of gate ? [[0, gate[0]], [gate[1], 1]] : [[0, 1]]) {
        const p = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], q = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        const gp = heightAt(p[0], p[1]), gq = heightAt(q[0], q[1]);
        D.setColor('#6d7377');
        for (const h of [0.15, 1.0, 1.9]) D.tube([p[0], gp + h, p[1]], [q[0], gq + h, q[1]], 0.025, 4);
        const d = [(q[1] - p[1]) / len, -(q[0] - p[0]) / len];
        S.prism((() => { const w = 0.06, Q = [[p[0] + d[0] * w, p[1] + d[1] * w], [q[0] + d[0] * w, q[1] + d[1] * w], [q[0] - d[0] * w, q[1] - d[1] * w], [p[0] - d[0] * w, p[1] - d[1] * w]]; return (area2(Q) < 0 ? Q.reverse() : Q).flat(); })(), Math.min(gp, gq) - 0.3, Math.max(gp, gq) + 2.0, 0, 0, 'wall');
      }
    };
    fence(WF, DF, WF, depth, [0.25, 0.6]);
    fence(WW, depth, WF, depth);
    // the gate leaf, rolled back along the fence
    const g0 = L(WF + 0.15, DF + (depth - DF) * 0.6), g1 = L(WF + 0.15, DF + (depth - DF) * 0.95), gg = heightAt(...g0);
    D.setColor('#4e5458');
    for (const h of [0.2, 1.9]) D.tube([g0[0], gg + h, g0[1]], [g1[0], gg + h, g1[1]], 0.04, 4);
    for (let t = 0; t <= 1.001; t += 0.1) { const x = g0[0] + (g1[0] - g0[0]) * t, z = g0[1] + (g1[1] - g0[1]) * t; D.tube([x, gg + 0.2, z], [x, gg + 1.9, z], 0.02, 3); }
  }

  // ---- the car park between the shop and the street: asphalt, bay lines, a walkway, lamp posts
  const parked = [];
  {
    // distance past the kerb of the nearest road (< 0 on its carriageway); Smilianska alone bounds the apron's reach
    const near = map.roads.filter((r) => r.k !== 'f' && r.p.some((v, i) => (i % 2 ? Math.abs(v - (A[1] + V[1] * -20)) : Math.abs(v - (A[0] + U[0] * WF / 2 + V[0] * -20))) < 120));
    const past = (x, z, list = near) => {
      let d = Infinity;
      for (const r of list) for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], ex = r.p[i + 2] - ax, ez = r.p[i + 3] - az, l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        d = Math.min(d, Math.hypot(ax + ex * t - x, az + ez * t - z) - r.w / 2);
      }
      return d;
    };
    const smil = near.filter((r) => /Смілянськ/.test(r.n ?? ''));
    let reach = 40;
    for (const u of [0, WF / 2, WF]) for (let v = -1; v > -60; v -= 0.5) if (past(...L(u, v), smil) < 1.2) { reach = Math.min(reach, -v - 0.5); break; }
    const V0 = -reach, N = 2; // the apron runs from the street (v = V0) to the shop's plinth (v = 0)
    const H = (x, z) => heightAt(x, z) + 0.17; // the land is drawn 0.15 m over heightAt (ground.js GY), the cover 0.165
    const up = [0, 1, 0], P = (u, v, lift = 0) => { const [x, z] = L(u, v); return [x, H(x, z) + lift, z]; };
    // asphalt in 2 m cells hugging the ground, uv in metres; cells on a road (the access road on the east) are left
    // out. The forecourt, then the hardstanding round the old wing's docks and behind it (the satellite's paved apron)
    B.apron.setColor(APRON);
    const pave = (U0, U1, W0, W1) => {
      for (let u = U0; u < U1 - 1e-3; u += 2) for (let v = W0; v < W1 - 1e-3; v += 2) {
        const u1 = Math.min(u + 2, U1), v1 = Math.min(v + 2, W1);
        if (past(...L((u + u1) / 2, (v + v1) / 2)) < 0.3) continue;
        quad(B.apron, P(u, v), P(u1, v), P(u1, v1), P(u, v1), up, [[u / N, v / N], [u1 / N, v / N], [u1 / N, v1 / N], [u / N, v1 / N]]);
      }
    };
    pave(-WEST, WF + 3, V0, 0); pave(-WEST, 0, 0, depth + BACK); pave(0, WF, depth, depth + BACK);
    B.apron.setColor('#8a8883'); pave(WW, WF, DF, depth); // the yard's concrete
    // painted strips: thin quads (0.12 m wide by default) a little over the asphalt
    const strip = (u0, v0, u1, v1, w = 0.12, col = '#e8e8e2') => {
      const du = u1 - u0, dv = v1 - v0, l = Math.hypot(du, dv), nu = -dv / l * w / 2, nv = du / l * w / 2, n = Math.max(1, Math.ceil(l / 4));
      if (!(l > 0.01)) return;
      B.paint.setColor(col);
      for (let i = 0; i < n; i++) {
        const a = [u0 + du * i / n, v0 + dv * i / n], b = [u0 + du * (i + 1) / n, v0 + dv * (i + 1) / n];
        quad(B.paint, P(a[0] - nu, a[1] - nv, 0.015), P(b[0] - nu, b[1] - nv, 0.015), P(b[0] + nu, b[1] + nv, 0.015), P(a[0] + nu, a[1] + nv, 0.015), up);
      }
    };
    const BW = 2.5, BL = 5.0;
    // row A along the shop band (noses to the building), rows B and C back to back across the aisle; the walkway
    // to the portal stays clear
    const rows = [[-1.6, -1.6 - BL, 1], [-1.6 - BL - 6.5, -1.6 - 2 * BL - 6.5, -1], [-1.6 - 2 * BL - 6.5, -1.6 - 3 * BL - 6.5, 1]];
    let k = 0;
    for (const [ri, [va, vb, dir]] of rows.entries()) {
      if (Math.min(va, vb) < V0 + 1) continue;
      for (const [a, b] of [[1.0, P0 - 1.0], [P1 + 1.0, WF - 2.0]]) {
        const n = Math.floor((b - a) / BW);
        for (let i = 0; i <= n; i++) strip(a + i * BW, va, a + i * BW, vb);
        strip(a, ri === 1 ? va : vb, a + n * BW, ri === 1 ? va : vb);
        for (let i = 0; i < n; i++) {
          if (((i * 7 + ri * 3 + k++) % 5) > 1 || past(...L(a + (i + 0.5) * BW, (va + vb) / 2)) < 3) continue; // two in five bays taken
          const [x, z] = L(a + (i + 0.5) * BW, (va + vb) / 2), f = dir > 0 ? V : [-V[0], -V[1]]; // facing the bay's head
          parked.push([x, z, -Math.atan2(f[1], f[0])]);
        }
      }
    }
    // the walkway: a paved strip from the street to the doors with a zebra across the aisle
    {
      B.paint.setColor('#8f8b84');
      for (let v = V0; v < -1e-3; v += 2) { const v1 = Math.min(0, v + 2); quad(B.paint, P(P0 + 3, v, 0.01), P(P1 - 3, v, 0.01), P(P1 - 3, v1, 0.01), P(P0 + 3, v1, 0.01), up); }
      for (let u = P0 + 3.3; u < P1 - 3.3; u += 1.0) strip(u, -1.6 - BL - 0.4, u, -1.6 - BL - 6.1, 0.5, '#f2f2ee');
    }
    // lamp posts down the middle of the car park; the heads glow at night
    for (const [u, v] of [[8, -1.6 - BL - 3.2], [24, -1.6 - BL - 3.2], [P1 + 6, -1.6 - BL - 3.2], [WF - 4, -1.6 - BL - 3.2]]) {
      if (v < V0 + 1) continue;
      const [x, z] = L(u, v), g = heightAt(x, z);
      D.setColor('#5a5f63'); D.cyl(x, g - 0.3, z, 0.12, 0.08, 8.8, 8, true); D.cyl(x, g - 0.3, z, 0.25, 0.25, 0.8, 8, true);
      for (const sg of [-1, 1]) {
        const hx = x + U[0] * sg * 1.1, hz = z + U[1] * sg * 1.1;
        D.tube([x, g + 8.3, z], [hx, g + 8.5, hz], 0.05, 4);
        D.setColor('#5a5f63'); D.box(hx - 0.35, g + 8.35, hz - 0.35, hx + 0.35, g + 8.6, hz + 0.35, 1 | 2 | 4 | 16 | 32);
        B.lamp.setColor('#ffffff'); B.lamp.box(hx - 0.28, g + 8.33, hz - 0.28, hx + 0.28, g + 8.36, hz + 0.28, 8);
      }
      S.cyl(x, z, g - 0.3, g + 8.5, 0.15, 0.15, 'pole');
    }
  }

  // ---- meshes
  const sign = signTex();
  const M = mats({
    wall: new THREE.MeshStandardMaterial({ map: ribTex(), vertexColors: true, roughness: 0.5, metalness: 0.3 }),
    yel: new THREE.MeshStandardMaterial({ map: cassetteTex(), vertexColors: true, roughness: 0.4, metalness: 0.15 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, alphaTest: 0.4, roughness: 0.35 }),
    apron: decalMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), 1),
    paint: decalMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 2),
    lamp: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xfff1d6, emissiveIntensity: 0 }),
  });
  const out = finish(root, 'avrora', B, M, ['wall', 'yel', 'det']);
  console.log(`[cherkasy] Avrora: ${nWin} openings, floor ${yF.toFixed(1)} m, ${parked.length} parked, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids in ${(performance.now() - t0).toFixed(0)} ms`);

  const inLot = (x, z) => { const u = (x - A[0]) * U[0] + (z - A[1]) * U[1], v = (x - A[0]) * V[0] + (z - A[1]) * V[1]; return u > -WEST - 2 && u < WF + 4 && v > -45 && v < depth + BACK + 2; };
  return {
    footprints: [{ poly: frontR, h: Y(H1) - gLo, kind: bld.k, name: 'Аврора' }, { poly: westR, h: Y(H2) - gLo, kind: bld.k }],
    clear: inLot,
    parked,
    update() { const k = nightK.value; M.lit.emissiveIntensity = 0.8 * k; M.sign.emissiveIntensity = 0.06 + 0.9 * k; M.lamp.emissiveIntensity = 2.5 * k; },
  };
}
