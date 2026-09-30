// Screen-space HUD: chase-view speed readout, rotating minimap + compass strip, the objective indicator (diamond on
// screen, pinned to the left / right edge with an arrow and the distance when off screen or behind), the mission panel
// (title, objective text, labelled condition bar with hit shake and "−N%" toasts, timer, banners, money with a flash,
// hint line), the controls card (every key the game knows, grouped; toggled by H or the always-visible "H" chip, which
// stays on screen even with the HUD hidden; the "Бот" chip next to it opens the game's Telegram bot, the "B – На старт"
// chip after it calls hud.onHome (a stuck car goes back to the start), the "🔔 Новини" chip opens the bot's daily news
// subscription (t.me/…?start=sub), the "Q – Радіо" chip after that calls hud.onRadio and
// shows what plays (hud.setRadio), and while it plays an "E – Далі" chip next to it calls hud.onRadioNext; an "M – Велика мапа"
// chip over the minimap opens the big map) and the full-screen
// city map (bigmap.js). Both maps share one painter (mapdraw.js):
// tiles with the sight / partner footprints highlighted, the world.places badges and street names (on the minimap: the few
// nearest, anchored to their streets).
//
//   createHud({ player, world, camera, container = document.body, features? }) -> hud
//     player: the car (position, velocity, yaw); world: the city contract (features: world.mapFeatures, else
//       world.cherkasy.map, else world.getMapFeatures(); none -> a sampled fallback from collision.topAt / ground)
//     features (optional override): { blocks: [[outerRing, ...holes]], water: [[rings]], parks: [[rings]],
//       buildings: [ring], roads: [{ p: [x,z,..], w }] }   rings are flat [x0, z0, x1, z1, ...] in world metres
//   hud.update(dt)                         per frame: objective projection + compass every frame, map at ~25 Hz;
//                                          while the big map is open only the big map (the game is paused meanwhile)
//   hud.setTelemetry(state, vF, camMode)   the car's per-frame readout (state: grounded, alt, gear, wing, airT, stall,
//                                          airbrake); in flight it also shows the "S – glide down" tip
//   hud.setObjective(pos | null)           world position (copied); non-finite -> cleared
//   hud.setMarkers([{ x, z, color, label }])  replaces the mission markers (minimap discs)
//   hud.setExplore(n, total, flash?)       the "📍 n / total пам’яток" counter under the money (a click opens the map)
//   hud.setVisible(bool), hud.showHelp(bool), hud.toggleHelp() (also un-hides the HUD), hud.objective (read-only copy or null), hud.visible
//   hud.mission = { setPanel(on, color?, title?), setText(s), setBar(f | null, label, dmg), setTimer(sec | null),
//                   banner(title, sub?, color?), setMoney(n), flashMoney(), setHint(text | null) }
//   hud.map = { open(), close(), toggle(), isOpen }   the full-screen map (M in main.js; Esc closes it too)
//   hud.onHome = fn                      set by main: the "На старт" chip calls it
//   hud.onRadio = fn, hud.onRadioNext = fn, hud.setRadio({ on, loading, title, artist, empty })   the radio chips
//                                        (src/audio/radio.js state)
//   hud.root (the HUD layer, hidden by F2), hud.stats() -> { tilesPending, mapMs, features, places }, hud.dispose()
// Map frame: canvas x = world x, canvas y = world z (a top view seen from +y); north from render/daylight.js.
import * as THREE from 'three';
import { enuToWorld } from '../render/daylight.js';
import { createMapPainter, COL, LEVELS, layAlong } from './mapdraw.js';
import { createBigMap } from './bigmap.js';
import { botLink, BOT_NAME } from './botlink.js';
import './hud.css';

