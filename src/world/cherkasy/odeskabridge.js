// OWNER: cherkasy. The Lunacharka interchange (issue #38): Н-16 crosses Одеська вулиця, the railway to the dam and
// Сумгаїтська вулиця on a beam bridge (OSM ways 59842621, 1267744217, 1268192779: bridge=yes, layer 1; the outline
// 927227483; footway bridges on both sides), with four loop ramps down to the two parallel streets. The DEM sees a
// shallow valley there, so the game drew the cross road on the ground: it met the streets at grade and dipped into
// the rail cutting (railcut.js), traffic and all. References: the player's Google satellite views (issue #38), Esri
// World Imagery, OSM. The deck is a grey precast beam bridge like the Dakhnivska one (overpass.js): no photo of this
// one from the street was found, so its railings, lamps and pier rows are that bridge's.
// TERRAIN
//   shapeOdeskaBridge(hf, map) -> { deck: DECK, lowered, raised } | null   after shapeRailCut, before the ground is
//     built. The valley floor along the line (both streets, the railway between) is lowered by DROP under the bridge,
//     fading out along the line; the cross road is raised on short embankments at both deck ends, so the deck stands
//     CLEAR m over the streets; the loop ramps run from the raised ends down to the lowered streets on the lattice.
// SITE
//   buildOdeskaBridge({ root, solids, heightAt, ground, detailMat }) -> { update(), clear(x, z), deckAt(x, z) } | null
//     The deck spans the OSM bridge ways (the cross road's br chain) between the terrain heights at its ends:
//     carriageway and walks in the ground material, lane paint, fascia beams, girders, piers between the streets and
//     the track, blue railings, lamps. Collision as overpass.js (OVERHANG deck, kerbs, parapets, cap beams, columns).
//     Under the deck the cross road's own ground strip turns to lawn (the two streets keep theirs) and its paint goes.
//     deckAt(x, z) -> deck top | null for the lane network: the cross road's lanes ride the deck, none cross the
//     track at grade (the rails draw no level crossing under an OSM bridge either).
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { DP } from '../materials.js';
import { OVERHANG } from '../collision.js';
import { ease, fin, along, crossing, frame, resurface, dropPaint, sboxer, barTex, topMesh, groundMat } from './bridgekit.js';
import { SURF } from './ground.js';

// the deck: the OSM bridge chain's ends (south-west, north-east), map metres; the south-west abutment stands 12 m
// further out than OSM ends the bridge, so its embankment's slope stays clear of Одеська
const OSM_END = [-716.7, -3261.5];
const AXIS = [[-722.6, -3271.9], [-661.2, -3164.2]];
// the streets under it (centre lines, map.json Одеська 225 + 552, Сумгаїтська 455 + 211) and the line between
const STREETS = [
  { L: [[-663.6, -3276.6], [-671.1, -3268.4], [-678.9, -3261.6], [-760, -3196.8], [-1042, -2973]], hw: 4.9 },
  { L: [[-622.2, -3250.6], [-721.1, -3169.3], [-746.9, -3146.9]], hw: 7.3 },
];
const RAIL = [[-750, -3175.3], [-695, -3223], [-584, -3317]];
const DROP = 3;          // the valley floor lowered under the bridge (m)
const BAND = { a: [45, 150], b: [34, 56] }; // full / zero lowering: along the line from the axis, across from its middle
const CLEAR = 5.6;       // the streets' clearance under the girders (m)
const RAMP = 0.05;       // the embankments' grade down from the deck ends
const DK = { hw: 7, walk: 9.1, edge: 9.6, slab: 0.4, depth: 1.15, kerb: 0.18, par: 0.35, rail: 1.1, lift: 0.03 };
const C = { conc: '#a9a7a0', concDark: '#8f8d87', blue: '#3f74ae', galv: '#b9bdbf' };
let SHAPED = null;

