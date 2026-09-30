// Partner placements in the world: for every world.places entry of kind 'ad' with a door (a hand-built site), a soft
// pink ring on the ground in front of it (quieter than the mission beacons), the building's own light-up as the car
// comes near (place.glow(0..1)), and a card that slides in on the right while the car stands in the ring: the pitch
// and "Відкрити вебсайт" (O, or a click) – the partner's site opens in a new tab; a last line invites other businesses
// to the Telegram bot.
//   createPartners({ world, player, scene, container?, isBlocked?() -> bool (the big map is open) })
//     -> { update(dt), open(id?) -> bool, near: place | null, dispose() }
import * as THREE from 'three';
import { botLink } from '../ui/botlink.js';
import { cue } from '../audio/cue.js';
import { track } from '../analytics.js';

const RING_R = 4.5, SHOW_R = 6.5, HIDE_R = 9;   // metres from the door spot
const GLOW_FAR = 260, GLOW_NEAR = 70;            // the building starts / finishes lighting up
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const host = (u) => { try { return new URL(u).host; } catch { return u; } };

function wallTex() { // the ring's low light wall: bright at the ground, gone at the top
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#555'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

export function createPartners({ world, player, scene, container = globalThis.document?.body, isBlocked = () => false }) {
  const list = (world?.places || []).filter((q) => q.kind === 'ad' && q.door && q.url);
  const PINK = new THREE.Color(1.0, 0.36, 0.68);
  const alpha = wallTex();
  const ringGeo = new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2);
  const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0);
  const spots = list.map((q) => {
    const mRing = new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mWall = new THREE.MeshBasicMaterial({ color: PINK, alphaMap: alpha, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const g = new THREE.Group(); g.name = `partner-${q.id}`;
    const ring = new THREE.Mesh(ringGeo, mRing); ring.scale.setScalar(RING_R); ring.position.y = 0.12;
    const wall = new THREE.Mesh(wallGeo, mWall); wall.scale.set(RING_R, 1.4, RING_R);
    g.add(ring, wall); g.renderOrder = 3; g.position.set(q.door.x, q.door.y, q.door.z);
    scene.add(g);
    return { q, g, ring, wall, mRing, mWall, glow: 0 };
  });

  // the card (outside the non-interactive HUD layer so its button takes clicks when the cursor is free)
  const doc = container.ownerDocument;
  const card = doc.createElement('aside');
  card.className = 'partner-card';
  container.appendChild(card);
  card.addEventListener('click', (e) => { if (shown && e.target.closest?.('.pc-go')) track('partner_open', { partner: shown.id, via: 'card' }); });
  let shown = null, t = 0;
  const show = (q) => {
    if (shown === q) return;
    shown = q;
    if (!q) { card.classList.remove('on'); return; }
    cue('partner');
    const [head, ...lines] = q.pitch || [];
    card.innerHTML = `
      <div class="pc-top"><span class="pc-ic">${esc(q.icon || '★')}</span><div>${q.logo
        ? `<img class="pc-logo" src="${esc(`${import.meta.env?.BASE_URL ?? '/'}assets/brand/${q.logo}.svg`)}" alt="${esc(q.name)}">` : `<b>${esc(q.name)}</b>`}<small>${esc(q.note || '')}</small></div></div>
      ${head ? `<p class="pc-head">${esc(head)}</p>` : ''}
      ${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      <a class="pc-go" href="${esc(q.url)}" target="_blank" rel="noopener"><kbd>O</kbd><span>Відкрити вебсайт</span><i>↗</i></a>
      <div class="pc-host">${esc(host(q.url))} · партнер</div>
      <a class="pc-own" href="${esc(botLink('ad'))}" target="_blank" rel="noopener">Хочете тут свою рекламу? Напишіть боту ✈</a>`;
    card.classList.add('on');
  };
  const open = (id) => {
    const q = id ? list.find((p) => p.id === id) : shown;
    if (!q) return false;
    track('partner_open', { partner: q.id, via: 'key' });
    globalThis.open?.(q.url, '_blank', 'noopener');
    card.classList.add('went'); setTimeout(() => card.classList.remove('went'), 900);
    return true;
  };
  // straight from the key event: a new tab needs the user's gesture, the frame loop comes too late for some browsers
  const onKey = (e) => {
    if (e.code !== 'KeyO' || e.repeat || !shown || isBlocked()) return;
    const el = doc.activeElement; if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    e.preventDefault(); open();
  };
  globalThis.addEventListener?.('keydown', onKey);

  return {
    get near() { return shown; },
    open,
    update(dt) {
      t += dt;
      const P = player.position;
      let inside = null;
      for (const s of spots) {
        const d = Math.hypot(P.x - s.q.door.x, P.z - s.q.door.z), dy = Math.abs(P.y - s.q.door.y);
        // the building lights up on approach; the ring breathes slowly and brightens once you are in it
        const target = Math.min(1, Math.max(0, (GLOW_FAR - d) / (GLOW_FAR - GLOW_NEAR)));
        s.glow += (target - s.glow) * Math.min(1, dt * 2.5);
        s.q.glow?.(s.glow * (0.8 + 0.2 * Math.sin(t * 2.2)));
        const on = d < SHOW_R && dy < 5;
        const k = 0.5 + 0.5 * Math.sin(t * 1.8);
        s.mRing.opacity = on ? 0.5 : 0.24 + 0.1 * k;
        s.mWall.opacity = on ? 0.2 : 0.1 + 0.06 * k;
        s.ring.scale.setScalar(RING_R * (1 + 0.03 * k));
        s.g.visible = d < 900;
        if (on || (shown === s.q && d < HIDE_R && dy < 8)) inside = s.q;
      }
      show(isBlocked() ? null : inside);
    },
    dispose() {
      globalThis.removeEventListener?.('keydown', onKey);
      for (const s of spots) { scene.remove(s.g); s.mRing.dispose(); s.mWall.dispose(); s.q.glow?.(0); }
      ringGeo.dispose(); wallGeo.dispose(); alpha.dispose(); card.remove();
    },
  };
}
