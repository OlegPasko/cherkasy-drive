// OWNER: cherkasy. The prosp. Khimikiv viaduct (міст по проспекту Хіміків, OSM «Горбатий міст», issue #24): from the
// Velyke kolo roundabout on pl. Peremohy prosp. Khimikiv climbs over the station's tracks, the sidings of the
// industrial spurs and the side streets on a concrete beam viaduct (1981–83, 690 m with its ramps, 20 m wide, four
// lanes; uk.wikipedia «Міст по проспекту Хіміків»). It replaced the level crossing that used to jam the road. OSM: the
// deck is way 72051299 (bridge=yes, layer 1, 482 m), the outline 927226201; under it run the main line and two sidings
// (t ~118 and ~290–300 m from the north-west end), the service roads and lanes that cross under it (one with maxheight 2
// at t ~42) and two that run beneath it along its axis. The DEM sees the whole stretch as flat ground at 25–27 m, so
// before this module the road crossed the tracks at grade.
// Built after the Wikimedia Commons view from pl. Peremohy (2019) and Street View: a grey precast beam deck with raised
// walks and plain steel railings on rows of round columns under cap beams, earth-filled ramps between concrete retaining
// walls at both ends, lamp posts along the parapets. The vertical profile (PROF) rises off the roundabout exit, crests
// over the main tracks (~8.4 m over the ground there) and comes down before the Zalizniaka junction.
//   buildKhimBridge({ root, map, solids, heightAt, geo, ground, detailMat }) -> { update(), clear(x, z), deckAt(x, z) } | null
//     The deck and the ramps follow PROF in ~6 m planar pieces (the carriageway and walks in the ground material, lane
//     paint). Where the deck is less than SOLID m over the ground it is a closed ramp (retaining walls, solid collision:
//     the car drives up it), elsewhere an open deck (OVERHANG collision: driven on with a height hint, under without)
//     on pier rows placed clear of the roads and tracks underneath. Under the open deck the ground strip OSM draws for
//     prosp. Khimikiv turns to lawn (the streets crossing under keep theirs) and its lane paint is dropped.
//     deckAt(x, z) -> deck top y | null   for the lane network (npc/lanes.js opts.deckAt): the bridge lanes ride the deck.
//     clear(x, z): no generated trees on or under the viaduct.
import * as THREE from 'three';
import { MB } from '../../kit/mesh.js';
import { DP } from '../materials.js';
import { OVERHANG } from '../collision.js';
import { fin, along, frame, resurface, dropPaint, sboxer, barTex, topMesh, groundMat } from './bridgekit.js';
import { SURF } from './ground.js';

const AXIS = [[49.4143007, 32.0324087], [49.4116296, 32.0376424]]; // way 72051299: north-west end, south-east end
// the profile, in metres along AXIS from its north-west end: the ramp leaves the roundabout exit at grade (t0), crests
// over the main tracks (tc, crest m over the ground there) and lands short of the Zalizniaka junction (t1); p0 / p1 the
// curve exponents of the two sides, ease the share of each side that eases in from level (no kink at the feet)
const PROF = { t0: -60, tc: 296, t1: 632, crest: 8.4, p0: 2.4, p1: 1.8, ease: 0.07 };
const SOLID = 3.1;   // deck top over the ground below which the viaduct is a closed ramp
const DK = { hw: 7.3, walk: 9.3, edge: 9.9, slab: 0.45, depth: 1.15, kerb: 0.18, par: 0.3, rail: 1.1, lift: 0.03 };
const SEG = 6;       // planar deck pieces (m)
const C = { conc: '#a6a49d', concDark: '#8d8b85', wall: '#9c9a93', rail: '#5f6569', galv: '#b9bdbf' };

function siteOf(geo) {
  const D = frame(...AXIS.map(([la, lo]) => geo.toXZ(la, lo)));
  return { D, tA: PROF.t0, tB: PROF.t1 };
}

// what lies under the viaduct: map roads (other than prosp. Khimikiv itself) and rails as polylines in the frame,
// with their half widths
function underneath(map, D, tA, tB) {
  const out = [];
  const add = (p, hw, rail) => {
    const L = [];
    for (let i = 0; i < p.length; i += 2) L.push([p[i], p[i + 1]]);
    if (L.some(([x, z]) => { const [t, o] = D.to(x, z); return t > tA - 10 && t < tB + 10 && Math.abs(o) < 30; })) out.push({ L, hw, rail });
  };
  for (const r of map.roads ?? []) if (!r.br && r.n !== 'проспект Хіміків' && r.p?.length >= 4) add(r.p, (r.w ?? 4) / 2, false);
  for (const r of map.rails ?? []) add(r.p, 2.6, true);
  return out;
}