function site() {
  const D = frame(...AXIS), R = frame(RAIL[1], RAIL[2]);
  const rc = crossing(RAIL, D.P, D.at(D.L, 0)), mid = rc ? D.at(rc.f * D.L, 0) : D.at(D.L / 2, 0);
  // the line's own frame through where the deck crosses it: a along the line, b across (the streets at ~-20 and ~+25)
  const A = { ux: R.ux, uz: R.uz, nx: R.nx, nz: R.nz, to: (x, z) => [(x - mid[0]) * R.ux + (z - mid[1]) * R.uz, (x - mid[0]) * R.nx + (z - mid[1]) * R.nz] };
  const under = STREETS.map((s) => { const c = crossing(s.L, D.P, D.at(D.L, 0)); return c ? { ...s, t: c.f * D.L } : null; });
  return { D, A, rail: rc ? rc.f * D.L : D.L / 2, under };
}
const dropAt = (A, x, z) => {
  const [a, b] = A.to(x, z);
  return DROP * (1 - ease(BAND.a[0], BAND.a[1], Math.abs(a))) * (1 - ease(BAND.b[0], BAND.b[1], Math.abs(b - 3)));
};

export function shapeOdeskaBridge(hf, map) {
  SHAPED = null;
  if (!hf?.data || !(map.roads ?? []).some((r) => r.br && r.k === 'm' && Math.hypot(r.p[0] - OSM_END[0], r.p[1] - OSM_END[1]) < 3)) return null;
  const s = site();
  if (s.under.some((u) => !u)) return null;
  const { meta: { x0, z0, cell, nx, nz }, grid } = hf.data, { D, A } = s;
  const L0 = hf.latticeAt ?? hf.heightAt; // the lattice (railcut.js may have overlaid heightAt with its trench)
  // the deck level: CLEAR + the girders over the higher street where it passes under, after the lowering
  const DECK = Math.max(...s.under.map((u) => { const [x, z] = D.at(u.t, 0); return L0(x, z) - dropAt(A, x, z); })) + CLEAR + DK.depth;
  const want = (t) => DECK - RAMP * Math.max(0, -t, t - D.L); // the cross road's level along its axis
  const pts = [D.at(-90, -60), D.at(-90, 60), D.at(D.L + 90, -60), D.at(D.L + 90, 60), ...[-160, 160].flatMap((a) => [-70, 80].map((b) => [s.D.at(s.rail, 0)[0] + A.ux * a + A.nx * b, s.D.at(s.rail, 0)[1] + A.uz * a + A.nz * b]))];
  const i0 = Math.max(0, Math.floor((Math.min(...pts.map((p) => p[0])) - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...pts.map((p) => p[0])) - x0) / cell));
  const j0 = Math.max(0, Math.floor((Math.min(...pts.map((p) => p[1])) - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((Math.max(...pts.map((p) => p[1])) - z0) / cell));
  let lowered = 0, raised = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * nx + i, x = x0 + i * cell, z = z0 + j * cell, dr = dropAt(A, x, z);
    let h = grid[k] - dr;
    if (dr > 0.02) lowered++;
    // the embankments: full on the axis outside the deck span, fading sideways and a cell into the span
    const [t, o] = D.to(x, z), side = 1 - ease(13, 40, Math.abs(o)), into = t < D.L / 2 ? 1 - ease(2, 14, t) : ease(D.L - 14, D.L - 2, t);
    const up = Math.max(0, want(t) - h) * side * into * (1 - ease(90, 150, Math.max(-t, t - D.L)));
    if (up > 0.02) { h += up; raised++; }
    grid[k] = h;
  }
  SHAPED = { deck: DECK };
  return { deck: DECK, lowered, raised };
}

