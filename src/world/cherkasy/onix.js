// OWNER: cherkasy. ЖК Onix, вул. Сковороди / вул. Теліги (Sosnivka): two U-shaped nine-storey blocks of ten sections
// round two yards open to the south-west, by Онікс Білд. Block 2 (sections 5–10, the east one, on the street) is the
// one going up: 8–10 are lived in (OSM way 1479490556, Теліги 23), 5–7 are due in 2027; block 1 (sections 1–4) is
// still a project. Both stand here as the developer renders them (lun.ua): a commercial ground storey of dark glass
// under the homes, light warm-grey render above with white pilasters framing every section, window stacks set in
// charcoal panels, stacks of balconies with grey and some burgundy fronts, glazed corners on the gable ends, flat roofs
// behind a parapet with stair and lift heads; a playground in each yard. No signs or logos.
//   ONIX_SKIP: the OSM ids replaced here (buildings.js skips them)
//   levelOnix(hf) -> { 1: level, 2: level } | null   a level terrace under each block (city.js, before the ground)
//   buildOnix({ root, solids, zips, heightAt }) -> { update(dt), clear(x, z), spots, parked, footprints }
//     clear: the whole lot is free of generated trees (it is paved, with lawns and birches in the yards: spots);
//     parked: [[x, z, ry]] the car-park bays the traffic fills with parked cars
// The layout (sections as wall rectangles in the site's u / v frame) lives in onix_data.js, so the maps share it.
// Walls are laid per free stretch of a section side (the part no neighbouring section stands against) in a slabkit
// face frame: s along the wall, y up, o outward. Windows are glass panes on the wall (the frame pattern is in the
// texture, bldkit.js winTex) set in panels, so ten sections of nine storeys stay near 25k vertices.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { rng } from './geo.js';
import { face, at, rect, box, quad, solid, finish, speckle } from './slabkit.js';
import { winTex, winEmTex } from './bldkit.js';
import { ONIX_SECTIONS, uvXZ, ONIX_FRAME } from './onix_data.js';

export const ONIX_SKIP = new Set([1479490556]);

const GF = 4.2, FH = 3.0, NF = 9, PARA = 1.0;          // ground storey, upper storeys, storeys, parapet
const BAY = 3.2, BAL = 1.0, BAND = 0.9;                // bay, balcony reach, the white corner pilasters
const WALL = '#bcb6ad', WHITE = '#f2f0ea', CHAR = '#47464a', PLINTH = '#333539', GREYF = '#8e8b87', BURG = '#7b2d31';
const GLASS = ['#ffffff', '#e8eef2', '#dfe6ea', '#f2f2ee'];
const ROOF = '#7f7c77', COPING = '#bdbab3';
const LOT = [-12, 94, -160, 20];                       // the developer's lot in u / v (site plan), cleared of trees

