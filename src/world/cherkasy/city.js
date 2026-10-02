// Cherkasy (Ukraine) from OpenStreetMap: public/assets/cherkasy/map.json + map_buildings.json + dem.bin (compiled by
// tools/cherkasy/build_map.mjs; map data (c) OpenStreetMap contributors, ODbL). Frame: +x north-east (toward the
// Dnipro), +z south-east (down bul. Shevchenka), origin at Soborna square, y up, the river plane at WATER_Y.
//
//   buildCherkasy({ scene, renderer, onProgress?(fraction 0..1, text), params? }) -> Promise<world>
//     params: URLSearchParams (default location.search): notraffic, nopeds, blood (blood on pedestrian hits), coll (collision wireframe), cam=x,y,z,tx,ty,tz
//
// world (the shape legacy car.js and missions.js consume):
//   raycast(origin, dir, max?) -> { distance, point, normal, id, kind } | null        (static solids + terrain)
//   groundHeight(x, z, yHint?) -> y    highest support at / below yHint (terrain, roofs, decks); always finite
//   surfaceAt(x, z, yHint?) -> { y, id, kind, surface ('asphalt' | 'water' | 'ground' | 'solid') }
//   collideDynamic(pos, r, h) -> null | { push, normal, depth, grounded, groundY, vel }   traffic cars + wrecks, then the
//     moving sites' collide(pos, r, h) (yacht.js)
//   ram(q) -> { dv, push, hits, knocked, severity, trees?, people }
//     q: the player's box { x, y (bottom), z, fx, fz, hl, hw, h, v: Vector3, mass }; rams traffic / wrecks, snaps trees
//     (treebreak.js) and runs people over (people.hitBox) when |v| > 3 m/s
//   spawn, spawnYaw (on foot: the kerb across from the "pixel" tower on vul. Serzhanta Zhuzhomy), carSpawn, carSpawnYaw
//     (the right-hand lane next to it), viewpoints { street: { pos, target, subject } }
//   streetsAt(x, z) -> { type: 'street' | 'sidewalk' };  getZipPoints(center, radius, kinds?) -> [{x,y,z,nx,ny,nz,kind}]
//   setPlayer(pos, vel?)  feeds the traffic (else it polls window.__game.player);  alarm(pos, r)  people flee;
//   honk({ x, y, z, fx, fz })  the player's horn: people ahead dash off the car's line
//   life { traffic: sim, crowd: people }  (missions: sim.links / cars() / knock / makeMesh, people.spawnActor ...)
//   traffic (buildCherkasyTraffic api), people (npc/people.js api), trees, water, debris (npc/gibs.js), treeBreak
//   collision (the collision world: pushBox / pushCylinder / topAt / disable ...), geoDebug { enabled, update }
//   buildings: [{ min, max, id }], footprints: [{ poly, h, kind, name }], getMapFeatures() (minimap)
//   places: [{ id, kind ('sight' | 'ad'), name, note, icon, url, pitch, x, z, rings, door?, glow?(k) }]  map icons, highlighted
//     footprints (places.js); door / glow come from the hand-built partner site (restinn.js, tors.js, urban.js: a site's `partners`)
//     and feed game/partners.js
//   textures, materials { facade, detail, ground }, cherkasy { map, ground, hf, B, sites, setCam([x,y,z,tx,ty,tz] | null) }
//   bridgeLimit null, bridgeDeckY() null, propAnchors() / grabbables() [], grabProp() null, releaseProp()  (unused hooks)
//   update(dt, camera)   everything per frame (water, trees, LOD, landmarks, traffic, people, debris)
//   setQuality('low' | 'medium' | 'high')   what the graphics level draws (DETAIL below: tree / building / site / people /
//     traffic draw and shadow distances, the river mirror, facade window detail); live, 'high' = the full picture
//   stats() -> { loadMs, stages, solids, trees, traffic, people, ... }
// Oleg's hand-built sites (landmarks.js, pagorb.js, rosevalley.js, ... facadekit.js, billboards.js) are optional: each is loaded and
// called inside its own guard, so the city still builds if one is missing or throws. A site builder that reads `ground`
// must be listed in GROUND_SITES: the others run while the ground workers do, with `ground` still null.
import * as THREE from 'three';
import { loadCityTextures } from '../../kit/textures.js';
import { createFacadeMaterial } from '../facade.js';
import { createDetailMaterial } from '../materials.js';
import { createCollisionWorld, createCollisionDebug } from '../collision.js';
import { buildTrees } from '../trees.js';
import { buildWater, buildWetBands, buildPonds, waterNormalTexture } from '../water.js';
import { createGibs } from '../../npc/gibs.js';
import { createPeople } from '../../npc/people.js';
import { createHeightField, buildGroundAsync } from './ground.js';
import { buildCityBuildings } from './buildings.js';
import { treeSpots, footprintRaster } from './greenery.js';
import { createTreeBreaker } from './treebreak.js';
import { buildCherkasyTraffic } from './traffic.js';
import { loadTrafficVehicles } from '../../npc/vehicles.js';
import { ringPts, bboxOf } from './geo.js';
import { resolvePlaces } from './places.js';
import { createFarCull } from '../farcull.js';

