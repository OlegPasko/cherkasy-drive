// Headless checks for the generated facades' type detail and entrances (docs/cherkasy-facades.md): node tests/facadeplus.test.mjs
// The facade builder's opt-in byte and STAIR style, the generator's `plus` pass (types, planned entrances, stair columns
// cut into the wall), the facade kit's doors / porches / gates in the near builder, and that nothing changes without it.
import { readFileSync } from 'node:fs';
import { FacadeBuilder, STYLE, LAYER, PLUS, createFacadeMaterial } from '../src/world/facade.js';
import { buildBuildings, archetype, typify } from '../src/world/buildings.js';
import { dressBuilding } from '../src/world/cherkasy/facadekit.js';
import { roadSegs, roadIndex } from '../src/world/cherkasy/buildings.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
globalThis.performance ??= { now: () => Date.now() };
const seq = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const finite = (a) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };

// ---- FacadeBuilder: the spare byte, the STAIR style, the bay offset
{
  const plain = new FacadeBuilder().wall(0, 0, 20, 0, 0, 9, { layer: LAYER.CONCRETE }).build();
  ok([...plain.attributes.fext.array].every((v, i) => i % 4 !== 3 || v === 0), 'a wall without `plus` keeps the spare byte at 0');
  const g = new FacadeBuilder().wall(0, 0, 3, 0, 0, 9, { bayW: 3, plus: PLUS.BRICK | PLUS.FRAMES | PLUS.RECESS, u0: 40 }, STYLE.STAIR).build();
  ok(g.attributes.fext.array[3] === (3 | 8 | 96) && (g.attributes.fmat.array[1] & 7) === STYLE.STAIR, 'plus byte and the STAIR style are packed');
  ok(g.attributes.fuv.array[3] === 1 && Math.min(g.attributes.fuv.array[0], g.attributes.fuv.array[4]) === 40, 'a stair column is one bay, counted from u0');
  const rb = new FacadeBuilder().wall(0, 0, 12, 0, 0, 9, { bayW: 3, u0: 40 }, STYLE.RIBBON).build();
  ok(Math.min(rb.attributes.fuv.array[0], rb.attributes.fuv.array[4]) === 0, 'a ribbon wall ignores u0 (its margins count from the wall end)');
  ok(STYLE.BLANK === 0 && STYLE.PUNCHED === 1 && STYLE.CURTAIN === 2 && STYLE.RIBBON === 3 && STYLE.STAIR === 4, 'style ids unchanged, STAIR appended');
  // the shader source: the type detail sits behind the byte and the window-detail test, templates resolved
  const mat = createFacadeMaterial(), sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <emissivemap_fragment>' };
  const warn = console.warn; console.warn = () => {}; mat.onBeforeCompile(sh); console.warn = warn;
  ok(sh.fragmentShader.includes('if (plusB > 0.5 && detail > 0.0)') && !sh.fragmentShader.includes('${'), 'type detail is gated by the byte and the detail fade');
}