// the DEM climbs ~10 m across block 1 toward the pines (block 2 sits on ~3 m): each block gets a level terrace (u / v
// rectangles reaching ~10 m past the walls, as the 16 m height lattice needs). Block 2 levels to its own median and
// stops short of the street (v ≈ 22); block 1 sits a metre higher, cut into the rise with a long bank, so the lane
// between them is a gentle ramp; block 2 is laid again last, so block 1's bank does not reach into it.
const TERRACE = { 1: [[14, 88.6, -159, -74], 22], 2: [[-10, 88.6, -66, 12], 10] };
export function levelOnix(hf) {
  const pad = (b, level) => { const [[u0, u1, v0, v1], m] = TERRACE[b]; return hf.pad([[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => uvXZ(u, v)), m, level); };
  const l2 = pad(2);
  if (l2 == null) return null;
  const l1 = pad(1, l2 + 1);
  pad(2, l2);
  return { 1: l1, 2: l2 };
}

export function buildOnix({ root, solids: S, zips: Z, heightAt }) {
  const t0 = performance.now(), r = rng(1479490556 % 65521), n0 = S.count;
  const B = { wall: new MB(), det: new MB(), glass: new MB(), lit: new MB() };
  const D = B.det, W = B.wall, UVW = [2.5, 2.5];
  const { U, V } = ONIX_FRAME;
  const secs = ONIX_SECTIONS.map((q) => ({ ...q, ring: [[q.r[0], q.r[2]], [q.r[1], q.r[2]], [q.r[1], q.r[3]], [q.r[0], q.r[3]]].map(([u, v]) => uvXZ(u, v)) }));
  // one floor level per block (its highest corner), so the sections' roofs line up; the low side shows more plinth
  const lvl = {};
  for (const q of secs) for (const [x, z] of q.ring) lvl[q.b] = Math.max(lvl[q.b] ?? -Infinity, heightAt(x, z) + 0.4);
  let nWin = 0, nBal = 0;
  const pane = (s0, s1, y0, y1, f, o, cols, rows, lit) => {
    const G = lit ? B.lit : B.glass;
    G.setColor(GLASS[(r() * GLASS.length) | 0]);
    quad(G, at(f, s0, y0, o), at(f, s1, y0, o), at(f, s1, y1, o), at(f, s0, y1, o), f.N, [[0, 0], [cols, 0], [cols, rows], [0, rows]]);
    nWin++;
  };

  // a section side as [a, b] in u / v, its outward normal and where its outside neighbours stand against it
  const sides = (q) => {
    const [u0, u1, v0, v1] = q.r;
    return [['v1', [u0, v1], [u1, v1], [0, 1]], ['u1', [u1, v1], [u1, v0], [1, 0]], ['v0', [u1, v0], [u0, v0], [0, -1]], ['u0', [u0, v0], [u0, v1], [-1, 0]]];
  };
  const free = (q, a, b, n) => { // stretches [t0, t1] of a -> b that no other section of the block covers from outside
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), du = (b[0] - a[0]) / L, dv = (b[1] - a[1]) / L, cov = [];
    const pu = a[0] + n[0] * 0.3, pv = a[1] + n[1] * 0.3;
    for (const o of secs) {
      if (o === q) continue;
      const [ou0, ou1, ov0, ov1] = o.r;
      if (du === 0 ? !(pu > ou0 && pu < ou1) : !(pv > ov0 && pv < ov1)) continue;
      const [c0, c1] = du === 0 ? [ov0, ov1] : [ou0, ou1], [t0, t1] = [(c0 - (du === 0 ? a[1] : a[0])) / (du || dv), (c1 - (du === 0 ? a[1] : a[0])) / (du || dv)];
      const c = [Math.max(0, Math.min(t0, t1)), Math.min(L, Math.max(t0, t1))];
      if (c[1] > c[0]) cov.push(c);                  // an empty overlap (a section further along) covers nothing
    }
    cov.sort((p, s) => p[0] - s[0]);
    const out = []; let t = 0;
    for (const [c0, c1] of cov) { if (c0 > t + 0.05) out.push([t, c0]); t = Math.max(t, c1); }
    if (L > t + 0.05) out.push([t, L]);
    return { L, out };
  };

  for (const q of secs) {
    const yF = lvl[q.b], Y1 = yF + GF, ROOFY = Y1 + (NF - 1) * FH, TOP = ROOFY + PARA;
    const gLo = Math.min(...q.ring.map(([x, z]) => heightAt(x, z))), gB = gLo - 0.6;
    const fy = (k) => Y1 + (k - 1) * FH;            // floor of upper storey k = 1..NF-1
    const short = Math.min(q.r[1] - q.r[0], q.r[3] - q.r[2]);
    const sd = sides(q), isGable = (L) => L < short + 0.5 && L < 20;
    for (const [j, [key, a, b, n]] of sd.entries()) {
      const { L, out } = free(q, a, b, n);
      const A = uvXZ(...a), Bp = uvXZ(...b), N = [U[0] * n[0] + V[0] * n[1], U[1] * n[0] + V[1] * n[1]];
      const f = face(A, Bp, N[0], N[1]);
      const gable = isGable(L), shop = q.shops.includes(key);
      // the parapet runs the whole side, so where two sections meet their parapets stand back to back: a ridge that
      // marks the joint on the roof, as in the render
      D.setColor(COPING); box(D, f, -0.02, L + 0.02, TOP, TOP + 0.08, -0.35, 0.06, 'ft');
      D.setColor('#b9b2a6'); rect(D, f, 0, L, ROOFY, TOP, -0.35, null, [-f.nx, 0, -f.nz]);
      // a long front whose corner meets a free gable wraps the gable's glazed corner round to its side
      const cornerFree = (k, atStart) => { const [, a2, b2, n2] = sd[k], fr = free(q, a2, b2, n2); return isGable(fr.L) && fr.out.some(([c0, c1]) => (atStart ? c1 > fr.L - 0.1 : c0 < 0.1)); };
      const wrap0 = !gable && cornerFree((j + 3) % 4, true), wrap1 = !gable && cornerFree((j + 1) % 4, false);
      for (const [t0, t1] of out) {
        const len = t1 - t0;
        // the wall and the dark ground storey (a plinth plate over it)
        W.setColor(WALL); rect(W, f, t0, t1, gB, TOP, 0, UVW);
        D.setColor(PLINTH); rect(D, f, t0, t1, gB, Y1, 0.03);
        if (len > 3) { const p = at(f, t0, 0, -0.1), e = at(f, t1, 0, -0.1); Z.edge(p[0], p[2], e[0], e[2], TOP, f.nx, f.nz); }
        if (len < 2.5) continue;
        // white pilasters at both ends of the stretch, from the ground storey's head to over the parapet
        const g0 = wrap0 && t0 < 0.1, g1 = wrap1 && t1 > L - 0.1, GW = 2.2; // glazed corners at this stretch's ends
        W.setColor(WHITE);
        for (const [s, on] of [[t0 + (g0 ? GW : 0), true], [t1 - BAND - (g1 ? GW : 0), true]]) if (on) box(W, f, s, s + BAND, Y1 - 0.3, TOP + 0.15, 0, 0.22, 'flrt', UVW);
        for (const [s0, s1, on] of [[t0 + 0.05, t0 + GW, g0], [t1 - GW, t1 - 0.05, g1]]) {
          if (!on) continue;
          D.setColor(CHAR); rect(D, f, s0, s1, Y1, ROOFY, 0.02);
          for (let k = 1; k < NF; k++) pane(s0 + 0.05, s1 - 0.05, fy(k) + 0.12, fy(k) + FH - 0.2, f, 0.04, 2, 1, r() < 0.3);
        }
        W.setColor(WHITE); box(W, f, t0, t1, Y1 - 0.4, Y1, 0, 0.12, 'ftu', UVW); // the cornice over the shops
        const i0 = t0 + BAND + (g0 ? GW : 0), i1 = t1 - BAND - (g1 ? GW : 0), span = i1 - i0;
        if (span < 1.5) continue;
        if (gable) {
          // a gable: the glazed corner (full height) at each end, two narrow window stacks between white bands
          const gc = Math.min(2.6, span * 0.22);
          for (const [s0, s1] of [[i0 + 0.15, i0 + gc], [i1 - gc, i1 - 0.15]]) {
            D.setColor(CHAR); rect(D, f, s0 - 0.1, s1 + 0.1, Y1, ROOFY, 0.02);
            for (let k = 1; k < NF; k++) pane(s0, s1, fy(k) + 0.12, fy(k) + FH - 0.2, f, 0.04, Math.max(1, Math.round((s1 - s0) / 0.9)), 1, r() < 0.3);
          }
          const m0 = i0 + gc + 0.4, m1 = i1 - gc - 0.4;
          if (m1 - m0 > 4) {
            for (const c of [m0 + (m1 - m0) / 3, m0 + 2 * (m1 - m0) / 3]) {
              W.setColor(WHITE); box(W, f, c - 0.3, c + 0.3, Y1, TOP + 0.15, 0, 0.18, 'flrt', UVW);
              for (const s of [c - 1.45, c + 0.55]) for (let k = 1; k < NF; k++) pane(s, s + 0.9, fy(k) + 0.8, fy(k) + 2.5, f, 0.03, 1, 1, r() < 0.3);
            }
          }
        } else {
          // a long front: bays of window - balcony - window, a slim white pilaster between the groups, every
          // other group's windows set in a charcoal panel
          const nb = Math.max(1, Math.round(span / BAY)), p = span / nb;
          for (let i = 0; i < nb; i++) {
            const s0 = i0 + i * p, m = s0 + p / 2, kind = nb >= 3 && i % 3 === 1 ? 'b' : 'w', grp = Math.floor(i / 3);
            if (i % 3 === 0 && i > 0) { W.setColor(WHITE); box(W, f, s0 - 0.18, s0 + 0.18, Y1, TOP + 0.15, 0, 0.16, 'flrt', UVW); }
            if (kind === 'w') {
              if (grp % 2 === 0) { D.setColor(CHAR); rect(D, f, m - p / 2 + 0.3, m + p / 2 - 0.3, Y1, ROOFY - 0.4, 0.02); }
              for (let k = 1; k < NF; k++) pane(m - 0.8, m + 0.8, fy(k) + 0.75, fy(k) + 2.45, f, 0.04, 2, 1, r() < 0.33);
            } else {
              D.setColor(CHAR); rect(D, f, m - p / 2 + 0.2, m + p / 2 - 0.2, Y1, ROOFY - 0.4, 0.02);
              const bw = p - 0.5, burg = r() < 0.35;
              for (let k = 1; k < NF; k++) {
                const y = fy(k);
                pane(m - 1.2, m + 1.2, y + 0.05, y + 2.5, f, 0.04, 2, 1, r() < 0.33);
                // the slab and its solid front in one box (grey; a stack in three has burgundy fronts on every
                // other storey, as rendered), its floor seen from above
                D.setColor(burg && k % 2 === 1 ? BURG : GREYF);
                box(D, f, m - bw / 2, m + bw / 2, y - 0.2, y + 1.05, 0, BAL, 'ulrf');
                D.setColor('#cfccc6');
                quad(D, at(f, m - bw / 2, y + 0.002, 0), at(f, m + bw / 2, y + 0.002, 0), at(f, m + bw / 2, y + 0.002, BAL), at(f, m - bw / 2, y + 0.002, BAL), [0, 1, 0]);
                nBal++;
              }
              solid(S, f, m - bw / 2, m + bw / 2, 0, BAL, fy(1) - 0.2, ROOFY);
            }
          }
        }
        // the ground storey: shop windows on the street sides, an entrance and high windows on the others
        if (shop) {
          const nb = Math.max(1, Math.round(span / 3.6)), p = span / nb;
          for (let i = 0; i < nb; i++) {
            const m = i0 + (i + 0.5) * p, g = Math.max(yF, heightAt(...at(f, m, 0, 1.5).filter((_, j) => j !== 1)) + 0.05);
            pane(m - p / 2 + 0.25, m + p / 2 - 0.25, Math.max(g, yF) + 0.1, Y1 - 0.75, f, 0.05, Math.max(1, Math.round(p / 1.4)), 1, true);
          }
          D.setColor('#26282b'); box(D, f, i0, i1, Y1 - 0.75, Y1 - 0.4, 0, 0.16, 'ftu'); // the fascia band (no signs)
        } else if (len > 8) {
          const m = (t0 + t1) / 2, yd = yF;
          D.setColor('#5d5a57'); rect(D, f, m - 1.3, m + 1.3, yd, yd + 2.6, 0.05);   // the entrance surround
          pane(m - 0.9, m + 0.9, yd, yd + 2.3, f, 0.06, 2, 1, true);
          D.setColor('#9d9a95'); box(D, f, m - 1.6, m + 1.6, yd + 2.75, yd + 2.95, 0, 1.6, 'ftlru');  // the canopy
          solid(S, f, m - 1.6, m + 1.6, 0, 1.6, yd + 2.75, yd + 2.95, 'awning', 1);
          const g = heightAt(...at(f, m, 0, 2.5).filter((_, j) => j !== 1));
          if (yd - g > 0.12) { D.setColor('#8c8984'); box(D, f, m - 1.6, m + 1.6, g - 0.3, yd, 0, 2.2, 'ftlr'); } // the landing
          for (let i = 0; i < Math.round(span / 3.2); i++) {
            const c = i0 + (i + 0.5) * span / Math.round(span / 3.2);
            if (Math.abs(c - m) < 2.6) continue;
            pane(c - 0.75, c + 0.75, Y1 - 1.9, Y1 - 0.7, f, 0.05, 2, 1, r() < 0.25);
          }
        }
      }
    }
    // the roof, a stair and lift head over each entrance core, collision for the section
    const [u0, u1, v0, v1] = q.r, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    D.setColor(ROOF); D.fill(q.ring, [], ROOFY + 0.02, true);
    for (const [du, dv, w, d, h] of [[0, 0, 4.2, 3.0, 2.9], [2.9, 0.4, 2.2, 2.4, 3.6]]) {
      const P = [[cu + du - w / 2, cv + dv - d / 2], [cu + du + w / 2, cv + dv - d / 2], [cu + du + w / 2, cv + dv + d / 2], [cu + du - w / 2, cv + dv + d / 2]].map(([u, v]) => uvXZ(u, v));
      W.setColor(WALL); W.extrude(P, [], ROOFY, ROOFY + h, { top: false, sides: true });
      D.setColor('#6f6c68'); D.fill(P, [], ROOFY + h + 0.01, true);
      S.prism(P.flat(), ROOFY, ROOFY + h, 0, 0, 'equipment');
    }
    S.prism(q.ring.flat(), gB, TOP, 0, 0, 'wall');
  }

  // the lot, cleared of the pines and draped over the terrain on a 2 m grid with vertex colours: pavements round the
  // blocks, asphalt in the lane between them and along the street and the outer drives, lawns in the yards with a
  // path down the middle (u / v zones; the colours blend over a cell, which reads as worn edges)
  const near = (u, v) => Math.min(...secs.map(({ r: [u0, u1, v0, v1] }) => Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1))));
  const zone = (u, v) => {
    const d = near(u, v);
    if (d < 3.2) return '#b9b4ab';                                   // the pavement round the walls
    if ((v > -77.5 && v < -62) || v > 13.5 || u > 82 || v < -153) return '#55575a'; // lane, street-side parking, drives
    if (u < -4 || (u < 20 && v < -62)) return '#b0aba2';             // the SW forecourts
    const yard = v > -62 ? -26 : -114;                               // the yards: lawn with a path along the middle
    return Math.abs(v - yard) < 1.6 || Math.abs(u - 22) < 1.6 ? '#bdb7ad' : '#6d8a4c';
  };
  {
    const [U0, U1, V0, V1, st] = [LOT[0], LOT[1], LOT[2], LOT[3], 2], nu = Math.round((U1 - U0) / st), nv = Math.round((V1 - V0) / st), first = D.v;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = U0 + i * st, v = V0 + j * st, [x, z] = uvXZ(u, v);
      D.setColor(zone(u, v)); D.vert(x, heightAt(x, z) + 0.26, z, 0, 1, 0); // over the ground layers (GY in ground.js: walks at +0.19)
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = first + j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      D.quad(a, d, c, b); // counter-clockwise seen from above (u x v points down in this frame)
    }
  }

  // the car parks of the render: perpendicular bays along the street and along the drive on the north-east side,
  // white lines on the asphalt and real (knockable) parked cars in about half of them
  const parked = [];
  D.setColor('#e6e4de');
  const bays = (fixed, along, a0, a1, d0, d1, alongU) => { // a row of 2.7 m bays: fixed coordinate range d0..d1 across, a0..a1 along
    for (let a = a0; a <= a1 + 0.01; a += 2.7) {
      const P = alongU ? [[a - 0.06, d0], [a + 0.06, d0], [a + 0.06, d1], [a - 0.06, d1]] : [[d0, a - 0.06], [d0, a + 0.06], [d1, a + 0.06], [d1, a - 0.06]];
      const Q = P.map(([u, v]) => { const [x, z] = uvXZ(u, v); return [x, heightAt(x, z) + 0.28, z]; });
      D.face(Q, [0, 1, 0]);
      if (a + 2.7 <= a1 + 0.01 && r() < 0.55) {
        const [x, z] = alongU ? uvXZ(a + 1.35, (d0 + d1) / 2) : uvXZ((d0 + d1) / 2, a + 1.35), dir = (r() < 0.5 ? 1 : -1) * fixed;
        const [fx, fz] = alongU ? [V[0] * dir, V[1] * dir] : [U[0] * dir, U[1] * dir];
        parked.push([x, z, Math.atan2(-fz, fx)]);
      }
    }
  };
  bays(1, 'u', 3, 75, 14, 19.2, true);
  bays(1, 'v', -148, -80, 83.5, 89, false);
  bays(1, 'v', -59, 6, 83.5, 89, false);

  // a playground in each yard: a soft pad, a timber play tower with a slide, a sandbox (no fences in the way)
  for (const [cu, cv] of [[38, -27], [40, -114]]) {
    const c = uvXZ(cu, cv), g = heightAt(...c), f = face(uvXZ(cu - 7, cv), uvXZ(cu + 7, cv), -V[0], -V[1]);
    D.setColor('#4f7f63'); box(D, f, 0, 14, g - 0.4, g + 0.34, -5, 5, 'ftlrb');
    D.setColor('#b98a57');
    for (const [s, o] of [[3, -1], [5, -1], [3, 1], [5, 1]]) box(D, f, s - 0.08, s + 0.08, g, g + 3.2, o - 0.08, o + 0.08, 'fblr');
    box(D, f, 2.9, 5.1, g + 1.5, g + 1.65, -1.1, 1.1, 'ftlrbu');
    D.setColor('#8a5a38'); { const P = [at(f, 2.8, g + 3.2, -1.25), at(f, 5.2, g + 3.2, -1.25), at(f, 5.2, g + 3.2, 1.25), at(f, 2.8, g + 3.2, 1.25)], top = at(f, 4, g + 4.3, 0);
      for (let i = 0; i < 4; i++) { // the four slopes, each normal out of the roof
        const a = P[i], b = P[(i + 1) % 4], dx = (a[0] + b[0]) / 2 - top[0], dz = (a[2] + b[2]) / 2 - top[2], l = Math.hypot(dx, dz, 1.2);
        D.face([a, b, top], [dx / l, 1.2 / l, dz / l]);
      } }
    { const l = Math.hypot(1.25, 3.5); D.setColor('#c7c9cc'); quad(D, at(f, 5.1, g + 1.6, -0.45), at(f, 8.6, g + 0.35, -0.45), at(f, 8.6, g + 0.35, 0.45), at(f, 5.1, g + 1.6, 0.45), [f.ux * 1.25 / l, 3.5 / l, f.uz * 1.25 / l]); }
    D.setColor('#a8794c'); box(D, f, 9.5, 12.5, g, g + 0.6, -2.5, 0.5, 'ftlrb');
    D.setColor('#e3cf9a'); quad(D, at(f, 9.65, g + 0.52, -2.35), at(f, 12.35, g + 0.52, -2.35), at(f, 12.35, g + 0.52, 0.35), at(f, 9.65, g + 0.52, 0.35), [0, 1, 0]);
    solid(S, f, 2.9, 5.1, -1.1, 1.1, g, g + 3.2, 'wall');
  }

  const M = {
    wall: new THREE.MeshStandardMaterial({ map: speckle(r), vertexColors: true, roughness: 0.88 }),
    det: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    glass: new THREE.MeshStandardMaterial({ map: winTex(), vertexColors: true, roughness: 0.15, metalness: 0.35 }),
    lit: new THREE.MeshStandardMaterial({ map: winTex(), emissiveMap: winEmTex(), vertexColors: true, roughness: 0.2, metalness: 0.2, emissive: 0xffd9a8, emissiveIntensity: 0 }),
  };
  const out = finish(root, 'onix', B, M, { shade: ['wall', 'det'] });
  console.log(`[cherkasy] ЖК Onix: ${secs.length} sections, ${nWin} windows, ${nBal} balconies, ${(out.verts / 1000).toFixed(1)}k verts, ${(out.tris / 1000).toFixed(1)}k tris, ${out.meshes} meshes, ${S.count - n0} solids, ${parked.length} parked in ${(performance.now() - t0).toFixed(0)} ms`);
  // the generated trees (the pine wood the lot was cut from) keep off the whole lot; birches in the yards instead
  const spots = [];
  for (const [u0, u1, v] of [[4, 18, -36], [4, 18, -16], [28, 52, -36], [28, 52, -16], [30, 54, -124], [30, 54, -104]])
    for (let u = u0; u <= u1; u += 6 + r() * 3) { const [x, z] = uvXZ(u, v + (r() - 0.5) * 2); spots.push({ x, z, y: heightAt(x, z) + 0.1, kind: 'park', variant: 'birch', sc: 0.8 + r() * 0.3, s3: [0.55, 1.15, 0.55] }); }
  const toUV = (x, z) => { const { O } = ONIX_FRAME, dx = x - O[0], dz = z - O[1]; return [dx * U[0] + dz * U[1], dx * V[0] + dz * V[1]]; };
  return {
    footprints: secs.map((q) => ({ poly: q.ring, h: lvl[q.b] + GF + (NF - 1) * FH + PARA - Math.min(...q.ring.map(([x, z]) => heightAt(x, z))), kind: 'apt', name: `ЖК Onix, секція ${q.id}` })),
    clear: (x, z) => { const [u, v] = toUV(x, z); return u > LOT[0] && u < LOT[1] && v > LOT[2] && v < LOT[3]; },
    spots, parked,
    update() { M.lit.emissiveIntensity = 1.2 * nightK.value; },
  };
}