// Oleg's site modules, resolved at build time; a file that does not exist yet is simply absent
const SITE_MODULES = import.meta.glob(['./landmarks.js', './frame.js', './restinn.js', './yalynka.js', './pagorb.js', './rosevalley.js',
  './restaurants.js', './beaches.js', './yachtclub.js', './embankment.js', './prystan.js', './dam.js', './zhuzhoma.js', './shore.js',
  './signs.js', './facadekit.js', './khimikiv.js', './druzhba.js', './billboards.js', './zamkova.js', './kobzar.js', './museum.js', './market.js', './wedding.js', './bohdan.js', './philharmonic.js', './bilyidim.js', './lotus.js', './station.js', './lovebridge.js',
  './simeinyi.js', './fitness34.js', './torhivli.js', './chnu.js', './chdtu.js', './bankinst.js', './khrcity.js', './blakytnyi.js', './nbu.js',
  './spartak.js', './pioner.js', './slavutych.js', './lyubava.js',
  './budivelnyk.js', './grandmarket.js', './epicentr.js', './dytlikarnya.js',
  './hoteldnipro.js', './dniproplaza.js', './depot.js', './politekhkoledzh.js',
  './podatkova.js', './school17.js', './kinoukraina.js', './chnu3.js',
  './miskrada.js', './poshtamt.js', './oblbiblioteka.js', './medakademia.js', './balloon.js', './yacht.js', './plane.js', './andriy.js', './boyan.js',
  './delikat.js', './atb.js', './mcdonalds.js', './tors.js', './urban.js', './su7.js', './overpass.js', './catcafe.js', './praska.js']);
async function loadSites() {
  const out = {};
  await Promise.all(Object.entries(SITE_MODULES).map(async ([path, load]) => {
    const name = path.slice(2, -3);
    try { out[name] = await load(); } catch (e) { console.error(`[cherkasy] ${name}.js failed to load`, e); }
  }));
  return out;
}
const guard = (label, fn, fallback = null) => { try { return fn() ?? fallback; } catch (e) { console.error(`[cherkasy] ${label} failed`, e); return fallback; } };
// the sites that read the ground (isWater / onAsphalt / its meshes): they wait for its workers, the others do not
const GROUND_SITES = new Set(['rosevalley', 'restaurants', 'beaches', 'yachtclub', 'embankment', 'prystan', 'station', 'lovebridge', 'overpass']);
// a macrotask turn (not a frame): lets worker messages in between synchronous builds
const nextTask = () => new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); res(); }; ch.port2.postMessage(0); });
const nextFrame = () => new Promise((res) => (typeof requestAnimationFrame === 'function' && !document.hidden ? requestAnimationFrame(() => res()) : setTimeout(res, 0)));

// What each graphics level draws (world.setQuality; the post chain, shadows and sky have their own tables). 'high' is
// every module's default; the lower levels shorten draw and shadow distances and simplify far detail, never the
// simulation, the collision or what missions use. Measured in the centre (M5 Pro, 1280x760): the sites are ~450-690 of
// ~800-1000 draw calls, the river mirror re-renders the scene (~550 calls a capture), trees 0.4-1 M triangles.
//   trees: LOD bands (trees.js setDetail); bld: roof-detail reach, roof / facade shadow reach (buildings.js);
//   sites: farcull.js (ratio: hidden under ratio x distance, shadow: no shadow beyond); people / traffic: [draw reach m,
//   LOD distance factor]; water: the river mirror (on, hz, scale); facade: window-detail distance divisor (facade.js)
const DETAIL = {
  high: { trees: {}, bld: {}, sites: {}, people: [300, 1], traffic: [700, 1], water: { on: true }, facade: 1 },
  medium: {
    trees: { nearOut: [55, 68], midOut: [220, 250], farOut: [1100, 1250], shadow: 110 },
    bld: { detailFar: 1800, detailShadow: 250, facadeShadow: 600 },
    sites: { ratio: 1 / 150, shadow: 450 }, people: [220, 0.85], traffic: [500, 0.85], water: { on: true, hz: 8, scale: 0.3 }, facade: 1.4,
  },
  low: {
    trees: { nearOut: [40, 50], midOut: [150, 175], farOut: [900, 1050], shadow: 60 },
    bld: { detailFar: 1100, detailShadow: 150, facadeShadow: 300 },
    sites: { ratio: 1 / 60, shadow: 200 }, people: [150, 0.7], traffic: [350, 0.7], water: { on: false }, facade: 2,
  },
};

// spawn: vul. Serzhanta Zhuzhomy, the far kerb across from tower No 4 (zhuzhoma.js), looking at it
const SPAWN = [886, 506], SPAWN_LOOK = [831, 530], CAR_DIR = [-0.55, -0.83];

