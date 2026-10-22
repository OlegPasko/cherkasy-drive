// Photo mode (P): the world stands still, every HUD layer hides, a free camera flies from the car's view, and a shot
// becomes a watermarked PNG to save or share.
//
//   createPhotoMode({ ctx, world, camera, input, renderer?, post?, container = document.body, canOpen = () => true }) -> photo
//     ctx: the core (main.js): photo sets ctx.frozen while it is open (no systems but the `always` ones, no clock, the frame
//       still renders) and calls ctx.cycleTime(0) on T; main reads photo.previewing to pause the render under the preview
//     world: the city contract; world.view?(camera, relight) keeps LOD / culls / the people's and cars' draw lists
//       following the free camera (relight on the frame T changed the time), world.collision
//       (pushSphere, terrainHeight) keeps it out of solids and above the ground / the river, world.cherkasy.map.region
//       keeps it over the map; world.water.y is the river level
//     input: core/input.js; binds photo (P), photoShot (Enter), photoBack (Esc); while open input.dragLook is on (the
//       mouse looks while dragging on the canvas, the cursor stays free for the toolbar)
//     renderer, post: the capture renders one frame (at up to 2x device pixels, post.setCaptureDpr) and copies the canvas
//     container: where the toolbar, hint and preview go (a `.photo-ui` layer; body.photo-mode hides everything else, see
//       photomode.css); without a document (node tests) photo runs headless: no UI, no capture
//   photo.update(dt)      once per frame as an `always` system: P opens (if canOpen()), P / Esc close, T time of day,
//                         Enter shoots, else the fly camera (core/flycam.js) moves
//   photo.open() -> bool, photo.close(), photo.toggle(), photo.isOpen, photo.previewing, photo.state ('off' | 'fly' | 'busy' |
//     'preview'), photo.fly (the flycam), photo.capture() -> Promise<Blob | null> (also opens the preview), photo.lastName
//   photoName(date = new Date()) -> 'cherkasy-drive-YYYYMMDD-HHMMSS.png' (local time)
//   watermarkBox(w, h) -> { s, pad, big, small, icon, gap }   the corner wordmark's sizes in image pixels for a w x h shot
//   drawWatermark(g, w, h, icon?)   paints it bottom right (icon: a loaded image of /favicon.svg, optional)
//   CAMERA_ICON              the toolbar / HUD chip's camera glyph (inline SVG, currentColor)
// Analytics: track('photo', { action: 'capture' | 'save' | 'share' }) (share also covers the clipboard copy).
// The preview: «Скасувати» (back to the camera; Esc too), «Зберегти» (a download), «Поділитися» (the Web Share API with the
// file where navigator.canShare({ files }) allows it, else the clipboard with a «Скопійовано» toast; hidden when neither).
import * as THREE from 'three';
import { createFlyCamera } from '../core/flycam.js';
import { track } from '../analytics.js';

const SPEED = 12, CLEARANCE = 0.6, RADIUS = 0.5, Y_MAX = 1500, SWEEP = 48; // m/s (Shift x6, the wheel scales it), m, m, m, steps
const FOV_MIN = 20, FOV_MAX = 100;
const SHOT_DPR = 2, SHOT_MAX_PX = 4096; // the capture renders at up to 2 device px per CSS px, never wider than this
const BASE = (() => { try { return import.meta.env?.BASE_URL ?? '/'; } catch { return '/'; } })();

export const CAMERA_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';

const two = (n) => String(n).padStart(2, '0');
export function photoName(d = new Date()) {
  return `cherkasy-drive-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.png`;
}

// sizes scale with the shot: 1 at 1080p (a 4K shot gets a 2x mark, a small window a smaller one, never under 0.45)
export function watermarkBox(w, h) {
  const s = Math.max(0.45, Math.min(4, Math.min(w, h * 16 / 9) / 1920));
  const big = Math.round(30 * s), small = Math.round(13 * s), gap = Math.round(5 * s);
  return { s, pad: Math.round(30 * s), big, small, gap, icon: big + small + gap };
}

