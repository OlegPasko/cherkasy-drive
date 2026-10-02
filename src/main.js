// Bootstrap: renderer, scene, camera, input, daylight, sky, shadows, post, and the frame loop that runs `systems`.
//
//   createCore({ container, quality?, preset?, far?, adaptive = false }) -> ctx   (no world; used by startGame and the demos)
//     ctx = { renderer, scene, camera, events, input, daylight, sky, shadows, post, systems, groundAt(x, z),
//             time, frame, quality, dt, adaptive (render/adaptive.js, fed real loop intervals; null unless asked),
//             addSystem(sys, name?, { always }?) -> remove()   sys: function(dt, ctx) or { update(dt, ctx) }; runs in insertion order
//             paused: while true only the `always` systems run and nothing renders (the canvas keeps its last frame)
//             setQuality('low' | 'medium' | 'high'), step(dt), start(), stop(), resize() }
//   startGame({ container, overlay? }) -> Promise<ctx>   the game page: world (Cherkasy, or the test world with ?testworld
//     or when src/world/cherkasy/city.js is absent), the car, HUD and missions as systems (car -> traffic player sync ->
//     world.update(dt, camera) -> missions -> partners -> explore -> audio -> perf -> hud). ctx gains { world, car, hud, missions, partners, explore, audio, perf }. M opens the city map
//     (hud.map), which pauses the game until it closes. The loading screen carries the consent card (ui/consent.js): the
//     loop starts once it is accepted, at once for a returning player. window.__game = ctx;
//     window.tick(n, dt = 1/60) steps n fixed frames with the real-time loop paused (ctx.start() resumes). ?paused
//     starts without the loop. In the city the car's last safe spot (on a street) is saved to localStorage every 10 s
//     and on page hide, and the next start spawns there; ?fresh ignores it and starts at the default spawn;
//     ?at=lat,lon[&road=street] (the Telegram bot's "look in the game" links) starts on the road beside that point.
//     The game runs the adaptive resolution (ctx.adaptive; ?noadapt turns it off); the perf pill waits for its floor.
//   World contract (legacy Cherkasy shape, see src/game/testworld.js for a complete small example): raycast(o, d, max),
//     groundHeight(x, z, yHint), surfaceAt, collision, spawn / spawnYaw, carSpawn / carSpawnYaw, streetsAt(x, z), ram(q),
//     collideDynamic(p, r, h), cherkasy.{ map, ground }, life.{ traffic, crowd }, mapFeatures | getMapFeatures(),
//     update(dt, camera), setQuality?(q) (what the world draws at each graphics level; called at start and on every change).
//
// Frame order: input.update -> daylight.update (+ city material uniforms) -> systems (world, car, camera...) -> sky -> shadows -> post.render.
// Sky and shadows run after the systems so they see the final camera; the shadow redraw is flagged after the sky's
// occasional environment capture so that capture cannot swallow the flag.
import * as THREE from 'three';
import { createRenderer, warmupShaders } from './render/renderer.js';
import { createPostProcessing } from './render/post.js';
import { createAdaptiveRes } from './render/adaptive.js';
import { createSky } from './render/sky.js';
import { createDaylight } from './render/daylight.js';
import { createShadows } from './render/shadows.js';
import { createInput } from './core/input.js';
import { createEvents } from './core/events.js';
import { cityUniforms, setNightFactor, setSkyColors } from './world/materials.js';
import { createCar } from './game/car/car.js';
import { createMissions } from './game/missions.js';
import { createPartners } from './game/partners.js';
import { createExplore } from './game/explore.js';
import { roadSpotNear } from './game/placeat.js';
import { worldXZ } from './ui/botlink.js';
import { createTestWorld } from './game/testworld.js';
import { createHud } from './ui/hud.js';
import { createPerfHint } from './ui/perfhint.js';
import { createGameAudio } from './audio/game.js';
import { showConsent } from './ui/consent.js';
import { track } from './analytics.js';