export async function buildCherkasy({ scene, renderer, onProgress = null, params = new URLSearchParams(globalThis.location?.search ?? '') }) {
  const t0 = performance.now(), stages = {};
  let tPrev = t0;
  const stage = (name, f, text) => {
    const now = performance.now(); stages[name] = Math.round(now - tPrev); tPrev = now;
    onProgress?.(f, text);
  };
  onProgress?.(0.02, 'Завантажуємо карту Черкас…');
  if (!params.has('notraffic')) loadTrafficVehicles(); // the glb files download while the city builds (cached promise)
  const asset = (f) => fetch(`${import.meta.env?.BASE_URL ?? '/'}assets/cherkasy/${f}`);
  const [T, map, buildingsJson, demBuf, S] = await Promise.all([
    loadCityTextures(renderer),
    asset('map.json').then((r) => r.json()),
    asset('map_buildings.json').then((r) => r.json()),
    asset('dem.bin').then((r) => r.arrayBuffer()),
    loadSites(),
  ]);
  map.buildings = buildingsJson;
  stage('load', 0.12, 'Рельєф і вулиці…');

  const geo = guard('frame', () => S.frame?.FRAME_OF(map));
  const hf = createHeightField(map, new Int16Array(demBuf));
  if (S.rosevalley?.prepareRoseValley && geo) guard('Rose Valley prep', () => S.rosevalley.prepareRoseValley(map, geo)); // beach sand into the cover
  const HERO_SKIP = S.restinn?.HERO_SKIP ?? new Set();
  for (const b of map.buildings) if (HERO_SKIP.has(b.id)) hf.pad(ringPts(b.p), 30); // level the hero sites first
  if (S.landmarks?.levelStadium) guard('stadium terrain', () => S.landmarks.levelStadium(hf));
  if (S.zamkova?.shapeZamkova && geo) guard('Zamkova hora terrain', () => S.zamkova.shapeZamkova(hf, map, geo)); // the hilltop plateau, before ground + buildings
  if (S.museum?.shapeMuseum) guard('museum terrain', () => S.museum.shapeMuseum(hf, map)); // the podium's high (west) side
  if (S.philharmonic?.shapePhilharmonic) guard('Philharmonic terrain', () => S.philharmonic.shapePhilharmonic(hf, map)); // a level lot on Khreshchatyk
  if (S.bilyidim?.shapeBilyiDim) guard('Bilyi dim terrain', () => S.bilyidim.shapeBilyiDim(hf, map)); // level lot + forecourt
  if (S.khrcity?.shapeKhrCity) guard('Khreshchatyk City terrain', () => S.khrcity.shapeKhrCity(hf, map)); // the mall's courtyard, level
  if (S.podatkova?.shapePodatkova) guard('tax office terrain', () => S.podatkova.shapePodatkova(hf, map)); // lot, courtyard and plaza, level
  if (S.lotus?.shapeLotus && geo) guard('White Lotus terrain', () => S.lotus.shapeLotus(hf, map, geo)); // the bank behind the temple
  if (S.station?.levelStation) guard('station terrain', () => S.station.levelStation(hf)); // the station yard, level
  if (S.lovebridge?.shapeLoveBridge && geo) guard('Bridge of Lovers terrain', () => S.lovebridge.shapeLoveBridge(hf, map, geo)); // the ravine under the bridge, before ground + buildings
  if (S.dniproplaza?.shapeDniproPlaza) guard('Dnipro Plaza terrain', () => S.dniproplaza.shapeDniproPlaza(hf, map)); // the mall's lot and forecourt, level
  if (S.boyan?.levelBoyan && geo) guard('Boyan square terrain', () => S.boyan.levelBoyan(hf, map, geo)); // the square round the pool, level
  if (S.urban?.levelUrban) guard('URBAN terrain', () => S.urban.levelUrban(hf)); // the shop row's lot, level
  if (S.su7?.levelSu7 && geo) guard('Su-7 square terrain', () => S.su7.levelSu7(hf, map, geo)); // the square round the plinth, level
  if (S.overpass?.shapeOverpass && geo) guard('Dakhnivska overpass terrain', () => S.overpass.shapeOverpass(hf, map, geo)); // the cutting under the bridge
  const strip = guard('shore strip', () => { const s = S.shore?.shoreStrip?.(map); return s ? { A: s.A, B: s.B, y0: S.shore.STRIP.y0, y1: S.shore.STRIP.y1 } : null; });
  if (S.signs?.ukrainianSigns) T.signs = guard('signs', () => S.signs.ukrainianSigns()); // storefront bands in Ukrainian
  const facadeMat = createFacadeMaterial(T), detailMat = createDetailMaterial(T);
  const root = Object.assign(new THREE.Group(), { name: 'city' });
  scene.add(root);

  // the ground and the buildings build in workers side by side; the hand-built sites run here meanwhile
  const url = (f) => `${import.meta.env?.BASE_URL ?? '/'}assets/cherkasy/${f}`;
  const collision = createCollisionWorld({ cell: 24 });
  const zips = createZipStore();
  const skip = new Set();
  for (const [mod, key] of [['landmarks', 'LANDMARK_SKIP'], ['restinn', 'HERO_SKIP'], ['yalynka', 'TREE_SKIP'], ['restaurants', 'RESTAURANT_SKIP'],
    ['beaches', 'BEACH_SKIP'], ['yachtclub', 'YACHT_SKIP'], ['zhuzhoma', 'ZHU_SKIP'], ['khimikiv', 'KHIM_SKIP'], ['druzhba', 'DRUZHBA_SKIP'], ['kobzar', 'KOBZAR_SKIP'], ['museum', 'MUSEUM_SKIP'], ['market', 'MARKET_SKIP'], ['wedding', 'WEDDING_SKIP'], ['bohdan', 'BOHDAN_SKIP'], ['philharmonic', 'PHIL_SKIP'], ['bilyidim', 'BILYIDIM_SKIP'], ['lotus', 'LOTUS_SKIP'], ['station', 'STATION_SKIP'],
    ['simeinyi', 'SIMEINYI_SKIP'], ['fitness34', 'FIT34_SKIP'], ['torhivli', 'TORHIVLI_SKIP'], ['chnu', 'CHNU_SKIP'], ['chdtu', 'CHDTU_SKIP'], ['bankinst', 'BANK_SKIP'], ['khrcity', 'KHRCITY_SKIP'], ['blakytnyi', 'BLAKYTNYI_SKIP'], ['nbu', 'NBU_SKIP'],
    ['spartak', 'SPARTAK_SKIP'], ['pioner', 'PIONER_SKIP'], ['slavutych', 'SLAVUTYCH_SKIP'], ['lyubava', 'LYUBAVA_SKIP'],
    ['budivelnyk', 'BUD_SKIP'], ['grandmarket', 'GRANDMARKET_SKIP'], ['epicentr', 'EPICENTR_SKIP'], ['dytlikarnya', 'DYTLIK_SKIP'],
    ['hoteldnipro', 'HOTEL_SKIP'], ['dniproplaza', 'DP_SKIP'], ['depot', 'DEPOT_SKIP'], ['politekhkoledzh', 'POLITEKH_SKIP'],
    ['podatkova', 'PODATKOVA_SKIP'], ['school17', 'SCHOOL17_SKIP'], ['kinoukraina', 'KINO_SKIP'], ['chnu3', 'CHNU3_SKIP'],
    ['miskrada', 'MISKRADA_SKIP'], ['poshtamt', 'POSHTAMT_SKIP'], ['oblbiblioteka', 'OBLBIB_SKIP'], ['medakademia', 'MEDAKAD_SKIP'], ['andriy', 'ANDRIY_SKIP'], ['boyan', 'BOYAN_SKIP'],
    ['delikat', 'DELIKAT_SKIP'], ['atb', 'ATB_SKIP'], ['mcdonalds', 'MCDONALDS_SKIP'], ['urban', 'URBAN_SKIP'], ['su7', 'SU7_SKIP'], ['catcafe', 'CATCAFE_SKIP'], ['praska', 'PRASKA_SKIP']]) for (const id of S[mod]?.[key] ?? []) skip.add(id);
  let groundDone = false, bldF = 0;
  const report = () => onProgress?.(0.15 + 0.55 * (0.3 * (groundDone ? 1 : 0) + 0.7 * bldF), `Рельєф, вулиці, будинки… ${Math.round(100 * (0.3 * (groundDone ? 1 : 0) + 0.7 * bldF))}%`);
  const groundP = buildGroundAsync({ scene: root, T, map, hf, strip, renderer, mapUrl: url('map.json') }).then((g) => { groundDone = true; report(); return g; });
  const bldP = buildCityBuildings({ root, map, hf, solids: collision, zips, skip, facadeMat, detailMat, useWorkers: !params.has('noworkers'),
    onProgress: (f) => { bldF = f; report(); } });
  // landmarks, hero buildings and the hand-built sites ({ update?, clear?(x, z), spots?, footprints?, parked?, partners?, deckAt?(x, z), collide?(p, r, h) }). Those that
  // do not read `ground` build while its workers run (heightAt is the same height field), one per task so the worker
  // replies get through; the rest (GROUND_SITES) follow once it is in. The list order stays the order of `sites`.
  const base = { root, T, map, solids: collision, zips, heightAt: hf.heightAt, ground: null, geo, facadeMat, detailMat };
  const before = new Set(root.children); // what the sites add is theirs (farcull.js); the ground and buildings land meanwhile
  const landmarks = S.landmarks?.buildLandmarks ? guard('landmarks', () => S.landmarks.buildLandmarks(base), {}) : {};
  const yalynka = S.yalynka?.buildYalynka ? guard('yalynka', () => S.yalynka.buildYalynka(base), {}) : {};
  const hero = S.restinn?.buildRestInn ? guard('Rest Inn', () => S.restinn.buildRestInn(base), {}) : {};
  const list = [['Pagorb Slavy', 'pagorb', 'buildPagorb'], ['Rose Valley', 'rosevalley', 'buildRoseValley'], ['restaurants', 'restaurants', 'buildRestaurants'],
    ['beaches', 'beaches', 'buildBeaches'], ['yacht club', 'yachtclub', 'buildYachtClub'], ['embankment', 'embankment', 'buildEmbankment'],
    ['Stara Prystan', 'prystan', 'buildPrystan'], ['dam', 'dam', 'buildDam'], ['Zhuzhomy street', 'zhuzhoma', 'buildZhuzhoma'],
    ['Khimikiv 44', 'khimikiv', 'buildKhimikiv'], ['Druzhba narodiv', 'druzhba', 'buildDruzhba'], ['Zamkova hora', 'zamkova', 'buildZamkova'],
    ['billboards', 'billboards', 'buildBillboards'], ['Kobzar museum', 'kobzar', 'buildKobzar'], ['Local history museum', 'museum', 'buildMuseum'], ['Central market', 'market', 'buildMarket'], ['Wedding palace', 'wedding', 'buildWedding'], ['Bohdan Khmelnytsky monument', 'bohdan', 'buildBohdan'], ['Philharmonic', 'philharmonic', 'buildPhilharmonic'], ['Bilyi dim', 'bilyidim', 'buildBilyiDim'], ['White Lotus', 'lotus', 'buildLotus'], ['railway station', 'station', 'buildStation'], ['Bridge of Lovers', 'lovebridge', 'buildLoveBridge'],
    ['Simeinyi Lux', 'simeinyi', 'buildSimeinyi'], ['Fitness club 3-4', 'fitness34', 'buildFitness34'], ['Budynok torhivli', 'torhivli', 'buildTorhivli'],
    ['ChNU', 'chnu', 'buildChnu'], ['ChDTU', 'chdtu', 'buildChdtu'], ['Banking institute', 'bankinst', 'buildBankInst'],
    ['Khreshchatyk City', 'khrcity', 'buildKhrCity'], ['Blue Palace', 'blakytnyi', 'buildBlakytnyi'], ['National Bank', 'nbu', 'buildNbu'],
    ['Spartak', 'spartak', 'buildSpartak'], ['Pioneer', 'pioner', 'buildPioner'], ['Slavutych', 'slavutych', 'buildSlavutych'], ['Lyubava', 'lyubava', 'buildLyubava'],
    ['Budivelnyk sports palace', 'budivelnyk', 'buildBudivelnyk'], ['Grand Market', 'grandmarket', 'buildGrandMarket'], ['Epicentr', 'epicentr', 'buildEpicentr'], ["Children's hospital", 'dytlikarnya', 'buildDytlikarnya'],
    ['Hotel Dnipro', 'hoteldnipro', 'buildHotelDnipro'], ['Dnipro Plaza', 'dniproplaza', 'buildDniproPlaza'], ["DEPO't Center", 'depot', 'buildDepot'], ['Polytechnic college', 'politekhkoledzh', 'buildPolitekh'],
    ['Tax office', 'podatkova', 'buildPodatkova'], ['School 17', 'school17', 'buildSchool17'], ['Kino Ukraina', 'kinoukraina', 'buildKinoUkraina'], ['ChNU building 3', 'chnu3', 'buildChnu3'],
    ['City council', 'miskrada', 'buildMiskrada'], ['Head post office', 'poshtamt', 'buildPoshtamt'], ['Regional library', 'oblbiblioteka', 'buildOblBiblioteka'], ['Medical academy', 'medakademia', 'buildMedAkademia'],
    ['Balloon', 'balloon', 'buildBalloon'], ['Yacht', 'yacht', 'buildYacht'], ['Plane', 'plane', 'buildPlane'], ['St Andrew church', 'andriy', 'buildAndriy'], ['Boyan monument', 'boyan', 'buildBoyan'],
    ['Delikat on Blahovisna', 'delikat', 'buildDelikat'], ['ATB on Shevchenka 239', 'atb', 'buildAtb'], ["McDonald's", 'mcdonalds', 'buildMcDonalds'], ['Tors sign', 'tors', 'buildTors'], ['URBAN', 'urban', 'buildUrban'], ['Su-7 memorial', 'su7', 'buildSu7'],
    ['Dakhnivska overpass', 'overpass', 'buildOverpass'],
    ['CatCafe block', 'catcafe', 'buildCatCafe'], ['Flatiron on Dashkovycha 4', 'praska', 'buildPraska']];
  const built = list.map(() => null);
  const runSites = async (late) => {
    for (const [i, [label, mod, fn]] of list.entries()) {
      const f = S[mod]?.[fn];
      if (!f || GROUND_SITES.has(mod) !== late) continue;
      built[i] = guard(label, () => f(base));
      await nextTask();
    }
  };
  await runSites(false);
  waterNormalTexture(); // the shared ripple texture (cached) is pure arithmetic: made here, in the wait, not after it
  const ground = await groundP;
  const heightAt = ground.heightAt;
  collision.setTerrain({ height: ground.terrainHeight, surface: (x, z) => (ground.onAsphalt(x, z) ? 'asphalt' : ground.isWater(x, z) ? 'water' : 'ground'), minY: ground.band.minY, maxY: ground.band.maxY });
  stage('ground', 0.35, 'Пам’ятки і набережна…'); // this stage holds the early sites too, 'sites' only GROUND_SITES
  base.ground = ground;
  await runSites(true);
  const sites = built.filter(Boolean);
  const movers = sites.filter((s) => s.collide);
  stage('sites', 0.5, 'Будинки…');
  const Bld = await bldP;
  const B = Bld.B;
  const notSite = new Set([...before, ground.root, ...Bld.meshes]);
  const farCull = createFarCull(root.children.filter((o) => !notSite.has(o)));
  for (const s of sites) if (s.footprints) B.footprints.push(...s.footprints);
  // replaced OSM buildings keep their footprints (trees avoid them, the minimap draws them)
  const kept = new Set([...(S.landmarks?.LANDMARK_SKIP ?? []), ...HERO_SKIP, ...(S.restaurants?.RESTAURANT_SKIP ?? []), 1011542999]);
  for (const b of map.buildings) if (kept.has(b.id)) B.footprints.push({ poly: ringPts(b.p), h: HERO_SKIP.has(b.id) ? 17 : Math.max(8, (b.lv || 3) * 3.2), kind: b.k, name: b.name });
  stage('buildings', 0.72, 'Вода і дерева…');
  await nextFrame();

  // water: the reservoir surface, wet bands along the embankments, ponds on the plateau
  const water = buildWater({ scene: root, T, renderer, shoreDist: ground.shoreDist, skirtWater: (dx) => dx > 0.15 });
  const wet = buildWetBands({ scene: root, T, segs: ground.wetSegs, isWater: ground.isWater });
  const ponds = buildPonds({ scene: root, map, heightAt });

  // trees: generated spots + the sites' own plantings; trunks become switchable collision cylinders
  const occ = footprintRaster(B.footprints, map.region);
  const shore = strip && S.shore?.shoreStrip ? S.shore.shoreStrip(map) : null;
  const spots = treeSpots({ map, ground, footprints: B.footprints, occ, clear: [landmarks, ...sites].filter((s) => s.clear).map((s) => s.clear),
    extra: sites.flatMap((s) => s.spots ?? []), sparse: shore ? (x, z) => shore.lowK(x, heightAt(x, z), z) : null });
  // floorY: the lowest terrain (carved ravines included) bounds how far a tree shadow can fall
  const trees = buildTrees({ scene: root, T, spots, maxScale: 3.2, heightAt, floorY: hf.data.grid.reduce((m, h) => Math.min(m, h), Infinity) - 5 });
  const trunks = new Map();
  trees.addSolids((c) => { trunks.set(c.item, collision.cyl(c.x, c.z, c.y0, c.y1, c.r, c.r, 'tree')); });
  stage('trees', 0.78, 'Машини і люди…');
  await nextFrame();

  // street life: traffic on the carriageways, people on the pavements, shared debris (each isolated)
  const debris = createGibs(root, (x, z, y) => collision.groundHeight(x, z, y ?? 1e4), { blood: params.has('blood') });
  let traffic = null, people = null;
  if (!params.has('notraffic')) {
    // bridge lanes ride the hand-built decks (overpass.js deckAt), not the terrain under them
    const deckAt = (x, z) => { for (const s of sites) { const y = s.deckAt?.(x, z); if (y != null) return y; } return null; };
    try { traffic = await buildCherkasyTraffic({ scene: root, map, ground, deckAt }); } catch (e) { console.error('[cherkasy] traffic failed', e); }
  }
  stage('traffic', 0.9, 'Люди…');
  if (!params.has('nopeds')) {
    people = guard('people', () => createPeople({ scene: root, map, ground: { heightAt, onAsphalt: ground.onAsphalt, isWater: ground.isWater, isBuilding: (x, z) => occ.get(x, z) === 1 },
      buildings: map.buildings, traffic, gibs: debris }));
  }
  if (traffic) {
    traffic.attachSolids(collision, collision.groundHeight);
    traffic.sim.addParkingSpots(sites.flatMap((s) => s.parked ?? [])); // the sites' car parks get real, knockable cars
    traffic.sim.setDebris(debris);
    if (people) traffic.setPeds(people);
  }
  if (globalThis.window && people) window.__cherkasyPeds = people;
  const treeBreak = createTreeBreaker({ scene: root, trees, collision, trunks, debris });
  collision.finalize();
  const geoDebug = createCollisionDebug(root, collision);
  geoDebug.enabled = params.has('coll');
  stage('life', 0.96, 'Шейдери…');

  // ---- spawn points
  const free = (x, z) => !ground.onAsphalt(x, z) && collision.topAt(x, z).id < 0;
  const spawn = new THREE.Vector3(SPAWN[0], 0, SPAWN[1]);
  const found = spiralFind(SPAWN[0], SPAWN[1], 2, 40, 8, free);
  if (found) spawn.set(found[0], 0, found[1]);
  spawn.y = collision.groundHeight(spawn.x, spawn.z);
  const spawnYaw = Math.atan2(SPAWN_LOOK[0] - spawn.x, SPAWN_LOOK[1] - spawn.z); // yaw 0 faces +z
  const car = carSpot(map, ground, collision, spawn);
  const carSpawn = car ? new THREE.Vector3(car.x, collision.groundHeight(car.x, car.z), car.z) : spawn.clone();
  const carSpawnYaw = car ? car.yaw : spawnYaw;

  let forced = params.get('cam') ? params.get('cam').split(',').map(Number) : null;
  const eye = spawn.clone().add(new THREE.Vector3(0, 1.7, 6)), aim = spawn.clone().add(new THREE.Vector3(0, 8, -200));
  const viewpoints = { street: { pos: eye, target: aim, subject: spawn.clone() } };
  const ramZero = () => ({ dv: new THREE.Vector3(), push: new THREE.Vector3(), hits: 0, knocked: 0, severity: 0 });
  let lifeErr = false;
  const camPos = new THREE.Vector3();

  const world = {
    raycast: (o, d, max) => collision.raycast(o, d, max),
    groundHeight: (x, z, yHint) => collision.groundHeight(x, z, yHint),
    surfaceAt: (x, z, yHint) => collision.surfaceAt(x, z, yHint),
    spawn, spawnYaw, carSpawn, carSpawnYaw, viewpoints,
    // traffic first, then the moving sites (the yacht): the static solids grid cannot hold a body that keeps moving
    collideDynamic: traffic || movers.length ? (p, r, h) => traffic?.collideDynamic(p, r, h) ?? movers.reduce((hit, s) => hit ?? s.collide(p, r, h), null) : null,
    ram(q) {
      const r = traffic?.sim?.ram ? traffic.sim.ram(q) : ramZero();
      const tb = treeBreak.hit(q);
      if (tb.n) { r.dv.x -= q.v.x * (1 - tb.keep); r.dv.z -= q.v.z * (1 - tb.keep); r.trees = tb.n; r.severity = Math.max(r.severity, 0.35); }
      // a car standing next to someone never runs them over
      r.people = people?.hitBox && Math.hypot(q.v.x, q.v.y, q.v.z) > 3
        ? people.hitBox({ x: q.x, z: q.z, fx: q.fx, fz: q.fz, hl: q.hl, hw: q.hw, y0: q.y, y1: q.y + q.h, vx: q.v.x, vy: q.v.y, vz: q.v.z }) : 0;
      return r;
    },
    streetsAt: (x, z) => ({ type: ground.onAsphalt(x, z) ? 'street' : 'sidewalk' }),
    getZipPoints: zips.query,
    setPlayer: (pos, vel) => traffic?.setPlayer(pos, vel),
    alarm: (pos, r) => people?.alarm?.(pos, r),
    honk: (q) => people?.honk?.(q),
    life: { traffic: traffic?.sim ?? null, crowd: people },
    traffic, people, trees, water, debris, treeBreak, collision, geoDebug,
    bridgeLimit: null, bridgeDeckY: () => null,
    propAnchors: () => [], grabbables: () => [], grabProp: () => null, releaseProp: () => {},
    buildings: B.boxes, footprints: B.footprints,
    getMapFeatures: () => mapFeatures(map, B),
    places: guard('places', () => { // + the hand-built door / glow (Rest Inn, and any site that returns `partners`)
      const partners = Object.assign({}, ...sites.map((x) => x.partners), hero.partners);
      return resolvePlaces(map, geo).map((q) => Object.assign(q, partners[q.id]));
    }, []),
    textures: T, materials: { facade: facadeMat, detail: detailMat, ground: ground.root.children[0]?.material ?? null },
    cherkasy: { map, ground, hf, B, sites, landmarks, setCam: (c) => { forced = c; } },
    update(dt, camera) {
      water.update(dt, camera); wet.update?.(dt); ponds.update?.(dt);
      if (!camera) return;
      if (forced) { camera.position.fromArray(forced); camera.lookAt(...forced.slice(3, 6)); }
      camPos.copy(camera.position);
      Bld.update(camPos);
      trees.update(dt, camPos, camera); // the camera lets trees skip what cannot reach the image
      geoDebug.update(camera);
      landmarks.update?.(dt, camera); hero.update?.(dt, camera); yalynka.update?.(dt, camera);
      for (const s of sites) s.update?.(dt, camera);
      farCull.update(camPos);
      debris.update(dt); treeBreak.update(dt);
      try { traffic?.update(dt, camera); people?.update(dt, camera); } catch (e) { if (!lifeErr) { lifeErr = true; console.error('[cherkasy] life update failed', e); } }
    },
    // the graphics level ('low' | 'medium' | 'high'), live: see DETAIL
    setQuality(q) {
      const D = DETAIL[q] || DETAIL.high;
      trees.setDetail(D.trees); Bld.setDetail(D.bld); farCull.set(D.sites); facadeMat.setDetail(D.facade);
      people?.setDrawDistance(...D.people); traffic?.sim?.setDrawDistance(...D.traffic);
      water.setReflection(D.water.on, D.water);
    },
    stats: () => ({ loadMs: world.loadMs, stages, solids: collision.count, zips: zips.count, buildings: Bld.stats(), ground: ground.stats, trees: trees.stats(),
      spots: spots.stats, farCull: farCull.stats(), traffic: traffic?.stats() ?? null, people: people?.stats?.() ?? null, treeBreak: treeBreak.stats(), sites: sites.length, modules: Object.keys(S) }),
  };
  world.loadMs = Math.round(performance.now() - t0);
  console.log(`[cherkasy] built in ${world.loadMs} ms: ${B.footprints.length} buildings, ${collision.count} solids, ${spots.length} trees, ${sites.length} sites | ${Object.entries(stages).map(([k, v]) => k + ' ' + v).join(', ')}`);
  return world;
}

