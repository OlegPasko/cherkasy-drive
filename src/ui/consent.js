// The consent card on the loading screen: the main keys, and the terms the player accepts by starting (an entertainment
// game, toy people and cars not modelled on real residents, toy crashes, the city from open data with nothing military
// and nothing live, not for navigation or safety). It shows while the city loads, so it costs no waiting; the button
// unlocks when the game is ready. Acceptance is stored per TERMS version, so a returning player skips it until the
// terms change. The keys card in the game (H) stays the full list.
//   showConsent({ overlay }) -> { accepted: Promise<void>, ready(), needed: bool }
//     overlay: the #loading element (its .msg keeps the load progress); ready() enables the button (Enter works too)
import './consent.css';

const KEY = 'cherkasy.consent', TERMS = 1;
const KEYS = [
  ['W A S D', 'їзда'], ['Shift', 'тримай – злетіти'], ['Space', 'ручник, у польоті – вгору'], ['F', 'сигнал'],
  ['C', 'камера'], ['M', 'мапа міста'], ['B', 'застряг – на старт'], ['H', 'усі клавіші'],
];
const POINTS = [
  'Це розважальна гра – щоб відпочити й роздивитися місто. Усе, що в ній відбувається, вигадане.',
  'Люди, авто, пасажири й події навмисно іграшкові й не зображують жодних реальних мешканців міста. Будь-які збіги випадкові.',
  'У грі бувають аварії, погоні й збиті іграшкові пішоходи – без реалістичної крові. Якщо для вас чи вашої дитини це неприйнятно, будь ласка, не запускайте гру.',
  'Місто спрощене й зібране з відкритих даних OpenStreetMap. У грі немає військових об’єктів, реальної обстановки чи подій у реальному часі, тож вона не годиться ні для навігації, ні для рішень про безпеку. Під час тривоги – в укриття, а не в гру.',
  'Не повторюйте побачене на справжніх дорогах: там – Правила дорожнього руху.',
  'Гра працює у вашому браузері, без жодних реєстрацій. Прогрес (гроші, місце авто) зберігається лише в ньому; на сервері ми нічого не зберігаємо, крім анонімної статистики Google Analytics.',
];

const kbd = (k) => k.split(' ').map((w) => `<kbd>${w}</kbd>`).join('');

export function showConsent({ overlay }) {
  let stored = null;
  try { stored = +localStorage.getItem(KEY); } catch { /* storage off: ask every time */ }
  if (!overlay || stored >= TERMS) return { accepted: Promise.resolve(), ready() {}, needed: false };

  const card = overlay.ownerDocument.createElement('div');
  card.className = 'consent';
  card.innerHTML = `
    <div class="c-keys">${KEYS.map(([k, t]) => `<div class="r"><span class="k">${kbd(k)}</span><span>${t}</span></div>`).join('')}</div>
    <div class="c-terms"><h4>Запускаючи гру, ви погоджуєтесь, що:</h4><ul>${POINTS.map((p) => `<li>${p}</li>`).join('')}</ul></div>
    <button type="button" disabled>Завантаження…</button>
    <div class="c-next">У грі натисніть <kbd>H</kbd>, щоб побачити всі клавіші керування.</div>
    <div class="c-foot">Відкритий код, GNU AGPL-3.0</div>`;
  overlay.classList.add('with-consent');
  overlay.querySelector('.bar')?.after(card);
  const btn = card.querySelector('button');

  let go, isReady = false;
  const accepted = new Promise((r) => { go = r; });
  const accept = () => {
    if (!isReady) return;
    try { localStorage.setItem(KEY, String(TERMS)); } catch { /* storage off */ }
    removeEventListener('keydown', onKey, true);
    go();
  };
  const onKey = (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); accept(); } };
  btn.addEventListener('click', accept);
  addEventListener('keydown', onKey, true);
  return {
    accepted, needed: true,
    ready() {
      isReady = true;
      btn.disabled = false; btn.textContent = 'Погоджуюсь – поїхали';
      overlay.classList.add('ready');
      btn.focus({ preventScroll: true });
    },
  };
}