export function buildKhimBridge({ root, map, solids: S, heightAt, geo, ground, detailMat }) {
  if (!geo || !map) return null;
  const t0 = performance.now();
  const { D, tA, tB } = siteOf(geo);
  const g = (x, z) => fin(heightAt(x, z));
  const gD = (t, o) => g(...D.at(t, o));
  const sb = sboxer(D);

  // ---- the profile: level ya at tA, crest yc at tc, level yb at tB; cross fall kO from the ground at the feet
  const ya = gD(tA, 0), yb = gD(tB, 0), yc = gD(PROF.tc, 0) + PROF.crest;
  const side = (u, p) => { const e = Math.min(1, u / PROF.ease); return (1 - Math.pow(1 - u, p)) * (1 - (1 - e) * (1 - e)); };
  const prof = (t) => {
    if (t <= tA) return ya;
    if (t >= tB) return yb;
    return t < PROF.tc ? ya + (yc - ya) * side((t - tA) / (PROF.tc - tA), PROF.p0) : yb + (yc - yb) * side((tB - t) / (tB - PROF.tc), PROF.p1);
  };
  const kO = ((gD(tA, 6) - gD(tA, -6)) + (gD(tB, 6) - gD(tB, -6))) / 24;
  // planar pieces: knots every <= SEG m, the deck top piecewise linear between them (collision = picture)
  const NK = Math.ceil((tB - tA) / SEG), knots = Array.from({ length: NK + 1 }, (_, k) => tA + (tB - tA) * k / NK), yk = knots.map(prof);
  const Yc = (t) => { // centre line, piecewise linear
    if (t <= tA) return yk[0];
    if (t >= tB) return yk[NK];
    const k = Math.min(NK - 1, Math.floor((t - tA) / (tB - tA) * NK)), f = (t - knots[k]) / (knots[k + 1] - knots[k]);
    return yk[k] + (yk[k + 1] - yk[k]) * f;
  };
  const Y = (t, o) => Yc(t) + kO * o + DK.lift;
  const at = (dy) => (t, o) => Y(t, o) + dy, flat = (y) => () => y;
  // the ground under the deck's edges, for walls and the open / closed split
  const over = (t) => Y(t, 0) - Math.max(gD(t, -DK.edge), gD(t, 0), gD(t, DK.edge));
  let s0 = tA, s1 = tB; // the closed ramps run tA..s0 and s1..tB
  for (let t = tA; t < PROF.tc; t += 0.5) if (over(t) < SOLID) s0 = t + 0.5; else break;
  for (let t = tB; t > PROF.tc; t -= 0.5) if (over(t) < SOLID) s1 = t - 0.5; else break;
  // snap to knots, so every piece is one kind
  s0 = knots[Math.min(NK, Math.ceil((s0 - tA) / (tB - tA) * NK))];
  s1 = knots[Math.max(0, Math.floor((s1 - tA) / (tB - tA) * NK))];

  const under = underneath(map, D, tA, tB);
  const blocked = (x, z, pad) => under.some((u) => along(u.L, x, z).d < u.hw + pad);
  const B = { det: new MB(), bars: new MB(), paint: new MB() }, det = B.det;
  const col = (c, part = DP.CONC) => det.setColor(c).setPart(part);
  const top = topMesh();

  // ---------------------------------------------------------------- piece by piece: surface, structure, collision
  let open = 0, closed = 0;
  for (let k = 0; k < NK; k++) {
    const ta = knots[k], tb = knots[k + 1], solid = tb <= s0 + 1e-6 || ta >= s1 - 1e-6;
    const ya0 = Y(ta, 0), yb0 = Y(tb, 0), kT = (yb0 - ya0) / (tb - ta);
    const bx = kT * D.ux + kO * D.nx, bz = kT * D.uz + kO * D.nz, [ax, az] = D.at(ta, 0), pa = ya0 - bx * ax - bz * az;
    const lowG = Math.min(gD(ta, -DK.edge), gD(tb, -DK.edge), gD(ta, DK.edge), gD(tb, DK.edge), gD(ta, 0), gD(tb, 0));
    const nUp = (() => { const l = Math.hypot(bx, 1, bz); return [-bx / l, 1 / l, -bz / l]; })();
    const P3 = (t, o, dy = 0) => { const [x, z] = D.at(t, o); return [x, Y(t, o) + dy, z]; };
    // carriageway, raised walks, kerb faces
    top.quad([P3(ta, -DK.hw), P3(tb, -DK.hw), P3(tb, DK.hw), P3(ta, DK.hw)], nUp, SURF.ASPHALT);
    for (const sg of [-1, 1]) {
      const [oa, ob] = sg > 0 ? [DK.hw, DK.walk] : [-DK.walk, -DK.hw];
      top.quad([P3(ta, oa, DK.kerb), P3(tb, oa, DK.kerb), P3(tb, ob, DK.kerb), P3(ta, ob, DK.kerb)], nUp, SURF.PAVERS);
      top.quad([P3(ta, sg * DK.hw), P3(tb, sg * DK.hw), P3(tb, sg * DK.hw, DK.kerb), P3(ta, sg * DK.hw, DK.kerb)], [-D.nx * sg, 0, -D.nz * sg], SURF.CURB);
      const [ea, eb] = sg > 0 ? [DK.walk, DK.edge] : [-DK.edge, -DK.walk];
      if (solid) { // the retaining wall: from under the ground up into the parapet
        col(C.wall);
        sb(det, ta, tb, ea, eb, (t, o) => gD(t, o) - 0.6, at(DK.par), sg > 0 ? 1 | 4 : 2 | 4);
        for (const c of [ta, tb]) if (Math.abs(c - tA) < 1e-6 || Math.abs(c - tB) < 1e-6) sb(det, c - 0.01, c + 0.01, ea, eb, (t, o) => gD(t, o) - 0.6, at(DK.par), 16 | 32);
      } else { // fascia beam rising into the parapet kerb
        col(C.conc);
        sb(det, ta, tb, ea, eb, at(-DK.depth), at(DK.par), (sg > 0 ? 1 : 2) | 4 | 8);
      }
    }
    if (solid) {
      closed++;
      S.prism([D.at(ta, -DK.edge), D.at(tb, -DK.edge), D.at(tb, DK.edge), D.at(ta, DK.edge)], lowG - 1, pa, bx, bz, 'bridge');
    } else {
      open++;
      col(C.conc);
      sb(det, ta, tb, -DK.walk, DK.walk, at(-DK.slab), at(0), 8);  // slab soffit
      col(C.concDark);
      for (const o of [-7.6, -4.6, -1.5, 1.5, 4.6, 7.6]) sb(det, ta, tb, o - 0.38, o + 0.38, at(-DK.depth + 0.05), at(-DK.slab), 1 | 2 | 8);
      S.prism([D.at(ta, -DK.edge), D.at(tb, -DK.edge), D.at(tb, DK.edge), D.at(ta, DK.edge)], Math.min(ya0, yb0) - DK.depth, pa, bx, bz, 'bridge', OVERHANG);
    }
    for (const sg of [-1, 1]) {
      const [oa, ob] = sg > 0 ? [DK.hw, DK.walk] : [-DK.walk, -DK.hw];
      S.prism([D.at(ta, oa), D.at(tb, oa), D.at(tb, ob), D.at(ta, ob)], solid ? lowG - 1 : Math.min(ya0, yb0) - 0.5, pa + DK.kerb, bx, bz, 'walk', solid ? 0 : OVERHANG);
      const [cx, cz] = D.at((ta + tb) / 2, sg * (DK.edge - 0.2));
      S.obox(cx, cz, (tb - ta) / 2 + 0.02, 0.2, D.ang, Math.min(ya0, yb0) - (solid ? 0.5 : DK.depth), Math.max(ya0, yb0) + DK.rail, 'rail');
    }
    // lane paint: a solid centre line, dashed lane lines 3.6 m out
    const strip = (t0s, t1s, o, hw) => B.paint.face([P3(t0s, o - hw, 0.012), P3(t1s, o - hw, 0.012), P3(t1s, o + hw, 0.012), P3(t0s, o + hw, 0.012)], nUp);
    strip(ta, tb, 0, 0.075);
    for (const o of [-3.6, 3.6]) for (let t = Math.ceil((ta - tA) / 9) * 9 + tA; t < tb; t += 9) strip(Math.max(ta, t), Math.min(tb, t + 3), o, 0.06);
  }
  // end diaphragms where the open deck meets the closed ramps
  col(C.concDark);
  for (const t of [s0, s1]) sb(det, t - 0.3, t + 0.3, -DK.walk, DK.walk, at(-DK.depth), at(-DK.slab), 1 | 2 | 8 | 16 | 32);

  // ---------------------------------------------------------------- pier rows: round columns under a cap beam
  // rows every ~30 m along the open deck, nudged off the roads and tracks underneath; a column that would stand on a
  // road or a track is left out (the cap beam spans over it), a row with fewer than two columns moves on
  const rows = [];
  const capLo = -DK.depth - 1.0, COLS = [-6.6, -2.2, 2.2, 6.6];
  for (let t = s0 + 18; t < s1 - 8; ) {
    let placed = null;
    for (const dt of [0, 2, -2, 4, -4, 6, -6, 8, 10, 12]) {
      const tp = t + dt;
      if (tp <= s0 + 6 || tp >= s1 - 4) continue;
      const cols = COLS.filter((o) => !blocked(...D.at(tp, o), 1.4));
      if (cols.length >= 2 && cols.some((o) => o < 0) && cols.some((o) => o > 0)) { placed = { tp, cols }; break; }
    }
    if (placed) { rows.push(placed); t = placed.tp + 30; } else t += 6;
  }
  for (const { tp, cols } of rows) {
    col(C.conc);
    sb(det, tp - 0.55, tp + 0.55, -DK.walk + 0.4, DK.walk - 0.4, at(capLo), at(-DK.depth));
    const [cx, cz] = D.at(tp, 0);
    S.obox(cx, cz, 0.55, DK.walk - 0.4, D.ang, Y(tp, 0) + capLo - 0.4, Y(tp, 0) - DK.depth, 'pier');
    for (const o of cols) {
      const [x, z] = D.at(tp, o), foot = g(x, z) - 0.4, topY = Y(tp, o) + capLo;
      if (topY - foot < 0.5) continue;
      det.setColor(C.conc).setPart(DP.CONC).cyl(x, foot, z, 0.5, 0.5, topY - foot + 0.05, 12, false);
      S.cyl(x, z, foot, topY, 0.5, 0.5, 'pier');
    }
  }

  // ---------------------------------------------------------------- railings and lamps
  const bars = B.bars;
  for (const sg of [-1, 1]) {
    const o = sg * (DK.edge - 0.18), n = [D.nx * sg, 0, D.nz * sg];
    det.setColor(C.rail).setPart(DP.PAINT);
    for (let t = tA + 0.2; t <= tB; t += 2.5) sb(det, t - 0.04, t + 0.04, o - 0.04, o + 0.04, at(DK.par), at(DK.rail), 1 | 2 | 16 | 32);
    for (let k = 0; k < NK; k++) {
      const ta = knots[k], tb = knots[k + 1];
      sb(det, ta, tb, o - 0.05, o + 0.05, at(DK.rail - 0.06), at(DK.rail), 1 | 2 | 4 | 8);
      const q = (t, y) => { const [x, z] = D.at(t, o); return [x, Y(t, o) + y, z]; }, ids = [];
      for (const [t, y, v] of [[ta, DK.par + 0.08, 0], [tb, DK.par + 0.08, 0], [tb, DK.rail - 0.06, 1], [ta, DK.rail - 0.06, 1]]) {
        const p = q(t, y);
        ids.push(bars.vert(p[0], p[1], p[2], ...n, (t - tA) / 0.16, v));
      }
      bars.quad(ids[0], ids[1], ids[2], ids[3]);
    }
    // lamp posts on the parapet, the arm over the carriageway, the lantern lit at night
    for (let t = tA + 20 + (sg > 0 ? 0 : 17); t < tB - 12; t += 34) {
      const [x, z] = D.at(t, sg * (DK.edge - 0.2)), y0 = Y(t, sg * DK.edge) + DK.par;
      det.setColor(C.galv).setPart(DP.GALV).cyl(x, y0, z, 0.11, 0.07, 8.6, 8);
      sb(det, t - 0.05, t + 0.05, sg * (DK.edge - 2.2), sg * (DK.edge - 0.2), flat(y0 + 8.45), flat(y0 + 8.55));
      det.setColor('#2b2d30').setPart(DP.PAINT);
      sb(det, t - 0.22, t + 0.22, sg * (DK.edge - 2.6), sg * (DK.edge - 1.8), flat(y0 + 8.3), flat(y0 + 8.48));
      det.setColor('#fff2d8').setPart(DP.LIGHT);
      sb(det, t - 0.17, t + 0.17, sg * (DK.edge - 2.55), sg * (DK.edge - 1.85), flat(y0 + 8.26), flat(y0 + 8.3), 8);
      S.cyl(x, z, y0, y0 + 8.6, 0.12, 0.08, 'pole');
    }
  }

  // ---------------------------------------------------------------- the ground under it
  // prosp. Khimikiv's own strip under the open deck turns to lawn (the streets crossing under keep theirs); its paint goes
  const ROADS = new Set([SURF.ASPHALT, SURF.PAVERS, SURF.CURB]);
  const cs = [D.at(tA - 5, -14), D.at(tA - 5, 14), D.at(tB + 5, -14), D.at(tB + 5, 14)];
  const box = [Math.min(...cs.map((p) => p[0])), Math.min(...cs.map((p) => p[1])), Math.max(...cs.map((p) => p[0])), Math.max(...cs.map((p) => p[1]))];
  const lawned = resurface(ground, box, (x, z, s, P, a, b, c) => {
    if (!ROADS.has(s)) return null;
    const [t, o] = D.to(x, z);
    if (t < s0 || t > s1 || Math.abs(o) > DK.edge + 0.6) return null;
    for (const v of [a, b, c]) if (blocked(P[3 * v], P[3 * v + 2], 0.6)) return null;
    return SURF.GRASS;
  });
  const unpainted = dropPaint(ground, (x, z, lx, lz) => {
    const [t, o] = D.to(x, z);
    return t >= tA && t <= tB + 0.5 && Math.abs(o) <= 8 && Math.abs(lx * D.ux + lz * D.uz) >= 0.85 * Math.hypot(lx, lz);
  });

  // ---------------------------------------------------------------- meshes
  const group = Object.assign(new THREE.Group(), { name: 'khimbridge' });
  root.add(group);
  const topM = top.mesh(groundMat(ground), 'khimbridge-road');
  if (topM) group.add(topM);
  const mat = detailMat ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  group.add(Object.assign(new THREE.Mesh(det.build({ part: true }), mat), { name: 'khimbridge-structure', castShadow: true, receiveShadow: true }));
  const barMat = new THREE.MeshStandardMaterial({ color: C.rail, alphaMap: barTex(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.3, roughness: 0.55 });
  barMat.alphaMap.wrapT = THREE.ClampToEdgeWrapping;
  group.add(Object.assign(new THREE.Mesh(bars.build(), barMat), { name: 'khimbridge-railing', castShadow: true }));
  const mkMat = ground?.root?.children?.find((m) => m.name === 'markings')?.material ?? new THREE.MeshStandardMaterial({ color: 0xc7c7bd, roughness: 0.7 });
  group.add(Object.assign(new THREE.Mesh(B.paint.build({ uv: false }), mkMat), { name: 'khimbridge-paint', receiveShadow: true }));
  const clr = under.filter((u) => u.rail).map((u) => { let best = Infinity; for (let t = s0; t < s1; t += 1) { const [x, z] = D.at(t, 0); if (along(u.L, x, z).d < 2) best = Math.min(best, Y(t, 0) - DK.depth - g(x, z)); } return best; }).filter(Number.isFinite);
  console.log(`[cherkasy] Khimikiv viaduct: ${(tB - tA).toFixed(0)} m (${ya.toFixed(1)} -> ${yc.toFixed(1)} -> ${yb.toFixed(1)} m), ramps ${(s0 - tA).toFixed(0)} / ${(tB - s1).toFixed(0)} m, ${open} open + ${closed} closed pieces, ${rows.length} pier rows, track clearance ${clr.map((v) => v.toFixed(1)).join(' / ')} m, ${lawned} ground triangles lawned, ${unpainted} paint strips dropped, ${((det.v + bars.v + B.paint.v + top.v) / 1000).toFixed(1)}k verts in ${(performance.now() - t0).toFixed(0)} ms`);

  const bb = box;
  return {
    deckAt: (x, z) => { const [t, o] = D.to(x, z); return t >= tA && t <= tB && Math.abs(o) <= DK.edge ? Y(t, o) : null; },
    clear: (x, z) => {
      if (x < bb[0] || x > bb[2] || z < bb[1] || z > bb[3]) return false;
      const [t, o] = D.to(x, z);
      return t > tA - 3 && t < tB + 3 && Math.abs(o) < 12.5;
    },
    update() {},
    stats: () => ({ tA, tB, s0, s1, rows: rows.length, ya, yb, yc }),
  };
}
