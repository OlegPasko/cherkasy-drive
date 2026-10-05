// Missions (car mode): Oleg's side activities for the flying car, one dispatcher call at a time.
//   Грабіжники (mugging)   thugs rob a passer-by on the pavement: run them over (never the victim), then pick the victim up
//                          and drive them to the police (the regional police HQ from OSM)
//   Пограбування (chase)   robbers flee in a getaway SUV through the traffic (ploughing cars out of the way): ram it (5 hard to 10 light rams) until
//                          it is wrecked before it gets away; it keeps to its lane path, stops at walls, and a ram knocks it
//                          sliding, spinning and hopping off the road before it steers back on
//   Кур'єр (courier)       pick up a parcel, deliver it in time to a named place or onto a rooftop (fly); hard crashes
//                          break what is inside
//   Таксі (taxi)           someone hails you from the kerb: stop next to them, drive them to a named place; crashes and
//                          running people over cost the tip, a flight impresses them
//   Обліт (tour)           fly through rings over Cherkasy's monuments against the clock
// A call stands as a coloured light pillar (minimap: a coloured disc with a letter); drive into it to start. Backspace
// abandons the running mission, N skips a call, Enter retries after a failure. Fines only for the player's own fault.
// J (or the HUD's "Місії" chip, hud.onMissions) turns the dispatcher off and on: off, the running mission and the call
// are dropped quietly and no new call comes until it is on again; the choice is kept in localStorage ('cherkasy.missions').
// Money (₴) is kept in localStorage ('cherkasy.money').
//
//   createMissions({ world, player, hud?, scene, input? }) -> api
//     world: the city contract (src/main.js): groundHeight, collision.topAt, streetsAt, cherkasy.{ map, ground },
//       life.traffic (sim: links, VTYPES, makeMesh, cars, knock, massOf, dent) and life.crowd (people: spawnActor,
//       removeActor, hitBox). Without traffic the lane points come from map.roads and the chase is not offered;
//       without people mugging and taxi are not offered.
//     player: the car (position, velocity, yaw, onEvents); hud: src/ui/hud.js (setObjective, setMarkers, mission.*)
//     input: src/core/input.js (actions missionAbort / missionSkip / missionRetry are bound here); without it the
//       keys are read from window keydown
// Sound: every moment worth a sound or a dispatcher line goes out as cue('mission', { kind, vo?, ... }) (src/audio/cue.js);
//   kind: call | skip | lapse | start | say | end (ok, reward, fine) | ring | low (timer under 10 s) | tick (each second
//   under 10) | ram (the getaway car hit, pos); vo names a line in tools/audio/sounds.json (groups vo / pax).
//   api: { update(dt), start(type) (debug: a call of `type` right here, started at once), abandon(), skip(), retry(),
//          offers, active, money, addMoney(n), available() -> types that can run here, TYPES,
//          enabled, setEnabled(on), toggle() }
import * as THREE from 'three';
import { cue } from '../audio/cue.js';
import { track } from '../analytics.js';

export const TYPES = {
  mugging: { title: 'Грабіжники', letter: 'Г', color: '#e8473b', start: 55, weight: 0.26, needs: 'crowd' },
  chase: { title: 'Пограбування', letter: 'П', color: '#f08a24', start: 60, weight: 0.2, needs: 'traffic' },
  courier: { title: "Кур'єр", letter: 'К', color: '#3fbf6a', start: 7, weight: 0.24 },
  taxi: { title: 'Таксі', letter: 'Т', color: '#f5c52e', start: 9, weight: 0.2, needs: 'crowd' },
  tour: { title: 'Обліт пам’яток', letter: 'О', color: '#3cc6e8', start: 8, weight: 0.12 },
};
const UP = new THREE.Vector3(0, 1, 0);
const CAR = { hl: 2.84, hw: 1.02 };
const MONEY_KEY = 'cherkasy.money', ON_KEY = 'cherkasy.missions';
const clamp = THREE.MathUtils.clamp;
const angW = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the HUD's mission panel API, as no-ops (headless tests, a game without a HUD)
const NO_UI = { setPanel() {}, setText() {}, setBar() {}, setTimer() {}, banner() {}, setMoney() {}, flashMoney() {}, setHint() {} };

function fadeTex() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#888'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