// ---- typify: types by look, entrances on the yard side, own random sequence
{
  const slab = { id: 5001, k: 'apt', lv: 5, p: [0, 0, 68, 0, 68, 12, 0, 12], f: '2010' };
  const outer = [[0, 0], [68, 0], [68, 12], [0, 12]];
  const A0 = archetype(slab, seq(11)), A1 = typify(slab, archetype(slab, seq(11)), outer, seq(5));
  ok(JSON.stringify(A0.tint) === JSON.stringify(A1.tint) && A0.layer === A1.layer, 'typify leaves the archetype as drawn');
  ok(A1.entr.length === 4 && A1.entr.every((q) => q.i === 2 && q.kind === 'K' && q.split), `a 68 m five-storey block has four entrances on its yard side (${A1.entr.length}, edge ${A1.entr[0]?.i})`);
  ok(A1.entr.every((q) => q.s - q.w / 2 > 1 && q.s + q.w / 2 < 67 && q.w >= 2.2), 'stair columns stay inside the wall');
  ok((A1.plus & PLUS.FRAMES) && (A1.plus & 7) >= 1 && (A1.plus & 7) <= 4, `a khrushchevka gets a type and mixed frames (plus ${A1.plus})`);
  const shops = typify({ ...slab, f: '2222' }, archetype(slab, seq(11)), outer, seq(5));
  ok(shops.entr.length === 0, 'a block with shopfronts all round keeps its doors in the shops');
  const nine = { id: 5002, k: 'apt', lv: 9, p: slab.p, f: '1010' }, A9 = typify(nine, archetype(nine, seq(3)), outer, seq(9));
  ok(A9.entr.length === 3 && A9.entr[0].kind === 'N', `a nine-storey slab has porches every 20-26 m (${A9.entr.length} ${A9.entr[0]?.kind})`);
  const school = { id: 5003, k: 'public', lv: 3, p: [0, 0, 40, 0, 40, 14, 0, 14], f: '0110', am: 'school' };
  const As = typify(school, archetype(school, seq(3)), [[0, 0], [40, 0], [40, 14], [0, 14]], seq(9));
  ok(As.entr.length === 1 && As.entr[0].kind === 'P' && As.entr[0].i === 2, 'a public building turns its door to the street, on a long side (not the short end that also faces one)');
  const kiosk = { id: 5004, k: 'public', lv: 1, p: [0, 0, 12, 0, 12, 8, 0, 8], f: '1000' }, Ak = typify(kiosk, archetype(kiosk, seq(3)), [[0, 0], [12, 0], [12, 8], [0, 8]], seq(9));
  ok(Ak.entr.length === 1 && Ak.entr[0].kind === 'p' && Ak.entr[0].w <= 2.6, 'a small one-storey public building gets a plain door');
  const hall = { ...school, f: '1000' }, Ah = typify(hall, archetype(hall, seq(3)), [[0, 0], [40, 0], [40, 14], [0, 14]], seq(9));
  ok(Ah.entr.length === 1 && Ah.entr[0].kind === 'P' && Math.abs(Ah.entr[0].s - 20) < 1e-6 && Ah.entr[0].v === PLUS.STRIP, 'a main entrance in the middle of the street front, a glazed stair strip over it');
  const mall = typify({ ...hall, f: '2000' }, archetype(hall, seq(3)), [[0, 0], [40, 0], [40, 14], [0, 14]], seq(9));
  ok(mall.entr.length === 0, 'a public block with a shopfront floor on a main street gets no extra entrance');
}