const VIEW_M = 300;                         // metres across the minimap's width
const MAP_HZ = 25, DPR_MAX = 1.75;
// minimap street names: small, one per street and a few in all, centred on anchors every STREET_STEP metres along the street
// (fixed in the world, so a name rides with the map instead of sliding along its street)
const STREET_FONT = '600 9.5px system-ui, -apple-system, "Segoe UI", sans-serif', STREET_STEP = 30, STREET_MAX = 5;
const HELP_SECONDS = 28;
// the controls card: [group, [[keys, what it does], ...]]; keys: ' / ' separates alternatives, a run of short symbols
// ('+ −') becomes one keycap each
const HELP = [
  ['Їзда', [['W / S', 'газ / гальмо, задній хід'], ['A / D', 'кермо'], ['Space', 'ручник'], ['F', 'сигнал: люди попереду розбігаються'], ['R', 'поставити авто на дорогу'], ['B / Home', 'застряг? повернутись на старт']]],
  ['Політ', [['Shift', 'тримай: крила + реактивна тяга, відрив ~150 км/год'], ['W', 'крейсерська тяга'], ['S', 'повітряне гальмо'],
    ['↑ / ↓', 'ніс вниз / вгору'], ['Space / Ctrl', 'набір висоти / пікірування'], ['A / D', 'віраж']]],
  ['Камера', [['C', 'кабіна / вид ззаду'], ['Миша', 'огляд (клік по грі захоплює курсор)'], ['Esc', 'відпустити курсор']]],
  ['Місії', [['', 'заїдь у стовп світла, щоб узяти виклик'], ['N', 'інший виклик'], ['Backspace', 'скасувати місію'], ['Enter', 'ще раз після невдачі']]],
  ['Мапа', [['M', 'карта міста (гра на паузі)'], ['M / Esc', 'закрити карту'], ['Колесо / + −', 'масштаб'], ['Тягни / ←↑→↓ / WASD', 'рух карти'],
    ['Space', 'до авто'], ['', 'наведи на значок – опис місця і відстань'], ['', 'під’їдь до кожної пам’ятки: відвідані на мапі з ✓, решта бліді'], ['Клік', 'по рожевому значку – сайт партнера']]],
  ['Партнери', [['', 'рожеве коло біля будівлі – заїдь, щоб побачити пропозицію'], ['O', 'відкрити сайт партнера']]],
  ['Радіо', [['Q', 'увімкнути / вимкнути (за замовчуванням вимкнене)'], ['E', 'наступний трек']]],
  ['Інше', [['H', 'ця довідка'], ['F2', 'сховати / показати інтерфейс'], ['T', 'час доби: ранок / день / вечір'], ['G', 'графіка простіша (з низької – знову висока)'], ['F9', 'якість графіки (по колу)']]],
  ['Геймпад', [['Лівий стік', 'кермо, газ'], ['Правий стік', 'огляд'], ['Курки', 'газ / гальмо'], ['A / B', 'ручник, вгору / пікірування'],
    ['RB', 'крила + тяга'], ['R3', 'сигнал'], ['X / Y', 'на дорогу / камера'], ['Start', 'довідка']]],
];
const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const keysHtml = (k) => k.split(' / ').map((alt) => (alt.split(' ').every((w) => w.length <= 2) ? alt.split(' ') : [alt])
  .map((w) => `<kbd>${esc(w)}</kbd>`).join('')).join('<i>/</i>');
const helpHtml = () => HELP.map(([title, rows]) => `<section><h5>${title}</h5>${rows.map(([k, t]) =>
  `<div class="r"><span class="k">${k ? keysHtml(k) : ''}</span><span class="t">${esc(t)}</span></div>`).join('')}</section>`).join('');
