// The phone page's 3D peek (mapview.js): a sight or an improved object with a hand-built model (SITES) is built on
// its own by the same module the game uses, cropped to a disc round it and shown in 3D over the map. The model rises
// out of its footprint on that disc of the map's own tiles, draped on the real terrain, with the OSM neighbours as a
// plain white massing model. One finger turns it, two zoom. Nothing heavy loads before the first open: three.js, the
// textures, dem.bin and the site module come in then. Each close disposes the site; the renderer, the textures and the
// height data stay for the next one. The game never imports this file.
//   createPeek({ container, map, painter, geo }) -> { has(place), open(place) -> Promise, close(), isOpen, view, tick(n, dt) }
//     has: the place has a model here; open: builds it (a spinner meanwhile) and shows it, close: back to the map;
//     tick: steps the open view n frames by hand (scripted checks, a hidden tab); view: its scene, camera, controls (debugging)
import { track } from '../analytics.js';

// place id -> [site module, builder, terrain hook?]: the builders and hooks city.js calls (the hook runs on a fresh
// height field before the build, as in the city)
const LM = ['landmarks', 'buildLandmarks', 'levelStadium'];
const SITES = {
  mykhailo: LM, tvtower: LM, chimney: LM, arena: LM, rivport: LM, hyperboloid: LM,
  andriy: ['andriy', 'buildAndriy'], druzhba: ['druzhba', 'buildDruzhba'], pagorb: ['pagorb', 'buildPagorb'],
  roses: ['rosevalley', 'buildRoseValley'], zamkova: ['zamkova', 'buildZamkova', 'shapeZamkova'], yalynka: ['yalynka', 'buildYalynka'],
  embankment: ['embankment', 'buildEmbankment'], sosnivka: ['beaches', 'buildBeaches'], kazbet: ['beaches', 'buildBeaches'],
  mytnbeach: ['beaches', 'buildBeaches'], kobzar: ['kobzar', 'buildKobzar'], museum: ['museum', 'buildMuseum', 'shapeMuseum'],
  market: ['market', 'buildMarket'], wedding: ['wedding', 'buildWedding'], bohdan: ['bohdan', 'buildBohdan'],
  boyan: ['boyan', 'buildBoyan', 'levelBoyan'], su7: ['su7', 'buildSu7', 'levelSu7'], philharmonic: ['philharmonic', 'buildPhilharmonic', 'shapePhilharmonic'],
  bilyidim: ['bilyidim', 'buildBilyiDim', 'shapeBilyiDim'], lotus: ['lotus', 'buildLotus', 'shapeLotus'],
  station: ['station', 'buildStation', 'levelStation'], lovebridge: ['lovebridge', 'buildLoveBridge', 'shapeLoveBridge'], bridge: ['dam', 'buildDam'],
  khimikiv44: ['khimikiv', 'buildKhimikiv'], khrcity: ['khrcity', 'buildKhrCity', 'shapeKhrCity'], blakytnyi: ['blakytnyi', 'buildBlakytnyi'], nbu: ['nbu', 'buildNbu'], spartak: ['spartak', 'buildSpartak'],
  pioner: ['pioner', 'buildPioner'], slavutych: ['slavutych', 'buildSlavutych'], lyubava: ['lyubava', 'buildLyubava'],
  budivelnyk: ['budivelnyk', 'buildBudivelnyk'], grandmarket: ['grandmarket', 'buildGrandMarket'], epicentr: ['epicentr', 'buildEpicentr'],
  dytlikarnya: ['dytlikarnya', 'buildDytlikarnya'], hoteldnipro: ['hoteldnipro', 'buildHotelDnipro'],
  dniproplaza: ['dniproplaza', 'buildDniproPlaza', 'shapeDniproPlaza'], depot: ['depot', 'buildDepot'],
  politekhkoledzh: ['politekhkoledzh', 'buildPolitekh'], podatkova: ['podatkova', 'buildPodatkova', 'shapePodatkova'],
  school17: ['school17', 'buildSchool17'], kinoukraina: ['kinoukraina', 'buildKinoUkraina'], chnu3: ['chnu3', 'buildChnu3'],
  pixel: ['zhuzhoma', 'buildZhuzhoma'], miskrada: ['miskrada', 'buildMiskrada'], poshtamt: ['poshtamt', 'buildPoshtamt'],
  oblbiblioteka: ['oblbiblioteka', 'buildOblBiblioteka'], medakademia: ['medakademia', 'buildMedAkademia'],
  mcdonalds: ['mcdonalds', 'buildMcDonalds'], delikat: ['delikat', 'buildDelikat'], atb239: ['atb', 'buildAtb'], atb26: ['atb26', 'buildAtb26'], school7: ['school7', 'buildSchool7'],
  catcafe: ['catcafe', 'buildCatCafe'], praska: ['praska', 'buildPraska'],
  delikat399: ['delikat399', 'buildDelikat399'], rotunda397: ['glassrotunda', 'buildGlassRotunda'],
  ekvator: ['ekvator', 'buildEkvator', 'levelEkvator'], sportlife: ['sportlife', 'buildSportLife'],
  gerb: ['gerb', 'buildGerb'],
  zamkpark: ['zamkovapark', 'buildZamkovaPark', 'peekZamkovaPark'], kupershtein: ['zamkovapark', 'buildZamkovaPark', 'peekZamkovaPark'],
  perlyna: ['perlyna', 'buildPerlyna', 'levelPerlyna'],
  avrora: ['avrora', 'buildAvrora'],
  sviatotroitskyi: ['sviatotroitskyi', 'buildSviatotroitskyi'],
  hd34: ['hd34', 'buildHd34'],
  hrafskyi: ['hrafskyi', 'buildHrafskyi'],
  onix: ['onix', 'buildOnix', 'levelOnix'],
  pasterivskyi: ['pasterivskyi', 'buildPasterivskyi'],
  ekohouse: ['ekohouse', 'buildEkohouse', 'levelEkohouse'],
  voldim: ['voldim', 'buildVoldim'],
  ridnyidim: ['ridnyidim', 'buildRidnyiDim'],
  shev22: ['shev22', 'buildShev22'],
  premierbay: ['premierbay', 'buildPremierBay', 'levelPremierBay'],
  olimp: ['olimp', 'buildOlimp'],
  harmony: ['harmony', 'buildHarmony', 'levelHarmony'],
  comfortpark: ['comfortpark', 'buildComfortPark', 'levelComfortPark'],
  olimpmodern: ['olimpmodern', 'buildOlimpModern'],
  hoholia204: ['hoholia204', 'buildHoholia204'],
  smilianska48: ['smilianska', 'buildSmilianska'], smilianska52: ['smilianska', 'buildSmilianska'],
  pryportova: ['pryportova', 'buildPryportova'],
  narbutivska10: ['narbutivska10', 'buildNarbutivska10'],
  parkovyi: ['parkovyi', 'buildParkovyi'],
  shev184: ['shev184', 'buildShev184'],
  zhktemp: ['zhktemp', 'buildZhkTemp'],
  ambrosa35: ['ambrosa35', 'buildAmbrosa35'],
  nadpilna249: ['nadpilna249', 'buildNadpilna249'],
  taraskova5: ['taraskova5', 'buildTaraskova5'],
  chnudorms: ['chnudorms', 'buildChnuDorms'],
  lunashops: ['lunashops', 'buildLunaShops'],
  smil117: ['smil117', 'buildSmil117'], smil119: ['smil117', 'buildSmil117'],
  drama: ['drama', 'buildDrama', 'levelDrama'], shevchenko: ['drama', 'buildDrama', 'levelDrama'],
  rosava: ['rosava', 'buildRosava'], varenyk: ['rosava', 'buildRosava'], pronya: ['pronya', 'buildPronya'],
  maiboroda: ['maiboroda', 'buildMaiboroda'], simonenko: ['simonenko', 'buildSimonenko'],
};
const MODULES = import.meta.glob('../world/cherkasy/*.js'); // lazy: a module's chunk loads on its first peek
const MIN_R = 45, MAX_R = 170, POINT_R = 90; // crop radius round the place, m (POINT_R: a place on a point, no footprint)
const RISE = 1.1, TILT = 1.6;   // the rise out of the map and the camera's tilt from straight down, s

