// Quests: sets of hidden cards round the city that the player picks from the quest book (K or the "🗝️" chip) and
// collects by driving there. One quest is active at a time. A card is a place with a story: the big map shows only a
// grey dashed search circle round it (its centre shifted off the spot, so the circle says "somewhere here"), the book
// shows the card's hint, and in the world the spot is a quiet grey light that shows only from close by (under ~220 m).
// Driving into it (on the road beside the place, low flight counts) opens the card on the right: the story and its
// source; the book keeps every found card to read again. Entering a search circle for the first time shows the hint.
// Progress lives in localStorage ('cherkasy.quests': { active, found: [card ids] }). The game pauses while the book is
// open (main.js reads quests.isOpen, like the big map).
//   createQuests({ world, player, scene, hud?, reward?(n), quests? (QUESTS), storage?, container? })
//     -> { update(dt), open(), close(), toggle(), isOpen, active: quest | null, setActive(id | null),
//          zones() -> [{ x, z, r, label }] (the active quest's open cards, for the big map), find(cardId) (debug),
//          reset() (debug), list: [{ quest, cards: [{ ..., x, z, spot: { x, y, z }, zone: { x, z, r }, found }] }], dispose() }
//   curbSpot(map, x, z, maxR?) -> { x, z, d } | null: the point on the nearest motor road's edge toward (x, z)
// A quest: { id, title, icon, blurb, reward, rewardAll, cards: [{ id, title, icon, ll: [lat, lon], hint, story,
//            source: { name, url }, at?: [lat, lon] (where the light stands, when the road beside the place is not it) }] }
import * as THREE from 'three';
import { FRAME_OF } from '../world/cherkasy/frame.js';
import { cue } from '../audio/cue.js';
import { track } from '../analytics.js';
import { QUESTS } from './quests/index.js';

const KEY = 'cherkasy.quests';
const REACH = 14, MAX_ALT = 40;          // metres from the light, over the ground
const SHOW_FAR = 220, SHOW_NEAR = 70;    // the light fades in between these
const ZONE_R = 170;                       // the big map's search circle
const CARD_AWAY = 160;                    // the story card closes once the car is this far from the spot
const EVERY = 0.2;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

export function curbSpot(map, x, z, maxR = 150) {
  let best = null;
  for (const r of map?.roads || []) {
    if (r.k !== 'm' || !r.p) continue;
    const P = r.p;
    for (let i = 0; i + 3 < P.length; i += 2) {
      const ax = P[i], az = P[i + 1], dx = P[i + 2] - ax, dz = P[i + 3] - az, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), px = ax + dx * t, pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < maxR && (!best || d < best.d)) best = { px, pz, d, w: r.w || 7 };
    }
  }
  if (!best) return null;
  const k = best.d > 0.01 ? Math.min(best.d, best.w / 2 + 1) / best.d : 0; // to the kerb on the place's side
  return { x: best.px + (x - best.px) * k, z: best.pz + (z - best.pz) * k, d: best.d };
}