// ---- generator + kit on three synthetic buildings
const mkSinks = () => {
  const solids = [];
  return { solids, S: { prism: (poly, y0, a, bx, bz, kind, flags) => solids.push({ kind, flags, y0, y1: a, poly: Array.from(poly) }), box: (x0, y0, z0, x1, y1, z1, kind) => solids.push({ kind, box: 1 }), cyl: () => {}, get count() { return solids.length; } } };
};
const list = [
  { id: 6001, k: 'apt', lv: 5, p: [0, 0, 68, 0, 68, 12, 0, 12], f: '1000' },
  { id: 6002, k: 'public', lv: 3, p: [100, 0, 140, 0, 140, 14, 100, 14], f: '1000' },
  { id: 6003, k: 'indus', lv: 1, p: [200, 0, 260, 0, 260, 24, 200, 24], f: '1000' },
  { id: 6004, k: 'house', lv: 1, p: [300, 0, 310, 0, 310, 8, 300, 8], f: '1000' },
];
const stairQuads = (res) => { let n = 0; for (const t of res.tiles.values()) { const M = t.fac.build().attributes.fmat.array; for (let i = 1; i < M.length; i += 16) if ((M[i] & 7) === STYLE.STAIR) n++; } return n; };
const plusVerts = (res) => { let n = 0; for (const t of res.tiles.values()) { const E = t.fac.build().attributes.fext.array; for (let i = 3; i < E.length; i += 4) if (E[i]) n++; } return n; };
{
  const off = mkSinks(), on = mkSinks(), seen = {};
  const R0 = buildBuildings({ map: { buildings: list }, solids: off.S, heightAt: () => 0, dress: dressBuilding });
  const R1 = buildBuildings({ map: { buildings: list }, solids: on.S, heightAt: () => 0, plus: true, dress: (c) => { seen[c.b.id] = c.A; dressBuilding(c); } });
  ok(stairQuads(R0) === 0 && plusVerts(R0) === 0 && [...R0.tiles.values()].every((t) => t.near.v === 0), 'without `plus`: no stair columns, no type byte, nothing in the near builder');
  const nEntr = seen[6001].entr.length + seen[6002].entr.length;
  ok(stairQuads(R1) === nEntr && nEntr === 5, `with it: one stair column per planned entrance (${stairQuads(R1)} / ${nEntr})`);
  ok(seen[6004].entr === undefined && seen[6004].plus === undefined, 'houses, garages and sheds are left to their own kit');
  const near = [...R1.tiles.values()].map((t) => t.near), nv = near.reduce((n, d) => n + d.v, 0);
  ok(nv > 300 && nv < 1500, `doors, porches and gates go to the near builder (${nv} vertices for 5 entrances and 2 gates)`);
  ok(near.every((d) => !d.v || finite(d.build({ part: true }).attributes.position.array)) && [...R1.tiles.values()].every((t) => !t.det.v || finite(t.det.build({ part: true }).attributes.position.array)), 'all kit geometry is finite');
  const kinds = (L) => L.reduce((m, s) => { m[s.kind] = (m[s.kind] || 0) + 1; return m; }, {});
  const k0 = kinds(off.solids), k1 = kinds(on.solids);
  ok(on.solids.length - off.solids.length <= 4 && (k1.ledge || 0) === 1, `few new solids: the public stair and the canopies (${JSON.stringify(k0)} -> ${JSON.stringify(k1)})`);
  // the public entrance: canopy and stair in front of the street wall (z < 0 side of the 100..140 block), around x = 120
  const pub = on.solids.filter((s) => s.poly && s.poly.every((v, i) => (i % 2 ? v < 0.2 && v > -4 : v > 110 && v < 130)));
  ok(pub.some((s) => s.kind === 'awning' && s.flags === 1) && pub.some((s) => s.kind === 'ledge'), 'the public entrance stands in the middle of the street front, canopy flagged as an overhang');
  // deterministic
  const again = mkSinks(), R2 = buildBuildings({ map: { buildings: list }, solids: again.S, heightAt: () => 0, plus: true, dress: dressBuilding });
  const sum = (res) => [...res.tiles.values()].map((t) => t.near.build({ part: true }).attributes.position.array.reduce((s, v) => s + v, 0) + t.fac.build().attributes.fuv.array.reduce((s, v) => s + v, 0)).join();
  ok(sum(R1) === sum(R2) && JSON.stringify(on.solids) === JSON.stringify(again.solids), 'deterministic rebuild');
  // a door stands on the ground in front of it, not on the building's mean floor line
  const slope = mkSinks(), R3 = buildBuildings({ map: { buildings: [list[0]] }, solids: slope.S, heightAt: (x) => x * 0.03, plus: true, dress: dressBuilding });
  const P = [...R3.tiles.values()][0].near.build({ part: true }).attributes.position.array;
  const foot = [8.5, 25.5, 42.5, 59.5].map((x) => { let lo = Infinity; for (let i = 0; i < P.length; i += 3) if (P[i + 2] > 12.05 && Math.abs(P[i] - x) < 1.4) lo = Math.min(lo, P[i + 1]); return lo; });
  ok(foot.every((y, j) => !j || y > foot[j - 1] + 0.1) && foot[3] - foot[0] > 0.9, `on a slope each door stands on the ground in front of it (${foot.map((y) => y.toFixed(2)).join(' < ')} m)`);
}

// ---- carriageways: a porch by a driveway becomes a plain door, steps never stand on a road
{
  const road = { roads: [{ p: [-10, 15.9, 80, 15.9], w: 4.5, c: 'service', k: 'm' }, { p: [0, 40, 80, 40], w: 3, c: 'footway', k: 'p' }, { p: [0, 60, 80, 60], w: 8, c: 'primary', k: 'm', br: 1 }] };
  const segs = roadSegs(road), roadAt = roadIndex(segs);
  ok(segs.length === 5 && roadAt(30, 14) && roadAt(30, 18) && !roadAt(30, 13.5) && !roadAt(30, 40) && !roadAt(30, 60), 'roadAt: motor carriageways only, by half width (no footways, no bridges)');
  const nine = { id: 6101, k: 'apt', lv: 9, p: [0, 0, 68, 0, 68, 12, 0, 12], f: '1000' };
  const run = (roadAt) => { const m = mkSinks(), seen = {}; const R = buildBuildings({ map: { buildings: [nine] }, solids: m.S, heightAt: () => 0, plus: true, roadAt, dress: (c) => { seen.A = c.A; dressBuilding(c); } }); return { ...m, R, A: seen.A }; };
  const free = run(null), tight = run(roadAt);
  const reach = (m) => Math.max(...m.solids.filter((s) => s.poly && s.y0 < 4).flatMap((s) => s.poly.filter((v, i) => i % 2)));
  ok(free.A.entr[0].kind === 'N' && reach(free) > 13.8, `a nine-storey porch reaches ${(reach(free) - 12).toFixed(2)} m out of the wall`);
  ok(reach(tight) < 13.4 && reach(tight) > 12.9 && stairQuads(tight.R) === stairQuads(free.R), `with a driveway 1.65 m off the wall it is a plain door under a small canopy instead (${(reach(tight) - 12).toFixed(2)} m), the stair column stays`);
  const hill = mkSinks(), Rh = buildBuildings({ map: { buildings: [nine] }, solids: hill.S, heightAt: (x, z) => (z > 12.5 ? -4 : 0), plus: true, dress: dressBuilding });
  ok([...Rh.tiles.values()].every((t) => { const P = t.near.v ? t.near.build({ part: true }).attributes.position.array : []; for (let i = 0; i < P.length; i += 3) if (P[i + 2] > 12.9 && P[i + 1] < 3.5) return false; return true; }), 'no entrance where the ground drops a storey below the floor line (it would hang in the air)');
}