// the car starts on the carriageway next to the spawn: nearest wide asphalt, the right-hand lane of the closest
// motor road, heading the way closest to CAR_DIR
function carSpot(map, ground, collision, spawn) {
  const A = (x, z) => ground.onAsphalt(x, z);
  const wide = (x, z) => [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([u, w]) => A(x + u, z + w)) && collision.topAt(x, z).id < 0;
  const best = spiralFind(spawn.x, spawn.z, 1, 30, 16, wide);
  if (!best) return null;
  let bd = Infinity, dir = CAR_DIR, foot = null;
  for (const rd of map.roads) {
    if (rd.k !== 'm') continue;
    for (let i = 2; i + 1 < rd.p.length; i += 2) {
      const ax = rd.p[i - 2], az = rd.p[i - 1], ex = rd.p[i] - ax, ez = rd.p[i + 1] - az, L2 = ex * ex + ez * ez;
      if (L2 < 1) continue;
      let f = ((best[0] - ax) * ex + (best[1] - az) * ez) / L2;
      f = f > 1 ? 1 : f < 0 ? 0 : f;
      const px = ax + f * ex, pz = az + f * ez, d = Math.hypot(best[0] - px, best[1] - pz);
      if (d >= bd) continue;
      bd = d; foot = [px, pz];
      const L = Math.sqrt(L2), sg = ex * CAR_DIR[0] + ez * CAR_DIR[1] < 0 ? -1 : 1;
      dir = [sg * ex / L, sg * ez / L];
    }
  }
  const at = foot && bd < 12 ? [foot[0] - dir[1] * 1.9, foot[1] + dir[0] * 1.9] : best; // 1.9 m right of the centreline
  return { x: at[0], z: at[1], yaw: Math.atan2(dir[0], dir[1]) };
}