function fadeTex() { // the light's wall: bright at the ground, gone at the top (none headless)
  if (!globalThis.document) return null;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#666'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

export function createQuests({ world, player, scene, hud = null, reward = null, quests = QUESTS, storage = globalThis.localStorage,
  container = globalThis.document?.body }) {
  const map = world?.cherkasy?.map;
  const frame = map?.frame ? FRAME_OF(map) : null;
  const gh = (x, z) => world?.groundHeight?.(x, z) ?? 0;
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(KEY) || 'null') || {}; } catch { /* storage off or a bad record */ }
  const found = new Set(Array.isArray(saved.found) ? saved.found : []);
  const save = () => { try { storage?.setItem(KEY, JSON.stringify({ active: active?.quest.id || null, found: [...found] })); } catch { /* storage off */ } };

  // resolve the cards onto the map: the light on the road edge beside the place, the circle round it
  const list = quests.map((quest) => ({ quest, cards: (frame ? quest.cards : []).map((c) => {
    const [x, z] = frame.toXZ(c.ll[0], c.ll[1]);
    const [ax, az] = c.at ? frame.toXZ(c.at[0], c.at[1]) : [x, z];
    const s = c.at ? { x: ax, z: az } : curbSpot(map, ax, az) || { x: ax, z: az };
    const a = hash(c.id) * Math.PI * 2, off = ZONE_R * (0.3 + 0.35 * hash(`${c.id}~`));
    return { ...c, x, z, spot: { x: s.x, y: gh(s.x, s.z), z: s.z }, zone: { x: s.x + Math.cos(a) * off, z: s.z + Math.sin(a) * off, r: ZONE_R }, found: found.has(c.id) };
  }) }));
  let active = list.find((q) => q.quest.id === saved.active) || null;

  // ---------------------------------------------------------------- the lights
  const GREY = new THREE.Color(0.86, 0.89, 0.95); // plain (not additive) blending: an additive grey vanishes on a sunny road
  const alpha = fadeTex();
  const ringGeo = new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2);
  const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
  let lights = [];
  const clearLights = () => { for (const l of lights) { scene.remove(l.g); l.mR.dispose(); l.mW.dispose(); } lights = []; };
  const buildLights = () => {
    clearLights();
    for (const c of active?.cards || []) {
      if (c.found) continue;
      const mR = new THREE.MeshBasicMaterial({ color: GREY, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const mW = new THREE.MeshBasicMaterial({ color: GREY, alphaMap: alpha, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const g = new THREE.Group(); g.name = `quest-${c.id}`;
      const ring = new THREE.Mesh(ringGeo, mR); ring.scale.setScalar(4); ring.position.y = 0.14;
      const wall = new THREE.Mesh(wallGeo, mW); wall.scale.set(2.6, 24, 2.6);
      g.add(ring, wall); g.renderOrder = 3; g.position.set(c.spot.x, c.spot.y, c.spot.z); g.visible = false;
      scene.add(g);
      lights.push({ c, g, ring, mR, mW });
    }
  };

  // ---------------------------------------------------------------- DOM: the chip, the story card, the book
  const doc = container?.ownerDocument;
  const chip = doc?.createElement('button'), card = doc?.createElement('aside'), book = doc?.createElement('div');
  if (doc) {
    chip.type = 'button'; chip.className = 'quest-chip'; chip.title = 'Квести: обрати й шукати таємниці міста (K)';
    (hud?.root || container).appendChild(chip);
    chip.addEventListener('click', (e) => { e.preventDefault(); chip.blur(); api.toggle(); });
    card.className = 'quest-card'; container.appendChild(card);
    card.addEventListener('click', (e) => { if (e.target.closest?.('.qc-x')) { e.preventDefault(); showCard(null); } });
    book.className = 'quest-book'; container.appendChild(book);
    book.addEventListener('click', onBookClick);
  }
  const setChip = () => {
    if (!chip) return;
    const n = active ? active.cards.filter((c) => c.found).length : 0;
    chip.innerHTML = active ? `<kbd>K</kbd><i>${esc(active.quest.icon)}</i><b>${n}</b><span>/ ${active.cards.length} ${esc(active.quest.unit || 'карток')}</span>`
      : '<kbd>K</kbd><i>🗝️</i><span>Квести</span>';
    chip.classList.toggle('all', !!active && n === active.cards.length);
  };

  let shown = null;
  function showCard(c) {
    shown = c;
    if (!card) return;
    if (!c) { card.classList.remove('on'); return; }
    const q = list.find((l) => l.cards.includes(c)), n = q.cards.filter((k) => k.found).length;
    card.innerHTML = `
      <button class="qc-x" type="button" title="Закрити">✕</button>
      <div class="qc-top"><span class="qc-ic">${esc(c.icon || '🗝️')}</span><div><small>${esc(q.quest.title)} · ${n} з ${q.cards.length}</small><b>${esc(c.title)}</b></div></div>
      <p class="qc-story">${esc(c.story)}</p>
      ${c.source?.url ? `<a class="qc-src" href="${esc(c.source.url)}" target="_blank" rel="noopener">Джерело: ${esc(c.source.name || 'посилання')} ↗</a>` : ''}`;
    card.classList.add('on');
  }

  let isOpen = false, pick = null; // pick: the quest the book shows
  function renderBook() {
    if (!book) return;
    const q = pick || active || list[0];
    const n = q ? q.cards.filter((c) => c.found).length : 0, on = active === q;
    book.innerHTML = `<div class="qb-box">
      <div class="qb-head"><h3>🗝️ Квести</h3><span>K або Esc – закрити · гра на паузі</span><button class="qb-x" type="button" data-a="close">✕</button></div>
      <div class="qb-body">
        <nav>${list.map((l) => `<button type="button" data-q="${esc(l.quest.id)}" class="${l === q ? 'sel' : ''}">${esc(l.quest.icon)} ${esc(l.quest.title)}
          <small>${l.cards.filter((c) => c.found).length} / ${l.cards.length}${l === active ? ' · активний' : ''}</small></button>`).join('')}
          <p class="qb-soon">Нові квести з’являтимуться згодом. Ідеї – боту ✈</p></nav>
        ${q ? `<section>
          <div class="qb-q"><div><h4>${esc(q.quest.icon)} ${esc(q.quest.title)}</h4><p>${esc(q.quest.blurb)}</p>
            <p class="qb-n">Знайдено ${n} з ${q.cards.length} · +${q.quest.reward} ₴ за картку, +${q.quest.rewardAll} ₴ за всі</p></div>
            <button type="button" class="qb-go ${on ? 'on' : ''}" data-a="${on ? 'stop' : 'start'}">${on ? '✓ Активний · зупинити' : 'Обрати цей квест'}</button></div>
          <div class="qb-grid">${q.cards.map((c, i) => c.found
            ? `<button type="button" class="qb-c got" data-c="${esc(c.id)}"><i>${esc(c.icon)}</i><b>${esc(c.title)}</b><small>прочитати ще раз</small></button>`
            : `<div class="qb-c"><i>${i + 1}</i><b>Таємниця №${i + 1}</b><small>${esc(c.hint)}</small></div>`).join('')}</div>
          ${on ? '<p class="qb-tip">Сірі пунктирні кола на мапі (M) – десь у них. Ближче ніж за ~200 м місце ледь світиться сірим – заїдь у світло.</p>' : ''}
        </section>` : ''}
      </div></div>`;
  }
  function onBookClick(e) {
    const t = e.target.closest?.('button'); if (!t) { if (e.target === book) api.close(); return; }
    e.preventDefault();
    if (t.dataset.q) { pick = list.find((l) => l.quest.id === t.dataset.q) || null; renderBook(); return; }
    if (t.dataset.c) { const c = list.flatMap((l) => l.cards).find((k) => k.id === t.dataset.c); if (c) { api.close(); showCard(c); } return; }
    const a = t.dataset.a;
    if (a === 'close') api.close();
    else if (a === 'start') { api.setActive((pick || list[0]).quest.id); renderBook(); }
    else if (a === 'stop') { api.setActive(null); renderBook(); }
  }
  const onKey = (e) => { if (isOpen && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); } };
  globalThis.addEventListener?.('keydown', onKey, true);

  // ---------------------------------------------------------------- finding
  const entered = new Set();
  function find(c, q) {
    if (!c || c.found) return false;
    c.found = true; found.add(c.id); save();
    const n = q.cards.filter((k) => k.found).length, all = n === q.cards.length;
    reward?.(all ? q.quest.reward + q.quest.rewardAll : q.quest.reward);
    track('quest_card', { quest: q.quest.id, card: c.id, n });
    cue('partner');
    hud?.mission?.banner(all ? `${q.quest.title}: усе знайдено!` : `${c.icon} ${c.title}`,
      all ? `${n} з ${n} · +${q.quest.reward + q.quest.rewardAll} ₴` : `Таємниця ${n} з ${q.cards.length} · +${q.quest.reward} ₴`, '#c9d3e4');
    const l = lights.find((k) => k.c === c);
    if (l) { scene.remove(l.g); l.mR.dispose(); l.mW.dispose(); lights = lights.filter((k) => k !== l); }
    showCard(c); setChip();
    return true;
  }

  let t = 0, acc = 0;
  const api = {
    list,
    get isOpen() { return isOpen; },
    get active() { return active?.quest || null; },
    open() { if (!book) return; isOpen = true; pick = active; renderBook(); book.classList.add('on'); showCard(null); },
    close() { if (!book) return; isOpen = false; book.classList.remove('on'); },
    toggle() { if (isOpen) api.close(); else api.open(); },
    setActive(id) {
      const q = list.find((l) => l.quest.id === id) || null;
      if (q === active) return;
      active = q; entered.clear(); save(); buildLights(); setChip();
      if (q) { track('quest_start', { quest: q.quest.id }); hud?.mission?.banner(`${q.quest.icon} ${q.quest.title}`, 'Сірі кола на мапі (M) – там шукай', '#c9d3e4'); }
    },
    zones: () => (active?.cards || []).filter((c) => !c.found).map((c) => ({ x: c.zone.x, z: c.zone.z, r: c.zone.r, label: String(active.cards.indexOf(c) + 1) })),
    find(id) { for (const q of list) { const c = q.cards.find((k) => k.id === id); if (c) return find(c, q); } return false; },
    reset() { found.clear(); for (const q of list) for (const c of q.cards) c.found = false; save(); buildLights(); setChip(); showCard(null); },
    update(dt) {
      t += dt;
      const P = player.position;
      const k = 0.5 + 0.5 * Math.sin(t * 1.6);
      for (const l of lights) { // fade in from SHOW_FAR, breathe slowly
        const d = Math.hypot(P.x - l.c.spot.x, P.z - l.c.spot.z), f = Math.min(1, Math.max(0, (SHOW_FAR - d) / (SHOW_FAR - SHOW_NEAR)));
        l.g.visible = f > 0;
        l.mR.opacity = f * (0.55 + 0.2 * k); l.mW.opacity = f * (0.3 + 0.12 * k);
        l.ring.scale.setScalar(4 * (1 + 0.04 * k));
      }
      if (shown && Math.hypot(P.x - shown.spot.x, P.z - shown.spot.z) > CARD_AWAY) showCard(null);
      if ((acc += dt) < EVERY || !active) return;
      acc = 0;
      const alt = P.y - gh(P.x, P.z);
      for (const c of active.cards) {
        if (c.found) continue;
        if (Math.hypot(P.x - c.spot.x, P.z - c.spot.z) < REACH && alt < MAX_ALT) { find(c, active); break; }
        if (!entered.has(c.id) && Math.hypot(P.x - c.zone.x, P.z - c.zone.z) < c.zone.r) {
          entered.add(c.id);
          hud?.mission?.banner('🗝️ Десь поруч таємниця', c.hint, '#c9d3e4');
        }
      }
    },
    dispose() {
      globalThis.removeEventListener?.('keydown', onKey, true);
      clearLights(); ringGeo.dispose(); wallGeo.dispose(); alpha?.dispose();
      chip?.remove(); card?.remove(); book?.remove();
    },
  };
  buildLights(); setChip();
  return api;
}