// graphics levels: each render module has its table (post, shadows, sky), the world its DETAIL (city.js world.setQuality)
export const QUALITY_LEVELS = ['low', 'medium', 'high'];
const QUALITY_KEY = 'cd.quality';
const TIME_CYCLE = ['morning', 'day', 'sunset']; // T: morning, midday, evening
const POS_KEY = 'cherkasy.pos', POS_EVERY = 10; // saved car spot: { x, y, z, yaw }

function savedQuality() {
  try { const q = localStorage.getItem(QUALITY_KEY); return QUALITY_LEVELS.includes(q) ? q : null; } catch { return null; }
}

export function createCore({ container = document.body, quality = savedQuality() || 'high', preset = 'day', far = 24000, adaptive = false } = {}) {
  const renderer = createRenderer({ container });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, far);
  camera.position.set(0, 40, 120);
  const events = createEvents();
  const input = createInput({ element: renderer.domElement });
  const daylight = createDaylight({ preset });
  const sky = createSky({ scene, renderer, daylight, quality });
  const shadows = createShadows({ scene, renderer, daylight, quality });
  const post = createPostProcessing({ renderer, scene, camera, quality, daylight });
  const systems = [];
  const failed = new Set();
  // scene.environment (sky PMREM) already reflects on glass; keep the materials' fake sky reflection as a light top-up
  cityUniforms.reflect.value = 0.15;

  const ctx = {
    renderer, scene, camera, events, input, daylight, sky, shadows, post, systems,
    groundAt: () => 0,
    time: 0, frame: 0, dt: 0, quality, paused: false,
    addSystem(sys, name = sys?.name || `system${systems.length}`, { always = false } = {}) {
      const fn = typeof sys === 'function' ? sys : (dt, c) => sys.update(dt, c);
      const entry = { name, fn, always };
      systems.push(entry);
      return () => { const i = systems.indexOf(entry); if (i >= 0) systems.splice(i, 1); };
    },
    setQuality(q) {
      if (!QUALITY_LEVELS.includes(q)) return;
      ctx.quality = q;
      post.setQuality(q); sky.setQuality(q); shadows.setQuality(q);
      post.resetHistory();
      try { localStorage.setItem(QUALITY_KEY, q); } catch { /* storage off */ }
      events.emit('quality', q);
    },
    step(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);   // tab suspension / breakpoints never produce huge steps
      ctx.frame++;
      input.update(dt);
      if (ctx.paused) { // a full-screen overlay (the city map) is up: the world stands still, only the UI runs
        for (const s of systems) if (s.always) { try { s.fn(dt, ctx); } catch (err) { console.error(`[main] system "${s.name}" failed`, err); } }
        return;
      }
      ctx.dt = dt; ctx.time += dt;
      daylight.update(dt);
      // shared city material uniforms (facade + detail): lit windows / lamps and the glass sky tint
      setNightFactor(daylight.state.lamps);
      setSkyColors(daylight.state.zenithColor, daylight.state.horizonColor);
      for (const s of systems) {
        try { s.fn(dt, ctx); } catch (err) {
          if (!failed.has(s.name)) { failed.add(s.name); console.error(`[main] system "${s.name}" failed`, err); }
        }
      }
      if (ctx.paused) return; // opened this frame: skip the render, the last frame stays under the overlay
      sky.update(dt, camera);
      const p = camera.position;
      shadows.update(dt, camera, ctx.groundAt(p.x, p.z));
      post.render(dt);
    },
    start() {
      let last = performance.now();
      let work = 0;
      renderer.setAnimationLoop((t) => {
        const dt = (t - last) / 1000; last = t;
        // the raw interval and the last frame's JS time, only from the real loop (tick() stops it); nothing renders
        // under the map or in a hidden tab. Before the step: a new pixel ratio clears the canvas, so it must land
        // before a render, never between a render and the screen (a black frame)
        ctx.adaptive?.update(dt, !ctx.paused && globalThis.document?.visibilityState !== 'hidden', work);
        const t0 = performance.now();
        ctx.step(dt);
        work = (performance.now() - t0) / 1000;
      });
    },
    stop() { renderer.setAnimationLoop(null); },
    resize() {
      const w = container.clientWidth || globalThis.innerWidth, h = container.clientHeight || globalThis.innerHeight;
      if (post.setSize(w, h)) { post.resetHistory(); ctx.adaptive?.settle(); events.emit('resize', { w, h }); }
    },
  };

  // weak machines: a softer image before stutter (full resolution again on every quality change, never saved)
  if (adaptive) {
    ctx.adaptive = createAdaptiveRes({
      getBase: () => post.baseDpr, apply: (f) => { post.setAdaptive(f); post.resetHistory(); },
      onStep: (s) => {
        console.info(`[adaptive] render pixel ratio ${s.dpr} (${s.reason}, ${s.ms} ms)`);
        track('adaptive_res', { dpr: s.dpr, step: s.to, reason: s.reason, quality: ctx.quality });
      },
    });
    events.on('quality', () => ctx.adaptive.restart());
  } else ctx.adaptive = null;

  const ro = new ResizeObserver(() => ctx.resize());
  ro.observe(container);
  ctx.resize();
  // renderer-level hotkeys: T cycles morning / day / evening (no night: the city reads badly in the dark), F9 cycles quality
  input.bind('timeOfDay', ['KeyT']);
  input.bind('quality', ['F9']);
  ctx.addSystem(() => {
    if (input.pressed('timeOfDay')) {
      const i = TIME_CYCLE.indexOf(daylight.state.preset); // another preset (a demo's) steps to the first
      daylight.setPreset(TIME_CYCLE[(i + 1) % TIME_CYCLE.length], 3);
    }
    if (input.pressed('quality')) ctx.setQuality(QUALITY_LEVELS[(QUALITY_LEVELS.indexOf(ctx.quality) + 1) % 3]);
  }, 'renderKeys');
  return ctx;
}