// ---- the old kit's shop porches keep off the carriageways too: a doorstep by a driveway, none on the asphalt
{
  const shop = { id: 6205, k: 'apt', lv: 5, p: [0, 0, 130, 0, 130, 12, 0, 12], f: '0020' }; // the z = 12 side is a main street front
  const run = (road) => {
    const m = mkSinks();
    buildBuildings({ map: { buildings: [shop] }, solids: m.S, heightAt: () => 0, roadAt: road ? roadIndex(roadSegs({ roads: [road] })) : null, dress: dressBuilding });
    return m.solids.filter((s) => s.kind === 'ledge' && s.flags === 2).map((s) => Math.max(...s.poly.filter((v, i) => i % 2)) - 12); // how far each porch reaches out of the wall
  };
  const free = run(null), drive = run({ p: [-10, 14, 140, 14], w: 2, c: 'service', k: 'm' }), tight = run({ p: [-10, 13.2, 140, 13.2], w: 2, c: 'service', k: 'm' });
  ok(free.length >= 3 && free.every((d) => Math.abs(d - 1.3) < 1e-6), `shop porches on a 130 m main-street front (${free.length}, landing 1.3 m deep and a step)`);
  ok(drive.length === free.length && drive.every((d) => Math.abs(d - 0.55) < 1e-6), 'with a driveway a metre off the wall each is a doorstep, 0.55 m deep');
  ok(tight.length === 0, 'with the asphalt at the wall there is none');
}

// ---- the real map: every planned entrance sits on its edge, the kit emits nothing broken, the budget holds
{
  const buildings = JSON.parse(readFileSync(new URL('../public/assets/cherkasy/map_buildings.json', import.meta.url)));
  const sample = buildings.filter((b, i) => (b.k === 'apt' || b.k === 'public' || b.k === 'indus') && i % 3 === 0);
  const { S, solids } = mkSinks(), off = mkSinks();
  buildBuildings({ map: { buildings: sample }, solids: off.S, heightAt: (x, z) => 80 + 5 * Math.sin(x * 0.004) * Math.cos(z * 0.003), dress: dressBuilding });
  let bad = 0, entr = 0, split = 0;
  const res = buildBuildings({ map: { buildings: sample }, solids: S, heightAt: (x, z) => 80 + 5 * Math.sin(x * 0.004) * Math.cos(z * 0.003), plus: true, dress: (c) => {
    for (const q of c.A.entr ?? []) {
      const a = c.outer[q.i], b = c.outer[(q.i + 1) % c.outer.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      entr++; if (q.split) split++;
      if (!(q.s - q.w / 2 > 0.4 && q.s + q.w / 2 < L - 0.4) || !(q.w > 1.5)) bad++;
    }
    dressBuilding(c);
  } });
  ok(res.stats.dressErrors === 0 && res.stats.invalid === 0, 'the kit runs clean on the real map');
  ok(bad === 0 && entr > 1500, `planned entrances fit their walls (${entr}, ${bad} bad)`);
  ok(stairQuads(res) === split, `one stair column per entrance (${stairQuads(res)})`);
  let nv = 0, dv = 0, allFinite = true;
  for (const t of res.tiles.values()) { nv += t.near.v; dv += t.det.v; if (t.near.v && !finite(t.near.build({ part: true }).attributes.position.array)) allFinite = false; }
  ok(allFinite, 'near geometry finite');
  ok(nv / entr < 220, `near detail stays light: ${(nv / entr).toFixed(0)} vertices per entrance with AC units, dishes, benches and gates (${(nv / 1e3).toFixed(0)}k near, ${(dv / 1e3).toFixed(0)}k always drawn)`);
  ok(solids.length - off.solids.length < entr && solids.length > off.solids.length, `few new solids: porches, public stairs and canopies (${off.solids.length} -> ${solids.length} for ${entr} entrances)`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