export function createMissions({ world, player, hud = null, scene, input = null }) {
  const W = world, ground = W.cherkasy?.ground, map = W.cherkasy?.map;
  const sim = () => W.life?.traffic || null;
  const peds = () => W.life?.crowd || null;
  const ui = hud?.mission || NO_UI;
  let money = 0;
  try { money = +localStorage.getItem(MONEY_KEY) || 0; } catch { /* storage off */ }
  const flashMoney = () => ui.flashMoney();
  const addMoney = (n) => {
    money += n; ui.setMoney(money);
    try { localStorage.setItem(MONEY_KEY, String(money)); } catch { /* storage off */ }
  };
  addMoney(0);
  const banner = (t, sub = '', col = '#fff') => ui.banner(t, sub, col);
  // game-time clock and delayed jobs (actors walking off, cleanup): they pause with the game, unlike setTimeout
  let clock = 0;
  const jobs = [];
  const later = (sec, fn) => { jobs.push({ at: clock + sec, fn }); };

  // ---------------------------------------------------------------- 3D markers
  const fade = fadeTex();
  const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0);
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  const beacon = (color, r = 3, h = 90) => {
    const c = new THREE.Color(color);
    const m1 = new THREE.MeshBasicMaterial({ color: c, alphaMap: fade, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m2 = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const p = new THREE.Mesh(pillarGeo, m1); p.scale.set(r * 0.55, h, r * 0.55);
    const ring = new THREE.Mesh(ringGeo, m2); ring.scale.setScalar(r); ring.position.y = 0.15;
    g.add(p, ring); g.renderOrder = 3; p.frustumCulled = ring.frustumCulled = false;
    scene.add(g);
    return { g, p, ring, r, dispose() { scene.remove(g); m1.dispose(); m2.dispose(); } };
  };
  const parcelMesh = () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0xc8995a, roughness: 0.8, emissive: 0x3a2408 }));
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.72), new THREE.MeshStandardMaterial({ color: 0xe8d9a0, roughness: 0.6 }));
    m.add(tape); m.castShadow = true; scene.add(m); return m;
  };
  const ringGateGeo = new THREE.TorusGeometry(9, 0.5, 10, 48);

  // ---------------------------------------------------------------- places
  const gh = (x, z) => (ground ? ground.heightAt(x, z) : W.groundHeight(x, z, 1e4));
  const inBld = (x, z) => { try { return W.collision?.topAt?.(x, z)?.id >= 0; } catch (e) { return false; } };
  const water = (x, z) => ground?.isWater?.(x, z);
  const P = () => player.position;
  // lane links: the traffic sim's lanes, or (no traffic) both directions of the map's motor-road segments, 1.9 m right
  let roadLanes = null;
  const mapLanes = () => {
    if (roadLanes) return roadLanes;
    roadLanes = [];
    for (const r of map?.roads || []) {
      if (r.k && r.k !== 'm') continue;
      const q = r.p || [];
      for (let i = 0; i + 3 < q.length; i += 2) {
        const len = Math.hypot(q[i + 2] - q[i], q[i + 3] - q[i + 1]); if (!(len > 1)) continue;
        for (const dir of [1, -1]) {
          const [ax, az, bx, bz] = dir > 0 ? [q[i], q[i + 1], q[i + 2], q[i + 3]] : [q[i + 2], q[i + 3], q[i], q[i + 1]];
          const dx = (bx - ax) / len, dz = (bz - az) / len;
          roadLanes.push({ ax: ax - dz * 1.9, az: az + dx * 1.9, dx, dz, len, bridge: !!r.br, name: r.n, out: null });
        }
      }
    }
    return roadLanes;
  };
  const links = () => {
    const S = sim()?.links;
    return S?.length ? S.filter(L => L.len > 26 && !L.bridge && L.out && L.out.length) : mapLanes().filter(L => L.len > 26 && !L.bridge);
  };
  // mission types that can run in this world (the chase needs the traffic sim, mugging / taxi need people)
  const available = () => Object.keys(TYPES).filter((k) => {
    const n = TYPES[k].needs;
    return n === 'traffic' ? !!sim()?.cars : n === 'crowd' ? !!peds()?.spawnActor : true;
  });
  let linkCache = null, linkT = 0;
  // a lane point between rMin and rMax of (x, z)
  const roadPoint = (x, z, rMin, rMax, tries = 80) => {
    if (!linkCache || linkT <= 0) { linkCache = links(); linkT = 5; }
    const Ls = linkCache; if (!Ls.length) return null;
    for (let t = 0; t < tries; t++) {
      const L = Ls[Math.floor(Math.random() * Ls.length)], s = L.len * (0.3 + Math.random() * 0.4);
      const px = L.ax + L.dx * s, pz = L.az + L.dz * s, d = Math.hypot(px - x, pz - z);
      if (d < rMin || d > rMax || water(px, pz)) continue;
      return { x: px, z: pz, dx: L.dx, dz: L.dz, L, s };
    }
    return null;
  };
  const nearestRoad = (x, z, maxD = 60) => {
    if (!linkCache) linkCache = links();
    let best = null, bd = maxD;
    for (const L of linkCache) {
      const px = x - L.ax, pz = z - L.az, s = clamp(px * L.dx + pz * L.dz, 2, L.len - 2);
      const qx = L.ax + L.dx * s, qz = L.az + L.dz * s, d = Math.hypot(qx - x, qz - z);
      if (d < bd) { bd = d; best = { x: qx, z: qz, dx: L.dx, dz: L.dz, L, s }; }
    }
    return best;
  };
  const sidewalk = (rp) => {
    for (const off of [5, 6, 4.2, 7, 8.5]) for (const sg of [1, -1]) {
      const x = rp.x - rp.dz * off * sg, z = rp.z + rp.dx * off * sg;
      if (W.streetsAt?.(x, z)?.type === 'sidewalk' && !inBld(x, z) && !water(x, z) && !inBld(x + rp.dx * 3, z + rp.dz * 3) && !inBld(x - rp.dx * 3, z - rp.dz * 3)) return { x, z, nx: -rp.dz * sg, nz: rp.dx * sg }; // n: road -> pavement
    }
    return null;
  };
  const POIS = (map?.pois || []).filter(p => p.name && p.name.length < 40);
  const placeNamed = (re, rMin, rMax) => {
    const p0 = P(), c = POIS.filter(p => re.test(JSON.stringify(p.tags)) || re.test(p.name));
    for (let t = 0; t < 40 && c.length; t++) {
      const q = c[Math.floor(Math.random() * c.length)], d = Math.hypot(q.x - p0.x, q.z - p0.z);
      if (d < rMin || d > rMax) continue;
      const rp = nearestRoad(q.x, q.z, 70); if (!rp) continue;
      return { ...rp, name: q.name };
    }
    return null;
  };
  const DEST = /amenity.{0,4}(theatre|fountain|place_of_worship|college|planetarium|community)|tourism.{0,4}(attraction|artwork)|historic/;
  const roofSpot = (rMin, rMax) => {
    const B = map?.buildings || [], p0 = P();
    for (let t = 0; t < 400 && B.length; t++) {
      const b = B[Math.floor(Math.random() * B.length)], pts = b.p || b.pts || b.poly;
      if (!pts || pts.length < 6 || (b.area ?? 999) < 250) continue;
      let cx = 0, cz = 0; const n = pts.length / 2; for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cz += pts[i + 1]; } cx /= n; cz /= n;
      const d = Math.hypot(cx - p0.x, cz - p0.z); if (d < rMin || d > rMax) continue;
      const y = W.groundHeight(cx, cz, 1e4), g0 = gh(cx, cz);
      if (!(y - g0 > 14) || !inBld(cx, cz)) continue;
      return { x: cx, z: cz, y, h: y - g0 };
    }
    return null;
  };

  // ---------------------------------------------------------------- mission UI state
  let objPos = null;
  const setObj = (text, pos = null) => { ui.setText(text); objPos = pos; hud?.setObjective?.(pos); };
  // progress / condition bar with a label; dmg: a condition that only drops (parcel, getaway car, mood): the HUD colours
  // it by value, shakes it and shows the loss when it drops
  const setBar = (f, label = '', dmg = false) => ui.setBar(f == null ? null : clamp(f, 0, 1), label, dmg);
  let lastT = Infinity;
  const setTimer = (t) => { // the last ten seconds of a running mission: one warning line, then a soft tick a second
    ui.setTimer(t);
    if (active && t != null && t < 10 && t > 0) {
      if (lastT >= 10) cue('mission', { kind: 'low', vo: 'timer_low' });
      else if (Math.ceil(t) !== Math.ceil(lastT)) cue('mission', { kind: 'tick' });
    }
    lastT = t ?? Infinity;
  };
  const say = (vo, extra) => cue('mission', { kind: 'say', vo, ...extra });
  const speed = () => player.velocity.length();
  const near = (pos, r, dy = 6) => { const p = P(); return Math.hypot(p.x - pos.x, p.z - pos.z) < r && Math.abs(p.y - 0.95 - (pos.y ?? p.y - 0.95)) < dy; };
  let crash = [];
  player.onEvents = (ev) => { for (const e of ev) crash.push(e); };

  // ---------------------------------------------------------------- offers
  const offers = [];
  let spawnT = 1, active = null, cool = 0;
  const pickType = () => {
    const have = new Set(offers.map(o => o.type));
    let tot = 0; const ok = Object.entries(TYPES).filter(([k]) => !have.has(k)); for (const [, t] of ok) tot += t.weight;
    let r = Math.random() * tot; for (const [k, t] of ok) if ((r -= t.weight) <= 0) return k;
    return ok[0]?.[0];
  };
  const makeOffer = (type) => {
    const p0 = P(), rp = roadPoint(p0.x, p0.z, 160, 620); if (!rp) return null;
    if (offers.some(o => Math.hypot(o.x - rp.x, o.z - rp.z) < 120)) return null;
    const o = { type, x: rp.x, z: rp.z, y: gh(rp.x, rp.z), rp, staged: false };
    if (type === 'mugging' || type === 'taxi') { const sw = sidewalk(rp); if (!sw) return null; o.sw = sw; o.x = sw.x; o.z = sw.z; o.y = gh(sw.x, sw.z); }
    const T = TYPES[type];
    o.b = beacon(T.color, type === 'mugging' || type === 'chase' ? 6 : 4.5); o.b.g.position.set(o.x, o.y, o.z);
    return o;
  };
  const dropOffer = (o) => { o.b?.dispose(); unstage(o); offers.splice(offers.indexOf(o), 1); };
  // scene dressing near an offer (people / a car / a parcel), made when the player comes within sight
  const stage = (o) => {
    o.staged = true;
    const pd = peds();
    if (o.type === 'mugging' && pd) {
      const { x, z, nx, nz } = o.sw, ax = -nz, az = nx; // along the pavement
      o.victim = pd.spawnActor({ x: x + nx * 1.2, z: z + nz * 1.2, ry: Math.atan2(-nx, -nz), clip: 'cower' });
      o.thugs = [[-1.1, 0.1], [1.2, -0.3], [0.2, -1.1]].slice(0, 2 + (Math.random() < 0.6 ? 1 : 0)).map(([a, b], i) => {
        const tx = x + ax * a + nx * b, tz = z + az * a + nz * b;
        return pd.spawnActor({ x: tx, z: tz, ry: Math.atan2(o.victim.x - tx, o.victim.z - tz), clip: i === 0 ? 'point' : i === 1 ? 'talk2' : 'talk' });
      });
    } else if (o.type === 'taxi' && pd) {
      o.fare = pd.spawnActor({ x: o.sw.x, z: o.sw.z, ry: Math.atan2(-o.sw.nx, -o.sw.nz), clip: 'wave' });
    } else if (o.type === 'courier') {
      o.parcel = parcelMesh(); o.parcel.position.set(o.x, o.y + 0.9, o.z);
    } else if (o.type === 'chase') {
      o.car = getaway(o.rp);
    }
  };
  const unstage = (o) => {
    if (!o.staged) return;
    o.staged = false;
    const pd = peds();
    if (!o.taken) { for (const a of [o.victim, o.fare, ...(o.thugs || [])]) pd?.removeActor(a); o.car?.dispose(); }
    if (o.parcel) { scene.remove(o.parcel); o.parcel = null; }
  };

  // ---------------------------------------------------------------- the getaway car (scripted, drives the lane graph)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _pv = new THREE.Vector3(), _ax = new THREE.Vector3(1, 0, 0);
  function getaway(rp) {
    const S = sim(); const type = 'suv2', VT = S?.VTYPES?.[type] || { len: 5.35, wid: 2.03, h: 1.92 };
    const col = [0.012, 0.012, 0.014];
    const mm = S?.makeMesh?.(type, col, 0.37);
    if (mm) mm.mesh.visible = true;
    const g = {
      type, col, len: VT.len, wid: VT.wid, h: VT.h, x: rp.x, z: rp.z, y: gh(rp.x, rp.z), fx: rp.dx, fz: rp.dz, v: 0, spin: 0, roll: 0,
      L: rp.L, wp: [], hp: 1, go: false, mm, vel: new THREE.Vector3(),
      px: rp.x, pz: rp.z, sx: 0, sz: 0, hop: 0, vy: 0, snapT: 0, // path segment start, slide (knocks), hop
      dispose() { if (!mm || g.gone) return; g.gone = true; mm.mesh.parent?.remove(mm.mesh); if (mm.dispose) mm.dispose(); else { mm.g?.dispose(); mm.mesh.dispose(); } },
    };
    g.wp.push([rp.L.ax + rp.L.dx * rp.L.len, rp.L.az + rp.L.dz * rp.L.len]);
    g.draw = () => {
      if (!mm) return;
      const ry = Math.atan2(-g.fz, g.fx);
      _q.setFromAxisAngle(UP, ry); _q2.setFromAxisAngle(_ax, g.roll); _q.multiply(_q2);
      _m.compose(_pv.set(g.x, g.y + g.hop, g.z), _q, _one);
      mm.mesh.instanceMatrix.array.set(_m.elements); mm.mesh.instanceMatrix.needsUpdate = true;
    };
    g.draw();
    return g;
  }
  const extend = (g) => {
    while (g.wp.length < 4) {
      const L = g.L; if (!L?.out?.length) break;
      const opts = L.out.filter(o => o.turn !== 'U' && o.link.out?.length);
      const pool = opts.length ? opts : L.out;
      let o = pool.find(q => q.turn === 'S' && Math.random() < 0.55) || pool[Math.floor(Math.random() * pool.length)];
      g.L = o.link;
      g.wp.push([o.link.ax + o.link.dx * 2, o.link.az + o.link.dz * 2], [o.link.ax + o.link.dx * o.link.len, o.link.az + o.link.dz * o.link.len]);
    }
  };
  const sat = (ax, az, afx, afz, ahl, ahw, bx, bz, bfx, bfz, bhl, bhw) => {
    const dx = ax - bx, dz = az - bz; let best = Infinity, nx = 0, nz = 0;
    for (let k = 0; k < 4; k++) {
      const ux = k === 0 ? afx : k === 1 ? -afz : k === 2 ? bfx : -bfz, uz = k === 0 ? afz : k === 1 ? afx : k === 2 ? bfz : bfx;
      const ra = ahl * Math.abs(afx * ux + afz * uz) + ahw * Math.abs(-afz * ux + afx * uz), rb = bhl * Math.abs(bfx * ux + bfz * uz) + bhw * Math.abs(-bfz * ux + bfx * uz);
      const d = dx * ux + dz * uz, pen = ra + rb - Math.abs(d);
      if (pen <= 0) return null;
      if (pen < best) { best = pen; nx = d < 0 ? -ux : ux; nz = d < 0 ? -uz : uz; }
    }
    return { nx, nz, depth: best };
  };
  // It follows its lane path by pursuit along the segment (previous waypoint -> next), so after a knock it steers back
  // onto the road rather than cutting a straight line to the next waypoint; far off (>22 m) it re-snaps to the nearest
  // lane. Buildings stop it (collision.pushBox), and a ram leaves it sliding sideways (sx, sz) and hopping.
  const _gb = { x: 0, y: 0, z: 0, yaw: 0, hl: 0, hw: 0, h: 0, step: 0.6 }, _go = {};
  const driveGetaway = (g, dt) => {
    extend(g);
    // the segment it is on; done once it passes the far end
    let ax = g.px, az = g.pz, b = g.wp[0], off = 0;
    for (let k = 0; b && k < 3; k++) {
      const sx = b[0] - ax, sz = b[1] - az, L = Math.hypot(sx, sz) || 1, t = ((g.x - ax) * sx + (g.z - az) * sz) / L;
      if (t < L - 3 && Math.hypot(b[0] - g.x, b[1] - g.z) > 4) break;
      g.px = ax = b[0]; g.pz = az = b[1]; g.wp.shift(); extend(g); b = g.wp[0];
    }
    let tgt, corner = 0; // a sharp turn at the end of this segment, close enough to brake for
    if (b) {
      const sx = b[0] - ax, sz = b[1] - az, L = Math.hypot(sx, sz) || 1, ux = sx / L, uz = sz / L;
      const t = clamp((g.x - ax) * ux + (g.z - az) * uz, 0, L);
      off = t >= L ? Math.hypot(g.x - b[0], g.z - b[1]) : Math.abs((g.x - ax) * -uz + (g.z - az) * ux);
      const c = g.wp[1];
      if (c && L - t < 30) { const cx = c[0] - b[0], cz = c[1] - b[1], cl = Math.hypot(cx, cz) || 1; corner = 1 - (cx * ux + cz * uz) / cl; }
      const look = t + (off > 1.5 ? Math.max(5, g.v * 0.3) : Math.max(7, g.v * 0.55)); // off its lane: a sharper way back
      if (look <= L || !g.wp[1]) tgt = [ax + ux * Math.min(look, L), az + uz * Math.min(look, L)];
      else { const c = g.wp[1], r = look - L, cx = c[0] - b[0], cz = c[1] - b[1], cl = Math.hypot(cx, cz) || 1; tgt = [b[0] + cx / cl * Math.min(r, cl), b[1] + cz / cl * Math.min(r, cl)]; }
    } else tgt = [g.x + g.fx * 20, g.z + g.fz * 20];
    g.off = off; // metres off its path (checks)
    if (off > 22 && (g.snapT -= dt) <= 0) { // knocked far off: back to the nearest lane
      g.snapT = 1;
      const rp = nearestRoad(g.x, g.z, 120);
      if (rp?.L?.out?.length) { g.L = rp.L; g.px = rp.x; g.pz = rp.z; g.wp.length = 0; g.wp.push([rp.L.ax + rp.L.dx * rp.L.len, rp.L.az + rp.L.dz * rp.L.len]); extend(g); }
    }
    const want = Math.atan2(tgt[1] - g.z, tgt[0] - g.x), cur = Math.atan2(g.fz, g.fx), diff = angW(want - cur);
    const vT = Math.abs(diff) > 0.45 || off > 4 ? 12 : corner > 0.3 ? 14 : 25;
    g.v += clamp(vT - g.v, -12 * dt, 6.5 * dt);
    const rate = Math.min(2, 12 / Math.max(3, g.v));
    const a = cur + clamp(diff, -rate * dt, rate * dt) + g.spin * dt;
    g.spin *= Math.exp(-2.2 * dt);
    g.fx = Math.cos(a); g.fz = Math.sin(a);
    const sk = Math.exp(-2.6 * dt); g.sx *= sk; g.sz *= sk;
    g.x += (g.fx * g.v + g.sx) * dt; g.z += (g.fz * g.v + g.sz) * dt;
    // walls: pushed out of buildings, the speed into the wall lost
    const cw = W.collision;
    if (cw?.pushBox) {
      Object.assign(_gb, { x: g.x, y: g.y, z: g.z, yaw: Math.atan2(g.fx, g.fz), hl: g.len / 2, hw: g.wid / 2, h: g.h });
      const r = cw.pushBox(_gb, _go);
      if (r?.hit) {
        g.x = _gb.x; g.z = _gb.z;
        const into = -(g.fx * r.nx + g.fz * r.nz); if (into > 0.3) g.v *= 1 - 0.6 * into;
        const sn = g.sx * r.nx + g.sz * r.nz; if (sn < 0) { g.sx -= sn * r.nx * 1.4; g.sz -= sn * r.nz * 1.4; }
      }
    }
    g.vy -= 18 * dt; g.hop = Math.max(0, g.hop + g.vy * dt); if (g.hop === 0) g.vy = 0;
    g.y += (W.groundHeight(g.x, g.z, g.y + 2) - g.y) * Math.min(1, dt * 12);
    g.roll += (-diff * 0.12 * Math.min(1, g.v / 15) - g.roll) * Math.min(1, dt * 5);
    g.vel.set(g.fx * g.v, 0, g.fz * g.v);
    // it ploughs through the traffic in its way
    const S = sim();
    if (S) for (const c of S.cars()) {
      if (c.dead || Math.abs(c.x - g.x) > 9 || Math.abs(c.z - g.z) > 9) continue;
      const hit = sat(g.x, g.z, g.fx, g.fz, g.len / 2, g.wid / 2, c.x, c.z, Math.cos(c.ry), -Math.sin(c.ry), c.len / 2, c.wid / 2);
      if (!hit) continue;
      const w = S.knock(c); if (!w) continue;
      const k = g.v * 0.9 * 2200 / S.massOf(c);
      w.v.set(-hit.nx * k + g.fx * g.v * 0.4, 3 + k * 0.25, -hit.nz * k + g.fz * g.v * 0.4); w.w.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4); w.sleep = false;
      S.dent?.(w, c.x + hit.nx * c.wid / 2, w.p.y, c.z + hit.nz * c.wid / 2, -hit.nx, 0, -hit.nz, S.massOf(c) * k);
      g.v *= 0.9;
    }
    peds()?.hitBox?.({ x: g.x, z: g.z, fx: g.fx, fz: g.fz, hl: g.len / 2, hw: g.wid / 2, y0: g.y, y1: g.y + g.h, vx: g.vel.x, vy: 0, vz: g.vel.z });
    g.draw();
  };
  // the player's car against the getaway: returns the closing speed of a hit (0 = none)
  const ramGetaway = (g) => {
    const p = P(), yaw = player.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (Math.abs(p.y - 0.95 - g.y) > 2.2) return 0;
    const hit = sat(p.x, p.z, fx, fz, CAR.hl, CAR.hw, g.x, g.z, g.fx, g.fz, g.len / 2, g.wid / 2);
    if (!hit) return 0;
    const v = player.velocity, closing = -((v.x - g.vel.x) * hit.nx + (v.z - g.vel.z) * hit.nz);
    g.x -= hit.nx * hit.depth * 0.7; g.z -= hit.nz * hit.depth * 0.7;
    if (closing < 2) return 0;
    // it takes most of the blow: knocked sliding away, spun, a hard one lifts it; the player keeps most of the speed
    const side = -hit.nx * -g.fz + -hit.nz * g.fx;
    g.spin += Math.sign(side || 1) * Math.min(4.5, closing * 0.2);
    g.sx -= hit.nx * closing * 0.6; g.sz -= hit.nz * closing * 0.6;
    if (closing > 10) g.vy = Math.max(g.vy, Math.min(5, (closing - 8) * 0.35));
    g.v *= 0.8;
    v.x += hit.nx * closing * 0.15; v.z += hit.nz * closing * 0.15;
    return closing;
  };

  // ---------------------------------------------------------------- mission flow
  const begin = (type, title, vo = 'mission_started') => {
    const T = TYPES[type];
    lastT = Infinity; cue('mission', { kind: 'start', type, vo }); track('mission_start', { mission_type: type });
    ui.setPanel(true, T.color, title || T.title);
    setBar(null); setTimer(null); crash.length = 0;
    banner(T.title, 'Місію розпочато', T.color);
  };
  let endInfo = null; // picked up by the dispatcher (next call / retry)
  // fine: only for failures that are the player's fault (a person they had to protect run over, a broken parcel, a
  // late delivery); plain time-outs of a chase / a tour / thugs getting away cost nothing
  const end = (ok, text, reward = 0, fine = 0, vo = null) => {
    const m = active; active = null; cool = 5; endInfo = { ok, type: m?.type };
    cue('mission', { kind: 'end', ok, reward, fine, type: m?.type, vo: vo || (ok ? 'mission_success' : 'mission_failed') });
    track('mission_end', { mission_type: m?.type, ok });
    ui.setPanel(false); setObj('', null);
    if (ok) { addMoney(reward); banner('Виконано!', `${text} · +${reward} ₴`, '#6ee08a'); }
    else if (fine) { addMoney(-fine); flashMoney(); banner('Провалено', `${text} · штраф −${fine} ₴ · Enter – ще раз`, '#ff6a55'); }
    else banner('Провалено', `${text} · Enter – ще раз`, '#ff6a55');
    try { m?.cleanup?.(ok); } catch (e) { console.error('[missions] cleanup', e); }
  };

  const fails = (m) => { // shared checks: deaths of people who must live
    for (const a of m.protect || []) if (a && a.dead) { end(false, m.protectMsg || 'Ти збив людину, яку треба було врятувати', 0, m.protectFine ?? 300, m.protectVo); return true; }
    return false;
  };

  const startMugging = (o) => {
    begin('mugging');
    const pd = peds(), thugs = o.thugs || [], victim = o.victim;
    const m = { stage: 'fight', t: 75, protect: [victim], protectMsg: 'Ти збив потерпілого', protectFine: 400, protectVo: 'mugging_failed_victim_hit', o, caught: 0, escaped: 0 };
    const total = thugs.length;
    const { nx, nz } = o.sw, ax = -nz, az = nx;
    // thugs run off along the pavement (each its own way), keep running until caught or out of reach
    const flee = (a, k) => { a.fdx = ax * (k % 2 ? 1 : -1); a.fdz = az * (k % 2 ? 1 : -1); a.hx = a.x + a.fdx * 45; a.hz = a.z + a.fdz * 45; a.goSpeed = 4.4 + Math.random() * 0.8; };
    const aftermath = (won) => { // the scene plays out after the mission
      for (const a of thugs) if (!a.dead && !a.gone) { a.idleClip = 'cheer'; a.goSpeed = 1.3; a.hx = a.x + (a.fdx || ax) * 25; a.hz = a.z + (a.fdz || az) * 25; later(15, () => pd?.removeActor(a)); }
      if (!victim.dead && !o.taken) {
        victim.idleClip = won ? 'wave' : 'cower';
        later(won ? 4 : 6, () => { if (victim.dead) return; victim.idleClip = 'idle'; victim.goSpeed = 1.2; victim.hx = victim.x + ax * 40; victim.hz = victim.z + az * 40; });
        later(30, () => pd?.removeActor(victim));
      }
    };
    m.update = (dt) => {
      if (fails(m)) return;
      m.t -= dt;
      if (m.stage === 'fight') {
        setTimer(m.t);
        const p = P();
        for (const a of thugs) {
          if (a.dead || a.gone) continue;
          if (a.fdx !== undefined && Math.hypot(a.hx - a.x, a.hz - a.z) < 2) { a.hx = a.x + a.fdx * 45; a.hz = a.z + a.fdz * 45; }
          if (m.fled && Math.hypot(a.x - p.x, a.z - p.z) > 160) { a.gone = true; m.escaped++; pd?.removeActor(a); banner('Один утік', `${total - m.escaped} ще тут`, '#ff6a55'); if (m.escaped === 1) say('mugging_one_escaped'); }
        }
        m.caught = thugs.filter(a => a.dead).length;
        const alive = thugs.filter(a => !a.dead && !a.gone);
        const tgt = alive.reduce((b, a) => (!b || Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b), null);
        setObj(m.fled ? `Наздожени грабіжників: ${m.caught} з ${total}` : `Збий грабіжників, не зачепивши жертву: ${m.caught} з ${total}`, tgt ? new THREE.Vector3(tgt.x, tgt.y + 1.2, tgt.z) : null);
        setBar(m.caught / total, 'Зупинено');
        if (!m.fled && Math.hypot(p.x - o.x, p.z - o.z) < 38) { m.fled = true; alive.forEach(flee); banner('Вони тікають!', 'Наздожени їх', TYPES.mugging.color); say('mugging_thugs_flee'); }
        if (!alive.length || m.t <= 0) {
          if (!m.caught) { aftermath(false); return end(false, m.t <= 0 ? 'Не встиг – грабіжники втекли' : 'Грабіжники втекли', 0, 0, 'mugging_failed_escaped'); }
          for (const a of alive) { a.gone = true; pd?.removeActor(a); }
          m.stage = 'pickup'; m.t = 45; victim.idleClip = 'cheer';
          victim.hry = Math.atan2(p.x - victim.x, p.z - victim.z);
          later(2.5, () => { if (!victim.dead && !o.taken) victim.idleClip = 'wave'; });
          banner(m.caught === total ? 'Всіх зупинено!' : `Зупинено ${m.caught} з ${total}`, 'Потерпілий просить підвезти його до поліції', TYPES.mugging.color);
          say('mugging_all_stopped', { force: true });
        }
        return;
      }
      if (m.stage === 'pickup') {
        setBar(null); setTimer(m.t);
        setObj('Під’їдь до потерпілого і зупинись поруч', new THREE.Vector3(victim.x, victim.y + 1.2, victim.z));
        victim.hry = Math.atan2(P().x - victim.x, P().z - victim.z);
        if (Math.hypot(P().x - victim.x, P().z - victim.z) < 8 && speed() < 2.5) {
          pd?.removeActor(victim); m.protect = []; o.taken = true;
          m.dest = placeNamed(/police/, 0, 1e9) || placeNamed(DEST, 300, 1500);
          if (!m.dest) return end(true, 'Потерпілий у безпеці', 250 + m.caught * 100, 0, 'mugging_delivered');
          m.stage = 'drive'; m.t = Math.hypot(m.dest.x - P().x, m.dest.z - P().z) / 11 + 40; m.hp = 1;
          m.b = beacon(TYPES.mugging.color, 5); m.b.g.position.set(m.dest.x, gh(m.dest.x, m.dest.z), m.dest.z);
          banner('Потерпілий у машині', `Вези до: ${m.dest.name}`, TYPES.mugging.color); say('mugging_victim_boarded', { force: true });
        } else if (m.t <= 0) { aftermath(true); return end(true, 'Потерпілий пішов сам', 150 + m.caught * 100); }
        return;
      }
      if (m.stage === 'drive') {
        setTimer(m.t);
        for (const e of crash) if (e.type === 'crash' && e.severity > 0.15) m.hp -= e.severity * 0.3;
        crash.length = 0; setBar(Math.max(0, m.hp), 'Стан потерпілого', true);
        setObj(`Відвези потерпілого: ${m.dest.name}`, new THREE.Vector3(m.dest.x, gh(m.dest.x, m.dest.z) + 2, m.dest.z));
        if (near({ x: m.dest.x, z: m.dest.z }, 12, 8) && speed() < 4) {
          const sw = sidewalk(m.dest); if (sw && pd) { const a = pd.spawnActor({ x: m.dest.x + (sw.x - m.dest.x) * 0.5, z: m.dest.z + (sw.z - m.dest.z) * 0.5, clip: 'idle' }); a.hx = sw.x; a.hz = sw.z; later(25, () => pd.removeActor(a)); }
          end(true, 'Потерпілого доставлено', 300 + m.caught * 100 + Math.round(Math.max(0, m.t) * 3 * Math.max(0.3, m.hp)), 0, 'mugging_delivered');
        } else if (m.t <= 0) end(false, 'Не встиг довезти потерпілого', 0, 120, 'mugging_failed_victim_late');
      }
    };
    m.cleanup = (ok) => { m.b?.dispose(); if (m.stage === 'fight' || !ok) aftermath(ok); };
    return m;
  };
  const startChase = (o) => {
    begin('chase', undefined, 'chase_started');
    const g = o.car; o.taken = true;
    const m = { t: 150, far: 0, g };
    banner('Пограбування!', 'Розбий машину грабіжників', TYPES.chase.color);
    m.update = (dt) => {
      if (!g.go) { g.go = true; }
      driveGetaway(g, dt);
      m.t -= dt; setTimer(m.t);
      const c = ramGetaway(g);
      g.hitCd = Math.max(0, (g.hitCd || 0) - dt);
      // one ram is one hit (a contact lasts a few frames); 5 hard rams (~20 m/s closing) to 10 light ones wreck it
      if (c > 0 && !g.hitCd) { g.hitCd = 0.7; g.hp -= Math.min(0.2, 0.08 + c * 0.006); cue('mission', { kind: 'ram', vo: 'chase_ram_hit', x: g.x, y: g.y, z: g.z, k: c }); }
      setBar(g.hp, 'Машина грабіжників', true);
      const d = Math.hypot(P().x - g.x, P().z - g.z);
      setObj(d > 180 ? `Не впусти їх! Відстань ${Math.round(d)} м` : 'Тарань машину грабіжників', new THREE.Vector3(g.x, g.y + 2.5, g.z));
      m.far = d > 330 ? m.far + dt : 0;
      if (d > 180 !== !!m.warned) { m.warned = d > 180; if (m.warned) say('chase_too_far'); }
      if (g.hp <= 1e-6) { // float sums: five 0.2 hits must reach zero
        const S = sim();
        const fake = { type: g.type, len: g.len, wid: g.wid, h: g.h, color: g.col, x: g.x, z: g.z, y: g.y, ry: Math.atan2(-g.fz, g.fx), v: g.v, pitch: 0, gp: 0, adSeed: 0.37, parked: false, dead: false };
        g.dispose();
        const w = S?.knock?.(fake);
        if (w) { w.v.y = 4; w.w.set(1.5, g.spin + 2, -1); w.sleep = false; }
        const pd = peds();
        if (pd) for (const k of [-1, 1]) { const a = pd.spawnActor({ x: g.x - g.fz * k * 2.2, z: g.z + g.fx * k * 2.2, clip: 'cower' }); later(20, () => pd.removeActor(a)); }
        end(true, 'Грабіжників зупинено', 600 + Math.round(m.t * 3), 0, 'chase_success');
      } else if (m.far > 7) end(false, 'Грабіжники втекли', 0, 0, 'chase_failed_escaped');
      else if (m.t <= 0) end(false, 'Час вийшов', 0, 0, 'chase_failed_timeout');
    };
    m.cleanup = (ok) => { if (!ok) g.dispose(); };
    return m;
  };

  const startCourier = (o) => {
    const roof = Math.random() < 0.5 ? roofSpot(350, 1100) : null;
    const dest = roof ? { ...roof, name: 'на дах будинку' } : placeNamed(DEST, 400, 1500);
    if (!dest) return null;
    begin('courier', roof ? "Кур'єр: доставка на дах" : "Кур'єр", roof ? 'courier_roof_destination' : 'courier_picked_up');
    if (o.parcel) { scene.remove(o.parcel); o.parcel = null; }
    const dy = roof ? dest.y : gh(dest.x, dest.z);
    const b = beacon(TYPES.courier.color, roof ? 6 : 5, roof ? 40 : 90); b.g.position.set(dest.x, dy, dest.z);
    const dist = Math.hypot(dest.x - P().x, dest.z - P().z);
    const m = { t: dist / (roof ? 16 : 12) + (roof ? 45 : 30), hp: 1 };
    m.update = (dt) => {
      m.t -= dt; setTimer(m.t);
      const hp0 = m.hp;
      for (const e of crash) { if (e.type === 'crash' && e.severity > 0.12) m.hp -= e.severity * 0.45; if (e.type === 'land' && e.severity > 0.35) m.hp -= e.severity * 0.3; }
      crash.length = 0;
      if (m.hp < hp0 && m.hp > 0) say('courier_parcel_damaged');
      setBar(m.hp, 'Посилка', true);
      setObj(roof ? `Доставка на дах (${Math.round(dest.h)} м): приземлись на позначку` : `Доставка: ${dest.name}`, new THREE.Vector3(dest.x, dy + 1.5, dest.z));
      if (m.hp <= 0) return end(false, 'Посилка розбита – компенсація клієнту', 0, 250, 'courier_failed_smashed');
      if (near({ x: dest.x, z: dest.z, y: dy }, roof ? 9 : 11, roof ? 3.5 : 8) && speed() < (roof ? 7 : 4)) return end(true, `Посилку доставлено ${roof ? 'на дах' : ''}`, (roof ? 450 : 250) + Math.round(m.t * 4 + m.hp * 100), 0, 'courier_delivered');
      if (m.t <= 0) end(false, 'Посилку не доставлено вчасно', 0, 120, 'courier_failed_late');
    };
    m.cleanup = () => b.dispose();
    return m;
  };

  const startTaxi = (o) => {
    const dest = placeNamed(DEST, 350, 1400); if (!dest) return null;
    begin('taxi');
    const pd = peds(), fare = o.fare;
    const m = { stage: 'pickup', t: 40, mood: 1, flew: false, protect: [fare], protectMsg: 'Ти збив пасажира', protectFine: 350, protectVo: 'taxi_failed_passenger_hit' };
    m.update = (dt) => {
      if (fails(m)) return;
      if (m.stage === 'pickup') {
        fare.hry = Math.atan2(P().x - fare.x, P().z - fare.z);
        setObj('Підбери пасажира: зупинись поруч', new THREE.Vector3(fare.x, fare.y + 1, fare.z));
        m.t -= dt; setTimer(m.t);
        if (Math.hypot(P().x - fare.x, P().z - fare.z) < 8 && speed() < 2.5) {
          pd?.removeActor(fare); o.taken = true; m.protect = [];
          m.stage = 'ride'; m.t = Math.hypot(dest.x - P().x, dest.z - P().z) / 11 + 30;
          m.b = beacon(TYPES.taxi.color, 5); m.b.g.position.set(dest.x, gh(dest.x, dest.z), dest.z);
          banner('Пасажир у машині', dest.name, TYPES.taxi.color); say('pax_boarded', { force: true });
        } else if (m.t <= 0) end(false, 'Пасажир не дочекався', 0, 0, 'taxi_failed_no_show');
        return;
      }
      m.t -= dt; setTimer(m.t);
      for (const e of crash) {
        if (e.type === 'crash' && e.severity > 0.1) { m.mood -= e.severity * 0.4; if (e.severity > 0.2) say('pax_shocked_crash', { delay: 0.6 }); }
        if (e.type === 'splat') { m.mood -= 0.35; banner('Пасажир у шоці', '', '#ff6a55'); say('pax_shocked_pedestrian', { delay: 0.6 }); }
        if (e.type === 'takeoff' && !m.flew) { m.flew = true; m.mood = Math.min(1.3, m.mood + 0.3); banner('Пасажир у захваті!', 'Ми летимо!', TYPES.taxi.color); say('pax_first_takeoff', { force: true, delay: 0.5 }); }
      }
      crash.length = 0;
      m.mood = Math.max(0, m.mood); setBar(Math.min(1, m.mood), 'Настрій пасажира', true);
      setObj(`Відвези пасажира: ${dest.name}`, new THREE.Vector3(dest.x, gh(dest.x, dest.z) + 2, dest.z));
      if (near({ x: dest.x, z: dest.z }, 12, 8) && speed() < 3.5) {
        const sw = sidewalk(dest); if (sw && pd) { const a = pd.spawnActor({ x: dest.x + (sw.x - dest.x) * 0.4, z: dest.z + (sw.z - dest.z) * 0.4, clip: 'idle' }); a.hx = sw.x + (sw.x - dest.x); a.hz = sw.z + (sw.z - dest.z); later(30, () => pd.removeActor(a)); }
        const fareM = 180 + Math.round(Math.hypot(dest.x - o.x, dest.z - o.z) * 0.15), tip = Math.round(Math.max(0, m.t) * 1.2 * m.mood + (m.flew ? 80 : 0));
        return end(true, `Поїздка ${fareM} ₴ + чайові ${tip} ₴`, fareM + tip, 0, tip > 0 ? 'pax_arrived_with_tip' : 'mission_success');
      }
      if (m.t <= 0) end(false, 'Запізнився – пасажир вийшов і поскаржився', 0, 100, 'taxi_failed_late');
    };
    m.cleanup = () => m.b?.dispose();
    return m;
  };

  const startTour = (o) => {
    const p0 = P();
    let pool = POIS.filter(q => /monument|memorial|attraction|artwork|ship|cannon/.test(JSON.stringify(q.tags)) && Math.hypot(q.x - p0.x, q.z - p0.z) < 2600);
    const route = []; let cx = o.x, cz = o.z;
    while (route.length < 5 && pool.length) {
      pool.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
      const q = pool.find(q => Math.hypot(q.x - cx, q.z - cz) > 140) || pool[0];
      route.push(q); cx = q.x; cz = q.z; pool = pool.filter(r => Math.hypot(r.x - q.x, r.z - q.z) > 120);
    }
    if (route.length < 3) return null;
    begin('tour', undefined, 'tour_started');
    let len = 0, px = o.x, pz = o.z;
    const rings = route.map((q) => {
      const y = W.groundHeight(q.x, q.z, 1e4) + 28 + Math.random() * 10;
      const mat = new THREE.MeshBasicMaterial({ color: TYPES.tour.color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
      const r = new THREE.Mesh(ringGateGeo, mat); r.position.set(q.x, y, q.z); r.rotation.y = Math.atan2(q.x - px, q.z - pz);
      len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z;
      scene.add(r); return { r, q, mat };
    });
    const m = { i: 0, t: len / 26 + 35 };
    banner('Обліт пам’яток', `${rings.length} кілець · Shift – злітай`, TYPES.tour.color);
    m.update = (dt) => {
      m.t -= dt; setTimer(m.t); setBar(m.i / rings.length, 'Кільця');
      const R = rings[m.i];
      rings.forEach((x, k) => { x.mat.opacity = k === m.i ? 0.85 : k > m.i ? 0.22 : 0; x.r.rotation.z += dt * (k === m.i ? 0.8 : 0.2); });
      setObj(`Пролети крізь кільце ${m.i + 1} з ${rings.length}: ${R.q.name}`, R.r.position);
      if (P().distanceTo(R.r.position) < 10.5) {
        m.i++; if (m.i >= rings.length) return end(true, 'Усі пам’ятки облетіли', 500 + Math.round(m.t * 5), 0, 'tour_completed');
        m.t += 4; cue('mission', { kind: 'ring', i: m.i, vo: m.i === 1 || m.i === rings.length - 1 ? 'tour_ring_passed' : null });
      }
      if (m.t <= 0) end(false, 'Час вийшов', 0, 0, 'tour_failed_timeout');
    };
    m.cleanup = () => rings.forEach(x => { scene.remove(x.r); x.mat.dispose(); });
    return m;
  };

  const START = { mugging: startMugging, chase: startChase, courier: startCourier, taxi: startTaxi, tour: startTour };
  const tryStart = (o) => {
    if (o.type === 'mugging' && (!o.thugs?.length || !o.victim)) return false;
    if (o.type === 'taxi' && !o.fare) return false;
    if (o.type === 'chase' && !o.car) return false;
    const m = START[o.type](o);
    if (!m) { dropOffer(o); return false; }
    active = m; m.type = o.type;
    o.b.dispose(); o.b = null; offers.splice(offers.indexOf(o), 1);
    return true;
  };

  // ---------------------------------------------------------------- dispatcher: one call at a time
  // A call comes in a few seconds after the last mission (won or lost): banner + the one marker (pillar, minimap disc,
  // objective arrow) + the panel with the dispatcher's line, the street and the time left to answer. Unanswered calls
  // lapse and a new one comes in; N skips the call; after a failure Enter retries the same kind of job.
  const ROADS = (map?.roads || []).filter(r => r.n && r.p?.length >= 4);
  const streetAt = (x, z) => {
    let best = null, bd = 60;
    for (const r of ROADS) {
      const q = r.p; if (Math.abs(q[0] - x) > 1500 || Math.abs(q[1] - z) > 1500) continue;
      for (let i = 0; i + 3 < q.length; i += 2) {
        const dx = q[i + 2] - q[i], dz = q[i + 3] - q[i + 1], L2 = dx * dx + dz * dz || 1, t = clamp(((x - q[i]) * dx + (z - q[i + 1]) * dz) / L2, 0, 1);
        const d = Math.hypot(x - q[i] - dx * t, z - q[i + 1] - dz * t); if (d < bd) { bd = d; best = r.n; }
      }
    }
    return best;
  };
  const LINES = {
    mugging: (s) => `Грабують перехожого${s ? ` – ${s}` : ''}. Зупини їх, але не зачепи жертву!`,
    chase: (s) => `Пограбування${s ? ` – ${s}` : ''}! Грабіжники тікатимуть на чорному позашляховику.`,
    courier: (s) => `Термінова посилка чекає${s ? ` – ${s}` : ''}. Забери і доправ вчасно.`,
    taxi: (s) => `Клієнт викликає таксі${s ? ` – ${s}` : ''}.`,
    tour: (s) => `Екскурсія з повітря над пам’ятками, старт${s ? ` – ${s}` : ''}.`,
  };
  let lastType = null, retryType = null, retryT = 0, forceType = null;
  const newCall = () => {
    const can = available(), ks = can.filter(k => k !== lastType);
    if (forceType && !can.includes(forceType)) forceType = null;
    if (!ks.length) return false;
    let type = forceType; forceType = null;
    if (!type) { let tot = 0; for (const k of ks) tot += TYPES[k].weight; let r = Math.random() * tot; type = ks.find(k => (r -= TYPES[k].weight) <= 0) || ks[0]; }
    const o = makeOffer(type); if (!o) return false;
    o.ttl = 150; o.street = streetAt(o.x, o.z); o.line = LINES[type](o.street);
    offers.push(o); lastType = type;
    banner('Новий виклик', `${TYPES[type].title}${o.street ? ` · ${o.street}` : ''}`, TYPES[type].color);
    cue('mission', { kind: 'call', type });
    return true;
  };
  const abandon = () => { if (!active) return false; end(false, 'Місію скасовано', 0, 0, 'mission_abandoned'); return true; };
  const skip = () => {
    if (active || !offers.length) return false;
    dropOffer(offers[0]); banner('Виклик пропущено', 'Наступний за мить', '#9aa4b8'); cool = 2.5; cue('mission', { kind: 'skip' }); return true;
  };
  const retry = () => {
    if (active || !(retryT > 0) || !retryType) return false;
    for (const o of offers.slice()) dropOffer(o);
    forceType = retryType; retryT = 0; cool = 0; spawnT = 0; return true;
  };
  // keys: through core/input.js when given (latched per frame, scriptable), else plain keydown listeners
  const keyQ = [];
  if (input?.bind) {
    input.bind('missionAbort', ['Backspace']); input.bind('missionSkip', ['KeyN']); input.bind('missionRetry', ['Enter', 'NumpadEnter']);
    input.bind('missionToggle', ['KeyJ']);
  } else if (typeof addEventListener === 'function') {
    addEventListener('keydown', (e) => {
      if (e.code === 'Backspace' && active) e.preventDefault();
      keyQ.push(e.code === 'Backspace' ? 'missionAbort' : e.code === 'KeyN' ? 'missionSkip' : /Enter$/.test(e.code) ? 'missionRetry' : e.code === 'KeyJ' ? 'missionToggle' : null);
    });
  }
  function pollKeys() {
    const hit = (a) => (input?.pressed ? input.pressed(a) : keyQ.includes(a));
    if (hit('missionAbort')) abandon();
    if (hit('missionSkip')) skip();
    if (hit('missionRetry')) retry();
    if (hit('missionToggle')) setEnabled(!enabled);
    keyQ.length = 0;
  }
  // the on / off switch: off drops everything without a fine or a failure banner
  let enabled = true;
  try { enabled = localStorage.getItem(ON_KEY) !== 'off'; } catch { /* storage off */ }
  const setEnabled = (on) => {
    on = !!on; if (on === enabled) return enabled;
    enabled = on;
    try { localStorage.setItem(ON_KEY, on ? 'on' : 'off'); } catch { /* storage off */ }
    if (!on) {
      const m = active; active = null; endInfo = null; retryT = 0;
      try { m?.cleanup?.(false); } catch (e) { console.error('[missions] cleanup', e); }
      for (const o of offers.slice()) dropOffer(o);
      ui.setPanel(false); setObj('', null); ui.setHint(null); hintO = null; hud?.setMarkers?.([]);
      banner('Місії вимкнено', 'Виклики не надходитимуть · J – увімкнути', '#9aa4b8');
    } else { cool = 3; spawnT = 0; banner('Місії увімкнено', 'Новий виклик за мить · J – вимкнути', '#6ee08a'); }
    hud?.setMissionsOn?.(enabled);
    track('missions_toggle', { on: enabled });
    return enabled;
  };
  hud?.setMissionsOn?.(enabled);
  const onEnd = (ok, type) => { cool = ok ? 7 : 5; spawnT = 0; if (!ok) { retryType = type; retryT = 10; } else retryT = 0; };

  let hintO = null;
  const api = {
    get offers() { return offers; }, get active() { return active; }, get money() { return money; },
    TYPES, addMoney, abandon, skip, retry, available,
    get enabled() { return enabled; }, setEnabled, toggle: () => setEnabled(!enabled),
    start(type) { // debug: a call of `type` right here, started at once
      if (!enabled || !available().includes(type)) return false;
      for (const o of offers.slice()) dropOffer(o);
      const o = makeOffer(type); if (!o) return false; offers.push(o); stage(o); return tryStart(o);
    },
    update(dt) {
      if (!(dt > 0)) return;
      dt = Math.min(dt, 0.1);
      linkT -= dt; retryT -= dt;
      clock += dt;
      for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].at <= clock) { const j = jobs.splice(i, 1)[0]; try { j.fn(); } catch (e) { console.error('[missions] job', e); } }
      pollKeys();
      if (!enabled) return;
      const p = P();
      if (active) {
        try { active.update(dt); } catch (e) { console.error('[missions]', e); end(false, 'Помилка місії'); }
        if (!active && endInfo) { onEnd(endInfo.ok, endInfo.type); endInfo = null; }
      } else {
        crash.length = 0;
        if (endInfo) { onEnd(endInfo.ok, endInfo.type); endInfo = null; }
        if (!offers.length && (cool -= dt) < 0 && (spawnT -= dt) <= 0) { spawnT = 1.5; newCall(); }
      }
      const o = offers[0];
      if (o && !active) {
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        o.ttl -= dt;
        if (o.ttl <= 0 || d > 1300) { dropOffer(o); banner('Виклик скасовано', o.ttl <= 0 ? 'Ніхто не приїхав' : 'Надто далеко', '#9aa4b8'); cool = 25; cue('mission', { kind: 'lapse' }); } // a pause, so a fast flight past calls is not a stream of them
        else {
          if (!o.staged && d < 260) stage(o); else if (o.staged && d > 420) unstage(o);
          const k = 1 + 0.06 * Math.sin(clock * 3.3); o.b.ring.scale.setScalar(o.b.r * k);
          if (o.parcel) { o.parcel.rotation.y += dt; o.parcel.position.y = o.y + 0.9 + Math.sin(clock * 2.5) * 0.15; }
          if (o.type === 'chase' && o.car) o.car.draw();
          ui.setPanel(true, TYPES[o.type].color, `Виклик · ${TYPES[o.type].title}`);
          setObj(`${o.line} ${d > 60 ? `(${d > 1000 ? (d / 1000).toFixed(1) + ' км' : Math.round(d / 10) * 10 + ' м'})` : ''}`, new THREE.Vector3(o.x, o.y + 2, o.z));
          setBar(null); setTimer(o.ttl);
          if (d < TYPES[o.type].start && Math.abs(p.y - 0.95 - o.y) < 8) tryStart(o);
        }
      } else if (!active) { ui.setPanel(false); if (objPos) setObj('', null); }
      const hint = !active && o && Math.hypot(o.x - p.x, o.z - p.z) < 90 ? o : !active && retryT > 0 ? 'retry' : null;
      if (hint !== hintO) {
        hintO = hint;
        ui.setHint(hint === 'retry' ? 'Enter – спробувати ще раз' : hint ? `${TYPES[hint.type].title}: ${hint.type === 'mugging' || hint.type === 'chase' ? 'під’їдь ближче' : 'заїдь у коло'} · N – інший виклик` : null);
      }
      hud?.setMarkers?.(!active && o ? [{ x: o.x, z: o.z, color: TYPES[o.type].color, label: TYPES[o.type].letter }] : []);
    },
  };
  hud?.setObjective?.(null);
  if (typeof window !== 'undefined') window.__missions = api;
  return api;
}