function setOverlay(overlay, text) {
  const el = overlay?.querySelector('.msg');
  if (el) el.textContent = text;
}

// the Cherkasy city (src/world/cherkasy/city.js) when it is present in the build; else null -> the test world
const CITY = import.meta.glob('./world/cherkasy/city.js');
async function loadCity(opts) {
  const load = CITY['./world/cherkasy/city.js'];
  if (!load) return null;
  try {
    const mod = await load();
    return mod.buildCherkasy ? await mod.buildCherkasy(opts) : null;
  } catch (err) { console.error('[main] Cherkasy world failed, using the test world', err); return null; }
}

export async function startGame({ container = document.getElementById('app') || document.body, overlay = document.getElementById('loading') } = {}) {
  setOverlay(overlay, 'Готуємо рендер…');
  const consent = showConsent({ overlay }); // the keys and terms, read while the city loads
  const params = new URLSearchParams(globalThis.location?.search || '');
  const ctx = createCore({ container, adaptive: !params.has('noadapt') });
  const { scene, camera, input, renderer } = ctx;

  // world: the city, or (?testworld, or no city in the build) the flat test world
  setOverlay(overlay, 'Будуємо Черкаси…');
  let world = params.has('testworld') ? null : await loadCity({ scene, renderer, camera, ctx, onProgress: (t) => setOverlay(overlay, t) });
  if (!world) world = createTestWorld({ scene });
  ctx.world = world;
  ctx.groundAt = (x, z) => world.groundHeight(x, z);
  // the graphics level also sets what the world draws (city.js DETAIL: draw / shadow distances, the river mirror, ...)
  const worldQuality = (q) => world.setQuality?.(q);
  worldQuality(ctx.quality);
  ctx.events.on('quality', worldQuality);

  // the car owns the camera; the HUD is fed by the car (telemetry) and the missions (objective, markers, panel)
  const car = createCar({ scene, world, camera, input });
  world.water?.reflectCull?.(car.object); // the river mirror skips the car's ~200 unculled draws when it cannot show it
  const hud = createHud({ player: car, world, camera, container: document.body });
  car.hud = hud;
  const missions = createMissions({ world, player: car, hud, scene, input });
  const partners = createPartners({ world, player: car, scene, isBlocked: () => hud.map.isOpen });
  const explore = createExplore({ world, player: car, hud, reward: (n) => missions.addMoney(n) });
  const audio = createGameAudio({ car, camera, world, daylight: ctx.daylight, silent: params.has('nosound') });
  Object.assign(ctx, { car, player: car, hud, missions, partners, explore, audio }); // player: the name the city polls for the traffic

  // resume where the last session ended. The saved spot is the car's last safe point (on a street, slow, dry), not the
  // raw position, so a save taken mid-flight or in the river still restarts on a road.
  const inCity = !!world.cherkasy;
  if (inCity && !params.has('fresh')) {
    try {
      const sp = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (sp && [sp.x, sp.y, sp.z, sp.yaw].every(Number.isFinite)) car.teleport(new THREE.Vector3(sp.x, sp.y, sp.z), sp.yaw);
    } catch { /* storage off or a bad record */ }
  }
  // ?at=lat,lon (links from the Telegram bot): start on the road beside that point, the object on the passenger side
  const at = inCity && /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(params.get('at') || '');
  const map = world.cherkasy?.map;
  if (at && map?.frame) {
    const t = worldXZ(map.frame, +at[1], +at[2]), spot = roadSpotNear(map, t.x, t.z, { road: params.get('road') || '' });
    if (spot) car.teleport(new THREE.Vector3(spot.x, world.groundHeight(spot.x, spot.z, spot.bridge ? 400 : undefined) + 0.3, spot.z), spot.yaw); // a bridge: its deck, not the ground under it
    else console.warn('[main] ?at: no road within reach of', at[0]);
  }
  const savePos = () => {
    const s = car.state, p = s.safe.lengthSq() > 0 ? s.safe : s.p;
    const r = (v) => Math.round(v * 100) / 100;
    try { localStorage.setItem(POS_KEY, JSON.stringify({ x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(s.safe.lengthSq() > 0 ? s.safeYaw : s.yaw) })); } catch { /* storage off */ }
  };
  if (inCity) {
    let posT = 0;
    ctx.addSystem((dt) => { if ((posT += dt) >= POS_EVERY) { posT = 0; savePos(); } }, 'savePos');
    globalThis.addEventListener?.('pagehide', savePos);
    globalThis.document?.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') savePos(); });
  }

  input.bind('hudToggle', ['F2']);
  input.bind('map', ['KeyM']);
  input.bind('simpler', ['KeyG']);
  input.bind('home', ['KeyB', 'Home']);
  // a stuck car: back to the city's start spot (the saved position moves with it, so a reload does not undo it)
  const goHome = () => { car.home(); if (inCity) savePos(); };
  hud.onHome = goHome;
  // the big map's teleport (paying partners only): the road beside it, the building on the passenger side; a
  // running mission carries on. The street from the note ("вул. Хрещатик, 235", "Оренда офісів · Надпільна, 252").
  hud.onGo = (p) => {
    const road = String(p.note || '').split('·').pop().split(',')[0].trim();
    const spot = map && roadSpotNear(map, p.x, p.z, { road });
    if (!spot) { console.warn('[main] teleport: no road near', p.id); return; }
    car.teleport(new THREE.Vector3(spot.x, world.groundHeight(spot.x, spot.z, spot.bridge ? 400 : undefined) + 0.3, spot.z), spot.yaw);
    hud.map.close(); if (inCity) savePos();
  };
  input.bind('radio', ['KeyQ']);
  input.bind('radioNext', ['KeyE']);
  audio.radio.onChange = (st) => hud.setRadio(st);
  hud.onRadio = () => audio.radio.toggle();
  hud.onRadioNext = () => audio.radio.next();
  // a sustained low frame rate offers G (simpler graphics) at the bottom; G steps the quality down any time, the lowest wraps to the highest
  // while the adaptive resolution still has a lower step it corrects first, so the pill never doubles it
  const perf = createPerfHint({
    container: hud.root, getQuality: () => ctx.quality, setQuality: (q) => ctx.setQuality(q), levels: QUALITY_LEVELS,
    canAdapt: () => !!ctx.adaptive && !ctx.adaptive.atFloor,
  });
  ctx.perf = perf;
  ctx.events.on('quality', () => perf.restart()); // F9 too, not only G
  const sim = () => world.life?.traffic;
  ctx.addSystem((dt) => car.update(dt), 'car');
  ctx.addSystem(() => { // traffic yields to / collides with the player
    const s = sim(); if (!s?.setPlayer) return;
    const p = car.state.p;
    s.setPlayer(p, car.velocity, car.grounded ? p.y : world.groundHeight(p.x, p.z, p.y + 0.5));
  }, 'trafficPlayer');
  ctx.addSystem((dt) => world.update?.(dt, camera), 'world');
  ctx.addSystem((dt) => missions.update(dt), 'missions');
  ctx.addSystem((dt) => partners.update(dt), 'partners');
  ctx.addSystem((dt) => explore.update(dt), 'explore');
  ctx.addSystem((dt) => audio.update(dt), 'audio');
  ctx.addSystem(() => { if (input.pressed('simpler')) perf.cycle(); perf.update(); }, 'perf');
  ctx.addSystem((dt) => {
    if (input.pressed('map')) { hud.map.toggle(); if (hud.map.isOpen) input.unlock(); } // the map wants the mouse
    if (!hud.map.isOpen) {
      if (input.pressed('help')) hud.toggleHelp();
      if (input.pressed('hudToggle')) hud.setVisible(!hud.visible);
      if (input.pressed('home')) goHome();
      if (input.pressed('radio')) audio.radio.toggle();
      if (input.pressed('radioNext')) audio.radio.next();
    }
    hud.update(dt);
    if (ctx.paused !== hud.map.isOpen) audio.setPaused(hud.map.isOpen); // the world falls silent under the map
    ctx.paused = hud.map.isOpen; // Esc inside the map closes it too; the game resumes on the next frame
  }, 'hud', { always: true });

  setOverlay(overlay, 'Компілюємо шейдери…');
  ctx.sky.update(0, camera);
  await warmupShaders(ctx.renderer, scene, camera);
  track('game_ready', { load_ms: Math.round(performance.now()), quality: ctx.quality });
  consent.ready();
  consent.accepted.then(() => { // the loop starts only once the terms are accepted (at once for a returning player)
    if (!params.has('paused')) ctx.start();
    overlay?.classList.add('done');
    setTimeout(() => overlay?.remove(), 700);
  });
  if (typeof window !== 'undefined') {
    window.__game = ctx;
    // deterministic stepping for automated checks: pauses the real-time loop, runs n fixed frames (dt = 1/60 unless
    // given) and returns a snapshot; ctx.start() resumes. Keys: ctx.input.inject.down('KeyW') / .up('KeyW').
    window.tick = (n = 1, dt = 1 / 60) => {
      ctx.stop();
      for (let i = 0; i < n; i++) ctx.step(dt);
      const p = car.state.p, v = car.velocity;
      return {
        frame: ctx.frame, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +car.yaw.toFixed(3),
        kmh: Math.round(Math.hypot(v.x, v.z) * 3.6), mode: car.mode, alt: +(car.state.alt || 0).toFixed(1), wing: +car.state.wing.toFixed(2),
        cam: car.cam.mode, money: missions.money, mission: missions.active?.type || null, offer: missions.offers[0]?.type || null,
        objective: hud.objective ? hud.objective.toArray().map((q) => +q.toFixed(1)) : null,
      };
    };
  }
  return ctx;
}
