// Phones and small touch tablets get the city map instead of the game: the 3D city does not fit their GPU or memory.
// Only map.json + map_buildings.json are loaded (no DEM, no workers, no three.js scene); the big map opens full screen
// with the sights, the partners (a tap shows the card, a second tap opens the site) and the bot link, and a card says
// the ride itself is on a computer. index.html picks this or main.js (touch-only or a phone UA; ?mobile / ?desktop force either).
//   startMapView({ container = document.body }) -> Promise<{ map (bigmap), painter }>
import './ui/hud.css';
import './ui/mapview.css';
import { createMapPainter } from './ui/mapdraw.js';
import { createBigMap } from './ui/bigmap.js';
import { resolvePlaces } from './world/cherkasy/places.js';
import { FRAME_OF } from './world/cherkasy/frame.js';

const CARD = `
  <div class="mv-card">
    <div class="mv-icon">🚗</div>
    <b>Покататись – лише на комп'ютері</b>
    <p>Черкаси Драйв – велика 3D-гра: ціле місто з трафіком і людьми, телефон її не потягне.
       Відкрийте <b>driver.ck.ua</b> у браузері на ноутбуці чи комп'ютері – і відчуйте себе драйвером.</p>
    <p class="mv-soft">А з телефона зараз можна погортати мапу міста: пам'ятки, партнери, вулиці.</p>
    <div class="mv-row">
      <button class="mv-go">Дивитись карту</button>
      <button class="mv-share">Надіслати собі посилання</button>
    </div>
    <a class="mv-anyway" href="?desktop">Все одно спробувати гру</a>
  </div>
  <button class="mv-pill">💻 Як пограти?</button>`;

export async function startMapView({ container = document.body } = {}) {
  const loading = document.getElementById('loading');
  const msg = loading?.querySelector('.msg');
  if (msg) msg.textContent = 'Завантаження карти…';
  const asset = (f) => fetch(`${import.meta.env?.BASE_URL ?? '/'}assets/cherkasy/${f}`).then((r) => r.json());
  const [map, buildings] = await Promise.all([asset('map.json'), asset('map_buildings.json')]);
  map.buildings = buildings;

  const world = { cherkasy: { map }, places: resolvePlaces(map, FRAME_OF(map)) };
  const painter = createMapPainter({ world });
  const bigmap = createBigMap({ painter, player: null, container, map });
  bigmap.open();

  const ui = document.createElement('div');
  ui.className = 'mapview';
  ui.innerHTML = CARD;
  container.appendChild(ui);
  const $ = (q) => ui.querySelector(q);
  const show = (on) => ui.classList.toggle('folded', !on);
  $('.mv-go').onclick = () => show(false);
  $('.mv-pill').onclick = () => show(true);
  const share = $('.mv-share'), url = location.origin + location.pathname;
  share.onclick = async () => { // the phone's share sheet (to yourself in a messenger); a copy where there is none
    try {
      if (navigator.share) await navigator.share({ title: 'Черкаси Драйв', text: 'Відкрити на комп\'ютері', url });
      else { await navigator.clipboard.writeText(url); share.textContent = 'Посилання скопійовано'; }
    } catch { /* the sheet was dismissed */ }
  };

  let last = performance.now();
  const frame = (now) => { bigmap.update((now - last) / 1000); last = now; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  loading?.classList.add('done');
  setTimeout(() => loading?.remove(), 700);
  if (typeof window !== 'undefined') window.__mapview = { map: bigmap, painter };
  return { map: bigmap, painter };
}
