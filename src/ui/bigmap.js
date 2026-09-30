// Full-screen city map (the M key): north up, wheel / keys zoom around the cursor, drag or arrows / WASD to pan. Shows
// the painted city tiles with highlighted sight and partner footprints, street names laid along the streets, place
// badges with labels (improved objects: a grey footprint only, named "Покращений об'єкт" in the legend and on hover;
// sights dim until visited, then checked – game/explore.js; hover: name, note, distance and visited; a partner's footprint glows, a click on its badge opens its site in
// a new tab), the mission markers, the objective (with a straight line from the
// car) and the car itself. A right click offers the Telegram bot at that point (improve this object / advertise here). The game is expected to pause while it is open (main.js reads hud.map.isOpen).
// With a car and onGo, a click on an improved object or a partner's badge asks "Переміститись сюди?"; yes (or Enter)
// calls onGo(place). The partner's site stays in its ring in the world (game/partners.js). Sights are never teleport targets: the explore quest counts them.
// Touch: one finger pans, two pinch-zoom, a tap on a badge shows its card and a second tap opens a partner's site.
//
//   createBigMap({ painter, player, container, map? (map.json: region -> zoom-out limit), getObjective() -> Vector3 | null, getMarkers() -> [{ x, z, color, label }],
//                  home? { x, z }, onGo?(place) (move the car there; main.js) })
//     player null: the map on its own (mapview.js on phones) – no car, no "to the car", no distances; it opens at home
//     -> { open(), close(), toggle(), isOpen, update(dt), dispose() }
// Rendering: a "base" canvas (tiles, footprints, street names, badges) redrawn only when the view, the toggles or the
// tiles change; the visible canvas composites it and draws the live layer (car, objective, markers, pulses) on top.
import { enuToWorld } from '../render/daylight.js';
import { COL, LEVELS, layAlong } from './mapdraw.js';
import { botLink, pointLink } from './botlink.js';
import { track } from '../analytics.js';