export function drawWatermark(g, w, h, icon = null) {
  const { s, pad, big, small, gap, icon: iz } = watermarkBox(w, h);
  const right = w - pad, base2 = h - pad, base1 = base2 - small - gap;
  g.save();
  // a soft dark halo under the corner, so the mark reads over a white wall or a bright sky too
  const hx = right - 3.2 * big, hy = base2 - 0.6 * big, hr = 6 * big;
  const halo = g.createRadialGradient(hx, hy, 0, hx, hy, hr);
  halo.addColorStop(0, 'rgba(0, 0, 0, .3)'); halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = halo; g.fillRect(hx - hr, hy - hr, 2 * hr, 2 * hr);
  g.globalAlpha = 0.85;
  g.shadowColor = 'rgba(0, 0, 0, .55)'; g.shadowBlur = 10 * s; g.shadowOffsetY = 1.5 * s;
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  // "driver" white, ".ck.ua" in the game's gold
  g.font = `700 ${big}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const wA = g.measureText('driver').width, wB = g.measureText('.ck.ua').width;
  g.font = `600 ${small}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  if ('letterSpacing' in g) g.letterSpacing = `${(small * 0.22).toFixed(1)}px`;
  const sub = 'CHERKASY DRIVE', wS = g.measureText(sub).width;
  const tw = Math.max(wA + wB, wS), x0 = right - tw;
  g.fillStyle = 'rgba(255, 255, 255, .9)';
  g.fillText(sub, right - wS, base2);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  g.font = `700 ${big}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.fillStyle = '#ffffff'; g.fillText('driver', right - wA - wB, base1);
  g.fillStyle = '#f2c14e'; g.fillText('.ck.ua', right - wB, base1);
  if (icon && (icon.naturalWidth || icon.width)) {
    g.shadowBlur = 6 * s;
    g.drawImage(icon, x0 - Math.round(12 * s) - iz, base2 - iz + Math.round(2 * s), iz, iz);
  }
  g.restore();
}

export function createPhotoMode({ ctx, world, camera, input, renderer = null, post = null, container = globalThis.document?.body, canOpen = () => true }) {
  input.bind('photo', ['KeyP']);
  input.bind('photoShot', ['Enter', 'NumpadEnter']);
  input.bind('photoBack', ['Escape']);

  // keep the camera over the map, out of buildings and solids, above the ground and the river
  const col = world?.collision, region = world?.cherkasy?.map?.region ?? null;
  const waterY = Number.isFinite(world?.water?.y) ? world.water.y : (world?.cherkasy ? -1 : -Infinity);
  const terrain = col?.terrainHeight ? (x, z) => col.terrainHeight(x, z) : (x, z) => world?.groundHeight?.(x, z) ?? 0;
  const floorAt = (x, z) => Math.max(terrain(x, z), waterY) + CLEARANCE;
  // swept in steps of under a radius (at most SWEEP of them: a fast flight may still skip a fence, never a building), so
  // a frame's move cannot cross a thin solid that neither end touches
  const at = new THREE.Vector3(), step = new THREE.Vector3();
  const settle = (p) => { col?.pushSphere?.(p, RADIUS); const f = floorAt(p.x, p.z); if (p.y < f) p.y = f; };
  const constrain = (p, from = null) => {
    if (region) { p.x = THREE.MathUtils.clamp(p.x, region.x0, region.x1); p.z = THREE.MathUtils.clamp(p.z, region.z0, region.z1); }
    if (p.y > Y_MAX) p.y = Y_MAX;
    const n = from && col?.pushSphere ? Math.min(SWEEP, Math.ceil(from.distanceTo(p) / (RADIUS * 0.8))) : 0;
    if (n > 1) {
      at.copy(from); step.subVectors(p, from).divideScalar(n);
      for (let i = 0; i < n; i++) settle(at.add(step));
      p.copy(at);
    } else settle(p);
  };
  const fly = createFlyCamera(camera, input, { speed: SPEED, groundAt: (x, z) => floorAt(x, z) - CLEARANCE, clearance: CLEARANCE, constrain });

  let state = 'off', fov0 = camera.fov, shot = null; // shot: { blob, url, name }
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const doc = container?.ownerDocument ?? null;
  const ui = doc ? buildUi(doc, container) : null;
  let icon = null; // /favicon.svg for the watermark, loaded on the first open

  function open() {
    if (state !== 'off' || !canOpen()) return false;
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    fly.speed = SPEED;
    fly.setPose(camera.position, euler.y, THREE.MathUtils.clamp(euler.x, -1.5, 1.5));
    constrain(camera.position);
    fov0 = camera.fov;
    state = 'fly';
    ctx.frozen = true;
    input.unlock(); input.dragLook = true;
    if (ui) {
      ui.show(true); ui.setFov(camera.fov);
      if (!icon && typeof Image !== 'undefined') { icon = new Image(); icon.src = `${BASE}favicon.svg`; }
    }
    return true;
  }
  function close() {
    if (state === 'off') return;
    dropShot();
    state = 'off';
    ctx.frozen = false;
    input.dragLook = false;
    if (camera.fov !== fov0) { camera.fov = fov0; camera.updateProjectionMatrix(); }
    ui?.show(false);
  }
  function dropShot() {
    if (shot?.url) URL.revokeObjectURL(shot.url);
    shot = null;
    ui?.preview(null);
  }
  function back() { // the preview's «Скасувати»: back to the camera
    if (state !== 'preview') return;
    dropShot(); state = 'fly';
  }

  // one frame at the shot's resolution, copied off the canvas in the same task as the render (the drawing buffer is not
  // preserved), then the screen's own size again with a fresh frame (a size change clears the canvas)
  function grab() {
    const el = renderer.domElement, css = renderer.getSize(new THREE.Vector2());
    const cur = renderer.getPixelRatio(), maxPx = Math.min(SHOT_MAX_PX, renderer.capabilities?.maxTextureSize || SHOT_MAX_PX);
    const want = Math.min(Math.max(cur, Math.min(SHOT_DPR, globalThis.devicePixelRatio || 1), post.baseDpr), maxPx / Math.max(1, css.x, css.y));
    const hi = want > cur * 1.01 && post.setCaptureDpr;
    const c = doc.createElement('canvas');
    try {
      if (hi) post.setCaptureDpr(want);
      post.render(0);
      c.width = el.width; c.height = el.height;
      c.getContext('2d').drawImage(el, 0, 0);
    } finally {
      if (hi) { post.setCaptureDpr(null); post.render(0); }
    }
    return c;
  }
  async function capture() {
    if (state !== 'fly' || !ui || !renderer || !post) return null;
    state = 'busy';
    try {
      const c = grab();
      drawWatermark(c.getContext('2d'), c.width, c.height, icon?.complete ? icon : null);
      ui.flash();
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob || state !== 'busy') { if (state === 'busy') state = 'fly'; return null; }
      shot = { blob, url: URL.createObjectURL(blob), name: photoName() };
      track('photo', { action: 'capture' });
      state = 'preview';
      ui.preview(shot, shareKind(shot));
      return blob;
    } catch (err) {
      console.error('[photo] capture failed', err);
      if (state === 'busy') state = 'fly';
      return null;
    }
  }

  function fileOf(s) { try { return new File([s.blob], s.name, { type: 'image/png' }); } catch { return null; } }
  function shareKind(s) {
    const nav = globalThis.navigator, f = fileOf(s);
    try { if (f && nav?.share && nav.canShare?.({ files: [f] })) return 'share'; } catch { /* no file sharing */ }
    if (nav?.clipboard?.write && typeof globalThis.ClipboardItem === 'function') return 'copy';
    return null;
  }
  function save() {
    if (!shot) return;
    const a = doc.createElement('a');
    a.href = shot.url; a.download = shot.name; a.style.display = 'none';
    doc.body.appendChild(a); a.click(); a.remove();
    track('photo', { action: 'save' });
    ui.toast('Збережено');
  }
  async function share() {
    if (!shot) return;
    const kind = shareKind(shot);
    try {
      if (kind === 'share') {
        await globalThis.navigator.share({ files: [fileOf(shot)], title: 'Черкаси Драйв', text: 'Черкаси Драйв – driver.ck.ua' });
        track('photo', { action: 'share' });
      } else if (kind === 'copy') {
        await globalThis.navigator.clipboard.write([new globalThis.ClipboardItem({ 'image/png': shot.blob })]);
        track('photo', { action: 'share' });
        ui.toast('Скопійовано');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') { console.warn('[photo] share failed', err); ui.toast('Не вдалося поділитися'); }
    }
  }

  function update(dt) {
    const toggle = input.pressed('photo'), esc = input.pressed('photoBack');
    if (state === 'off') { if (toggle) open(); return; }
    if (state === 'preview') { if (esc) back(); else if (toggle) close(); return; }
    if (state === 'busy') return;
    if (toggle || esc) { close(); return; }
    const relight = input.pressed('timeOfDay');
    if (relight) ctx.cycleTime?.(0);
    if (input.pressed('photoShot')) { capture(); return; } // the camera holds still for the frame it shoots
    fly.update(dt);
    world?.view?.(camera, relight); // relight: the sites' lamps follow the new time of day
  }

  if (ui) ui.bind({
    shot: () => capture(), exit: () => close(), cancel: () => back(), save, share,
    fov: (v) => { camera.fov = THREE.MathUtils.clamp(v, FOV_MIN, FOV_MAX); camera.updateProjectionMatrix(); },
  });

  const photo = {
    update, open, close, capture, fly,
    toggle() { if (state === 'off') open(); else close(); },
    get state() { return state; },
    get isOpen() { return state !== 'off'; },
    get previewing() { return state === 'preview'; },
    get lastName() { return shot?.name ?? null; },
  };
  return photo;
}

// ------------------------------------------------------------------ the DOM layer: toolbar, hint, preview, toast
function buildUi(doc, container) {
  const root = doc.createElement('div');
  root.className = 'photo-ui off';
  root.innerHTML = `
    <div class="pm-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> рух</span><span><kbd>Space</kbd> / <kbd>Ctrl</kbd> вгору / вниз</span>
      <span><kbd>Shift</kbd> швидше</span><span>колесо – швидкість</span><span>тягни мишею – огляд</span><span><kbd>T</kbd> час доби</span>
      <span><kbd>Enter</kbd> фото</span><span><kbd>P</kbd> / <kbd>Esc</kbd> вийти</span></div>
    <div class="pm-bar">
      <label class="pm-fov" title="Кут огляду"><span>Кут</span><input type="range" min="${FOV_MIN}" max="${FOV_MAX}" step="1" value="62"><b>62°</b></label>
      <button class="pm-shot" type="button" title="Зробити фото (Enter)">${CAMERA_ICON}<span>Зробити фото</span></button>
      <button class="pm-exit" type="button" title="Вийти з фоторежиму (P / Esc)"><kbd>P</kbd><span>Вийти</span></button>
    </div>
    <div class="pm-flash"></div>
    <div class="pm-preview off"><div class="pm-frame"><img alt="Фото з гри"></div>
      <div class="pm-actions"><button class="pm-cancel" type="button" title="Назад до камери (Esc)">Скасувати</button>
        <button class="pm-save" type="button">Зберегти</button><button class="pm-share" type="button">Поділитися</button></div></div>
    <div class="pm-toast"></div>`;
  container.appendChild(root);
  const $ = (q) => root.querySelector(q);
  const el = { fov: $('.pm-fov input'), fovV: $('.pm-fov b'), shot: $('.pm-shot'), exit: $('.pm-exit'), flash: $('.pm-flash'),
    preview: $('.pm-preview'), img: $('.pm-frame img'), cancel: $('.pm-cancel'), save: $('.pm-save'), share: $('.pm-share'), toast: $('.pm-toast') };
  let toastT = 0;
  const click = (b, fn) => b.addEventListener('click', (e) => { e.preventDefault(); b.blur(); fn(); }); // no focus left for Enter / Space
  return {
    bind(h) {
      click(el.shot, h.shot); click(el.exit, h.exit); click(el.cancel, h.cancel); click(el.save, h.save); click(el.share, h.share);
      el.fov.addEventListener('input', () => { h.fov(+el.fov.value); el.fovV.textContent = `${el.fov.value}°`; });
      // the slider is an <input>: while it has focus core/input.js ignores the keys, so the flying stops; let go of it
      for (const ev of ['change', 'pointerup']) el.fov.addEventListener(ev, () => el.fov.blur());
    },
    show(on) {
      root.classList.toggle('off', !on);
      doc.body.classList.toggle('photo-mode', on);
    },
    setFov(v) { el.fov.value = String(Math.round(v)); el.fovV.textContent = `${Math.round(v)}°`; },
    flash() { el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go'); },
    preview(s, kind = null) {
      root.classList.toggle('previewing', !!s);
      el.preview.classList.toggle('off', !s);
      if (s) { el.img.src = s.url; el.share.style.display = kind ? '' : 'none'; } else el.img.removeAttribute('src');
    },
    toast(t) {
      el.toast.textContent = t; el.toast.classList.add('on');
      clearTimeout(toastT); toastT = setTimeout(() => el.toast.classList.remove('on'), 1600);
    },
  };
}