const HTML = `
  <canvas class="pk-canvas"></canvas>
  <div class="pk-head"><span class="pk-icon"></span><div><b class="pk-name"></b><span class="pk-note"></span></div>
    <button class="pk-close" aria-label="Закрити">✕</button></div>
  <div class="pk-wait"><i></i><span>Будуємо 3D-модель…</span></div>
  <div class="pk-hint">один палець – обертати · два – наблизити</div>`;

export function createPeek({ container, map, painter, geo }) {
  const doc = container.ownerDocument;
  const ui = doc.createElement('div');
  ui.className = 'peek off';
  ui.innerHTML = HTML;
  container.appendChild(ui);
  const $ = (q) => ui.querySelector(q);
  const cv = $('.pk-canvas');
  let core = null, isOpen = false, view = null, seq = 0, raf = 0;

  // three.js, the renderer, the textures and the DEM: once, on the first open
  const loadCore = () => core ??= (async () => {
    const [THREE, { OrbitControls }, { RoomEnvironment }, { mergeGeometries }, tex, facade, mats, ground, coll, { enuToWorld }, dem] = await Promise.all([
      import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/utils/BufferGeometryUtils.js'), import('../kit/textures.js'), import('../world/facade.js'),
      import('../world/materials.js'), import('../world/cherkasy/ground.js'), import('../world/collision.js'),
      import('../render/daylight.js'),
      fetch(`${import.meta.env?.BASE_URL ?? '/'}assets/cherkasy/dem.bin`).then((r) => r.arrayBuffer()).then((b) => new Int16Array(b)),
    ]);
    // a plain depth buffer (one small scene; decalBias in the sites reads which one it is); no post chain here, so AA and
    // tone mapping are the renderer's
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' });
    Object.assign(renderer, { toneMapping: THREE.NeutralToneMapping, outputColorSpace: THREE.SRGBColorSpace });
    Object.assign(renderer.shadowMap, { enabled: true, type: THREE.PCFShadowMap, autoUpdate: false });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const T = await tex.loadCityTextures(renderer);
    const shared = { facadeMat: facade.createFacadeMaterial(T), detailMat: mats.createDetailMaterial(T) };
    const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // the gilded domes need something to mirror
    const keep = new Set([shared.facadeMat, shared.detailMat, ...Object.values(T).filter((t) => t?.isTexture)]);
    const N = enuToWorld(0, 1, 0), heading = Math.atan2(-N.x, -N.z); // the camera's bearing that puts north up, as on the map
    return { THREE, OrbitControls, mergeGeometries, renderer, T, shared, env, keep, ground, coll, dem, heading };
  })().catch((e) => { core = null; throw e; }); // a dropped connection: the next open tries again

  const nextFrame = () => new Promise((r) => (doc.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));
  // the crop radius round the place: its footprints plus a margin (a site module can span a street or the whole city)
  function discRadius(place) {
    let r = 0;
    for (const ring of place.rings || []) for (let i = 0; i < ring.length; i += 2) r = Math.max(r, Math.hypot(ring[i] - place.x, ring[i + 1] - place.z));
    return r ? Math.min(MAX_R, Math.max(MIN_R, r + 30)) : POINT_R;
  }

  function size() {
    if (!view) return;
    const w = ui.clientWidth || 1, h = ui.clientHeight || 1;
    view.renderer.setSize(w, h, false);
    view.camera.aspect = w / h;
    // the whole model in frame across the narrower side (a phone held upright is narrow)
    view.dist = (view.span * 0.52) / (Math.tan((view.camera.fov * Math.PI) / 360) * Math.min(1, w / h));
    view.controls.maxDistance = Math.max(view.G * 1.6, view.dist * 1.6);
    view.camera.far = view.controls.maxDistance + view.G * 3; view.camera.updateProjectionMatrix();
  }
  const onResize = () => size();

  async function open(place) {
    const spec = SITES[place?.id];
    if (!spec || isOpen) return;
    isOpen = true;
    const my = ++seq;
    $('.pk-icon').textContent = place.icon || '🏛️';
    const generic = place.kind === 'improved' && place.name === 'Покращений об’єкт'; // no name of its own: the address leads
    $('.pk-name').textContent = generic ? (place.note || place.name) : place.name;
    $('.pk-note').textContent = generic ? place.name : place.note || '';
    ui.classList.remove('off', 'ready', 'failed');
    $('.pk-wait span').textContent = 'Будуємо 3D-модель…';
    track('peek3d', { place: place.id });
    try {
      const C = await loadCore();
      const mod = await MODULES[`../world/cherkasy/${spec[0]}.js`]?.();
      if (my !== seq) return; // closed meanwhile
      await nextFrame(); // the spinner gets a frame before the synchronous build
      const disc = await groundDisc(C, place.x, place.z, Math.max(discRadius(place) * 1.8, 140), my); // the map tiles come in over frames
      if (my !== seq) { disc.geometry.dispose(); disc.material.map.dispose(); disc.material.dispose(); return; } // closed meanwhile
      view = buildView(C, mod, spec, place, disc);
      size();
      ui.classList.add('ready');
      globalThis.addEventListener?.('resize', onResize);
      let last = performance.now();
      const frame = (now) => { if (!view) return; tickView(view, Math.min(0.1, (now - last) / 1000)); last = now; raf = requestAnimationFrame(frame); };
      raf = requestAnimationFrame(frame);
    } catch (e) {
      console.error('[peek3d]', place.id, e);
      if (my === seq) { ui.classList.add('failed'); $('.pk-wait span').textContent = 'Не вдалося показати модель на цьому пристрої'; }
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false; seq++;
    cancelAnimationFrame(raf);
    globalThis.removeEventListener?.('resize', onResize);
    ui.classList.add('off');
    if (view) { disposeView(view); view = null; }
  }
  $('.pk-close').addEventListener('click', close);
  globalThis.addEventListener?.('keydown', (e) => { if (isOpen && e.code === 'Escape') close(); });

  // ---------------------------------------------------------------- one site: build, crop, dress, frame
  function buildView(C, mod, [, fn, hook], place, disc) {
    const { THREE } = C;
    const hf = C.ground.createHeightField(map, C.dem);
    if (hook && mod[hook]) try { mod[hook](hf, map, geo); } catch (e) { console.warn('[peek3d] terrain hook', e); }
    const heightAt = hf.heightAt;
    const scene = new THREE.Scene();
    scene.environment = C.env; scene.environmentIntensity = 0.55;
    const site = new THREE.Group();
    const zips = { add() {}, edge() {}, query: () => [], count: 0 }; // nothing climbs here
    // no ground mesh here: the sites ask it `ground.isWater?.()` / `onAsphalt?.()`, and an empty one says no
    const built = mod[fn]({ root: site, T: C.T, map, solids: C.coll.createCollisionWorld({ cell: 24 }), zips, heightAt, ground: {}, geo, ...C.shared }) || {};

    const cx = place.x, cz = place.z, R = discRadius(place);
    crop(THREE, site, cx, cz, R);
    const box = new THREE.Box3().setFromObject(site)
      .intersect(new THREE.Box3(new THREE.Vector3(cx - R, -1e4, cz - R), new THREE.Vector3(cx + R, 1e4, cz + R)));
    if (box.isEmpty()) throw new Error('nothing built near the place');

    // the rise: everything that stands on the ground scales up from its base
    const y0 = heightAt(cx, cz);
    const pivot = new THREE.Group(); pivot.position.y = y0;
    const lift = new THREE.Group(); lift.position.y = -y0;
    pivot.add(lift); lift.add(site);
    const G = Math.max(R * 1.8, 140);
    const skip = new Set(Object.entries(mod).filter(([k, v]) => k.endsWith('_SKIP') && v instanceof Set).flatMap(([, v]) => [...v]));
    const blocks = neighbours(C, cx, cz, Math.min(G * 0.9, R + 20), heightAt, skip, place); // the next door only: further out they loom in front
    if (blocks) lift.add(blocks);
    drape(C, disc, cx, cz, G, heightAt);
    scene.add(pivot, disc);
    site.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // light: a warm sun from the side of the opening view (its shadows fall where the camera sees them), one static
    // shadow map over the disc, a sky fill
    scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x4d4636, 1.1));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6), sa = C.heading + 0.5 + 1.9;
    sun.position.set(cx + G * Math.sin(sa), y0 + G * 1.05, cz + G * Math.cos(sa)); sun.target.position.set(cx, y0, cz);
    Object.assign(sun.shadow.camera, { left: -G, right: G, top: G, bottom: -G, near: 1, far: G * 4 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.castShadow = true;
    scene.add(sun, sun.target);

    // camera: straight down over the place like the map, then it tilts while the model rises; then the fingers have it
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const span = Math.max(sz.x, sz.z, sz.y * 1.3, 30);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, G * 8);
    const target = new THREE.Vector3(c.x, y0 + Math.min(sz.y, span) * 0.3, c.z);
    const controls = new C.OrbitControls(camera, cv);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: span * 0.35, maxDistance: G * 1.6,
      maxPolarAngle: 1.45, autoRotateSpeed: 0.7, enabled: false });
    controls.target.copy(target);
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    return { C, scene, camera, controls, renderer: C.renderer, built, pivot, sun, t: 0, span, dist: span * 1.6, G, target, heading: C.heading, shadowsLeft: 3 };
  }

  function tickView(v, dt) {
    v.t += dt;
    const k = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
    const rise = k(v.t / RISE), tilt = k((v.t - 0.15) / TILT);
    v.pivot.scale.y = 0.02 + 0.98 * rise;
    if (v.t < 0.15 + TILT) { // the scripted tilt: from overhead, north up like the map, down to ~60° off vertical, swinging a little
      const phi = 0.02 + 1.02 * tilt, th = v.heading + 0.5 * tilt, d = v.dist * (1.25 - 0.25 * tilt);
      v.camera.position.set(v.target.x + d * Math.sin(phi) * Math.sin(th), v.target.y + d * Math.cos(phi), v.target.z + d * Math.sin(phi) * Math.cos(th));
      v.camera.lookAt(v.target);
    } else if (!v.controls.enabled) { v.controls.enabled = true; v.controls.autoRotate = true; }
    if (v.controls.enabled) v.controls.update(dt);
    if (rise < 1 || v.shadowsLeft-- > 0) v.renderer.shadowMap.needsUpdate = true;
    try { v.built.update?.(dt, v.camera); } catch { /* a site's animation is a bonus */ }
    v.renderer.render(v.scene, v.camera);
  }

  function disposeView(v) {
    v.controls.dispose();
    v.scene.traverse((o) => {
      o.geometry?.dispose?.();
      for (const m of [].concat(o.material || [])) {
        if (v.C.keep.has(m)) continue;
        for (const t of Object.values(m)) if (t?.isTexture && !v.C.keep.has(t)) t.dispose();
        m.dispose();
      }
    });
    v.sun.shadow.map?.dispose();
    v.renderer.renderLists.dispose();
    v.renderer.clear();
  }

  // ---------------------------------------------------------------- helpers
  // keeps what is within R of the place: whole meshes inside, triangles of the big merged ones that reach out, the
  // instances inside; the rest leaves the scene (and the GPU never sees it)
  function crop(THREE, root, cx, cz, R) {
    root.updateMatrixWorld(true);
    const drop = [], m4 = new THREE.Matrix4(), p = new THREE.Vector3(), b = new THREE.Box3(), col = new THREE.Color();
    const near = (x, z, r = R) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r;
    root.traverse((o) => {
      const g = o.geometry;
      if (!g?.attributes?.position) return;
      if (o.isInstancedMesh) {
        let n = 0;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld);
          if (!near(p.x, p.z, R * 1.1)) continue;
          if (n !== i) { o.setMatrixAt(n, m4); if (o.instanceColor) o.setColorAt(n, col.fromArray(o.instanceColor.array, i * 3)); }
          n++;
        }
        if (!n) drop.push(o); else { o.count = n; o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; o.computeBoundingBox?.(); o.computeBoundingSphere?.(); }
        return;
      }
      if (!g.boundingBox) g.computeBoundingBox();
      b.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
      const dx = Math.max(b.min.x - cx, 0, cx - b.max.x), dz = Math.max(b.min.z - cz, 0, cz - b.max.z);
      if (dx * dx + dz * dz > R * R) { drop.push(o); return; }
      const reach = Math.max(b.max.x - cx, cx - b.min.x, b.max.z - cz, cz - b.min.z);
      const plain = o.isMesh && !g.groups.length && !g.isInstancedBufferGeometry;
      if (reach > R * 3 && !plain) { drop.push(o); return; } // spans the city and cannot be cut here (the landmarks' blinking lights)
      if (reach > R * 1.4 && plain) { // a merged mesh that spans more than the disc: its triangles near the place
        const pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, keep = [], w = o.matrixWorld;
        const vi = (k) => (idx ? idx.getX(k) : k);
        for (let k = 0; k + 2 < n; k += 3) {
          const a = vi(k), bb = vi(k + 1), c = vi(k + 2);
          p.set((pos.getX(a) + pos.getX(bb) + pos.getX(c)) / 3, 0, (pos.getZ(a) + pos.getZ(bb) + pos.getZ(c)) / 3).applyMatrix4(w);
          if (near(p.x, p.z)) keep.push(a, bb, c);
        }
        if (!keep.length) { drop.push(o); return; }
        g.setIndex(keep); g.computeBoundingBox(); g.computeBoundingSphere();
      }
    });
    for (const o of drop) { o.removeFromParent(); o.geometry?.dispose?.(); }
  }

  // the neighbours as a white massing model: OSM footprints extruded to their storeys
  function neighbours(C, cx, cz, G, heightAt, skip, place) {
    const { THREE } = C, parts = [];
    const own = (x, z) => (place.rings || []).some((ring) => inRing(ring, x, z));
    for (const bd of map.buildings || []) {
      const P = bd.p;
      if (!P || P.length < 6 || skip.has(bd.id)) continue;
      let sx = 0, sz = 0, lo = Infinity;
      for (let i = 0; i < P.length; i += 2) { sx += P[i]; sz += P[i + 1]; }
      sx /= P.length / 2; sz /= P.length / 2;
      if ((sx - cx) ** 2 + (sz - cz) ** 2 > G * G || own(sx, sz)) continue;
      const shape = new THREE.Shape();
      for (let i = 0; i < P.length; i += 2) { (i ? shape.lineTo : shape.moveTo).call(shape, P[i], P[i + 1]); lo = Math.min(lo, heightAt(P[i], P[i + 1])); }
      const h = Math.max(3, (bd.lv || 2) * 3.1 + 0.8);
      const geo3 = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }); // shape y -> world z, extruded up after the turn
      geo3.rotateX(Math.PI / 2); geo3.translate(0, lo + h, 0);
      parts.push(geo3);
    }
    if (!parts.length) return null;
    const merged = C.mergeGeometries(parts);
    for (const g of parts) g.dispose();
    const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.95, side: THREE.DoubleSide }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  // the map's own tiles under the model, fading out at the rim: a flat plane first (its tiles painted a few ms a frame,
  // so the spinner keeps turning – the old blocking loop could hold a slow phone for seconds), draped on the terrain by
  // drape() once the site is built. Stops early when the peek closes (seq moved on).
  async function groundDisc(C, cx, cz, G, my) {
    const { THREE } = C, N = 112, PX = 1024, x0 = cx - G, z0 = cz - G, k = PX / (2 * G);
    const cvs = doc.createElement('canvas'); cvs.width = cvs.height = PX;
    const g = cvs.getContext('2d');
    const level = painter.levelFor(k), m = 2048 / 2 ** level;
    painter.frame();
    const tiles = [];
    for (let i = Math.floor(x0 / m); i <= Math.floor((x0 + 2 * G) / m); i++) for (let j = Math.floor(z0 / m); j <= Math.floor((z0 + 2 * G) / m); j++) tiles.push(painter.tile(level, i, j));
    for (let guard = 0; tiles.some((t) => !t.ready) && guard < 400 && my === seq; guard++) { for (const t of tiles) painter.want(t); painter.work(8); await nextFrame(); }
    for (const t of tiles) if (t.ready) g.drawImage(t.c, (t.i * m - x0) * k, (t.j * m - z0) * k, m * k, m * k);
    const fade = g.createRadialGradient(PX / 2, PX / 2, PX * 0.3, PX / 2, PX / 2, PX / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = fade; g.fillRect(0, 0, PX, PX);
    const tex = new THREE.CanvasTexture(cvs);
    Object.assign(tex, { colorSpace: THREE.SRGBColorSpace, anisotropy: 4 });
    const geo3 = new THREE.PlaneGeometry(2 * G, 2 * G, N, N);
    geo3.rotateX(-Math.PI / 2); // plane (x, -z) -> uv v runs with -z: the canvas' top row (z0) is v = 1
    const mesh = new THREE.Mesh(geo3, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false }));
    mesh.receiveShadow = true; mesh.renderOrder = -1;
    return mesh;
  }
  // the disc's vertices onto the (hooked) terrain, with the canvas' uv frame
  function drape(C, mesh, cx, cz, G, heightAt) {
    const geo3 = mesh.geometry, x0 = cx - G, z0 = cz - G;
    const pos = geo3.attributes.position, uv = geo3.attributes.uv, wy = C.ground.GY.WATER;
    for (let i = 0; i < pos.count; i++) {
      const x = cx + pos.getX(i), z = cz + pos.getZ(i);
      pos.setXYZ(i, x, Math.max(heightAt(x, z), wy) + 0.05, z);
      uv.setXY(i, (x - x0) / (2 * G), 1 - (z - z0) / (2 * G));
    }
    geo3.computeVertexNormals();
  }

  return { has: (p) => !!SITES[p?.id], open, close, get isOpen() { return isOpen; }, get view() { return view; },
    tick(n = 1, dt = 1 / 30) { for (let i = 0; view && i < n; i++) tickView(view, dt); return view ? { t: view.t, calls: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles } : null; } };
}

function inRing(r, x, z) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    if ((r[i + 1] > z) !== (r[j + 1] > z) && x < r[i] + (z - r[i + 1]) * (r[j] - r[i]) / (r[j + 1] - r[i + 1])) inside = !inside;
  }
  return inside;
}