// first point passing test(x, z) on rings of `count` points around (cx, cz), ring k at radius k * step (ring 0 = the centre)
function spiralFind(cx, cz, step, rings, count, test) {
  for (let k = 0; k < rings; k++) {
    const r = k * step;
    for (let m = 0; m < count; m++) {
      const x = cx + r * Math.cos(2 * Math.PI * m / count), z = cz + r * Math.sin(2 * Math.PI * m / count);
      if (test(x, z)) return [x, z];
    }
  }
  return null;
}

// anchor points for the legacy zip / grab mechanics: points and sampled edges in 32 m buckets
function createZipStore() {
  const C = 32, cells = new Map(), key = (i, j) => i * 65536 + j;
  let count = 0;
  const add = (x, y, z, nx = 0, ny = 1, nz = 0, kind = 'point') => {
    if (![x, y, z].every(Number.isFinite)) return;
    const k = key(Math.floor(x / C), Math.floor(z / C));
    (cells.get(k) ?? cells.set(k, []).get(k)).push({ x, y, z, nx, ny, nz, kind });
    count++;
  };
  return {
    add,
    edge(ax, az, bx, bz, y, nx, nz, kind = 'roofEdge', step = 4) {
      // evenly spaced samples, both ends included, about `step` apart
      const pieces = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step)), dx = (bx - ax) / pieces, dz = (bz - az) / pieces;
      for (let x = ax, z = az, left = pieces; left >= 0; left--, x += dx, z += dz) add(x, y, z, nx, 0, nz, kind);
    },
    query(c, r, kinds = null) {
      const out = [];
      for (let i = Math.floor((c.x - r) / C); i <= Math.floor((c.x + r) / C); i++) {
        for (let j = Math.floor((c.z - r) / C); j <= Math.floor((c.z + r) / C); j++) {
          for (const p of cells.get(key(i, j)) ?? []) {
            if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2 <= r * r && (!kinds || kinds.includes(p.kind))) out.push(p);
          }
        }
      }
      return out;
    },
    get count() { return count; },
  };
}

// minimap / map-menu features
function mapFeatures(map, B) {
  const R = map.region, rings = (list) => list.map((r) => ringPts(r[0]));
  return {
    bounds: { x0: R.x0 - 150, z0: R.z0 - 150, x1: R.x1 + 150, z1: R.z1 + 150, free: true },
    land: rings(map.land), farLand: [],
    blocks: map.land.map((r) => ({ poly: ringPts(r[0]), holes: r.slice(1).map(ringPts) })), // land minus the carriageways (even-odd)
    buildings: B.footprints.filter((f) => f.kind !== 'shed').map((f) => ({ ...bboxOf(f.poly), h: f.h, kind: f.kind, poly: f.poly })),
    streets: [], water: rings(map.water),
    parks: rings([...(map.cover.park ?? []), ...(map.cover.forest ?? [])]),
    parkWater: [], avenueNames: [], inPark: () => false, extent: 20000,
  };
}