const NORTH = enuToWorld(0, 1, 0), EAST = enuToWorld(1, 0, 0);
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} км` : `${Math.round(m / 10) * 10} м`);

export function createHud({ player, world, camera, container = globalThis.document?.body, features = null }) {
  const doc = container.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud-speed"><div class="v">0</div><div class="u">КМ/ГОД</div></div>
    <div class="hud-nav"><button class="hud-mapkey" type="button" title="Карта міста (M)"><kbd>M</kbd><span>Велика мапа</span></button><canvas class="hud-compass"></canvas><canvas class="hud-map"></canvas></div>
    <div class="hud-pin off"><div class="mk"></div><div class="d"></div></div>
    <div class="hud-money"><b>₴</b><span>0</span></div>
    <button class="hud-explore off" type="button" title="Пам’ятки Черкас: під’їдь до кожної (M – мапа)"><i>📍</i><b>0</b><span>/ 0 пам’яток</span></button>
    <div class="hud-panel off"><div class="ttl"></div><div class="obj"></div>
      <div class="row"><span class="bl"></span><div class="bar"><i></i></div><div class="tm"></div></div></div>
    <div class="hud-toast"></div><div class="hud-banner"></div><div class="hud-hint"></div>
    <div class="hud-fly"><kbd>S</kbd> – скинути швидкість і спланувати вниз</div>
    <button class="hud-helpkey" type="button" title="Керування (H)"><kbd>H</kbd><span>Керування</span></button>
    <a class="hud-botkey" href="${botLink()}" target="_blank" rel="noopener" title="Telegram-бот гри"><i>✈</i><span>Бот</span></a>
    <button class="hud-homekey" type="button" title="Повернутись на старт (B)"><kbd>B</kbd><span>На старт</span></button>
    <a class="hud-botkey hud-newskey" href="${botLink('sub')}" target="_blank" rel="noopener" title="Раз на день, о 21:00, що нового в грі – у Telegram"><i>🔔</i><span>Новини</span></a>
    <button class="hud-radiokey" type="button" title="Радіо: Q – увімк. / вимк., E – наступний трек"><kbd>Q</kbd><span>Радіо</span></button>
    <button class="hud-radionext off" type="button" title="Наступний трек (E)"><kbd>E</kbd><span>Далі</span></button>
    <div class="hud-help"><h4>КЕРУВАННЯ</h4><div class="cols">${helpHtml()}</div>
      <p class="bot">✈ Ідея, баг, покращення будинку чи реклама в грі – <a href="${botLink()}" target="_blank" rel="noopener">@${BOT_NAME}</a> у Telegram.
      На карті (M) правий клік – покращити саме це місце.<br>
      🔔 Що нового в грі – раз на день о 21:00 у боті: <a href="${botLink('sub')}" target="_blank" rel="noopener">підписатись</a>.</p></div>`;
  container.appendChild(root);
  const $ = (q) => root.querySelector(q);
  const el = {
    speed: $('.hud-speed'), speedV: $('.hud-speed .v'), speedU: $('.hud-speed .u'),
    compass: $('.hud-compass'), map: $('.hud-map'), pin: $('.hud-pin'), pinMk: $('.hud-pin .mk'), pinD: $('.hud-pin .d'),
    money: $('.hud-money'), moneyV: $('.hud-money span'), panel: $('.hud-panel'), ttl: $('.hud-panel .ttl'), obj: $('.hud-panel .obj'),
    bl: $('.hud-panel .bl'), bar: $('.hud-panel .bar'), barI: $('.hud-panel .bar i'), tm: $('.hud-panel .tm'),
    toast: $('.hud-toast'), banner: $('.hud-banner'), hint: $('.hud-hint'), fly: $('.hud-fly'), help: $('.hud-help'), helpKey: $('.hud-helpkey'), botKey: $('.hud-botkey'), newsKey: $('.hud-newskey'), homeKey: $('.hud-homekey'), radioKey: $('.hud-radiokey'), radioT: $('.hud-radiokey span'), radioNext: $('.hud-radionext'), mapKey: $('.hud-mapkey'),
    explore: $('.hud-explore'), exploreN: $('.hud-explore b'), exploreT: $('.hud-explore span'),
  };
  const mapG = el.map.getContext('2d'), cmpG = el.compass.getContext('2d');

  // ---------------------------------------------------------------- state
  let visible = true, helpOn = true, helpForced = false, helpT = HELP_SECONDS;
  let objective = null, markers = [];
  let size = { w: 1, h: 1, mw: 1, mh: 1, cw: 1, ch: 1, dpr: 1 };
  let mapAcc = 1;
  const texts = new Map(); // element -> last text (DOM writes only on change)
  const setText = (e, t) => { if (texts.get(e) !== t) { texts.set(e, t); e.textContent = t; } };
  const setClass = (e, c, on) => { if (e.classList.contains(c) !== on) e.classList.toggle(c, on); };

  // ---------------------------------------------------------------- sizes (read on resize only)
  function measure() {
    const dpr = Math.min(DPR_MAX, globalThis.devicePixelRatio || 1);
    const w = globalThis.innerWidth || 1280, h = globalThis.innerHeight || 720;
    const mw = Math.round(Math.max(200, Math.min(340, w * 0.17))), mh = Math.round(mw * 0.62), ch = 22;
    size = { w, h, mw, mh, cw: mw, ch, dpr };
    for (const [c, cw, chh] of [[el.map, mw, mh], [el.compass, mw, ch]]) {
      c.style.width = `${cw}px`; c.style.height = `${chh}px`;
      c.width = Math.round(cw * dpr); c.height = Math.round(chh * dpr);
    }
    mapAcc = 1;
    el.botKey.style.left = `${el.helpKey.offsetLeft + el.helpKey.offsetWidth + 8}px`; // right next to the H chip
    el.homeKey.style.left = `${el.botKey.offsetLeft + el.botKey.offsetWidth + 8}px`;
    el.newsKey.style.left = `${el.homeKey.offsetLeft + el.homeKey.offsetWidth + 8}px`;
    placeRadio();
  }
  function placeRadio() { // last in the row: the radio chip grows with the track name and the "next" chip follows it
    el.radioKey.style.left = `${el.newsKey.offsetLeft + el.newsKey.offsetWidth + 8}px`;
    el.radioNext.style.left = `${el.radioKey.offsetLeft + el.radioKey.offsetWidth + 6}px`;
  }
  const onResize = () => measure();
  globalThis.addEventListener?.('resize', onResize);
  measure();

  // ---------------------------------------------------------------- map tiles (shared with the big map)
  const painter = createMapPainter({ world, features, doc });
  const bigmap = createBigMap({ painter, player, container, map: world?.cherkasy?.map, getObjective: () => objective, getMarkers: () => markers });
  let lastMapMs = 0;

  // ---------------------------------------------------------------- per-frame helpers
  const [_f, _v, _c] = [0, 0, 0].map(() => new THREE.Vector3());
  let camYaw = 0; // canvas rotation that puts the camera's forward at map-up
  function cameraForward() {
    camera.getWorldDirection(_f); _f.y = 0;
    if (!(_f.lengthSq() > 1e-8)) _f.set(Math.sin(player?.yaw || 0), 0, Math.cos(player?.yaw || 0));
    return _f.normalize();
  }
  const bearingOf = (dx, dz) => Math.atan2(dx * EAST.x + dz * EAST.z, dx * NORTH.x + dz * NORTH.z); // 0 = north, +east

  function drawMap() {
    const { mw, mh, dpr } = size, g = mapG, P = player.position;
    const scale = mw / VIEW_M; // css px per metre
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COL.block; g.fillRect(0, 0, mw, mh);
    const cx = mw / 2, cy = mh * 0.58; // the player sits a bit below the centre: more view ahead
    // world -> map: centre on the player, turn the camera heading up, metres -> css px
    g.save();
    g.setTransform(dpr, 0, 0, dpr, dpr * cx, dpr * cy); g.rotate(camYaw); g.scale(scale, scale); g.translate(-P.x, -P.z);
    const R = Math.hypot(mw, mh) / scale, TILE = LEVELS.mini.m;
    painter.frame();
    const i0 = Math.floor((P.x - R) / TILE), i1 = Math.floor((P.x + R) / TILE), j0 = Math.floor((P.z - R) / TILE), j1 = Math.floor((P.z + R) / TILE);
    g.imageSmoothingEnabled = true;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const t = painter.tile('mini', i, j);
      if (t.ready || t.row > 0) g.drawImage(t.c, i * TILE, j * TILE, TILE, TILE);
    }
    g.restore();
    // screen position of a world point on the map, clamped into the frame (returns whether it was clamped)
    const toMap = (x, z, out, pad) => {
      const dx = (x - P.x) * scale, dz = (z - P.z) * scale, c = Math.cos(camYaw), s = Math.sin(camYaw);
      let u = dx * c - dz * s, v = dx * s + dz * c;
      const hx = cx - pad, hy1 = cy - pad, hy2 = mh - cy - pad, k = Math.max(Math.abs(u) / hx, v < 0 ? -v / hy1 : v / hy2, 1);
      u /= k; v /= k; out.x = cx + u; out.y = cy + v; out.clamped = k > 1.0001;
      return out;
    };
    const q = { x: 0, y: 0, clamped: false };
    drawStreetNames(g, toMap, scale, cx, cy);
    // sights and partners in view: small upright badges (partners a bit bigger), never pinned to the rim
    for (const p of painter.places) {
      if (p.kind === 'improved') continue; // only its grey footprint (in the tiles)
      toMap(p.x, p.z, q, 0);
      if (q.clamped) continue;
      const img = painter.icon(p, p.kind === 'ad' ? 17 : 14, dpr), d = img.width / dpr;
      g.drawImage(img, q.x - d / 2, q.y - d / 2, d, d);
    }
    // mission markers: upright discs with a letter
    g.font = '700 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of markers) {
      toMap(m.x, m.z, q, 9);
      g.beginPath(); g.arc(q.x, q.y, 8, 0, Math.PI * 2); g.fillStyle = m.color || '#f5c52e'; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(10,14,22,.85)'; g.stroke();
      g.fillStyle = '#0d1117'; g.fillText(String(m.label || '').slice(0, 2), q.x, q.y + 0.5);
    }
    // objective: a yellow diamond (an arrow on the rim when clamped)
    if (objective) {
      toMap(objective.x, objective.z, q, 7);
      g.save(); g.translate(q.x, q.y);
      if (q.clamped) g.rotate(Math.atan2(q.y - cy, q.x - cx) + Math.PI / 2);
      g.beginPath();
      if (q.clamped) { g.moveTo(0, -7); g.lineTo(6, 5); g.lineTo(-6, 5); } else { g.moveTo(0, -6); g.lineTo(6, 0); g.lineTo(0, 6); g.lineTo(-6, 0); }
      g.closePath(); g.fillStyle = '#ffd24a'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#1a1405'; g.stroke();
      g.restore();
    }
    // the player: an arrow along the travel direction (the nose when nearly stopped)
    const V = player.velocity, moving = V && Math.hypot(V.x, V.z) > 1.5;
    const dx = moving ? V.x : Math.sin(player.yaw || 0), dz = moving ? V.z : Math.cos(player.yaw || 0);
    g.save(); g.translate(cx, cy); g.rotate(Math.atan2(dz, dx) + camYaw + Math.PI / 2);
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#0d1117'; g.stroke();
    g.restore();
    g.strokeStyle = COL.edge; g.lineWidth = 1; g.strokeRect(0.5, 0.5, mw - 1, mh - 1);
  }

  // street names along the streets under the minimap, upright and clear of each other (the arrow and badges draw on top);
  // plain streets drop the "вул." to fit the small frame
  const glyphW = new Map();
  const widthOf = (ch) => { let w = glyphW.get(ch); if (w == null) { mapG.font = STREET_FONT; w = mapG.measureText(ch).width; glyphW.set(ch, w); } return w; };
  function drawStreetNames(g, toMap, scale, cx, cy) {
    const { mw, mh } = size, P = player.position, R = Math.hypot(mw, mh) / scale;
    const inside = (x, y) => x > 6 && y > 6 && x < mw - 6 && y < mh - 6;
    const boxes = [], arrow = { x0: cx - 12, y0: cy - 12, x1: cx + 12, y1: cy + 12 };
    const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    const q = { x: 0, y: 0, clamped: false };
    let n = 0;
    g.font = STREET_FONT; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const c of painter.streets()) {
      if (n >= STREET_MAX) break;
      if (c.x1 < P.x - R || c.x0 > P.x + R || c.z1 < P.z - R || c.z0 > P.z + R) continue;
      const label = c.miniLabel ??= c.label.replace(/^вул\.\s+|\s+вул\.$/, '');
      let tw = 0; for (const ch of label) tw += widthOf(ch);
      if (c.len * scale < tw + 16) continue;
      if (!c.cum) { c.cum = [0]; for (let i = 2; i < c.p.length; i += 2) c.cum.push(c.cum[c.cum.length - 1] + Math.hypot(c.p[i] - c.p[i - 2], c.p[i + 1] - c.p[i - 1])); }
      const Pm = [], cum = c.cum.map((v) => v * scale), total = cum[cum.length - 1];
      for (let i = 0; i < c.p.length; i += 2) { toMap(c.p[i], c.p[i + 1], q, -1e9); Pm.push(q.x, q.y); }
      let RP = null;
      const tryAt = (m, strict) => { // the label centred at arc m (metres) of the street, or null (strict: off the arrow)
        const a = m * scale - tw / 2;
        if (a < 2 || a + tw > total - 2) return null;
        let lay = layAlong(Pm, cum, a, label, widthOf, inside);
        if (lay && Math.cos(lay[lay.length >> 1].ang) < 0) { // heads left on screen: lay it on the reversed path
          if (!RP) { RP = []; for (let i = Pm.length - 2; i >= 0; i -= 2) RP.push(Pm[i], Pm[i + 1]); }
          lay = layAlong(RP, cum.map((v) => total - v).reverse(), total - a - tw, label, widthOf, inside);
        }
        if (!lay) return null;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const k of lay) { x0 = Math.min(x0, k.x); y0 = Math.min(y0, k.y); x1 = Math.max(x1, k.x); y1 = Math.max(y1, k.y); }
        const box = { x0: x0 - 5, y0: y0 - 6, x1: x1 + 5, y1: y1 + 6 };
        return (strict && overlaps(box, arrow)) || boxes.some((b) => overlaps(box, b)) ? null : { lay, box, m };
      };
      // keep last frame's spot while it still fits, else the first free anchor on the stretch under the map; off the
      // player's arrow when the street allows it
      const scan = (strict) => {
        if (c.miniAt != null) { const h = tryAt(c.miniAt, strict); if (h) return h; }
        for (let i = 0; i < c.p.length - 2; i += 2) {
          const ax = c.p[i], az = c.p[i + 1], ex = c.p[i + 2] - ax, ez = c.p[i + 3] - az, L = c.cum[(i >> 1) + 1] - c.cum[i >> 1];
          const t = Math.max(0, Math.min(1, ((P.x - ax) * ex + (P.z - az) * ez) / (L * L || 1))); // nearest point of the segment
          if (Math.hypot(ax + ex * t - P.x, az + ez * t - P.z) > R) continue;
          for (let m = Math.ceil(c.cum[i >> 1] / STREET_STEP) * STREET_STEP; m < c.cum[i >> 1] + L; m += STREET_STEP) {
            const h = tryAt(m, strict); if (h) return h;
          }
        }
        return null;
      };
      const hit = scan(true) || scan(false);
      c.miniAt = hit ? hit.m : null;
      if (!hit) continue;
      boxes.push(hit.box); n++;
      for (const pass of [0, 1]) for (const k of hit.lay) {
        g.save(); g.translate(k.x, k.y); g.rotate(k.ang);
        if (pass === 0) { g.lineWidth = 2.6; g.strokeStyle = 'rgba(14,20,32,.9)'; g.strokeText(k.ch, -widthOf(k.ch) / 2, 0); }
        else { g.fillStyle = c.rank < 2 ? '#eef2fa' : '#cdd6e6'; g.fillText(k.ch, -widthOf(k.ch) / 2, 0); }
        g.restore();
      }
    }
  }

  const CARD = [['Пн', 0], ['ПнСх', 45], ['Сх', 90], ['ПдСх', 135], ['Пд', 180], ['ПдЗх', 225], ['Зх', 270], ['ПнЗх', 315]];
  function drawCompass(f) {
    const { cw, ch, dpr } = size, g = cmpG;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.fillStyle = 'rgba(10,15,24,.62)'; g.fillRect(0, 0, cw, ch);
    const head = bearingOf(f.x, f.z) * 180 / Math.PI, span = 180, pxPerDeg = cw / span;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 15) {
      let rel = d - head; rel = ((rel + 540) % 360) - 180;
      if (Math.abs(rel) > span / 2) continue;
      const x = cw / 2 + rel * pxPerDeg, card = CARD.find((c) => c[1] === d);
      if (card) {
        g.font = card[0].length < 3 ? '700 12px system-ui, sans-serif' : '600 9px system-ui, sans-serif';
        g.fillStyle = card[0] === 'Пн' ? '#ff6a55' : '#e8eef7'; g.fillText(card[0], x, ch / 2 + 1);
      } else { g.fillStyle = 'rgba(232,238,247,.45)'; g.fillRect(x - 0.5, ch - 6, 1, 5); }
    }
    if (objective) {
      const P = player.position;
      let rel = bearingOf(objective.x - P.x, objective.z - P.z) * 180 / Math.PI - head; rel = ((rel + 540) % 360) - 180;
      const x = cw / 2 + THREE.MathUtils.clamp(rel, -span / 2 + 3, span / 2 - 3) * pxPerDeg;
      g.fillStyle = '#ffd24a'; g.beginPath(); g.moveTo(x, 1); g.lineTo(x + 4, 6); g.lineTo(x - 4, 6); g.closePath(); g.fill();
    }
    g.fillStyle = '#ffffff'; g.fillRect(cw / 2 - 0.75, 0, 1.5, 5);
  }

  // objective on screen: diamond in the safe region, else pinned to the left / right edge with an arrow
  let pinSide = 1, pinShown = false;
  function updatePin() {
    if (!objective) { if (pinShown) { el.pin.classList.add('off'); pinShown = false; } return; }
    const { w, h } = size, P = player.position;
    const dist = Math.hypot(objective.x - P.x, objective.z - P.z);
    _c.copy(objective).applyMatrix4(camera.matrixWorldInverse); // camera space: -z ahead
    const mx = w * 0.06, my = h * 0.08;
    let x, y, onScreen = false, ang = 0;
    if (_c.z < -0.5) {
      _v.copy(objective).project(camera);
      x = (_v.x * 0.5 + 0.5) * w; y = (-_v.y * 0.5 + 0.5) * h;
      onScreen = x > mx && x < w - mx && y > my && y < h - my;
    }
    if (!onScreen) {
      if (Math.abs(_c.x) > 0.5 || _c.z < -0.5) pinSide = _c.x >= 0 ? 1 : -1; // straight behind: keep the last side
      const aheadOff = _c.z < -0.5 && x > mx && x < w - mx; // in front and within the width: above / below the view
      if (aheadOff) { y = THREE.MathUtils.clamp(y, my, h - my); ang = y <= my ? -Math.PI / 2 : Math.PI / 2; }
      else {
        x = pinSide > 0 ? w - mx : mx;
        const up = _c.y / Math.max(1, Math.hypot(_c.x, _c.z));
        y = THREE.MathUtils.clamp(h / 2 - up * h * 0.5, my, h - my);
        ang = pinSide > 0 ? 0 : Math.PI;
      }
    }
    if (!pinShown) { el.pin.classList.remove('off'); pinShown = true; }
    setClass(el.pin, 'edge', !onScreen);
    el.pin.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.pinMk.style.transform = onScreen ? 'rotate(45deg)' : `rotate(${ang.toFixed(3)}rad)`;
    setText(el.pinD, fmtDist(dist));
  }

  // ---------------------------------------------------------------- mission panel
  let banT = 0, toastT = 0, barLast = null, hitFlip = false, moneyFlip = false;
  const mission = {
    setPanel(on, color, title) {
      setClass(el.panel, 'off', !on);
      if (on) { if (color) el.panel.style.setProperty('--c', color); if (title != null) setText(el.ttl, title); }
    },
    setText(t) { setText(el.obj, t || ''); },
    setBar(f, label = '', dmg = false) {
      if (f == null || !Number.isFinite(f)) { el.bar.style.display = 'none'; setText(el.bl, ''); barLast = null; return; }
      el.bar.style.display = '';
      setText(el.bl, label ? `${label} ${Math.round(f * 100)}%` : '');
      setClass(el.bar, 'dmg', dmg);
      el.barI.style.width = `${(f * 100).toFixed(1)}%`;
      el.barI.style.background = dmg ? `hsl(${Math.round(f * 120)}, 80%, 52%)` : '';
      el.bl.style.color = dmg && f < 0.35 ? '#ff6a55' : '';
      if (dmg && barLast !== null && barLast - f > 0.015) { // a hit: shake the bar, pop the loss
        hitFlip = !hitFlip; el.bar.classList.remove('hitA', 'hitB'); el.bar.classList.add(hitFlip ? 'hitA' : 'hitB');
        el.toast.textContent = `−${Math.round((barLast - f) * 100)}%`; el.toast.classList.add('on'); toastT = 1.1;
      }
      barLast = f;
    },
    setTimer(t) {
      if (t == null || !Number.isFinite(t)) { setText(el.tm, ''); return; }
      const s = Math.max(0, t);
      setText(el.tm, `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
      setClass(el.tm, 'low', s < 10);
    },
    banner(title, sub = '', color = '#fff') {
      el.banner.replaceChildren(doc.createTextNode(title));
      if (sub) { const sm = doc.createElement('small'); sm.textContent = sub; el.banner.appendChild(sm); }
      el.banner.style.color = color; el.banner.classList.add('on'); banT = 3.2;
    },
    setMoney(n) { setText(el.moneyV, Math.round(n).toLocaleString('uk-UA')); setClass(el.money, 'debt', n < 0); },
    flashMoney() { moneyFlip = !moneyFlip; el.money.classList.remove('fineA', 'fineB'); el.money.classList.add(moneyFlip ? 'fineA' : 'fineB'); },
    setHint(t) { setClass(el.hint, 'on', !!t); if (t) setText(el.hint, t); },
  };

  // ---------------------------------------------------------------- telemetry (the car calls this every frame)
  let camMode = 'chase', telT = 0, flyUsed = false, flyLearned = 0;
  function setTelemetry(s, vF, mode) {
    // the S tip while really flying (wings out, a second in); gone for the flight once S is used, for good after 3 times
    if (s.grounded) flyUsed = false;
    else if (s.airbrake && !flyUsed) { flyUsed = true; flyLearned++; }
    setClass(el.fly, 'on', !s.grounded && s.wing > 0.9 && s.airT > 1 && !(s.stall > 0) && !flyUsed && flyLearned < 3);
    if (mode !== camMode) { camMode = mode; setClass(el.speed, 'hide', mode !== 'chase'); }
    if (mode !== 'chase' || (telT++ & 3)) return; // text at ~15 Hz
    setText(el.speedV, String(Math.round(Math.abs(vF || 0) * 3.6)));
    setText(el.speedU, !s.grounded ? `КМ/ГОД · ВИС ${Math.max(0, Math.round(s.alt || 0))} М`
      : `КМ/ГОД · ${s.gear === -1 ? 'R' : 'D'}${s.wing > 0.05 ? ' · КРИЛА' : ''}`);
  }

  painter.index(); // while the loading screen is still up: indexing the city's ~74k features takes ~0.1 s
  function applyHelp() { setClass(el.help, 'on', helpOn && visible); setClass(el.helpKey, 'act', helpOn && visible); }
  el.helpKey.addEventListener('click', (e) => { e.preventDefault(); el.helpKey.blur(); hud.toggleHelp(); });
  el.homeKey.addEventListener('click', (e) => { e.preventDefault(); el.homeKey.blur(); hud.onHome?.(); });
  el.radioKey.addEventListener('click', (e) => { e.preventDefault(); el.radioKey.blur(); hud.onRadio?.(); });
  el.radioNext.addEventListener('click', (e) => { e.preventDefault(); el.radioNext.blur(); hud.onRadioNext?.(); });
  el.mapKey.addEventListener('click', (e) => { e.preventDefault(); el.mapKey.blur(); bigmap.open(); }); // main.js pauses on hud.map.isOpen
  el.explore.addEventListener('click', (e) => { e.preventDefault(); el.explore.blur(); bigmap.open(); });
  let exploreFlip = false;
  applyHelp();

  const hud = {
    mission, setTelemetry, onHome: null, onRadio: null, onRadioNext: null,
    setRadio({ on, loading, title, artist, empty }) {
      setClass(el.radioKey, 'act', on);
      setText(el.radioT, empty ? 'Радіо: немає треків' : !on ? 'Радіо' : loading && !title ? 'Радіо…' : `♪ ${title}${loading ? '…' : ''}`);
      el.radioKey.title = on && title ? `${title} – ${artist}\nQ – вимкнути, E – наступний трек` : 'Радіо: Q – увімк. / вимк., E – наступний трек';
      setClass(el.radioNext, 'off', !on);
      placeRadio();
    },
    get visible() { return visible; },
    get objective() { return objective ? objective.clone() : null; },
    get helpVisible() { return helpOn; },
    setVisible(v) { visible = !!v; setClass(root, 'hidden', !visible); applyHelp(); if (visible) mapAcc = 1; },
    setExplore(n, total, flash = false) { // the sights counter under the money (explore.js); a new one pops it
      setClass(el.explore, 'off', !total);
      setText(el.exploreN, String(n)); setText(el.exploreT, `/ ${total} пам’яток`);
      setClass(el.explore, 'all', total > 0 && n >= total);
      if (flash) { exploreFlip = !exploreFlip; el.explore.classList.remove('popA', 'popB'); el.explore.classList.add(exploreFlip ? 'popA' : 'popB'); }
    },
    setObjective(p) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) { objective = null; return; }
      objective = (objective || new THREE.Vector3()).set(p.x, Number.isFinite(p.y) ? p.y : player.position.y, p.z);
    },
    setMarkers(list) {
      const out = [];
      for (const m of list || []) if (m && Number.isFinite(m.x) && Number.isFinite(m.z)) out.push({ x: m.x, z: m.z, color: m.color, label: m.label });
      markers = out;
    },
    root, // the HUD layer: other overlays that should hide with F2 go in here
    map: bigmap, painter, // painter: debug handle (tiles, places, street chains)
    showHelp(v) { helpForced = true; helpOn = !!v; applyHelp(); },
    toggleHelp() { // with the HUD hidden (F2) H brings it back with the card open
      if (!visible) { hud.setVisible(true); hud.showHelp(true); } else hud.showHelp(!helpOn);
    },
    update(dt) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      if ((banT -= dt) <= 0 && banT > -1) { el.banner.classList.remove('on'); banT = -1; }
      if ((toastT -= dt) <= 0 && toastT > -1) { el.toast.classList.remove('on'); toastT = -1; }
      if (bigmap.isOpen) { bigmap.update(dt); mapAcc = 1; return; }
      if (!helpForced && helpOn && (helpT -= dt) <= 0) { helpOn = false; applyHelp(); }
      if (!visible) return;
      const f = cameraForward();
      const yaw = -Math.PI / 2 - Math.atan2(f.z, f.x);
      if (Number.isFinite(yaw)) camYaw = yaw; // a broken camera frame keeps the last heading
      if (painter.pending) lastMapMs = painter.work(3);
      mapAcc += dt;
      if (mapAcc >= 1 / MAP_HZ) { mapAcc = 0; drawMap(); }
      drawCompass(f);
      updatePin();
    },
    stats: () => ({ tilesPending: painter.pending, mapMs: +lastMapMs.toFixed(2), features: painter.index().valid, places: painter.places.length, cache: painter.stats() }),
    dispose() { globalThis.removeEventListener?.('resize', onResize); bigmap.dispose(); root.remove(); },
  };
  return hud;
}