const S_MAX = 3.2, S_OPEN = 0.55;                // css px per metre (the minimum fits the whole city)
const PAN_PX = 700;                              // keyboard pan speed, css px / s
const HOLD_PX = 16;                              // a press on a teleport target pans only once it moves this far
const LABEL_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const STREET = [ // per road rank: min zoom, font, colour
  { s: 0.16, font: `700 13px ${LABEL_FONT}`, fill: '#ffffff' },
  { s: 0.38, font: `600 12px ${LABEL_FONT}`, fill: '#e9eef8' },
  { s: 0.5, font: `500 11.5px ${LABEL_FONT}`, fill: '#dbe3f1' },
  { s: 2.0, font: `500 10.5px ${LABEL_FONT}`, fill: '#c9d3e4' },
];
const STORE_KEY = 'cherkasy.map';
const NORTH = enuToWorld(0, 1, 0);
const ROT = -Math.PI / 2 - Math.atan2(NORTH.z, NORTH.x); // canvas rotation that puts north up
const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} км` : `${Math.round(m / 10) * 10} м`);

export function createBigMap({ painter, player, container, map = null, getObjective, getMarkers, home = { x: 0, z: 0 }, onGo = null }) {
  const doc = container.ownerDocument;
  const canGo = (p) => !!(player && onGo && p && (p.kind === 'improved' || (p.kind === 'ad' && p.rings?.length))); // buildings only, never a sight
  const touch = !!globalThis.matchMedia?.('(pointer: coarse)').matches;
  const keysHint = touch ? 'пальцем – рух · двома пальцями – масштаб · торкніться значка – опис'
    : `колесо / + − – масштаб · тягни або стрілки – рух${player ? ' · Пробіл – до авто' : ''} ${player && onGo ? ' · клік по партнеру чи покращеному – переміститись' : ''} · правий клік – покращити місце${player ? ' · M / Esc – закрити' : ''}`;
  const root = doc.createElement('div');
  root.className = 'bigmap off';
  root.innerHTML = `
    <canvas class="bm-canvas"></canvas>
    <div class="bm-vignette"></div>
    <div class="bm-head"><div class="bm-title">ЧЕРКАСИ</div><div class="bm-sub">карта міста</div></div>
    <div class="bm-north"><i></i><span>Пн</span></div>
    <div class="bm-legend">
      <button data-k="sights"><span class="dot sight"></span>Пам’ятки<em class="bm-seen"></em></button>
      <button data-k="ads"><span class="dot ad"></span>Партнери</button>
      <button data-k="streets"><span class="dot street"></span>Вулиці</button>
      ${painter.places.some((p) => p.kind === 'improved') ? '<span class="bm-imp"><span class="dot imp"></span>Покращений об’єкт</span>' : ''}
      ${player ? '<button data-k="me" class="act">◎ До авто</button>' : ''}
      <a class="bm-bot" href="${botLink()}" target="_blank" rel="noopener">✈ Бот: ідея, покращення, реклама</a>
    </div>
    <div class="bm-scale"><i></i><span></span></div>
    <div class="bm-keys">${keysHint}</div>
    <div class="bm-ctx"><a data-f="imp" target="_blank" rel="noopener">🏠 Покращити цей об'єкт</a><a data-f="ad" target="_blank" rel="noopener">📣 Реклама тут</a><small>відкриється бот у Telegram</small></div>
    <div class="bm-go"><b>🚗 Переміститись сюди?</b><span></span><div><button data-a="yes">Так</button><button data-a="no">Ні</button></div></div>
    <div class="bm-tip"><b></b><span></span><em></em><u></u></div>`;
  container.appendChild(root);
  const $ = (q) => root.querySelector(q);
  const cv = $('.bm-canvas'), g = cv.getContext('2d');
  const base = doc.createElement('canvas'), bg = base.getContext('2d');
  let chromeBoxes = [];
  const chrome = ['.bm-head', '.bm-north', '.bm-legend', '.bm-scale', '.bm-keys'].map($);
  const seenEl = $('.bm-seen');
  const el = { scaleI: $('.bm-scale i'), scaleT: $('.bm-scale span'), tip: $('.bm-tip'), tipB: $('.bm-tip b'), tipS: $('.bm-tip span'), tipE: $('.bm-tip em'), tipU: $('.bm-tip u') };

  // ---------------------------------------------------------------- state
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || {}; } catch { return {}; } })();
  const show = { sights: saved.sights !== false, ads: saved.ads !== false, streets: saved.streets !== false };
  let isOpen = false, W = 1, H = 1, dpr = 1, S_MIN = 0.1;
  const B = painter.bounds;
  let s = Number.isFinite(saved.s) ? Math.min(S_MAX, Math.max(0.05, saved.s)) : S_OPEN, ts = s;
  let cx = 0, cz = 0, tcx = 0, tcz = 0;
  let anchor = null;             // zoom anchor { wx, wz, sx, sy }: that world point stays under that screen point
  let baseKey = '', baseLevelReady = true, t = 0;
  let drag = null, hover = null, mouse = null;
  const keys = new Set();
  let placeBoxes = [];           // screen badges of the last base draw (hover picking)
  const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...show, s: +ts.toFixed(3) })); } catch { /* storage off */ } };
  for (const b of root.querySelectorAll('.bm-legend button[data-k]')) {
    const k = b.dataset.k;
    if (k in show) b.classList.toggle('act', show[k]);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (k === 'me') { recenter(); return; }
      show[k] = !show[k]; b.classList.toggle('act', show[k]); baseKey = ''; persist();
    });
  }

  // ---------------------------------------------------------------- view maths (css px; +x right, +y down)
  const ca = () => Math.cos(ROT), sa = () => Math.sin(ROT);
  const toScreen = (x, z, out = {}) => {
    const dx = x - cx, dz = z - cz, c = ca(), n = sa();
    out.x = W / 2 + (dx * c - dz * n) * s; out.y = H / 2 + (dx * n + dz * c) * s;
    return out;
  };
  const toWorld = (sx, sy, sc = s, ox = cx, oz = cz) => { // inverse of toScreen for a given scale / centre
    const u = (sx - W / 2) / sc, v = (sy - H / 2) / sc, c = ca(), n = sa();
    return { x: ox + u * c + v * n, z: oz - u * n + v * c };
  };
  function zoomAt(k, sx = W / 2, sy = H / 2) {
    const w = toWorld(sx, sy);
    ts = Math.min(S_MAX, Math.max(S_MIN, ts * k));
    anchor = { wx: w.x, wz: w.z, sx, sy };
    persist();
  }
  function recenter() { if (player) { anchor = null; tcx = player.position.x; tcz = player.position.z; } }

  function measure() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    W = globalThis.innerWidth || 1280; H = globalThis.innerHeight || 720;
    for (const c of [cv, base]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    if (B) { // zoomed all the way out the whole map region fits (its rotated bounding box)
      const r = map.region || B, w = r.x1 - r.x0, h = r.z1 - r.z0, c = Math.abs(Math.cos(ROT)), n = Math.abs(Math.sin(ROT));
      S_MIN = 0.92 * Math.min(W / (w * c + h * n), H / (w * n + h * c));
      ts = Math.max(ts, S_MIN); s = Math.max(s, S_MIN);
    }
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    chromeBoxes = chrome.map((e) => e.getBoundingClientRect()).filter((r) => r.width).map((r) => ({ x0: r.left - 6, y0: r.top - 6, x1: r.right + 6, y1: r.bottom + 6 }));
    baseKey = '';
  }

  // ---------------------------------------------------------------- input (only while open)
  const onWheel = (e) => {
    e.preventDefault(); hideCtx(); hideGo();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(Math.exp(-d * 0.0022), e.clientX, e.clientY);
  };
  // right click: the bot at this point (the links are real <a>s, so the new tab comes from the user's own click)
  const ctx = $('.bm-ctx');
  const hideCtx = () => ctx.classList.remove('on');
  const onCtx = (e) => {
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    for (const a of ctx.querySelectorAll('a')) a.href = pointLink(map?.frame, w.x, w.z, a.dataset.f);
    ctx.style.left = `${Math.min(e.clientX, W - 230)}px`; ctx.style.top = `${Math.min(e.clientY, H - 110)}px`;
    ctx.classList.add('on');
  };
  ctx.addEventListener('click', () => setTimeout(hideCtx, 0));
  // the teleport question over an improved object or a partner
  const go = $('.bm-go');
  let goFor = null;
  const hideGo = () => { go.classList.remove('on'); goFor = null; };
  function showGo(p, x, y) {
    goFor = p;
    go.querySelector('span').textContent = p.kind === 'ad' ? `${p.name} · ${p.note || ''}` : p.note || p.name;
    go.style.left = `${Math.max(8, Math.min(x - 120, W - 260))}px`; go.style.top = `${Math.max(8, Math.min(y + 14, H - 150))}px`;
    go.classList.add('on');
  }
  function goYes() { const p = goFor; hideGo(); if (!p) return; track('teleport', { place: p.id }); onGo(p); }
  go.querySelector('[data-a="yes"]').addEventListener('click', goYes);
  go.querySelector('[data-a="no"]').addEventListener('click', hideGo);
  // pointers: a mouse drags and hovers; touch fingers are tracked by id (two of them pinch)
  const fingers = new Map();
  let pinch = null;                // { d, mx, my } of the last pinch frame
  const pinchOf = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
  const onDown = (e) => {
    hideCtx(); hideGo();
    if (e.button !== 0) return;
    try { cv.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
    if (e.pointerType !== 'mouse') {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) { drag = null; pinch = pinchOf(); return; }
      if (fingers.size > 2) return; // a third finger is ignored until the pair changes
    }
    const on = e.pointerType === 'mouse' ? pick(e.clientX, e.clientY)?.p : null;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: 0, tip: tipFor, touch: e.pointerType !== 'mouse',
      target: canGo(on) ? on : null }; // a click on a target that wobbles a little is still a click, not a pan
    if (drag.touch) mouse = null; // a finger's card belongs to its tap: a pan drops it
    root.classList.add('grab');
  };
  const onMove = (e) => {
    if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY };
    else if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && fingers.size === 2) { // the world point under the fingers' midpoint follows it, the scale follows their spread
      const q = pinchOf(), w = toWorld(pinch.mx, pinch.my);
      s = ts = Math.min(S_MAX, Math.max(S_MIN, s * q.d / pinch.d));
      const o = toWorld(q.mx, q.my, s, 0, 0);
      cx = tcx = w.x - o.x; cz = tcz = w.z - o.z; anchor = null; pinch = q;
      return;
    }
    if (!drag) return;
    if (drag.target) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < HOLD_PX) return; drag.target = null; drag.moved = 99; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    const a = toWorld(W / 2 - dx, H / 2 - dy);
    cx = tcx = a.x; cz = tcz = a.z; anchor = null; ts = s;
  };
  const onUp = (e) => {
    fingers.delete(e.pointerId);
    if (pinch) { // the pinch ends; a finger still down pans on from where it is (counted as moved: no tap)
      if (fingers.size >= 2) pinch = pinchOf(); // a new pair: re-base, or its spread would be read against the old one's
      else { pinch = null; persist(); const [f] = fingers.values(); drag = f ? { ...f, moved: 99 } : null; }
      return;
    }
    if (drag?.target) showGo(drag.target, e.clientX, e.clientY);
    else if (drag && drag.moved < 6) { // a click or a tap, not a pan
      if (!drag.touch) { // what is under the pointer now, not the last frame's hover (a slow frame, a click without a move)
        const hit = pick(e.clientX, e.clientY)?.p || tipFor;
        if (canGo(hit)) showGo(hit, e.clientX, e.clientY);
        else if (tipFor?.url) { track('partner_open', { partner: tipFor.id, via: 'map' }); globalThis.open?.(tipFor.url, '_blank', 'noopener'); }
      } else { // a tap shows the badge's card; tapping the same badge again asks to move there, or opens the site
        const hit = pick(e.clientX, e.clientY, 10);
        mouse = hit ? { x: hit.x, y: hit.y } : null; // the badge's centre: the card stays on it while nothing moves
        if (hit && hit.p === drag.tip && canGo(hit.p)) showGo(hit.p, hit.x, hit.y);
        else if (hit && hit.p === drag.tip && hit.p.url) { track('partner_open', { partner: hit.p.id, via: 'map' }); globalThis.open?.(hit.p.url, '_blank', 'noopener'); }
      }
    }
    drag = null; root.classList.remove('grab');
    try { cv.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };
  const onLeave = (e) => { if (e.pointerType === 'mouse') mouse = null; };
  const onDbl = (e) => { if (!canGo(pick(e.clientX, e.clientY)?.p)) zoomAt(2, e.clientX, e.clientY); }; // a double click on a target keeps its question
  const PAN = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
  const onKey = (e) => {
    if (!isOpen) return;
    if (e.type === 'keyup') { keys.delete(e.code); return; }
    const c = e.code;
    if (goFor && (c === 'Enter' || c === 'NumpadEnter' || c === 'Escape')) { e.preventDefault(); e.stopPropagation(); if (c === 'Escape') hideGo(); else goYes(); return; }
    if (c === 'Escape') { if (player) { e.preventDefault(); close(); } return; } // on its own the map is the page
    if (PAN[c]) { keys.add(c); e.preventDefault(); return; }
    if (c === 'Equal' || c === 'NumpadAdd') { zoomAt(1.6); e.preventDefault(); }
    else if (c === 'Minus' || c === 'NumpadSubtract') { zoomAt(1 / 1.6); e.preventDefault(); }
    else if (c === 'Space') { recenter(); e.preventDefault(); }
  };
  const onResize = () => { if (isOpen) measure(); };
  const onBlur = () => { keys.clear(); drag = null; pinch = null; fingers.clear(); }; // a key released in another window never sends its keyup
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('pointerleave', onLeave);
  cv.addEventListener('dblclick', onDbl);
  cv.addEventListener('contextmenu', onCtx);
  globalThis.addEventListener?.('keydown', onKey, true);
  globalThis.addEventListener?.('keyup', onKey, true);
  globalThis.addEventListener?.('resize', onResize);
  globalThis.addEventListener?.('blur', onBlur);

  // ---------------------------------------------------------------- base layer
  const boxes = [];
  const hits = (b) => boxes.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
  const widths = new Map();
  const measureText = (font, text) => { const k = font + '|' + text; let w = widths.get(k); if (w == null) { bg.font = font; w = bg.measureText(text).width; widths.set(k, w); } return w; };

  // exact test: does the tile square (rotated on screen) overlap the screen rectangle? separating axes of both
  function screenHits(i, j, m) {
    const P = [[i * m, j * m], [(i + 1) * m, j * m], [(i + 1) * m, (j + 1) * m], [i * m, (j + 1) * m]].map(([x, z]) => toScreen(x, z));
    const c = ca(), n = sa(); // the tile's edge directions on screen
    for (const [ax, ay] of [[1, 0], [0, 1], [c, n], [-n, c]]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of P) { const d = p.x * ax + p.y * ay; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) { const d = x * ax + y * ay; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 < b0 || b1 < a0) return false;
    }
    return true;
  }
  function drawTiles(level, ctx, needAll) {
    const { m } = LEVELS[level], c = Math.abs(ca()), n = Math.abs(sa());
    const ex = (W / 2 * c + H / 2 * n) / s, ez = (W / 2 * n + H / 2 * c) / s; // the rotated screen's world half extents
    let i0 = Math.floor((cx - ex) / m), i1 = Math.floor((cx + ex) / m), j0 = Math.floor((cz - ez) / m), j1 = Math.floor((cz + ez) / m);
    if (B) { // nothing to paint outside the map data: keeps the tile count within the caches
      i0 = Math.max(i0, Math.floor(B.x0 / m)); i1 = Math.min(i1, Math.floor(B.x1 / m));
      j0 = Math.max(j0, Math.floor(B.z0 / m)); j1 = Math.min(j1, Math.floor(B.z1 / m));
    }
    let ready = true;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (!screenHits(i, j, m)) continue; // the bounding box above holds up to twice the screen
      const t = painter.tile(level, i, j);
      if (needAll) painter.want(t);
      if (t.ready) ctx.drawImage(t.c, i * m, j * m, m, m); else ready = false;
    }
    return ready;
  }

  const inFrame = (x, y) => x >= 8 && y >= 8 && x <= W - 8 && y <= H - 8;
  function drawStreets() {
    const chains = painter.streets(), q = {};
    const vx0 = -40, vy0 = -40, vx1 = W + 40, vy1 = H + 40;
    const R = Math.hypot(W, H) / 2 / s, bx0 = cx - R, bx1 = cx + R, bz0 = cz - R, bz1 = cz + R;
    const placed = new Map(); // name -> screen points of its labels (the same street is not labelled twice nearby)
    bg.textAlign = 'left'; bg.textBaseline = 'middle'; bg.lineJoin = 'round';
    for (const c of chains) {
      const st = STREET[Math.min(c.rank, 3)];
      if (s < st.s || c.x1 < bx0 || c.x0 > bx1 || c.z1 < bz0 || c.z0 > bz1) continue;
      const tw = measureText(st.font, c.label);
      if (c.len * s < tw + 30) continue;
      // screen polyline, clipped loosely to the view
      const P = [], cum = [0];
      for (let i = 0; i < c.p.length; i += 2) {
        toScreen(c.p[i], c.p[i + 1], q);
        if (P.length) cum.push(cum[cum.length - 1] + Math.hypot(q.x - P[P.length - 2], q.y - P[P.length - 1]));
        P.push(q.x, q.y);
      }
      const total = cum[cum.length - 1];
      if (total < tw + 30) continue;
      let rev = null; // the same polyline run backwards, for labels where the street heads left on screen
      const backwards = () => {
        if (rev) return rev;
        const RP = []; for (let i = P.length - 2; i >= 0; i -= 2) RP.push(P[i], P[i + 1]);
        return (rev = { P: RP, cum: cum.map((v) => total - v).reverse() });
      };
      const gap = Math.max(tw * 3, 420), prev = placed.get(c.name) || [];
      for (let a = Math.max(10, (total % gap) / 2); a + tw < total - 10; a += gap) {
        let lay = layAlong(P, cum, a, c.label, (ch) => measureText(st.font, ch), inFrame);
        if (lay && Math.cos(lay[lay.length >> 1].ang) < 0) { const R = backwards(); lay = layAlong(R.P, R.cum, total - a - tw, c.label, (ch) => measureText(st.font, ch), inFrame); } // keep it upright
        if (!lay) { a -= gap - 40; continue; } // slide along in small steps until a straight stretch
        const mid = lay[lay.length >> 1];
        if (mid.x < vx0 || mid.y < vy0 || mid.x > vx1 || mid.y > vy1) continue;
        if (prev.some((p) => Math.hypot(p.x - mid.x, p.y - mid.y) < gap * 0.8)) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const gph of lay) { x0 = Math.min(x0, gph.x); y0 = Math.min(y0, gph.y); x1 = Math.max(x1, gph.x); y1 = Math.max(y1, gph.y); }
        const box = { x0: x0 - 6, y0: y0 - 8, x1: x1 + 6, y1: y1 + 8 };
        if (hits(box)) continue;
        boxes.push(box); prev.push(mid); placed.set(c.name, prev);
        bg.font = st.font;
        for (const pass of [0, 1]) for (const gph of lay) {
          bg.setTransform(dpr, 0, 0, dpr, dpr * gph.x, dpr * gph.y); bg.rotate(gph.ang);
          if (pass === 0) { bg.lineWidth = 3.2; bg.strokeStyle = 'rgba(14,20,32,.92)'; bg.strokeText(gph.ch, -measureText(st.font, gph.ch) / 2, 0); }
          else { bg.fillStyle = st.fill; bg.fillText(gph.ch, -measureText(st.font, gph.ch) / 2, 0); }
        }
        a += tw;
      }
    }
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // badges and their labels; their boxes are reserved before the street names so names flow around them
  function layoutPlaces() {
    const list = [], q = {};
    const big = s >= 0.25;
    for (const p of painter.places) {
      if (p.kind === 'improved' || (p.kind === 'ad' ? !show.ads : !show.sights)) continue;
      toScreen(p.x, p.z, q);
      if (q.x < -30 || q.y < -30 || q.x > W + 30 || q.y > H + 30) continue;
      const ad = p.kind === 'ad', size = ad ? (big ? 30 : 22) : (big ? 24 : 17);
      list.push({ p, x: q.x, y: q.y, size, ad, label: ad || s >= 0.42 });
    }
    list.sort((a, b) => (a.ad === b.ad ? 0 : a.ad ? -1 : 1)); // partners claim their space first
    for (const it of list) { const r = it.size / 2; boxes.push({ x0: it.x - r, y0: it.y - r, x1: it.x + r, y1: it.y + r }); }
    for (const it of list) { // labels only where they do not cover a badge or another label
      const r = it.size / 2;
      if (!it.label) continue;
      const font = it.ad ? `700 12.5px ${LABEL_FONT}` : `600 12px ${LABEL_FONT}`;
      const w = measureText(font, it.p.name) + (it.ad ? 16 : 6), h = it.ad ? 20 : 16;
      const box = { x0: it.x - w / 2, y0: it.y + r + 3, x1: it.x + w / 2, y1: it.y + r + 3 + h };
      if (hits(box)) { it.label = false; continue; }
      boxes.push(box); it.box = box; it.font = font;
    }
    return list;
  }
  function adLabel(ctx, it) { // the pink name pill under a partner badge
    const b = it.box;
    ctx.font = it.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 10); else ctx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    ctx.fillStyle = 'rgba(214,61,134,.95)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(it.p.name, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 + 0.5);
  }
  function drawPlaces(list) {
    placeBoxes = [];
    for (const it of list) {
      const img = painter.icon(it.p, it.size, dpr), d = img.width / dpr;
      bg.drawImage(img, it.x - d / 2, it.y - d / 2, d, d);
      placeBoxes.push({ p: it.p, x: it.x, y: it.y, r: it.size / 2 + 3, it });
      if (!it.label) continue;
      const b = it.box, midX = (b.x0 + b.x1) / 2, midY = (b.y0 + b.y1) / 2;
      bg.font = it.font; bg.textAlign = 'center'; bg.textBaseline = 'middle';
      if (it.ad) adLabel(bg, it);
      else {
        bg.lineWidth = 3; bg.lineJoin = 'round'; bg.strokeStyle = 'rgba(14,20,32,.92)'; bg.strokeText(it.p.name, midX, midY);
        bg.fillStyle = '#f6d98a'; bg.fillText(it.p.name, midX, midY);
      }
    }
  }

  function drawBase() {
    const level = painter.levelFor(s * dpr);
    painter.frame();
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.fillStyle = COL.block; bg.fillRect(0, 0, base.width, base.height);
    bg.setTransform(dpr, 0, 0, dpr, dpr * W / 2, dpr * H / 2); bg.rotate(ROT); bg.scale(s, s); bg.translate(-cx, -cz);
    bg.imageSmoothingEnabled = true;
    // the coarse level underneath while the sharp tiles paint (it is cheap and usually cached)
    const coarseOk = level === 0 || drawTiles(0, bg, false);
    const ready = drawTiles(level, bg, true);
    baseLevelReady = ready && coarseOk;
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    boxes.length = 0;
    boxes.push(...chromeBoxes); // labels stay clear of the title, the legend, the scale bar and the key hints
    if (player) { // ... and of the car (the game is paused: it stays put)
      const me = toScreen(player.position.x, player.position.z);
      boxes.push({ x0: me.x - 18, y0: me.y - 18, x1: me.x + 18, y1: me.y + 18 });
    }
    const list = layoutPlaces();
    if (show.streets) drawStreets();
    drawPlaces(list);
  }

  // ---------------------------------------------------------------- live layer
  function clampToView(x, y, pad) { // pull a point into the frame along the ray from the centre
    const u = x - W / 2, v = y - H / 2, k = Math.max(Math.abs(u) / (W / 2 - pad), Math.abs(v) / (H / 2 - pad), 1);
    return { x: W / 2 + u / k, y: H / 2 + v / k, clamped: k > 1.0001 };
  }
  function drawLive() {
    const P = player?.position, me = P && toScreen(P.x, P.z);
    const pulse = (t * 1.2) % 1;
    if (show.ads) for (const p of painter.places) { // partners breathe; the hovered one lights up
      if (p.kind !== 'ad' || !p.rings?.length) continue;
      const hot = tipFor === p, k = hot ? 1 : 0.45 + 0.35 * Math.sin(t * 2.4);
      g.save(); g.beginPath();
      for (const r of p.rings) { for (let i = 0; i < r.length; i += 2) { const q = toScreen(r[i], r[i + 1]); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); } g.closePath(); }
      g.shadowColor = 'rgba(255,92,170,.9)'; g.shadowBlur = 10 + 10 * k;
      g.fillStyle = `rgba(255,111,181,${0.18 + 0.3 * k})`; g.fill();
      g.lineWidth = 1.5 + 1.5 * k; g.strokeStyle = `rgba(255,170,215,${0.5 + 0.5 * k})`; g.stroke();
      g.restore();
    }
    if (tipFor?.kind === 'improved') { // the hovered improved object: its outline lights up a little
      g.save(); g.beginPath();
      for (const r of tipFor.rings) { for (let i = 0; i < r.length; i += 2) { const q = toScreen(r[i], r[i + 1]); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); } g.closePath(); }
      g.fillStyle = 'rgba(220,226,236,.18)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(235,240,248,.9)'; g.stroke();
      g.restore();
    }
    for (const b of placeBoxes) if (b.p.kind === 'ad' && b.p.rings?.length) { // the badge and its name stay on top of the glow
      const img = painter.icon(b.p, b.it.size, dpr), d = img.width / dpr;
      g.drawImage(img, b.x - d / 2, b.y - d / 2, d, d);
      if (b.it.label) adLabel(g, b.it);
    }
    g.font = `700 12px ${LABEL_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of getMarkers?.() || []) {
      const a = toScreen(m.x, m.z), c = clampToView(a.x, a.y, 16);
      g.beginPath(); g.arc(c.x, c.y, 11, 0, Math.PI * 2); g.fillStyle = m.color || '#f5c52e'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(10,14,22,.9)'; g.stroke();
      g.fillStyle = '#0d1117'; g.fillText(String(m.label || '').slice(0, 2), c.x, c.y + 0.5);
    }
    const obj = getObjective?.();
    if (obj && me) { // straight line from the car to the objective (a flying car can take it)
      const o = toScreen(obj.x, obj.z), oc = clampToView(o.x, o.y, 26);
      g.save(); g.setLineDash([7, 6]); g.lineDashOffset = -t * 18; g.lineWidth = 2; g.strokeStyle = 'rgba(255,210,74,.75)';
      g.beginPath(); g.moveTo(me.x, me.y); g.lineTo(oc.x, oc.y); g.stroke(); g.restore();
      g.save(); g.translate(oc.x, oc.y);
      if (!oc.clamped) {
        g.beginPath(); g.arc(0, 0, 10 + pulse * 22, 0, Math.PI * 2); g.strokeStyle = `rgba(255,210,74,${(1 - pulse) * 0.8})`; g.lineWidth = 2.5; g.stroke();
        g.beginPath(); g.moveTo(0, -11); g.lineTo(11, 0); g.lineTo(0, 11); g.lineTo(-11, 0);
      } else {
        g.rotate(Math.atan2(oc.y - H / 2, oc.x - W / 2) + Math.PI / 2);
        g.beginPath(); g.moveTo(0, -13); g.lineTo(10, 8); g.lineTo(-10, 8);
      }
      g.closePath(); g.fillStyle = '#ffd24a'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1a1405'; g.stroke();
      g.restore();
      if (oc.clamped || Math.hypot(o.x - me.x, o.y - me.y) > 60) {
        const d = fmtDist(Math.hypot(obj.x - P.x, obj.z - P.z));
        g.font = `700 13px ${LABEL_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const ty = oc.y + (oc.y > H - 60 ? -26 : 26);
        g.lineWidth = 3; g.strokeStyle = 'rgba(14,20,32,.9)'; g.strokeText(d, oc.x, ty); g.fillStyle = '#ffe38a'; g.fillText(d, oc.x, ty);
      }
    }
    // the car: a pulse ring and an arrow along the nose, pinned to the edge when panned away
    if (!me) return;
    const mc = clampToView(me.x, me.y, 18);
    const yaw = player.yaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const ang = Math.atan2(fz, fx) + ROT + Math.PI / 2;
    g.save(); g.translate(mc.x, mc.y);
    if (!mc.clamped) { g.beginPath(); g.arc(0, 0, 9 + pulse * 18, 0, Math.PI * 2); g.strokeStyle = `rgba(120,190,255,${(1 - pulse) * 0.9})`; g.lineWidth = 2; g.stroke(); }
    g.rotate(ang);
    g.beginPath(); g.moveTo(0, -12); g.lineTo(8.5, 9); g.lineTo(0, 4.5); g.lineTo(-8.5, 9); g.closePath();
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6;
    g.fillStyle = '#ffffff'; g.fill(); g.shadowColor = 'transparent'; g.lineWidth = 1.6; g.strokeStyle = '#0d1117'; g.stroke();
    g.restore();
  }

  // hover tooltip over a badge: name, note, distance from the car
  let tipFor = null;
  const improved = painter.places.filter((p) => p.kind === 'improved' && p.rings?.length);
  const inRing = (r, x, z) => { // even-odd point in a flat ring
    let inside = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      if ((r[i + 1] > z) !== (r[j + 1] > z) && x < r[i] + (z - r[i + 1]) * (r[j] - r[i]) / (r[j + 1] - r[i + 1])) inside = !inside;
    }
    return inside;
  };
  function pick(x, y, slop = 0) { // the badge under a screen point (slop: extra px of reach for a fingertip)
    let best = null;
    for (const b of placeBoxes) { const d = Math.hypot(b.x - x, b.y - y); if (d < b.r + slop && (!best || d < best.d)) best = { ...b, d }; }
    if (best) return best;
    // no badge: an improved object's footprint under the point (or its centre within reach: where a tap leaves the card)
    const w = toWorld(x, y);
    for (const p of improved) {
      const c = toScreen(p.x, p.z);
      if (Math.hypot(c.x - x, c.y - y) < 12 + slop || p.rings.some((r) => inRing(r, w.x, w.z))) return { p, x: c.x, y: c.y, r: 4, d: 0 };
    }
    return null;
  }
  function updateTip() {
    const best = mouse && !drag && !pinch && !goFor ? pick(mouse.x, mouse.y, touch ? 10 : 0) : null;
    root.classList.toggle('pick', !!best);
    if (!best) { if (tipFor) { el.tip.classList.remove('on'); tipFor = null; } return; }
    if (tipFor !== best.p) {
      tipFor = best.p;
      el.tipB.textContent = best.p.name; el.tipS.textContent = best.p.note || '';
      el.tip.classList.toggle('ad', best.p.kind === 'ad');
      el.tip.classList.toggle('imp', best.p.kind === 'improved');
      el.tipU.textContent = canGo(best.p) ? (touch ? 'Торкніться ще раз – переміститись сюди' : 'Клік – переміститись сюди')
        : best.p.url ? (touch ? 'Торкніться значка ще раз – відкриється сайт' : 'Клік по значку – відкриє сайт у новій вкладці') : '';
    }
    const P = player?.position;
    const seen = best.p.kind !== 'sight' ? null : best.p.visited ?? null; // the explore quest's mark (game/explore.js)
    el.tipE.textContent = [P ? `${fmtDist(Math.hypot(best.p.x - P.x, best.p.z - P.z))} від вас` : '',
      seen === true ? '✓ відвідано' : seen === false ? 'ще не відвідано – під’їдьте ближче' : ''].filter(Boolean).join(' · ');
    el.tip.style.transform = `translate(${Math.round(best.x)}px, ${Math.round(best.y - best.r - 8)}px)`;
    el.tip.classList.add('on');
  }

  let lastScaleM = -1;
  function updateScaleBar() {
    const target = 130 / s; // metres in ~130 px
    const p10 = 10 ** Math.floor(Math.log10(target)), n = target / p10;
    const m = (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p10;
    if (m !== lastScaleM) { lastScaleM = m; el.scaleT.textContent = m >= 1000 ? `${m / 1000} км` : `${m} м`; }
    el.scaleI.style.width = `${(m * s).toFixed(1)}px`;
  }

  // ---------------------------------------------------------------- open / close / frame
  function open() {
    if (isOpen) return;
    isOpen = true;
    const tracked = painter.places.filter((p) => p.kind !== 'ad' && p.visited != null); // the explore quest's count
    seenEl.textContent = tracked.length ? ` ${tracked.filter((p) => p.visited).length}/${tracked.length}` : '';
    measure();
    const c = player?.position || home;
    cx = tcx = c.x; cz = tcz = c.z; anchor = null; s = ts;
    root.classList.remove('off');
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; keys.clear(); drag = null; mouse = null; pinch = null; fingers.clear();
    root.classList.add('off'); el.tip.classList.remove('on'); tipFor = null; hideCtx(); hideGo();
    painter.drop('big'); baseKey = ''; // the game's minimap must not inherit a queue of big tiles
  }
  function update(dt) {
    if (!isOpen) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.1); t += dt;
    // keyboard pan
    let kx = 0, ky = 0;
    for (const c of keys) { kx += PAN[c][0]; ky += PAN[c][1]; }
    if (kx || ky) { const a = toWorld(W / 2 + kx * PAN_PX * dt, H / 2 + ky * PAN_PX * dt, s, tcx, tcz); tcx = a.x; tcz = a.z; anchor = null; }
    // ease the zoom (log space) and the centre; a zoom keeps its anchor point fixed on screen
    const k = 1 - Math.exp(-dt * 14);
    s = Math.exp(Math.log(s) + (Math.log(ts) - Math.log(s)) * k);
    if (Math.abs(Math.log(ts / s)) < 1e-3) s = ts;
    if (anchor) {
      const w = toWorld(anchor.sx, anchor.sy, s, 0, 0); // offset of the anchor's screen point from the centre, in metres
      cx = tcx = anchor.wx - w.x; cz = tcz = anchor.wz - w.z;
      if (s === ts) anchor = null;
    } else if (!drag) { cx += (tcx - cx) * k; cz += (tcz - cz) * k; }
    const R = map?.region;
    if (R) { // the view centre stays over the city (plus the dam just outside it)
      const cl = (v, a, b) => Math.min(b + 1500, Math.max(a - 1500, v));
      cx = cl(cx, R.x0, R.x1); cz = cl(cz, R.z0, R.z1); tcx = cl(tcx, R.x0, R.x1); tcz = cl(tcz, R.z0, R.z1);
    }
    // redraw the base when the view moved or tiles are still coming in
    const key = `${cx.toFixed(2)},${cz.toFixed(2)},${s.toFixed(5)},${W},${H},${dpr},${show.sights}${show.ads}${show.streets}`;
    if (painter.pending) painter.work(10);
    if (key !== baseKey || !baseLevelReady) { baseKey = key; drawBase(); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(base, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLive();
    updateTip();
    updateScaleBar();
  }

  return {
    open, close, toggle() { if (isOpen) close(); else open(); }, update,
    get isOpen() { return isOpen; },
    dispose() {
      globalThis.removeEventListener?.('keydown', onKey, true); globalThis.removeEventListener?.('keyup', onKey, true);
      globalThis.removeEventListener?.('resize', onResize); globalThis.removeEventListener?.('blur', onBlur); root.remove();
    },
  };
}