export function buildOdeskaBridge({ root, solids: S, heightAt, ground, detailMat }) {
  if (!SHAPED) return null;
  const t0 = performance.now(), s = site(), { D } = s, g = (x, z) => fin(heightAt(x, z));
  const tS = 0, tN = D.L, len = tN - tS, tm = len / 2;
  const gD = (t, o) => g(...D.at(t, o));
  // the deck plane: the ground at both ends (the embankments' tops)
  const yS = gD(tS, 0), yN = gD(tN, 0), kT = (yN - yS) / len;
  const Y = (t) => yS + kT * (t - tS) + DK.lift;
  const bx = kT * D.ux, bz = kT * D.uz, pa = Y(0) - bx * D.P[0] - bz * D.P[1];
  const minY = Math.min(yS, yN), maxY = Math.max(yS, yN);
  const det = new MB(), bars = new MB(), paint = new MB(), col = (c, part = DP.CONC) => det.setColor(c).setPart(part);
  const sb = sboxer(D), at = (dy) => (t) => Y(t) + dy, flat = (y) => () => y;

  // ---- slab, fascia beams, girders, end diaphragms
  col(C.conc);
  sb(det, tS, tN, -DK.walk, DK.walk, at(-DK.slab), at(0), 8 | 16 | 32);
  for (const sg of [-1, 1]) { const [oa, ob] = sg > 0 ? [DK.walk, DK.edge] : [-DK.edge, -DK.walk]; sb(det, tS, tN, oa, ob, at(-DK.depth), at(DK.par)); }
  col(C.concDark);
  for (const o of [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]) sb(det, tS + 0.3, tN - 0.3, o - 0.4, o + 0.4, at(-DK.depth + 0.05), at(-DK.slab), 1 | 2 | 8 | 16 | 32);
  for (const [ta, tb] of [[tS, tS + 0.6], [tN - 0.6, tN]]) sb(det, ta, tb, -DK.walk, DK.walk, at(-DK.depth), at(-DK.slab), 1 | 2 | 8 | 16 | 32);
  S.prism([D.at(tS, -DK.edge), D.at(tN, -DK.edge), D.at(tN, DK.edge), D.at(tS, DK.edge)], minY - DK.depth, pa, bx, bz, 'bridge', OVERHANG);
  for (const sg of [-1, 1]) {
    const [oa, ob] = sg > 0 ? [DK.hw, DK.walk] : [-DK.walk, -DK.hw];
    S.prism([D.at(tS, oa), D.at(tN, oa), D.at(tN, ob), D.at(tS, ob)], minY - 0.5, pa + DK.kerb, bx, bz, 'walk', OVERHANG);
    const [cx, cz] = D.at(tm, sg * (DK.edge - 0.25));
    S.obox(cx, cz, len / 2, 0.25, D.ang, minY - DK.depth, maxY + DK.rail, 'rail');
  }

  // ---- piers: a row in the middle of every free stretch between the streets (with their walks) and the track
  const busy = [...s.under.map((u) => [u.t - (u.hw + 4.5) / 0.95, u.t + (u.hw + 4.5) / 0.95]), [s.rail - 7, s.rail + 7]].sort((a, b) => a[0] - b[0]);
  const rows = [];
  let from = tS + 4;
  for (const [a, b] of [...busy, [tN - 4, Infinity]]) {
    if (a - from > 2.5) { const n = Math.max(1, Math.round((a - from) / 26)); for (let q = 0; q < n; q++) rows.push(from + (a - from) * (q + 0.5) / n); }
    from = Math.max(from, b);
  }
  const capLo = -DK.depth - 0.9;
  for (const tp of rows) {
    col(C.conc);
    sb(det, tp - 0.6, tp + 0.6, -DK.walk + 0.3, DK.walk - 0.3, at(capLo), at(-DK.depth));
    const [cx, cz] = D.at(tp, 0);
    S.obox(cx, cz, 0.6, DK.walk - 0.3, D.ang, Y(tp) + capLo - 0.4, Y(tp) - DK.depth, 'pier');
    for (const o of [-6.2, 0, 6.2]) {
      const foot = Math.min(...[[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].map(([a, b]) => gD(tp + a, o + b))) - 0.4;
      const top = Y(tp) + capLo;
      if (top - foot < 0.5) continue;
      sb(det, tp - 0.45, tp + 0.45, o - 0.45, o + 0.45, flat(foot), flat(top), 1 | 2 | 16 | 32);
      const [px, pz] = D.at(tp, o);
      S.obox(px, pz, 0.45, 0.45, D.ang, foot, top, 'pier');
    }
  }

  // ---- railings (blue steel, bar infill) and lamps
  for (const sg of [-1, 1]) {
    const o = sg * (DK.edge - 0.22);
    det.setColor(C.blue).setPart(DP.PAINT);
    for (let t = tS + 0.2; t <= tN; t += 2.4) sb(det, t - 0.04, t + 0.04, o - 0.04, o + 0.04, at(DK.par), at(DK.rail), 1 | 2 | 16 | 32);
    sb(det, tS, tN, o - 0.05, o + 0.05, at(DK.rail - 0.06), at(DK.rail));
    sb(det, tS, tN, o - 0.03, o + 0.03, at(DK.par + 0.04), at(DK.par + 0.1), 1 | 2 | 4 | 8);
    const q = (t, y) => { const [x, z] = D.at(t, o); return [x, Y(t) + y, z]; }, n = [D.nx * sg, 0, D.nz * sg], ids = [];
    for (const [t, y, v] of [[tS, DK.par + 0.1, 0], [tN, DK.par + 0.1, 0], [tN, DK.rail - 0.06, 1], [tS, DK.rail - 0.06, 1]]) { const p = q(t, y); ids.push(bars.vert(p[0], p[1], p[2], ...n, (t - tS) / 0.14, v)); }
    bars.quad(ids[0], ids[1], ids[2], ids[3]);
    for (let t = tS + 12 + (sg > 0 ? 0 : 16); t < tN - 6; t += 32) {
      const [x, z] = D.at(t, sg * (DK.edge - 0.2)), y0 = Y(t) + DK.par;
      det.setColor(C.galv).setPart(DP.GALV).cyl(x, y0, z, 0.11, 0.07, 8.6, 8);
      sb(det, t - 0.05, t + 0.05, sg * (DK.edge - 2.2), sg * (DK.edge - 0.2), flat(y0 + 8.45), flat(y0 + 8.55));
      det.setColor('#2b2d30').setPart(DP.PAINT);
      sb(det, t - 0.22, t + 0.22, sg * (DK.edge - 2.6), sg * (DK.edge - 1.8), flat(y0 + 8.3), flat(y0 + 8.48));
      det.setColor('#fff2d8').setPart(DP.LIGHT);
      sb(det, t - 0.17, t + 0.17, sg * (DK.edge - 2.55), sg * (DK.edge - 1.85), flat(y0 + 8.26), flat(y0 + 8.3), 8);
      S.cyl(x, z, y0, y0 + 8.6, 0.12, 0.08, 'pole');
    }
  }

  // ---- carriageway, walks and kerbs in the ground material; lane paint
  const top = topMesh(), tq = top.quad;
  const nUp = (() => { const l = Math.hypot(bx, 1, bz); return [-bx / l, 1 / l, -bz / l]; })();
  const P3 = (t, o, dy = 0) => { const [x, z] = D.at(t, o); return [x, Y(t) + dy, z]; };
  const NT = Math.max(1, Math.ceil(len / 4));
  for (let k = 0; k < NT; k++) {
    const ta = tS + len * k / NT, tb = tS + len * (k + 1) / NT;
    tq([P3(ta, -DK.hw), P3(tb, -DK.hw), P3(tb, DK.hw), P3(ta, DK.hw)], nUp, SURF.ASPHALT);
    for (const sg of [-1, 1]) {
      const [oa, ob] = sg > 0 ? [DK.hw, DK.walk] : [-DK.walk, -DK.hw];
      tq([P3(ta, oa, DK.kerb), P3(tb, oa, DK.kerb), P3(tb, ob, DK.kerb), P3(ta, ob, DK.kerb)], nUp, SURF.PAVERS);
      const ok = sg * DK.hw;
      tq([P3(ta, ok), P3(tb, ok), P3(tb, ok, DK.kerb), P3(ta, ok, DK.kerb)], [-D.nx * sg, 0, -D.nz * sg], SURF.CURB);
    }
  }
  for (const [t, sg] of [[tS, -1], [tN, 1]]) for (const s2 of [-1, 1]) {
    const [oa, ob] = s2 > 0 ? [DK.hw, DK.walk] : [-DK.walk, -DK.hw];
    tq([P3(t, oa), P3(t, ob), P3(t, ob, DK.kerb), P3(t, oa, DK.kerb)], [D.ux * sg, 0, D.uz * sg], SURF.CURB);
  }
  const strip = (ta, tb, o, hw) => paint.face([P3(ta, o - hw, 0.012), P3(tb, o - hw, 0.012), P3(tb, o + hw, 0.012), P3(ta, o + hw, 0.012)], nUp);
  strip(tS + 0.5, tN - 0.5, 0, 0.075);
  for (const o of [-3.5, 3.5]) for (let t = tS + 1; t + 3 < tN; t += 9) strip(t, t + 3, o, 0.06);

  // ---- the ground under it: the cross road's own strip turns to lawn, the streets keep theirs
  const ROADS = new Set([SURF.ASPHALT, SURF.PAVERS, SURF.CURB]);
  const street = (x, z, m) => s.under.some((u) => along(u.L, x, z).d < u.hw + m);
  const under = (x, z) => { const [t, o] = D.to(x, z); return t >= tS - 0.5 && t <= tN + 0.5 && Math.abs(o) < 12.5 && g(x, z) < Y(t) - 1.2; };
  const corners = [D.at(tS - 5, -15), D.at(tS - 5, 15), D.at(tN + 5, -15), D.at(tN + 5, 15)];
  const box = [Math.min(...corners.map((p) => p[0])), Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[1]))];
  const lawned = resurface(ground, box, (x, z, sf, P, a, b, c) => {
    if (!ROADS.has(sf) || !under(x, z)) return null;
    const lim = sf === SURF.PAVERS ? 4.5 : 0.2;
    if (street(x, z, lim)) return null;
    for (const v of [a, b, c]) if (street(P[3 * v], P[3 * v + 2], lim - 0.45)) return null;
    return SURF.GRASS;
  });
  const unpainted = dropPaint(ground, (x, z, lx, lz) => {
    const [t, o] = D.to(x, z);
    return t >= tS - 0.5 && t <= tN + 0.5 && Math.abs(o) <= 8 && Math.abs(lx * D.ux + lz * D.uz) >= 0.85 * Math.hypot(lx, lz) && !street(x, z, 0.5);
  });

  // ---- meshes
  const group = Object.assign(new THREE.Group(), { name: 'odeskabridge' });
  root.add(group);
  const topM = top.mesh(groundMat(ground), 'odeskabridge-road');
  if (topM) group.add(topM);
  group.add(Object.assign(new THREE.Mesh(det.build({ part: true }), detailMat ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })), { name: 'odeskabridge-structure', castShadow: true, receiveShadow: true }));
  const barMat = new THREE.MeshStandardMaterial({ color: C.blue, alphaMap: barTex(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.3, roughness: 0.55 });
  barMat.alphaMap.wrapT = THREE.ClampToEdgeWrapping;
  group.add(Object.assign(new THREE.Mesh(bars.build(), barMat), { name: 'odeskabridge-railing', castShadow: true }));
  const mkMat = ground?.root?.children?.find((m) => m.name === 'markings')?.material ?? new THREE.MeshStandardMaterial({ color: 0xc7c7bd, roughness: 0.7 });
  group.add(Object.assign(new THREE.Mesh(paint.build({ uv: false }), mkMat), { name: 'odeskabridge-paint', receiveShadow: true }));
  const clear = s.under.map((u) => (Y(u.t) - DK.depth - gD(u.t, 0)).toFixed(1)).join(' / ');
  console.log(`[cherkasy] Odeska interchange bridge: deck ${len.toFixed(0)} m (${yS.toFixed(1)}-${yN.toFixed(1)} m), ${rows.length} pier rows, clearance ${clear} m over the streets, ${(Y(s.rail) - DK.depth - gD(s.rail, 0)).toFixed(1)} m over the track, ${lawned} ground triangles lawned, ${unpainted} paint strips dropped, ${((det.v + bars.v + paint.v + top.v) / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  return {
    deckAt: (x, z) => { const [t, o] = D.to(x, z); return t >= tS && t <= tN && Math.abs(o) <= DK.edge ? Y(t) : null; },
    clear: (x, z) => { const [t, o] = D.to(x, z); return t > tS - 4 && t < tN + 4 && Math.abs(o) < 14; },
    rows,
    update() {},
  };
}
